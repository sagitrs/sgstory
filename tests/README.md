# tests/ —— 测试指南

两层测试：**unit**（无 SugarCube 环境的单元测试）与 **e2e**
（消费插件全部能力的完整故事）。

```
tests/
├─ unit/                       单元测试（目录镜像 src/ 结构）
│  ├─ unit.html                入口页：按序加载 framework → dist → 用例
│  ├─ core/<单元>.test.js      core 引擎的用例（与 src/core 文件一一对应）
│  ├─ dnd3/<单元>.test.js      dnd3 规则包的用例（目录名与 src/dnd/dnd3 同名）
│  ├─ dnd-5e/<单元>.test.js    dnd-5e 规则包的用例
│  ├─ d20m/<单元>.test.js      d20m 规则包的用例
│  ├─ framework/               测试基础设施（手写）
│  │  ├─ shims.js              SugarCube 环境桩（setup/State/SugarCube/jQuery）
│  │  └─ harness.js            迷你测试框架（test/assert/__runTests）
│  └─ dist/                    构建产物（build.py 生成，勿手改）
│     ├─ bundle.js             被测物：插件构建，与游戏**完全相同**的包装
│     └─ manifest.js           用例清单（递归扫描 *.test.js 自动发现）
└─ e2e/old-house/ 「老宅与银怀表」：完整故事（src/ 源码 + game.html 产物）
```

> 澄清一个容易误会的点：`dist/bundle.js` 不是测试框架，而是**被测物**——
> 插件源码按与游戏构建相同的包装编译出的产物（“测的就是发布的”）。
> 测试框架是 `framework/harness.js`；环境桩是 `framework/shims.js`。

**用例目录与被测单元一一对应**：`tests/unit/core/x.test.js ↔ src/core/x.js`，
`tests/unit/dnd3/y.test.js ↔ src/dnd3` 的对应单元。加新规则包时建
`tests/unit/<包名>/` 同构目录。

**一个单元一个测试文件**（与 `src/` 源文件对应）：

| 用例文件 | 被测单元 |
|---|---|
| core/namespace.test.js | src/core/00-namespace（注册表、事件总线 on/off/emit/异常隔离） |
| core/dice.test.js | src/core/05-dice |
| core/io.test.js | src/core/01-perform + 02-choice（IO 契约） |
| core/item.test.js | src/core/10-item（基类/defItem/注册表/快照） |
| core/event.test.js | src/core/15-event（抽象基类与 execute 接口） |
| core/effect.test.js | src/core/17-effect（Effect/Debuff/death） |
| core/character.test.js | src/core/20-character |
| core/inventory.test.js | src/core/30-inventory（give/装备竞争/充能/战利品） |
| core/exchange.test.js | src/core/32-exchange（原子交换、数量、身份、拒绝／异常零提交） |
| core/weapon-traits.test.js | src/core/30-inventory 的武器特性消费点（#1736） |
| core/battle.test.js | src/core/40-battle |
| core/battle-choice-retract.test.js | src/core/02-choice ＋ 40-battle（回收口归问话方 `#2055`：只收自己那一盘 · 被拒不收 · `opts.收` 契约） |
| core/turn-boundary.test.js | src/core/40-battle 的回合生命周期钩子（`RPG.turnBoundary`；#1713） |
| core/battle-interaction.test.js | src/core/40-battle 的交互回合（选项构造纯函数等） |
| core/chest.test.js | src/core/41-chest（机制，无判定） |
| core/pipeline.test.js | src/core/45-pipeline（结算管线；#1713） |
| core/map.test.js | src/core/60-map（有向图校验、移动、条件出口） |
| dnd3/stats.test.js | src/dnd3/00-init（STAT_BLOCK/stats 工厂） |
| dnd3/characters.test.js | src/dnd3/characters（数值块对称性） |
| dnd3/chargen.test.js | src/dnd3/core/chargen（#1697 P1：原始分/换算/写面越域/属性生成） |
| dnd3/chest.test.js | src/dnd3/core/chest（3E 撬锁检定） |
| dnd3/combat.test.js | src/dnd3/core/combat（acOf/近战数学/击倒/炸弹灵巧投掷） |
| dnd3/saves.test.js | src/dnd3/core/saves（豁免检定、恐惧） |
| dnd3/items.test.js | src/dnd3/items（3E 判定数学） |
| dnd3/alliance.test.js | ★跨单元（场景级）：2v2 联盟战（玩家＋受伤守卫 vs 双哥布林） |
| dnd3/battle.test.js | ★跨单元（场景级）：多敌人战斗（双哥布林） |
| dnd3/ranged.test.js | ★跨单元（场景级）：远程武器与短弓（消抖：`noDodge` ＋ 固定随机源） |
| dnd-5e/stats.test.js | src/dnd/dnd-5e/00-init（数值块与基础约定） |
| dnd-5e/chargen.test.js | src/dnd/dnd-5e/core/chargen（#1697 P1 车卡） |
| dnd-5e/combat.test.js | src/dnd/dnd-5e/core/combat（攻击数学：熟练度/Finesse/重击骰翻倍） |
| dnd-5e/items.test.js | src/dnd/dnd-5e/items（SRD 数值验证、槽位系统） |
| d20m/stats.test.js | src/dnd/d20m/00-init（数值块；机架表值面） |
| d20m/chargen.test.js | src/dnd/d20m/core/chargen（#1697 P1 车卡） |
| d20m/combat.test.js | src/dnd/d20m/core/combat（acOf、攻击数学、天然 1/20、伤害修正） |
| d20m/items.test.js | src/dnd/d20m/items（自证件数值面与槽位面） |

