// `#877`（P2 第二片）**状态读写诊断·纯件（第一块：形状与对齐）** ✓
//
// 为什么在这一层：页面要"**编辑即诊断**" ✓ ⇒ 判定必须**能在浏览器里跑** ✗（子进程门跑不了 ✓）。
//   ⇒ 于是把"判定"抽到 core（纯 ✓ 无 io ✓）、**事实由调用方注入** ✓：
//   · **页面**只有包内事实 ⇒ 喂得出就判 ✓、喂不出就打 `info`「本件不适用」✓（照 `editor/lib/core/diagnose.mjs` 同形 ✓ **不是 error** ✗）；
//   · **CLI 门**（`stories/mist-forest/gates/notes.mjs`）把从 twee／引擎取到的事实**注入同一份判定** ✓ ⇒ **一处实现 · 两份输入** ✓（不是两份实现 ✗）。
//
// 与 `editor/lib/core/diagnose.mjs` 的**同形契约**（逐项 ✓）：
//   · 返回 `[{ level, step, detail, target: { event, field } }]` ✓ —— 四键同名同义 ✓；
//   · `level` 取值只用 `error`／`warn`／`info` ✓；
//   · 输出**显式排序** ✓ 且键**逐字相同**：`` `${event}|${field}|${detail}` `` ✓
//     （⇒ 两侧对**同一份输入**必须得到**逐字节相同**的 findings ✓；④ 类缺陷"读数里掺环境"由此可检 ✓）；
//   · "不适用"形 ＝ `level: 'info'`, `step: 'applicable'` ✓；
//   · 渲染**不在这里重写** ✗ ⇒ 用 `diagnose.mjs` 的 `formatFinding`／`summarize` ✓。
//   · 差异（**已声明** ✓）：本件 `step` 用 `'shape'` ✓（`diagnose.mjs` 用 `row`／`package`／`applicable` ✓）—— 两者不冲突 ✓，但**是**一个面差异 ✓。
//
// 本块（#877 第一块）：`auditShape` —— 笔记条的**字段齐全 ＋ 状态契约域对齐** ✓。
//   ⇒ 它是**自足**的 ✓（只用本文件的常量与局部助手 ✓，不拉 `scripts/**` ✓）⇒ 因此可先落 ✓。
//
// ⚠️ **已抽 / 未抽**（件名声称的比现在交付的多 ✗ ⇒ 必须写明，免得下一个人以为漏了 ✓）：
//   · **已抽** ✓：`auditShape` ✓（＋它的两个局部助手 `flagPaths`／`keyOf` ✓）
//   · **未抽** ✗（仍住 `stories/mist-forest/gates/notes.mjs` ✓）：`rowReads`／`auditConsumption`／
//     `notepathProblems`／`singleReadProblems`／`singleWriteProblems` ✓
//     ⇒ 它们都依赖 `scripts/audit/lib/shared.mjs` 的纯帮手（`ruleRowKeys`／`declCondRefs`／`readKeys`… ✓）
//       ⇒ 必须等前置切片 `#881`（把纯帮手搬进 core ✓）落地后才可能做**逐字搬运** ✓。
//   · **未抽·另一门** ✗：`stories/mist-forest/gates/reads.mjs` 的同族六个 ✓（同需 `#881` ✓）。
//   · **本块不涉及** ✗：`info`／`applicable` 那条路 —— 形状判定对**任何包**都适用 ✓ ⇒ 无"缺面"可言 ✓；
//     "缺面逐行 `info`"要等吃 twee／引擎事实的那几块才出现 ✓。

const REQUIRED = ['title', 'src', 'body', 'tags', 'era', 'flagPath'];
// `flagPath` 可以是字符串或**字符串数组**（多源 OR，`#432-B8/B12`）
export const flagPaths = (e) => (Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath == null ? [] : [e?.flagPath]));
/** 「域.键」⇒ 键 ✓（`auditShape` 与门里「空状态」检查**共用** ✓ ⇒ 必须转出 ✓ —— 删本地副本时它是第三个消费者 ✓）。 */
export const keyOf = (p) => String(p ?? '').split('.').pop();

/** 内部：造一条 finding（**同形** ✓；渲染交给 `diagnose.mjs` 的 `formatFinding` ✓）。 */
const finding = ({ level = 'error', step = 'shape', detail, event = null, field = null }) =>
	({ level, step, detail, target: { event, field } });

/**
 * **形状与对齐** ✓：`entries` ＝ 笔记表（`{ id: {...} }`）· `domainKeys` ＝ **状态契约域**的键集（Set ✓）。
 * 判：① 每条笔记字段齐全 ✓ ② `grant` 要么是函数要么省略 ✓ ③ 每个 `flagPath` 是「域.键」形状 ✓ 且其键**已登记在契约域** ✓。
 * ⚠️ `detail` 文案与搬家前**逐字相同** ✓（门输出逐字节不变 ✓）；结构化 `field` 是**纯加法** ✓（不打印 ✗，只给判据用 ✓）。
 */
export const auditShape = (entries, domainKeys) => {
	const out = [];
	for (const [id, e] of Object.entries(entries ?? {})) {
		for (const f of REQUIRED) {
			const v = e?.[f];
			const empty = v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
			if (empty) out.push(finding({ detail: `缺字段「${f}」`, event: id, field: f }));
		}
		if (e?.grant != null && typeof e.grant !== 'function') out.push(finding({ detail: 'grant 必须是函数或省略（省略＝用 flagPath 求值）', event: id, field: 'grant' }));
		for (const p of flagPaths(e)) {
			const key = keyOf(p);
			// 「域.键」形状：域只能是 ev / world（笔记读的是知识与世界态；持有物不进笔记——#432-B11）
			if (!/^(ev|world)\.[a-z_]\w*$/.test(String(p ?? ''))) out.push(finding({ detail: `flagPath「${p}」不是「域.键」形状（应为 ev.<键> 或 world.<键>）`, event: id, field: 'flagPath' }));
			else if (!domainKeys.has(key)) out.push(finding({ detail: `flagPath 的键「${key}」未登记在状态契约域（--state）里`, event: id, field: 'flagPath' }));
		}
	}
	// **排序键与 `diagnose.mjs` 逐字相同** ✓（⇒ "重叠面逐字节相同"可检 ✓、且不掺外部顺序 ✓）
	return out.sort((a, b) => `${a.target.event}|${a.target.field}|${a.detail}`.localeCompare(`${b.target.event}|${b.target.field}|${b.detail}`));
};
