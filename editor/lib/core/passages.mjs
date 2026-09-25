// `#1114` 片 1：**散文层拼装**（md → twee）——「作者只写 md+json」的拼装半边
//
// ## 定位（票面 §二，不自行发明形态）
// 输入：`stories/<slug>/passages/*.md`（一段一文件 + YAML front-matter）
// 输出：twee 段落文本（拼进构建链——与手写 twee 同形 → 下游门不感知来源）
//
// ## 三条硬规则（票面验收）
// 1. **散文文本逐字保留**（不许静默改写——拼装层不加不减正文字符）
// 2. `[[标签|目标]]` → twee 链接（**目标须校验存在** ——悬空 → 点名报错）
// 3. `{{名字}}` → 取值展开（**调 core/vocab.mjs 的 `valueTerms`** ——单一权威 不另算一份）
//
// ## 禁则（票面 §二③）
// `FORBIDDEN_BUILTINS`（真源 `test/prose-vocabulary.mjs:35`）→ 拼装层**必须拦**；
// 33 个具名动作宏 → **允许且不判**（与 `#1109` 词汇门口径一致）。
//
// ## 段序
// 仍由 `00-story.json` 的 `files` 派生（不许另造顺序 ——`#1051`② 单一权威）。
//
// 浏览器安全：零宿主 import（core 老规矩）。

import { valueTerms } from './vocab.mjs';

/** SugarCube 内置里**明确禁止**出现在正文的（逻辑/表达式 → "作者在写代码"）。
 * `#1114` 片 2b-2b-0：**本处为单一权威** —— 原先定义在 `test/prose-vocabulary.mjs`，
 * 而拼装层（`assemblePassages`）**必须**用同一份 → 否则“门禁得住、拼装放过去” ＝ 两处清单。
 *注意：**次序不变**：本表是判据的**第一档**（禁则 → 允许 → 词表）；拼装层同样先查它。 */
export const FORBIDDEN_BUILTINS = new Set(['if', 'elseif', 'else', 'set', 'for', 'run', 'capture', '=',
	// `#1132` 块2：**自写代码面**的两个入口 —— 机制段（script/widget 标签）被豁免出禁则扫描，
	// 所以"正文里直接写 <<widget …>>／<<script>>"今天谁也拦不到 → 补进名单（实测对现状零误红）。
	//注意：这**不是**完整覆盖：机制标签段本身由 `test/story-codeface.mjs` 的 ratchet 门管。
	'widget', 'script']);


/** front-matter 解析（`---` 围栏 + YAML 子集：key: value 行 ——不引全量 YAML 库 最小面）。 */
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

/** `#1114` 片 2b-2b-0b：**按扩展名分派**的段落解析入口 —— 全部消费面（audit 上下文、词汇门、build……）
 * 都走这里，**不许各自写一份“md/twee 怎么切”**（本仓反复撞的“两处口径”）。
 * · `.twee` → `:: 名 [tags]` 段头切段；
 * · `stories/<slug>/passages/` 下的 `.md` → front-matter ＋ 整文件一段（`passage` → 段名）。
 * · **分派依据是扩展名，不是文件名里的语义角色**（`#1114` Q1 裁定）。
 *注意：非源 md（会话记录／门证据）**不进面** —— 谓词与 `scripts/module-order.mjs` 的 `isStoryPassageMd` 同形。
 * 返回统一形态：`{ name, tags, body, bodyLines:[{text, line}], line}`（两路消费者共用）。 */
export const isStoryPassageMdPath = (rel) => /^stories\/[^/]+\/passages\/.*\.md$/.test(String(rel));

/** twee 的段头切段（`:: 名 [tags] {meta}` → 段对象）。**纯函数**。 */
export const parseTweePassages = (text) => {
	const lines = String(text).split('\n');
	const heads = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^::\s+(.+?)\s*(?:\[([^\]]*)\])?\s*(?:\{.*\})?\s*$/);
		if (m) heads.push({ i, name: m[1].trim(), tags: (m[2] ?? '').split(/\s+/).filter(Boolean) });
	}
	return heads.map((h, k) => {
		const bodyLines = lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : lines.length)
			.map((text, j) => ({ text, line: h.i + 2 + j }));
		//注意：`body` 必须与原口径（`text.split(/^::\s*/m)` 的 `part.slice(nl+1)`）**逐字相同**
		// —— 它含**段尾的那个换行**（原 part 末尾）→ 不补会在“无行为变化”的接线上反而改掉
		// `passageRaw`/`passageSrc` 的字面（实测：golden 22 个开关红）。
		return { name: h.name, tags: h.tags, line: h.i + 1, body: bodyLines.map((b) => b.text).join('\n') + '\n', bodyLines };
	});
};

