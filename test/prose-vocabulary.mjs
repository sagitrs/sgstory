// 散文正文的**词汇门**（`#1043`）：内容故事的正文里，只许出现「引擎已宣告的宏」——不许作者写逻辑/表达式。
//
// ## 为什么需要它（甲-1 的防退化保证）
// 已裁 **甲-1**：作者只写 MD＋JSON，正文＝Markdown ＋ `[[标签|目标]]`，其余结构出正文。
// 但**今天**引擎仍要求"机制动作只走词汇宏"（`README.md:62` 的机检纪律）——`<<give>>`／`<<note>>`／
// `<<sitecheck>>`／`<<rulelist>>`… 这些宏**是写在正文里的**。→ 判据**不能**是"正文不许有宏"（那会与既有
// 纪律冲突、并把面夹具成百处判红）；正确边界是：
// · **允许**：散文、`[[…]]` 链接、`/% payload: … %/` 标记、**引擎已宣告的宏**（词汇宏）；
// · **禁止**：SugarCube 内置的**逻辑/表达式**宏（`<<if>>`/`<<else>>`/`<<set>>`/`<<for>>`/`<<run>>`/
// `<<capture>>`/`<<= …>>`）与**任何引擎未宣告的宏**（含 `<<goto>>`/`<<link>>`：导航该走 `[[…]]`）。
// → 那是"**作者在写代码**"，正是甲-1 要根除的形状。
//
// ## 词表的**单一权威**（不另立清单）
// 词表＝**从 `src/**` 现抽**：`<<widget "name">>` ∪ `Macro.add('name')`（`#1043` 实测 33 个）。
// 引擎加一个宏 → 门自动认；**永不漂移**（本仓最怕的"两处清单"在这条上不存在）。
//
// ## 边界
// · **只判内容故事**（`audience: content`）；**内部件豁免**（`audience: internal` —— 它们的存在意义就是
// 替引擎面跑通，禁宏会把它们掏空），但会**打印豁免计数**（不静默）。
// · 只判**散文段落**：`[script]`／`[widget]`／`[stylesheet]` 段落里的宏**不判**（那不是散文）。
// · `/% … %/` 注释（含本仓大量"当初错在哪"的留痕）**剔除**后再判 —— 留痕优先。
// · **元数据件不判**（`#1051`②：判据由**文件名字面量**改为**内容谓词**）——判据＝含 `:: StoryData` 段落
//（实测：全仓只有各故事的 `00-meta.twee` 命中，正文件零命中 → 等价且不靠名字）。
// · **故事件以 `00-story.json` 的 `files` 为准**（单一权威）；**在树上却不在清单里** → **不静默**（报）。
// · **未跟踪件** → 提醒（照 `#1089`／`#1045`／`#1046` 同款 —— 与另两件的枚举口径同步）。
//
// 用法：`node test/prose-vocabulary.mjs` ｜ 自证：`node test/prose-vocabulary.mjs --selftest`

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STORIES_DIR, storySlugs, absPath } from '../scripts/dist-paths.mjs';   // `#1267`
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';                       // `#1051`②：枚举改走 `git ls-files`（已入库面）
import { untrackedScannedProblems, isTransientFixture } from '../scripts/lib/untracked-guard.mjs';
import { isGeneratedFamily } from '../editor/lib/core/generated-family.mjs';   // `#1185`：家族谓词单一权威 // `#1089` 共用助手（不另造形态）
import { maskComments } from '../editor/lib/core/mask.mjs';   // `#1048`：{{}} 判据先剥注释（留痕不罚）

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
// `#1267` 尾件①：故事根走口（仓内恒等）。
const STORIES = STORIES_DIR;
const SRC = join(ROOT, 'src');

/** 允许的 SugarCube 内置（**少而要有理由**）：`back`＝返回上一段，属呈现动作、非逻辑。 */
export const ALLOWED_BUILTINS = new Set(['back']);

/** 从引擎源码抽"词汇表"（`<<widget "x">>` ∪ `Macro.add('x')`）。**纯函数**（便于自证）。 */

/** `#1048`：**取值词汇命名空间**（裁定甲-1：两源并集 ——领队评论 5755635491）。
 * ① contract 成员 ∩ 值语义 kind（const/state-ref/identity-string ——容器/空/null/查表默认排除）
 * ② 引擎派生标签（VALUE_LABELS 常量表）
 *注意：**单一权威**：#1114 拼装层**消费同一函数**（不许各算一份 ——门放行/拼装不认 → 静默漏值）。 */
import { VALUE_KINDS, valueTerms } from '../editor/lib/core/vocab.mjs';
// `#1114` 片 2b-2a：**散文层源**（`passages/*.md`）的 front-matter 解析走**拼装层同一权威**
//（不另写一份 YAML 子集 —— 两处解析器就是两处真相）。
import { parseFrontMatter, duplicateProblems, passagesOf, parseTweePassages } from '../editor/lib/core/passages.mjs';
// `#1114` 片 2b-2a：**源面谓词走单一权威**（评审阻断：本件原先自带一份逐字相同的副本 → 两份可漂）。
// → 定义处只在 `scripts/module-order.mjs`（`allSourceFiles()` 也在那儿）；本件只 **import**。
import { isStoryPassageMd } from '../scripts/module-order.mjs';
// `#1114` 片 2b-2b-0：**禁则内建**与**引擎标签抽取**也改走单一权威
// —— 原先两者都定义在本件（test 件）→ 而拼装层（core）**必须**用同一份：
// 若拼装自己复述一份，则“门禁得住、拼装放过去”（或反过来）→ **两处清单**（本仓反复撞过）。
import { FORBIDDEN_BUILTINS } from '../editor/lib/core/passages.mjs';
import { engineLabels } from '../editor/lib/core/vocab.mjs';
export { VALUE_KINDS, valueTerms, FORBIDDEN_BUILTINS, engineLabels };
/** `#1048`：扫全 `src/**` 的 `*Label` 键形态（注意：今日恰 3 处=真 pc 字段；将来非 pc 的 `fooLabel:` 也会被对账——口径如实）。对账：未登记 VALUE_LABELS → 红。**纯函数**。 */
export const pcLabelFields = (sources = []) => {
	const out = new Set();
	for (const text of sources) {
		for (const m of String(text).matchAll(/(\w+Label)\s*:/g)) out.add(m[1]);
	}
	return [...out].sort();
};

