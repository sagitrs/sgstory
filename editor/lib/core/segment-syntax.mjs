// `#1176`：生成件的脚本体语法检查（B3 事故的护栏）。
//
// 事故形态（2026-09-22）：emit 出的脚本段里，箭头函数后直接跟对象字面量花括号，被解析成块语句；
// 块内字符串标签非法，整段脚本解析失败，引擎因此不启动（症状是 Game 与 Sg 都是 undefined，
// 且这个错误不带 Uncaught 前缀，容易被错误过滤漏掉）。这种坏段会静默进产物，因此在生成处当场拦下。
//
// 判据：对每个生成件的每个脚本段，把段落正文交给解析器**只解析、不执行**；解析失败即点名。
// 解析器由宿主注入（core 不许依赖 node:*，见 K6 ③ 的判据）。
import { parseTweePassages } from './passages.mjs';

/** 会被引擎当脚本执行的段落标签。 */
export const SCRIPT_TAGS = ['script'];

/** 纯函数：生成件映射（文件名 到 全文）转成脚本段清单。 */
export const scriptSegments = (files) => {
	const out = [];
	for (const [file, text] of Object.entries(files ?? {})) {
		for (const p of parseTweePassages(String(text))) {
			const tags = (p.tags ?? []).map((t) => String(t).trim().toLowerCase());
			if (tags.some((t) => SCRIPT_TAGS.includes(t))) out.push({ file, name: p.name, body: p.body ?? '' });
		}
	}
	return out;
};

/** 纯函数：语法检查。`parse(code)` 抛错即判坏段（宿主注入解析器，如 `new vm.Script(code)`）。 */
export const scriptSyntaxProblems = ({ files, parse }) => {
	const out = [];
	for (const seg of scriptSegments(files)) {
		try {
			parse(seg.body);
		} catch (e) {
			out.push({ file: seg.file, passage: seg.name, why: String(e?.message ?? e) });
		}
	}
	return out;
};
