import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { allSourceFiles } from './scripts/module-order.mjs';
import { execSync } from 'node:child_process';
import { join, dirname, relative, isAbsolute } from 'node:path';
import { scopedFiles, checkRegistration } from './scripts/module-order.mjs';
import {
	ROOT, storySlugs, readStory, storyHtml, shelfHtml, DEFAULT_SLUG,
	audienceOf,
	FONT_PREFIX_FROM_ROOT, FONT_PREFIX_FROM_STORY,
} from './scripts/dist-paths.mjs';

const SRC = 'src';

// `#761` P1 六片A-2（复核席裁定的 (α1) ✓）：**两个窄口** —— 每个只有一个消费者（A-2 的读数 ✓）。
//  ① `--with-rules=<file>`：构建时用**指定的那份**规则文本代替该故事的 `17-rules.twee` ✓
//     ⇒ "改过的故事"由**构建脚本**产出 ✓（我不另写一份合并逻辑 ✗）。
//  ② `--story-out=<path>`：把该故事页写到**指定路径** ✓ ⇒ **不覆盖真 `dist/`** ✗
//     —— 复核席指出的危险 ✗：`dist/` 虽被 gitignore ✓ 但**测试读它** ✓ ⇒ 覆盖它就是在"探针污染被测对象" ✓（dist 版 ✓）。
//  默认（不带旗标）路径**逐字节不变** ✓（纯增口 ✓）。
const flagOf = (name, dflt) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : dflt;
};
const WITH_RULES = flagOf('with-rules', null);
const STORY_OUT = flagOf('story-out', null);
if (STORY_OUT && !WITH_RULES) throw new Error('--story-out 只与 --with-rules 配用 ✓（本口只为"改过的故事"的探测存在 ✓）');

mkdirSync('build', { recursive: true });
mkdirSync('dist', { recursive: true });

// #319：加载顺序**显式**声明在 scripts/module-order.mjs（不再靠文件名前缀隐含）。
// `#893` 守卫**分两层** ✓：① **引擎件**（`src/**`）必须全在 `ORDER` 里 ✓（它们的先后是**全局**的 ✓）；
//   ② **故事自己的件**（`stories/<slug>/**`）必须全在**该故事自己的清单**里 ✓ ⇒ 顺序由清单给 ✓
//   ⇒ **新建故事不必改代码** ✗（原来一律要求 ⊂ ORDER ✗ ⇒ 新故事必改代码 ✗）。
// 两层的**登记语义都没丢** ✓：新件仍须**显式登记** ✓，只是登记处换成**它自己的清单** ✓。
const files = allSourceFiles();   // #458 切片C：源文件发现走**单一权威**（搬家后＝`src/**` ＋ `stories/**`）
if (files.length === 0) {
	console.error('src/ 下没有找到 .twee 文件');
	process.exit(1);
}
const slugs = storySlugs();
if (slugs.length === 0) {
	console.error('✗ stories/ 下没有找到故事清单（需 <slug>/00-story.json）');
	process.exit(1);
}
const stories = slugs.map((slug) => ({ slug, ...readStory(slug) }));
{
	// `#893` 第三步：两层的**登记判据**走**单一权威** ✓（`checkRegistration()` —— 与 `test/layering.mjs`／
	// `scripts/move-precheck.mjs` **同一把尺** ✓）。此前这里内联了一份 ✗ ⇒ 三处各写一遍必漂移 ✗
	// （本仓实测过这一族：同一个"顺序/登记"口径在两处各算一次 ⇒ 改一处、另一处静默失效）。
	// 判据逐条（✓ 安全网一条不撤 ✗）：**引擎件** ⊂ `ORDER` ✓／**故事件** ⊂ **它自己的清单** ✓／
	// `ORDER` 里的文件必须存在 ✓／清单列出的文件必须存在 ✓／`ORDER` 里的非引擎孤儿 ✓。
	const reg = checkRegistration({
		sources: Object.fromEntries(files.map((f) => [f, ''])),
		manifests: stories.map((s) => ({ slug: s.slug, files: s.files ?? [] })),
	});
	if (reg.length) {
		for (const p of reg) console.error(`✗ [${p.code}] ${p.msg}`);
		console.error('✗ 登记不通过：**引擎件**必须进 ORDER／**故事件**必须进它自己的清单（两层的登记语义都没丢）');
		process.exit(1);
	}
}

