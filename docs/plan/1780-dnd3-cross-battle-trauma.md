# #1780 · dnd3 跨场物理 debuff（创伤）设计稿

> **地位**：#1750 根因①新裁定的**判定行为笔**——本稿与落码**同笔**合入；每条规范句**引信源**或标 **`house rule（非 SRD）`＋理由**。
> **信源**：伞 **#1728**（10–19 档＝二段 `#1730`：铁器到封建）；票面 **#1780**；`scope` 档同源：`docs/plan/1689-5e-conditions.md` **§十.3**（**单一权威源**，本稿不复述语义）；死亡面：`docs/plan/1760-babel-respawn.md` **裁定⑤**（`#1772` 已落）
> **读法**：§二–§六 每条为**规范句**（可被单测断言引用）；§七 为「用例 ↔ 规范句」锚表；§八 逐条声明**未落面**。

---

## 〇、范围与非范围

**范围**（票面四条）：① dnd3 侧**创伤类条件** 3–5 条（**全部 house rule 显式**）②**施加面**（战斗重击／特定武器命中）③**解除面**（整备点治疗——接 `#1747` 建设面／草药）④**持久化验证**（跨场存活 ＋ 存档往返存活）。

**✗ 不在范围内（逐条声明）**：五段之外的档位（21+）、法术与远程专属创伤、义体面（`#1732`）、**通用**条件面（`#1741` 是 **5E 面**，本笔不碰 `src/dnd/dnd-5e/**`）、自愈与时间流逝的自动恢复（见 §六.3 未落声明）。

---

## 一、逐条源文对读（SRD 3.5 **有什么**／**没有什么**）

**本仓 3E pin 面**（`README.md` pin 表；**5 份**）：`equipment.md`／`legal-information.md`／`3.5 Monsters - G.md`／`Monsters - Animals.md`／`basics-and-ability-scores.md`。
**注意**：3.5 SRD 的**战斗与状态章节不在本仓 pin 面内**，因此凡属该章的概念，本仓**无源可引**，只能标 `house rule（非 SRD）`。

**反向扫（全 pin 面；复现命令见 §九）**：`创伤`＝**0**，`跨场`＝**0**，`持续伤害`＝**0**，`永久`＝**0**，`persistent`＝**0**，`crippl`＝**0**。

**扫出的两条真源（本笔的「最接近形」，逐字引）**：

> **源 A**（创伤的**持续＋治疗**模型）：`SRD 3.5 · Basic Rules and Legal/equipment.md:2948-2952`（**Caltrops**）
> 「The caltrop deals 1 point of damage, and the creature's speed is reduced by one-half because its **foot is wounded**. This **movement penalty lasts for 24 hours**, or until the creature is successfully **treated with a DC 15 Heal check**, or until it receives at least 1 point of magical curing.」

> **源 B**（伤**不自愈/抗治疗**的极端形）：`SRD 3.5 · 3.5 Compendium/Monsters/3.5 Monsters - G.md:1394-1395`（**Clay Golem · Cursed Wound (Ex)**）
> 「The damage a clay golem deals **doesn't heal naturally and resists healing spells**. A character attempting to cast a conjuration (healing) spell on a creature damaged by a clay golem must succeed on a **DC 26 caster level check**, or the spell has no effect on the injured character.」

**结论（本笔的源形取舍）**：
1. SRD 3.5 **有**「**创伤＝持续到治疗**」的**单体先例**（源 A：24 小时／DC 15 Heal／魔法治疗），**有**「**不自愈**」的极端先例（源 B）。
2. SRD 3.5 **没有**「跨场创伤」**系统**（无条目表、无施加规则、无分类），上面的反向扫为零。因此**本笔的 4 条创伤条目与其施加规则为 `house rule（非 SRD）`**，但**机制形**尽量贴源 A（**治疗检定解除**，不另造一套「敷药即消」）。

---

## 二、四条创伤（**house rule（非 SRD）**；逐条规范句）

> **共用**：`scope: 'persistent'`（跨场保留；语义同 `docs/plan/1689-5e-conditions.md` §十.3，**本稿不复述**）；落在 **`DND3.Traumas`**（**独立命名空间**，理由同 §十.4：本仓设计值不得混入可 pin 的 SRD 表）；**一条重击最多施加一条**（§三.2）。

