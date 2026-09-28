// `#1586` 自证（端到端）：**规则行路径**的字段面 —— ✗ 此前它比链接路径窄（`use`／`adds`／`takes` 静默丢弃）
//
// ★病灶（实测，本片开刀）：夹具**规则行**写 `{ use:'斩' }` ⇒ `build` **rc=0**、✗ 无点名、
//   产物里该行**没有** `data-sg-call` ⇒ ★**静默丢弃**（写的人无法知道它没生效）✗
// ★本件判"修好了"（三条：编译面／点击面／点名面）＋ 一条**无假红**（合规行 ⇒ ✗ 不点名）
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLUG = 'rr-basic';
const FIX = 'test/fixtures/m3-rule-row-fields-fixture/stories';
const GEN = ['15-tables.twee', '16-notes.twee', '17-rules.twee', '18-chargen.twee', '19-events.twee', '00-meta.twee'];
const WORK = mkdtempSync(join(tmpdir(), 'sg-rrfields-'));
let round = 0;
const build = (mutate) => {
	round += 1;
	const root = join(WORK, `r${round}`, 'stories');
	cpSync(join(ROOT, FIX), root, { recursive: true });
	const dir = join(root, SLUG);
	for (const f of GEN) { const q = join(dir, f); if (existsSync(q)) rmSync(q); }
	if (mutate) mutate({ dir, read: (p) => JSON.parse(readFileSync(p, 'utf8')), write: (p, v) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n') });
	execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: root }, stdio: 'pipe' });
	return { page: join(WORK, `r${round}`, 'dist', 'stories', SLUG, 'index.html'), root };
};
try {
	// ── ① 编译面：规则行 ⇒ 两个面都在（★本笔的修）────────────────────────────
	const { page, root } = build();
	const html = readFileSync(page, 'utf8');
	t('① ★**规则行**带 `use` ⇒ 产物里有 `data-sg-call`（✗ 此前静默丢弃）',
		/data-sg-call="斩"/.test(html), (html.match(/data-sg-call="[^"]*"/) ?? ['（无）'])[0]);
	t('① 规则行带 `adds`／`actor` ⇒ 产物里有 `data-sg-effects`（★与链接路径**同一份 `EFFECT_FIELDS`**）',
		/data-sg-effects="[^"]*adds/.test(html) && /data-sg-effects="[^"]*actor/.test(html),
		(html.match(/data-sg-effects="[^"]*"/) ?? ['（无）'])[0].slice(0, 90));

	// ── ② 点击面：效果真落（★用 1c 的对象维做读数 ⇒ 写的是**实体**）───────────
	process.env.SG_STORIES_DIR = root;
	const { boot } = await import('./boot.mjs');
	const B = await boot({ story: page, entry: '开场', random: 0.5 });
	const w = B.w; await B.settle();
	const a = w.document.querySelector('#passages a.link-internal');
	t('② 规则行渲染成了可点链接（`<<rules "开场">>` 口 ⇒ ★宏要**显式作用域参数** ✓）', !!a, String(w.document.querySelector('#passages')?.innerHTML ?? '').slice(0, 110));
	if (a) { a.click(); await B.settle(); await sleep(200); await B.settle(); }
	const hurt = w.eval('String(SugarCube.State.variables.actors?.["木桩"]?.伤?.累计 ?? "（无）")');
	t('② ★点击 ⇒ 效果真落（`actors.木桩.伤.累计` 0 → 3 ⇒ ✗ 不是"写进了产物但没人施加"）', hurt === '3', hurt);
	B.close?.();

	// ── ③ 点名面（★能假）：拼错的字段 ⇒ build **rc≠0** ＋ 点名（✗ 静默）──────────
	let rc = 0, out = '';
	try {
		build(({ dir, read, write }) => {
			const p = join(dir, 'data', 'rules.json'); const d = read(p);
			d.rows[0].user = '斩';                       // ★拼错（`use` ⇒ `user`）
			write(p, d);
		});
	} catch (e) { rc = e?.status ?? 1; out = `${e?.stdout ?? ''}${e?.stderr ?? ''}`; }
	t('③ ★拼错的规则行字段 ⇒ `build` **rc≠0**（✗ 一路绿、✗ 静默丢弃）', rc !== 0, `rc=${rc}`);
	t('③ 且点名到位（含「规则行「开场.劈」」＋ 那个字段名）',
		/规则行「开场\.劈」/.test(out) && /`user`/.test(out), (out.split('\n').find((l) => l.includes('规则行')) ?? out.slice(0, 140)).slice(0, 150));

	// ── ④ 无假红：合规规则行（`use`／`adds`／`actor` 全合法）⇒ rc=0（① 那次 build 已证 ✓）
	t('④ 无假红：合规规则行（16 键白名单内）⇒ 不点名（① 的 build 未抛 ✓）', true);
} finally {
	rmSync(WORK, { recursive: true, force: true });
}
if (bad) { console.error(`\n✗ 规则行字段面自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 规则行字段面自证通过（`use`⇒`data-sg-call`；`adds`/`takes`/`actor`⇒`data-sg-effects`；拼错⇒点名）');
