// K4 判据的**纯函数**部分（`#762` 车道 C · `#794` 第 4 条切片）✓
//
// 为什么单独一个文件：命令体搬去 `lib/host/commands.mjs`（它要跑编译器／git ⇒ 属宿主侧 ✓）之后，
// **判据只吃文本与数据** ✓ ⇒ 按 `#794` 的分层（纯 ⇒ core ✓、宿主能力 ⇒ host ✓）把纯的部分落在这里 ✓
// ⇒ 于是"命令体"与"自证"**共用同一具身体** ✓（不是两份实现 ✗），且 core 侧可被浏览器宿主复用 ✓。
//
// **纯搬运**：本文件的函数体、注释、判据口径与 `editor/k4.mjs` 中同名者**逐字相同** ✓
// ⇒ 由"旧 main vs 本 head"的**两时点差分**证明输出零变化 ✓（见 PR 证据）。

// 标记谓词：**行首的注释行**才算标记（不锚定会把「注释里提到这个词」的文件误判成产物）——
// 实测踩到：手写逃生舱文件的注释写了「本文件不带该标记」⇒ 被排除出手写源 ⇒ 分类器看不见它的成员 ⇒ 门报「登记腐烂」的假红。
// （写法上避开：注释里不要写出「星号紧跟斜杠」的字符对 —— 那会提前终结块注释 ✗，实测把整个文件炸成 SyntaxError。）
// ⚠️ **一处定义** ✓：本文件**不再自带**这份实现 ✗ ⇒ 用 `core/text.mjs` 的 `hasGeneratedMarker` ✓
//  （此前是两份逐字相同的实现：K4 侧一份、`text.mjs` 一份 ✓）。**去重的依据是"先证同再删"** ✓：
//   16 例语料（含行内提及／字符串里提及／CRLF／空串/null／多行模板串／三斜杠／块注释／大文件）**零分歧** ✓。
import { hasGeneratedMarker } from './text.mjs';
export const MARKER = '@generated';

/** 纯函数①：**带标记**判据 —— 生成物首部必须有 `@generated`（含源路径）。 */
export const markerProblems = (files) => {
	const out = [];
	for (const f of files ?? []) {
		if (!String(f.text ?? '').includes(MARKER)) out.push({ path: f.path, why: `生成物没有 \`${MARKER}\` 标记（谁生成、源在哪都看不出来）` });
	}
	return out;
};

/**
 * 纯函数④：**生成物不许独改**（K4-④）—— 迁移期的"两处真相"守卫。
 *
 * 背景：D2 把 twee 定为**产物**、`data/*.json` 为源 ⇒ 一旦某故事"翻面"，工作区里的 twee 只是**投影**。
 * 但"翻面"这个动作本身会制造**两处真相**：有人直接改 tracked 的 twee（看起来跑得通、`equiv` 也可能因为
 * 改了源而变绿），而 `data/` 没动 ⇒ **下次重编就被覆盖**，或更坏：漂移悄悄留着。
 *
 * 判据（**字节面**，不用分类器桶 —— 值 vs 源码那类坑桶分类看不出来）：
 *   对故事目录里**带 `@generated`** 的 tracked `*.twee`，
 *   ① 编译器必须**仍产出同名文件**（否则来源已断 ⇒ 自称产物却没人再生成它）；
 *   ② 其字节必须等于**当场从 `data/` 重编**的产物（否则＝改了产物没改源）。
 * 天然棘轮：**只对带标记的文件生效** ⇒ 手写故事零影响，某文件一旦开始生成就不许再手改。
 * `marks === 0` ⇒ 调用方**必须留痕打印**（"尚未翻面"是**状态**，不是"没问题"）。
 */
export const staleTrackedProblems = (tracked, out) => {
	const marks = tracked.filter(([path, text]) => path.endsWith('.twee') && hasGeneratedMarker(text));
	const problems = [];
	for (const [path, text] of marks) {
		const base = path.split('/').pop();
		if (!(base in out)) { problems.push({ path, why: '自带 `@generated` 却**无同名产物**（来源已断：没人再从 `data/` 生成它）' }); continue; }
		if (text !== out[base]) problems.push({ path, why: '与**当场从 `data/` 重编**的产物**不一致** ⇒ 有人改了 tracked 的生成物而没改 `data/`（两处真相）' });
	}
	return { marks: marks.length, problems };
};