★**本表以命令输出为准**（手抄必陈旧：本表曾长期只列 **15** 行，而当时实有 **33** 个用例文件）：

```bash
ls -1 tests/unit/*/*.test.js   # 每行一个用例文件；新增/删除用例须**同笔**更新本表
ls -d  src/dnd/*/              # 新增规则包须同笔补本表（并补 src/README 的两层结构表）
```

★**为什么这条要写死**：用例清单由 `dist/manifest.js` **递归自动发现** ⇒ 表陈旧**不会**让任何门变红
（无机械兜底，纯文档面）⇒ 只能靠「同笔更新」＋上方复现命令，不能靠门。

## 如何运行与判定

```bash
python build.py        # 同时产出 tests/unit/bundle.js 与 e2e 的 game.html
```

- **单元测试**：浏览器打开 `tests/unit/unit.html`
  - 判定：页面标题显示 `PASS <n>`（失败为 `FAIL x/n`）；
    结果对象在 `window.__unitResult = { total, pass, fail }`；
    页面逐条渲染 ✓/✗。
- **e2e**：浏览器打开 `tests/e2e/old-house/game.html`，
  按下方“e2e 验证要点”人工走查（或用浏览器自动化驱动，历史会话即此做法）。

- **老宅支线·行为基线**（`sgstory#1912` 交付 1 的「行为保持」面；CI 同套）：
  `node tests/e2e/old-house/run-baseline.mjs` 跑判据，`--selftest` 跑三条刀的**判别力自证**。
  读数在末行：`cell=`／`pass=`／`fail=`／`pending=`；**未判行以 `⏳` 明账**（不入绿、也不静默跳过）。
- **老宅支线·真 DOM 接缝**（`sgstory#1912` 交付 1 的 `§7` 那行：导航／回退／当前段落存档／输出时机）：
  `node tests/e2e/old-house/run-seam.mjs`（需 jsdom；`--selftest` 跑两条刀的判别力自证）。
  ⚠ 它**不在逐 PR 的 CI 里** —— 要真 DOM 就装 jsdom，而那会动舰队**零依赖基线**；
  故走**窗口式**：`.github/workflows/e2e-seam.yml`（nightly ＋ 手动 dispatch，ephemeral 装 jsdom）。
## 构建素材测试（`sgstory#2009`）

