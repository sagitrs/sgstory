#!/usr/bin/env node
// `#1174`：**人类面行文检查**（`npm run lint:style`）—— 检索注释面与文档面里的装饰记号。
//
// 为什么要它（Operator 2026-09-22 行文整改令的存量面）：席位行文里的对勾、叉、星、警号、表情、双箭头等记号
// 已渗入设计文档与代码注释。新内容已即时生效，本件处理**存量**并把口径**工具化**。
//
// **注释定位不自研**（协调席 2026-09-22 裁定）：直接复用仓库既有的词法遮蔽刀
// `editor/lib/core/mask.mjs` 的 `mask()`（台账自证面已用它做先剥注再匹配，是被用过的权威）。
// 它按一次词法扫描把注释换成**等长空格**，且**字符串/模板/正则内部不遮**——这正是先前自研启发式
// 做不到的地方（实测两轮误伤：`* 开头`的模板串行被当成块注释内容清掉，生成器文案受影响）。
// 判据：某字符「原文非空格、遮蔽后为空格」⇒ 属注释区；注释区段＝从首个此类字符起，直到遇到代码字符为止
// （因此 `/* x */ code` 这类同行尾随代码不会被误改）。
//
// **口径**：
//   · 人类面：代码注释（`.mjs`／`.js`／`.twee`）＋ `docs/**/*.md` 的正文（代码块外）。
//   · 机器面：字符串字面量、断言报文、错误消息、模板串内文案 ⇒ 不在改写面（本脚本只改写注释区段）。
//   · 甲案：删记号（对勾、叉、星、表情），警号换「注意：」，`⇒` 换「因此」，单箭头仅在示意方向保留，
//     并规整因此产生的标点邻域空白。
//
// **豁免清单（有名有目）**：生成物（`docs/gate-ledger.md`、`docs/ui-migration-diff.md`）、
//   历史归档（`docs/archive/**`）、文档代码块（按引文）、故事侧生成物（`15-tables.twee`、`17-rules.twee`、
//   `16-notes-ch1.twee`）、元信息源件（`00-meta.twee`，本票不动）、本工具自身。
//
// **双路验证（不同源）**：
//   V1（独立于本工具）：清理只删记号与规整空白 ⇒ `去记号去空白(清理后) === 去记号去空白(原文)`；
//   V2（独立于本工具）：全文记号计数——生成器类文件的机器面文案不得减少。
//   V3（补充）：按 mask 的注释区间比对代码区逐字相同（与本工具同源，仅作补充）。
//
// 用法：node scripts/lint-human-face.mjs [--stat|--fix [--only=comment|docs]|--selftest]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { mask } from '../editor/lib/core/mask.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** 装饰记号：对勾、叉、星（含变体）、警号（含变体选择符）、双箭头、表情符号。 */
export const MARK_RE = /[\u2713\u2717\u2605\u2606\u2726\u2727\u26A0\uFE0F\u21D2]|[\u{1F300}-\u{1FAFF}]/gu;

export const EXEMPT = {
	'docs/gate-ledger.md': '生成物（report-gate-ledger.mjs 重生成；生成器文案属字符串面）',
	'docs/ui-migration-diff.md': '生成物（ui-migration-diff.mjs 重生成；同上）',
	'docs/archive/': '历史归档（性质同历史提交信息不翻搅，保锚与审计）',
	'15-tables.twee': '生成物（由 data/tables.json 生成）',
	'17-rules.twee': '生成物（由 data/rules.json 生成）',
	'16-notes-ch1.twee': '生成物（由 data/notes.json 生成）',
	'00-meta.twee': '元信息源件（本票不动，等 B4 的元数据能力）',
	'lint-human-face.mjs': '本工具自身（含示例字面量，自我改写风险高）',
};

export const isExempt = (rel) => Object.keys(EXEMPT).some((k) => {
	if (k.endsWith('/')) return rel.startsWith(k);
	if (k.includes('/')) return rel === k;
	return rel.split('/').pop() === k;
});

