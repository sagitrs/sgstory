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
