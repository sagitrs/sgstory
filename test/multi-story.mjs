// ── #441 切片③④：多故事产物与书架页的门（可自证）──────────────────────────
// 判据（纯函数部分可自证；文件系统部分在 main 里跑真实产物）：
//   S1 书架页里**每个已构建的故事**都必须有一条指向 `stories/<slug>/index.html` 的链接
//   S2 书架页里**不得**有指向不存在的故事的链接（防"删了故事忘了改书架"＝链接腐烂）
//   S3 书架页体积上界（书目页是纯目录，塞进内嵌资产就该被拦）
//   P1 每个故事的产物存在，且其字体前缀是**两层相对路径**（`../../fonts/`）
//   P2 故事产物引用的字体文件**真的在** `dist/fonts/` 里（防"前缀改了、文件没搬"）
//   P3 过渡期根页 `dist/index.html` 用根路径前缀（`fonts/`）且与默认故事页只差前缀
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DIST_DIR,  DEFAULT_SLUG, storySlugs, storyHtml, shelfHtml, defaultStoryHtml, FONT_PREFIX_FROM_ROOT, FONT_PREFIX_FROM_STORY, STORY_PAGE_MAX_BYTES, SHELF_PAGE_MAX_BYTES } from '../scripts/dist-paths.mjs';

// 书架页上界：**单一权威在 `scripts/dist-paths.mjs`**（`#576` 未决①：同一件事曾散成四份口径）
export const SHELF_MAX_BYTES = SHELF_PAGE_MAX_BYTES;

/** **P5**（`#576` 未决①）：部署后冒烟（`.github/workflows/ci.yml`）里的体积上界**必须与常量同值**。
 *  为什么用门而不是让 workflow 读常量：冒烟作业**不 checkout 仓库**（只 curl 线上产物）⇒ 读不到常量；
 *  于是改成「两处数字由门钉住、不等就在 PR 里红」——歧义不再拖到部署之后才发现。 */
export const ciLiteralProblems = (yaml, { story = STORY_PAGE_MAX_BYTES, shelf = SHELF_PAGE_MAX_BYTES } = {}) => {
	const out = [];
	const y = String(yaml ?? '');
	const storyLit = /test\s+"\$SSZ"\s+-lt\s+(\d+)/.exec(y);
	const shelfLit = /test\s+"\$SZ"\s+-gt\s+0\s+-a\s+"\$SZ"\s+-lt\s+(\d+)/.exec(y);
	if (!storyLit) out.push({ code: 'P5', msg: 'ci.yml 里找不到故事页上界断言（test "$SSZ" -lt …）——口径锚点丢了' });
	else if (Number(storyLit[1]) !== story) out.push({ code: 'P5', msg: `ci.yml 故事页上界 ${storyLit[1]} ≠ STORY_PAGE_MAX_BYTES ${story}（两处口径漂了）` });
	if (!shelfLit) out.push({ code: 'P5', msg: 'ci.yml 里找不到书架页上界断言（test "$SZ" … -lt …）' });
	else if (Number(shelfLit[1]) !== shelf) out.push({ code: 'P5', msg: `ci.yml 书架页上界 ${shelfLit[1]} ≠ SHELF_PAGE_MAX_BYTES ${shelf}` });
	return out;
};

/** 纯函数（`#460`）：**一个故事真的启动起来了吗** —— 判据三条，缺一即红。
 *  为什么要有它：`multi-story` 原先只查"产物存在 / 书架链接 / 字体文件"，而 `test/boot.mjs` 恒读
 *  **默认故事**的产物 ⇒ 新故事**启动即崩也全绿**（实测：`minimal-demo`／`hollow-cave` 的 `$era` 恒 `undefined`，
 *  StoryInit 抛 `Cannot read properties of undefined (reading 'PRESENT')`，SugarCube 允许继续 ⇒ 起始段照样渲染 ⇒ **像"能玩"**）。
 *  ⇒ 这是 `#557` 的同一族："产物存在 ≠ 产物能跑"（`docs/dev-conventions.md` §13 第 1 条：读不到输入就该响）。 */
