// `#1571`（`#1222` 链 1c）自证：**实体作为读／写目标**（声明面加「对象」维 —— 两端同一个词 `actor`）
//
// ★判据（每条对应一处失效方式；★两端**同一套格**复用 ⇒ 这正是"合一笔"的理由）：
//   ① **纯函数面**：`actorRefsOf` 抓**两端**的位置（`panels.props[].actor` ＋ 链接 `actor`）；
//      `undeclaredActorProblems` ⇒ 未宣告名点名（能假：给一个已在表里的名 ⇒ ✗ 不报）
//   ② **读端（真机）**：`panels` 的 prop 给 `actor` ⇒ 侧栏印**实体**的属性；★并**同时**印 `pc` 的那条（验收②"不回归"）
//      ★能假：撤 `actor` ⇒ 那一条退回读 `pc`（实体值**印不出**）
//   ③ **写端（真机）**：链接带 `actor` ⇒ 点击后**实体的**属性变了、`pc` 的**没变**（✗ 写错对象）
//      ★能假：撤 `actor` ⇒ 实体不变（写到了 `pc`）
//   ④ **运行时兜底 fail-loud**：`Sg.actors.resolve(pc, '未宣告名')` ⇒ 抛并点名（✗ 静默回退 `pc`）
//   ⑤ **声明面 0 特化**：两端的 `actor` 都是**裸名**（✗ 含 `pc`／✗ 含路径分隔符）
//   ⑥ **编译期（端到端刀）**：未宣告的实体名 ⇒ `build` **rc=1** 且 `[actor-ref]` 点名（✗ 等玩家）
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { actorRefsOf, undeclaredActorProblems } from '../editor/lib/core/audit-shared.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SLUG = 'actor-basic';
const FIX_FROM = 'test/fixtures/m3-actor-fixture/stories';
const GEN = ['15-tables.twee', '16-notes.twee', '17-rules.twee', '18-chargen.twee', '00-meta.twee'];

// ── ① 纯函数面（✗ 不依赖夹具 ⇒ 夹具缺席时仍判）────────────────────────────
{
	const contract = { members: [
		{ name: 'panels', kind: 'const', value: [{ as: 'bar', props: [{ actor: '木桩', valueKey: 'hp' }, { valueKey: 'hp' }] }] },
	] };
	const passages = { 开场: { links: [{ id: '开场.劈', actor: '木桩' }, { id: '开场.走' }] } };
	const refs = actorRefsOf({ contract, passages });
	t('① 抽取口抓到**两端**（读端 `panels[0].props[0]` ＋ 写端 链接「开场.劈」）',
		refs.length === 2 && refs[0].where.includes('panels[0].props[0]') && refs[1].where.includes('开场.劈'),
		JSON.stringify(refs));
	t('① 缺省（✗ 给 `actor`）⇒ **不产生引用**（✗ 把"缺省＝`pc`"当成一个引用 ✓）',
		!refs.some((r) => r.name === ''), JSON.stringify(refs));
	t('① **能假**：未宣告名 ⇒ 点名（含位置）',
		undeclaredActorProblems({ refs, declared: { 木桩: {} } }).length === 0
		&& undeclaredActorProblems({ refs, declared: {} }).length === 2,
		JSON.stringify(undeclaredActorProblems({ refs, declared: {} })));
}