| id | 名 | 判定字段（3E 惯用**数值罚**） | 施加（§三） | 解除（§五） | 源形 |
|---|---|---|---|---|---|
| `laceration` | **裂伤** | 每场战斗**首回合**攻击掷骰 **−1** | 重击确认命中；默认项 | DC **15** 治疗检定 | A（DC 15） |
| `fracture` | **骨裂** | **近战伤害 −1**（力量系） | 重击确认命中且武器为**钝击类**（`stats.crushing === true` **或** `stats.type === 'bludgeoning'`） | DC **18** 治疗检定 | A（治疗检定） |
| `concussion` | **脑震荡** | **豁免掷骰 −1** | 重击确认命中且该次伤害 **≥ 目标 maxHp 的 1/2** | DC **18** 治疗检定 | A |
| `bleeding` | **失血** | **每场战斗开始 −1 HP**（不死；HP 下限 1） | 重击确认命中且伤害 **≥ 3** | **魔法治疗**（任一 healing 效果）或 DC 15 | B（不自愈/须治疗） |

**逐条规范句**（可断言）：

- **T1**：`DND3.Traumas.laceration` **house rule（非 SRD）**——理由：SRD 3.5 无跨场创伤系统（§一）；形借源 A 的「持续到治疗」。
- **T2**：`fracture` **house rule（非 SRD）**——同上；其**施加**绑定「钝击类武器」为本仓设定（SRD 无该绑定）。
- **T3**：`concussion` **house rule（非 SRD）**——同上；阈值（伤害 ≥ maxHp/2）为本仓设定。
- **T4**：`bleeding` **house rule（非 SRD）**——同上；「每场战斗开始 −1 HP 且**不自愈**」对应源 B 的「doesn't heal naturally」形态，但**条目的存在与数值**为本仓设定。
- **T5**：四条**均** `scope: 'persistent'`，因此 **`battle:end` 不清**（三态断言之一，见 §六.1）。
- **T6**：四条**只经**「治疗检定」或「魔法治疗」移除（§五），**不因回合流逝自动消失**（与 `duration` 档 3 的区别：本笔**不声明** `duration`）。

---

## 三、施加面规范句（**重击**触发）

- **A1**：施加点是 **`DND3.meleeAttack`** 的**重击确认命中**之后（现落点 `src/dnd/dnd3/core/combat.js:68` 的 `crit` 与 `:79-83` 的伤害结算之间/之后）。
- **A2**：**一条重击最多施加一条**创伤，按**固定优先级**择一（**确定性**，不用随机表——遵 `#1706` 的 `RPG.rng` 纪律与「用例可确定复现」）：
  `concussion`（伤害 ≥ maxHp/2）> **`fracture`（武器钝击类）** > `bleeding`（伤害 ≥ 3）> `laceration`（默认）。
  **判据与次序均为 D 席 MAJOR（`#1781`）后订正**，缘由见 §三 A2′。
- **A2′（可达性——本条的来历）**：初版判据为 `item.stats.crushing === true`，且次序在 `bleeding` 之后，于是**三重实证**该条**零可达**
  （① `crushing` 字段**全仓零声明** ②真实武器重击 800 次，得 `{bleeding:800}` ③补上 `crushing:true` 后仍被 `bleeding` 截胡）
  即**死条目**，违反本稿自立的「不许留消费不到的面」。订正为：
  **判据复用既有数据源**（3E 钝击类武器已声明 `stats.type === 'bludgeoning'`，如 `club.js:15`）＋ **次序提到 `bleeding` 之前**
  因此真实路径可达（`club` 重击得出骨裂；`sword` 重击得出失血，两条各有集成用例断**具体条名**）。
- **A3**：**已持有**该条时**不重复施加**（幂等；`contains()` 判定）——防「一次战斗叠十层」。
- **A4**：施加**只对 `RPG.Character`**（怪物/容器不登记创伤）——与 `DND3.grantDeathIfDown` 同形。
- **A5**：**不施加**于同一攻击中已被击杀的目标（HP ≤ 0 时死亡优先，创伤无意义）。

