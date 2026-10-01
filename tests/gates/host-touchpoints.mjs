#!/usr/bin/env node
/* core 宿主触点 lint（`#1804` 件二；病根②「core 与宿主耦合」· **测量面先行，不动结构**）
 *
 * ## 本条要产出的东西
 *   一张**清单**：`src/core/**` 里还有多少处直接摸宿主（`State.variables`／`SugarCube`／`Wikifier`／
 *   `setup.`／`jQuery`／`window`／`document`），**逐文件逐类**。
 *   ⇒ 它是未来 **L0 宿主收口**（`⊕shim #1749`）的**工料单**：改哪几处、动几个文件，先有数。
 *
 * ## 判据（棘轮：**只防加深**）
 *   ① 相对基线**新触点** ⇒ **红**（棘轮防加深）；
 *   ② **基线缺失** ⇒ **红**（✗ 静默放过）；
 *   ③ 相对基线**减少** ⇒ **绿 ＋ 出声**（提示刷新基线）——★**刻意不红**：本伞的目标**就是**减少触点，
 *      把「变好」也判红会给**正确的方向**上税（与 `#1786` 的「绿但钝」巡检同理：先出声，✗ 先阻断）。
 *      ⇒ 但基线因此会**松弛** ⇒ 用 `--update-baseline` 显式刷新（**人工**，✗ 门自动改）。
 *   ④ 基线含**本仓不存在的老路径**（旧世界残留）⇒ **红**（过期登记，承【过期兼容】纪律）。
 *
 * ## 口径（★读数须注明，否则不可复核）
 *   · **代码面**：**剥注释与字符串字面量**后计数 —— 否则文档/文案里的 `State.variables` 会被误计
 *     （本仓注释里大量出现这些词，是**说明**而非**触点**）。
 *   · **扫描面**：`src/core/**`（件二原文限定「core 模块」）；`src/dnd/**` **不在本门**（各规则包
 *     本就要用宿主，收口次序在 core 之后 ⇒ 另条）。
 *   · 计数单位＝**正则命中次数**（同一行两处算两处），✗ 行数。
 *
 * 用法：node tests/gates/host-touchpoints.mjs [--verbose] [--update-baseline] [--src <dir>]
 *       node tests/gates/host-touchpoints.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
/** ★是否**本文件被直接运行**（✗ 被 import）。
 *  没有这道守卫时，`import` 本文件会**执行其主判定并 `process.exit`** ——
 *  `d20-consumers.mjs` 只想复用它的一份 `stripCommentsAndStrings`，却会被本文件的 `exit` 带走
 *  （本席实测：导入即跑自检/主判定，输出与预期完全不符）。 */
export const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
/* ★实测留痕：**没有这道守卫时**，`import` 本文件会执行其自检/主判定并 `process.exit`
 *   —— `d20-consumers.mjs` 只想复用一份 `stripCommentsAndStrings`，结果被本文件的 `exit` 带走
 *   （实测：跑它的 `--selftest` 却打出**本文件**的九把刀、随后主判定报「缺基线」）。
 *   ⚠ 且 `isMain` **不可外借**：它用**本模块**的 `import.meta.url` 算 ⇒ 对导入方**恒 false**
 *   （实测表现＝「导入方的 `--selftest` 一声不响、rc=0」＝**自检根本没跑**）。
 *   ⇒ 导入方须用**自己的** `import.meta.url` 另算一份（见 `d20-consumers.mjs` 的注）。 */
export const _isMainWarning = '⚠ isMain 用**本模块**的 import.meta.url 计算 ⇒ 对导入方恒 false；'
	+ '导入方须用**自己的** import.meta.url 另算一份（见 d20-consumers.mjs 的注）。';

const ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const SRC = path.resolve(valOf('--src') ?? path.join(ROOT, 'src/core'));
const BASELINE_PATH = path.join(ROOT, 'tests/gates/host-touchpoints.json');

