# 参考规格：条件行、词汇面与三条判据

> 本文给**参考形状**与**可判定的判据**；语法的实战用法（"这个能不能进表"决策树）仍以 `docs/rules-table-guide.md` 为权威。

## 1. 条件行的参考形状（`data/rules.json`）

**这是引擎实际接受并求值的形状** —— 逐字段核对 `Sg.rules.matches`／`pick`（`src/engine/40-sim/21-resolve.twee`）：

```jsonc
{
  "section": "StoryRules",
  "key": "rules",
  "rows": [
    {
      "id": "渡口.雾薄",              // 稳定 id（机检与 UI 的键；亦作 prereq 的引用目标）
      "scope": "渡口",                // 段落名 或 `段落#位点`
      "prio": 10,                    // **显式优先级**（降序；同 prio 保持声明序）
      "req":     ["n_asked_ferryman"],        // 全部满足
      "any":     [],                          // 至少一个（空＝不要求）
      "exclude": [],                          // 都不满足
      "prereq":  [],                          // 前置行 id（本故事 0 行用）
      "text":    "''\"水面比上回薄了…\"''",   // 选中时渲染（**只许纯渲染**）
      "yields":  ["n_fog_heard"],             // 授予笔记 id
      "sets":    []                           // 置真状态键（**布尔**：写"真"不写值）
    }
  ]
}
```

### 1.1 条件项的两种形态

| 形态 | 写法 | 例 |
|---|---|---|
| 字符串（真值） | 裸键 → `ev.`／`n_*` → 笔记／`world.`／前缀 `inv:` `era:` `gear:`／显式根 `pc.` | `"n_flower_warned"` |
| 对象（算子） | `{op: [键, 值]}` —— `op ∈ ['gte','lte','oneOf']` | `{"gte": ["star.spent", 3]}` |

**取值项**（操作数可随状态变）：`{price: '<econ 事件 id>'}` → 该事件**当前要花多少钱**（正数；实值＝事件 `delta` 经折扣后的结果，**不是** `Prices` 表的标价——真源 `Sg.rules` 经 `Game.Economy.priceOf`（`src/engine/40-sim/21-resolve.twee:356`），详见 `json/tables.md` §5）。用到的取值项必须在 `Sg.rules.terms` 宣告。

### 1.2 效果面只有三格，且 `sets` 是布尔

`Sg.rules.effects = ['yields', 'gives', 'sets']`。注意：**`sets` 写"真"不写值**（引擎 `applySets` 判 `readPath(pc, path)!== true`）。
→「数值 ＋ 持续」（例：临时 +2 攻击、持续 3 回合）**今天在规则行里没有位置**，只能用 hook／JS（或退化成布尔状态）。
**这不是缺陷记录，是裁定**：`#1049` 取「甲 · 维持现状」（依据：唯一内容故事的正文效果宏 ＝ 0、`[script]` ＝ 0，37 处效果宏全在内部夹具 →「作者不写逻辑」对内容故事**已成立**）。
→ **触发条件（写死）**：当**第一个真实故事**出现"声明表写不出、非得按次写值"的形状 → 以**那个真实案例**开面，并同时处置 `contractVersion`。

### 1.3 现状（实测，不是设想）

| 故事 | `rows` 行数 | 字段 |
|---|---|---|
| `stories/night-ferry`（唯一 `content`） | **0** | — |
| `stories/face-fixture`（`internal`） | **39** | `any/exclude/id/prio/req/scope/text` |

→ **条件面"已实现"与"被真内容验证过"是两件事**；本稿只主张前者。

（复算：`python3 -c "import json;print(len(json.load(open('stories/night-ferry/data/rules.json'))['rows']), len(json.load(open('stories/face-fixture/data/rules.json'))['rows']))"` → `0 39`）

## 2. 词汇面（引擎宣告面 ＝ 唯一的"允许"清单）

正文里允许出现的宏，**不是一张手工维护的白名单**，而是**引擎宣告面的抽取结果**（复算：`node test/prose-vocabulary.mjs` 打印行「词汇表（引擎宣告，现抽）」——现抽 **33** 个）：

| 来源 | 个数 | 例 |
|---|---|---|
| `<<widget "x">>` | 23 | `give` · `note` · `setflag` · `take` · `sitecheck` · `econ` · `damage` · `firstTime` · `snapshot` · `actOut` … |
| `Macro.add('x')` | 10 | `check` · `checkres` · `ending` · `rules` · `rulelist` · `save` · `hpbar` · `dragonbar` · `lastcheck` · `lastcheckFor` |

**抽取口径是单一权威**：`test/prose-vocabulary.mjs` 的 `engineVocab()` 用同一正则（`<<widget\s+"…"` ∪ `Macro\.add\(\s*'…'`）。
→ **要新增词汇宏 → 在引擎宣告**（不是为了过门而改门）。

**两个集合，别混（P1 措辞裁定）**：「词汇白名单」（本节 33 个，含 `hpbar`／`save`／`ending` 等**呈现面**宏——它们改变屏幕、不改变状态）与「效果通道」（`yields`／`gives`／`sets` 三格，见 §1.2）**不是同一集合** ——前者管**正文可写什么**，后者管**声明面能落什么**。

## 3. 三条判据（每条都能假）

设计文档若不落成会咬人的判据，就只是意见。三条各对应一个**已存在**的门：

