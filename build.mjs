import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { ORDER } from './scripts/module-order.mjs';

const SRC = 'src';
const STORIES = 'stories';
const OUT = 'dist/index.html';

mkdirSync('build', { recursive: true });
mkdirSync('dist', { recursive: true });

// #319：加载顺序**显式**声明在 scripts/module-order.mjs（不再靠文件名前缀隐含）。
// 这里只做两件守门：文件必须都在 ORDER 里，ORDER 里的文件必须都存在。
const files = readdirSync(SRC).filter((f) => f.endsWith('.twee'));
if (files.length === 0) {
	console.error('src/ 下没有找到 .twee 文件');
	process.exit(1);
}
{
	const unlisted = files.filter((f) => !ORDER.includes(f));
	const missing = ORDER.filter((f) => !files.includes(f));
	if (unlisted.length || missing.length) {
		if (unlisted.length) console.error(`✗ 以下文件未登记加载顺序（补进 scripts/module-order.mjs 的 ORDER）：${unlisted.join(', ')}`);
		if (missing.length) console.error(`✗ ORDER 里的文件不存在：${missing.join(', ')}`);
		process.exit(1);
	}
}
// ── #441 第 1 步（切片①）：**故事清单**是"哪些文件属于这个故事"的权威 ──────────
// 加载顺序仍是 `scripts/module-order.mjs` 的 ORDER（清单不表达顺序，只表达归属）。
// 本步输出路径与产物**保持不变**（多故事输出、书架页、命名空间隔离见切片③④⑤）。
const storyDirs = existsSync(STORIES) ? readdirSync(STORIES).filter((d) => existsSync(`${STORIES}/${d}/00-story.json`)) : [];
if (storyDirs.length === 0) {
	console.error(`✗ ${STORIES}/ 下没有找到故事清单（需 <slug>/00-story.json）`);
	process.exit(1);
}
const storyDir = storyDirs[0];                     // 切片①只构建第一个故事（多故事见切片③）
const story = JSON.parse(readFileSync(`${STORIES}/${storyDir}/00-story.json`, 'utf8'));
const manifest = story.files ?? [];
{
	const notOnDisk = manifest.filter((f) => !existsSync(`${SRC}/${f}`));
	if (notOnDisk.length) { console.error(`✗ 故事清单 ${storyDir} 列出的文件不存在：${notOnDisk.join(', ')}`); process.exit(1); }
	const onlyInManifest = manifest.filter((f) => !ORDER.includes(f));
	const onlyInOrder = ORDER.filter((f) => !manifest.includes(f));
	if (onlyInManifest.length || onlyInOrder.length) {
		if (onlyInManifest.length) console.error(`✗ 这些文件在故事清单里但不在 ORDER（无法确定加载顺序）：${onlyInManifest.join(', ')}`);
		if (onlyInOrder.length) console.error(`✗ 这些文件在 ORDER 里但不属于本故事清单：${onlyInOrder.join(', ')}`);
		process.exit(1);
	}
}
// 合并顺序仍由 ORDER 决定（清单只筛归属）⇒ 产物与改动前逐字节等价
const filesOrdered = ORDER.filter((f) => manifest.includes(f));
const merged = filesOrdered.map((f) => readFileSync(`${SRC}/${f}`, 'utf8').trimEnd()).join('\n\n') + '\n';
writeFileSync('build/game.twee', merged, 'utf8');

// ── 字体子集化（霞鹜文楷 → dist/fonts 外链 + preload）────────────────
// 收集游戏全部文本字符 + ASCII + 常用符号，子集化为 woff2 外链文件：
// HTML 首访更小（去 base64 膨胀），复访字体走缓存；dist 目录自包含可离线。
// 缺字体文件或 fonttools 时优雅跳过（系统字体回退）。
let fontCss = '';
const fontOK = existsSync('vendor/fonts/LXGWWenKai-Regular.ttf');
if (fontOK && existsSync('vendor/fonts/LXGWWenKai-Medium.ttf')) {
	const EXTRA = [
		String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 33 + i)), // ASCII 可见字符
		'，。、；：？！“”‘’（）《》〈〉【】〔〕—…·％＋－×÷＝℃°′″❤✔✘🎯✦☠☆★♦',
		'零一二三四五六七八九十百千万亿上中下左右前后',
	];
	const chars = new Set((merged + EXTRA.join('')));
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
writeFileSync('build/game.twee', merged, 'utf8');

// 用 extwee 编译：Twee + SugarCube 格式 → 单文件 HTML
execSync(`npx extwee -c -i build/game.twee -o ${OUT} -s vendor/format.js`, {
	stdio: 'inherit',
});

// 字体外链注入：preload（与解析并行）+ @font-face（swap）；不再占 HTML 体积。
if (fontCss) {
	const preload = ['Regular', 'Medium']
		.map((w) => `<link rel="preload" href="fonts/LXGWWenKai-${w}.woff2" as="font" type="font/woff2" crossorigin>`)
		.join('\n');
	let html = readFileSync(OUT, 'utf8');
	html = html.replace('</head>', `${preload}\n<style id="font-face" media="all">\n${fontCss}</style>\n</head>`);
	writeFileSync(OUT, html);
}

console.log(`\n✔ 编译完成：${OUT}（合并了 ${files.length} 个源文件${fontCss ? ' + 字体外链' : ''}）`);
console.log('  浏览器直接打开即可游玩；也可用 Twine 2 编辑器导入继续可视化编辑。');

// #272：读屏语言——SugarCube 模板不带 lang；构建期无条件注入 <html lang="zh-CN">
//（放这里而不是 if (fontCss) 块内：字体缺失时也必须注入）
{
	const html = readFileSync(OUT, 'utf8');
	if (!/<html[^>]*\slang=/.test(html)) {
		writeFileSync(OUT, html.replace(/<html(?=[\s>])/, '<html lang="zh-CN"'));
	}
}
