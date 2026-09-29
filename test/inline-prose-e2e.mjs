// `#1570` 自证：**段散文可由数据面提供**（段表 `text`）—— 引擎侧 · fixture 驱动
//
// 诉求：段散文**只有一个来源**（`stories/<slug>/passages/*.md`）⇒ 想"散文与它所属的那段同处一份数据"
//   的作者没有口子（★`#1488`/`#1485` 那条"词表/结算下沉"同一方向）。
// 形态（`#1562`／`#1570` 定稿）：`data/passages.json` 的**段对象**加 `text`（内嵌散文）；
//   ★**来源唯一**：同一段只许一处来源（md ∨ 数据面）⇒ 撞车 **编译期点名**（Operator 裁 ✓）。
// ★★为什么"等价性"是本件的头号判据：本笔的价值**全在"两条来源共用同一变换管线"**（铁律②）——
//   若数据面走另一条拼装路 ⇒ `{{}}` 展开／slot／悬停判定／注释剥离 必然与 md 侧分家 ⇒ **必漂移** ✗。
//   ⇒ 故本件用"**同一故事两副本、只改载体**"比产物（★领队裁定的形式 ✓）。
//
// 判据（每条都能假）：
// ① ★**等价性**：a＝md 载体／b＝数据面载体（同 slug、其余全同）⇒ 产物 `build/game.twee`
//    ★**全段归一切段后逐字相同** ＋ ★**非散文段顺序一致** ＋ ★散文段按名逐字相同 ✓
//    ★口径（为什么"归一切段"）：内嵌段**不在源件列表里** ⇒ 无位置可言 ⇒ 必排末尾 ⇒
//      **顺序必然不同**（那是结构必然），而**段位置在运行期无关**（SugarCube 段按名取 ✓）。
//      ★本归一 ✗ 不掩盖内容差：段内任何字节差 ⇒ 仍红 ✓（实测：改一处字 ⇒ ①当场红）。
// ② ★**能假·来源撞车**：同段**既有 md 又给 `text`** ⇒ ★build **rc≠0** ＋ 报文含"两处来源" ✓
// ③ ★**散文 ✗ 进声明面**：产物里 **`StoryBindings`／`Game Tables`／`StoryRules`** 段内 **✗ 含 `text`** ✓
//    （★"散文是内容、✗ 不是声明面"—— 若漏进 `passages.json` 的声明注入 ⇒ 契约被散文撑大 ✗）
// ④ ★**零 md 也能 build**：b 侧**无 `passages/` 目录** ⇒ rc=0 ＋ 产物里**三段散文都在** ✓
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FX = join(ROOT, 'test/fixtures/m3-inline-prose');
const SLUG = 'nocar-basic';
const PROSE = ['开场', '岔路', '尽头'];
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

/** 跑一次 build（★产物落在仓根 `build/`；本件在 test-plan 里声明 `mutates:['build']` ✓）。 */
const buildSide = (stories) => {
	try {
		execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
		return { rc: 0, out: '' };
	} catch (e) {
		return { rc: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
	}
};
/** `:: 名 [tags]` 切段 ⇒ `[{name, text}]`（`text` 做 `rstrip` 归一 —— 见判据①的口径）。 */
const sectionsOf = (twee) => {
	const out = [];
	for (const chunk of String(twee).split(/^(?=::\s)/m)) {
		const m = /^::\s+(.+?)\s*(?:\[[^\]]*\])?\s*\n/.exec(chunk);
		if (m) out.push({ name: m[1].trim(), text: chunk.replace(/\s+$/, '') });
	}
	return out;
};

