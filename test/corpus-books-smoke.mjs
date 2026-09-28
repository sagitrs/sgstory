#!/usr/bin/env node
// `#1592` M5（引擎语料跑 · 安全网）：**用 books 真语料**在**引擎 CI** 里跑「编译 ＋ 字体产物 »`[+ story 档]`。
//
// ★为什么在引擎侧（伞 §三）：books 的 PR 门只留"可编译性 ＋ 散文形态 ＋ 发布"；
//   ★而"`any` 是或不是与""`req` 未满足不出现"这类**行为回归**归引擎（M2 已把对象迁进引擎夹具 ✓）。
// ★单一权威（协调席裁③）：★本命令**就是** plan 段要跑的那条 ⇒ ✗ 不在 workflow 里另写一遍 ✓。
//
// ★口径（协调席 2026-09-28 四裁）：
//   ① 宿主＝ engine CI 的 `realmachine` job（它**已有** chromium ＋ **fonttools**）
//   ② 语料 ref ＝ books `main`（安全网要对着**最新真实内容**；★并打印检出 sha 供归因 ✓）
//   ③ 无 books 检出 ⇒ **○ 未判（rc=0 ＋ 出声）**（✗ 不假装判过 ✓；✗ 不当失败 ✓）
//   ④ 本笔＝M5＋M7 同笔（M7＝story 档迁宿主）
//
// ★★预飞实测（本片）探到的**空转洞**（＝ `books#38`）：books 的 `pr-gate` **没装 fonttools**
//   ⇒ `build.mjs` 的字体子集"**优雅跳过**"⇒ 产物**无 `#font-face`** ⇒ `test/browser.mjs` 的就绪守卫 **bail**
//   ⇒ 打印「跳过」而 step 印「✓ 通过」＝**零断言绿灯** ✗
//   ⇒ ★故本件把「**字体产物恰 2 个**」做成**硬断言**（照 `books/pages.yml:171` 同款 ✓）—— ★这是"防空转复发"的钥匙 ✓
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

/** 语料根：`SG_BOOKS_DIR` 优先，其次**同级仓** `../sgstory-books`（本地两仓并排时的默认形 ✓）。 */
const corpusDir = (() => {
	const env = process.env.SG_BOOKS_DIR;
	if (env) return resolve(env);
	const sib = resolve(ROOT, '..', 'sgstory-books');
	return existsSync(join(sib, 'stories')) ? sib : null;
})();

if (!corpusDir || !existsSync(join(corpusDir, 'stories'))) {
	console.log('  ○ 未判：**没有 books 检出**（`SG_BOOKS_DIR` 未给且同级 `../sgstory-books` 不在）');
	console.log('    ★前置：`git clone sagitrs/sgstory-books`（或设 `SG_BOOKS_DIR`）后重跑本件（届时本段即真判 ✓）');
	console.log('\n✔ 语料安全网：未判（对象未就绪 ⇒ rc=0 ＋ 出声，✗ 不假装判过）');
	process.exit(0);
}

const stories = join(corpusDir, 'stories');
const sha = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: corpusDir, encoding: 'utf8' }).trim(); }
	catch { return '（无 git 元数据 —— 语料是**拷贝**而非检出 ⇒ 归因面缺 sha）'; } })();
console.log(`  语料根：${corpusDir.replace(ROOT, '…')}｜★books sha=${sha}（归因面：引擎 CI 红时先看它 ✓）`);

// ① 语料**编译**（＝M5 的"编译"半）—— ★它同时把**引擎侧编译期守卫**对着**真语料**跑一遍
//   （`#1564` 条件前缀／`#1582` actor 引用／`#1586` 规则行字段面／`#1587` 产物前置 …）
try {
	execFileSync(process.execPath, [join(ROOT, 'build.mjs')], {
		cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe',
	});
	t(`① 语料编译（books 全量 ⇒ 引擎守卫对真数据跑一遍）⇒ rc=0`, true);
} catch (e) {
	t('① 语料编译 ⇒ rc=0', false, `${String(e?.stdout ?? '')}${String(e?.stderr ?? '')}`.split('\n').filter(Boolean).slice(-3).join(' ｜ ').slice(0, 300));
}

// ② ★字体产物硬断言（**防空转**：缺 fonttools ⇒ build "优雅跳过" ⇒ 无 `#font-face` ⇒ story 档会静默跳过 ✗）
{
	const fontsDir = join(corpusDir, 'dist', 'fonts');
	const woff = existsSync(fontsDir) ? readdirSync(fontsDir).filter((f) => f.endsWith('.woff2')) : [];
	t(`② 字体产物在场（\`dist/fonts/*.woff2\` 恰 2 个：Regular／Medium）—— ★防空转的钥匙（照 \`books/pages.yml:171\` ✓）`,
		woff.length === 2, `实得 ${woff.length} 个（缺 fonttools？⇒ \`pip install fonttools brotli\` 后重跑 ✓）`);
}

// ③ story 档（M7）：★只在**显式要求**时跑（`CORPUS_STORY_TIER=1`）—— ★因为它的**对象归属**正在归因分治中
//   （见 `#1592` 评论的归因表：映射默认 5 键里 **4 个在语料里不存在** ⇒ 那些格**没有对象** ✗）
if (process.env.CORPUS_STORY_TIER === '1') {
	try {
		execFileSync(process.execPath, [join(ROOT, 'test', 'browser.mjs')], {
			cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories, BROWSER_TIERS: 'story', CI_REQUIRE_BROWSER: '1' }, stdio: 'inherit',
		});
		t('③ story 档（语料）⇒ rc=0', true);
	} catch { t('③ story 档（语料）⇒ rc=0', false, '见上方逐条读数'); }
} else {
	console.log('  ○ ③ story 档（M7）**本段不跑**：★它的对象归属正在归因分治（`#1592` 归因表：默认映射 5 键里 4 个在语料里不存在 ✗）');
	console.log('    ⇒ 分治裁定后本段接上（届时 `CORPUS_STORY_TIER=1` 恒开 ✓）；★在此之前**✗ 不开**（否则引擎 CI 会红着过日子 ✗）');
}

if (bad) { console.error(`\n✗ 语料安全网失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 语料安全网通过（编译 rc=0 ＋ 字体产物在场；story 档见上）');
