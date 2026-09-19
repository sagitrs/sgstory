# 笔记模型 · 批次清单与全键作业单（伞 #422）

> 配套：`docs/notes-model.md`（设计稿：数据形状／条件语言／口诀／五步迁移）。
> 本文件是**认领者的作业单**：照表落条目即可，**不必自己判类**（判断有异议 → 走 `#432`）。
>
> **权威边界（单一权威源）**：**逐键判定（93 键）的唯一权威在本文件 §3**；`notes-model.md` §5 只留口径与对账，**不复述逐键表**。
> 旧版这里写「57 ＋ 21 ＝ 78 键」——`#432` 实测是 **93**（下详），已按复核结论整体重写。

---

## 1. 依赖图（谁等谁）

```
              #432 分类复核 ✅ 已出结论（14/14 confirm ＋ 半 A 11 行）
                        │ 被采纳的条目统一改表（= 本文件 §3）
                        ▼
#428 增量文件机制 ✅ ─┬─► #442 B0 一章补漏 ─┐
  （每批次一文件）    ├─► #429 B1 二章落表 ─┼─► #433 D 阶段2 纯转发（分批，漂移=0）
                      ├─► #430 B2 三章落表 ─┤            │
                      └─► #431 B3 跨章落表 ─┘            ▼
                                        #434 E 阶段3 写点搬迁（★同时间只允许一席）
                                                          │
                            #436 H 门与工具（--notes 审计门／消费可数门／diff 接计划）
                                                          ▼
                                        #435 F 阶段4 按表组装（prio＋死规则门）
                                                          ▼
                                                     #437 I 阶段5 清理兼容层
```

**并行度**
- **B 组四张（#442／#429／#430／#431）各自独占一个新建文件** ⇒ 可同时开工，零冲突；
- **必须串行**：#434（动存档语义，同时间一席）→ #435（依赖 #433/#434）→ #437；
- **横切**：#436 可在阶段 3 期间并行（`scripts/audit/**`、台账、计划）。

**批次口径**：批次是**并发单元**（一个文件、一席），不保证与叙事章严格对齐——旧作业单已把 `letter_seen`（写点在 `50-ch3`）放在 B1、把 `staff_hint`/`star_short`（写点在 `50-ch3`）放在 B1。本版**保留既有归属不再重划**，只在「批次」列标注写点所在章，避免二次 churn。

---

## 2. 增量文件机制（#428 ✓ 已合入）

条目按批次放进**独立增量文件**，靠加载顺序在 `Game.Notes` 上追加：

```twee
:: Game Notes 二章 [script]
// 只允许这一句形状：往已有表追加。禁止在增量文件里定义别的全局。
Object.assign((window.Game.Notes ??= { entries: {} }).entries, {
  n_failure_cause: { title: '日记里那行描过两遍的字', src: '书房', tags: ['二章', '书房'],
                     body: '最后一页写着：缺的从来不是咒。', era: window.Game.Era.PRESENT,
                     flagPath: 'ev.failure_cause' },
});
```

### 动手前先读（三条实测踩出来的，照抄可省一轮）

1. `[script]` 段里**没有局部 `Game`**（`15-tables` 的 `Game` 在 IIFE 内）⇒ 必须写 **`window.Game`**，并用 `(window.Game.Notes ??= { entries: {} }).entries` 兜底。直接写 `Game` → 全部 audit 门 0.0s 齐红（`ReferenceError: Game is not defined`）。
2. 时代字段必须 **`window.Game.Era.PRESENT`**——`--literals` 门（#318③）会拦字面量 `'present'`。
3. 新文件要**同时**进 `scripts/module-order.mjs` 的 `ORDER` 与 `MODULES`，且 **`defines: []`**（只追加键、不定义新全局）——**这一步统一做**，认领者不必改共同文件。

- 文件命名：`src/16-notes-<批>.twee`（B0=`ch1`／B1=`ch2`／B2=`ch3`／B3=`cross`）
- **`flagPath` 是唯一的数据接口**——表里**不得出现字面状态读**（`grant: (p) => !!p.ev.X` 会让 `--consequences` 判成叙事消费；阶段 1 实测红过）

---

## 3. 全键判定表（**93 键，唯一权威**）

### 3.0 判定基准

