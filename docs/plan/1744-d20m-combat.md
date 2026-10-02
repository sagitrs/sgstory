# d20m 规则包骨架 · 判定面设计（chargen ＋ combat ＋ 自证件）

> Issue：**#1744**；依据：#1740（探索票：源甄别／授权／纯度／骨架 ＋ 领队五裁定）；基线：`main@8205198`
> 状态：**行为面设计稿（随 #1745 首笔同交）**
>
> **本稿的设立缘由**：操作者裁定（#1750 comment `5915548424`，2026-09-30）——
> 「**判定/规则行为**代码合入须与**设计文档**同步，设计文档须**引信源**」，且「**在途 PR 一律照此**」。
> 本笔（#1745）改动判定行为（命中／重击／伤害修正／伤害下限／防御／车卡写面），同笔交本稿。
> **规范句带源**：下每条规范句一律带 `SRD d20M · <文件>:<行>` 行引 **或** 显式
> `house rule（非 SRD）＋理由`；**无源句不得作为行为依据**（本稿 §三 逐条登记为「未落」）。

## 一、规则出处与引用口径

### 1.1 面与版本

- **规则面**：Modern System Reference Document（MSRD）——d20 Modern 及其 `d20 Future` 等**同一发行面的子集**
  （证据见 #1740 §1.1/§1.2）。**包纯度**（#1712 裁定）：`d20m` 只放 MSRD 面对象与数值，不得混入 3.5E／5.2.1 面。
- **版本口径**：MSRD **无数字版本号**，本仓因此以**短 token `d20M`** 作引用版本位（#1740 领队裁定 2）。
  §15 vintage 以 `LICENSE-CONTENT.md` 第四节照录为准（本笔 pin 处＝`v 1.0a` ＋ `Copyright 2002-2003`）。
- **可复核锚**：`README.md`「规则来源」§一 的 `d20m` 面 **7 行**（commit／行数／sha1-16）；
  逐字副本在 `tests/gates/pin-cache/*-d20m.md`；复现命令见同表下「二、复现」。

### 1.2 引用形与引用形态

**引用形**：`SRD d20M · source/<子集>/<文件>.md:<行号>`（带目录的 pin 行**须写全路径**，不得只写 basename）。

| 引用形态 | 含义 | 本稿用法 |
|---|---|---|
| **条款正文** | 源文直接给出的规则句 | 逐条给行号 |
| **表值** | 源文表格给出的值（本稿取定行） | 给**行号 ＋ 该行逐列读数** |
| **设计判断（house rule）** | 源文未规定或本笔**故意偏离**者 | 必须写 `house rule（非 SRD）＋理由`，不得记「对齐 SRD」 |

## 二、逐条规范句（**行为依据**，各带源）

### 2.1 攻击判定式（S1）

> **规范句**：攻击掷骰 ＝ `1d20 ＋ 攻击加值`；**结果 ≥ 目标 Defense 即命中并造成伤害**。
> **源**：`SRD d20M · source/1Modern现代/27msrdcombat战斗.md:19`（条款正文）——
> 「rolls 1d20 and adds his or her attack bonus. If the result equals or beats the target's Defense,
> the character hits and deals damage」。
> **本笔的攻击加值** ＝ `基础攻击加值(bab) ＋ 能力调整值`（能力见 §2.2）。

### 2.2 能力调整值（攻击侧）

> **规范句 a**：远程武器（含火器）攻击**用灵巧**调整值。
> **源**：`SRD d20M · source/1Modern现代/27msrdcombat战斗.md:59`（条款正文）——
> 「a character's Dexterity modifier applies when the character attacks with a ranged weapon」。
> **规范句 b**：近战武器攻击**用力量**调整值。（同源 `:33` 的远程加值构成为
> 「Base attack bonus + Dexterity modifier + range penalty + size modifier」，反向即得近战用力量。）
> **本笔未落**：range penalty／size modifier（见 §三.2）。

### 2.3 天然 1／20（**对齐源文**，不是 house rule）

