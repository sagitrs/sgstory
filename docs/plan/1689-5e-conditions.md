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

**本稿处置**：**按 5.2.1 撰写**——判据是**引擎声明（2024 SRD）优先于 issue 散文引用**；分歧已报领队，且**领队已裁定同此口径并回写 `#1689` 正文**（`#1689` 的「5.1」字样已更正，2026-09-30）。

**裁定落点与回填接口**（防裁定后漏改一处）：裁定若**采本稿口径** ⇒ 本稿**无需改动**；裁定若改采 5.1 ⇒ **须回填这三处**：① §一 第 4 行（exhaustion 效应面）② §三 `levels` 字段与 §五 消费点行 ③ §七 P2（改为 5.1 的六级各自惩罚）。**唯一权威源 = `#1689` 正文的版本声明**，本稿不另立。

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
| 4 | Exhaustion | 774 | 778·780·782 | — | — | **层数递进**：`-2×级` 于 D20 Test（780）· **速度 `-5×级`**（782）· **6 级死亡**（778）· 长休减 1 级（784） |
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

// 原语 4 —— 移除机制（移除走「实例层」，见下「两层模型」）
DND5E.saveEnd = (c, condId, dc = 10) => {
    const cond = DND5E.Conditions[condId];
    if (!cond?.saveEnd) return null;              // 非豁免型 → 不触发
    if (!c.effects.includes(condId)) return true; // 未持有 → 幂等（不掷骰）
    const r = DND5E.save(c, cond.saveEnd.ability, dc);
    if (r.success) c.lose(DND5E.ConditionEffects[condId]);  // 写路径收 Effect 实例
    return r.success;
};
```

### 两层模型：**读取用 id、写入用实例**（回应 T 席阻断）

`Character` 的效果面有**两种接口语义**，须**分层承载**——这是引擎既定事实（`src/core/20-character.js`），不是本稿的选择：

| 面 | 载体 | 形态 | 用途 |
|---|---|---|---|
| **声明层** | `DND5E.Conditions[id]` | 纯字段表（`selfRollMode`/`targetRollMode`/…），**不含行为** | **读路径**：`rollMode()`／`canAct()` 读字段 |
| **实例层** | `DND5E.ConditionEffects[id]` | `new RPG.Debuff({ id, name, desc })`（P1 交付物之一） | **写路径**：`gain()`／`lose()`／`contains()` 收实例 |

| 接口 | 入参形态 | 引擎实现（实测） |
|---|---|---|
| `c.effects` | **id 字符串数组** | `20-character.js:27-28`（注释「存 Effect 的 id 字符串」）、`gain()` push `effect.id` |
| `c.contains(x)` | **Effect 实例**（或 props 对象） | `:42-44` = `this.effects.includes(propsOrEffect.id)` |
| `c.gain(e)` / `c.lose(e)` | **Effect 实例**（`instanceof RPG.Effect` 守卫，否则**抛错**） | `:55-70` |

⇒ **原稿式 `c.lose(DND5E.Conditions[condId])` 必然抛错**——声明层是纯对象，非 `RPG.Effect` 实例；且这是 **happy path 即抛错**（非静默），T 席已实跑复现（`lose 的参数应是 Effect 实例，收到：[object Object]`）。故**移除一律写** `c.lose(DND5E.ConditionEffects[condId])`。
⇒ **读路径仍用 id 字符串**（`c.effects.includes(id)`、`Conditions[id]`）——本稿 §三 原型与 §四 用例的字符串读法**正确，不改**。
⇒ **两层键集必须一致**（机械守卫）：`Object.keys(DND5E.Conditions)` ≡ `Object.keys(DND5E.ConditionEffects)` 且同 `id` —— 用例在册，防两层漂移（`meta.md ## 规则编写准则 ### 1. 单一权威源`）。

**可复现证据**（与引擎侧 `instanceof` 守卫同形）——以下为**核心片段**（含 `Character` 守卫桩与 5 条断言的**完整可跑脚本**见本 PR 票面 comment；本稿实跑 **不符数 = 0/5**）：

