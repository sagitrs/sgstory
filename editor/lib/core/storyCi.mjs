// 用户故事 CI 的**判据（纯函数）**（`#984` · 设计稿 §5 拦路石 #3 的对策 ＝ §7 P3 ④）。
//
// 为什么需要它（实测的缺口 ✗，见 `#984` 票面）：`scripts/test-plan.mjs` 里
//   `editor-equiv-minimal-demo`／`editor-equiv-mist-forest-*`／`scripts-audit-mjs-cave-hollow` …
//   **全是写死的故事名与命令** ✗ ⇒ **用户做的第 4 个故事不会自动进 CI** ✗。
//
// ⚠️ **本件是"编排"不是"新判据"** ✗：每条 K 都指向**既有命令** ✓（谁判的、在哪读出来的，逐条写在表里 ✓）。
// ⚠️ **作用域** ✗（`#984` 的接口口径 ✓ —— 它**不是**可选项，是实测逼出来的唯一分法 ✓）：
//   · `scope: 'story'` ⇒ 逐故事跑 ✓；· `scope: 'global'` ⇒ 每轮跑一次 ✓
//   （**K5／K6 是全局** ✓、**K3 半是引擎级** ✓ ⇒ 「逐故事跑全套」**照字面做不到** ✗）。
// ⚠️ **档** ✗（成本实测 ✓）：`tier: 'light'` ⇒ 进 CI 默认档 ✓；`tier: 'heavy'` ⇒ 只在 `--full` ✓
//   （⛔ **不许**默认把重门乘故事数 ✗ —— 实测 `test/saveload.mjs` 30.7s／`test/scenarios.mjs` 23.6s ✗）。

/**
 * K 面清单（**单一权威** ✓）：每条 = 设计稿 §1 的一条不变量 → **判它的既有命令**。
 * `evidence` 是"我从哪读出来的"（可核 ✓，不是"应该吧"✗）。
 */
export const K_FACES = Object.freeze([
	{
		k: 'K1', name: '失败开向', scope: 'story', tier: 'light',
		cmd: (slug) => ['scripts/audit.mjs', '--story', slug, '--check', '--sitedisc'],
		evidence: 'gates/sitedisc.mjs:24「⓪p **位点失败纪律门**（#199/#195）：**带伤失败必须有解，无解决不许带伤**」',
	},
	{
		k: 'K2', name: '契约 fail-loud ＋ `--engine-story-free` 三档', scope: 'global', tier: 'light',
		cmd: () => ['scripts/audit.mjs', '--engine-story-free', '--check'],
		evidence: 'gates/engine-story-free.mjs:24-25（`flag`／`flags`）＋ test-plan.mjs:232',
	},
	{
		k: 'K3', name: '点得动／不抛错／走得到终点／存档不丢', scope: 'global', tier: 'heavy',
		cmd: () => ['test/story-runtime.mjs'],
		evidence: 'test-plan.mjs:207（8s）—— ⚠️ **半是引擎级**（非逐故事）；重门（scenarios 23.6s／saveload 30.7s）**本表只收 runtime**（另两个已由既有段跑）',
	},
	{
		k: 'K4', name: '单一真源（生成标记 · 新鲜度 · 逃生舱可枚举）', scope: 'global', tier: 'light',
		cmd: () => ['editor/k4.mjs'],
		evidence: 'editor/k4.mjs 件头「K4 门」（**只对有 `data/` 的故事判** ⇒ 内部已按故事过滤）',
	},
	{
		k: 'K5', name: '让步留痕（report-only 必须写明理由）', scope: 'global', tier: 'light',
		cmd: () => ['scripts/report-gate-ledger.mjs', '--check'],
		evidence: 'docs/gate-ledger.md 头「**仅登记／未接线必须写明理由**（理由写在 `REASONS` 里）」—— §1 的「**可放（转 report-only，不删）**」即让步',
	},
	{
		k: 'K6', name: '单一内核／防双内核（K4 的姊妹判据）', scope: 'global', tier: 'light',
		cmd: () => ['editor/k6.mjs'],
		evidence: 'editor/k6.mjs 件头「K6 门（`#794`）」',
	},
]);

