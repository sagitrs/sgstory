// 散文正文的**词汇门**（`#1043`）：内容故事的正文里，只许出现「引擎已宣告的宏」——不许作者写逻辑/表达式。
//
// ## 为什么需要它（甲-1 的防退化保证）
// 已裁 **甲-1**：作者只写 MD＋JSON，正文＝Markdown ＋ `[[标签|目标]]`，其余结构出正文。
// 但**今天**引擎仍要求"机制动作只走词汇宏"（`README.md:62` 的机检纪律）——`<<give>>`／`<<note>>`／
// `<<sitecheck>>`／`<<rulelist>>`… 这些宏**是写在正文里的**。⇒ 判据**不能**是"正文不许有宏"（那会与既有
// 纪律冲突、并把面夹具成百处判红）；正确边界是：
//   · **允许**：散文、`[[…]]` 链接、`/% payload: … %/` 标记、**引擎已宣告的宏**（词汇宏）；
//   · **禁止**：SugarCube 内置的**逻辑/表达式**宏（`<<if>>`/`<<else>>`/`<<set>>`/`<<for>>`/`<<run>>`/
//     `<<capture>>`/`<<= …>>`）与**任何引擎未宣告的宏**（含 `<<goto>>`/`<<link>>`：导航该走 `[[…]]`）。
//     ⇒ 那是"**作者在写代码**"，正是甲-1 要根除的形状。
//
// ## 词表的**单一权威**（不另立清单 ✗）
// 词表＝**从 `src/**` 现抽**：`<<widget "name">>` ∪ `Macro.add('name')`（`#1043` 实测 33 个）。
// 引擎加一个宏 ⇒ 门自动认；**永不漂移**（本仓最怕的"两处清单"在这条上不存在）。
//
// ## 边界
// · **只判内容故事**（`audience: content`）；**内部件豁免**（`audience: internal` —— 它们的存在意义就是
//   替引擎面跑通，禁宏会把它们掏空），但会**打印豁免计数**（不静默 ✗）。
// · 只判**散文段落**：`[script]`／`[widget]`／`[stylesheet]` 段落里的宏**不判**（那不是散文）。
// · `/% … %/` 注释（含本仓大量"当初错在哪"的留痕）**剔除**后再判 —— 留痕优先 ✓。
// · `00-meta.twee`（元数据，非散文）不判。
//
// 用法：`node test/prose-vocabulary.mjs` ｜ 自证：`node test/prose-vocabulary.mjs --selftest`

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const STORIES = join(ROOT, 'stories');
const SRC = join(ROOT, 'src');

/** SugarCube 内置里**明确禁止**出现在正文的（逻辑/表达式 ⇒ "作者在写代码"）。 */
export const FORBIDDEN_BUILTINS = new Set(['if', 'elseif', 'else', 'set', 'for', 'run', 'capture', '=']);
/** 允许的 SugarCube 内置（**少而要有理由**）：`back`＝返回上一段，属呈现动作、非逻辑。 */
export const ALLOWED_BUILTINS = new Set(['back']);

/** 从引擎源码抽"词汇表"（`<<widget "x">>` ∪ `Macro.add('x')`）。**纯函数**（便于自证）。 */
export const engineVocab = (sources = []) => {
	const out = new Set();
	for (const text of sources) {
		for (const m of text.matchAll(/<<widget\s+"([A-Za-z0-9_-]+)"/g)) out.add(m[1]);
		for (const m of text.matchAll(/Macro\.add\(\s*'([A-Za-z0-9_-]+)'/g)) out.add(m[1]);
	}
	return out;
};

/** 递归收集某目录下所有 `.twee`（引擎源码面）。 */
const tweeUnder = (dir, acc = []) => {
	if (!existsSync(dir)) return acc;
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, name.name);
		if (name.isDirectory()) tweeUnder(p, acc);
		else if (name.name.endsWith('.twee')) acc.push(p);
	}
	return acc;
};

/** 解析一份 twee 的段落：`:: 名 [tags] {meta}` ⇒ {name, tags, bodyLines:[{text, line}]}。**纯函数**。 */
export const parsePassages = (text) => {
	const lines = String(text).split('\n');
	const heads = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^::\s+(.+?)\s*(?:\[([^\]]*)\])?\s*(?:\{.*\})?\s*$/);
		if (m) heads.push({ i, name: m[1].trim(), tags: (m[2] ?? '').split(/\s+/).filter(Boolean) });
	}
	return heads.map((h, k) => ({
		name: h.name,
		tags: h.tags,
		line: h.i + 1,
		bodyLines: lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : lines.length)
			.map((text, j) => ({ text, line: h.i + 2 + j })),
	}));
};