export const CODE_EXT = ['.mjs', '.js', '.twee'];

/** 区间结尾回溯掉空白（注释后的分隔空格属代码侧空白，不能并进注释段，否则会吃掉代码前的空格）。 */
const trimEnd = (line, a, b) => { let e = b; while (e > a && (line[e - 1] === ' ' || line[e - 1] === '\t')) e--; return e; };

/** **纯函数**：用 mask 求一行的注释区段（区间数组，左闭右开）。 */
export const commentSpansOfLine = (line, maskedLine) => {
	const spans = [];
	let start = -1;
	for (let k = 0; k <= line.length; k++) {
		const at = k < line.length;
		const masked = at && maskedLine[k] === ' ' && line[k] !== ' ' && line[k] !== '\n';
		const codeChar = at && maskedLine[k] === line[k] && line[k] !== ' ' && line[k] !== '\n';
		if (start < 0 && masked) start = k;
		else if (start >= 0 && codeChar) { spans.push([start, trimEnd(line, start, k)]); start = -1; }
	}
	if (start >= 0) spans.push([start, trimEnd(line, start, line.length)]);
	return spans;
};

/** **纯函数**：甲案清理一段注释文本。 */
export const cleanText = (text) => String(text)
	.replace(/\s*[\u2713\u2717\u2605\u2606\u2726\u2727]\uFE0F?\s*/gu, ' ')   // 连同**变体选择符 FE0F** 一起删（否则留下不可见的孤立字符，检查还会命中）
	.replace(/\s*\u26A0\uFE0F?\s*/gu, '注意：')
	// `#1174` RC①（三态，按行内箭头数判定"流程链"与"因果"）：
	//   · 单箭头 `→` 且前后成句 ⇒ 文字化成"因此"；
	//   · 双箭头 `⇒` 亦是因果 ⇒ "因此"；
	//   · 一行内箭头数 ≥ 2 ⇒ 判为**流程或列举链** ⇒ **保留单箭头**（行文规则允许单箭头示意方向），
	//     不改文字（改文字会把"A ⇒ B ⇒ C"这类链读成"因此…因此…"，语义被压平）。
	.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
	.replace(/\uFE0F/gu, '')
	.replace(/(?<=\S)[ \t]{2,}/g, ' ')   // 多空格压一个：**不吃行首缩进**（行首缩进是代码格式的一部分）
	.replace(/[ \t]+([,.;:!?)\]}，。；：、）】」！？])/g, '$1')
	.replace(/([（【「])\s+/g, '$1')
	.replace(/\s+([（【「〔〈《“‘])/g, '$1')
	.replace(/([，。；：、])，因此/g, '$1因此')
	.replace(/，因此\s*，因此/g, '，因此')
	.replace(/\*\*[ \t]+(?=[（【「〔〈《“‘，。；：、）】」！？,.;:!?]|$)/g, '**')
	.replace(/[ \t]+$/g, '');

/** **纯函数**：单行文本的记号清理（**行级**判定三态：箭头数 ≥ 2 视为流程链 ⇒ 只做记号删除与空白规整，
 *  不把箭头文字化）。 */
export const cleanLine = (seg) => {
	// `#1174` RC①（领队裁**甲案**，2026-09-22）：**箭头一律不文字化**，双箭头降为单箭头。
	//   理由：箭头在本仓至少有四种语义（因果、流程链、指向引用、映射命名、演进方向），
	//   机械规则只能安全判定其中两态（链与因果），另外三态（引用、映射、演进）会被误改成"因此"
	//   ——实测抽样人读抓到过（如"（完整版与沿革，因此 dev-conventions-cases.md）"把"参见"读成了因果）。
	//   ⇒ 机器只做它能证的（去记号、规整空白、双箭头降单箭头），**语义文字化留给作者按语境写**。
	//   ⇒ 单箭头在本仓行文规则里属**允许形态**（示意方向），保留不算违规。
	const t = String(seg).replace(/\u21D2/gu, '\u2192');
	return cleanText(t);
};



