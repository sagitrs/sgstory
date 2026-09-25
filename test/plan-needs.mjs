// `#1044`：**段间产物依赖边守护门**（编排层 ratchet）——「会在运行中**改真故事文件**的段」与
//「会**读**同一故事文件的段」之间的 `needs` 边必须在册（缺 → 并发跑器不保证相序 → 同波互踩 → 假红）。
//
// 为什么要有这一件：`test-plan` 的并发跑器**只按 `needs` 排相序** → 边缺失 → 两段可能进同一波 →
// 读侧读到写侧窗口内的**半成品** → 假红（`#1044` 实测：`lint-scratch` 与 `lint-story` 同波 →
// 3 进程 × 3 轮 2/3~3/3 红，载荷正是 `lint-story` 反例注入的 `'{ oops'`）。
// 同族先例：`test-story-ci-mjs` 的 needs（同因——「另一条独立理由：避免读到半改的真数据」）。
//注意：本门只守**边在册**这一层（确定性锚），**不**复现并发互踩（概率型判据本仓已两度否定
// —— `#1027`／`#1029`：无法归因/会抖的判据不许进门）。
//注意：`test-lint-scratch-mjs-selftest` **不需要**这条边（`--selftest` 走纯函数路径、不 spawn 真
// `lint-story` → 无读窗口 —— 票面口径）。
//
// 判据（**全部确定性** 不跑任何并发 不赌时序 —— 纯静态读 SEGMENTS）：
// ① 正：`NEED_EDGES` 每条 → SEGMENTS 里 `reader.needs` 必须含 `writer`，缺失必红并**点名**；
// ② 反例控制（本门自己的"能假"）：对**副本**删掉一条在册边 → 判定函数必须报出它；
// ③ 端点在册：边表两端 id 必须都在 SEGMENTS 里（段改名后边表悬空 → 门必须红，不许假绿）。
//
// 复跑：`node test/plan-needs.mjs`（**无前置**：只读 `scripts/test-plan.mjs` 源，不读 dist/build 产物）。
// 探针：`scripts/probes.mjs` 的 `test/plan-needs.mjs` 条（刀＝删那条 needs → 本门必红）。
import { SEGMENTS } from '../scripts/test-plan.mjs';

/** 在册边表（「谁写 · 谁读 · 为什么」）—— 加一条边 = 一次**显式决定**（不许顺手）。 */
export const NEED_EDGES = [];
/** `#1315`：本表**当前为空**，且这必须由本条登记解释（不是"顺手删干净"式的静默）——
 *  原三条边的**两端段都已随 `#1261` 大裁剪下架**：
 *    · `test-lint-story-mjs` -> `test-lint-scratch-mjs`（`#1044`：反例临时改真 `stories/<slug>/data/tables.json`）
 *    · `test-web-preview-mjs` -> `test-cli-surface-mjs` ／ `test-pc-defaults-mjs`（`#1070`：临时候具 `stories/__e2e`）
 *  => 今天**不存在"写侧临时候具 -> 读侧同波读到半成品"这一类冲突**（写侧段本身已不存在）。
 *  加边规则不变（两端必须先在 `SEGMENTS` 在册）；将来恢复同类段时**必须同时恢复对应边**。 */
export const EMPTY_EDGES_REASON = '#1315：三条边的两端段均已随 `#1261` 下架 => 当前无边（空表由本条解释，非静默）';

/** `#1315`（48h 审计）：**`needs` 也是边** —— "先跑谁"那条边**指向的段必须在册** ✗ 只管边表端点不够。
 *  为什么：段改名/下架后，`needs` 会**悬空**，而三校验（tiers/layers/suites）**都不看它** ✗
 *  ⇒ 症状：某段单跑必缺前置（例：`test-coverage-mjs` 单跑 `✗ 覆盖落盘缺失`），而根因**没人能一眼看出**。
 *  本节只判"指向的段在不在册"；**✗ 不管是谁依赖谁**（那是 `missingEdges` 的事）✓ */
export const danglingNeedsProblems = (segments = []) => {
	const ids = new Set(segments.map((s) => s.id));
	const out = [];
	for (const s of segments) for (const n of (s.needs ?? [])) if (!ids.has(n)) out.push(`${s.id} 的 needs 指向**不在册**的段 \`${n}\` ⇒ 段改名/下架后这条边悬空（要么改指向、要么删边 ✗ 不许留着）`);
	return out;
};

/** 判定（纯函数）：返回问题列表（空 ＝ 通过）。 */
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

