# 人物属性定制功能集成方案

> Issue: #1697 · 状态: 设计稿 · 关联: #1695（伞）、#1686（groundtruth）
>
> 基线: PR #1687（Effect/saves/fear）+ PR #1700（#1689 条件系统设计）

## 一、结构性发现：mod vs 原始分

**已证实**：引擎数值块存的是**调整值**（`str_mod: 1`），不存**原始分**（`str: 12`）。

```
现状: { str_mod: 1, dex_mod: 2, ... }     ← 只有结果
5E 需要: { str: 12, dex: 15, ... }        ← 原始分
       → mod = floor((score - 10) / 2)    ← 换算管线（缺失）
```

**影响**：
- 属性生成产生的是原始分（4d6 → 15），无处存放
- ASI（Ability Score Improvement）改原始分（12→13→14 时 mod +1→+2），缺管线导致升级无处落
- 种族加值加在原始分上（+2 Str），当前无入口

## 二、三法 × 两版规则 × 现仓原语对照表

### 5E（SRD 5.1）

| 方法 | 产出 | 现仓原语 | 缺口 |
|---|---|---|---|
| **4d6 弃最低** × 6 | 6 个 3-18 原始分 | ✅ `RPG.rollDetail('4d6')` 可掷 | ❌ 弃最低逻辑 + 原始分存放 |
| **标准阵列** [15,14,13,12,10,8] | 6 个固定值分配 | ✅ `choice` 可做分配 UI | ❌ 分配流程原语 |
| **27 点购买** | 8-15 范围内自由分配 | ❌ 无购买表/积分系统 | ❌ 购买表 + 积分计算器 |

### 3.5E（dnd3）

| 方法 | 产出 | 现仓原语 | 缺口 |
|---|---|---|---|
| **4d6 弃最低** × 6 | 同上 | 同上 | 同上 |
| **精英阵列** [15,14,13,12,10,8] | 同 5E 标准阵列 | 同上 | 同上 |
| **点买 25/28/32 档** | 7-18 范围，成本不同 | ❌ | ❌ 三档购买表 |

### 升级 / 成长

| 机制 | 版本 | 现仓 | 缺口 |
|---|---|---|---|
| **ASI**（+2 属性点或 +1/+1） | 5E 每 4 级 | ❌ 无等级系统 | ❌ level + ASI 分配 |
| **专长**（替代 ASI） | 5E | ❌ 无专长系统 | ❌ 完整系统（延后） |
| **升级 HP**（HD + Con mod） | 5E | ⚠️ hp 手动改 | ❌ levelUp 原语 |

## 三、新原语设计（4 个）

### 原语 1: `setScore(character, ability, score)` — 原始分管线

```js
/** 设置原始分并自动重算调整值（原始分→mod 的唯一入口） */
DND5E.setScore = (character, ability, score) => {
    const clamped = Math.max(1, Math.min(20, score));
    character.stats[ability] = clamped;                        // 原始分
    character.stats[`${ability}_mod`] = Math.floor((clamped - 10) / 2);  // 自动派生
    return character.stats[`${ability}_mod`];
};
```

**兼容性**：`str_mod` 保留（现有 `meleeAttack` 等代码不受影响），`str` 是新增字段。`setScore` 是唯一同时写两者的入口，保证一致性。

### 原语 2: `roll4d6DropLowest()` — 掷属性

```js
/** 掷 4d6 弃最低（5E/3E 通用的属性生成法），返回 3-18 */
DND5E.roll4d6DropLowest = () => {
    const r = RPG.rollDetail("4d6");
    const sorted = [...r.rolls].sort((a, b) => a - b);
    return sorted.slice(1).reduce((s, v) => s + v, 0);
};
```

### 原语 3: `pointBuy` — 点数购买计算器

