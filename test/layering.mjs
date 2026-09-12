// 构建期分层 lint（#319）：模块顺序与加载期依赖必须显式且成立。
//
// 事实模型见 scripts/module-order.mjs 的头部注释（要点：`[widget]`/函数体是**延迟**执行，
// 前向引用在那里合法 → 不做「文本出现即引用」的推断式 lint，避免假阳性）。
//
// 四条断言：
//  ① src/ 里每个 .twee 都在 ORDER 里（新增文件不得靠文件名前缀"自动"获得位置）
//  ② ORDER 里每个文件都存在（改名/删除会被抓）
//  ③ 依赖边指向**更早**的模块（加载期拿不到未定义符号的根因）
//  ④ 模块声明的定义真的在文件里（抓「改了名/挪了位置」）
//
// 自证：`node test/layering.mjs --selftest`

import { checkModuleGraph, ORDER, MODULES, readModules } from '../scripts/module-order.mjs';

const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };
let failures = 0;

if (process.argv.includes('--selftest')) {
	const base = { '10-core.twee': 'window.Rules = {};', '15-tables.twee': 'window.Game = {};' };
	const cases = [
		['合规图 → 不得报错', base, { order: ['10-core.twee', '15-tables.twee'], modules: { '10-core.twee': { deps: [], defines: ['Rules'] }, '15-tables.twee': { deps: ['10-core.twee'], defines: ['Game'] } } }, 0],
		['前向依赖（15 依赖 20，但 20 在后）→ 必须报红', { '10-core.twee': '', '15-tables.twee': '', '20-chargen.twee': '' }, { order: ['10-core.twee', '15-tables.twee', '20-chargen.twee'], modules: { '15-tables.twee': { deps: ['20-chargen.twee'], defines: [] } } }, 1],
		['新增文件未登记 → 必须报红', { ...base, '12-new.twee': '' }, { order: ['10-core.twee', '15-tables.twee'], modules: {} }, 1],
		['声明定义但正文里没有（改名/挪走）→ 必须报红', base, { order: ['10-core.twee', '15-tables.twee'], modules: { '10-core.twee': { deps: [], defines: ['Rules', '不存在的符号'] } } }, 1],
		['ORDER 里的文件不存在 → 必须报红', base, { order: ['10-core.twee', '15-tables.twee', '99-gone.twee'], modules: {} }, 1],
	];
	let bad = 0;
	for (const [name, sources, opts, want] of cases) {
		const got = checkModuleGraph(sources, opts).length;
		const ok = got === want;
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${name}（命中 ${got}，期望 ${want}）`);
	}
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——分层 lint 没有咬合力`); process.exit(1); }
	console.log('\n✔ 自证通过：合规绿 / 前向依赖红 / 未登记红 / 定义漂移红 / 文件缺失红');
	process.exit(0);
}

const sources = readModules();
const found = checkModuleGraph(sources);

console.log(`模块图：${ORDER.length} 个模块 · ${ORDER.reduce((n, f) => n + (MODULES[f]?.deps?.length ?? 0), 0)} 条加载期依赖边`);
for (const f of ORDER) {
	const m = MODULES[f] ?? { deps: [], defines: [] };
	console.log(`    ${f.padEnd(18)} ← ${(m.deps ?? []).join(', ') || '（无）'}${m.defines?.length ? `　定义：${m.defines.join('/')}` : ''}`);
}
check(found.length === 0, found.length === 0
	? '顺序表与文件一一对应 · 依赖边只指向更早模块 · 声明的定义都在正文里'
	: `分层 lint 未通过 ${found.length} 项`);
for (const f of found) console.log(`    [${f.code}] ${f.msg}`);

console.log(`\n${failures ? '✗ 构建期分层 lint 未通过' : '✔ 构建期分层 lint 通过（模块顺序与依赖显式且成立）'}`);
if (failures) process.exit(1);
