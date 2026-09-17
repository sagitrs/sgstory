// `#794` 内核抽取 · **core 层**：纯文本助手。
// 约束：**浏览器安全** —— 本目录（`editor/lib/core/**`）不得出现 `node:fs`／`node:child_process`／`node:vm`
// 一类宿主能力；要读文件/起进程/跑沙箱 ⇒ 由 `editor/lib/host/**` 的实现注入（见该目录注释）。
// 抽出来的直接收益：`equiv` 与 `extract-story` 原先**互相 import**（环 ✗）——
// 纯文本助手归这里之后，依赖只剩一个方向：`host → core`。
import { maskComments } from '../../../scripts/audit/lib/mask.mjs';

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

/** 纯函数：形式归一 —— 词法遮蔽注释 ⇒ 去空白 ⇒ 去**冗余尾逗号**（纯格式，JS 里无语义）。 */
export const normalize = (text) => maskComments(String(text))
	.replace(/\s+/g, '')
	.replace(/,(?=[}\]])/g, '');

	/** 纯函数：文本里是否带**行首**生成标记 ✓ —— 不锚定会把"注释里提到该词"的文件判成产物。
	 *  （实测踩过：手写逃生舱文件的注释写了"本文件不带该标记" ⇒ 被排除出手写源 ⇒ 门报"登记腐烂"的假红。）
	 *
	 *  ⚠️ **模板串里的"行首 //"不算标记**（`#842`）：判断依据只是"行首像注释行" ✗ ⇒
	 *  ```js
	 *  const t = `
	 *  // @generated
	 *  `;
	 *  ```
	 *  里的那一行曾被误判成产物标记 ✗ ⇒ 于是**手写**的 `.twee` 会被当成"带标记的产物" ⇒ K4-④ 假红、手写源被误排除。
	 *  ⇒ 修法（**最小行为增量** ✓）：**先把模板串遮成等长空白**（**保换行** ✓ —— 谓词是**按行**锚定的 ✓）再套原正则 ✓；
	 *    只遮模板串 ✗（**不**动字符串与注释的既有口径 ✓ ⇒ 块注释里那行 `// …` 仍按旧口径算 ✓，不夹带别的语义变更 ✓）。
	 *  ⚠️ **已知边界**（不假装覆盖 ✓）：**嵌套模板**（`${ `…` }`）会被当作在第一个反引号处结束 ⇒ 该形**不在覆盖内** ✗（`.twee` 里罕见 ✓）。
	/** 把**模板串**（反引号区域）遮成等长空白：**保换行** ✓（谓词按行锚定 ✓）、保长度 ✓（便于逐字节对照 ✓）。 */
	export const maskTemplates = (text) => String(text ?? '').replace(/`(?:\\[\s\S]|[^\\`])*`/g, (m) => m.replace(/[^\n]/g, ' '));

export const hasGeneratedMarker = (text) => /^\s*\/\/\s*@generated\b/m.test(maskTemplates(text));
