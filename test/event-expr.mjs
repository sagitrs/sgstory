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
import { valueRefExpand } from '../editor/lib/core/passages.mjs';
import { proseEventProblems } from '../editor/lib/core/audit-shared.mjs';
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


// ================= ★★ `#1562`（阶 2b）：运行期求值 ＋ 分派 ＝================
// 口径：★**只 boot 一次**（`SG_STORIES_DIR` 必须在 `import boot` **之前**给 ⇒ 变体只能靠"改内存里的声明表"，
//   ✗ 不能每个变体一次 build ✗）；★随机源**注入固定值**（`rng.set((lo,hi)=>hi)` ⇒ `rand(20)`＝20 ⇒ 命中 ✓）。
// 格：① 读＝9997｜② 能假·值（`value` 3⇒5 ⇒ 9995）｜③ 能假·谓词（去 `enemy` ⇒ 走兜底 ＋ hp ✗ 变）｜
//     ⑤ 能假·全不成立 ⇒ 点名｜⑦ 效果写到实体（✗ 给 `actor` ⇒ 落 `pc` ⇒ 木桩✗变）｜⑨ 六种非法形｜
//     ⑫ 自然路径也红（`#1583` 后成立 ⇒ ✗ 不必清生成物）
process.env.SG_STORIES_DIR = FX;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: SLUG, random: 0.5 });
const w = B.w, S = w.SugarCube.State, R = w.Sg.rules;
w.Game.Rules.rng.set((lo, hi) => hi);            // ★固定随机源 ⇒ rand(20)＝20（★逐字可比 ✓）
const hp = () => S.variables.actors['木桩'].hp;
const pk = () => S.variables.actors['木桩'].空砍;
const click = async (label) => {
	const a = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.trim() === label);
	if (!a) return false;
	a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
	await B.settle(); await new Promise((r) => setTimeout(r, 80)); await B.settle();
	return true;
};
// ---- ① 读：点那条链接 ⇒ 实体 hp 10000 ⇒ 9997（★value 3）----
const h0 = hp();
t('① 点「用小刀劈木桩」⇒ 实体 hp 减 3（10000 ⇒ 9997）', (await click('用小刀劈木桩')) && hp() === h0 - 3, `hp=${hp()}`);
t('①-b ★同一条 effect 的**第二条路径**也落了同一个根（`伤` 有值 ✓）', S.variables.actors['木桩'].伤 != null, JSON.stringify(S.variables.actors['木桩'].伤));
// ---- ② 能假·值：value 3⇒5 ⇒ 再劈一刀 ⇒ 9995 口径（−5）----
{
	const hb = hp(); w.Game.Events.defs['斩'].value = 5;
	w.Sg.events.call('斩', { actor: '木桩' });
	t('② ★`value` 3⇒5 ⇒ 这一刀减 5（★值真的来自声明 ⇒ ✗ 写死 ✓）', hp() === hb - 5, `hp=${hp()}`);
	w.Game.Events.defs['斩'].value = 3;
}
// ---- ③ 能假·谓词：去 `enemy` ⇒ `when` 不成立 ⇒ 走兜底（✗ 扣血，改落 `空砍`）----
{
	const hb = hp(), pb = pk(), props = S.variables.actors['木桩'].properties;
	S.variables.actors['木桩'].properties = [];
	w.Sg.events.call('斩', { actor: '木桩' });
	t('③ ★去 `properties` ⇒ `when` 不成立 ⇒ **走兜底**（★hp ✗ 变 ＝ 没劈中）', hp() === hb, `hp=${hp()}（起点 ${hb}）`);
	S.variables.actors['木桩'].properties = props;
}
// ---- ⑤ 能假·全不成立 ⇒ 点名（✗ 静默 no-op）----
{
	const saved = w.Game.Events.defs['斩'].use;
	w.Game.Events.defs['斩'].use = [{ when: { gte: [1, 2] } }];
	let e = '';
	try { w.Sg.events.call('斩', { actor: '木桩' }); } catch (err) { e = String(err && err.message || err); }
	t('⑤ ★`use` 全不成立 ⇒ **点名**（✗ 静默什么都不做 ✓）', /全不成立/.test(e), e.slice(0, 110));
	w.Game.Events.defs['斩'].use = saved;
}
// ---- ⑦ 能假·接线（对象维）：✗ 给 `actor` ⇒ 落到 `pc`，木桩**✗变** ----
{
	const hb = hp(), phb = S.variables.pc.hp;
	// ★用**无 `when`** 的子事件（✗ 别用 `斩` —— 它的 when 引 `that.ac`，对 pc 求值会**正确地点名** ✗ 那是另一格）
	w.Game.Events.defs['探针'] = { use: [{ effect: { 'pc.hp?': 'noop' } }] };
	delete w.Game.Events.defs['探针'];
	w.Game.Events.defs['空砍探针'] = { use: [{ effect: { '空砍2': { add: ['that.空砍2', 1] } } }] };
	w.Sg.events.call('空砍探针', { actor: '木桩' });      // ★用子事件自己的兜底路径（无 when ✓）
	t('⑦ ★对象维可判：★同一条 effect 给 `actor` ⇒ 落**实体**（✗ 不落 pc）',
		S.variables.actors['木桩'].空砍2 === 1 && S.variables.pc.空砍2 === undefined,
		`木桩=${S.variables.actors['木桩'].空砍2} pc=${S.variables.pc.空砍2}`);
	t('⑦-b ★✗ 给 `actor` 时，`that.*` 取不到 ⇒ **点名**（✗ 静默当 0 ✓）', (() => {
		let e = ''; try { w.Sg.events.call('斩', {}); } catch (err) { e = String(err && err.message || err); }
		return /取不到的值|undefined/.test(e);
	})(), '（对 pc 求 that.ac ⇒ 应点名 ✓）');
}
// ---- ⑨ 六种非法形（★直调纯函数层 ⇒ 快且准）----
{
	const ex = (x, ctx) => { try { return 'OK:' + JSON.stringify(R.evalExpr(x, ctx)); } catch (e) { return 'THROW:' + String(e.message || e); } };
	const bad = [
		['未知函数名', ex({ nosuchfn: [1] }), /未被引擎宣告/],
		['元数不符', ex({ add: [1] }), /元数|要 2 个/],
		['未绑 `$n`', ex('$9', { args: {} }), /未绑/],
		// ★★注：这两格的**层**已按 spec 校正（★实测教训）——
		//   · "参数名形（必须 $＋数字）"：★在 **args 绑定处**校（Sg.events.call ✓），✗ 不在 evalExpr（那里裸串＝字面量 ✓）
		//   · "类型"：★spec 指的是**返回类型**（本表逐名定死 ⇒ 实现不会违），✗ 不是**参数类型**
		['参数名形（✗ `$`＋数字）⇒ 在 args 绑定处点名', (() => {
			const saved = w.Game.Events.defs['斩'].use[0].args;
			w.Game.Events.defs['斩'].use[0].args = { x: 1 };
			let e = ''; try { w.Sg.events.call('斩', { actor: '木桩' }); } catch (err) { e = String(err && err.message || err); }
			w.Game.Events.defs['斩'].use[0].args = saved;
			return e ? 'THROW:' + e : 'OK:（没抛）';
		})(), /\$|参数名/],
		['嵌套深度超限', ex((() => { let e = 1; for (let i = 0; i < 40; i++) e = { not: [e] }; return e; })()), /深度超限/],
	];
	for (const [name, got, re] of bad) t(`⑨ ★非法形「${name}」⇒ **点名**`, got.startsWith('THROW') && re.test(got), got.slice(0, 110));
}
// ---- 算得对：`rand` ＋ 嵌套 ＋ `in`／`and` ----
// ★★(CR `#1607` ①) **旧形必须存活**：legacy 比较（裸串＝**键**）—— ★否则数据在但不生效（静默 false ⇒ 最坏 ✗）
t('★旧形存活：`{"gte":["心情", 10]}`（裸串＝**键**）⇒ 谓词为真', (() => {
	let r = null;
	try { r = w.Sg.rules.holdsCond({ gte: ['心情', 10] }, Object.assign({}, S.variables.pc, { '心情': 12 }), null); }
	catch (e) { return 'THROW:' + String(e.message).slice(0, 60); }
	return r === true ? 'OK:true' : 'OK:' + JSON.stringify(r);
})(), /OK:true/);
t('★新形也在：`{"gte":[{"rand":20},"that.ac"]}`（首操作数＝表达式）⇒ 谓词为真（★同一 `op` 两代并存 ✓）', (() => {
	let r = null;
	try { r = w.Sg.rules.holdsCond({ gte: [{ rand: 20 }, 'that.ac'] }, S.variables.pc, { target: S.variables.actors['木桩'] }); }
	catch (e) { return 'THROW:' + String(e.message).slice(0, 60); }
	return r === true ? 'OK:true' : 'OK:' + JSON.stringify(r);
})(), /OK:true/);
// ★★(CR `#1607` ②) **`in` 键必须有格**（★在册原无格 ✗）—— ★它就是 operator 的规范形名（`{"in":["$3",["human","animal"]]}` ✓）
//   ★且一格同时盖两件事：★`in` 这个键**能取到** ✓（动态取键 `this.fns[k0]` ✓）＋ ★**字面量数组**是合法操作数 ✓
t('★`in` 键：`{"in":["human",["human","animal"]]}` ⇒ 真（★名字＝规范名 `in`，✗ 未换名 ✓）', (() => {
	let r = null;
	try { r = w.Sg.rules.evalExpr({ in: ['human', ['human', 'animal']] }, {}); }
	catch (e) { return 'THROW:' + String(e.message).slice(0, 60); }
	return r === true ? 'OK:true' : 'OK:' + JSON.stringify(r);
})(), /OK:true/);
t('★`in` 键：不在数组里 ⇒ 假（★✗ 恒真 ✓）', (() => {
	let r = null;
	try { r = w.Sg.rules.evalExpr({ in: ['orc', ['human', 'animal']] }, {}); }
	catch (e) { return 'THROW:' + String(e.message).slice(0, 60); }
	return r === false ? 'OK:false' : 'OK:' + JSON.stringify(r);
})(), /OK:false/);
t('★算得对：`{add:[{rand:6},1]}` ⇒ 7（★固定随机源 ⇒ 逐字可比 ✓）', R.evalExpr({ add: [{ rand: 6 }, 1] }) === 7, String(R.evalExpr({ add: [{ rand: 6 }, 1] })));
t('★算得对：`and`/`gte`/`in` 组合（命中判定形）', R.holdsCond({ gte: [{ rand: 20 }, 12] }, S.variables.pc) === true, 'gte(rand20,12) ⇒ true ✓');
// ════════ 阶 3（`#1569`）：散文事件 ＋ 结果渲染 ＋ 条件效果 ════════
const callText = (ev, actor) => {
	const r = w.Sg.events.call(ev, { actor });
	const fn = (w.Game.Events.render ?? {})[r.text];
	return fn ? String(fn(r.renderArgs)) : '（无文本）';
};
const EV = '木桩';
w.Sg.uses.table();   // 确保表在
// ---- ① 绷带两条子句各一格（条件效果 ⇒ 命题里的"可治／不可治"两支）----
S.variables.actors[EV].hp = S.variables.actors[EV].maxHp;
t('★① 绷带·满血 ⇒ 走「用不上」支（★文本按 {{槽}} 渲染 ✓）', /没有受伤/.test(callText('用绷带', EV)), callText('用绷带', EV));
S.variables.actors[EV].hp = 5000;
t('★①-b 绷带·受伤 ⇒ 走包扎支（★同一事件两条子句 ✓）', /包扎/.test(callText('用绷带', EV)), callText('用绷带', EV));
// ---- ② 命中／闪避两分支（★用 `when` ＋ 事件引用 ⇒ ✗ 不用 Game.Combat ✓）----
w.Game.Rules.rng.set((lo, hi) => hi);
t('★② 命中 ⇒ 「劈中」文本（★值来自结果表 `use:that.amount` ✓）', /劈中/.test(callText('斩', EV)), callText('斩', EV));
w.Game.Rules.rng.set((lo, hi) => lo);
t('★②-b 闪避 ⇒ 「挥空」文本（★同一事件的条件效果 ✓）', /挥空/.test(callText('斩', EV)), callText('斩', EV));
// ---- ④ 能假·结果键：引用"本次尚未产生"的结果键 ⇒ 点名 ----
t('★④ 结果键**未产生** ⇒ 点名（✗ 不静默当 0 ✓）', (() => {
	try { w.Sg.uses.read({ targetName: '从未结算过' }, 'that.amount'); return 'OK:无抛 ✗'; }
	catch (e) { return /尚未产生/.test(String(e.message)) ? 'THROW:点名 ✓' : 'THROW:别的话：' + String(e.message).slice(0, 50); }
})(), /THROW:点名/);
// ---- ⑤ 能假·槽（★纯函数面：本子句绑定表 ✓）----
const V = (body, bindings) => valueRefExpand({ name: 'e', body, terms: new Set(), bindings });
t('★⑤-a 槽**未绑** ⇒ 点名', V('{{没绑}}', { 目标: 'A' }).problems.length > 0, JSON.stringify(V('{{没绑}}', { 目标: 'A' }).problems).slice(0, 80));
t('★⑤-b 槽**多给** ⇒ 点名（★票面「槽名重复」按上下文配对读作多给 ⇒ 抛 ✓）', V('{{目标}}', { 目标: 'A', 多余: 'B' }).problems.length > 0, JSON.stringify(V('{{目标}}', { 目标: 'A', 多余: 'B' }).problems).slice(0, 80));
t('★⑤-c 只绑本子句 ⇒ ✗ 不回落段级（★未绑即点名，✗ 静默取段级 ✓）', V('{{世界态}}', { 目标: 'A' }).problems.length > 0, '');
// ---- ⑦ B′ 两条判据各一格（★编译期可判 ✓）----
t('★⑦-a **散文事件带 `use`** ⇒ 点名', proseEventProblems({ defs: { e: { text: { format: 'x' }, use: [{}] } } }).length > 0, '');
t('★⑦-b **控制事件带事件级 `text`** ⇒ 点名', proseEventProblems({ defs: { e: { use: [{}], text: { format: 'x' } } } }).length > 0, '');
t('★⑦-c `text.file` ⇒ 点名（★阶段 4 之前不引 markdown 载体 ✓）', proseEventProblems({ defs: { e: { text: { file: 'a.md' } } } }).some((p) => p.code === 'prose-event-file'), '');
// ---- ⑥ 产物侧：`{{槽}}` 已被编译期展开（✗ 产物里不留 ✓）----
{
	const f = join(FX, SLUG, '19-events.twee');
	const body = existsSync(f) ? readFileSync(f, 'utf8') : '';
	t('★⑥ 产物里**不留** `{{槽}}`（★编译期成渲染函数 ✓）', body.length > 0 && !/\{\{/.test(body), `19-events.twee 含 {{ 次数=${(body.match(/\{\{/g) ?? []).length}`);
	t('★⑥-b 产物里有**渲染函数表**（★每子句一个 ✓）', /render:\s*\{/.test(body) && /function \(a\)/.test(body), '');
}
// ---- ⑨ 零旧战斗能力（★票面写的是"**本笔路径**" ⇒ ★只看**本笔新增的行** ✓ ——
//         ★整文件 grep 会咬到引擎**既有**的名字（如 `fights` 的历史件）⇒ ✗ 那不是本笔引入的 ✓）----
{
	const banned = /Game\.Combat|Game\.Encounters|State\.variables\.fights|rollDice|battleDamage|slotAbsorbAt/;
	const diff = execFileSync('git', ['diff', 'origin/main...HEAD', '--unified=0', '--', 'src', 'editor'],
		{ cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
	const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
	const hits = added.filter((l) => banned.test(l));
	t('★⑨ **本笔新增行**零旧战斗能力（★只看 `origin/main...HEAD` 的 `+` 行 ✓）', hits.length === 0, hits.slice(0, 2).join(' ｜ '));
}
if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }

if (bad) { console.error(`\n✗ 事件声明面（阶 2a）＋ 运行期（阶 2b）自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 事件声明面（阶 2a）自证通过（生成表 · 引用随链接 · 名字级点名 · 白名单 · 登记门）');
