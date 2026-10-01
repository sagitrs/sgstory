# E1a `skillCheck` —— 检定面原语（#1798 首期能力伞 · dev 件一）

> **票**：`#1798`（引擎能力伞·首期六件；dev 席两件 = E1a ＋ D1）
> **依据**：`#1780` §八 未落面**第 6 条** ——「本仓 3E 面**尚无**『力量检定』类消费点（无技能系统）⇒
>   本笔**不**造该面；`fracture` 因此改绑**近战伤害**（§四 C2）」。
> **读法**：§二–§五 为**规范句**（可被单测断言引用）；§六 为「用例 ↔ 规范句」锚表；§七 逐条声明**未落面**。

---

## 一、现状勘定（实取，✗ 凭印象）

core 只给通用掷骰 `RPG.roll`（`05-dice.js`）；两包各自有 `d20()`。**检定逻辑散在 5 处**：

| # | 位置 | 形 | 状态 |
|---|---|---|---|
| 1 | `dnd-5e/core/conditions.js:146` `DND5E.save` | `d20 + modOf(stats, ability) >= dc` | **已收敛成函数** ✓ |
| 2 | `dnd3/core/saves.js:15` `DND3.save` | `1d20 + mod` vs `dc`（按**豁免类型**索引） | **已收敛**（但口径与 #1 不同） |
| 3 | `dnd3/core/traumas.js:131` `treatTrauma` | `1d20 + mod` vs `dc` | 有局部实现 |
| 4 | **`dnd3/core/chest.js:15` 撬锁** | `DND3.d20() + DND3.modOf(that?.stats, 'dex')` | ★**内联手写，未收敛** |
| 5 | `dnd3/core/combat.js:69` ／ `d20m/core/combat.js:99` 攻击骰 | 内联 | 攻击面（**见 §五 边界**） |

**#1780 实撞的实取证据**（本稿独立复核，✗ 转述）：
```bash
grep -rn "modOf(.*'str'" src/dnd/dnd3/     # ⇒ 恰 1 处：combat.js:54（攻击掷骰的 abilMod）
grep -rn "'str'" src/dnd/dnd3/ --include=*.js   # ⇒ 同上，仅 1 处
```
⇒ **3E 面确实没有任何「力量检定」的消费点** —— 设计稿 §四 C2 的陈述**逐字属实** ✓
⇒ 故 `fracture` 的初版「力量检定 −2」会成**死旗标**（罚无处生效），改绑近战伤害是**当时唯一可落的选择**。

## 二、落形：**薄壳 ＋ 加值来源由包侧传入**

```js
// core（src/core/05-dice.js 或新档 19-check.js）
RPG.checkRoll = ({ mod = 0, dc = 10, die = '1d20', total = 0 } = {}) => {
  const roll = RPG.roll(die).total;          // ★掷骰经既有 `RPG.roll`（✗ 另造随机源）
  const sum = roll + mod + total;            // total＝包侧已加好的其它加值（见 C3）
  return { success: sum >= dc, roll, mod, total: sum, dc, die };
};
```

**规范句**：

- **S1**：检定判定**统一形** = 「**掷骰 ＋ 加值 ＋ 阈值**」；`success === (sum >= dc)`。
- **S2**：**加值来源**（`mod`）由**包侧**计算并传入 —— core **不认识** `stats` 的字段语义
  （3E 按**豁免类型**索引 `save_*`；5E 走 `modOf(stats, ability)`；两包口径本就不同）。
  ⇒ **core 提供机制（掷骰/比较/返回形），包侧提供语义** —— 与 `#1760` 层表注册面／`#1794` `defStock` 同哲学。
- **S3**：**骰面族**由调用方给（缺省 `'1d20'`）—— **d20m 是百分骰** ⇒ 传 `'1d100'`（✗ core 不硬编 d20）。
- **S4**：返回值形 `{ success, roll, mod, total, dc, die }` —— **`total` 是 sum（含加值）**，
  ✗ 不是裸 `roll`（`#1780` §四 C3 的用例断言锁的是 `total`：脑震荡罚须**进 total**）。
- **S5**：**无副作用**：本函数只掷骰与比较，**不写任何状态**（✗ 不出手、✗ 不改 hp/effects）。
  ⇒ 与 `RPG.roll` 同级（纯判定），写路径仍归调用方。

## 三、收敛：把 §一 的散点改走本原语

