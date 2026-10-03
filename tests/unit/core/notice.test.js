/* core/71-notice 的单元测试：通知中心与过滤器（能力伞首期 B4 · `#1798`）
 *
 * 纪律（承 `tests/README.md`）：
 *   · 用**本用例私有的通道**（`unit-` 前缀）隔离，✗ 依赖内容侧通道表；
 *   · 「进正文 vs 只进通知中心」的判据**观测 `RPG.deferOutput` 的调用**（它是 `perform` 落地的唯一入口，
 *     且在无头环境里是可控的）—— ✗ 靠 DOM（无头是 no-op 桩）；
 *   · **默认档必须零行为变化**是本笔的第一安全属性 ⇒ 单列一条用例钉住。
 */
(() => {
	const R = () => setup.RPG;
	const S = () => State.variables;

	/** 观测「有多少行真的进了正文」：`perform` 落地必过 `deferOutput` */
	const withOutputSpy = (fn) => {
		const orig = R().deferOutput;
		const seen = [];
		R().deferOutput = (build) => { seen.push(1); return build(); };
		try { fn(); } finally { R().deferOutput = orig; }
		return seen.length;
	};

	const reset = () => {
		R().clearNotices();
		R().setNoticeFilter('all');
		R().noticeLimit = 200;
	};

	/* ---------- ① 注册表 ---------- */
	test('B4：通道注册表（level 校验／重复注册告警不抛／未注册回落 default 但保留 id）', () => {
		const def = R().defNotice('unit-n1', { name: '单测通道', level: 'key' });
		assert.eq(def.level, 'key', '注册应回读 level');
		assert.eq(R().noticeChannel('unit-n1').name, '单测通道', '应能按 id 取回');
		let threw = null;
		try { R().defNotice('unit-n2', { level: 'loud' }); } catch (e) { threw = e; }
		assert.ok(threw !== null, '★非法 level 应抛（✗ 静默回落 —— 拼错档位会被当成「过滤没生效」）');
		const fb = R().noticeChannel('unit-undeclared');
		assert.eq(fb.level, 'log', '未注册通道 ⇒ 级别回落 log');
		assert.eq(fb.id, 'unit-undeclared', '未注册 ⇒ **保留**请求的 id（面板要能显示来源）');
		assert.eq(fb.declared, false, '未注册 ⇒ declared:false（可判）');
		assert.eq(R().noticeChannel(null).id, 'default', '不传 ⇒ default 通道');
	});

	/* ---------- ② 默认档零行为变化（第一安全属性） ---------- */
	test('B4：★默认档 `all` ⇒ 既有 `perform(text)` 行为零变化（仍进正文，且进通知）', () => {
		reset();
		assert.eq(R().noticeFilter, 'all', '默认档应是 all');
		const n = withOutputSpy(() => { R().perform('一行没有任何 opts 的输出。'); });
		assert.eq(n, 1, '★默认档下应进正文（=既有行为）');
		const list = R().notices();
		assert.eq(list.length, 1, '同时应进通知缓冲（供回看）');
		assert.eq(list[0].channel, 'default', '通道应是 default');
		assert.eq(list[0].level, 'log', '级别应是 log');
	});

	test('B4：「仅关键」档 ⇒ 常态行只进通知中心、结论行进正文（两向都断）', () => {
		reset();
		R().setNoticeFilter('key');
		const n1 = withOutputSpy(() => { R().perform('逐回合的常态行。'); });
		assert.eq(n1, 0, '★常态化行在「仅关键」档下**不进正文**');
		const n2 = withOutputSpy(() => { R().perform('战斗结束：敌方被击败！', { channel: 'battle-end' }); });
		assert.eq(n2, 1, '★关键通道的行**仍进正文**');
		const list = R().notices();
		assert.eq(list.length, 2, '★两行**都**在通知缓冲里 ⇒ 过滤✗丢证据（只是不进正文）');
		assert.eq(list.filter((x) => x.level === 'key').length, 1, '其中一条是 key');
	});

	test('B4：多行文本按行入缓冲（✗ 只记一行），且空行不入', () => {
		reset();
		withOutputSpy(() => { R().perform('第一行\n\n第二行\n   \n第三行'); });
		assert.eq(R().notices().length, 3, `应按非空行计 3 条（实得 ${R().notices().length}）`);
	});

	/* ---------- ③ 缓冲（有界／持久／检索） ---------- */
	test('B4：缓冲有界（超上限丢最旧）＋ 落在 `State.variables`（随存档往返）', () => {
		reset();
		R().noticeLimit = 3;
		for (const t of ['a', 'b', 'c', 'd']) R().pushNotice(t);
		const list = R().notices();
		assert.eq(list.length, 3, '应受上限约束');
		assert.eq(list.map((n) => n.text).join(','), 'd,c,b', '新的在前，最旧的被丢');
		assert.ok(Array.isArray(S().rpgNotices), '★缓冲应在 State.variables（✗ 存堆上）');
		assert.eq(S().rpgNotices.length, 3, 'State 里也是 3 条');
		/* 存档往返：JSON 克隆后仍是纯数据（无函数/无循环） */
		const round = JSON.parse(JSON.stringify(S().rpgNotices));
		assert.eq(round.length, 3, '往返后条数不变');
		R().noticeLimit = 200;
	});

	test('B4：`notices()` 可按通道／级别检索；`clearNotices()` 清空', () => {
		reset();
		R().pushNotice('常态一');
		R().pushNotice('关键一', { channel: 'unit-n1' });
		R().pushNotice('关键二', { channel: 'unit-n1' });
		assert.eq(R().notices({ channel: 'unit-n1' }).length, 2, '按通道检索');
		assert.eq(R().notices({ level: 'key' }).length, 2, '按级别检索');
		assert.eq(R().notices({ limit: 1 }).length, 1, 'limit 生效');
		R().clearNotices();
		assert.eq(R().notices().length, 0, '清空应生效');
	});

	/* ---------- ④ 过滤档状态 ---------- */
	test('B4：过滤档落 State（存档往返）＋非法值抛错', () => {
		reset();
		assert.eq(R().setNoticeFilter('key'), 'key', '设置应回读');
		assert.eq(S().rpgNoticeFilter, 'key', '★应落 State.variables（✗ 存模块级变量）');
		assert.eq(R().noticeFilter, 'key', 'getter 应一致');
		let threw = null;
		try { R().setNoticeFilter('some'); } catch (e) { threw = e; }
		assert.ok(threw !== null, '非法档位应抛');
		assert.eq(R().noticeFilter, 'key', '抛错不应改状态');
		R().setNoticeFilter('all');
	});

	/* ---------- ⑤ 呈现 ---------- */
	test('B4：开关链显示**当前档**与条数，`data-mode` 指向**另一档**', () => {
		reset();
		R().setNoticeFilter('all');
		R().pushNotice('x');
		const a = R().noticeToggleHTML();
		assert.ok(a.includes('通知：全部'), `当前档应显示为全部：${a}`);
		assert.ok(a.includes('data-mode="key"'), '★data-mode 应指向**另一档**（点一下切过去）');
		assert.ok(a.includes('（1）'), '应带条数');
		R().setNoticeFilter('key');
		const b = R().noticeToggleHTML();
		assert.ok(b.includes('通知：仅关键') && b.includes('data-mode="all"'), '反向同理');
		R().setNoticeFilter('all');
	});

	test('B4：面板体转义 ＋ key/log 分级 class ＋ 通道名', () => {
		reset();
		R().pushNotice('<b>x</b> & "y"');
		R().pushNotice('结论行', { channel: 'unit-n1' });
		const html = R().noticesHTML();
		assert.ok(!html.includes('<b>x</b>'), '★通知文本必须转义');
		assert.ok(html.includes('&lt;b&gt;'), '转义后的实体应在');
		assert.ok(html.includes('rpg-notice-key'), 'key 通道的条目应带 key class');
		assert.ok(html.includes('单测通道'), '非 default 通道应显示通道名');
		assert.eq(R().noticesHTML({ limit: 0 }), '<span class="rpg-notice-empty">（没有通知）</span>',
			'★`limit: 0` 应给空（✗ `slice(-0)` 取全部 —— JS 的 -0 陷阱）');
		assert.eq(R().notices({ limit: 0 }).length, 0, '`notices({limit:0})` 同样应为空');
		R().clearNotices();
		assert.eq(R().noticesHTML(), '<span class="rpg-notice-empty">（没有通知）</span>',
			'真·空列表应给占位（✗ 空白）');
	});

	test('B4：UI 绑定幂等（无头桩下不抛）', () => {
		R().__noticeUIBound = false;
		assert.eq(R().bindNoticeUI(), true, '首次绑定 true');
		assert.eq(R().bindNoticeUI(), false, '★再次调用应早退（幂等）');
	});

	/* ---------- ★`books#170` P1-5（试玩反馈）：面板须**新的在前** ---------- */
	test('B4：`noticesHTML` 取**最新**若干条（对「新→旧」的列表再 tail ⇒ 会出最旧那几条）', () => {
		reset();
		for (let i = 1; i <= 5; i++) R().pushNotice(`第${i}条`, { channel: 'unit-p15' });
		const 读序 = (h) => [...String(h).matchAll(/第(\d)条/g)].map((m) => m[1]).join(',');
		assert.eq(读序(R().noticesHTML({ limit: 3 })), '5,4,3',
			'★面板头三条应是 5,4,3（新的在前）；若得 1,2,3 即取到**反尾**＝显示最旧那几条（试玩反馈的形）');
		assert.eq(R().notices({ channel: 'unit-p15', limit: 3 }).map((n) => n.text).join(','), '第5条,第4条,第3条',
			'`notices()` 自身的顺序契约＝新的在前（面板据此取头，钳位仍只在这一处）');
	});

})();
