# `WorldMap.current` 的「换代」分流（甲′ 世代锚）—— 设计稿

> 票号：`#1907`（0.0.2 窗；源自 `sagitrs/sgstory-books#130` ③），状态：**已落码（本笔）**
> 基线：`main` 于 `63484a98`；本文档的行号与读数均为本笔在**该基线**上实取
> **信源**：`books#130` 评论 `5955432952`（设计稿 ＋ 领队三裁：取甲′／`currentSource` 入册 ＋ G4 刀随入／落 0.0.2 窗）
> 　　＋ `5954265357`（原始复现与机理补正，`sagitrs-writer`）
> **本文档的地位**：按 `docs/process/merge-checklist.md`「判定与规则行为的变更」一条，本笔动了 **core 的行为语义**
> （`WorldMap.current` 在「State 键缺」时的取值），故设计差量随码同笔提交。
> ⚠ 本项的权威来源**不是 SRD**（无来源句可引）：全篇按 `house rule（非 SRD）＋理由` 记，理由随条给出。

---

## 〇、裁定、落形与可判断据（总表）

| # | 裁定（信源面） | 本笔落形 | 可判断据 |
|---|---|---|---|
| ① | 取 **甲′（世代锚）**，不取甲0／乙 | `_lastVars` 记 `State.variables` 的**对象身份**（构造 `:76`、写点 `:152`），`current` 按身份分四支（`:93`） | G1–G4 四格；甲0／乙两形另有实测读数（见 §五） |
| ② | **`currentSource` 入册** | 新增只读面 `get currentSource`（`:106`），三值 `'state'`／`'instance'`／`'unset'` | G1 钉 `unset`、G2 钉 `state`、G3／G4 钉 `instance`；三支各有格（见 §三） |
| ③ | **G4 刀随入** | G4 格（`tests/unit/core/respawn.test.js:392`） | 把 S4 条件改成「键缺即未摆位」（＝甲0）⇒ G4 红（§三·刀4 实测） |
| ④ | 落 **0.0.2** 窗，双席票 | 本笔（`#1907`） | 票标签 `requirement`；D 与 T 两席 |

**为何是 `house rule（非 SRD）`**：本条改的是「引擎在 State 换代后如何解释实例后备字段」，属引擎自身语义，
SRD 与任何外部源文都不涉及该面 ⇒ 无源句可引，故**不写**「对齐 SRD」，只写本仓自定形与理由。

---

## 一、缺陷与机理

**现象**（`books#130` ③原文：`Engine.restart()` 后侧栏「重新开始」位置残留）。
**机理**：`WorldMap.current` 是**访问器**（`#1859`，`:93`），它把「`State` 在但**没这个键**」与
「`State` **不存在**」当成同一件事（两者都回落 `_current`）。而这两种处境要求**相反**的动作：

| 处境 | 实例字段 | State | 应变 |
|---|---|---|---|
| **A** 新局／新图／夹具（从未 `moveTo`） | **刚构造**，`_current` 是**有意摆的** | 键缺 | 用 `_current`（既有行为） |
| **B** 重开（`Engine.restart()`）／新档 | **旧实例**，`_current` 是**陈旧物** | 键缺 | ★**未摆位**（`undefined`） |
| **C** 显式写入非字符串 | 任意 | 键**在**、非串 | 静默策略，用 `_current`（既有格钉住） |

A 与 B 在「键缺」上**完全同形** ⇒ 按「键是否存在」分流的形（甲0）必然把 A 也判成未摆位（实测见 §五）。

---

## 二、取形：甲′（世代锚）

```js
this._restoreFromState();
this._lastVars = stateVars();          // :76  ★构造时记一份「这份 State.variables」（对象身份）
```
```js
get current() {                                                      // :93
	const vars = stateVars();                                        // :54 唯一的 State 直读点
	if (vars == null) return this._current;                          // S1 无宿主 ⇒ 实例后备
	const saved = vars[this._stateKey()];
	if (typeof saved === 'string') return saved;                     // S2 State 权威（读档语义）
	if (vars !== this._lastVars) return undefined;                   // S4 ★换代 ⇒ 实例陈旧 ⇒ 未摆位
	return this._current;                                            // S3 同代而键缺／非串 ⇒ 静默策略
}
```

| 支 | 处境 | 返回 | 这一支的格 |
|---|---|---|---|
| S1 | 无宿主（`typeof State === 'undefined'`，`:54`） | 实例后备 | 既有格（词法面，见 §四） |
| S2 | State 里是**字符串** | State 的值 | G2 自愈后、既有 `#1864` 刀格 |
| S3 | **同代**而键缺／非串 | 实例后备 | G3、G4 |
| S4 | **换代**（重开／新档） | `undefined`（未摆位） | G1 |

**写点仍是单点**（`_syncToState` `:146`，唯一调用点是 `moveTo` `:197`）：`_lastVars = vars` 加在同一处（`:152`），
不改「直接赋值不写档」这条既有不变式（`#1864` 折）。