/** md 散文源（一文件一段）→ 段对象（与 `parseTweePassages` **同形**）。**纯函数**。
 * front-matter 解析走本文件的 `parseFrontMatter`（**同一权威** 不另写 YAML 子集）。 */
export const parseMdPassages = (text, path = '') => {
	const { meta, body } = parseFrontMatter(text);
	const name = String(meta.passage ?? '').trim() || path;
	const tags = String(meta.tags ?? '').split(/[\s,]+/).map((t) => t.replace(/^\[|\]$/g, '')).filter(Boolean);
	const bodyLines = String(body).split('\n').map((t, j) => ({ text: t, line: j + 1 }));
	return [{ name, tags, line: 1, body: String(body), bodyLines }];
};

/** **唯一分派点**（`#1114` 片 2b-2b-0b）：给一份源文本与它的路径 → 段落数组。 */
export const passagesOf = (text, path = '') =>
	isStoryPassageMdPath(path) ? parseMdPassages(text, path) : parseTweePassages(text);

/** 禁则拦截：`FORBIDDEN_BUILTINS` 名出现在 md 正文 → 报（真源＝`editor/lib/core/passages.mjs` 的 `FORBIDDEN_BUILTINS` —— `#1114` 2b-2b-0 起 `test/prose-vocabulary.mjs` 与拼装层**同一份**）。 */
export const forbiddenProblems = ({ name, body, forbidden }) => {
	const out = [];
	for (const m of String(body).matchAll(/<<\s*(\w+)[\s>]/g)) {
		if (forbidden.has(m[1])) out.push(`段「${name}」正文含禁则内建 \`<<${m[1]}>>\`（原始计算出正文 ✗——迁移规则 #1114 片1前置②：状态进 data/、控制流进 rules.json 或拆段 ✓）`);
	}
	return out;
};

/** 悬空引用：`[[标签|目标]]` 的目标不在段落集合 → 点名（票面验收 ③）。
 * `#1114` 片 2b-2b-0：`known` ＝ **合法目标的全集** ——md 段可能引用**同故事的 twee 段**（两源共存期）
 * → 只拿 `passages` 当合法集会**误报悬空**（缺省仍＝`passages` 的段名，向后兼容）。 */
export const danglingProblems = ({ name, body, passages, known }) => {
	const out = [];
	const set = known ?? new Set(passages.map((p) => p.name));
	for (const m of String(body).matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]/g)) {
		const target = m[2].trim();
		if (!set.has(target)) out.push(`段「${name}」引用 \`[[${m[1]}|${target}]]\` 的目标段落「${target}」不存在（悬空 ⇒ 点名 ✗）`);
	}
	return out;
};

/** 取值展开（`#1350` 片 2 扩为**三段**）：
 *  ① **本段入参** `{{名}}`（`params`，值由调用处传入）⇒ `<<print_PARAM 名>>`
 *  ② **落位占位** `{{名}}`（`slot`，运行时由渲染口填）⇒ `<<print_SLOT 名>>`
 *  ③ **世界态取值**（既有口径，`terms`）⇒ `<<print_V 名>>`
 * 为什么不合并报错：①②**共用 `{{}}` 命名空间** ⇒ 撞名要**换维**点名（与"缺值"不同形），
 * 否则读者分不出"该给值而没给"与"两个东西撞了名"（两种病、两种修法）。
 * 另：**只认本段 `params`**（别人的入参在本段不可见 ⇒ 报）；`required` 无 `default` 且调用处未传 ⇒ 报。 */
export const valueRefExpand = ({ name, body, terms, params = {}, slot = null, slots = null, args = null }) => {
	const problems = [];
	const pkeys = Object.keys(params ?? {});
	const slotSet = new Set([...(Array.isArray(slots) ? slots : []), slot].filter(Boolean));
	for (const n of slotSet) {
		if (pkeys.includes(n)) {
			problems.push('段「' + name + '」的落位占位 {{' + n + '}} 与**入参同名** ⇒ 撞名 ✗（同名会把"该给值"与"该落位"混成一件事）⇒ 二者其一换名');
		}
	}
	const out = String(body).replace(/\{\{([^{}\s]+)\}\}/g, (_, n) => {
		// `#1350` 片 4：`slot` 占位**原样保留** `{{名}}` —— 由 `renderLinksOf` 在拼装时**就地换成链接行**（✗ 不在这里换宏：
		//   换了宏就变成"另一个运行时口"，而落位本是**编译期**就能定的事 ✗ —— 实测：换成 `<<print_SLOT>>` 会让片 4 接不上 ✗）
		if (slotSet.has(n)) return '{{' + n + '}}';
		// 入参：**引擎侧宏**（运行期取值 ⇒ ✗ 不烘值）—— 形态见 `docs/engine/json/tables.md` §11.2
		if (pkeys.includes(n)) return '<<printparam "' + n + '">>';
		// 世界态取值：**既有形态** `$pc.<名>`（✗ 不另造宏名）
		if (terms.has(n)) return '$pc.' + n;
		problems.push('段「' + name + '」的 {{' + n + '}} **不是本段入参、也不是落位、也不在世界态取值面**（本段 params＝' + JSON.stringify(pkeys) + '）⇒ 补声明或改名 ✗');
		return '$pc.' + n;
	});
	for (const [k, spec] of Object.entries(params ?? {})) {
		if (!spec || spec.required !== true) continue;
		if (spec.default !== undefined) continue;
		const given = args != null && Object.prototype.hasOwnProperty.call(args, k);
		if (!given) {
			problems.push('段「' + name + '」的入参 ' + k + ' **必填但没给值**（调用处未传、也无 `default`）');
		}
	}
	return { body: out, problems };
};

