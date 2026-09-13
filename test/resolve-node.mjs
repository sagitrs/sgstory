// 「结算可脱离浏览器」（#441-A 的验收之一）＋ 三条伴随纪律的**常设门**。
//
// 为什么需要它：`#441-A` 把位点判定的「算」从 `<<sitecheck>>` widget 里剥出来，验收之一就是
// **不经浏览器（CDP/jsdom）也能驱动 `resolve()`** —— 否则「抽纯函数」只是换了个写法，没换来可测性。
// 本门在 **node** 里用 `scripts/audit/context.mjs` 直载 `src/*.twee` 的 `[script]` 段（无 jsdom），
// 注入确定性随机源后逐条断言判定结果。
//
// 四条判据（与 PR 里贴的验收一一对应）：
//   ① `rng` 可注入：注入后结果确定；未注入且无 SugarCube `random` ⇒ **明确报错**（不许静默 0/NaN）；
//   ② `rollSite` **是纯函数**（不写 `State`）；`resolve` 只多写结果槽 `$last_check`（sim 侧）；
//   ③ 优势/劣势**推导**在 sim 侧且与旧 widget 等价（道具·行囊·情报·位点自带 dis）；
//   ④ `10-kernel`／`50-present` 不得**直调 `Math.random()`**；两处 widget（`sitecheck`／`hallResult`）
//      **体内不得出现 `<<set $…>>`**（present 不写状态）。
//
// 用法：node test/resolve-node.mjs [--selftest]
import { readFileSync } from 'node:fs';
import { allSourceFiles, sourcePath } from '../scripts/module-order.mjs';
import { createContext } from '../scripts/audit/context.mjs';

const SELFTEST = process.argv.includes('--selftest');