/**
 * 纯函数③前置：**手写契约源** = 故事目录里所有 `*.twee` 中**不带 `@generated`** 的那些。
 * 为什么按这个口径：分类器判的是"故事**今天声明**的契约形状"——
 *   · 未数据化：契约就在手写 twee 里 ⇒ 分类它 ✓；
 *   · 已数据化：那些 twee 是**产物** ⇒ 分类它们会得到**假欠账**（实测：发射后的 `template` 被判 B，
 *     可它在数据侧是**已支持的 kind**）⇒ 必须排除；数据化故事的逃生舱由编译器的 kind 白名单把关。
 * ⇒ 于是"某故事全部 twee 都是产物"＝**契约已无手写源**，C 桶结构性为 0（留痕打印，不静默）。
 */
export const contractSourceText = (files) => {
	const twee = files.filter(([name]) => name.endsWith('.twee'));
	const hand = twee.filter(([, text]) => !hasGeneratedMarker(text));
	return { text: hand.map(([, t]) => t).join('\n'), handCount: hand.length, markedTwee: twee.length - hand.length, otherCount: files.length - twee.length };
};

/** 纯函数②：**新鲜度**判据 —— 同一份 data 编两次必须逐字节相同（手改产物会在下一次编译被覆盖 ⇒ 这里红）。 */
export const freshnessProblems = (a, b) => {
	const out = [];
	const names = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
	for (const n of names) {
		if ((a?.[n] ?? null) === null) out.push({ path: n, why: '第二次编译没有产出这个文件（产物集合不稳定）' });
		else if (a[n] !== b[n]) out.push({ path: n, why: '两次编译产物不同（不幂等）' });
	}
	return out;
};

/** 纯函数③：**逃生舱可枚举**判据（双向）——
 *  `classified` ＝ 分类器输出（`[{name, bucket, src}]`）· `registry.hatches` ＝ 登记表。 */
export const escapeHatchProblems = (classified, registry, slug = null) => {
	const out = [];
	// **按故事**过滤（登记表是跨故事的 ⇒ 不按 slug 过滤会把别的故事的登记误判成"腐烂"）
	const rows = (registry?.hatches ?? []).filter((h) => (slug == null ? true : h.slug === slug));
	const cBucket = (classified ?? []).filter((m) => m.bucket === 'C').map((m) => m.name).sort();
	const listed = [...new Set(rows.map((h) => h.member))].sort();
	for (const n of cBucket) if (!listed.includes(n)) out.push({ member: n, why: '分类器判为 **C 桶**（含任意逻辑）却没登记 ⇒ 逃生舱必须**可枚举**（补 `editor/escape-hatch.json`：理由 ＋ 票号）' });
	for (const n of listed) if (!cBucket.includes(n)) out.push({ member: n, why: '登记为逃生舱，但分类器**已不把它判为 C 桶**（很可能已被声明式 kind 覆盖）⇒ 删掉这条登记（清单要收缩，不许长期挂账）' });
	// 登记条目自身必须带理由与票号（形式约束）
	for (const h of rows) {
		if (!h.reason || !h.ticket) out.push({ member: h.member, why: '登记条目缺 `reason`／`ticket`（例外必须可追）' });
	}
	return out;
};

/** **"不数据化的面"**（`refusedFaces`）的检查 ✓ —— 与 `escapeHatchProblems()` **同构**（清单只许收缩 ✓ ＋ 条目必带理由票号 ✓）。
 *
 *  ⚠️ **为什么单列一族**（`#215` `18508333` 实测 ✓）：既有两个容器**都不能**装它 ——
 *   · `hatches` 按**契约成员名**登记 C 桶 ✓（本族登记的是**文件/面** ⇒ 拿成员名去登记会**当场判"登记腐烂"** ✗）；
 *   · `hatchFiles` 会被 `editor/equiv.mjs` **拼进等价门的产物侧** ✓（＝宣称"这些手写件属于生成契约"✗）⇒ 改的是**判据的输入** ✗。
 *
 *  `markerOf(rel)` ＝ 宿主注入的"该件**是否已带 `@generated`**"✓（**纯**函数不碰 fs ✗ —— 与 `core/**` 的老口径一致 ✓）。
 *  判据两条：① 四条字段（`file`／`why`／`ticket`／`paths`）缺一 ⇒ 点名 ✗；
 *           ② **已带 `@generated`**（＝其实已数据化 ✓）⇒ **红** ✗（**只许收缩** ✓ —— 把条目删掉，那条注释归它的迁移 PR ✓）。 */