`tests/build/story_assets_test.py` 直接调用生产 `build.py` 的 SVG 验证／内嵌函数，
使用临时故事；正反臂包括路径逃逸／软链环、限长读取、源字节／尺寸／摘要、主动内容拒绝、
注入先于消费脚本、确定性与无声明不增字节。只读表用 Node 22 的标准 `vm` 核验。
真构建臂只替换 SugarCube 外壳模板，
不替换生产脚本收集或注入函数；不写共享 `build/dist`。

固定入口：`timeout 25 python3 tests/build/story_assets_test.py`。
期望：末行 `OK`、非零测试数、rc 0；失败 rc 1。现有 CI 的
`node tests/gates/pack-selection.mjs` 同步执行此臂，无新增 workflow。
它不判真实字体、布局／触控、图像解码或故事动作的完整行为。
契约见 [离线 SVG 素材](../docs/engine/story-assets.md)。

## 测试基建纪律（命令与探针）

任何**可能阻塞**的命令——jsdom／网络请求／DOM 事件等待／子进程／交互式命令——都必须**自带超时**并**保留退出码**。以下八条为硬性要求：

1. **必套超时**：`timeout 60 node scripts/probe.js …`。没有超时的探针一旦在等外部资源（不可达主机、永不触发的 DOM 事件），会**永不返回**。
2. **禁用「生产者 | head -N」作为「跑一下看看」的形态**：`head` 在收满 N 行前**一直等生产端**，生产端一挂则**整条管道无声挂死**（既无输出也无退出码），并且会**卡住调用它的会话**（会话在工具调用返回前不处理新输入）。
   > 实证（2026-09-30）：一次 jsdom 探针因目标主机不可达而阻塞，`node … | head -20` 使该命令挂死约 4 小时，并令该席位会话失联，最终需由领队终止子进程救回。
3. **管道会吞退出码**：`timeout 60 node probe.js | head -20` 的退出码是 `head` 的（恒 0）⇒ 超时会被读成成功（**假绿**）。正解二择一：
   - 先 `set -o pipefail` 再跑；或
   - **重定向到文件再判**（推荐 —— 读数与退出码一并留下）：
     ```bash
     timeout 60 node scripts/probe.js > /tmp/probe.log 2>&1; echo "rc=$?"; head -20 /tmp/probe.log
     ```
4. **判定与读数分离**：超时／失败必须产出**可判读数**（非零 `rc`，或日志中的显式标记），不得凭「没报错」判定通过。
5. **突变／拔除实验必须「先重建被判物」**：本仓的被判物是**构建产物** —— `python3 build.py` 产出的
   `tests/unit/dist/bundle.js`。改了 `src/**` 而**不重建**，跑出来的仍是**旧判物**，读数无效 ——
   而它**看起来很正当**（有 pass/fail、退出码也对）。实验记录须写明「已重建」。
	   ★**症状认法**（`sgstory#1920`）：刀落在被测物之外时，「**零红**」看上去与「**判据没有判别力**」
	   **一模一样** ⇒ 见到「刀下了却一条都不红」，**先查是否重建**（以及第 6 条的 `grep` 计数），
	   再谈判据。实证（2026-10-03，`#1919` 复核）：两把性质不同的刀给出**同一个** `653/0` 读数，
	   一度写成「三条判据都没牙」；补 `python3 build.py` 后即刻如述（该次是**脚本没把参数传给 python**，
	   刀根本没下 ⇒ 与「忘了重建」同族：**都叫「刀没落在被测物上」**）。
	   ⇒ **下刀三步（缺一不可）**：`改源码` → `python3 build.py` → `grep -c '<突变串>' tests/unit/dist/bundle.js`（期望 ≥1）。
6. **重建后 `grep` 被判物，确认突变字节确已在**：`grep -c '<突变串>' tests/unit/dist/bundle.js`（期望 ≥1），
   并把该计数留在实验记录里。这一条同时挡住两种**假绿**：
   - (i) **忘了重建**（计数 0）；
   - (ii) **锚点没匹配上、突变静默 no-op**（计数 0 —— 而打补丁的脚本若不 `assert`，仍会「成功」返回）。
   > 配套：**突变脚本的锚点匹配必须显式失败** —— 未命中锚点即 `assert` 报错退出，**不得静默跳过**。
