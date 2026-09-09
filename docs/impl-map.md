# sgstory 实施图（impl-map）——M1 骨架落地规范

> **状态**：v0.2（**M1a-2 已完成**）
> **定位**：`docs/game-outline.md`（玩法大纲）的**工程落地版**——把大纲翻译成**段落图 / 文件结构 / 状态模型 / 测试策略**。
> **权威关系**：实现细节稿。**与设定书冲突以设定书为准**；与大纲冲突以大纲为准。

---

## 0. M1 切片计划

| 切片 | 内容 | 验收 | 状态 |
|---|---|---|---|
| **M1a-1** | 实施图 + `audit.mjs` 去硬编码（文件发现式） | `npm test` 绿 | ✅ #127 |
| **M1a-2** | **原子换骨**：新 `src/**`（11 文件 / 60 内容段）+ 新状态模型 + 命题集 v1 锚句在位 + 测试套重写 | `npm test` 绿 · `npm run soak` 0 违法 | ✅ 本 PR |
| **M1b** | canon 门（`audit` 读设定书 §10 黑名单）+ 命题集增补 | 五门 + canon 门绿 | 待办 |
| **M1c** | 覆盖率 ratchet 收紧 + 场景矩阵扩展 | 覆盖率门 | 待办 |
| **M2–M5** | 逐章填真实文案（一章 → 二章 → 三章 → 终局） | 每章机检 + 场景测试 | 待办 |

> **为什么先做 M1a-1**：换骨必须与测试套重写**同一 PR**（否则 CI 红）。先把审计工具改成**文件发现式**，后续改名/拆文件不再牵动工具。

---

## 1. 文件结构（M1a-2 已落地）

```
src/
  00-meta.twee        StoryTitle / StoryData（起始段「开场」）
  10-core.twee        Rules[script] + StoryInit + Widgets[widget] + StoryCaption
  15-tables.twee      Game Tables[script]（Checks / Economy / Items / Truth /
                      Echoes / Choices / Systems / Shifts / Dragon）
  20-chargen.twee     Chargen Data[script]（3 轮）+ 车卡 / 角色卡
  30-ch1.twee         序章 + 一章（时间）：开场 · 酒馆 · 森林边缘 · 洞穴 · 女巫小屋 · 林间小径
  40-ch2.twee         二章（手段）：塔门 · 雾之魔物 · 守林人 · 门厅 · 书房 · 温室 · 工坊 · 天文台 · 顶楼
  50-ch3.twee         三章（坐标）：地下宴会厅 · 宴会·过去 · 观星者 · 老巫女 · 喂花 · 告知与告别 · 交付 · 唤醒 · 归位
  60-endings.twee     结局（10 个出口）
  70-codex.twee       设定集（hub + 三律 / 三家 / 道具 / 结局）
  80-script.twee      StoryScript（存档钩子 / S·L 快捷键）
  90-style.twee       StoryStyleSheet
```

**纪律**：`[script]` 段只出现在 `10-core` / `15-tables` / `20-chargen` / `80-script`；正文段只出现在 `30/40/50/60/70`。`audit.mjs` 与 `integrity.mjs` 均按**文件名排序**发现，不再硬编码路径。

**词汇宏（正文只经词汇引用机制）**：

| 宏 | 作用 | 表源 |
|---|---|---|
| `<<sitecheck 位点 [adv\|dis] [加值]>>` | 技能检定 / 豁免（`abil` 位点自动走 `<<save>>`） | `Game.Checks.sites` |
| `<<econ 事件>>` | 金币收支（含 `gives` 入账、烙印/技能折扣） | `Game.Economy` |
| `<<give "道具">>` / `<<setflag "旗标">>` | 物品栏 / 世界旗标 | `Game.Items.defs` |
| `<<flip>>` | 时代翻转（原地生效、位置决定年代、耗隐藏星力、回现在雾淡） | `Game.Shifts.anchors` |
| `<<damage N>>` | 受伤（药膏自动生效 +4、归零跳结局死亡） | — |
| `<<inventory>>` | 侧栏物品栏（由 `$pc.inv` 派生） | `Game.Items.defs` |

---

## 2. 状态模型（单一源 `Pc.defaults()`，25 键）

