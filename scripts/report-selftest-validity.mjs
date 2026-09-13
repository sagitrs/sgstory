// ── 自证有效性自检（#474）：`自证·` 必须「失败计入退出码」且「不崩」 ─────────────
//
// 背景（`docs/dev-conventions.md` §9 第 1、2 条）：F2 补自证那一轮里，**三次**踩到同一类问题——
//   · `#470` `⓪q 门`：自证用了 `bad`，但那个文件里**根本没有** `bad` ⇒ 自证一失败会崩，
//     且 `--check` 只看 `problems.length` ⇒ 就算不崩也不会判红（**自证是摆设**）；
//   · `#471` `dragon 门`：`let dragonBad = 0` 写在**使用点之后** ⇒ 真出问题时门自己会 TDZ 崩；
//   · 更早：`items-tokens` 里我用 `globalThis.__itemsSelfBad` 绕过作用域。
// 这些都是**静态可检**的，不该继续靠人眼。
//
// 判据（纯函数，自带自证）：
//   V1「不崩」：任何 `X++` / `X += …`，其声明必须**在更早的位置**（或来自参数/import/解构/catch/for-of）。
//                ⇒ `undeclared-increment`（会 ReferenceError）／`tdz-increment`（声明在使用之后）。
//   V2「能判红」：文件里出现 `自证·` ⇒ 必须存在**被增量的计数器**出现在某个 `if (…X…)` 里，
//                且该分支可达 `process.exit(1)`。否则 `selftest-cannot-fail`。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './dist-paths.mjs';

/** 去掉 JS 注释与**单行字符串字面量**（V1 只关心代码位置；V2 需要保留字符串里的 `自证·`）。 */
export const stripForScan = (src) =>
	String(src)
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
		.replace(/'(\\.|[^'\\\n])*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`)
		.replace(/"(\\.|[^"\\\n])*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`);

const DECL_PATTERNS = [
	// `let a = 0, b = 1;` 这类**多重声明**要每个都算（此前只取第一个 ⇒ canGuard/hit/odd/italBad 全被误报）
	/\b(?:let|const|var)\s+([^;\n]*)/g,
	/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g,
	/\b(?:let|const|var)\s*\{([^}]*)\}/g,          // 解构对象
	/\b(?:let|const|var)\s*\[([^\]]*)\]/g,         // 解构数组
	/([A-Za-z_$][\w$]*)\s*=>/g,                    // 单参数箭头
	/\(([^)]*)\)\s*=>/g,                           // 括号参数列表
	/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g,   // 函数参数
	/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g,
	/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
	/\bimport\b([^;\n]*)/g,
];
const idents = (chunk) => String(chunk).match(/[A-Za-z_$][\w$]*/g) ?? [];

/** V1：把未声明/声明在后的自增量找出来（返回 [{ ident, line, kind }]）。 */
export const incrementFindings = (src) => {
	const code = stripForScan(src);
	const declAt = new Map(); // ident → 最早的声明位置
	const note = (id, at) => { if (!declAt.has(id) || at < declAt.get(id)) declAt.set(id, at); };
	for (const re of DECL_PATTERNS) {
		for (const m of code.matchAll(re)) {
			const chunk = m[1] ?? '';
			// 逗号分隔的每一段只取**第一个**标识符作为被声明者（避免把右值 `foo(y)` 里的 foo/y 也算成声明 ⇒ 假阴性）
			for (const part of chunk.split(',')) {
				const id = idents(part)[0];
				if (id && !['in', 'of'].includes(id)) note(id, m.index ?? 0);
			}
		}
	}
	const out = [];
	// 只认 `x++` 与复合赋值（`+=` `-=` …）＋**裸 `=` 但要排除 HTML 属性/比较**：
	//   `aria-hidden="true"` / `class="x"` 这类属性曾被误当赋值（188 项假阳性里的主因之一）
	for (const m of code.matchAll(/(?<![\w$.\-"'])([A-Za-z_$][\w$]*)\s*(?:\+\+|[+\-*/|&^]?=(?!=)(?![\s]*["'`]))/g)) {
		const id = m[1];
		if (['if', 'for', 'while', 'return', 'typeof', 'const', 'let', 'var'].includes(id)) continue;
		const at = declAt.get(id);
		if (at === undefined) out.push({ ident: id, line: code.slice(0, m.index).split('\n').length, kind: 'undeclared-increment' });
		else if (at > m.index) out.push({ ident: id, line: code.slice(0, m.index).split('\n').length, kind: 'tdz-increment' });
	}
	return out;
};

/** V2：打印了 `自证·` 却没有"能把失败计入退出码"的计数器 ⇒ [{ kind }]。 */
export const selftestExitFindings = (src) => {
	const raw = String(src);
	if (!raw.includes('自证·')) return [];
	const code = stripForScan(raw);
	const counters = new Set([...code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:\+\+|\+=)/g)].map((m) => m[1]));
	const lines = code.split('\n');
	const guarded = new Set();
	for (let i = 0; i < lines.length; i++) {
		if (!/process\.exit\(\s*1\s*\)/.test(lines[i])) continue;
		for (let j = Math.max(0, i - 4); j <= i; j++) {
			const ifm = lines[j].match(/\bif\s*\(([^)]*)\)/);
			if (ifm) for (const id of idents(ifm[1])) guarded.add(id);
		}
	}
	// 「自证块里的计数器」＝文件里被增量的计数器；只要**其中任一**进了退出码守卫即可
	return [...counters].some((c) => guarded.has(c)) ? [] : [{ kind: 'selftest-cannot-fail', counters: [...counters] }];
};

