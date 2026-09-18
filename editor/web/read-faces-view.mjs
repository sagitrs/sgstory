// 车道 E-B3（`#215` 报备 `18504078` ✓，面与边界经 `18503825` 后确认 ✓）：**读侧（`--reads`）**那一面的显示层 ✓
// —— 只做"取输入 ⇒ 调内核 ⇒ 交给 DOM" ✗，不含判定 ✓。
//
// 判据**复用** `editor/lib/core/stateDiagnose.mjs` ✓（页内不重写 ✗）—— 与 CLI 的 `--reads` 门**同一份**：
//   门侧证据 ＝ `stories/mist-forest/gates/reads.mjs`（`const probs = tableReadProblems(rows)` ✓）。
//
// ⚠️ **适用面写清**（车道 E 判据 ② ✓，发起者 `18503825` 批 ✓）：`--reads` 门自己分**三级** ✓，页内**只跑得起第一级** ✗ ——
//   ① **【硬】条件表行**（行里 `req`／`any`／`exclude`／`prereq`／`yields`／`text` 不得含**字面状态读** ✓）⇒ **跑** ✓
//      （输入 ＝ **包内 `rules.json` 的 rows** ✓ —— 页面手上就有 ✓）；
//   ② **【硬＋基线】故事面知识键直读**（须走 `Sg.notes.has('n_x')` ／条件表 ✗）⇒ **不跑** ✗
//   ③ **【报告／`--strict`】非知识键直读**（叙事／声明表／机制三面汇总 ✗）⇒ **不跑** ✗
//   ②③ 不跑的理由（**一条，不是三条** ✓）：它们的输入 ＝ **源文 segments**（`stories/**` 的 twee 正文 ✓）
//     ＋ **知识索引 `Sg.Notes.entries`**（**引擎侧** ✓）＋ **该故事基线**（`loadStoryAudit()` ⇒ **宿主 io** ✓）
//     —— 三样**页内都拿不到** ✗；硬在页内重写就是造**第二份判据**（K6 要防的正是这个 ✗）。
//   ⇒ 读数里写的是"**① 级 0 处**"✗，**不是**"`--reads` 门干净"✗（如实写在读数里 ✓，不只写在票面 ✓ 照 ㉑／㉕）。
//
// ⚠️ **覆盖率那条 `已接线` 是模块身份级代理** ✗（`scripts/report-page-coverage.mjs` 件头自己声明的"必要不充分" ✓）：
//   它只证"**门用的判据模块，页内也 import 了**"✓ ⇒ **不等于**"整门都在页内跑"✗。本件把这条边界也写进读数 ✓。
//
// **缺 vs 畸形** ✓（照 `core/diagnose.mjs` 既有口径 ＋ 发起者 2026-09-18 15:05 裁定的「缺 ⇒ 合法」✓）：
//   · **缺** `rules.json`（`hollow-cave`／`minimal-demo` 本来就没有 ✓）⇒ **本件不适用** ✗、**不抛** ✗；
//   · **畸形**（在册但 `rows` 不是数组 ✓）⇒ **讲人话地抛** ✓（`#949` 同口径 ✓）。
//
// **浏览器安全** ✓：零宿主 ✓（不碰 fs／进程／时钟 ✓）。

import { tableReadProblems } from '../lib/core/stateDiagnose.mjs';
import { fingerprintOf } from '../lib/core/fingerprint.mjs';

const PLACEHOLDER = '（读侧诊断：未载入 ✓）';

/** 「本包没有条件表 ⇒ 本件不适用」那两行 ✓ —— 明写"不适用"✗，免得被读成"跑过了、没问题"✗。 */
export const READ_NOT_APPLICABLE_LINES = [
	'读侧（`--reads` 面 ✓）：本包**没有 `rules.json` 数据面** ⇒ 本件不适用 ✓（**不是**"条件表干净" ✗）',
	'[info] applicable · 读侧（`--reads` 面 · ① 条件表行级）：本件不适用 ✓（这一步在 CLI ✓）',
];

/** 清空那一格 ✓（照 `#946` 同族：换包/失败时**旧读数必须消失** ✗）。 */
export const clearReadFaces = ({ doc, containerId = 'readfaces' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (el) el.textContent = PLACEHOLDER;
};

/** ① 级判据 ⇒ 逐行 ✓（**纯函数** ✓：只把 core 的结论变成人读的行 ✗，不判定 ✓，不重排文案 ✗）。 */
export const readFacesLines = ({ rows = [], rowsSha = null, problems = null } = {}) => {
	const probs = problems ?? tableReadProblems(rows);
	const L = [];
	L.push(`读侧（\`--reads\` 面 ✓ · 页内跑的是**① 条件表行那一级（硬判）** ✓）：输入 rows ${rows.length} 行 · 输入指纹 ${rowsSha ?? '(未报 ✗)'}`);
	L.push(`  ① 条件表行读点：${probs.length} 处${probs.length ? ` ⇒ ${probs.map((p) => `「${p.id}」.${p.field}：${p.what}（${p.detail}）`).join(' · ')}` : ' ✓'}`);
	L.push('[info] applicable · 页内**不跑**：② 故事面知识键直读（须走 `Sg.notes.has(\'n_x\')`／条件表）／ ③ 非知识键直读按面汇总（叙事·声明表·机制）：本件不适用 ✓（这一步在 CLI ✓）');
	L.push('  ⚠️ ②③ 不跑的理由**只有一条** ✗：它们的输入 ＝ 源文 segments ＋ `Sg.Notes.entries` 知识索引 ＋ 该故事基线 —— 三样**页内都拿不到**（引擎／宿主侧 ✓）。');
	L.push('⚠️ 上面 **① 级 `0 处` ≠ `--reads` 门干净** ✗ —— ②③ 只在 CLI（`node scripts/audit.mjs --reads --check` ✓）。');
	L.push('⚠️ 本格由**模块身份级代理**判为"已接线" ✗（`report-page-coverage.mjs`：必要不充分 ✓）—— 它证的是"门用的判据页内也 import 了"✗，**不是**"整门都在页内跑"✗。');
	return L;
};

/** 把读侧读数渲染进 `#readfaces` ✓；返回 `{ applicable, rows, rowsSha, problems }`（**显示与判定同源** ✓ —— 供读数断言 ✓）。
 *  ⚠️ **入口先清** ✗（`#946` 同族）：任何一条守卫抛之前，那一格已经清过 ✓ ⇒ 抛了也不留上次的读数 ✓。 */
export const renderReadFaces = ({ doc, pkg, containerId = 'readfaces' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (!el) throw new Error(`读侧诊断：容器「#${containerId}」不存在 ✗（读数不该静默不显示 ✓）`);
	clearReadFaces({ doc, containerId });
	const rules = pkg?.data?.['rules.json'];
	if (rules === undefined || rules === null) {          // 缺 ⇒ 合法 ✓（不抛 ✗）
		el.textContent = READ_NOT_APPLICABLE_LINES.join('\n');
		return { applicable: false, rows: null, rowsSha: null, problems: null };
	}
	if (!Array.isArray(rules.rows)) {                     // 畸形 ⇒ 必须报 ✓
		throw new Error('读侧诊断：包里的「rules.json」在，但 `rows` 不是数组 ✗（畸形必须报 ✗ —— 静默成 0 处会被读成"条件表干净"✓）');
	}
	const rows = rules.rows;
	const rowsSha = fingerprintOf(rows);
	const problems = tableReadProblems(rows);
	el.textContent = readFacesLines({ rows, rowsSha, problems }).join('\n');
	return { applicable: true, rows, rowsSha, problems };
};