// ---- ① / ③ / ④：两侧各 build 一次，比产物 ----
// ★ `#1643` CR：★产物来源由 `build/game.twee`（已改为**进程独有暂存** ⇒ ✗ 不再存在）改为
//   **逐故事**稳定的 `build/game-<slug>.twee` ✓ —— ★并**加存在断言**（✗ 不无条件 readFileSync ⇒ 否则 ENOENT 掩盖病因 ✓）。
const tweeOf = () => join(ROOT, 'build', `game-${SLUG}.twee`);
const atwee = (() => { const r = buildSide(join(FX, 'a/stories')); t('④-a a 侧（md 载体）build ⇒ rc=0', r.rc === 0, r.out.slice(0, 200)); const p = tweeOf(); t('④-a 产物在场：`build/game-<slug>.twee` 存在', existsSync(p), p); return readFileSync(p, 'utf8'); })();
const btwee = (() => { const r = buildSide(join(FX, 'b/stories')); t('④-b b 侧（数据面载体、**无 `passages/` 目录**）build ⇒ rc=0', r.rc === 0, r.out.slice(0, 300)); const p = tweeOf(); t('④-b 产物在场：`build/game-<slug>.twee` 存在', existsSync(p), p); return readFileSync(p, 'utf8'); })();
const A = sectionsOf(atwee), B = sectionsOf(btwee);
const da = new Map(A.map((s) => [s.name, s.text])), db = new Map(B.map((s) => [s.name, s.text]));
const diffNames = [...da.keys()].filter((n) => db.has(n) && da.get(n) !== db.get(n));
t('①-a ★同一段**按名逐字相同**（内容零差 —— 含全部 34 段）', diffNames.length === 0, '不同的段: ' + diffNames.join('、'));
const nonProse = (ss) => ss.map((s) => s.name).filter((n) => !PROSE.includes(n));
t('①-b ★**非散文段顺序一致**（脚本/表/声明面 ⇒ 顺序在运行期**有意义** ⇒ 必须同 ✓）',
	JSON.stringify(nonProse(A)) === JSON.stringify(nonProse(B)), `A=${nonProse(A).join('>')} ｜ B=${nonProse(B).join('>')}`);
t('①-c ★**散文段按名逐字相同**（本笔的正面：两条来源 ⇒ 同一份文本 ✓）',
	PROSE.every((n) => da.has(n) && db.has(n) && da.get(n) === db.get(n)),
	PROSE.map((n) => `${n}:${da.get(n) === db.get(n) ? '=' : '≠'}`).join(' '));
t('④-c b 侧产物里**三段散文都在**（✗ "默认产出空段"✓）', PROSE.every((n) => db.has(n)), [...db.keys()].filter((n) => PROSE.includes(n)).join('、'));
for (const name of ['StoryBindings', 'Game Tables', 'StoryRules']) {
	const body = db.get(name) ?? '';
	t(`③ ★\`${name}\` 段内**✗ 含 \`text\`**（散文是内容 ⇒ ✗ 混进声明面 ✓）`, !/\btext\b/.test(body), (body.match(/\btext\b/) ?? []).length + ' 处');
}

// ---- ② 能假·来源撞车（★临时副本：把 md 的那段**同时**给上 text）----
const WORK = mkdtempSync(join(tmpdir(), 'sg-inline-'));
try {
	const stories = join(WORK, 'stories');
	cpSync(join(FX, 'a/stories'), stories, { recursive: true });
	writeFileSync(join(stories, SLUG, 'data/passages.json'), JSON.stringify({ 开场: { text: '撞车用散文' } }) + '\n');
	const r = buildSide(stories);
	t('② ★**来源撞车**（同段 md ＋ `text`）⇒ build **rc≠0**', r.rc !== 0, 'rc=' + String(r.rc));
	t('②-b ★撞车报文**点名**"两处来源"（✗ 不静默取一个 ✓）', /两处来源/.test(r.out), r.out.replace(/\s+/g, ' ').slice(0, 220));
} finally { rmSync(WORK, { recursive: true, force: true }); }

if (bad) { console.error(`\n✗ 内嵌散文自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 内嵌散文自证通过（等价性 34/34 · 来源唯一点名 · 散文✗进声明面 · 零 md 可 build）');
