import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { allSourceFiles } from './scripts/module-order.mjs';
import { execSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { ORDER, MODULES, engineFiles as engineFilesOf, scopedFiles } from './scripts/module-order.mjs';
import {
	ROOT, storySlugs, readStory, storyHtml, shelfHtml,
	FONT_PREFIX_FROM_ROOT, FONT_PREFIX_FROM_STORY,
} from './scripts/dist-paths.mjs';

const SRC = 'src';

mkdirSync('build', { recursive: true });
mkdirSync('dist', { recursive: true });

// #319：加载顺序**显式**声明在 scripts/module-order.mjs（不再靠文件名前缀隐含）。
// 这里只做两件守门：文件必须都在 ORDER 里，ORDER 里的文件必须都存在。
const files = allSourceFiles();   // #458 切片C：源文件发现走**单一权威**（搬家后＝`src/**` ＋ `stories/**`，路径为键）
if (files.length === 0) {
	console.error('src/ 下没有找到 .twee 文件');
	process.exit(1);
}
{
	const unlisted = files.filter((f) => !ORDER.includes(f));
	const missing = ORDER.filter((f) => !files.includes(f));	if (unlisted.length || missing.length) {
		if (unlisted.length) console.error(`✗ 以下文件未登记加载顺序（补进 scripts/module-order.mjs 的 ORDER）：${unlisted.join(', ')}`);
		if (missing.length) console.error(`✗ ORDER 里的文件不存在：${missing.join(', ')}`);
		process.exit(1);
	}
}

// ── #441 第 1 步（切片①③）：**故事清单**是"哪些文件属于这个故事"的权威 ────────
// 加载顺序仍是 `scripts/module-order.mjs` 的 ORDER（清单不表达顺序，只表达归属）。
// **引擎层文件**（`layer: 'engine'`）是所有故事共享的前缀；故事层文件必须各自有主。
const slugs = storySlugs();
if (slugs.length === 0) {
	console.error('✗ stories/ 下没有找到故事清单（需 <slug>/00-story.json）');
	process.exit(1);
}
const engineFiles = engineFilesOf(ORDER, MODULES);
const stories = slugs.map((slug) => ({ slug, ...readStory(slug) }));
{
	for (const s of stories) {
		const list = s.files ?? [];
		const notOnDisk = list.filter((f) => !existsSync(f));
		if (notOnDisk.length) { console.error(`✗ 故事清单 ${s.slug} 列出的文件不存在：${notOnDisk.join(', ')}`); process.exit(1); }
		const onlyInManifest = list.filter((f) => !ORDER.includes(f));
		if (onlyInManifest.length) { console.error(`✗ 这些文件在故事清单里但不在 ORDER（无法确定加载顺序）：${onlyInManifest.join(', ')}`); process.exit(1); }
	}
	const claimed = new Set(stories.flatMap((s) => s.files ?? []));
	const orphans = ORDER.filter((f) => !engineFiles.includes(f) && !claimed.has(f));
	if (orphans.length) {
		console.error(`✗ 这些文件既不是引擎文件（layer: engine）也不属于任何故事清单：${orphans.join(', ')}`);
		process.exit(1);
	}
}

// 合并顺序由 ORDER 决定（清单只筛归属）；引擎文件在前（它们本身就在 ORDER 前部）
// #460：合并口径与门（`scripts/audit/context.mjs`）**共用同一权威** `scopedFiles()`
const mergedOf = (s) => scopedFiles(s).map((f) => readFileSync(f, 'utf8').trimEnd()).join('\n\n') + '\n';
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

// ── 编译每个故事 → dist/stories/<slug>/index.html ─────────────────────
for (const s of stories) {
	writeFileSync('build/game.twee', merges.get(s.slug), 'utf8');
	const out = storyHtml(s.slug);
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
	const rows = stories
		.map((s) => `\t\t<li><a href="stories/${s.slug}/index.html">${esc(s.title ?? s.slug)}${s.subtitle ? `<span>${esc(s.subtitle)}</span>` : ''}</a></li>`)
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
	console.log(`✔ 书架页：${relative(ROOT, shelfHtml())}（${stories.length} 个故事${stories.length > 1 ? '：' + stories.map((s) => s.slug).join('、') : ''}）`);
}
