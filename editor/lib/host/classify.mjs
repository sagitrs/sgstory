// `#794` P1①：**契约分类的缝**（宿主侧）—— 它要跑 `node:vm` 里的 `resolveLocalConst`
// 所以住 `lib/host/**`（core 不许碰宿主，K6 ③）；纯文本/纯数据的部分仍在 `lib/core/contract.mjs`。
//
//注意：**两个文本不能混**（抽缝时踩过）：`siteText`＝扫站点（翻面故事里是空串），
// `fileText`＝求值原文 —— 混用会把产物当手写源扫 → 成员数 2 → 25。
import { contractSites, contractMembers } from '../core/contract.mjs';
import { makeClassify } from '../core/classify.mjs';
import { literalValue } from './literals.mjs';
import { resolveLocalConst } from './sandbox.mjs';

const { classify } = makeClassify({ evalLiteral: literalValue });

/** **成员分类（可单测的缝）**：吃“数据面**原文** ＋ 逃生舱文本” → 出 `{ sites, stray, members, rows, locals, hatchMembers}`。
 * 为什么抽出来：`fileText` 那条路径（`() => <局部常量>` → `resolveLocalConst(fileText, …)`）在三个故事**都已翻面**后
 * **没有活样本** → 不抽成函数就**只能靠往仓里塞临时夹具**才能覆盖（会污染工作区）。
 * 抽成函数后：`fileText` 是**形参** → 原先那处“变量没定义 → `ReferenceError`”的形态**结构上不可能**再出现，
 * 且该路径可在**不需要任何夹具文件**的前提下被自证驱动。
 *注意：fixture 注意：本函数里 `resolveLocalConst` 会**跑**那段文本 → 文本自身要把沙箱依赖备好
 *（如 `window.Sg = { story: {}};`）—— 否则 `Object.assign((window.Sg.story??= …))` 抛错 → 落 catch → 判 B（**量不出真因**）。 */
export const classifyContractText = ({ fileText = '', siteText = null, hatchTexts = [] } = {}) => {
	//注意：**两个文本不能混**（我上一版混成一个 → 真回归，被 ④ 档读数当场抓到）：
	// `siteText`＝**扫站点**用的文本（原来是 `tableSrc` —— 已翻面故事里它**是空串** → 只扫手写逃生舱）；
	// `fileText`＝**求值**用的原文（`resolveLocalConst` 要能看到 `const MECH = …`）。
	// 混用后：翻面故事会把**产物**当手写源扫 → 成员数 2 → 25（输出面变化 → 只有"旧 main vs 新 head"能看见）。
	const allText = [siteText ?? fileText, ...hatchTexts].join('\n');
	const { sites, stray } = contractSites(allText);
	const members = sites.flatMap((s2) => s2.members);
	// **局部常量 → 成员名**（`#787`）：`mechanics: () => MECH` 这类成员把局部常量放进了契约 → 其它成员引用它时才可表达。
	const locals = new Map();
	const hatchMembers = new Set(contractMembers(hatchTexts.join('\n')).map((m) => m.name));
	for (const m of members) {
		const ref = /^\(\) => ([A-Za-z_$][\w$]*)$/.exec(m.src.replace(/\s+/g, ' ').trim());
		if (ref) locals.set(ref[1], m.name);
	}
	const rows = members.map((m) => {
		const c = classify(m.src, { locals });
		if (c.bucket === 'B' && c.kind === 'const' && c.spec?.ref) {
			const value = resolveLocalConst(fileText, 'Game Tables', c.spec.ref);
			if (value !== undefined && value !== null) return { name: m.name, src: m.src, bucket: 'A', kind: 'const', spec: { value }, resolvedFrom: c.spec.ref };
		}
		return { name: m.name, src: m.src, ...c };
	});
	return { sites, stray, members, rows, locals, hatchMembers };
};

