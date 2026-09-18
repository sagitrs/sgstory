// 车道 E-B3（`#215` 报备 `18504078` ✓）＋ **A 片取件面**（报备 `18504548` ✓，裁 `18504552` ✓）：**读侧（`--reads`）**那一面的显示层 ✓
// —— 只做"取输入 ⇒ 调内核 ⇒ 交给 DOM" ✗，不含判定 ✓。
//
// 判据**复用** core ✓（页内不重写 ✗）：
//   · ① 级 ＝ `core/stateDiagnose.mjs::tableReadProblems` ✓（与 CLI 门**同一份** ✓，门侧证据 ＝ `stories/mist-forest/gates/reads.mjs` ✓）；
//   · ② 级 ＝ `core/text.mjs::paragraphsOf` ✓（分段 ✓ —— **A 片从门里上移** ✓）＋ `core/stateDiagnose.mjs::scanReads` ✓。
//
// ⚠️ **适用面写清**（车道 E 判据 ② ✓；发起者 `18504552` 逐条批 ✓）：`--reads` 门分**三级**，页内**跑得起的只有两级的一半** ✗ ——
//   ① **【硬】条件表行**（行里 `req`／`any`／`exclude`／`prereq`／`yields`／`text` 不得含**字面状态读** ✓）⇒ **判红 ＋ 与 CLI 同判** ✓
//      （输入 ＝ **包内 `rules.json` 的 rows** ✓）；
//   ② **【硬＋基线】故事面知识键直读** ⇒ 页内**只列不判** ✗ —— 给出"**谁在哪个段落字面读了什么键**"✓，
//      但**判不了**"这是不是知识键／是不是基线外"✗：那两样要 **`Sg.Notes.entries`（引擎侧）** ＋ **该故事读基线（宿主 io）** ✗；
//   ③ **【报告／`--strict`】非知识键直读**（叙事／声明表／机制三面汇总 ✓）⇒ 页内给**清单**（同 ② 的那 78 处 ✓），
//      但**汇总口径**（哪些算叙事／声明／机制 ✓）**只在 CLI** ✗。
//   ⚠️ **机制面（`src/**`）不在页内** ✗：用户选的是**故事目录** ⇒ `src/engine/**` 那些 twee 不在取件面内 ✓（**如实说** ✗，不假装覆盖 ✓）。
//   ⇒ 读数里写的是"**① 同判 ✓／②③ 只列不判 ✗**"（㉑／㉕）—— **不把"部分"报成"全部"** ✗。
//
// ⚠️ **覆盖率那条 `已接线` 是模块身份级代理** ✗（`scripts/report-page-coverage.mjs` 件头自陈"必要不充分" ✓）：
//   A 片之后 `--reads` 那格仍标"已接线" ✓，但**页内只到 ①②的上述程度** ✗ ⇒ 以**本读数的适用面**为准 ✓（发起者 `18504552` 点名要求 ✓）。
//
// **缺 vs 畸形** ✓（照 `core/diagnose.mjs` 既有口径 ＋ 发起者 2026-09-18 15:05 裁定的「缺 ⇒ 合法」✓）：
//   · **缺** `rules.json` ⇒ **本件不适用** ✗、**不抛** ✗；**畸形**（在册而 `rows` 不是数组 ✓）⇒ **讲人话地抛** ✓。
//
// **浏览器安全** ✓：零宿主 ✓。

import { tableReadProblems, scanReads } from '../lib/core/stateDiagnose.mjs';
import { paragraphsOf } from '../lib/core/text.mjs';
import { fingerprintOf } from '../lib/core/fingerprint.mjs';

const PLACEHOLDER = '（读侧诊断：未载入 ✓）';

/** 「本包没有条件表 ⇒ 本件不适用」那两行 ✓ —— 明写"不适用"✗，免得被读成"跑过了、没问题"✗。 */
export const READ_NOT_APPLICABLE_LINES = [
	'读侧（`--reads` 面 ✓）：本包**没有 `rules.json` 数据面** ⇒ 本件不适用 ✓（**不是**"条件表干净" ✗）',
	'[info] applicable · 读侧（`--reads` 面 · ① 条件表行级）：本件不适用 ✓（这一步在 CLI ✓）',
];

/** **段落源 ⇒ 故事面字面状态读清单** ✓（**纯** ✓ —— 分段与扫点都在 core ✓，本件只把两者接起来 ✓）。
 *  顺序＝`sources` 给什么顺序就是什么顺序 ✗（调用方按 `file` 排好 ✓ ⇒ 可复现 ✓）；**不吞不并** ✗。 */
export const storyReadsOf = (sources = []) =>
	scanReads(sources.flatMap(({ file, text }) => paragraphsOf({ file, text })));

