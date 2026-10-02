/* DND3 天然攻击件（`#1855`）—— 动物／虫类的爪、咬、蛰、冲撞
 *
 * ## 立档理由
 *   9 只动物／虫类的 `items` 原先只有 `coin`（战利品）⇒ 战斗走道具通路 ⇒ **全体永不攻击**
 *   （操作者实测：「精英·獾没有装备任何武器，只能干瞪眼」，8 回合零威胁）。
 *   对照 `goblin.js`／`guard.js`（`{ id:'club', equipped:true }`）⇒ 它们正常。
 *
 * ## 数值出处（pinned，**逐值照录**；`tests/gates/pin-cache/`）
 *   ① `Monsters - Animals-3e.md`：Badger `##`（Attack 行）／Boar／Lizard, Monitor／Wolf／Bear, Brown
 *   ② `Monsters - Vermin-3e.md`：Giant Bee／Giant Bombardier Beetle／Giant Fire Beetle／Giant Stag Beetle
 *   ★**逐值**见各件下方；**行号由 `refs-integrity` 门逐键核**（引用行须含可声称的键，✗ 只写文件不写键）。
 *
 * ## ★攻击加值取 `stats.atkBonus`（显式照录 pinned 的 Attack 行），✗ 不由引擎推导
 *   （`#1855` §二 裁定 **甲**，领队 guest-1 2026-10-02）
 *
 *   反解 pinned 值须三件**本仓不存在**的机制 —— 本席逐只反解，9/9 皆成立：
 *     ① **体型修正**：Badger AC 行 `+1 size`／Bear `−1 size`／Fire Beetle `+1 size`／
 *        Stag Beetle `−1 size`。体型**同时**挂在 AC 上（属正经独立需求 ⇒ 跟进票）。
 *     ② **武器娴熟**：Badger `Claw +4` 用 Dex 而非 Str（`bab 0 + Dex +3 + size +1 = +4`）；
 *        Wolf `Bite +3` 同（`bab 1 + Dex +2 = +3`，用 Str 则 +2）。
 *     ③ **单一自然攻击 ×1.5 力调**：Boar `1d8+3`／Lizard `1d8+4`／Bombardier `1d4+1`／
 *        Stag `4d6+9` 的伤害加值皆 ≥ 力调 ×1.5（引擎**恒 ×1**）。
 *
 *   ⚠ **本席实测**（`DND3.meleeAttack` 直调，读挥空文案）—— 若不照录：
 *     `badger −1（pinned +4，差 5）`／`wolf +2（+3，差 1）`／`brown-bear +12（+11，差 −1）`／
 *     `fire-beetle +0（+1，差 1）`／`giant-stag-beetle +11（+10，差 −1）`；boar/lizard/bee/bombardier 相符。
 *   ⚠ **脱钩代价（有意）**：`atkBonus` 与 `bab`／力调**不联动** —— 日后改属性**不会**改它。
 *     这是有意的（值来自 pinned，✗ 来自推导）；三机制跟进票落地后**应回头复查本档**。
 *
 * ## 不落项（house rule，非 SRD —— ✗ 不静默丢弃，逐条记名）
 *   · **多肢／Full Attack**：只落 **Attack 行**（单攻击）。3e 自然武器有「主/次攻击」与「全回合」层，
 *     引擎**无该层**（同 `#1784` 惯例 ⇒ 注记）。Badger `2 claws … and bite`／Bear `2 claws … and bite +6`
 *     皆**只取首个**。★与 `#1854`（空手）共用同一条注记形，✗ 两套写法。
 *   · **特技**：Rage（Badger）／Ferocity（Boar）／Trip（Wolf）／Poison（Bee）／
 *     Acid spray（Bombardier）／Trample（Stag）／Improved grab（Bear）**一律不落**。
 *   · **伤害类型**：pinned **未给** ⇒ 按自然攻击惯例声明（爪 slashing／咬 piercing／
 *     蛰 piercing／冲撞 bludgeoning）并标 `house rule（非 SRD）`。
 *   · **重击倍率**：pinned 未给 ⇒ 取 SRD 默认 ×2（`crit: 2`），同属 `house rule` 注记。
 *
 * ## 装备与掉落
 *   `equipped: true` ⇒ ①与 `goblin.js` 的 club 同（死亡**不掉落** —— `RPG.loot` 只收**未装备**件，
 *   拾尸捡爪子的怪象不会出现）②自动通路 `contains(['weapon','equipped'])` 即可取到（无需拔出）。
 *
 * ## 委托形
 *   `used(that, from) { return DND3.meleeAttack(this, that, from); }` —— 与 `#1813` 的**转发形**同：
 *   ✗ 不转发则「打不出去」被算作 `applied`，`#1773` 的三连拒绝护栏在这一面失效。
 *   ★**判别刀（棘轮 ⑩）**：撤**真代码**（本档生成器里那行的 `return`，`used()` 内）⇒ **红并具名**
 *     —— `tests/unit/core/attack-reject-ratchet.test.js` ① 段对具名清单**逐个**断「形在 ＋ `return` 在」。
 *   ⚠ **改注释不算**：本档头**上方这行**与真代码**逐字同文**（说明性）⇒ 变异须打**真代码**
 *     （棘轮自己 `stripComments` 剥注释 ⇒ 打在注释上的刀**零红**；本席与 `dev-10` 各栽过一次同一陷阱）。
 *   ⚠ **行为面的边界（诚实记）**：天然件**恒** `equipped: true` ⇒ `meleeAttack` 的「腾不出手」拒绝支
 *     （`!item.equipped && 手里有别的武器`）对**本档行为不可达** ⇒ 该刀证的是**契约形在**（✗ 行为路径）。
 *     行为面的等价守卫仍属各包 `combat` 档（同 `#1813` 各格的分工）。 */

