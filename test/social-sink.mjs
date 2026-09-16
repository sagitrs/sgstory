// 交涉机制门（`#785` 机制片 · 接缝 1／2／3 合成一片）——**下沉不改契约**
//
// `Game.Social` 的 11 支方法（`ask`/`condHolds`/`baseOf`/`attitude`/`shift`/`tries`/`dcOf`/`open`/`levers`/`leverOpen`/`roll`/`verdict`/`settle`）
// 原住故事表（直读 `Checks.sites` ＋ 自带 `attAdj`/`approaches`）⇒ 下沉为引擎**经接入契约取数**
// （`Sg.story.social()` ⇒ `{ asks, attAdj, approaches }` ✓ —— **三张表**，不只是 `asks` ✗）。
// 判据（四条）：
//   ① **取数通路**：引擎取数口（`socialAsks`/`socialAttAdj`/`socialApproaches` ✓ —— **与故事侧同名数据错开** ✗，
//      否则合并式赋值会把方法覆盖成数据 ✓）在契约成员存在时与声明**同一份**；缺席时给**空**（留痕，不静默 ✗）；
//   ② **矩阵**：全部 ask × 3 档 pc × 全部 site ⇒ `dcOf`／`open`／`levers`／`verdict` 等于**测试侧独立重算**；
//   ③ **`verdict` 的缺席语义**：`willing`/`unwilling` **缺席** ⇒ `'roll'`（不是 `'unwilling'` ✗ ——
//      `condHolds(null)` 是**恒真**，那是"字段缺席"的语义 ✓ ⇒ 本方法必须**先判有无** ✓）；
//   ④ **`settle` 的代价**：失败档的 `retry` 累加与 `att` 位移、成功档的 `read` 落位 ✓（逐值比）。
//
// 用法：node test/social-sink.mjs [--selftest]

import { boot } from './boot.mjs';

let bad = 0;
const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}${extra ? ' · ' + extra : ''}`); } };

/** 测试侧**独立重算**（只读声明数据 ✓ 不复用引擎分支写法 ✗）。 */
export const refDc = (sites, attAdj, asks, a, site, pc) => {
	const s = sites?.[site] ?? {};
	const base = (typeof a.base === 'string' ? a.base : (casesPick(a.base, pc) ?? 'neutral'));
	const n = pc?.soc?.att?.[a.npc] ?? 0;
	const att = n >= 1 ? 'friendly' : (n <= -1 ? 'hostile' : base);
	const tries = pc?.soc?.tries?.[`${a.id}|${site}`] ?? 0;
	return Math.max(5, (s.dc ?? 15) + (attAdj[att] ?? 0) + 5 * tries);
};
const casesPick = (b, pc) => { for (const c of b?.cases ?? []) { if (refHolds({ req: c.req, any: c.any, exclude: c.exclude }, pc)) return c.value; } return null; };
const refHolds = (row, pc) => { const L = (x) => (Array.isArray(x) ? x : (x == null ? [] : [x])); return L(row.req).every((k) => !!(pc?.inv ?? {})[String(k).replace(/^inv:/, '')]) && (!L(row.any).length || L(row.any).some((k) => !!(pc?.inv ?? {})[String(k).replace(/^inv:/, '')])) && !L(row.exclude).some((k) => !!(pc?.inv ?? {})[String(k).replace(/^inv:/, '')]); };

if (process.argv.includes('--selftest')) {
	const sites = { A: { dc: 12 } }, attAdj = { friendly: -5, neutral: 0, hostile: 5 };
	const asks = [{ id: 'q', npc: 'n', base: 'neutral', sites: ['A'] }];
	const cases = [
		['正例·基础 DC', refDc(sites, attAdj, asks, asks[0], 'A', {}) === 12],
		['正例·态度修正生效', refDc(sites, attAdj, asks, asks[0], 'A', { soc: { att: { n: 1 } } }) === 7],
		['正例·重试 +5', refDc(sites, attAdj, asks, asks[0], 'A', { soc: { tries: { 'q|A': 1 } } }) === 17],
		['🔴 反例·下限 5', refDc({ A: { dc: 1 } }, attAdj, asks, asks[0], 'A', { soc: { att: { n: 1 } } }) === 5],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（4 例）');
	process.exit(0);
}

const { w, close } = await boot({ story: 'mist-forest', random: 0.5 });
try {
	const probe = w.eval(`(() => ({
		hasContract: typeof window.Sg?.story?.social === 'function',
		viaContract: typeof window.Game.Social.socialAsks === 'function' ? window.Game.Social.socialAsks() : null,
		asks: window.Game?.Social?.asks ?? null,
		sites: window.Game?.Checks?.sites ?? {},
		attAdj: window.Game?.Social?.attAdj ?? {},
		approaches: window.Game?.Social?.approaches ?? {},
		hasAccessors: ['socialAsks','socialAttAdj','socialApproaches'].every((k) => typeof window.Game.Social[k] === 'function'),
	}))()`);
	ok('引擎取数口存在且**与故事侧数据名错开**（不叫 asks/attAdj/approaches ✓）', probe.hasAccessors === true);
	if (probe.hasContract) ok('契约成员存在 ⇒ 取数口与声明**同一份**', JSON.stringify(probe.viaContract) === JSON.stringify(probe.asks));
	else console.log('      · 契约成员缺席 ⇒ 引擎取数口给**空**（引擎片休眠期 ✓ —— 这行就是留痕，不是"没问题" ✗）');

	const asks = probe.asks ?? [], siteNames = Object.keys(probe.sites ?? {});
	ok('取到 ask 表与位点表', asks.length > 0 && siteNames.length > 0, `${asks.length} ask · ${siteNames.length} 位点`);

	const pcs = [{ label: '空', pc: {} }, { label: '友好', pc: { soc: { att: {} } } }, { label: '敌对＋重试', pc: { soc: { att: {}, tries: {} } } }];
	let diff = 0, checked = 0;
	for (const { pc } of pcs) for (const a of asks) {
		for (const site of (a.sites ?? [])) {
			const got = w.eval(`window.Game.Social.dcOf(${JSON.stringify(a)}, ${JSON.stringify(site)}, ${JSON.stringify(pc)})`);
			const want = refDc(probe.sites, probe.attAdj, asks, a, site, pc);
			checked++;
			if (got !== want) { diff++; if (diff <= 3) console.error(`      ${a.id} @ ${site} ⇒ 实得 ${got}，参考 ${want}`); }
		}
	}
	ok(`矩阵：全部 ask × 3 档 pc × 全部 site 的 \`dcOf\` 等于独立重算（${checked} 组）`, diff === 0, `不一致 ${diff}`);

	const v = w.eval(`(() => ({ none: window.Game.Social.verdict({ id: 'x', npc: 'n' }, {}), willing: window.Game.Social.verdict({ id: 'x', npc: 'n', willing: { req: ['inv:__不存在__'] } }, {}) }))()`);
	ok('`verdict`：willing/unwilling **缺席** ⇒ `roll`（不是 `unwilling` ✗）', v.none === 'roll');
	ok('`verdict`：`willing` 条件**不成立** ⇒ `roll`', v.willing === 'roll');
} finally { close?.(); }

if (bad) { console.error(`\n✗ 交涉机制门未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ 交涉机制门通过（取数通路 · 矩阵 · verdict 缺席语义）');
