# src/ —— 插件本体开发指南

这里是 SugarCube 增强插件的源码。两层结构：

| 目录 | 命名空间 | 职责 | 铁律 |
|---|---|---|---|
| `core/` | `setup.RPG` | 规则无关引擎：基类、背包、战斗循环、场景、输入输出 | **零规则字段**——core 回答“能不能、怎么做”，不回答“掷什么骰、DC 多少” |
| `dnd3/` | `setup.DND3` | D&D 3.5 规则包：数值块约定、判定数学、内容 | 判定数学只进 `dnd3/core/`，不碰 `src/core` |

## 如何添加你自己的插件（规则包）

以 wfrp 为例，四步：

1. **建包目录与命名空间**——`src/wfrp/00-init.js`（首行必须是 `/* raw */`，
   因为它要创建命名空间本身）：

   ```js
   /* raw */
   setup.WFRP = {
       version: '0.1.0',
       pack: 'wfrp',
       // WFRP 数值块：字段带默认值，保证角色之间对称
   };
   setup.WFRP.STAT_BLOCK = { ws: 31, bs: 31, toughness: 31, wounds: 8, /* … */ };
   setup.WFRP.stats = (over = {}) => ({ ...setup.WFRP.STAT_BLOCK, ...over });
   ```

2. **规则扩展（可选）**——`src/wfrp/core/`：对本包语义的判定扩展放这里
   （参考 `dnd3/core/chest.js` 给宝箱加 3E 撬锁检定的写法）。

3. **内容**——`src/wfrp/items/`、`src/wfrp/characters/` 用声明式工厂：

   ```js
   DND3 风格：RPG.defItem({ id, name, stats, used(that, from) { … }, actions: { … } })
   ```

4. **构建注入是自动的**——build.py 对 `src/<包>/**` 自动注入
   `(RPG, <包名大写>, $)` 别名（`src/wfrp/**` 得到 `WFRP`），文件里直接用。
   前提：包的 `00-init` 先创建 `setup.WFRP`（加载顺序：数字前缀保证 00 最先）。

**先读参考实现**：`dnd3/` 是完整范例（规则包结构、stats 约定、判定扩展、
内容组织）。新包与 dnd3 平行，互不可见——共享的东西应该在 `core`。

## 命名约定（提交前自查）

- 类大写、实例小写；单例角色大写（`DND3.Player`），效果等杂项实例小写（`RPG.death`）。
- 道具性质是布尔字段（`weapon: true`），角色性质是字符串标签数组（`properties: ['player']`）。
- 动作（verb）名小写字符串：`use` / `equip` / `unequip` / `open` / `lockpick`…
- core 只提供通用 `RPG.roll`；带规则色彩的便利函数归规则包（如 `DND3.d20`）。

## 装备槽（加武器/衣服/鞋这类装备）

- 道具声明 `slot`：`'weapon'` / `'body'` / `'feet'…`（槽名是普通字符串，
  规则包可自定义新槽；`null` = 不可装备）。**同槽互斥、异槽共存**。
- 共享动作 `actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip }`
  ——槽位感知，同槽已有装备则失败（提示先卸下），不自动换装。
- 查询：`RPG.equippedIn(槽)`（该槽已装备道具）、`RPG.isEquipped(id)`；
  `RPG.slotLabels.槽名 = '中文'` 由规则包补全提示文案（core 不认识具体槽）。
- 装备参与战斗数值走规则包：dnd3 的 `DND3.acOf(角色)` 会把已装备道具的
  `stats.ac_bonus` 计入防御等级（铁环甲 +3、包铁皮靴 +1）。
- 近战武器共用 `DND3.meleeAttack`（dnd3/core/combat.js）：拔出检查、
  1d20+BAB+力量 vs acOf、天然 1/重击威胁范围 `stats.critMin`、击倒结算
  ——**加新武器只需写数据（见 sword.js），零重复判定代码**。

## Issue 格式（认为架构有欠缺时）

标题前缀标明层次：`[core]` / `[dnd3]` / `[build]` / `[arch]`（跨层）。
正文包含五节：

```markdown
## 现状
哪个文件 / 哪个类或函数，现在的行为是什么（贴代码行）。

## 期望
你认为应该怎样，为什么。

## 违反的原则
内聚 / 耦合 / 对称性 / 契约——具体违反了哪条（见根 README“核心设计”）。

## 最小复现
一个失败的最小单元用例（tests/unit 风格），或可复现的 e2e 步骤。

## 影响面
是否破坏现有故事（tests/e2e）与现有 API。
```

> 带“失败的最小测试”的 Issue 会被优先处理——测试即规格。

## PR 格式（分享你做的插件）

- **目录约定**：`src/<包>/00-init.js`（raw + 命名空间 + stats 约定）、
  `src/<包>/core/`（判定扩展，可空）、`src/<包>/items|characters/`（内容）。
- **必须自带测试**：新建 `tests/unit/<包名>.test.js`（IIFE 包裹，一个单元
  一个文件；build.py 自动发现），断言风格见
  [tests/README.md](../tests/README.md)：只测状态与异常。
- **PR 描述模板**：

  ```markdown
  ## 包名与定位
  （如 wfrp：WFRP 4e 规则包，含 d100 判定、优势、命中位置）

  ## 数值块约定
  列出 STAT_BLOCK 全部字段及含义。

  ## 能力清单
  items / characters / core 扩展各一行说明。

  ## 验证
  - [ ] python build.py 后 tests/unit/unit.html 标题为 PASS
  - [ ] e2e 故事核心路径未破坏（可开箱、可战斗、可离开）
  - [ ] src/core 代码层零规则字段（grep 自查）
  - [ ] 命名符合“命名约定”
  ```

- **红线**：把规则数学（掷骰公式、DC、字段名）放进 `src/core` 的 PR
  会被拒绝——请下沉到 `<包>/core/`。