---

## 四、消费面规范句（创伤须**真生效**，不得是死旗标）

- **C1** `laceration`：`DND3.meleeAttack` 的攻击掷骰在**本场战斗的首回合**额外 `−1`（首回合＝本场**首次** `battle:turnEnd` 之前；包侧以订阅 `battle:turnStart`/`battle:turnEnd` 计数，`battle:end` 复位）。
- **C2** `fracture`：**近战伤害**额外 `−1`（消费点＝`combat.js` 的伤害结算，`:70-77` 的 `dmg += abilMod` 一侧）；**不作用于攻击掷骰**（与 C1 分属不同量纲，故不重复罚）。
  **为何不是「力量检定 −2」**（本稿初版）：3E 的「力量检定」在本仓 **无既有消费点**（`grep -rn "modOf(.*'str'" src/dnd/dnd3/` 仅 `combat.js:54` 一处，属攻击掷骰），若按初版写，该条会成为**死旗标**（罚无处生效），违反「创伤须真生效」（§四 标题）。故改绑**既有的伤害结算点**。
- **C3** `concussion`：`DND3.save(character, type, dc)` 的**掷骰**额外 `−1`（返回对象中 `total` 与 `success` 随之变化——用例断言 `total`）。
- **C4** `bleeding`：**每场战斗开始**（包侧 `battle` 起点）目标 `hp −1`，**下限 1**（不致死）。
- **C5**：四条罚**均为整数加法**（3E 惯用），不用 5E 的 adv/dis 词汇（本仓 3E 面无 `d20adv/d20dis`）。

---

## 五、解除面规范句（整备点治疗）

- **H1**：公开 API **`DND3.treatTrauma(character, traumaId, { mod })`**，掷 `1d20 + mod`（`mod` 缺省 0）对抗该条的 **DC**（§二表）；**成功则移除**该条并返回 `{ ok: true, roll, total, dc, removed }`；**失败则保留**且返回 `{ ok: false, … }`（**不静默成功**）。
- **H2**：**形借源 A**：`DC 15/18` 的**治疗检定**（源 A 用 `DC 15 Heal check`）加「**魔法治疗**」通路（源 A：`at least 1 point of magical curing`），因此 `bleeding` 可由**任一** `healing` 效果移除（本仓以效果 id 约定）。
- **H3**：**整备点**（第 10/20 层 hub）**接线点**：`#1747`（`PR #1776`，`feat(1747)-gather`）的草药与建设面落地后，由**其**调用 `DND3.treatTrauma`（**接口已具名**；本笔不自造 hub）。**依赖声明**：`#1776` 未合入前，本笔只交付 `DND3.treatTrauma` 与用例（§八 未落面第 2 条）。
- **H4**：治疗**不**移除 `death` 标记、**不**改 `hp`（除 `bleeding` 的魔法治疗通路按既有 healing 效果语义处理）。

---

## 六、持久化规范句（**本笔的验收核心**）

- **P1 跨场存活**：两场战斗之间（`battle:end` 之后、下一场 `battle` 之前）创伤**仍在**（`contains(traumaId) === true`），即三态断言之「跨场仍存」。
- **P2 清理通路在跑（对照组）**：**core 的清档通路确实会清**（`RPG.respawn` 走 `RPG.respawnClearEffectsFallback`，清 `death` 以外全部并清空 `effectTurns`），**这证明「清零」不是死码**。
  **不用 5E 的 `battle` 清除做对照**：那是 `DND5E.clearBattleScoped`（5E 包内），其**三态断言**（跨场仍存、本场清除、persistent 不受影响）已由 `#1758` 自己的用例覆盖，本笔再断一次即为跨包重复（P2 因此改锚 core 清档通路）。
