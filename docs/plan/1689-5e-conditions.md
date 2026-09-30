# 5E 异常状态（Conditions）集成方案（R2）

> Issue: #1689 · 伞: #1695 · 状态: 设计稿（**R2，取代 #1700**）
> 基线: `main` @ `ea6be039`（PR #1687 Effect/Debuff + saves + fear 已落）
> **本版修订依据**：#1700 的 D 席检视（`review 5363822192`）+ T 席检视（`review 5363775104`）+ 突变面清单（`#1689` comment `5907830409`，T 域供件）

---

## 〇、groundtruth 声明（本版首要修订）

| 项 | 值 |
|---|---|
| **来源** | `https://github.com/downfallx/dnd-5e-srd-markdown`（`#1686` 指名的参考源） |
| **版本** | **SRD 5.2.1（D&D 5e 2024）** |
| **取数锚** | commit `1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4` · 文件 `rules-glossary.md`（1537 行，`sha1 d2e39b22330c2861`） |
| **访问日** | 2026-09-30 |
| **条目定位法** | `grep -n '^#### .* \[Condition\]' rules-glossary.md` |
| **授权** | CC BY 4.0（源仓 `LICENSE`；与 `#1686` 的授权标注要求衔接，标注落地归 `#1686`） |

### ⚠️ 版本口径分歧（**请领队裁**）

| 陈述 | 值 |
|---|---|
| `#1689` 正文 | 「以 **5.1** SRD groundtruth 实测计数」 |
| **引擎自身声明** | `src/dnd/dnd-5e/00-init.js:1` =「D&D 5e (**2024 SRD**) 数值块约定与命名空间」 |
| 参考源现行版本 | **5.2.1（2024）** |

**两版 `Exhaustion` 规则完全不同** ⇒ 版本选错则数值整片错（正是 `#1686` 要防的面）：

| | 5.1 | 5.2.1（本源） |
|---|---|---|
| 惩罚 | 6 级各自不同（力竭／速度减半／HP 上限减半…） | **每级统一 `-2 × 级数`，作用于全部 D20 Test** |
| 终止 | 6 级死亡 | 6 级死亡 |

**本稿处置**：**按 5.2.1 撰写**——判据是**引擎声明（2024 SRD）优先于 issue 散文引用**；分歧已在 `#1689` 报领队。若裁定用 5.1，§七 P2 与 §三 的 exhaustion 面须换源重算。

### 复现命令（本文所有计数由此产出）

```bash
git clone --depth 1 https://github.com/downfallx/dnd-5e-srd-markdown.git && cd dnd-5e-srd-markdown
grep -c '^#### .* \[Condition\]' rules-glossary.md      # ⇒ 15（条件全集）
python3 classify.py                                     # ⇒ 效应侧归类表（见 §二；脚本见附录）
```

**本稿全部数字的可复现入口**：§四 的 `conditions-p1-check.js`（原型实跑，整段可复制）＋ 附录 `classify.py`（计数）。

---

## 一、SRD 15 种条件盘点（逐条附出处行号）

行号 = 本源 `rules-glossary.md`：**H** = `#### <Name> [Condition]` 标题行；**E** = 效应用语所在行（逐条实测）。

