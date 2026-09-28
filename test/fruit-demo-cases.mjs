// `#1609`（用例套接线审计 · **固化件**）：把 books `fruit-demo` 的 **7 条行为用例**固化进引擎夹具 ——
//   ★**自持 story 形态**（本夹具**自带**故事快照 ⇒ ✗ 指向 books 仓 ✓）。
//
// ★来路（防漂移）：故事面 ＝ `sagitrs/sgstory-books` 的 `stories/fruit-demo` **快照**（`#1609` 时点）；
//   用例面 ＝ 该书同名的 7 条（`enter`／`pick-and-eat`／`eat-then-exit`／`full-chain`／`no-eat-no-exit`／
//   `mood-by-value`／`mood-below`）—— ★它们**原随 `cases/` 在 `books#58` 删除** ⇒ 本件从 git 历史取回后固化 ✓。
//   ★**语料面归 M5 编译链**（`test/corpus-books-smoke.mjs` 对着 books `main` 跑 ✓）⇒ ★**✗ 到这里追新** ✓：
//   本夹具是**引擎能力面**的回归锚（值门／状态写／链接可见性），✗ 不是"最新故事内容"的看护者 ✓。
//
// ★为什么要有它（`#1609` 的原病灶）：★"夹具用例套**有的接线、有的没接线**"——没接线的那套删掉**全静默**
//   （四门全绿 ✗）⇒ 本件把这一套**挂进档**（`scripts/test-plan.mjs` 两段 ✓）＋ 自带**能假刀** ✓。
//
// ★两条腿：
//   ① **端到端**：真 `build`（自持 story）＋ 真 `scripts/case-run.mjs`（该夹具的用例根）⇒ 7/7 绿
//   ② **能假（刀）**：改**副本**里 `data/passages.json` 的**值门阈值**（65 ⇒ 9999）⇒ `mood-by-value`
//      （"值够了 ⇒ 该链接出现"）**精确红** ✓ ⇒ ★证明这套**真在判东西**（✗ 空跑恒绿 ✓）
//
// ★★一处必须自己断言的（`#1609` 实测）：★`scripts/case-run.mjs` 对**零用例**是
//   `○ 零用例：… ⇒ 本次未跑（rc=0，已明说）` ⇒ ★**rc 仍 0** ✗ ⇒ ★所以"跑了 7 条"这句必须**本件自己断言**
//   （✗ 不能靠跑器 rc ✓）—— 见 ②／④ 两格；★这也是全仓"没接线的套"为什么能静默的机理 ✓。
import { existsSync, mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SELFTEST = process.argv.includes('--selftest');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

const FIX = 'test/fixtures/fruit-demo-fixture';
const SLUG = 'fruit-demo';
const N = 7;                                           // ★用例条数（★丢一条必须红 ✓）
const GEN = ['00-meta.twee', '15-tables.twee', '17-rules.twee', 'audit.json'];
/** 该夹具的**提交面**（★生成物被 `.gitignore` 的 fixtures 变体忽略 ⇒ ✗ 入仓 ✓）。 */
const STORY_FILES = [
	'00-story.json',
	'data/contract.json', 'data/meta.json', 'data/passages.json', 'data/rules.json', 'data/tables.json',
	'passages/01-房间.md', 'passages/02-结局.md', 'passages/03-吃苹果.md', 'passages/04-好心情.md',
];

/** 造一棵**可变的**树（副本 ⇒ 刀只改副本 ✓）：清生成物 ⇒ build ⇒ 跑该夹具的用例。 */
const runCases = ({ mutate = null, casesDir = join(ROOT, FIX, 'cases') } = {}) => {
	const root = mkdtempSync(join(tmpdir(), 'friutfx-'));
	try {
		cpSync(join(ROOT, FIX, 'stories'), join(root, 'stories'), { recursive: true });
		for (const f of GEN) { const q = join(root, 'stories', SLUG, f); if (existsSync(q)) rmSync(q); }
		if (mutate) {
			try { mutate(join(root, 'stories', SLUG)); }
			catch (e) { return { rc: 0, out: '', brc: 0, bout: '', mutErr: String(e?.message ?? e) }; }
		}
		let brc = 0, bout = '';
		try {
			execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: join(root, 'stories') }, stdio: 'pipe' });
		} catch (e) { brc = e?.status ?? 1; bout = `${e?.stdout ?? ''}${e?.stderr ?? ''}`; }
		let rc = 0, out = '';
		try {
			out = execFileSync(process.execPath,
				[join(ROOT, 'scripts/case-run.mjs'), `--cases=${casesDir}`],
				{ cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: join(root, 'stories') }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		} catch (e) { rc = e?.status ?? 1; out = `${e?.stdout ?? ''}${e?.stderr ?? ''}`; }
		return { rc, out, brc, bout };
	} finally { rmSync(root, { recursive: true, force: true }); }
};
const summary = (out) => (out.split('\n').find((l) => l.includes('用例 ') && l.includes('：')) ?? '').trim();
/** ★本件的"绿"判据（✗ 只看 rc）：必须**明说跑了 N 条**且 `未归因 0` ✓。 */
const greenOk = (out) => new RegExp(`用例 ${N} 条`).test(out) && /未归因 0/.test(out) && /绿 7/.test(out);

