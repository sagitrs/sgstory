// `#1044`：**段间产物依赖边守护门**（编排层 ratchet）——「会在运行中**改真故事文件**的段」与
// 「会**读**同一故事文件的段」之间的 `needs` 边必须在册（缺 ⇒ 并发跑器不保证相序 ⇒ 同波互踩 ⇒ 假红）。
//
// 为什么要有这一件：`test-plan` 的并发跑器**只按 `needs` 排相序** ✗ ⇒ 边缺失 ⇒ 两段可能进同一波 ⇒
//   读侧读到写侧窗口内的**半成品** ⇒ 假红（`#1044` 实测：`lint-scratch` 与 `lint-story` 同波 ⇒
//   3 进程 × 3 轮 2/3~3/3 红，载荷正是 `lint-story` 反例注入的 `'{ oops'` ✓）。
//   同族先例：`test-story-ci-mjs` 的 needs（同因——「另一条独立理由：避免读到半改的真数据 ✓」）。
//   ⚠️ 本门只守**边在册**这一层（确定性锚 ✓），**不**复现并发互踩（概率型判据本仓已两度否定 ✗
//   —— `#1027`／`#1029`：无法归因/会抖的判据不许进门 ✓）。
//   ⚠️ `test-lint-scratch-mjs-selftest` **不需要**这条边 ✓（`--selftest` 走纯函数路径、不 spawn 真
//   `lint-story` ⇒ 无读窗口 ✓ —— 票面口径 ✓）。
//
// 判据（**全部确定性** ✗ 不跑任何并发 ✗ 不赌时序 ✗ —— 纯静态读 SEGMENTS ✓）：
//   ① 正：`NEED_EDGES` 每条 ⇒ SEGMENTS 里 `reader.needs` 必须含 `writer`，缺失必红并**点名**；
//   ② 反例控制（本门自己的"能假" ✓）：对**副本**删掉一条在册边 ⇒ 判定函数必须报出它；
//   ③ 端点在册：边表两端 id 必须都在 SEGMENTS 里（段改名后边表悬空 ⇒ 门必须红，不许假绿 ✗）。
//
// 复跑：`node test/plan-needs.mjs`（**无前置** ✓：只读 `scripts/test-plan.mjs` 源，不读 dist/build 产物 ✓）。
// 探针：`scripts/probes.mjs` 的 `test/plan-needs.mjs` 条（刀＝删那条 needs ⇒ 本门必红 ✓）。
import { SEGMENTS } from '../scripts/test-plan.mjs';

/** 在册边表（「谁写 · 谁读 · 为什么」）—— 加一条边 = 一次**显式决定** ✗（不许顺手 ✗）。 */
export const NEED_EDGES = [
	{ writer: 'test-lint-story-mjs', reader: 'test-lint-scratch-mjs', why: '#1044：lint-story 的反例临时改真 stories/*/data/tables.json（finally 恢复 ✓）⇒ lint-scratch 同波时 spawn 的 lint-story 读到半成品 JSON ⇒ 假红' },
];

/** 判定（纯函数 ✓）：返回问题列表（空 ＝ 通过）。 */
export const missingEdges = (segments, edges) => {
	const byId = new Map(segments.map((s) => [s.id, s]));
	const problems = [];
	for (const e of edges) {
		const w = byId.get(e.writer);
		const r = byId.get(e.reader);
		if (!w || !r) { problems.push(`边表端点不在 SEGMENTS 在册：${!w ? e.writer : e.reader}（${e.why}）—— 段改名时边表没跟上 ✗`); continue; }
		if (!(r.needs ?? []).includes(e.writer)) problems.push(`段 ${e.reader} 缺 needs 依赖 ${e.writer} —— ${e.why}`);
	}
	return problems;
};

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

// ①③：在册边逐条核验（needs 含 writer · 端点都在册）
const problems = missingEdges(SEGMENTS, NEED_EDGES);
case_('边表逐条在册', problems.length === 0, problems.join('；'));

// ② 反例控制：对**副本**删掉一条在册边 ⇒ 判定必须报出它（否则"全绿"可能只是判定什么都没量 ✗）
{
	const first = NEED_EDGES[0];
	const mutated = SEGMENTS.map((s) => (s.id === first.reader ? { ...s, needs: (s.needs ?? []).filter((n) => n !== first.writer) } : s));
	const got = missingEdges(mutated, NEED_EDGES);
	case_('反例·删边必报', got.length === 1 && got[0].includes(first.writer) && got[0].includes(first.reader));
}
// 正例控制：没有边要守 ⇒ 必须无问题（防判定对任意输入都报 ✗）
case_('正例·空边表放过', missingEdges(SEGMENTS, []).length === 0);

console.log(bad === 0 ? '✔ plan-needs：段间产物依赖边全部在册' : `✗ plan-needs：${bad} 条问题（见上）`);
process.exit(bad === 0 ? 0 : 1);