7. **必须同时记账「基线读数」与「突变后读数」**：只报后者无从判断该实验是否有效 —— 既不能证明原本是绿的，
   也不能证明红是突变造成的。
   > 实证（2026-09-30）：一次「陷阱路绕过随机源」的实验**先得全绿**，一度被判为「用例抓不住该回归」；
   > 补重建后**同一突变 10/10 红**，结论**反转**。见 `#1715`／`#1710`。
8. **改任何 CRLF 文件（含 `src/**` 的注释笔）须二进制替换 ＋ 前后行尾断言**：本仓不少文件是
   **CRLF**（`tests/README.md` 自己就是；`src/**` 也有）。用 text 方式改写（`Path.write_text()`、
   `sed -i`、多数编辑器的「保存」）会把行尾**静默归一成 LF** ⇒ 产生**整档伪 diff**
   （改动只有一行，diff 却是全文），审阅者无法看清真实改动、评审面被噪声淹没。
   正解：**以字节为底做替换**，并在写入**前后**各断言一次行尾数不变：
   ```python
   raw = p.read_bytes()
   assert raw.count(b'\r\n') == raw.count(b'\n') > 0      # 前置：确认是 CRLF
   out = raw.replace(old_bytes, new_bytes)
   assert out.count(b'\r\n') == out.count(b'\n')          # 后置：行尾未被归一
   p.write_bytes(out)
   ```
   **一行自检**（改完立刻验，与 base 比行尾数）：
   ```bash
   python3 -c "import pathlib,sys; r=pathlib.Path(sys.argv[1]).read_bytes(); print(r.count(b'\r\n'), r.count(b'\n'))" <文件>
   ```
   > 实证（2026-09-30）：我改 `src/dnd/**` 的 4 处注释时未察觉其为 CRLF ⇒ 行尾静默转 LF、
   > 整档伪 diff（**正是本节上文自己写下的那条坑**）。见 `#1738`／`#1720`。
   >
   > ★**「新增行」同样适用**（第四实例的形态，`#1768` 实测）：往一个 CRLF 文件**追加新行**时，若新行用 LF，
   > 文件即**变混行**——而**常规 diff 与 `--ignore-cr-at-eol` 都能看见新增行**，✗「某个开关把它藏了」
   > （本席实测更正过这条流传归因）。真机制是**本仓 CI 原先没有任何行尾检查**，只能靠**人工自检** ⇒ 会漏。
   > 现已有自动防线：`tests/gates/line-endings.mjs`（`#1774`／`#1775`；判据＝**同一文件内不得混行**，
   > 扫 **`git ls-files`** 面 ⇒ 读数与树状态无关）。
   > ⇒ **但自动门是防线、✗ 是借口**：写文件时仍须**按该文件原有行尾**写；**新文件**亦然——
   > 先看同目录同类文件是 CRLF 还是 LF。
   >
   > ★★**批量/脚本改动是最高危的一类**（第五实例，`#1777` D2 实测）：`python` 的
   > `pathlib.read_text()/write_text()`、`sed -i`、`perl -pi` 等**会静默统一行尾**——
   > 本席的**突变实验脚本**（我自己写的测量工具！）把两个 CRLF 源文件转成了 **纯 LF**，
   > 而**行尾门照样放行**（判据只拦「同一文件内混杂」）⇒ **工具 mutate 了它没在测量的东西**。
   > ⇒ 纪律：① 脚本读写要保行尾（`open(..., newline='')`／按字节读写，✗ 文本模式往返）；
   > ② **凡跑过批量/脚本改动，收工前必须跑一次行尾门并按文件核对**（✗ 假定「门绿＝没事」）。
   >
   > ★★★**「读」这一侧同样是坑**（第六／七实例，`#1865`／`#1866` 实测）：**只把写侧改成字节模式不够** ——
   > `Path.read_text()` 的**通用换行模式**在**读**时就把 `\r\n` 折成 `\n`，此后无论怎么写（`write_bytes`／`write_text`）都**回不去**。
   > 实测（本席两次同形失误，均发生在**评审他席 PR** 时）：
   > · `#1865` — 探针读→改→还原 `src/core/40-battle.js` ⇒ 该档 537 行整档 CRLF→LF；
   > · `#1866` — 同法作用于 `src/core/70-ui.js` ⇒ 132 行整档翻转。
   > 两次都是**本席自己落的行尾门**（`tests/gates/line-endings.mjs` 的 `#1832` 整档翻转判据）当场报红；
   > 两次本席都先怀疑「是被评审 PR 的缺陷」，核 `git show <head>:<档>` 见**提交面是纯 CRLF** ⇒ 方知**坏的是探针的工作树**。
   > ⇒ **读侧纪律**：探针凡涉及「读回原文再写」，**读也须字节模式**：
   > ```python
   > raw = p.read_bytes()                              # ★读侧就得是字节
   > s = raw.decode('utf-8')                           # 显式解码（✗ 用 read_text）
   > p.write_bytes(s.replace(a, b).encode('utf-8'))    # 写侧同为字节
   > ```
   > ⚠ **别指望 `write_bytes` 能补救**：`read_text` 已经把 `\r` 吃掉，写侧再「字节」也已无可写。
   > ⇒ 判据：**改动前后各断言一次行尾计数**（与 `#1774` 门同源），✗ 只看写侧。


