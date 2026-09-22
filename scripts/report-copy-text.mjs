// ── 文案计数（#457 后半）：把"引擎里有多少处硬编码中文文案"从**手数的数字**变成**可复算的基线** ──
//
// 为什么需要它：`#459` 要让引擎文案走 `Sg.story.copy()`（故事可覆盖、引擎有默认值兜底）。
// 在那之前必须能回答"**搬完了吗**"——而 `#441` 上为这个数字争过一次（手工数得 68＝`10-core` 49／`80-script` 19；
// 我 grep 得 99／23）。差的是**规则**不是算术 → 规则写死在这里，数字才敢当基线用。
//
// 规则（**声明式**，改规则＝改这里，别在票面上手数）：
// R1 单位＝**字符串字面量的一次出现**（`'…'` / `"…"` / `` `…` ``），**不去重**（同一句话写两遍＝2 处）；
// R2 只算**含 CJK**（U+4E00–U+9FFF）的字面量；
// R3 **注释不算**（复用 `literals` 门的剥注释规则：`/% … %/`、`<!-- … -->`、`//`（`://` 除外））
// —— 复用同一份实现，避免"两个门各写一套注释规则"然后漂移；
// R4 `<<link "中文">>` 这类**宏参数里的字符串算**（它是玩家真正读到的文案）；
// R5 **跨行字面量不计**（按行扫描）——本仓引擎侧现无此类；脚本会输出"引号不闭合行"的告警让人复核。
//
// 用法：
// node scripts/report-copy-text.mjs # 引擎层（layer: engine）逐文件计数 + 合计
// node scripts/report-copy-text.mjs --scope all # 全部源文件
// node scripts/report-copy-text.mjs --json # 机器可读（含每个字面量的行号与内容）
// node scripts/report-copy-text.mjs --selftest # 规则自证（边界例）
import { readFileSync } from 'node:fs';
import { ORDER, LAYER_OF } from './module-order.mjs';
import { blankComments } from './audit/gates/literals.mjs';

const CJK = /[\u4e00-\u9fff]/;
// 单行字符串字面量（转义已在字符类里放过）；三类引号分别匹配，避免 `'a"b'` 这种交叉误配
const LITERAL_RE = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`/g;

/** 纯函数：一段源码 → 含 CJK 的字符串字面量出现点（行号 1-based）。 */
export const countCopyText = (text) => {
	const occurrences = [];
	blankComments(text).forEach((line, i) => {
		for (const m of line.matchAll(LITERAL_RE)) {
			const body = m[1] ?? m[2] ?? m[3] ?? '';
			if (CJK.test(body)) occurrences.push({ line: i + 1, text: body });
		}
	});
	return occurrences;
};

/** 纯函数：引号不闭合的行（跨行字面量的信号）——报告里给人复核用，不参与计数。 */
export const unbalancedLines = (text) =>
	blankComments(text)
		.map((line, i) => [i + 1, line])
		.filter(([, line]) => ['\'', '"', '`'].some((q) => (line.split(q).length - 1) % 2 === 1))
		.map(([n]) => n);

// ── main ────────────────────────────────────────────────────────────────
const scope = (process.argv.find((a) => a.startsWith('--scope=')) ?? '--scope=engine').split('=')[1];
const files = ORDER.filter((f) => (scope === 'all' ? true : scope === 'story' ? LAYER_OF[f] === 'story' : LAYER_OF[f] === 'engine'));

if (process.argv.includes('--selftest')) {
	const cases = [
		['R3 注释里的中文不算', countCopyText('// 这是注释里的中文\nconst a = 1;').length === 0],
		['R3 `/% %/` 块注释里的中文不算（可跨行）', countCopyText('/% 开头\n中文中文\n%/ 结束').length === 0],
		['R4 `<<link "中文">>` 的宏参数字符串算', countCopyText('<<link "推门出发，走进暮色">><</link>>').length === 1],
		['R1 同一行两处中文字面量 → 计 2（不去重）', countCopyText('const a = "甲", b = "乙";').length === 2],
		['R2 纯英文字面量不算', countCopyText('const a = "hello", b = `world`;').length === 0],
		['R1 同一句话写两遍 → 计 2（不去重）', countCopyText('x = "甲"\ny = "甲"').length === 2],
		['R5 跨行模板串不计（按行扫描）＋给出"引号不闭合"告警（跨行串的**两行**都会被告警）', countCopyText('const s = `第一行\n第二行`;').length === 0 && unbalancedLines('const s = `第一行\n第二行`;').length === 2],
		['`: //` 不算注释起点（`https://` 不被截断）', countCopyText('见 https://example.com/中文 然后 "中文"').length === 1],
	];
	let bad = 0;
	for (const [label, ok] of cases) { if (!ok) bad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	console.log(`      自证·检出 ${cases.filter(([, ok]) => ok).length}（期望 ${cases.length}）`);
	if (bad) { console.error(`\n✗ 文案计数规则自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 文案计数规则自证通过（R1–R5）');
	process.exit(0);
}

const rows = [];
let total = 0;
const warns = [];
for (const f of files) {
	const text = readFileSync(`src/${f}`, 'utf8');
	const hits = countCopyText(text);
	total += hits.length;
	rows.push({ file: f, n: hits.length, hits });
	const ub = unbalancedLines(text);
	if (ub.length) warns.push(`${f}：引号不闭合行 ${ub.slice(0, 3).join(',')}${ub.length > 3 ? '…' : ''}（跨行字面量？按 R5 未计，请复核）`);
}
rows.sort((a, b) => b.n - a.n);

if (process.argv.includes('--json')) {
	console.log(JSON.stringify({ scope, rule: 'R1–R5（见脚本头）', total, files: rows }, null, 2));
} else {
	console.log(`\n══ 硬编码中文文案计数（#457）· scope=${scope} · 规则 R1–R5 见脚本头 ══`);
	for (const r of rows) console.log(`  ${String(r.n).padStart(4)}  ${r.file}`);
	console.log(`  ────\n  合计 ${total} 处（含 CJK 的字符串字面量出现次数；注释不计、链接文案计入、不去重）`);
	for (const w of warns) console.log(`  ⚠ ${w}`);
	console.log('  用途：这是 `Sg.story.copy()`（#459）迁移的**基线**——"搬完了吗"以此数为准，别在票面上手数。');
}
