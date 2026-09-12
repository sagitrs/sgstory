# 笔记模型 · 批次清单与依赖图（伞 #422）

> 配套：`docs/notes-model.md`（设计稿）／子票 #428–#437。
> 本文件是**认领者的作业单**：照表落条目即可，不必自己判类（判断有异议→ 走 #432）。

---

## 1. 依赖图（谁等谁）

```
                    #432 分类复核（纯判断，无依赖，可立即开工）
                              │（结论回帖到 #422，被采纳者由后续批次修表）
                              ▼
#428 增量文件机制 ──┬──► #429 B1 二章落表 ──┐
  （先落，解并发）  ├──► #430 B2 三章落表 ──┼──► #433 D 阶段2 纯转发（分批，漂移=0）
                    └──► #431 B3 跨章/设定集 ┘              │
                                                            ▼
                                          #434 E 阶段3 写点搬迁（★同时间只允许一席）
                                                            │
                              #436 H 门与工具（--notes 审计门／消费可数门／diff 接计划）
                                                            ▼
                                          #435 F 阶段4 按表组装（prio＋死规则门）
                                                            │
                                                            ▼
                                                       #437 I 阶段5 清理兼容层
```

**并行度**
- **可立即并行**：#432（无依赖、纯判断）｜#428 → 完成后 **#429/#430/#431 三张可同时开工**（各自新建自己的增量文件，零冲突）
- **必须串行**：#434（动存档语义，同时间一席）→ #435（依赖 #433/#434）→ #437
- **横切**：#436 可在阶段 3 期间并行（它改的是 `scripts/audit/**`、台账、计划——dev 的域）

---

## 2. #428 的机制（认领 B 组前先读）

条目按批次放进**独立增量文件**，靠加载顺序在 `Game.Notes` 上追加：

```twee
:: Game Notes 二章 [script]
// 只允许这一句形状：往已有表追加。禁止在增量文件里定义别的全局。
Object.assign(window.Game.Notes.entries, {
  n_study_diary: { title: '日记里那行描过两遍的字', src: '书房', tags: ['二章', '书房'],
                   body: '最后一页写着：缺的从来不是咒。', era: 'present',
                   flagPath: 'ev.failure_cause' },
});
```

- 文件命名：`src/16-notes-<批>.twee`（B1=`ch2`／B2=`ch3`／B3=`cross`）
- **`flagPath` 是唯一的数据接口**（表里不得出现字面状态读——见 #435 的那道门）
- 加载顺序声明在 `scripts/module-order.mjs`（**dev 的域**，一行；#428 落地时由 dev 加或他点头我加）

---

## 3. 批次清单（按权威状态域表分派）

### 3.1 B1 二章 → `src/16-notes-ch2.twee`（#429）

| 建议 id | flagPath | 来源 | 口诀 | 备注 |
|---|---|---|---|---|
| `n_hall_hint` | `world.hall_hint` | 门厅（失败档情报） | a | #291 G2 产出 |
| `n_study_hint` | `world.study_hint` | 书房 | a | 同上 |
| `n_ledger_hint` | `world.ledger_hint` | 书房·账册 | a | 同上 |
| `n_staff_hint` | `world.staff_hint` | 寻杖 | a | 同上 |
| `n_failure_cause` | `ev.failure_cause` | 书房·日记 | a | 合龙门前提（#404） |
| `n_study_found` | `ev.study_found` | 书房·暗格 | b | 已拥有/已寻得→世界态，**不收**（若你要收，必须写成「你知道暗格在哪」的 a 式句子） |
| `n_forge_seen` | `ev.forge_seen` | 工坊·记号 | a | 「这甲是给守林人打的」可复述 |
| `n_letter_seen` | `ev.letter_seen` | 书房·信 | a | |
| `n_observation_lock` | `ev.observation_lock` | 天文台 | a | canon「能改的只有没被观测过的那部分」可复述 |
| `n_book_source` | `world.book_taken` | 天文台 | b | 世界态（取走了书）**不收**；知识面另有 `observatory_*` 时再收 |
| `n_staff_found` | `ev.staff_found` | 寻杖 | b | **世界态不收**（找到了杖本身） |
| `n_delivery_short` | `ev.delivery_short` | 交付 | c | **运行时不收**（这一次差件提示） |
| `n_star_short` | `ev.star_short` | 唤醒 | c | **运行时不收**（这一次星力不足提示） |