口诀 **a / b / c1 / c2 / d** 与两条边界、三类之外的两种形态 ⇒ 唯一权威在 `docs/notes-model.md` §1。本表只写**结果**，不重复判据。

**对账（`#432` §A-1）**：`pc.ev` / `pc.world` 静态键 **64 ＋ 23 ＝ 87**（`--state` 门可见）＋ 6 个**动态键**（`` <<firstTime `"tower_gate_" + $era`>> `` 这类模板写法，门**看不见**）＝ **93**。旧版「78」少了 15 个键。

### 3.1 逐键表

| 键 | flagPath | 口诀 | 结论 | 批次 | 来源（写点） | 备注 / 反例 |
|---|---|---|---|---|---|---|
| `tav_tips` | `ev.tav_tips` | a | 收 | 已落#426 | 酒馆·老板娘（5金买/社交） |  |
| `tav_fog` | `ev.tav_fog` | a | 收 | 已落#426 | 酒馆·老板娘 | 与 tav_tips 同一 apply 同授 |
| `tav_light` | `ev.tav_light` | a | 收 | 已落#426 | 井台 | `bookkeeping` 键——**零行为消费**，#436 消费门的已知基线 |
| `tav_iron` | `ev.tav_iron` | a | 收 | 已落#426 | 废哨站 | 同上 |
| `tav_seal` | `ev.tav_seal` | a | 收 | 已落#426 | 林缘空地 | 同上 |
| `tav_grudge` | `ev.tav_grudge` | a | 收 | 已落#426 | 酒馆 |  |
| `tav_ageless` | `ev.tav_ageless` | a | 收 | 已落#426 | 酒馆 |  |
| `tav_flower` | `ev.tav_flower` | a | 收 | 已落#426 | 酒馆 |  |
| `tav_dragon` | `ev.tav_dragon` | a | 收 | **B0** | 酒馆·上了年纪的村人 | §5「`tav_*`（8 键）」漏计的第 9 键 |
| `tav_keeper` | `ev.tav_keeper` | a | 收 | **B0** | 酒馆·讲守林人的那一桌 | 漏计第 10 键 |
| `tav_painting` | `ev.tav_painting` | a | 收 | **B0** | 酒馆·墙上那幅旧画 | 漏计第 11 键；有回声（看画→女巫小屋） |
| `tav_seen` | `ev.tav_seen` | c1 | 不收 | **B0** | 酒馆 | `<<firstTime>>` 首遇记账（边界②） |
| `wq_seen` | `ev.wq_seen` | a＋firstTime | 收 | 已落#426 | 女巫小屋 | **d 轻**：`<<if _first>>` 块同时含首遇叙述＋身世知识＋`<<give "时光护符">>`；表内须标注 firstTime（边界②） |
| `wq_night` | `ev.wq_night` | a | 收 | 已落#426 | 女巫小屋 |  |
| `wq_fog` | `ev.wq_fog` | a | 收 | 已落#426 | 女巫小屋 |  |
| `wq_alone` | `ev.wq_alone` | a | 收 | **B0** | 女巫小屋 | §5「`wq_*`（7 键）」漏计的键 |
| `wq_painting` | `ev.wq_painting` | a | 收 | **B0** | 女巫小屋 | 同上 |
| `wq_past` | `ev.wq_past` | a | 收 | **B0** | 女巫小屋 | 同上 |
| `wq_talisman` | `ev.wq_talisman` | a | 收 | **B0** | 女巫小屋 | 同上 |
| `wq_under` | `ev.wq_under` | a | 收 | **B0** | 女巫小屋 | 同上 |
| `wq_blessed` | `ev.wq_blessed` | b | 不收 | **B0** | 女巫小屋 | 一次疗伤/祝福＝发生过 |
| `forest_heard` | `ev.forest_heard` | a | 收 | 已落#426 | 森林边缘 |  |
| `forest_listen` | `ev.forest_listen` | b | 不收 | **B0** | 森林边缘 | **#432-B1**：§5.1 曾列知识候选 ↔ §1 自认世界态，文档内矛盾 |
| `witch_hint` | `world.witch_hint` | a | 收 | **B0** | 女巫小屋（8金买） | 原作业单未登记 |
| `rumor` | `world.rumor` | a | 收 | **B0** | 酒馆·老猎人（5金买） | **#432-B9**：§3.3 曾判「不收，改由 `n_tav_*` 覆盖」——不成立（全仓无 `tav_*` 承载此知识） |
| `mist_fought` | `world.mist_fought` | b | 不收 | **B0** | 雾之魔物 | 原作业单未登记 |
| `goblin_spared` | `world.goblin_spared` | b | 不收 | **B0** | 洞穴 | 原作业单未登记 |
| `goblin_gone` | `world.goblin_gone` | b | 不收 | **B0** | 洞穴 | 原作业单未登记 |
| `flower_fed` | `world.flower_fed` | b | 不收 | B2 | 喂花 | 世界态：把花喂给它＝发生过（不是知识） |
| `hall_hint` | `world.hall_hint` | a | 收 | B1 | 门厅（听人比过） |  |
| `hall_seen` | `ev.hall_seen` | a | 收 | B1 | 门厅（看钉成功） | **#432-B12**：与 `hall_hint` 是**同一知识两条路径** ⇒ 合并为一条笔记、两源 OR |
| `study_hint` | `world.study_hint` | a | 收 | B1 | 书房（敲墙/断代失败） |  |
| `study_found` | `ev.study_found` | d | **拆** | B1 | 书房 | **#432-B8**：①「知道暗格在哪」＝知识（并入 `study_hint` 那条笔记，两源 OR）②「取出匣子」＝世界态（不落笔记） |
| `ledger_hint` | `world.ledger_hint` | a | 收 | B1 | 天文台（典籍/光点失败） | 来源修正：原写「书房·账册」 |
| `failure_cause` | `ev.failure_cause` | a | 收 | B1 | 书房·日记 |  |
| `observation_lock` | `ev.observation_lock` | a | 收 | B1 | 书房·日记（往下读） | 来源修正：原写「天文台」 |
| `forge_seen` | `ev.forge_seen` | a | 收 | B1 | 工坊（识货/记号/铁匠） |  |
| `book_taken` | `world.book_taken` | b | 不收 | B1 | 天文台 |  |
| `delivery_short` | `ev.delivery_short` | c2 | 不收 | B1 | 顶楼 | **#432-B2**：§5.1 曾列知识候选 ↔ §1/§5.3 自认运行时，文档内矛盾 |
| `errand_done` | `ev.errand_done` | c1 | 不收 | B1 | 书房（过去·指错抄） |  |
| `present_done` | `world.present_done` | b | 不收 | B1 | 门厅 | 原作业单未登记 |
| `whistle_taken` | `world.whistle_taken` | b | 不收 | B1 | 门厅 | 原作业单未登记 |
| `flower_taken` | `world.flower_taken` | b | 不收 | B1 | 塔外花田 | 原作业单未登记 |
| `flower_mud` | `world.flower_mud` | b | 不收 | B1 | 塔外花田 | 原作业单未登记 |
| `flower_sleep` | `world.flower_sleep` | b | 不收 | B1 | 塔外花田 | 原作业单未登记 |
| `tower_top_intro` | `ev.tower_top_intro` | c1 | 不收 | B1 | 顶楼 | 原作业单未登记；`<<if _first>>` 块含守林人那句「守的从来不是悔恨」——**该知识由 `keeper_why` 承载，勿被去重器吃掉**（边界②） |
| `observatory_intro` | `ev.observatory_intro` | c1 | 不收 | B1 | 天文台 | 原作业单未登记 |
| `forge_thanks` | `ev.forge_thanks` | c1 | 不收 | B1 | 守林人（带话） | 原作业单未登记 |
| `tower_gate_present` | `ev.tower_gate_present` | c1 | 不收 | B1 | 塔门 | **动态键**：`<<firstTime \`"tower_gate_" + $era\`>>`，`--state` 门看不见（#432-A2） |
| `tower_gate_past` | `ev.tower_gate_past` | c1 | 不收 | B1 | 塔门 | 同上 |
| `forge_present` | `ev.forge_present` | c1 | 不收 | B1 | 工坊 | **动态键**（#432-A2） |
| `forge_past` | `ev.forge_past` | c1 | 不收 | B1 | 工坊 | **动态键**（#432-A2） |
| `keeper_told` | `ev.keeper_told` | a | 收 | B2 | 守林人（问来历） |  |
| `keeper_kind` | `ev.keeper_kind` | b | 不收 | B2 | 守林人（立场） | **#432-B7**：读点是 NPC 回忆**你说过的话**，写不成「你知道了……」 |
| `keeper_why` | `ev.keeper_why` | a | 收 | B2 | 守林人·守 |  |
| `keeper_intro` | `ev.keeper_intro` | c1 | 不收 | B2 | 守林人 | 原作业单未登记 |
| `seer_asked` | `ev.seer_asked` | b | 不收 | B2 | 观星者 | **半 A 异议**：它是**证据旗标**（#365），记的是「问过」这件**事** ⇒ b。半 A 原判 a=知识，经 #432 复核收敛为 b |
| `seer_asked_star` | `ev.seer_asked_star` | c1 | 不收 | B2 | 观星者·星 | **半 A 异议**：c1 交互记账（#365「这一问只给一次」） |
| `seer_asked_night` | `ev.seer_asked_night` | c1 | 不收 | B2 | 观星者·图 | 同上 |
| `seer_gave` | `ev.seer_gave` | b | 不收 | B2 | 观星者 | 原作业单未登记；他答应/抄过＝发生过 |
| `seer_intro` | `ev.seer_intro` | c1 | 不收 | B2 | 观星者 | 原作业单未登记 |
| `coord` | `—` | — | **不落笔记** | B2 | 观星者·图 | **#432-B11**：`coord ≡ inv["完整星图"]`（两处写点都与 `<<give "完整星图">>` 同行）⇒ **持有物投影**，三类之外。半 A 原判 b，经复核采纳本条 |
| `star_ledger` | `ev.star_ledger` | a | 收 | B2 | 天文台（典籍/光点） |  |
| `star_short` | `ev.star_short` | c2 | 不收 | B2 | 唤醒（星力不足） | **#432-B3**：§5.1 曾列知识候选 ↔ §1 自认运行时 |
| `witch_fire_hint` | `ev.witch_fire_hint` | a | 收 | B2 | 老巫女（合龙门） | 前提可溯源由 `premise-source` 门另管（内容问题，与分类无关） |
| `witch_gifted` | `ev.witch_gifted` | b | 不收 | B2 | 当时的女巫（赠花） | **#432-B5**：写点与 `delete inv["月光花"]` 同行 |
| `witch_grip` | `ev.witch_grip` | a | 收 | B2 | 当时的女巫（看哨） | 原作业单未登记 |
| `witch_intro` | `ev.witch_intro` | c1 | 不收 | B2 | 当时的女巫 | 原作业单未登记 |
| `old_witch` | `ev.old_witch` | a | 收 | B2 | 老巫女 |  |
| `ritual_seen` | `ev.ritual_seen` | c1 | 不收 | B2 | 宴·仪式 | **#432-B6**：唯一行为读点是复访去重、写点无条件置位 |
| `mist_guard` | `ev.mist_guard` | d | **拆** | B2 | 雾之魔物·退 | **#432-B15 ＋ 半 A**：知识＝`n_mist_is_guard`（「雾中的形是守卫」）／世界态＝`world.mist_yielded`（「雾让过路」） |
| `banquet_intro` | `ev.banquet_intro` | c1 | 不收 | B2 | 宴会·过去 | 原作业单未登记 |
| `banquet_over` | `world.banquet_over` | b | 不收 | B2 | 宴·散场 | `bookkeeping`（复访文案由 `ritual_seen` 驱动） |
| `staff_found` | `ev.staff_found` | b | 不收 | B2 | 寻杖 | **#432-B4**：§5.1 曾列知识候选 ↔ §3.1 判 b，文档内矛盾 |
| `staff_hint` | `world.staff_hint` | a | 收 | B2 | 寻杖（问孩子/看人失败） |  |
| `family_favor` | `world.family_favor` | b | 不收 | B2 | 寻杖 |  |
| `letter_seen` | `ev.letter_seen` | a | 收 | B2 | 观星者（夹着的信） | **批次修正**：原作业单列 B1，来源写「书房·信」；实际写点在 `50-ch3.twee:观星者` |
| `scroll_delivered` | `world.scroll_delivered` | b | 不收 | B2 | 交付 | 原作业单未登记 |
| `hoard_looted` | `world.hoard_looted` | b | 不收 | B2 | 龙·巢边 | 原作业单未登记 |
| `whistle_blown` | `world.whistle_blown` | b | 不收 | B2 | 唤醒 | 原作业单未登记 |
| `fog_thin` | `world.fog_thin` | b | 不收 | B2 | flip widget / 宴·散场 | **#432-B10**：跨翻转持久＋被 flip 复位 ⇒ 不在「同一次交互内」；§5.2 世界态 ／ §3.3 c 两处口径曾不一致 |
| `ending` | `ev.ending` | b | 不收 | B2 | `<<ending>>` 宏（10 处） | 原作业单未登记 |
| `threshold` | `ev.threshold` | c2 | 不收 | B2 | 地下宴会厅 |  |
| `below_seen` | `ev.below_seen` | a（derived） | 收 | 已落#439 | 地下宴会厅 | **#432-B14**：知识由世界态蕴含（「下过地下即见过它」）⇒ 表内标 `derived` |
| `cellar_present` | `ev.cellar_present` | c1 | 不收 | B2 | 地下宴会厅 | **动态键**（#432-A2）；且**若被 `--state` 门看见即红**（`cellar_` 不在任何域前缀里） |
| `cellar_past` | `ev.cellar_past` | c1 | 不收 | B2 | 地下宴会厅 | 同上 |
| `fight` | `ev.fight` | c2 | 不收 | B3 | 战斗 widget | 战斗台账 |
| `last_result` | `ev.last_result` | c2 | 不收 | B3 | 结果槽 widget |  |
| `last_roll` | `ev.last_roll` | c2 | 不收 | B3 | 骰面快照 |  |
| `soc` | `ev.soc` | c2 | 不收 | B3 | 交涉 widget |  |
| `soc_last` | `ev.soc_last` | c2 | 不收 | B3 | 交涉回显 |  |
| `soc_lever` | `ev.soc_lever` | c2 | 不收 | B3 | 优势筹码 |  |
| `flower_warned` | `world.flower_warned` | a | 收 | 已落#426 | 守林人／塔外花田 | 跨章（一章末—二章）保命知识 |