/** 剔除 `/% … %/` 注释跨度（**跨行**也要吃）——但保留 `/% payload: … %/` 标记原样（它是"标记"，不是留痕）。 */
export const stripCommentSpans = (bodyLines) => {
	const out = [];
	let inComment = false;
	for (const { text, line } of bodyLines) {
		let t = text;
		// payload 标记是单行构造 ⇒ 先摘出来（它内部不可能有宏，直接整体当"已允许"）
		if (/%\s*payload:/.test(t) && /%\/\s*$/.test(t.trim())) { out.push({ text: '', line }); continue; }
		let res = '';
		let i = 0;
		while (i < t.length) {
			if (inComment) {
				const end = t.indexOf('%/', i);
				if (end === -1) { i = t.length; break; }
				inComment = false; i = end + 2;
			} else {
				const start = t.indexOf('/%', i);
				if (start === -1) { res += t.slice(i); break; }
				res += t.slice(i, start);
				const end = t.indexOf('%/', start + 2);
				if (end === -1) { inComment = true; break; }
				i = end + 2;
			}
		}
		out.push({ text: res, line });
	}
	return out;
};

/**
 * 判据（**纯函数**）：给定内容故事的散文文件 → 问题列表。
 * @param {{slug:string, files:{path:string,text:string}[], vocab:Set<string>}} args
 */
export const proseVocabProblems = ({ slug, files, vocab }) => {
	const out = [];
	for (const f of files) {
		for (const p of parsePassages(f.text)) {
			const isProse = !p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
			if (!isProse) continue;
			for (const { text, line } of stripCommentSpans(p.bodyLines)) {
				for (const m of text.matchAll(/<<(-?[A-Za-z=!][A-Za-z0-9_-]*)/g)) {
					const name = m[1];
					if (FORBIDDEN_BUILTINS.has(name)) {
						out.push({ code: 'V1', file: f.path, line, macro: name, msg: `${f.path}:${line} 正文里出现**逻辑/表达式**宏 \`<<${name}>>\`（段落「${p.name}」）—— 作者不写代码（甲-1）；机制动作请走**词汇宏**或**声明表**` });
						continue;
					}
					if (ALLOWED_BUILTINS.has(name)) continue;
					if (vocab.has(name)) continue;
					out.push({ code: 'V2', file: f.path, line, macro: name, msg: `${f.path}:${line} 正文里出现**引擎未宣告**的宏 \`<<${name}>>\`（段落「${p.name}」）—— 未登记＝不可审；要新增词汇宏 ⇒ 在引擎宣告（\`<<widget>>\`／\`Macro.add\`）＋ 票内说明理由` });
				}
			}
		}
	}
	return out;
};