// `#1315`（48h 审计）：**needs 悬空** —— 边指向的段必须在册（✗ 三校验都不看它 ⇒ 本节补上）
const dangling = danglingNeedsProblems(SEGMENTS);
case_('needs 指向的段都在册（边悬空 ⇒ 点名该段与该依赖）', dangling.length === 0, dangling.join('；'));
// **能假**（自带样本：注入一条指向不存在段的 needs ⇒ 必报）
case_('反例·needs 悬空必报（自带样本：a 依赖不存在的 b）', (() => {
	const segs = [{ id: 'a', needs: ['b'] }, { id: 'c' }];
	const got = danglingNeedsProblems(segs);
	return got.length === 1 && got[0].includes('a') && got[0].includes('b');
})());
case_('正例·needs 全在册 ⇒ 不报（不误伤 ✓）', danglingNeedsProblems([{ id: 'a', needs: ['b'] }, { id: 'b' }]).length === 0);
case_('边表为空时必须有登记理由（空 != 静默：表空本身就是一次显式决定）',
	NEED_EDGES.length > 0 || EMPTY_EDGES_REASON.trim().length > 0);

// ② 反例控制：对**副本**删掉一条在册边 → 判定必须报出它（否则"全绿"可能只是判定什么都没量）
// `#1315`：本格改为**自带样本** —— 旧写法取 `NEED_EDGES[0]`，空表时是 `undefined` => 直接崩（且"能假"依赖当天数据）。
// 自带样本让"删边必报"永远能被点燃（不依赖现网有没有边）。
{
	const segs = [{ id: 'w', needs: [] }, { id: 'r', needs: ['w'] }];
	const edges = [{ writer: 'w', reader: 'r', why: '(自证自带样本)' }];
	const before = missingEdges(segs, edges).length === 0;
	const cut = segs.map((s) => (s.id === 'r' ? { ...s, needs: [] } : s));
	const got = missingEdges(cut, edges);
	case_('反例·删边必报（自带样本：删前不报 / 删后必报且点名两端）',
		before && got.length === 1 && got[0].includes('w') && got[0].includes('r'), got.join('；'));
}
// 正例控制：没有边要守 → 必须无问题（防判定对任意输入都报）
case_('正例·空边表放过', missingEdges(SEGMENTS, []).length === 0);

// `#1130`：**独占段的理由可查** —— 标了 `exclusive` 的段必须声明 `mutates`（它动哪些**已入库真源**）
// 为什么（与 `NEED_EDGES` 同口径）：独占是一次**显式决定** → 理由进数据、不许只写注释（不可机检）
// 为什么需要独占：窗口制造者（就地改真源再恢复 → mtime 刷新）与并行 boot 的段撞新鲜度守卫 → 偶发红
const exclDeclProblems = (segs) => segs.filter((s) => s.exclusive && (!Array.isArray(s.mutates) || s.mutates.length === 0)).map((s) => s.id);
/** `#1315`：**"独占段数 = 0"必须被显式登记**（两种零不同形）—— 原格写"≥1（今天=lint-story）"，
 *  而那个段已随 `#1261` 下架 => 格变红；若只是把格删掉，机制被静默摘除时也没人知道。
 *  => 改成：`≥1` **或** 本条登记在场 => 表空/机制无人用时**必须有人写下理由**。 */
export const NO_EXCLUSIVE_TODAY = '#1315：原独占段（`test-lint-story-mjs`，就地改真 `stories/*/data/tables.json`）已随 `#1261` 下架 => 当前无段会动已入库真源 => 独占机制暂无人使用（登记以备复核；将来有段动真源 => 必须标 `exclusive` + 非空 `mutates`）';
{
	const excl = SEGMENTS.filter((s) => s.exclusive);
	case_('独占段必须声明 mutates（非空 ⇒ 理由可查）', exclDeclProblems(SEGMENTS).length === 0, exclDeclProblems(SEGMENTS).join('、'));
	case_('独占段 >=1 或已登记「今天没有」（0 必须被解释 => 机制不会被静默摘除）', excl.length >= 1 || NO_EXCLUSIVE_TODAY.trim().length > 0, `exclusive 段数=${excl.length}`);
	// `#1315`：旧写法对**现有** exclusive 段做空 mutates 副本 => 今天 0 个 => 恒等于 `0===0 && false` => 必红且**判不到东西**。
	// 改为**注入**一个合成独占段（自带样本）=> 无论现网有几个 exclusive 段，本格都能被点燃。
	case_('反例·独占段缺 mutates => 必报（自带样本：注入一个缺 mutates 的独占段）', (() => {
		const mut = [...SEGMENTS, { id: '__probe-exclusive__', phase: 'test', cost: 0, exclusive: true, mutates: [], cmd: 'true' }];
		return exclDeclProblems(mut).includes('__probe-exclusive__');
	})());
}

console.log(bad === 0 ? '✔ plan-needs：段间产物依赖边全部在册' : `✗ plan-needs：${bad} 条问题（见上）`);
process.exit(bad === 0 ? 0 : 1);
