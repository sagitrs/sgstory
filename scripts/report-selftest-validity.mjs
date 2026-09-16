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
import { fileURLToPath } from 'node:url';
import { ROOT } from './dist-paths.mjs';

/** #474：**一个扫描器**做全部字面量遮蔽（注释／字符串／模板／正则），一次词法走完。
 *
 *  为什么不是几条正则：原先用「注释 → 单/双引号串 → 模板 → 正则」四条正则**顺序**剥，每一层都能与
 *  另一层错配（`'` 在模板里、backtick 在正则里、`/` 在模板里…）——错配是**跨行贪婪**的，会把整段代码
 *  抹成空白 ⇒ `counters` 为空 ⇒ V2 判「自证不能判红」（假阳性）；同一次错位也造**假阴性**（把真问题抹掉）。
 *  实测三个受害者：本文件、`test/store-keys.mjs`、`scripts/report-copy-text.mjs`（＋`test/silent-gate.mjs` 的正则）。
 *  **换顺序治不了**（先剥正则 ⇒ 正则吃掉模板的收尾 backtick；先剥模板 ⇒ 模板吃掉正则里的 backtick）。
 *  ⇒ 正解是逐字符扫描：只有**未转义**的定界符才换状态；**保留换行**（行号不漂）；未闭合 ⇒ 保守剥到行尾
 *  并计入 `unterminated`（由调用方**打印诊断**，绝不静默 —— 反沉默）。
 *
 *  `/` 是正则还是除法：看**前一个有效字符**（`(`/`=`/`,`/`!`… ⇒ 正则；标识符/`)`/`]` ⇒ 除法）。
 *  这是通行的启发式；真正的分歧点会被 `unterminated` 诊断暴露出来，不会静默错下去。
 */
const REGEX_PREV = new Set([...'(,=:[!&|?{};+-*%~^<>', '\n']);
export const maskLiterals = (src) => {
	const text = String(src);
	let out = '', i = 0, unterminated = 0;
	const blank = (t) => t.replace(/[^\n]/g, ' ');
	// ⚠️ 关键：在**已遮蔽的输出流**上回溯，而不是原始文本 —— 否则会撞上**注释里的字**
	//（本文件 `DECL_PATTERNS` 的注释是中文 ⇒ 行首正则被误判成除法 ⇒ 该行内容没被遮蔽 ⇒ V1 假阳性）。
	// 另：`/` 前面若是**关键字**（`return /$^/`）同样是正则位置 —— 只看单个字符会把 `return` 的 `n` 当除法 ✗。
	const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'case']);
	const prevIsRegexPos = () => {
		const m = /([A-Za-z_$][\w$]*)\s*$/.exec(out);
		if (m) return REGEX_PREV_WORDS.has(m[1]);
		for (let k = out.length - 1; k >= 0; k--) { if (/\s/.test(out[k])) continue; return REGEX_PREV.has(out[k]); }
		return true;
	};
	while (i < text.length) {
		const ch = text[i], next = text[i + 1];
		if (ch === '/' && next === '/') { const eol = text.indexOf('\n', i); const end = eol === -1 ? text.length : eol; out += blank(text.slice(i, end)); i = end; continue; }
		if (ch === '/' && next === '*') {
			const close = text.indexOf('*/', i + 2);
			if (close === -1) { unterminated++; out += blank(text.slice(i)); break; }
			out += blank(text.slice(i, close + 2)); i = close + 2; continue;
		}
		if (ch === "'" || ch === '"') {
			let j = i + 1, closed = false;
			while (j < text.length) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === ch) { closed = true; break; } if (text[j] === '\n') break; j++; }
			if (!closed) { unterminated++; const eol = text.indexOf('\n', i); const end = eol === -1 ? text.length : eol; out += ch + blank(text.slice(i + 1, end)); i = end; continue; }
			out += ch + blank(text.slice(i + 1, j)) + ch; i = j + 1; continue;
		}
		if (ch === '`') {
			let j = i + 1, closed = false;
			while (j < text.length) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === '`') { closed = true; break; } j++; }
			if (!closed) { unterminated++; const eol = text.indexOf('\n', i); const end = eol === -1 ? text.length : eol; out += '`' + blank(text.slice(i + 1, end)); i = end; continue; }
			out += '`' + blank(text.slice(i + 1, j)) + '`'; i = j + 1; continue;
		}
		if (ch === '/' && prevIsRegexPos()) {
			let j = i + 1, closed = false, inClass = false;
			while (j < text.length) {
				const c = text[j];
				if (c === '\\') { j += 2; continue; }
				if (c === '\n') break;
				if (c === '[') inClass = true; else if (c === ']') inClass = false;
				else if (c === '/' && !inClass) { closed = true; break; }
				j++;
			}
			if (!closed) { unterminated++; out += '/'; i++; continue; }
			let k = j + 1; while (k < text.length && /[gimsuy]/.test(text[k])) k++;
			out += '/' + blank(text.slice(i + 1, j)) + '/' + text.slice(j + 1, k); i = k; continue;
		}
		out += ch; i++;
	}
	return { code: out, unterminated };
};