**为什么加 `currentSource`**：同一个 `current` **值**可能来自三支 ⇒ 只断值则三支互为**死区**
（撤掉任一支都可能照样绿）。有它，判据才能钉「重开后**必须走 `unset` 支**」。

---

## 三、判据与刀（G1–G4，逐条实跑）

四格在 `tests/unit/core/respawn.test.js`（`:365`／`:374`／`:384`／`:392`），与既有 `mapCurrent` 族同档。

| # | 判据 | 刀（撤回修即须红） | 实测读数 |
|---|---|---|---|
| **G1** | 换代后 `current === undefined` **且** `currentSource === 'unset'` | 删 S4 那一行（＝改回 `return this._current`） | 单测 `pass=615 fail=2`：G1 报 `"L5" !== undefined`，G2 连带红（同根因） |
| **G2** | 换代后 `MapScene.execute()` 得 `current === startId`（位置自愈） | 删 `execute` 里的自愈行（`:281`） | 单测 `pass=608 fail=9`：G2 ＋ 8 格 map 系（`D2`／边界／`#1879`；那 8 格本就以自愈行为前提） |
| **G3** | S3 不被吞：同代、显式非串，仍回后备 | S3 合成「非串即未摆位」（＝乙形） | 单测 `pass=612 fail=5`：G3、G4 ＋ 既有 3 格（`respawn 判据 1`、`respawn：无层表注册`、`★#1864 ③刀`） |
| **G4** | A 支不被吞：夹具**直接赋值**摆位（同代、键缺），仍回后备 | S4 条件改成「键缺即未摆位」（＝甲0形） | 单测 `pass=614 fail=3`：G4 ＋ 既有 2 格（`respawn 判据 1`、`respawn：无层表注册`） |

**基线读数**：未改（`main` 于 `63484a98`）`pass=613 fail=0 total=613`；本笔 `pass=617 fail=0 total=617`
（加四格，**既有 613 格零变更**）。
**前置门**：`node tests/gates/refs-integrity.mjs`（rc=0）、`node tests/gates/line-endings.mjs`（rc=0）与两者
`--selftest`（rc=0）。

复现命令（在本仓根）：

```bash
python3 build.py && node tests/unit/headless.mjs          # 单测（读数即上行两行）
node tests/gates/refs-integrity.mjs && node tests/gates/line-endings.mjs
```

---

## 四、边界与关系

- **只解决引擎语义**：引擎让 `current` 变 `undefined`；玩家可见的「位置自愈」还要 `MapScene` 入口那一行
  （`:281`）配合 ⇒ **故事侧配合面另见 `books#130` ③ 的 0.0.2 处置**，本笔不宣称已修完玩家可见面。
- **与 `#1760`／`#1859`／`#1864` 的关系**：
  - `#1760` §四「写点单点」与「直接赋值不写档」**不变**（写点仍只 `moveTo`，`_lastVars` 加在同一处）；
  - `#1859`「State 权威」不变（S2 仍是第一优先）；
  - `#1864` 的既有刀格（State 权威 ＋ 键缺回落）**仍绿**（该格走的正是 S3）。
- **S1（无宿主）的测法**：`stateVars()` 判的是**词法** `typeof State === 'undefined'`（`:54`），
  故用例里 `globalThis.State = undefined` **造不出** S1（仍走 state 支）⇒ S1 由既有格覆盖（本笔不新增）。
- **「换代」在用例里的正确造法**：走 `State.reset()`（真 `Engine.restart()` 的 `State.reset()` 面）。
  ✗ 不用 `State.variables = {}`：宿主的变量是**闭包绑定**，直接给属性赋新对象只改属性、不改绑定
  （出处：`framework/harness.js` 的 `__resetState` 头注）⇒ 那样造出的是**假换代**。

---

## 五、为什么不是甲0／乙（实测，本笔在 `63484a98` 上重跑）

| 形 | 形的内容 | 实测 | 结论 |
|---|---|---|---|
| **甲0** | 按 `hasOwnProperty` 分流：键缺即未摆位 | `pass=614 fail=3`（G4 ＋ 既有 2 格） | ✗ 把 A 支一起吞了（设计稿在旧基线上报「红 2 格」，本基线多一格＝G4） |
| **乙** | 非字符串一律未摆位（含显式 `undefined`） | `pass=612 fail=5`（G3、G4 ＋ 既有 3 格） | ✗ 破了 C 支的既有格（本基线红 3 格） |
| **甲′** | 键值 ＋ 世代身份分流 | `pass=617 fail=0`（既有 613 全绿） | ✓ 本笔取此形 |

**归因口径**：上表「既有 N 格」= 本基线（`63484a98`）上除 G1–G4 之外的失败格数，即
`fail 总数 − 新格失败数`；两形各自的失败**格名**逐条列在 §三。
