import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SRC = 'src';
const OUT = 'dist/index.html';

mkdirSync('build', { recursive: true });
mkdirSync('dist', { recursive: true });

// 按文件名顺序合并 src/ 下所有 .twee 文件
const files = readdirSync(SRC).filter((f) => f.endsWith('.twee')).sort();
if (files.length === 0) {
	console.error('src/ 下没有找到 .twee 文件');
	process.exit(1);
}
const merged = files.map((f) => readFileSync(`${SRC}/${f}`, 'utf8').trimEnd()).join('\n\n') + '\n';
writeFileSync('build/game.twee', merged, 'utf8');

// ── 字体子集化（霞鹜文楷）────────────────────────────────────
// 收集游戏全部文本字符 + ASCII + 常用符号，生成 base64 内嵌 @font-face，
// 保持单文件 HTML 且不依赖外部 CDN。缺字体文件或 fonttools 时优雅跳过。
let mergedFinal = merged;
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
		console.log('🔤 生成字体子集（LXGW WenKai）…');
		execSync('python3 scripts/subset_font.py build/font-chars.txt build/fontface.twee', { stdio: 'inherit' });
		mergedFinal = merged + '\n\n' + readFileSync('build/fontface.twee', 'utf8');
	} catch (e) {
		console.warn('⚠️  字体子集化失败（缺 fonttools/brotli?），使用系统字体回退：' + e.message.split('\n')[0]);
	}
} else {
	console.warn('⚠️  vendor/fonts 缺少字体文件，使用系统字体回退');
}
writeFileSync('build/game.twee', mergedFinal, 'utf8');

// 用 extwee 编译：Twee + SugarCube 格式 → 单文件 HTML
execSync(`npx extwee -c -i build/game.twee -o ${OUT} -s vendor/format.js`, {
	stdio: 'inherit',
});

console.log(`\n✔ 编译完成：${OUT}（合并了 ${files.length} 个源文件${mergedFinal !== merged ? ' + 字体' : ''}）`);
console.log('  浏览器直接打开即可游玩；也可用 Twine 2 编辑器导入继续可视化编辑。');