```js
/** 5E 27 点购买表（8-15 分数的成本） */
DND5E.POINT_BUY_27 = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/** 3.5E 点买表（25/28/32 档，7-18 范围） */
DND3.POINT_BUY_25 = { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 };

/** 计算当前分配的总花费（返回 -1 表示超出预算） */
DND5E.pointBuyCost = (scores, budget) => {
    let total = 0;
    for (const s of Object.values(scores)) {
        total += POINT_BUY[c];
    }
    return total <= budget ? total : -1;
};
```

### 原语 4: `levelUp(character)` — 升级（含 ASI）

```js
/** 升级：+1 级、按 HD 掷新 HP、4 的倍数级触发 ASI */
DND5E.levelUp = (character) => {
    character.level = (character.level ?? 1) + 1;
    const hitDie = character.hitDie ?? 8; // 默认 d8
    const gain = RPG.roll(`1d${hitDie}`) + (character.stats.con_mod ?? 0);
    character.maxHp += Math.max(1, gain);
    character.hp = character.maxHp;
    if (character.level % 4 === 0) {
        character.pendingASI = 2; // 2 点属性点待分配
        RPG.perform(`${character.name} 升到 ${character.level} 级！获得 ASI（+2 属性点）`);
    }
    return character;
};
```

## 四、交互设计：角色创建流程（chargen）

```
开始 → 选生成方法 ─┬─ 4d6 弃最低 ──→ 掷 6 次 → 展示 → 确认/重掷 → 分配到六维
                  ├─ 标准阵列 ────→ [15,14,13,12,10,8] → 逐维分配
                  └─ 27 点购买 ───→ 积分计算器 → 逐维加减 → 确认
                                                            ↓
                                              DND5E.setScore × 6
                                                            ↓
                                                   进入游戏 / 战斗
```

**实现方式**：`Scene` 子类 `ChargenScene`，用 `choice` 驱动三步（方法→生成→分配），完成后 `goto` 主线。

## 五、分期计划

| 阶段 | 交付 | 新增文件 | 预计用例 |
|---|---|---|---|
| **P1** | `setScore` + `roll4d6DropLowest` + 原始分基础设施 | `dnd-5e/core/chargen.js` | 8 |
| **P2** | 27 点购买 + 标准阵列 + 分配交互（ChargenScene） | 同上 + `dnd-5e/core/chargen-scene.js` | 12 |
| **P3** | `levelUp` + ASI + HP 掷骰 | 同上扩展 | 6 |
| **P4** | dnd3 25/28/32 档点买 + 专长占位 | `dnd-5e/core/chargen.js` 扩展 | 5 |

## 六、测试要点

```js
// P1
test('setScore(12) → str_mod = 1')
test('setScore(13) → str_mod = 1')  // 奇数向下取整
test('setScore(14) → str_mod = 2')
test('setScore(20) → str_mod = 5')
test('roll4d6DropLowest ∈ [3, 18]')
test('roll4d6DropLowest ≤ 4d6 总和')

// P2
test('27 点购买：全 8 花费 0，剩 27')
test('27 点购买：15+15+15+8+8+8 = 9+9+9+0+0+0 = 27 ✓')
test('27 点购买：两个 16 → 超预算 → -1')

// P3
test('levelUp：level +1，maxHp 增加 ≥1')
test('levelUp 到 4 级：获得 pendingASI = 2')
```

## 七、已知边界

1. **mod 与原始分共存**：现有代码读 `str_mod` 不受影响；`setScore` 是唯一双写入口，防止不一致
2. **种族加值不在本票**：Tasha 浮动加值是否在 SRD 5.1 需实测（#1686），P1 先支持后加（`setScore(c, 'str', 14 + 2)` 即可实现）
3. **专长系统延后**：5E 的 feat 体系复杂（~80 个专长），P4 仅做占位接口
4. **dnd3 的 elite array 与 5E 相同**：标准阵列可跨版复用，点买表需各自定义
5. **升级 HP 掷骰**：3E 与 5E 规则不同（3E 可取均值），`levelUp` 提供 `useAverage` 选项
