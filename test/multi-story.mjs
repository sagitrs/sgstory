// ── #441 切片③④：多故事产物与书架页的门（可自证）──────────────────────────
// 判据（纯函数部分可自证；文件系统部分在 main 里跑真实产物）：
// S1 书架页里**每个已构建的故事**都必须有一条指向 `stories/<slug>/index.html` 的链接
// S2 书架页里**不得**有指向不存在的故事的链接（防"删了故事忘了改书架"＝链接腐烂）
// S3 书架页体积上界（书目页是纯目录，塞进内嵌资产就该被拦）
// P1 每个故事的产物存在，且其字体前缀是**两层相对路径**（`../../fonts/`）
// P2 故事产物引用的字体文件**真的在** `dist/fonts/` 里（防"前缀改了、文件没搬"）
// P3 过渡期根页 `dist/index.html` 用根路径前缀（`fonts/`）且与默认故事页只差前缀
import { renderedElsOf } from '../editor/lib/core/preview.mjs';   // `#761` 六片A：选择器只有一处
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DIST_DIR,  DEFAULT_SLUG, storySlugs, storyHtml, shelfHtml, defaultStoryHtml, FONT_PREFIX_FROM_ROOT, FONT_PREFIX_FROM_STORY, audienceOf, readStory, STORY_PAGE_MAX_BYTES, SHELF_PAGE_MAX_BYTES } from '../scripts/dist-paths.mjs';

// 书架页上界：**单一权威在 `scripts/dist-paths.mjs`**（`#576` 未决①：同一件事曾散成四份口径）
export const SHELF_MAX_BYTES = SHELF_PAGE_MAX_BYTES;

/** **P5**（`#576` 未决①）：部署后冒烟（`.github/workflows/ci.yml`）里的体积上界**必须与常量同值**。
 * 为什么用门而不是让 workflow 读常量：冒烟作业**不 checkout 仓库**（只 curl 线上产物）→ 读不到常量；
 * 于是改成「两处数字由门钉住、不等就在 PR 里红」——歧义不再拖到部署之后才发现。 */
