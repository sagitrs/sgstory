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

import { checkModuleGraph, ORDER, MODULES, readModules, checkLayerDirection, LAYER_OF, STORY_SYMBOLS, normalizeSymbolRefs, checkEngineRanks, rankOfPath } from '../scripts/module-order.mjs';
import { selftest as distFreshSelftest } from '../scripts/dist-fresh.mjs';

const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };
let failures = 0;
let bad = 0;   // 自证计数器（模块级：t() 在任何作用域调用都可用；此前它声明在块内 ⇒ t() 抛 ReferenceError）
const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };

if (process.argv.includes('--selftest')) {
	const base = { '10-core.twee': 'window.Game.Rules = {};', '15-tables.twee': 'window.Game = {};' };
	const cases = [
		['合规图 → 不得报错', base, { order: ['10-core.twee', '15-tables.twee'], modules: { '10-core.twee': { deps: [], defines: ['Game.Rules'] }, '15-tables.twee': { deps: ['10-core.twee'], defines: ['Game'] } } }, 0],
		['前向依赖（15 依赖 20，但 20 在后）→ 必须报红', { '10-core.twee': '', '15-tables.twee': '', '20-chargen.twee': '' }, { order: ['10-core.twee', '15-tables.twee', '20-chargen.twee'], modules: { '15-tables.twee': { deps: ['20-chargen.twee'], defines: [] } } }, 1],
		['新增文件未登记 → 必须报红', { ...base, '12-new.twee': '' }, { order: ['10-core.twee', '15-tables.twee'], modules: {} }, 1],
		['声明定义但正文里没有（改名/挪走）→ 必须报红', base, { order: ['10-core.twee', '15-tables.twee'], modules: { '10-core.twee': { deps: [], defines: ['Game.Rules', '不存在的符号'] } } }, 1],
		['ORDER 里的文件不存在 → 必须报红', base, { order: ['10-core.twee', '15-tables.twee', '99-gone.twee'], modules: {} }, 1],
		// #320 阶段 3：defines 支持**点号路径**（`window.Game.Chargen = …` 声明 `Game.Chargen`）
		['点号 defines：声明与实际相符 → 绿', { '15-tables.twee': 'window.Game = {};', '20-chargen.twee': 'window.Game.Chargen = {};' }, { order: ['15-tables.twee', '20-chargen.twee'], modules: { '20-chargen.twee': { deps: ['15-tables.twee'], defines: ['Game.Chargen'] } } }, 0],
		['点号 defines：声明的点号路径不存在 → 必须报红', { '15-tables.twee': 'window.Game = {};', '20-chargen.twee': 'window.Game.Other = {};' }, { order: ['15-tables.twee', '20-chargen.twee'], modules: { '20-chargen.twee': { deps: ['15-tables.twee'], defines: ['Game.Chargen'] } } }, 1],
	];
	// #441 第 3 步前置：rank 派生 + 职责散布 + 四条禁止边（纯函数自证）
	t('rank 派生：src/engine/40-sim/x.twee → 4', rankOfPath('src/engine/40-sim/x.twee') === 4);
	t('rank 派生：未分层（src/10-core.twee）→ null（登记模式）', rankOfPath('src/10-core.twee') === null);
	t('rank 派生：未知前缀（src/engine/70-weird/x.twee）→ null（不猜）', rankOfPath('src/engine/70-weird/x.twee') === null);
	{
		const sig = { 1: ['Game.Rules'], 5: ['jQuery'] };
		const r1 = checkEngineRanks({ 'a.twee': 'Game.Rules.x' }, { engineFiles: ['a.twee'], signatures: sig, bans: [], styleFiles: [] });
		t('职责散布正例：只含 kernel 签名 → [1]（不必拆）', JSON.stringify(r1.spread[0].ranks) === '[1]');
		const r2 = checkEngineRanks({ 'a.twee': 'Game.Rules + jQuery' }, { engineFiles: ['a.twee'], signatures: sig, bans: [], styleFiles: [] });
		t('职责散布反例：同时含 kernel 与 present 签名 → [1,5]（需拆）', JSON.stringify(r2.spread[0].ranks) === '[1,5]');
		const r3 = checkEngineRanks({ 'b.twee': 'jQuery' }, { engineFiles: ['b.twee'], signatures: sig, bans: [], styleFiles: ['b.twee'] });
		t('样式文件不参与签名：ranks 空且 kind=style（防 CSS 类名假阳性）', r3.spread[0].ranks.length === 0 && r3.spread[0].kind === 'style');
		const bans = [{ rank: 1, name: 'kernel 零依赖', patterns: [/\blocalStorage\b/] }];
		const r4 = checkEngineRanks({ 'b.twee': 'localStorage.x' }, { engineFiles: ['b.twee'], signatures: {}, bans, styleFiles: [], rankOf: () => 1 });
		t('禁止边反例：rank 1 文件里出现 localStorage → 报', r4.banHits.length === 1 && r4.banHits[0].ban === 'kernel 零依赖');
		const r5 = checkEngineRanks({ 'b.twee': 'return 1' }, { engineFiles: ['b.twee'], signatures: {}, bans, styleFiles: [], rankOf: () => 1 });
		t('禁止边正例：干净的 rank 1 文件 → 0 报', r5.banHits.length === 0);
		const bans2 = [{ rank: 0, name: '只有 boot 碰故事身份', patterns: [/Config\.history/], onlyIn: 0 }];
		const r6 = checkEngineRanks({ 'b.twee': 'Config.history' }, { engineFiles: ['b.twee'], signatures: {}, bans: bans2, styleFiles: [], rankOf: () => 2 });
		t('禁止边 onlyIn 反例：rank 2 文件碰 Config.history → 报', r6.banHits.length === 1);
		const r7 = checkEngineRanks({ 'b.twee': 'Config.history' }, { engineFiles: ['b.twee'], signatures: {}, bans: bans2, styleFiles: [], rankOf: () => 0 });
		t('禁止边 onlyIn 正例：rank 0（boot）自己碰 → 不报', r7.banHits.length === 0);
	}
	// #441 第 2 步：层间方向（引擎不得引用故事符号；反向允许）
	{
		const L = { 'E': 'engine', 'S': 'story' };
		const SY = ['Game.NPC'];
		t('层数正例：引擎文件不引用故事符号', checkLayerDirection({ E: 'window.Game = {};' }, { layers: L, symbols: SY }).length === 0);
		t('层拒反例：引擎文件引用故事符号必须被抓', checkLayerDirection({ E: 'const x = Game.NPC;' }, { layers: L, symbols: SY }).length === 1);
		t('归一化：可选链 a?.b → a.b', normalizeSymbolRefs('a?.b') === 'a.b');
		t('剥注释正例： 里的提及不算引用（#459 的假阳性）', checkLayerDirection({ E: '/% Game.NPC %/' }, { layers: L, symbols: SY }).length === 0);
		t('剥注释反例：注释外的真实引用仍要抓', checkLayerDirection({ E: 'const x = Game.NPC; // Game.NPC' }, { layers: L, symbols: SY }).length === 1);
		t('归一化：方括号字符串 a["b"] → a.b', normalizeSymbolRefs('a["b"]') === 'a.b');
		t('归一化：点号两侧空白/换行 a .\n b → a.b', normalizeSymbolRefs('a .\n b') === 'a.b');
		t('层拒反例：逃逸写法 Game?.Dragon 必须被抓（第 2 步曾漏检，guest-1 实测）', checkLayerDirection({ E: 'window.Game?.Dragon?.hp' }, { layers: L, symbols: ['Game.Dragon'] }).length === 1);
		t('层拒反例：方括号写法 Game["Notes"] 必须被抓', checkLayerDirection({ E: 'Game["Notes"]' }, { layers: L, symbols: ['Game.Notes'] }).length === 1);
		t('层拒反例（#459 别名）：`const T = window.Game` 后写 `T.Checks.sites` 也必须被抓', checkLayerDirection({ E: 'const T = window.Game; const x = T.Checks.sites;' }, { layers: L, symbols: ['Game.Checks.sites'] }).length === 1);
		t('层间正例（#459 别名）：别名只用来读引擎机制 ⇒ 不报', checkLayerDirection({ E: 'const T = window.Game; T.Checks.resolve();' }, { layers: L, symbols: ['Game.Checks.sites'] }).length === 0);
		t('层数正例：**故事**文件引用故事符号不算越界（反向允许）', checkLayerDirection({ S: 'const x = Game.NPC;' }, { layers: L, symbols: SY }).length === 0);
	}
	for (const [name, sources, opts, want] of cases) {
		const got = checkModuleGraph(sources, opts).length;
		const ok = got === want;
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${name}（命中 ${got}，期望 ${want}）`);
	}
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——分层 lint 没有咬合力`); process.exit(1); }
	console.log('\n✔ 自证通过：合规绿 / 前向依赖红 / 未登记红 / 定义漂移红 / 文件缺失红 / 点号 defines 正反例');
	process.exit(0);
}

