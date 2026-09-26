// CI 测试计划（#381）：**单一权威**——`npm test`、并行跑器、F2 台账的「是否接线」判定全部读这里。
//
// 为什么要有这个文件：此前「跑哪些段」只存在于 package.json 的 test 脚本里（一长串 `&&`），
// 于是 ① 只能串行跑（CI 4 核也只用一个）② F2 台账靠**字符串匹配**那段脚本来判断门有没有接线。
// 计划与之解耦后：跑器可并行、台账仍能判定接线（见 report-gate-ledger.mjs——并且它会校验
// `npm test` 真的调用了跑器，防止「计划写了但没人跑」的幻影门）。
//
// 字段：
// id — 稳定标识（--only 用）
// phase — `build` 先跑且**独占**（后面所有段都可能读 dist），其余段可并行
// cost — 本机实测秒数（仅用于打印串行合计与并行预估，**不参与判定**）
// needs — **前序段的产物依赖**（#381 补）：本段要读某段落盘的产物时写它的 id。
// 调度器保证「前序全部成功」才起跑；前序红了则本段**标 skipped**（不白跑、也不假绿）。
// cmd — 与旧链**逐字一致**，便于对照与回退（`npm run test:serial`）
// tier — **跑哪些段的档位**（`#1070`）：`'fast'`（PR 档，**缺省**）｜`'full'`（全量档，含周期性验证）。
//
// ## `tier` 的语义与纪律（`#1070`／父 `#1067`）
// ① **缺省 ＝ `'fast'`**：新增段**默认进 PR 档** → **绝不静默漏跑**（要移出 PR 档必须**显式**标 `'full'`
// —— 与本仓 `escape-hatch` 同族：**放宽是一次显式决定，不是顺手**）。
// ② **`fast` 只改「何时跑」，不改任何判据强度**：被标 `full` 的段本身一字不改（降「跑得频」≠降「判得严」）。
// ③ **每一条 `full` 必须写明理由**（`FULL_REASONS`，与 `REASONS` 同形）→ 目标：**后人一眼看出为什么它不在 PR 档**；
// 没写理由 → `validateTiers()` 报红。
// ④ **`fast ∪ full ＝ 全集`**（`validateTiers()` 断言）→ 挡住「标了 tier 却在两档都不跑」的**静默丢弃**。
// ⑤ **哪个档进了 CI**：`#1070` 起 CI 的 `npm test` ＝ **fast 档**（`package.json` 的 `test` 行显式带 `--tier=fast`）；
// **full 档**由 `npm run test:full` 手动跑，nightly／main 由 `#1071` 接线（**代价留痕**见下 ⑥）。
// ⑥ **代价（显式写清，不藏）**：被移出 PR 档的段在 **PR 期不再被验证** → 必须由 full 档（nightly/main）补回；
// 本仓已有的两处移出（探针／witness）各自的理由见 `FULL_REASONS`。
//
//注意：产物依赖面（改测试的落盘/读取时同步这里；CI 曾因漏掉它而红过一轮）：
// build/coverage-render.json · build/coverage-links.json ← test/render-all.mjs
// build/coverage-scenarios.json · coverage-links-scenarios.json · route-traces.json ← test/scenarios.mjs
// ├─ test/coverage.mjs 读上述 4 个覆盖文件 → needs render-all + scenarios
// └─ scripts/report-rhythm.mjs 读 route-traces.json（连 `--selftest` 也用它做正例）→ needs scenarios
/** `tier` 两档（`#1070`）：`fast`＝PR 档（缺省）／`full`＝全量档。
 *注意：**两档的并集必须是全集**（`validateTiers()` 断言）—— 否则某段会在两档都不跑而**没人发现**。 */
export const TIERS = ['fast', 'full'];
/** 段缺省所在档 → **`fast`**（新增段默认进 PR 档 → 不静默漏跑）。 */
export const DEFAULT_TIER = 'fast';

/** 段 → 档（**缺省 `fast`** —— 与 `segmentLayer` 同形：缺省是"保守"那一侧）。
 *注意：不认识的值（拼错 `'Fast'`／`'full '`）**不静默当缺省** → 抛（`validateTiers()` 会在起跑前报）。 */
export const tierOf = (seg) => seg?.tier ?? DEFAULT_TIER;

/** 每条 `full` 段的**理由**（`#1070` 纪律③：**没写理由 → 报红**）。
 * 与 `report-gate-ledger.mjs` 的 `REASONS` 同形 —— 理由与代码同处一处评审。 */
export const FULL_REASONS = {
	'scripts-probe-gates-mjs-probe-fast':
		'**探针＝元判据**（量的是"门会不会红"✓）⇒ 属**周期性验证**，不是每次改动都要重跑 ✗。'
		+ '代价（实测）：**253.3s**（CI 日志 278.2s）＝ 全链串行 743s 的 **37%**（`#1070` 实测）✓。'
		+ '⚠️ **移出 PR 档 ⇒ PR 期不再验证"门会咬"** ✗ ⇒ **已接线**（`#1071`：`.github/workflows/full-tier.yml`，触发面 ＝ nightly ＋ `push: main` ＋ `workflow_dispatch` ✓；**失败即红** ✗不是 report-only ✓）；'
		+ '另：台账的探针列**依赖本段产出的** `build/probe-results.json`（gitignored）⇒ 本段不在 PR 档跑时，'
		+ '台账那一列由 `report-gate-ledger.mjs --allow-stale-probe` **显式降级**（打印"探针面跳过"，不静默 ✓）。',
	'scripts-audit-mjs-consequences-check': '`#1353` 阶段一（PR 档减压）：「选择后果」引擎门：直接依赖故事侧条件面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-a11y-check': '`#1353` 阶段一（PR 档减压）：可访问性门：需真环境（读产物/DOM 面）⇒ 环境不具备时应记「未判」。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-sitedisc-check': '`#1353` 阶段一（PR 档减压）：位点判定门：面＝故事数据面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-text-check': '`#1353` 阶段一（PR 档减压）：文本载荷门：载荷阈值型判据，值随内容漂移。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-state-check': '`#1353` 阶段一（PR 档减压）：状态契约门：面＝故事状态面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-literals-check': '`#1353` 阶段一（PR 档减压）：字面量门：面＝故事数据面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-engine-story-free': '`#1353` 阶段一（PR 档减压）：引擎门「与故事无关」的反向核：判据稳定。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-slots-check': '`#1353` 阶段一（PR 档减压）：槽位门：面＝故事数据面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-status-check': '`#1353` 阶段一（PR 档减压）：状态门：面＝故事数据面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-waves-check': '`#1353` 阶段一（PR 档减压）：波次门：面＝故事数据面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-audit-mjs-roads-check': '`#1353` 阶段一（PR 档减压）：路线门：面＝故事数据面。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-report-ledger-freshness-mjs-ledger-check': '`#1353` 阶段一（PR 档减压）：台账新鲜度读数（日期在期/行数栅栏）：是读数不是布尔判据。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-report-gate-ledger-mjs': '`#1353` 阶段一（PR 档减压）：台账重生成动作（--allow-stale-probe）：动作不需要每 PR 做。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	'scripts-report-selftest-validity-mjs': '`#1353` 阶段一（PR 档减压）：自证有效性扫描：元判据，随「自证」整体变化才需重看。 ★ **本项属阶段二待清理** —— 它只是**暂存**在 full，✗ 不是「永久降频」；阶段二按三分处置逐条定性（真该跑 ⇒ 写明为什么必须存在／其余 ⇒ 检视项或移除）✓。',
	// `#1261`：`test-witness-trace`（P4 见证件）随其样本下架 -> 段与理由块同删（留痕见下架台账）。
	'scripts-audit-mjs-facade-call-check': '`#1445`：判**引擎侧代码结构**（门面调用面）—— 全仓扫描 ＋ 自证 ⇒ 非 PM 档必需（PR 档可省，随 full 跑；见 `#1437` 分家伞）',
};