// ── 纯函数（供自证）：从源码里取出某个 widget 的**体内**文本 ──
export const widgetBody = (src, name) => {
	const m = new RegExp(`<<widget\\s+"${name}"\\s*>>([\\s\\S]*?)<</widget>>`).exec(src);
	return m ? m[1] : null;
};
// 纯函数：剥掉注释（`/% … %/` 块 ＋ 整行 `//`）后再判——否则「注释里提到 `Math.random()`」会自己把自己判红
// （本文件与 `src/10-core.twee` 的注释里都写了这条纪律，正是这个假阳性的实例）
export const stripComments = (s) => String(s).replace(/\/%[\s\S]*?%\//g, '').replace(/^\s*\/\/.*$/gm, '');
// 纯函数：体内是否有**状态写点**（`<<set $…>>` / `State.variables…=`）
export const writesStoryState = (body) =>
	/<<set\s+\$/.test(body ?? '') || /State\.variables[.\[]/.test(body ?? '');

// 纯函数：机制**定义**是否漏在故事文件里（#519）——按签名匹配，避免"提到名字"就红。
export const mechanismInStory = (files, name) => {
	const def = new RegExp(`(^|\\n)\\s*${name}\\s*\\(\\s*poolId`);
	return files.filter(([, src]) => def.test(stripComments(src))).map(([f]) => f);
};

if (SELFTEST) {
	console.log('══ 结算门 · 自证 ══');
	const cases = [
		['正例：widget 体内无状态写点', '<<widget "a">><<give "x">><<checkres `r()`>><</widget>>', 'a', false],
		['反例：体内有 `<<set $…>>` → 必须检出', '<<widget "a">><<set $pc.hp to 1>><</widget>>', 'a', true],
		['反例：体内有 `State.variables` → 必须检出', '<<widget "a">><<run State.variables.pc.hp = 1>><</widget>>', 'a', true],
		['正例：体内只有临时变量 `_x`（非 story 状态）', '<<widget "a">><<set _x to 1>><</widget>>', 'a', false],
	];
	let bad = 0;
	for (const [label, src, name, want] of cases) {
		const got = writesStoryState(widgetBody(src, name));
		const ok = got === want;
		console.log(`  ${ok ? '✓' : '✗'} ${label}：检出 ${got}（期望 ${want}）`);
		if (!ok) bad++;
	}
	// #519：防回流——机制漏回故事文件必须能被抳住（自证：正例不报／反例必报）
	{
		const story = [['stories/x/15-tables.twee', "\t\toffer(poolId, round, pc, lastUsed) {\n\t\t\tconst list = [];\n\t\t},"]],
			clean = [['stories/x/15-tables.twee', "\t\t// offer 已搬去 sim\n\t\tconst x = 1;"]];
		const hit = mechanismInStory(story, 'offer'), none = mechanismInStory(clean, 'offer');
		console.log(`  ${hit.length === 1 ? '✓' : '✗'} 反例：故事文件里定义 offer ⇒ 必须抓到（检出 ${hit.length}，期望 1）`);
		console.log(`  ${none.length === 0 ? '✓' : '✗'} 正例：只在注释里提 offer ⇒ 不报（检出 ${none.length}，期望 0）`);
		if (hit.length !== 1 || none.length !== 0) bad++;
	}
	// 注释剥离：注释里提到 `Math.random()` 不算命中，真调用仍算
	{
		const c1 = stripComments('/% 正文里不得直调 Math.random() %/\nconst x = 1;');
		const c2 = stripComments('// 不得直调 Math.random()\nconst y = Math.random();');
		const ok = !/Math\.random/.test(c1) && /Math\.random\s*\(/.test(c2);
		console.log(`  ${ok ? '✓' : '✗'} 注释剥离：元注释里的提及不计、真调用仍计`);
		if (!ok) bad++;
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（体内写点识别：`<<set $…>>`／`State.variables` 正反例各中）');
}

const ctx = createContext();
const { Game, State } = ctx;
const R = Game.Rules;
let bad = 0;
const t = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}`); else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); } };

console.log('\n══ 结算门（#441-A：算能否脱离浏览器驱动）══');
t('`Game.Checks.rollSite` / `resolve` 已在 node 里可调用', typeof Game.Checks.rollSite === 'function' && typeof Game.Checks.resolve === 'function');

// ── ① rng 可注入 ──
{
	R.rng.set(() => 20);
	const res = Game.Checks.rollSite('门厅·翻检', ctx.presets[0].pc, null);
	t('① 注入 rng=20 ⇒ 天然 20（大成功）', res.roll === 20 && res.success === true, JSON.stringify({ roll: res.roll, success: res.success }));
	R.rng.set(() => 1);
	const res2 = Game.Checks.rollSite('门厅·翻检', ctx.presets[0].pc, null);
	t('① 注入 rng=1 ⇒ 天然 1（大失败，与 DC 无关）', res2.roll === 1 && res2.success === false, JSON.stringify({ roll: res2.roll, success: res2.success }));
	// 未注入且无 SugarCube `random` ⇒ fail-loud（node 里 `random` 不存在）
	R.rng.reset();
	let threw = '';
	try { Game.Checks.rollSite('门厅·翻检', ctx.presets[0].pc, null); } catch (e) { threw = String(e.message); }
	t('① 未注入随机源 ⇒ 明确报错（不许静默 0/NaN）', threw.includes('未注入随机源'), threw || '（没有报错）');
}

// ── ② 纯函数不写状态；resolve 只多写结果槽 ──
{
	R.rng.set(() => 11);
	State.variables.last_check = 'SENTINEL';
	const before = JSON.stringify(ctx.presets[0].pc);
	const res = Game.Checks.rollSite('门厅·翻检', ctx.presets[0].pc, null);
	t('② `rollSite` 不写结果槽（纯）', State.variables.last_check === 'SENTINEL');
	t('② `rollSite` 不改 pc（纯）', JSON.stringify(ctx.presets[0].pc) === before);
	const res2 = Game.Checks.resolve('门厅·翻检', ctx.presets[0].pc, null);
	t('② `resolve` 把结果写进结果槽（sim 侧）', State.variables.last_check === res2 && res2.roll === 11, JSON.stringify(State.variables.last_check));
	t('② 纯∶sim 返回值一致（同一 rng ⇒ 同 roll）', res.roll === res2.roll, `${res.roll} vs ${res2.roll}`);
}

// ── ③ 优势/劣势推导（与旧 widget 逐项等价）──
{
	R.rng.set((lo, hi) => hi);   // 恒最大：只看 adv 是否附上（不看成败）
	const pc0 = ctx.presets[0].pc;
	const inv = { ...pc0.inv, 坏哨: true };
	const gear = [];   // 火把在 gear（Gear.advSource）
	const r = Game.Checks.rollSite('雾之魔物·挥击', { ...pc0, inv, gear }, null);
	t('③ 道具优势：带「坏哨」⇒ adv=1 ＋ 理由「道具坏哨」', r.adv === 1 && r.advWhy === '道具坏哨', JSON.stringify({ adv: r.adv, advWhy: r.advWhy }));
	const r2 = Game.Checks.rollSite('门厅·翻检', { ...pc0, inv: {}, world: { ...(pc0.world ?? {}), hall_hint: true } }, null);
	t('③ 情报优势：`world.hall_hint` ⇒ adv=1 ＋ 理由取 knowledgeWhy', r2.adv === 1 && r2.advWhy.startsWith('情报·弯钩钉'), JSON.stringify({ adv: r2.adv, advWhy: r2.advWhy }));
	const r3 = Game.Checks.rollSite('龙·终击', { ...pc0, inv: {}, gear: [] }, null);
	t('③ 位点自带 dis：`龙·终击` ⇒ adv=-1 ＋ 理由取 disWhy', r3.adv === -1 && r3.disWhy.includes('硬撼一条龙'), JSON.stringify({ adv: r3.adv, disWhy: r3.disWhy }));
	const r4 = Game.Checks.rollSite('塔外花田', { ...pc0, inv: {}, gear: [] }, null);
	t('③ 豁免位点（abil）走 `save` 路径（label 含「豁免」）', r4.label.includes('豁免'), r4.label);
	const r5 = Game.Checks.rollSite('门厅·翻检', { ...pc0, inv: {}, gear: [] }, 'dis');
	t('③ 显式 adv 参数优先（不被推导覆盖）', r5.adv === -1, JSON.stringify(r5.adv));
}

// ── ④ 静态纪律：无直调 Math.random ／ present widget 不写状态 ──
{
	const core = readFileSync(sourcePath('10-core.twee'), 'utf8');
	const sim = readFileSync(sourcePath('21-resolve.twee'), 'utf8');
	const noMathRandom = [['10-core.twee', core], ['21-resolve.twee', sim]];
	for (const [f, s] of noMathRandom) {
		const hits = [...stripComments(s).matchAll(/Math\.random\s*\(/g)].length;
		t(`④ ${f} 无直调 \`Math.random()\``, hits === 0, `命中 ${hits}`);
	}
	// #519：机制不许再漏回故事文件（`#512` 的唯一残留就是 `offer`——它吃了 `Math.random()`）。
	// 判据：`offer` 的**定义**必须在 sim；任何 `stories/**` 文件里出现它的定义 ⇒ 红。
	{
		const storyFiles = allSourceFiles().filter((f) => f.startsWith('stories/'));
		const offenders = mechanismInStory(storyFiles.map((f) => [f, readFileSync(f, 'utf8')]), 'offer');
		t('④ `Combat.offer` 定义在 sim（不在故事文件）', sim.includes('offer(poolId') && offenders.length === 0, offenders.join(' '));
	}
	// 只查 **present** widget；sim widget（`fightact`／`socresolve`／`snapshot`／`setflag`／`damage`…）本就负责写状态
	for (const w of ['sitecheck', 'hallResult', 'fightpanel', 'socpanel', 'fightlog', 'socresolve', 'econ']) {
		const body = widgetBody(core, w);
		t(`④ widget「${w}」体内无状态写点（present 不写状态）`, body !== null && !writesStoryState(body));
	}
}

