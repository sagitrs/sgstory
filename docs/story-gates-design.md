# 设计稿：故事门按故事发现（`#607` · 方案 2）

> **状态**：设计（**落码前请把 §7 未决项定死**）· **作者**：D 席
> **溯源**：`#602` 方案 1（已合 `c6c5f4c`：判据数据落 `stories/<slug>/audit.json` ＋ 新门 `--engine-story-free`）·
> `#460`/`#512`（引擎/故事边界）· `#572`/`#583`（「选中 ⇒ 真跑」）

## 0. 一句话

`#602` 把**判据数据**按故事落了，但**门代码**仍全部住在工具层：12 道**故事门**与引擎门混居在 `scripts/audit/gates/`，
"这道门属于哪个故事"只写在 `test-plan.mjs` 的一个硬编码字符串数组里。本设计把**故事门搬进故事目录**、由**故事清单显式声明**，
`scripts/audit` 只发现「**引擎门 ∪ 本故事的门**」。

## 1. 现状盘点（可逐条核对）

| 机制 | 落点 | 今天的事实 |
|---|---|---|
| 门注册表 | `scripts/audit/registry.mjs:1-71` | 35 行 `import * as g_x from './gates/x.mjs'`（L1-35）＋ `GATES` 数组（L37-71）；注释明写「**数组顺序即执行顺序**」 |
| 层表 | `scripts/test-plan.mjs:187-190` | `AUDIT_ENGINE`（10）＋ `AUDIT_STORY`（20）＝两个**硬编码字符串数组** |
| 层校验 | `scripts/test-plan.mjs:214-226` | `validateLayers()`：①两表不相交 ②计划里每个 `--flag --check` 段都被覆盖（多一个红）③层表里每个 flag 必须有段（**僵尸声明**红）④`ENGINE_EXTRA` 不许僵尸 |
| 门选择 | `scripts/audit.mjs:24-42` | `known`/`selected` 由 `GATES[].flags` 推；`--engine-only` ⇒ 只选 `AUDIT_ENGINE` 里的门；选中为空即 `exit(2)`（`#583` 的通用守卫） |
| 故事作用域 | `scripts/audit/context.mjs:63-90` | `scopedFiles(manifest)`＝引擎文件 ∪ 清单 `files`；ctx 带 `storySlug`/`storyManifest` |
| 故事注册 | `stories/<slug>/00-story.json` | `{slug, title, subtitle, entry, files[]}` |
| 源文件发现的单一权威 | `scripts/module-order.mjs:311-312` | `allSourceFiles()` 只走 **`.twee`** ⇒ 故事目录下的 `*.mjs` 对 `ORDER`/`MODULES`/清单 `files` **完全隐形**（`move-precheck.mjs:59-62` 的 `unclaimed-file` 用的是同一宇宙）⇒ **搬门不会牵动构建/模块图校验** |
| 台账 | `scripts/report-gate-ledger.mjs:66-71` | flag 全集＝`registry.GATES.flatMap(g => g.flags)`；理由表按**脚本 id**（`'scripts/audit/gates/x.mjs'`）登记 ⇒ 搬家会改键 |
| 基线 | `test/audit-golden.mjs:19-46` | `FLAGS` 显式清单（默认故事）＋ `argFlagsFromSource()` 反向查「有声明没保护」 |

**三个具体后果**（不是洁癖）：

1. **换故事要动工具层**：第二个故事要加/改自己的门，得去改引擎侧的门目录与 `test-plan.mjs` 的 `AUDIT_STORY`；
2. **归属只存在于一个字符串数组里**：`AUDIT_STORY` 表达不了「这门属于故事 X 而非 Y」——今天 `node scripts/audit.mjs --story hollow-cave --truth`
   会**照跑故事 1 的门**（拿别人的判据判你＝`#602` 那类"空判/假红"在**门侧**的同一成因）；
3. **引擎门目录会继续被故事门污染**：`#602` 的 `--engine-story-free` 只能靠「flag 在 `AUDIT_ENGINE` 里」过滤，
   而"门搬错层"它**报不出来**（一道本该住故事侧的门只要声明了引擎 flag 就混过）。

## 2. 目标 / 非目标

**目标**

- **G1** 故事门住 `stories/<slug>/gates/*.mjs`，由**该故事的清单**显式声明（可审计、无隐式发现）；
- **G2** 选择面＝**引擎门 ∪ 当前故事的门**；`--engine-only` 语义**不变**（`#572`/`#583` 的成果不许被打破）；
- **G3**「归属／漏门／错层／重名／越界」都有**机检**，一律 fail-loud，不许静默漏；
- **G4** 迁移**逐门**做，每步**零行为变化**——`npm run audit:golden` **零漂移**是机械证据。

**非目标**

- 不改任何判据的**内容与阈值**；
- 不改 `stories/<slug>/audit.json`（`#602` 方案 1 已定的判据数据落点）；
- 不引入第二套 runner（`test-plan.mjs` 与跑器不动）。

## 3. 设计

### 3.1 落点与声明：**显式清单**

`stories/<slug>/00-story.json` 增一个键（与既有 `files` 同风格：**路径**、**顺序即执行顺序**）：