```js
// 引擎侧守卫照抄 + 两层模型最小驱动 ⇒ 本稿实跑 不符数 = 0/5
// ✅ T1 两层键集一致 | ✅ T2 旧写法（传声明对象）抛错：lose 的参数应是 Effect 实例，收到：[object Object]
// ✅ T3 豁免成功 ⇒ effects 中该 id 消失（[]，返回 true）| ✅ T4 未持有 ⇒ 幂等 true 且不掷骰 | ✅ T5 非豁免型 ⇒ null
const DND5E = {};
DND5E.Conditions = {                                        // 声明层（读路径）
  blinded:{ selfRollMode:'disadvantage', targetRollMode:'advantage' },
  frightened:{ selfRollMode:'disadvantage', saveEnd:{ ability:'wis' } },
};
DND5E.ConditionEffects = Object.fromEntries(                // 实例层（写路径）
  [['blinded','目盲','看不清'],['frightened','恐惧','只想逃离']]
    .map(([id,name,desc]) => [id, new RPG.Debuff({ id, name, desc })]));
DND5E.saveEnd = (c, condId, dc = 10) => {
  const cond = DND5E.Conditions[condId];
  if (!cond?.saveEnd) return null;
  if (!c.effects.includes(condId)) return true;
  const r = DND5E.save(c, cond.saveEnd.ability, dc);
  if (r.success) c.lose(DND5E.ConditionEffects[condId]);     // 写路径收实例
  return r.success;
};
```

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

**例子的原始出处 = T 票 `review 5363775104`（在 `#1700` 上）§二**：该表 **A6 行**举「相消」例为 `攻方 blinded ＋ 受方 invisible → normal`——**该期望不成立**：两源皆劣势（L261 + L996），**无优势可相消** ⇒ 正解 `disadvantage`。
**正确的相消例**应为 `攻方 invisible ＋ 受方 invisible`（adv + dis → normal ✓，上表第 6 行）。
⇒ 这是原稿单池错误的**连带污染**（原稿把 `invisible.rollMode='advantage'` 错当「对攻方的影响」，才凑出「相消」）。**本稿用正确例**。
⇒ T 席已就本更正**自裁并落痕**：`#1689` comment `5907830409` 的 A6 行现写「**更正**：正例＝攻方 `invisible` ＋ 受方 `invisible`；攻方 `blinded` ＋ 受方 `invisible` 系双劣势 ⇒ `disadvantage`，不构成相消」（本稿与之一致）。

### 复现（整段可复制执行；本表读数由此产出）

```js
// node conditions-p1-check.js   ⇒ 不符数 = 0/10（正例 8 + canAct 正/负例 2）
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
| `levels`（exhaustion） | `DND5E.d20TestMod(character)`（P2 新增）→ `src/dnd/dnd-5e/core/combat.js` 的 `#attack()` 调整值汇合处（平值修正，**非**优势/劣势 ⇒ 不走 `rollMode`） | **P2** |
| `autoCritMelee` | P3 攻击结算 | **P3** |
| `cannotAttackSource` | P3 Battle 约束 | **P3** |
| `speed0` | P4（WorldMap 层） | **P4** |
| `resistAll` | P4（伤害结算） | **P4** |
| `saveFail` | P2/P3（豁免面） | **P2–P3** |

⇒ **原稿 6 个死字段全部归位**（`targetRollMode`/`meleeRollMode`/`meleeAutoCrit`/`cannotAttackSource`/`resistAll`/`level`——D 席实测点号读取均为 0，**计 6 项**，与上列枚举一一对应）。
⇒ 另**两项同族但非「死字段」**的声明面缺陷，已另行处置：① 原稿 `saveEnd` 读 `condition.saveAbility` 而声明写 `saveEnd.ability` ⇒ **键名不匹配**（读不到，静默落默认值）⇒ 本稿统一为 `saveEnd.ability`（§三）；② 原稿 `canAct` **硬编码 id 数组**与声明表构成**双权威** ⇒ 本稿改**派生式**（§三 原语 2）。
⇒ **P1 交付的字段仅 4 个**，其余在各自期落地前**不出现在声明表中**（避免「看着已支持」）。

---

## 六、集成点