export const refusedFaceProblems = (faces = [], { markerOf = () => false } = {}) => {
	if (!Array.isArray(faces)) return [{ file: null, why: '`refusedFaces` 不是数组 ✗' }];
	const out = [];
	for (const [i, f] of faces.entries()) {
		const at = `refusedFaces[${i}]`;
		if (!f || typeof f !== 'object' || Array.isArray(f)) { out.push({ file: null, why: `${at} 不是对象 ✗` }); continue; }
		for (const k of ['file', 'why', 'ticket', 'paths']) {
			if (typeof f[k] !== 'string' || !f[k].trim()) out.push({ file: typeof f.file === 'string' ? f.file : null, why: `${at} 缺 \`${k}\` ✗（不迁移的面也要可追：**理由 ＋ 票号 ＋ 那条退路** ✓）` });
		}
		if (typeof f.file === 'string' && f.file.trim() && markerOf(f.file)) {
			out.push({ file: f.file, why: `${at}（\`${f.file}\`）**已经带 \`@generated\`** ✗ ⇒ 它其实**已数据化** ✓ ⇒ **登记腐烂**：删掉这条（清单只许收缩 ✓）` });
		}
	}
	return out;
};

/**
 * **手写面闭合**（`#987`）：`手写面 − 登记面 − prose 白名单 − 逃生舱文件 ＝ ∅` ✓。
 *
 * 为什么需要它 ✗：`refusedFaceProblems` 只校验**已登记条目** ✓ ⇒ "**有没有该登记却没登的**"只能靠人算 ✓
 *   （`#985` 之前漏登过 3 件而门**全绿** ✗）。
 *
 * ⚠️ **口径必须用 `hasGeneratedMarker`** ✗（不新造 ✓）：它就是"**行首 `// @generated`**" ✓（先遮蔽模板串 ✓）——
 *   `stories/mist-forest/16-hooks.twee` 第 11 行**在注释里引用**这个标记来声明"本文件不带它" ✓ ⇒
 *   "grep 到就算生成物"会把它**误判** ✗（实测：那个口径给 9/13，正确口径给 **8/14** ✓）。
 *
 * ⚠️ **豁免是三类、语义不同 ⇒ 分开减** ✗（⛔ 不合并成一个"豁免表"）：
 *   ① `refusedFaces` ＝ **可数据化但当下不划算** ✓（含退路 ＋ 重开条件 ✓）
 *   ② `proseFaces`   ＝ **不可数据化：散文** ✓（设计稿 §3「文本留文本」✓）
 *   ③ `hatchFiles`   ＝ **B/C 桶成员的手写逃生舱** ✓（既有机制 ✓：`hatches` 带理由 ＋ 票号 ✓）
 *
 * @param {{handwritten?:string[], refused?:string[], prose?:string[], hatches?:string[], markerOf?:(f:string)=>boolean}} o
 */
export const handwrittenClosureProblems = ({ handwritten = [], refused = [], prose = [], hatches = [], markerOf = () => false } = {}) => {
	const out = [];
	const covered = new Set([...refused, ...prose, ...hatches]);
	// ① 每件手写面**都要有归属** ✓（逐件点名 ✗ —— ⛔ 不写成"数量相等"：并行跑器下临时件会来 ⇒ 计数等值会随机红 ✓）
	for (const f of handwritten) {
		if (!covered.has(f)) out.push({ file: f, why: `手写面 \`${f}\` **没有归属** ✗ ⇒ 三选一：\`refusedFaces\`（可数据化但当下不划算 ✓）／\`proseFaces\`（不可数据化：散文 ✓）／\`hatchFiles\`（B/C 桶逃生舱 ✓）` });
	}
	// ② 白名单**只许收缩** ✗：`proseFaces` 里的件若**已成生成物** ⇒ 红（照 `refusedFaceProblems` 的同款口径 ✓）
	for (const f of prose) {
		if (!handwritten.includes(f)) {
			out.push({ file: f, why: markerOf(f)
				? `\`proseFaces\` 登记腐烂：\`${f}\` **已经带 \`@generated\`** ✗ ⇒ 它其实**已数据化** ✓ ⇒ 删掉这条（白名单**只许收缩** ✓）`
				: `\`proseFaces\` 里的 \`${f}\` **不在手写面里** ✗ ⇒ 路径写错或文件已不在（防呆 ✓）` });
		}
	}
	return out;
};