| 组 | 字段 | 说明 |
|---|---|---|
| 车卡 | `name` `round` `picked` `mode` `classKey/classLabel` `bgKey/bgLabel` `speciesKey/speciesLabel` `abilities` `skills` `feats` `gear` `flags` | **种族只改数值**（大纲 OQ2）；3 轮三选一 |
| 数值 | `hp` `max_hp` `gold` `salves` | d20 内核 |
| 时间 | `$era`（present/past） | **原地翻转、位置决定年代**（v16 §3.3） |
| 星力 | `star.charge` · `star.spent`（**玩家不可见**） | 唯一反馈＝从过去回来时「雾淡一些」（v16 §3.5） |
| 守林人 | `keeper.met` `keeper.trust` `keeper.state`(post/ally) `keeper.key` | 钥匙＝二章正常交涉即得（v16 §5.12） |
| 物品 | `inv`（对象：`{ 时光护符: true, … }`） | 拾到即入；**不集齐开锁**（v16 §5.0） |
| 证据 | `ev.*`（`mist_guard` `observation_lock` `keeper_why` `failure_cause` `star_ledger` `threshold` `coord` `letter_seen` …） | 真相链标记 |
| 龙 | `dragon.hp` `dragon.defeats` `dragon.awake` | 阈值触发战斗 |
| 世界 | `world.*`（`rumor` `goblin_spared` `witch_hint` `flower_fed` `whistle_blown` `seer_asked` `old_witch_told` `mist_fought` `scroll_delivered` `fog_thin` …） | 旗标（`Game.Echoes` 覆盖门管） |

**迁移**：所有新增字段必须过 `Pc.migrate()`（幂等补型 + 嵌套合并），否则旧档读入即崩。`test/fixtures/saves/` 5 版历史形状（v13 旧档 / 二章早期 / 型损 / 极简 / 药膏时代）逐版断言补齐·保值·修型·幂等。

---

## 3. 段落图（M1a-2 已落地，60 内容段）

### 基础设施
`StoryTitle` `StoryData` `StoryInit` `Widgets` `StoryCaption` `StoryScript` `StoryStyleSheet`

### 序章
`开场` → `车卡`（快速预设 / 逐轮细调 3 轮）→ `角色卡` → `酒馆`
`酒馆` → `森林边缘` / `女巫小屋` / `结局 平凡之路`

### 一章 · 时间
`森林边缘` → `洞穴`（哥布林：买路 / 动武 / 绕开）/ `女巫小屋`（**时光护符 + 请柬**）
`女巫小屋` → `林间小径`（翻转教学）→ `塔门` / `结局 银月之赐`

### 二章 · 手段
`塔门` → `雾之魔物`（→ `雾之魔物·战` / `雾之魔物·退`）→ `守林人`（`守林人·送` / `守林人·守`）→ **钥匙**
`守林人` → `门厅`（坏哨）→ `书房`（日记）→ `温室`（月光花）→ `工坊`（龙鳞护臂）→ `天文台`（观星者的书 / 碎镜片 / 星账）→ `顶楼`
`塔门` → `半途的林子` / `结局 半途`；`顶楼` → `结局 新任守林人` / `结局 焚塔者` / `结局 讨伐`

### 三章 · 坐标
`地下宴会厅`（现在：只有龙；`龙·巢边` 星名页 / 攻击）→ 翻转 → `宴会·过去`（hub）
`宴会·过去` → `观星者`（`观星者·星` / `观星者·夜` / `观星者·图` → **完整星图**）/ `老巫女`（`老巫女·跑` / `老巫女·换` → **好哨**，前提：已取图）/ `喂花` / `老妇人` / `告知与告别`（**卷轴**，前提：已取图）
回到现在 → `交付`（顶楼：卷轴 + 星图 → 守林人同行）→ `唤醒` → `归位` → `结局 送星归位`

### 终局（10 个出口）
真：`结局 送星归位`
降级：`结局 再度沉睡` / `结局 自愿的长眠`
非真：`结局 守林人击杀` / `结局 送入虚空` / `结局 劣化封印` / `结局 星落` / `结局 讨伐` / `结局 坠星之死` / `结局 死亡`
章节：`结局 平凡之路` / `结局 银月之赐` / `结局 半途` / `结局 新任守林人` / `结局 焚塔者`

---

## 4. 命题集 v1（`Game.Truth.claims`，12 条 · 锚句已机检在位）

每条**≥2 通路**，锚句在位（`audit --truth --check` 硬门）。