export const ciLiteralProblems = (yaml, { story = STORY_PAGE_MAX_BYTES, shelf = SHELF_PAGE_MAX_BYTES, slugs = storySlugs() } = {}) => {
	const out = [];
	const y = String(yaml ?? '');
	const storyLit = /test\s+"\$SSZ"\s+-lt\s+(\d+)/.exec(y);
	const shelfLit = /test\s+"\$SZ"\s+-gt\s+0\s+-a\s+"\$SZ"\s+-lt\s+(\d+)/.exec(y);
	if (!storyLit) out.push({ code: 'P5', msg: 'ci.yml 里找不到故事页上界断言（test "$SSZ" -lt …）——口径锚点丢了' });
	else if (Number(storyLit[1]) !== story) out.push({ code: 'P5', msg: `ci.yml 故事页上界 ${storyLit[1]} ≠ STORY_PAGE_MAX_BYTES ${story}（两处口径漂了）` });
	if (!shelfLit) out.push({ code: 'P5', msg: 'ci.yml 里找不到书架页上界断言（test "$SZ" … -lt …）' });
	else if (Number(shelfLit[1]) !== shelf) out.push({ code: 'P5', msg: `ci.yml 书架页上界 ${shelfLit[1]} ≠ SHELF_PAGE_MAX_BYTES ${shelf}` });
	// ── **P6**（`#1004` B2b）：冒烟作业里的**故事页路径**不许硬编码 ────────────────────────────
	// 为什么需要这一格：冒烟作业**不 checkout 仓库** → 读不到 `DEFAULT_SLUG` 常量 → 只能写字面量；
	// 而字面量会随故事**改名/删除**腐烂 → `curl` 404 → 该作业红 —— 而它**只在 push to main 跑**
	// → **PR CI 全绿也看不见**（实测：删 `mist-forest` 后 `stories/mist-forest/index.html` 必 404）。
	// 判据两条（照 P5 的「锚点丢了也报」体例）：
	// ① **字面量只许出现在「现场取」那个锚点行里**（`grep -oE 'stories/…' /tmp/idx.html`）→ 其余**非注释行**出现即红；
	// ② 必须真的存在「从书架页现场取」的锚点（锚点丢了也报）。
	//注意：扫字面量前**先剔注释行**：注释里写旧路径（说明因由）是**要保留的历史** → 让它变成假红就是把「留痕」罚了。
	//注意：⭐ ① 必须是**按行上下文**判的（复核席实测给的洞）：早先只判「slug 不在 `storySlugs()` 里」 → →
	// **硬编码一个「存在的」故事页被完全放行** —— 而本判据自己报文里写的目的是「改用『从书架页现场取』」
	// → 那个形状**答不了自己声称要答的问题**（下次换默认故事 → 同一族照旧复发）→ 现改为「**现存/已删一律红**」。
	const code = y.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
	const ANCHOR_LINE = /grep\s+-oE\s+'stories\//;
	const stray = [];
	for (const rawLine of code.split('\n')) {
		// `#1016` 票内补记①：豁免只豁**锚点那段子串**，不是整行（早先 `continue` 整行 → 同一行上
		// 其他字面量被连带放过——「字面量与锚点同一行 → 0」的漏形态）；锚点子串剥掉后**余段照扫**。
		const line = rawLine.replace(/grep\s+-oE\s+'stories\/[^']*'/g, '').replace(/stories\/[A-Za-z0-9._-]+\/index\\\.html/g, (mm) => (ANCHOR_LINE.test(rawLine) ? '' : mm));
		for (const m of line.matchAll(/(?<![\w.-])stories\/([A-Za-z0-9._-]+)\/index\.html/g)) stray.push({ slug: m[1], line: rawLine.trim().slice(0, 72) });
	}
	if (stray.length)
		out.push({ code: 'P6', msg: `ci.yml 的**非注释行**里出现故事页字面量 \`stories/${stray[0].slug}/index.html\`（${stray[0].line}…）—— ⚠️ **现存/已删一律红** ✗（现存：${slugs.join(' / ')} ✓）：本作业只在 push to main 跑 ⇒ 硬编码会随故事改名/删除腐烂，而 PR CI 看不见（改用「从书架页现场取」✓）` });
	if (!ANCHOR_LINE.test(code) || !code.includes('/tmp/idx.html'))
		out.push({ code: 'P6', msg: "ci.yml 里找不到「从书架页现场取故事页路径」的锚点（`STORY_PATH=$(grep -oE 'stories/<slug>/index.html' /tmp/idx.html)`）" });
	return out;
};

/** 纯函数（`#460`）：**一个故事真的启动起来了吗** —— 判据三条，缺一即红。
 * 为什么要有它：`multi-story` 原先只查"产物存在 / 书架链接 / 字体文件"，而 `test/boot.mjs` 恒读
 * **默认故事**的产物 → 新故事**启动即崩也全绿**（实测：`minimal-demo`／`hollow-cave` 的 `$era` 恒 `undefined`，
 * StoryInit 抛 `Cannot read properties of undefined (reading 'PRESENT')`，SugarCube 允许继续 → 起始段照样渲染 → **像"能玩"**）。
 * → 这是 `#557` 的同一族："产物存在 ≠ 产物能跑"（`docs/criterion-design.md` §六 6.1／§6.7：读不到输入就该响）。 */
export const judgeBoot = ({ slug, era, text, errors = [] }) => {
	const out = [];
	if (errors.length) out.push({ code: 'S4', msg: `故事「${slug}」启动报错：${String(errors[0]).split('\n')[0].slice(0, 120)}` });
	if (era === undefined || era === null || era === '') out.push({ code: 'S4', msg: `故事「${slug}」的 \`$era\` 未初始化（${String(era)}）——引擎侧常量默认值缺失（#562 的成因）` });
	if (!String(text ?? '').trim()) out.push({ code: 'S4', msg: `故事「${slug}」起始段渲染为空（产物存在 ≠ 产物能跑）` });
	return out;
};

