// `#1100`：判据接线的**自证格**（独立模块 → 宿主只加 import ＋ 一行调用）。
import { wiringProblems, driverProblems } from './gate-wiring.mjs';

/** 本组**格数**（与清单长度对齐 —— "掐了会改变一个可观的数"）。 */
export const WIRING_CELLS_EXPECTED = 9;   // 完好态／B′2／R1／R2／不变量／未闭合／驱动层正例＋两向反例

const SRC_OK = 'export const flags = ["x"];\nexport const judge = () => {};\nexport const run = (ctx) => judge(ctx);\n';
const probe = (src, extra = {}) => wiringProblems({ list: () => ['a.mjs'], read: () => src, registry: ['x'], anchors: { x: 'judge' }, ...extra }).problems;

export const wiringCells = (t) => {
	let n = 0;
	const cell = (label, ok) => { n++; t(label, ok); };
	cell('🔴 判据接线·完好态：**两面相等 ⇒ 0 问题**（防"凡有调用就报"✗ —— 验收第 2 条 ✓）',
		wiringProblems().problems.length === 0);
	cell('🔴 判据接线 B′2：**两面不等 ⇒ 必报并打印差集**（新增/改名门 ⇒ 差集非空 ⇒ 红 ✓）',
		(() => { const r = wiringProblems({ list: () => ['a.mjs'], read: () => SRC_OK, registry: ['y'], anchors: { x: 'judge' } });
			return r.problems.some((p) => p.includes('两面不等')) && String(r.face).includes('差集'); })());
	cell('🔴 判据接线 R1：锚**恰 1 处** ⇒ 0 处（判据体被删）⇒ 必报 ✓',
		probe(SRC_OK.replace(/export const judge = \(\) => \{\};\n/, 'export const auditHelper = () => {};\n')).some((x) => x.includes('出现 **0** 处')));
	cell('🔴 判据接线 R2：**把 `run` 掏空成 `() => []` ⇒ 必红**（判 `judge(` **调用形态** ✗ —— 不是"名字出现过"✓）',
		probe(SRC_OK.replace('(ctx) => judge(ctx)', '() => []')).some((x) => x.includes('没有在 `run` 那一段里被调用')));
	cell('🔴 判据接线·不变量：除 `run` 外**没有具名判据导出** ⇒ 必报（内联在 `run` 里 ⇒ 掏空 `run` 锚检照样绿 ✓）',
		probe('export const flags = ["x"];\nexport const run = (ctx) => { return []; };\n').some((x) => x.includes('没有具名判据导出')));
	cell('🔴 判据接线·验收第 3 条：**未闭合 ⇒ 报「读数不成立」**（**不是**"接线缺失"✗ —— 两者分开 ✓）',
		(() => { const p = probe('/* 未闭合\nexport const flags = ["x"];\nexport const judge = () => {};\nexport const run = (ctx) => judge(ctx);\n');
			return p.some((x) => x.includes('读数不成立')) && !p.some((x) => x.includes('**接线缺失**')); })());
	cell('🔴 驱动层：**真驱动器 ⇒ 0 问题** ✓（一手实形：`shared.mjs` 的 `g.run(` ＋ `discovery.mjs` 取 `GATES` ✓）',
		driverProblems().length === 0);
	cell('🔴 驱动层・反例①：**摘掉 `g.run(`** ⇒ 必报（注册表就只是清单 ✓）',
		(() => { const p = driverProblems({ read: (f) => (f.endsWith('shared.mjs') ? 'for (const g of gates) { /* 无调用 */ }' : 'import { GATES }') }); return p.some((x) => x.includes('找不到')); })());
	cell('🔴 驱动层・反例②：**换掉枚举源**（不再从 `GATES` 取）⇒ 必报（注册表不再是唯一枚举源 ✓）',
		(() => { const p = driverProblems({ read: (f) => (f.endsWith('shared.mjs') ? 'g.run(ctx)' : 'const gates = HARDCODED;') }); return p.some((x) => x.includes('不是从**注册表')); })());
	return n;
};
export default wiringCells;