> **口径说明**
> - **「不收」不是遗漏**——它们按口诀归世界态/运行时，本就不该进笔记；写在这里是为了让认领者**不必自己重判**。
> - **同源合并**：`hall_hint`／`hall_seen` 是同一知识的两条获取路径（看钉成功 vs 失败听人比过）⇒ **一条笔记、两源 OR**（`#432-B12`）；`study_hint`／`study_found` 的知识面同理（`#432-B8`）。
> - **拆键对照**：`study_found` → 知识并入「暗格位置」那条笔记 ＋ 世界态「已取出」（不收）；`mist_guard` → `n_mist_is_guard`（知识，收）＋ `world.mist_yielded`（世界态，不收）。
> - **`derived`**：`below_seen` 的知识由世界态蕴含 ⇒ 收，但表内标 `derived`（`#432-B14`）。
> - **`firstTime` 单列**：`tav_seen`／`wq_seen`／`*_intro`／`tower_gate_*`／`forge_*`／`cellar_*` 默认 `c1`；**承载了知识的必须在表里另外声明**（`wq_seen` 另给笔记；`tower_top_intro` 那句由 `keeper_why` 承载）。
> - **批次列**：`B0`/`B1`/`B2`/`B3` ＝ 待落；`已落#426`/`已落#439` ＝ 已在 main。