/** 纯函数：书架页内容 × 已构建故事 → 问题列表（可自证）。 */
export const checkShelf = (html, builtSlugs, { maxBytes = SHELF_MAX_BYTES, bytes = null, internalSlugs = [] } = {}) => {
	const out = [];
	for (const slug of builtSlugs) {
		if (!html.includes(`stories/${slug}/index.html`)) out.push({ code: 'S1', msg: `书架页缺少指向 stories/${slug}/index.html 的链接（加目录却没上书架？）` });
	}
	const linked = [...html.matchAll(/href="stories\/([^/"]+)\/index\.html"/g)].map((m) => m[1]);
	for (const slug of linked) {
		if (!builtSlugs.includes(slug)) out.push({ code: 'S2', msg: `书架页指向不存在的故事：stories/${slug}/（链接腐烂）` });
	}
	// `#1035`：**内部件不许上书架**（`audience: internal` → 不进用户面；丢了这条 = 内部件静默泄漏）
	for (const slug of internalSlugs) {
		if (html.includes(`stories/${slug}/index.html`)) out.push({ code: 'S5', msg: `书架页列了**内部件** stories/${slug}/（audience: internal ⇒ 不该进用户面）` });
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
 * 为什么必须有：`size-gate` 的基线 997,937B ＋ 0.5% 容差 ≈ 1,002.9KB，而部署后是 1,000,000B 硬红
 * → 中间有一条 ~5KB 宽的窗带：**PR 与 soak 全绿、main 的部署后冒烟红**（`#576` 实测撞上）。 */
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
	const builtContent = built.filter((slug) => audienceOf(readStory(slug)) === 'content');
	const builtInternal = built.filter((slug) => audienceOf(readStory(slug)) === 'internal');
	problems.push(...checkShelf(shelf, builtContent, { bytes: statSync(shelfHtml()).size, internalSlugs: builtInternal }));
}

// P3（β2 契约）：`dist/index.html` 是**书架页**——必须有每个已构建故事的链接，
// 且**不得**带字体注入（书目页不装游戏资源；带上了说明"游戏又被写回根路径"了）。
{
	const rootPath = join(DIST_DIR, 'index.html');
	if (!existsSync(rootPath)) problems.push({ code: 'P3', msg: '缺 dist/index.html（书架页＝进站门面）' });
	else {
		const root = readFileSync(rootPath, 'utf8');
		if (root.includes('id="font-face"')) problems.push({ code: 'P3', msg: 'dist/index.html 是书架页，却带字体注入（id="font-face"）——游戏不该再写回根路径' });
		// `#1035`：书架只该列**内容故事**（内部件仍构建，但不得进用户面）
		const contentBuilt = built.filter((slug) => audienceOf(readStory(slug)) === 'content');
		const internalBuilt = built.filter((slug) => audienceOf(readStory(slug)) === 'internal');
		for (const slug of contentBuilt) if (!root.includes(`stories/${slug}/index.html`)) problems.push({ code: 'P3', msg: `根页（书架）缺少指向 stories/${slug}/index.html 的链接（内容故事必须上架）` });
		for (const slug of internalBuilt) if (root.includes(`stories/${slug}/index.html`)) problems.push({ code: 'P3', msg: `根页（书架）链到了**内部件** stories/${slug}/（audience: internal ⇒ 不进用户面）` });
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
	t('S5 正例（`#1035`）：内部件 z 未上书架 ⇒ 0 问题', checkShelf(shelfOK, ['a', 'b'], { bytes: 900, internalSlugs: ['z'] }).length === 0);
	t('S5 反例（`#1035`）：书架列了**内部件** z ⇒ 报 S5（内部件不得进用户面）', checkShelf(shelfOK + '<a href="stories/z/index.html">Z</a>', ['a', 'b'], { bytes: 900, internalSlugs: ['z'] }).some((f) => f.code === 'S5'));
	t('P4 正例：故事页在上界内 → 不报', judgeStoryPage({ slug: 'a', bytes: STORY_PAGE_MAX_BYTES - 1 }).length === 0);
	t('P4 反例：故事页顶到上界（＝部署后冒烟的口径）→ 报红', judgeStoryPage({ slug: 'a', bytes: STORY_PAGE_MAX_BYTES }).some((f) => f.code === 'P4'));
	// P5（`#576` 未决①）：CI 里的字面量必须与常量同值
	//注意：下面这两行 fixture 之前就是**陈的**（实测：故事页上界常量从 `1_000_000` 抬到 `2_000_000` 时没跟着改，
	// 而本件的 `--selftest` **不在 `npm test` 的段表里** → 红了也没人看见）—— 本片顺手改准 ＋ 去掉两处 `-lt 100000` 的
	// 子串歧义（`-lt 1000000` 里含 `-lt 100000` → 原 shelf 反例实际改的是**故事页**那一条 → "该红不红"）。
	const CI_OK = 'test "$SSZ" -lt 2000000 || exit 1\ntest "$SZ" -gt 0 -a "$SZ" -lt 100000 || exit 1\nSTORY_PATH=$(grep -oE \'stories/[A-Za-z0-9._-]+/index\\.html\' /tmp/idx.html | head -1)\n';
	t('P5 正例：ci.yml 两个上界与常量同值 → 0 问题', ciLiteralProblems(CI_OK).length === 0);
	t('🔴 P5 反例：ci.yml 故事页上界漂了（1999999）→ 报红', ciLiteralProblems(CI_OK.replace('-lt 2000000', '-lt 1999999')).some((f) => f.code === 'P5'));
	t('🔴 P5 反例：ci.yml 书架页上界漂了（200000）→ 报红', ciLiteralProblems(CI_OK.replace('"$SZ" -lt 100000', '"$SZ" -lt 200000')).some((f) => f.code === 'P5'));
	t('🔴 P5 反例：断言被删掉 ⇒ 报「口径锚点丢了」（P5×2 ＋ P6×1）', ciLiteralProblems('echo 无断言').length === 3);
	// P6（`#1004` B2b）：故事页路径不许硬编码（冒烟作业只在 push to main 跑 → PR CI 看不见 404）
	t('🔴 P6 反例：ci.yml 硬引用**已删故事**的故事页 ⇒ 报红', ciLiteralProblems(`${CI_OK}STORY="https://example.test/stories/mist-forest/index.html"\n`).some((f) => f.code === 'P6'));
	t('🔴 P6 反例（⭐ 复核席给的洞）：硬引用**现存故事**（`face-fixture` ✓）的故事页也**必须**报红 —— 且**锚点仍在** ✗', ciLiteralProblems(`${CI_OK}STORY="https://example.test/stories/face-fixture/index.html"\n`).some((f) => f.code === 'P6'));
	t('P6 正例：无字面量 ＋ 有现场取路径的锚点 ⇒ 不报 P6', !ciLiteralProblems(CI_OK).some((f) => f.code === 'P6'));
	t('🔴 P6 反例：「从书架页取路径」的锚点被删掉 ⇒ 报红', ciLiteralProblems('test "$SSZ" -lt 2000000 || exit 1\ntest "$SZ" -gt 0 -a "$SZ" -lt 100000 || exit 1\n').some((f) => f.code === 'P6'));
	t('P6 正例：注释里写旧路径（留痕）**不算**硬引用 ⇒ 不报 P6', !ciLiteralProblems(`${CI_OK}# 历史：原来写死 stories/mist-forest/index.html ✗\n`).some((f) => f.code === 'P6'));
		t('🔴 P6 反例（#1016 补记①）：字面量与锚点**同一行** ⇒ **报**（豁免只豁锚点子串，不豁整行）', ciLiteralProblems(`${CI_OK}          STORY_PATH=$(grep -oE 'stories/[A-Za-z0-9._-]+/index\\.html' /tmp/idx.html | head -1); STORY="$URL/stories/face-fixture/index.html"\n`).some((f) => f.code === 'P6'));
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
			const text = renderedElsOf(w)[0]?.textContent ?? '';
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
