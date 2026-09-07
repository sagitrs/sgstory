import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

// 用 extwee 编译：Twee + SugarCube 格式 → 单文件 HTML
execSync(`npx extwee -c -i build/game.twee -o ${OUT} -s vendor/format.js`, {
	stdio: 'inherit',
});

console.log(`\n✔ 编译完成：${OUT}（合并了 ${files.length} 个源文件）`);
console.log('  浏览器直接打开即可游玩；也可用 Twine 2 编辑器导入继续可视化编辑。');