> **规范句**：攻击掷骰**天然 1 恒为失手**、**天然 20 恒为命中**；且**天然 20 恒为威胁**。
> **源**：`SRD d20M · source/1Modern现代/27msrdcombat战斗.md:21`（条款正文）——
> 「A natural 1 (the d20 comes up 1) on the attack roll is always a miss. A natural 20 (the d20 comes up 20)
> is always a hit. A natural 20 is also always a threat—a possible critical hit.」
>
> **与总则的关系（本笔初稿误读，已改判）**：总则 `SRD d20M · source/1Modern现代/2msrdbasics基本.md:43`
> 写「A natural 20 … is **not** an automatic success. A natural 1 … is **not** an automatic failure,
> **unless the rules state otherwise**」；**攻击面的 `:21` 正是那句所指的例外条款**，因此两处**不矛盾**。
> 因此本面**是对齐源文**（初稿曾登记为「house rule 待核」，见 §六 变更史）。

### 2.4 重击（威胁与确认）

> **规范句**：威胁成立后**立即再作一次同修正的攻击掷骰**，该掷**命中**目标 Defense 即为**重击**（伤害掷两次）；
> 该掷**未命中**时**仅按普通命中结算**。
> **源**：`SRD d20M · source/1Modern现代/27msrdcombat战斗.md:91`（条款正文）——
> 「the character immediately makes another attack roll with all the same modifiers as the attack roll
> that scored the threat … If the second roll also results in a hit against the target's Defense, the attack
> is a critical hit … If the second roll is a miss, then the attack just deals the damage of a regular hit.」
> **威胁范围**：本包火器的威胁档＝**20**（武器数据面，见 §2.6 的表值）。

### 2.5 伤害修正（**本笔改码处**）

> **规范句 a**：**近战武器与投掷武器**命中时**加力量**调整值到伤害。
> **源**：`SRD d20M · source/1Modern现代/27msrdcombat战斗.md:77`（条款正文）——
> 「When a character hits with a melee weapon **or thrown weapon**, add his or her **Strength** modifier
> to the damage.」
> **规范句 b**：**远程武器不加减值**（反向推得：`:77` 只列近战与投掷）。
> **反向核（本席实做）**：全源 63 份扫 `Dexterity.*damage`／`add.*Dexterity.*damage`，**无命中**
> 可见源文**无**「远程加灵巧伤害」之说。
> **本笔未落**：副手武器只加**一半**力量加值（`:79`「add only half of the character's Strength bonus」）
> —— 本包尚无副手位承载体，见 §三.3。
>
> **变更史点**：本笔初稿按 dnd3 同形落「远程加灵巧」，与 §2.5b **相违**；经 §六 改判为「仅近战／投掷加力量」。

### 2.6 伤害下限

> **规范句**：分数一律**向下取整**；伤害与 HP 类掷骰**至少为 1**。
> **源**：`SRD d20M · source/1Modern现代/2msrdbasics基本.md:25-27`（条款正文）——
> `:25`「if you wind up with a fraction, round down, even if the fraction is one-half or larger」；
> `:27`「Exception: Certain rolls, such as damage and hit points, have a minimum of 1.」

### 2.7 有效防御（**house rule**：只落源式三项）

> **规范句（本笔取值）**：有效防御 ＝ `stats.ac（基础 10）＋ 已装备道具的 stats.ac_bonus`。
> **源文的防御式**：`SRD d20M · source/1Modern现代/27msrdcombat战斗.md:103`（表值／条款正文）——
> 「10 + Dexterity modifier + class bonus + equipment bonus + size modifier」。
> 因此**本笔只落了其中三项**（10／灵巧／装备加值），**职业加值（class bonus）与体型加值未落**。
> **定性**：`house rule（非 SRD）`——理由：职业加值依赖「职业面」（本包无职业数据；#1744 票面列在不做清单），
> 体型加值依赖体型表（本笔未 pin）。**本笔不声称「完全对齐」**。
> **注**：本包 `stats.ac` 缺省 10 且玩家件写 12＝**house rule（非 SRD）**（同 §2.10）。

### 2.8 击倒结算（**house rule**）

> **规范句（本笔取值）**：目标 HP 归零且未持有死亡减益时，挂 `RPG.death`。
> **定性**：`house rule（非 SRD）`——理由：d20 Modern 的濒死／死亡判定面（含 massive damage）本笔未落
> （#1744 票面列在不做清单），本处只复用 core 的既有减益表达。
> **未落**：非致命伤害（nonlethal）／巨额伤害阈值（＝体质分）／状态机（Disabled／Dying／Dead）。