/** `#1114` 片 2b-2a：**重名段** —— 同一批源里段名重复 → 点名。
 * 为什么要它（不是形式主义）：散文层成为源之后，**同一段**可能在 `passages/*.md` 和 `*.twee` 里各写一份
 * → 那是「改了 md 没改 twee」的静默分叉（票面 §四 禁的形态）；一份构建里同名段只会活一个。
 * 口径：只判**名字**（不判内容），报出**两处来源**（可追踪）。 */
export const duplicateProblems = ({ passages = [] } = {}) => {
	const seen = new Map();
	const out = [];
	for (const p of passages) {
		const n = String(p.name ?? '');
		const where = String(p.path ?? p.source ?? '(未标来源)');
		if (!seen.has(n)) { seen.set(n, where); continue; }
		out.push(`段名「${n}」**重复**（\`${seen.get(n)}\` 与 \`${where}\`）⇒ 同一段有两份源 ✗ ⇒ 删一份或改名（\`#1114\` 片 2b-2a：md 与 twee 不得同段共存 ✓）`);
	}
	return out;
};

/**
 * `#1350` 片 4：把本段的 `links[]` **渲染出来**（✗ 不新造渲染宏 —— 复用既有 `<<rules>>`／`<<rulelist>>` 家族）。
 *
 * 落法（与旧树同形 ⇒ 渲染输出同来自**同一权威** `Sg.rules.pick`／`pickAll`）：
 *  · **带 `slot`** 的链接 ⇒ 落在正文同名 `{{slot名}}` 占位处 ⇒ **内联**渲染（块形态＝前后空行 ＋ 该链接那行）
 *  · **无 `slot`** 的链接 ⇒ 段尾块，按段级 `present` 选宏：`"菜单"` ⇒ `<<rulelist "段名">>`；否则（默认/`"单选"`）⇒ `<<rules "段名">>`
 * ★ 为什么"无行 ⇒ 零字节"是可依赖的：`<<rules>>` 的实现在 `if (!row) return;` 早退；`pickAll` 空数组 ⇒ 循环不执行
 *   （`src/engine/40-sim/21-resolve.twee:63-70`；`22-rules.twee:123-137`）⇒ 段尾块在"没有可渲染行"时**不产字节** ✓
 * ★ 判别力纪律：`present` 的"菜单/单选"差异**只在有 ≥2 条尾块候选的段上可判** ⇒ 能假格要锚那种段（✗ 别锚只有 1 条的段）。
 */
/**
 * `#1350` 片 5：把一条链接渲染成**显式 `<a>`**。
 *
 * ★ 为什么不能"裸 `[[label|to]]` ＋ 只带自己的属性"：引擎有**两处既有消费者**依赖 SugarCube 自产的属性集合 ——
 *   ① `src/80-script.twee` 的 `remember()`（选择器 `#passages a.link-internal`）② `:passageend.sgChoiceKey`
 *      （遍历 `a.link-internal[data-passage]` 补 `data-choice`，键盘走位靠它）。
 *   若我们少产属性 ⇒ 这两处**静默失效**，而"渲染文本逐字节同"（读 `textContent`）**看不见** ✗。
 * ⇒ 口径：**与自产同形同属性**（实测自产＝`class="link-internal"` ＋ `data-passage` ＋ `role="link"` ＋ `tabindex="0"`；
 *   `data-choice` 由 `:616` 补）⇒ 我们**只额外**加 `data-sg-args`（JSON 串，供跳转携带入参）。
 */