/** 清理一段源码：只改写注释区段。 */
export const cleanSource = (src, file = '') => {
	const masked = mask(src, { file }).text;
	const srcLines = src.split('\n');
	const mLines = masked.split('\n');
	let spots = 0;
	const out = srcLines.map((ln, i) => {
		const spans = commentSpansOfLine(ln, mLines[i] ?? '');
		if (!spans.length) return ln;
		let res = '', prev = 0;
		for (const [a, b] of spans) {
			const seg = ln.slice(a, b);
			const cleaned = cleanLine(seg);
			spots += (seg.match(MARK_RE) ?? []).length || (cleaned !== seg ? 1 : 0);
			res += ln.slice(prev, a) + cleaned;
			prev = b;
		}
		return res + ln.slice(prev);
	});
	return { text: out.join('\n'), spots };
};

/** 文档正文行（代码块按引文豁免）。 */
export const docBodyLines = (text) => {
	const out = [];
	let fence = false;
	text.split('\n').forEach((ln, i) => {
		if (ln.trim().startsWith('```')) { fence = !fence; return; }
		if (!fence) out.push({ line: i + 1, text: ln });
	});
	return out;
};

export const listFiles = (face, dir = ROOT) => {
	const out = [];
	const walk = (d) => {
		let entries;
		try { entries = readdirSync(d); } catch { return; }
		for (const name of entries) {
			if (name === 'node_modules' || name === 'build' || name === 'dist' || name === '.git') continue;
			const full = join(d, name);
			let st;
			try { st = statSync(full); } catch { continue; }
			if (st.isDirectory()) { walk(full); continue; }
			const rel = relative(ROOT, full);
			if (isExempt(rel)) continue;
			const ext = name.slice(name.lastIndexOf('.'));
			if (face === 'comment' && CODE_EXT.includes(ext)) out.push(full);
			if (face === 'docs' && ext === '.md' && rel.startsWith('docs/')) out.push(full);
		}
	};
	walk(dir);
	return out.sort();
};

/** 扫描一个面。stats.codeMarks＝注释区外的记号数（机器面，本票要求不变）。 */
/** **纯函数**：对给定文本按面统计人类面记号数（自证的全量验证格用它，不读盘）。 */
export const scanText = (face, text, rel = '') => {
	if (face === 'docs') return docBodyLines(text).reduce((n, { text: ln }) => n + (ln.match(MARK_RE) ?? []).length, 0);
	const masked = mask(text, { file: rel }).text;
	const mLines = masked.split('\n');
	return text.split('\n').reduce((n, ln, i) => n + commentSpansOfLine(ln, mLines[i] ?? '')
		.reduce((k, [a, b]) => k + (ln.slice(a, b).match(MARK_RE) ?? []).length, 0), 0);
};

export const scan = (face) => {
	const hits = [];
	const stats = { comment: 0, docs: 0, codeMarks: 0 };
	for (const file of listFiles(face)) {
		const rel = relative(ROOT, file);
		const text = readFileSync(file, 'utf8');
		if (face === 'docs') {
			for (const { line, text: ln } of docBodyLines(text)) {
				const marks = ln.match(MARK_RE);
				if (marks) { hits.push({ file: rel, line, marks }); stats.docs += marks.length; }
			}
			continue;
		}
		const masked = mask(text, { file: rel }).text;
		const mLines = masked.split('\n');
		text.split('\n').forEach((ln, i) => {
			const spans = commentSpansOfLine(ln, mLines[i] ?? '');
			let code = ln, shift = 0;
			for (const [a, b] of spans) {
				const seg = ln.slice(a, b);
				const marks = seg.match(MARK_RE) ?? [];
				if (marks) { hits.push({ file: rel, line: i + 1, marks }); stats.comment += marks.length; }
				code = code.slice(0, a + shift) + ' '.repeat(b - a) + code.slice(b + shift);
			}
			stats.codeMarks += (code.match(MARK_RE) ?? []).length;
		});
	}
	return { hits, stats };
};

