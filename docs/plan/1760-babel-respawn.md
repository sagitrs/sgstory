# 巴别 respawn S1 —— 死亡 / 失败 / 重来流程（设计稿）

> **⚠ 裁定回填（2026-09-30，领队 `temp-guest-1`）**：§六 四问已裁——① **砍 `respawnPending`**（只搬 `current`；「待处理」由 `death` 标记这一**单一状态源**承载）② `to` **留形不留实现**（候 `#1733`）③ `loot` 文案采本席案：**后续义务**加 `opts.silent` ④ **`hp = maxHp`**（与裁定⑤同源）。两设计选择（订阅形接线／顺序三理由）**均准**，其中「HP 先于 `moveTo`」**并入判据 1**；§七 六刀面**收**。

> Issue: `#1760`（伞 `#1728` 公共面①）｜状态：**设计稿（不落码）**
> 基线：`main` @ 写稿时点（引擎读数逐条实取，行号见各节）
> **信源**：伞 `#1728` 死亡面**七裁定**（`sagitrs-tester-4` 著的分析 ＋ 领队 `temp-guest-1` 裁定评论）
> **本文档的地位**：按 `#1750` 根因①的新裁定——**判定行为须同步设计文档并引信源**；respawn 的全灭分支接线即判定行为，本稿为其**首例标本**（每条裁定 → 落形 → 可判断据三列对齐）。

---

## 〇、七裁定 → 落形 → 可判断据（总表）

| # | 裁定（伞面） | 本笔落形 | 可判断据 |
|---|---|---|---|
| ① | 命名采 **`RPG.respawn`**（避 `revive` 快照还原同形异义） | 新增 `RPG.respawn(character, { to })` | 命名唯一性：全仓 `respawn` 仅此一处（`grep`）；`revive` 语义不动 |
| ② | **回最深处**（第 1 层苏醒地）；`WorldMap.current` 纯 id **零改** | 目标层取自**层元数据契约的 `start: true`**（`#1748` 已钉，**不另立权威**） | 战后 `map.current === startLayerId`；`current` 仍是**纯字符串 id** |
| ③ | **掉未装备物**——复用 `RPG.loot` 既有语义（「物品掉、装备不掉」） | 玩家战败走**与敌人战败同一函数** `RPG.loot`（现落点 `40-battle.js:174` 的敌方分支同源） | 战后：未装备物**入背包**、已装备物**仍在身上**；且**同一次调用**（无第二份掉落实现） |
| ④ | **已装备物明确保留** | 同 ③（`loot` 只转移 `!s.equipped`） | 同上（`equipped:true` 的槽逐条仍在） |
| ⑤ | **死亡 ⇒ effects 全档清零**（新肉身＝全新印出） | 复用 `#1741` 已交付的 `DND5E.clearEffectsOnDeath`（**不重造**） | 战后 `effects` 为空；条目级校验（含 persistent 也被清） |
| ⑥ | **`death` debuff 清除** | respawn 内显式 `lose(death)`（`clearEffectsOnDeath` **有意保留** death 标记，见下「与 #1741 的接口」） | 战后 `contains(death) === false`；HP 复位后可正常行动 |
| ⑦ | **恰好触发一次** | **幂等守卫**（与 `grantDeathIfDown` 同形）：非死亡态调用 ⇒ 不动状态 | 连调两次 ⇒ 第二次**零副作用**（状态逐字节不变）；非死亡态调用 ⇒ 同 |

---

## 一、引擎现状（写稿前逐条实取，含行号）