## 如何写单元用例

**新建 `tests/unit/<包>/<单元名>.test.js`**（目录与 `src/` 镜像；整体用
IIFE 包裹避免跨文件顶层重名），然后 `python build.py`——manifest 递归
扫描 `*.test.js` 自动发现，无需改 unit.html：

```js
/* core/30-inventory 的单元测试 */
(() => {
	const R = () => setup.RPG;

	test('inventory：loot 只转移未装备的道具', () => {
		const victim = new (R().Character)({
			name: '戊', items: [{ id: 'club', equipped: true }, { id: 'coin' }],
		});
		R().loot(victim);
		assert.ok(R().has('coin'), '掉落硬币');
		assert.ok(!R().has('club'), '装备不掉落');
	});
})();
```

**规则**：

1. **断言只看状态与异常**（hp、注册表、标志位、throw/reject）。
   单元环境的 perform 是 no-op——**不断言消息文本**，那属于 e2e。
2. 每个用例运行前 runner 会重置 `State.variables = {}`（`resetState`），
   用例之间互不污染；`setup.RPG` / `setup.DND3` 是全局长存的（注册表跨用例累积，
   因此用例内临时道具请用唯一 id，如 `unit-xxx`）。
3. 异步直接 `await`（用例函数可以是 async）；Promise 拒绝用
   `await assert.rejects(promise)`。
