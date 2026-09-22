// CI 测试计划（#381）：**单一权威**——`npm test`、并行跑器、F2 台账的「是否接线」判定全部读这里。
//
// 为什么要有这个文件：此前「跑哪些段」只存在于 package.json 的 test 脚本里（一长串 `&&`），
// 于是 ① 只能串行跑（CI 4 核也只用一个）② F2 台账靠**字符串匹配**那段脚本来判断门有没有接线。
// 计划与之解耦后：跑器可并行、台账仍能判定接线（见 report-gate-ledger.mjs——并且它会校验
// `npm test` 真的调用了跑器，防止「计划写了但没人跑」的幻影门）。
//
// 字段：
//   id    — 稳定标识（--only 用）
//   phase — `build` 先跑且**独占**（后面所有段都可能读 dist），其余段可并行
//   cost  — 本机实测秒数（仅用于打印串行合计与并行预估，**不参与判定**）
//   needs — **前序段的产物依赖**（#381 补）：本段要读某段落盘的产物时写它的 id。
//           调度器保证「前序全部成功」才起跑；前序红了则本段**标 skipped**（不白跑、也不假绿）。
//   cmd   — 与旧链**逐字一致**，便于对照与回退（`npm run test:serial`）
//   tier  — **跑哪些段的档位**（`#1070`）：`'fast'`（PR 档，**缺省**）｜`'full'`（全量档，含周期性验证）。
//
// ## `tier` 的语义与纪律（`#1070`／父 `#1067`）
// ① **缺省 ＝ `'fast'`** ✗：新增段**默认进 PR 档** ⇒ **绝不静默漏跑** ✓（要移出 PR 档必须**显式**标 `'full'` ✓
//    —— 与本仓 `escape-hatch` 同族：**放宽是一次显式决定，不是顺手** ✓）。
// ② **`fast` 只改「何时跑」，不改任何判据强度** ✗：被标 `full` 的段本身一字不改 ✓（降「跑得频」≠降「判得严」✓）。
// ③ **每一条 `full` 必须写明理由** ✗（`FULL_REASONS` ✓，与 `REASONS` 同形）⇒ 目标：**后人一眼看出为什么它不在 PR 档** ✓；
//    没写理由 ⇒ `validateTiers()` 报红 ✓。
// ④ **`fast ∪ full ＝ 全集`** ✓（`validateTiers()` 断言）⇒ 挡住「标了 tier 却在两档都不跑」的**静默丢弃** ✗。
// ⑤ **哪个档进了 CI**：`#1070` 起 CI 的 `npm test` ＝ **fast 档**（`package.json` 的 `test` 行显式带 `--tier=fast` ✓）；
//    **full 档**由 `npm run test:full` 手动跑，nightly／main 由 `#1071` 接线 ✓（**代价留痕**见下 ⑥）。
// ⑥ **代价（显式写清，不藏）** ✗：被移出 PR 档的段在 **PR 期不再被验证** ⇒ 必须由 full 档（nightly/main）补回 ✓；
//    本仓已有的两处移出（探针／witness）各自的理由见 `FULL_REASONS` ✓。
//
// ⚠️ 产物依赖面（改测试的落盘/读取时同步这里；CI 曾因漏掉它而红过一轮）：
//   build/coverage-render.json · build/coverage-links.json        ← test/render-all.mjs
//   build/coverage-scenarios.json · coverage-links-scenarios.json · route-traces.json ← test/scenarios.mjs
//   ├─ test/coverage.mjs          读上述 4 个覆盖文件 → needs render-all + scenarios
//   └─ scripts/report-rhythm.mjs  读 route-traces.json（连 `--selftest` 也用它做正例）→ needs scenarios
/** `tier` 两档（`#1070`）：`fast`＝PR 档（缺省）／`full`＝全量档。
 *  ⚠️ **两档的并集必须是全集** ✗（`validateTiers()` 断言）—— 否则某段会在两档都不跑而**没人发现** ✓。 */
export const TIERS = ['fast', 'full'];
/** 段缺省所在档 ⇒ **`fast`**（新增段默认进 PR 档 ⇒ 不静默漏跑 ✓）。 */
export const DEFAULT_TIER = 'fast';

/** 段 → 档（**缺省 `fast`** ✓ —— 与 `segmentLayer` 同形：缺省是"保守"那一侧 ✓）。
 *  ⚠️ 不认识的值（拼错 `'Fast'`／`'full '`）**不静默当缺省** ✗ ⇒ 抛（`validateTiers()` 会在起跑前报 ✓）。 */
export const tierOf = (seg) => seg?.tier ?? DEFAULT_TIER;

/** 每条 `full` 段的**理由**（`#1070` 纪律③：**没写理由 ⇒ 报红** ✓）。
 *  与 `report-gate-ledger.mjs` 的 `REASONS` 同形 —— 理由与代码同处一处评审 ✓。 */
export const FULL_REASONS = {
	'scripts-probe-gates-mjs-probe-fast':
		'**探针＝元判据**（量的是"门会不会红"✓）⇒ 属**周期性验证**，不是每次改动都要重跑 ✗。'
		+ '代价（实测）：**253.3s**（CI 日志 278.2s）＝ 全链串行 743s 的 **37%**（`#1070` 实测）✓。'
		+ '⚠️ **移出 PR 档 ⇒ PR 期不再验证"门会咬"** ✗ ⇒ **已接线**（`#1071`：`.github/workflows/full-tier.yml`，触发面 ＝ nightly ＋ `push: main` ＋ `workflow_dispatch` ✓；**失败即红** ✗不是 report-only ✓）；'
		+ '另：台账的探针列**依赖本段产出的** `build/probe-results.json`（gitignored）⇒ 本段不在 PR 档跑时，'
		+ '台账那一列由 `report-gate-ledger.mjs --allow-stale-probe` **显式降级**（打印"探针面跳过"，不静默 ✓）。',
	'test-witness-trace-mjs':
		'**P4 见证件**（`#991` 的验收物：`walker --witness` 的轨迹够不够当见证 ✓）⇒ 属**发布／夜间**面 ✗；'
		+ '且**成本高**（实测 **86.2s**，CI 日志 91.1s ／ `cost` 字段旧值 **0.4** ＝ **228× 失真** ✗ —— 本次一并改正 ✓）。'
		+ '⚠️ **移出 PR 档 ⇒ PR 期不再验证"见证可复跑"** ⇒ **已接线**（同上 `full-tier.yml`；**失败即红** ✓）。',
};