| 面 | 现状 | 位置 |
|---|---|---|
| **全灭分支** | **只打印一句**「战斗结束：你方全部倒下了……」，其后即发 `battle:end` | `src/core/40-battle.js:177-185`（打印）／`:187`（emit） |
| **「死亡」是个 effect** | `RPG.death`（`Debuff`，仅表「无法行动」），**不含任何重来语义** | `src/core/17-effect.js`（core 注册，`defEffect`） |
| **致死判定** | `grantDeathIfDown(that)`：`hp <= 0` 且未持有 death ⇒ `gain(death)`；**挂减益，不触发流程** | `dnd-5e/core/combat.js`／`dnd3/core/combat.js` |
| **`WorldMap.current`** | **实例字段**（`this.current = null`），**不在 State** | `src/core/60-map.js:57`（声明）／`:101`（`moveTo` 赋值） |
| **`State.variables` 现放** | `sceneId`／`inventory`／`player` | `50-scene.js:61`、两包 `player.js` |
| **掉落语义** | `RPG.loot(victim)`：**只转移 `!s.equipped`**，装备保留；原样转移快照（保剩余次数） | `src/core/30-inventory.js`（`RPG.loot`） |
| **`battle:end` 订阅方** | 现有 1 处（`#1741` 的 battle 档清理） | `dnd-5e/core/conditions.js` |
| **层元数据契约** | `{ id, type, start? }`；一号元素 `{id:'L1', type:'climb', start:true}` | `#1748`（`dnd3/core/climb.js`，**在途** ⇒ 见 §五依赖） |

---

## 二、落形（接口与定义域）

```js
/** 重来：把战败的角色送回本段起点，并清算死亡后果。
 *  @param c     Character  战败的角色（须为 RPG.Character 实例）
 *  @param opts  { to?: string }  目标层 id；省略 ⇒ 取本段 `start: true` 的层
 *  @returns     { moved: boolean, dropped: string[], cleared: number }
 *               —— moved=false 表示**幂等早退**（未处于死亡态）
 */
RPG.respawn = (c, { to } = {}) => { /* 见 §三 顺序 */ };
```

**幂等判据（裁定⑦）**：`c` 非 `Character`，或 `!c.contains(RPG.death)` ⇒ **立即返回 `{moved:false, …}` 且不碰任何状态**。
（与 `grantDeathIfDown` 的幂等守卫同形：那条也靠 `!that.contains(RPG.death)` 早退。）

**层解析（裁定②）**：`to` 优先；否则**从本段层元数据取 `start: true` 的元素**（`#1748` 的 `LAYER_META_SPAN1`）。
**不新造「起点层」表**——权威在层元数据契约内（`meta.md` 准则 1 单一权威源）。

---

## 三、顺序（为何是这个顺序）

```
① 幂等早退     —— 非死亡态 ⇒ 直接返回（裁定⑦；不触碰任何状态）
② 掉落（③④）   —— RPG.loot(c)（与敌人战败同函数；只掉未装备物）
③ 清档（⑤⑥）   —— clearEffectsOnDeath(c)（清其余）→ lose(RPG.death)（清标记）
④ HP 复位       —— c.hp = c.maxHp（新肉身；值来源＝角色自身 maxHp，不引入常量）
⑤ 搬位置（②）   —— map.moveTo(startLayerId)（纯 id；若 map 未在 State ⇒ 见 §四）
⑥ 返回读数
```

**顺序的三条理由**（各可判）：
1. **掉落先于清档**：`loot` 读的是 `c.items`，与 `effects` 无关 ⇒ 顺序上不互相依赖，但放在前面**便于「掉落被清档影响」这类假想缺陷直接暴露**（若实现把两者耦合，掉落用例会红）。
2. **HP 复位先于搬位置（**领队裁定已确认，并入四判据**）**：`moveTo` 会触发 `onExit`/`onEnter` 钩子（`60-map.js:97/:105`）——若**新层**的进入钩子读 `hp`，复位必须先完成，否则钩子读到死亡态。⇒ 判据 1（位置）须**同时**断言复位后 `hp === maxHp`（顺序错了会暴露）。
3. **返回读数**：`{moved, dropped, cleared}` 供调用方（Scene／故事）判断与展示，**不由本函数打印**（打印属呈现层；本函数是规则面）。

---

## 四、`current` 进 State（M1-① 的先行子集）