| id | 命题 | 通路 |
|---|---|---|
| `mist_is_fare` | 雾＝它睡着时漏出的星力（回家的路费） | 过去·观星者 / 现在·书房日记 / 现在·地下宴会厅 |
| `dragon_is_star` | 龙是迷路的星，不是恶龙——要做的不是讨伐，是送它回家 | 过去·观星者 / 过去·宴会老妇 / 现在·守林人 |
| `failure_cause` | 那一夜发不动＝烧的是它自己的力气，而它攒得还不够 | 过去·老巫女 / 现在·书房 / 现在·交付 |
| `observation_lock` | 能改的不是"历史"，是**没被观测过的那部分** | 过去·老巫女 / 现在·书房 |
| `keeper_is_alive` | 塔顶那位就是守林人本人——活人，持钥匙 | 现在·守林人 / 现在·顶楼 |
| `mist_is_guard` | 雾中的形＝陪着守林人的守卫；攻击旅人只是误认 | 现在·雾之魔物 / 现在·守林人 |
| `coordinate_source` | 坐标＝三百年前的完整星图（带回现在即可） | 过去·观星者 / 现在·交付 |
| `info_gate` | 没有星图 → 说服不了她停手 → 真结局线不成立 | 过去·老巫女 / 过去·告知与告别 |
| `no_seal` | 龙不是被封住的，只是睡着了；地下只有它 | 现在·地下宴会厅 / 现在·守林人 |
| `fare_is_hidden` | 那笔账没人算过；玩家也看不见数字 | 现在·天文台 / 真结局收束 |
| `homecoming_path` | 真结局＝坐标 + 卷轴 + 好哨 + 花 + 守林人同行 | 过去·告知与告别 / 现在·交付 |
| `farewell_letter` | 承杖先人写给观星者的信：它有名字，有家（观星者到死没拆） | 过去·观星者 / 现在·守林人 |

> M1b 将把设定书 §10 黑名单接入 `audit` 作 canon 门。

---

## 5. 测试策略（M1a-2 已重写）

| 文件 | 定位 | 现状 |
|---|---|---|
| `test/boot.mjs` | jsdom 启动 + 就绪轮询 + uncaught 监听 | 保留 |
| `test/render-all.mjs` | 全段落渲染（含 `$era` 双变体） | 保留（66 格） |
| `test/walker.mjs` | 随机游走 + 不变量 + **位点双支清扫** | 重写（`inv` 闭集 / `star.spent` / `keeper.state` / `dragon.hp`） |
| `test/integrity.mjs` | 段落图结构/死链/孤儿/宏拼写/词汇纪律 | 重写（`ERA_FILES` 由 `<<flip>>` 动态发现） |
| `test/rules.mjs` | d20 内核 + 车卡 3 轮 + `Pc.migrate` 矩阵 + 表契约（10 组） | 重写 |
| `test/properties.mjs` | 属性测试（判定边界全枚举 / 支配律 / 伤害界限 / 战斗伤害单调律 / 车卡形状律） | 重写 |
| `test/scenarios.mjs` | **19 条路线**（金路径 + 全部结局 + 设定集 + 龙巢边） | 重写 |
| `test/smoke.mjs` | 启动 → 快速车卡 → 酒馆 → 森林 → 洞穴 + 侧栏/存档/物品栏 | 重写 |
| `test/coverage.mjs` | 渲染/交互覆盖率 ratchet | 保留（基线重生成：渲染 66 / 交互 72） |

**机检五门**：`--truth` `--echoes` `--choices` `--systems` `--text` —— 契约不变，数据全部换新。

**当前规模**：`npm test` 全绿；`npm run soak`（游走 20+20 局 + 16 位点双支）0 违法。

---

## 6. 换骨顺序（M1a-2 实际执行）

1. `10-core`（`Rules` + `Pc` + Widgets）+ `15-tables`（`Game.*`）→ `audit --check` 可跑 ✅
2. `20-chargen`（3 轮 + 3 预设）→ `rules.mjs` 绿 ✅
3. `30/40/50/60` 段落图（正文 + 锚句）→ `render-all` + `integrity` 绿 ✅
4. `70-codex` + `80/90` → `smoke` 绿 ✅
5. `test/scenarios.mjs` 19 条路线 → 全绿 ✅
6. `npm run soak` → 0 违法 ✅
7. 重生成 `test/coverage-baseline.json` ✅

## 7. M1a-2 遗留（M1b/M1c/M2 接手）

| # | 项 | 归属 |
|---|---|---|
| 1 | canon 门（设定书 §10 黑名单 → `audit`） | M1b |
| 2 | 各楼层「过去 / 现在」正文分叉（当前仅塔门 / 天文台 / 地下宴会厅 / 交付 / 宴会·过去 分叉） | M2–M5 |
| 3 | 雾之魔物 / 守林人 的完整战斗数值（当前为机制性劝退：单挑必败） | M2 |
| 4 | `Game.Items.effects` 中 `龙鳞护臂` 的打造前置（工坊）已有；`守林人的杖` 终局归属待 M3 | M3 |
| 5 | 文本量目标（1.2–1.5 万字 / 60–80 段）——当前骨架 ≈2.9 万字含标注，正文待 M2–M5 充实 | M2–M5 |
| 6 | `npm run soak` 接回 CI | M1c |
