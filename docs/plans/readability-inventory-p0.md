# 可读性清册 · P0（首轮）

**依据**：`docs/plans/readability-decoupling-refactor.md` 的 **P0 节**（PR `#2046`，合于 `ead832e`）＋ 跟踪票 `#2047`。**实施支**：`dev`（main 的实时镜像）。
**本档的性质（须先读）**：这是 **P0 的「首轮」清册**，✗ **不宣称 P0 全量完成** ✓（方案档原文即如此限定）。**只增文档，✗ 改运行行为** ✓。

**✗ 本档不作为完成证明的三样**（照 P0 节原文）：**端口存在** ✗、**模型测试** ✗、**棘轮读数** ✗ —— 它们都不是「可读」的证明 ✓；本档能拿出的只是：**调用链、所有权、迁移登记、文件头自检** ＋ 逐条可定位的 **file:line** ✓。

**引注口径**：所有 `档:行` 均指 **`dev` 支**（本档写作时 `24df8b06` ✓）；行号会随后续提交漂移 ⇒ **引用时连同 sha** ✓（本仓已记过「引用漂了须人工判语义」的教训 ✓）。

---

## 1. 短调用链图（P0 验收：能指出**状态来源**与**提交点**）

### 链 A · 一次「返程结算」提交（`books#400` 片 3a ＋ `#444`）

```
入口（故事侧）  teleport.js：出边 action ⇒ BS.返程结算.返程事务({实例, 完成, 演出})
    ↓
域面（引擎面）  RPG.commitBoundary.preview({request, facts, apply})        core/33-commit.js:11（档头契约）/140
    │            · facts ＝ State.variables['sevenNames']（**活块**，✗ 副本）
    │            · 产出票据 {request, 前像, 计划}（纯数据 ✓）
    ↓
                RPG.commitBoundary.commit(ticket, {facts, publish})        core/33-commit.js:12
    │            ① 二次确认：当下 ≡ 前像（否则 COMMIT_STALE，零写 ✓）
    │            ② 一次落定 ＋ 记账（$rpgCommits，**窗口 200** ⇒ 去重只保最近）  core/33-commit.js:39
    │            ③ 写后回读（读不到 ⇒ COMMIT_LEDGER_FAILED 并**回滚** ✓）
    ↓
物品面（**边界之外**）  先做 ＋ **自带补偿**（背件 ⇒ reviveItem）⇒ 失败即复原并拒 ✓
    ↓
演出（publish）  失败 ⇒ 事实与账**仍在**（published:false）⇒ 调用方**只重绘** ✓
```
- **状态来源**：`State.variables['sevenNames']`（**活块** ✓）；**提交点**：`commitBoundary.commit()` ✓（③ 写后回读是它的原子边界 ✓）。
- **✗ 易读错的点**：`publish` 被当**演出**（吞异常、`status` 仍 `applied` ✓）⇒ **不可把领域副作用放进去** ✗（`#444` 的 RC 正是这条 ✓）；物品面**不属于**该边界（类实例过不了 `规整` ✓）。

### 链 B · 一次「武器攻击」（`sgstory#2043`／`#2044` 的按会话随机源）

```
入口          RPG.submitBattleAction(cmd, actor, 会话)          core/40-battle.js:981
    ↓         RPG.Battle.currentOf(会话)（✗ 给会话 ⇒ 全局 current）   core/40-battle.js:288
战斗           Battle#execute ⇒ 交互路 actCatching ⇒ 本场 this.源
    ↓
统一动作       RPG.act(actor, itemRef, target, action, from, 源)    core/30-inventory.js:509
    ↓         （原子提交：先跑动作 ⇒ 再提交 equipped／charges 回**快照**；拒 ⇒ 零变更 ✓）
件处理器       Item.used(that, from, action, 源)                    core/10-item.js:146
    ↓         件 used(that, from, 源 = null) ⇒ 转发 return（如 sword）  dnd/dnd3/items/sword.js:28
规则包         DND3.meleeAttack(…, 源) ⇒ DND3.d20(ctx, 源)          dnd/dnd3/00-init.js:110
    ↓
骰原语         RPG.rollDetail(expr, ctx, 源) ⇒ (源 ?? RPG.rng).pick(sides)   core/05-dice.js:88
    ↓
唯一读随机   unit()：按源归属记底层账（实例带 `会话` ⇒ 记进**该会话**）   core/05-dice.js（unit）+06-dice-control.js:235
    ↓
收尾         伤害/事件；战终清 `Battle.current`／`Battle.按会话` 登记 ✓
```
- **状态来源**：`actor.items`（**快照数组** ✓）＋ **随机源**（`源`；缺省＝全局 `RPG.rng` ✓）；**提交点**：`RPG.act` 的动作后提交 ✓（另一处在战斗收尾的登记清理 ✓）。
- **✗ 易读错的点**：`slot` 是**自由字符串**（规则包可扩展 ✓ `10-item.js:127-129`）⇒ ✗ 把「已用槽名」当封闭枚举 ✓；`equipped` 的写入面是**背包条目**（快照 ✓）⇒ ✗ 对 `reviveItem` 出来的实例改而不写回 ✓。