// ── main ────────────────────────────────────────────────────────────────
const scanDirs = [join(ROOT, 'scripts'), join(ROOT, 'test')];
const files = [];
for (const d of scanDirs) {
	const walk = (dir) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) { if (!/node_modules|lib/.test(e.name)) walk(p); continue; }
			if (e.name.endsWith('.mjs')) files.push(p);
		}
	};
	walk(d);
}

if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	t('V1 正例：先声明后自增 → 不报', incrementFindings('let bad = 0;\nbad++;').length === 0);
	t('V1 反例：声明在使用之后 → tdz-increment', incrementFindings('bad++;\nlet bad = 0;').some((f) => f.kind === 'tdz-increment'));
	t('V1 反例：完全没有声明 → undeclared-increment', incrementFindings('foo++;').some((f) => f.kind === 'undeclared-increment'));
	t('V1 边界：函数参数 / for-of / 解构 声明也算（不许假阳性）',
		incrementFindings('const f = (bad) => { bad++; };\nfor (const x of []) { x += 1; }\nlet { y } = o; y++;').length === 0);
	t('V1 边界：`obj.x++` 与注释/字符串里的 `bad++` 都不算', incrementFindings('obj.x++;\n// bad++\nconst s = "bad++";').length === 0);
	t('V2 正例：自证 + 计数器进退出码 → 不报', selftestExitFindings('let bad = 0;\nif (!ok) bad++;\nconsole.log("自证·x");\nif (bad) { console.error("x"); process.exit(1); }').length === 0);
	t('V2 反例：自证 + 计数器**没进**退出码 → selftest-cannot-fail',
		selftestExitFindings('let bad = 0;\nif (!ok) bad++;\nconsole.log("自证·x");\nif (problems.length) process.exit(1);').some((f) => f.kind === 'selftest-cannot-fail'));
	t('V2 边界：没有 `自证·` 的文件不适用（不报）', selftestExitFindings('let bad = 0;\nbad++;').length === 0);
	if (bad) { console.error(`\n✗ 自证有效性检测器自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证有效性检测器自证通过（V1 声明顺序/未声明 ×5 ＋ V2 能否判红 ×3）');
	process.exit(0);
}

const WHITELIST = {
	// 确有理由的例外（每条必须写清为什么）——**白名单腐烂**同样会报红
};

const problems = [];
for (const f of files) {
	const src = readFileSync(f, 'utf8');
	const rel = f.slice(ROOT.length + 1);
	for (const x of incrementFindings(src)) problems.push({ file: rel, ...x });
	for (const x of selftestExitFindings(src)) problems.push({ file: rel, ...x });
}
const real = problems.filter((p) => !(WHITELIST[p.file] && WHITELIST[p.file].includes(p.kind)));
const stale = Object.entries(WHITELIST).filter(([file, kinds]) => !problems.some((p) => p.file === file && kinds.includes(p.kind)));

if (stale.length) {
	console.error(`✗ 自证有效性白名单腐烂（条目已不需要）⇒ 删掉它：${stale.map(([f]) => f).join('、')}`);
	process.exit(1);
}
if (real.length) {
	console.error(`✗ 自证有效性自检未通过 ${real.length} 项：`);
	for (const p of real) console.error(`    [${p.kind}] ${p.file}${p.line ? `:${p.line}` : ''}${p.ident ? ` → ${p.ident}` : ''}`);
	console.error('    （§9 第 1/2 条：打印了 `自证·` ≠ 自证有效 ⇒ 失败要计入退出码，且失败路径不能崩）');
	process.exit(1);
}
console.log(`✔ 自证有效性自检通过（扫描 ${files.length} 个 .mjs：无未声明/置后声明的自增量；所有 \`自证·\` 都有记账并进退出码）`);