// ── 夹具面（缺 ⇒ 明说未判，✗ 不静默绿）──────────────────────────────────────
if (!existsSync(join(ROOT, FIX_FROM))) {
	console.log('  ○ 未判：夹具缺席 ⇒ ②~⑥（真机两端／编译期刀）未判；① 仍判 ✓');
} else {
	const WORK = mkdtempSync(join(tmpdir(), 'sg-1571-'));
	// ★每次观测**新的故事根**（`boot()` 的 `HTML_OF` 按路径缓存 —— 见 `panels-render.mjs` 的同一课）
	let round = 0;
	const build = (mutate) => {
		round += 1;
		const root = join(WORK, `r${round}`, 'stories');
		cpSync(join(ROOT, FIX_FROM), root, { recursive: true });
		const dir = join(root, SLUG);
		for (const f of GEN) { const q = join(dir, f); if (existsSync(q)) rmSync(q); }   // ★清生成物（陈旧件会掩盖新声明）
		if (mutate) mutate({ dir, read: (p) => JSON.parse(readFileSync(p, 'utf8')), write: (p, v) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n') });
		execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: root }, stdio: 'pipe' });
		return { page: join(WORK, `r${round}`, 'dist', 'stories', SLUG, 'index.html'), root, dir };
	};
	// ★故事根＝**build 时那个**（✗ 别从产物路径反推 —— 产物在 `<root>/../dist`，反推会指到 dist ✓）
	const bootAt = async (page, root) => {
		process.env.SG_STORIES_DIR = root;
		const { boot } = await import('./boot.mjs');
		return boot({ story: page, entry: '开场', random: 0.5 });
	};
	const captionOf = async (B) => {
		B.w.SugarCube.Engine.play('StoryCaption');
		await B.settle(); await sleep(150); await B.settle();
		const el = B.w.document.querySelector('#story-caption') || B.w.document.body;
		return String(el.textContent ?? '').replace(/\s+/g, ' ');
	};

	try {
		// ── ② 读端（真机）：两条并存（实体那条 ＋ 缺省 `pc` 那条）────────────
		const { page, root } = build();
		const B = await bootAt(page, root);
		const cap = await captionOf(B);
		t('② 读端：`actor` 那条印**实体**的值（「木桩的血 10000 / 10000」）',
			/木桩的血/.test(cap) && /10000 \/ 10000/.test(cap), cap.slice(-140));
		t('② **不回归**（验收②）：缺省那条仍印 `pc` 的值（「我的血 12 / 12」）',
			/我的血/.test(cap) && /12 \/ 12/.test(cap), cap.slice(-140));
		const actorHp0 = B.w.eval('String(SugarCube.State.variables.actors["木桩"].hp)');
		t('② 实体表已由**声明面**种下（`State.variables.actors["木桩"].hp === "10000"`）', actorHp0 === '10000', actorHp0);
		B.close?.();

		// ── ③ 写端（真机）：点击 ⇒ 实体变、`pc` 不变 ────────────────────────
		const { page: p2, root: r2 } = build();
		const B2 = await bootAt(p2, r2);
		const a = B2.w.document.querySelector('#passages a.link-internal');
		t('③ 走得到那条链接（★按引擎自己的作用域 `#passages a.link-internal` 取 —— ✗ 别抓侧栏的链接）', !!a, String(B2.w.document.querySelector('#passages')?.innerHTML ?? '').slice(0, 120));
		if (a) { a.click(); await B2.settle(); await sleep(200); await B2.settle(); }
		// ★写端的**路径语义沿用既有**（裸键 ⇒ `ev.`；顶层标量 ✗ 可写 ⇒ 用点路径容器，真数据同法：`"心情.值"`）
		const hurt = B2.w.eval('String(SugarCube.State.variables.actors["木桩"].伤.累计)');
		const hpAfter = B2.w.eval('String(SugarCube.State.variables.actors["木桩"].hp)');
		const pcHurt = B2.w.eval('JSON.stringify(SugarCube.State.variables.pc.伤 ?? null)');
		t('③ 写端：`actor` 那条 ⇒ 点击后**实体的**属性变了（`木桩.伤.累计` 0 → 3）', hurt === '3', hurt);
		t('③ ✗ 写错对象：`pc` 的同一路径**没写**（`pc.伤` 仍为 null）', pcHurt === 'null', pcHurt);
		t('③ 且**另一条**属性未受影响（`木桩.hp` 仍 10000 ⇒ 只写了声明的那条路径 ✓）', hpAfter === '10000', hpAfter);
		t('④ 运行时兜底：未宣告的实体名 ⇒ **抛**并点名（✗ 静默回退 `pc`）', (() => {
			try { B2.w.eval('Sg.actors.resolve(SugarCube.State.variables.pc, "不存在的实体")'); return false; }
			catch (e) { return /不在实体表/.test(String(e?.message ?? e)); }
		})());
		t('④ 兜底反证：**缺省**（✗ 给名字）⇒ 原样回 `pc`（✗ 不抛 ⇒ 本格可区分）',
			B2.w.eval('Sg.actors.resolve(SugarCube.State.variables.pc, "") === SugarCube.State.variables.pc') === true);
		B2.close?.();

		// ── ②③ 能假：撤 `actor` 两处 ⇒ 两条都退回 `pc` ─────────────────────
		const { page: p3, root: r3 } = build(({ dir, read, write }) => {
			const cp = join(dir, 'data', 'contract.json'); const c = read(cp);
			for (const m of c.members) if (m.name === 'panels') for (const b of m.value) for (const pr of (b.props ?? [])) delete pr.actor;
			write(cp, c);
			const pp = join(dir, 'data', 'passages.json'); const pd = read(pp); delete pd['开场'].links[0].actor; write(pp, pd);
		});
		const B3 = await bootAt(p3, r3);
		const cap3 = await captionOf(B3);
		t('② **能假**：撤读端的 `actor` ⇒ 实体值**印不出**（✗ 找不到 `10000`）', !/10000/.test(cap3), cap3.slice(-140));
		// ★读侧栏会把当前段切到 `StoryCaption`（那是读侧栏的手法）⇒ 点链接前**回开场**（✗ 否则 `#passages` 里没有正文链接 ✓）
		B3.w.SugarCube.Engine.play('开场'); await B3.settle(); await sleep(150); await B3.settle();
		const a3 = B3.w.document.querySelector('#passages a.link-internal');
		if (a3) { a3.click(); await B3.settle(); await sleep(200); await B3.settle(); }
		const hurt3 = B3.w.eval('String(SugarCube.State.variables.actors["木桩"].伤.累计)');
		const pcHurt3 = B3.w.eval('String(SugarCube.State.variables.pc.伤?.累计 ?? "（无）")');
		t('③ **能假**：撤写端的 `actor` ⇒ 实体**不变**（`木桩.伤.累计` 仍 0）', hurt3 === '0', hurt3);
		t('③ 且那笔"+3"**落到了 `pc`**（`pc.伤.累计 === 3` ⇒ 证明它只是写错了对象 ✓）', pcHurt3 === '3', pcHurt3);
		B3.close?.();

		// ── ⑤ 声明面 0 特化（结构读数：两端都是**裸名**）──────────────────
		const c0 = JSON.parse(readFileSync(join(ROOT, FIX_FROM, SLUG, 'data', 'contract.json'), 'utf8'));
		const p0 = JSON.parse(readFileSync(join(ROOT, FIX_FROM, SLUG, 'data', 'passages.json'), 'utf8'));
		const names = actorRefsOf({ contract: c0, passages: p0 }).map((r) => r.name);
		t('⑤ 声明面 0 特化：两端的 `actor` 都是**裸名**（✗ 含 `pc` ／✗ 含 `.`）',
			names.length === 2 && names.every((n) => !/pc/i.test(n) && !n.includes('.')), JSON.stringify(names));

		// ── ⑥ 编译期（端到端刀）：未宣告的实体名 ⇒ build rc=1 并点名 ────────
		let rc = 0, out = '';
		try {
			build(({ dir, read, write }) => {
				const cp = join(dir, 'data', 'passages.json'); const pd = read(cp);
				pd['开场'].links[0].actor = '没宣告的实体'; write(cp, pd);
			});
		} catch (e) { rc = e?.status ?? 1; out = String(e?.stdout ?? '') + String(e?.stderr ?? ''); }
		t('⑥ 编译期：未宣告的实体名 ⇒ `build` **rc≠0**（✗ 一路绿到玩家）', rc !== 0, `rc=${rc}`);
		t('⑥ 且点名到位（`[actor-ref]` ＋ 那个名字）', /\[actor-ref\]/.test(out) && /没宣告的实体/.test(out), out.split('\n').find((l) => l.includes('actor-ref')) ?? out.slice(0, 160));
	} finally {
		rmSync(WORK, { recursive: true, force: true });
	}
}

if (bad) { console.error(`\n✗ 实体对象维自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 实体对象维自证通过（两端同词 `actor`：读端印实体／写端改实体；能假两把刀；运行时＋编译期点名）');
