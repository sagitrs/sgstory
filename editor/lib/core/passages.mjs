// `#1114` 片 1：**散文层拼装**（md ⇒ twee）——「作者只写 md+json」的拼装半边 ✓
//
// ## 定位（票面 §二，不自行发明形态 ✗）
// 输入：`stories/<slug>/passages/*.md`（一段一文件 ✓ + YAML front-matter ✓）
// 输出：twee 段落文本（拼进构建链——与手写 twee 同形 ⇒ 下游门不感知来源 ✓）
//
// ## 三条硬规则（票面验收 ✓）
// 1. **散文文本逐字保留** ✗（不许静默改写——拼装层不加不减正文字符 ✓）
// 2. `[[标签|目标]]` ⇒ twee 链接（**目标须校验存在** ✓——悬空 ⇒ 点名报错 ✗）
// 3. `{{名字}}` ⇒ 取值展开（**调 core/vocab.mjs 的 `valueTerms`** ✓——单一权威 ✗ 不另算一份 ✗）
//
// ## 禁则（票面 §二③ ✓）
// `FORBIDDEN_BUILTINS`（真源 `test/prose-vocabulary.mjs:35` ✓）⇒ 拼装层**必须拦** ✗；
// 33 个具名动作宏 ⇒ **允许且不判** ✓（与 `#1109` 词汇门口径一致 ✓）。
//
// ## 段序
// 仍由 `00-story.json` 的 `files` 派生 ✗（不许另造顺序 ✓——`#1051`② 单一权威 ✓）。
//
// 浏览器安全 ✓：零宿主 import ✓（core 老规矩 ✓）。

import { valueTerms } from './vocab.mjs';

/** front-matter 解析（`---` 围栏 + YAML 子集：key: value 行 ✓——不引全量 YAML 库 ✗ 最小面 ✓）。 */
export const parseFrontMatter = (text) => {
	const t = String(text ?? '');
	const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
	if (!m) return { meta: {}, body: t };
	const meta = {};
	for (const line of m[1].split('\n')) {
		const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
		if (kv) meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
	}
	return { meta, body: t.slice(m[0].length) };
};

/** 禁则拦截：`FORBIDDEN_BUILTINS` 名出现在 md 正文 ⇒ 报（真源 import ✗ 不复述清单 ✓）。 */
export const forbiddenProblems = ({ name, body, forbidden }) => {
	const out = [];
	for (const m of String(body).matchAll(/<<\s*(\w+)[\s>]/g)) {
		if (forbidden.has(m[1])) out.push(`段「${name}」正文含禁则内建 \`<<${m[1]}>>\`（原始计算出正文 ✗——迁移规则 #1114 片1前置②：状态进 data/、控制流进 rules.json 或拆段 ✓）`);
	}
	return out;
};

/** 悬空引用：`[[标签|目标]]` 的目标不在段落集合 ⇒ 点名 ✗（票面验收 ③ ✓）。 */
export const danglingProblems = ({ name, body, passages }) => {
	const out = [];
	const known = new Set(passages.map((p) => p.name));
	for (const m of String(body).matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/g)) {
		const target = m[2].trim();
		if (!known.has(target)) out.push(`段「${name}」引用 \`[[${m[1]}|${target}]]\` 的目标段落「${target}」不存在（悬空 ⇒ 点名 ✗）`);
	}
	return out;
};

/** 取值展开：`{{名}}` ∈ valueTerms ⇒ twee 占位（运行时由 Game 填充 ✓）；∉ ⇒ 报 ✗（#1048 门侧同判 ✓——拼装层前置拦 ✓）。 */
export const valueRefExpand = ({ name, body, terms }) => {
	const problems = [];
	const out = String(body).replace(/\{\{([^{}\s]+)\}\}/g, (_, n) => {
		if (!terms.has(n)) { problems.push(`段「${name}」取值 \`{{${n}}}\` 未在声明面（valueTerms——contract 值语义 ∪ VALUE_LABELS ✓）`); return `{{${n}}}`; }
		return `<<print_${'V'} ${n}>>`;   // 展开为运行时占位（拼装层不改语义 ✓）
	});
	return { body: out, problems };
};

/** 主拼装：一批 md 段 ⇒ 一份 twee 文本（含 front-matter 元数据行 ✓）。 */
export const assemblePassages = ({ passages, forbidden = new Set(), terms = new Set() }) => {
	const problems = [];
	// 先校验（悬空须看全集 ⇒ 两遍 ✓）
	for (const p of passages) {
		problems.push(...forbiddenProblems({ name: p.name, body: p.body, forbidden }));
		problems.push(...danglingProblems({ name: p.name, body: p.body, passages }));
	}
	// 再展开+拼装（逐字保留散文文本 ✗ 只做 {{}} 替换 ✓）
	const chunks = [];
	for (const p of passages) {
		const { body: expanded, problems: vp } = valueRefExpand({ name: p.name, body: p.body, terms });
		problems.push(...vp);
		const tags = p.tags ? ` [${p.tags}]` : '';
		chunks.push(`:: ${p.name}${tags}\n${expanded}`);
	}
	return { twee: chunks.join('\n\n') + '\n', problems };
};
