#!/usr/bin/env node
/* 老宅支线 · **真 DOM 接缝判据**（`sgstory#1912` 交付 1 的 `§7` 那行）
 *
 * `§7` 原文（逐字）：「| SugarCube 接缝 | 真实浏览器中的**导航、回退、当前段落存档与输出时机**正确 |」
 *   ⇒ 本档四格就是那四个词，一间不给它换口径。
 *
 * ## 与 `run-baseline.mjs` 的分工
 *   `run-baseline.mjs` 判**场景语义**（无头：`when` 前置、奖励幂等、存档往返后守卫仍活）；
 *   本档判**宿主接缝**（真 DOM：把构建产物 `game.html` 装进 jsdom，按玩家的路点进去点）。
 *   两者断的不是同一件事 —— 语义对而接缝错（输出落错段落、回退不重绘、存档不带段落）在无头侧**照不出来**。
 *
 * ## 装置（每条都是实测踩出来的，✗ 猜想）
 *   ① **boot ＝ `runUserInit()` ＋ `start()` ＋ `play(start)`** —— 产物加载期已自跑 `init()`／`runUserScripts()`，
 *      重跑它们会多造一份「加载期一次性副作用」；而 `start()` 体内**不含** `runUserInit`（StoryInit 会静默丢）。
 *      两者都静默（多跑 ⇒ 计数 2×；少跑 ⇒ 变量缺）⇒ 本档把前提写成**断言**（见 `boot()`）。
 *   ② **点击须用 `el.click()`**（实测：`dispatchEvent(new MouseEvent('click'))` 对故事链接**不导航也不报错**）。
 *      ⇒ `clickText()` 内建「确已发生变化」断言（✗ 返 void：那会让调用方对着过期 DOM 判）。
 *   ③ **`play(start)` 之后必须让出一个宏任务**再点击：同 tick 内导航会被 boot 的导航**静默盖回**
 *      （读数：无 yield ⇒ 成功 0/6；`setTimeout(0)` ⇒ 6/6）。
 *   ④ **地图面不换段落**：`探索` 是一个段落，地点间移动只换内容（✗ 换 `State.passage`）
 *      ⇒ `[nav]` 对地图内移动断「内容确变」而不是断段落名。
 *   ⑤ **`Save.serialize()` 是压缩串**（LZString），不是 JSON ⇒ 本档读**存档面**用 `State.marshalForSave()`。
 *
 * ## 用法（jsdom 只在**窗口式**跑：nightly ＋ 手动 dispatch —— 零依赖基线不动，见 `.github/workflows/e2e-seam.yml`）
 *   python3 build.py                                   # 产物 tests/e2e/old-house/game.html
 *   npm i jsdom --no-save --no-package-lock            # 窗口式跑时装（CI 由工作流装）
 *   node tests/e2e/old-house/run-seam.mjs              # 四格判据
 *   node tests/e2e/old-house/run-seam.mjs --selftest   # 刀自检：每条刀须红在**指定那一格**
 *   退出码：0 全过 / 1 有红 / 2 用法或环境错（缺产物／缺 jsdom —— 具名报错，✗ 崩在 import 上）
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '..', '..', '..');
const HTML = path.join(HERE, 'game.html');

const argOf = (n) => {
	const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
	return hit ? hit.slice(n.length + 3) : (process.argv.includes(`--${n}`) ? true : null);
};

/* ---------- 刀：可复现的**字符串替换**（替换不中 ⇒ 具名报错，✗ 静默当「刀下了」） ---------- */
const KNIVES = [
	{
		id: 'nav-path-rewired',
		why: '把门厅「上二楼」的路径改指书房（`addPath hall→corridor` 的 `to` 改成 study）⇒ `[nav]` 应红',
		patch: [[`map.addPath({ from: 'hall', to: 'corridor', text: '上二楼' });`, `map.addPath({ from: 'hall', to: 'study', text: '上二楼' });`]],
		expect: ['nav'],
	},
	{
		id: 'reward-early',
		why: '把奖赏文案**塞进木箱格的静态文本**（即动作之前就出现）⇒ `[out-timing]` 应红',
		patch: [[`text: '木箱的盖子被长钉钉死，但对你手里的家伙而言算不了什么。'`,
			`text: '木箱的盖子被长钉钉死，但对你手里的家伙而言算不了什么。长钉呻吟着松开——箱底藏着一枚旧硬币和一把铁钥匙。'`]],
		expect: ['out-timing'],
	},
	{
		id: 'marker-not-written',
		why: '木箱动作**不写** `boxOpened` 标记（其余照旧）⇒ 存档面少了那份事实 ⇒ `[save-passage]` 应红',
		patch: [[`State.variables.boxOpened = true;`, `/* 刀：不写标记 */`]],
		expect: ['save-passage'],   // 实测：前置改看「奖励入包」后，**只有**存读档格红（干净隔离）
	},
	{
		id: 'scene-double-push',
		why: '场景推进**重复入栈**（同一屏压两条历史）⇒ 回退只能退回**同一屏**（原地踏步）⇒ `[back]` 应红',
		patch: [[`SugarCube.Engine.play('场景舞台');`, `SugarCube.Engine.play('场景舞台'); SugarCube.Engine.play('场景舞台');`]],
		expect: ['back'],
	},
];

