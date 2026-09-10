// L2 对抗席游走器（M1a-2 换骨后）：种子化随机游走 + 状态不变量 + 位点双支清扫
// 走法：开场 → 快速车卡 → 酒馆起随机游走；tower 模式注入时光护符后从塔门起走
// 随机源：xorshift32 种子（可复现）；Math.random 档位 hi(0.99)/lo(0.01)/alt(交替)/neutral(0.5)
// 不变量：hp/max_hp/gold/era/star.spent/keeper.state/dragon.hp/inv 闭集/$pc 形状
// 双支清扫：逐位点直接 wikify <<sitecheck 位点>> 于 hi/lo 两档 → 每位点成败两支必达
// 用法：node test/walker.mjs [ch1局数=4] [tower局数=4]
import { writeFileSync, mkdirSync } from 'node:fs';
// 统一进 test/boot.mjs（#27 就绪轮询 + 坑11 uncaught 监听 + 退出清理）——
// 这里不再自己装配 JSDOM：随机源改传函数（种子流），窗口关不关由 boot 统一负责。
import { boot, LINKS } from './boot.mjs';

const N_CH1 = Number(process.argv[2] ?? 4);
const N_TOWER = Number(process.argv[3] ?? 4);
const SEED_OFFSET = Number(process.argv[4] ?? 0); // 多种子 nightly：--seed-offset 平移基准种子
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeRng(seed) {
	let s = seed >>> 0 || 1;
	return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s >>>= 0; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
}

const failures = [];
const visitedCells = new Set();
const rollObs = new Map();

// 薄壳：stubMode 决定 Math.random 的档位；rng 是点击用的种子流（与掷骰随机源分开）
async function walkerBoot(stubMode, seed) {
	const rng = makeRng(seed);
	let flip = false;
	const { dom, w, uncaught, close } = await boot({
		random: () => {
			if (stubMode === 'hi') return 0.99;
			if (stubMode === 'lo') return 0.01;
			if (stubMode === 'neutral') return 0.5;
			flip = !flip; return flip ? 0.99 : 0.01;
		},
	});
	return { dom, w, rng, uncaught, close };
}

// ── 不变量（车卡完成后才适用）─────────────────────────────
function invariantViolations(w) {
	const v = w.SugarCube.State.variables, pc = v?.pc;
	if (!pc || !pc.abilities) return [];
	const bad = [];
	if (!(pc.max_hp >= 1 && pc.max_hp <= 60)) bad.push(`max_hp=${pc.max_hp}`);
	if (!(pc.hp >= 0 && pc.hp <= pc.max_hp)) bad.push(`hp=${pc.hp}/${pc.max_hp}`);
	if (!(pc.gold >= -100 && pc.gold <= 1000)) bad.push(`gold=${pc.gold}`);
	if (!(pc.salves >= 0 && pc.salves <= 20)) bad.push(`salves=${pc.salves}`);
	if (!['present', 'past'].includes(v.era)) bad.push(`era=${v.era}`);
	if (!(pc.star && pc.star.spent >= 0 && pc.star.spent <= 50)) bad.push(`star.spent=${pc.star?.spent}`);
	if (!['post', 'ally', 'seal'].includes(pc.keeper?.state)) bad.push(`keeper.state=${pc.keeper?.state}`);
	if (!(pc.dragon && pc.dragon.hp >= 0 && pc.dragon.hp <= w.Game.Dragon.hp)) bad.push(`dragon.hp=${pc.dragon?.hp}`);
	const universe = Object.keys(w.Game.Items.defs);
	const stray = Object.keys(pc.inv ?? {}).filter((k) => !universe.includes(k));
	if (stray.length) bad.push(`inv 越闭集: ${JSON.stringify(stray)}`);
	const shape = w.eval('(function(){const b=Object.keys(Pc.defaults());return b.filter(k=>!(k in SugarCube.State.variables.pc));})()');
	if (shape.length) bad.push(`$pc 缺键(迁移漏洞): ${shape.join(',')}`);
	return bad;
}