/** 全量机械验证用的**清洁器**：按口径把某段文本里的人类面记号全部替换掉（不比空白、只看"记号是否消失"）。
 *  与 `cleanText` 的区别：本函数只做记号替换（对勾叉星删、警号与双箭头换文字），不做空白规整 ⇒
 *  用于验证「清理后确实不再有记号」，不参与写盘。 */
export const stripMarks = (text) => String(text)
	.replace(/[\u2713\u2717\u2605\u2606\u2726\u2727]/gu, '')
	.replace(/\u26A0\uFE0F?/gu, '注意')
	.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
	.replace(/\uFE0F/gu, '');

export const fixFace = (face, write = true) => {
	let files = 0, spots = 0;
	for (const file of listFiles(face)) {
		const rel = relative(ROOT, file);
		const text = readFileSync(file, 'utf8');
		let out, n = 0;
		if (face === 'docs') {
			let fence = false;
			out = text.split('\n').map((ln) => {
				if (ln.trim().startsWith('```')) { fence = !fence; return ln; }
				if (fence) return ln;
				const cleaned = cleanLine(ln);
				if (cleaned === ln) return ln;
				n += (ln.match(MARK_RE) ?? []).length || 1;
				return cleaned;
			}).join('\n');
		} else {
			const r = cleanSource(text, rel);
			out = r.text; n = r.spots;
		}
		if (out !== text) { files += 1; spots += n; if (write) writeFileSync(file, out); }
	}
	return { files, spots };
};

