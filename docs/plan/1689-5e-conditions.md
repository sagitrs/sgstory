# 5E 异常状态（Conditions）集成方案

> Issue: #1689 · 伞: #1695 · 状态: 设计稿
>
> 基线: PR #1687（Effect/Debuff + saves + fear）已落

## 一、SRD 15 种条件盘点

| # | 条件 | 英文 | 机制归类 | 引擎现有能力 | 缺口 |
|---|---|---|---|---|---|
| 1 | 目盲 | Blinded | 攻击劣势 + 被攻击优势 | ❌ 无优势/劣势管线 | **需 `rollMode` 原语** |
| 2 | 魅惑 | Charmed | 行为禁制（不能攻击施魅者） | ❌ 无行为约束 | 需 `constraints` 查询 |
| 3 | 耳聋 | Deafened | 感知惩罚 | ❌ 无技能检定系统 | 需 `skillCheck` 原语 |
| 4 | 恐慌 | Frightened | 攻击劣势 + 移动禁制 | ⚠️ 有 `RPG.fear`（标记），无机制 | 需接入优势/劣势 |
| 5 | 擒抱 | Grappled | 速度归零 | ❌ 无移动系统 | WorldMap 层面 |
| 6 | 失能 | Incapacitated | 不能行动/反应 | ⚠️ Battle 可跳过回合 | 需 `canAct` 查询 |
| 7 | 隐形 | Invisible | 攻击优势 + 被攻击劣势 | ❌ | `rollMode` |
| 8 | 麻痹 | Paralyzed | 失能 + 近战暴击 | ❌ | `rollMode` + `autoCrit` |
| 9 | 石化 | Petrified | 完全禁制 + 抗性变更 | ⚠️ 有石化豁免 | 需状态效果 |
| 10 | 中毒 | Poisoned | 攻击/检定劣势 | ❌ | `rollMode` |
| 11 | 倒地 | Prone | 近战劣势/远程正常 | ❌ | `rollMode`（条件性） |
| 12 | 束缚 | Restrained | 速度零 + 攻击劣势 | ❌ | `rollMode` + 移动 |
| 13 | 震慑 | Stunned | 失能 + 豁免劣势 | ❌ | `rollMode` + 豁免 |
| 14 | 昏迷 | Unconscious | 失能 + 倒地 + 近战暴击 | ❌ | 同麻痹 |
| 15 | 力竭 | Exhaustion | 6 级递进惩罚 | ❌ | 需层级状态 |

## 二、3 个新原语覆盖 80%

### 原语 1: `rollMode(attacker, defender, context)` → 'advantage' | 'disadvantage' | 'normal'

覆盖 12/15 种条件。5E 规则：优势 + 劣势 = 正常（相消）。

```js
DND5E.rollMode = (attacker, defender) => {
    const collect = (c) => {
        const modes = [];
        for (const id of c.effects) {
            const cond = DND5E.Conditions[id];
            if (cond?.rollMode) modes.push(cond.rollMode);
        }
        return modes;
    };
    const atk = collect(attacker);
    const def = collect(defender);
    const all = [...atk, ...def];
    const hasAdv = all.includes('advantage');
    const hasDis = all.includes('disadvantage');
    if (hasAdv && hasDis) return 'normal';
    if (hasAdv) return 'advantage';
    if (hasDis) return 'disadvantage';
    return 'normal';
};
```

集成到 `DND5E.attack()`：

```js
const mode = DND5E.rollMode(attacker, that);
const die = mode === 'advantage' ? DND5E.d20adv()
          : mode === 'disadvantage' ? DND5E.d20dis()
          : DND5E.d20();
```

### 原语 2: `canAct(character)` → boolean

覆盖 4 种「不能行动」条件。

```js
DND5E.canAct = (c) => {
    const incap = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];
    return !incap.some(id => c.effects.includes(id));
};
```

集成到 `Battle.execute()` 循环。

### 原语 3: `saveEnd(character, condition, dc)` → boolean

回合结束豁免。

```js
DND5E.saveEnd = (c, condition, dc) => {
    if (!c.effects.includes(condition.id)) return true;
    const result = DND5E.save(c, condition.saveAbility ?? 'wis', dc ?? 10);
    if (result.success) {
        c.lose(condition);
        RPG.perform(`${c.name} 摆脱了「${condition.name}」`);
        return true;
    }
    return false;
};
```

## 三、15 种条件的声明式定义

```js
DND5E.Conditions = {
    // —— 纯优势/劣势（6 种）——
    blinded:    { rollMode: 'disadvantage' },
    poisoned:   { rollMode: 'disadvantage' },
    invisible:  { rollMode: 'advantage', targetRollMode: 'disadvantage' },
    prone:      { meleeRollMode: 'disadvantage' },
    restrained: { rollMode: 'disadvantage' },
    frightened: { rollMode: 'disadvantage', saveEnd: { ability: 'wis' } },

    // —— 行为禁制（4 种）——
    incapacitated: { canAct: false },
    stunned:       { canAct: false },
    paralyzed:     { canAct: false, meleeAutoCrit: true },
    unconscious:   { canAct: false, meleeAutoCrit: true },

    // —— 特殊型（5 种）——
    charmed:   { cannotAttackSource: true },
    deafened:  {},
    grappled:  {},
    petrified: { canAct: false, resistAll: true },
    exhaustion: { level: null },
};
```

## 四、与现有架构的集成点

```
Battle.execute() 循环
  ├── 现有：检查 isOut → 跳过
  ├── 新增：检查 DND5E.canAct(attacker) → 跳过（震慑/麻痹/昏迷）
  ├── 现有：BattleTurn.execute() → attack()
  │     ├── 新增：DND5E.rollMode(attacker, defender) → 选 d20/d20adv/d20dis
  │     └── 新增：检查 meleeAutoCrit → 天然命中 + 自动暴击
  └── 新增（回合末）：DND5E.saveEnd(c, cond) → 每回合结束豁免
```

## 五、分期计划

| 阶段 | 交付 | 新增文件 | 预计用例 |
|---|---|---|---|
| **P1** | `rollMode` + `canAct` + 10 种条件 + 修改 `attack()` 和 `Battle` 循环 | `dnd-5e/core/conditions.js` | 15 |
| **P2** | `saveEnd` + frightened 接入 + exhaustion 6 级 | 同上扩展 | 8 |
| **P3** | `meleeAutoCrit` + charmed 的 Battle 约束 | 修改 `core/40-battle.js` | 5 |
| **P4** | grappled（WorldMap 层） + deafened（技能系统） | 跨模块 | 3 |

## 六、测试要点

```js
// P1
test('rollMode：无条件 → normal')
test('rollMode：blinded → disadvantage')
test('rollMode：invisible 攻方 → advantage')
test('rollMode：adv + dis 相消 → normal')
test('canAct：paralyzed → false')
test('Battle 循环：paralyzed 角色跳过回合')

// P2
test('saveEnd：豁免成功 → 移除条件')
test('exhaustion：6 级 → HP 归零')
```

## 七、已知边界

1. **prone 的近战/远程区分**：P1 先按近战处理，P4 精确区分
2. **charmed 的施魅者追踪**：P3 实现 `condition.source`
3. **exhaustion 的递进**：改存 `exhaustion:3` 格式
4. **dnd3 不受影响**：条件系统仅在 dnd-5e 包内