/* ============================ 刀自检（子进程跑同一支，断红在哪一格）============================ */
if (process.argv.includes('--selftest')) {
	let bad = 0;
	const run = (env) => spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 180000 });
	const clean = run({});
	const cleanOut = `${clean.stdout}${clean.stderr}`;
	const cleanOK = clean.status === 0 && /接缝判据全绿/.test(cleanOut);
	console.log(`  ${cleanOK ? '✓' : '✗'} 未下刀 ⇒ 四格应全绿：rc=${clean.status}`);
	if (!cleanOK) { console.error(cleanOut.slice(-2000)); bad++; }
	/* ★判据须**直接**（`dev-10` 的阻断二，同 `run-baseline.mjs`）：只认**失败行**（`✗ [格名] …`）里
	 *   的格名，✗ 不认「格名在输出里出现过」；且每条刀声明**完整预期红集**（多红少红皆未达标）。
	 *   ⚠ 崩溃不算红：本档的格在取不到可点项时会 `throw` ⇒ 那正说明该刀把路走死了，✗ 不当作判出。 */
	const redCells = (out) => [...new Set([...out.matchAll(/✗ \[([^\]]+)\]/g)].map((m) => m[1]))].sort();
	for (const k of KNIVES) {
		const r = run({ SEAM_KNIFE: k.id });
		const out = `${r.stdout}${r.stderr}`;
		const got = redCells(out);
		if (!k.expect) { console.log(`  · 刀 \`${k.id}\`（未声明）实得红集 ${JSON.stringify(got)}（rc=${r.status}）`); continue; }
		const want = [...k.expect].sort();
		const same = got.length === want.length && got.every((x, i) => x === want[i]);
		const red = r.status === 1 && same;
		console.log(`  ${red ? '✓' : '✗'} 刀 \`${k.id}\` ⇒ 须**恰好**红在 ${JSON.stringify(want)}；实得 ${JSON.stringify(got)}（rc=${r.status}）`);
		if (!red) { console.error(`    （刀义：${k.why}）\n${out.slice(-1500)}`); bad++; }
	}
	if (bad) { console.error(`\n刀的判别力自证失败 ${bad} 条 —— 判据红不了，等于没有判据`); process.exit(1); }
	console.log(`\n✓ 刀的判别力自证通过（${KNIVES.length} 刀 ＋ 1 个未下刀对照）`);
	process.exit(0);
}

/* ---------- 环境：产物与 jsdom（缺则**具名报错**，✗ 崩在 import 上） ---------- */
if (!fs.existsSync(HTML)) {
	console.error(`✗ 缺产物 ${path.relative(REPO, HTML)} —— 先 \`python3 build.py\``);
	process.exit(2);
}
const req = createRequire(path.join(REPO, 'noop.js'));
let JSDOM, VirtualConsole;
try {
	({ JSDOM, VirtualConsole } = req('jsdom'));
} catch {
	console.error('✗ 取不到 jsdom —— 本档只在**窗口式**跑（nightly ＋ 手动 dispatch）：\n'
		+ '    npm i jsdom --no-save --no-package-lock\n'
		+ '  （✗ 不把 jsdom 写进本仓依赖：舰队零依赖基线是刻意的，见 .github/workflows/e2e-seam.yml 的头注）');
	process.exit(2);
}