### 3.2 批次汇总

| 批次 | 文件（独占） | 收 | 不收 | 拆/其他 | 本批要落的 id |
|---|---|---|---|---|---|
| B0 一章补漏（#442） | `stories/mist-forest/16-notes-ch1.twee` | 10 | 6 | 0 | `tav_dragon`／`tav_keeper`／`tav_painting`／`wq_alone`／`wq_painting`／`wq_past`／`wq_talisman`／`wq_under`／`witch_hint`／`rumor` | <!-- path-exempt: 该故事已按 #1004 删除（历史记录，不抹）-->
| B1 二章（#429） | `stories/mist-forest/16-notes-ch2.twee` | 7 | 15 | 1 | `hall_hint`／`hall_seen`／`study_hint`／`ledger_hint`／`failure_cause`／`observation_lock`／`forge_seen` | <!-- path-exempt: 该故事已按 #1004 删除（历史记录，不抹）-->
| B2 三章（#430） | `stories/mist-forest/16-notes-ch3.twee` | 8 | 24 | 2 | `keeper_told`／`keeper_why`／`star_ledger`／`witch_fire_hint`／`witch_grip`／`old_witch`／`staff_hint`／`letter_seen` | <!-- path-exempt: 该故事已按 #1004 删除（历史记录，不抹）-->
| B3 跨章/展示层（#431） | `stories/mist-forest/16-notes-cross.twee` | 0 | 6 | 0 | — | <!-- path-exempt: 该故事已按 #1004 删除（历史记录，不抹）-->
| 阶段 1（#426）已落 | `stories/mist-forest/15-tables.twee`（`Game.Notes` 域） | 13 | 0 | 0 | `tav_tips`／`tav_fog`／`tav_light`／`tav_iron`／`tav_seal`／`tav_grudge`／`tav_ageless`／`tav_flower`／`wq_seen`／`wq_night`／`wq_fog`／`forest_heard`／`flower_warned` | <!-- path-exempt: 该故事已按 #1004 删除（历史记录，不抹）-->
| B3 机制样板（#439）已落 | `stories/mist-forest/16-notes-cross.twee` | 1 | 0 | 0 | `below_seen` | <!-- path-exempt: 该故事已按 #1004 删除（历史记录，不抹）-->