- **P3 `persistent` 不受影响**：`battle:end` 后 `persistent` 效果（含本笔 4 条）**数量不变**。
- **P4 存档往返存活（E11 形判据）**：判据出自 `docs/plan/1689-5e-conditions.md:495`——「**不论何机制实现，只要不经 `JSON.stringify` 存活 ⇒ 必红**」。本笔的实现路径：创伤 id 落 `Character.effects`（**纯字符串数组**），随 `toJSON()`／`revive()` 往返（`src/core/20-character.js:28`、`:194`）；**施加回合数**（若有）落 `effectTurns`（**纯数据**，`:29-31`）。
  用例形：`JSON.parse(JSON.stringify(c.toJSON()))` 经 `Character.revive(...)` 之后，**`contains()` 仍真**。
- **P5 语义存活 ≠ 值往返相等**（票面原话）：**除**「id 仍在」外，还须断「**罚仍生效**」（如 `concussion` 往返后 `DND3.save` 的 `total` 仍 `−1`）——防「只存了字符串、消费点却认不出」。
- **P6 死亡则全清**：`RPG.respawn` 路径**清掉创伤**（含 `persistent`）——这是 **`#1760` 裁定⑤**（「死亡 ⇒ effects 全档清零，新肉身＝全新印出」）的**既有语义**，**不是本笔的取舍**；实现落点是 core 的 `RPG.respawnClearEffectsFallback`（`src/core/40-battle.js`，清 `death` 以外全部并清空 `effectTurns`），因此**本笔零码**，但要**用例锁死**（防将来有人以「persistent 应跨死亡」为由改坏）。

---

## 七、断言锚表（用例 ↔ 规范句；**用例名与条数从测试文件实取**，不手抄）

| 用例（**共 17 条**） | 断言锚 |
|---|---|
| dnd3 trauma：条目表 4 条，均 persistent 且带 dc（T1–T6） | T1–T5／H1 |
| dnd3 trauma：无 duration 字段，故不因回合流逝消失（T6） | T6 |
| dnd3 trauma：施加优先级确定性——四输入各命中一条（A2） | A2 |
| dnd3 trauma：幂等／非角色／倒地不施加（A3–A5） | A3–A5 |
| dnd3 trauma：重击经 meleeAttack 施加**指定条**——钝击则骨裂（A1＋A2，集成） | A1／A2（断具体条名） |
| dnd3 trauma：非钝击重击则失血（同形对照，证明判据不是恒真） | A2（对照，证明判据非恒真） |
| dnd3 trauma：伤害达上限一半则脑震荡（且**遮蔽**钝击判据） | A2（优先级顶位） |
| dnd3 trauma：C1 裂伤——首回合攻击掷骰 −1，回合结束后恢复 | C1 |
| dnd3 trauma：C1 集成——首回合少 1 点命中面（判别构造） | C1 |
| dnd3 trauma：C2 骨裂——近战伤害 −1（攻击掷骰不受） | C2 |
| dnd3 trauma：C3 脑震荡——豁免掷骰 −1（进 total） | C3 |
| dnd3 trauma：C4 失血——每场战斗开始 −1 HP（下限 1，不致死） | C4 |
| dnd3 trauma：H1 治疗检定——DC 边界与失败保留 | H1 |
| dnd3 trauma：H2 魔法治疗通路——只对声明 magicalCure 的条目（源 A/B） | H2 |
| dnd3 trauma：P1/P3 跨场存活——battle:end 不清 persistent（**非死代码**对照） | P1／P3 |
| dnd3 trauma：P4/P5 存档往返（E11）——id 存活且**罚仍生效** | P4／P5 |
| dnd3 trauma：P6 respawn 则创伤全清（#1760 裁定⑤的既有语义） | P6 |

## 八、未落面（逐条声明，不留白）

