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

/** ★ `#1505`／`#1506`（评审 NIT-1）：**注入宏串的字面量转义口**（**唯一一处** —— 段级 `check`／`fight` 共用）。
 * 三条（顺序有意义）：① `\` **必须先于** `"`（反斜杠会吃掉紧随的那个字符 ⇒ 顺序错＝转义当场失效）；
 * ② `"` 会**提前闭合宏串**（后半段变宏语法/散文）；③ 换行/回车会把宏**拆成两半**（行式解析）。
 * ★为什么抽成模块级：本笔初版两处各写一份同链复制 ⇒ ★**注释声称"同一个口"而代码是两份**
 *   ⇒ ★将来给一处加规则（如转义 `$`／`<<`）另一处不同步＝静默漂移 ✗（两席都点了这条）✓。 */
export const escapeMacroArg = (x) => String(x).trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

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
	// ★ `#1574`（阶 3b）：★前言的**其余字段**也要带上 —— ★原来只搬 `passage`／`tags` ⇒ ★`reroll` 这类段级声明
	//   会被**静默丢弃** ✗（实测：md 里写 `reroll: true` ⇒ 产物里那段 body **与数据面路径不等** ⇒ 等价性门红 ✗）
	return [{ name, tags, line: 1, body: String(body), bodyLines, meta }];
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

/** 取值展开（`#1350` 片 2 扩为**三段**）。★ **三支的编译形态以契约 `docs/engine/json/tables.md` §11.2 为唯一权威**
 *  （本注释**不重述**形态 —— 否则与本函数实现两处各说一套 ✗ 实测撞过：注释还写着旧宏名而实现已改）：
 *  ① **本段入参**（`params`）⇒ **引擎侧宏**（运行期取值，✗ 不烘值）
 *  ② **落位占位**（`slot`）⇒ **原样保留** `{{名}}`，由片 4 的 `renderLinksOf()` 在拼装期换成链接行
 *  ③ **世界态取值**（既有口径 `terms`）⇒ 既有形态 `$pc.<名>`（✗ 不另造宏名）
 * 为什么不合并报错：①②**共用 `{{}}` 命名空间** ⇒ 撞名要**换维**点名（与"缺值"不同形），
 * 否则读者分不出"该给值而没给"与"两个东西撞了名"（两种病、两种修法）。
 * 另：**只认本段 `params`**（别人的入参在本段不可见 ⇒ 报）；`required` 无 `default` 且调用处未传 ⇒ 报。 */