if (!SELFTEST) {
	// ── ① 端到端：真 build ＋ 真 case-run ────────────────────────────────
	{
		const r = runCases();
		t('① build（自持 story）⇒ rc=0', r.brc === 0, `rc=${r.brc}｜${(r.bout ?? '').slice(0, 120)}`);
		t(`② 该夹具的用例 ⇒ rc=0 且**明说 ${N} 条全绿**（★空跑/丢条 ⇒ 必红）`, r.rc === 0 && greenOk(r.out), `rc=${r.rc}｜${summary(r.out)}`);
		t('②b 且**未归因 0** ＋ 预期缺口 0（✗ 不是"缺口"充数）', /未归因 0/.test(r.out) && /预期缺口 0/.test(r.out), summary(r.out));
	}
	// ── ③ 能假（刀）：改副本的值门阈值 ⇒ 精确点名那条用例 ──────────────
	{
		const r = runCases({ mutate: (story) => {
			const p = join(story, 'data/passages.json');
			const s = readFileSync(p, 'utf8');
			const a = '{ "gte": ["心情.值", 65] }';        // ★锚＝唯一整串（★命中数不为 1 即崩 ⇒ 刀不许打歪 ✓）
			const hits = s.split(a).length - 1;
			if (hits !== 1) throw new Error(`锚串命中 ${hits} 处（要求恰好 1 ✓）`);
			writeFileSync(p, s.replace(a, '{ "gte": ["心情.值", 9999] }'));
		} });
		t('③-锚 ★刀锚命中数必须＝1（打歪 ⇒ **点名**而非抛栈 ✓）', !r.mutErr, r.mutErr ?? '');
		t('🔴 ③ 刀：值门阈值 65⇒9999 ⇒ `fruit-demo/mood-by-value` **必红并点名**（✗ 恒绿）',
			!r.mutErr && r.brc === 0 && r.rc !== 0 && /未归因\s+fruit-demo\/mood-by-value/.test(r.out), `rc=${r.rc}｜${summary(r.out)}`);
		t('🔴 ③b 且**只**红那一条（其余仍绿 ⇒ 刀精确）', /绿 6/.test(r.out), summary(r.out));
	}
}
// ── ④ 零用例面（★这条是 `#1609` 的机理：rc=0 的"未跑"）────────────────
{
	const empty = mkdtempSync(join(tmpdir(), 'friutempty-'));
	try {
		if (!SELFTEST) {
			const r = runCases({ casesDir: empty });
			t('④ 零用例根 ⇒ 跑器**明说"零用例…未跑"**（★rc 仍是 0 ✗ ⇒ 计数只能由**本件**断言 ✓）',
				/零用例/.test(r.out) && r.rc === 0, `rc=${r.rc}｜${(r.out.split('\n').find((l) => l.includes('零用例')) ?? '').trim()}`);
		}
		t('④b ★本件的绿判据对"零用例摘要"**必须判假**（⇒ 丢条/改名/指错根都会红 ✓）',
			greenOk(`  用例 0 条：绿 0 ｜ 预期缺口 0（—） ｜ 未归因 0 ⇒ rc=0`) === false);
		t('④c 反向：真摘要 ⇒ 判真（✗ 别把"恒假"当严 ✓）',
			greenOk(`  用例 ${N} 条：绿 7 ｜ 预期缺口 0（—） ｜ 未归因 0 ｜ 归因无效 0 ｜ 陈旧归因 0 ｜ 未核实 0 ⇒ rc=0`) === true);
	} finally { rmSync(empty, { recursive: true, force: true }); }
}
// ── ⑤ 自持性与"提交面"（防漂移：生成物 ✗ 入仓；10 件 ⇒ 缺一件必红）──
//   ★走**工作树**（＝CI 干净检出的同面 ✓）⇒ 本地未 `git add` 也能跑 ✓；
//   且能抓"手跑 build 留下的生成物"（那正是提交时会被 ignore 吃掉、却让人误以为已在仓的坑 ✓）。
{
	const walk = (rel) => {
		const abs = join(ROOT, rel);
		if (!existsSync(abs)) return [];
		return readdirSync(abs, { withFileTypes: true })
			.flatMap((e) => (e.isDirectory() ? walk(join(rel, e.name)) : [join(rel, e.name)]));
	};
	const all = walk(FIX).map((f) => f.split('\\').join('/')).sort();
	const story = all.filter((f) => f.includes('/stories/')).map((f) => f.replace(`${FIX}/stories/${SLUG}/`, '')).sort();
	const cases = all.filter((f) => f.includes('/cases/')).map((f) => f.replace(`${FIX}/cases/${SLUG}/`, '')).sort();
	t('⑤ 故事面**只 10 件**（★生成物 twee／audit.json ✗ 入仓 ✓）',
		JSON.stringify(story) === JSON.stringify([...STORY_FILES].sort()), `实得 ${story.length} 件：${story.join('、').slice(0, 160)}`);
	t(`⑤b 用例面**恰 ${N} 条**（★丢一条必红 ✓）`, cases.length === N, `实得 ${cases.length}：${cases.join('、')}`);
	t('⑤c 夹具内**无生成物残留**（★手跑 build 遗留 twee／audit.json ⇒ 提交时会被 ignore 吃掉 ⇒ 本格看着它 ✓）',
		all.every((f) => !/\.twee$|audit\.json$/.test(f)), all.filter((f) => /\.twee$|audit\.json$/.test(f)).join(' '));
}

if (bad) { console.error(`\n✗ fruit-demo 固化件自证失败 ${bad} 项`); process.exit(1); }
console.log(`\n✔ fruit-demo 固化件自证通过（自持 story ${STORY_FILES.length} 件 ＋ 用例 ${N} 条端到端；刀精确点名；零用例已显式看护${SELFTEST ? '；--selftest 只跑纯函数面 ✓' : ''}）`);