| # | 条件 | H | E（效应用语） | 自身掷骰 | 对来犯 | 其它面 |
|---|---|---|---|---|---|---|
| 1 | Blinded | 255 | 261 | 劣势 | **优势** | — |
| 2 | Charmed | 434 | 438 | — | — | 禁攻施魅者 |
| 3 | Deafened | 676 | 680 | — | — | 听觉检定必败 |
| 4 | Exhaustion | 774 | 778·780 | — | — | **层数递进（-2×级）** |
| 5 | Frightened | 816 | 820 | 劣势 | — | 不能靠近恐惧源（822） |
| 6 | Grappled | 824 | 830 | 劣势※ | — | 速度 0（828） |
| 7 | Incapacitated | 923 | 927 | — | — | **不能行动** |
| 8 | Invisible | 988 | 996 | 优势 | **劣势** | — |
| 9 | Paralyzed | 1123 | 1127·1131·1133·1135 | — | **优势** | **⇒失能**·近战自动暴击·豁免必败(力/敏)·速度0 |
| 10 | Petrified | 1147 | 1153·1157·1159·1161 | — | **优势** | **⇒失能**·豁免必败(力/敏)·速度0·全抗 |
| 11 | Poisoned | 1169 | 1173 | 劣势 | — | — |
| 12 | Prone | 1183 | 1189 | 劣势 | **条件性**† | 起身需半速 |
| 13 | Restrained | 1214 | 1218·1220·1222 | 劣势 | **优势** | 豁免劣势(敏)·速度0 |
| 14 | Stunned | 1419 | 1423·1425·1427 | — | **优势** | **⇒失能**·豁免必败(力/敏) |
| 15 | Unconscious | 1503 | 1507·1509·1511·1513·1515 | — | **优势** | **⇒失能**·近战自动暴击·豁免必败(力/敏)·速度0 |

※ `Grappled` L830：「Disadvantage on attack rolls **against any target other than the grappler**」⇒ 自身掷骰面，但**带例外**（对擒抱者除外）——本稿 P1 按无条件劣势实现并**显式标注该简化**（见 §九.4）。
† `Prone` L1189：受击方 5 尺内 ⇒ 对来犯**优势**；否则 ⇒ **劣势** ⇒ 需 `melee` 上下文（见 §三）。

---

## 二、覆盖声称（取代原稿无出处的「80% / 12+4」）

原稿称「3 原语覆盖 **12/15（80%）**」但**无推导**（D 席实测：原稿声明表**带 `rollMode` 键仅 5 条**）。本稿改为**可复算的口径**：

| 面 | 条数 | 条目（逐条可核） |
|---|---|---|
| 自身掷骰 `selfRollMode` | **7** | Blinded, Frightened, Grappled, Invisible, Poisoned, Prone, Restrained |
| 对来犯 `targetRollMode` | **8** | Blinded, Invisible, Paralyzed, Petrified, Prone, Restrained, Stunned, Unconscious |
| **`rollMode`（双向并集）** | **11** | 上两行并集 |
| `canAct` | **5** | Incapacitated, Paralyzed, Petrified, Stunned, Unconscious |
| **并集（rollMode ∪ canAct）** | **12 / 15** | — |
| **未覆盖** | **3** | **Charmed**（需禁攻约束）、**Deafened**（需听觉检定）、**Exhaustion**（需层数） |

⇒ **「12/15」成立，但成立的理由与原稿不同**：原稿把「3 原语」记作 `rollMode + canAct + saveEnd`（其中 `saveEnd` **不贡献任何条件面**，它只是移除机制）；**真实构成 = rollMode（双向）11 + canAct 净增 1（Incapacitated）**。
⇒ 「80%」= 12/15 ≈ 0.8，但**该比例不构成设计判据**（未覆盖的 3 条恰是需新机制者），故本稿**不再以百分比作主张**，只列上表。
⇒ **计数与归类的机械核验**见附录脚本；本表的每次修订须重跑。

---

## 三、新原语（**4 个**，非原稿的 3 个）

| # | 原语 | 状态 | 覆盖 | 说明 |
|---|---|---|---|---|
| 1 | `rollMode(attacker, defender, ctx)` | **新** | 11/15 | **双向分池**（修正原稿单池） |
| 2 | `canAct(character)` | **新** | 净增 1/15 | **由声明表派生**（修正原稿硬编码双权威） |
| 3 | `DND5E.save(character, ability, dc)` | **新（原稿漏列）** | — | 原稿 `saveEnd` **调用了不存在的函数**（D 席实测 `git grep` 零命中，仓内仅 `DND3.save`） |
| 4 | `saveEnd(character, condId, dc)` | **新** | — | 移除机制，不贡献条件覆盖面 |

