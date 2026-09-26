// `#1510` 自证：**笔记授予真的发生**（运行时面）—— 夹具驱动 · 引擎侧
//
// 诉求（`#1510` 复核评论 `5848074957`）：`#1282` 夹具的三件里，第 3 件是「**让真授予真的发生**」
//   ⇒ ★关键：★**授予不是自动生效**——`links[].yields`（或规则行的 `yields`）要**那条链接真的被渲染出来
//     并被点**才落（`#1408`／`#1468`：效果随链接走、点击那一刻施加）。
//   ⇒ ★本件断的是**运行时面**（`pc.ev.notes.n_x`），✗ 不是声明面（`data/notes.json`／`rules.json` 的字面量）：
//     后者是 `test/story-runtime.mjs` 判据③ 的对象，**运行时授予没发生它也照样绿**（实测：删掉授予链后 rc=0 且 ③ 绿）。
//
// 两态（★判法口径：红态**只动授予链那一环**，✗ 不动 `notes.json` 声明面 —— 那会变成「判据③ 的红」，混了对象）：
//   绿态：本夹具 boot ⇒ 走它应有的路径 ⇒ `pc.ev.notes.n_x === true`
//   红态：删/profile 掉授予链 ⇒ 该格**必须红**
//
// 形态（照同族先例 `test/adds-e2e.mjs`／`test/takes-e2e.mjs`／`test/rulelist-effects-e2e.mjs`）：
//   自建夹具根（`mkdtemp`）⇒ **清生成物**（✗ 不清会读到陈旧 `17-rules.twee` ⇒ 读数落在旧形态 ✗）⇒ build ⇒ boot。
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let bad = 0;
const t = (label, ok, detail = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad++; console.error(`  ✗ ${label}${detail ? ' —— ' + detail : ''}`); }
};

/** 自建一个夹具根（`variant` 用于**只动授予链那一环**的红态；✗ 不动 `notes.json`）。 */
const makeRoot = (variant = 'asis') => {
	const WORK = mkdtempSync(join(tmpdir(), 'sg-note-grant-'));
	const stories = join(WORK, 'stories');
	cpSync(join(ROOT, 'test/fixtures/c1282/stories'), stories, { recursive: true });
	const s1 = join(stories, 's1');
	// ★清生成物（✗ 不清 ⇒ build 复用旧 `17-rules.twee` ⇒ 读数落在旧形态；本线既有教训）
	for (const f of ['15-tables.twee', '16-notes.twee', '17-rules.twee', '00-meta.twee']) {
		const q = join(s1, f); if (existsSync(q)) rmSync(q);
	}
	// 红态：**删掉授予链那一环**（`passages.json` 里那条链接的 `yields`）—— ★不动 `data/notes.json`
	if (variant === 'no-yields') {
		const p = join(s1, 'data/passages.json');
		const d = JSON.parse(readFileSync(p, 'utf8'));
		for (const v of Object.values(d)) for (const l of v.links ?? []) delete l.yields;
		writeFileSync(p, JSON.stringify(d, null, 1));
	}
	execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
	return { WORK, stories };
};

/** boot 一次：进段 ⇒ 观测（渲染期 / 点击后）。`click=false` 只观测渲染期。 */
const observe = async (stories, { click = true } = {}) => {
	process.env.SG_STORIES_DIR = stories;
	const { boot } = await import('./boot.mjs');
	// ★同一进程里跑**多个夹具根** ⇒ `boot()` 的 HTML 缓存按 **key** 记账（`test/boot.mjs:24`）⇒
	//   两次都传 slug `'s1'` 会**复用第一棵树的页面**（实测：红态读到绿态的页 ⇒ 假红/假绿）。
	//   ⇒ 传**绝对路径**（`boot()` 明写"绝对路径按绝对处理"）＋ 显式 `entry`（清单那步只认 slug）。
	const B = await boot({ story: join(stories, '..', 'dist/stories/s1/index.html'), entry: '开场' });
	const w = B.w;
	w.SugarCube.Engine.play('开场');
	await B.settle(); await new Promise((r) => setTimeout(r, 200)); await B.settle();
	const notesAtRender = w.SugarCube.State.variables.pc?.ev?.notes;
	const links = [...w.document.querySelectorAll('#passages a.link-internal')];
	let after = notesAtRender;
	if (click && links.length) {
		links[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
		await B.settle(); await new Promise((r) => setTimeout(r, 150)); await B.settle();
		after = w.SugarCube.State.variables.pc?.ev?.notes;
	}
	const legacy = w.SugarCube.State.variables.pc?.world?.n_x;
	const eff = links.map((a) => a.getAttribute('data-sg-effects'));
	const out = { notesAtRender, after, legacy, links: links.length, eff };
	try { B.close?.(); } catch { /* 忽略 */ }
	return out;
};

// ── 绿态（本夹具应有的路径）────────────────────────────────────────────
{
	const { WORK, stories } = makeRoot('asis');
	const o = await observe(stories);
	t('① 链接被渲染出来（**段尾块由编译器注入** ⇒ 有可点的入口）', o.links === 1, `links=${o.links}`);
	t('② 授予**编进了链接**（`data-sg-effects` 带 `yields`）', /yields/.test(String(o.eff[0] ?? '')), String(o.eff[0]));
	t('③ ★**点击之前**：`pc.ev.notes` **不存在**（渲染期不落效果，`#1408`／`#1468`）',
		o.notesAtRender === undefined, JSON.stringify(o.notesAtRender));
	t('④ ★★**点击那一刻**：`pc.ev.notes.n_x === true`（＝**授予真的发生了** ← 本件的靶）',
		o.after?.n_x === true, JSON.stringify(o.after));
	t('⑤ ★**没有旧写路的残留**（`pc.world.n_x` **不存在** —— `<<setflag>>` 已删，`#1507` ③）',
		o.legacy === undefined, JSON.stringify(o.legacy));
	rmSync(WORK, { recursive: true, force: true });
}

// ── 红态（能假：**只动授予链那一环**）──────────────────────────────────
{
	const { WORK, stories } = makeRoot('no-yields');
	const o = await observe(stories);
	t('⑥ ★反例：抽掉 `links[].yields`（**不动 `notes.json`**）⇒ `pc.ev.notes` 仍 `undefined`（本件会红）',
		o.after === undefined, JSON.stringify(o.after));
	rmSync(WORK, { recursive: true, force: true });
}

if (bad) { console.error(`\n✗ 笔记授予运行时面自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 笔记授予运行时面自证通过（点击那一刻 · 编进链接非渲染期 · 旧写路归零 · 抽掉授予必红）');