const main = () => {
	const argv = process.argv.slice(2);
	const has = (k) => argv.includes(`--${k}`);
	const val = (k, d) => { const h = argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : d; };

	if (has('selftest')) {
		let bad = 0;
		const t = (label, ok) => { console.log(`      ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
		t('注释定位用 mask：行注释与块注释都能判出',
			commentSpansOfLine('  // 注释 ✓', mask('  // 注释 ✓').text).length === 1
			&& commentSpansOfLine('/* 块 ✓ */', mask('/* 块 ✓ */').text).length === 1);
		t('字符串与模板串内部不误判（前两轮误伤点）', (() => {
			const src = "const a = '✓';\nconst b = `\n  * 模板行 ✓\n`;\n";
			const masked = mask(src).text;
			const lines = src.split('\n'), ml = masked.split('\n');
			return lines.every((ln, i) => commentSpansOfLine(ln, ml[i] ?? '').length === 0);
		})());
		t('同行尾随代码不被误改（/* x ✓ */ code）',
			cleanSource('/* x ✓ */ const y = 1;').text === '/* x */ const y = 1;');
		t('清理：行尾对勾删除、句末不留孤立空格', cleanText('// 只读 ✓，不判红 ✗。') === '// 只读，不判红。');
		t('清理：警号换注意、双箭头降单箭头（甲案：不文字化）',
			cleanLine('// ⚠️ 缺 ⇒ 合法').includes('注意') && cleanLine('// ⚠️ 缺 ⇒ 合法').includes('→')
			&& !cleanLine('// ⚠️ 缺 ⇒ 合法').includes('⇒') && !cleanLine('// ⚠️ 缺 ⇒ 合法').includes('因此'));
		t('代码区不动：改写只在注释区段内', (() => {
			const src = "  doThing(a, b);  // 读数 ✓\n  const t = '通过 ✓';\n";
			const out = cleanSource(src).text;
			return out.startsWith('  doThing(a, b);') && !out.split('\n')[0].includes('✓') && out.includes("'通过 ✓'");
		})());
		t('豁免有名有目', isExempt('docs/gate-ledger.md') && isExempt('docs/archive/x.md')
			&& isExempt('stories/a/15-tables.twee') && isExempt('stories/a/00-meta.twee')
			&& isExempt('scripts/lint-human-face.mjs') && !isExempt('scripts/run-tests.mjs'));
		t('RC① 格一（甲案）：清理面**双箭头残留为零**',
			!cleanLine('// A ⇒ B ⇒ C').includes('⇒') && cleanLine('// 缺 ⇒ 合法').includes('→'));
		t('RC① 格二（甲案）：**箭头不文字化**（因果也保留单箭头，不产出"因此"）',
			!cleanLine('// 兜住 ⇒ 静默跳过').includes('因此') && cleanLine('// 兜住 ⇒ 静默跳过').includes('→'));
		t('RC① 格三（甲案）：引用、映射、演进三态**不被误改**（它们的箭头原样保留）',
			cleanLine('// （完整版与沿革 → dev-conventions-cases.md）').includes('→')
			&& cleanLine('// 裸键 ⇒ ev. 域').includes('→')
			&& !cleanLine('// 裸键 ⇒ ev. 域').includes('因此'));
		t('文档代码块按引文豁免', docBodyLines('正文 ✓\n```\n块内 ✓\n```').every((l) => !l.text.includes('块内')));
		t('V3 全量机械验证：对仓内全部人类面文件逐件跑清理，清理后记号必为 0（非抽查）', (() => {
			let checked = 0;
			for (const face of ['comment', 'docs']) {
				for (const file of listFiles(face)) {
					const rel = relative(ROOT, file);
					const text = readFileSync(file, 'utf8');
					const cleaned = face === 'docs'
						? text.split('\n').map((ln) => stripMarks(cleanLine(ln))).join('\n')
						: cleanSource(text, rel).text;
					const left = scanText(face, cleaned, rel);
					if (left > 0) { console.log(`        （残留 ${left} 处：${rel}）`); return false; }
					checked += 1;
				}
			}
			console.log(`        （逐件验证 ${checked} 件）`);
			return true;
		})());
		if (bad) { console.error(`\n✗ lint:style 自证未通过（${bad} 项）`); process.exit(1); }
		console.log('\n✔ lint:style 自证通过（mask 定位、代码区与模板串不动、豁免有名有目）');
		process.exit(0);
	}

	if (has('stat')) {
		const c = scan('comment'), d = scan('docs');
		console.log(`  注释面命中：${c.stats.comment} 处（${new Set(c.hits.map((h) => h.file)).size} 件）`);
		console.log(`  文档面命中：${d.stats.docs} 处（${new Set(d.hits.map((h) => h.file)).size} 件）`);
		console.log(`  机器面（注释区外记号，不动）：${c.stats.codeMarks} 处`);
		process.exit(0);
	}

	if (has('fix')) {
		const only = val('only', 'both');
		for (const face of (only === 'both' ? ['comment', 'docs'] : [only])) {
			const { files, spots } = fixFace(face);
			console.log(`  清理 ${face} 面：${files} 件、${spots} 处`);
		}
		process.exit(0);
	}

	const c = scan('comment'), d = scan('docs');
	const total = c.stats.comment + d.stats.docs;
	if (total) {
		console.error(`✗ lint:style 未通过：注释面 ${c.stats.comment} 处、文档面 ${d.stats.docs} 处装饰记号`);
		for (const h of [...c.hits, ...d.hits].slice(0, 12)) console.error(`   · ${h.file}:${h.line} ${h.marks.join('')}`);
		if (total > 12) console.error('   · 其余见 npm run lint:style -- --stat');
		console.error('   修：npm run lint:style -- --fix（口径由本脚本定义）');
		process.exit(1);
	}
	console.log('✔ lint:style 通过：注释面与文档面无装饰记号（豁免项见 --stat）');
};

if (process.argv[1] && process.argv[1].endsWith('lint-human-face.mjs')) main();