/** 触点类目（★新增类目须同笔更新基线，否则「新类目」会被当成未知而漏计） */
export const CATEGORIES = {
	'State.variables': /(?<![.\w$])State\s*\.\s*variables\b/g,
	'State.other':     /(?<![.\w$])State\s*\.(?!\s*variables\b)\w+/g,
	'SugarCube':       /(?<![.\w$])SugarCube\b/g,
	'Wikifier':        /(?<![.\w$])Wikifier\b/g,
	'setup.':          /(?<![.\w$])setup\s*\./g,
	'jQuery':          /(?<![.\w$])jQuery\s*\(/g,
	'dollar':          /(?<![.\w$])\$\s*\(/g,
	'window':          /(?<![.\w$])window\s*\./g,
	'document':        /(?<![.\w$])document\s*\./g,
};

/** 剥注释与字符串字面量（★口径：只算**代码面**）。
 *
 * ## 为什么不是「三行正则」（本席实测踩过，留痕）
 *   朴素剥法（把 `'`／`"` 一律当字符串起点）会在**正则字面量含引号**时**吞掉半份文件**：
 *   `70-ui.js` 有 `.replace(/'/g, '&#39;')` ⇒ 那个 `'` 被当字符串起点 ⇒ 其后全文成了「字符串」⇒
 *   该文件代码面只剩 **144 字符**（实测），**触点被静默漏计**（本门的读数会假绿）。
 *   ⇒ 必须：⑴ 识别**正则字面量**（用「上一有效字符是否期待值」这一经典启发式区分 `/` 与除号）
 *          ⑵ **模板串的 `${…}` 里是真代码** ⇒ 递归处理，✗ 当作纯文本丢掉。
 */
export const stripCommentsAndStrings = (src) => {
	let out = '';
	/* 期待值的上下文（此处 `/` 起正则，✗ 除号） */
	const regexOkAfter = /[({[,;:!&|?+\-*%~^<>=]$/;
	const kwOkAfter = /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/;
	const skipRegex = (s, i) => {
		i++;                                   // 跳过起始 /
		let inClass = false;
		while (i < s.length) {
			const ch = s[i];
			if (ch === '\\') { i += 2; continue; }
			if (ch === '\n') return -1;        // 未闭合 ⇒ 判错 ⇒ 回退当除号
			if (ch === '[') inClass = true;
			else if (ch === ']') inClass = false;
			else if (ch === '/' && !inClass) return i + 1;
			i++;
		}
		return -1;
	};
	/* 深度优先处理一段「代码」，遇字符串/注释即跳过；模板串的 ${} 递归回代码 */
	const run = (s, i, stopBrace) => {
		let depth = 0;
		while (i < s.length) {
			const c = s[i], d = s[i + 1];
			if (stopBrace && c === '{') depth++;
			else if (stopBrace && c === '}') { if (depth === 0) return i + 1; depth--; }
			if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
			if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
			if (c === '"' || c === "'") {
				i++;
				while (i < s.length && s[i] !== c) { if (s[i] === '\\') i++; i++; }
				i++; out += ' '; continue;
			}
			if (c === '`') {
				i++;
				while (i < s.length && s[i] !== '`') {
					if (s[i] === '\\') { i += 2; continue; }
					if (s[i] === '$' && s[i + 1] === '{') { i = run(s, i + 2, true); continue; }   // ★${} 里是真代码
					i++;
				}
				i++; out += ' '; continue;
			}
			if (c === '/') {
				let j = out.length - 1;
				while (j >= 0 && /\s/.test(out[j])) j--;
				const prev = j >= 0 ? out[j] : '';
				if (prev === '' || regexOkAfter.test(prev) || kwOkAfter.test(out.slice(0, j + 1))) {
					const e = skipRegex(s, i);
					if (e > 0) { i = e; out += ' '; continue; }
				}
			}
			out += c; i++;
		}
		return i;
	};
	run(src, 0, false);
	return out;
};

/** 统计：file → { 类目: 次数 }（已剥注释/字符串） */
export const scan = (dir) => {
	const per = {};
	const walk = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) { walk(p); continue; }
			if (!e.name.endsWith('.js')) continue;
			const rel = path.relative(ROOT, p).split(path.sep).join('/');
			const code = stripCommentsAndStrings(fs.readFileSync(p, 'utf8'));
			const hits = {};
			for (const [k, re] of Object.entries(CATEGORIES)) {
				const m = code.match(new RegExp(re.source, 'g'));
				if (m) hits[k] = m.length;
			}
			if (Object.keys(hits).length) per[rel] = hits;
		}
	};
	walk(dir);
	return per;
};

/** 判定（纯函数，便于自检刀直接调用）：base 与 now 皆为 file → {类目: 次数}
 *  `exists` 可注入 ⇒ 自检刀可用**虚构路径**而不触真文件系统（✗ 让「过期登记」判据误伤自检）。 */
export const judge = (base, now, exists = (f) => fs.existsSync(path.join(ROOT, f))) => {
	const problems = [];
	const notes = [];
	const sumOf = (o) => Object.values(o).reduce((a, b) => a + b, 0);
	/* ① 新增／变多 */
	for (const [f, hits] of Object.entries(now)) {
		for (const [k, v] of Object.entries(hits)) {
			const b = base[f]?.[k] ?? 0;
			if (v > b) problems.push(`新触点：${f} 的 ${k} ${b} → ${v}（棘轮防加深）`);
		}
	}
	/* ③ 减少（绿但出声） */
	for (const [f, hits] of Object.entries(base)) {
		for (const [k, b] of Object.entries(hits)) {
			const v = now[f]?.[k] ?? 0;
			if (v < b) notes.push(`触点减少：${f} 的 ${k} ${b} → ${v}（★好事 ⇒ 请 --update-baseline 刷新，否则基线松弛）`);
		}
	}
	/* ④ 过期：基线里的文件本仓已不存在 */
	for (const f of Object.keys(base)) {
		if (!exists(f)) problems.push(`过期登记：基线含本仓不存在的文件 ${f}（应 --update-baseline 移除）`);
	}
	return { problems, notes, total: sumOf(Object.values(now).reduce((a, o) => { for (const [k, v] of Object.entries(o)) a[k] = (a[k] ?? 0) + v; return a; }, {})) };
};

/* ---------------- 自检刀（仅当直接运行） ---------------- */
if (isMain && has('--selftest')) {
	const b = { 'src/core/a.js': { 'State.variables': 2, setup: 1 }, 'src/core/b.js': { jQuery: 1 } };
	const knives = [
		['K0 空刀：与基线同 ⇒ 绿', b, b, 0],
		['K1 新触点（0→1）⇒ 红', b, { ...b, 'src/core/c.js': { Wikifier: 1 } }, 1],
		['K2 同类变多（2→3）⇒ 红', b, { ...b, 'src/core/a.js': { 'State.variables': 3, setup: 1 } }, 1],
		['K3 减少（2→1）⇒ 绿（✗ 红）', b, { ...b, 'src/core/a.js': { 'State.variables': 1, setup: 1 } }, 0],
		['K4 过期登记（文件已不存在）⇒ 红', { ...b, 'src/core/ghost.js': { setup: 1 } }, b, 1],
	];
	let n = 0;
	for (const [name, base, now, want] of knives) {
		/* ★虚构路径 ⇒ 存在性一律为真（除 K4 显式造「已不存在」） */
		const exists = (f) => !f.includes('ghost');
		const got = judge(base, now, exists).problems.length === 0 ? 0 : 1;
		const ok = got === want; n += ok ? 1 : 0;
		console.log(`  ${ok ? '✓' : '✗'} ${name} — 实得 ${got === 0 ? '绿' : '红'}（期望 ${want === 0 ? '绿' : '红'}）`);
	}
	/* 剥注释/字符串刀（★口径刀）：注释与字符串里的触点**不得**计入 */
	const count = (code) => (code.match(/(?<![.\w$])State\s*\.\s*variables\b/g) ?? []).length;
	const coats = [
		['K5 剥注释与字符串：三处只算**代码面**那 1 处',
			"const a = 'State.variables'; // State.variables\n/* State.variables */\nState.variables.x = 1;", 1],
		['K6 ★正则字面量含引号**不得吞文件**（本席实测踩过的坑）',
			"const a = 'x'.replace(/'/g, '&#39;');\nState.variables.b = 1;  // 其后仍须被看到", 1],
		['K7 ★模板串 `${…}` 里是真代码，须计入',
			'const s = `a${State.variables.x}b`; // 模板外的注释 State.variables', 1],
		['K8 除号不是正则（`a / b` 后跟代码不得被吞）',
			'const q = n / 2; State.variables.y = q;', 1],
	];
	for (const [name, src, want] of coats) {
		const got = count(stripCommentsAndStrings(src));
		const ok = got === want; n += ok ? 1 : 0;
		console.log(`  ${ok ? '✓' : '✗'} ${name} — 实得 ${got}（期望 ${want}）`);
	}
	const totalKnives = knives.length + coats.length;
	console.log(n === totalKnives ? `  ✓ ${n}/${totalKnives} 刀全部如期` : `  ✗ ${n}/${totalKnives} 刀如期`);
	process.exit(n === totalKnives ? 0 : 1);
}

/* ---------------- 主判定（仅当直接运行） ---------------- */
if (isMain) main();

function main() {
const now = scan(SRC);

if (has('--update-baseline')) {
	fs.writeFileSync(BASELINE_PATH, JSON.stringify({
		_note: 'core 宿主触点基线（#1804 件二）。棘轮：只防加深（新触点⇒红）；减少⇒绿但出声（可 --update-baseline 刷新）。'
			+ '口径：已剥注释与字符串、只算代码面；类目见 tests/gates/host-touchpoints.mjs 的 CATEGORIES。',
		_seededAt: (process.env.SEEDED_AT ?? 'unknown'),
		touchpoints: now,
	}, null, 2) + '\n');
	console.log(`  ✓ 基线已刷新（${path.relative(ROOT, BASELINE_PATH)}）—— ★须人工复核并解释进 diff`);
	process.exit(0);
}
if (!fs.existsSync(BASELINE_PATH)) {
	console.error('  ✗ 门红：缺基线 tests/gates/host-touchpoints.json（✗ 静默放过）');
	process.exit(1);
}
const doc = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const base = doc.touchpoints ?? {};
const { problems, notes, total } = judge(base, now);

console.log('  core 宿主触点 lint（#1804 件二；测量面先行）');
console.log(`  扫描面：${path.relative(ROOT, SRC) || SRC}/**（已剥注释与字符串 ⇒ 只算代码面）`);
console.log(`  当前触点 ${total} 处 ／ 涉及 ${Object.keys(now).length} 个文件（基线 ${Object.keys(base).length} 个）`);
if (has('--verbose')) {
	for (const [f, h] of Object.entries(now).sort()) console.log(`    · ${f}：${JSON.stringify(h)}`);
}
for (const nt of notes) console.log(`  ⚠ ${nt}`);
if (problems.length) {
	console.log('  ✗ 门红：');
	for (const p of problems) console.log(`    - ${p}`);
	process.exit(1);
}
console.log('  ✓ 门绿（无新触点）');
}
