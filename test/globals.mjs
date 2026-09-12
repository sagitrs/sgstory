// 全局命名空间门（#320）：裸 `window.*` 全局**只许减少、不许新增**。
//
// 为什么需要它：仓里现在有 15 个 window 全局、4 套命名风格（`Game.*` / `Sg*` / `sg*` / 裸名），
// 于是「新增功能该挂哪」无从判断（`pcNow` 这种裸函数就是这么来的）。约定（§7）+ 本门把这件事**钉住**：
//   新增全局必须匹配 `^(Game|Sg)`；白名单里的旧名逐个迁移，迁移完就从白名单删（删了才不腐烂）。
//
// 三条判据：
//   A1 **新裸全局** → 红（不在白名单、也不匹配 `^(Game|Sg)`）
//   A2 **白名单腐烂** → 红（白名单里有、实际已不存在：迁移完成后没更新白名单，门会一直放行一个幻影名额）
//   A3 新的**合规**全局（`Game.*`/`Sg*`）→ 只登记（绿），提示优先挂到既有命名空间下
//
// ⚠️ 假阳性守卫（写扫描器时最贵的教训，`#338`「原理不可达断言」同族）：
//   ① **只认赋值**：`window.X = …`；`window.scrollTo === 'function'`、`==`、`+=` 都不算（本仓初测就在
//      `typeof window.scrollTo === 'function'` 上误报过一次——当时的票面注记已复核为假阳性）；
//   ② **注释不算**：`/% … %/` 块与 `// …` 行注释先剥掉（URL 里的 `//` 不剥）；
//   ③ 只扫 `src/*.twee`（测试/脚本用 `w.Game` 这类注入风格，不参与本约定）。
//
// 自证：`node test/globals.mjs --selftest`（正例 2 + 反例 4，含两类假阳性守卫）

import { readFileSync, readdirSync } from 'node:fs';

export const RULE = /^(Game|Sg)/;

// 白名单＝**现状**（迁移目标写在值里）。迁移一类就删一类——删干净后 A2 会因此变绿，而 A1 永久生效。
export const WHITELIST = {
	Game: '命名空间根（保留）',
};

// 剥注释：块注释 `/% … %/`（可跨行）与行注释 `// …`（URL 的 `://` 不剥）
export const stripComments = (src) => src
	.replace(/\/%[\s\S]*?%\//g, ' ')
	.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// 扫描：返回 Map<全局名, [{file, line}]>，只认真赋值（`=` 后不接 `=`）
export const scanGlobals = (files) => {
	const found = new Map();
	for (const f of files) {
		const lines = stripComments(readFileSync(f, 'utf8')).split('\n');
		lines.forEach((line, i) => {
			// 复合赋值也算「创建全局」：`??=` / `||=` / `&&=`（`+=` 之类不算本约定所指的全局定义）
			for (const m of line.matchAll(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\?\?|\|\||&&)?=(?!=)/g)) {
				if (!found.has(m[1])) found.set(m[1], []);
				found.get(m[1]).push({ file: f, line: i + 1 });
			}
		});
	}
	return found;
};