```json
{
	"slug": "mist-forest",
	"files": ["stories/mist-forest/00-meta.twee", "..."],
	"gates": [
		"stories/mist-forest/gates/truth.mjs",
		"stories/mist-forest/gates/canon.mjs"
	]
}
```

**为什么是清单，而不是扫目录的约定式发现**：本仓所有"枚举"都是**显式**的（`ORDER`／`MODULES`／清单 `files`／`AUDIT_ENGINE`）。
`readdirSync` 式发现一旦有隐式 fallback（"扫不到＝没有门"）就是**静默漏门**，而本仓纪律是「结构缺失必须报错」。
清单还顺带给出**执行顺序**（今天由 `GATES` 数组决定，是可见语义，必须保住）。
（备选：独立 `stories/<slug>/gates.json`——见 §7 未决项 1。）

### 3.2 发现 API（新增 `scripts/audit/discovery.mjs`，单一落点）

```js
// 引擎门：仍由 registry 的显式表给（`GATES` 里 flag ∈ AUDIT_ENGINE 的那些）
export const engineGates = () => GATES.filter((g) => (g.flags ?? []).some((f) => AUDIT_ENGINE.includes(f)));

// 故事门：读清单 → 校验 → 动态 import（fail-loud；见下表）
export const storyGates = (slug, { root = ROOT } = {}) => { /* ... */ };

// 当前作用域的门（引擎 ∪ 本故事）
export const gatesForStory = (slug) => [...engineGates(), ...storyGates(slug)];
```

`storyGates(slug)` 的校验面（**每条都报错**，不是警告）：

| 情况 | 判据 |
|---|---|
| 清单缺 `gates` 键 | 报（「故事必须显式声明它的门；没有门 ⇒ 写 `[]`」）——**空数组合法**（与 `#602` 的空词表同纪律） |
| 清单里的路径不存在 | 报（点名路径） |
| 文件存在但**没被声明** | 报（`stories/<slug>/gates/**` 下的 `*.mjs` 必须全部被声明——反「放了门却没人跑」） |
| 模块不导出 `run`／`flags` | 报（形状） |
| flag 与**引擎门**或**另一个故事**的门重名 | 报（flag 全局唯一；点名两处） |
| 声明指向**别的故事**的目录 | 报（越界） |

### 3.3 层表与选择语义

- `AUDIT_ENGINE`：**不动**（引擎门固定表，10 个；仍是 `--engine-only` 与 `#602` 的 `--engine-story-free` 的输入）；
- `AUDIT_STORY`：改为**由各故事清单并集算出**（`storyGateFlags()`），不再是硬编码数组；
- `validateLayers()` 四条判据**逐条保留**，按新事实更新：①两表不相交（不变）②计划里每个门段被覆盖（不变）
  ③层表里的 flag 必须有段（＝**没接线的门**红，不变）④`ENGINE_EXTRA` 僵尸（不变）；
- **选择**：`--<flag>` ⇒ 从 `gatesForStory(ctx.storySlug)` 选；`--engine-only` ⇒ 只从 `engineGates()` 选（**不变**）；
  `wantAll`（无任何 `--` 参数）＝只跑 `gatesForStory(默认故事)`；
- **新守卫（本设计的核心反沉默）**：CLI 点名了一个**属于别的故事**的 flag ⇒ **明确报错**
  （`该门属于故事 X，请用 --story X`），而不是"照跑别人的判据"——今天 `--story hollow-cave --truth` 正是后者。

### 3.4 账本 / 基线 / CI 段

| 面 | 今天 | 设计 |
|---|---|---|
| 台账 | 理由表键 `'scripts/audit/gates/x.mjs'` | 键改 `'stories/<slug>/gates/x.mjs'`；`report-gate-ledger.mjs` 的枚举改走 discovery；**理由逐条搬，不丢字** |
| golden | `FLAGS` 显式清单（默认故事） | **不变**：故事 1 的门搬家后同 flag、同输出 ⇒ **零漂移**就是迁移的机械证据；将来某故事自有门需要基线时再加 `flag@<slug>` 分桶（§7 未决项 2） |
| CI 段 | `SEGMENTS` 显式（每门一段） | **保持显式**（同今天风格），段 `cmd` 不变 ⇒ CI 零变化；`validateLayers()` 保证「清单里有门、计划里没段」红 |
| `--engine-story-free`（`#602`） | 扫 `scripts/audit/gates/**` 里 flag ∈ `AUDIT_ENGINE` 的 | 搬迁后**目录里只剩引擎门** ⇒ 这条判据从"按 flag 过滤"升级为**目录事实**；**故事门天然不被扫**（它们合法地含故事词），并把这条写进它的自证 |

### 3.5 故事门能依赖什么

- **允许**：`scripts/audit/lib/**`（`shared.mjs`／`mask.mjs`／`story-audit.mjs`）、`scripts/dist-paths.mjs`、`scripts/module-order.mjs`；
- **禁止**：import **另一个故事**的路径（判红）；引擎门 import 故事门（层方向）；
- 观感问题：`stories/<slug>/gates/x.mjs` → `../../../scripts/audit/lib/shared.mjs` 层级较深 ⇒ §7 未决项 4 讨论是否加门面 `scripts/audit/lib/gate-api.mjs` 收敛 import 面。