if (process.argv.includes('--dist-fresh')) { distFreshSelftest(); process.exit(0); }

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

// ── #441 第 2 步：**层间方向**（引擎 → 故事 单向）──────────────────────────
// 登记模式：先产出「引擎文件里出现了故事符号」的清单（＝第 3 步的拆分作业单）；`--strict` 才判红。
{
	const leaks = checkLayerDirection(readModules());
	if (leaks.length) {
		console.log(`\n○ 层间方向（#441 第 2 步，**登记模式**）：引擎文件里出现故事符号 ${leaks.length} 处 —— 这是第 3 步（文件/表拆分）的作业单；\`--strict\` 会让它判红`);
		for (const l of leaks) console.log(`    ${l.file}（engine）→ ${l.symbols.join(' / ')}`);
		if (process.argv.includes('--strict')) failures++;
	} else {
		console.log('\n✔ 层间方向：引擎层未引用任何故事符号（声明清单 ' + STORY_SYMBOLS.length + ' 个符号全未命中）');
	}
}

// ── #441 第 3 步前置：engine 内部 rank（**登记模式**）────────────────────────
// 输出＝第 3 步的作业单：每个引擎文件"跨了几种职责"（＝要拆几份）＋四条禁止边的候选违规。
// 搬家后 `rankOfPath()` 由目录名生效，同一处判据转严格（`--strict` 退 1）。
{
	const mods = readModules();
	const engine = Object.keys(mods).filter((f) => LAYER_OF[f] === 'engine');
	const r = checkEngineRanks(mods, { engineFiles: engine });
	const multi = r.spread.filter((x) => x.ranks.length > 1);
	console.log(`\n○ engine rank（#441 第 3 步前置，**登记模式**）：${engine.length} 个引擎文件 · ${multi.length} 个跨多个 rank（要拆）· 候选违规 ${r.banHits.length} 处`);
	for (const x of r.spread) {
		console.log(`    ${x.file.padEnd(16)} ${x.kind === 'style' ? '（纯样式，不参与签名；将来落 50-present）' : `跨 rank [${x.ranks.join(',')}]${x.ranks.length > 1 ? ' ← 需拆' : ''}`}`);
	}
	const byBan = [...new Set(r.banHits.map((h) => h.ban))];
	if (byBan.length) console.log(`    候选违规的类别：${byBan.join(' / ')}（**未分层 ⇒ 尚不能判定"层内违规"**；搬家后逐条转严格）`);
	if (process.argv.includes('--strict')) failures++;
}

// #319③：dist 新鲜度守卫的自证（合成目录；已在 npm test 链上）
distFreshSelftest();

console.log(`\n${failures ? '✗ 构建期分层 lint 未通过' : '✔ 构建期分层 lint 通过（模块顺序与依赖显式且成立）'}`);
if (failures) process.exit(1);