// 合并顺序由 ORDER 决定（清单只筛归属）；引擎文件在前（它们本身就在 ORDER 前部）
// #460：合并口径与门（`scripts/audit/context.mjs`）**共用同一权威** `scopedFiles()`
// `#576`：编译前剥掉 `/% %/` **twee 块注释**——它们是给作者的，SugarCube 渲染时本就不输出，
// 但会被原样写进 `dist/stories/<slug>/index.html`（实测默认故事页 ≈ +12KB）并进字体子集。
// 只剥 twee 块注释：`[script]` 段里的 JS 行注释（`//`）是**代码**，不能动。
const stripTweeComments = (text) => String(text).replace(/\/%[\s\S]*?%\//g, ' ');
const mergedOf = (s) => scopedFiles(s).map((f) => {
	// `--with-rules` ✓：只替换**规则文件那一份** ✓（窄 ✓ —— 不动别的件 ✓）
	const text = (WITH_RULES && /(^|\/)17-rules\.twee$/.test(f)) ? readFileSync(WITH_RULES, 'utf8') : readFileSync(f, 'utf8');
	return stripTweeComments(text).trimEnd();
}).join('\n\n') + '\n';
const merges = new Map(stories.map((s) => [s.slug, mergedOf(s)]));

// ── 字体子集化（霞鹜文楷 → dist/fonts 外链 + preload）────────────────
// 收集**所有故事**的文本字符 + ASCII + 常用符号，子集化为 woff2 外链文件：
// HTML 首访更小（去 base64 膨胀），复访字体走缓存；dist 目录自包含可离线。
// 字体目录是**共享根路径** `dist/fonts/`（故事页用 `../../fonts/` 指过去）。
// 缺字体文件或 fonttools 时优雅跳过（系统字体回退）。
let fontCss = '';
const fontOK = existsSync('vendor/fonts/LXGWWenKai-Regular.ttf');
if (fontOK && existsSync('vendor/fonts/LXGWWenKai-Medium.ttf')) {
	const EXTRA = [
		String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 33 + i)), // ASCII 可见字符
		'，。、；：？！“”‘’（）《》〈〉【】〔〕—…·％＋－×÷＝℃°′″❤✔✘🎯✦☠☆★♦',
		'零一二三四五六七八九十百千万亿上中下左右前后',
	];
	const chars = new Set([...merges.values()].join('') + EXTRA.join(''));
	writeFileSync('build/font-chars.txt', [...chars].join(''), 'utf8');
	try {
		console.log('🔤 生成字体子集（LXGW WenKai → dist/fonts）…');
		execSync('python3 scripts/subset_font.py build/font-chars.txt build/fontface.css dist/fonts', { stdio: 'inherit' });
		fontCss = readFileSync('build/fontface.css', 'utf8');
	} catch (e) {
		console.warn('⚠️  字体子集化失败（缺 fonttools/brotli?），使用系统字体回退：' + e.message.split('\n')[0]);
	}
} else {
	console.warn('⚠️  vendor/fonts 缺少字体文件，使用系统字体回退');
}

