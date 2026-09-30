/* core/40-battle 回合生命周期钩子（RPG.turnBoundary）的单元测试 —— #1713 契约②
 *
 * 判据形态：**调用面探针计次 + 事件序列断言**（不做「事后状态」推断）；
 * 闸门可执行判据（C-F1）：`RPG.rng.setSequence([0.5])` 注入**恰 1 个**值 ⇒ 被拦回合后
 * `RPG.rng.pick(20)` 仍能取值（=11）——若闸门被移到选靶之后，该值已被消耗 ⇒ 断言立刻红。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** 事件探针：登记 start/end/遗留 三类，返回 { log, off }；log 项 = [事件, 行动者名] */
	const probeEvents = () => {
		const log = [];
		const offs = ['battle:turnStart', 'battle:turnEnd', 'battle:turn'].map((type) => {
			const fn = (p) => log.push([type, (p.actor ?? p.attacker ?? {}).name ?? '(?)']);
			R().events.on(type, fn);
			return () => R().events.off(type, fn);
		});
		return { log, off: () => offs.forEach((f) => f()) };
	};

	/** console 探针（必须还原） */
	const probeConsole = (method, fn) => {
		const orig = console[method];
		const calls = [];
		console[method] = (...a) => { calls.push(a); };
		try {
			fn();
		} finally {
			console[method] = orig;
		}
		return calls;
	};

	/** 复位参战者（harness 只复位 State/rng） */
	const resetGoblin = () => {
		D().Goblin.hp = 6;
		D().Goblin.items = [{ id: 'club', equipped: true }, { id: 'coin' }];
		D().Goblin.effects = [];
	};

	/** 必杀武器：0 骰面（确定性强）；挂在玩家身上 */
	const godSword = () => {
		R().defItem({
			id: 'u-god-sword', name: '裁决之剑', weapon: true, slot: 'weapon', stats: { dmg: '20' },
			used(that) { that.hp = 0; D().grantDeathIfDown(that); },
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		});
	};

	const makePlayer = (items = []) =>
		new (R().Character)({ name: '测试员', hp: 30, maxHp: 30, stats: D().stats({ ac: 30 }), items });

	test('turnBoundary：自动通路——start/遗留/各恰好一次、顺序 start→turn→end；回合内出局者不发事件', async () => {
		resetGoblin(); godSword();
		const p = makePlayer([{ id: 'u-god-sword', equipped: true }]);
		const { log, off } = probeEvents();
		try {
			await new (R().Battle)(2, [p], [D().Goblin]).execute();
			// 第 1 回合：测试员杀哥布林（start→turn→end）；哥布林随后 isOut ⇒ 无任何事件；
			// 第 2 回合：敌方全灭 ⇒ 回合循环顶部 break（无事件）。
			assert.eq(JSON.stringify(log), JSON.stringify([
				['battle:turnStart', '测试员'], ['battle:turn', '测试员'], ['battle:turnEnd', '测试员'],
			]), '事件序列（回合内被击倒者不发任何事件）');
		} finally {
			off();
		}
	});

	test('turnBoundary：交互通路——同样 start/end 各恰好一次；遗留事件不补发', async () => {
		resetGoblin(); godSword();
		const p = makePlayer(); // 无道具 ⇒ #playerAction 早退（无需 choice 桩）
		Object.defineProperty(p, 'properties', { value: ['player'], configurable: true });
		const { log, off } = probeEvents();
		try {
			await new (R().Battle)(1, [p], [D().Goblin], true).execute();
			assert.eq(JSON.stringify(log), JSON.stringify([
				['battle:turnStart', '测试员'], ['battle:turnEnd', '测试员'],
				['battle:turnStart', '哥布林'], ['battle:turn', '哥布林'], ['battle:turnEnd', '哥布林'],
			]), '交互与自动同序各一次；交互者无遗留事件');
		} finally {
			off();
		}
	});

	test('turnBoundary：闸门 cancel ⇒ 该行动者不行动、仍收 end；C-F1（被拦回合不消耗 rng）', async () => {
		resetGoblin(); godSword();
		const p = makePlayer([{ id: 'u-god-sword', equipped: true }]);
		const offStart = R().events.on('battle:turnStart', (pl) => { pl.cancel = true; });
		R().rng.setSequence([0.5]); // 恰注入 1 个值
		const probe = probeEvents(); // 被拦回合须 start/end 成对（拔掉 40-battle.js 闸门分支里的 end 即应红）
		try {
			await new (R().Battle)(1, [p], [D().Goblin]).execute();
			assert.eq(D().Goblin.hp, 6, '被拦 ⇒ 哥布林未受伤');
			assert.eq(p.hp, 30, '被拦 ⇒ 玩家未受伤');
			assert.eq(R().rng.pick(20), 11, 'C-F1：注入的 1 值未被消耗（1+floor(0.5*20)=11）');
			// 被拦回合亦须 start/end 成对、且不发遗留 battle:turn。
			// 本场两方都被拦 ⇒ 按**行动者**分别断言，并断言 start/end 总数相等。
			const mine = probe.log.filter(([, n]) => n === '测试员').map(([tp]) => tp);
			assert.eq(JSON.stringify(mine), JSON.stringify(['battle:turnStart', 'battle:turnEnd']),
				'被拦回合：测试员 start/end 各一次（拔掉 40-battle.js 闸门分支的 end 即应红）');
			assert.eq(probe.log.filter(([tp]) => tp === 'battle:turnStart').length,
				probe.log.filter(([tp]) => tp === 'battle:turnEnd').length, '被拦回合：start 与 end 数量相等');
			assert.eq(probe.log.some(([tp]) => tp === 'battle:turn'), false, '被拦回合不发遗留 battle:turn');
		} finally {
			offStart();
			probe.off();
			R().rng.reset();
		}
		// 对照组：不设闸门时同场战斗**会**消耗（证明上式的红是有意义的）
		resetGoblin();
		R().rng.setSequence([0.5, 0.5]);
		try {
			const p2 = makePlayer([{ id: 'u-god-sword', equipped: true }]);
			await new (R().Battle)(1, [p2], [D().Goblin]).execute();
			assert.eq(R().rng.pick(20), 11, '对照：正常回合消耗了第 1 个注入值（选靶），此处取的是第 2 个');
		} finally {
			R().rng.reset();
		}
	});

	test('turnBoundary：cancel 只认 === true（truthy 非布尔不取消）；reason 非字符串忽略', async () => {
		resetGoblin(); godSword();
		const p = makePlayer([{ id: 'u-god-sword', equipped: true }]);
		const offStart = R().events.on('battle:turnStart', (pl) => { pl.cancel = 'yes'; pl.reason = 42; });
		try {
			await new (R().Battle)(1, [p], [D().Goblin]).execute();
			assert.ok(D().Goblin.isDown, "cancel='yes'（truthy 非 true）不取消 ⇒ 哥布林被击倒");
		} finally {
			offStart();
		}
		// reason 非字符串 ⇒ 返回 null（不进打印）
		const gate = R().turnBoundary.start({ actor: p, battle: null });
		assert.eq(gate.cancel, false, '无订阅 ⇒ 不取消');
		assert.eq(gate.reason, null, 'reason 缺省 null');
	});

	test('turnBoundary：turnEnd payload 冻结；订阅方抛错吞并 + console.error，战斗继续', async () => {
		resetGoblin(); godSword();
		const p = makePlayer([{ id: 'u-god-sword', equipped: true }]);
		let endPayload = null;
		const offEnd = R().events.on('battle:turnEnd', (pl) => { endPayload = pl; });
		const offBoom = R().events.on('battle:turnStart', () => { throw new Error('订阅方故障'); });
		try {
			const calls = probeConsole('error', async () => {
				await new (R().Battle)(1, [p], [D().Goblin]).execute();
			});
			assert.ok(calls.length >= 1, '订阅方抛错被 console.error 记录');
			assert.ok(D().Goblin.isDown, '吞并后战斗继续（哥布林仍被击倒）');
			assert.ok(Object.isFrozen(endPayload), 'turnEnd payload 冻结');
			assert.eq(endPayload.actor, p, '冻结的 payload 仍带行动者');
		} finally {
			offEnd(); offBoom();
		}
	});

	test('turnBoundary：定义级 hooks 按持有效果的数组序执行、抛错不中断其余、不能取消回合', async () => {
		resetGoblin(); godSword();
		const order = [];
		R().defEffect({ id: 'u-hookA', hooks: { onTurnEnd() { order.push('A'); } } });
		R().defEffect({
			id: 'u-hookB',
			hooks: {
				// hooks 只读：同时尝试写第一参（角色）与第二参（ctx）——两者都不得取消回合
				onTurnStart(actor, ctx) {
					actor.cancel = true; ctx.cancel = true;
					order.push('B-start');
				},
				onTurnEnd() { throw new Error('B 故障'); },
			},
		});
		R().defEffect({ id: 'u-hookC', hooks: { onTurnEnd() { order.push('C'); } } });
		const p = makePlayer([{ id: 'u-god-sword', equipped: true }]);
		p.gain('u-hookA'); p.gain('u-hookB'); p.gain('u-hookC'); // 数组序 = A, B, C
		const offEnd = R().events.on('battle:turnEnd', () => {});
		try {
			const calls = probeConsole('error', async () => {
				await new (R().Battle)(1, [p], [D().Goblin]).execute();
			});
			assert.eq(JSON.stringify(order), JSON.stringify(['B-start', 'A', 'C']),
				'hooks 数组序（A→C），B 的 start 先于 end 面钩子');
			assert.ok(D().Goblin.isDown, 'hook 试图置 cancel 无效（两参都试过）⇒ 回合照常行动');
			assert.ok(calls.length >= 1, 'B 的 onTurnEnd 抛错被 console.error 吞并');
			assert.ok(calls.some((c) => String(c[0]).includes('u-hookB')), '错误归属到具体效果 id');
		} finally {
			offEnd();
		}
	});

	test('turnBoundary：交互通路 body 抛错时仍发 turnEnd（finally 的判据）', async () => {
		resetGoblin(); godSword();
		// 玩家持 1 件道具 + choice 桩**同步抛错** ⇒ #playerActionBody 真实抛错出口
		// （headless 里真 choice 返回永不 settle 的 Promise ⇒ 必须用同步抛错桩，实例自有属性、零原型污染）
		const p = makePlayer([{ id: 'u-god-sword', equipped: true }]);
		Object.defineProperty(p, 'properties', { value: ['player'], configurable: true });
		p.choice = () => { throw new Error('choice 桩故障'); };
		let threw = false;
		const { log, off } = probeEvents();
		try {
			try {
				await new (R().Battle)(1, [p], [D().Goblin], true).execute();
			} catch (e) {
				threw = true; // 抛错向外传播（不与结算面混淆）
			}
			const mine = log.filter(([, n]) => n === '测试员').map(([tp]) => tp);
			assert.eq(JSON.stringify(mine), JSON.stringify(['battle:turnStart', 'battle:turnEnd']),
				'body 抛错后 turnEnd 仍恰好一次（finally）');
			assert.ok(threw, '抛错本身向外传播（本面只负责收尾）');
		} finally {
			off();
		}
	});

	test('turnBoundary：独立调用（不经 Battle）——start/end 可直接用，end 的 payload 冻结', () => {
		const actor = makePlayer();
		const { log, off } = probeEvents();
		try {
			const gate = R().turnBoundary.start({ actor, battle: null });
			assert.eq(JSON.stringify(gate), '{"cancel":false,"reason":null}', '无订阅 ⇒ 放行');
			R().turnBoundary.end({ actor, battle: null });
			assert.eq(JSON.stringify(log.map(([t]) => t)), JSON.stringify(['battle:turnStart', 'battle:turnEnd']),
				'两条事件各一次（遗留 battle:turn 不发）');
		} finally {
			off();
		}
	});
})();