**已存在、须归位的面**（原稿未列）：

| 面 | 现状 | 本稿处置 |
|---|---|---|
| `DND5E.d20adv` / `d20dis` | **已存在**（`src/dnd/dnd-5e/00-init.js:35-36`） | 列为**既有承载体**，P1 仅**接线**（选骰），不重造；用例须覆盖**调用面**（§八.3） |
| `BattleTurn.execute()` / `Battle` 循环 | 已存在（`src/core/40-battle.js`） | 明确**核心改动面**（修正原稿「仅在 5e 包内」的误导，见 §九.1） |

```js
// 原语 1 —— 双向分池（修正点：原稿对攻守两侧都只读 cond.rollMode 汇入同一池）
DND5E.rollMode = (attacker, defender, { melee = false } = {}) => {
    const modes = [];
    const take = (c, field) => {
        for (const id of c.effects) {
            const v = DND5E.Conditions[id]?.[field];
            if (v) modes.push(v);
        }
    };
    take(attacker, 'selfRollMode');                  // 攻方自身修正
    take(defender, 'targetRollMode');                // 受方对来犯的影响
    take(defender, melee ? 'targetMelee' : 'targetRanged');  // 近战/远程条件性（Prone）
    const adv = modes.includes('advantage'), dis = modes.includes('disadvantage');
    return adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';
};

// 原语 2 —— 派生式（修正点：原稿硬编码 id 数组与声明表构成两处权威）
DND5E.canAct = (c) => !Object.entries(DND5E.Conditions)
    .some(([id, cond]) => cond.inactive && c.effects.includes(id));

// 原语 3 —— 显式交付（原稿漏列；口径与 DND3.save 不同，见 §九.5）
DND5E.save = (c, ability, dc) => {
    const mod = c?.stats?.[`save_${ability}`] ?? 0;
    const roll = DND5E.d20();
    return { success: roll + mod >= dc, roll, mod, dc };
};

// 原语 4 —— 移除机制
DND5E.saveEnd = (c, condId, dc = 10) => {
    const cond = DND5E.Conditions[condId];
    if (!cond?.saveEnd) return null;              // 非豁免型 → 不触发
    if (!c.effects.includes(condId)) return true; // 未持有 → 幂等（不掷骰）
    const r = DND5E.save(c, cond.saveEnd.ability, dc);
    if (r.success) c.lose(cond);                  // 注意：lose 收 Effect 实例
    return r.success;
};
```

> ⚠️ `Character.lose(effect)` 有 `instanceof RPG.Effect` 守卫（`src/core/20-character.js:64-70`）⇒ 条件须为 `RPG.Effect` 子类实例，**不能传 id 字符串**。本稿 P1 一并定义 `Conditions` 的 Effect 实例化方式。

---

## 四、修正原型实测（回应 D 席 #1 / T 席 A4·A5）

把 §三 原型 + §三 声明表**逐字转录**为独立脚本（不与仓内 bundle 耦合 ⇒ 验的是**文档文本本身**），实跑：

| 场景 | SRD 依据 | 期望 | 实跑 | 判定 |
|---|---|---|---|---|
| 攻方 `blinded` | L261「your attack rolls have Disadvantage」 | disadvantage | disadvantage | ✅ |
| 攻方 `invisible` | L996「your attack rolls have Advantage」 | advantage | advantage | ✅ |
| **受方 `invisible`** | L996「Attack rolls against you have Disadvantage」 | **disadvantage** | **disadvantage** | ✅（原稿给 **advantage** ✗） |
| **受方 `poisoned`** | L1173 仅「You have Disadvantage on attack rolls」（**自身**） | **normal** | **normal** | ✅（原稿给 **disadvantage** ✗） |
| 攻方 `blinded` ＋ 受方 `invisible` | 两源**皆劣势** ⇒ 无优势可相消 | **disadvantage** | disadvantage | ✅ |
| 攻方 `invisible` ＋ 受方 `invisible` | adv ＋ dis ⇒ 相消 | normal | normal | ✅ |
| 受方 `prone`（近战） | L1189「5 尺内 ⇒ 对来犯 Advantage」 | advantage | advantage | ✅ |
| 受方 `prone`（远程） | L1189「否则 ⇒ Disadvantage」 | disadvantage | disadvantage | ✅ |