/* 生成器：9 只同形（✗ 逐档抄 9 遍 ⇒ 改一处即可全改）。
 *  ⚠ 刻意**不**逐只写成独立 `RPG.defItem` 变量（件形一致 ⇒ 参数化更少漂移面）；
 *    但仍走 `RPG.defItem` 以拿 `Item` 子类（`equipped`／`perform`／`toJSON` 等契约面）。 */
const natAttack = ({ id, name, dmg, type, atkBonus, desc }) => RPG.defItem({
	id, name, desc,
	stats: {
		dmg,
		type,
		crit: 2,          // pinned 未给 ⇒ SRD 默认 ×2（house rule，见档头注记）
		atkBonus,         // ★显式照录 pinned Attack 行，✗ 引擎推导（见档头）
		natural: true,    // 标记：供将来「自然武器」面识别（✗ 现无消费者）
	},
	charges: null,
	stackable: false,
	weapon: true,
	slot: 'weapon',
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },

	used(that, from) {
		/* ★转发形（`#1813`）：见档头「委托形」。 */
		return DND3.meleeAttack(this, that, from);
	},
});

/* ── 逐值照录（pinned Attack 行；`--` 是 pin 文件的负号转写） ── */
/* Badger：`Claw +4 melee (1d2--1)` */
DND3.BadgerClaw = natAttack({
	id: 'badger-claw', name: '獾爪', dmg: '1d2', type: 'slashing', atkBonus: 4,
	desc: '短而利的爪，獾的看家本领。',
});
/* Boar：`Gore +4 melee (1d8+3)`（獠牙＝刺穿） */
DND3.BoarGore = natAttack({
	id: 'boar-gore', name: '野猪獠牙', dmg: '1d8', type: 'piercing', atkBonus: 4,
	desc: '一对向上翘的獠牙，专为冲撞而生。',
});
/* Lizard, Monitor：`Bite +5 melee (1d8+4)` */
DND3.MonitorLizardBite = natAttack({
	id: 'monitor-lizard-bite', name: '巨蜥咬', dmg: '1d8', type: 'piercing', atkBonus: 5,
	desc: '布满细齿的颚，咬住就不松口。',
});
/* Wolf：`Bite +3 melee (1d6+1)` */
DND3.WolfBite = natAttack({
	id: 'wolf-bite', name: '狼咬', dmg: '1d6', type: 'piercing', atkBonus: 3,
	desc: '狼的颚咬合力惊人，专挑咽喉。',
});
/* Bear, Brown：`Claw +11 melee (1d8+8)` */
DND3.BrownBearClaw = natAttack({
	id: 'brown-bear-claw', name: '熊爪', dmg: '1d8', type: 'slashing', atkBonus: 11,
	desc: '一掌能拍断小树的巨爪。',
});
/* Giant Bee：`Sting +2 melee (1d4 plus poison)`（毒不落，见档头） */
DND3.GiantBeeSting = natAttack({
	id: 'giant-bee-sting', name: '巨蜂蛰', dmg: '1d4', type: 'piercing', atkBonus: 2,
	desc: '尾针比手指还长，扎进肉里就是一阵剧痛。',
});
/* Giant Bombardier Beetle：`Bite +2 melee (1d4+1)` */
DND3.BombardierBeetleBite = natAttack({
	id: 'bombardier-beetle-bite', name: '投弹甲虫咬', dmg: '1d4', type: 'piercing', atkBonus: 2,
	desc: '强而有力的上颚，咬住便不肯放。',
});
/* Giant Fire Beetle：`Bite +1 melee (2d4)` */
DND3.FireBeetleBite = natAttack({
	id: 'fire-beetle-bite', name: '火甲虫咬', dmg: '2d4', type: 'piercing', atkBonus: 1,
	desc: '甲壳下的颚小而锐，咬起来却远比看上去疼。',
});
/* Giant Stag Beetle：`Bite +10 melee (4d6+9)` */
DND3.StagBeetleBite = natAttack({
	id: 'giant-stag-beetle-bite', name: '巨鹿甲虫咬', dmg: '4d6', type: 'piercing', atkBonus: 10,
	desc: '巨颚一合，连骨头都能夹碎。',
});