/** 清空那一格 ✓（照 `#946` 同族：换包/失败时**旧读数必须消失** ✗）。 */
export const clearReadFaces = ({ doc, containerId = 'readfaces' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (el) el.textContent = PLACEHOLDER;
};

/** 读数 ⇒ 逐行 ✓（**纯函数** ✓：只把 core 的结论变成人读的行 ✗，不判定 ✓，不重排文案 ✗）。 */
export const readFacesLines = ({ rows = [], rowsSha = null, problems = null, hits = null, sourceFiles = 0 } = {}) => {
	const probs = problems ?? tableReadProblems(rows);
	const L = [];
	L.push(`读侧（\`--reads\` 面 ✓ · 页内跑的是**① 条件表行那一级（硬判 ✓ 与 CLI 同判）** ＋ **② 只列不判** ✗）：输入 rows ${rows.length} 行 · 输入指纹 ${rowsSha ?? '(未报 ✗)'}`);
	L.push(`  ① 条件表行读点：${probs.length} 处${probs.length ? ` ⇒ ${probs.map((p) => `「${p.id}」.${p.field}：${p.what}（${p.detail}）`).join(' · ')}` : ' ✓'}`);
	if (hits === null) {
		L.push(`  ② 故事面字面状态读：**本件不适用** ✓ —— 没选到段落源（选故事**目录**即带上 \`*.twee\` ✓）`);
	} else {
		const byKind = { narr: 0, mech: 0 };
		for (const h of hits) byKind[h.kind === 'mech' ? 'mech' : 'narr'] += 1;
		L.push(`  ② 故事面字面状态读（**读数** ✗ —— 页内**不判红** ✓）：${hits.length} 处（叙述 ${byKind.narr} · 故事机制/声明 ${byKind.mech}）｜源 ${sourceFiles} 件`);
		for (const h of hits) L.push(`      · ${h.file}:${h.line} 「${h.passage}」${h.key}${h.kind === 'mech' ? '（机制段 ✓）' : ''}`);
	}
	L.push('[info] applicable · 页内**不判**：② 的"哪些是**知识键**／是否**基线外**" ＋ ③ 的叙事·声明·机制**汇总口径**：本件不适用 ✓（这一步在 CLI ✓）');
	L.push('  ⚠️ 不判的理由**只有一条** ✗：②③ 的判红要 **`Sg.Notes.entries`（引擎侧）** ＋ **该故事读基线（宿主 io）** —— 页内都拿不到（引擎／宿主侧 ✓）。');
	L.push('  ⚠️ **机制面（`src/**`）不在页内** ✗：用户选的是**故事目录** ⇒ 引擎那几个 twee 不在取件面内 ✓（不假装覆盖 ✗）。');
	L.push('⚠️ **① 同判 ✓／②③ 只列不判 ✗**（有意 ✓）—— 上面 **① 级 `0 处` ≠ `--reads` 门干净** ✗；完整判定只在 CLI（`node scripts/audit.mjs --reads --check` ✓）。');
	L.push('⚠️ 本格由**模块身份级代理**判为"已接线" ✗（`report-page-coverage.mjs`：必要不充分 ✓）—— 它证的是"门用的判据页内也 import 了"✗，**不是**"整门都在页内跑"✗。');
	return L;
};

/** 把读侧读数渲染进 `#readfaces` ✓；返回 `{ applicable, rows, rowsSha, problems, hits, sourceFiles }`（**显示与判定同源** ✓）。
 *  ⚠️ **入口先清** ✗（`#946` 同族）：任何一条守卫抛之前，那一格已经清过 ✓ ⇒ 抛了也不留上次的读数 ✓。 */
export const renderReadFaces = ({ doc, pkg, containerId = 'readfaces' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (!el) throw new Error(`读侧诊断：容器「#${containerId}」不存在 ✗（读数不该静默不显示 ✓）`);
	clearReadFaces({ doc, containerId });
	const rules = pkg?.data?.['rules.json'];
	if (rules === undefined || rules === null) {          // 缺 ⇒ 合法 ✓（不抛 ✗）
		el.textContent = READ_NOT_APPLICABLE_LINES.join('\n');
		return { applicable: false, rows: null, rowsSha: null, problems: null, hits: null, sourceFiles: 0 };
	}
	if (!Array.isArray(rules.rows)) {                     // 畸形 ⇒ 必须报 ✓
		throw new Error('读侧诊断：包里的「rules.json」在，但 `rows` 不是数组 ✗（畸形必须报 ✗ —— 静默成 0 处会被读成"条件表干净"✓）');
	}
	const rows = rules.rows;
	const rowsSha = fingerprintOf(rows);
	const problems = tableReadProblems(rows);
	// 段落源：**只有真选到 twee** 才跑 ② ✗（没选到 ⇒ `hits: null` ⇒ 读数里写"不适用" ✓，不静默当 0 ✓）。
	const sources = pkg?.sources ?? [];
	const hits = sources.length ? storyReadsOf(sources) : null;
	el.textContent = readFacesLines({ rows, rowsSha, problems, hits, sourceFiles: sources.length }).join('\n');
	return { applicable: true, rows, rowsSha, problems, hits, sourceFiles: sources.length };
};