### ⚠️ 连带更正一处 T 域供件

T 票突变面表（`#1689` comment `5907830409`）的 **A6 行**举「相消」例为 `攻方 blinded ＋ 受方 invisible → normal`——**该期望不成立**：两源皆劣势（L261 + L996），**无优势可相消** ⇒ 正解 `disadvantage`。
**正确的相消例**应为 `攻方 invisible ＋ 受方 invisible`（adv + dis → normal ✓，上表第 6 行）。
⇒ 这是原稿单池错误的**连带污染**（原稿把 `invisible.rollMode='advantage'` 错当「对攻方的影响」，才凑出「相消」）。**本稿用正确例**；T 域供件的更正由 T 席自行裁定（本稿只提示，不代改其件）。

### 复现（整段可复制执行；本表读数由此产出）

```js
// node conditions-p1-check.js   ⇒ 不符数 = 0/11
const DND5E = {};
DND5E.Conditions = {
    // selfRollMode（自身掷骰）7 条
    blinded:     { selfRollMode: 'disadvantage', targetRollMode: 'advantage' },   // H255/E261
    frightened:  { selfRollMode: 'disadvantage' },                                 // H816/E820
    grappled:    { selfRollMode: 'disadvantage' },                                 // H824/E830（简化：见 §九.4）
    invisible:   { selfRollMode: 'advantage',    targetRollMode: 'disadvantage' },  // H988/E996
    poisoned:    { selfRollMode: 'disadvantage' },                                 // H1169/E1173
    prone:       { selfRollMode: 'disadvantage', targetMelee: 'advantage', targetRanged: 'disadvantage' }, // H1183/E1189
    restrained:  { selfRollMode: 'disadvantage', targetRollMode: 'advantage' },     // H1214/E1220
    // targetRollMode 侧（自身无掷骰面）
    paralyzed:   { targetRollMode: 'advantage', inactive: true },                  // H1123/E1133
    petrified:   { targetRollMode: 'advantage', inactive: true },                  // H1147/E1157
    stunned:     { targetRollMode: 'advantage', inactive: true },                  // H1419/E1427
    unconscious: { targetRollMode: 'advantage', inactive: true },                  // H1503/E1511
    // inactive（canAct 派生面）1 条独立
    incapacitated:{ inactive: true },                                              // H923/E927
    // 其余 3 条（charmed/deafened/exhaustion）P1 不含字段（§五：未到期不出现在表中）
};
DND5E.rollMode = (attacker, defender, { melee = false } = {}) => {
    const modes = [];
    const take = (c, field) => { for (const id of c.effects) { const v = DND5E.Conditions[id]?.[field]; if (v) modes.push(v); } };
    take(attacker, 'selfRollMode');
    take(defender, 'targetRollMode');
    take(defender, melee ? 'targetMelee' : 'targetRanged');
    const adv = modes.includes('advantage'), dis = modes.includes('disadvantage');
    return adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';
};
DND5E.canAct = (c) => !Object.entries(DND5E.Conditions).some(([id, cond]) => cond.inactive && c.effects.includes(id));
const C = (effects) => ({ effects });
const CASES = [
    ['攻方 blinded',                C(['blinded']),   C([]),              {},              'disadvantage'],
    ['攻方 invisible',              C(['invisible']), C([]),              {},              'advantage'],
    ['受方 invisible',              C([]),            C(['invisible']),   {},              'disadvantage'],
    ['受方 poisoned',               C([]),            C(['poisoned']),    {},              'normal'],
    ['blinded ＋ 受方invisible',    C(['blinded']),   C(['invisible']),   {},              'disadvantage'],
    ['invisible ＋ 受方invisible',  C(['invisible']), C(['invisible']),   {},              'normal'],
    ['受方 prone（近战）',          C([]),            C(['prone']),       { melee: true }, 'advantage'],
    ['受方 prone（远程）',          C([]),            C(['prone']),       { melee: false }, 'disadvantage'],
];
let bad = 0;
for (const [label, a, d, ctx, expect] of CASES) {
    const got = DND5E.rollMode(a, d, ctx);
    if (got !== expect) bad++;
    console.log(`${got === expect ? '✅' : '❌'} ${label}: 期望 ${expect} · 实跑 ${got}`);
}
for (const [l, c, e] of [['canAct:paralyzed', C(['paralyzed']), false], ['canAct:poisoned', C(['poisoned']), true]]) {
    const got = DND5E.canAct(c); if (got !== e) bad++;
    console.log(`${got === e ? '✅' : '❌'} ${l}: 期望 ${e} · 实跑 ${got}`);
}
console.log(`不符数 = ${bad}/10`);
```