// ── ⑤ 战斗回合能在 node 里跑完整一轮（#441-A 第二刀的验收）──
{
	const pc = JSON.parse(JSON.stringify(ctx.presets[0].pc));   // 不污染其他用例的预置角色
	pc.ev.fight = null;
		t('⑤ `Game.Combat.ensureOffer`/`chooseAction`/`resolvePlayer`/`resolveFoe` 已在 node 里可调用',
		['ensureOffer', 'chooseAction', 'resolvePlayer', 'resolveFoe'].every((k) => typeof Game.Combat[k] === 'function'));
	// 起一场雾影战（池名与剧情一致），并在 node 里走完整一轮
	pc.hp = pc.max_hp = 18;
	pc.ev.fight = { pool: '雾影', round: 1, offer: [], act: null, adv: 0, guard: 0, skipFoe: false, flee: false, last: null, done: false };
	Game.Combat.ensureOffer(pc);
	t('⑤ `ensureOffer` 抽满这一轮的三张牌', pc.ev.fight.offer.length === 3, JSON.stringify(pc.ev.fight.offer));
	Game.Combat.chooseAction(pc, 0);
	t('⑤ `chooseAction` 只写「选中哪一手」（sim 侧）', pc.ev.fight.act === pc.ev.fight.offer[0], String(pc.ev.fight.act));
	R.rng.set((lo, hi) => hi);   // 恒最大：玩家这一手必成
	const hp0 = pc.hp;
	const p1 = Game.Combat.resolvePlayer(pc, '雾之魔物·挥击', false);
	t('⑤ `resolvePlayer` 返回骰面（注入 rng=20 ⇒ 天然 20）', p1.check?.roll === 20 && !!p1.log.you.text, JSON.stringify({ roll: p1.check?.roll, label: p1.log.you.label }));
	t('⑤ 台账含 `rolledWithAdv` 与 `gearName` 两列（旧实现就有的渲染输入）', typeof p1.log.you.rolledWithAdv === 'boolean' && 'gearName' in p1.log.you);
	t('⑤ `resolvePlayer` **不扣 hp**（hp 由 present 的 `<<damage>>` 落）', pc.hp === hp0, `${pc.hp} vs ${hp0}`);
	t('⑤ `resolvePlayer` 已写台账 `last` 与清 `act`', !!pc.ev.fight.last && pc.ev.fight.act === null);
	R.rng.set((lo, hi) => lo);   // 恒最小：对手必中
	pc.ev.fight.skipFoe = false;   // 显式关掉「跳过对手」（`offer[0]` 可能是带 skipFoe 的那一手，那样对手本就不出手）
	const fo = Game.Combat.resolveFoe(pc, '雾之魔物·挥击', false, p1.log);
	t('⑤ `resolveFoe` 返回对手骰面 ＋ 伤值（供 present 调 `<<damage>>`）', !!fo.check && fo.hurt > 0, JSON.stringify({ roll: fo.check?.roll, hurt: fo.hurt }));
	t('⑤ `resolveFoe` 已收尾：轮次 +1 ／ 抽下一轮牌 ／ 清 guard 与 skipFoe ／ 落 log',
		pc.ev.fight.round === 2 && pc.ev.fight.offer.length === 3 && pc.ev.fight.guard === 0 && pc.ev.fight.skipFoe === false && pc.ev.fight.log === p1.log,
		JSON.stringify({ round: pc.ev.fight.round, offer: pc.ev.fight.offer.length }));
	// `skipFoe` 分支：对手不出手（`check` 为 null、无伤、台账写明）
	{
		const pc2 = JSON.parse(JSON.stringify(ctx.presets[0].pc));
		pc2.hp = pc2.max_hp = 18;
		pc2.ev.fight = { pool: '雾影', round: 1, offer: [], act: null, adv: 0, guard: 0, skipFoe: true, flee: false, last: null, done: false };
		const log2 = { you: { label: 'x' }, foe: null };
		const r2 = Game.Combat.resolveFoe(pc2, '雾之魔物·挥击', false, log2);
		t('⑤ `skipFoe` 分支：不出手 ⇒ `check` 为 null、无伤、台账写明', r2.check === null && r2.hurt === 0 && String(r2.log.foe?.text).includes('没有出手'), JSON.stringify(r2.log.foe));
	}
	// 死透也要收尾（旧实现的收尾在 `if ($pc.hp gt 0)` 之外）
	pc.hp = 0;
	const before = pc.ev.fight.round;
	const fo2 = Game.Combat.resolveFoe(pc, '雾之魔物·挥击', false, p1.log);
	t('⑤ hp≤0 ⇒ 对手不再行动（`check` 为 null）但收尾照跑', fo2.check === null && pc.ev.fight.round === before + 1, JSON.stringify({ check: fo2.check, round: pc.ev.fight.round }));
}


