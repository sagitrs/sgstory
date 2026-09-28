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

if (bad) { console.error(`\n✗ 事件声明面（阶 2a）自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 事件声明面（阶 2a）自证通过（生成表 · 引用随链接 · 名字级点名 · 白名单 · 登记门）');