## 2. 所有权表（一个量一个写家）

| 状态 | 唯一写家（引擎面） | 存储 | 证据（`dev`） |
|---|---|---|---|
| 件身份号 | `RPG.newEntityId` / `noteEntityId`（高水位） | 件快照 `entityId` | `10-item.js:54/55/58` |
| 件状态载荷 | `normalizeItemState`（写侧过规整） | 件快照 `state`（**非空才写**） | `10-item.js:289`／`toJSON` `:165` |
| 背包内容 | `RPG.deposit`（**唯一实现**）／`give`／`take` | `$inventory`（玩家）／`actor.items` | `30-inventory.js:199`（`give` 归口） |
| 堆叠兼容 | `itemStateKey` / `stateCompatible` | 派生（✗ 不存） | `30-inventory.js:26/28` |
| 装备标记 | `slotEquip` / `slotUnequip`（动作面） | 件快照 `equipped` | `30-inventory.js:301` |
| 存档域（内置） | `80-save.js` 的 `DOMAINS` | `State.variables.<键>` | `80-save.js:88`（`domainTable`） |
| 存档域（故事登记） | `RPG.save.declareDomain` | 同上（`envelope().domains` 可见） | `80-save.js:43/89/197` |
| 提交账 | `commitBoundary`（`记账` + 剪枝） | `$rpgCommits`（**窗口 200**） | `33-commit.js:39` |
| 随机源·全局 | `RPG.rng.set/reset/setSequence` | `RPG.rng._impl`（**自有**可变状态） | `05-dice.js:70` |
| 随机源·会话实例 | `RPG.makeRng({会话})` | 实例 `_impl`／序列游标／`计数` | `05-dice.js:80` |
| 底层调用计数 | `diceControl._记底层(源)`（**按源归属**） | 会话账 `底层.调用` | `06-dice-control.js:235` |
| 用途化骰账 | `RPG.diceControl`（会话作用域） | 会话表（额度／骰序／底层三账分记） | `06-dice-control.js:97` |
| 当前战斗（官方） | `Battle#execute` 期间登记／收尾清 | `RPG.Battle.current` | `40-battle.js:404/495` |
| 当前战斗（按会话） | 同上（**有会话 ⇒ ✗ 碰全局**） | `RPG.Battle.按会话`（Map） | `40-battle.js:285/288` |
| 时间账 | **故事侧**（books `B.时钟`；引擎只提供托管面） | `babelRun.时间` | 跨仓，另见 books |

## 3. 迁移登记表（遗留适配与替代关系）

