// L2 游走器（M1a-2 换骨后）：种子化随机游走 + 状态不变量 + 位点双支清扫
// 走法：开场 → 快速车卡 → 酒馆起随机游走；tower 模式注入时光护符后从塔门起走
// 随机源：xorshift32 种子（可复现）；Math.random 档位 hi(0.99)/lo(0.01)/alt(交替)/neutral(0.5)
// 不变量：hp/max_hp/gold/era/star.spent/keeper.state/dragon.hp/inv 闭集/$pc 形状
// 双支清扫：逐位点直接 wikify <<sitecheck 位点>> 于 hi/lo 两档 → 每位点成败两支必达
// 用法：node test/walker.mjs [ch1局数=4] [tower局数=4]
import { renderedElsOf } from '../editor/lib/core/preview.mjs';   // `#761` 六片A：选择器只有一处 ✓
import { writeFileSync, mkdirSync } from 'node:fs';
import { mkHist, checkStep } from './invariants.mjs';
import { fingerprintOf } from '../editor/lib/core/fingerprint.mjs';   // 见证模式的**状态摘要** ✓（复用 core ✓ 不另造哈希 ✗）
// 统一进 test/boot.mjs（#27 就绪轮询 + 坑11 uncaught 监听 + 退出清理）——
// 这里不再自己装配 JSDOM：随机源改传函数（种子流），窗口关不关由 boot 统一负责。
import { boot, LINKS, trailingAfterLast } from './boot.mjs';

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
// #189 三件套（单调/once-only/前置蕴含）在 test/invariants.mjs，独立可单测；此处并入每步检查
function invariantViolations(w, hist) {
	const v = w.SugarCube.State.variables, pc = v?.pc;
	if (!pc || !pc.abilities) return [];
	const bad = [...checkStep(hist, pc)];
	if (!(pc.max_hp >= 1 && pc.max_hp <= 60)) bad.push(`max_hp=${pc.max_hp}`);
	if (!(pc.hp >= 0 && pc.hp <= pc.max_hp)) bad.push(`hp=${pc.hp}/${pc.max_hp}`);
	if (!(pc.gold >= 0 && pc.gold <= 1000)) bad.push(`gold=${pc.gold}（金币不许为负——经济闭环，花钱点须有支付门）`);
	if (!(pc.salves >= 0 && pc.salves <= 20)) bad.push(`salves=${pc.salves}`);
	if (!['present', 'past'].includes(v.era)) bad.push(`era=${v.era}`);
	if (!(pc.star && pc.star.spent >= 0 && pc.star.spent <= 50)) bad.push(`star.spent=${pc.star?.spent}`);
	if (!['post', 'ally', 'seal'].includes(pc.keeper?.state)) bad.push(`keeper.state=${pc.keeper?.state}`);
	if (!(pc.dragon && pc.dragon.hp >= 0 && pc.dragon.hp <= w.Game.Dragon.hp)) bad.push(`dragon.hp=${pc.dragon?.hp}`);
	const universe = Object.keys(w.Game.Items.defs);
	const stray = Object.keys(pc.inv ?? {}).filter((k) => !universe.includes(k));
	if (stray.length) bad.push(`inv 越闭集: ${JSON.stringify(stray)}`);
	const shape = w.eval('(function(){const b=Object.keys(Game.Pc.defaults());return b.filter(k=>!(k in SugarCube.State.variables.pc));})()');
	if (shape.length) bad.push(`$pc 缺键(迁移漏洞): ${shape.join(',')}`);
	return bad;
}