| # | 判据 | 咬什么 | 落点 | 现状 |
|---|---|---|---|---|
| **J1** | **散文只引用**：正文里除 `[[…]]`／`{{…}}`／**具名动作宏**外，不得出现其它宏 | 出现禁用内建 → 红（**真源＝`test/prose-vocabulary.mjs:35` 的 `FORBIDDEN_BUILTINS`，共 8 项，含 `if`／`elseif`／`set`／`=` 等——此处只举例，不复述全集**） | `test/prose-vocabulary.mjs` | ✅ 已实现 |
| **J2** | **引用须已声明**：`{{名字}}` 的名字须在声明面内；`[[目标]]` 的目标须存在段落 | 未声明的取值名／悬空链接 → 红并点名 | 链接：既有 `integrity`／`event-graph`；取值：**缺** `#1048` |注意：半实现 |
| **J3** | **条件行可枚举**：键前缀／算子须在引擎宣告面内；`scope` 须存在段落 | 未宣告前缀 → 条件永假却被当合法 → 红 | 键形：`test/cond-keyform.mjs`（`#1020`，唯一在 CI 真跑的判据）；`--state` 既有 | **未实现**（现状见 §3.0） |

### 3.0 J3 的现状（如实陈述，`#1085` B1 修复）

**J3 整体未实现为门**：
- `--rules` 开关**不存在**（复算：`node scripts/audit.mjs --story night-ferry --rules --check` → ` 未知开关：--rules`）；
- `scripts/audit/gates/` 11 门里无 `rules.mjs`（复算：`ls scripts/audit/gates/`）；`stories/**` 下也无门文件（复算：`find stories -name '*.mjs'` → 0）；
- 条件行的判定逻辑住 `editor/lib/core/ruleRows.mjs`，消费方是**编辑器 UI**（`editor/web/rule-rows-view.mjs`）——**不是门**；
- 已实现的一小片：**键形**判据（`test/cond-keyform.mjs`，`#1020`）与 `--state`；
- `--rules` 门**另开票**（不阻塞本稿）；「`prio` 须显式」**降为纪律**（引擎 `?? 0` 不红 → 缺省合法，写作时宜显式但不进门）。

### 3.1 判据的反例（每条必须先能假）

| 判据 | 反例（**必须红**） | 正例（**必须不红**） |
|---|---|---|
| J1 | 正文写 `<<set $x to 1>>` | 正文写 `<<setflag "ev.x">>`（具名动作） |
| J1 | 正文写 `<<= $pc.gold>>`；**行内代码跨度（反引号）里的宏 → 同样必须红（反引号不豁免，见 §3.3）** | —（撤回后无豁免形态） |
| J2 | `[[上船|不存在的段落]]` | `[[上船|船头]]`（目标存在） |
| J2 | `{{没声明过的名字}}` | `{{classLabel}}`（在声明面内） |
| J3 | `{"matches": ["x","y"]}`（算子未宣告） | `{"gte": ["star.spent", 3]}` |
| J3 | 死行形态（**编辑器 UI 判据，未进门**）：同 `scope` 内**严格更高** `prio` 且四类包含 → 低行死（真算法见 §3.2） | 两行 `prio` 相同 → **只进 `ties()` 报告、不红**（纪律：`prio` 仍宜显式，缺省 `?? 0` 合法） |

### 3.2 死行判据的真算法（`#1085` M10 修复——按 `ruleRows.mjs:41-63` 重算，勿凭记忆）

`deadRows`（`editor/lib/core/ruleRows.mjs`）的**真实算法**：
- killer 成立要同时满足：同 `scope` ＋ **严格更高** `(b.prio?? 0) > (a.prio?? 0)` ＋ 四类包含（`req`⊆ ／ `exclude`⊆ ／ `any` 有则相交 ／ `prereq`⊆）；
- **同 `prio` 只进 `ties()` 报告、不红**（初稿曾把「同 `prio` 且 `req` 子集」当死行——与实现不符）；
- **任一侧含对象算子（`gte`/`oneOf` 等）→ 保守跳过**（布尔键包含推理对数值/集合语义会给出错误结论——宁可不判，不误判；跳过行由 `opRows()` 在报告点名）；
- 消费方是**编辑器 UI**（`rule-rows-view.mjs`）——以上是现状描述，**不是门**（门的缺位见 §3.0）。

### 3.3 J1 的一条已撤销的边界（如实记）

曾把「行内代码跨度（反引号）里的宏」当作「作者在解释语法」而**整体豁免**。
运行时实测**证伪**该前提：反引号包着的宏**真的会执行**（SugarCube 在执行期剥标记）→ 该豁免已**整片撤回**。
→ 教训：**成对自证只证明"实现符合前提"，不证明"前提为真"**；后者必须另取一次**运行时读数**。

## 4. 本稿明确**不做**的事

| 不做 | 理由（出处） |
|---|---|
| 立「效果／计算」数据面 | `#1049` 甲（无第二个消费者） |
| 立「表达式面」 | `docs/notes-model.md` 明写「**反例（别再造"表达式面"）**」 |
| 编辑器自带词汇表 | 会与引擎宣告面漂移（§2；UI 的 enum 必须取自 `Sg.rules.*`） |
| 把 L3（逐字节相等）当跨故事权威 | `editor-pivot.md` §4：三份手写文件风格本就不统一；权威是 L1＋L2＋`ui-migration-diff` |