// ── 自证（纯合成输入，不碰真磁盘）────────────────────────────────────────
const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	const vocab = engineVocab(['<<widget "give">>', "<<widget \"note\">>", "Macro.add('ending', {", "Macro.add('rulelist', {"]);
	t('词表抽取：widget ∪ Macro.add ⇒ 4 个', vocab.size === 4 && vocab.has('give') && vocab.has('ending'));

	const mk = (body) => [{ path: 'stories/demo/10-x.twee', text: `:: 开场 [prose]\n${body}\n` }];

	t('正例：散文＋链接＋词汇宏＋back ⇒ 0 问题',
		proseVocabProblems({ slug: 'demo', vocab, files: mk('河在夜里不出声。\n[[上船|船头]]\n<<give "坏哨">>\n<<ending "抵岸" final>>\n<<back "回开场">>') }).length === 0);
	t('反例：`<<set>>` ⇒ V1 且点名',
		(proseVocabProblems({ slug: 'demo', vocab, files: mk('<<set $x to 1>>') })[0]?.code) === 'V1');
	t('反例：`<<if>>` ⇒ V1', (proseVocabProblems({ slug: 'demo', vocab, files: mk('<<if $x>>嗯<</if>>') })[0]?.code) === 'V1');
	t('反例：表达式宏 `<<= … >>` ⇒ V1', (proseVocabProblems({ slug: 'demo', vocab, files: mk("<<= window.Sg.Codex?.render?.() ?? 'x' >>") })[0]?.code) === 'V1');
	t('反例：引擎**未宣告**的宏（`<<goto>>`）⇒ V2', (proseVocabProblems({ slug: 'demo', vocab, files: mk('<<goto "船头">>') })[0]?.code) === 'V2');
	t('正例：注释里的 `<<if>>` **不判**（剔注释／留痕优先）',
		proseVocabProblems({ slug: 'demo', vocab, files: mk('/% 当初写成 <<if $x>> ⇒ 错在哪… %/') }).length === 0);
	t('正例：**跨行注释**里的宏不判',
		proseVocabProblems({ slug: 'demo', vocab, files: mk('/% 第一行\n   <<set $x to 1>> 第二行 %/\n正文') }).length === 0);
	t('正例：`/% payload: … %/` 标记不报', proseVocabProblems({ slug: 'demo', vocab, files: mk('/% payload: 信息|选择 %/\n正文') }).length === 0);
	t('正例：`[script]` 段落里的宏**不判**（非散文）',
		proseVocabProblems({ slug: 'demo', vocab, files: [{ path: 'p.twee', text: ':: StoryHooks [script]\nwindow.Sg ??= {};\n<<set $x to 1>>\n' }] }).length === 0);
	t('反例：`[widget]` 段落**不判**（同上）',
		proseVocabProblems({ slug: 'demo', vocab, files: [{ path: 'p.twee', text: ':: W [widget]\n<<widget "z">><<set $x to 1>><</widget>>\n' }] }).length === 0);
	t('边界：正文里**没有宏** ⇒ 0 问题', proseVocabProblems({ slug: 'demo', vocab, files: mk('只有散文。') }).length === 0);

	if (bad) { console.error(`\n✗ 词汇门自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（词汇抽取 ＋ 允许面 ＋ 逻辑/表达式/未宣告三类反例 ＋ 注释/段落豁免）');
	process.exit(0);
};

if (process.argv.includes('--selftest')) selftest();

// ── 真实树检查 ──────────────────────────────────────────────────────────
const vocab = engineVocab(tweeUnder(SRC).map((p) => readFileSync(p, 'utf8')));
const stories = existsSync(STORIES) ? readdirSync(STORIES).filter((d) => existsSync(join(STORIES, d, '00-story.json'))).sort() : [];
let problems = [];
let exempt = [];
const judgedSlugs = [];
for (const slug of stories) {
	const story = JSON.parse(readFileSync(join(STORIES, slug, '00-story.json'), 'utf8'));
	const files = readdirSync(join(STORIES, slug))
		.filter((f) => f.endsWith('.twee') && f !== '00-meta.twee')
		.map((f) => ({ path: `stories/${slug}/${f}`, text: readFileSync(join(STORIES, slug, f), 'utf8') }))
		.filter((f) => !/^\s*\/\/\s*@generated/m.test(f.text.split('\n').slice(0, 3).join('\n')));   // 生成物不在本门射程
	// ⚠️ **缺 `audience` ⇒ 按 content 判**（不静默放过）：`audience` 由 `#1035` 显式声明引入；
	//   缺字段时若按"豁免"处理，本门在 `#1035` 落地前会**成为空判**（正是本仓最忌讳的形态 ✗）。
	const judged = story.audience !== 'internal';
	if (judged) { judgedSlugs.push(slug); problems = problems.concat(proseVocabProblems({ slug, files, vocab })); }
	else exempt.push(slug);
}
// **空判守卫**：一个受判故事都没有 ⇒ 本门什么都没量 ⇒ 必须红（不许"零对象＝通过" ✗）
if (judgedSlugs.length === 0) {
	console.error('✗ 散文词汇门是**空判**：没有任何内容故事受判（受判故事数 = 0）—— 检查 `audience` 是否缺失/被误标为 internal');
	process.exit(1);
}
console.log(`词汇表（引擎宣告，现抽）：${vocab.size} 个 ｜ 受判故事 ${judgedSlugs.length} 个（${judgedSlugs.join('、') || '无'}）｜ 内部件豁免 ${exempt.length} 个（${exempt.join('、') || '无'}）`);
if (problems.length) {
	console.error(`✗ 散文词汇门未通过 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	process.exit(1);
}
console.log('✔ 散文词汇门通过（内容故事正文只含：散文／链接／payload 标记／引擎已宣告的词汇宏）');
