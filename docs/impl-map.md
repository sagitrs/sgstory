# sgstory 实施图（impl-map）——M1 骨架落地规范

> **状态**：v0.1（M1a-1）
> **定位**：`docs/game-outline.md`（玩法大纲）的**工程落地版**——把大纲翻译成**段落图 / 文件结构 / 状态模型 / 测试策略**。
> **权威关系**：实现细节稿。**与设定书冲突以设定书为准**；与大纲冲突以大纲为准。

---

## 0. M1 切片计划

| 切片 | 内容 | 验收 |
|---|---|---|
| **M1a-1**（本 PR） | 实施图 + `audit.mjs` 去硬编码（文件发现式） | `npm test` 绿（旧内容不动） |
| **M1a-2** | **原子换骨**：新 `src/**` 骨架（占位文本）+ 新状态模型 + 新命题集 v1 + 测试套重写 | `npm test` 绿 · `npm run soak` 0 违法 |
| **M1b** | 命题集 v1 逐条锚句化（真相门全绿）+ canon 门（§10 黑名单） | 五门 + canon 门绿 |
| **M1c** | 场景测试重建（金路径 + 分支矩阵 + 覆盖率基线） | 覆盖率 ratchet |
| **M2–M5** | 逐章填内容（一章 → 二章 → 三章 → 终局） | 每章机检 + 场景测试 |

> **为什么先做 M1a-1**：换骨必须与测试套重写**同一 PR**（否则 CI 红）。先把审计工具改成**文件发现式**，后续改名/拆文件不再牵动工具。

---

## 1. 文件结构（M1a-2 目标）

```
src/
  00-meta.twee        StoryTitle / StoryData
  10-core.twee        StoryInit + Widgets + Rules + Pc（状态模型单一源）
  15-tables.twee      Game.*（Checks / Economy / Items / Tokens / Truth / Echoes /
                      Choices / Systems / Shifts / Dragon / Codex / Endings）
  20-chargen.twee     ChargenRounds / ChargenPresets / Chargen + 车卡段落
  30-ch1.twee         序章 + 一章（时间）
  40-ch2.twee         二章（手段）
  50-ch3.twee         三章（坐标）
  60-endings.twee     结局（14 个出口）
  70-codex.twee       设定集
  80-script.twee      StoryScript（存档钩子 / 快捷键）
  90-style.twee       StoryStyleSheet
```

**纪律**：`[script]` 段只出现在 `10-core` / `15-tables` / `20-chargen` / `80-script`；正文段只出现在 `30/40/50/60/70`。`audit.mjs` 按**文件名排序**发现，不再硬编码路径。

---

## 2. 状态模型（单一源 `Pc.defaults()`）

| 组 | 字段 | 说明 |
|---|---|---|
| 车卡 | `name` `classKey/classLabel` `bgKey/bgLabel` `speciesKey/speciesLabel` `abilities` `skills` `feats` `gear` `flags` | **种族只改数值**（大纲 OQ2） |
| 数值 | `hp` `max_hp` `gold` `salves` | d20 内核 |
| 时间 | `era`（present/past）· `flip.count` | **原地翻转、位置决定年代** |
| 星力 | `star.charge`（**隐藏**）· `star.spent` | 玩家不可见；唯一反馈＝从过去回来时"雾淡一些" |
| 守林人 | `keeper.met` `keeper.trust` `keeper.state`(post/ally/hostile/dead) `keeper.key` | 钥匙＝二章正常交涉即得 |
| 物品 | `inv`（对象：`{ 时光护符: true, 日记: 1, 月光花: 1, ... }`） | 拾到即入；**不集齐开锁** |
| 证据 | `ev.rule_a/rule_b` `ev.fee_a/fee_b/fee_c` `ev.coord` `ev.loop` | 真结局三条链 + 闭环 |
| 龙 | `dragon.hp` `dragon.defeats` `dragon.awake` | 阈值触发战斗 |
| 世界 | `rumor` `goblin_spared` `flower_fed` `whistle_blown` … | 旗标（`Game.Echoes` 覆盖门管） |

**迁移**：所有新增字段必须过 `Pc.migrate()`（幂等补型），否则旧档读入即崩。

---

## 3. 段落图（M1a-2 目标，≈45 段）

### 基础设施
`StoryTitle` `StoryInit` `Widgets` `StoryCaption` `StoryScript` `StoryStyleSheet` `设定集`（hub + 各条）

### 序章
`开场` → `车卡·职业` → `车卡·背景` → `车卡·种族` → `车卡·确认` → `角色卡` → `酒馆`
`酒馆` → `森林边缘` / `结局 平凡之路`

### 一章 · 时间
`森林边缘` → `洞穴`（哥布林，可和平）/ `女巫小屋`
`女巫小屋` → **交付时光护符** → `林间小径`（翻转教学）
`林间小径` → `塔门` / `结局 银月之赐`

### 二章 · 手段
`塔门` → `雾之魔物`（去守林人的路上）→ `守林人`（交涉 → **钥匙**）
`守林人` → `门厅`（坏哨）→ `书房`（日记）→ `工坊`（龙鳞护臂）→ `温室`（月光花）→ `天文台`（穹顶星图·现在少一角）→ `顶楼`
`顶楼` → **随守林人进大门 + 翻转** → `地下宴会厅`
分支：`结局 新任守林人` / `结局 焚塔者` / `结局 半途`；**杀守林人** → `keeper.state=dead`

