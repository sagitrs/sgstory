// L2 对抗席游走器（#13）：种子化随机游走 + 状态不变量 + 检定位点双支清扫
// 两类走法：
//   ch1   —— 开场 → 快速车卡 → 出发 → 随机游走（一章状态空间）
//   tower —— 完整车卡 + 注入 has_amulet → 塔门 → 随机游走（二章 era×楼层 空间）
// 随机源：xorshift32 种子（可复现）；Math.random 档位 hi(0.99)/lo(0.01)/alt(交替)/neutral(0.5)
// 不变量（车卡完成后）：hp/gold/charges/era/tokens/$pc 形状 —— 违法即失败并吐复现要素
// 双支清扫：静态枚举全部检定位点段落，定向 play 于 hi/lo 两档 → 每位点成败两支必达
// 用法：node test/walker.mjs [ch1局数=4] [tower局数=4]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const N_CH1 = Number(process.argv[2] ?? 4);
const N_TOWER = Number(process.argv[3] ?? 4);
const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 种子随机 ─────────────────────────────────────────────
function makeRng(seed) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s >>>= 0; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
}

const failures = [];
const visitedCells = new Set();
const rollObs = new Map(); // `${passage}|${era}|${ok}` → count（双支证据）

async function boot(stubMode, seed) {
	const rng = makeRng(seed);
	const uncaught = [];
	const vc = new VirtualConsole();
	vc.on('jsdomError', (e) => { const m = String(e?.message ?? e); if (m.startsWith('Uncaught')) uncaught.push(m); });
	let flip = false;
	const dom = new JSDOM(html, {
		runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
		beforeParse(window) {
			window.Math.random = () => {
				if (stubMode === 'hi') return 0.99;
				if (stubMode === 'lo') return 0.01;
				if (stubMode === 'neutral') return 0.5;
				flip = !flip; return flip ? 0.99 : 0.01; // alt：成败交替探索双支
			};
		},
	});
	// 白盒 A9：pollUntil 就绪轮询替代固定 sleep（#27 修复辐射；闭包式 random 保留私有工厂）
	const t0 = Date.now();
	while (!(typeof dom.window.SugarCube?.Wikifier === 'function' && dom.window.document.querySelector('#passages'))) {
		if (Date.now() - t0 > 30000) throw new Error('等待超时：SugarCube 加载');
		await sleep(50);
	}
	const w = dom.window;
	new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
	w.SugarCube.Engine.start();
	// 起始段渲染完成（对齐 scenarios.mjs）：Engine.start 是异步的，缺此轮询会与首次点击竞态
	// ——501e81c 删掉 sleep(300) 后未补此轮询，游走器即崩（#114）
	const t1 = Date.now();
	while (!w.document.querySelector('#passages .passage[data-passage="开场"]')) {
		if (Date.now() - t1 > 15000) throw new Error('等待超时：起始段渲染');
		await sleep(50);
	}
	return { dom, w, rng, uncaught };
}

// ── 不变量（车卡完成后才适用）─────────────────────────────
const TOKEN_UNIVERSE = ['铜哨', '日记', '月光花', '星图残页', '星徽', '星屑']; // 四信物 + 星徽/星屑（不占锁槽，src/50-tower.twee:70）
function invariantViolations(w) {
	const v = w.SugarCube.State.variables, pc = v.pc;
	if (!pc || !pc.abilities) return []; // 车卡未完成
	const bad = [];
	const d = pc.max_hp !== undefined ? pc : null;
	if (!(pc.max_hp >= 1 && pc.max_hp <= 50)) bad.push(`max_hp=${pc.max_hp}`);
	if (!(pc.hp >= 0 && pc.hp <= pc.max_hp)) bad.push(`hp=${pc.hp}/${pc.max_hp}`);
	if (!(pc.gold >= 0 && pc.gold <= 1000)) bad.push(`gold=${pc.gold}`);
	if (pc.amulet_charges !== undefined && !(pc.amulet_charges >= 0 && pc.amulet_charges <= 3)) bad.push(`charges=${pc.amulet_charges}`);
	if (v.era !== undefined && !['present', 'past'].includes(v.era)) bad.push(`era=${v.era}`);
	if (pc.tokens !== undefined) {
		if (!Array.isArray(pc.tokens)) bad.push('tokens 非数组');
		else if (pc.tokens.some((t) => !TOKEN_UNIVERSE.includes(t))) bad.push(`tokens 越闭集: ${JSON.stringify(pc.tokens)}`);
	}
	// 形状：migrate 后 keys 必须覆盖 defaults 全键
	const shape = w.eval('(function(){const a=Object.keys(SugarCube.State.variables.pc),b=Object.keys(Pc.defaults());return b.filter(k=>!(k in SugarCube.State.variables.pc));})()');
	if (shape.length) bad.push(`$pc 缺键(迁移漏洞): ${shape.join(',')}`);
	return bad;
}

