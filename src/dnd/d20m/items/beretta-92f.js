/* D20M 道具 —— 贝瑞塔 92F（9mm 自动手枪）
 *
 * 数值出处：SRD d20M · source/1Modern现代/25msrdequipmentweaponsandarmor武器与盔甲.md:71
 *   （Ranged Weapons 表「Beretta 92F (9mm autoloader)」行）
 *   源表逐列读数：Damage 2d6｜Critical 20｜Damage Type Ballistic｜Range Increment 40 ft｜
 *   Rate of Fire S｜Magazine 15 box｜Size Small｜Weight 3 lb｜Purchase DC 16｜Restriction Lic (+1)。
 *   「Critical」列语义见同文 :23（「If the threat is confirmed, a weapon deals double damage」）
 *   ⇒ 威胁 20、确认命中则伤害掷两次 ⇒ 落 `critMin: 20` ＋ `crit: 2`。
 *
 * ★✗ 落 `cost`：源的取得面是 **Purchase DC**（:71 第 10 列），而本仓裁定「黄金贯穿始终」
 *   （books#72）⇒ Purchase DC→金数的映射属**后续票**（house rule 面）—— ✗ 凭空造映射。
 * ★✗ 落 Rate of Fire／Magazine：连发与弹匣**无引擎承载体**（#1744 票面 ✗ 不做清单）⇒ 本笔只声明伤害面。
 */

D20M.Beretta92F = RPG.defItem({
	id: 'beretta-92f', name: '贝瑞塔 92F', desc: '9mm 自动手枪，警用与军用的常见制式。',
	stats: { dmg: '2d6', type: 'ballistic', critMin: 20, crit: 2, range: 40, weight: 3,
		ranged: true },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return D20M.attack(this, that, from); },
});