---

## 4. 出口判据（所有 B 组批次统一）

```bash
node scripts/audit.mjs --notes --check   # 形状/对齐 ＋ 接入契约 ＋ **消费可数**（#436：已升级为 audit 门，可单跑）
node scripts/audit.mjs --state --check   # flagPath 的键必须登记在状态契约域里
node scripts/audit.mjs --state --check   # 新引用没破坏状态契约
npm test                                 # 全链（改门后跑 npm run report:gates:update）
```

PR 里贴两样：**① 本批分类判断表**（每条：知识/世界态/运行时 ＋ 口诀 a/b/c1/c2/d 哪一条）；**② 若做了拆键**，旧键 → 新键对照。

---

## 5. 本版相对旧版的变更（`#432` 采纳清单，便于 review）

| # | 变更 | 来源 |
|---|---|---|
| 1 | 键数 78 → **93**；补 15 个键的逐键行（`tav_*` 12 实为…／6 个动态键／12 个原无行） | `#432` §A-1／§A-3 |
| 2 | 口诀 `c` 拆 **`c1` 交互记账 ／ `c2` 瞬态**；新增**边界①**（c＝不改世界结果，不是「同一次渲染内」）与**边界②**（`firstTime` 单列） | `#432` §B ＋ 半 A 元观察 |
| 3 | **三类之外**：持有物投影（`coord`）不落笔记；推定知识（`below_seen`）标 `derived` | `#432-B11`／`B14` |
| 4 | 14 条判定异议全部 confirm：`forest_listen`→b、`delivery_short`/`star_short`→c2、`staff_found`/`witch_gifted`/`keeper_kind`→b、`ritual_seen`→c1、`study_found`→拆、`rumor`→收、`fog_thin`→b、`coord`→不落、`hall_seen`→收＋合并、`wq_seen`→收＋标注、`below_seen`→收＋`derived` | `#432`（作者侧）＋ 14/14 confirm |
| 5 | 半 A 采纳：`seer_asked`→b、`seer_asked_star`/`_night`→c1、`tav_seen`→c1（原判 b，按边界②收敛）、`mist_guard` 拆键命名 | 半 A（`#422`） |
| 6 | 修正 3 处**来源**错（`ledger_hint` 书房·账册→天文台／`observation_lock` 天文台→书房／`letter_seen` 书房·信→观星者） | `#432` §A-3 |
| 7 | ~~记入**门盲区**：`--state` 门只看字面量键，6 个动态键隐身~~ → **已修（`#436-c①`）**：改为 `Game.State.dynamicKeys` 声明族 ＋ 展开入键图 ＋「未覆盖／僵尸声明」双向判据；门现报 **93** 键（87＋6） | `#432` §A-2 → `#436` |
| 8 | 记入**已知基线**：`tav_light`/`tav_iron`/`tav_seal` 是 `bookkeeping`（零消费）却已收成笔记 → `#436` 消费可数门的基线 | `#432` §C |