// ── 走一局 ───────────────────────────────────────────────
async function walk(index, mode, stubMode, seed, maxSteps) {
	const { dom, w, rng, uncaught } = await boot(stubMode, seed);
	const trace = []; // 复现要素：点击序列
	const cells = [];
	const fail = (msg) => failures.push({ index, mode, stubMode, seed, step: trace.length, trace: [...trace], msg });
	const clickables = () => [...w.document.querySelectorAll('#passages a.link-internal, #passages .choice-card a, #passages button')];

	const click = (el) => {
		const label = (el.textContent || el.value || '?').trim().slice(0, 30);
		trace.push(label);
		const before = uncaught.length;
		el.click();
		return { label, checkErrors: () => uncaught.length > before ? fail(`uncaught: ${uncaught[before].slice(0, 140)}`) : null };
	};
	const byLabel = (t) => clickables().find((x) => x.textContent.trim() === t);

	try {
		// 车卡链
		for (const label of ['踏上旅途', '快速成型', '出发，前往歪脖子鸭酒馆']) {
			const a = byLabel(label); if (!a) throw new Error(`引导失败：找不到「${label}」`);
			click(a).checkErrors(); await sleep(220);
		}
		if (!w.SugarCube.State.variables.pc?.abilities) throw new Error('车卡后角色不完整');
		if (mode === 'tower') {
			w.eval('SugarCube.State.variables.has_amulet = true');
			w.SugarCube.Engine.play('塔门'); await sleep(200);
			trace.push('[inject→塔门]');
		}
		for (let s = 0; s < maxSteps; s++) {
			const p = w.SugarCube.State.passage ?? '?';
			const era = w.SugarCube.State.variables.era ?? '-';
			cells.push(`${p}|${era}`);
			const inv = invariantViolations(w);
			if (inv.length) fail(`不变量违法: ${inv.join(';')} @${p}`);
			const errs = w.document.querySelectorAll('#passages .error').length;
			if (errs > 0) fail(`${errs} 个 .error 元素 @${p}`);
			const cands = clickables();
			if (!cands.length || String(p).startsWith('结局')) break;
			click(cands[Math.floor(rng() * cands.length)]).checkErrors();
			await sleep(70);
		}
	} catch (e) {
		fail(`异常中断: ${e.message}`);
	}
	cells.forEach((c) => visitedCells.add(c));
	dom.window.close();
}