1. **✗ 自动恢复**：无「过 N 回合自愈」通路（T6）；源 A 的 `24 hours` 时间维在本仓**无时间轴**（层内无钟），故只保留「治疗」维。**理由**：造时间轴是另一笔（伞面公共能力）。
2. **✗ hub 接线（依赖 `#1747`／`#1776`）**：`DND3.treatTrauma` 为本笔交付；**整备点调用它**须待 `#1776` 合入（接口见 H3）。合入前本笔的「hub 解除闭环」以**用例直调 `treatTrauma`** 覆盖，并在 PR 面注明**闭环缺口**。
3. **✗ 施加面仅近战**：`DND3.meleeAttack` 是本仓**唯一**攻击通路（远程走同函数之 `isRanged` 分支，实际已覆盖）；**法术与陷阱类施加**留后续。
4. **✗ 不落值的「层数递进」**（duration 档 4）：本笔四条的罚为**常量**，不随层数加深。
5. **✗ 义体与自证件面**（`#1732`）不受影响。
6. **✗ 技能与属性检定面**：本仓 3E 面**尚无**「力量检定」类消费点（无技能系统），故本笔**不**造该面；`fracture` 因此改绑**近战伤害**（§四 C2）。将来落技能面时，宜由**那一笔**决定是否把骨裂重挂到力量检定上（本笔只留此注）。

---

## 九、复现命令（本稿读数由此产出）

```bash
# 反向扫（§一）：3E pin 面内是否有「跨场创伤系统」
cd tests/gates/pin-cache
grep -c "创伤\|跨场\|持续伤害\|永久\|persistent\|crippl" equipment-3e.md basics-and-ability-scores-3e.md \
  legal-information-3e.md "3.5 Monsters - G-3e.md" "Monsters - Animals-3e.md"   # 输出全 0
# 源 A / 源 B（逐字）
sed -n '2948,2952p' equipment-3e.md
sed -n '1394,1395p' "3.5 Monsters - G-3e.md"
# scope 权威源（本稿不复述）
sed -n '/^### 十.3/,/^### 十.4/p' docs/plan/1689-5e-conditions.md
# E11 判据原文
sed -n '495p' docs/plan/1689-5e-conditions.md
# respawn 裁定⑤
sed -n '20p' docs/plan/1760-babel-respawn.md
```

---

## 十、本笔读数（before＝`main` 到 after；非预测，均实测）

| 项 | before | after |
|---|---|---|
| 门 | rc=0；`第①级 已核 178／分母 179` | **rc=0**；`第①级 已核 180／分母 181`（claims **+2**：house rule 声明行触发） |
| `faces.claims` | 179 / 99（下限） | **181 / 99**，逐面**无下降**、`ceilings` 不变 |
| selftest | 22 刀 | **22 刀** |
| 单测 | 279/0 | **294/0（+15 条）** |
| build | rc=0 | rc=0 |

**过程自纠（已修，留档）**：改 `src/dnd/dnd3/core/combat.js` 时我先用了**文本模式**读写，该文件是 **CRLF**，被静默归一成 LF，于是 `git diff --numstat` 报 **97/84**（整档伪 diff）。已 `git checkout` 复原后改用**字节级替换加写前后行尾断言**（现 `combat.js` **97/97 全 CRLF**，numstat **16/3**）。
这正是 `tests/README.md` **第 8 条**（改 CRLF 须字节级）与我**巡检面①**管的那一类；**本笔是它的一次自证**。
**另一处过程自纠**：初稿在模块注释里写了裸 `SRD 3.5`（非引用形），门因此红「声称未带可解析引用」（并把 selftest 的 K0／K12／K12b **三刀**带红），已改为版本号不入模块（引用与行号**只在设计稿**，防两处漂移）。

### 十.1 D 席 MAJOR 折笔后的读数（同一 PR 内的第 2 轮）

| 项 | 折前 | 折后 |
|---|---|---|
| 单测 | 294/0 | **296/0**（+2：钝击/挥砍/大伤三条集成用例，替换原来「只断条数」的 1 条） |
| 门 | rc=0；`第①级 180／181` | **待复跑**（预期不变：本折只改判定数学与用例，不触 pin 与声称面） |
| selftest | 22 刀 | 待复跑 |

**折笔内容（逐条对 D 席票）**：MAJOR 对应 §三 A2′（判据复用 `type==='bludgeoning'`，并把次序提到 `bleeding` 前）；
MN-1 对应 `traumas.js` 头部注明 `battle.players/enemies` 隐式契约；MN-2 对应 §八 第 5 条已知面；
MN-3 对应集成用例改断**具体条名**（并加「非钝击则失血」对照，证明判据**非恒真**）；MN-4 对应 `magicalCure` 去默认参。