export const SEGMENTS = [
	{ id: "build-mjs", phase: 'build', cost: 3, cmd: "node build.mjs" },
	// `#899` ②：**新故事夹具场景**（①三门绿＋哨兵 ✓ ／ ②③两条安全网全红 ✓ ／ 清场三处＋dist 复原 ✓）。
	//   ⚠️ 必须是 `build` 相位 ⇒ **先跑且独占** ✗（它要在仓的 `stories/` 下临时建夹具 ✓）；**且排在 `build-mjs` 之后** ✗
	//   （开场快照要取"刚 build 过的 dist" ✓，否则拿旧基线 ⇒ 末条 sha 比对**假红** ✓ —— 实测踩过一次 ✓）。
	{ id: "test-new-story-fixture-mjs", phase: 'build', cost: 8, needs: ['build-mjs'], cmd: "node test/new-story-fixture.mjs" },
	// `#908` ①：**探针（最小变异 ＋ 必须红）** —— 台账「自证」列从**代理**升级为**直接读数** ✓。
	//   ⚠️ 同样必须是 `build` 相位 ⇒ **独占** ✗：探针要**临时改一个被测件**（`finally` 还原 ✓）⇒ 与别的段并发会假红 ✓。
	//   结果写 `build/probe-results.json` ✓（不入仓 ✗）⇒ 台账在 `test` 相位读它 ✓（顺序：build ⇒ test ✓）。
	//   `#1070`：**`tier:'full'`** ✗ —— 理由见 `FULL_REASONS` ✓（元判据・周期性验证・实测 **253.3s** ＝全链 37%。
	//   `cost` 由旧值 **25** 改正为 **253.3**（旧值是**手写估值** ⇒ 跑器头部“串行合计”失真 2.2× ✓）。
	{ id: "scripts-probe-gates-mjs-probe-fast", phase: 'build', cost: 253.3, tier: 'full', needs: ['build-mjs'], cmd: "node scripts/probe-gates.mjs --probe=fast" },
	// 复核留（**MINOR** ✗，实测 ✓）：**id ↔ 台账行**的绑定必须**也进 CI** ✗ —— 否则错 id 的探针在 CI 里**静默被忽略** ✓
	//   （实测：错 id ⇒ `--check` rc=1 ✓ 而 `--probe=fast` rc=0 ✗）⇒ 这一段就是那把尺子 ✓。
	{ id: "scripts-probe-gates-mjs-check", phase: 'test', cost: 0, cmd: "node scripts/probe-gates.mjs --check" },
	// `#908` ①：运行器**自己**能假 ✓（三态判定／注入计数／缺前置分家 ✓）—— 与探针实跑分家 ✓。
	{ id: "scripts-probe-gates-mjs-selfcheck", phase: 'test', cost: 0, cmd: "node scripts/probe-gates.mjs --selfcheck" },
	// 车道 E-(A)（`#215`）：页面侧覆盖率 —— **只读** ✓（纯静态扫描 ⇒ 无 `needs`／不需 build ✓）；报告用读数 ✓ 不进任何断言 ✓
	{ id: "scripts-report-page-coverage-mjs", phase: 'test', cost: 0, cmd: "node scripts/report-page-coverage.mjs" },
	{ id: "test-integrity-mjs", phase: 'test', cost: 0, cmd: "node test/integrity.mjs" },
	// `#791`／`#455`：CI 触发面完整性（draft 转 Ready 静默不跑 ＋ 无 dispatch 无法补跑取证）
	{ id: "test-ci-triggers-mjs", phase: 'test', cost: 0.1, cmd: "node test/ci-triggers.mjs" },
	{ id: "test-ci-triggers-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/ci-triggers.mjs --selftest" },
	// `#1008` 第二半：**仓根形态**（顶层条目 vs 白名单 —— 误提交的临时件属“结构错”，源文件级的守卫拦不住）
	{ id: "test-repo-shape-mjs", phase: 'test', cost: 0, cmd: "node test/repo-shape.mjs" },
	// ⚠️ 自证**必须成对登记**：第二支（声明有、实际没有）**只**由 `--selftest` 守
	// （探针那一刀打在第一支上）⇒ 不登记它 ＝ 让那一半在 CI 里无守护（`#1018` 复核席点名）
	{ id: "test-repo-shape-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/repo-shape.mjs --selftest" },
	// `#1078`：**读路径门** —— 「按任务读」死链必红点名行号 · 对象故事已删的文档回流必读面/权威表必红
	//   （`DELETED_STORY_DOCS` 显式对照表 ⇒ archive 口径有牙）· 先读列（除 dev-conventions，单列 #1080）
	//   体量 ratchet ≤150KB（口径与数字＝#1077 验收②裁定）。纯读 docs/README.md ⇒ 无前置 ✓。
	{ id: "test-docs-read-path-mjs", phase: 'test', cost: 0, cmd: "node test/docs-read-path.mjs" },
	// `#1114` 片1：散文层拼装判据（纯函数注入 ✓ 无前置 ✓——正例/禁则红/悬空点名/取值/逐字/单权威 成对）
	{ id: "test-passages-assemble-mjs-selftest", phase: 'test', cost: 0.1, inputs: ['*'],   // `#1114` 全跑型（纯函数注入段——无 fs 面 ✓；`#1093` 裁定 5756510512 ① ✓）
		cmd: "node test/passages-assemble.mjs --selftest" },
	{ id: "test-docs-read-path-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/docs-read-path.mjs --selftest" },
	// `#1043`：散文正文的**词汇门** —— 内容故事（`audience: content`）的正文只许"散文／链接／payload 标记／
	//   引擎已宣告的词汇宏"；禁 SugarCube 逻辑/表达式宏与未宣告宏（甲-1 的防退化保证）。内部件豁免（打印计数）。
	{ id: "test-prose-vocabulary-mjs", phase: 'test', cost: 0.5, cmd: "node test/prose-vocabulary.mjs" },
	{ id: "test-prose-vocabulary-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/prose-vocabulary.mjs --selftest" },
	// 车道 D 切片 3（`#215` 报备 `18502113`）：**键级图的显示层** ✓（jsdom ✓，无宿主副作用 ✓ ⇒ cost 0.4 ✓）。
	{ id: "test-web-event-graph-mjs", phase: 'test', cost: 0.4, cmd: "node test/web-event-graph.mjs" },
	// 车道 D 切片 2（`#215` 报备 `18501384`）：**事件依赖的键级图** ✓（只读 ✓ ⇒ 无前置 ✓、纯计算 ⇒ cost 0 ✓）。
	// `#1031`：**自证接线**（本件自带 `--selftest` 入口却从未在 CI 里跑过 ⇒ “能假”那半零守护）。
	//   ⚠️ 接线前提：该 `--selftest` 跑的是**合成输入的成对正反例**（主跑不执行那些例）—— 已逐件实跑 + 看过实现面 ✓。
	{ id: "test-event-graph-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/event-graph.mjs --selftest" },
	{ id: "test-event-graph-mjs", phase: 'test', cost: 0, cmd: "node test/event-graph.mjs" },
	// 车道 G 前半 · 切片 1a（`#215` 报备 `18502752`）：**方言指纹** ✓（只读 ✓ ⇒ 无前置 ✓、纯计算 ＋ 读三故事的真文件 ⇒ cost 0.1 ✓）。
	{ id: "test-dialect-mjs", phase: 'test', cost: 0.1, cmd: "node test/dialect.mjs" },
	// 车道 G 前半 · 切片 1b（`#215` 报备 `18503024`）：**`contractVersion` ＝ 允许的全集（包络）** ✓（只读 ✓、发现式取故事 ＋ 读真清单 ⇒ cost 0.1 ✓）。
	{ id: "test-contract-version-mjs", phase: 'test', cost: 0.1, cmd: "node test/contract-version.mjs" },
	// 车道 G 前半 · 切片 1c（`#215` 报备 `18503697` / 开工报备 `18503987`）：**`N-1` 兼容层三件哨兵** ✓（只读 ✓、读真登记表 ＋ 三故事真号 ⇒ cost 0.1 ✓）。
	{ id: "test-contract-compat-mjs", phase: 'test', cost: 0.1, cmd: "node test/contract-compat.mjs" },
	// 车道 E-B2（`#215` 报备 `18502613`）：**规则行**页内面 ✓（读故事源 ＋ `web/**` ✓ —— 不读 `dist` ✗ ⇒ 无前置 ✓；jsdom ＋ `createContext` ⇒ cost 0.4 ✓）。
	{ id: "test-web-rule-rows-mjs", phase: 'test', cost: 0.4, cmd: "node test/web-rule-rows.mjs" },
	// 车道 E-B3（`#215` 报备 `18504078`）：**读侧（`--reads`）页内面** ✓ —— 页内只跑 ① 条件表行级 ✗（读故事源 ＋ `web/**` ✓ ⇒ 无前置 ✓；jsdom ＋ `createContext` ⇒ cost 0.4 ✓）。
	{ id: "test-web-read-faces-mjs", phase: 'test', cost: 0.4, cmd: "node test/web-read-faces.mjs" },
	// `#1156`：**可读键形成对断言** —— core 的 `readKeyFamily`（镜像）≡ 引擎 `readKey` 的**分支族**（真源）⇒
	//   跨语言（twee 不能 import JS）故双份**故意存在**，但**不许悄悄漂移** ✗（改名 ⇒ 格红 ✓ 探针式）。cost 0（纯读码 ✓）。
	{ id: "test-readkey-family-mjs", phase: 'test', cost: 0, cmd: "node test/readkey-family.mjs",
		inputs: ['*'] },
	// `#1141`：**md 故事段落对两处面可见**（`ui-migration-diff` 的 parsePassages／`engine-story-free` 的 scriptBodies）⇒ 读 md 源与 core 分派面 ⇒ 全跑型 ✓
	{ id: "test-md-visible-faces-mjs", phase: 'test', cost: 0.2, cmd: "node test/md-visible-faces.mjs",
		inputs: ['*'] },   // `#1156`：读码两侧（引擎真源 ＋ core 镜像）——面经常量间接（抽取器看不到字面量 ✗）⇒ 取**全跑型** ✓（宁多跑不漏面 ✓）
	// `#1157`：**报文自带作用域** —— 跑真入口（`scripts/audit.mjs`）取首行对象头 ⇒ 面＝整个审计驱动器 ⇒ 全跑型 ✓
	{ id: "test-audit-scope-header-mjs", phase: 'test', cost: 0.4, cmd: "node test/audit-scope-header.mjs",
		inputs: ['*'] },
	// 车道 D · `--settle`（`#215` 报备 `18504699`）：**落点文案页内面** ✓ —— 页内与 CLI **同一份判据** ✓（`core/settleRows.mjs` ⇒ 两侧同判 ＋ 非空上的同判 ✓；读故事源 ＋ `web/**` ＋ `scripts/audit/context.mjs` ⇒ 无前置 ✓；jsdom ⇒ cost 0.4 ✓）。
	// `#794` P1①：「故事包 I/O ＝ 唯一写路」的自证（核心在 `editor/lib/core/story.mjs` ✓；含**写侧哨兵**：拒绝型 io ⇒ 写入当场失败 ✓）。
	{ id: "test-core-story-mjs", phase: 'test', cost: 0, cmd: "node test/core-story.mjs" },
	// `#794`：**import 副作用门** —— 任何 `editor/**` 模块被 import ⇒ 跑完且只留哨兵 ✓（`exit(0)` 与 import 期输出都必红 ✓）。
	{ id: "test-import-side-effects-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/import-side-effects.mjs --selftest" },   // `#1031`：接线（合成模块输入 ⇒ 布尔计入退出码 ✓）
	{ id: "test-import-side-effects-mjs", phase: 'test', cost: 0.6, cmd: "node test/import-side-effects.mjs" },
	{ id: "scripts-audit-mjs-consequences-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --consequences --check" },
	{ id: "scripts-audit-mjs-a11y-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --a11y --check" },
	{ id: "scripts-audit-mjs-sitedisc-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --sitedisc --check" },
	{ id: "scripts-audit-mjs-text-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --text --check" },
	{ id: "scripts-audit-mjs-state-check", phase: 'test', cost: 0.1, cmd: "node scripts/audit.mjs --state --check" },
	{ id: "scripts-audit-mjs-literals-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --literals --check" },
	{ id: "test-rules-mjs", phase: 'test', cost: 1.6, inputs: ['*'],   // `#1132` B3：读构建产物 ＋ 故事数据（契约成员、车卡数据、图鉴条目）
		cmd: "node test/rules.mjs" },
	{ id: "test-properties-mjs", phase: 'test', cost: 5.6, cmd: "node test/properties.mjs" },
	{ id: "test-invariants-unit-mjs", phase: 'test', cost: 0, cmd: "node test/invariants.unit.mjs" },
	{ id: "test-render-all-mjs", phase: 'test', cost: 8.9, cmd: "node test/render-all.mjs" },
	{ id: "test-rules-claims-mjs-selftest", phase: 'test', cost: 15.6, cmd: "node test/rules-claims.mjs --selftest" },
	{ id: "test-rules-claims-mjs", phase: 'test', cost: 15.6, cmd: "node test/rules-claims.mjs" },
	{ id: "test-saveui-mjs", phase: 'test', cost: 10.2, cmd: "node test/saveui.mjs" },
	{ id: "test-saveload-inventory-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/saveload-inventory.mjs --selftest" },
	{ id: "test-saveload-inventory-mjs", phase: 'test', cost: 0, cmd: "node test/saveload-inventory.mjs" },
	{ id: "test-layering-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/layering.mjs --selftest" },
	{ id: "test-layering-mjs", phase: 'test', cost: 0, cmd: "node test/layering.mjs" },
	{ id: "test-saveload-mjs", phase: 'test', cost: 30.7, cmd: "node test/saveload.mjs" },
	{ id: "test-combat-adv-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/combat-adv.mjs --selftest" },
	{ id: "test-combat-adv-mjs", phase: 'test', cost: 15.6, cmd: "node test/combat-adv.mjs" },
	// `#1132` 块2 B1：车卡两宏守卫读数（boot 起真引擎 ✓ 前置＝boot 自带的 dist 新鲜度断言 ⇒ 不另声明 needs ✓）
	{ id: "test-chargen-macros-mjs", phase: 'test', cost: 0.5, inputs: ['*'], cmd: "node test/chargen-macros.mjs" },
	// `#1132` B2：等价读数（旧 JS ↔ 新施加器吃 json；序列级 ⇒ 咬到单次格看不见的数据污染 ✗）
	// `#1132` B2：施加器每动词一格（set／add／append ＋ 未知动词大声报 ✗）
	{ id: "test-chargen-apply-mjs", phase: 'test', cost: 0.5, inputs: ['*'], cmd: "node test/chargen-apply.mjs" },
	{ id: "test-generated-family-mjs", phase: 'test', cost: 0, inputs: ['*'], cmd: "node test/generated-family.mjs" },
	{ id: "test-gen-segment-syntax-mjs", phase: 'test', cost: 0, inputs: ['*'], cmd: "node test/gen-segment-syntax.mjs" },
	{ id: "test-meta-source-mjs", phase: 'test', cost: 0, inputs: ['*'], cmd: "node test/meta-source.mjs" },
	{ id: "test-chargen-equivalence-mjs", phase: 'test', cost: 0.5, inputs: ['*'], cmd: "node test/chargen-equivalence.mjs" },
	// `#1166` 护栏机械化：三条命令的自证段（三件套房式 => 脚本 ＋ `--selftest` ＋ 段 ✓）
	{ id: "scripts-clean-net-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'], cmd: "node scripts/clean-net.mjs --selftest" },
	{ id: "scripts-precommit-check-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'], cmd: "node scripts/precommit-check.mjs --selftest" },
	{ id: "scripts-lint-new-segment-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'], cmd: "node scripts/lint-new-segment.mjs --selftest" },
	// `#1174`：**人类面行文检查**（`lint:style`）—— 检索注释面与文档面的装饰记号。两段成对：自证段量判据函数本身，
	//   门态段逐件扫描全仓。自证**必须成对登记**：判据能不能被"种出来的反例"点燃只由 `--selftest` 量，不登记它 ＝ 那一半零守护。
	{ id: "scripts-lint-human-face-mjs-selftest", phase: 'test', cost: 0.4, inputs: ['*'], cmd: "node scripts/lint-human-face.mjs --selftest" },
	{ id: "scripts-lint-human-face-mjs-check", phase: 'test', cost: 0.4, inputs: ['*'], cmd: "node scripts/lint-human-face.mjs" },

	{ id: "test-g3-evidence-mjs", phase: 'test', cost: 15.7, cmd: "node test/g3-evidence.mjs" },
	{ id: "test-fight-seq-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/fight-seq.mjs --selftest" },
	{ id: "test-fight-seq-mjs", phase: 'test', cost: 22, cmd: "node test/fight-seq.mjs" },
	{ id: "test-reread-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/reread.mjs --selftest" },
	{ id: "test-reread-mjs", phase: 'test', cost: 0, cmd: "node test/reread.mjs" },
	{ id: "test-smoke-mjs", phase: 'test', cost: 7.5, cmd: "node test/smoke.mjs" },
	// #484 回归：把产品的 rAF 人为推迟 800ms（模拟高负载尾部事件）⇒ smoke 仍须通过
	// （这就是"等产品自己的时钟（1 个 rAF tick）"这个修法的回归证据；不注入时是一次普通 smoke）
	{ id: "test-smoke-mjs-raf-delayed", phase: 'test', cost: 8, cmd: "SG_RAF_DELAY_MS=800 node test/smoke.mjs" },
	// #441 切片③④：多故事产物 + 书架页 + 故事页字体前缀（纯函数自证 + 真实产物检查）
	// `#460`／`#566`：**逐故事真启动**（StoryInit 无错 ＋ `$era` 已定义 ＋ 起始段非空）——本段已含此判据
	{ id: "test-multi-story-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/multi-story.mjs --selftest" },   // `#1031`：接线（S1–S5 正反例，主跑不执行这些合成例 ✓）
	{ id: "test-multi-story-mjs", phase: 'test', cost: 0.1, cmd: "node test/multi-story.mjs" },
	// #458 前置：**六处同步**校验（源文件/ORDER/MODULES/故事清单/常量声明/聚合返回）＋单根假设清点
	{ id: "scripts-move-precheck-mjs", phase: 'test', cost: 0.2, cmd: "node scripts/move-precheck.mjs" },
	{ id: "scripts-move-precheck-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node scripts/move-precheck.mjs --selftest" },
	// #436 收编（#493 的硬前置）：audit golden 基线。实测**全量仅 8.0s**（dragon 7.0s ＋ 其余每个 30–55ms）
	// ⇒ 不需要"便宜子集"，整段进链；自证单列（比对函数自身的 10 例）
	{ id: "test-audit-golden-mjs", phase: 'test', cost: 8, cmd: "node test/audit-golden.mjs" },
	{ id: "test-audit-golden-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/audit-golden.mjs --selftest" },
	// #457：文案计数**规则**自证（R1–R5；数字是 #459 `Sg.story.copy()` 迁移的基线）
	{ id: "scripts-report-copy-text-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node scripts/report-copy-text.mjs --selftest" },
	// 浏览器验收本体在 CI 的 soak job 跑（需 Chrome）；**守卫逻辑的自证不需要 Chrome**，故进主链
	{ id: "test-browser-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/browser.mjs --selftest" },
	{ id: "test-globals-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/globals.mjs --selftest" },
	{ id: "test-choice-keys-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/choice-keys.mjs --selftest" },
	// #407 D9①：选项前提可溯源（#404 的实例）——`--strict` 是红证入口
	{ id: "test-premise-source-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/premise-source.mjs --selftest" },
	// #407 D9④：场合面（NPC 登记簿须有 venue/role；当前登记模式报告）
	{ id: "test-npc-venue-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/npc-venue.mjs --selftest" },
	{ id: "test-npc-venue-mjs", phase: 'test', cost: 0, cmd: "node test/npc-venue.mjs" },
	{ id: "test-premise-source-mjs", phase: 'test', cost: 0, cmd: "node test/premise-source.mjs" },
	{ id: "test-choice-keys-mjs", phase: 'test', cost: 9, cmd: "node test/choice-keys.mjs" },
	// `#1012`：**导航后焦点仍在正文内**（`docs/dev-conventions.md` §6「键盘可续」的可机检版 ✓）——
	//   契约＝交互后 `activeElement.closest('#passages')` 必真 ✗（不绑具体元素 ✓）；两半都要能假 ✓：
	//   导航型交互（真会红：修前焦点落 `body` ✓）＋ 反例「程序性导航不许抢焦点」✓。
	// `#1033`：编辑器 WebUI 的**启动入口**（`npm run editor` —— 能开 ＋ 开起来是活的（模块 MIME／跨目录可达）＋ 入口可发现）
	{ id: "test-serve-editor-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/serve-editor.mjs --selftest" },
	{ id: "test-serve-editor-mjs", phase: 'test', cost: 1, cmd: "node test/serve-editor.mjs" },
	{ id: "test-focus-after-nav-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/focus-after-nav.mjs --selftest" },
	{ id: "test-focus-after-nav-mjs", phase: 'test', cost: 1, cmd: "node test/focus-after-nav.mjs" },
	{ id: "test-globals-mjs", phase: 'test', cost: 0, cmd: "node test/globals.mjs" },
	{ id: "test-scenarios-mjs-selftest", phase: 'test', cost: 0.3, cmd: "node test/scenarios.mjs --selftest" },   // `#1031`：接线（合成输入成对 ✓；主跑 cost 23.6 ⇒ 自证 0.3，量过）
	{ id: "test-scenarios-mjs", phase: 'test', cost: 23.6, cmd: "node test/scenarios.mjs" },
	// `#215` 裁 (B) ✓：**见证机器**自证 —— `walker --witness` 产出的轨迹够不够当 P4 的"见证"（到 ending ✓／同 seed 逐格可复跑 ✓／两条断言能假 ✓）。
	//   `#1070`：**`tier:'full'`** ✗（P4 见证件・发布/夜间面，理由见 `FULL_REASONS` ✓）
	//   ＋ `cost` 由旧值 **0.4** 改正为 **86.2**（旧值 **228× 失真** ✗ —— 它正是“读数不可信”的源头之一 ✓）。
	{ id: "test-witness-trace-mjs", phase: 'test', cost: 86.2, tier: 'full', cmd: "node test/witness-trace.mjs" },
	{ id: "scripts-report-rhythm-mjs-selftest", phase: 'test', cost: 0.2, needs: ['test-scenarios-mjs'], cmd: "node scripts/report-rhythm.mjs --selftest" },
	{ id: "scripts-report-rhythm-mjs-check", phase: 'test', cost: 0, needs: ['test-scenarios-mjs'], cmd: "node scripts/report-rhythm.mjs --check" },
	{ id: "test-fatal-guard-mjs", phase: 'test', cost: 18.7, cmd: "node test/fatal-guard.mjs" },
	{ id: "test-onetime-pickups-mjs", phase: 'test', cost: 18.1, cmd: "node test/onetime-pickups.mjs" },
	{ id: "test-roll-binding-mjs", phase: 'test', cost: 0, cmd: "node test/roll-binding.mjs" },
	// #462：存储缝（键构造单一落点 · 两作用域 · 幂等迁移）
	{ id: 'test-store-keys-mjs-selftest', phase: 'test', cost: 0, cmd: 'node test/store-keys.mjs --selftest' },
	{ id: 'test-store-keys-mjs', phase: 'test', cost: 0, cmd: 'node test/store-keys.mjs' },
	// #441-A：结算可脱离浏览器驱动（rng 可注入 · rollSite 纯 · present 不写状态）
	// #436 原范围 1：笔记模型门已从 `test/notes-model.mjs` **升级为 audit 门**（可单跑 `--notes`），
	// 一个段替代原来的 `-selftest` ＋ 主跑两段（自证在门内，与其它门一致）。
	// #436 原范围 3：**玩家可见正文漂移**接进计划（`#422-D`／阶段 2 的判据是「漂移＝0」）。
	// 基线用 `origin/main`（CI 里可达：工作流有 `git fetch origin main --depth=1`；那个 92f3d04
	// 迁移基线在浅克隆里取不到——脚本现在会**明确报错**而不是把"读不到"当成"没变化"）。
	// 报告落 `build/`（gitignored）⇒ CI 不脏树；本地想看文档版就按 README 直接跑脚本（默认写 docs/）。
	{ id: 'scripts-ui-migration-diff-selftest', phase: 'test', cost: 0, cmd: 'node scripts/ui-migration-diff.mjs --selftest' },
	{ id: 'scripts-ui-migration-diff-check', phase: 'test', cost: 0.4, cmd: 'node scripts/ui-migration-diff.mjs --check --baseline=origin/main --out=build/ui-migration-diff.md' },
	// main 侧新增（#360 交涉筹码按类型分派）：reb 冲突时按「计划＝单一权威」加在这里
	{ id: "test-coverage-mjs", phase: 'test', cost: 0, needs: ['test-render-all-mjs', 'test-scenarios-mjs'], cmd: "node test/coverage.mjs" },
	{ id: "test-size-gate-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/size-gate.mjs --selftest" },
	{ id: "test-size-gate-mjs", phase: 'test', cost: 0, cmd: "node test/size-gate.mjs" },
	{ id: "test-silent-gate-mjs", phase: 'test', cost: 0, cmd: "node test/silent-gate.mjs" },
	// #762 P0：**故事数据 ↔ 手写版等价**（编辑器转向的第 0 步）——数据与手写 twee 漂移即红
	{ id: "editor-compile-selftest", phase: 'test', cost: 0, cmd: "node editor/compile-story.mjs --selftest" },
	{ id: "editor-equiv-selftest", phase: 'test', cost: 0, cmd: "node editor/equiv.mjs --selftest" },
	// `#976`：**`equiv` 的中间目录与本片自证** ✓ —— 唯一 ＋ 用完就清（含失败路径 ✓）＋ 幂等失败点名（读故事源 ＋ 真跑一次 equiv ⇒ cost 1.0 ✓）。
	{ id: "test-equiv-scratch-mjs", phase: 'test', cost: 1.0, cmd: "node test/equiv-scratch.mjs" },
	// `#787` 翻面：手写侧**重指向**为冻结基线（翻面前 `main` 的仓内副本 ⇒ 「生成得对不对」仍被判）
	{ id: "editor-equiv-minimal-demo", phase: 'test', cost: 0.3, cmd: "node editor/equiv.mjs minimal-demo --l3=hard --hand=stories/minimal-demo/gates/equiv-baseline/15-tables.twee.txt" },
	// `#1004` B2b：**面夹具**（`face-fixture`）＝接入契约的满配声明面（删掉两个内容故事后，为仍“有消费者”的那些面接上它们 ✓）。
	//   两段与 `minimal-demo` 同形：① 声明面等价（冻结基线 ✓）；② 引擎门对该故事绿（`--engine-only`）。
	//   ⚠️ `--l3=report`（而非 `hard`）：夹具的声明面**比两个旧故事宽得多** ⇒ strict 档会把它当成“与手写版形式不一致”的红（基线就是它自己建时的副本 ⇒ report 档才是有意义的那一档）。
	{ id: "editor-equiv-face-fixture", phase: 'test', cost: 0.3, cmd: "node editor/equiv.mjs face-fixture --l3=report --hand=stories/face-fixture/gates/equiv-baseline/15-tables.twee.txt" },
	{ id: "scripts-audit-mjs-face-fixture-engine", phase: 'test', cost: 0.3, cmd: "node scripts/audit.mjs --check --story face-fixture --engine-only" },
	// `#762` 车道 C：**K4 门** —— 生成物标记 · 产物新鲜度(幂等) · **逃生舱可枚举**
	// （清单外出现即红；登记腐烂也红 ⇒ 例外只能收缩留痕，不能随手加）
	{ id: "editor-k4-selfcheck", phase: 'test', cost: 0, cmd: "node editor/k4.mjs --selfcheck" },
	{ id: "editor-k4", phase: 'test', cost: 0.3, cmd: "node editor/k4.mjs" },
	{ id: "test-state-diagnose", phase: 'test', cost: 0, cmd: "node test/state-diagnose.mjs" },
	{ id: "test-k4-args", phase: 'test', cost: 0, cmd: "node test/k4-args.mjs" },
	// `#1016`：**门面引用完整性**（登记表里指向仓内对象的键必须现存 ✓ —— `hatches[].slug`／`hatchFiles[]`／`refusedFaces[].file`）。
	// 为什么要单独一段 ✗：这一格要**探针**才能从"写了断言"升级为"真会红"（`#908` ① ✓），而探针的 `id` 必须逐字对上台账行
	// ⇒ 台账行只从 `test/**`／`scripts/report-*.mjs`／audit 开关来 ✓ ⇒ 本件就是那个行 ✓。
	// ⚠️ `#1052` 起本件**不再是纯件**（⑦ 节走**真表**：真 `escape-hatch.json` ＋ 真 `git ls-files` ＋ 真 `existsSync` ✓，
	//   与真门 ③d 同一口径 ✓ —— 仍**只读** ✗ 不写 ✓，所以仍不需 `needs` ✓ 也不需产物 ✓）。
	// ⇒ `test` 相位、无 `needs` ✓。
	{ id: "test-k4-references", phase: 'test', cost: 0, cmd: "node test/k4-references.mjs" },
	// ⚠️ `#1052`：**成对登记**（`#1018` 的形状 ✓）—— ⑦ 节是「未入库／不存在分开报」的**能假**那一半，
	//   只在 `--selftest` 下跑（探针锤的也是它 ✓）⇒ 不登记它，那一半在 CI 里**零守护** ✗。
	//   两节都跑 = 裸调是①②～⑥的回归，`--selftest` 多跑⑦的判别性格 ✓。
	{ id: "test-k4-references-selftest", phase: 'test', cost: 0, cmd: "node test/k4-references.mjs --selftest" },
	// `#762` 车道 B：**条件表往返**（61 行）。**权威判据是 L1**：两版各自求值后行数组**深度相等**
	// ＋ **字段直方图一致**（每列出现多少次都打出来 —— `#557` 那条老账：总体非空拦不住「少抽一项」）。
	// **为什么这一段显式用 `--l3=report`**：手写版用**模板串**写 `text`、生成物用单引号串 —— 纯**排版**差异，
	// 语义已由 L1 证明相同。降级**写在命令行里** ⇒ 计划表里一眼可见（K5）；不许把它改成「默认放行」——
	// 那等于把让步藏进代码（`--l3` 默认是 `hard`）。
	// **让步的承接判据（本仓纪律：让步可以，但要指名谁接手）**：内容由 **L1 逐行深度相等**兜、
	// 列缺失由 **字段直方图**兜、空表由 **面非空**兜、产物稳定由 **幂等（编译两次逐字节）** 兜
	// —— L3 让掉的**只有"排版"这一层**（模板串 vs 单引号串）。
	{ id: "editor-extract-selftest", phase: 'test', cost: 0, cmd: "node editor/extract-story.mjs --selftest" },
	// 车道 B · notes 面样板（`#215` 报备 `18504282`）：**手写 `16-notes-ch1` → 数据面** 的等价门 ✓（同一个 `editor/equiv.mjs` ⇒ **不新增门** ✓）。
	//   `--l3=report` ✓（与 mist-forest 另两个面同口径 ✓ —— 产物按字面发射器写法，与手写的引号风格有形式差异 ⇒ L3 只报告不判红，语义由 **L1 深度相等 ＋ 字段直方图** 兜住 ✓）。
	// 车道 D · notes **同族三件**（`#215` 报备 `18505730`）：`ch2`／`ch3`／`cross` 转录成数据面 ⇒ **逐面等价** ✓（同 `editor/equiv.mjs` ⇒ **不新增门** ✓）。
	//   `--notes=<产物>` 是本次加的可选指定 ✗（**默认值一字不改** ✓：不给就还是 `16-notes-ch1.twee` ✓）；`--hand=` **必须显式** ✗（默认指向产物 ⇒ 被 `bareHandRefusal` 拒，这是设计 ✓）。
	//   ⚠️ 三个面**一条一行**串起来 ✓（⇒ 只增**一行**台账 ⇒ 只配 **1 条探针** ✓）——“一条命令盖全该面”属另一片 ✗（`--hand` 要从单文件改成块⇒基线映射 ✓）。
	// `#787` 翻面：**契约面**也从"手写 vs 生成"改成"冻结基线 vs 当前产物"（`--hand`＝翻面前的 main 快照）。
	// 与本故事另一条（`--rules`）分开：两条各自只比**一个**面，基线也各一份 ⇒ 失败时能直接指名哪一面。
	{ id: "editor-classify-contract-selftest", phase: 'test', cost: 0, cmd: "node editor/classify-contract.mjs --selftest" },
	// 车道 A 后半：洞窟端到端等价（`--l3=report`：手写风格与生成风格不统一，L3 只当报告；权威判据是 L1＋键集合＋行为）
	// `#787` 翻面：手写侧**重指向**为冻结基线（翻面前 `main` 的仓内副本 ⇒ 「生成得对不对」仍被判）
	// #752：**去权威化口径门** —— 注释／文档不许拿「谁定的」充当理由（#748 的清零面 ＋ 防回潮）
	{ id: "test-attribution-gate-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/attribution-gate.mjs --selftest" },
	{ id: "test-attribution-gate-mjs", phase: 'test', cost: 0.1, cmd: "node test/attribution-gate.mjs" },
	{ id: "scripts-report-ledger-freshness-mjs-selftest", phase: 'test', cost: 0, cmd: "node scripts/report-ledger-freshness.mjs --selftest" },
	{ id: "scripts-report-ledger-freshness-mjs-ledger-check", phase: 'test', cost: 0, cmd: "node scripts/report-ledger-freshness.mjs --ledger --check" },
	{ id: "scripts-report-gate-ledger-mjs-selftest", phase: 'test', cost: 0, cmd: "node scripts/report-gate-ledger.mjs --selftest" },
	// `#1079`：带 `--allow-stale-probe` ✓ —— PR 档不跑探针段（`#1070`）⇒ 无 `build/probe-results.json`
	// ⇒ 台账的**探针面**不参与逐字节比对（**其余面照旧严格** ✓）；**有读数时它不生效** ✓。
	{ id: "scripts-report-gate-ledger-mjs", phase: 'test', cost: 0, cmd: "node scripts/report-gate-ledger.mjs --allow-stale-probe" },
	// #474 接线：`自证·` 必须「失败计入退出码」且「不崩」（静态扫描 scripts/ ＋ test/ 共 77 文件，0 致命）
	{ id: "scripts-report-selftest-validity-mjs", phase: 'test', cost: 0.2, cmd: "node scripts/report-selftest-validity.mjs" },
	// #459／#482：故事「新机制声明表」的形状门（六条可机检点 · 各带正反自证）
	{ id: "test-story-shape-mjs", phase: 'test', cost: 0.1, cmd: "node test/story-shape.mjs" },
	// `#1130`：**窗口制造者 ⇒ 独占** ✓（`exclusive` ⇒ 不与任何段重叠 ✓；`mutates` ＝ 它动哪些**已入库真源** ⇒ 独占的理由可查 ✓）
	//   为什么：本段两处 `try/finally` **就地改真源**再恢复 ⇒ 恢复会刷新 mtime ⇒ 窗口期内"源比 dist 新" ⇒
	//   并行 boot 的段会撞新鲜度守卫（CI 实测 `test-gate-discovery-mjs` 偶发红 ✓）⇒ 故独占 ✓（mtime 回填已在段内 ✓）
	{ id: "test-lint-story-mjs", phase: 'test', cost: 0.5, exclusive: true,
		mutates: ['stories/minimal-demo/data/tables.json', 'stories/face-fixture/data/tables.json'],
		cmd: "node test/lint-story.mjs" },  // 车道 E（#215）：lint-story 自证门
	// `#1024`：**并发假红**（`lint-story` 的 scratch 必须本次运行唯一）—— 3 轮 × 3 进程跑同一 slug
	//   ＋ 两条**确定性**判据（旧落点没被重建 · 不留 `.lint-run-*` 草稿）；前置=dist 产物（故事门要读它）
	// ⚠️ `#1044`：**还得排在 `test-lint-story-mjs` 之后** ✗ —— 那一段的反例**直接改真文件**
	//   `stories/minimal-demo/data/tables.json`（写成 `'{ oops'` ⇒ 跑 lint ⇒ `finally` 恢复 ✓），
	//   而本件 spawn 的正是 `lint-story minimal-demo` ⇒ **同波**就会读到**半成品** ⇒ 假红「data/*.json 不可解析」
	//   （实测：两段并发 **3/3 红**、各自的输出就是那段注入载荷 ✓；单跑皆绿 ✓）。
	//   ⇒ 依赖声明＝**单一权威**的排顺手段 ✓（同一个洞在 `test-story-ci-mjs` 上早已用同一条修法 ✓）。
	//   ➕ `#1044` 后半（本 PR）：这条边由 `test/plan-needs.mjs` **在册守护** ✓（删边 ⇒ 门红并点名两端 ✓；探针刀见 `scripts/probes.mjs` ✓）。
	{ id: "test-lint-scratch-mjs", phase: 'test', cost: 2, needs: ['build-mjs', 'test-lint-story-mjs'], cmd: "node test/lint-scratch.mjs" },
	// ⚠️ 自证**必须成对登记**（`#1018` 复核席点名的形状）：本件两条判据能不能被"种出来的反例"点燃，
	//   只由 `--selftest` 量 ⇒ 不登记它 ＝ 那一半在 CI 里零守护
	{ id: "test-lint-scratch-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/lint-scratch.mjs --selftest" },
	// `#1044`：**段间产物依赖边守护**——「改真故事文件的段 → 读它的段」的 needs 边必须在册并点名
	//   （纯静态 ⇒ 无前置 ✓；能假反例在件内 ✓；探针刀＝删那条 needs ⇒ 必红 ✓）。
	{ id: "test-plan-needs-mjs", phase: 'test', cost: 0, cmd: "node test/plan-needs.mjs" },
	// `#1089`（乙′）：**未跟踪扫描面 ⇒ 红** 的**守护件**（判据＝`scripts/lib/untracked-guard.mjs` 的纯函数）。
	//   三格成对：①未跟踪⇒报 ②已跟踪/不在扫描面⇒不报 ③豁免（**理由＋票号**）⇒不报但留痕；
	//   内含**端到端真 git 三态**（自建夹具 ＋ 自行清场 ⇒ 不依赖仓内既有未跟踪件）。
	//   ⚠️ 本件只守**判据**；「门有没有真的调它」由 `scripts/probes.mjs` 的刀守（同 `plan-needs` 形态）。
	{ id: "test-untracked-guard-mjs", phase: 'test', cost: 0, cmd: "node test/untracked-guard.mjs" },
	// #574：逐故事**运行时契约**门 —— 面存在 / 位点能判 / 笔记可用 / 侧栏可用 / 机制真落
	// （成因：`Sg.*` 面缺一段、位点写成属性键、`applyStatus` 返回值被丢、`maxHp` 字段名——四件都曾静默通过）
	{ id: "test-story-runtime-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/story-runtime.mjs --selftest" },
	{ id: "test-story-runtime-mjs", phase: 'test', cost: 8, cmd: "node test/story-runtime.mjs" },
	// #434 阶段 3：`Sg.notes.add()` 的行为门（幂等 · 双写 · 双读 · 多源 setPath 护栏）
	// #460／#441-E：**第二故事接入自检** —— 用最小故事（stories/minimal-demo）跑**引擎门**：
	// 「引擎不知道故事名」的可执行证据（产物：书架 2 项；门：引擎门对第二故事绿）。`--check` 前置以免被
	// `auditFlag()` 认成某个门段（它不是单门段，层归属见 `ENGINE_EXTRA`）。
	// `#572`（修法）＋ `#581`（收尾）：这一段一度改成**显式四件套**（当时 `--engine-only` 会一路跑到 `--consequences`
	// 并真的报红）；`#581`（引擎保留槽登记归引擎）＋ `#584`（注释遮蔽）落地后**三故事 `--engine-only` 全 rc=0**
	// ⇒ **收回临时收窄**，恢复本段真意：**整套引擎门**对第二故事绿。
	{ id: "scripts-audit-mjs-story2-engine", phase: 'test', cost: 0.2, cmd: "node scripts/audit.mjs --check --story minimal-demo --engine-only" },
	// #490（S5 片二）：**第三个故事**的**洞窟声明面门**（表↔内容双向对账；故事门，故显式指定 --story）
	// `#598`（实测缺陷）：**长战斗「点得动、走得掉」**真机回归 —— 静态门看不见这类运行期死路
	// （`waveRecord` 返回对象被当字符串比 ⇒ 两条出口不可达；`<<include>>` 不导航 ⇒ 点了没反应）。
	// `#600`：**战斗钥匙掉落**（长战斗必掉 · 短战斗 30%）—— 声明面驱动 ＋ 真机 ＋ 多种子频率（3σ）。
	// `#603`：**文档格式门** —— `README.md` 曾因一个多余的 ``` 让四个标题被吞进代码块（GitHub 上不是节）；
	// `docs/**` 与 README 此前**零机检**（L0 扫 twee、craft 扫正文）。
	{ id: "scripts-md-format-mjs", phase: 'test', cost: 0.1, cmd: "node scripts/md-format.mjs" },
	// #491 判据 1：**本故事**的战斗分布口径（胜率对闭式 · 期望回合/受伤期望 · 分布面 · 同种子复算）
	// `#746`（口径：「文字反馈最重要」）：**有副作用的分支必须有落点文案**（挨了打必须看得见）
	// #602：**引擎门不得出现故事专有字面量**（防"假解耦"回潮：故事判据数据住 `stories/<slug>/audit.json`）
	{ id: "scripts-audit-mjs-engine-story-free", phase: 'test', cost: 0.1, cmd: "node scripts/audit.mjs --engine-story-free --check" },
	// #607 P0：门的**发现与归属**（引擎门 ∪ 待迁移 ∪ 本故事已声明；顺序表；结构缺失必红）
	{ id: "test-gate-discovery-mjs", phase: 'test', cost: 0, cmd: "node test/gate-discovery.mjs" },
	// #640（伞 #626）：**矩阵门** —— 场景 × 道具/线索集合 → 期望（行键＝谓词上下文 · 期望＝渲染后+行为面 · 承诺 ratchet）
	// #608：**短战斗相位门**（引擎侧 widget 的契约：四相位→分支 · 未结束不结算不推进 · 奖励/失败笔记走声明面）
	// #705 片二／#702 a2：**敌人实例 · 5e 核心门**（实例化 · 攻击骰 vs AC · 伤害落部位 · 全灭通关）
	// `#701`：**战斗日志门**（可回看的一手一句：有界/保留最近/渲染只读/降级不出现）
	{ id: "editor-k6-selftest", phase: 'test', cost: 0, cmd: "node editor/k6.mjs --selftest" },
	{ id: "editor-k6", phase: 'test', cost: 0.2, cmd: "node editor/k6.mjs" },
	// `#984`（P3-④ **用户故事 CI**）：**按故事发现 ⇒ 逐故事跑 K 门** ✓ —— 量到的缺口是"`test-plan` 里故事名
	//   **写死**" ✗ ⇒ 新故事（用户做的第 4 个）不会自动进 CI ✗。本段跑"发现 → 逐故事 + 全局面每轮一次" ✓；
	//   自证见 `test/story-ci.mjs`（含**能假**一格：夹具故事必须出现在 `--list` ✓）。
	// ⚠️ `#1031` 起片实测：本件的 `--selftest` **不是入口** ✗ —— 实测 `node test/story-ci.mjs --selftest` 与**裸调输出逐字节相同**，且件内**无 `process.argv…includes('--selftest')` 派发**（那个字符串是**真断言**：`cli(['--selftest'])` 在测 `cli` 的旗标 ✓）。
	//   ⇒ 台账 `selfProofWired()` 的子串判据在本行是**假阳性**（它要求 plan 里出现字面量 `test/story-ci.mjs --selftest`）。
	//   ⇒ **不硬接一个无意义旗标**（票面禁“为凑绿而接线” ✗）、也**不删**件内那个字符串（删了会拆掉一条真断言 ✗）—— 留痕在此，口径修正见 `#1031` 票内。
	//   本段的 `cmd` **裸调即其自证**（断言每次调用都跑 ✓）。
	{ id: "test-story-ci-mjs-selftest", phase: 'test', cost: 0.2, cmd: "node test/story-ci.mjs" },
	// ⚠️ **为什么有 `needs`** ✗：本段**发现"活的" `stories/`** ✓（口径＝目录里有 `00-story.json` ✓），
	//   而另两段会在**运行中往 `stories/` 放临时故事**（`test-web-preview.mjs` 建 `stories/__e2e`；
	//   `test/lint-story.mjs` 为了反例临时改真 `tables.json` ✓）⇒ 撞上就会读到**半成品** ⇒ 本段红 ✗。
	//   ⚠️ **根因已定** ✓（`#989`）：「**断言「恰好发现三个故事」**」✗ 会被临时故事打红 ✓ —— 全量跑时
	//   红的那一格正是它 ✓（`--list` 精确等值 ＋ 壳自证里同形那条 ✓）⇒ 已改成 **⊇**（「真故事都在」✓，
	//   不赌「只有它们」✗）。⚠️ `needs` 仍留 ✓：它是**另一条独立理由** ✗（避免读到**半改的真数据** ✓），
	//   不是这条红的原因 ✗。
	{ id: "test-story-ci-mjs", phase: 'test', cost: 18.6, needs: ["test-web-preview-mjs", "test-lint-story-mjs"], cmd: "node editor/story-ci.mjs" },
	// `#761` P1 第一片（WebUI 静态加载 ✓）：纯加载件的测例（含 `--selftest` ✓ —— 那格"行为化"有依据 ✓）。
	{ id: "test-web-loader-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/web-loader.mjs --selftest" },   // `#1031`：接线
	{ id: "test-web-loader-mjs", phase: 'test', cost: 0.1, cmd: "node test/web-loader.mjs" },
	// `#761` P1 第二片：**页内编译对拍**（三故事 × 产物逐字节 ✓ ＋ 反例：源变则异 · 无源必抛 ✓）。
	{ id: "test-web-compile-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/web-compile.mjs --selftest" },   // `#1031`：接线
	{ id: "test-web-compile-mjs", phase: 'test', cost: 0.3, cmd: "node test/web-compile.mjs" },
	// `#761` P1 第三片：**写包对拍**（经唯一写路 writeStoryPackage ✓，与 CLI 产物逐字节 ✓）。
	{ id: "test-web-save-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/web-save.mjs --selftest" },   // `#1031`：接线
	{ id: "test-web-save-mjs", phase: 'test', cost: 0.3, cmd: "node test/web-save.mjs" },
	// `#761` P1 六片A-2：**预览读数**（控制跑 ✓／区间＋标记 ✓／不受影响面 ✓／对偶 ✓／状态敏感性 ✓／不污染 dist ✓）。
	// ⚠️ cost 高: 内含**两次构建** ＋ 4 次 boot（~5–8 分钟）✓
	{ id: "test-web-preview-mjs-selftest", phase: 'test', cost: 0.3, cmd: "node test/web-preview.mjs --selftest" },   // `#1031`：接线（假串驱动纯件 `diffSpan` ✓）
	{ id: "test-web-preview-mjs", phase: 'test', cost: 8, cmd: "node test/web-preview.mjs" },
	{ id: "test-web-diagnose-mjs", phase: 'test', cost: 1, cmd: "node test/web-diagnose.mjs" },   // P2（`#761`）第一片：实时诊断纯件 ✓（纯函数＋无 io ⇒ 页内可用 ✓）
	{ id: "test-web-diagnose-view-mjs", phase: 'test', cost: 1, cmd: "node test/web-diagnose-view.mjs" },   // P2（`#761`）第三片：显示层 ＋ 两个 sha ＋ 六条读数 ✓（纯 ✓）
	{ id: "test-web-diagnose-wire-mjs", phase: 'test', cost: 1, cmd: "node test/web-diagnose-wire.mjs" },   // P2（`#761`）第三片接线：不落盘也能看见 ✓（jsdom ✓）
	// `#761` P1 第四片：**改一个事件**的字段级读数（差异恰好一处 ✓／写回逐字段一致 ✓／产物只少数行变 ✓）。
	{ id: "test-web-events-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/web-events.mjs --selftest" },   // `#1031`：接线
	{ id: "test-web-events-mjs", phase: 'test', cost: 0.3, cmd: "node test/web-events.mjs" },
	// `#761` P1 第五片：**DOM 接线**（页面路 vs 直接路逐字节同 ✓；jsdom 显式收场 ✓）。
	{ id: "test-web-form-mjs-selftest", phase: 'test', cost: 0.4, cmd: "node test/web-form.mjs --selftest" },   // `#1031`：接线
	{ id: "test-web-form-mjs", phase: 'test', cost: 0.5, cmd: "node test/web-form.mjs" },
	// `#892`（P4-1）：页内**新建**（起手包落内存 ✓ 不碰 fs ✓ 可接既有表单 ✓）（jsdom ✓）。
	{ id: "test-web-new-package-mjs", phase: 'test', cost: 0.5, cmd: "node test/web-new-package.mjs" },
	// `#1034`：导出下载接线 —— 入口在页面上 ✓、导出物清单与内核编目一致 ✓、空/部分包必报错 ✓、不落盘 ✓
	{ id: "test-web-export-mjs", phase: 'test', cost: 0.3, cmd: "node test/web-export.mjs" },
	{ id: "test-social-sink-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/social-sink.mjs --selftest" },
	{ id: "test-social-sink-mjs", phase: 'test', cost: 3, cmd: "node test/social-sink.mjs" },
	// `#1011`（保覆盖版）：`#360` 交涉筹码按类型分派（B 段退役件接回；样本＝`face-fixture` 的 `老板娘·进塔`）✓
	{ id: "test-social-lever-mjs", phase: 'test', cost: 3, cmd: "node test/social-lever.mjs" },
	// `#1020`：条件位/授予位的**键形**必须引擎真能求值（`readKey` 权威；`note:n_*` ⇒ 条件恒假／授予位抛错）✗
	// `#1132` 块2 片A：**故事侧代码面**（零逃生舱方向的 ratchet 门 ✓）
	{ id: "test-story-codeface-mjs-selftest", phase: 'test', cost: 0, inputs: ['*'],   // `#1132` 全跑型（合成输入自证；另见理由登记 ✓）
		cmd: "node test/story-codeface.mjs --selftest" },
	{ id: "test-story-codeface-mjs", phase: 'test', cost: 0, inputs: ['*'],   // `#1132` 全跑型（读 stories 目录 + 两处机制标签声明件 ⇒ 静默跳过会成假绿面 ✓）
		cmd: "node test/story-codeface.mjs" },
	{ id: "test-cond-keyform-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/cond-keyform.mjs --selftest" },
	{ id: "test-cond-keyform-mjs", phase: 'test', cost: 0, cmd: "node test/cond-keyform.mjs" },
	{ id: "test-siteinfo-sink-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/siteinfo-sink.mjs --selftest" },
	{ id: "test-siteinfo-sink-mjs", phase: 'test', cost: 2, cmd: "node test/siteinfo-sink.mjs" },
	// `#707`：**战斗状态字段使用面门**（每个 `$pc.ev.fight.<字段>` 都必须有人用；死字段点名）
	// `#693`（P1）：**主交互路径门**（确定性路线：点得动 · 无红框 · 到终点 · 产出可见）
	// 洞窟「商人」门（`#696`：金币要有出口 ⇒ 旅人里随机出现商人；报价读声明面 · 买不起不显示 · 火把油）
	// 洞窟五步主线**末步**门（实测）：走满 5 步再回岔口时**不许**抛 `roadOffer(6)` 红框 ⇒ 越界走退路
	{ id: "test-cli-surface-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/cli-surface.mjs --selftest" },   // `#1031`：接线（可注入假 runner 驱动 `judgeSurface` 五例 ✓）
	// ⚠️ `#1070`：**还得排在 `test-web-preview-mjs` 之后** ✗ —— 本件驱动 `node editor/cli.mjs k4`（真门 ✓），
	//   而 k4 会 `readdirSync(stories)` 逐故事判 ✓ ⇒ `test/web-preview.mjs` 的临时夹具 `stories/__e2e`
	//   （带 `00-story.json` ✓）存活期间跑它 ⇒ 产生 `✗ __e2e：手写契约源非空（0 文件）却分类出 0 名成员` ⇒ **假红** ✓
	//   （实测：起了 `stories/__e2e` 再跑 `editor/cli.mjs k4` ⇒ rc=1 且点名 `__e2e` ✓；清掉 ⇒ rc=0 ✓）。
	//   依赖声明＝**单一权威**的排顺手段 ✓（同族：`test-story-ci-mjs`／`test-lint-scratch-mjs` 早用同一条修法 ✓）。
	{ id: "test-cli-surface-mjs", phase: 'test', cost: 4, needs: ['test-web-preview-mjs'], cmd: "node test/cli-surface.mjs" },
	// `#660` 片三-3：**pc 默认形状住引擎、数值走故事**（`Game.Pc.defaults()` 摘掉 `Sg.story.pcDefaults()` 后每个值都必须中性；
	// 缺面 ⇒ 显式降级 · 畸形面 ⇒ fail-loud · `migrate()` 兜底带故事数值 · 三故事键集合一致）
	// ⚠️ `#1070`：**还得排在 `test-web-preview-mjs` 之后** ✗ —— 本件 ⑥ 走 `storySlugs()`（扫 `stories/` 下带
	//   `00-story.json` 的目录 ✓）⇒ 而 `test/web-preview.mjs` 会在**运行期间**临时建 `stories/__e2e`（带清单 ✓）
	//   ⇒ 同波命中它 ⇒ `boot({story:'__e2e'})` 找不到故事页 ⇒ **假红** ✓（实测：波次重排后本段与 web-preview 重叠 ⇒ 必红 ✓）。
	//   依赖声明＝**单一权威**的排顺手段 ✓（同族：`test-cli-surface-mjs`／`test-story-ci-mjs`／`test-lint-scratch-mjs` ✓）。
	{ id: "test-pc-defaults-mjs", phase: 'test', cost: 2, needs: ['test-web-preview-mjs'], cmd: "node test/pc-defaults.mjs" },
	// `#572`：**「选中 ⇒ 真跑」门** —— 门的 `run()` 被选中也可能静默早退（九道引擎门里七道就是这样）。
	// 本段自证 `runSelectedGates()` ＋ 真跑默认故事，断言末行「选中 9 门 · 实跑 9 门」（修前那条汇总行不存在）。
	{ id: "test-audit-gates-run-mjs", phase: 'test', cost: 0.3, needs: ["scripts-audit-mjs-story2-engine"], cmd: "node test/audit-gates-run.mjs" },
	// #490（S5）：**第三个故事**（无名洞窟）的引擎门 —— 它**声明了** S1–S4 的四件套（`mechanics()` 非 null）
	// ⇒ 四道引擎门在这里第一次判**一个真正启用了新机制的故事**（`#486`–`#489` 的出口判据）。
	// `#572` 同上：临时收窄已收回（`#581`／`#584` 落地后整套引擎门全绿）⇒ 本段跑**整套引擎门**。
	// #435 阶段 4：条件表门（死规则 = 永不被选中的行）
	// #435 阶段 4：「无字面状态读」门（：表/内容都经封装层读——票面「数据表不得出现字面状态读」）
	// #486（S1）：槽位/耐久**机制**门（引擎门——判据来自声明表，不读故事散文）：
	// 两态语义 · 部位命中分布 · 损坏阈值 · 兼容降级 · 「声明面 ≤ 实现面」
	{ id: 'scripts-audit-mjs-slots-check', phase: 'test', cost: 0, cmd: 'node scripts/audit.mjs --slots --check' },
	// #487（S2）：部位×异常门（同为引擎门：输入＝声明表）
	{ id: 'scripts-audit-mjs-status-check', phase: 'test', cost: 0, cmd: 'node scripts/audit.mjs --status --check' },
	// #488（S3）：波次与重置门（引擎门）
	{ id: 'scripts-audit-mjs-waves-check', phase: 'test', cost: 0, cmd: 'node scripts/audit.mjs --waves --check' },
	// #489（S4）：事件池与三选一门（引擎门）
	{ id: 'scripts-audit-mjs-roads-check', phase: 'test', cost: 0, cmd: 'node scripts/audit.mjs --roads --check' },
];

// ── 门的**两层化**（#436-a）：引擎门 / 故事门 ──────────────────────────────
// 判据不是"哪个文件"，而是「**判据从哪来**」：
//   · **引擎门**：判据与故事内容无关（拿清单/声明式表当输入）⇒ 换故事只换输入 ⇒ 第二故事能直接跑；
//   · **故事门**：判据来自**本故事的散文与内容**（锚句/段落名/路线/NPC 动机）⇒ 第二故事会被判红。
// 为什么需要它：`#441-F`（第 1/4 步出口＝第二故事能接）的出口判据就是「**只跑引擎门**」；
//   若把 24 道门全跑，第二故事一定会被本故事的判据判红。
//
// 口径（可机检，且**反沉默**）：
//   ① `AUDIT_ENGINE ∪ AUDIT_STORY` 必须**恰好等于**计划里出现的所有 `--<flag> --check` 段（多一个、
//      少一个都红）——新增门忘了归层会被 `validateLayers()` 当场抓住；
//   ② 同一个 flag 不许同时出现在两层（歧义即红）；
//   ③ 未分类的**非门段**一律按 `story` 处理（**保守**：绝不误入引擎门集合 ⇒ `--engine-only` 只多不少地安全）；
//      要把它划进引擎门，就显式加进 `ENGINE_EXTRA`（一行）。
// 注：`a11y` 也是引擎门，但**尚未接线**（F2 台账：未接线 7 道）⇒ 接线时加进本表（否则 `validateLayers()` 的僵尸声明会报红——这正是想要的行为）
export const AUDIT_ENGINE = ['consequences', 'literals', 'state', 'sitedisc', 'text', 'engine-story-free', 'slots', 'status', 'waves', 'roads'];   // #486：slots 是引擎门（输入＝声明表）
// **`#607` P0 起 `AUDIT_STORY` 的含义**：＝「**尚未迁移**的故事门」清单（历史包袱；搬完一批删一批）。
// 已搬进 `stories/<slug>/gates/` 的门由**该故事的清单**声明（`00-story.json` 的 `gates`），由 `scripts/audit/discovery.mjs`
// 发现 ⇒ 下方这两个表只描述"还在工具层的门"。落点与机制见 `docs/story-gates-design.md`。
// **已搬走**：P1 试点 `economy` / `items`＋`tokens` / `notes`；P2-A① `truth` / `choices` / `nosl` / `interact` /
//   `social` / `combat` / `starbudget` / `systems` / `checks`；P2-A② `canon` / `echoes` / `craft` / `dragon` /
//   `rules` / `reads` / `investment` / `npc` / `gear` ⇒ `stories/mist-forest/gates/`（故事 1 已搬完）；
//   P2-B `cave` / `combat-dist` ⇒ `stories/hollow-cave/gates/`（故事 3 的两门）。
export const AUDIT_STORY = [];   // #607 P2-B：**故事门已全部搬到故事侧**（`stories/<slug>/gates/`，清单声明）⇒ 工具层不再有故事门
// 非门段里**与故事内容无关**的那些（构建 / 构建期 lint / 产物守卫）：显式登记，不放宽默认
export const ENGINE_EXTRA = ['build-mjs', 'test-multi-story-mjs', 'scripts-audit-mjs-story2-engine',
	'test-focus-after-nav-mjs-selftest', 'test-focus-after-nav-mjs', // `#1012`：引擎侧焦点契约（与故事内容无关 ✓）
	'test-serve-editor-mjs-selftest', 'test-serve-editor-mjs', // `#1033`：编辑器入口（与故事内容无关 ✓）
	'test-story-runtime-mjs-selftest', 'test-story-runtime-mjs',
	'test-layering-mjs-selftest', 'test-layering-mjs', 'test-globals-mjs', 'test-silent-gate-mjs',
	'test-size-gate-mjs-selftest', 'test-size-gate-mjs',
	// #607：门发现面与故事内容无关（清单/归属/顺序表）
	'test-gate-discovery-mjs',
	// #608：短战斗相位门判的是**引擎侧契约**（故事只是驱动）【`#1004` B2：该测试件已随故事删除 ⇒ 入口一并去掉 ✓】
	// `#660` 片三-3：pc 默认**形状**住引擎（故事只给数值）⇒ 判的是引擎侧契约
	'test-pc-defaults-mjs',
	// 洞窟末步门判的是**故事 2 的内容**（`stories/hollow-cave/10-cave.twee`）⇒ 归 story 层；为免与故事层计数混淆，
	// 这里显式登记为"故事内容门"的同族（不进 ENGINE_EXTRA）
	];

// 段 → 层。`--<flag> --check` 形式的段从 flag 表推；其余：在 `ENGINE_EXTRA` 里 ⇒ engine，否则 story。
// `declaredStoryFlags`＝**故事清单里声明的门 flag**（`#607` P1 起非空）：它们同样是"故事层"，
// 只是住址已经从工具层搬走 ⇒ 层判定必须认它们，否则搬家那一刻 `validateLayers()` 会误报"未归层"。
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
	// 计划里真实的 audit 段 ⇒ 必须**恰好**被两层覆盖
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
 * 四条 **每一条都对应一种“静默”** ✗：
 *   ① **非法档位**（拼错 `'Fast'`／`'full '`／非字符串）⇒ 红：否则 `tierOf` 把它当缺省 ⇒ 看着跑了、其实归错档 ✓；
 *   ② **缺档位的段不许当“不存在”** ✗：无 `tier` ⇒ **缺省 fast**（**不是跳过** ✗ —— 这是本机制的头号假绿面）；
 *   ③ **`fast ∪ full ＝ 全集`** ✓：两档的选择器**逐段覆盖**整个计划 ⇒ 挡住“标了 tier 却在两档都不跑”；
 *   ④ **每条 `full` 必须有理由** ✗（`FULL_REASONS` ✓）：降频是一次**显式决定**，得留痕 ⇒ 后人不用猜 ✓。
 *
 * ⚠️ **`fast` 档不许等于全集** ✗（否则“减负”是假的且**没人看得出来** ✓）—— 这一条只在“确有 full 段”时要求；
 *   若将来 `full` 段全部回归 fast ⇒ 它自然通过（那时本机制就该撤 ✓ 而不是报假红 ✓）。 */
export const validateTiers = (plan = SEGMENTS, { reasons = FULL_REASONS } = {}) => {
	const problems = [];
	// ① 档位合法
	for (const s of plan) {
		if (s.tier === undefined) continue;                       // 缺省合法（＝fast ✓）
		if (!TIERS.includes(s.tier)) problems.push(`非法 tier：\`${s.id}\` 的 tier=${JSON.stringify(s.tier)}（合法值：${TIERS.join('｜')}）`);
	}
	// ② 双档覆盖（**缺省即 fast** ⇒ 无 tier 的段不会被漏掉 ✓）
	const fastSel = plan.filter((s) => tierOf(s) === 'fast');
	const fullSel = plan.filter((s) => tierOf(s) === 'full');
	if (fastSel.length + fullSel.length !== plan.length) {
		problems.push(`tier 覆盖不齐：fast ${fastSel.length} ＋ full ${fullSel.length} ≠ 全集 ${plan.length}`);
	}
	// ③ 并集＝全集（选择器等价写法：显式求并再看是否逐段命中 ✓ —— 不靠“减出来的差” ✗）
	const union = new Set([...fastSel, ...fullSel].map((s) => s.id));
	const missing = plan.filter((s) => !union.has(s.id)).map((s) => s.id);
	if (missing.length) problems.push(`fast ∪ full 未覆盖：${missing.join('、')}（会在两档都不跑 ✗）`);
	// ④ full 段必须有理由
	for (const s of fullSel) if (!reasons[s.id]) problems.push(`\`${s.id}\` 标了 tier:'full' 但没写理由（加到 FULL_REASONS ✓ —— 降频必须留痕）`);
	// ⑤ **fast 段不得 `needs` 一个 full-only 段** ✗（`#1070` E4）—— 两件事叠加就是**死段**：
	//   本段在 fast 档跑、但它的前置不在 fast 档选择面里 ⇒ 跑器起跑前 `validatePlan` 报“依赖了不存在的段” ⇒
	//   **整个 PR 档停跑** ✓（不是少跑一段，是**全停** ✗）。
	//   ⚠️ 本判据的**由来**：实现第一版把 `--tier=full` 当“只跑标 full 的段”⇒ 两段 full 的 `needs:['build-mjs']`
	//   指向被过滤掉的段 ⇒ 当场报错 ✓；后来把 full 语义改对了（包含关系），但**那个坑本身没人守** ✗
	//   ⇒ 这一条就是把它固化成机判据 ✓（改写回“只跑 full 段”或给 fast 段加一条指向 full 的 needs ⇒ 必红 ✓）。
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

/** `#1093` P1.0：**分组表**（`id -> suite`）—— 口径＝**判据锚的被看护物** ✗（不是目录粗分 ✗）。
 *  `engine`=判 `src/**` 引擎行为 ｜ `editor`=判 `editor/**`（含页内／浏览器侧）｜ `story-legal`=判 `stories/**` 源数据静态面 ｜
 *  `story-product`=判 `dist/**`·运行对拍 ｜ `infra`=判**门禁自身**（门／台账／编排／文档格式）。
 *  ⚠️ **本表是交付物**（P1.0）✗ —— 它决定 P2「按改动跳过」的粒度 ⇒ 改动它须**走评审** ✓。
 *  ⚠️ 规模**只作嗅探核**（非硬判据 ✗）：本表 engine 42／editor 45／story-legal 24／story-product 10／infra 37；
 *     票面记载过一次测量（48／51／22／14／23 ✓）但**未落盘** ✗ ⇒ 有差属**已知**，按「嗅探非硬判据」处理 ✓（`#1093` 裁决 ✓）。 */
export const SUITE_MEMBERS = {
	'engine': [
		'test-integrity-mjs', 'test-rules-mjs', 'test-properties-mjs', 'test-invariants-unit-mjs',
		'test-saveload-mjs', 'test-saveui-mjs', 'test-combat-adv-mjs', 'test-combat-adv-mjs-selftest',
		'test-fight-seq-mjs', 'test-fight-seq-mjs-selftest', 'test-reread-mjs', 'test-reread-mjs-selftest',
		'test-fatal-guard-mjs', 'test-onetime-pickups-mjs', 'test-roll-binding-mjs', 'test-scenarios-mjs',
		'test-scenarios-mjs-selftest', 'test-silent-gate-mjs', 'test-dialect-mjs', 'test-contract-version-mjs',
		'test-contract-compat-mjs', 'test-pc-defaults-mjs', 'test-social-sink-mjs', 'test-social-sink-mjs-selftest',
		'test-social-lever-mjs', 'test-siteinfo-sink-mjs', 'test-siteinfo-sink-mjs-selftest', 'test-event-graph-mjs',
		'test-event-graph-mjs-selftest', 'scripts-audit-mjs-consequences-check', 'scripts-audit-mjs-a11y-check', 'scripts-audit-mjs-sitedisc-check',
		'scripts-audit-mjs-text-check', 'scripts-audit-mjs-state-check', 'scripts-audit-mjs-literals-check', 'scripts-audit-mjs-slots-check',
		'scripts-audit-mjs-status-check', 'scripts-audit-mjs-waves-check', 'scripts-audit-mjs-face-fixture-engine', 'scripts-audit-mjs-story2-engine',
		'scripts-audit-mjs-engine-story-free', 'scripts-audit-mjs-roads-check',
		'scripts-report-copy-text-mjs-selftest',
		'scripts-ui-migration-diff-selftest',
		'scripts-ui-migration-diff-check',
		'test-globals-mjs',
		'test-globals-mjs-selftest',
		'test-store-keys-mjs',
		'test-store-keys-mjs-selftest',
		'test-audit-golden-mjs',
		'test-audit-golden-mjs-selftest',
		'test-chargen-macros-mjs',
		'test-chargen-equivalence-mjs',
		'test-chargen-apply-mjs',
		'test-generated-family-mjs',
		'test-gen-segment-syntax-mjs',
		'test-meta-source-mjs',
	],
	'editor': [
		'editor-compile-selftest', 'editor-equiv-selftest', 'editor-equiv-minimal-demo', 'editor-equiv-face-fixture',
		'editor-k4', 'editor-k4-selfcheck', 'editor-k6', 'editor-k6-selftest',
		'editor-extract-selftest', 'editor-classify-contract-selftest', 'test-equiv-scratch-mjs', 'test-import-side-effects-mjs',
		'test-import-side-effects-mjs-selftest', 'test-layering-mjs', 'test-layering-mjs-selftest', 'test-core-story-mjs',
		'test-serve-editor-mjs', 'test-serve-editor-mjs-selftest', 'test-focus-after-nav-mjs', 'test-focus-after-nav-mjs-selftest',
		'test-web-loader-mjs', 'test-web-loader-mjs-selftest', 'test-web-compile-mjs', 'test-web-compile-mjs-selftest',
		'test-web-save-mjs', 'test-web-save-mjs-selftest', 'test-web-preview-mjs', 'test-web-preview-mjs-selftest',
		'test-web-diagnose-mjs', 'test-web-diagnose-view-mjs', 'test-web-diagnose-wire-mjs', 'test-web-events-mjs',
		'test-web-events-mjs-selftest', 'test-web-form-mjs', 'test-web-form-mjs-selftest', 'test-web-new-package-mjs',
		'test-web-export-mjs', 'test-web-event-graph-mjs', 'test-web-rule-rows-mjs', 'test-web-read-faces-mjs', 'test-readkey-family-mjs', 'test-md-visible-faces-mjs', 'test-audit-scope-header-mjs',
		'test-browser-mjs-selftest',

		'test-k4-args',
		'test-k4-references',
		'test-k4-references-selftest',
		'test-cli-surface-mjs',
		'test-cli-surface-mjs-selftest',
		'test-state-diagnose',
	],
	'story-legal': [
		'test-prose-vocabulary-mjs', 'test-prose-vocabulary-mjs-selftest', 'test-new-story-fixture-mjs', 'test-multi-story-mjs',
		'test-multi-story-mjs-selftest', 'test-lint-story-mjs', 'test-lint-scratch-mjs', 'test-lint-scratch-mjs-selftest',
		'test-story-shape-mjs', 'test-story-runtime-mjs', 'test-story-runtime-mjs-selftest', 'test-story-ci-mjs',
		'test-story-ci-mjs-selftest', 'test-saveload-inventory-mjs', 'test-saveload-inventory-mjs-selftest', 'test-rules-claims-mjs',
		'test-rules-claims-mjs-selftest', 'test-premise-source-mjs', 'test-premise-source-mjs-selftest', 'test-npc-venue-mjs',
		'test-npc-venue-mjs-selftest', 'test-choice-keys-mjs', 'test-choice-keys-mjs-selftest', 'test-g3-evidence-mjs',
		'test-cond-keyform-mjs',
		'test-cond-keyform-mjs-selftest',
		'scripts-report-rhythm-mjs-selftest',
		'scripts-report-rhythm-mjs-check',
		'test-story-codeface-mjs-selftest', 'test-story-codeface-mjs',
	],
	'story-product': [
		'test-smoke-mjs', 'test-smoke-mjs-raf-delayed', 'test-size-gate-mjs', 'test-size-gate-mjs-selftest',
		'test-render-all-mjs',
		 'build-mjs',
	],
	'infra': [
		'scripts-probe-gates-mjs-probe-fast', 'scripts-probe-gates-mjs-check', 'scripts-probe-gates-mjs-selfcheck', 'scripts-report-page-coverage-mjs',
		   'scripts-report-ledger-freshness-mjs-selftest',
		'scripts-report-ledger-freshness-mjs-ledger-check', 'scripts-report-gate-ledger-mjs-selftest', 'scripts-report-gate-ledger-mjs', 'scripts-report-selftest-validity-mjs',
		'scripts-md-format-mjs', 'scripts-move-precheck-mjs', 'scripts-move-precheck-mjs-selftest',
		 'test-ci-triggers-mjs', 'test-ci-triggers-mjs-selftest', 'test-repo-shape-mjs',
		'test-repo-shape-mjs-selftest', 'test-docs-read-path-mjs', 'test-docs-read-path-mjs-selftest', 'test-attribution-gate-mjs',
		'test-attribution-gate-mjs-selftest', 'test-untracked-guard-mjs', 'test-passages-assemble-mjs-selftest',
		'test-plan-needs-mjs', 'test-gate-discovery-mjs', 'test-audit-gates-run-mjs',

		'test-coverage-mjs',
		'test-witness-trace-mjs',
		'scripts-clean-net-mjs-selftest', 'scripts-precommit-check-mjs-selftest', 'scripts-lint-new-segment-mjs-selftest',
		'scripts-lint-human-face-mjs-selftest', 'scripts-lint-human-face-mjs-check',
	],
};

/** `#1093` P1.1：段的组（查表 ✓；**不在表里 ⇒ `null`** ✗ —— 由 `validateSuites` 报「未归组」 ✓）。 */
export const suiteOf = (seg) => {
	const id = typeof seg === 'string' ? seg : seg?.id;
	for (const [k, ids] of Object.entries(SUITE_MEMBERS)) if (ids.includes(id)) return k;
	return null;
};

/** `#1093` P1.1：**完备且不重叠**校验（照 `AUDIT_ENGINE ∪ AUDIT_STORY` 那条「恰好等于」的形态 ✓）。
 *  ① **未归组**（在计划里、查不到组）⇒ 报 ✓；② **跨组**（同 id 出现在两组）⇒ 报 ✓；
 *  ③ 表里**多出**（不在计划里）⇒ 报 ✓（防「表漂了」✗）。
 *  ⚠️ **纯函数 ＋ 注入**（`plan` 与 `members` 都注入 ⇒ 自证能喂假计划 ✓）—— ㊱：攻击面落在判据上 ✓。 */
/** `#1093` P2-a：`inputs` **声明面**的**安全默认 ＋ ratchet 计数**（**本片不含跳过** ✗）。
 *
 * ## 安全默认（裁定：甲 ✓）
 * **未声明 `inputs` 的段 ⇒ 视为「全跑型」＝总是跑** ✓（**安全方向** ✓）。
 * ⚠️ **绝不取"未声明 ⇒ 跳过"** ✗ —— 那就是「**漏跑 ⇒ 假绿**」✗（本票最大风险 ✓）。
 * ⇒ 今日**全部段都未声明** ⇒ **行为与今日逐字相同** ✓ ⇒ **CI 面不劣化** ✓（落地即安全 ✓）。
 *
 * ## ratchet（裁定：**不是**"只许降"✗ ⇒ 而是「**未声明段数不得增加**」✓）
 * 为什么不是"只许降"✗：那会逼人**为全部段一次填满** ⇒ 变成行政工作量 ⇒ 诱出「**为过门而填的假声明**」✗
 * （**比不填更坏** ✓）⇒ 基线＝今日 ✓ ⇒ **新加段必须声明** ✓、**老段可渐进** ✓。
 * ＋ **计数必须打印** ✗（ratchet 类判据一律打印当前计数 ✓）。
 */
/** `#1093` P2-a：**安全默认的机制**（**可单测** ✓ —— 不是靠"注释里写着不跳过"✗）。
 *
 * ⚠️ 为什么要有这个**函数**✗：本片最初把这一格写成 `t('…安全默认…', true)` ✗ ⇒ **恒真断言** ✓
 * ⇒ 复核席实测：**将来有人实现成"未声明 ⇒ 跳过" ⇒ 那格照样绿** ✗（**比没有断言更坏** ✓ —— 看着守住了 ✗）。
 * ⇒ 修法（采纳复核席建议①②✓）：把安全默认**落成一个选择函数** ✓ ⇒ 自证**注入**即可判它真假 ✓。
 *
 * ## 语义（**写死** ✗ —— 复核席前瞻项 ✓）
 * `declared` 为空数组或未给 ⇒ **视为「全跑型」＝任何改动面都算命中** ✓ ⇒ **永不跳过** ✓。
 * ⚠️ 即 **`inputs: []` 与"没写 `inputs`"同义** ✗ —— **不表示"无依赖"** ✓（后者会成**假绿面** ✓ 故不取 ✓）。
 * @param {{declared?: string[], changed?: string[]}} x
 * @returns {boolean} 该段**是否算被改动面命中**（未声明 ⇒ **恒 true** ✓）
 */
export const inputsMatch = ({ declared = [], changed = [] } = {}) => {
	if (!Array.isArray(declared) || declared.length === 0) return true;      // ← 安全默认：未声明 ⇒ 全跑型 ✓（**不是**「无依赖」✗）
	if (declared.some((d) => String(d).replace(/\*+$/, '') === '')) return true;   // ← **全通配 ⇒ 恒命中** ✗（与「未声明」同口径 ✓）
	return changed.some((f) => declared.some((d) => {
		const base = String(d).replace(/\*+$/, '');
		return f === d || (base && f.startsWith(base));
	}));
};

/** `#1093` P2-d ④：**全通配**（`*`／`**`）的 `inputs` ⇒ **必须给出机器可读的理由 ＋ 票号** ✗ —— 不许只写注释 ✓（不可机检 ✗）。
 *  ⚠️ 口径：判的是「**去掉 `*` 后为空**」✗（`*`、`**` 是；`src/**` 不是 ✓ —— 后者是真面 ✓）。
 *  为什么 `['*']` 要管 ✗：它**等价「全跑型」** ✓ ⇒ 等于声明「本段不参与跳过」✓ ⇒ 那是**一次显式决定** ✓
 *  （同 `FULL_REASONS` 的口径 ✓：降频／不跳过都要留痕 ✓）。
 */
export const INPUTS_WILDCARD_REASONS = {
	'test-rules-mjs': {
		reason: '读构建产物与故事数据（契约成员、车卡数据、图鉴条目）=> 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1132',
	},
	'test-meta-source-mjs': {
		reason: '读 stories 清单与故事件（元数据源恰一、正文与清单逐字一致）=> 依赖面跨 stories ⇒ 取全跑型以免静默跳过成假绿面',
		voucher: '#1132',
	},
	'test-generated-family-mjs': {
		reason: '读生成物家族成员与它们声明的源（跨 stories 与 data 面）=> 依赖面跨目录 ⇒ 取全跑型以免静默跳过成假绿面',
		voucher: '#1185',
	},
	'test-chargen-apply-mjs': {
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
	'scripts-lint-human-face-mjs-check': {
		reason: '本段是门的主体：逐件扫描全仓人类面（注释与文档）→ 面即整个仓库 ⇒ 取全跑型（否则存量记号会静默溜过）',
		voucher: '#1174',
	},
	'scripts-lint-human-face-mjs-selftest': {
		reason: '本段验判据函数自身（mask 定位 · 模板串不误判 · 代码区不动 · V3 全量机械验证）⇒ 取全跑型以免静默跳过成假绿面',
		voucher: '#1174',
	},
	'scripts-lint-new-segment-mjs-selftest': {
		reason: '合成计划注入五类缺陷（不读真计划）=> 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1166',
	},
	'test-chargen-equivalence-mjs': {
		reason: 'boot 起真引擎＋读 stories/face-fixture/data/chargen.json（源面）⇒ 依赖面跨目录 ⇒ 取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1132',
	},
	'test-gen-segment-syntax-mjs': {
		reason: '纯函数自证（不读 stories；解析器在测试内注入 node:vm）=> 取全跑型以免静默跳过成假绿面',
		voucher: '#1176',
	},
	'test-chargen-macros-mjs': {
		reason: 'boot 起真引擎＋直接调宏 handler（不读 stories 目录）；取全跑型以免静默跳过成假绿面 ✓',
		voucher: '#1132',
	},
	'test-story-codeface-mjs-selftest': {
		reason: '本段是**合成输入自证**（纯函数注入）⇒ 与真树文件无关，但为避免"静默跳过=假绿面" ✗ 取全跑型 ✓',
		voucher: '#1132',
	},
	'test-story-codeface-mjs': {
		reason: '本段读 `stories` 目录下的 twee 清单 ＋ 两处机制标签声明件（漂移检测）⇒ 依赖面跨目录且会随迁移变动 ⇒ 取全跑型 ✓',
		voucher: '#1132',
	},
	'test-passages-assemble-mjs-selftest': {
		reason: '本段读**自证夹具**（跑起来在 src 侧动态造件）＋ 被判件住的目录不止一个 ⇒ 静态面写不窄 ⇒ 取全通配（＝不参与跳过 ✓）',
		voucher: '#1114',
	},
	'test-md-visible-faces-mjs': {
		reason: '本段读**故事源面**（`stories/**/passages/*.md` ＋ twee）与 core 分派面 ⇒ 面宽且随内容变 ⇒ 静态面写不窄 ⇒ 取全通配（宁多跑不漏面 ✓）',
		voucher: '#1141',
	},
	'test-audit-scope-header-mjs': {
		reason: '本段跑**真入口**（`scripts/audit.mjs` 五个面 × 两态 `--story`）取首行对象头 ⇒ 面＝**整个审计驱动器**（含门与产物）⇒ 静态面写不窄 ⇒ 取全通配（宁多跑不漏面 ✓；头的形状一旦走偏必须当场红 ✗）',
		voucher: '#1157',
	},
	'test-readkey-family-mjs': {
		reason: '本段**读码两侧**（引擎真源 `src/engine/40-sim/21-resolve.twee` ＋ core 镜像 `editor/lib/core/audit-shared.mjs`）；面经**常量间接**（`ENGINE` 常量 ⇒ 抽取器看不到字面量 ✗）⇒ 取全通配（宁多跑不漏面 ✓ 成对断言一旦漂移必须当场红 ✗）',
		voucher: '#1156',
	},
};   // 键＝段 id；值＝{ reason, voucher }（**缺任一项不生效** ✗）

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

export const UNDECLARED_INPUTS_BASELINE = 158;   // 2026-09-21 实测：当时**全部 158 段**都未声明 ✓

export const inputsDeclaredStats = (plan = SEGMENTS) => {
	const undeclared = plan.filter((s) => !Array.isArray(s.inputs) || s.inputs.length === 0).map((s) => s.id);
	return { undeclared, declared: plan.length - undeclared.length, total: plan.length };
};

/** ratchet：**未声明段数不得增加** ✓（只比数，不比集合 ✓ —— 集合可换，数不许涨 ✓）。 */
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

export const testPlan = () => SEGMENTS;
// **旧格式**：把计划拼回 `&&` 串（对照/调试用）
export const planChain = () => SEGMENTS.map((s) => s.cmd).join(' && ');