### 3.2 B2 三章 → `src/16-notes-ch3.twee`（#430）

| 建议 id | flagPath | 来源 | 口诀 | 备注 |
|---|---|---|---|---|
| `n_keeper_told` | `ev.keeper_told` | 守林人 | a | 问过来历 |
| `n_keeper_kind` | `ev.keeper_kind` | 守林人（立场） | a | 「它不会变成恶龙」那句被记住 |
| `n_keeper_why` | `ev.keeper_why` | 守林人 | a | |
| `n_seer_asked_star` | `ev.seer_asked_star` | 观星者·星 | a | 问答各自管门（#365 实锤） |
| `n_seer_asked_night` | `ev.seer_asked_night` | 观星者·夜 | a | 同上 |
| `n_seer_asked` | `ev.seer_asked` | 观星者（证据） | a | **证据旗标**（非 UI 门），保留 |
| `n_coord` | `ev.coord` | 观星者 | a | 坐标那一半 |
| `n_star_ledger` | `ev.star_ledger` | 天文台/观星者 | a | |
| `n_witch_fire_hint` | `ev.witch_fire_hint` | 老巫女（合龙门） | a | 前提可溯源已由 `premise-source` 门守 |
| `n_old_witch` | `ev.old_witch` | 宴会·老巫女 | a | |
| `n_ritual_seen` | `ev.ritual_seen` | 宴·仪式 | a | |
| `n_banquet_over` | `world.banquet_over` | 宴·散场 | b | 世界态**不收** |
| `n_witch_gifted` | `ev.witch_gifted` | 当时的女巫（赠礼） | b | 世界态**不收**（把花送出去了） |
| `n_mist_guard` | `ev.mist_guard` | 雾之魔物 | **d 拆** | 「雾是守卫」→知识；「雾让过路」→世界态 |
| `n_family_favor` | `world.family_favor` | 守林人家 | b | 世界态（人情记账）**不收** |

### 3.3 B3 跨章/设定集 → `src/16-notes-cross.twee`（#431）

| 建议 id | flagPath | 来源 | 口诀 | 备注 |
|---|---|---|---|---|
| `n_flower_warned` | `world.flower_warned` | 守林人/哥布林 | a | **已在阶段 1 落表**（本批不重复，列此备查） |
| `n_flower_fed` | `world.flower_fed` | 喂花 | b | 世界态**不收** |
| `n_fog_thin` | `world.fog_thin` | 翻转回现在 | c | 现象层瞬态**不收**（#291 G1 是文案不是知识） |
| `n_goblin_spared` | `world.goblin_spared` | 洞穴 | b | 世界态**不收** |
| `n_goblin_gone` | `world.goblin_gone` | 洞穴动武 | b | 同上 |
| `n_rumor` | `world.rumor` | 酒馆（老猎人） | a | 老猎人的话（阶段 1 已收部分 tav_*，本条为世界态副本→**建议不收**，改由 `n_tav_*` 覆盖） |
| `n_threshold` | `ev.threshold` | 地下宴会厅 | c | 运行时（本次阈值提示）**不收** |
| `n_errand_done` | `ev.errand_done` | 工坊跑腿 | b | 世界态**不收** |
| `n_below_seen` | `ev.below_seen` | 地下 | a | 「地下只有一条龙」可复述 |

> 说明：**「不收」不是遗漏**——它们按口诀归世界态/运行时，本就不该进笔记；写在这里是为了让认领者**不必自己重判**（有异议 → #432）。

---

## 4. 出口判据（所有 B 组批次统一）

```bash
node test/notes-model.mjs          # 字段齐全 ＋ flagPath 已登记 ＋ 空状态不为真
node scripts/audit.mjs --state --check   # 新引用没破坏状态契约
npm test                            # 全链（含 F2 台账；改门后跑 report:gates:update）
```
并在 PR 里贴两样：**① 本批分类判断表**（每条：知识/世界态/运行时 ＋ 口诀哪一条）；**② 若做了拆键**，旧键→新键对照（如 `mist_guard`）。