// 字体外链注入：preload（与解析并行）+ @font-face（swap）；不再占 HTML 体积。
const injectFonts = (html, prefix) => {
	const preload = ['Regular', 'Medium']
		.map((w) => `<link rel="preload" href="${prefix}LXGWWenKai-${w}.woff2" as="font" type="font/woff2" crossorigin>`)
		.join('\n');
	// 注意：CSS 里的形式是 `url('fonts/…')`（引号在**前**）——按 `fonts/'` 切是错的（曾漏改 ⇒ 故事页深两层 404）
	const css = fontCss.replace(/url\('fonts\//g, `url('${prefix}`);
	return html.replace('</head>', `${preload}\n<style id="font-face" media="all">\n${css}</style>\n</head>`);
};

// #272：读屏语言——SugarCube 模板不带 lang；构建期无条件注入 <html lang="zh-CN">
const injectLang = (p) => {
	const html = readFileSync(p, 'utf8');
	if (!/<html[^>]*\slang=/.test(html)) writeFileSync(p, html.replace(/<html(?=[\s>])/, '<html lang="zh-CN"'));
};

// ── 清 `dist/stories/`（`#1015`／`#1035`）：**不 prune 会让已删故事的旧产物留在本地** ✗
//   ⇒ 本地验证面 ≠ 线上发布面（线上是干净 checkout）⇒ 本步让两者一致。
//   ⚠️ 只清 `stories/`：`dist/fonts/` 是共享根路径，由字体步骤负责。
if (!STORY_OUT) rmSync(join(ROOT, 'dist', 'stories'), { recursive: true, force: true });   // ⚠️ 窄口模式（`--story-out`）只写一份 ⇒ 不清，免得把别人的产物删了
// ── 编译每个故事 → dist/stories/<slug>/index.html ─────────────────────
for (const s of stories) {
	if (STORY_OUT && s.slug !== DEFAULT_SLUG) continue;   // 窄口 ✓：只写目标那一份 ✓（其余故事不碰 ✓）
	writeFileSync('build/game.twee', merges.get(s.slug), 'utf8');
	//  ⚠️ **工具契约** ✓（复核席对 `#874` 的裁定 (a) ✓）：`--story-out` **绝对路径按绝对处理** ✗ ——
	//   原先一律 `join(ROOT, …)` ✓ ⇒ `path.join('/repo','/repo/dist/x')` ＝ `/repo/repo/dist/x` ✗
	//   （`join` **不**在绝对段重置 ✓ —— 那是 `resolve` ✓）⇒ 构建落**荒处** ✗、目标文件仍是**旧那份** ✗
	//   ⇒ 调用方以为写了、其实没写 ✓。修在**工具侧**（只修调用点 ⇒ 下一个调用者再踩 ✗）。
	const out = STORY_OUT ? (isAbsolute(STORY_OUT) ? STORY_OUT : join(ROOT, STORY_OUT)) : storyHtml(s.slug);
	mkdirSync(dirname(out), { recursive: true });
	// 用 extwee 编译：Twee + SugarCube 格式 → 单文件 HTML
	execSync(`npx extwee -c -i build/game.twee -o ${relative(ROOT, out)} -s vendor/format.js`, { stdio: 'inherit' });
	if (fontCss) writeFileSync(out, injectFonts(readFileSync(out, 'utf8'), FONT_PREFIX_FROM_STORY));
	injectLang(out);
}

console.log(`\n✔ 编译完成：${stories.length} 个故事（${stories.map((s) => s.slug).join('、')}）→ dist/stories/<slug>/index.html${fontCss ? ' ＋ 字体外链' : ''}`);
console.log('  浏览器直接打开即可游玩；也可用 Twine 2 编辑器导入继续可视化编辑。');

// ── 书架页（#441 切片④）：**读目录**生成 ⇒ 加故事只需加目录，不手写清单 ──────
// β2 起它就是 `dist/index.html`（进站门面）。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
{
	const rows = stories.filter((s) => audienceOf(s) === 'content')   // `#1035`：书架只列**内容故事**（内部件仍构建）
		.map((s) => `\t\t<li><a href="stories/${s.slug}/index.html">${esc(s.title ?? s.slug)}</a></li>`)
		.join('\n');
	const shelf = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>书架</title>
<style>
	:root { color-scheme: dark light; }
	body { margin: 0; padding: 2rem 1rem; font: 16px/1.7 system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; }
	main { max-width: 34rem; margin: 0 auto; }
	h1 { font-size: 1.4rem; font-weight: 600; margin: 0 0 1rem; }
	ul { list-style: none; margin: 0; padding: 0; }
	li { margin: 0 0 .75rem; }
	a { display: block; padding: .9rem 1.1rem; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: .6rem; text-decoration: none; color: inherit; }
	a:hover, a:focus-visible { border-color: currentColor; }
	a span { display: block; opacity: .7; font-size: .9rem; }
	p { opacity: .6; font-size: .85rem; }
</style>
</head>
<body>
<main>
<h1>书架</h1>
<ul>
${rows}
</ul>
<p>共 ${stories.length} 个故事。</p>
</main>
</body>
</html>
`;
	writeFileSync(shelfHtml(), shelf, 'utf8');
	console.log(`✔ 书架页：${relative(ROOT, shelfHtml())}（**上架** ${stories.filter((x) => audienceOf(x) === 'content').map((x) => x.slug).join('、') || '无'}；内部件不上架 ${stories.filter((x) => audienceOf(x) === 'internal').map((x) => x.slug).join('、') || '无'}）`);
}