export const linkHtml = ({ label, to, args = null } = {}) => {
	const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const extra = args && typeof args === 'object' && Object.keys(args).length
		? ` data-sg-args="${esc(JSON.stringify(args))}"` : '';
	return `<a data-passage="${esc(to)}" class="link-internal" role="link" tabindex="0"${extra}>${esc(label)}</a>`;
};

export const renderLinksOf = ({ name, links = [], present = null }) => {
	const inline = [];
	const tail = [];
	for (const l of links) {
		if (!l || typeof l !== 'object') continue;
		const label = String(l.label ?? '').trim();
		const to = String(l.to ?? '').trim();
		if (!label || !to) continue;
		const html = linkHtml({ label, to, args: l.args });
		if (l.slot) inline.push({ slot: String(l.slot), text: html });
		else tail.push({ text: html });
	}
	const macro = String(present ?? '') === '菜单' ? 'rulelist' : 'rules';
	return { inline, tailBlock: tail.length ? `<<${macro} "${name}">>` : '' };
};

/** 主拼装：一批 md 段 → 一份 twee 文本（含 front-matter 元数据行）。 */
export const assemblePassages = ({ passages, known, forbidden = new Set(), terms = new Set(), data = null }) => {
	const problems = [];
	// 先校验（悬空须看全集 → 两遍）
	problems.push(...duplicateProblems({ passages }));   // `#1114` 2b-2a：重名段（跨源双写）→ 先报
	for (const p of passages) {
		problems.push(...forbiddenProblems({ name: p.name, body: p.body, forbidden }));
		problems.push(...danglingProblems({ name: p.name, body: p.body, passages, known }));
	}
	// 再展开+拼装（逐字保留散文文本 只做 {{}} 替换）
	const chunks = [];
	for (const p of passages) {
		// `#1350` 片 2/3：段落数据（`data/passages.json`，若给）按**段名**取本段 `params`/`slot`/`args`。
		// ★ 片 3 补充：`slot` 在靶里是**链接级**字段（`links[].slot` 指出该链接落在正文哪处）⇒
		//   本段的合法占位名＝**段级 slot ∪ 本段各链接的 slot**（两种写法都认 ⇒ 与作者面一致 ✓）。
		const dseg = (data && typeof data === 'object' ? data[p.name] : null) ?? {};
		const linkSlots = (Array.isArray(dseg.links) ? dseg.links : []).map((l) => l && l.slot).filter(Boolean);
		// ★ 片 3：**必填的“给了值”要按“调用处”算** —— 目标段的入参由**指向它的链接**的 `args` 提供
		//（靶里就是：`门厅.推门` 与 `侧厅.左门` 两条 `args:{提醒:"别进屋"}`）
		// ⇒ 本段自己的 `args`（段级）与**入链接的 args** 取并（后者优先于前者？不：任一来源给了就算给 ✓）。
		const inbound = (() => {
			if (!data || typeof data !== 'object') return null;
			const acc = {};
			for (const seg of Object.values(data)) {
				for (const l of (Array.isArray(seg?.links) ? seg.links : [])) {
					if (String(l?.to ?? '') !== String(p.name)) continue;
					if (l?.args && typeof l.args === 'object') Object.assign(acc, l.args);
				}
			}
			return Object.keys(acc).length ? acc : null;
		})();
		const { body: expandedRaw, problems: vp } = valueRefExpand({ name: p.name, body: p.body, terms,
			params: dseg.params ?? {}, slot: null, slots: [dseg.slot, ...linkSlots].filter(Boolean),
			args: (dseg.args && typeof dseg.args === 'object') ? dseg.args : inbound });
		problems.push(...vp);
		// `#1350` 片 4：把本段 `links[]` 渲染出来（✗ 不新造渲染宏；复用 `<<rules>>`／`<<rulelist>>`）
		const rl = renderLinksOf({ name: p.name, links: dseg.links ?? [], present: dseg.present ?? null });
		let expanded = expandedRaw;
		for (const { slot: sl, text } of rl.inline) {
			// 内联：占位处就地换成"块形态"（前后空行 ＋ 该行）—— 与旧树散文内联链接同形 ✓
			// ★ 占位形是 `{{名}}`（**双花括号**）；正则源＝`\{\{名\}\}`（✗ 别写多一层转义 —— 我踩过：`\\{` 会去找字面反斜杠 ✗）
			const re = new RegExp('\\{\\{' + sl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}', 'g');
			expanded = expanded.replace(re, `\n\n${text}\n\n`);
		}
		if (rl.tailBlock) expanded = `${expanded.replace(/\s+$/, '')}\n\n${rl.tailBlock}\n`;
		const tags = p.tags ? ` [${p.tags}]` : '';
		chunks.push(`:: ${p.name}${tags}\n${expanded}`);
	}
	return { twee: chunks.join('\n\n') + '\n', problems };
};