export const judgeBoot = ({ slug, era, text, errors = [] }) => {
	const out = [];
	if (errors.length) out.push({ code: 'S4', msg: `故事「${slug}」启动报错：${String(errors[0]).split('\n')[0].slice(0, 120)}` });
	if (era === undefined || era === null || era === '') out.push({ code: 'S4', msg: `故事「${slug}」的 \`$era\` 未初始化（${String(era)}）——引擎侧常量默认值缺失（#562 的成因）` });
	if (!String(text ?? '').trim()) out.push({ code: 'S4', msg: `故事「${slug}」起始段渲染为空（产物存在 ≠ 产物能跑）` });
	return out;
};

/** 纯函数：书架页内容 × 已构建故事 → 问题列表（可自证）。 */
export const checkShelf = (html, builtSlugs, { maxBytes = SHELF_MAX_BYTES, bytes = null } = {}) => {
	const out = [];
	for (const slug of builtSlugs) {
		if (!html.includes(`stories/${slug}/index.html`)) out.push({ code: 'S1', msg: `书架页缺少指向 stories/${slug}/index.html 的链接（加目录却没上书架？）` });
	}
	const linked = [...html.matchAll(/href="stories\/([^/"]+)\/index\.html"/g)].map((m) => m[1]);
	for (const slug of linked) {
		if (!builtSlugs.includes(slug)) out.push({ code: 'S2', msg: `书架页指向不存在的故事：stories/${slug}/（链接腐烂）` });
	}
	if (bytes != null && bytes > maxBytes) out.push({ code: 'S3', msg: `书架页体积 ${bytes} > 上界 ${maxBytes}（书目页不该内嵌资产）` });
	return out;
};