4. **消除随机性**：判定的成败要构造必成/必败条件，四条正解（优先用前两条）：

   1. **注入固定 RNG（推荐）**：临时固定 `Math.random`，掷骰即确定；必须 `try/finally` 复原，否则污染后续用例：
      ```js
      const orig = Math.random;
      Math.random = () => 0.5;      // d20 = (0.5*20|0)+1 = 11；1d6 = 4（实现见 src/core/05-dice.js:21）
      try { /* 断言 */ } finally { Math.random = orig; }
      ```
      > 引擎侧注入点：`RPG.rng.set(fn)` / `RPG.rng.setSequence(values)`（实现见 `#1706`／PR `#1710`）。
      > 本技法在迁移后**仍有效**（默认实现每次调用时读 `Math.random`），但**新用例优先用 `RPG.rng`**（可判、可复位、无全局副作用）。
      > 复位责任随迁移转移：`RPG.rng` 的注入由 harness 的**用例前置重置**统一复位（`tests/unit/framework/harness.js` 的 `__resetState` 内 `RPG.rng.reset()`，见 `#1706`／PR `#1710`）⇒ 用 `RPG.rng.setSequence(...)` 时**无需**重复抄 `try/finally`。
      > ⚠️ 但 harness **不会**复原你替换过的 `Math.random` ⇒ 仍用上示 `Math.random` 替换法时，`try/finally` **仍然必须**。
   2. **必中/必不中构造（攻击面）**：给目标加 `noDodge: true`（同时免「天然 1 必失」与重击两条路径），再配 `stats: { ac: -999 }`；也可用临时道具 `bab: 99` 提高命中面。
      ⚠️ **只写 `ac: -999` 不构成必中**：`die === 1` 仍必失；`die === 20` 触发重击而翻倍伤害——**dnd3 与 d20m 另需确认掷**（`dnd3/core/combat.js`、`d20m/core/combat.js`），**dnd-5e 无确认掷**（`dnd-5e/core/combat.js`，天然 20 即重击）。`noDodge: true` 在**各包**同时关闭这两条路径。实测（PR #1687 检视，**dnd3 面**）：未加 `noDodge` 的「必中靶」用例 2000 轮翻转 **20.6%**、宿主 20 轮 3 红。
   3. **非攻击检定/豁免的加值构造**：无掷骰管线的检定面（撬锁、属性检定、豁免检定）直接用加值强制成败——例如 `D().Player.stats.dex = 1` 或 `= 20`（原始分；调整值由 `modOf` 现算 ⇒ 分别得 −5／+5）、`stats.save_spells = ±20`（与 DC 拉开足够距离即必成/必败）。
   4. **统计型断言（最后手段）**：循环 N 次比较计数时须留重试余量（如 `while (hp > 0 && n < 10)`），并接受其为概率性断言；**能固定 RNG 就不要用统计法**（掷数放大只降方差不消随机，实测仍有 0.1–0.2% 长尾）。

   ⚠️ **优势/劣势不可用「结果」判定**：固定 RNG 下 `d20adv`/`d20dis` 两掷同值 ⇒ 命中结果与普通 `d20` 无法区分。锁「优势/劣势生效」须走**调用面**（探针包 `d20adv`/`d20dis` 计次；实现见 `dnd-5e/00-init.js`）或**异值轮转桩**（如 `[0.1, 0.9]` 交替）。

**断言 API**：`assert.ok(cond, msg)` / `assert.eq(a, b, msg)` /
`assert.throws(fn, msg)` / `await assert.rejects(promise, msg)`。

**shim 说明**（framework/shims.js，改动需谨慎）：
`setup`、`State = { variables }`、`SugarCube.Engine` 导航桩、
可链式调用的 no-op jQuery 桩。插件里新增的引擎依赖（新全局、新 DOM 结构）
需要同步扩展 shim，否则 bundle 加载即失败。

## 如何写 e2e 用例

`tests/e2e/old-house/` 是完整参考。新增一个 e2e 故事：

1. 新建目录 `tests/e2e/<你的故事>/src/`：
   - `storydata.twee`（含 `title`、`start`、`ifid`）
   - 剧情 twee（`[widget]`、`StoryInit`、`PassageFooter` 等）
   - 故事侧 js（可声明 `const DND3 = setup.DND3;` 局部别名）
2. `python build.py tests/e2e/<你的故事>` → 产物在该目录 `game.html`。

**e2e 验证要点**（提交前走查）：

- 框架加载：`setup.RPG` / 规则包命名空间存在，注册表齐全
- 关键交互路径：拾取/装备/使用/战斗/离开各走一遍
- 消息文本正确（这是文本断言的归属地）
- 状态栏与历史回退按预期刷新
- `Engine.restart()` 后世界状态正确重置

## 为什么 bundle 与游戏构建相同

`build.py` 用同一套包装逻辑（按包注入 IIFE 与别名）生成
`tests/unit/bundle.js` 和游戏内嵌脚本——单元测试跑的就是发布形态的代码，
不会出现“单测过了、游戏里包装坏了”的假阴性。
