#!/usr/bin/env node
// `#1592` M5（引擎语料跑 · 安全网）：**用 books 真语料**在**引擎 CI** 里跑「编译 ＋ 字体产物」。
//
// ★为什么在引擎侧（伞 §三）：books 的 PR 门只留"可编译性 ＋ 散文形态 ＋ 发布"；
//   ★而"`any` 是或不是与""`req` 未满足不出现"这类**行为回归**归引擎（M2 已把对象迁进引擎夹具 ✓）。
// ★单一权威（协调席裁③）：★本命令**就是** plan 段要跑的那条 ⇒ ✗ 不在 workflow 里另写一遍 ✓。
//
// ★口径（协调席 2026-09-28 四裁）：
//   ① 宿主＝ engine CI 的 `realmachine` job（它**已有** chromium ＋ **fonttools**）
//   ② 语料 ref ＝ books `main`（安全网要对着**最新真实内容**；★并打印检出 sha 供归因 ✓）
//   ③ 无 books 检出 ⇒ **○ 未判（rc=0 ＋ 出声）**（✗ 不假装判过 ✓；✗ 不当失败 ✓）
//   ④ ★`#1597`（**收窄**）：★原「M7＝story 档迁宿主」已**撤**（操作者边界收严 ⇒ 非必要不保留 ✓）
//      ⇒ ★本段只留 ①②＋sha 归因＋未判出声；★story 档（含逐故事格／映射表）✗ 不在此段跑 ✓
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

// ② ★字体产物硬断言 —— ★它是**引擎输入契约**的自测（★缺 fonttools ⇒ `build.mjs` **优雅跳过**字体 ⇒ 产物里
//    无 `#font-face`／无 `dist/fonts/*.woff2` ✗）⇒ ★「产物在场」必须**硬断言**（✗ 不许把「没报错」当过 ✓）
{
	const fontsDir = join(corpusDir, 'dist', 'fonts');
	const woff = existsSync(fontsDir) ? readdirSync(fontsDir).filter((f) => f.endsWith('.woff2')) : [];
	t(`② 字体产物在场（\`dist/fonts/*.woff2\` 恰 2 个：Regular／Medium）—— ★防空转的钥匙（照 \`books/pages.yml:171\` ✓）`,
		woff.length === 2, `实得 ${woff.length} 个（缺 fonttools？⇒ \`pip install fonttools brotli\` 后重跑 ✓）`);
}


if (bad) { console.error(`\n✗ 语料安全网失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 语料安全网通过（编译 rc=0 ＋ 字体产物在场）');