### 2.9 属性写面与上限

> **规范句 a**：六维存**原始分**；调整值**不落字段**，由 `abilityMod(原始分)` 现算。
> **源**：`SRD d20M · source/1Modern现代/3msrdabilityscores属性值.md:24`（条款正文）——
> 公式「(ability/2) -5 [round result down]」。**本实现为等价闭式** `floor((分−10)/2)`（两式对全部整数等价）。
> **规范句 b**：MSRD **不设**通用属性上限。**源**：同文 `:68`（条款正文）——
> 「Ability scores can increase with no limit.」，故本包 `ABILITY_MAX === null`。
> 同文 `:14`「normal human range is 3 to 18」是**描述性**口径（人类常态范围），不作硬上界。
> **规范句 c**：越域（非整数／< 1）**抛错**，不静默夹取。
> **定性**：`house rule（非 SRD）`——源文未以「写面」术语规定校验形态；本笔取「唯一写面 ＋ 公开入口校验」
> 是 #1697 §决策一/§决策七 的**既有仓约定**（三包同构）。

### 2.10 属性生成法（**house rule**）

> **规范句（本笔取值）**：`rollAbilityScores()` ＝ **4d6 弃最低，掷六次**。
> **定性**：`house rule（非 SRD）`——理由：**本仓已 pin 的 MSRD 读面（7 份）未载**属性生成的掷骰法；
> 本笔借用同仓两包同法并在此显式登记（先例：`dnd3/core/chargen.js` 对同一缺口的同款登记）。
> 本笔不声称源文条目；若后续 pin 到载有生成法的 MSRD 册页，须回来改判。

### 2.11 自证件的数据面（表值，逐列读数）

| 件 | 规范取值 | 源（表值） |
|---|---|---|
| 贝瑞塔 92F | `dmg 2d6`／威胁 **20**／`type ballistic`／射程增量 **40 ft**／`weight 3` | `SRD d20M · source/1Modern现代/25msrdequipmentweaponsandarmor武器与盔甲.md:71` —— 该行逐列：`\|Beretta 92F (9mm autoloader)\|2d6\|20\|Ballistic\|40 ft\|S\|15 box\|Small\|3 lb\|16\|Lic (+1)\|` |
| 义体·假臂（PL 5） | `hardness 3`／`hp 5`／槽 `arms` | `SRD d20M · source/4Future未来/2FutureCybernetics.md:97`（条目头）；`:99`「provides **no special game benefits**」／`:100` Type External／`:101` Hardness/Hit Points 3/5 |
| 骨架型无人机（Armature · Small · PL 5） | `str 11`／`dex 12`／`wis 10`／`cha 1`；`hp 8`（**house rule（非 SRD）**＝`1/2d10` 固定化 ＋ Extra 5）；`ac 12`（**house rule（非 SRD）**＝10＋灵巧+1＋Small +1）；`bab 0`；`cr 0` | `SRD d20M · source/4Future未来/9FutureRobots.md:140` —— 该行：`\|Small\|16\|1/2d10\|5\|11\|12\|—\|—\|10\|1\|—\|`；机架节入口 `:124`；通性 `:85`「Hit Die: d10.」／`:86`「Base Attack Bonus: 3/4 of total Hit Dice.」 |

**取得面（Purchase DC）本笔不落**：火器的取得面是 **Purchase DC**（`:71` 第 10 列，值 16），而本仓
裁定「黄金贯穿始终」（books#72），因此 `Purchase DC → 金数`的映射属**后续票**
（`house rule（非 SRD）`：不得凭空造映射）；故自证件**不落 `cost`**。

## 三、本笔**未落**面（逐条声明，不作行为依据）

1. **职业面**：职业防御加值（`:103` 的 class bonus）、职业数据、行动点（action points）、专长／天赋。
2. **范围与体型**：range penalty 与 size modifier（`:33`）；§2.1 的攻击加值**不含**二者。
3. **副手**：副手武器半力量加值（`:79`）—— 无副手位承载体；本包亦无投掷件（`:77` 的 thrown 支**记在注释**，不预置无消费者的分支）。
4. **武器非擅长 −4**（`:23`）—— 无熟练度数据面。
5. **非致命伤害／巨额伤害／濒死状态机**（见 §2.8）。
6. **免疫面与不受重击**（`9FutureRobots.md:97`「Robots with armature … frames are **not subject to critical hits**」）
   —— 无免疫承载体，因此本笔的无人机**照常吃重击**（**已知偏离源文**，登记于此，不声称对齐）。