// 判定（纯函数，便于自证）
export const judge = (found, whitelist = WHITELIST) => {
	const names = [...found.keys()];
	return {
		added: names.filter((n) => !(n in whitelist) && !RULE.test(n)),      // A1 红
		namespaced: names.filter((n) => !(n in whitelist) && RULE.test(n)),  // A3 只登记
		phantom: Object.keys(whitelist).filter((n) => !found.has(n)),        // A2 红
		bare: names.filter((n) => n in whitelist && !RULE.test(n)),          // 待迁移计数（报告用）
	};
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const W = { Game: '', OldBare: '', SgX: '' };
	const found = (...names) => new Map(names.map((n) => [n, [{ file: 'x', line: 1 }]]));

	const ok = judge(found('Game', 'OldBare', 'SgX'), W);
	t('正例：白名单名齐、无新增 → 全绿', !ok.added.length && !ok.phantom.length && ok.bare.join() === 'OldBare');

	const add = judge(found('Game', 'OldBare', 'SgX', 'Foo'), W);
	t('反例①：新裸全局 `Foo` → A1 报红', add.added.join() === 'Foo');

	const ph = judge(found('Game', 'SgX'), W);
	t('反例②：白名单里的 `OldBare` 已不存在 → A2 报红（防白名单腐烂）', ph.phantom.join() === 'OldBare');

	const ns = judge(found('Game', 'SgX', 'SgThing'), W);
	t('正例：新增**合规**全局 `SgThing` → 不报红，只登记', !ns.added.length && ns.namespaced.join() === 'SgThing');

	const cmp = stripComments("if (typeof window.scrollTo === 'function') {}\nwindow.x == 1;\nwindow.y += 1;\nwindow.Z?.m = 1;");
	const cmpNames = [...cmp.matchAll(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\?\?|\|\||&&)?=(?!=)/g)].map((m) => m[1]);
	t('假阳性守卫①：`===`／`==`／`+=`／`?.` 都不算赋值', cmpNames.length === 0);
	const compound = stripComments('window.Sg ??= {};\nwindow.Foo ||= 1;\nwindow.Bar &&= 2;');
	const compoundNames = [...compound.matchAll(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\?\?|\|\||&&)?=(?!=)/g)].map((m) => m[1]);
	t('正例：`??=`／`||=`／`&&=` 也算创建全局（不许漏认）', compoundNames.join() === 'Sg,Foo,Bar');
	const cmt = stripComments('/% window.Foo = 1; %/\n// window.Bar = 2;\nconst u = "https://x/y";\nwindow.Baz = 3;');
	const cmtNames = [...cmt.matchAll(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)/g)].map((m) => m[1]);
	t('假阳性守卫②：注释里的赋值不算，真赋值仍被认到', cmtNames.length === 1 && cmtNames[0] === 'Baz');

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：新裸全局红 / 白名单腐烂红 / 合规新名只登记 / 比较运算符与注释不误报');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const srcFiles = readdirSync('src').filter((f) => f.endsWith('.twee')).sort().map((f) => `src/${f}`);
const found = scanGlobals(srcFiles);
const v = judge(found);

const family = (n) => (n === 'Game' ? 'Game.*' : /^Sg/.test(n) ? 'Sg*' : /^sg/.test(n) ? 'sg*' : '裸名/其它');
const byFam = {};
for (const n of found.keys()) (byFam[family(n)] ??= []).push(n);

console.log(`══ 全局命名空间（#320）══  src/*.twee 里的 window 全局 ${found.size} 个`);
for (const [fam, names] of Object.entries(byFam).sort()) console.log(`  ${fam.padEnd(12)} ${names.length} 个：${names.join(', ')}`);

const pending = Object.keys(WHITELIST).filter((n) => !RULE.test(n));
console.log(`\n  待迁移裸全局 ${v.bare.length}/${pending.length}：`);
for (const n of v.bare) {
	const at = (found.get(n) ?? []).map((x) => `${x.file}:${x.line}`).join(' ');
	console.log(`    ${n.padEnd(16)} ${WHITELIST[n]}   ← ${at}`);
}
if (v.namespaced.length) console.log(`  （新的合规全局，仅登记）：${v.namespaced.join(', ')}`);

let fails = 0;
if (v.added.length) {
	fails++;
	console.error(`\n✗ 出现**新的裸全局**：${v.added.map((n) => `${n}（${(found.get(n) ?? []).map((x) => `${x.file}:${x.line}`).join(' ')}）`).join('、')}`);
	console.error('  约定（docs/dev-conventions.md §7）：数据/规则挂 `Game.*`，UI/运行时挂 `Sg.*`；不新增裸全局。');
}
if (v.phantom.length) {
	fails++;
	console.error(`\n✗ 白名单腐烂：${v.phantom.join('、')} 已在源码里消失，但仍留在 WHITELIST —— 迁移完请把它删掉（否则门会替一个不存在的名字放行）。`);
}
if (fails) process.exit(1);
console.log(v.bare.length
	? `\n○ 仍有 ${v.bare.length} 个裸全局待迁移（#320，见上表）；本门只保证**不再新增**。`
	: '\n✔ 裸全局已清零：`Game.*`/`Sg.*` 之外没有 window 全局（命名约定达成）');