export const SEGMENTS = [
	// `#1261` 复核：`test-attribution-gate` 守**人类面去权威化纪律**（对象活过 M1b → 保留，非下架）
	{ id: "test-attribution-gate-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/attribution-gate.mjs --selftest" },
	{ id: "test-attribution-gate-mjs", phase: 'test', cost: 0.1, cmd: "node test/attribution-gate.mjs" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-dialect-mjs", phase: 'test', cost: 0.1, cmd: "node test/dialect.mjs" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-contract-version-mjs", phase: 'test', cost: 0.1, cmd: "node test/contract-version.mjs" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-cond-keyform-mjs", phase: 'test', cost: 0, cmd: "node test/cond-keyform.mjs" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-cond-keyform-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/cond-keyform.mjs --selftest" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-prose-vocabulary-mjs", phase: 'test', cost: 0.5, cmd: "node test/prose-vocabulary.mjs" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-prose-vocabulary-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/prose-vocabulary.mjs --selftest" },
	// `#1261` 甲：恢复并挂起（对象＝通用机制，样本暂缺）
	{ id: "test-equiv-scratch-mjs", phase: 'test', cost: 1.0, cmd: "node test/equiv-scratch.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-chargen-apply-mjs", phase: 'test', cost: 0.5, inputs: ['*'], cmd: "node test/chargen-apply.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-chargen-macros-mjs", phase: 'test', cost: 0.5, inputs: ['*'], cmd: "node test/chargen-macros.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-choice-keys-mjs", phase: 'test', cost: 9, cmd: "node test/choice-keys.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
		{ id: "test-combat-adv-mjs", phase: 'test', cost: 15.6, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node test/combat-adv.mjs" },   // `#1353` 乙组：先 build 夹具再跑（⇒ exclusive，照 block-args/hp-nan 先例）
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-comment-mask-mjs", phase: 'test', cost: 0, inputs: ['*'], cmd: "node test/comment-mask.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-contract-defaults-mjs", phase: 'test', cost: 0.3, inputs: ['*'], cmd: "node test/contract-defaults.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-coverage-mjs", phase: 'test', cost: 0, needs: ['test-render-all-mjs'], cmd: "node test/coverage.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-fight-seq-mjs", phase: 'test', cost: 22, cmd: "node test/fight-seq.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-focus-after-nav-mjs", phase: 'test', cost: 1, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-nav-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-nav-fixture/stories node test/focus-after-nav.mjs" },   // `#1315` 乙批：先 build 夹具再跑（⇒ exclusive，照 block-args/hp-nan 先例）
	// `#1353` ③（丙组）：对象＝旧 demo 剧情支路（跨时代合龙门／一次性拾取）⇒ 最小化后无对象 ⇒ **下架删除**（同笔关 `#1074`／`#1076`）
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-gate-discovery-mjs", phase: 'test', cost: 0, cmd: "node test/gate-discovery.mjs" },
	// `#1353` ③（丙组）：对象＝旧 demo 剧情支路（跨时代合龙门／一次性拾取）⇒ 最小化后无对象 ⇒ **下架删除**（同笔关 `#1074`／`#1076`）
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
		{ id: "test-pc-base-mjs", phase: 'test', cost: 0.3, inputs: ['*'], exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node test/pc-base.mjs" },   // `#1315` 审计：接车卡夹具根（先 build 再跑）
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	// `#1353` 批 3（三合一）：旧故事数值自洽化（②③⑤）＋ 零故事守卫（甲）＋ 期望模型两处口径修正（乙，碰 `#1186`）。
	{ id: "test-pc-defaults-mjs", phase: 'test', cost: 2, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node test/pc-defaults.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-plan-needs-mjs", phase: 'test', cost: 0, cmd: "node test/plan-needs.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
		{ id: "test-properties-mjs", phase: 'test', cost: 5.6, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-hp-e2e/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-hp-e2e/stories node test/properties.mjs" },   // `#1353` 乙组：先 build 夹具再跑（⇒ **exclusive**，照 block-args/hp-nan 先例 ✓）
		{ id: "test-locations-adv-mjs", phase: 'test', cost: 1, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-items-adv-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-items-adv-fixture/stories node test/locations-adv.mjs" },   // `#1353` 乙组：先 build 夹具再跑（⇒ **exclusive**，照 block-args/hp-nan 先例 ✓）
		{ id: "test-chargen-shape-mjs", phase: 'test', cost: 1, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node test/chargen-shape.mjs" },   // `#1353` 乙组：车卡面（`#1418` 修后接夹具根 ⇒ 先 build 再跑，照同组两段形态）
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-render-all-mjs", phase: 'test', cost: 8.9, cmd: "node test/render-all.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
		{ id: "test-reread-mjs", phase: 'test', cost: 1.5, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-codex-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-codex-fixture/stories node test/reread.mjs" },   // `#1315` 审计：接图鉴面夹具根（先 build 再跑，照同组形态）
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
		// `#1353` ③（乙组真因版）：两条雤组（`roll-binding`／`saveui`）**下架删除** ——
	//   它们本质是**旧故事的剧情专项判据**（`听雾`／`洞穴·战斗`／`守林人`等剧情面），而那些剧情
	//   在 books 亦**不存在**（我核过）⇒ 迁移等于**为旧判据新写剧情**（= 为拦而拦 ✗）
	//   ⇒ 判据随对象退役（同丙组体例）；若**机制**仍要守 ⇒ 另立机制面判据（红事件驱动）✓
	// ★ `#1438`（拆段）：**规则核层**（只读 `Game.Rules` 的那几段：调整值／技能加值／d20／自然 20-1／
	//   `#1438` 规则参数包／`#568` 条件项算子形）—— 这些格**不需故事样本**，但 `boot()` 要一份可启动的故事页
	//   ⇒ 按 `test-chargen-shape-mjs` 先例接**夹具根**（`exclusive` ＋ `mutates:['build']`：本段自建故事根并 build ✓）。
	//   ★为什么必须拆出：留在 `test-rules-mjs`（**挂起**）里 ⇒ 判据「**写了但不跑**」（链绿与它无关 ✗，实测 grep 输出 0 命中）。
	{ id: "test-rules-core-mjs", phase: 'test', cost: 1, exclusive: true, mutates: ['build'], cmd: "SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node build.mjs >/dev/null && SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node test/rules-core.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
	{ id: "test-rules-mjs", phase: 'test', cost: 1.6, inputs: ['*'],   // `#1132` B3：读构建产物 ＋ 故事数据（契约成员、车卡数据、图鉴条目）
		cmd: "node test/rules.mjs" },
	// `#1261` 甲：恢复段定义并挂起（对象在、样本暂缺；见 SUSPENDED 表）
		// `#1353` ③（乙组真因版）：两条雤组（`roll-binding`／`saveui`）**下架删除** ——
	//   它们本质是**旧故事的剧情专项判据**（`听雾`／`洞穴·战斗`／`守林人`等剧情面），而那些剧情
	//   在 books 亦**不存在**（我核过）⇒ 迁移等于**为旧判据新写剧情**（= 为拦而拦 ✗）
	//   ⇒ 判据随对象退役（同丙组体例）；若**机制**仍要守 ⇒ 另立机制面判据（红事件驱动）✓
	{ id: "build-mjs", phase: 'build', cost: 3, cmd: "node build.mjs" },
	// `#899` ②：**新故事夹具场景**（①三门绿＋哨兵 ／ ②③两条安全网全红 ／ 清场三处＋dist 复原）。
	//注意：必须是 `build` 相位 → **先跑且独占**（它要在仓的 `stories/` 下临时建夹具）；**且排在 `build-mjs` 之后**
	//（开场快照要取"刚 build 过的 dist"，否则拿旧基线 → 末条 sha 比对**假红** —— 实测踩过一次）。
	// `#908` ①：**探针（最小变异 ＋ 必须红）** —— 台账「自证」列从**代理**升级为**直接读数**。
	//注意：同样必须是 `build` 相位 → **独占**：探针要**临时改一个被测件**（`finally` 还原）→ 与别的段并发会假红。
	// 结果写 `build/probe-results.json`（不入仓）→ 台账在 `test` 相位读它（顺序：build → test）。
	// `#1070`：**`tier:'full'`** —— 理由见 `FULL_REASONS`（元判据・周期性验证・实测 **253.3s** ＝全链 37%。
	// `cost` 由旧值 **25** 改正为 **253.3**（旧值是**手写估值** → 跑器头部“串行合计”失真 2.2×）。
	{ id: "scripts-probe-gates-mjs-probe-fast", phase: 'build', cost: 253.3, tier: 'full', needs: ['build-mjs'], cmd: "node scripts/probe-gates.mjs --probe=fast" },
	// 复核留（**MINOR**，实测）：**id ↔ 台账行**的绑定必须**也进 CI** —— 否则错 id 的探针在 CI 里**静默被忽略**
	//（实测：错 id → `--check` rc=1 而 `--probe=fast` rc=0）→ 这一段就是那把尺子。
	{ id: "scripts-probe-gates-mjs-check", phase: 'test', cost: 0, cmd: "node scripts/probe-gates.mjs --check" },
	// `#908` ①：运行器**自己**能假（三态判定／注入计数／缺前置分家）—— 与探针实跑分家。
	{ id: "scripts-probe-gates-mjs-selfcheck", phase: 'test', cost: 0, cmd: "node scripts/probe-gates.mjs --selfcheck" },
	// 车道 E-(A)（`#215`）：页面侧覆盖率 —— **只读**（纯静态扫描 → 无 `needs`／不需 build）；报告用读数 不进任何断言
	// `#791`／`#455`：CI 触发面完整性（draft 转 Ready 静默不跑 ＋ 无 dispatch 无法补跑取证）
	{ id: "test-ci-triggers-mjs", phase: 'test', cost: 0.1, cmd: "node test/ci-triggers.mjs" },
	{ id: "test-ci-triggers-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/ci-triggers.mjs --selftest" },
	// `#1008` 第二半：**仓根形态**（顶层条目 vs 白名单 —— 误提交的临时件属“结构错”，源文件级的守卫拦不住）
	{ id: "test-repo-shape-mjs", phase: 'test', cost: 0, cmd: "node test/repo-shape.mjs" },
	//注意：自证**必须成对登记**：第二支（声明有、实际没有）**只**由 `--selftest` 守
	//（探针那一刀打在第一支上）→ 不登记它 ＝ 让那一半在 CI 里无守护（`#1018` 复核席点名）
	{ id: "test-repo-shape-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/repo-shape.mjs --selftest" },
	// `#1078`：**读路径门** ——「按任务读」死链必红点名行号 · 对象故事已删的文档回流必读面/权威表必红
	//（`DELETED_STORY_DOCS` 显式对照表 → archive 口径有牙）· 先读列（除 dev-conventions，单列 #1080）
	// 体量 ratchet ≤150KB（口径与数字＝#1077 验收②裁定）。纯读 docs/README.md → 无前置。
	{ id: "test-docs-read-path-mjs", phase: 'test', cost: 0, cmd: "node test/docs-read-path.mjs" },
	// `#1114` 片1：散文层拼装判据（纯函数注入 无前置 ——正例/禁则红/悬空点名/取值/逐字/单权威 成对）
	// `#1350` 片 3/5：`links[] → 规则行同形`（纯函数；含"带 slot 的不入表"等能假）
	{ id: "test-passages-links-mjs", phase: 'test', cost: 0.3, cmd: "node test/passages-links.mjs" },
	// `#1350` 尾件 ⑥：**段尾块链接的 `args` 端到端** —— 引擎仓夹具（`m3-p1234-pilot`）建**自建外根** ⇒
	// `<<rulelist>>` 渲的行**真带上** `data-sg-args` ⇒ 点击 ⇒ 目标段**渲染出该值**（✗ 只比字符串咬不住：
	// "链接不带 args"与"槽存不住"两层各自都能让值到不了 ✓）；含两条负向（不带 args 行不乱贴属性／无新跳转不读旧值）
	// ★ 并发面（照 `#1362`／`codex-panel` 先例）：本段**自建故事根并跑 build**（写自己的 `dist/`）
	//   ⇒ 必须 **`exclusive`**（✗ 否则与别的 boot 类段并发 ⇒ 实测：「等待起始段 门厅，当前渲染的是 开场」✗
	//   —— 链里红、单跑/--only 绿，正是"并发撞共享面"的指纹）
	{ id: "test-block-args-e2e-mjs", phase: 'test', cost: 40, exclusive: true, mutates: ['build'], cmd: "node test/block-args-e2e.mjs" },
	// `#1418`：chargen 惰性安装端到端（自建夹具根 ＋ build ⇒ exclusive，照同族先例 ✓）
	{ id: "test-chargen-lazy-e2e-mjs", phase: 'test', cost: 20, exclusive: true, mutates: ['build'], cmd: "node test/chargen-lazy-e2e.mjs" },
	// `#1409`：hp-NaN 端到端（自建故事根 ＋ build ⇒ 需 exclusive，照 block-args 先例 ✓）
	{ id: "test-hp-nan-e2e-mjs", phase: 'test', cost: 25, exclusive: true, mutates: ['build'], cmd: "node test/hp-nan-e2e.mjs" },
	// `#1426`：战斗收尾时机端到端（自建夹具根 ⇒ exclusive，照同族先例 ✓）
	{ id: "test-fightpanel-turns-e2e-mjs", phase: 'test', cost: 20, exclusive: true, mutates: ['build'], cmd: "node test/fightpanel-turns-e2e.mjs" },
	// `#1413`：`fight:` 结果维端到端（**自建故事根** ⇒ exclusive，照同族先例 ✓）
	{ id: "test-fight-keys-e2e-mjs", phase: 'test', cost: 15, exclusive: true, mutates: ['build'], cmd: "node test/fight-keys-e2e.mjs" },
	{ id: "test-passages-assemble-mjs-selftest", phase: 'test', cost: 0.1, inputs: ['*'],   // `#1114` 全跑型（纯函数注入段——无 fs 面；`#1093` 裁定 5756510512 ①）
		cmd: "node test/passages-assemble.mjs --selftest" },
	{ id: "test-docs-read-path-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/docs-read-path.mjs --selftest" },
	// `#1043`：散文正文的**词汇门** —— 内容故事（`audience: content`）的正文只许"散文／链接／payload 标记／
	// 引擎已宣告的词汇宏"；禁 SugarCube 逻辑/表达式宏与未宣告宏（甲-1 的防退化保证）。内部件豁免（打印计数）。
	// 车道 D 切片 3（`#215` 报备 `18502113`）：**键级图的显示层**（jsdom，无宿主副作用 → cost 0.4）。
	// 车道 D 切片 2（`#215` 报备 `18501384`）：**事件依赖的键级图**（只读 → 无前置、纯计算 → cost 0）。
	// `#1031`：**自证接线**（本件自带 `--selftest` 入口却从未在 CI 里跑过 →“能假”那半零守护）。
	//注意：接线前提：该 `--selftest` 跑的是**合成输入的成对正反例**（主跑不执行那些例）—— 已逐件实跑 + 看过实现面。
	// 车道 G 前半 · 切片 1a（`#215` 报备 `18502752`）：**方言指纹**（只读 → 无前置、纯计算 ＋ 读三故事的真文件 → cost 0.1）。
	// 车道 G 前半 · 切片 1b（`#215` 报备 `18503024`）：**`contractVersion` ＝ 允许的全集（包络）**（只读、发现式取故事 ＋ 读真清单 → cost 0.1）。
	// 车道 G 前半 · 切片 1c（`#215` 报备 `18503697` / 开工报备 `18503987`）：**`N-1` 兼容层三件哨兵**（只读、读真登记表 ＋ 三故事真号 → cost 0.1）。
	{ id: "test-contract-compat-mjs", phase: 'test', cost: 0.1, cmd: "node test/contract-compat.mjs" },
	// 车道 E-B2（`#215` 报备 `18502613`）：**规则行**页内面（读故事源 ＋ `web/**` —— 不读 `dist` → 无前置；jsdom ＋ `createContext` → cost 0.4）。
	// 车道 E-B3（`#215` 报备 `18504078`）：**读侧（`--reads`）页内面** —— 页内只跑 ① 条件表行级（读故事源 ＋ `web/**` → 无前置；jsdom ＋ `createContext` → cost 0.4）。
	// `#1156`：**可读键形成对断言** —— core 的 `readKeyFamily`（镜像）≡ 引擎 `readKey` 的**分支族**（真源）→
	// 跨语言（twee 不能 import JS）故双份**故意存在**，但**不许悄悄漂移**（改名 → 格红 探针式）。cost 0（纯读码）。
	{ id: "test-readkey-family-mjs", phase: 'test', cost: 0, cmd: "node test/readkey-family.mjs",
		inputs: ['*'] },
	// `#1141`：**md 故事段落对两处面可见**（`ui-migration-diff` 的 parsePassages／`engine-story-free` 的 scriptBodies）→ 读 md 源与 core 分派面 → 全跑型
	// `#1157`：**报文自带作用域** —— 跑真入口（`scripts/audit.mjs`）取首行对象头 → 面＝整个审计驱动器 → 全跑型
	// 车道 D · `--settle`（`#215` 报备 `18504699`）：**落点文案页内面** —— 页内与 CLI **同一份判据**（`core/settleRows.mjs` → 两侧同判 ＋ 非空上的同判；读故事源 ＋ `web/**` ＋ `scripts/audit/context.mjs` → 无前置；jsdom → cost 0.4）。
	// `#794` P1①：「故事包 I/O ＝ 唯一写路」的自证（核心在 `editor/lib/core/story.mjs`；含**写侧哨兵**：拒绝型 io → 写入当场失败）。
	{ id: "test-core-story-mjs", phase: 'test', cost: 0, cmd: "node test/core-story.mjs" },
	// `#794`：**import 副作用门** —— 任何 `editor/**` 模块被 import → 跑完且只留哨兵（`exit(0)` 与 import 期输出都必红）。
	{ id: "test-import-side-effects-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/import-side-effects.mjs --selftest" },   // `#1031`：接线（合成模块输入 → 布尔计入退出码）
	{ id: "test-import-side-effects-mjs", phase: 'test', cost: 0.6, cmd: "node test/import-side-effects.mjs" },
	{ id: "scripts-audit-mjs-consequences-check", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/audit.mjs --consequences --check" },
	{ id: "scripts-audit-mjs-a11y-check", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/audit.mjs --a11y --check" },
	{ id: "scripts-audit-mjs-sitedisc-check", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/audit.mjs --sitedisc --check" },
	{ id: "scripts-audit-mjs-text-check", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/audit.mjs --text --check" },
	{ id: "scripts-audit-mjs-state-check", phase: 'test', tier: 'full', cost: 0.1, cmd: "node scripts/audit.mjs --state --check" },
	{ id: "scripts-audit-mjs-literals-check", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/audit.mjs --literals --check" },
	// `#1261`：`test-rules` 随其样本（故事数据面）下架，用例文件保留待迁 books 仓（见下架台账）。
	{ id: "test-invariants-unit-mjs", phase: 'test', cost: 0, cmd: "node test/invariants.unit.mjs" },
	{ id: "test-rules-claims-mjs-selftest", phase: 'test', cost: 15.6, cmd: "node test/rules-claims.mjs --selftest" },
	{ id: "test-rules-claims-mjs", phase: 'test', cost: 15.6, cmd: "node test/rules-claims.mjs" },
	{ id: "test-layering-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/layering.mjs --selftest" },
	{ id: "test-layering-mjs", phase: 'test', cost: 0, cmd: "node test/layering.mjs" },
	// `#1132` 块2 B1：车卡两宏守卫读数（boot 起真引擎 前置＝boot 自带的 dist 新鲜度断言 → 不另声明 needs）
	// `#1132` B2：等价读数（旧 JS ↔ 新施加器吃 json；序列级 → 咬到单次格看不见的数据污染）
	// `#1132` B2：施加器每动词一格（set／add／append ＋ 未知动词大声报）
	{ id: "test-gen-segment-syntax-mjs", phase: 'test', cost: 0, inputs: ['*'], cmd: "node test/gen-segment-syntax.mjs" },
	// `#1166` 护栏机械化：三条命令的自证段（三件套房式 => 脚本 ＋ `--selftest` ＋ 段）
	{ id: "scripts-clean-net-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'], cmd: "node scripts/clean-net.mjs --selftest" },
	{ id: "scripts-precommit-check-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'], cmd: "node scripts/precommit-check.mjs --selftest" },
	{ id: "scripts-lint-new-segment-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'], cmd: "node scripts/lint-new-segment.mjs --selftest" },
	// `#1314`（Operator 指示）：**「违规符号检测规范」已撤销** —— 原 `lint:style` 两段
	// （`scripts-lint-human-face-mjs-check`／`-selftest`）连同 `scripts/lint-human-face.mjs` 一并摘除。
	// 理由（Operator 原话）：**「这个替换完全是掩耳盗铃…绕过有何意义？」**
	// ⇒ 能被无成本绕过的规范应当撤掉，而不是逼人换字（症状＝『换个词就过』＋『门内外两套风格』）
	// ⇒ 属**判据与目的脱钩**。
	// 历史为过门做的记号清理**不回滚**（无害）；此后记号自由使用（不再有门在拦）。

	{ id: "test-gen-needed-mjs", phase: 'test', cost: 0.3, inputs: ['*'], cmd: "SG_STORIES_DIR=test/fixtures/gen-needed/stories node test/gen-needed.mjs" },   // `#1192`：构建期重编判据（与故事内容无关）｜`#1343`：cmd **内联夹具根**（3 个最小故事 ⇒ 反向核真核过 ✓；✗ 不新造发现机制）
	{ id: "test-route-registry-mjs", phase: 'test', cost: 0.3, inputs: ['*'], cmd: "node test/route-registry.mjs" },   // `#1189`：实现路线表判据（覆盖／完读／腐烂／反向核）
	{ id: "test-npm-entries-guard-mjs", phase: 'test', cost: 0.4, inputs: ['*'], cmd: "node test/npm-entries-guard.mjs" },   // `#1200`：npm 入口差集护栏的判据面（端到端能红 + 接线）

	// #484 回归：把产品的 rAF 人为推迟 800ms（模拟高负载尾部事件）→ smoke 仍须通过
	//（这就是"等产品自己的时钟（1 个 rAF tick）"这个修法的回归证据；不注入时是一次普通 smoke）
	// #441 切片③④：多故事产物 + 书架页 + 故事页字体前缀（纯函数自证 + 真实产物检查）
	// `#460`／`#566`：**逐故事真启动**（StoryInit 无错 ＋ `$era` 已定义 ＋ 起始段非空）——本段已含此判据
	{ id: "test-multi-story-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/multi-story.mjs --selftest" },   // `#1031`：接线（S1–S5 正反例，主跑不执行这些合成例）
	{ id: "test-multi-story-mjs", phase: 'test', cost: 0.1, cmd: "node test/multi-story.mjs" },
	// #458 前置：**六处同步**校验（源文件/ORDER/MODULES/故事清单/常量声明/聚合返回）＋单根假设清点
	{ id: "scripts-move-precheck-mjs", phase: 'test', cost: 0.2, cmd: "node scripts/move-precheck.mjs" },
	{ id: "scripts-move-precheck-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node scripts/move-precheck.mjs --selftest" },
	// #436 收编（#493 的硬前置）：audit golden 基线。实测**全量仅 8.0s**（dragon 7.0s ＋ 其余每个 30–55ms）
	// → 不需要"便宜子集"，整段进链；自证单列（比对函数自身的 10 例）
	// #457：文案计数**规则**自证（R1–R5；数字是 #459 `Sg.story.copy()` 迁移的基线）
	// 浏览器验收本体在 CI 的 soak job 跑（需 Chrome）；**守卫逻辑的自证不需要 Chrome**，故进主链
	{ id: "test-globals-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/globals.mjs --selftest" },
	// #407 D9①：选项前提可溯源（#404 的实例）——`--strict` 是红证入口
	{ id: "test-premise-source-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/premise-source.mjs --selftest" },
	// #407 D9④：场合面（NPC 登记簿须有 venue/role；当前登记模式报告）
	{ id: "test-npc-venue-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/npc-venue.mjs --selftest" },
	{ id: "test-npc-venue-mjs", phase: 'test', cost: 0, cmd: "node test/npc-venue.mjs" },
	{ id: "test-premise-source-mjs", phase: 'test', cost: 0, cmd: "node test/premise-source.mjs" },
	// `#1012`：**导航后焦点仍在正文内**（`docs/criterion-design.md` §八 8.5「键盘可续」的可机检版）——
	// 契约＝交互后 `activeElement.closest('#passages')` 必真（不绑具体元素）；两半都要能假：
	// 导航型交互（真会红：修前焦点落 `body`）＋ 反例「程序性导航不许抢焦点」。
	// `#1261`：编辑器 WebUI 的启动入口段（及其 `#1033` 说明）已随大裁剪下架 ⇒ 该段与其注释同删（段引用不存在件的悬空引用）。
	{ id: "test-globals-mjs", phase: 'test', cost: 0, cmd: "node test/globals.mjs" },
	// `#215` 裁 (B)：**见证机器**自证 —— `walker --witness` 产出的轨迹够不够当 P4 的"见证"（到 ending ／同 seed 逐格可复跑 ／两条断言能假）。
	// `#1070`：**`tier:'full'`**（P4 见证件・发布/夜间面，理由见 `FULL_REASONS`）
	// ＋ `cost` 由旧值 **0.4** 改正为 **86.2**（旧值 **228× 失真** —— 它正是“读数不可信”的源头之一）。
	// `#1261`：`test-witness-trace` 段随其样本下架。
	// #462：存储缝（键构造单一落点 · 两作用域 · 幂等迁移）
	// `#1261`：`test-store-keys` 件已随样本下架 → 其两段同删（段引用不存在件的悬空引用）。
	// #441-A：结算可脱离浏览器驱动（rng 可注入 · rollSite 纯 · present 不写状态）
	// #436 原范围 1：笔记模型门已从 `test/notes-model.mjs` **升级为 audit 门**（可单跑 `--notes`），
	// 一个段替代原来的 `-selftest` ＋ 主跑两段（自证在门内，与其它门一致）。
	// #436 原范围 3：**玩家可见正文漂移**接进计划（`#422-D`／阶段 2 的判据是「漂移＝0」）。
	// 基线用 `origin/main`（CI 里可达：工作流有 `git fetch origin main --depth=1`；那个 92f3d04
	// 迁移基线在浅克隆里取不到——脚本现在会**明确报错**而不是把"读不到"当成"没变化"）。
	// 报告落 `build/`（gitignored）→ CI 不脏树；本地想看文档版就按 README 直接跑脚本（默认写 docs/）。
	{ id: 'scripts-ui-migration-diff-selftest', phase: 'test', cost: 0, cmd: 'node scripts/ui-migration-diff.mjs --selftest' },
	{ id: 'scripts-ui-migration-diff-check', phase: 'test', cost: 0.4, cmd: 'node scripts/ui-migration-diff.mjs --check --baseline=origin/main --out=build/ui-migration-diff.md' },
	// main 侧新增（#360 交涉筹码按类型分派）：reb 冲突时按「计划＝单一权威」加在这里
	// `#1261`：原 `needs: ['test-render-all-mjs']` 随该段下架而移除（前置不再存在）。
	{ id: "test-size-gate-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/size-gate.mjs --selftest" },
	{ id: "test-size-gate-mjs", phase: 'test', cost: 0, cmd: "node test/size-gate.mjs" },
	{ id: "test-silent-gate-mjs", phase: 'test', cost: 0, cmd: "node test/silent-gate.mjs" },
	{ id: "test-comment-face-split-mjs", phase: 'test', cost: 0, cmd: "node test/comment-face-split.mjs" },   // `#1208`：剥注分面接线
	// #762 P0：**故事数据 ↔ 手写版等价**（编辑器转向的第 0 步）——数据与手写 twee 漂移即红
	{ id: "editor-compile-selftest", phase: 'test', cost: 0, cmd: "node editor/compile-story.mjs --selftest" },
	{ id: "editor-equiv-selftest", phase: 'test', cost: 0, cmd: "node editor/equiv.mjs --selftest" },
	// `#976`：**`equiv` 的中间目录与本片自证** —— 唯一 ＋ 用完就清（含失败路径）＋ 幂等失败点名（读故事源 ＋ 真跑一次 equiv → cost 1.0）。
	// `#787` 翻面：手写侧**重指向**为冻结基线（翻面前 `main` 的仓内副本 →「生成得对不对」仍被判）
	// `#1004` B2b：**面夹具**（`face-fixture`）＝接入契约的满配声明面（删掉两个内容故事后，为仍“有消费者”的那些面接上它们）。
	// 两段与 `minimal-demo` 同形：① 声明面等价（冻结基线）；② 引擎门对该故事绿（`--engine-only`）。
	//注意：`--l3=report`（而非 `hard`）：夹具的声明面**比两个旧故事宽得多** → strict 档会把它当成“与手写版形式不一致”的红（基线就是它自己建时的副本 → report 档才是有意义的那一档）。
	// `#762` 车道 C：**K4 门** —— 生成物标记 · 产物新鲜度(幂等) · **逃生舱可枚举**
	//（清单外出现即红；登记腐烂也红 → 例外只能收缩留痕，不能随手加）
	{ id: "editor-k4-selfcheck", phase: 'test', cost: 0, cmd: "node editor/k4.mjs --selfcheck" },
	{ id: "editor-k4", phase: 'test', cost: 0.3, cmd: "node editor/k4.mjs" },
	{ id: "test-state-diagnose", phase: 'test', cost: 0, cmd: "node test/state-diagnose.mjs" },
	// `#1016`：**门面引用完整性**（登记表里指向仓内对象的键必须现存 —— `hatches[].slug`／`hatchFiles[]`／`refusedFaces[].file`）。
	// 为什么要单独一段：这一格要**探针**才能从"写了断言"升级为"真会红"（`#908` ①），而探针的 `id` 必须逐字对上台账行
	// → 台账行只从 `test/**`／`scripts/report-*.mjs`／audit 开关来 → 本件就是那个行。
	//注意：`#1052` 起本件**不再是纯件**（⑦ 节走**真表**：真 `escape-hatch.json` ＋ 真 `git ls-files` ＋ 真 `existsSync`，
	// 与真门 ③d 同一口径 —— 仍**只读** 不写，所以仍不需 `needs` 也不需产物）。
	// → `test` 相位、无 `needs`。
	//注意：`#1052`：**成对登记**（`#1018` 的形状）—— ⑦ 节是「未入库／不存在分开报」的**能假**那一半，
	// 只在 `--selftest` 下跑（探针锤的也是它）→ 不登记它，那一半在 CI 里**零守护**。
	// 两节都跑 = 裸调是①②～⑥的回归，`--selftest` 多跑⑦的判别性格。
	// `#762` 车道 B：**条件表往返**（61 行）。**权威判据是 L1**：两版各自求值后行数组**深度相等**
	// ＋ **字段直方图一致**（每列出现多少次都打出来 —— `#557` 那条老账：总体非空拦不住「少抽一项」）。
	// **为什么这一段显式用 `--l3=report`**：手写版用**模板串**写 `text`、生成物用单引号串 —— 纯**排版**差异，
	// 语义已由 L1 证明相同。降级**写在命令行里** → 计划表里一眼可见（K5）；不许把它改成「默认放行」——
	// 那等于把让步藏进代码（`--l3` 默认是 `hard`）。
	// **让步的承接判据（本仓纪律：让步可以，但要指名谁接手）**：内容由 **L1 逐行深度相等**兜、
	// 列缺失由 **字段直方图**兜、空表由 **面非空**兜、产物稳定由 **幂等（编译两次逐字节）** 兜
	// —— L3 让掉的**只有"排版"这一层**（模板串 vs 单引号串）。
	{ id: "editor-extract-selftest", phase: 'test', cost: 0, cmd: "node editor/extract-story.mjs --selftest" },
	// 车道 B · notes 面样板（`#215` 报备 `18504282`）：**手写 `16-notes-ch1` → 数据面** 的等价门（同一个 `editor/equiv.mjs` → **不新增门**）。
	// `--l3=report`（与 mist-forest 另两个面同口径 —— 产物按字面发射器写法，与手写的引号风格有形式差异 → L3 只报告不判红，语义由 **L1 深度相等 ＋ 字段直方图** 兜住）。
	// 车道 D · notes **同族三件**（`#215` 报备 `18505730`）：`ch2`／`ch3`／`cross` 转录成数据面 → **逐面等价**（同 `editor/equiv.mjs` → **不新增门**）。
	// `--notes=<产物>` 是本次加的可选指定（**默认值一字不改**：不给就还是 `16-notes-ch1.twee`）；`--hand=` **必须显式**（默认指向产物 → 被 `bareHandRefusal` 拒，这是设计）。
	//注意：三个面**一条一行**串起来（→ 只增**一行**台账 → 只配 **1 条探针**）——“一条命令盖全该面”属另一片（`--hand` 要从单文件改成块→基线映射）。
	// `#787` 翻面：**契约面**也从"手写 vs 生成"改成"冻结基线 vs 当前产物"（`--hand`＝翻面前的 main 快照）。
	// 与本故事另一条（`--rules`）分开：两条各自只比**一个**面，基线也各一份 → 失败时能直接指名哪一面。
	{ id: "editor-classify-contract-selftest", phase: 'test', cost: 0, cmd: "node editor/classify-contract.mjs --selftest" },
	// 车道 A 后半：洞窟端到端等价（`--l3=report`：手写风格与生成风格不统一，L3 只当报告；权威判据是 L1＋键集合＋行为）
	// `#787` 翻面：手写侧**重指向**为冻结基线（翻面前 `main` 的仓内副本 →「生成得对不对」仍被判）
	// #752：**去权威化口径门** —— 注释／文档不许拿「谁定的」充当理由（#748 的清零面 ＋ 防回潮）
	{ id: "scripts-report-ledger-freshness-mjs-selftest", phase: 'test', cost: 0, cmd: "node scripts/report-ledger-freshness.mjs --selftest" },
	{ id: "scripts-report-ledger-freshness-mjs-ledger-check", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/report-ledger-freshness.mjs --ledger --check" },
	{ id: "scripts-report-gate-ledger-mjs-selftest", phase: 'test', cost: 0, cmd: "node scripts/report-gate-ledger.mjs --selftest" },
	// `#1079`：带 `--allow-stale-probe` —— PR 档不跑探针段（`#1070`）→ 无 `build/probe-results.json`
	// → 台账的**探针面**不参与逐字节比对（**其余面照旧严格**）；**有读数时它不生效**。
	{ id: "scripts-report-gate-ledger-mjs", phase: 'test', tier: 'full', cost: 0, cmd: "node scripts/report-gate-ledger.mjs --allow-stale-probe" },
	// #474 接线：`自证·` 必须「失败计入退出码」且「不崩」（静态扫描 scripts/ ＋ test/ 共 77 文件，0 致命）
	{ id: "scripts-report-selftest-validity-mjs", phase: 'test', tier: 'full', cost: 0.2, cmd: "node scripts/report-selftest-validity.mjs" },
	// #459／#482：故事「新机制声明表」的形状门（六条可机检点 · 各带正反自证）
	{ id: "test-story-shape-mjs", phase: 'test', cost: 0.1, cmd: "node test/story-shape.mjs" },
	// `#1267`（M1 最后一件）：**用例执行器**判据（三态／陈旧归因／入口两态）
	{ id: "test-case-run-mjs", phase: 'test', cost: 0.2, cmd: "node test/case-run.mjs" },
	// `#1275`：**来源面**端到端格（经夹具 runner；零故事态可跑）＋ `-selftest` 能假两格
	{ id: "test-chk-source-mjs", phase: 'test', cost: 1.5, exclusive: true, mutates: ['build'], cmd: "node test/chk-source.mjs" },
	{ id: "test-chk-source-mjs-selftest", phase: 'test', cost: 4, exclusive: true, mutates: ['build'], cmd: "node test/chk-source.mjs --selfcheck && node test/chk-source.mjs --selfcheck-render" },
	// `#1308`：图鉴**呈现面**（面板恒在／含期望文本／空声明出空态；自带夹具、零故事态可跑）
	{ id: "test-codex-panel-mjs", phase: 'test', cost: 2, exclusive: true, mutates: ['build'], cmd: "node test/codex-panel.mjs" },
	{ id: "test-codex-panel-mjs-selftest", phase: 'test', cost: 5, exclusive: true, mutates: ['build'], cmd: "node test/codex-panel.mjs --selfcheck" },
	// `#1296`：**故事侧容器不得静默吃掉引擎命名空间**（判 emit 的逐容器合并；能假＝改回旧形态必红）
	{ id: "test-ns-merge-mjs", phase: 'test', cost: 0.2, cmd: "node test/ns-merge.mjs" },
	// `#1267`（伞 `#1266`）：**故事根口**判据（守护"引擎能编译并跑仓外故事根"＋"仓内恒等"＋"不拉屎"）
	{ id: "test-story-root-mjs", phase: 'test', cost: 0.5, inputs: ['*'], cmd: "node test/story-root.mjs" },
	// `#1257`：**故事枚举两面一致**（`storySlugs()` ↔ `storyJsonFiles()`；含目录软链口径）
	{ id: "test-story-enum-faces-mjs", phase: 'test', cost: 0.4, inputs: ['*'], cmd: "node test/story-enum-faces.mjs" },
	// `#1130`：**窗口制造者 → 独占**（`exclusive` → 不与任何段重叠；`mutates` ＝ 它动哪些**已入库真源** → 独占的理由可查）
	// 为什么：本段两处 `try/finally` **就地改真源**再恢复 → 恢复会刷新 mtime → 窗口期内"源比 dist 新" →
	// 并行 boot 的段会撞新鲜度守卫（CI 实测 `test-gate-discovery-mjs` 偶发红）→ 故独占（mtime 回填已在段内）
	// `#1024`：**并发假红**（`lint-story` 的 scratch 必须本次运行唯一）—— 3 轮 × 3 进程跑同一 slug
	// ＋ 两条**确定性**判据（旧落点没被重建 · 不留 `.lint-run-*` 草稿）；前置=dist 产物（故事门要读它）
	//注意：`#1044`：**还得排在 `test-lint-story-mjs` 之后** —— 那一段的反例**直接改真文件**
	// `stories/minimal-demo/data/tables.json`（写成 `'{ oops'` → 跑 lint → `finally` 恢复），
	// 而本件 spawn 的正是 `lint-story minimal-demo` → **同波**就会读到**半成品** → 假红「data/*.json 不可解析」
	//（实测：两段并发 **3/3 红**、各自的输出就是那段注入载荷；单跑皆绿）。
	// → 依赖声明＝**单一权威**的排顺手段（同一个洞在 `test-story-ci-mjs` 上早已用同一条修法）。
	// ➕ `#1044` 后半（本 PR）：这条边由 `test/plan-needs.mjs` **在册守护**（删边 → 门红并点名两端；探针刀见 `scripts/probes.mjs`）。
	//注意：自证**必须成对登记**（`#1018` 复核席点名的形状）：本件两条判据能不能被"种出来的反例"点燃，
	// 只由 `--selftest` 量 → 不登记它 ＝ 那一半在 CI 里零守护
	// `#1044`：**段间产物依赖边守护**——「改真故事文件的段 → 读它的段」的 needs 边必须在册并点名
	//（纯静态 → 无前置；能假反例在件内；探针刀＝删那条 needs → 必红）。
	// `#1089`（乙′）：**未跟踪扫描面 → 红** 的**守护件**（判据＝`scripts/lib/untracked-guard.mjs` 的纯函数）。
	// 三格成对：①未跟踪→报 ②已跟踪/不在扫描面→不报 ③豁免（**理由＋票号**）→不报但留痕；
	// 内含**端到端真 git 三态**（自建夹具 ＋ 自行清场 → 不依赖仓内既有未跟踪件）。
	//注意：本件只守**判据**；「门有没有真的调它」由 `scripts/probes.mjs` 的刀守（同 `plan-needs` 形态）。
	{ id: "test-untracked-guard-mjs", phase: 'test', cost: 0, cmd: "node test/untracked-guard.mjs" },
	// #574：逐故事**运行时契约**门 —— 面存在 / 位点能判 / 笔记可用 / 侧栏可用 / 机制真落
	//（成因：`Sg.*` 面缺一段、位点写成属性键、`applyStatus` 返回值被丢、`maxHp` 字段名——四件都曾静默通过）
	{ id: "test-story-runtime-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/story-runtime.mjs --selftest" },
	{ id: "test-story-runtime-mjs", phase: 'test', cost: 8, cmd: "node test/story-runtime.mjs" },
	// #434 阶段 3：`Sg.notes.add()` 的行为门（幂等 · 双写 · 双读 · 多源 setPath 护栏）
	// #460／#441-E：**第二故事接入自检** —— 用最小故事（stories/minimal-demo）跑**引擎门**：
	//「引擎不知道故事名」的可执行证据（产物：书架 2 项；门：引擎门对第二故事绿）。`--check` 前置以免被
	// `auditFlag()` 认成某个门段（它不是单门段，层归属见 `ENGINE_EXTRA`）。
	// `#572`（修法）＋ `#581`（收尾）：这一段一度改成**显式四件套**（当时 `--engine-only` 会一路跑到 `--consequences`
	// 并真的报红）；`#581`（引擎保留槽登记归引擎）＋ `#584`（注释遮蔽）落地后**三故事 `--engine-only` 全 rc=0**
	// → **收回临时收窄**，恢复本段真意：**整套引擎门**对第二故事绿。
	// #490（S5 片二）：**第三个故事**的**洞窟声明面门**（表↔内容双向对账；故事门，故显式指定 --story）
	// `#598`（实测缺陷）：**长战斗「点得动、走得掉」**真机回归 —— 静态门看不见这类运行期死路
	//（`waveRecord` 返回对象被当字符串比 → 两条出口不可达；`<<include>>` 不导航 → 点了没反应）。
	// `#600`：**战斗钥匙掉落**（长战斗必掉 · 短战斗 30%）—— 声明面驱动 ＋ 真机 ＋ 多种子频率（3σ）。
	// `#603`：**文档格式门** —— `README.md` 曾因一个多余的 ``` 让四个标题被吞进代码块（GitHub 上不是节）；
	// `docs/**` 与 README 此前**零机检**（L0 扫 twee、craft 扫正文）。
	{ id: "scripts-md-format-mjs", phase: 'test', cost: 0.1, cmd: "node scripts/md-format.mjs" },
	// #491 判据 1：**本故事**的战斗分布口径（胜率对闭式 · 期望回合/受伤期望 · 分布面 · 同种子复算）
	// `#746`（口径：「文字反馈最重要」）：**有副作用的分支必须有落点文案**（挨了打必须看得见）
	// #602：**引擎门不得出现故事专有字面量**（防"假解耦"回潮：故事判据数据住 `stories/<slug>/audit.json`）
	{ id: "scripts-audit-mjs-engine-story-free", phase: 'test', tier: 'full', cost: 0.1, cmd: "node scripts/audit.mjs --engine-story-free --check" },
	// #607 P0：门的**发现与归属**（引擎门 ∪ 待迁移 ∪ 本故事已声明；顺序表；结构缺失必红）
	// #640（伞 #626）：**矩阵门** —— 场景 × 道具/线索集合 → 期望（行键＝谓词上下文 · 期望＝渲染后+行为面 · 承诺 ratchet）
	// #608：**短战斗相位门**（引擎侧 widget 的契约：四相位→分支 · 未结束不结算不推进 · 奖励/失败笔记走声明面）
	// #705 片二／#702 a2：**敌人实例 · 5e 核心门**（实例化 · 攻击骰 vs AC · 伤害落部位 · 全灭通关）
	// `#701`：**战斗日志门**（可回看的一手一句：有界/保留最近/渲染只读/降级不出现）
	{ id: "editor-k6-selftest", phase: 'test', cost: 0, cmd: "node editor/k6.mjs --selftest" },
	{ id: "editor-k6", phase: 'test', cost: 0.2, cmd: "node editor/k6.mjs" },
	// `#984`（P3-④ **用户故事 CI**）：**按故事发现 → 逐故事跑 K 门** —— 量到的缺口是"`test-plan` 里故事名
	// **写死**" → 新故事（用户做的第 4 个）不会自动进 CI。本段跑"发现 → 逐故事 + 全局面每轮一次"；
	// 自证见 `test/story-ci.mjs`（含**能假**一格：夹具故事必须出现在 `--list`）。
	//注意：`#1031` 起片实测：本件的 `--selftest` **不是入口** —— 实测 `node test/story-ci.mjs --selftest` 与**裸调输出逐字节相同**，且件内**无 `process.argv…includes('--selftest')` 派发**（那个字符串是**真断言**：`cli(['--selftest'])` 在测 `cli` 的旗标）。
	// → 台账 `selfProofWired()` 的子串判据在本行是**假阳性**（它要求 plan 里出现字面量 `test/story-ci.mjs --selftest`）。
	// → **不硬接一个无意义旗标**（票面禁“为凑绿而接线”）、也**不删**件内那个字符串（删了会拆掉一条真断言）—— 留痕在此，口径修正见 `#1031` 票内。
	// 本段的 `cmd` **裸调即其自证**（断言每次调用都跑）。
	{ id: "test-story-ci-mjs-selftest", phase: 'test', cost: 0.2, cmd: "node test/story-ci.mjs" },
	//注意：**为什么有 `needs`**：本段**发现"活的" `stories/`**（口径＝目录里有 `00-story.json`），
	// 而另两段会在**运行中往 `stories/` 放临时故事**（`test-web-preview.mjs` 建 `stories/__e2e`；
	// `test/lint-story.mjs` 为了反例临时改真 `tables.json`）→ 撞上就会读到**半成品** → 本段红。
	//注意：**根因已定**（`#989`）：「**断言「恰好发现三个故事」**」 会被临时故事打红 —— 全量跑时
	// 红的那一格正是它（`--list` 精确等值 ＋ 壳自证里同形那条）→ 已改成 **⊇**（「真故事都在」，
	// 不赌「只有它们」）。注意：`needs` 仍留：它是**另一条独立理由**（避免读到**半改的真数据**），
	// 不是这条红的原因。
	// `#1261`：原 `needs: ["test-lint-story-mjs"]` 随该段下架而移除（前置不再存在）。
	{ id: "test-story-ci-mjs", phase: 'test', cost: 18.6, cmd: "node editor/story-ci.mjs" },
	// `#761` P1 第一片（WebUI 静态加载）：纯加载件的测例（含 `--selftest` —— 那格"行为化"有依据）。
	// `#761` P1 第二片：**页内编译对拍**（三故事 × 产物逐字节 ＋ 反例：源变则异 · 无源必抛）。
	// `#761` P1 第三片：**写包对拍**（经唯一写路 writeStoryPackage，与 CLI 产物逐字节）。
	// `#761` P1 六片A-2：**预览读数**（控制跑 ／区间＋标记 ／不受影响面 ／对偶 ／状态敏感性 ／不污染 dist）。
	//注意：cost 高: 内含**两次构建** ＋ 4 次 boot（~5–8 分钟）
	// `#761` P1 第四片：**改一个事件**的字段级读数（差异恰好一处 ／写回逐字段一致 ／产物只少数行变）。
	// `#761` P1 第五片：**DOM 接线**（页面路 vs 直接路逐字节同；jsdom 显式收场）。
	// `#892`（P4-1）：页内**新建**（起手包落内存 不碰 fs 可接既有表单）（jsdom）。
	// `#1034`：导出下载接线 —— 入口在页面上、导出物清单与内核编目一致、空/部分包必报错、不落盘
	// `#1011`（保覆盖版）：`#360` 交涉筹码按类型分派（B 段退役件接回；样本＝`face-fixture` 的 `老板娘·进塔`）
	// `#1020`：条件位/授予位的**键形**必须引擎真能求值（`readKey` 权威；`note:n_*` → 条件恒假／授予位抛错）
	// `#1132` 块2 片A：**故事侧代码面**（零逃生舱方向的 ratchet 门）
	// `#707`：**战斗状态字段使用面门**（每个 `$pc.ev.fight.<字段>` 都必须有人用；死字段点名）
	// `#693`（P1）：**主交互路径门**（确定性路线：点得动 · 无红框 · 到终点 · 产出可见）
	// 洞窟「商人」门（`#696`：金币要有出口 → 旅人里随机出现商人；报价读声明面 · 买不起不显示 · 火把油）
	// 洞窟五步主线**末步**门（实测）：走满 5 步再回岔口时**不许**抛 `roadOffer(6)` 红框 → 越界走退路
	//注意：`#1070`：**还得排在 `test-web-preview-mjs` 之后** —— 本件驱动 `node editor/cli.mjs k4`（真门），
	// 而 k4 会 `readdirSync(stories)` 逐故事判 → `test/web-preview.mjs` 的临时夹具 `stories/__e2e`
	//（带 `00-story.json`）存活期间跑它 → 产生 ` __e2e：手写契约源非空（0 文件）却分类出 0 名成员` → **假红**
	//（实测：起了 `stories/__e2e` 再跑 `editor/cli.mjs k4` → rc=1 且点名 `__e2e`；清掉 → rc=0）。
	// 依赖声明＝**单一权威**的排顺手段（同族：`test-story-ci-mjs`／`test-lint-scratch-mjs` 早用同一条修法）。
	// `#660` 片三-3：**pc 默认形状住引擎、数值走故事**（`Game.Pc.defaults()` 摘掉 `Sg.story.pcDefaults()` 后每个值都必须中性；
	// 缺面 → 显式降级 · 畸形面 → fail-loud · `migrate()` 兜底带故事数值 · 三故事键集合一致）
	//注意：`#1070`：**还得排在 `test-web-preview-mjs` 之后** —— 本件 ⑥ 走 `storySlugs()`（扫 `stories/` 下带
	// `00-story.json` 的目录）→ 而 `test/web-preview.mjs` 会在**运行期间**临时建 `stories/__e2e`（带清单）
	// → 同波命中它 → `boot({story:'__e2e'})` 找不到故事页 → **假红**（实测：波次重排后本段与 web-preview 重叠 → 必红）。
	// 依赖声明＝**单一权威**的排顺手段（同族：`test-cli-surface-mjs`／`test-story-ci-mjs`／`test-lint-scratch-mjs`）。
	// `#572`：**「选中 → 真跑」门** —— 门的 `run()` 被选中也可能静默早退（九道引擎门里七道就是这样）。
	// 本段自证 `runSelectedGates()` ＋ 真跑默认故事，断言末行「选中 9 门 · 实跑 9 门」（修前那条汇总行不存在）。
	// `#1261`：原 `needs: ["scripts-audit-mjs-story2-engine"]` 随该段下架而移除。
	{ id: "test-audit-gates-run-mjs", phase: 'test', cost: 0.3, cmd: "node test/audit-gates-run.mjs" },
	// #490（S5）：**第三个故事**（无名洞窟）的引擎门 —— 它**声明了** S1–S4 的四件套（`mechanics()` 非 null）
	// → 四道引擎门在这里第一次判**一个真正启用了新机制的故事**（`#486`–`#489` 的出口判据）。
	// `#572` 同上：临时收窄已收回（`#581`／`#584` 落地后整套引擎门全绿）→ 本段跑**整套引擎门**。
	// #435 阶段 4：条件表门（死规则 = 永不被选中的行）
	// #435 阶段 4：「无字面状态读」门（：表/内容都经封装层读——票面「数据表不得出现字面状态读」）
	// #486（S1）：槽位/耐久**机制**门（引擎门——判据来自声明表，不读故事散文）：
	// 两态语义 · 部位命中分布 · 损坏阈值 · 兼容降级 ·「声明面 ≤ 实现面」
	{ id: 'scripts-audit-mjs-slots-check', phase: 'test', tier: 'full', cost: 0, cmd: 'node scripts/audit.mjs --slots --check' },
	{ id: 'scripts-audit-mjs-facade-call-check', phase: 'test', tier: 'full', cost: 0, cmd: 'node scripts/audit.mjs --facade-call --check' },   // `#1445`：门面调用面约束（绕门面直调 ⇒ 点名）
	// #487（S2）：部位×异常门（同为引擎门：输入＝声明表）
	{ id: 'scripts-audit-mjs-status-check', phase: 'test', tier: 'full', cost: 0, cmd: 'node scripts/audit.mjs --status --check' },
	// #488（S3）：波次与重置门（引擎门）
	{ id: 'scripts-audit-mjs-waves-check', phase: 'test', tier: 'full', cost: 0, cmd: 'node scripts/audit.mjs --waves --check' },
	// #489（S4）：事件池与三选一门（引擎门）
	{ id: 'scripts-audit-mjs-roads-check', phase: 'test', tier: 'full', cost: 0, cmd: 'node scripts/audit.mjs --roads --check' },
];

// ── 门的**两层化**（#436-a）：引擎门 / 故事门 ──────────────────────────────
// 判据不是"哪个文件"，而是「**判据从哪来**」：
// · **引擎门**：判据与故事内容无关（拿清单/声明式表当输入）→ 换故事只换输入 → 第二故事能直接跑；
// · **故事门**：判据来自**本故事的散文与内容**（锚句/段落名/路线/NPC 动机）→ 第二故事会被判红。
// 为什么需要它：`#441-F`（第 1/4 步出口＝第二故事能接）的出口判据就是「**只跑引擎门**」；
// 若把 24 道门全跑，第二故事一定会被本故事的判据判红。
//
// 口径（可机检，且**反沉默**）：
// ① `AUDIT_ENGINE ∪ AUDIT_STORY` 必须**恰好等于**计划里出现的所有 `--<flag> --check` 段（多一个、
// 少一个都红）——新增门忘了归层会被 `validateLayers()` 当场抓住；
// ② 同一个 flag 不许同时出现在两层（歧义即红）；
// ③ 未分类的**非门段**一律按 `story` 处理（**保守**：绝不误入引擎门集合 → `--engine-only` 只多不少地安全）；
// 要把它划进引擎门，就显式加进 `ENGINE_EXTRA`（一行）。
// 注：`a11y` 也是引擎门，但**尚未接线**（F2 台账：未接线 7 道）→ 接线时加进本表（否则 `validateLayers()` 的僵尸声明会报红——这正是想要的行为）
export const AUDIT_ENGINE = ['consequences', 'literals', 'state', 'sitedisc', 'text', 'engine-story-free', 'slots', 'status', 'waves', 'roads', 'facade-call'];   // #486：slots 是引擎门（输入＝声明表）
// **`#607` P0 起 `AUDIT_STORY` 的含义**：＝「**尚未迁移**的故事门」清单（历史包袱；搬完一批删一批）。
// 已搬进 `stories/<slug>/gates/` 的门由**该故事的清单**声明（`00-story.json` 的 `gates`），由 `scripts/audit/discovery.mjs`
// 发现 → 下方这两个表只描述"还在工具层的门"。落点与机制见 `docs/criterion-design.md` §八 8.15。
// **已搬走**：P1 试点 `economy` / `items`＋`tokens` / `notes`；P2-A① `truth` / `choices` / `nosl` / `interact` /
// `social` / `combat` / `starbudget` / `systems` / `checks`；P2-A② `canon` / `echoes` / `craft` / `dragon` /
// `rules` / `reads` / `investment` / `npc` / `gear` → `stories/mist-forest/gates/`（故事 1 已搬完）；
// P2-B `cave` / `combat-dist` → `stories/hollow-cave/gates/`（故事 3 的两门）。
export const AUDIT_STORY = [];   // #607 P2-B：**故事门已全部搬到故事侧**（`stories/<slug>/gates/`，清单声明）→ 工具层不再有故事门
// 非门段里**与故事内容无关**的那些（构建 / 构建期 lint / 产物守卫）：显式登记，不放宽默认
export const ENGINE_EXTRA = ['build-mjs', 'test-multi-story-mjs',// `#1012`：引擎侧焦点契约（与故事内容无关） // `#1033`：编辑器入口（与故事内容无关）
	'test-story-runtime-mjs-selftest', 'test-story-runtime-mjs',
	'test-layering-mjs-selftest', 'test-layering-mjs', 'test-globals-mjs', 'test-silent-gate-mjs',
	'test-gen-needed-mjs',   // `#1192`：构建期重编判据（与故事内容无关）
	'test-route-registry-mjs',   // `#1189`：实现路线表判据（与故事内容无关）
	// `#1261`：`test-pc-base` 段与理由块随其样本下架（文件保留待迁 books 仓）。
	/* 原条目（备查）：
	*/
	'test-comment-face-split-mjs',   // `#1208`：剥注分面接线（与故事内容无关）
	'test-npm-entries-guard-mjs',   // `#1200`：npm 入口差集护栏判据（与故事内容无关）
	'test-size-gate-mjs-selftest', 'test-size-gate-mjs',
	// #607：门发现面与故事内容无关（清单/归属/顺序表）
	// #608：短战斗相位门判的是**引擎侧契约**（故事只是驱动）【`#1004` B2：该测试件已随故事删除 → 入口一并去掉】
	// `#660` 片三-3：pc 默认**形状**住引擎（故事只给数值）→ 判的是引擎侧契约
	// 洞窟末步门判的是**故事 2 的内容**（`stories/hollow-cave/10-cave.twee`）→ 归 story 层；为免与故事层计数混淆，
	// 这里显式登记为"故事内容门"的同族（不进 ENGINE_EXTRA）
	];

// 段 → 层。`--<flag> --check` 形式的段从 flag 表推；其余：在 `ENGINE_EXTRA` 里 → engine，否则 story。
// `declaredStoryFlags`＝**故事清单里声明的门 flag**（`#607` P1 起非空）：它们同样是"故事层"，
// 只是住址已经从工具层搬走 → 层判定必须认它们，否则搬家那一刻 `validateLayers()` 会误报"未归层"。
export const segmentLayer = (seg, declaredStoryFlags = []) => {
	const m = auditFlag(seg);
	if (m) return AUDIT_ENGINE.includes(m) ? 'engine' : 'story';
	if (m && (AUDIT_ENGINE.includes(m[1]) || AUDIT_STORY.includes(m[1]) || declaredStoryFlags.includes(m[1]))) {
		return AUDIT_ENGINE.includes(m[1]) ? 'engine' : 'story';
	}
	return ENGINE_EXTRA.includes(seg.id) ? 'engine' : 'story';
};

// 只认 **`scripts/audit.mjs` 的门段**的 flag —— 别把 `report-ledger-freshness --ledger --check`
// 这类同名形态误当门（本 PR 的校验第一次跑就抓到过这个假阳性）
export const auditFlag = (seg) => {
	const cmd = seg.cmd ?? '';
	if (!/scripts\/audit\.mjs\b/.test(cmd)) return null;
	const m = /--([a-z-]+)\s+--check\b/.exec(cmd);
	return m ? m[1] : null;
};

// 计划校验（跑器起跑前调用；返回问题清单，空＝通过）
export const validateLayers = (plan = SEGMENTS, { declaredStoryFlags = [] } = {}) => {
	const problems = [];
	const dup = AUDIT_ENGINE.filter((f) => AUDIT_STORY.includes(f));
	if (dup.length) problems.push(`层表歧义：${dup.join('、')} 同时在 engine 与 story`);
	const dup2 = AUDIT_ENGINE.filter((f) => declaredStoryFlags.includes(f));
	if (dup2.length) problems.push(`层表歧义（门已搬进故事侧却仍声明成引擎门）：${dup2.join('、')}——清 AUDIT_ENGINE 或改故事的声明（#607）`);
	// 计划里真实的 audit 段 → 必须**恰好**被两层覆盖
	const planFlags = new Set();
	for (const s of plan) { const f = auditFlag(s); if (f) planFlags.add(f); }
	const declared = new Set([...AUDIT_ENGINE, ...AUDIT_STORY, ...declaredStoryFlags]);
	for (const f of planFlags) if (!declared.has(f)) problems.push(`未归层：计划里的 \`--${f} --check\` 段没有任何层（新增门请加进 AUDIT_ENGINE／AUDIT_STORY）`);
	// 僵尸：**工具层层表**里声明了、却没有对应计划段（删段时忘了同步层表）。
	// 注：`declaredStoryFlags`（故事清单声明的门）**不参与**这一条——它们住故事侧，未接线的判定归
	// `report-gate-ledger.mjs` 的 F2（「未接线必须写明理由」），这里只管"层表 ↔ 计划"的一致性。
	for (const f of [...AUDIT_ENGINE, ...AUDIT_STORY]) if (!planFlags.has(f)) problems.push(`僵尸层声明：${f} 在层表里，但计划里没有对应段（删段时请同步层表）`);
	for (const id of ENGINE_EXTRA) if (!plan.some((s) => s.id === id)) problems.push(`僵尸 ENGINE_EXTRA 条目：${id} 不在计划里`);
	return problems;
};

/** 计划校验（`tier` 面；`#1070`）—— 跑器起跑前调用；返回问题清单，空＝通过。
 *
 * 四条 **每一条都对应一种“静默”**：
 * ① **非法档位**（拼错 `'Fast'`／`'full '`／非字符串）→ 红：否则 `tierOf` 把它当缺省 → 看着跑了、其实归错档；
 * ② **缺档位的段不许当“不存在”**：无 `tier` → **缺省 fast**（**不是跳过** —— 这是本机制的头号假绿面）；
 * ③ **`fast ∪ full ＝ 全集`**：两档的选择器**逐段覆盖**整个计划 → 挡住“标了 tier 却在两档都不跑”；
 * ④ **每条 `full` 必须有理由**（`FULL_REASONS`）：降频是一次**显式决定**，得留痕 → 后人不用猜。
 *
 *注意：**`fast` 档不许等于全集**（否则“减负”是假的且**没人看得出来**）—— 这一条只在“确有 full 段”时要求；
 * 若将来 `full` 段全部回归 fast → 它自然通过（那时本机制就该撤 而不是报假红）。 */
export const validateTiers = (plan = SEGMENTS, { reasons = FULL_REASONS } = {}) => {
	const problems = [];
	// ① 档位合法
	for (const s of plan) {
		if (s.tier === undefined) continue;                       // 缺省合法（＝fast）
		if (!TIERS.includes(s.tier)) problems.push(`非法 tier：\`${s.id}\` 的 tier=${JSON.stringify(s.tier)}（合法值：${TIERS.join('｜')}）`);
	}
	// ② 双档覆盖（**缺省即 fast** → 无 tier 的段不会被漏掉）
	const fastSel = plan.filter((s) => tierOf(s) === 'fast');
	const fullSel = plan.filter((s) => tierOf(s) === 'full');
	if (fastSel.length + fullSel.length !== plan.length) {
		problems.push(`tier 覆盖不齐：fast ${fastSel.length} ＋ full ${fullSel.length} ≠ 全集 ${plan.length}`);
	}
	// ③ 并集＝全集（选择器等价写法：显式求并再看是否逐段命中 —— 不靠“减出来的差”）
	const union = new Set([...fastSel, ...fullSel].map((s) => s.id));
	const missing = plan.filter((s) => !union.has(s.id)).map((s) => s.id);
	if (missing.length) problems.push(`fast ∪ full 未覆盖：${missing.join('、')}（会在两档都不跑 ✗）`);
	// ④ full 段必须有理由
	for (const s of fullSel) if (!reasons[s.id]) problems.push(`\`${s.id}\` 标了 tier:'full' 但没写理由（加到 FULL_REASONS ✓ —— 降频必须留痕）`);
	// ⑤ **fast 段不得 `needs` 一个 full-only 段**（`#1070` E4）—— 两件事叠加就是**死段**：
	// 本段在 fast 档跑、但它的前置不在 fast 档选择面里 → 跑器起跑前 `validatePlan` 报“依赖了不存在的段” →
	// **整个 PR 档停跑**（不是少跑一段，是**全停**）。
	//注意：本判据的**由来**：实现第一版把 `--tier=full` 当“只跑标 full 的段”→ 两段 full 的 `needs:['build-mjs']`
	// 指向被过滤掉的段 → 当场报错；后来把 full 语义改对了（包含关系），但**那个坑本身没人守**
	// → 这一条就是把它固化成机判据（改写回“只跑 full 段”或给 fast 段加一条指向 full 的 needs → 必红）。
	const byId = new Map(plan.map((s) => [s.id, s]));
	for (const s of fastSel) {
		for (const d of s.needs ?? []) {
			const dep = byId.get(d);
			if (dep && tierOf(dep) === 'full') {
				problems.push(`\`${s.id}\` 在 fast 档，但它的 needs \`${d}\` 是 **full-only** 段 ⇒ fast 档选择面里没有它 ⇒ 跑器起跑前报“依赖了不存在的段” ⇒ **PR 档全停** ✗（要么把 \`${d}\` 留在 fast 档，要么给 \`${s.id}\` 补一条不依赖它的路径）`);
			}
		}
	}
	return problems;
};

export const SUITES = ['engine', 'editor', 'story-legal', 'story-product', 'infra'];

/** `#1093` P1.0：**分组表**（`id -> suite`）—— 口径＝**判据锚的被看护物**（不是目录粗分）。
 * `engine`=判 `src/**` 引擎行为 ｜ `editor`=判 `editor/**`（含页内／浏览器侧）｜ `story-legal`=判 `stories/**` 源数据静态面 ｜
 * `story-product`=判 `dist/**`·运行对拍 ｜ `infra`=判**门禁自身**（门／台账／编排／文档格式）。
 *注意：**本表是交付物**（P1.0） —— 它决定 P2「按改动跳过」的粒度 → 改动它须**走评审**。
 *注意：规模**只作嗅探核**（非硬判据）：本表 engine 42／editor 45／story-legal 24／story-product 10／infra 37；
 * 票面记载过一次测量（48／51／22／14／23）但**未落盘** → 有差属**已知**，按「嗅探非硬判据」处理（`#1093` 裁决）。 */
export const SUITE_MEMBERS = {
	'engine': ['test-invariants-unit-mjs','test-silent-gate-mjs', 'test-gen-needed-mjs', 'test-route-registry-mjs', 'test-comment-face-split-mjs', 'test-npm-entries-guard-mjs',
		'test-contract-compat-mjs','scripts-audit-mjs-consequences-check', 'scripts-audit-mjs-a11y-check', 'scripts-audit-mjs-sitedisc-check',
		'scripts-audit-mjs-text-check', 'scripts-audit-mjs-state-check', 'scripts-audit-mjs-literals-check', 'scripts-audit-mjs-slots-check',
		'scripts-audit-mjs-status-check', 'scripts-audit-mjs-waves-check', 'scripts-audit-mjs-facade-call-check',
		'scripts-audit-mjs-engine-story-free', 'scripts-audit-mjs-roads-check',
		'scripts-ui-migration-diff-selftest',
		'scripts-ui-migration-diff-check',
		'test-globals-mjs',
		'test-rules-core-mjs',   // `#1438` 拆段：只读 `Game.Rules` 的规则核层（接夹具根 ⇒ 进链真跑 ✓）
		'test-globals-mjs-selftest',
		// `#1261`：`test-store-keys` 两项随段下架而移除。
		'test-gen-segment-syntax-mjs',
		'test-chargen-apply-mjs',
		'test-chargen-macros-mjs',
		'test-combat-adv-mjs',
		'test-comment-mask-mjs',
		'test-contract-defaults-mjs',
		'test-fight-seq-mjs',
		'test-pc-base-mjs',
		'test-pc-defaults-mjs',
		'test-properties-mjs',
		'test-locations-adv-mjs',   // `#1353` 乙组：位点优势面（拆出）
		'test-chargen-shape-mjs',   // `#1353` 乙组：车卡面（拆出，暂挂起）
		'test-reread-mjs',
		'test-rules-mjs',
		'test-dialect-mjs',
		'test-contract-version-mjs',
	],
	'editor': [
		// `#1275`：chk: 来源面（写入）＋ 渲染面，各一格
		'test-chk-source-mjs', 'test-chk-source-mjs-selftest',
		// `#1308`：图鉴呈现面
		'test-codex-panel-mjs', 'test-codex-panel-mjs-selftest',
		// `#1296`：引擎命名空间在故事声明同名容器后**仍在**（emit 面判据）
		'test-ns-merge-mjs',
		'editor-compile-selftest', 'editor-equiv-selftest',
		'editor-k4', 'editor-k4-selfcheck', 'editor-k6', 'editor-k6-selftest',
		'editor-extract-selftest', 'editor-classify-contract-selftest', 'test-import-side-effects-mjs',
		'test-import-side-effects-mjs-selftest', 'test-layering-mjs', 'test-layering-mjs-selftest', 'test-core-story-mjs','test-readkey-family-mjs',

		'test-state-diagnose',
		'test-focus-after-nav-mjs',
		'test-equiv-scratch-mjs',
	],
	'story-legal': ['test-multi-story-mjs',
		'test-multi-story-mjs-selftest',
		'test-story-shape-mjs', 'test-story-runtime-mjs', 'test-case-run-mjs', 'test-story-runtime-mjs-selftest', 'test-story-ci-mjs',
		// `#1267`／`#1257`：故事根口与两面一致性（归 `infra` 语义——判的是**工具链口径**，非故事内容）
		'test-story-root-mjs', 'test-story-enum-faces-mjs',
		'test-story-ci-mjs-selftest', 'test-rules-claims-mjs',
		'test-rules-claims-mjs-selftest', 'test-premise-source-mjs', 'test-premise-source-mjs-selftest', 'test-npc-venue-mjs',
		'test-npc-venue-mjs-selftest',
		'test-choice-keys-mjs',
		'test-cond-keyform-mjs',
		'test-cond-keyform-mjs-selftest',
		'test-prose-vocabulary-mjs',
		'test-prose-vocabulary-mjs-selftest',
	],
	'story-product': ['test-size-gate-mjs', 'test-size-gate-mjs-selftest',
		 'build-mjs',
		'test-render-all-mjs',
	],
	'infra': [
		'scripts-probe-gates-mjs-probe-fast', 'scripts-probe-gates-mjs-check', 'scripts-probe-gates-mjs-selfcheck',
		'scripts-report-ledger-freshness-mjs-selftest', 'scripts-report-ledger-freshness-mjs-ledger-check', 'scripts-report-gate-ledger-mjs-selftest', 'scripts-report-gate-ledger-mjs',
		'scripts-report-selftest-validity-mjs', 'scripts-md-format-mjs', 'scripts-move-precheck-mjs', 'scripts-move-precheck-mjs-selftest',
		'test-ci-triggers-mjs', 'test-ci-triggers-mjs-selftest', 'test-repo-shape-mjs', 'test-repo-shape-mjs-selftest',
		'test-docs-read-path-mjs', 'test-docs-read-path-mjs-selftest', 'test-untracked-guard-mjs', 'test-passages-links-mjs',
		'test-block-args-e2e-mjs', 'test-hp-nan-e2e-mjs', 'test-fightpanel-turns-e2e-mjs', 'test-passages-assemble-mjs-selftest',
		'test-audit-gates-run-mjs', 'test-fight-keys-e2e-mjs', 'scripts-clean-net-mjs-selftest', 'scripts-precommit-check-mjs-selftest',
		'scripts-lint-new-segment-mjs-selftest', 'test-coverage-mjs', 'test-gate-discovery-mjs', 'test-plan-needs-mjs',
		'test-attribution-gate-mjs-selftest', 'test-attribution-gate-mjs', 'test-chargen-lazy-e2e-mjs'
	],
};

/** `#1093` P1.1：段的组（查表；**不在表里 → `null`** —— 由 `validateSuites` 报「未归组」）。 */
export const suiteOf = (seg) => {
	const id = typeof seg === 'string' ? seg : seg?.id;
	for (const [k, ids] of Object.entries(SUITE_MEMBERS)) if (ids.includes(id)) return k;
	return null;
};

/** `#1093` P1.1：**完备且不重叠**校验（照 `AUDIT_ENGINE ∪ AUDIT_STORY` 那条「恰好等于」的形态）。
 * ① **未归组**（在计划里、查不到组）→ 报；② **跨组**（同 id 出现在两组）→ 报；
 * ③ 表里**多出**（不在计划里）→ 报（防「表漂了」）。
 *注意：**纯函数 ＋ 注入**（`plan` 与 `members` 都注入 → 自证能喂假计划）—— ㊱：攻击面落在判据上。 */
/** `#1093` P2-a：`inputs` **声明面**的**安全默认 ＋ ratchet 计数**（**本片不含跳过**）。
 *
 * ## 安全默认（裁定：甲）
 * **未声明 `inputs` 的段 → 视为「全跑型」＝总是跑**（**安全方向**）。
 *注意：**绝不取"未声明 → 跳过"** —— 那就是「**漏跑 → 假绿**」（本票最大风险）。
 * → 今日**全部段都未声明** → **行为与今日逐字相同** → **CI 面不劣化**（落地即安全）。
 *
 * ## ratchet（裁定：**不是**"只许降" → 而是「**未声明段数不得增加**」）
 * 为什么不是"只许降"：那会逼人**为全部段一次填满** → 变成行政工作量 → 诱出「**为过门而填的假声明**」
 *（**比不填更坏**）→ 基线＝今日 → **新加段必须声明**、**老段可渐进**。
 * ＋ **计数必须打印**（ratchet 类判据一律打印当前计数）。
 */
/** `#1093` P2-a：**安全默认的机制**（**可单测** —— 不是靠"注释里写着不跳过"）。
 *
 *注意：为什么要有这个**函数**：本片最初把这一格写成 `t('…安全默认…', true)` → **恒真断言**
 * → 复核席实测：**将来有人实现成"未声明 → 跳过" → 那格照样绿**（**比没有断言更坏** —— 看着守住了）。
 * → 修法（采纳复核席建议①②）：把安全默认**落成一个选择函数** → 自证**注入**即可判它真假。
 *
 * ## 语义（**写死** —— 复核席前瞻项）
 * `declared` 为空数组或未给 → **视为「全跑型」＝任何改动面都算命中** → **永不跳过**。
 *注意：即 **`inputs: []` 与"没写 `inputs`"同义** —— **不表示"无依赖"**（后者会成**假绿面** 故不取）。
 * @param {{declared?: string[], changed?: string[]}} x
 * @returns {boolean} 该段**是否算被改动面命中**（未声明 → **恒 true**）
 */
export const inputsMatch = ({ declared = [], changed = [] } = {}) => {
	if (!Array.isArray(declared) || declared.length === 0) return true;      // ← 安全默认：未声明 → 全跑型（**不是**「无依赖」）
	if (declared.some((d) => String(d).replace(/\*+$/, '') === '')) return true;   // ← **全通配 → 恒命中**（与「未声明」同口径）
	return changed.some((f) => declared.some((d) => {
		const base = String(d).replace(/\*+$/, '');
		return f === d || (base && f.startsWith(base));
	}));
};

/** `#1093` P2-d ④：**全通配**（`*`／`**`）的 `inputs` → **必须给出机器可读的理由 ＋ 票号** —— 不许只写注释（不可机检）。
 *注意：口径：判的是「**去掉 `*` 后为空**」（`*`、`**` 是；`src/**` 不是 —— 后者是真面）。
 * 为什么 `['*']` 要管：它**等价「全跑型」** → 等于声明「本段不参与跳过」 → 那是**一次显式决定**
 *（同 `FULL_REASONS` 的口径：降频／不跳过都要留痕）。
 */
export const INPUTS_WILDCARD_REASONS = {
	// `#1267`（伞 `#1266`）：故事根口判据——它**故意**要覆盖"仓内/仓外两态、多个入口（build／module-order／
	// dist-paths）"，任何单面通配都不足以表达"口是否处处生效" → 取全跑型。
	'test-story-root-mjs': {
		reason: '本件按**故事根两态**（仓内默认／仓外 `SG_STORIES_DIR`）跨入口核同一件事（`dist-paths`／`module-order`／`build`）⇒ 依赖面跨 `scripts/**`／`editor/**`／`build.mjs` ⇒ 取全跑型以免漏面成假绿',
		voucher: '#1267',
	},
	// `#1257`：两面一致性——输入是"故事根的树形态"（含目录软链），跨 `dist-paths` 与 `module-order` 两面。
	'test-story-enum-faces-mjs': {
		reason: '本件比较**两个枚举面**在同一棵树上的一致性（`storySlugs()` ↔ `storyJsonFiles()`，含目录软链形态）⇒ 两面分住 `scripts/dist-paths.mjs` 与 `scripts/module-order.mjs` ⇒ 取全跑型',
		voucher: '#1257',
	},
	'test-comment-mask-mjs': {
		reason: '读码两侧（剥注权威 `editor/lib/core/mask.mjs` ＋ 反例夹具）⇒ 面跨 `editor/**` 与 `test/**` ⇒ 取全跑型以免静默跳过成假绿面',
		voucher: '#1206',
	},
	// `#1261`：`test-rules` 随样本下架 -> 理由块同删（用例文件保留待迁 books 仓）。
'test-npm-entries-guard-mjs': {
		reason: '本件端到端跑护栏，而护栏扫描全仓文档与代码里的 `npm run` 引用（跨 docs／scripts／test／.github，且是动态遍历）=> 依赖面跨目录且静态抽面锚不到，取全跑型以免静默跳过成假绿面',
		voucher: '#1200',
	},
	// `#1261`：`test-pc-base` 理由块随段下架。
'test-route-registry-mjs': {
		reason: '扫 `src/**` 全部代码面找多路线现场（跨目录、且形态由表头定）=> 依赖面跨目录且静态抽面锚不到，取全跑型以免静默跳过成假绿面',
		voucher: '#1189',
	},
	'test-gen-needed-mjs': {
		reason: '读各故事清单与 data/ 面（跨 stories，且路径由清单动态给出）=> 依赖面跨目录且静态抽面锚不到，取全跑型以免静默跳过成假绿面',
		voucher: '#1192',
	},	'test-chargen-apply-mjs': {
		reason: 'boot 起真引擎直接调 Sg.Chargen.apply（不读 stories 目录）⇒ 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1132',
	},
	'scripts-clean-net-mjs-selftest': {
		reason: '纯函数自证（脏判定／事后核）不读外部件 => 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1166',
	},
	'scripts-precommit-check-mjs-selftest': {
		reason: '纯函数自证（三分支态判据）不读外部件 => 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1166',
	},
	'scripts-lint-new-segment-mjs-selftest': {
		reason: '合成计划注入五类缺陷（不读真计划）=> 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1166',
	},	'test-gen-segment-syntax-mjs': {
		reason: '纯函数自证（不读 stories；解析器在测试内注入 node:vm）=> 取全跑型以免静默跳过成假绿面',
		voucher: '#1176',
	},
	// `#1261`：`test-chargen-macros` 段与理由块随其样本下架（文件保留待迁 books 仓）。
'test-story-codeface-mjs': {
		reason: '本段读 `stories` 目录下的 twee 清单 ＋ 两处机制标签声明件（漂移检测）⇒ 依赖面跨目录且会随迁移变动 ⇒ 取全跑型 ✓',
		voucher: '#1132',
	},
	'test-passages-assemble-mjs-selftest': {
		reason: '本段读**自证夹具**（跑起来在 src 侧动态造件）＋ 被判件住的目录不止一个 ⇒ 静态面写不窄 ⇒ 取全通配（＝不参与跳过 ✓）',
		voucher: '#1114',
	},	'test-audit-scope-header-mjs': {
		reason: '本段跑**真入口**（`scripts/audit.mjs` 五个面 × 两态 `--story`）取首行对象头 ⇒ 面＝**整个审计驱动器**（含门与产物）⇒ 静态面写不窄 ⇒ 取全通配（宁多跑不漏面 ✓；头的形状一旦走偏必须当场红 ✗）',
		voucher: '#1157',
	},
	'test-readkey-family-mjs': {
		reason: '本段**读码两侧**（引擎真源 `src/engine/40-sim/22-rules.twee`（`#1187` 第五块后）＋ core 镜像 `editor/lib/core/audit-shared.mjs`）；面经**常量间接**（`ENGINE` 常量 ⇒ 抽取器看不到字面量 ✗）⇒ 取全通配（宁多跑不漏面 ✓ 成对断言一旦漂移必须当场红 ✗）',
		voucher: '#1156',
	},
	'test-chargen-macros-mjs': {
		reason: 'boot 起真引擎＋直接调宏 handler（不读 stories 目录）；取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1132',
	},
	'test-codex-panel-mjs': {
		reason: '读引擎产物与渲染 DOM（跨夹具/引擎两目录）=> 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1308',
	},
	'test-codex-panel-mjs-selftest': {
		reason: '同上 ＋ 临时改夹具声明并还原（cp bak）=> 全跑型 ✓',
		voucher: '#1308',
	},
	'test-contract-defaults-mjs': {
		reason: '扫 `src/**` 的全部契约读点并读三故事的契约数据（跨目录、路径由清单给出）=> 依赖面跨目录且静态抽面锚不到，取全跑型以免静默跳过成假绿面',
		voucher: '#1188',
	},
	'test-pc-base-mjs': {
		reason: '读三故事契约与角色状态（跨 stories，且路径由清单给出）=> 依赖面跨目录且静态抽面锚不到，取全跑型以免静默跳过成假绿面',
		voucher: '#1186',
	},
	'test-rules-mjs': {
		reason: '读构建产物与故事数据（契约成员、车卡数据、图鉴条目）=> 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1132',
	},
};   // 键＝段 id；值＝{ reason, voucher}（**缺任一项不生效**）

export const validateInputsWildcardReasons = (plan = SEGMENTS, { reasons = INPUTS_WILDCARD_REASONS } = {}) => {
	const problems = [];
	for (const s of plan) {
		if (!Array.isArray(s.inputs) || !s.inputs.length) continue;
		if (!s.inputs.some((d) => String(d).replace(/\*+$/, '') === '')) continue;
		const r = reasons[s.id];
		if (!r || !r.reason || !/^#\d+$/.test(String(r.voucher ?? ''))) {
			problems.push(`\`${s.id}\` 的 inputs 含**全通配**（去掉 \`*\` 后为空 ⇒ 等价「全跑型」✗）⇒ 须在 \`INPUTS_WILDCARD_REASONS\` 给出**机器可读的理由 ＋ 票号** ✗（缺任一项不生效 ✓）`);
		}
	}
	return problems;
};

export const UNDECLARED_INPUTS_BASELINE = 158;   // 2026-09-21 实测：当时**全部 158 段**都未声明

export const inputsDeclaredStats = (plan = SEGMENTS) => {
	const undeclared = plan.filter((s) => !Array.isArray(s.inputs) || s.inputs.length === 0).map((s) => s.id);
	return { undeclared, declared: plan.length - undeclared.length, total: plan.length };
};

/** ratchet：**未声明段数不得增加**（只比数，不比集合 —— 集合可换，数不许涨）。 */
export const validateInputsRatchet = (plan = SEGMENTS, { baseline = UNDECLARED_INPUTS_BASELINE } = {}) => {
	const st = inputsDeclaredStats(plan);
	const problems = [];
	if (st.undeclared.length > baseline) {
		problems.push(`**未声明 \`inputs\` 的段数增加了**：${baseline} → ${st.undeclared.length}`
			+ `（**新增段必须声明** ✗；老段可渐进 ✓）—— **未声明者（末 6 条）**：${st.undeclared.slice(-6).join('、')}`);
	}
	return { problems, stats: st };
};

export const validateSuites = (plan = SEGMENTS, { members = SUITE_MEMBERS } = {}) => {
	const problems = [];
	const ids = plan.map((s) => s.id);
	const seen = new Map();
	for (const [k, list] of Object.entries(members)) for (const id of list) {
		if (!ids.includes(id)) problems.push(`组 ${k} 里的 \`${id}\` **不在计划里**（表漂了 ⇒ 要么补段、要么删条目）`);
		if (seen.has(id)) problems.push(`\`${id}\` **同时归两组**：${seen.get(id)} 与 ${k}（**不重叠**是本表的前提 ✗）`);
		else seen.set(id, k);
	}
	for (const id of ids) if (!seen.has(id)) problems.push(`\`${id}\` **未归组**（计划里有、表里没有 ⇒ 完备性破了 ✗）`);
	return problems;
};

/** `#1261` 大裁剪：**临时下架**（对象仍在、样本暂缺）的段 —— 与"未声明/失败"分列。
 *
 * 语义三态（领队裁定）：**对象已删 → 退役**（从 SEGMENTS 移出）／
 * **对象在但样本暂缺 → 临时下架**（本表登记，留痕可恢复）／**对象在且样本在 → 修到绿**。
 * 每条必须给 `why`（为什么）与 `until`（何时重建的触发条件）；缺任一项 → 自证格红。
 */
export const SUSPENDED = {
	// `#1353` 乙组：车卡面判据（从 properties 拆出）⇒ 夹具缺 `chargen` 数据面 ＋ **引擎段序缺陷 `#1418`**
	// `#1315` 审计（48h 下架复验）：`test-chargen-shape-mjs` **撤挂** —— `#1418`（车卡惰性求值）已修，
	//   夹具 `m3-chargen-fixture` **扩族属轮**（补 `speciesKey`／`speciesLabel`：断言面含「三项标签齐」⇒ 夹具须给齐 ✓）
	//   ⇒ 夹具根态实跑 rc=0（形状律 ×6 种子 ＋ 组合多样性）✓
	// `#1315` 时效审计（48h 第一/二轮）：`test-readkey-family-mjs` **撤挂** —— why 已失效：两态实跑均 **rc=0**（零故事态／外根态；读数见 `#1315` 审计评论）⇒ 本行理由不再成立（✗ 不写含糊的“永久降级”）。
	'scripts-audit-mjs-consequences-check': { why: '选择后果门：样本需故事条件面（对象＝引擎门）', until: '#1279（M1 尾件回填复验：测试件接新根后）' },
	'scripts-audit-mjs-state-check': { why: '状态契约门：样本需故事状态面（对象＝引擎门）', until: '#1279（M1 尾件回填复验：测试件接新根后）' },
	// `#1343`（撤挂）：`test-gen-needed-mjs` 原挂起理由是「**反向核需 ≥3 个真故事**」⇒ 已补**夹具根**
	// （`test/fixtures/gen-needed/stories`，3 个**最小**故事：形状真、规模小）⇒ `why` 失效 ⇒ 段不再挂起 ✓
	//   两态读数：夹具根态 **rc=0**（3 故事 ⇒ 反向核真核过）／零故事根态 ⇒ **出声未判、rc=0**（✗ 不静默绿 ✓，同 `#1321` 口径）
	//   两条探针已在 `scripts/probes.mjs`（**该重编的必须重编** ＋ **不该重编的不许重编**）✓
	// `#1333`（撤挂）：上面两条已摘 —— 它们的 `why` 均已失效（`why` 会过期，故在此写明"何时失效"）：
	//   · `scripts-md-format-mjs`：`why` 写的是"文档里引用了已下架件（**应改述**，非下架）" ⇒ A 批（`#1329`）把那些引用改述到当前事实 ⇒ 门 **rc=0**
	//   · `test-npm-entries-guard-mjs`：`why` 写的是"取样脚本随 WebUI 下架 ⇒ 待改取样" ⇒ 同批（`#1329` 的 npm 入口那 8 处）修后 ⇒ 门 **rc=0**
	//   两态实跑（零故事根／外根 books）：均 rc=0 ✓（读数写在 `#1333`）
	// `#1315`：`test-audit-gates-run-mjs` **已撤挂** —— 它的 CLI 半段改成**未判**口径
	// （零故事 ⇒ 出声"未判"、不算红），机制面仍由同段的**纯函数格**看着护 ⇒ 不再需要挂起。
	'test-story-ci-mjs': { why: '用户故事 CI：链内跑 `editor/story-ci.mjs` ⇒ **零故事态**（仓内 `stories/` 不存在）下「发现到 0 个故事 ⇒ 不许判过」必红 ✗（单跑 `test/story-ci.mjs` rc=0 是它自己的零故事分支 ⇒ **两态不同形**）；why 未失效 ⇒ 留挂起', until: '#1315 审计：需与零故事口径同笔改后再撤' },
	'scripts-ui-migration-diff-selftest': { why: '自证格里“默认故事”概念在零故事下失效（对象＝迁移比对工具）', until: '#1279（M1 尾件回填复验：本轮未定，下轮复跑）' },
	'test-contract-version-mjs': { why: '对象＝通用机制（方言/契约版本/键形/词汇/工具不变量），样本随 demo 暂缺', until: '#1279（M1 尾件回填复验：本轮未定，下轮复跑）' },
	'test-cond-keyform-mjs': { why: '对象＝通用机制（方言/契约版本/键形/词汇/工具不变量），样本随 demo 暂缺', until: '#1279（M1 尾件回填复验：已裁：默认＝"在生效故事根下存在且可读"）' },
	'test-cond-keyform-mjs-selftest': { why: '对象＝通用机制（方言/契约版本/键形/词汇/工具不变量），样本随 demo 暂缺', until: '#1279（M1 尾件回填复验：本轮未定，下轮复跑）' },
	'test-equiv-scratch-mjs': { why: '对象＝通用机制（方言/契约版本/键形/词汇/工具不变量），样本随 demo 暂缺', until: '#1279（M1 尾件回填复验：本轮未定，下轮复跑）' },
	'test-choice-keys-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：测试件接新根后）' },
	// `#1315` 乙批：`test-combat-adv-mjs` **撤挂** —— 起引擎侧夹具 `test/fixtures/m3-combat-fixture/`，
	//   判据改指该夹具（段名／播种）⇒ 夹具根态实跑 rc=0（报文：5 手在结转优势下掷骰）。
	'test-comment-mask-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：本轮未定，下轮复跑）' },
	'test-contract-defaults-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：改用 `storySlugs()`／样本给出）' },
	'test-coverage-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：本轮未定，下轮复跑）' },
	'test-fight-seq-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：测试件接新根后）' },
	// `#1315` 乙批：**撤挂** —— 起夹具 `test/fixtures/m3-nav-fixture/`；判据去掉两处钉死旧故事（车卡引导链 3 步／`Engine.play('酒馆')`）
	//   ⇒ 夹具根态实跑 rc=0（程序性导航不抢焦点 ＋ 导航型交互后焦点仍在 #passages 内）。
	'test-gate-discovery-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：改用 `storySlugs()`／样本给出）' },
	// `#1315` 审计（下架复验）：`test-pc-base-mjs` **撤挂** —— 原 `EXPECTED_KEYS` 钉死三旧 slug（随 `#1261` 删）
	//   ⇒ 已改判据（对在场故事逐 slug 核「至少一在场 ＋ 形状单一源」）＋ 接夹具根 ⇒ 实跑 rc=0（10 格全绿）✓
	// `#1353` 批 3：撤挂（旧故事数值自洽化 ＋ 接夹具根）
	// `#1353` 乙组：`test-properties-mjs` **撤挂** —— 接 hp 面夹具 `m3-hp-e2e` ⇒ 夹具根态 **13 格绿**；
	//   原 D（车卡）／F（位点优势）两段已拆出（见 `chargen-shape`／`locations-adv`）⇒ 本件回归**单一面**（hp/判定/战斗）。
	'test-render-all-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：测试件接新根后）' },
	// `#1315` 审计（下架复验）：`test-reread-mjs` **撤挂** —— R3–R6 已随声明面 `Truth.claims` 退役（全仓 0 命中），
	//   现存 R1/R2 接新夹具 `test/fixtures/m3-codex-fixture/`（零状态档不泄底）⇒ 夹具根态实跑 rc=0 ✓
	'test-rules-mjs': { why: '样本随 demo 下架（对象＝该用例本身，属引擎/工具面判据）', until: '#1279（M1 尾件回填复验：测试件接新根后）' },
};

/** 临时下架的段（跑器跳过并**单列**，不计失败、也不算未声明）。 */
export const suspendedSegs = () => Object.entries(SUSPENDED).map(([id, meta]) => ({ id, ...meta }));

/** 自证：每条下架声明必须带 why 与 until（否则"临时下架"会变成新的藏身处）。
 * `#1268`（复核）：**还要查"这个豁免是否成立"** —— 下架判定此前**只看 `id ∈ SUSPENDED`**，
 * 而本函数只查 `why`/`until` 非空 → **凭空写一个 id 就能豁免任何段**（实测：给真坏的段
 * 塞进表里 → `--tier=full` 与 `npm test` 双双全绿  ）。→ 补第一道：**下架 id 必须真实存在
 * 于 `testPlan()`**（段名写错／段已删而条目留着 → 红，两向都抓）。 */
export const suspendedProblems = (table = SUSPENDED, { plan = null, knownTickets = null } = {}) => {
	const known = new Set((plan ?? testPlan()).map((s) => s.id));
	return Object.entries(table).flatMap(([id, m]) => {
		const bad = [];
		if (!String(m?.why ?? '').trim()) bad.push(`\`${id}\` 缺 \`why\``);
		if (!String(m?.until ?? '').trim()) bad.push(`\`${id}\` 缺 \`until\``);
		if (!known.has(id)) bad.push(`\`${id}\` **不在 testPlan() 里**（凭空豁免／段名写错／段已删 ⇒ 该豁免无对象 ✗）`);
		// `#1279`①：**`until` 指的前置票也必须有对象** —— 与「下架 id 须存在」同族（差一层）：
		// 段存在，但 `until` 指向一张**不存在的票** → 回填永远不会被触发（豁免变成永久藏身处）。
		// 判法：抽出票号与注入的 `knownTickets` 比对；**注入 null → 不出声**（离线/无 token 时
		// 无法核实外部事实 → 由调用方显式区分「未核」与「核过且不存在」）。
		if (knownTickets) {
			const miss = [...String(m?.until ?? '').matchAll(/#(\d+)/g)].map((x) => x[1]).filter((x) => !knownTickets.has(x));
			if (miss.length) bad.push(`\`${id}\` 的 \`until\` 指向**不存在的票** #${miss.join('、#')}（回填永远不会被触发 ✗）`);
		}
		return bad;
	});
};

export const testPlan = () => SEGMENTS;
// **旧格式**：把计划拼回 `&&` 串（对照/调试用）
export const planChain = () => SEGMENTS.map((s) => s.cmd).join(' && ');