### 三章 · 坐标
`地下宴会厅`（现在：只有龙）→ 翻转 → `宴会·过去`（hub）
`宴会·过去` → `观星者`（**取图**）/ `老巫女`（**换哨**，前提：已取图）/ `喂花` / `告知与告别`（**卷轴**，前提：已取图）
回到现在 → `交付`（现在·顶楼：卷轴 + 星图 → 守林人同行）→ `唤醒`（吹好哨）→ `归位`

### 终局（14 个出口）
真：`结局 送星归位`
降级：`结局 再度沉睡` / `结局 自愿的长眠`
非真：`结局 守林人击杀` / `结局 送入虚空` / `结局 劣化封印` / `结局 星落` / `结局 讨伐` / `结局 坠星之死`
章节：`结局 平凡之路` / `结局 银月之赐` / `结局 新任守林人` / `结局 焚塔者` / `结局 半途` / `结局 死亡`

---

## 4. 命题集 v1（`Game.Truth.claims` 草案）

每条**≥2 通路**，锚句在位（`audit --truth` 判据）。

| id | 命题 | 通路（时代） |
|---|---|---|
| `mist_is_fare` | 雾＝它睡着时漏出的星力（回家的路费） | 过去·观星者 / 现在·日记 / 现在·杖光自语 |
| `dragon_is_star` | 龙是迷路的星，不是恶龙——三百年前要做的不是讨伐，是送它回家 | 过去·观星者 / 过去·宴会老妇 / 现在·守林人 |
| `failure_cause` | 那一夜发不动＝烧的是它自己的力气，而它攒得还不够 | 过去·老巫女 / 现在·日记 / 现在·观星者的书 |
| `observation_lock` | 能改的不是"历史"，是**没被观测过的那部分**（她睡得怎么样） | 过去·老巫女 / 现在·日记 |
| `keeper_is_alive` | 塔顶那位就是守林人本人——活人，持钥匙，终局唯一能发动送行术的人 | 现在·守林人 / 现在·守林人自语 |
| `mist_is_guard` | 雾中的形＝雾聚成的守卫，在森林里陪着守林人；它攻击旅人只是误认 | 现在·雾之魔物 / 现在·守林人 |
| `mist_monster_info` | 与雾的一切交战全是信息差（可避免） | 现在·雾之魔物 / 现在·守林人 |
| `coordinate_source` | 坐标＝三百年前的完整星图（带回现在即可；星位三百年变化可忽略） | 过去·观星者 / 现在·交付 |
| `info_gate` | 没有星图 → 说服不了她停手 → 真结局线不成立 | 过去·老巫女 / 过去·告知与告别 |
| `no_seal` | 龙不是被封住的，只是睡着了；地下只有它 | 现在·地下宴会厅 / 现在·守林人 |
| `fare_is_hidden` | 那笔账没人算过；玩家也看不见数字 | 现在·杖光自语 / 真结局收束 |
| `homecoming_path` | 真结局＝坐标 + 卷轴 + 好哨 + 花 + 守林人同行 → 一起发动传送术 | 现在·交付 / 过去·告知与告别 |

> M1b 会把每条锚句逐字钉进对应段落源文，并把 `--truth --check` 转为硬门。

---

## 5. 测试策略（M1a-2 重写）

| 文件 | 定位 | 保留/重写 |
|---|---|---|
| `test/boot.mjs` | jsdom 启动 | **保留** |
| `test/render-all.mjs` | 全段落渲染（含 `$era` 双变体） | 保留（命名约定不变） |
| `test/walker.mjs` | 随机游走 + 不变量 + 双支覆盖 | 重写不变量与 `TOKEN_UNIVERSE` |
| `test/integrity.mjs` | 段落图结构/死链/孤儿/宏拼写 | 重写（图变了） |
| `test/rules.mjs` | d20 内核 + 新表函数 | 重写 |
| `test/properties.mjs` | 属性测试（检定单调性、伤害下限等） | 重写 |
| `test/scenarios.mjs` | 金路径 + 分支矩阵 | 重写（先金路径，M1c 补矩阵） |
| `test/smoke.mjs` | 启动 → 车卡 → 首章 → 侧栏 | 重写 |
| `test/coverage.mjs` | 渲染/交互覆盖率 ratchet | 保留（重生成基线） |

**机检五门**：`--truth` `--systems` `--echoes` `--choices` `--text` —— 契约不变，只换数据。

---

## 6. 换骨顺序（M1a-2 内部）

1. `10-core` + `15-tables`（状态模型 + 表）→ `node scripts/audit.mjs --check` 可跑
2. `20-chargen` → `test/rules.mjs` 绿
3. `30/40/50/60` 段落图（占位文本 + 锚句）→ `render-all` + `integrity` 绿
4. `70-codex` + `80/90` → `smoke` 绿
5. `test/scenarios.mjs` 金路径 → 全绿
6. `npm run soak` → 0 违法
7. 重生成 `test/coverage-baseline.json`