本稿实跑读数：**`不符数 = 0/10`**（正例 8 + canAct 正/负例 2）。

---

## 五、字段生效表（每个声明字段 → 消费点 → 期）

**判据**（D 席 #1 的 blocking 面）：**任何声明字段必须有消费点**；无消费点者 ⇒ 必须**归期**或**删除**，不得留在表中当装饰（`meta.md ## 规则编写准则 ### 1. 单一权威源`）。

| 声明字段 | 消费点（谁读） | 归期 |
|---|---|---|
| `selfRollMode` | `rollMode()` `take(attacker, …)` | **P1** |
| `targetRollMode` | `rollMode()` `take(defender, …)` | **P1** |
| `targetMelee` / `targetRanged` | `rollMode()` `ctx.melee` 分支 | **P1** |
| `inactive` | `canAct()`（派生式） | **P1** |
| `saveEnd.ability` | `saveEnd()` → `DND5E.save()` | **P2** |
| `levels`（exhaustion） | P2 惩罚计算 | **P2** |
| `autoCritMelee` | P3 攻击结算 | **P3** |
| `cannotAttackSource` | P3 Battle 约束 | **P3** |
| `speed0` | P4（WorldMap 层） | **P4** |
| `resistAll` | P4（伤害结算） | **P4** |
| `saveFail` | P2/P3（豁免面） | **P2–P3** |

⇒ **原稿 7 个死字段全部归位**（`targetRollMode`/`meleeRollMode`/`meleeAutoCrit`/`cannotAttackSource`/`resistAll`/`level`——D 席实测点号读取均为 0）。**P1 交付的字段仅 4 个**，其余在各自期落地前**不出现在声明表中**（避免"看着已支持"）。

---

## 六、集成点

```
Battle 循环（src/core/40-battle.js）
  ├── 现有：isOut 判定 → 跳过
  ├── 【P1 新增】DND5E.canAct(attacker) → 跳过（失能/麻痹/石化/震慑/昏迷）
  ├── BattleTurn.execute() → #attack() → weapon.used()
  │     ├── 【P1 新增】DND5E.rollMode(attacker, defender, {melee}) → 选 d20/d20adv/d20dis
  │     └── 【P3 新增】autoCritMelee 判定
  └── 【P2 新增】回合末 DND5E.saveEnd(c, cond) —— ⚠️ 见下「承载点」
```

### ⚠️ `saveEnd` 的承载点（回应 D 席 #7）

