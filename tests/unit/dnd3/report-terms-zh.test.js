/* `#1964` ①（`books#212` 第 1 项）：**战报术语中文化** —— 「攻击掷骰 … **vs AC** …」⇒「… **对 AC** …」
 *
 * `vs` 是界面术语（`AC` 本身是**规则术语**，保留 ✓），玩家面用**中文连接词** ✓。
 *
 * ## 本格覆盖什么（★读**真输出**，✗ 不读源码文本）
 *   本批 5 处同改：`dnd3/items/` 的 `trap-shock`／`trap-needle`／`trap-fire`／`bomb` ＋ `dnd-5e/core/combat.js`。
 *   **本案行为覆盖前 4 处**（dnd3 件：钉骰 ⇒ 必不中 ⇒ 看真报文）；每臂**两向**：
 *     ① 攻击掷骰行**真在**（✗ 否则「报文里没有 vs AC」可由「压根没打这一行」造成 ⇒ 恒真 ✓）；
 *     ② 该行用「对 AC」**且**「vs AC」不出现 ✓。
 *
 * ## ★明列缺口（✗ 不假装覆盖）
 *   **`dnd-5e/core/combat.js` 那一处不在本格**：5e 的攻击走**钩子形**（`ctx.roll` 那条链，
 *   经 5e 的 `PACK` 装载）⇒ 本 harness 的默认包是 dnd3 ⇒ 真跑一场 5e 攻击需要 5e 侧的战斗管线 ✗。
 *   ⇒ 该处**留缺口在册**（`#1964` 票面），✗ 不用「源码 grep」冒充行为面 ✓。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** ★房内形（同 `core/natural-attacks.test.js`）：报文的**唯一存放处**是 `State.variables.rpgNotices` ✓ */
	const buf = () => (State.variables.rpgNotices ?? []);

	/** 四件（id ⇒ 显示名，用于报错信息）——★与 `src/dnd/dnd3/items/` 同批 4 件一一对应 ✓ */
	const 件 = ['trap-shock', 'trap-needle', 'trap-fire', 'bomb'];

	const 造靶 = () => R().defCharacter({ id: 'zh-靶', name: '木桩', hp: 99, maxHp: 99, stats: D().stats({ ac: 30 }) });

	for (const id of 件) {
		test(`★#1964 ①：${id} 的攻击掷骰行须「对 AC」（真输出 · 两向）`, () => {
			const 定义 = R().items.get(id);
			assert.ok(定义, `未注册件「${id}」（本格要覆盖的那四件之一）`);
			const 实例 = (typeof R().createItem === 'function') ? R().createItem(id) : R().reviveItem({ id });
			assert.ok(实例 && typeof 实例.used === 'function', `件「${id}」须有可驱动的 used（本格前提）`);
			const 靶 = 造靶();
			State.variables.rpgNotices = [];
			R().rng.setSequence(Array.from({ length: 80 }, () => 0.0));   // ★骰面＝1 ⇒ 必不中（走 miss 分支）
			try { 实例.used(靶, null); } finally { R().rng.reset(); }
			const all = buf().map((n) => n.text).join('\n');
			/* ① 两向之一：那一行**真在** */
			assert.ok(new RegExp(`攻击掷骰\\s*\\d+[^（\\s]*\\s*对 AC\\s*\\d+`).test(all),   // ★允许修饰项（`1+0` 那种 ⇒ ✗ 别要求纯数字 ✓）
				`★${id}：须出现「攻击掷骰 N 对 AC M」那一行：${all.slice(0, 260)}`);
			/* ② 正断 ＋ 反向 */
			assert.ok(/对 AC/.test(all), `★${id}：攻击掷骰行须用「对 AC」：${all.slice(0, 260)}`);
			assert.eq(/vs AC/.test(all), false, `★${id}：「vs AC」不得出现在玩家面：${all.slice(0, 260)}`);
		});
	}
})();
