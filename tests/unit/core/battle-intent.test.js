/* core/42-battle-intent（`sgstory#1914` 增量 3/3）：**稳定标识**与**候选集**的判据面。
 *
 * ★本档的纪律（本席在 `#1914` D 席复核里写的第①条）：**判据先写、先跑、须在现码上红**。
 *   故每条注释里写明「现码读数」，跑出来若不红，说明判据本身写错了。
 * ★★本档是**修正后**的版本：首版我按「目标选项＝两条」写，实跑得 3 条 —— 因为**玩家自己也在候选里**
 *   （现码 `buildPlayerOptions` 的 `targetOptions` 恒为「所有未出局者」，正是本增量要治的那处）。
 *   ⇒ 判据按**观测到的**结构重写；并把「玩家在伤害类候选里」**单列一条**（它本身就是缺陷，且实测可致打自己）。
 *
 * 本档断三件（各治一个病，互不代过）：
 *   ① **选项值唯一指向一个单位**：三条目标选项的 `value` 不得有重复。
 *      现码读数：`["旅行者","幼獾","幼獾"]` ⇒ 两条同名**逐字相同** ⇒ 本断言**红**。
 *   ② **选第二个同名单位 ⇒ 只第二个掉血**：按 `targetOptions` 里**第二个幼獾**那条给出的值去选。
 *      现码读数：`find((c) => c.name === '幼獾')` 必取**第一个** ⇒ 甲掉血、乙不掉 ⇒ 本断言**红**。
 *   ③ **伤害类候选不含己方**：目标候选里不得出现玩家自己。
 *      现码读数：候选首项就是 `旅行者（己方）` ⇒ 本断言**红**；且**实测**：凡选第一项（脚本驱动的自然形）
 *      即**打自己**（本席调试时玩家 hp 直接归 0）。
 *
 * ⚠️ 桩化对象是**类级单例** `setup.DND3.Player` ⇒ 一律经 `withPlayerStubs()`（`finally` 还原／删除）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	const withPlayerStubs = async (stubs, fn) => {
		const P = setup.DND3.Player;
		const saved = new Map();
		const added = [];
		for (const k of Object.keys(stubs)) {
			if (Object.prototype.hasOwnProperty.call(P, k)) saved.set(k, P[k]);
			else added.push(k);
			P[k] = stubs[k];
		}
		try { return await fn(); } finally {
			for (const [k, v] of saved) P[k] = v;
			for (const k of added) delete P[k];
		}
	};

	/** ★连同**玩家单例的可变态**一起存/复原。
	 *   既有档的 `withPlayerStubs` 只存方法（`items`／`choice`），而 `DND3.Player` 的 **hp／nonlethal／effects
	 *   ／death 跨用例长存** ⇒ 前序用例把它打到 0 后，本档的「玩家出刀」根本不会发生
	 *   （本席实测：判据②就是这样红的 —— 两只敌都不掉血，✗ 标识有问）。⇒ 本档自己担起态复原。 */
	const 存态 = () => {
		const P = D().Player;
		return { P, hp: P.hp, nonlethal: P.nonlethal, effects: (P.effects ?? []).slice(), death: P.death };
	};
	const 复态 = (s) => {
		s.P.hp = s.hp; s.P.nonlethal = s.nonlethal; s.P.effects = s.effects; s.P.death = s.death;
	};

	/** ★确定性（承同族档的教训：**✗ 概率格**）：把随机流钉成「必命中」。
	 *   不钉的话，是否命中取决于**前序用例**留下的 rng 状态 ⇒ 同一判据会时红时绿。 */
	const 钉随机 = () => { R().rng.setSequence(Array.from({ length: 200 }, () => 0.99)); };
	const 松随机 = () => { R().rng.reset(); };

	/** 摆一场：玩家持械已装备，两只**同名**敌（血厚 ⇒ 不会被打死，便于看「谁掉了血」）。 */
	const 摆一场 = () => {
		State.variables.inventory = [];
		R().give('club'); R().equip('club');
		D().Player.hp = D().Player.maxHp;      // ★玩家须**活着**：出局者不出手
		D().Player.nonlethal = 0;
		D().Player.effects = [];
		D().Player.death = false;
		const 甲 = new (R().Character)({ name: '幼獾', hp: 9999, maxHp: 9999 });
		const 乙 = new (R().Character)({ name: '幼獾', hp: 9999, maxHp: 9999 });
		return { battle: new (R().Battle)(8, [D().Player], [甲, 乙], true), 甲, 乙 };
	};

	test('battle intent ①：目标选项的 `value` 须唯一指向一个单位（✗ 同名逐字相同）', async () => {
		const s = 存态();
		try {
			const { battle } = 摆一场();
			const { targetOptions } = battle.buildPlayerOptions(D().Player);
			const 值 = targetOptions.map((o) => o.value);
			assert.ok(
				new Set(值).size === 值.length,
				`★有选项的值重复 ⇒ 选谁分不出来（实得 ${JSON.stringify(值)}）`
					+ ' —— 稳定标识要求「一个值唯一指向一个单位」，✗ 名字'
			);
		} finally { 复态(s); }
	});

	test('battle intent ②：按**第二个**同名单位的选项值去选，只它掉血（现码必红）', async () => {
		const s = 存态();
		try {
			const { battle, 甲, 乙 } = 摆一场();
			钉随机();
			const 前 = [甲.hp, 乙.hp];
			const { itemOptions, targetOptions } = battle.buildPlayerOptions(D().Player);
			const 道具值 = itemOptions.find((o) => o.value !== 'skip' && o.value !== 'unarmed'
				/* ★`#1918`：一键项（`quick:` 前缀）也**不是**槽位下标 ⇒ 不取它。
				 *   本用例要的是「走完三问的那条路」（两个同名敌 ⇒ 不出一键项），但它不该靠
				 *   「当时背包里恰好没有治疗件」（治疗件的候选恰一是常态）来成立。 */
				&& !String(o.value).startsWith('quick:'))?.value;
			assert.ok(道具值 != null, '没有可用道具选项');
			/* 目标候选的次序由现码给出：末两条是两只同名敌。 */
			const 第二个敌的选项 = targetOptions[targetOptions.length - 1];
			assert.ok(第二个敌的选项 != null, '目标选项不足');
			const seq = [道具值, 'use', 第二个敌的选项.value];

			await withPlayerStubs(
				{ items: State.variables.inventory, choice: async () => (seq.length ? seq.shift() : 'skip') },
				() => battle.execute()
			);

			const 后 = [甲.hp, 乙.hp];
			/* ★报文里**同时**给出两只的读数：这样「红」自带诊断 ——
			 *   若是「甲掉、乙没掉」＝标识落在了第一个（本增量要治的）；
			 *   若是「两只都没掉」＝另有别因（那与标识无关，得另查）。 */
			assert.ok(
				后[1] < 前[1],
				`★玩家点的是第二个同名单位，而它没掉血（甲 ${前[0]}⇒${后[0]}｜乙 ${前[1]}⇒${后[1]}）`
			);
			assert.ok(后[0] === 前[0], `★第一个同名单位被打了（甲 ${前[0]}⇒${后[0]}）—— 目标标识落在了第一个`);
		} finally { 松随机(); 复态(s); }
	});

	test('battle intent ③：伤害类动作的目标候选**不含己方**（现码必红）', async () => {
		const s = 存态();
		try {
			const { battle } = 摆一场();
			const 我 = D().Player;
			const { targetOptions } = battle.buildPlayerOptions(D().Player);
			const 含我 = targetOptions.some((o) => o.value === 我.name);
			assert.ok(
				!含我,
				`★候选里有玩家自己（${JSON.stringify(targetOptions.map((o) => [o.text, o.value]))}）`
					+ ' —— 伤害类只该列敌方；选中自己即自伤（本席调试实测：玩家 hp 直接归 0）'
			);
		} finally { 复态(s); }
	});
})();
