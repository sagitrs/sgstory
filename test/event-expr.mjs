// `#1562`（阶 2a）自证：**事件声明面**（`data/events.json` ⇒ 生成表 `Game.Events.defs`）＋ **链接引用**（`use` ⇒ `data-sg-call`）
//
// 诉求：★事件的**声明**与**引用**要有一个**编译期**能判的口 ——
//   · 声明住**生成表**（照 `data/tables.json` 的既有形 ✓ ✗ 不新造载体）；
//   · 引用随**链接**走（`data-sg-call`，照 `data-sg-effects`／`data-sg-args` 的形 ✓）；
//   · ★**名字写错 ⇒ 编译期点名**（✗ 一路绿到玩家面前才炸 —— 照 1c 的 `actor-ref` 同一精神 ✓）。
//
// 判据（每条能假）：
// ① ★**生成件真的出**：`19-events.twee` 被生成 ＋ 内容是 `:: Game Events [script]` ＋ `Game.Events` ＋ `defs`
// ② ★**产物里真的在**：`build/game.twee` 含 `Game.Events` ＋ ★链接带 **`data-sg-call="斩"`**
// ③ ★**好引用** ⇒ `build` **rc=0**（★正例；✗ 只测失败面）
// ④ ★**能假·坏引用**：`use` 改成**未宣告的名字** ⇒ `build` **rc≠0** ＋ `[event-ref]` **点名**
// ⑤ ★**能假·白名单**：链接加一个**白名单外**字段 ⇒ `build` **rc≠0** ＋ 点名（既有 `unmappedLinkFields` 自动接管 ⇒ 白名单半**零新代码** ✓）
// ⑥ ★**能假·生成件登记**：从 `files` 撤掉 `19-events.twee` ⇒ `build` **rc≠0** ＋ `[unclaimed-file]`
//    （★③ 那条"手写登记"不是惯例而是**门** ✓）
//
// ★★前置（本仓今日要紧的一条）：★每次 build 前**清该故事的生成物**
//   `{00-meta,15-tables,17-rules,19-events}.twee` —— ★因为 `genNeeds` 只判"存在"✗"新鲜度" ⇒
//   ★会**跳过重编** ⇒ 编译期守卫**根本不跑** ⇒ 刀**假绿** ✗（★协调席已裁：那条修完本件的"重编下红"格要复验 ✓）。
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FX = join(ROOT, 'test/fixtures/m3-event-expr/stories');
const SLUG = 'ev-basic';
const GEN = ['00-meta.twee', '15-tables.twee', '17-rules.twee', '19-events.twee'];
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

/** 该故事目录下**清生成物**（★见件头"前置"：✗ 不清 ⇒ genNeeds 跳过重编 ⇒ 守卫不跑 ✗）。 */
const clearGen = (storiesRoot) => {
	const d = join(storiesRoot, SLUG);
	if (!existsSync(d)) return;
	for (const f of readdirSync(d)) if (GEN.includes(f)) rmSync(join(d, f));
};
/** 跑一次 build（★`build/game.twee` 逐故事覆盖 ⇒ 单故事根才是可读的产物 ✓）。 */
const buildWith = (storiesRoot) => {
	clearGen(storiesRoot);
	try {
		execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: storiesRoot }, stdio: 'pipe' });
		return { rc: 0, out: '', twee: existsSync(join(ROOT, 'build/game.twee')) ? readFileSync(join(ROOT, 'build/game.twee'), 'utf8') : '' };
	} catch (e) {
		return { rc: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? ''), twee: '' };
	}
};
/** 造一个**临时副本**（只改一处 ⇒ 归因清楚 ✓）。`mutate(storyDir)` 在副本上动手。 */
const withCopy = (mutate) => {
	const W = mkdtempSync(join(tmpdir(), 'sg-event-'));
	try {
		const stories = join(W, 'stories');
		cpSync(FX, stories, { recursive: true });
		mutate(join(stories, SLUG));
		return buildWith(stories);
	} finally { rmSync(W, { recursive: true, force: true }); }
};
const setUse = (d, v) => {
	const p = join(d, 'data/passages.json'); const s = JSON.parse(readFileSync(p, 'utf8'));
	s['开场'].links[0].use = v; writeFileSync(p, JSON.stringify(s, null, 1) + '\n');
};