export const valueRefExpand = ({ name, body, terms, params = {}, slot = null, slots = null, args = null, bindings = null, wrap = null }) => {
	// ★ `#1569`（阶 3）：事件文本的槽 `bindings`（槽名 ⇒ 编译期替换串）。★扩展**本**函数（✗ 不造第二套 {{名}} 管线）。
	// 双向完备：未绑 ⇒ 报｜多给 ⇒ 报（票面「槽名重复 ⇒ 抛」按上下文配对读作**多给 ⇒ 抛**）。
	const problems = [];
	const pkeys = Object.keys(params ?? {});
	const slotSet = new Set([...(Array.isArray(slots) ? slots : []), slot].filter(Boolean));
	for (const n of slotSet) {
		if (pkeys.includes(n)) {
			problems.push('段「' + name + '」的落位占位 {{' + n + '}} 与**入参同名** ⇒ 撞名 ✗（同名会把"该给值"与"该落位"混成一件事）⇒ 二者其一换名');
		}
	}
	const served = new Set();   // ★(阶3) 真被用到的槽名（⇒ 多给的能点名）
	const out = String(body).replace(/\{\{([^{}\s]+)\}\}/g, (_, n) => {
		// `#1350` 片 4：`slot` 占位**原样保留** `{{名}}` —— 由 `renderLinksOf` 在拼装时**就地换成链接行**（✗ 不在这里换宏：
		//   换了宏就变成"另一个运行时口"，而落位本是**编译期**就能定的事 ✗ —— 实测：换成 `<<print_SLOT>>` 会让片 4 接不上 ✗）
		if (slotSet.has(n)) return '{{' + n + '}}';
		// ★(阶3) 本子句绑定表**优先于**入参／世界态（✗ 不回落段级 {{名}}）
		if (bindings && Object.prototype.hasOwnProperty.call(bindings, n)) { served.add(n); const v = String(bindings[n]); return wrap ? wrap(v) : v; }
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
	// ★(阶3) 双向完备：多给的槽（有绑定、format 没用）⇒ 点名
	if (bindings) for (const k of Object.keys(bindings)) {
		if (!served.has(k)) problems.push('事件文本的槽「' + k + '」有绑定但 format 里没用到 ⇒ 多余槽（拼错名 = 静默不渲染）');
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
export const linkHtml = ({ label, to, args = null, effects = null, call = null } = {}) => {
	const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	const extra = args && typeof args === 'object' && Object.keys(args).length
		? ` data-sg-args="${esc(JSON.stringify(args))}"` : '';
	// ★ `#1408`（行效果的**施加时刻**）：作者面语义＝**点击那一刻施加** ⇒ 效果随链接走（`data-sg-effects`）
	//   ⇒ 由 `#1350` 片 5 那处**点击处理器**（`remember`，与 `Sg.inargs.carry` 同刻）施加 ✓
	//   ✗ 不能沿用"编成规则行 ⇒ 该作用域渲染时施加"：那会让读者**什么都没点就拿到钥匙** ✗（实测）
	const eff = effects && typeof effects === 'object' && Object.keys(effects).length
		? ` data-sg-effects="${esc(JSON.stringify(effects))}"` : '';
	// ★ `#1562`（阶 2a）：**事件引用**随链接走 —— `data-sg-call="<事件名>"`。
	//   ★为什么是**引用**（✗ 不是求值结果）：事件里的 `use`／`when`／`args` 都**依赖状态**
	//     （`rand`／实体 hp／前态）⇒ 只能**点击那一刻**求值 ✓（与 `#1408` 的"行效果在点击那一刻施加"同刻 ✓）。
	//   ★声明本体住**生成表** `Game.Events.defs`（由 `emitEvents` 出）⇒ 引用与声明**各归其位** ✓。
	const callAttr = call != null && String(call).trim() !== '' ? ` data-sg-call="${esc(String(call).trim())}"` : '';
	return `<a data-passage="${esc(to)}" class="link-internal" role="link" tabindex="0"${extra}${eff}${callAttr}>${esc(label)}</a>`;
};

export const renderLinksOf = ({ name, links = [], present = null }) => {
	const inline = [];
	const tail = [];
	for (const l of links) {
		if (!l || typeof l !== 'object') continue;
		const label = String(l.label ?? '').trim();
		const to = String(l.to ?? '').trim();
		if (!label || !to) continue;
		// ★ `#1408`：行效果（`gives`/`sets`/`yields`）**随链接走**（✗ 不进规则行 —— 进规则行＝"渲染即施加" ✗）
	const effects = {};
	for (const k of ['gives', 'sets', 'yields', 'adds', 'takes']) if (l[k] != null) effects[k] = l[k];
	const html = linkHtml({ label, to, args: l.args, effects: Object.keys(effects).length ? effects : null });
		if (l.slot) inline.push({ slot: String(l.slot), text: html });
		else tail.push({ text: html });
	}
	const macro = String(present ?? '') === '菜单' ? 'rulelist' : 'rules';
	// ★★ `#1572`（阶 4）**"无可见出边 ⇒ 具名"的数据面**（★判据要精 ✗ 不是"段里没链接" ✓）：
	//   ★本段**声明了**几条链接 ⇒ ★打一个**隐藏 DOM 标记** ⇒ ★运行期（`:passagerender`）据此判
	//   ★「声明了 N>0 条，却**一条都不可见**」⇒ ★点名（★结局段声明 0 条 ⇒ ✗ 不报 ✓）
	const marker = `<span data-sg-links-declared="${links.filter((l) => l && typeof l === 'object' && String(l.label ?? '').trim() && String(l.to ?? '').trim()).length}" hidden></span>`;
	return { inline, tailBlock: (tail.length ? `<<${macro} "${name}">>` : '') + marker };
};

/** 主拼装：一批 md 段 → 一份 twee 文本（含 front-matter 元数据行）。 */
/** `#1399`：**结局声明面**的判据（纯函数 ⇒ 能假）。
 * 口径（协调席红线）：**"这是结局"的声明处必须唯一且有牙** ——
 *   · `ending`（段数据字段）＝**唯一活声明**（编译期注入 `<<ending>>` ⇒ 出口卡必在 ✓）
 *   · `tags: [ending]`（散文 front-matter）＝**死声明**（全仓 0 消费方）⇒ 若**只有它**而没有 `ending` 字段
 *     ⇒ **点名红**并给修法（这就是本票的病灶形态：两处声明、一处死 ✗）
 *   · 两处都写 ⇒ 允许（tags 作**人读标记**），但**活声明只有一个**（`ending` 字段）✓
 *   · **旧形态**（无段数据）在正文手写 `<<ending …>>` ⇒ 也是**活声明** ✓ ⇒ 此时 `tags` 只是冗余标记（✗ 不报）
 *     ★ 只有"**tags 有而既无字段又无正文宏**"才是死声明 ⇒ 红（本票病灶形态 ✓ —— north-room 两段正如此）
 *   · `ending.key` 必填（空 ⇒ 出口卡不带 key ⇒ 图鉴记账失真按 `#574`）✓
 */
export const endingProblems = ({ passages = [], data = null } = {}) => {
	const out = [];
	for (const p of passages) {
		// ★ 甲①（协调席裁，`#1405` 阻断后定）：**门只对"改制面"生效** —— 面内判据＝
		//   ① `<slug>/data/passages.json` 在场（调用方给了 `data`）**且** ② 该段在 `data` 里**有段对象**。
		//   为什么：**义务不可追溯** —— 旧形态作者今天**根本没有**这条义务（旧承载者 `canon.mjs` 已随旧故事删除）
		//   ⇒ 拿新门去追旧故事＝**本笔引入跨仓破坏** ✗（实测：books 真故事 `north-room` 无 `passages.json`
		//   而写了 `tags: [ending]` ⇒ `build` 红 ⇒ `pages.yml` fail ✗）。
		//   ⇒ 与 P1–P4 **同尺**：**"不在面内 ≠ 下架/欠账"** ✓（旧形态的缺陷**另有归属**：books 侧一次性改制 ✓）
		const inFace = !!(data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, p.name));
		if (!inFace) continue;
		const seg = data[p.name] ?? {};
		const hasField = !!(seg.ending && typeof seg.ending === 'object');
		const hasTag = Array.isArray(p.tags) && p.tags.includes('ending');
		const hasMacro = /<<\s*ending\b/.test(String(p.body ?? ''));
		if (hasField) {
			const key = String(seg.ending.key ?? '').trim();
			if (!key) out.push('段「' + p.name + '」的 `ending.key` 为空 ⇒ 出口卡与图鉴记账都拿不到键 ✗（填一个短标识，如 `"入林"`）');
			const kind = String(seg.ending.kind ?? 'final');
			if (kind !== 'chapter' && kind !== 'final') out.push('段「' + p.name + '」的 `ending.kind` ＝`' + kind + '` ✗（只许 `chapter` 或 `final`）');
			// ★ 乙①（协调席裁）：**`ending` 字段 ＋ 正文手写宏并存 ⇒ 红** —— 否则产物**两张出口卡**
			//   （绕过"**声明处唯一**"红线 ✗）。天然能假：产物 `<<ending` 计数 **≠ 1** ✓
			if (hasMacro) out.push('段「' + p.name + '」**同时**有 `ending: {key,kind}` 与正文手写 `<<ending …>>` ⇒'
				+ ' 产物会出**两张出口卡** ✗（声明处必须唯一：删掉正文那一行 ✓）');
		} else if (hasTag && !hasMacro) {
			out.push('段「' + p.name + '」**只**写了 `tags: [ending]`（全仓**无消费方** ⇒ 死声明 ✗）⇒'
				+ ' 改用段数据 `ending: {key,kind}`（编译期注入出口卡）—— 否则读者会**卡在结局页** ✗');
		}
	}
	return out;
};

/** `#1399`：**受制裁变换**的**唯一实现** —— 源 body ⇒ 产物 body（`{{}}` 展开 ＋ `slot` 内联 ＋ 段尾块 ＋ `ending` 注入）。
 * 为什么抽出来：`build.mjs` 有一条"产物 body ＝ 源经受制裁变换后的 body"的**期望面判据**；
 * 它必须用**同一函数**再算一次（✗ 不在判据里另写一份 —— 两处必漂移，本仓反复撞过）✓
 * ★ 新增变换（如 `#1399` 的 `ending` 注入）时**只改这里** ⇒ 拼装面与判据面同步 ✓
 */
/** ★ 双渲染宏（`#1412`）：**面内段**同时有**散文手写渲染宏**（`<<rules>>`／`<<rulelist>>`）与 **`links[]` 非空**
 * ⇒ **点名红**。为什么：`links[]`（不带 `slot`）会在**编译期注入段尾块**（`<<rules>>`／`<<rulelist>>`）
 * ⇒ 若正文**已手写**同一个宏 ⇒ 产物里**渲染两遍**（读者看到两组链接）✗ ——
 * ★ 与 `#1399`「并存 ⇒ 红」**同族**：都是"**看起来能跑、其实重复渲染**"✗（无法从"能 build／能渲染"看出）。
 *
 * ★ 范围与面内/面外（与 `endingProblems` **同尺**）：只判**改制面**（该故事有 `data` 且该段在 `data` 里有段对象）；
 *   义务不可追溯（旧形态作者没有这条义务）⇒ 面外 `continue` ✗ 不判 ✓
 * ★ 例外（✗ 不报）：**带 `slot` 的 links** 是**内联落位**（✗ 不注入段尾块）⇒ 与手写宏**不冲突** ✓
 */
export const doubleRenderProblems = ({ passages = [], data = null } = {}) => {
	const out = [];
	for (const p of passages) {
		const inFace = !!(data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, p.name));
		if (!inFace) continue;
		const seg = data[p.name] ?? {};
		const links = Array.isArray(seg.links) ? seg.links : [];
		// ★ 只有**会注入段尾块**的那些 links 才算（带 `slot` 的走内联 ⇒ 不冲突 ✓）
		const tailLinks = links.filter((l) => l && typeof l === 'object' && !l.slot
			&& String(l.label ?? '').trim() && String(l.to ?? '').trim());
		// ★ `#1505`（同族）：段级 **`check`** 字段 ＋ 散文**手写** `<<sitecheck>>`／`<<snapshot>>`
		//   ⇒ ★**检定跑两遍**（两次掷骰！）✗ —— ★比"重复渲染"更隐蔽：★玩家看到的是**两次不同的骰面**。
		//   ★修法：删掉散文那两个宏（由编译期注入 ✓）。
		//   ★★注意：本判**不依赖 `links[]`** ⇒ ★必须在下面的 `if (!tailLinks.length) continue` **之前** ✓
		//   （★我第一次放在后面 ⇒ 该格当场红 ✓ —— ★"早退分支之前/之后"是本仓反复撞的坑 ✓）
		const segCheck = seg.check != null && String(seg.check).trim() !== '';
		const handCheck = /<<\s*sitecheck\b[^>]*>>|<<\s*snapshot\b[^>]*>>/.test(String(p.body ?? ''));
		if (segCheck && handCheck) out.push('段「' + p.name + '」**同时**有段级 `check` 字段与散文手写的 '
			+ '`<<sitecheck>>`／`<<snapshot>>` ⇒ 产物里**检定跑两遍**（★两次掷骰，玩家会看到两个不同骰面）✗ ⇒ '
			+ '修法：**删掉散文那两个宏**（由编译期注入 ✓）');
		// ★ `#1506`（同族）：段级 **`fight`** 字段 ＋ 散文**手写**战斗三宏（`<<fightbegin>>`／`<<fightlog>>`／
		//   `<<fightpanel>>`）⇒ ★**同一场战斗被起两遍** —— 且**比 `check` 那颗更隐蔽**：
		//   `<<fightbegin>>` 的守卫是「同池子且**没打完** ⇒ 这就是重渲染、不清台账」⇒ 表面上"没有重复起"，
		//   但**日志块与面板块各渲两遍**（读者看到两组"这一轮你能做的"＋两份战斗日志）✗；
		//   换池名/收尾后更是真的起两场。
		//   ★修法：**删掉散文里那三行宏**（由编译期注入 ✓）—— 与 `check` 那颗同形同修法 ✓。
		//   ★面：三段里**任一手写**即报（作者只删了两行、留了一行，同样要红 ✓）。
		const segFight = seg.fight != null && typeof seg.fight === 'object' && String(seg.fight.pool ?? '').trim() !== '';
		const handFight = /<<\s*(?:fightbegin|fightlog|fightpanel)\b[^>]*>>/.exec(String(p.body ?? ''));
		if (segFight && handFight) out.push('段「' + p.name + '」**同时**有段级 `fight` 声明与散文手写的 `' + handFight[0]
			+ '` ⇒ 产物里**同一场战斗渲两遍**（两组动作按钮 ＋ 两份战斗日志；收尾后再渲更会真起两场）✗ ⇒ '
			+ '修法：**删掉散文里那三行战斗宏**（`fightbegin`／`fightlog`／`fightpanel` 由编译期注入 ✓）');
		if (!tailLinks.length) continue;
		const macros = String(p.body ?? '').match(/<<\s*(?:rules|rulelist)\b[^>]*>>/g) ?? [];
		if (macros.length) out.push('段「' + p.name + '」**同时**有散文手写的渲染宏（`' + macros[0] + '`）与 `links[]`（'
			+ tailLinks.length + ' 条会**注入段尾块**）⇒ 产物里**渲染两遍** ✗（读者看到两组链接）⇒'
			+ ' 修法：**删掉正文那一行宏**（链接由编译期注入 ✓）或给这些链接加 `slot` 走**内联落位** ✓');
	}
	return out;
};

/** ★`#1570`：**散文来源唯一** —— 同一段的散文**只许一处来源**（文件 `passages/*.md`／twee ∨ ★数据面
 * `data/passages.json` 的段级 `text`）。
 * ★与 `doubleRenderProblems`（`#1412` 双渲染／`#1505` 双注）**同族**：两处各写一份 ⇒ 必漂移 ✗（★本仓反复撞的那类）。
 * ★口径：`p.fromData === true` 的段＝**数据面合成**的那一份 ⇒ **跳过**（★它就是数据面来源本身，✗ 不算"两处"）。
 * ★判据面＝"`text` **非空**"（与 `build.mjs` 的 `inlineTextOf` 同口径 ⇒ ✗ 空串／缺项不算有来源 ✓）。 */
export const duplicateSourceProblems = ({ passages = [], data = null } = {}) => {
	const out = [];
	if (!data || typeof data !== 'object') return out;
	for (const p of passages) {
		if (p?.fromData === true) continue;
		const seg = Object.prototype.hasOwnProperty.call(data, p?.name) ? data[p.name] : null;
		if (!seg || typeof seg !== 'object') continue;
		if (typeof seg.text !== 'string' || seg.text.trim() === '') continue;
		out.push(`段「${p.name}」的散文**有两处来源**：文件 \`${String(p.path ?? p.source ?? '(未标来源)')}\` `
			+ `＋ 数据面 \`data/passages.json\` 的 \`text\` ⇒ ✗ **只许一处**（删一处）—— \`#1570\` 的「来源唯一」判据`
			+ `（与 \`#1412\` 双渲染／\`#1505\` 双注同族：两处各写一份 ⇒ 必漂移）`);
	}
	return out;
};

/** ★ `#1574`（阶 3b）：**段级 `reroll` 的唯一判据**（★三处调用点共用 ⇒ ✗ 各写一份必漂移 ✓）。
 *  ★口径：★**两来源任一给了就算**（md 前言 ／ `data/passages.json`）—— ★因为 `<<sitecheck>>` 调用**在 body 里**
 *  ⇒ ★段级声明会**改变 body** ⇒ ★两条来源**必须同源**（✗ 只写数据面 ⇒ 等价性门红 ✗，实测）。
 *  ★形：★数据面是 `true`（boolean）／★前言是 `"true"`（**字符串** —— `parseFrontMatter` 只给字符串 ✓）⇒ 两形都认 ✓。 */
/** ★ `#1574`（阶 3b）：★**段级 `check` 生成的宏调用 = 唯一真源**（生成点与自证共用 ⇒ ✗ 不会漂 ✓）。
 *  ★形：`<<sitecheck "<站点>" "-" "<reroll ? 'reroll' : ''>">><<snapshot>>`
 *  ★两个新参的**理由**（都实测过）：
 *    · `"-"` ⇒ ★**非空占位** —— ✗ 用 `""` 会被 SugarCube 当"缺席"丢掉 ⇒ **它后面的参数整条不见** ✗
 *    · 第三参 `"reroll"` ⇒ ★把段级声明带给运行期（★位置无关读法 ⇒ ✗ 不靠 `$args[2]` ✓）
 *  ★站点名走 `escapeMacroArg`（模块级唯一口 ✓ —— ✗ 不在此内联一份 ✓）。 */
export const sitecheckCall = (site, reroll = false) =>
	`<<sitecheck "${escapeMacroArg(site)}" "-" "${reroll ? 'reroll' : ''}">><<snapshot>>`;

/** ★ `#1657`（阶 4 收口）：★**段级重入上限** `${...}` 的**唯一判据**（★与 `rerollDeclared` 同形而不同维 ✓）。
 *  ★为什么要有它：★"一个每次只加 1 的慢循环"与"一回合要进 30 次的内层循环"**对上限的需求不同**
 *  ⇒ ★让作者**按段声明**（如 `visitLimit: 200` ✓）比**全局 64** 准 ✓（★64 变**缺省值** ✗ 不是唯一值 ✓）。
 *  ★形：★`true`／字符串数字都认（★前言只给字符串 ✓）；★✗ 非正数 ⇒ 视为**未声明**（走缺省 ✓）。
 *  ★两来源任一给了就算（md 前言 ／ `data/passages.json` ✓ —— ★与 `rerollDeclared` 同口径 ✓）。 */
export const visitLimitDeclared = (meta, dseg, where = '') => {
	// ★★ `#1667` T 席 NIT：★"写坏 ⇒ **静默回落 64**" ✗ —— ★那会让作者以为自己设了上限、其实没设 ✓
	//   ⇒ ★**写坏 ⇒ 点名**（★本函数在**编译期**跑（`emit.mjs`）⇒ 抛即编译红 ✓，✗ 不静默 ✓）
	const one = (x, from) => {
		if (x == null || x === '') return null;                 // ★未声明 ⇒ 缺省（✗ 不报）✓
		const n = Number(x);
		if (!Number.isFinite(n) || n < 1) {
			throw new Error('段级 `visitLimit` **形不对**' + (where ? '（段「' + where + '」）' : '')
				+ '：' + from + ' 给的是 ' + JSON.stringify(x)
				+ ' ⇒ ✗ 需**正数**（如 `visitLimit: 200` ✓）—— ✗ 不静默回落 64（那会让"设了"与"没设"读数相同 ✓）');
		}
		return Math.floor(n);
	};
	return one(meta && meta.visitLimit, 'md 前言') ?? one(dseg && dseg.visitLimit, '数据面');
};

export const rerollDeclared = (meta, dseg) => {
	const one = (x) => x === true || String(x ?? '').trim() === 'true';
	return one(meta && meta.reroll) || one(dseg && dseg.reroll);
};

export const applyPassageTransforms = ({ name, body, terms = new Set(), params = {}, slots = [], args = null, links = [], present = null, ending = null, check = null, fight = null, reroll = false }) => {
	const { body: expandedRaw, problems } = valueRefExpand({ name, body, terms, params, slot: null, slots, args });
	const rl = renderLinksOf({ name, links, present });
	let expanded = expandedRaw;
	for (const { slot: sl, text } of rl.inline) {
		const re = new RegExp('\\{\\{' + sl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}', 'g');
		expanded = expanded.replace(re, `\n\n${text}\n\n`);
	}
	if (rl.tailBlock) expanded = `${expanded.replace(/\s+$/, '')}\n\n${rl.tailBlock}\n`;
	// ★ `#1505`：段级字段 **`check`** —— 「本段入口要跑一次位点检定」（原散文写法 `<<sitecheck "站点">><<snapshot>>`）。
	//   ★编译期把它**渲染成引擎已宣告的宏调用**注入段首（✗ 不需要新宏 ✓）。
	//   ★`<<snapshot>>` 是 `<<sitecheck>>` 的**配对动作**（写 `pc.ev.last_roll` 供 `<<lastcheck>>` 复显）
	//     ⇒ 声明 `check` 即**一并注入**（✗ 不让作者写两个字段 —— 它们永远成对 ✓）。
	//   ★空/缺省 ⇒ **不动**（零破坏 ✓）。
	//   ★★ `#1546` 缺口③：**类型错与空值原先都是"静默"** ——
	//     · `check: { a: 1 }`（照 `fight` 的样子写错）⇒ `String({})` ＝ `"[object Object]"` ⇒ ★**注入脏值**（无声）；
	//     · `check: ''`／空白 ⇒ `trim()` 后为空 ⇒ ★**静默跳过** ⇒ 与"未声明 `check`"**读数完全相同**
	//       （"本段跑了检定"与"本段没有任何检定"不可区分）✗
	//   ⇒ ★两支都改为**点名**（与 `#1543` 的段级 `fight` **同一把尺**：存在但形不对 ⇒ fail-loud，✗ 不静默）。
	if (check != null) {
		if (typeof check !== 'string') {
			problems.push('段「' + name + '」的段级 `check` 必须是**字符串**（拿到 '
				+ (Array.isArray(check) ? 'array' : typeof check) + ' ' + JSON.stringify(check) + '）——'
				+ ' 写法是 `check: "<站点名>"`（★✗ 静默注入 `[object Object]` 这种脏值 ⇒ 那一页会拿脏站点名去检定 ✓）');
		} else if (String(check).trim() === '') {
			problems.push('段「' + name + '」的段级 `check` **为空（或空白）** ⇒ 要么给站点名、要么**删掉该字段**（★✗ 静默跳过会让"这一页跑了检定"与"这一页没有检定" **读数完全相同** ✓）');
		} else {
			// ★ 转义走**模块级唯一口**（`escapeMacroArg`）—— ✗ 不在此内联一份（评审 NIT-1：注释说"同一个口"而代码两份 ✗）
			// ★ `#1574`（阶 3b）：段级 `reroll` ⇒ ★把"重掷"随**生成的调用**带下去（★单一生成点 ⇒ ✗ 不会漂 ✓）
			//   ★`$args[2]` 取 `"reroll"` 即重掷；★缺省（空串）⇒ **复用** ✓
			// ★★(实测) ✗ **不能传空串占位** —— SugarCube 会把它当“缺席”⇒ **后面的参数整条不见** ✗
			//   ⇒ 改非空占位 `"-"`（★widget 侧把 `"-"` 译回 `null` ✓）
			expanded = sitecheckCall(check, reroll) + '\n' + expanded;
		}
	}
	// ★ `#1506`：段级字段 **`fight`** —— 「这一段入口是一场战斗」（原散文写法 `<<fightbegin "池">>\n<<fightlog>>\n`
	//   `<<fightpanel "池" N won "去向">>` 三行）。
	//   ★**编译期**把它渲染成**引擎已宣告的三个宏调用**注入段首（✗ 不新造宏 ✓ —— 与 `#1505` 的 `check` **同形** ✓）。
	//   ★字段形（纯数据，票面「`fightbegin(池, N, 结果, 去向)` ⇒ 段级 fight 声明」＋「挂载点顺序＝数据字段顺序」）：
	//     `{ pool, turns?, result?, dest? }` ⇒ `<<fightbegin "池">><<fightlog>><<fightpanel "池" turns result dest>>`
	//     · `pool` **必填**（它今天就是 `fightbegin` 的第一个参数；缺 ⇒ **fail-loud 点名**，✗ 不静默注入半个宏串 ✓）
	//     · `turns`／`result`／`dest` **可选**且**按位置传参**：`result` 给了而 `turns` 没给 ⇒ 要塞一个空槽
		//       （`<<fightpanel "池"  won>>`**语法错** ⇒ 本处补 `null`，`fightpick` 的守卫认它 ✓）—— ✗ 不给个假数 ✓
	//     · `turns` 必须是**有限数**（它是「打满 N 回合」的机械事实 ⇒ 写 "三" 这种词是数据错，点名 ✓）
	//   ★**行为等价**（票面验收）：注入的三行与作者今日手写的三行**逐字同形** ⇒ `fightpanel-turns`／`combat-adv`
	//     两条端到端的格**逐条不变**即可证 ✓（✗ 不靠"看起来像" ✓）。
	//   ★★`#1543` CR（**门禁级**）：★**类型错必须是 fail-loud** —— 初版这一支是
	//     `fight != null && typeof fight === 'object' && !Array.isArray(fight)` ⇒ ★非对象形态（`'雾影'`／`['雾影']`／`3`）
	//     **不点名、不注入、build rc=0** ⇒ ★产物里那一段**没有战斗**，而它与"作者本就不想要战斗"**读数完全相同**
	//     ⇒ ★Testability Gate ②（success observability）不成立 ✗。
	//     ★手误可预期：相邻字段 `check` 是**字符串**（`check: "里屋·察觉"`）而 `fight` 是**对象** ⇒
	//     作者照 `check` 的样子写 `fight: "雾影"` 是很自然的一步，且**没有反馈** ✗。
	//     ⇒ ★本处改写：**存在但非对象 ⇒ 点名**（与"`pool` 缺/空"同一族：✗ 不静默产坏产物 ✓）。
	if (fight != null) {
		if (typeof fight !== 'object' || Array.isArray(fight)) {
			problems.push('段「' + name + '」的段级 `fight` 必须是**对象**（拿到 '
				+ (Array.isArray(fight) ? 'array' : typeof fight) + ' ' + JSON.stringify(fight) + '）——'
				+ ' 写法是 `fight: { pool: "<池名>", turns?, result?, dest? }`'
				+ '（★它是**对象**，✗ 不是字符串 —— 与相邻字段 `check` 的形**不同**）'
				+ ' ⇒ ✗ 静默跳过会让"这一段本就不打架"与"声明被忽略"**读数完全相同**（那一段就没有战斗 ✓）');
		} else {
			const pool = String(fight.pool ?? '').trim();
			if (!pool) {
				problems.push('段「' + name + '」的段级 `fight` **缺 `pool`**（或为空）—— 战斗池名是 `<<fightbegin>>` 的第一个参'
					+ '数，缺它注入的宏串无对象 ✗ ⇒ 补 `fight: { pool: "<池名>" }`（✗ 不静默注入半个宏 ✓）');
			} else {
				const hasTurns = fight.turns != null && fight.turns !== '';
				if (hasTurns && !Number.isFinite(Number(fight.turns))) {
					problems.push('段「' + name + '」的段级 `fight.turns` 不是**有限数**（拿到 '
						+ JSON.stringify(fight.turns) + '）—— 它是「打满 N 回合即收尾」的**机械事实**（回合数）✗ 不是文案 ⇒ 给个数 ✓');
				}
				const result = fight.result != null && String(fight.result).trim() !== '' ? String(fight.result).trim() : '';
				const dest = fight.dest != null && String(fight.dest).trim() !== '' ? String(fight.dest).trim() : '';
				// ★ 只有真给过值时**才补空槽**（全缺 ⇒ 收成两参形 `<<fightpanel "池">>`，与今天手写常见形同 ✓）
				const P = escapeMacroArg(pool);
				let panel;
				if (dest) panel = `<<fightpanel "${P}" ${hasTurns ? Number(fight.turns) : 'null'} ${result ? escapeMacroArg(result) : 'null'} "${escapeMacroArg(dest)}">>`;
				else if (result) panel = `<<fightpanel "${P}" ${hasTurns ? Number(fight.turns) : 'null'} ${escapeMacroArg(result)}>>`;
				else if (hasTurns) panel = `<<fightpanel "${P}" ${Number(fight.turns)}>>`;
				else panel = `<<fightpanel "${P}">>`;
				expanded = `<<fightbegin "${P}">><<fightlog>>${panel}\n${expanded}`;
			}
		}
	}
	if (ending && typeof ending === 'object') {
		const key = String(ending.key ?? '').trim();
		const kind = String(ending.kind ?? 'final').trim();
		expanded = `${expanded.replace(/\s+$/, '')}\n\n<<ending "${key}" ${kind}>>\n`;
	}
	return { body: expanded, problems, rl };
};

export const assemblePassages = ({ passages, known, forbidden = new Set(), terms = new Set(), data = null }) => {
	const problems = [];
	// 先校验（悬空须看全集 → 两遍）
	problems.push(...duplicateProblems({ passages }));   // `#1114` 2b-2a：重名段（跨源双写）→ 先报
	problems.push(...endingProblems({ passages, data }));   // `#1399`：结局声明面（唯一活声明 ＋ tags 死声明点名）
	problems.push(...doubleRenderProblems({ passages, data }));   // `#1412`：双渲染宏（手写宏 ＋ links 非空 ⇒ 渲染两遍）
	problems.push(...duplicateSourceProblems({ passages, data }));   // ★`#1570`：散文**来源唯一**（文件 ∧ 数据面 `text` ⇒ 点名）
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
		// ★ `#1574`：★段级 `reroll` 可**任一侧**声明（md 前言／数据面）—— ★两路径生成**同一 body** ⇒ 等价性门不红 ✓
		const segReroll = rerollDeclared(p.meta, dseg);
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
		// `#1399`：受制裁变换走**唯一实现** `applyPassageTransforms`（拼装面与判据面同源 ✓）
		const tr = applyPassageTransforms({ name: p.name, body: p.body, terms,
			params: dseg.params ?? {}, slots: [dseg.slot, ...linkSlots].filter(Boolean),
			args: (dseg.args && typeof dseg.args === 'object') ? dseg.args : inbound,
			links: dseg.links ?? [], present: dseg.present ?? null, ending: dseg.ending ?? null,
			check: dseg.check ?? null, fight: dseg.fight ?? null, reroll: segReroll });
		problems.push(...tr.problems);
		const expanded = tr.body;
		const tags = p.tags ? ` [${p.tags}]` : '';
		chunks.push(`:: ${p.name}${tags}\n${expanded}`);
	}
	return { twee: chunks.join('\n\n') + '\n', problems };
};