| 项 | 现状 | 位置（`dev`） |
|---|---|---|
| 旧名 `slotId` ⇒ `entityId` | **只活在读取边界**：`reviveItem` 与构造回落各认一次；活对象上**只写新名** | `10-item.js:109-115`／`:310` |
| 旧档无实体号 | `reviveItem` **当场补发**（逐件各发，✗ 按 `id`+`charges` 回退） | `10-item.js:302+` |
| 装备槽枚举 | **自由字符串**（规则包可扩展）＋ 显示名 `slotLabels[x] ?? x` 回落 | `10-item.js:127-129`／`30-inventory.js:368` |
| `slotEquip` 失败契约 | **有且仅有**两处 `return false`（不可装／异件占槽）；同件重装＝幂等成功 | `30-inventory.js:301-320` |
| `RNG_EXHAUSTED` | 注入序列耗尽**具名抛**（✗ 静默回退真随机）；现为**三载体**（全局／受控路径／`makeRng` 实例） | `05-dice.js` 的 `setSequence` |
| `dnd-5e`／`d20m` 两包 | **未**随 rng 接缝改签名 ⇒ 缺省＝全局源；覆盖账见 `#2044` | `#2044` 正文第五节 |
| 域登记 | 故事侧 `declareDomain`；内置键**不可覆盖** | `80-save.js:43` |
| 提交边界 | 二次确认 ＋ 近窗去重（**窗口** ✗ 绝对）＋ 写后回读 | `33-commit.js:11-12/39` |

## 4. 文件头自检（**首轮·关键词命中**，✗ 非结论）

★**读法**：下表是**脚本按关键词**扫各档「到首个非注释行为止」的头注（P0 的七项：职责／输入／输出／不变量／副作用／失败／遗留 ✓）。**命中 ≠ 合格**、**未命中 ≠ 失职**（措辞常不用这些词 ✓）⇒ 它是**人读复核的排期表** ✗ 不是判决 ✓。

（附录 B 同源生成，见下。）

| 档 | 职责 | 输入 | 输出 | 不变量 | 副作用 | 失败 | 遗留 |
|---|---|---|---|---|---|---|---|
| `00-namespace.js` | 50 | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `01-perform.js` | 71 | — | — | ✓ | ✓ | ✓ | — | ✓ |
| `02-choice.js` | 61 | — | — | ✓ | — | — | — | — |
| `05-dice.js` | 159 | — | — | — | ✓ | — | — | — |
| `06-dice-control.js` | 299 | — | — | ✓ | — | ✓ | — | ✓ |
| `08-regwarn.js` | 55 | — | — | — | — | ✓ | — | — |
| `10-item.js` | 354 | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `15-event.js` | 19 | — | ✓ | — | — | ✓ | — | — |
| `17-effect.js` | 147 | — | ✓ | ✓ | — | — | ✓ | — |
| `18-stock.js` | 239 | ✓ | — | — | ✓ | ✓ | ✓ | — |
| `20-character.js` | 369 | — | — | — | — | — | — | — |
| `30-inventory.js` | 683 | — | — | — | — | — | — | — |
| `32-exchange.js` | 43 | — | — | — | ✓ | — | ✓ | — |
| `33-commit.js` | 237 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `35-gather.js` | 86 | ✓ | — | — | ✓ | ✓ | ✓ | — |
| `36-build.js` | 192 | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `40-battle.js` | 988 | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| `41-chest.js` | 95 | — | — | — | — | — | — | — |
| `42-battle-intent.js` | 75 | — | — | — | — | ✓ | ✓ | ✓ |
| `43-battle-target-policy.js` | 36 | — | — | — | ✓ | — | — | — |
| `44-battle-resolve.js` | 59 | ✓ | — | ✓ | — | ✓ | ✓ | — |
| `45-battle-catalog.js` | 72 | — | ✓ | — | ✓ | ✓ | — | — |
| `45-pipeline.js` | 80 | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| `46-battle-repeat.js` | 60 | ✓ | — | — | — | — | — | ✓ |
| `47-outcome.js` | 84 | ✓ | ✓ | — | — | ✓ | — | — |
| `50-scene.js` | 86 | — | — | — | — | ✓ | — | — |
| `55-session.js` | 312 | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `60-map.js` | 383 | — | — | — | — | ✓ | — | — |
| `65-encounters.js` | 301 | ✓ | — | — | ✓ | ✓ | — | — |
| `70-ui.js` | 135 | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| `71-notice.js` | 186 | — | — | ✓ | — | ✓ | — | — |
| `72-panel.js` | 206 | ✓ | — | ✓ | — | ✓ | — | — |
| `80-save.js` | 428 | ✓ | — | — | — | ✓ | ✓ | — |

**首轮明显待读**（关键词**全未命中**且行数大 ⇒ 优先人读）：`30-inventory.js`（683 行 ✗ 七项全未命中）、`20-character.js`（369）、`41-chest.js`（95）、`02-choice.js`（61）✓ —— 前三者都是**高频入口**，值得优先补头注 ✓。

