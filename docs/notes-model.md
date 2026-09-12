# 笔记模型（线索/情报道具化 → 条件表驱动对话）

> **状态**：设计稿（**阶段 0**），未落任何代码。伞票见 [#422]。
> **目标**：让内容具备**可演进性**——新增线索/分支内容时，不再需要改段落里的手写 `<<if>>`，而是往一张表里加条目。
> **一句话**：把「知识」从散落的旗标收进**笔记**，把「分支」从段落内 `if` 搬进**数据表里的条件表达式**。

---

## 0. 为什么现在做

当前条件用量（实测）：`pc.ev.` **254 处** ／ `pc.world.` **72 处** ／ `pc.inv[...]` 55 处 ／ `pc.gear` 11 处。
其中**知识类**与**世界态类**混在同一个自由命名空间里（`ev` 57 键 / `world` 21 键），导致：

- 段落的可见内容由**段落内手写分支**决定 → 加一条线索要改多处段落，且**无法一眼看全**「谁在读它」；
- 门只能间接守住形状（`--state` 管域归属、`--truth` 管锚句、`--npc` 管动机），**没有人能回答**「这条线索一共有几处消费」；
- 新增内容时最贵的一步永远是「找到所有该并进去的分支」。

**非目标**（明确排除，避免范畴错误）：
- ❌ 不把「世界态」物品化（`flower_fed`／`goblin_spared`／`ending` 回答的是**发生过什么**，不是**你知道什么**）；
- ❌ 不做全自动组合枚举（组合爆炸）；
- ❌ 不删物品栏（持有物与知识是两件事）。

---

## 1. 三类存储 ＋ 一个条件语言

```
段落/选项内容  ←  select(条件语言)
                   ├── notes   笔记（新）：我知道什么          ← 本次重构的主角
                   ├── world   世界态（保留）：发生过什么
                   ├── items   物品栏（已有）：我拿着什么
                   └── state   数值/态度（保留）：星力、态度、回合…
```

**知识不是持有物**，所以给笔记一个**独立容器**（不进物品栏；UI 上就是「笔记/线索」页，与图鉴并列或并入图鉴）。

---

## 2. 数据形状（阶段 1 落地）

```js
Game.Notes = {
  entries: {
    'n_witch_hint': {
      title: '女巫指过的路',
      src:   '女巫小屋',                 // 来源（玩家视角的「从哪知道的」）
      body:  '她说，雾里让路的东西认护符。',
      tags:  ['一章', '地点'],
      era:   'present',                  // 时代归属（用于权威性判定）
      // 阶段 1：**读**现有旗标（笔记是视图，旗标仍是运行时真值）
      grant: (p) => !!p.world.witch_hint,
      // 阶段 3 之后：写点搬到 addNote，grant 退化为兼容读取
      prereq: [],                        // 顺序敏感：必须先拿到这些笔记
    },
    // …
  },
};
```

**薄封装**（唯一入口，便于将来换实现）：`Sg.notes.has(id)` / `add(id)` / `all()` / `missing(req[])`。

**顺序敏感是硬约束**：对话常常「先问 A 才问得出 B」→ 笔记带 `prereq`，选择器按 (`req` 满足 ∧ `prereq` 已达成) 取**首个匹配**（first-match wins），优先级显式写在表里。纯集合模型会丢掉叙事顺序。

---

## 3. 条件语言（阶段 2–4）

段落/选项只写**数据**，不写 `if`：

```js
// 例：老巫女的合龙门（#291 G3 / #404 已实测过「前提必须可溯源」）
{ id: 'witch_fire', p: '老巫女',
  label: '问她：缺的那一句话，是谁没说完？',
  req:     ['note:n_failure_cause', { any: ['note:n_seer_asked', 'note:n_coord'] }],
  exclude: [],
  premise: '缺的从来不是咒',              // ← 既有门 test/premise-source.mjs 直接沿用
  yields:  'notes:n_witch_fire_hint' }
```

语法保持**极小**：`req`（全部满足）／`any`（任一）／`exclude`（全部不满足）／`prereq`／`premise`。**不引入脚本**——条件只做「是/否」，写点仍走既有词汇宏（`<<give>>`／`<<setflag>>`／将来的 `<<note>>`）。

---

## 4. 迁移五步（每步可独立合入、可回滚）

| 步 | 内容 | 出口判据（门） | 回滚点 |
|---|---|---|---|
| **1** | `Game.Notes` 表 ＋ `Sg.notes.*` 封装；**grant 读现有旗标**（零行为变化） | 全链绿；新增 `--notes` 门：笔记 ↔ 旗标一一对得上、`title/src/body` 非空 | 删表即回到今天 |
| **2** | 段落内 `<<if $pc.ev.X>>` → `<<if Sg.notes.has('n_X')>>`（**纯转发**） | 可见文案 diff **必须为 0**（`ui-migration-diff` 可证） | 单文件可逆 |
| **3** | 写点搬迁：`setflag X` → `Sg.notes.add('n_X')`（旗标降为兼容字段） | `--state` 域表更新；`saveload` 往返绿（笔记随档） | 保留双写一段时间 |
| **4** | 对话内容**按表组装**（选择器＋优先级），删段落内手写分支 | `premise-source`／`choice-keys`／`rules-claims` 全绿；新增「笔记→文案」覆盖门 | 按段落逐个切 |
| **5** | 清理兼容层（删旗标）＋ 手册/README 更新 | 裸旗标计数归零门 | 兼容层保留到确认 |

**节奏建议**：阶段 1–2 是纯机械迁移（可并行、风险最低），阶段 3 起才动**存档语义**（每步都必须跑 `saveload`＋`saveui`），阶段 4 才是真正的「内容重构」——**在没有阶段 1–3 的表与门之前，不要开始阶段 4**。

---

## 5. 候选分类（附：`pc.ev` 57 键 ／ `pc.world` 21 键）

> 分类是**人工判断**，下表是候选（`?`＝需确认）。规则：**知识**＝「玩家知道的事」；**世界态**＝「发生过的事」；**运行时**＝界面/瞬态。

### 5.1 知识候选（→ 笔记）

| 键 | 建议笔记 id | 来源（src） |
|---|---|---|
| `witch_hint` | `n_witch_hint` | 女巫小屋 |
| `flower_warned` | `n_flower_warned` | 守林人／哥布林 |
| `hall_hint`／`study_hint`／`ledger_hint`／`staff_hint` | `n_hall_hint` … | 失败档情报（#291 G2） |
| `failure_cause`／`seer_asked`／`coord`／`witch_fire_hint` | 同名 `n_*` | 书房日记／观星者／老巫女（G3/G4） |
| `keeper_told`／`keeper_kind`／`keeper_why` | `n_keeper_*` | 守林人 |
| `tav_*`（8 键） | `n_tav_*` | 酒馆六桌传闻（#217） |
| `wq_*`（7 键） | `n_wq_*` | 女巫小屋话题 |
| `forest_listen`／`forest_heard` | `n_forest_*` | 森林听雾 |
| `ritual_seen`／`old_witch`／`witch_gifted`／`observation_lock`／`star_short`／`delivery_short`／`mist_guard`／`staff_found`／`study_found`／`forge_seen`／`letter_seen` | 同名 `n_*` | 各处（待逐条确认是否属「知识」还是「世界态」） |

### 5.2 世界态（**保留**，不物品化）

`flower_fed`／`flower_taken`／`flower_mud`／`flower_sleep`／`goblin_spared`／`goblin_gone`／`whistle_taken`／`book_taken`／`hoard_looted`／`scroll_delivered`／`banquet_over`／`present_done`／`family_favor`／`fog_thin`／`rumor`／`ending`

### 5.3 运行时/瞬态（**保留**）

`fight`／`last_roll`／`last_result`／`soc`／`soc_last`／`soc_lever`／`threshold`／`errand_done`

---

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 组合爆炸（N 笔记枚举变体） | **first-match wins** ＋ 显式优先级；不做自动组合 |
| 顺序敏感被丢 | 笔记带 `prereq`；选择器校验「req 满足但 prereq 未达成」时**不显示** |
| 存档/跨周目语义 | 区分「本周目知道」vs「玩家永久知道」（`Sg.Codex` 已有 `clues` vs `endings/finals` 先例） |
| 门跟着形状变 | **先让门认新形状，再改内容**；每步出口判据写死在上表 |
| 作者成本 | 阶段 1–2 纯机械；阶段 4 逐段落切，可长期共存（新旧形状混用期就是迁移期） |
| 「知识 vs 世界态」误判 | 全部候选在阶段 1 的表里显式声明，`--notes` 门要求每条**都**有分类与来源，误判在表上可见 |

---

## 7. 开放问题（请在评审时给意见）

1. 笔记页是**并入图鉴**（`Sg.Codex` 已有 clues）还是**独立页**？（我倾向：数据同源、UI 独立入口）
2. 阶段 3 的「写点搬迁」要不要一次性完成，还是按章节分批？
3. `premise-source` 门要不要顺势升级成「前提词必须出现在**笔记正文**或授予旗标的段落源码里」？
4. 是否需要一道「消费可数」门（每条笔记的消费点数量下限），把「加了线索没人用」变成红灯？