/** `#1048`：{{名字}} 判据 —— 未声明即红＋替换建议（候选最近名）。**纯函数**。 */
/** `#1350`：**声明面按故事形态分派** —— 改制面（有 `data/passages.json`）的声明面是**段 `params` ＋ `links[].slot`**，
 *  旧形态的声明面是 `contract 值语义 ∪ VALUE_LABELS`。
 * ★ 为什么必须分派：不分派 ⇒ 改制面故事会被**整片判红**（实测：靶 `pilot-new` 报 3 项 `V1 未声明的取值名 ${提醒}` ✗）。
 * **向后兼容**：不传 `faceTerms` 时行为与旧版**逐字相同** ✓（旧调用点不动 ✓）。 */
export const valueRefProblems = ({ files = [], terms = new Set(), faceTerms = null } = {}) => {
	const out = [];
	for (const f of files) {
		const text = maskComments(f.text ?? '', { file: f.path, twee: false });
		for (const m of text.matchAll(/\{\{([^{}\s]+)\}\}/g)) {
			const name = m[1];
			// 改制面：先看**段面**声明（params/slot），命中即放行 ✓；未命中再落回旧面 ⇒ 两面对同一名字**取并集** ✓
			if (faceTerms && faceTerms.has(name)) continue;
			if (terms.has(name)) continue;
			// 最近候选（编辑距离粗版：共同前缀最长者）
			let best = '', bl = -1;
			for (const t of terms) {
				let l = 0; while (l < name.length && l < t.length && name[l] === t[l]) l++;
				if (l > bl) { bl = l; best = t; }
			}
			out.push({ code: 'V1', path: f.path, name, hint: best
				? `未声明的取值名 \`\${${name}}\` —— 最近候选 \`\${${best}}\`（若为此意请改用）；若是容器/状态变更 ⇒ 走具名动作宏或 data/*.json，不放正文（#1036 甲）`
				: `未声明的取值名 \`\${${name}}\` —— 取值名须在声明面（contract 值语义成员 ∪ VALUE_LABELS；#1048）` });
		}
	}
	return out;
};
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

/** `#1114` 片 2b-2a：段落**源**（`.twee` ∪ `stories/<slug>/passages/` 下的 `.md`）的枚举。
 * 为什么要它：故事面原先只看**顶层 `.twee`**（`readdirSync(<故事目录>)`）→ `passages/` 子目录里的 md
 * 会变成「在树上却不在门面上」的**静默盲区**（本仓最忌讳的形态）。
 *注意：仍**只收故事目录下 `passages/` 里的 md**（谓词 `isStoryPassageMd` 从 `scripts/module-order.mjs` **import**
 * ——“收什么”只在一处决定；与 `allSourceFiles()` 同口径）。
 * → 调用点**不必**再按扩展名过滤（本件下游只在“读得进读不进”上分派解析器）。
 * 非源 md（故事目录顶层的会话记录／`gates/` 门证据）不进面。 */
const sourcesUnder = (dir, acc = []) => {
	if (!existsSync(dir)) return acc;
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, name.name);
		if (name.isDirectory()) { if (!/^(node_modules|\.)/.test(name.name)) sourcesUnder(p, acc); continue; }
		if (name.name.endsWith('.twee') || name.name.endsWith('.md')) acc.push(p);
	}
	return acc;
};

/** `#1114` 片 2b-2b-0b：twee 段解析**走 core 单一权威**（原先本件自带一份同形实现 —— 两份口径必漂）。 */
export const parsePassages = parseTweePassages;