/** 剥离 + **可诊断**（`stripForScan` 是它的薄封装）。`unterminated` ⇒ 未闭合字面量（已保守处理）。 */
export const stripDiag = (src) => maskLiterals(src);
export const stripForScan = (src) => stripDiag(src).code;

/** **只剥注释**（保留字符串/模板）——用于判"有没有打印 `自证·`"：它写在**字符串**里要看得见，
 *  写在**注释**里不算（本文件自己就被这条误报过 ✗）。这一条只需行内正则，无错配风险。 */
export const stripCommentsOnly = (src) =>
	String(src)
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

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
	// #474 精化：V1 只判**自增/复合赋值**（`X++`／`X += …`）。纯 `=` 与"自证能否判红"无关，
	// 而 debug 实测的假阳性（模板插值 `kind=${…}`、正则 `\slang=`、参数默认值 `dir =`、纯赋值 `hooked =`）**全是 `=` 形态**。
	for (const m of code.matchAll(/(?<![\w$.\-"'])([A-Za-z_$][\w$]*)\s*(?:\+\+|[+\-*/|&^]=)/g)) {
		const id = m[1];
		if (['if', 'for', 'while', 'return', 'typeof', 'const', 'let', 'var'].includes(id)) continue;
		const at = declAt.get(id);
		const ln = code.slice(0, m.index).split('\n').length;
		const hit = { ident: id, line: ln, match: JSON.stringify(m[0]), src: (code.split('\n')[ln - 1] ?? '').trim().slice(0, 70) };
		if (at === undefined) out.push({ ...hit, kind: 'undeclared-increment' });
		// #474 精化（已知边界，**降为警告**）："声明在增量之后"在**闭包**里是合法的——
		// `const check = () => { failures++ }` 写在 `let failures = 0` 之前，但**调用在之后** ⇒ 运行时没问题 ✗。
		// 静态分析判不了调用序 ⇒ 这类只报 `tdz-warning`（打印、不计失败）；`undeclared-increment` 仍计失败。
		else if (at > m.index) out.push({ ...hit, kind: 'tdz-warning' });
	}
	return out;
};

/** V2：打印了 `自证·` 却没有"能把失败计入退出码"的计数器 ⇒ [{ kind }]。 */
export const selftestExitFindings = (src) => {
	const raw = String(src);
	if (!raw.includes('自证·')) return [];
	const code = stripForScan(raw);
	// #474：用**只剥注释**的文本判“有没有打印 `自证·`” —— 它写在字符串里（保留 ✓），写在注释里不算（剥掉 ✓）。
	// （踩坑留档：先前用 `code`（连字符串一起剥）判 ⇒ `console.log("自证·")` 被抹掉 ⇒ V2 恒不触发 ⇒ **假干净** ✗，是自证把它抱回来的。）
	if (!stripCommentsOnly(raw).includes('自证·')) return [];
	const counters = new Set([...code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:\+\+|\+=)/g)].map((m) => m[1]));
	// **实现要点（第三次尝试，前两次都错在这）**：不要解析"语句体"——“从退出点向前找最近的 `if`，
	// 用字符级配平取出它的条件”既简单又够用；退出点与条件之间隔着 `{`、`console.error(...)` 都不影响。
	const guarded = new Set();
	for (const em of code.matchAll(/process\.exit\(([^)]*)\)/g)) {
		// #474：退出写成 `process.exit(bad ? 1 : 0)` 也算“计入退出码”（`test/store-keys.mjs` 就是这么写的 ——
		// 先前只认 `process.exit(1)` ⇒ 把好门误报成“不能判红” ✗）。
		if (em[1] && em[1].trim() !== '1') {
			for (const id of idents(em[1])) guarded.add(id);
			continue;
		}
		const before = code.slice(0, em.index);
		const ifs = [...before.matchAll(/\bif\b/g)];
		if (!ifs.length) continue;
		const paren = code.indexOf('(', ifs[ifs.length - 1].index);
		if (paren === -1 || paren > em.index) continue;
		let depth = 0, i = paren;
		for (; i < code.length; i++) { if (code[i] === '(') depth++; else if (code[i] === ')') { depth--; if (depth === 0) break; } }
		for (const id of idents(code.slice(paren + 1, i))) guarded.add(id);
	}
	// 「自证块里的计数器」＝文件里被增量的计数器；只要**其中任一**进了退出码守卫即可
	return [...counters].some((c) => guarded.has(c)) ? [] : [{ kind: 'selftest-cannot-fail', counters: [...counters] }];
};