// ── 走一局 ───────────────────────────────────────────────
async function walk(index, mode, stubMode, seed, maxSteps) {
	const { w, rng, uncaught, close } = await walkerBoot(stubMode, seed);
	const walkHist = mkHist();   // #189：每局独立的三件套记忆（新局＝新档，不跨局比较）
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
			const inv = invariantViolations(w, walkHist);
			if (inv.length) fail(`不变量违法: ${inv.join(';')} @${p}`);
			const errs = w.document.querySelectorAll('#passages .error').length;
			if (errs > 0) fail(`${errs} 个 .error 元素 @${p}`);
			const cands = clickables();
			if (!cands.length || String(p).startsWith('结局')) break;
			// #179 出口在最后（真实状态版，与 render-all 门7 同款规则）：走真实旗标状态——
			// 「已读折叠区装了几十条传闻」这类状态依赖的布局问题只有这里能兜住。
			{
				const box = [...renderedElsOf(w)].filter((e) => e.dataset.passage === p).pop();
				if (box) {
					const text = trailingAfterLast(w, box, cands[cands.length - 1]);
					if (text.length >= 30) fail(`出口不在最后: 「${p}」最后可点之后压着 ${text.length} 字正文`);
				}
			}
			// #265（#185 验收条 2）结果不吞门：点击前后 diff 资源——状态变了，屏上就得有对应文本。
			// 例外：导航到结局页（死亡/结局自身叙述结果）。判定只看公开渲染文本，不猜内部路径。
			const resSnap = () => {
				const pc2 = w.SugarCube.State.variables.pc ?? {};
				return { gold: pc2.gold ?? 0, hp: pc2.hp ?? 0, inv: Object.keys(pc2.inv ?? {}).filter((k) => pc2.inv[k]) };
			};
			const rBefore = resSnap();
			click(cands[Math.floor(rng() * cands.length)]).checkErrors();
			await sleep(70);
			if (!String(w.SugarCube.State.passage ?? '').startsWith('结局')) {
				const rAfter = resSnap();
				const text = w.document.querySelector('#passages')?.textContent ?? '';
				const slot = w.document.querySelector('#passages .scene-feedback')?.textContent ?? '';
				const shown = text + ' ' + slot;
				if (rAfter.gold !== rBefore.gold && !shown.includes('金币'))
					fail(`结果不吞: 金币 ${rBefore.gold}→${rAfter.gold} 但屏上无「金币」`);
				if (rAfter.hp < rBefore.hp && !/(伤害|伤|痛|药膏|血)/.test(shown))
					fail(`结果不吞: 生命 ${rBefore.hp}→${rAfter.hp} 但屏上无伤害文本`);
				const gained = rAfter.inv.filter((k) => !rBefore.inv.includes(k));
				if (gained.length && !gained.some((k) => shown.includes(k)) && !/(获得|物品栏|收进|收好|拿到|手里的)/.test(shown))
					fail(`结果不吞: 获得「${gained.join('、')}」但屏上无提示`);
			}
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

// ── 见证模式（`#215` 裁 (B) ✓）：`--witness` ⇒ 通用种子化走法 ＋ **逐步轨迹** ✗ ─────────────
//   依据 ✓：P4 验收要「**一条完整轨迹、逐格可复跑**」（起于 S₀ → ≥K 个被 ≺ 授权的事件 → 终于 `ending`）。
//   为什么用**种子扫描** ✗（发起者裁定 ✓）：随机玩**有可能走不到结局** ⇒ 跑 `seed = S..S+N-1`，
//     **取第一条「到 `ending` **且** ≥K 事件」的** ✗（两个条件都算 ✓ —— "到了结局但太短"不算见证 ✓；
//     也不是遇到第一条到结局的就收工 ✗：那样 K 一大就**假红** ✓，而长轨迹明明可能在别的种子上 ✓）。
//     —— 每条都可复现 ✓、且比手写"定向走法"更可信 ✓（**不走 planner** ✗）。
//   走法 ✓：从清单 `entry` 起，**按 `data-choice` key** 种子化点击（本仓 `#317②` 口径 ✓ 不用文案）；
//     ⚠️ 开场／车卡那类**没有派生 key** 的段 ⇒ **label 兜底** ✗（并且**在轨迹里显式标出**
//     `fallback: true` ✓ —— 免得"按 key 可复跑"被兜底悄悄破掉）。
//   可复跑 ＝ **同 seed ＋ 同 key 序列** ✓ ⇒ 轨迹里落的正是这两样 ＋ 一行**可直接粘**的复跑命令 ✓。
//   用法 ✓：`node test/walker.mjs --witness [--story=<slug|绝对路径>] [--seed=S] [--scan=N] [--max-steps=M] [--min-events=K]`
//     （`--story=` 优先 ✓、env `SGSTORY_STORY` 兜底 ✓）
//   ⚠️ **口径收窄** ✗（`#215` 发起者裁 ②(a) ✓）：`--story=` 收 **slug** ✓（仓内 `stories/<slug>/` ✓）。
//     **绝对路径**只在**页面**那步被按绝对处理 ✓，**清单**那步仍只认 slug ✗ ⇒ **交互式加载仓外故事包暂不支持** ✗
//     （P4 的内容面就在仓内 `stories/<slug>/**` ✓ ⇒ 不是 P4 要件 ✓；真要用仓外包时另开票 ✓）。
//     ⇒ 报错会**点名**拼出来的那个路径 ✓（`boot.mjs` 的 `entryOf` ✓ —— 不许静默 ✗）。
const WITNESS = process.argv.includes('--witness');
if (WITNESS) {
	const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const STORY = argOf('story', process.env.SGSTORY_STORY ?? null);
	const SEED0 = Number(argOf('seed', 1));
	const SCAN = Number(argOf('scan', 8));
	const MAX = Number(argOf('max-steps', 60));
	const K = Number(argOf('min-events', 3));
	// 可点入口 ✓：与既有走法**同一个选择器** ✗（不能只吃 `LINKS` ⇒ 会卡在「车卡」那段的手写 choice-card ✓）
	const SEL = `${LINKS}, #passages .choice-card a`;
	const digestOf = (w) => fingerprintOf(w.SugarCube.State.variables?.pc ?? {});
	// 一条轨迹 ✓：返回 { steps, ending }（`ending` 非空 ⇔ 真走到头 ✓）
	async function oneWalk(seed) {
		const rng = makeRng(seed);
		const { w, uncaught, close } = await boot({ random: () => 0.99, ...(STORY ? { story: STORY } : {}) });
		const steps = [];
		let ending = null;
		try {
			for (let i = 0; i < MAX; i++) {
				const p = w.SugarCube.State.passage;
				if (String(p).startsWith('结局')) { ending = p; break; }
				const cands = [...w.document.querySelectorAll(SEL)];
				if (!cands.length) break;
				const keyed = cands.filter((a) => a.dataset.choice);
				const pool = keyed.length ? keyed : cands;
				const a = pool[Math.floor(rng() * pool.length)];
				const step = { passage: p, digest: digestOf(w) };
				if (a.dataset.choice) step.choiceKey = a.dataset.choice;
				else { step.choiceLabel = a.textContent.replace(/\s+/g, ' ').trim(); step.fallback = true; }
				steps.push(step);
				a.click();
				await sleep(220);
				const errs = uncaught.filter(Boolean);
				if (errs.length) throw new Error(`走查中抛出：${String(errs[errs.length - 1]).slice(0, 200)}`);
			}
		} finally { try { close(); } catch { /* 已关 */ } }
		return { steps, ending };
	}
	// **种子扫描** ✓：取第一条到 `ending` 的种子（全可复现 ✓）
	let hit = null;
	const tried = [];
	// 事件数 ✓ ＝ 被 `≺` 授权的步数（带 key ✓ 或带 label ✓ —— 开场链那类兜底也算一步 ✓，与末端 K 判据**同一把尺** ✓）
	const nEventsOf = (steps) => steps.filter((x) => x.choiceKey || x.choiceLabel).length;
	for (let sd = SEED0; sd < SEED0 + SCAN; sd++) {
		const r = await oneWalk(sd);
		const n = nEventsOf(r.steps);
		// 两个条件都算 ✓：**到了结局** 且 **事件数 ≥ K** ✗ —— 只看"到没到结局" ⇒ "到了但太短"会被当成见证 ✓（K 一大就假红 ✓）
		const ok = Boolean(r.ending) && n >= K;
		tried.push({ seed: sd, steps: r.steps.length, events: n, ending: r.ending, ok });
		console.log(`  · seed=${sd}：${r.steps.length} 步（事件 ${n}）⇒ ending=${r.ending ?? '(无 ✗)'} ⇒ ${ok ? '**收** ✓' : (r.ending ? `**太短** ✗（< ${K}）` : '**没到结局** ✗')}`);
		if (ok) { hit = { seed: sd, ...r }; break; }
	}
	mkdirSync('build', { recursive: true });
	const replay = `node test/walker.mjs --witness${STORY ? ` --story=${STORY}` : ''} --seed=${hit?.seed ?? SEED0} --scan=1 --max-steps=${MAX}`;
	const trace = {
		story: STORY ?? '(默认 slug)',
		seed: hit?.seed ?? null,
		seedTried: tried,
		maxSteps: MAX,
		steps: hit?.steps ?? [],
		ending: hit?.ending ?? null,
		fallbacks: (hit?.steps ?? []).filter((s) => s.fallback).length,
		replay,
	};
	writeFileSync('build/witness-trace.json', JSON.stringify(trace, null, 1));
	if (!hit) {
		const reached = tried.filter((x) => x.ending);
		const why = reached.length
			? `**到过结局、但都太短** ✗（其中最长的事件数 ${Math.max(...reached.map((x) => x.events))} < K=${K} ✓）`
			: '**没有一条走到 ending** ✗';
		console.error(`\n✗ 见证不成立：扫了 ${SCAN} 个种子（${SEED0}..${SEED0 + SCAN - 1}，每个 ≤${MAX} 步）⇒ ${why}`);
		console.error('  ⇒ P4 验收要「起于 S₀ → … → **终于 ending**」✓：走不到终点的那条轨迹**不算见证** ✗');
		console.error('    （可加大 --scan=N 或 --max-steps=M 重试 ✓；若扫到底仍不到 ⇒ **加定向走法要照 ㉛ 再报备一次** ✓）');
		process.exit(1);
	}
	const nEvents = nEventsOf(hit.steps);   // 与扫描**同一把尺** ✓（`hit` 已保证 ≥K ⇒ 这里是"改坏了就红"的兜底 ✓）
	console.log(`\n见证 ✓：seed=${hit.seed} · ${hit.steps.length} 步（事件 ${nEvents}）· ending=${hit.ending} · label 兜底 ${trace.fallbacks} 处`);
	console.log(`复跑 ✓：${replay}`);
	if (nEvents < K) {
		console.error(`✗ 见证不成立：被 ≺ 授权的事件只有 ${nEvents} 个 < ${K}（K 由发起者在报备里钉死 ✓）`);
		process.exit(1);
	}
	process.exit(0);
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