/** 剔除 `/% … %/` 注释跨度（**跨行**也要吃）——但保留 `/% payload: … %/` 标记原样（它是"标记"，不是留痕）。 */
export const stripCommentSpans = (bodyLines) => {
	const out = [];
	let inComment = false;
	for (const { text, line } of bodyLines) {
		let t = text;
		// payload 标记是单行构造 → 先摘出来（它内部不可能有宏，直接整体当"已允许"）
		if (/%\s*payload:/.test(t) && /%\/\s*$/.test(t.trim())) { out.push({ text: '', line}); continue;}
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
		// `#1114` 片 2b-2a：**按扩展名分派解析器** ——判据体（下两档）**两路共用**。
		//注意：不分派的后果是"**假绿**"：md 进 twee 解析器 → 解析出空 → 不报错也不判 → 看着像扫过了
		//（这正是本片要堵的那个缺口 —— 与"零命中≠已覆盖"同族）。
		const passages = passagesOf(f.text, f.path);
		for (const p of passages) {
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

// ── `#1234`／`#1350`：**改制面**（`data/passages.json` 存在的故事）的四条判据 ──────────
// **面（必须机械可判）**：`面 ＝ { s ｜ storySlugs() 里有 s 且 `<s>/data/passages.json` 存在 }`。
//注意：**"不在面内" ≠ "下架/欠账"** —— 旧形态故事按定义**不在面内**（**阶段未到** ✗ 不是欠账 ✗ 不是豁免）⇒ 用**存在性**定面。
// 四条（锚名权威＝`#1234` 冻结 schema）：P1 零链接／P2 零表达式／P3 入参声明齐全＋撞名／P4 无悬空＋必填实参。
/** **纯函数**：给定一个改制面故事的数据面与散文件 ⇒ 问题列表。 */
export const passagesFaceProblems = ({ slug, data = {}, files = [] } = {}) => {
	const out = [];
	const keys = new Set(Object.keys(data));
	const seg = (n) => data[n] ?? {};
	// ── 数据面：P4 无悬空 ＋ 必填实参（args × 目标段 params）
	const reqNames = (n) => Object.entries(seg(n).params ?? {})
		.filter(([, d]) => d && d.required === true).map(([k]) => k);
	const slotNames = (n) => new Set((seg(n).links ?? []).map((l) => l.slot).filter(Boolean));
	for (const name of keys) {
		const s0 = seg(name);
		const params = s0.params ?? {};
		// P3（撞名）：`slot` 与 `params` **同一 `{{}}` 命名空间** ⇒ 撞名则红（**换维**：命名冲突 ≠ 缺值）
		for (const sl of slotNames(name))
			if (Object.prototype.hasOwnProperty.call(params, sl))
				out.push({ code: 'P3', msg: `${slug}：段「${name}」的 \`links[].slot\` 名 \`${sl}\` 与**同段 \`params\`** 撞名（同一 \`{{}}\` 命名空间 ✗）—— 改其中一个名` });
		for (const l of s0.links ?? []) {
			const to = l?.to;
			if (typeof to !== 'string' || !keys.has(to)) {
				out.push({ code: 'P4', msg: `${slug}：段「${name}」的链接 \`${l?.label ?? '?'}\`（id=${l?.id ?? '—'}）指向**不存在的段** \`${to ?? '?'}\`（\`links[].to\` 必须落在 \`passages.json\` 的键集合里）` });
				continue;
			}
			const given = new Set(Object.keys(l.args ?? {}));
			const miss = reqNames(to).filter((k) => !given.has(k));
			if (miss.length)
				out.push({ code: 'P4', msg: `${slug}：段「${name}」→「${to}」的 \`args\` 缺**必填**入参 \`${miss.join('、')}\`（目标段 \`params\` 声明 required；给了的：${[...given].join('、') || '无'}）` });
		}
	}
	// ── 正文面：P1 零链接／P2 零表达式／P3 入参声明齐全
	for (const f of files) {
		for (const p of passagesOf(f.text, f.path)) {
			if (p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t))) continue;
			const params = seg(p.name).params ?? {};
			const slots = slotNames(p.name);
			for (const { text, line } of stripCommentSpans(p.bodyLines)) {
				if (/\[\[/.test(text))
					out.push({ code: 'P1', msg: `${f.path}:${line} 正文里出现**链接** \`[[…]]\`（段落「${p.name}」）—— 改制后**链接一律进 \`links[]\`**（散文＝纯模板 ✗ 零链接）` });
				if (/\{\{=/.test(text))
					out.push({ code: 'P2', msg: `${f.path}:${line} 正文里出现**表达式占位** \`{{= …}}\`（段落「${p.name}」）—— \`{{}}\` 只许**入参名**（值由调用处传入 ✗ 不许现算）` });
				// ★ `#1409`（P5）：**散文里"反引号包宏" ⇒ 点名** —— SugarCube 的反引号是**代码**标记 ⇒ 会**真执行**
				//   （作者语义是"提及"、引擎语义是"执行" ✗ ⇒ 同形不同义）。实测病灶：散文写反引号包 `<<damage>>` ⇒
				//   宏以**空参执行** ⇒ `Math.max(0, hp - undefined)` ⇒ **NaN**（静默数值坏 ✗）
				for (const m of text.matchAll(/`[^`]*<<\s*[A-Za-z][^>]*>>[^`]*`/g)) {
					out.push({ code: 'P5', msg: `${f.path}:${line} 正文里出现**反引号包着的宏**（${m[0].slice(0, 40)}…）—— 反引号是 SugarCube 的**代码标记 ⇒ 会真执行**（✗ 不是"提及"）⇒ 去掉反引号，或用转义写法把它当纯文本 ` });
				}
				for (const m of text.matchAll(/\{\{\s*([^}=][^}]*?)\s*\}\}/g)) {
					const nm = m[1];
					if (Object.prototype.hasOwnProperty.call(params, nm) || slots.has(nm)) continue;
					out.push({ code: 'P3', msg: `${f.path}:${line} 正文占位 \`{{${nm}}}\`（段落「${p.name}」）**未在本段 \`params\` 声明**，也不是本段 \`links[].slot\` 名 ⇒ 取不到值` });
				}
			}
		}
	}
	return out;
};

// ── 自证（纯合成输入，不碰真磁盘）────────────────────────────────────────
// ── `#1051`②：**可注入纯函数**（㊱：攻击面落在判据上，不落现实 —— 自证喂入参即可判）──────────
/** **在树上却不在清单里**的故事件（`00-story.json` 的 `files` 为准）。注意：本票的由来：`00-meta2.twee`
 * 这类**下一代名**在旧口径下会被当**正文**判 → 这里改成**出声**（报）而不是静默排除。 */
/** `#1114` 片 2b-2a：段落**源**的枚举面 —— `.twee` ∪ `passages/` 下的 `.md`。
 *注意：原先这里硬编码 `.twee` → 调用方把 md 递进来也会**被本函数静默滤掉**（两处口径各写一遍＝漂移源）；
 * 现改为**与 `allSourceFiles()`／本门其余部分同口径**（只额外放行 `passages/` 下的 md）。
 * 边界不变：非 `passages/` 的未登记件（如故事目录顶层的 `README.md`）仍**不归本门**。 */
export const undeclaredStoryFiles = ({ declared = [], onDisk = [] } = {}) =>
	onDisk.filter((p) => (p.endsWith('.twee') || isStoryPassageMd(p)) && !declared.includes(p));

/** **元数据件谓词**（`#1051`②：由**文件名字面量**改为**内容谓词**）。判据＝含 `:: StoryData` 段落
 *（Twine 的元数据段落，按定义不是散文；实测全仓只有各故事的 `00-meta.twee` 命中 正文件零命中）。
 *注意：**边界（抓不到什么）**：正文件若含 `:: StoryData` 段 → 谓词同样命中 → **整件被当元数据放过**（本仓现无此形态 → 属潜伏面，结构性替代＝显式清单口径）。 */
export const isMetadataTwee = (text) => /^::\s*StoryData/m.test(String(text ?? ''));

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

	// `#1051`②：**枚举口径**（成对 —— 改前/改后行为都要能判）
	t('🔴 枚举：`00-meta2.twee` 在树上、不在清单 ⇒ **报**（旧口径会把它当**正文**判 ✗）',
		undeclaredStoryFiles({ declared: ['stories/x/00-meta.twee'], onDisk: ['stories/x/00-meta.twee', 'stories/x/00-meta2.twee'] }).length === 1);
	t('枚举·正例：全在清单里 ⇒ **不报**（不误咬 ✓）',
		undeclaredStoryFiles({ declared: ['stories/x/a.twee'], onDisk: ['stories/x/a.twee'] }).length === 0);
	t('🔴 #1048 反例：未声明取值名 {{foo}} ⇒ 报 V1 且含替换建议（最近候选）', valueRefProblems({ files: [{ path: 'x.twee', text: '见 {{foo}}' }], terms: new Set(['hasChargen', 'fooBar']) }).some((x) => x.code === 'V1' && x.hint.includes('fooBar'))),
	// `#1350`：**声明面按故事形态分派**（改制面 ＝ 段 `params`/`slot`）
	t('🔴 分派·面命中：`{{提醒}}` 在段面声明里 ⇒ **不报**（旧面没有它 ⇒ 若不分派就会整片判红 ✗）',
		valueRefProblems({ files: [{ path: 'x.md', text: '见 {{提醒}}' }], terms: new Set(['别的']), faceTerms: new Set(['提醒']) }).length === 0);
	t('🔴 分派·面未命中：`{{陌生名}}` 既不在段面也不在旧面 ⇒ **仍报 V1**（✗ 不是"分派＝放行一切"）',
		valueRefProblems({ files: [{ path: 'x.md', text: '见 {{陌生名}}' }], terms: new Set(['别的']), faceTerms: new Set(['提醒']) }).some((q) => q.code === 'V1' && q.name === '陌生名'));
	t('分派·**向后兼容**：不传 `faceTerms` ⇒ 行为与旧版一致（`{{提醒}}` 不在 terms ⇒ 报 V1 ✓）',
		valueRefProblems({ files: [{ path: 'x.md', text: '见 {{提醒}}' }], terms: new Set(['别的']) }).length === 1);
	t('#1048 正例：已声明取值名 ⇒ 不报', valueRefProblems({ files: [{ path: 'x.twee', text: '见 {{hasChargen}}' }], terms: new Set(['hasChargen']) }).length === 0),
	t('#1048 边界：注释跨度里的 {{}} ⇒ 剥注释不罚（留痕优先）', valueRefProblems({ files: [{ path: 'x.twee', text: '/* 历史 {{oldName}} */' }], terms: new Set() }).length === 0),
	t('#1048：valueTerms 并集（值语义 kind ∪ labels）', (() => { const t1 = valueTerms({ contract: { members: [{ name: 'a', kind: 'const' }, { name: 'b', kind: 'empty-object' }] }, labels: ['classLabel'] }); return t1.has('a') && t1.has('classLabel') && !t1.has('b'); })()),
	// ── `#1114` 片 2b-2a：**散文层源**（`passages/` 下的 `.md`）进判据面 ────────────────
	// 三格能假：禁则红 ／具名动作宏不红 ／未宣告宏红；另一格：**跟源同名段**必报。
	t('🔴 md 源·反例：md 正文含 `<<set>>` ⇒ **V1**（判据体与 twee 路**共用** ✓）',
		(proseVocabProblems({ slug: 'demo', vocab, files: [{ path: 'stories/demo/passages/0-a.md', text: '---\npassage: 开场\n---\n门是虚掩的。\n<<set $x to 1>>\n' }] })[0]?.code) === 'V1');
	t('🔴 md 源·正例（能假的另一半）：md 正文的**具名动作宏** ⇒ **不红** ✓',
		proseVocabProblems({ slug: 'demo', vocab, files: [{ path: 'stories/demo/passages/0-a.md', text: '---\npassage: 开场\n---\n正文 <<give "坏哨">> 完。\n' }] }).length === 0);
	t('🔴 md 源·反例：md 正文的**未宣告宏** ⇒ **V2**（不分派会成“假绿”：twee 解析器把 md 解成空 ⇒ 看着像扫过 ✓）',
		(proseVocabProblems({ slug: 'demo', vocab, files: [{ path: 'stories/demo/passages/0-a.md', text: '---\npassage: 开场\n---\n<<nonexistent>>\n' }] })[0]?.code) === 'V2');
	t('md 源·front-matter：`passage` ⇒ 段名、`tags` ⇒ tag 面（与拼装层同一权威解析 ✓）',
		(() => { const p = passagesOf('---\npassage: 酒馆\ntags: prose\nscope_of: x\n---\n正文\n', 'stories/x/passages/p.md')[0]; return p.name === '酒馆' && p.tags.includes('prose') && p.bodyLines[0].text === '正文'; })());
	t('🔴 跟源同名段（md ＋ twee 各写一份）⇒ **报且点名两处** ✗（“改了 md 没改 twee”的静默分叉 ✓）',
		(() => { const r = duplicateProblems({ passages: [{ name: '开场', path: 'stories/x/passages/0-开场.md' }, { name: '开场', path: 'stories/x/10-fixture.twee' }] }); return r.length === 1 && r[0].includes('0-开场.md') && r[0].includes('10-fixture.twee'); })());
	t('🔴 枚举·新面：**未登记**的 `passages/*.md` 在树上 ⇒ **报**（旧口径对 md 隐形 ✗）',
		undeclaredStoryFiles({ declared: [], onDisk: ['stories/x/passages/0-a.md'] }).length === 1);
	// `#1114` 2b-2a：**谓词单一权威** ＋ **锚住故事目录**（两个格，均为评审阻断项的能假面）
	t('🔴 谓词**全仓只有一处定义**（两份逐字相同的副本会漂 ✗ ⇒ 谁再复制一份就必须红 ✓）',
		//注意：检查串必须**拆开写**（写成整串会命中它**自己** → 格恒红 → 与恒真格同族的自指陷阱）；
		// 而“只查本件”不够（副本可能被放到别处）→ 扫**两处候选**计数 == 1。
		(() => {
			const DEF = 'export const isStory' + 'PassageMd';
			const files = ['scripts/module-order.mjs', 'test/prose-vocabulary.mjs'];
			const n = files.reduce((acc, p) => acc + readFileSync(join(ROOT, p), 'utf8').split(DEF).length - 1, 0);
			return n === 1 && isStoryPassageMd('stories/x/passages/a.md') === true;
		})());
	t('🔴 谓词**锚住故事目录**（三态）：`src/passages/x.md` ⇒ **不得**被当故事段落源 ✗（旧宽口径会误收 ⇒ 源面污染 ✓）',
		isStoryPassageMd('src/passages/x.md') === false
		&& isStoryPassageMd('stories/x/notes.md') === false
		&& isStoryPassageMd('stories/x/passages/a.md') === true);
	t('🔴 #1048 反例：pc 有 Label 字段但 VALUE_LABELS 未登记 ⇒ 报 V2（对账能假）', pcLabelFields(['x: "", newLabel: ""']).includes('newLabel') && !engineLabels(['VALUE_LABELS: Object.freeze([\'classLabel\'])']).includes('newLabel')),
	t('枚举·边界：故事目录顶层的**非源** md（如 `README.md`）⇒ 不归本门 ✓（`#1114` 2b-2a：只有 `passages/` 下的 md 是源 ✓）',
		undeclaredStoryFiles({ declared: [], onDisk: ['stories/x/README.md'] }).length === 0);
	t('🔴 元数据件：含 `:: StoryData` ⇒ **判为元数据**（不判 ✓）', isMetadataTwee(':: StoryTitle\n夜渡\n\n:: StoryData\n{}') === true);
	t('🔴 元数据件·**能假的另一半**：正经正文（哪怕含宏）⇒ **不是**元数据 ⇒ 照判 ✓',
		isMetadataTwee(':: 渡口\n<<set $x to 1>>\n') === false);
	t('🔴 未跟踪提醒：落在扫描面且未豁免 ⇒ **出声**（不静默 ✗）',
		untrackedScannedProblems({ untracked: ['src/99-new.twee'], isScanned: (f) => f.endsWith('.twee') }).problems.length === 1);
	t('未跟踪·临时夹具 ⇒ **不算"忘了 add"**（并发段运行期自造 ✓ 不误咬 ✓）',
		untrackedScannedProblems({ untracked: ['stories/x/__e2e.twee'], isScanned: (f) => f.endsWith('.twee') }).problems.length === 0);
	// ── `#1234`／`#1350`：**改制面四条 ＋ 三格能假**（✗ 三格红形态各不相同）────────
	// 说明：本组是**纯函数**自证（`passagesFaceProblems` 喂合成输入 ⇒ 不碰真磁盘、✗ 不依赖靶能否 build ✓）
	{
		const SEG = { name: '门厅', path: 'stories/demo/passages/01-门厅.md' };
		const mkP = (body) => [{ path: SEG.path, text: `---\npassage: 门厅\ntags: []\n---\n${body}\n` }];
		// ★ 合成输入必须用**真形态**（`passages/` 下的 md ＝ `---` 围栏 front-matter 一段一文件）——
		//   我第一版漏了围栏 ⇒ md 走 twee 解析器 ⇒ 段名变成**文件名** ⇒ 「未在本段 params 声明」的**假红** ✗
		//   （教训同族：**自证喂的合成输入也要与真形态同形**，否则格的结论指向它自己 ✗）
		const D = (o = {}) => ({ 门厅: { params: {}, links: [], present: '菜单', prio: 1, prereq: [], ...o } });
		// P1 零链接
		t('🔴 改制面·P1 反例：正文含 `[[标签|目标]]` ⇒ **P1**（链接一律进 `links[]`）',
			passagesFaceProblems({ slug: 'd', data: D(), files: mkP('河边。\n[[上船|船头]]') }).some((q) => q.code === 'P1'));
		t('改制面·P1 正例（能假的另一半）：正文无链接 ⇒ 无 P1 ✓',
			!passagesFaceProblems({ slug: 'd', data: D(), files: mkP('河边。') }).some((q) => q.code === 'P1'));
		// P2 零表达式
		t('🔴 改制面·P2 反例：正文含 `{{= 1+1}}` ⇒ **P2**（`{{}}` 只许入参名）',
			passagesFaceProblems({ slug: 'd', data: D(), files: mkP('值＝{{= 1+1}}') }).some((q) => q.code === 'P2'));
		// ★ `#1409`·P5：**反引号包宏 ⇒ 会真执行**（✗ 不是"提及"）
		t('🔴 改制面·P5 反例：正文含反引号包 `<<damage>>` ⇒ **P5**（SugarCube 会真执行它 ✗）',
			passagesFaceProblems({ slug: 'd', data: D(), files: mkP('（用 `<<damage>>` 归零时跳）。') }).some((q) => q.code === 'P5'));
		t('改制面·P5 正例：**不带反引号**的普通散文（含 `<<` 字面被转义）⇒ **不报** ✓',
			!passagesFaceProblems({ slug: 'd', data: D(), files: mkP('（用 damage 归零时跳）。') }).some((q) => q.code === 'P5'));
		// P3 铭名换维（与"缺值"不同形）
		t('🔴 改制面·P3 撞名（**换维**）：`links[].slot` 与同段 `params` 同名 ⇒ P3 且报"撞名"',
			(() => { const qs = passagesFaceProblems({ slug: 'd', data: D({ params: { 靴子口: { type: 'string' } }, links: [{ label: '看', to: '门厅', slot: '靴子口' }] }), files: mkP('x') });
				return qs.some((q) => q.code === 'P3' && /撞名/.test(q.msg)); })());
		t('🔴 改制面·P3 未声明占位（**与撞名不同因**）：`{{未见名}}` ⇒ P3 且报"未在本段 params 声明"',
			(() => { const qs = passagesFaceProblems({ slug: 'd', data: D(), files: mkP('看 {{未见名}}') });
				return qs.some((q) => q.code === 'P3' && /未在本段/.test(q.msg)); })());
		t('改制面·P3 正例：`{{名}}` 是本段 `params` 或 `slot` ⇒ **不报** ✓',
			passagesFaceProblems({ slug: 'd', data: D({ params: { 提醒: { type: 'string' } }, links: [{ label: '看', to: '门厅', slot: '靴子口' }] }), files: mkP('看 {{提醒}} 与 {{靴子口}}') }).length === 0);
		// P4 无悬空 ＋ 必填实参（分形）
		t('🔴 改制面·P4 悬空：`links[].to` 不在键集 ⇒ P4（点名 to ＋ 来源段）',
			passagesFaceProblems({ slug: 'd', data: D({ links: [{ label: '走', to: '不存在的段' }] }), files: mkP('x') }).some((q) => q.code === 'P4' && /不存在的段/.test(q.msg)));
		t('🔴 改制面·P4 漏必填 `p`：目标段 `required` 而 `args` 没给 ⇒ P4 且**点名缺的名**',
			(() => { const data = D({ links: [{ label: '走', to: '里屋' }] }); data['里屋'] = { params: { p: { type: 'string', required: true } }, links: [] };
				return passagesFaceProblems({ slug: 'd', data, files: mkP('x') }).some((q) => q.code === 'P4' && /缺\*\*必填\*\*入参 \`p\`/.test(q.msg)); })());
		t('🔴 改制面·P4 给了 `p` 漏 `q`：**同形不同因**（缺的名不同）⇒ 仍 P4 且点名 `q`',
			(() => { const data = D({ links: [{ label: '走', to: '里屋', args: { p: 'x' } }] });
				data['里屋'] = { params: { p: { type: 'string', required: true }, q: { type: 'string', required: true } }, links: [] };
				return passagesFaceProblems({ slug: 'd', data, files: mkP('x') }).some((q) => q.code === 'P4' && /q/.test(q.msg)); })());
		t('改制面·P4 正例：必填都给 ⇒ 无 P4 ✓',
			(() => { const data = D({ links: [{ label: '走', to: '里屋', args: { p: 'x' } }] });
				data['里屋'] = { params: { p: { type: 'string', required: true } }, links: [] };
				return !passagesFaceProblems({ slug: 'd', data, files: mkP('x') }).some((q) => q.code === 'P4'); })());
	}
	if (bad) { console.error(`\n✗ 词汇门自证失败 ${bad} 项`); process.exit(1); }   // `#1124` 评审阻断修：所有格先跑完再判退（格红进退出码）
	console.log('\n✔ 自证通过（词汇抽取 ＋ 允许面 ＋ 逻辑/表达式/未宣告三类反例 ＋ 注释/段落豁免）');
	process.exit(0);
};

if (process.argv.includes('--selftest')) selftest();

// ── 真实树检查 ──────────────────────────────────────────────────────────
// `#1051`②：**枚举口径统一** —— 与 `#1045`／`#1046`／`#1089` 同款（取不到 git 元数据 → **报红，不静默跳过**，照 `repo-shape.mjs:86`）。
const trackedIn = (dir) => execFileSync('git', ['ls-files', '--', dir], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const untrackedIn = (dir) => execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', dir], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const vocabFiles = trackedIn('src').filter((f) => f.endsWith('.twee'));
const vocab = engineVocab(vocabFiles.map((f) => readFileSync(absPath(f), 'utf8')));   // `#1267`：src 件时 absPath 恒等
// `#1267` 尾件③（口径裁定）：**受判故事集合的默认面＝「在生效故事根下存在且可读」**，
// 不再是 git 已入库面 —— 否则仓外故事（未入库）会被整体漏判（本门枚举面决定受判集合，
// 漏判＝判据变松而无人知道）。**仅当判据的不变量本身就是「入库/跟踪状态」时才用 git 面**：
// 本门确有一处属后者（下方「未跟踪件 → 提醒」那一段），它已单独说明理由，故保留 git 面。
const stories = storySlugs();
// ── `#1234`／`#1350`：**改制面**四条（面＝"有 `data/passages.json` 的故事"）───────────────
// 面（机械可判，✗ 不靠"我知道哪些是新的"）：`storySlugs()` 里有 s 且 `<s>/data/passages.json` 存在
//注意：本段**只读声明源**（`passages.json` ＋ `passages/*.md`）⇒ ✗ 不依赖 `npm run build`；
// 它必须在 `#1133` 前置守卫**之前**跑（否则"生成物缺席"会先 exit(2)，本段永远判不到 ✓）。
//注意：此处用**本段自己的数组** `faceProblems`（`problems` 在其后声明 —— 直接用会 TDZ 崩 ✓ 实测踩过）。
let faceProblems = [];
{
	const storiesForFace = storySlugs();
	const face = storiesForFace.filter((sl) => existsSync(absPath(`stories/${sl}/data/passages.json`)));
	if (face.length === 0) {
		// **空面必须出声**（承"空面必红"）：改制面被清空（靶被挪走）不许看起来像"一切都好" ✗
		console.log('○ 未判：改制面内 0 个故事（未改制／靶缺席）⇒ `data/passages.json` 四条未判（不计红 ✓，✗ 也不静默绿）');
	} else {
		for (const sl of face) {
			const data = JSON.parse(readFileSync(absPath(`stories/${sl}/data/passages.json`), 'utf8'));
			// 源面只取**读得到的**声明件（`passages/` 下的 md；✗ 不读生成物）——生成物缺席不影响本段判据
			const onDisk = sourcesUnder(`stories/${sl}`).filter((x) => isStoryPassageMd(x));
			let declared = [];
			try { declared = (JSON.parse(readFileSync(absPath(`stories/${sl}/00-story.json`), 'utf8')).files ?? []); } catch { declared = []; }
			const paths = [...new Set([...onDisk, ...declared.filter((x) => x.endsWith('.twee') && existsSync(absPath(x)))])];
			const files = paths.map((x) => ({ path: x, text: readFileSync(absPath(x), 'utf8') }));
			faceProblems = faceProblems.concat(passagesFaceProblems({ slug: sl, data, files }));
		}
		console.log(`改制面（有 \`data/passages.json\`）：${face.length} 个故事（${face.join('、')}）｜四条判据命中 ${faceProblems.length} 项`);
	}
}

// `#1133` ⭐ **第二站点**：**产物缺失 → 报"先跑 `npm run build`"**（不许裸 ENOENT 崩）
// 本件按清单读**声明件**，其中含**生成物**（家族谓词见 `editor/lib/core/generated-family.mjs` → gitignored）
// → 未 build 时它们不在树 → `readFileSync` 裸 ENOENT → 读者读不出"该先 build"
//注意：两态**可区分**：前置缺失 → **rc=2** ＋ 明确"先跑 build"；判据失败 → 仍 rc=1
{
	const missing = [];
	for (const slug of stories) {
		let mf = [];
		try { mf = JSON.parse(readFileSync(absPath(`stories/${slug}/00-story.json`), 'utf8')).files ?? []; } catch { continue; }
		// `#1267` 尾件①：故事件的判存在也走 absPath（仓内恒等）。
		for (const p of mf) if (isGeneratedFamily(p) && !existsSync(absPath(p))) missing.push(p);   // `#1185`：谓词走单一权威
	}
	if (missing.length) {
		console.error(`✗ **前置缺失**（**不是**判据失败）：**生成物**不在树 ⇒ 先跑 \`npm run build\`（\`#1133\`）`);
		console.error(`   缺：${missing.slice(0, 5).join('、')}${missing.length > 5 ? ' …' : ''}（共 ${missing.length} 件）`);
		process.exit(2);
	}
}
let problems = [];
// 改制面四条的命中并入主汇总（本段跑在其前 ⇒ 用已收集的数组 ✓）
let exempt = [];
const judgedSlugs = [];
const allJudgedFiles = [];
for (const slug of stories) {
	const story = JSON.parse(readFileSync(absPath(`stories/${slug}/00-story.json`), 'utf8'));   // `#1267` 尾件①
	// `#1051`②：**以清单为准**（单一权威）——不再用 `readdirSync` 现扫。
	// `#1114` 片 2b-2a：清单里的**散文层源**（`passages/` 下的 `.md`）也算段落源（原先按 `.twee` 过滤 → md 隐形）。
	const declared = (story.files ?? []).filter((p) => (p.endsWith('.twee') || isStoryPassageMd(p)) && p.startsWith(`stories/${slug}/`));
	//注意：**在树上却不在清单里 → 不静默**（本票的由来正是这个：`00-meta2.twee` 这类**下一代名**会被旧口径当**正文**判）
	{
		// `#1114` 片 2b-2a：**递归**枚举（原先只看顶层 `.twee` → `passages/` 子目录是静默盲区）；
		// 仍只算真源（`.twee` ∪ `passages/` 下的 `.md`）—— 非源 md（会话记录／门证据）不进面。
		const onDisk = sourcesUnder(`stories/${slug}`).filter((p) => p.endsWith('.twee') || isStoryPassageMd(p));
		const undeclared = undeclaredStoryFiles({ declared, onDisk });
		//注意：必须是 `{code, msg}` 形态 —— 自测踩过：这条原先 push **裸字符串** → 汇总处按 `p.code`／`p.msg` 读 → 打印成 `[undefined] undefined` → **报文被吞**（“读数答不了你以为它在答的问题”那族）。
		for (const p of undeclared) problems.push({ code: 'U2', msg: `\`${p}\` 在树上但**不在 \`00-story.json\` 的 \`files\` 里** ⇒ 不许静默（要么登记、要么删 —— 旧口径会把它当**正文**判 ✗）` });
	}
	const files = declared
		.map((p) => ({ path: p, text: readFileSync(absPath(p), 'utf8') }))   // `#1267` 尾件①：故事件走真身
		.filter((f) => !isMetadataTwee(f.text))            // 元数据件：**内容谓词** 不靠文件名字面量
		.filter((f) => !/^\s*\/\/\s*@generated/m.test(f.text.split('\n').slice(0, 3).join('\n')));   // 生成物不在本门射程
	// `#1114` 片 2b-2a：**跟源同名段**（同一段在 `passages/*.md` 与 `*.twee` 各写一份）→ 红并**点名两处**。
	//注意：**不受 audience 豁免**（它不是词法面 —— 所有故事的源都不该有双份真相）。
	{
		const segNames = [];
		for (const f of files) {
			const ps = passagesOf(f.text, f.path);
			for (const p of ps) segNames.push({ name: p.name, path: f.path });
		}
		for (const m of duplicateProblems({ passages: segNames })) problems.push({ code: 'D1', msg: m });
	}
	//注意：**缺 `audience` → 按 content 判**（不静默放过）：`audience` 由 `#1035` 显式声明引入；
	// 缺字段时若按"豁免"处理，本门在 `#1035` 落地前会**成为空判**（正是本仓最忌讳的形态）。
	const judged = story.audience !== 'internal';
	// `#1132`：**词表扩展** —— 受判故事的**本地宏名**（`passages/` 下的 md 里的 `<<widget "name">>`）也算"已声明"。
	// 为什么：C 形态（UI 渲染移入伴生 `[script]` 段的 `<<widget>>` 定义）会让**散文段**里出现
	// 故事本地宏名 → 若词表只抽 `src/**` → 那些引用会被判 **V2「引擎未宣告」**（受判故事上必红）。
	//注意：**按 slug 现抽**（作用域隔离免费）：A 故事的本地名不会让 B 故事受益。
	//注意：**枚举走同一已入库面**（`trackedIn` —— 未跟踪件不得静默供名，与门其余部分同口径）
	//注意：**并集只喂第三档**（禁则→允许→词表 三档次序不变 → 声明无法解锁禁则）。
	const storyPassageMd = (sl) => trackedIn(`stories/${sl}`).filter((f) => f.endsWith('.md') && isStoryPassageMd(f));
	const vocabFor = (sl) => {
		const extra = storyPassageMd(sl).map((f) => readFileSync(absPath(f), 'utf8'));   // `#1267` 尾件①
		return extra.length ? engineVocab([...vocabFiles.map((f) => readFileSync(absPath(f), 'utf8')), ...extra]) : vocab;
	};
	if (judged) { judgedSlugs.push(slug); problems = problems.concat(proseVocabProblems({ slug, files, vocab: vocabFor(slug) })); allJudgedFiles.push(...files); }
	else exempt.push(slug);
}
// `#1051`②：**未跟踪件 → 提醒**（与 `#1045`／`#1046`／`#1089` 同款 —— 不静默跳过）。
//注意：为什么单列一条：本门的枚举走 `git ls-files`（**已入库面**）→ **未跟踪的 `.twee` 会被静默漏掉**
//（`src/` 面尤其：那会是"引擎词汇表少抽了宏"→ 判据**变松**而**无人知道**）→ 必须**出声**。
{
	const untracked = [...untrackedIn('src'), ...untrackedIn('stories')].filter((f) => f.endsWith('.twee'));
	const { unscanned, problems: uProbs } = untrackedScannedProblems({
		untracked, isScanned: (f) => f.endsWith('.twee'), isTransient: isTransientFixture,
	});
	for (const m of uProbs) problems.push({ code: 'U1', msg: m });

	for (const sl of judgedSlugs) {
		const contractPath = join(STORIES, sl, 'data', 'contract.json');
		const contract = existsSync(contractPath) ? JSON.parse(readFileSync(contractPath, 'utf8')) : { members: [] };
		const labels = engineLabels(vocabFiles.map((f) => readFileSync(join(ROOT, f), 'utf8')));
		const pcL = pcLabelFields(vocabFiles.map((f) => readFileSync(join(ROOT, f), 'utf8')));
		for (const l of pcL) if (/Label$/.test(l) && !labels.includes(l))
			problems.push({ code: 'V2', msg: '引擎 pc 字段 `' + l + '` 是 Label 形态但未登记 VALUE_LABELS（src/10-core.twee 常量表——对账破了）' });
		// `#1350`：**面内段声明面**（有 `data/passages.json` ⇒ 该故事的段 `params` 名 ∪ `links[].slot` 名）
		const faceTerms = (() => {
			const pp = absPath(`stories/${sl}/data/passages.json`);
			if (!existsSync(pp)) return null;
			const d = JSON.parse(readFileSync(pp, 'utf8'));
			const out = new Set();
			for (const v of Object.values(d)) {
				for (const k of Object.keys(v?.params ?? {})) out.add(k);
				for (const l of v?.links ?? []) if (l?.slot) out.add(l.slot);
			}
			return out;
		})();
		const vProbs = valueRefProblems({ files: allJudgedFiles.filter((f) => f.path.startsWith(`stories/${sl}/`)), terms: valueTerms({ contract, labels }), faceTerms });
		for (const vp of vProbs) problems.push({ code: vp.code, msg: vp.path + ': ' + vp.hint });
	}
	if (unscanned.length) console.error(`○ 未跟踪（本次未扫，共 ${unscanned.length} 件）：${unscanned.join('、')}`);
}

// `#1295`：**零故事态**与"有故事但零受判"必须分开 —— 前者是前提不成立（明说未判、不计红），
// 后者是配置错（仍红，见下方守卫）。
if (storySlugs().length === 0) {
	console.log('○ 零故事：仓内无故事 → 散文词汇门本项未判（不计红；接故事根后即参与判定）');
	process.exit(0);
}
// **空判守卫**：一个受判故事都没有 → 本门什么都没量 → 必须红（不许"零对象＝通过"）
if (judgedSlugs.length === 0) {
	console.error('✗ 散文词汇门是**空判**：没有任何内容故事受判（受判故事数 = 0）—— 检查 `audience` 是否缺失/被误标为 internal');
	process.exit(1);
}
console.log(`词汇表（引擎宣告，现抽）：${vocab.size} 个 ｜ 受判故事 ${judgedSlugs.length} 个（${judgedSlugs.join('、') || '无'}）｜ 内部件豁免 ${exempt.length} 个（${exempt.join('、') || '无'}）`);
problems = problems.concat(faceProblems);
if (problems.length) {
	console.error(`✗ 散文词汇门未通过 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	process.exit(1);
}
console.log('✔ 散文词汇门通过（内容故事正文只含：散文／链接／payload 标记／引擎已宣告的词汇宏）');