```
Battle 循环（src/core/40-battle.js）
  ├── 现有：isOut 判定 → 跳过
  ├── 【P1 新增】DND5E.canAct(attacker) → 跳过（失能/麻痹/石化/震慑/昏迷）
  ├── BattleTurn.execute() → #attack() → weapon.used()
  │     ├── 【P1 新增】DND5E.rollMode(attacker, defender, {melee}) → 选 d20/d20adv/d20dis
  │     ├── 【P2 新增】DND5E.d20TestMod(attacker) → 平值修正汇入调整值（exhaustion −2×级；**非**优势/劣势，与 rollMode 分路）
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
| **P1** | `rollMode`（双向）+ `canAct`（派生）+ **11 条件声明面**（§二 并集口径）+ 核心循环接线 | A1–A8 · B1–B3 · D1–D3 · E1 · **E6** | **≈23** | 15 | 上列各行**各有 ≥1 条可假用例**（拔掉该面必红）；E6 负例（dnd3/wfrp 不受影响）在册 |
| **P2** | `DND5E.save` + `saveEnd` + `frightened` 接入 + `exhaustion`（5.2.1 口径：D20 Test 平值修正） | C1–C4 + frightened×2 + E4 | **≈9** | 8 | `saveEnd` 三态（成功/失败/未持有幂等）＋ **「豁免成功 ⇒ `c.effects` 中该 id 消失」**（移除真的生效）＋ exhaustion 级边界（**供件原列 1/3/6；本稿补 0 级＝未持有**，故记 **0/1/6**）确定性用例在册 |
| **P3** | `autoCritMelee` + `charmed` 约束 | E2 · E3 · E5 | **≈5** | 5 | 近战暴击 + **远程不暴击**负例 + 禁攻施魅者（含 source 缺失降级）在册 |
| **P4** | `prone` 近战/远程 + `grappled`（速度0）+ **`exhaustion` 速度面（−5×级）** + `deafened`（降级） | E7 + grappled×2 + exhaustion-speed + deafened×2 | **≈7** | 3 | 逐条在册或**显式标「延后至 Pn」** |

> **「11 条件声明面」与 T 清单 A8「10 条件」的口径差**：§二 并集口径计 **11**（含仅入 `canAct` 面的 `incapacitated`）；T 清单 A8 按「**纯优势/劣势**条件」计作 **10**。**差的 1 条 = `incapacitated`**（它只有 `canAct` 面、无掷骰面）——两者不矛盾，按用途取用即可，**勿读作「缺 1 条」**。

⇒ 每行**逐条可追溯**到 T 域清单的行号；作者可调整归期，但**不得**使某面失去用例或失去年表归属。

---

## 八、确定性约定（T 域单一权威源）

1. **断言模式、不断言点数**：`rollMode` 只返回 `'advantage'|'disadvantage'|'normal'`（§三 设计已如此）⇒ 原语用例天然确定。**该性质本身须有用例固化**（T 域 D3）。
2. **集成面与豁免面注入固定 RNG** ⇒ **引用**（不复述）`tests/README.md` §如何写单元用例 **规则 4**（T 域扩写中，PR `#1702`）。本设计稿只写指针。
3. **「优势生效」的锁面＝调用面**（T 域 D1/D2）：该告警的**技法与替代方案已在 `tests/README.md` 规则 4**（PR `#1702`）——本节**不复述**（`meta.md` 准则 1）。本设计稿只补**落地要求**：P1 的 `d20adv`/`d20dis` 用例须以**调用面探针计次**或**异值轮转桩**锁，**不得以掷值结果断言**（否则固定 RNG 下两掷同值 ⇒ 假通过）。
4. **非 5E 包负例**：把 `canAct` 检查无条件塞进 core ⇒ **dnd3/wfrp 用例应红**（T 域 E6）——这是 §九.1 边界声明的**唯一可判形式**。

---

## 九、已知边界（逐条与声明表互标）

1. **核心改动面（修正原稿误导）**：原稿 §七.4 称「条件系统**仅在 dnd-5e 包内**」，但 §四/§五 明写改 `src/core/40-battle.js`。**两者不是一回事**。本稿改为可核陈述：
   - **条件声明与判定** ⇒ 居 `dnd-5e` 包（`src/dnd/dnd-5e/core/conditions.js`）；
   - **核心循环** ⇒ **仅增插桩点**（`src/core/40-battle.js`：`canAct` 跳过 + 回合末钩子，共 ≥2 处）；
   - **dnd3/wfrp 行为不受影响** ⇒ 由 §八.4 负例**证明**，不由陈述保证。
2. `charmed` 的施魅者追踪 ⇒ **P3**（`condition.source`）；P1/P2 声明表中**不含**该字段。
3. `exhaustion` ⇒ **P2**（**D20 Test 平值修正**面：`-2×级`，6 级死亡，长休减 1 级）；**速度面（`-5×级`，L782）随移动系统归 P4**——与 `grappled`/`restrained` 的 `speed0` 同族（同源：现仓无移动系统）。升降级与旧级移除须显式（**移除走实例层**：`lose(ConditionEffects[id])`，见 §三「两层模型」）。
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