// ── 检定位点双支清扫（定向、确定性）─────────────────────────
async function dualBranchSweep() {
	const base = await boot('neutral', 424242);
	const w = base.w;
	// 车卡链（真实角色）
	const byLabel = (t) => [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.trim() === t);
	for (const label of ['踏上旅途', '快速成型', '出发，前往歪脖子鸭酒馆']) { byLabel(label).click(); await sleep(220); }
	const snapshot = JSON.stringify(w.SugarCube.State.variables);
	// ⚠ State.variables 是 getter-only：整体赋值是静默 no-op（坑12）——必须逐键 delete + Object.assign 到活对象
	const restoreExpr = (era) => `(function(){const v=SugarCube.State.variables;for(const k of Object.keys(v))delete v[k];Object.assign(v,${snapshot});${era ? `v.era=${JSON.stringify(era)};` : ''}})()`;

	const SITE_RX = /<<(?:perceptionroll|bridgeroll|attackroll|defyeroll|check|save)[\s>]/;
	const sites = [...w.document.querySelectorAll('tw-passagedata')]
		.map((el) => ({ name: el.getAttribute('name'), src: el.textContent }))
		.filter((p) => SITE_RX.test(p.src) && !['Widgets', '规则系统'].includes(p.name));

	const lastCheckOf = () => JSON.stringify(w.SugarCube.State.variables.last_check ?? null);
	// 位点前置：检定被状态门控的位点，必须先满足门控，否则双支永远观测不到（#114）
	const SITE_PRELUDE = {
		// 前厅·跟读：<<check>> 门控在 $pc.tower.chant_try（先“静下心跟读”才会触发检定）
		'塔底·龙穴前厅': 'SugarCube.State.variables.pc.tower.chant_try = true',
	};
	for (const site of sites) {
		for (const stub of ['hi', 'lo']) {
			// 重置 Math.random 档位（页面域内劫持）
			w.eval(`Math.random = () => ${stub === 'hi' ? 0.99 : 0.01}`);
			for (const era of site.src.includes('$era') ? ['present', 'past'] : [null]) {
				w.eval(restoreExpr(era));
				if (SITE_PRELUDE[site.name]) w.eval(SITE_PRELUDE[site.name]);
				const before = lastCheckOf();
				w.SugarCube.Engine.play(site.name);
				await sleep(90);
				const after = lastCheckOf();
				const errs = w.document.querySelectorAll('#passages .error').length;
				if (errs > 0) failures.push({ index: 'sweep', mode: 'dual-branch', msg: `${site.name}(${era ?? '-'}, ${stub}) 渲染出 ${errs} 个 .error 元素` });
				const p = w.SugarCube.State.passage;
				const cell = `${site.name}|${era ?? w.SugarCube.State.variables.era}`;
				visitedCells.add(`${p}|${w.SugarCube.State.variables.era}`);
				if (after !== before) {
					const succ = w.eval('!!SugarCube.State.variables.last_check?.success');
					rollObs.set(`${site.name}|${era ?? '-'}|${succ}`, (rollObs.get(`${site.name}|${era ?? '-'}|${succ}`) ?? 0) + 1);
				}
			}
		}
	}
	base.dom.window.close();

	// 断言：每个位点的成败两支都有观测（按位点聚合——同一变体无检定属正常，如温室|past 无 roll）
	const missing = [];
	for (const site of sites) {
		for (const succ of ['true', 'false']) {
			let hit = false;
			for (const [k] of rollObs) if (k.startsWith(`${site.name}|`) && k.endsWith(`|${succ}`)) hit = true;
			if (!hit) missing.push(`${site.name} 缺${succ === 'true' ? '成' : '败'}支`);
		}
	}
	if (missing.length) failures.push({ index: 'sweep', mode: 'dual-branch', msg: `位点双支未覆盖 ${missing.length}: ${missing.join(', ')}` });
	return sites.length;
}

// ── 主流程 ───────────────────────────────────────────────
const stubs = ['hi', 'lo', 'alt', 'neutral'];
for (let i = 0; i < N_CH1; i++) await walk(i, 'ch1', stubs[i % stubs.length], 1000 + i * 7, 40);
for (let i = 0; i < N_TOWER; i++) await walk(100 + i, 'tower', stubs[i % stubs.length], 2000 + i * 13, 50);
const nSites = await dualBranchSweep();

// 覆盖落盘（L3 消费）
mkdirSync('build', { recursive: true });
writeFileSync('build/coverage-walker.json', JSON.stringify({ cells: [...visitedCells], rolls: [...rollObs.entries()] }, null, 1));

console.log(`游走 ${N_CH1}(一章) + ${N_TOWER}(塔) 局 · 覆盖 ${visitedCells.size} 格 · 检定位点 ${nSites} 个双支清扫`);
if (rollObs.size) console.log(`双支观测 ${[...rollObs.entries()].map(([k, v]) => `${k}×${v}`).join(' ')}`);
if (failures.length) {
	console.error(`\n✗ 游走器发现 ${failures.length} 处问题：`);
	failures.slice(0, 10).forEach((f) => console.error(`  [${f.mode}#${f.index}${f.seed ? ` seed=${f.seed} ${f.stubMode}` : ''}] ${f.msg}\n    复现: ${f.trace ? `node test/walker.mjs（点击序列 ${JSON.stringify(f.trace.slice(-8))}）` : 'dual-branch sweep（确定性）'}`));
	process.exit(1);
}
console.log('✔ 游走器通过（不变量/渲染错误/双支覆盖：0 违法）');
process.exit(0);