| # | 位置 | 处置 |
|---|---|---|
| 4 | `dnd3/core/chest.js:15` 撬锁 | ★**改走 `RPG.checkRoll`**（本稿的**首要收敛点**） |
| 1 | `dnd-5e/core/conditions.js:146` `DND5E.save` | 改为 `RPG.checkRoll({ mod, dc })` 的一行薄壳（**行为零变**） |
| 2 | `dnd3/core/saves.js:15` `DND3.save` | 同上（**行为零变**） |
| 3 | `dnd3/core/traumas.js:131` `treatTrauma` | 同上（**行为零变**） |
| 5 | 攻击骰（两包 combat） | **✗ 不并入**（见 §五 边界） |

**规范句**：

- **S6**：`#1/#2/#3/#4` 改走本原语后，**既有断言逐条仍绿**（行为零变）—— 这是收敛的**验收条件**。
- **S7**：本仓**新增**的检定**一律**走 `RPG.checkRoll`（✗ 新写内联 `d20() + …`）。

## 四、与 `#1780` 实撞的关系：**骨裂可重挂的标准**

`#1780` §八 第 6 条留了话：「**将来落技能面时，宜由那一笔决定是否把骨裂重挂到力量检定上**」。
⇒ 本稿给出**重挂的判据**（✗ 不在本笔重挂 —— 那是 `#1780` 后继票的事）：

- **S8**：若将来重挂 `fracture` 到力量检定，须**同时**满足：
  ① 力量检定**有真实消费点**（✗ 只为创伤造一个假调用）；
  ② **不与 C2 的伤害罚重复**（两者是不同量纲 ⇒ 二选一，✗ 双罚）；
  ③ 重挂后**既有用例**（`dnd3 trauma：C2 骨裂——近战伤害 −1`）须**同步改**并注明裁定来源。

## 五、边界（✗ 不做）

- **✗ 不并入攻击骰**：攻击 = `1d20 + bab + abilMod` vs **AC**，不是 vs DC，且含**重击确认**（第二次 d20）；
  强行并入会造出「攻击是一种 skillCheck」的**假统一**（且 5E 的攻击还有 adv/dis 面）。
- **✗ 不建技能系统**：本笔只给**判定原语**，✗ 不给技能表／熟练加值／技能点。
  （`#1780` §八 第 6 条说的「无技能系统」是**内容面**的缺口，本笔只补**机制面**。）
- **✗ 不做 adv/dis（优势/劣势）**：属 `#1798` 后续期「E1 其余（rollMode/constraints/canAct/移动）」。
- **✗ 不改 random 源**：掷骰一律经既有 `RPG.roll` / `RPG.rng`（`#1706` 契约）。

## 六、用例 ↔ 规范句

| 用例 | 规范句 |
|---|---|
| core：`checkRoll` 形 —— `success`/`roll`/`mod`/`total`/`dc`/`die` 六键俱在 | S1／S4 |
| core：**边界** —— `sum === dc` ⇒ `success: true`（3E 与 5E 皆「≥」） | S1 |
| core：`mod` 由调用方给 ⇒ 加不同 `mod` 得不同 `total`（core 不认识 stats） | S2 |
| core：**d100 骰面** —— 传 `die:'1d100'` ⇒ 读数落在 1..100（✗ 硬编 d20） | S3 |
| core：**无副作用** —— 调用前后角色 hp/effects/items **逐字不变** | S5 |
| dnd3：撬锁改走本原语后**既有用例仍绿**（行为零变） | S6 |
| dnd3：`save`／`treatTrauma` 改走本原语后**既有用例仍绿** | S6 |
| dnd-5e：`save` 改走本原语后**既有用例仍绿** | S6 |

## 七、未落面（逐条声明，✗ 留白）

1. **✗ 技能表／熟练加值**：本笔只给判定原语（内容面缺口见 §五）。
2. **✗ adv/dis（rollMode）**：属 `#1798` 后续期 E1 其余。
3. **✗ `constraints`／`canAct`／移动**：同上。
4. **✗ 骨裂重挂**：本稿只给**判据**（§四 S8），✗ 不重挂（属 `#1780` 后继票）。
5. **✗ 百分比检定的语义面**（d20m）：本笔只保证**骰面可传**（S3），✗ 不定百分骰的成功语义（那属 d20m 包）。

## 八、复现命令（本稿读数由此产出）

```bash
# 散点勘定（§一）
grep -rn "d20() +\|DND3.d20()\|DND5E.d20()" src/ --include=*.js
grep -n "d20() + DND3.modOf" src/dnd/dnd3/core/chest.js
# #1780 实撞的实取复核（§一 末）
grep -rn "modOf(.*'str'" src/dnd/dnd3/
grep -rn "'str'" src/dnd/dnd3/ --include=*.js
# 设计稿原文（✗ 本稿复述）
sed -n '/^## 八、未落面/,/^## 九/p' docs/plan/1780-dnd3-cross-battle-trauma.md
grep -n "为何不是「力量检定" docs/plan/1780-dnd3-cross-battle-trauma.md
```