// ── 走一局 ───────────────────────────────────────────────
async function walk(index, mode, stubMode, seed, maxSteps) {
	const { w, rng, uncaught, close } = await walkerBoot(stubMode, seed);
	const trace = [];
	const cells = [];
	const fail = (msg) => failures.push({ index, mode, stubMode, seed, step: trace.length, trace: [...trace], msg });
	const clickables = () => [...w.document.querySelectorAll(`${LINKS}, #passages .choice-card a`)];
	const click = (el) => {
		const label = (el.textContent || el.value || '?').trim().slice(0, 30);
		trace.push(label);
		const before = uncaught.length;
		el.click();
		return { label, checkErrors: () => uncaught.length > before ? fail(`uncaught: ${uncaught[before].slice(0, 140)}`) : null };
	};
	const byLabel = (t) => clickables().find((x) => x.textContent.trim() === t);

	try {
		for (const label of ['踏上旅途', '快速成型', '出发，前往歪脖子鸭酒馆']) {
			const a = byLabel(label); if (!a) throw new Error(`引导失败：找不到「${label}」`);
			click(a).checkErrors(); await sleep(220);
		}
		if (!w.SugarCube.State.variables.pc?.abilities) throw new Error('车卡后角色不完整');
		if (mode === 'tower') {
			w.eval('(function(){const v=SugarCube.State.variables;v.pc.inv["时光护符"]=true;})()');
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
	close();
}

// ── 位点双支清扫（定向、确定性）：逐位点直接 wikify ──────────
async function dualBranchSweep() {
	const { w, close } = await walkerBoot('neutral', 424242);
	// 真实车卡（保证技能/属性齐备）
	const byLabel = (t) => [...w.document.querySelectorAll(LINKS)].find((x) => x.textContent.trim() === t);
	for (const label of ['踏上旅途', '快速成型', '出发，前往歪脖子鸭酒馆']) { byLabel(label).click(); await sleep(220); }
	const sites = Object.keys(w.Game.Checks.sites);
	const host = w.document.createElement('div');
	const missing = [];
	for (const key of sites) {
		for (const stub of [0.99, 0.01]) {
			w.eval(`Math.random = () => ${stub}`);
			w.SugarCube.State.variables.last_check = null;
			new w.SugarCube.Wikifier(host, `<<sitecheck "${key}">>`);
			await sleep(10);
			const lc = w.SugarCube.State.variables.last_check;
			if (!lc) { failures.push({ index: 'sweep', mode: 'dual-branch', msg: `位点「${key}」未产出 $last_check` }); continue; }
			rollObs.set(`${key}|${lc.success}`, (rollObs.get(`${key}|${lc.success}`) ?? 0) + 1);
		}
	}
	close();
	for (const key of sites) {
		for (const succ of ['true', 'false']) {
			if (!rollObs.has(`${key}|${succ}`)) missing.push(`${key} 缺${succ === 'true' ? '成' : '败'}支`);
		}
	}
	if (missing.length) failures.push({ index: 'sweep', mode: 'dual-branch', msg: `位点双支未覆盖 ${missing.length}: ${missing.join(', ')}` });
	return sites.length;
}

// ── 主流程 ───────────────────────────────────────────────
const stubs = ['hi', 'lo', 'alt', 'neutral'];
for (let i = 0; i < N_CH1; i++) await walk(i, 'ch1', stubs[i % stubs.length], 1000 + i * 7 + SEED_OFFSET, 45);
for (let i = 0; i < N_TOWER; i++) await walk(100 + i, 'tower', stubs[i % stubs.length], 2000 + i * 13 + SEED_OFFSET, 60);
const nSites = await dualBranchSweep();

mkdirSync('build', { recursive: true });
writeFileSync('build/coverage-walker.json', JSON.stringify({ cells: [...visitedCells], rolls: [...rollObs.entries()] }, null, 1));

console.log(`游走 ${N_CH1}(一章) + ${N_TOWER}(塔) 局 · 覆盖 ${visitedCells.size} 格 · 位点 ${nSites} 个双支清扫`);
if (failures.length) {
	console.error(`\n✗ 游走器发现 ${failures.length} 处问题：`);
	failures.slice(0, 10).forEach((f) => console.error(`  [${f.mode}#${f.index}${f.seed ? ` seed=${f.seed} ${f.stubMode}` : ''}] ${f.msg}\n    复现: ${f.trace ? `node test/walker.mjs（点击序列 ${JSON.stringify(f.trace.slice(-8))}）` : 'dual-branch sweep（确定性）'}`));
	process.exit(1);
}
console.log('✔ 游走器通过（不变量/渲染错误/双支覆盖：0 违法）');
process.exit(0);