/** 纯函数：故事页字体引用检查（可自证）。 */
export const checkStoryFontRefs = (html, fontFiles, { prefix = FONT_PREFIX_FROM_STORY } = {}) => {
	const out = [];
	const refs = [...html.matchAll(/(?:href="|url\(')([^'"]*LXGWWenKai-[^'"]*\.woff2)/g)].map((m) => m[1]);
	if (refs.length === 0) out.push({ code: 'P1', msg: '故事产物里没有任何 woff2 引用（字体注入丢了？）' });
	for (const r of refs) {
		if (!r.startsWith(prefix)) out.push({ code: 'P1', msg: `故事产物的字体前缀不是 ${prefix}：${r}` });
		const base = r.slice(prefix.length);
		if (!fontFiles.includes(base)) out.push({ code: 'P2', msg: `引用的字体文件不在 dist/fonts/ 里：${base}` });
	}
	return out;
};

/** 纯函数：故事页**硬上界**（`#576`）——与 CI 的 `post-deploy-smoke` 同一口径，但**在 PR 时**就判。
 *  为什么必须有：`size-gate` 的基线 997,937B ＋ 0.5% 容差 ≈ 1,002.9KB，而部署后是 1,000,000B 硬红
 *  ⇒ 中间有一条 ~5KB 宽的窗带：**PR 与 soak 全绿、main 的部署后冒烟红**（`#576` 实测撞上）。 */
export const judgeStoryPage = ({ slug, bytes, max = STORY_PAGE_MAX_BYTES }) =>
	bytes >= max ? [{ code: 'P4', msg: `故事「${slug}」产物 ${bytes}B ≥ 上界 ${max}B（疑似回胖/内嵌资产；部署后冒烟用的是同一上界）` }] : [];

// ── main ────────────────────────────────────────────────────────────────
const problems = [];
const built = [];
const fontFiles = existsSync(join(DIST_DIR, 'fonts')) ? readdirSync(join(DIST_DIR, 'fonts')) : [];

for (const slug of storySlugs()) {
	const p = storyHtml(slug);
	if (!existsSync(p)) continue; // 未构建的故事不算"已构建"
	built.push(slug);
	problems.push(...checkStoryFontRefs(readFileSync(p, 'utf8'), fontFiles));
	problems.push(...judgeStoryPage({ slug, bytes: statSync(p).size }));
}

if (!existsSync(shelfHtml())) {
	problems.push({ code: 'S0', msg: '缺书架页（先 npm run build）' });
} else {
	const shelf = readFileSync(shelfHtml(), 'utf8');
	problems.push(...checkShelf(shelf, built, { bytes: statSync(shelfHtml()).size }));
}

// P3（β2 契约）：`dist/index.html` 是**书架页**——必须有每个已构建故事的链接，
// 且**不得**带字体注入（书目页不装游戏资源；带上了说明"游戏又被写回根路径"了）。
{
	const rootPath = join(DIST_DIR, 'index.html');
	if (!existsSync(rootPath)) problems.push({ code: 'P3', msg: '缺 dist/index.html（书架页＝进站门面）' });
	else {
		const root = readFileSync(rootPath, 'utf8');
		if (root.includes('id="font-face"')) problems.push({ code: 'P3', msg: 'dist/index.html 是书架页，却带字体注入（id="font-face"）——游戏不该再写回根路径' });
		for (const slug of built) if (!root.includes(`stories/${slug}/index.html`)) problems.push({ code: 'P3', msg: `根页（书架）缺少指向 stories/${slug}/index.html 的链接` });
	}
}

// P5（`#576` 未决①）：部署后冒烟里的两个上界字面量必须与常量同值
{
	const ciPath = join(ROOT, '.github', 'workflows', 'ci.yml');
	if (!existsSync(ciPath)) problems.push({ code: 'P5', msg: '找不到 .github/workflows/ci.yml（口径锚点没了）' });
	else problems.push(...ciLiteralProblems(readFileSync(ciPath, 'utf8')));
}

if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const shelfOK = '<a href="stories/a/index.html">A</a><a href="stories/b/index.html">B</a>';
	t('S1/S2 正例：两款故事都有链接、无多余链接 → 0 问题', checkShelf(shelfOK, ['a', 'b'], { bytes: 900 }).length === 0);
	t('S1 反例：漏了 b 的链接 → 报红', checkShelf(shelfOK, ['a', 'b', 'c'], { bytes: 900 }).some((f) => f.code === 'S1'));
	t('S2 反例：链接指向已被删掉的故事 c → 报红（链接腐烂）', checkShelf(shelfOK + '<a href="stories/c/index.html">C</a>', ['a', 'b'], { bytes: 900 }).some((f) => f.code === 'S2'));
	// S4（#460／#566）：逐故事真启动 —— 正例 + 三个反例（缺 era／空起始段／有报错）
	t('S4 正例：`$era` 已初始化 ＋ 起始段非空 ＋ 无报错 → 0 问题', judgeBoot({ slug: 'a', era: 'present', text: '正文', errors: [] }).length === 0);
	t('S4 反例①：`$era` 未初始化（＝#566 的成因）→ 报红', judgeBoot({ slug: 'a', era: undefined, text: '正文', errors: [] }).length === 1);
	t('S4 反例②：起始段渲染为空（产物存在 ≠ 产物能跑）→ 报红', judgeBoot({ slug: 'a', era: 'present', text: '   ', errors: [] }).length === 1);
	t('S4 反例③：启动有未捕获报错 → 报红', judgeBoot({ slug: 'a', era: 'present', text: '正文', errors: ['Uncaught: boom'] }).some((f) => f.code === 'S4'));
	t('S3 反例：书架页超过体积上界 → 报红', checkShelf(shelfOK, ['a', 'b'], { bytes: 200_000 }).some((f) => f.code === 'S3'));
	t('P4 正例：故事页在上界内 → 不报', judgeStoryPage({ slug: 'a', bytes: STORY_PAGE_MAX_BYTES - 1 }).length === 0);
	t('P4 反例：故事页顶到上界（＝部署后冒烟的口径）→ 报红', judgeStoryPage({ slug: 'a', bytes: STORY_PAGE_MAX_BYTES }).some((f) => f.code === 'P4'));
	// P5（`#576` 未决①）：CI 里的字面量必须与常量同值
	const CI_OK = 'test "$SSZ" -lt 1000000 || exit 1\ntest "$SZ" -gt 0 -a "$SZ" -lt 100000 || exit 1\n';
	t('P5 正例：ci.yml 两个上界与常量同值 → 0 问题', ciLiteralProblems(CI_OK).length === 0);
	t('🔴 P5 反例：ci.yml 故事页上界漂了（999999）→ 报红', ciLiteralProblems(CI_OK.replace('-lt 1000000', '-lt 999999')).some((f) => f.code === 'P5'));
	t('🔴 P5 反例：ci.yml 书架页上界漂了 → 报红', ciLiteralProblems(CI_OK.replace('-lt 100000', '-lt 200000')).some((f) => f.code === 'P5'));
	t('🔴 P5 反例：断言被删掉 ⇒ 报「口径锚点丢了」', ciLiteralProblems('echo 无断言').length === 2);
	const goodPage = `<link href="${FONT_PREFIX_FROM_STORY}LXGWWenKai-Regular.woff2"><style>url('${FONT_PREFIX_FROM_STORY}LXGWWenKai-Medium.woff2')</style>`;
	t('P1/P2 正例：前缀正确且字体文件存在 → 0 问题', checkStoryFontRefs(goodPage, ['LXGWWenKai-Regular.woff2', 'LXGWWenKai-Medium.woff2']).length === 0);
	t('P1 反例：故事页用了根路径前缀（深两层会 404）→ 报红', checkStoryFontRefs(goodPage.split(FONT_PREFIX_FROM_STORY).join(FONT_PREFIX_FROM_ROOT), []).some((f) => f.code === 'P1'));
	t('P2 反例：前缀对但 dist/fonts/ 里没这个文件 → 报红', checkStoryFontRefs(goodPage, ['LXGWWenKai-Regular.woff2']).some((f) => f.code === 'P2'));
	t('P1 反例：字体引用整段丢失（注入没生效）→ 报红', checkStoryFontRefs('<html></html>', []).some((f) => f.code === 'P1'));
	t('S3 边界：书架页恰好在体积上界上 → 不报红', checkShelf(shelfOK, ['a', 'b'], { bytes: SHELF_MAX_BYTES }).length === 0);
	t('S1/S2 边界：空书架 + 无故事 → 0 问题（首建时还没故事也要绿）', checkShelf('<h1>书架</h1>', [], { bytes: 100 }).length === 0);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（书架 S1/S2/S3 × 故事页 P1/P2 正反例）');
	process.exit(0);
}

// ── S4（#460）：**逐故事真启动**（StoryInit 无错 ＋ `$era` 已定义 ＋ 起始段非空）──
{
	const { boot } = await import('./boot.mjs');
	for (const slug of [...built]) {
		const { w, uncaught, close } = await boot({ story: slug });
		try {
			const era = w.SugarCube?.State?.variables?.era;
			const text = w.document.querySelector('#passages .passage')?.textContent ?? '';
			const errs = [...uncaught];
			console.log(`  ${judgeBoot({ slug, era, text, errors: errs }).length ? '✗' : '✓'} 故事「${slug}」启动：\`$era\`=${String(era)} · 起始段 ${text.trim().length} 字${errs.length ? ` · 报错 ${errs.length} 条` : ''}`);
			problems.push(...judgeBoot({ slug, era, text, errors: errs }));
		} catch (e) {
			console.log(`  ✗ 故事「${slug}」启动异常：${e.message}`);
			problems.push({ code: 'S4', msg: `故事「${slug}」启动异常：${e.message}` });
		} finally { close(); }
	}
}

if (problems.length) {
	console.error(`✗ 多故事产物检查未通过 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	process.exit(1);
}
console.log(`✔ 多故事产物：书架页 + ${built.length} 个故事产物（${built.join('、')}）+ 字体 ${fontFiles.length} 个文件 · 自证通`);
