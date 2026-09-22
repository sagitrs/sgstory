// `#794` 内核抽取 · **core 层**：纯文本助手。
// 约束：**浏览器安全** —— 本目录（`editor/lib/core/**`）不得出现 `node:fs`／`node:child_process`／`node:vm`
// 一类宿主能力；要读文件/起进程/跑沙箱 → 由 `editor/lib/host/**` 的实现注入（见该目录注释）。
// 抽出来的直接收益：`equiv` 与 `extract-story` 原先**互相 import**（环）——
// 纯文本助手归这里之后，依赖只剩一个方向：`host → core`。
import { maskComments } from './mask.mjs';

/** 纯函数：从 twee 文本里取某段段落的正文（不含 `:: 名字 [script]` 头）。 */
export const section = (text, name) => {
	const lines = String(text).split('\n');
	const start = lines.findIndex((l) => l.trim().startsWith(`:: ${name}`));
	if (start === -1) return null;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((l) => l.trim().startsWith(':: '));
	return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

/** 纯函数：全部 `[script]` 段的正文（按文件顺序）——L1 要它们一起跑才互可见。 */
export const scriptBodies = (text) => {
	const out = [];
	let cur = null;
	for (const l of String(text).split('\n')) {
		if (/^::\s+(.+?)\s+\[script\]\s*$/.test(l.trim())) { cur = []; out.push(cur); continue; }
		if (/^::\s/.test(l.trim())) { cur = null; continue; }
		if (cur) cur.push(l);
	}
	return out.map((b) => b.join('\n')).filter((b) => b.trim());
};

/** 纯函数：形式归一 —— 词法遮蔽注释 → 去空白 → 去**冗余尾逗号**（纯格式，JS 里无语义）。 */
export const normalize = (text) => maskComments(String(text))
	.replace(/\s+/g, '')
	.replace(/,(?=[}\]])/g, '');

	/** 纯函数：文本里是否带**行首**生成标记 —— 不锚定会把"注释里提到该词"的文件判成产物。
	 *（实测踩过：手写逃生舱文件的注释写了"本文件不带该标记" → 被排除出手写源 → 门报"登记腐烂"的假红。）
	 *
	 *注意：**模板串里的"行首 //"不算标记**（`#842`）：判断依据只是"行首像注释行" →
	 * ```js
	 * const t = `
	 * // @generated
	 * `;
	 * ```
	 * 里的那一行曾被误判成产物标记 → 于是**手写**的 `.twee` 会被当成"带标记的产物" → K4-④ 假红、手写源被误排除。
	 * → 修法（**最小行为增量**）：**先把模板串遮成等长空白**（**保换行** —— 谓词是**按行**锚定的）再套原正则；
	 * 只遮模板串（**不**动字符串与注释的既有口径 → 块注释里那行 `// …` 仍按旧口径算，不夹带别的语义变更）。
	 *注意：**已知边界**（不假装覆盖）：**嵌套模板**（`${ `…`}`）会被当作在第一个反引号处结束 → 该形**不在覆盖内**（`.twee` 里罕见）。
	 *注意：**已知边界②**（不假装覆盖，`#842`）：**未闭合的模板串**（`.twee` 的 `[script]` 里少写收尾反引号）→ 正则**匹配不到整段** → 那段里的行首 `// @generated` **仍会算标记** —— 该文件本身是**语法错误**（游戏跑不起来）→ 记为边界，不当缺陷修；谁要改这一条 → 用 `k4.mjs` 自证里那条边界用例**显式**改。
	/** 把**模板串**（反引号区域）遮成等长空白：**保换行**（谓词按行锚定）、保长度（便于逐字节对照）。 */
	export const maskTemplates = (text) => String(text ?? '').replace(/`(?:\\[\s\S]|[^\\`])*`/g, (m) => m.replace(/[^\n]/g, ' '));

export const hasGeneratedMarker = (text) => /^\s*\/\/\s*@generated\b/m.test(maskTemplates(text));

// ── 段落切分（车道 E · A 片，`#215` 报备 `18504548`）────────────────────────
// **纯**（零宿主）：吃 `{ file, text}`、吐段落清单 —— 从故事门 `stories/mist-forest/gates/reads.mjs`
// 的 `segmentsOf()` **逐字上移**分段那半（io 那半 `readFileSync` **留在门里** —— 与 `#877` 同款）。
// 为什么上移：页内要跑**同一份**分段（读侧 ② 读数 ＋ 发起者的 `--settle` 要段落源）
// → 自己不写第二份内核（K6 ①）。
//
//注意：**两个字段的分工**（容易被读混，写在这里）：
// · `src` ＝ **保行号**的处理（`/% … %/` **挖空成空格**；机制段再剥 JS 注释）—— 给**逐行找读点**用
//（行号不能漂 → 挖空而不是删除），`scanReads()` 吃的就是它；
// · `body` ＝ **去注释源文**（`/% … %/` **整段删除**）—— 与 `scripts/audit/context.mjs` 的 `passageSrc` **同口径**
//（`--settle` 那类"按段落正文判"的判据吃的是这一份）。
//注意：两种掩码**都保留**、**不合并**：合并＝让某一类消费者拿到错口径的文本（`segmentsOf` 搬上来之前只有 `src`）。
//
//注意：**已知重复**（如实写明）：`MECH_TAGS` 在 `scripts/audit/lib/shared.mjs` 里**另有一处定义**
//（它那边管 `--text` 面）。本件**不导出**该常量（导出会与那处撞 K6 ①「能力只许一处定义」）；
// **统一两处**属另一件事（会动到 CI 相邻件）→ **不在本片**。
const MECH_TAGS = ['script', 'widget', 'stylesheet'];

/** **纯**：`:: 段落名 [tags]` 切段 → `[{ file, passage, tags, kind, layer, line, src, body}]`（**段序 ＝ 文件内出现序**）。 */
export const paragraphsOf = ({ file, text } = {}, { layer = 'story' } = {}) => {
	const s = String(text ?? '');
	const out = [];
	const heads = [...s.matchAll(/^::\s*([^\n]*)\n/gm)];
	heads.forEach((m, i) => {
		const start = m.index + m[0].length;
		const end = i + 1 < heads.length ? heads[i + 1].index : s.length;
		const head = m[1];
		const tags = (head.match(/\[([^\]]*)\]/)?.[1] ?? '').trim().split(/\s+/).filter(Boolean);
		const kind = tags.some((t) => MECH_TAGS.includes(t)) ? 'mech' : 'narr';
		const raw = s.slice(start, end);
		out.push({
			file, passage: head.replace(/\[[^\]]*\]\s*$/, '').trim(), tags, kind, layer,
			line: s.slice(0, start).split('\n').length,
			// 注释**挖空**（不是删除）：示例不是代码，但**行号要留住**；机制段再剥 JS 注释（单一权威）。
			src: (() => {
				const t = raw.replace(/\/%[\s\S]*?%\//g, (c) => c.replace(/[^\n]/g, ' '));
				return (kind === 'mech' ? maskComments(t) : t);   // `#1208`：代码面 → 词法器（原来借散文面启发式）
			})(),
			// 去注释源文（与 `context.mjs` 的 `passageSrc` 同口径 → `--settle` 那类判据吃它）。
			body: raw.replace(/\/%[\s\S]*?%\//g, ''),
		});
	});
	return out;
};