现循环**唯一逐角色钩子**是 `RPG.events.emit('battle:turn', …)`，而它**只在 `BattleTurn.execute()` 内发射**（`core/40-battle.js:21`）；**玩家交互通路 `#playerAction`（`:99-101`）不发射该事件**。
⇒ 若把 `saveEnd` 挂 `battle:turn`，**玩家角色的回合末豁免会漏跑**。
**本稿处置（二择，P2 落地时定）**：
- **(甲)** 核心两条通路**各自收尾处**新增钩子（须改 `src/core/40-battle.js` 两处）；
- **(乙)** 玩家角色由**交互通路自行调用** `saveEnd`（不改核心，但需在通路内显式接线）。
⇒ **无论甲乙，均改核心**（与 §九.1 的边界陈述一致，不再自相矛盾）。

### `d20adv` / `d20dis` 归位
两者**已存在于 5E 包**（`00-init.js:35-36`），P1 只在 `#attack()` 中**接线**（按 `rollMode` 结果选骰）——**不重造**。其"优势生效"的锁面见 §八.3。

---

## 七、分期计划（**预算由突变面清单导出**）

**推导式**（T 域供件 `#1689` comment `5907830409` 第二节）：

```
每期预算 = 条件声明面（逐条件 ≥1）
         + 原语态数（含受方语义 / 相消 / 字段一致性）
         + 集成·调用面
         + 负例（跨包不受影响 / 远程不暴击 / 幂等 / 未持有）
```

| 期 | 交付 | 突变面（T 域行号） | **导出条数** | 原稿 | 每期**完成判据**（可判） |
|---|---|---|---|---|---|
| **P1** | `rollMode`（双向）+ `canAct`（派生）+ 11 条件声明面 + 核心循环接线 | A1–A8 · B1–B3 · D1–D3 · E1 · **E6** | **≈23** | 15 | 上列各行**各有 ≥1 条可假用例**（拔掉该面必红）；E6 负例（dnd3/wfrp 不受影响）在册 |
| **P2** | `DND5E.save` + `saveEnd` + `frightened` 接入 + `exhaustion`（5.2.1 口径） | C1–C4 + frightened×2 + E4 | **≈9** | 8 | `saveEnd` 三态（成功/失败/未持有幂等）+ exhaustion 级边界（0/1/6）确定性用例在册 |
| **P3** | `autoCritMelee` + `charmed` 约束 | E2 · E3 · E5 | **≈5** | 5 | 近战暴击 + **远程不暴击**负例 + 禁攻施魅者（含 source 缺失降级）在册 |
| **P4** | `prone` 近战/远程 + `grappled`（速度0）+ `deafened`（降级） | E7 + grappled×2 + deafened×2 | **≈6** | 3 | 逐条在册或**显式标「延后至 Pn」** |

⇒ 每行**逐条可追溯**到 T 域清单的行号；作者可调整归期，但**不得**使某面失去用例或失去年表归属。

---

## 八、确定性约定（T 域单一权威源）

1. **断言模式、不断言点数**：`rollMode` 只返回 `'advantage'|'disadvantage'|'normal'`（§三 设计已如此）⇒ 原语用例天然确定。**该性质本身须有用例固化**（T 域 D3）。
2. **集成面与豁免面注入固定 RNG** ⇒ **引用**（不复述）`tests/README.md` §如何写单元用例 **规则 4**（T 域扩写中，PR `#1702`）。本设计稿只写指针。
3. ⚠️ **固定 RNG 下不能用「结果」区分 adv/dis**（`d20adv`/`d20dis` 两掷同值）⇒ 锁「优势生效」**必须走调用面**：探针计次 或 **异值轮转桩**（如 `[0.1, 0.9]`）。缺此约定极易写成「固定掷 ⇒ 命中 ⇒ 误判优势生效」（T 域 D1/D2）。
4. **非 5E 包负例**：把 `canAct` 检查无条件塞进 core ⇒ **dnd3/wfrp 用例应红**（T 域 E6）——这是 §九.1 边界声明的**唯一可判形式**。