## 5. 未决与下一批（✗ 不越权）

- **本轮只做**：核心档（`src/core/**`）的短链、所有权、迁移登记与头注首轮自检 ✓。
- **下一批**（须另笔或续笔 ✓）：`src/host/**`（SugarCube 宿主面：存档面板／保留槽／DOM 面 ✓）、`src/dnd/dnd3/**`（规则包：件、战斗、检定、场景 ✓）、`stories/**` 与跨仓（books）侧的接缝 ✓。
- **未决**（照方案档 §未决 ✓，本档不擅自裁）：P1 起各阶段的**范围与次序**（方案档明写「阶段次序是建议，非版本承诺」✓）⇒ 由操作者与领队排期 ✓；本档只报现状 ✓。

---

## 附录 A · 公开 API 面（脚本生成：`RPG.<名>` ⇒ 档:行）

共 **171** 条（按档归组）：

| 档 | 条数 | 导出（名:行） |
|---|---|---|
| `01-perform.js` | 1 | `deferOutput`:38 |
| `05-dice.js` | 7 | `rng`:70、`makeRng`:80、`rollDetail`:88、`roll`:118、`checkRoll`:138、`rollKeepHighest`:148、`formatMod`:159 |
| `06-dice-control.js` | 1 | `diceControl`:97 |
| `08-regwarn.js` | 1 | `regWarn`:50 |
| `10-item.js` | 10 | `refuse`:40、`itemEntitySeq`:54、`newEntityId`:55、`noteEntityId`:58、`Item`:93、`registerItem`:181、`normalizeItemState`:289、`createItem`:291、`reviveItem`:298、`defItem`:339 |
| `15-event.js` | 1 | `Event`:7 |
| `17-effect.js` | 10 | `effectError`:23、`effectSplit`:26、`effectLevelOfId`:39、`Effect`:47、`Debuff`:57、`defEffect`:63、`effectSpec`:95、`resolveEffect`:133、`effectOf`:136、`death`:142 |
| `18-stock.js` | 10 | `stocks`:43、`isBattleScoped`:47、`stockError`:50、`defStock`:66、`stockOf`:123、`consumeStock`:134、`clearStocksScoped`:173、`isDerivedStock`:196、`heldTotal`:200、`syncDerivedStocks`:216 |
| `20-character.js` | 8 | `Character`:8、`isKnockedOut`:275、`actorRuntime`:278、`guard`:289、`applyDamage`:323、`reviveHooks`:340、`onReviveStats`:343、`defCharacter`:360 |
| `30-inventory.js` | 31 | `canStack`:20、`itemStateKey`:25、`stateCompatible`:27、`backfillItemIdentity`:84、`normalizeEquipped`:120、`deposit`:145、`splitStack`:179、`give`:199、`withdraw`:219、`take`:239、`ammoShort`:268、`has`:280、`isEquipped`:283、`equippedIn`:286、`equippedWeapon`:292、`slotEquip`:301、`slotUnequip`:332、`throwItem`:352、`slotLabels`:368、`loot`:374、`useItem`:410、`playerActor`:436、`equip`:441、`unequip`:444、`ammoOwed`:473、`ammoOwner`:489、`act`:509、`commit`:615、`toggleEquip`:633、`itemCountSuffix`:652、`inventoryLabel`:664 |
| `32-exchange.js` | 1 | `exchange`:5 |
| `33-commit.js` | 1 | `commitBoundary`:129 |
| `35-gather.js` | 2 | `gatherFrom`:32、`gather`:82 |
| `36-build.js` | 6 | `deliverYields`:30、`consumeRecipe`:77、`craftWith`:104、`buildEffects`:131、`registerBuild`:134、`buildAt`:152 |
| `40-battle.js` | 11 | `turnBoundary`:26、`BattleTurn`:57、`respawnHooks`:154、`layerMeta`:164、`registerLayerMeta`:167、`startLayerId`:180、`onRespawnClearEffects`:189、`respawnClearEffectsFallback`:197、`respawn`:217、`Battle`:282、`submitBattleAction`:981 |
| `41-chest.js` | 1 | `Chest`:15 |
| `42-battle-intent.js` | 1 | `unitId`:74 |
| `43-battle-target-policy.js` | 1 | `targetPolicy`:35 |
| `44-battle-resolve.js` | 1 | `actionResult`:32 |
| `45-battle-catalog.js` | 1 | `battleActions`:71 |
| `45-pipeline.js` | 5 | `pipelines`:19、`pipelineError`:22、`defPipeline`:29、`runPipeline`:60、`pipelineOf`:76 |
| `46-battle-repeat.js` | 1 | `repeat`:59 |
| `47-outcome.js` | 1 | `outcomeResolver`:47 |
| `50-scene.js` | 2 | `Scene`:18、`registerScene`:68 |
| `55-session.js` | 1 | `GameSession`:123 |
| `60-map.js` | 4 | `Location`:14、`Exit`:34、`WorldMap`:56、`MapScene`:273 |
| `65-encounters.js` | 15 | `encounterError`:30、`layerOf`:42、`layerType`:51、`layersOfType`:54、`gradientLayers`:65、`inGradient`:68、`layerOfLocation`:75、`encounterTables`:105、`validateEncounterTable`:111、`registerEncounterTable`:153、`validateEncounterRefs`:175、`pickWeighted`:198、`encounterTableOf`:229、`rollEncounter`:243、`rollLoot`:276 |
| `70-ui.js` | 7 | `itemAction`:26、`itemClick`:38、`itemRejectText`:70、`itemLink`:85、`inventoryLinks`:94、`bindItemLinks`:111、`__itemLinksBound`:130 |
| `71-notice.js` | 13 | `noticeChannels`:21、`defNotice`:30、`noticeChannel`:55、`noticeLimit`:65、`notices`:90、`pushNotice`:97、`clearNotices`:116、`setNoticeFilter`:130、`noticeAdmits`:137、`noticesHTML`:142、`noticeToggleHTML`:157、`bindNoticeUI`:167、`__noticeUIBound`:182 |
| `72-panel.js` | 15 | `panels`:28、`panelWriter`:34、`preservePanelState`:55、`registerPanel`:66、`panelHTML`:97、`panelRenderCount`:104、`panelRenderCounts`:107、`resetPanelCounts`:110、`refreshPanels`:124、`panelsInDomain`:146、`panelDomains`:149、`panelTint`:156、`panelCSS`:166、`meterText`:178、`refreshDomain`:198 |
| `80-save.js` | 1 | `save`:46 |