/* ---------- 下刀（只作用于**内存里的产物文本**，✗ 不落盘） ---------- */
let html = fs.readFileSync(HTML, 'utf8');
const knifeId = process.env.SEAM_KNIFE ?? null;
const knife = knifeId ? KNIVES.find((k) => k.id === knifeId) : null;
if (knifeId && !knife) { console.error(`✗ 未知的刀：${knifeId}`); process.exit(2); }
for (const [from, to] of knife?.patch ?? []) {
	if (!html.includes(from)) {
		console.error(`✗ 刀 \`${knife.id}\` 的替换未命中：${from}\n  （产物已变 ⇒ 刀失效 ⇒ 须同步改刀，✗ 当作「刀下了」）`);
		process.exit(2);
	}
	html = html.split(from).join(to);
}

/* ---------- 断言面 ---------- */
let failures = 0, passes = 0;
const CELLS = new Set();
const cell = (id) => { CELLS.add(id); console.log(`\n─ ${id}`); };
const reds = new Set();
const ok = (id, cond, msg) => {
	if (cond) { passes++; console.log(`  ✓ ${msg}`); }
	else { failures++; reds.add(id.slice(1, -1)); console.error(`  ✗ [${id.slice(1, -1)}] ${msg}`); }
};

/* ---------- 装载与 boot ---------- */
const IGNORE = [/Not implemented: Window's scroll/, /Not implemented: window\.scrollTo/, /Could not load/];
const noise = [];
const vc = new VirtualConsole();
for (const k of ['jsdomError', 'error', 'warn']) {
	vc.on(k, (e) => {
		const s = String(e?.message ?? e);
		if (!IGNORE.some((r) => r.test(s))) noise.push(`[${k}] ${s}`);
	});
}
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
await new Promise((r) => setTimeout(r, 500));
const win = dom.window, doc = win.document;
const SC = win.SugarCube;
if (!SC?.Engine) { console.error('✗ 产物里取不到 `SugarCube.Engine` ⇒ 产物不完整或 jsdom 未跑脚本'); process.exit(2); }
const E = SC.Engine;

/* ★装置前提写成断言（见文件头 ①）：多跑/少跑都静默，故此处不容忍退化 */
{
	const r0 = E.runUserInit(); if (r0?.then) await r0;
	const r1 = E.start(); if (r1?.then) await r1;
	if (E.state === 'init') {
		console.error('✗ `Engine.start()` 后仍在 `init` ⇒ 产物可能不再在加载期自跑用户脚本（装置前提变了）');
		process.exit(2);
	}
	const start = SC.Config?.passages?.start;
	const r2 = E.play(start); if (r2?.then) await r2;
	if (SC.State.passage !== start) {
		console.error(`✗ boot 后段落应为 ${JSON.stringify(start)}，实得 ${JSON.stringify(SC.State.passage)}（漏 Engine.play(start)？）`);
		process.exit(2);
	}
	await new Promise((r) => setTimeout(r, 0));            // ★必须让出宏任务（文件头 ③）
}

/* ---------- 驱动面 ---------- */
const cur = () => SC.State.passage;
const blocks = () => [...doc.querySelectorAll('#passages .passage')];
const newest = () => blocks().at(-1)?.textContent ?? '';
/* ★地图位置读数（实测）：产物把它存进故事变量 `mapCurrent_old-house`（✗ `window.setup.RPG.map.current` 取不到） */
const mapLoc = () => SC.State.variables['mapCurrent_old-house'] ?? null;
const clickable = () => [...doc.querySelectorAll('#passages a, #passages button')];
/** 点击并按**实际形**断言「确已变化」（文件头 ②④：地图内移动不换段落 ⇒ 也认内容变化） */
const clickText = (text) => {
	const b = clickable().find((x) => x.textContent.trim().startsWith(text));
	if (!b) throw new Error(`找不到可点项「${text}」；现有：${clickable().map((x) => x.textContent.trim()).join('｜')}`);
	const p0 = cur(), t0 = newest(), l0 = mapLoc(), n0 = blocks().length;
	b.click();
	return { p0, changed: cur() !== p0 || newest() !== t0 || mapLoc() !== l0 || blocks().length !== n0 };
};
const goto = async (text) => {
	const r = clickText(text);
	await new Promise((rr) => setTimeout(rr, 0));
	return r;
};

/* ============================ 判据 ①：导航 ============================ */
{
	const id = '[nav]';
	cell(id);
	ok(id, cur() === '开始', `boot 落在起点段落「开始」（实得 ${JSON.stringify(cur())}）`);
	const 一 = await goto('推开铁门');
	ok(id, 一.changed && cur() === '探索', `点「推开铁门」⇒ 落到「探索」（实得 ${JSON.stringify(cur())}，内容确变=${一.changed}）`);
	await goto('拾起墙角的木棒');                       // ★木箱格的 `when` 要木棒 ⇒ 先把前置拿到
	ok(id, (SC.State.variables.inventory ?? []).some((x) => x.id === 'club'), '在门厅拾到木棒（木箱格的前置）');
	const 二 = await goto('上二楼');
	ok(id, 二.changed && mapLoc() === 'corridor', `点「上二楼」⇒ 地图位置 corridor（实得 ${JSON.stringify(mapLoc())}）—— 地图内移动**不换段落**，故断内容与位置`);
	await goto('进储物间');
	ok(id, mapLoc() === 'storeroom', `点「进储物间」⇒ 地图位置 storeroom（实得 ${JSON.stringify(mapLoc())}）`);
	const 三 = await goto('查看地窖');
	ok(id, 三.changed && cur() === '场景舞台', `点「查看地窖」⇒ 进「场景舞台」段落（实得 ${JSON.stringify(cur())}）`);
	ok(id, newest().includes('地窖入口') || newest().includes('你顺着石阶走进地窖'),
		'场景舞台渲出的是 cellar-entry（地窖入口）');
	await goto('查看木箱');
	ok(id, newest().includes('木箱的盖子被长钉钉死'), `点「查看木箱」⇒ 自循环重绘出 cellar-box（末块含其文本）`);
	/* ★两向臂：**未撬开前**不显示开箱项 ⇒ 之后才显示（导航把玩家带到了真有效的面） */
	ok(id, clickable().some((x) => x.textContent.includes('用木棒撬开木箱')), '未撬开 ⇒ 木箱格显示「用木棒撬开木箱」');
}

/* ============================ 判据 ②：回退 ============================ */
{
	const id = '[back]';
	cell(id);
	const 段前 = cur(), 场前 = SC.State.variables.sceneId, 文前 = newest();
	await E.backward();
	await new Promise((r) => setTimeout(r, 0));
	/* ★场景舞台是**一段多屏**（Scene 复用同一段落名）⇒ 回退的判据是「屏变了」，不是「段落名变了」 */
	ok(id, SC.State.variables.sceneId === 'cellar-entry',
		`\`Engine.backward()\` 回到**上一场**（cellar-box → 期望 cellar-entry，实得 ${JSON.stringify(SC.State.variables.sceneId)}）`
		+ ' —— ✗ 只断「换了屏」：场景推进若不走历史（改用 `Engine.show`），「换屏」仍为真而回退其实跳过了整段剧情');
	ok(id, !newest().includes('木箱的盖子被长钉钉死'),
		'回退后末屏不再是「木箱」那一屏（✗ 停在原地却报成功）');
	ok(id, doc.querySelector('#passages') !== null, '回退后 DOM 重绘（段落容器仍在，✗ 白屏）');
	console.log(`  （回退读数：末块首 60 字 = ${newest().slice(0, 60).replace(/\s+/g, ' ')}）`);
	await goto('查看木箱');   // 回到木箱格，供 ③④ 用
}

/* ============================ 判据 ③：当前段落存档 ============================ */
{
	const id = '[save-passage]';
	cell(id);
	const 段 = cur(), 场 = SC.State.variables.sceneId;
	const snap = SC.State.marshalForSave();
	ok(id, typeof snap === 'object' && snap !== null, `取到存档面（\`State.marshalForSave()\`，键=${Object.keys(snap ?? {}).join(',')}）`);
	/* 存档面里必须**带得住当前段落**：SugarCube 的 history 末项即当前段 */
	/* ★实测定形：`marshalForSave()` ＝ `{ index, history: [{ title, variables }] }` ⇒ 当前段落 = `history[index].title` */
	const hist = Array.isArray(snap?.history) ? snap.history : [];
	const 录 = hist[snap?.index ?? hist.length - 1] ?? null;
	ok(id, 录?.title === 段,
		`存档面**带得住当前段落**（history[index].title=${JSON.stringify(录?.title)}，实际段落=${JSON.stringify(段)}）`);
	/* 推进一步再读回 ⇒ 段落与状态须一起回来 */
	await goto('用木棒撬开木箱');
	const 撬后段 = cur();
	ok(id, SC.State.variables.boxOpened === true, `推进确已发生（boxOpened=${JSON.stringify(SC.State.variables.boxOpened)}）`);
	SC.State.unmarshalForSave(snap);
	await E.play(段);
	await new Promise((r) => setTimeout(r, 0));
	ok(id, cur() === 段, `读回后落在**存档时那一段落**（实得 ${JSON.stringify(cur())}，存档时=${JSON.stringify(段)}）`);
	ok(id, SC.State.variables.sceneId === 场, `读回后场景 id 亦恢复（${JSON.stringify(SC.State.variables.sceneId)} vs ${JSON.stringify(场)}）`);
	ok(id, SC.State.variables.boxOpened !== true,
		`读回后标记回到存档点（boxOpened=${JSON.stringify(SC.State.variables.boxOpened)}）—— 存档面确带状态`);
	console.log(`  （存档→推进→读回：${JSON.stringify(段)} → ${JSON.stringify(撬后段)} → ${JSON.stringify(cur())}）`);
}

/* ============================ 判据 ④：输出时机 ============================ */
{
	const id = '[out-timing]';
	cell(id);
	const 语 = '长钉呻吟着松开';
	/* ★实测定形（本档最重要的读数）：SugarCube 只保留**当前一屏**的 DOM；而场景自循环重绘
	 *   （`scene: 'cellar-box'` ⇒ `Engine.play('场景舞台')`）**换掉**了动作那一屏的元素 ——
	 *   于是动作产生的输出落在**被移除的旧屏**上，重绘后的新屏**不含**它，玩家可见的结果走**面板**
	 *   （背包里出现「旧硬币×1、铁钥匙」）。⇒ 本格就按这个实际形断，并把「旧屏被移除」记成明账
	 *   （`✗` 不判红：它是当前行为，交付 1 要的是**保持**它，✗ 顺手改掉）。 */
	const 旧元素 = blocks().at(-1);
	ok(id, !(旧元素?.textContent ?? '').includes(语), '动作前的那一屏**不含**该出句（防「提前出现」：静态文本冒充动作输出）');
	await goto('用木棒撬开木箱');
	ok(id, (SC.State.variables.inventory ?? []).some((x) => x.id === 'coin'),
		'撬开动作确已发生（前置：奖励入包 —— ✗ 借 marker：那是 `[save-passage]` 的正题）');
	ok(id, SC.State.variables.sceneId === 'cellar-box', `动作后仍在木箱格（自循环重绘的语义；sceneId=${JSON.stringify(SC.State.variables.sceneId)}）`);
	ok(id, (旧元素?.textContent ?? '').includes(语), `出句落在**动作那一刻的那一屏**（与动作同屏：旧元素含「${语}」）`);
	const 新元素 = blocks().at(-1);
	ok(id, 新元素 !== 旧元素, '重绘换屏（动作后是**新的**那一屏元素）');
	ok(id, !(新元素?.textContent ?? '').includes(语), '新屏**未**重复承载该出句（✗ 则同一句被印两遍）');
	ok(id, (SC.State.variables.inventory ?? []).some((x) => x.id === 'coin') && (SC.State.variables.inventory ?? []).some((x) => x.id === 'iron-key'),
		'★动作的**可见结果**在重绘后仍可读（背包含旧硬币与铁钥匙）—— 这是玩家真正看到的那一面');
	console.log('  （明账：自循环重绘后，出句所在的旧屏被 SugarCube 移除 ⇒ 该句不在新屏上；'
		+ '当前行为如此，交付 1 判的是**保持**，✗ 不据此判红）');
}

/* ============================ 汇总 ============================ */
console.log('');
if (noise.length) console.log(`  （jsdom 噪声 ${noise.length} 条，未判红；首条：${noise[0].slice(0, 90)}）`);
console.log(`老宅接缝判据：cell=${CELLS.size} pass=${passes} fail=${failures}`
	+ (failures ? ` 红格＝${JSON.stringify([...reds].sort())}` : ''));
if (failures) { console.error('SugarCube 接缝未保持 —— 见上逐条具名红'); process.exit(1); }
console.log('✓ 接缝判据全绿');
/* ★**必须显式退进程**：jsdom（`pretendToBeVisual`）在事件循环里留着句柄 ⇒ 跑完不退 ⇒
 *   本地需 `timeout` 兜、CI 会**挂死整个 job**（本席实测：首版 rc=124 超时退出但判据已全绿）。
 *   ⇒ 结论行之后显式 `process.exit(0)`：**判据的退出码即本进程的退出码**，✗ 由 jsdom 的句柄决定。 */
process.exit(0);