---

## 九、已知边界（逐条与声明表互标）

1. **核心改动面（修正原稿误导）**：原稿 §七.4 称「条件系统**仅在 dnd-5e 包内**」，但 §四/§五 明写改 `src/core/40-battle.js`。**两者不是一回事**。本稿改为可核陈述：
   - **条件声明与判定** ⇒ 居 `dnd-5e` 包（`src/dnd/dnd-5e/core/conditions.js`）；
   - **核心循环** ⇒ **仅增插桩点**（`src/core/40-battle.js`：`canAct` 跳过 + 回合末钩子，共 ≥2 处）；
   - **dnd3/wfrp 行为不受影响** ⇒ 由 §八.4 负例**证明**，不由陈述保证。
2. `charmed` 的施魅者追踪 ⇒ **P3**（`condition.source`）；P1/P2 声明表中**不含**该字段。
3. `exhaustion` ⇒ **P2**；**5.2.1 口径**（-2×级，6 级死亡）；升降级与旧级移除须显式（`lose(Effect)` 守卫见 §三 注）。
4. `grappled` 的「对非擒抱者劣势」⇒ **P1 按无条件劣势实现并标注简化**，例外分支归 **P4**（同 `speed0`）。
5. `DND5E.save` 与 `DND3.save` **口径不同**（前者按 `save_<ability>`、后者按豁免类型索引）⇒ 本稿**不自作统一**，仅在 5E 包内交付；跨包统一若需要，另立票。
6. `deafened` 需听觉检定系统（现仓无技能系统）⇒ **P4 降级实现**（`canHear=false` 标记），技能系统另立票。

---

## 附录：计数复现脚本

```python
#!/usr/bin/env python3
# classify.py — 存于 srd-repo 根，与 rules-glossary.md 同目录
import re
lines = open('rules-glossary.md', encoding='utf-8').read().split('\n')
blocks, i = {}, 0
while i < len(lines):
    m = re.match(r'^#### ([A-Za-z ]+) \[Condition\]$', lines[i])
    if m:
        name, body, j = m.group(1), [], i + 1
        while j < len(lines) and not lines[j].startswith('#### '):
            body.append(lines[j]); j += 1
        blocks[name] = '\n'.join(body); i = j
    else:
        i += 1
SELF = [r'your attack rolls have Disadvantage', r'your attack rolls have Advantage',
        r'You have Disadvantage on attack rolls(?! against any target other than)',
        r'Disadvantage on attack rolls against any target other than',
        r'You have Disadvantage on ability checks and attack rolls']
TGT  = [r'Attack rolls against you have Advantage', r'Attack rolls against you have Disadvantage',
        r'attack roll against you has Advantage', r'that attack roll has Disadvantage']
CAN  = [r"can't take any action", r'You have the Incapacitated( and Prone)? conditions?']
h = lambda b, P: any(re.search(p, b) for p in P)
S = {n for n, b in blocks.items() if h(b, SELF)}
T = {n for n, b in blocks.items() if h(b, TGT)}
C = {n for n, b in blocks.items() if h(b, CAN)}
print(f'全集 {len(blocks)} | self {len(S)} | target {len(T)} | rollMode {len(S|T)} | canAct {len(C)} | 并集 {len(S|T|C)}')
print('未覆盖:', sorted(set(blocks) - (S | T | C)))
```

> **同义族声明（method）**：上列正则为**多措辞族**——同一事实在 SRD 中用不同措辞表述（如「your attack rolls have Disadvantage」vs「You have Disadvantage on attack rolls」vs「You have Disadvantage on ability checks and attack rolls」；`Unconscious` 用复数「Incapacitated **and Prone** conditions」）。**单短语扫是下限**，本脚本已列同义族；**新增措辞须补入正则**，否则漏计（gsvector-process `shared/meta.md ## 事实纠正` 第 4 点的同族要求）。