## 4. 迁移批次（逐门，零行为变化）

- **P0 发现机制＋校验**（**不搬任何门**）：接上后要求 `gatesForStory(DEFAULT_SLUG)` 与今日 `GATES` **集合与顺序逐字相同**
  ⇒ audit 输出 golden 零漂移，且可随时回退；`registry.mjs` 先不动（选择处改走 `gatesForStory()`）。
- **P1 试点 3 门**（低风险故事门，每门一次 commit）：`items-tokens`／`economy`／`notes`——跑 `npm test` ＋ golden 对照。
- **P2 其余 9 门**：`truth`/`canon`/`echoes`/`starbudget`/`choices`/`combat`/`craft`/`dragon`/`rules`/`reads`/`cave`/`combat-dist`
  （按 §7 未决项 5 分批 2–3 门，每批一个 PR）。
- **P3 收口**：`scripts/audit/gates/` 只剩引擎门；台账/文档重签（本文件 §3 与 `docs/engine-story-boundary.md` 的归属一节）。

## 5. 出口判据（可机械判定）

- [ ] **E1** `scripts/audit/gates/**` 里每个文件的 flags **全部** ∈ `AUDIT_ENGINE`（反「故事门又住回工具层」——把 `#602` 的思路从**数据**扩到**门**）；
- [ ] **E2** 每个故事的 `gates` 声明可被发现，且 `gatesForStory(slug)` ＝ 引擎门 ∪ 该故事门（自证）；
- [ ] **E3** `--engine-only` 从不选中故事门（自证 ＋ `#583` 的「选中⇒真跑」守卫）；
- [ ] **E4** 反沉默：①清单漏声明已存在的门文件 ⇒ 红 ②清单指向不存在文件 ⇒ 红 ③两故事同 flag ⇒ 红 ④点名别的故事的门 ⇒ 红；
- [ ] **E5** 默认故事 `npm run audit:golden` **零漂移**（每一批都要复核）；
- [ ] **E6** `npm test` 全绿（段不变）＋ 台账与实况一致（F2 新鲜度）；
- [ ] **E7** 文档：`docs/engine-story-boundary.md` 增「门的归属」一节（落点／清单／校验／反例）。

## 6. 自证与反例（全部**计入退出码**）

| # | 自证 | 反例（必须红） |
|---|---|---|
| 1 | `storyGates()` 对三个故事返回声明集合 | 删清单某条 ⇒ 报「文件未被声明」／「路径不存在」 |
| 2 | `gatesForStory()` 集合等于今日 `GATES`（P0 的等价证据） | 往清单塞一个不成形的模块 ⇒ 形状报错 |
| 3 | flag 全局唯一 | 两个故事声明同一 flag ⇒ 红 |
| 4 | `--engine-only` 只选引擎门 | 把某个故事门 flag 塞进 `AUDIT_ENGINE` ⇒ 层校验/台账红 |
| 5 | 点名别的故事的门 ⇒ 明确报错 | `--story hollow-cave --truth` ⇒ 必须红（今天会照跑） |

## 7. 风险与未决项（**落码前请定**）

1. **清单键 vs 独立文件**：`00-story.json` 的 `gates`（我推荐：一处声明）↔ `stories/<slug>/gates.json`；
2. **golden 分桶策略**：继续「只保默认故事 ＋ 故事自有门另加 `flag@slug` 键」，还是每故事一份基线文件？（影响 CI 段数与基线体积）
3. **CI 段显式 vs 生成**：我推荐**显式**（今天风格）＋ `validateLayers()` 兜底；生成会把"计划文件随故事变化"引入间接性；
4. **故事门 import 面**是否收敛到 `scripts/audit/lib/gate-api.mjs` 门面（好处：lib 可搬；代价：多一层）；
5. **迁移是否需要评审窗口**：建议一批 2–3 门、每批一个 PR（避免大 diff 与既有判据的耦合面同时动）；
6. **P0 之后 `registry.mjs` 的形态**：我倾向 P0 **不动** `GATES`（选择处改走 `gatesForStory()`，零行为变化、可回退），P1 起逐门把条目搬出。

## 8. 分期与工作量（粗估）

| 期 | 内容 | 粗估 |
|---|---|---|
| P0 | discovery ＋ 校验 ＋ 自证 ＋ `#602` 门补一条自证 | 小（1 个 PR；改动集中在 `audit.mjs`／`test-plan.mjs`／新 `discovery.mjs`） |
| P1 | 3 门试点（每门一 commit） | 中（纯搬运 ＋ 台账键/理由搬） |
| P2 | 其余 9 门 | 中（同上，逐批 PR） |
| P3 | 文档/台账收口 | 小 |

---

**交叉引用**：`#602`（方案 1 `c6c5f4c`）· `#460`／`#512`（引擎/故事边界）· `#572`（`--engine-only` 静默早退）· `#583`（通用守卫）·
`#608`（另一头：`shortFight` 机制上移引擎）· 本票 `#607`