// `#762` 车道 C（顺带修）：本脚本原来**没有 isMain 守卫** ⇒ 被 `editor/**` 的工具当库 `import` 时，
// 会把它的自检报告先打一遍（契约分类器实测踩到 ⇒ 只能自带遮蔽器绕开）。⇒ 主跑包进 `main()` 并加守卫。
const main = () => {
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
		t('V1 反例：声明在使用之后 → tdz-warning（**降为警告**：闭包里合法，静态判不了调用序）', incrementFindings('bad++;\nlet bad = 0;').some((f) => f.kind === 'tdz-warning'));
		t('V1 精化：模板字面量里的插值**不算赋值**（`kind=${…}` 曾是最大假阳性源）', incrementFindings('const s = `kind=${c.kind}`;').length === 0);
		t('V1 精化：正则字面量里的内容**不算**（`/<html[^>]*\\slang=/`）', incrementFindings('if (!/<html[^>]*\\slang=/.test(x)) {}').length === 0);
		t('V1 精化：纯赋值不再判（`hooked = true` 与“自证能否判红”无关）', incrementFindings('hooked = true;').length === 0);
		t('V1 反例：完全没有声明 → undeclared-increment', incrementFindings('foo++;').some((f) => f.kind === 'undeclared-increment'));
		t('V1 边界：函数参数 / for-of / 解构 声明也算（不许假阳性）',
			incrementFindings('const f = (bad) => { bad++; };\nfor (const x of []) { x += 1; }\nlet { y } = o; y++;').length === 0);
		t('V1 边界：`obj.x++` 与注释/字符串里的 `bad++` 都不算', incrementFindings('obj.x++;\n// bad++\nconst s = "bad++";').length === 0);
		t('V2 正例：自证 + 计数器进退出码 → 不报', selftestExitFindings('let bad = 0;\nif (!ok) bad++;\nconsole.log("自证·x");\nif (bad) { console.error("x"); process.exit(1); }').length === 0);
		t('V2 反例：自证 + 计数器**没进**退出码 → selftest-cannot-fail',
			selftestExitFindings('let bad = 0;\nif (!ok) bad++;\nconsole.log("自证·x");\nif (problems.length) process.exit(1);').some((f) => f.kind === 'selftest-cannot-fail'));
		t('V2 边界：`自证·` 写在**注释**里 ⇒ 不算（误报过本文件）', selftestExitFindings('// 打印了 自证· 才是自证\nlet bad = 0; bad++;').length === 0);
		t('V2 边界：退出写成 `process.exit(bad ? 1 : 0)` 也算计入（`test/store-keys.mjs` 的写法）', selftestExitFindings('let bad = 0;\nif (!ok) bad++;\nconsole.log("自证·x");\nprocess.exit(bad ? 1 : 0);').length === 0);
		t('V2 关键：`自证·` 写在**字符串**里 ⇒ 必须看得见（否则 V2 恒不触发 ⇒ 假干净 ✗）', selftestExitFindings('let bad = 0;\nif (!ok) bad++;\nconsole.log("自证·x");\nif (problems.length) process.exit(1);').some((f) => f.kind === 'selftest-cannot-fail'));
		t('V2 边界：没有 `自证·` 的文件不适用（不报）', selftestExitFindings('let bad = 0;\nbad++;').length === 0);
		// #474 修复的回归自证（两个受害者就是被这条击中的）
		t('V2 回归：**正则里含 backtick** ⇒ 不得吞掉计数器（本文件/store-keys 被误报的根因）',
			selftestExitFindings('let bad = 0;\nconst re = /`(?:\\\\.|[^`\\\\])*`/g;\nif (!ok) bad++;\nconsole.log("自证·x");\nif (bad) { process.exit(1); }').length === 0);
		t('扫描器版：模板里含 `/` 也**不误剥**（`report-copy-text.mjs` 的根因）',
			(() => { const r = stripDiag('let bad = 0;\nconst s = `a/b ${x}`;\nbad++;\n'); return r.unterminated === 0 && /bad\+\+/.test(r.code); })());
		t('扫描器版：**关键字后的 `/` 是正则**（`return /$^/`）—— 只看前一个字符会误判成除法',
			(() => { const r = stripDiag('const f = (c) => { if (!c) return /$^/; };\nlet bad = 0;\nbad++;\n'); return r.unterminated === 0 && /bad\+\+/.test(r.code); })());
		t('扫描器版：除法**不**被当成正则（`const a = b / c;`）',
			(() => { const r = stripDiag('let bad = 0;\nconst a = b / c;\nbad++;\n'); return r.unterminated === 0 && /bad\+\+/.test(r.code) && /b /.test(r.code); })());
		t('扫描器版：**未闭合模板**只剥到行尾（绝不吞后文）且报诊断（反沉默）',
			stripDiag('let bad = 0;\nbad++;\nconst s = `未闭合 ${x};\nbad++;\n').unterminated === 1 && /bad\+\+/.test(stripDiag('let bad = 0;\nbad++;\nconst s = `未闭合 ${x};\nbad++;\n').code));
		t('扫描器版：模板**跨行**也剥得掉，且**保留换行**（行号不漂）', (() => {
			const r = stripDiag('const t = `a\n${bad++}\nb`;\nbad++;\n');
			return r.unterminated === 0 && !/\$\{/.test(r.code) && (r.code.match(/\n/g) || []).length === 4;
		})());
		if (bad) { console.error(`\n✗ 自证有效性检测器自证失败 ${bad} 项`); process.exit(1); }
		console.log('\n✔ 自证有效性检测器自证通过（V1 ×8 ＋ V2 ×10：能判红/不能判红/注释不算/字符串算/正则含 backtick 不误报/模板含斜杠不误剥/关键字后正则/除法不误判/未闭合模板保守剥/跨行模板保留换行）');
		process.exit(0);
	}

	const WHITELIST = {
		// 确有理由的例外（每条必须写清为什么）——**白名单腐烂**同样会报红
	};

	const problems = [];
	for (const f of files) {
		const src = readFileSync(f, 'utf8');
		const rel = f.slice(ROOT.length + 1);
		// #474：剥离器**自报可疑形态**（未转义 backtick 为奇数 ⇒ 本次跳过了模板剥离）。
		// 打印出来而不是静默：跳过意味着 V1 可能对该文件有假阳性 —— 那要**看得见**。
		if (stripDiag(src).unterminated) console.log(`○ [unterminated-template] ${rel}（有 ${stripDiag(src).unterminated} 处未闭合模板 ⇒ 只剥到行尾；若该文件有 V1 报告，先看这里）`);
		for (const x of incrementFindings(src)) problems.push({ file: rel, ...x });
		for (const x of selftestExitFindings(src)) problems.push({ file: rel, ...x });
	}
	const real = problems.filter((p) => !(WHITELIST[p.file] && WHITELIST[p.file].includes(p.kind)));
	const warnings = real.filter((p) => p.kind === 'tdz-warning');
	const fatal = real.filter((p) => p.kind !== 'tdz-warning');
	for (const w of warnings) console.log(`○ [${w.kind}] ${w.file}:${w.line} → ${w.ident}（声明在其后，但可能是闭包 ⇒ 不计失败）`);
	const stale = Object.entries(WHITELIST).filter(([file, kinds]) => !problems.some((p) => p.file === file && kinds.includes(p.kind)));

	if (stale.length) {
		console.error(`✗ 自证有效性白名单腐烂（条目已不需要）⇒ 删掉它：${stale.map(([f]) => f).join('、')}`);
		process.exit(1);
	}
	if (fatal.length) {
		console.error(`✗ 自证有效性自检未通过 ${fatal.length} 项：`);
		for (const p of fatal) {
			const extra = process.env.SV_DEBUG ? ` ｜ match=${p.match} ｜ 行=${JSON.stringify(p.src)}` : '';
			console.error(`    [${p.kind}] ${p.file}${p.line ? `:${p.line}` : ''}${p.ident ? ` → ${p.ident}` : ''}${extra}`);
		}
		console.error('    （§9 第 1/2 条：打印了 `自证·` ≠ 自证有效 ⇒ 失败要计入退出码，且失败路径不能崩）');
		process.exit(1);
	}
	console.log(`✔ 自证有效性自检通过（扫描 ${files.length} 个 .mjs：无未声明/置后声明的自增量；所有 \`自证·\` 都有记账并进退出码）`);

	// `#762` 车道 C（顺带修）：本脚本原来**没有 isMain 守卫** ⇒ 被 `editor/**` 的工具当库 `import` 时，
	// 会先把它的自检报告打一遍（契约分类器实测踩到 ⇒ 只能自带一个遮蔽器绕开）。


};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