/** 逐故事的编排（`lint-story` **已经是**"包形状 → 编译幂等 → 等价 → 故事门 ×N → 形状"的既有编排 ✓ ⇒ **重用** ✗ 不重造）。 */
export const storyPlan = ({ stories = [], slug = null } = {}) => {
	const list = slug ? [slug] : stories;
	return list.map((s) => ({ k: 'story', name: `逐故事：${s}`, scope: 'story', tier: 'light', cmd: ['editor/lint-story.mjs', s] }));
};

/** 全局面（每轮一次 ✓）。 */
export const globalPlan = ({ full = false } = {}) =>
	K_FACES.filter((f) => f.scope === 'global' && (full || f.tier === 'light')).map((f) => ({ k: f.k, name: f.name, scope: 'global', tier: f.tier, cmd: f.cmd() }));

/**
 * 总编排 ✓：**逐故事面 ＋ 全局面** ⇒ 一个可执行的命令清单（顺序稳定 ⇒ 读数可复跑 ✓）。
 * ⚠️ `stories` 由**调用方**发现（发现要读盘 ⇒ 那属宿主 ✓，本件保持纯 ✓）。
 */
export const buildPlan = ({ stories = [], slug = null, full = false } = {}) => [...storyPlan({ stories, slug }), ...globalPlan({ full })];

/**
 * 汇总读数（纯函数 ✓）：`results` = [{ cmd, rc, out, ms }]。
 * 判据：**任一 rc≠0 ⇒ ok=false** ✓（不静默 ✓）；并回**失败清单**（谁、哪条 ✓）。
 */
export const summarizeRuns = (results = []) => {
	const failed = results.filter((r) => r.rc !== 0);
	return {
		ok: failed.length === 0,
		total: results.length,
		failed: failed.map((r) => ({ cmd: r.cmd.join(' '), rc: r.rc, ms: r.ms ?? null })),
		ms: results.reduce((a, r) => a + (r.ms ?? 0), 0),
	};
};

/** 发现的故事必须**真的**进了编排（**能假** ✗ —— 新故事不许静默漏掉 ✓）。 */
export const missingFromPlan = ({ stories = [], plan = [] } = {}) =>
	stories.filter((s) => !plan.some((p) => p.cmd.includes(s))).map((s) => ({ slug: s, why: '发现到了这个故事，但编排里没有任何一条命令跑到它 ⇒ 它**不在 CI 里** ✗' }));

/**
 * **唯一裁决**（`#989`）：末行的 `✔/✗`、`x/y`、失败清单、**退出码**必须**四处一致** ✓。
 * ⚠️ 为什么单独有它 ✗：原先末行**只由 `summarizeRuns` 拼** ✓，而"0 个故事 ⇒ 不许判过"走的是
 *   **壳里另一条路** ✗ ⇒ 两者能相反：**末行印 `✔ 4/4 通过` 而 rc=1** ✗（**末行反向说谎** ✓）。
 *   ⇒ 把它收成**一处**：`ok/total/failed` 由**同一份**算出来 ✓，壳只负责打印 ✓。
 */
export const finalVerdict = ({ results = [], zeroStories = false, root = '', rootExists = true } = {}) => {
	const s = summarizeRuns(results);
	const extra = zeroStories
		? [{ cmd: null, rc: 1, reason: `发现到 0 个故事 ⇒ 逐故事面全部消失，**不许判过** ✗（${rootExists ? `\`${root}\` 下没有故事` : `\`${root}\` 不存在`} ✓）` }]
		: [];
	const failed = [...s.failed, ...extra];
	return {
		ok: failed.length === 0,
		total: s.total + extra.length,          // ⚠️ 0 故事时"该做没做"的面**计入分母** ✗ —— 否则 x/y 又会说成 4/4 ✓
		passed: s.total - s.failed.length,
		failed,
		ms: s.ms,
	};
};
