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
/** `#1016`：**declare-but-undone**（措辞判据——「指向现存」由既有 `referenceIntegrityProblems`（`b9406d4`/`#1052`「已入库 ∩ 存在」口径，更强 ✓）承担，本函数**不重复** ✗）。
 *
 * 字段值含「应当撤回／待删」等**自述未完成**措辞 ⇒ 红：要么落实、要么把措辞改成完成态 ✗。
 * 归一化＝剥 `*`（粗体打断）＋ 剥**全部空白**（空格/换行/全角）＋ 剥**零宽字符** ✗（防绕过 ✓）。
 * **完成标记豁免**（留痕优先 ✓）：reason 同时含完成态标记（如「已处理完毕」「历史记录」「不再使用」）⇒ **不报** ✓。
 * ⚠️ **抓不到什么**（如实 ✗）：
 *    · **完成标记豁免可被利用**：真未完成 ＋ 混入完成词（如「待删除…（不再使用旧路径）」）⇒ **不报** ✗（这是**代价**，不是留痕收益 ✓——结构性替代=`state` 字段，另票 ✓）；
 *    · 只咬简体字面表内形态——**繁体**（撤迴/刪除）、**表外同义词**（如「等着删」）、
 *    结构性变体（拆成两个字段、改写语气）**不在覆盖内** ✗；结构性替代（`state` 字段）另立票 ✓。
 * ⚠️ JSON 无注释 ⇒ 「剔注释只咬字段值」天然满足（`reason` 是字段 ✓）——同族口径 `test/multi-story.mjs` P6 ✓。 */
export const UNDONE_PHRASES = ['应当撤回', '待撤回', '待删除', '待清理', '应当撤销', '待撤销', '须撤回', '应删除'];
export const DONE_MARKERS = ['已撤回', '已处理', '处理完毕', '已完成', '已删除', '已移除', '不再使用', '历史记录', '曾标记'];
export const undoneProblems = (registry) => {
	const out = [];
	for (const h of registry?.hatches ?? []) {
		const reasonPlain = (typeof h.reason === 'string' ? h.reason : '').replace(/[*/\s\u200B-\u200D\uFEFF]/g, '');
		if (DONE_MARKERS.some((d) => reasonPlain.includes(d.replace(/\s/g, '')))) continue;   // 完成标记 ⇒ 留痕 ✓ 不咬
		for (const ph of UNDONE_PHRASES) {
			if (reasonPlain.includes(ph.replace(/\s/g, ''))) {
				out.push({ member: h.member ?? '?', why: `登记 \`reason\` 含**自述未完成**措辞「${ph}」且无完成标记 ⇒ 要么落实、要么改成完成态（\`#1016\`：声明↔落实——只咬简体表内形态，边界见判据注释）` });
				break;   // 一条 reason 只报首个命中（1 违规 1 项 ✓）
			}
		}
	}
	return out;
};

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

/**
 * **门面引用完整性**（`#1016`）：登记表里**指向仓内对象**的键必须**现存** ✓ —— 即"**声明了要做 X、实际没做**"的那个缺口。
 *
 * 为什么需要它 ✗（`#1004` 审阅期实测 ✓）：`hatches[]` 里留过 2 条 `slug:"mist-forest"`（故事已删 ✓），
 *   而**所有**门都不咬 —— `escapeHatchProblems` 按**故事**过滤（`h.slug === slug` ✓），已删故事的 slug
 *   **落不进任何一次**逐故事扫描 ⇒ 它**结构性不可见** ✗ ⇒ ⇒ "条目指向的东西已经没了"能安静留在仓里 ✓。
 *
 * 判据（一句话）：`hatches[].slug` ∈ **现存故事集合** ✓、`hatchFiles[]`／`refusedFaces[].file` **存在于工作树** ✓。
 *
 * ⚠️ **只咬字段值，绝不读散文字段** ✗（本仓"留痕优先" ✓）：本函数**不碰** `reason`／`why`／`paths`／`note`／
 *   `refusedFacesWhy` 等任何一个散文面 ⇒ "`reason` 里写『与 `mist-forest` 同形』"（历史留痕 ✓）**不会被罚** ✓ ——
 *   这条**由构造保证**（不是靠关键词白名单 ✓，见 `test/k4-references.mjs` 的正例③）。
 *
 * ⚠️ **`paths` 不属本条** ✗（它**不是路径** ✓）：`refusedFaces[].paths` 是**散文**（"三条路 (i)(ii)(iii)…" ✓，实测现值 ✓）
 *   ⇒ 对它做存在性判定＝**判了一件它不声称的事** ✗（同族坑："过门 ≠ 达意" ✓）。
 *
 * ⚠️ **`proseFaces` 的存在性不重复判** ✗（单一权威 ✓）：它已由 `handwrittenClosureProblems` 覆盖 ✓
 *   （实测：往 `proseFaces` 注入不存在路径 ⇒ 该判据 rc=1 并点名"路径写错或文件已不在" ✓）⇒ 本函数再判一次只会**重复报** ✗。
 *
 * ⚠️ **路径引用要求「已入库 ∩ 存在」** ✗（`#1052`，单条引用的存在性判定）：
 *   只判 `existsSync` 会把**未 `git add` 的新文件**算成「登记有效」✗ —— 那正是 `#1019`（「没扫」不许表现为
 *   「通过」）／`#1028`（「`git add` 之前跑 ＝ **假绿**」）**同一族**的形态 ✓  ⇒ 补一条**入库**判定：
 *   文件**在磁盘上但未入库** ⇒ 报**「未入库」**（与「不存在」**分开报** ✓ —— 二者的修法不同：一个 `git add`、一个改登记）。
 *   ⚠️ **只咬文件引用** ✗（`hatchFiles[]`／`refusedFaces[].file` ✓）：`hatches[].slug` 判的是**目录**（故事集合 ✓）、
 *     口径是「故事目录现存」✓ ⇒ 不并入本条（并入＝改判它一件它不声称的事 ✗，同 `paths` 那条边界 ✓）。
 *   ⚠️ 边界（`#1052` 记）：本门被判对象是**已入库的登记表** ✓ ⇒ **没有「漏扫整片」的面** ✓，
 *     仅此一格（**单条引用**）⇒ 非阻断级 ✓。
 *
 * `slugSet`／`existsOf`／`trackedOf` 由**宿主注入** ✓（`core/**` 不碰 fs／不碰 git ✓，与 `refusedFaceProblems` 的 `markerOf` 同一口径 ✓）。
 *
 * @param {{registry?:object, slugSet?:Set<string>|string[]|null, existsOf?:(rel:string)=>boolean, trackedOf?:(rel:string)=>boolean}} o
 */