## 附录 B · 核心档清单（行数／头注行数）

| 档 | 行数 | 头注（到首个非注释行为止） |
|---|---|---|
| `00-namespace.js` | 50 | 9 |
| `01-perform.js` | 71 | 16 |
| `02-choice.js` | 61 | 11 |
| `05-dice.js` | 159 | 17 |
| `06-dice-control.js` | 299 | 44 |
| `08-regwarn.js` | 55 | 22 |
| `10-item.js` | 354 | 39 |
| `15-event.js` | 19 | 6 |
| `17-effect.js` | 147 | 22 |
| `18-stock.js` | 239 | 42 |
| `20-character.js` | 369 | 7 |
| `30-inventory.js` | 683 | 6 |
| `32-exchange.js` | 43 | 4 |
| `33-commit.js` | 237 | 36 |
| `35-gather.js` | 86 | 31 |
| `36-build.js` | 192 | 29 |
| `40-battle.js` | 988 | 25 |
| `41-chest.js` | 95 | 14 |
| `42-battle-intent.js` | 75 | 20 |
| `43-battle-target-policy.js` | 36 | 13 |
| `44-battle-resolve.js` | 59 | 18 |
| `45-battle-catalog.js` | 72 | 22 |
| `45-pipeline.js` | 80 | 18 |
| `46-battle-repeat.js` | 60 | 13 |
| `47-outcome.js` | 84 | 24 |
| `50-scene.js` | 86 | 17 |
| `55-session.js` | 312 | 24 |
| `60-map.js` | 383 | 13 |
| `65-encounters.js` | 301 | 29 |
| `70-ui.js` | 135 | 19 |
| `71-notice.js` | 186 | 20 |
| `72-panel.js` | 206 | 27 |
| `80-save.js` | 428 | 45 |