// ── ⑥ 交涉回合 ＋ 经济落帐能在 node 里跑（#441-A 第三刀的验收）──
{
	const mk = (over = {}) => {
		const p = JSON.parse(JSON.stringify(ctx.presets[0].pc));
		p.gold = 50;
		p.ev.soc_last = {};
		return Object.assign(p, over);
	};
	t('⑥ `Game.Social.resolveAsk` ／ `Game.Economy.apply`／`note` 已在 node 里可调用',
		typeof Game.Social.resolveAsk === 'function' && typeof Game.Economy.apply === 'function' && typeof Game.Economy.note === 'function');
	// will 分支：不掷骰、直接落地
	{
		const pc = mk({ ev: { soc_last: {}, soc: { id: '老板娘·进塔', how: 'will' } } });
		const r = Game.Social.resolveAsk(pc, '老板娘·进塔', pc.ev.soc.how);
		t('⑥ `will` 分支：写台账 ＋ 清 `$pc.ev.soc` ＋ 无 econ', r && r.econ === null && pc.ev.soc === null && pc.ev.soc_last['老板娘·进塔']?.kind === 'will');
	}
	// lever:drink（gives=auto ＋ econ=drink_round）⇒ 落金币、返回 delta
	{
		const pc = mk({ ev: { soc_last: {}, soc: { id: '老板娘·进塔', how: 'lever:drink' } } });
		const g0 = pc.gold;
		const r = Game.Social.resolveAsk(pc, '老板娘·进塔', pc.ev.soc.how);
		const d = Game.Economy.priceOf('drink_round', pc);
		t('⑥ 筹码-自动分支：金币按事件落帐 ＋ 返回 delta 供 present 渲染', r?.econ?.delta === d && pc.gold === g0 + d,
			JSON.stringify({ delta: r?.econ?.delta, gold: pc.gold, want: g0 + d }));
		t('⑥ 该分支写 `auto` 台账（含「拿出了筹码」notes）', pc.ev.soc_last['老板娘·进塔']?.kind === 'auto' && String(pc.ev.soc_last['老板娘·进塔']?.notes?.[0]).includes('拿出了筹码'));
	}
	// lever:read（gives=adv）⇒ 只摆筹码、不完成诉求；随后 site: 分支才掷骰
	{
		// `read` 这一手挂了 `needRead` —— 必须先把「读过这人」摆上，否则 `levers()` 会把它滤掉
		const pc = mk({ ev: { soc_last: {}, soc: { id: '老板娘·进塔', how: 'lever:read' } }, soc: { att: {}, tries: {}, read: { 老板娘: true } } });
		Game.Social.resolveAsk(pc, '老板娘·进塔', pc.ev.soc.how);
		t('⑥ 优势筹码分支：只写 `soc_lever`、**不完成诉求**（#360）', pc.ev.soc_lever === 'read' && pc.ev.soc_last['老板娘·进塔']?.kind === 'lever');
	}
	// site: 分支：注入 rng ⇒ 必成／必败两档
	{
		const pc = mk({ ev: { soc_last: {}, soc: { id: '老板娘·进塔', how: 'site:酒馆·打听' } }, soc: { att: {}, tries: {}, read: {} } });
		R.rng.set((lo, hi) => hi);   // 恒最大 ⇒ 天然 20（大成功）
		const r = Game.Social.resolveAsk(pc, '老板娘·进塔', pc.ev.soc.how);
		t('⑥ `site:` 分支（rng=20）：台账 `ok`/`crit` ＋ 结果写入 `last_roll` ＋ 清 `soc_lever`',
			['ok', 'crit'].includes(pc.ev.soc_last['老板娘·进塔']?.kind) && !!pc.ev.last_roll && pc.ev.soc_lever === null,
			JSON.stringify({ kind: pc.ev.soc_last['老板娘·进塔']?.kind, roll: pc.ev.last_roll?.roll }));
		const pc2 = mk({ ev: { soc_last: {}, soc: { id: '老板娘·进塔', how: 'site:酒馆·打听' } }, soc: { att: {}, tries: {}, read: {} } });
		R.rng.set((lo, hi) => lo);   // 恒最小 ⇒ 天然 1（大失败）
		Game.Social.resolveAsk(pc2, '老板娘·进塔', pc2.ev.soc.how);
		t('⑥ `site:` 分支（rng=1）：台账 `bad`', pc2.ev.soc_last['老板娘·进塔']?.kind === 'bad', JSON.stringify(pc2.ev.soc_last['老板娘·进塔']?.kind));
	}
	// 不匹配 ⇒ 不结算（防「拿别处的点击算成这一处」）
	{
		const pc = mk({ ev: { soc_last: {}, soc: { id: '别的诉求', how: 'will' } } });
		const r = Game.Social.resolveAsk(pc, '老板娘·进塔', pc.ev.soc.how);
		t('⑥ `$pc.ev.soc.id` 与 ask 不匹配 ⇒ 返回 null 且**不写任何东西**', r === null && pc.ev.soc !== null && Object.keys(pc.ev.soc_last).length === 0);
	}
	// 文案格式单一源
	t('⑥ `Game.Economy.note` 三档（负／正／零）与旧 widget 逐字一致',
		Game.Economy.note(-8) === '（金币 -8）' && Game.Economy.note(3) === '（金币 +3）' && Game.Economy.note(0) === '（——）',
		[JSON.stringify(Game.Economy.note(-8)), JSON.stringify(Game.Economy.note(3)), JSON.stringify(Game.Economy.note(0))].join(' / '));
	R.rng.reset();
}

console.log(bad ? `\n✗ 结算门：${bad} 项` : '\n✔ 结算门通过（rng 可注入 · rollSite 纯 · resolve 写槽 · 推导等价 · present 不写状态）');
process.exit(bad ? 1 : 0);