export const referenceIntegrityProblems = ({ registry = {}, slugSet = null, existsOf = () => false, trackedOf = () => true } = {}) => {
	const out = [];
	const has = (v) => typeof v === 'string' && v.trim() !== '';
	const slugs = slugSet instanceof Set ? slugSet : new Set(slugSet ?? []);
	// 判据表：一条 ＝ 「位置 · 值 · 该值必须满足什么 · 不满足时怎么说」✓
	//   ⚠️ 值只从**这三处**取（全是结构键 ✓）—— 散文字段一个都不进表 ✓。
	const rows = [
		...((registry.hatches ?? []).map((h, i) => ({
			at: `hatches[${i}].slug`, value: h?.slug, ok: (v) => slugs.has(v),
			// ⚠️ `#1052` 的**入库**判定**只管文件类引用** ✗：本条判的是**目录**（故事集合 ✓）⇒ `tracks` 恒真 ✓
			//   （把它并进来＝改判一件它不声称的事 ✗ —— 同 `paths` 那条边界 ✓）。
			tracks: () => true, kind: '故事',
			why: `指向**不存在的故事** \`stories/${h?.slug ?? ''}/\` ✗ ⇒ 条目已无对象可挂（故事被删／改名）⇒ **删掉这条登记**（清单只许收缩 ✓）`,
		}))),
		...((registry.hatchFiles ?? []).map((f, i) => ({
			at: `hatchFiles[${i}]`, value: f, ok: (v) => existsOf(v),
			tracks: (v) => trackedOf(v), kind: '逃生舱文件',
			why: '指向**不存在的文件** ✗ ⇒ 该手写逃生舱文件已搬走／改名，登记腐烂（`editor/equiv.mjs` 会拿它当等价门的产物侧输入 ✗）',
		}))),
		...((registry.refusedFaces ?? []).map((f, i) => ({
			at: `refusedFaces[${i}].file`, value: f?.file, ok: (v) => existsOf(v),
			tracks: (v) => trackedOf(v), kind: '不数据化的面',
			why: '指向**不存在的文件** ✗ ⇒ "不数据化的面"登记腐烂（路径写错或文件已不在）',
		}))),
	];
	for (const r of rows) {
		// ⚠️ 缺字段／空值**不归本条** ✓（形式约束由各自的判据点名 ✗ —— 如 `refusedFaceProblems` 的四字段 ✓）
		if (!has(r.value)) continue;
		// ① **不在磁盘上** ⇒ 报「不存在」（既有判据 ✓）
		if (!r.ok(r.value)) { out.push({ at: r.at, value: r.value, why: r.why }); continue; }
		// ② 在磁盘上但**未入库**（`#1052`）⇒ 报「未入库」✓ —— **分开报**（修法不同：一个是改登记、一个是 `git add` ✓）。
		//   ⚠️ 顺序不可反 ✗：先判磁盘 ⇒ 一个**被删且未入库**的文件报「不存在」（磁盘口径是真因 ✓），
		//     而不是报「未入库」（那会说错修法 ✗）。
		//   ⚠️ `tracks` 缺省为**恒真**（不是缺省为「跳过」 ✗）：缺省跳过 ＝ 新增行会**静默不判入库** ⇒
		//     回到本片要修的“没扫却看着像过了” ✗。⇒ 现有三行都已显式声明 `tracks` ✓；这条缺省只是防未来
		//     加行时**当场炸**（实测踩过：`hatches` 漏写 `tracks` 时抛 `TypeError` ✓）⇒ 改成可读的语义：
		//     “本条不要求入库”（适用于**非文件类**引用：如故事目录集合 ✓）。
		const tracks = r.tracks ?? (() => true);
		if (!tracks(r.value)) out.push({ at: r.at, value: r.value, untracked: true, why: `指向**未入库的文件** ✗（${r.kind ?? '文件类引用'}）⇒ 该引用**本次没被真判过**（磁盘上在、git 里不在）—— \`git add\` 之后再跑本门，否则是**假绿**（\`#1028\` 一族 ✓：\`git add\` 之前跑门 ≠ 过门）` });
	}
	return out;
};