7. **修复检定**（同文 `:96` 的 Repair DC 30）与机器人「无体质／智力」态（`:90`）
   —— **后者已在码内显式登记为缺口**：本仓 `STAT_BLOCK` 是六维**对称块**（#1697 §决策二），**无「none」表示**。
8. **Purchase DC → 金数**（见 §2.11 末）。
9. **Rate of Fire／Magazine／Ammo**（源武器表的列）—— 无连发与弹匣承载体。

## 四、断言锚（用例 ↔ 规范句）

> 机制：#1750 comment `5915548424` 第 3 条——**行为断言锚本稿的规范句**，不锚实现输出。
> 各用例文件头/格内已写明所锚的 `#1744 §2.x`。

| 用例（`tests/unit/d20m/`） | 锚定规范句 | 判别性（不靠注释自陈） |
|---|---|---|
| `stats.test.js` 前两格 | §2.9a（原始分真值）＋ #1697 §决策二（对称不变量） | 加字段则键集红；破对称则对称格红（A7 两刀实证） |
| `stats.test.js` 无人机格 | §2.11（无人机表值） | 逐字段等源值 |
| `chargen.test.js` 换算表格 | §2.9a（`:24` 公式） | 逐格 ＋ 与闭式等价 |
| `chargen.test.js` 上限／越域格 | §2.9b/§2.9c | 30 不抛错、0 与非整数抛错 |
| `chargen.test.js` 生成法格 | §2.10（house rule） | 弃最低的确定性与边界（不断言「对齐源文」） |
| `combat.test.js` 判定式与防御格 | §2.1／§2.7 | 同攻击者对 AC 12 命中、AC 13 不命中 |
| `combat.test.js` 近战 vs 远程格 | §2.5a/§2.5b | **同攻击者／同固定掷面／同 2d6 骰**，唯一变量＝近战或远程，读数 40 与 42，差值恰为力量调整值 |
| `combat.test.js` 天然 1 格 | §2.3 | 加值极高（bab 99）仍失手 |
| `combat.test.js` 天然 20 格 | §2.3＋§2.4 | 对 AC 30 仍命中；确认掷 15 < 30，**不**重击，故为单倍伤害 |
| `combat.test.js` 伤害下限格 | §2.6 | 近战负力量（−5）压到 0 以下，取 1 |
| `items.test.js` 火器格 | §2.11（火器表值） | 逐列断言；不落 `cost` |
| `items.test.js` 义体格 | §2.11（义体条目的 `:99`「no special game benefits」） | 不得有 `ac_bonus`（不造加值） |

## 五、与总则的关系（一次讲清，免后手再误读）

MSRD 有**两层**规则句：**总则**（`2msrdbasics基本.md`：骰记法／取整／乘算／基础判定式）与**分则**
（`27msrdcombat战斗.md` 等：各面的具体条款）。总则 `:43` 自带**例外开关**「**unless the rules state
otherwise**」，因此**凡分则另有规定者以分则为准**。本笔受此影响的两处即 §2.3（天然 1/20）与 §2.5（伤害修正）。

## 六、变更史（本笔内部，供评审对账）

| # | 时点 | 变更 | 依据 |
|---|---|---|---|
| 1 | `f40551c`（主笔） | 初稿：天然 1/20 与远程伤害修正**按 dnd3 同形**，两处自陈「house rule 待核（战斗节未 pin）」 | —— |
| 2 | `0801bf7` | **改判**：把战斗节（同一源仓，`27msrdcombat战斗.md`）**pin 入表**（第 7 行）并逐条改判 —— §2.3 由「house rule 待核」改为**对齐源文**；§2.5 由「远程加灵巧」**改为「远程不加」**（并做全源反向扫） | 源文 `:21`／`:77`；操作者「不许无出处」纪律 |
| 3 | （操作者裁定后） | 增设**本稿**（行为面设计文档 Δ）＋ 用例断言**加锚**（§四） | #1750 comment `5915548424`（在途 PR 一律照此） |