**问题**：`WorldMap.current` 是实例字段（`60-map.js:57`），而实例在**堆上**；SugarCube 读档只恢复 `State.variables` ⇒ **读档后 `current` 回到初始值（错位）**。
**本笔范围（只搬最小集 —— 按领队裁定①，**不搬任何标记**）**：
- `current` 落 `State.variables.mapCurrent`（**纯字符串 id**，零改其语义；**该键为本笔新增**）——**只此一项**；
- **不引入 `respawnPending` 一类的第二真值**：重来是否「待处理」由**角色自身的 `death` 标记**承载（与 `grantDeathIfDown` 的幂等守卫同一状态源）⇒ 单一权威，无第二真值可漂移；
- **M1-① 的全量地图序列化另票**（本笔不碰 `locations`/`exits` 的持久化）。

**判据**：`State.variables.mapCurrent` 与 `map.current` **始终一致**（写点单点：`moveTo` 内同步）；经 `JSON.parse(JSON.stringify(State.variables))` 往返后，`map.current` 可**从 State 恢复**（不依赖实例）。

---

## 五、依赖与接口（与在册票）

| 依赖 | 关系 | 说明 |
|---|---|---|
| **`#1741`（条件面）** | **已落地**（本稿以其实装为据） | `clearEffectsOnDeath` 是清档的**唯一实现**；⚠ 它**有意保留** `death` 标记（绷带复活依赖 `contains(death)`）⇒ respawn 必须**显式补一次 `lose(death)`**（裁定⑥）。**这就是为什么 ⑤ 与 ⑥ 是两步而非一步。** |
| **`#1748`（一段内容）** | **在途** | `LAYER_META_SPAN1` 的 `start:true` 是本笔的**层权威**。若 `#1748` 未合 ⇒ 本笔落码前须 rebase；其契约形状（`{id,type,start?}`）已在票面钉死。 |
| **`#1727`（扩展点）** | **已落地** | `turnBoundary`/`battle:end` 是本笔的**接线点**（全灭分支位于 `battle:end` 之前 ⇒ 本笔须在 `battle:end` 之后再动，或**订阅**该事件）。**本席取后者**：respawn **订阅 `battle:end`**，而非改 `execute()` 内部——理由是 `#1741` 已在该事件上有订阅方，且订阅形使「恰好一次」更易判（事件是单点）。 |
| **`#1690`/`#1737`（战败掉落/弹药）** | 无关 | `#1737` 的 `useItem` 面与本笔不重叠（本笔不碰 useItem）。 |

---

## 六、开放问题（请领队/评审定）

1. **`respawnPending` 标记的语义**：是「跨档保留的一次性标志」（读档后仍待处理）还是「仅当次会话」？（本笔**先做最小形**：写进 State，语义待定 ⇒ 若评审要求，直接砍掉该标记，只搬 `current`。）
2. **`to` 参数——已裁（②）：留形不留实现**：终局二择（「回到某一层居住」）是**同族反向操作** ⇒ 接口保留 `to` 缺省 `startLayer`；**实现候 `#1733` 终局机器票**（本笔不做）。
3. **`loot` 的掉落文案——已裁（③）：采本席案，记 #1760 后续义务**：`RPG.loot` 会 `perform`「你获得了：…」，在**战败**语境下语义反了。本笔**不夹带改共享函数**（改它会动敌人战败路径）；**后续义务**＝给 `RPG.loot` 加 `opts.silent`，由 respawn 调用方自写战败文案。**本笔落码时不得遗漏该义务的登记**（另立子项或随本票收尾）。
4. **`hp = maxHp`——已裁（④）：满血复活**。理由＝与裁定⑤「新肉身全新印出」**同源语义**；`hp=1` 形如「残躯爬回」，与 `outline.md:9`「灵魂复捕→新肉身苏醒之地」主题不合。纪律：**本函数不引入常量**（值取角色自身 `maxHp`）；若后续玩法需惩罚性复活（掉层/灵魂湮灭等），属 **P3+ 另裁**。