// ---- ① / ② / ③ 好引用的正例 ----
const r = buildWith(FX);
t('③ 好引用 ⇒ `build` rc=0（★正例）', r.rc === 0, r.out.slice(0, 200));
t('① 生成件被产出（`19-events.twee` 在）', existsSync(join(FX, SLUG, '19-events.twee')));
{
	const g = existsSync(join(FX, SLUG, '19-events.twee')) ? readFileSync(join(FX, SLUG, '19-events.twee'), 'utf8') : '';
	t('① 生成件形对（`:: Game Events [script]` ＋ `Game.Events` ＋ `defs`）', /::\s*Game Events \[script\]/.test(g) && /Game\.Events/.test(g) && /\bdefs\b/.test(g), g.slice(0, 120).replace(/\n/g, '␤'));
	t('② 产物含 `Game.Events`（生成表进了产物）', /Game\.Events/.test(r.twee));
	t('② ★链接带 `data-sg-call="斩"`（★引用随链接走）', r.twee.includes('data-sg-call="斩"'),
		(r.twee.match(/data-sg-call="[^"]*"/) ?? ['（无）'])[0]);
}

// ---- ④ 能假：坏引用 ⇒ 编译期点名 ----
{
	const b = withCopy((d) => setUse(d, '不存在的事件'));
	t('④ ★坏引用（未宣告名）⇒ `build` rc≠0', b.rc !== 0, 'rc=' + String(b.rc));
	t('④-b ★点名 `[event-ref]` ＋ 那个名字', /\[event-ref\]/.test(b.out) && b.out.includes('不存在的事件'), b.out.replace(/\s+/g, ' ').slice(0, 200));
}

// ---- ⑤ 能假：白名单外字段 ⇒ 点名（既有 unmappedLinkFields 自动接管）----
{
	const b = withCopy((d) => {
		const p = join(d, 'data/passages.json'); const s = JSON.parse(readFileSync(p, 'utf8'));
		s['开场'].links[0].user = '吾';   // ★白名单外（拼写相近 `use` ⇒ 点名应含提示 ✓）
		writeFileSync(p, JSON.stringify(s, null, 1) + '\n');
	});
	t('⑤ ★白名单外字段 ⇒ `build` rc≠0 ＋ 点名', b.rc !== 0 && /白名单|未知|use/.test(b.out), b.out.replace(/\s+/g, ' ').slice(0, 200));
}

// ---- ⑥ 能假：生成件未登记 ⇒ [unclaimed-file] 门 ----
{
	const b = withCopy((d) => {
		const p = join(d, '00-story.json'); const s = JSON.parse(readFileSync(p, 'utf8'));
		s.files = s.files.filter((f) => !/19-events\.twee$/.test(f));
		writeFileSync(p, JSON.stringify(s, null, 1) + '\n');
	});
	t('⑥ ★生成件未登记 ⇒ `build` rc≠0 ＋ `[unclaimed-file]`（★登记是门，✗ 不是惯例）',
		b.rc !== 0 && /unclaimed-file/.test(b.out), b.out.replace(/\s+/g, ' ').slice(0, 220));
}

// ---- ⑨ ★`#1583` 合后的**自然路径**格：✗ 清生成物，改数据 ⇒ 守卫**照样跑**（✗ 假绿）----
//   ★件头"前置"记的是本件当时的**绕行**（每格先清生成物）—— 现在 `genNeeds` 会比**输入指纹**，
//   所以★自然路径（改数据、不清产物）也必须咬住 ⇒ 本格**故意不清**，专测这一点 ✓
{
	// ★造副本、**先编一次**（留下产物＋指纹），再改数据、**不清产物** ⇒ 第二次 build 应当**重编并咬住**。
	const W = mkdtempSync(join(tmpdir(), 'sg-event-nat-'));
	let r1, r2;
	try {
		const stories = join(W, 'stories');
		cpSync(FX, stories, { recursive: true });
		// 第一次：净态（副本自带无产物）⇒ 正常编出产物 ＋ 写指纹
		r1 = (() => {
			try { execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' }); return { rc: 0 }; }
			catch (e) { return { rc: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
		})();
		// 第二次：**只把事件名改成未宣告的**，★不清产物、★不清指纹 ⇒ 修前这里 rc=0（假绿）
		const dp = join(stories, SLUG, 'data/events.json');
		const dd = JSON.parse(readFileSync(dp, 'utf8'));
		dd.events['斩'] && (delete dd.events['斩'], dd.events['未宣告的事件']);
		writeFileSync(dp, JSON.stringify(dd, null, 1) + '\n');
		r2 = (() => {
			try { execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' }); return { rc: 0, out: '' }; }
			catch (e) { return { rc: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
		})();
	} finally { rmSync(W, { recursive: true, force: true }); }
	t('⑨ ★`#1583` 自然路径：改数据**不清产物** ⇒ 守卫照样跑（✗ 假绿）',
		r1.rc === 0 && r2.rc !== 0 && /event-ref/.test(r2.out),
		`首次 rc=${r1.rc}｜改后 rc=${r2.rc}（★修前此处 rc=0 ＝ 假绿）｜out=${(r2.out || '').replace(/\s+/g, ' ').slice(0, 160)}`);
}

// ---- ⑩ ★★评审 CR（tester-4）：**指纹不可得** ⇒ 保守重编（✗ 静默跳过）----
//   ★复现路径（评审实测）：产物齐备 ⇒ **只删 `<DIST_DIR>`**（`INPUTS.json` 随它没了）⇒ 改数据 ⇒
//     修前 `build` rc=0、无重编、生成件**仍旧值** ✗（＝`#1583` 同一病灶，触发条件换成"指纹不可得"）
//   ★为什么必咬：★"删 `dist`"是**常规 clean 动作**（常与故事生成物两向清）⇒ 这条路径必被踩到 ✓
{
	const W = mkdtempSync(join(tmpdir(), 'sg-event-fpmiss-'));
	let r1, r2, genAfter;
	try {
		const stories = join(W, 'stories');
		cpSync(FX, stories, { recursive: true });
		const run = () => {
			try { execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' }); return { rc: 0, out: '' }; }
			catch (e) { return { rc: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
		};
		r1 = run();                                        // ① 编出产物 ＋ 写指纹（`<DIST_DIR>` 随故事根）
		rmSync(join(W, 'dist'), { recursive: true, force: true });   // ② ★只删 dist ⇒ 指纹没了，产物还在
		// ③ 改数据（不改产物、不补指纹）
		const dp = join(stories, SLUG, 'data/events.json');
		const dd = JSON.parse(readFileSync(dp, 'utf8'));
		if (dd.events?.['斩']) dd.events['斩'].value = 42;
		writeFileSync(dp, JSON.stringify(dd, null, 1) + '\n');
		r2 = run();
		genAfter = existsSync(join(stories, SLUG, '19-events.twee')) ? readFileSync(join(stories, SLUG, '19-events.twee'), 'utf8') : '';
	} finally { rmSync(W, { recursive: true, force: true }); }
	t('⑩ ★指纹不可得（只删 `<DIST_DIR>`）⇒ **保守重编**（✗ 静默跳过）',
		r1.rc === 0 && r2.rc === 0 && /value:\s*42/.test(genAfter),
		`首次 rc=${r1.rc}｜删 dist 改数据后 rc=${r2.rc}｜生成件含新值=${/value:\s*42/.test(genAfter)}（★修前此处生成件仍旧值 ✗）`);
}

// ---- ⑪ ★★评审 CR（同向第二条）：**指纹坏掉**（`INPUTS.json` 解析不了）⇒ 同样保守重编（✗ 静默跳过）----
//   ★与 ⑩ **同一档**但**不同入口**：⑩ 走 `!fp`（文件不在），⑪ 走 `catch`（在但坏）——
//   ★两个入口必须**同结论**（✗ 一个保守一个退回），否则"坏指纹"这条会漏 ✓
{
	const W = mkdtempSync(join(tmpdir(), 'sg-event-fpbad-'));
	let r1, r2, genAfter;
	try {
		const stories = join(W, 'stories');
		cpSync(FX, stories, { recursive: true });
		const run = () => {
			try { execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' }); return { rc: 0, out: '' }; }
			catch (e) { return { rc: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
		};
		r1 = run();
		writeFileSync(join(W, 'dist', 'INPUTS.json'), '{ 这不是 JSON');   // ★在但**坏**
		const dp = join(stories, SLUG, 'data/events.json');
		const dd = JSON.parse(readFileSync(dp, 'utf8'));
		if (dd.events?.['斩']) dd.events['斩'].value = 43;
		writeFileSync(dp, JSON.stringify(dd, null, 1) + '\n');
		r2 = run();
		genAfter = existsSync(join(stories, SLUG, '19-events.twee')) ? readFileSync(join(stories, SLUG, '19-events.twee'), 'utf8') : '';
	} finally { rmSync(W, { recursive: true, force: true }); }
	t('⑪ ★指纹**坏掉**（`catch` 入口）⇒ 同档保守重编（✗ 两个入口结论不一）',
		r1.rc === 0 && r2.rc === 0 && /value:\s*43/.test(genAfter),
		`首次 rc=${r1.rc}｜坏指纹改数据后 rc=${r2.rc}｜生成件含新值=${/value:\s*43/.test(genAfter)}`);
}

if (bad) { console.error(`\n✗ 事件声明面（阶 2a）自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 事件声明面（阶 2a）自证通过（生成表 · 引用随链接 · 名字级点名 · 白名单 · 登记门）');
