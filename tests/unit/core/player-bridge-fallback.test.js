/* `sgstory#1853`：桥接面「`$player` **给了但漏键**」的兜底/发声 —— 三包同解（形裁定 2026-10-05）
 *
 * 病（`#1787` 的同族剩余面）：故事手写 `$player` 可能**漏键**，而 `state()` 只在 `$player == null` 时用 DEFAULTS
 *   ⇒ 对「给了但没给全」的 `$player`，**DEFAULTS 根本不参与**，缺键即 `undefined`
 *   ⇒ 症状离病因极远：状态栏 HP 空白/NaN、**首击即倒**（写入路径有 `?? 0` 兜底 ⇒ 把 undefined 当 0）、文案出现 `undefined`。
 *
 * 形（★操作者标准流裁定，✗ 不是我看哪边顺眼）：
 *   · `name`／`hp`／`maxHp` ⇒ **fail-loud**（具名抛错；静默造值会**改变玩法**：兜 0 即死、兜 18 凭空回血）；
 *   · `stats` ⇒ **write-back**（读时缺失就地建、返回**同一引用** ⇒ 就地写生效）。
 *     ★为何不取「对齐成 `?? {}`」：`?? {}` 每次读都造**新对象** ⇒ 本仓**成文惯用法**「就地写 `D.Player.stats.dex = 20`」
 *       会**静默丢失**（读回 undefined ✗）—— 那正是另一包「响亮失败」被换成「静默失败」✗。
 *
 * ## 判据（每条都读**真桥接面**，✗ 不读源码文本）
 *   ① 三包各一格：漏 `hp` ⇒ **具名抛错**（✗ 不得静默给 0/NaN）；
 *   ② 一格：`$player == null` ⇒ **仍走 DEFAULTS 且不抛**（防修出回归）；
 *   ③ `stats` 三包各一格：漏 `stats` ⇒ 读面为 `{}`，**且** `P.stats.dex = 99` 之后**读回 99**
 *      ★后半句才是关键：只断 `=== {}` 的格**放不住**「静默漏损」；
 *   ④ `name`／`maxHp` 各一格（同一 fail-loud 形）。
 */
(() => {
	const R = () => setup.RPG;
	const 包 = () => [setup.DND3, setup.DND5E, setup.D20M];
	const 名 = ['dnd3', 'dnd-5e', 'd20m'];

	/** 把 `$player` 造成「给了但漏键」那一态，跑完**必还原**（✗ 不给后面的格留脏）。 */
	const 在漏键态 = (漏掉的键, fn) => {
		const 原 = State.variables.player;
		try {
			const p = { name: '探针', hp: 18, maxHp: 20, stats: {}, effects: [] };
			for (const k of 漏掉的键) delete p[k];
			State.variables.player = p;
			return fn(p);
		} finally { State.variables.player = 原; }
	};

	test('★#1853 ①：三包——漏 `hp` ⇒ 具名抛错（✗ 不得静默给 0/NaN）', () => {
		const 包们 = 包();
		for (let i = 0; i < 3; i++) {
			let 抛 = null;
			try { 在漏键态(['hp'], () => 包们[i].Player.hp); } catch (e) { 抛 = e; }
			assert.ok(抛, `★${名[i]}：漏 hp 须抛（✗ 静默返回 undefined/0 —— 「首击即倒」正是这么来的）`);
			assert.ok(/hp/.test(抛.message), `★${名[i]}：报文须含**键名**（实得「${抛.message.slice(0, 60)}」）`);
		}
	});

	test('★#1853 ②：`$player == null` ⇒ 仍走 DEFAULTS 且**不抛**（防修出回归）', () => {
		const 包们 = 包();
		const 原 = State.variables.player;
		try {
			State.variables.player = null;
			for (let i = 0; i < 3; i++) {
				const hp = 包们[i].Player.hp;
				assert.ok(typeof hp === 'number' && hp > 0, `★${名[i]}：$player 缺失须走 DEFAULTS（实得 hp=${hp}）`);
			}
		} finally { State.variables.player = 原; }
	});

	test('★#1853 ③：三包——漏 `stats` ⇒ 读面 `{}` **且就地写读得回**（照妖镜：`?? {}` 形过不了后半句）', () => {
		const 包们 = 包();
		for (let i = 0; i < 3; i++) {
			在漏键态(['stats'], () => {
				const st = 包们[i].Player.stats;
				assert.eq(typeof st, 'object', `★${名[i]}：漏 stats 时读面须为对象`);
				assert.eq(Object.keys(st).length, 0, `★${名[i]}：须是空对象`);
				st.dex = 99;                                   // ★就地写（本仓成文惯用法）
				assert.eq(包们[i].Player.stats.dex, 99,
					`★${名[i]}：就地写**须读得回**（✗ 只兜底 `?? {}` 会静默丢失 —— 那正是本格的后半句要抓的）`);
			});
		}
	});

	test('★#1853 ④：`name`／`maxHp` 同形（具名抛错）', () => {
		const 包们 = 包();
		for (let i = 0; i < 3; i++) {
			for (const k of ['name', 'maxHp']) {
				let 抛 = null;
				try { 在漏键态([k], () => 包们[i].Player[k]); } catch (e) { 抛 = e; }
				assert.ok(抛 && new RegExp(k).test(抛.message), `★${名[i]}：漏 ${k} 须具名抛错`);
			}
		}
	});
})();