---

## 七、可判断据（四条，对应票面「判据四条」）

| # | 判据 | 形（可判） |
|---|---|---|
| 1 | **位置（＋复位顺序）** | 战败前 `map.current = 'L3'` ⇒ respawn 后 `map.current === startLayerId('L1')`；且 `State.variables.mapCurrent` 同步；**且 `c.hp === c.maxHp`**（顺序判据：复位须先于 `moveTo`） |
| 2a | **掉落语义（语义段——用敌人路径）** | ⚠ **玩家路径不可判**（下条注）：玩家 `items` ≡ `$inventory` **同引用**（`dnd3/player.js:58-61`）⇒ `loot` 的 `inv().push(s)` 推的正是原数组 ⇒ 掉落对玩家表现为**顺序变化**而非移除。故语义段走**敌人路径**（`items` 是自有数组）：`RPG.loot(enemy)` ⇒ `enemy.items` **只剩已装备项**（2 项→1 项）**且** `$inventory` **增收该件**。突变（`loot` 换空函数）⇒ **两向都变** ⇒ 有判别力 |
| 2b | **接线段（认账形）** | 玩家路径改断：**`loot` 被调用恰一次**（probe 包 `loot` 计次）＋ **已装备项仍在**；并**明写**「玩家 `items` 与 `$inventory` 同引用 ⇒ 掉落＝顺序变化，非移除」（把该已知语义写进判据，防后人写出恒绿断言） |
| 3a | **effects 全清** | 战后 `c.effects` 不含任何条件（含 persistent）—— 打 `M3` |
| 3b | **death 标记清** | 战后 `c.contains(RPG.death) === false` —— 打 `M4`（与 3a 是**两个可分别出错的面**） |
| 4 | **恰一次** | 连调 `respawn` 两次 ⇒ 第二次返回 `{moved:false}` 且**状态逐字节不变**；非死亡态调用 ⇒ 同 |

**突变面（落码时执行，各刀须红）**：
`M1` 去掉幂等守卫 ⇒ 判据 4 红｜`M2` 掉落改成「连装备也掉」⇒ **判据 2a** 红（敌人路径：只剩已装备项那条被打破）｜`M2b` `RPG.loot` 换空函数 ⇒ 判据 2a 红（两向都变）｜`M3` 不调 `clearEffectsOnDeath` ⇒ 判据 3 红｜`M4` 漏 `lose(death)` ⇒ 判据 3 红（第二条断言）｜`M5` 位置搬错（写死非 start 层）⇒ 判据 1 红｜`M6` 不写 `State.variables.mapCurrent` ⇒ 判据 1 第二断言红｜**`M7` 传 `to:'L5'` 而实际仍回 `L1`**（`to` 被忽略）⇒ 判据 1 红 —— **补此刀**，否则「`to` 写死忽略」时六刀全绿（writer 实测缺口）。

---

## 八、范围外（本笔不做）

- **M1-① 全量地图序列化**（`locations`/`exits`/钩子的持久化）——本笔只搬 `current` ＋ 最小标记。
- **终局二择**（`outline.md` 的「回到某一层居住」／「加入人工天堂」）——同族的**反向**操作，归五段票（`#1733`）。
- **惩罚面**（掉层／灵魂湮灭等丙案）——裁定已把它们推后（丙留后期）。
- **义体保留问题——已定（裁定④）**：**死亡 ⇒ 义体不保留**（复刻原本肉身 ⇒ 义体随旧身湮灭；防「永久累积击穿梯度」）。⚠ 本笔的 S1 **不涉及义体面**（义体属四段 `#1732`）⇒ **零码影响**；但**落码者须知**：将来义体落地时，它**不能**靠「装备保留」（裁定④）留在身上 ⇒ 届时须在清档处**显式移除义体件**（本稿此处为**前向约束**，非本笔实现项）。
