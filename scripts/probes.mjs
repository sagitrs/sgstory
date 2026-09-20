/** 探针清单（`#908` ① ✓）—— **台账「自证」列的下一格** ✓。
 *
 * ## 为什么要有它
 * `docs/gate-ledger.md` 的「自证」列是**抽取式代理** ✗：`hasSelfProof()` 只量「测试件里（注释外）**写没写** `反例/selftest` 那句话」✗
 * —— 它证明的是"**写了那句话**"✗，**不是**"那个判据真会红"✗。探针化 = 把这一格从**代理**换成**直接读数** ✓。
 *
 * ## 一条探针长什么样（形状见 `#908` 评论 `5725279414` ✓ —— **写形状，不写"谁定的"** ✗）
 * **最小变异 ＋ 必须红** ✓，且**两半都要**：
 *   ① **正**：变异**前** `cmd` **rc=0** ✓（否则"红"可能来自别的原因 ✗ ⇒ 这条读数不成立 ✓）；
 *   ② **反**：对 `mutation.file` 做一次**最小**改动（`find` ⇒ `replace` ✓）⇒ `cmd` **rc=1** ✓ **且报文点名** `expect.stdout` ✓；
 * 变异**备份还原**在 `finally` ✓，并把「**注入确认 N 处**」打出来 ✗（`N=0` ⇒ 探针**没下到刀** ⇒ 红 ✓，不许读成"读数没牙" ✗ —— 同族坑实测栽过一次：正则没命中 ⇒ "注入 0 处" ✓）。
 *
 * ## 三条纪律（每条都为"能假"服务 ✓）
 * - **探针件必须入仓** ✗（不许只活在某个人的 `/tmp` ✓）＋ **可粘贴复跑命令**一起进仓 ✓（`#913` 的活教训：命令没写出来 ⇒ 后人复现不了 ✓）；
 * - **前置写进命令** ✗：要 `node build.mjs` 就写 `pre` ✓；缺前置 ⇒ 运行器**点名报「缺前置」**✗，**不许报成"探针不咬"**（那是两件事 ✓）；
 * - **`rebuild`（可选）跑两处** ✗（`#1012`／`#1019` ✓）：**① 变异之后、`cmd` 之前**（判据对象是**产物**的探针必须重建，否则量的是上一代产物＝**假不咬** ✓）· **② 还原被测件之后**（不留变异版产物 ⇒ 不污染后续段的相序 ✓）；两处任一失败 ⇒ **红** ✓。不改 `pre` 语义（仍是"变异之前"✓）。
 * - **成本分档** ✓：`tier: 'fast'` 进 CI 常规段 ✓、`'full'` 走 `--probe=full`（手动／夜跑 ✓）；台账里写明**本轮覆盖到哪一档** ✓（⑲：适用面 ✓）。
 *
 * ## 加一条探针的最短路径 ✓
 * ```jsonc
 * { id: '<台账行的 id，逐字 ✓>', tier: 'fast', pre: [], cmd: '<那一行的 cmd ✓>',
 *   mutation: { file: '<被测件（不是测试件 ✗）>', find: '<唯一真语句 ✓>', replace: '<最小变异 ✓>' },
 *   expect: { rc: 1, stdout: /<点名那条判据 ✓>/ }, why: '<这条量的是哪个判据 ✓>' }
 * ```
 * 自检：`node scripts/probe-gates.mjs --probe=fast` ✓（`--list` 看清单 ✓、`--check` 只做结构校验不跑 ✓）。
 *
 * ⚠️ **`build/probe-results.json` 是会被污染的产物** ✗（不入仓 ✓，但同一个工作树里会被**上一次**实跑覆盖 ✓）：
 *   手动跑过负控（把某条探针改成"不咬"✓）之后，**台账那一格会红** ✓ —— 那不是台账坏了，是记录还留着上次的字 ✓ ⇒ **先重跑探针、再跑台账段** ✓。
 */

/** @type {{id:string,tier:'fast'|'full',pre:string[],cmd:string,rebuild?:string,   // `#1012`：变异后重建产物（还原之后跑 ✓，失败即红 ✓）
mutation:{file:string,find:string,replace:string},expect:{rc:number,stdout:RegExp},why:string}[]} */
export const PROBES = [
	{
		// 台账行：`test/state-diagnose.mjs` ✓（34 条断言 ✓，是本仓"能假"写得最足的一件 ✓）
		id: 'test/state-diagnose.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/state-diagnose.mjs',
		mutation: {
			// 被测件 ＝ `lib/core/**` ✓（**不是**测试件 ✗）：把「字面状态读」那一路的**产出**掐掉 ✓
			file: 'editor/lib/core/stateDiagnose.mjs',
			find: 'for (const key of literalReadKeys(k)) out.push(',
			replace: 'for (const key of []) out.push(',
		},
		expect: { rc: 1, stdout: /字面状态读/ },
		why: '量的是 `tableReadProblems` 的**读侧判定**真的会红 ✓（`test/state-diagnose.mjs:111` 那条「反例·`tableReadProblems`」✓）—— 掐掉产出 ⇒ 该断言必须红 ✓',
	},
	{
		// 台账行：`scripts/report-gate-ledger.mjs` ✓ —— 探针刀口对着**台账自己** ✓
		id: 'scripts/report-gate-ledger.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node scripts/report-gate-ledger.mjs --selftest',
		mutation: {
			// 把「自证」判定改成**恒真** ✗ ⇒ 它自己那 4 条正反例里，「只在注释里写 ⇒ false」必须红 ✓
			file: 'scripts/report-gate-ledger.mjs',
			find: '.test(maskComments(String(src ?? \'\'), { file: \'ledger\', twee: false }))',
			replace: '.test("") || true)',
		},
		expect: { rc: 1, stdout: /hasSelfProof/ },
		why: '量的是「自证」判定**自己**能假 ✓（本列若恒真 ⇒ 整列读数作废 ✗）—— 与 `#899` ③ 同源：**判定也要有能假的另一半** ✓',
	},
	{
		// 车道 D 切片 2（`#215` `18501384`）：**键级图**的运行器自证 ✓
		id: 'test/event-graph.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/event-graph.mjs',
		mutation: {
			// 把"按 `VOCAB.effects` 那几面取授予键"这一路**掐掉**（面名变成空 ✗）⇒ 授予表必空 ⇒ 三处断言必须红 ✓
			file: 'editor/lib/core/eventGraph.mjs',
			find: 'for (const face of VOCAB.effects) for (const k of asList(row?.[face]))',
			replace: 'for (const face of []) for (const k of asList(row?.[face]))',
		},
		expect: { rc: 1, stdout: /keysGrantedBy|grantedBy/ },
		why: '量的是「键级图」的两张表**真的**从数据面算出来 ✓（掐掉授予面 ⇒ `grantedBy` 空 ⇒ 合成反例与真数据反查都红 ✓）—— 不是常数 ✓',
	},
	{
		// 车道 D 切片 3（`#215` `18502113`）：**显示层**的缺口守卫 ✓ —— 掐掉"缺数据 ⇒ 抛" ✗ ⇒ 空图 + 该用例必红 ✓
		id: 'test/web-event-graph.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/web-event-graph.mjs',
		mutation: {
			file: 'editor/web/event-graph-view.mjs',
			find: 'if (!Array.isArray(rows) || !Array.isArray(members)) {',
			replace: 'if (false) {',
		},
		expect: { rc: 1, stdout: /rules\.json|contract\.json/ },
		why: '量的是「缺数据必须报错」那一格**真的**在守 ✓（掐掉它 ⇒ 页面会画一张**空图** ⇒ 会被读成"没有依赖"✗ ⇒ 两条缺口用例必红 ✓）',
	},
	{
		// 车道 G 前半 · 切片 1a（`#215` 报备 `18502752`）：**方言指纹**的「**缺 vs 畸形**」分家自证 ✓
		id: 'test/dialect.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/dialect.mjs',
		mutation: {
			// 把"在册但不是普通对象"这一路**降级成合法空形状** ✗ ⇒ 畸形在册、数字与断言必红 ✓
			file: 'editor/lib/core/dialect.mjs',
			find: 'if (!isPlainObject(obj)) return null;',
			replace: 'if (!isPlainObject(obj)) return { topKeys: [], items: {} };',
		},
		expect: { rc: 1, stdout: /不是普通对象|畸形/ },
		why: '量的是「**缺 ⇒ 合法** ✗ 与 **畸形 ⇒ 报** ✓ 真的是两回事」（把畸形静默降成合法空形状 ⇒ `rules.json: []` 那一条当场红 ✓）—— 否则“缺＝合法”会被写成“什么坏形状都合法”✗',
	},
	{
		// 车道 G 前半 · 切片 1b（`#215` 报备 `18503024`）：**包络只剩一个方向的牙** ✓ —— 全集外字段必须报
		id: 'test/contract-version.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/contract-version.mjs',
		mutation: {
			// 把"逐字段查越界"这一路**让过去** ✗ ⇒ 全集外字段静默通过 ⇒ 合成那两条断言必红 ✓
			file: 'editor/lib/core/contractVersion.mjs',
			find: "for (const f of fields) if (!df.includes(f)) out.push({ file, kind: 'field', name: f, list });",
			replace: "for (const f of []) if (!df.includes(f)) out.push({ file, kind: 'field', name: f, list });",
		},
		expect: { rc: 1, stdout: /brandNewField|全集外/ },
		why: '量的是「**单向 ⊆ 包络**」那一刀**真的有牙** ✓（把字段级越界检查摘掉 ⇒ `brandNewField` 静默通过 ⇒ 必红且点名 ✓）—— 否则“全集”只是个摆设（随手加字段没人拦 ✗）',
	},
	{
		// 车道 E-B2（`#215` 报备 `18502613`）：**规则行**页内面的「**两侧同判**」自证 ✓
		id: 'test/web-rule-rows.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/web-rule-rows.mjs',
		mutation: {
			// 把页内那一支的死规则判定**掐掉**（返回空数组 ✗）⇒ 页内主读数不从 0 变 1 ⇒ 刀那一条必红 ✓
			file: 'editor/web/rule-rows-view.mjs',
			find: 'dead: deadRows(rows),',
			replace: 'dead: [],',
		},
		expect: { rc: 1, stdout: /合成一条死规则/ },
		why: '量的是「页内**真的在判**，而不是把 CLI 的结论抄一遍」（掐掉 core 那一步 ⇒ 页内主读数不从 0 变 1 ⇒ 刀必红 ✓）—— 否则“两侧同判”会被写成“两侧都空”✗',
	},
	{
		// 车道 G 前半 · 切片 1c（`#215` 报备 `18503697` / 开工报备 `18503987`）：**反向哨兵**（退出条件）真的在守
		id: 'test/contract-compat.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/contract-compat.mjs',
		mutation: {
			// 把“退出条件成立 ⇒ 该删”那一路**让过去** ✗ ⇒ 条目腐烂不再被抓 ⇒ 必红 ✓
			file: 'editor/lib/core/contractCompat.mjs',
			find: 'if (retireWhenMet(e?.retireWhen, storyVersions)) {',
			replace: 'if (false && retireWhenMet(e?.retireWhen, storyVersions)) {',
		},
		expect: { rc: 1, stdout: /retired|该删|退出条件/ },
		why: '量的是「**退出条件真的会被执行**」（＝`escapeHatchProblems` 的“登记腐烂 ⇒ 红”同构）：把它排掉 ⇒ “退出条件已成立而条目还在”静默通过 ⇒ 必红且点名 ✓ —— 否则上限 ＋ 退出条件就是“只增不减”的摆设 ✗',
	},
	{
		// 车道 E-B3（`#215` 报备 `18504078`）：**读侧（`--reads`）**页内面的「① 条件表行级」自证 ✓
		id: 'test/web-read-faces.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/web-read-faces.mjs',
		mutation: {
			// 把页内那一支的 ① 级判定**掐掉**（返回空 ✗）⇒ 注入的字面状态读不被点名 ⇒ 刀那一条必红 ✓
			file: 'editor/web/read-faces-view.mjs',
			find: 'const problems = tableReadProblems(rows);',
			replace: 'const problems = [];',
		},
		expect: { rc: 1, stdout: /注入字面状态读/ },
		why: '量的是「页内**真的在判** ① 条件表行级，而不是把 CLI 的结论抄一遍」（掐掉 core 那一步 ⇒ 注入的字面状态读不被点名 ⇒ 刀必红 ✓）—— 否则“两侧同判”会被写成“两侧都空”✗',
	},
	// ⛔ **退役 ＋ 声明**（`#1004` B2b）：本行探针随 `test/web-settle.mjs` 一起退役 ✓。
	//   因由：该件的**门侧样本**是 `stories/hollow-cave/gates/settle.mjs` ✓ —— 该故事已删（B2a ✓）
	//   ⇒ 件本体在 `ee67dcd` 退役 ✓ ⇒ 探针**目标文件已不存在** ⇒ `node scripts/probe-gates.mjs --probe=fast`
	//   实测「变异前就红（rc=1）⇒ 这次"红"不是变异造成的」✗ ⇒ **setup 层一红即中止整条 `npm test`** ✗。
	//   ⚠️ 声明 ✗：**「落点文案（`--settle`）页内与 CLI 同判」这一面自此无探针守护** ✓
	//   （页内件 `editor/web/settle-view.mjs` 与 core `editor/lib/core/settleRows.mjs` 都还在册 ✓，
	//   缺的是**带 settle 门侧样本的故事** ✓）⇒ 日后要动它 ⇒ **先补一个带 `gates/settle.mjs` 的样本** ✓，
	//   再把本行按原形状接回 ✓（`checkClaims` 式的判定机制没丢 ✗ —— 与本仓 `test/rules-claims.mjs` 的退役同款 ✓）。
	//   ⚠️ 台账面不受影响 ✓：`docs/gate-ledger.md` 里**本来就没有这一行** ✗（段表在 `ee67dcd` 已清 ✓）
	//   ⇒ 本行是**孤儿探针** ✓ ⇒ 删它**不动** `scripts/probe-budget.json` 的 `maxUnprobed` ✓。
	{
		// `#976`：**中间目录用完就清**那一步真的在守（掐掉 `finally` 里的清理 ⇒ 残留 ⇒ 集合断言必红 ✓）
		//  ⚠️ `#1004` B2b 重钉 ✗：本行原来那刀是「把产物目录改回旧形 `build/generated/<slug>`」✓ ——
		//   测试件在 `3f14e0c` 换样本（`mist-forest` ⇒ `night-ferry`）时把断言改成了**看"跑完多了什么"**
		//   ✗ ⇒ 那刀落在**没被断言的**那一半上（`<slug>` 非点形 ✓）⇒ 实测**变异后 rc=0 ⇒ 探针不咬** ✓。
		//   现刀 = 掐掉 `finally` 的 `rmSync` ✓ ⇒ 本件跑完会**新**留下 `.equiv-run-*` ✓ ⇒ ② 必红 ✓
		//   （测试件同期把判据改成「不留**新**草稿」= baseline 差分 ✓ ⇒ 上一轮变异留下的残留**不会**顶红下一次基线 ✓，
		//    否则「变异前就红」重演 ✗ —— 这正是本行上一版刀遇到过的坑 ✓）。
		id: 'test/equiv-scratch.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/equiv-scratch.mjs',
		mutation: {
			file: 'editor/lib/host/commands.mjs',
			find: "rmSync(runDir, { recursive: true, force: true });",
			replace: "void runDir;   // 探针：掐掉清理 ⇒ 残留 ⇒ 本件 ②/③ 必红 ✓",
		},
		expect: { rc: 1, stdout: /不留草稿目录/ },
		why: '量的是「中间目录**真的用完就清**」（掐掉 `finally` 的清理 ⇒ 本件跑完新留 `.equiv-run-*` ⇒ "不留草稿"必红 ✓）—— 否则"唯一 ＋ 清理"只写在注释里 ✗',
	},
	{
		// `#984`（P3-④ 用户故事 CI）：把「**发现到了却没进编排 ⇒ 点名**」那条判据掐掉（恒不报 ✗）
		//   ⇒ 「新故事不会静默漏掉」就成了空话 ✓ ⇒ 自证里那条**能假**必红并点名 ✓。
		id: 'test/story-ci.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/story-ci.mjs',
		mutation: {
			file: 'editor/lib/core/storyCi.mjs',
			// `#999`：目标行**改了**（`missingFromPlan` 改成认尾段 ✓）⇒ 探针的 `find` 必须跟上 ✗
			//   （⚠️ 台账的 `— 未探 / ✗ 不咬` 那行**当场**把它标成「不咬」✓ —— 这正是 ratchet 要抓的「门改了、探针没跟」✗）。
			find: 'const hit = (s) => plan.some((p) => p.cmd.some((a) => a === s || a.endsWith(`/${s}`)));',
			replace: 'const hit = () => true;   // 探针：恒命中 ⇒ missingFromPlan 恒空 ⇒ “能假”那条必红 ✓',
		},
		expect: { rc: 1, stdout: /发现了却没进编排/ },
		why: '量的是「**发现 ≠ 覆盖**」那一步真的在守（让 `missingFromPlan` 恒不报 ⇒ `test/story-ci.mjs` 的“能假”那条必红 ✓）—— 否则“新故事自动被覆盖”只是句口号 ✗',
	},
	{
		// `#215` 裁 (B) ✓：**兜底必须标出来**那一步真的在守 ✗（掐掉 `fallback: true` ⇒ 轨迹里出现
		//  "既无 `choiceKey`、也没标兜底"的步 ⇒ 自证的那条"按 key 可复跑"必红 ✓）
		//  ⚠️ 为什么用这一刀 ✗：它正是发起者点名的那一格（"兜底命中时要在 trace 里标出来 ✗，
		//  免得'按 key 可复跑'被兜底悄悄破掉 ✓"）⇒ **因果相关 ＋ 确定性** ✓（不碰并发面 ✓）。
		id: 'test/witness-trace.mjs',
		tier: 'fast',
		// `#1019` ✓：本件的 `cmd` **读产物**（`witness-trace ⇒ test/walker.mjs ⇒ boot.mjs` 的 dist 新鲜度守卫 ✓）
		//   ⇒ 原 `pre: []` 让"未变异那一跑"在**树上产物陈旧/缺失**时红 ⇒ 被记成「**不咬**」（**病因名报错** ✗，`#1018` 实测的假读数 ✓）。
		//   ⚠️ 这一条**不能靠静态判据自动抓到**（静态只判入口件的 import ⇒ 见 `cmdNeedsProducts` 的"宁漏不误" ✓）
		//   ⇒ 靠**运行时那一支**点名 ＋ 本条显式声明 ✓（即本仓纪律：**前置写进命令** ✓）。
		pre: ['node build.mjs >/dev/null'],
		cmd: 'node test/witness-trace.mjs',
		mutation: {
			file: 'test/walker.mjs',
			find: "step.fallback = true;",
			replace: "/* 探针：兜底不再标出 ✓ */ step.choiceLabel = step.choiceLabel;",
		},
		expect: { rc: 1, stdout: /兜底/ },
		why: '量的是「**label 兜底真的被标出来**」（掐掉 `fallback: true` ⇒ 轨迹里那几步既无 key、也没标兜底 ⇒ 自证的"按 key 可复跑"那条必红 ✓）—— 否则"兜底是必要的 ✓ 但要显式"只写在注释里 ✗',
	},
	{
		// `#1004` B2b ✓：`ci.yml` 的**故事页路径不许硬编码**（`test/multi-story.mjs` 的 **P6** ✓）。
		//  为什么它值得一条探针 ✗：那两条判据是「**只在合后才跑的门**」（`post-deploy-smoke` 只在 push to main 跑 ✗）
		//  在 **PR 阶段的唯一能见度** ✓ —— 实测就该作业硬引用已删故事页而 PR CI 全绿 ✓。
		//  ⚠️ **刀要打在洞里** ✗（复核席给的读数 ✓）：早先那版判据只抓「已删 slug」✓ ⇒ 变异**已删**那一支
		//  ＝**重复已覆盖的分支**、对洞无感 ✗ ⇒ 本刀＝**锚点仍在** ＋ 另起一行写死一个**【现存】**故事页 ✓
		//  ⇒ 若判据回退成"只抓已删" ⇒ 这条探针**当场不咬** ✓（这正是它要守的那条线 ✗）。
		id: 'test/multi-story.mjs',
		tier: 'fast',
		pre: ['node build.mjs'],   // 本件读 `dist/` 产物 ⇒ 前置写进命令（缺前置报「缺前置」✗，不报"不咬"✓）
		cmd: 'node test/multi-story.mjs',
		mutation: {
			file: '.github/workflows/ci.yml',
			find: "STORY_PATH=$(grep -oE 'stories/[A-Za-z0-9._-]+/index\\.html' /tmp/idx.html | head -1)",
			replace: "STORY_PATH=$(grep -oE 'stories/[A-Za-z0-9._-]+/index\\.html' /tmp/idx.html | head -1)\n          STORY=\"${URL}stories/face-fixture/index.html\"   # 探针：锚点仍在 ＋ 另起一行写死【现存】故事 ⇒ P6 必红 ✓",
		},
		expect: { rc: 1, stdout: /P6/ },
		why: '量的是「冒烟作业里的故事页路径**不许硬编码**（⚠️ **现存/已删一律** ✗）＋ **必须从书架页现场取**」（锚点仍在 ＋ 写死一个**现存**故事 ⇒ P6 必红 ✓）—— 该判据是"只在合后跑的门"在 PR 阶段的唯一能见度 ✗',
	},
	{
		// `#1012` ✓：**导航型交互之后焦点仍在正文内**（`test/focus-after-nav.mjs` ✓）—— 契约见
		//  `docs/dev-conventions.md` §6「键盘可续」（`activeElement.closest('#passages')` ✓，**不绑元素** ✗）。
		//  ⚠️ 被测面是 `src/**` 的**引擎行为** ⇒ 本门读的是**产物** ✓：`pre` 只建基线 ✓，
		//   真正让变异生效的是 `rebuild` 的**第一处**（变异之后、`cmd` 之前 ✓）—— 写成 `pre` 会得到
		//   "变异后仍绿" 的**假不咬** ✓（改了源却不重建 ⇒ 量的是上一代产物 ✓）。
		//  ⚠️ 刀必须换**事件名** ✗：`jQuery.on('ev.ns')` 的 **namespace 不挡事件分发** ✓ ⇒ 只改 namespace
		//   （如 `sgFocusNav-DISABLED`）那一手**根本没禁掉** ✓ —— 实测踩过：会误判成"本门不咬" ✗。
		id: 'test/focus-after-nav.mjs',
		tier: 'fast',
		// `pre` ＝**变异之前**建一次基线产物（本门读 `dist/` ⇒ 没产物会"凭空红"× 不是"不咬"✓）。
		pre: ['node build.mjs >/dev/null'],
		cmd: 'node test/focus-after-nav.mjs',
		// `rebuild` **跑两处** ✗（`#1012` 实测／`#1019` 口径 ✓）：**变异后**（不然量的是上一代产物 ✓）
		// ＋ **还原后**（不然 `dist/` 里留着变异版 ⇒ 后续 **37 段** boot 类门全红 ✗ ⇒ 探针自污染相序 ✓）。
		rebuild: 'node build.mjs >/dev/null',
		mutation: {
			file: 'src/80-script.twee',
			find: "jQuery(document).on(':passageend.sgFocusNav', (ev) => {",
			replace: "jQuery(document).on(':passageendDISABLED.sgFocusNav', (ev) => {",
		},
		expect: { rc: 1, stdout: /焦点跑出正文/ },
		why: '量的是「**导航型交互之后焦点仍在正文内**」那一手真的在守（禁用 `:passageend.sgFocusNav` ⇒ 导航后 `activeElement` 落 `body` ⇒ 本件必红并点名 ✓）—— 否则「焦点回收」只写在注释里 ✗（`#1012` ✓）',
	},
	{
		// 台账行：`test/repo-shape.mjs`（`#1008` 第二半：**仓根顶层条目**守卫）。
		//  刀打在**第 ① 支**（实际有、声明没有 ＝ **新顶层目录**走的那一支），且**不碰测试件**：
		//  被测件＝白名单**数据**（`scripts/repo-shape.json`）—— 把 `docs` 这条改个名 ⇒ 仓根真实存在的
		//  `docs/` 立刻成为「未登记的顶层条目」⇒ 与「新顶层目录」走**同一条比较分支**。
		//  ⚠️ 反向那一支（声明有、实际没有）**只**由 `test/repo-shape.mjs --selftest` 的 ② 组守
		//  ⇒ 那一条**已成对登记**进 `scripts/test-plan.mjs`（复核席在 PR `#1018` 上点名的阻断：
		//  只登记正跑 ⇒ ② 支在 CI 里零守护，而本注释又声称它被守 ⇒ 声称 ≠ 实际）。
		//  ⇒ 本刀**不分支隔离**（改白名单 `docs` 名会同时触发 ① 与 ②）⇒ 它咬得住 ✓，
		//  但**不能**据此认为 ② 支被本探针覆盖 ✗ —— 两条一起才覆盖完整形状。
		id: 'test/repo-shape.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/repo-shape.mjs',
		mutation: {
			file: 'scripts/repo-shape.json',
			find: '"name": "docs",',
			replace: '"name": "docs-probe-renamed",',
		},
		expect: { rc: 1, stdout: /unclaimed-top-level/ },
		why: '量的是「仓根出现**未登记的顶层条目**时门会红并点名它」（误提交的临时件是**结构错**：`unclaimed-file` 只管源文件、`build.mjs` 只盯 `*.twee` ⇒ 拦不住顶层目录；来历＝#874 的 home/** 与 #1008 本片删掉的 tmp/mf3.json）—— 白名单里把 `docs` 改名 ⇒ 真实存在的 `docs/` 成为未登记项 ⇒ 门必须红并点名',
	},
	{
		// 台账行：`test/lint-scratch.mjs`（`#1024`：`lint-story` 的 scratch **本次运行唯一**）。
		//  刀＝把 `lint` 的产物目录**改回按 slug 固定**（`build/generated/<slug>`）—— 正是修复前的形状 ✗。
		//  ⚠️ 为什么这一刀**确定性**有效：本件的两条判据里有一条是「**旧落点没有被这次运行重建**」，
		//  它与并发时序无关 ⇒ 变异后必红（本片负控实测 ✓；只靠并发互踩那一轮可能恰好躲过 ✓）。
		id: 'test/lint-scratch.mjs',
		tier: 'fast',
		pre: ['node build.mjs'],   // 该件跑真 `lint-story`，故事门要读 dist 产物 ⇒ 前置写进命令（缺前置报「缺前置」✗，不报「不咬」✓）
		cmd: 'node test/lint-scratch.mjs',
		mutation: {
			file: 'editor/lib/host/commands.mjs',
			find: "const gen = join(lintRun, 'gen');",
			replace: "const gen = join(ROOT, 'build', 'generated', slug);",
		},
		expect: { rc: 1, stdout: /旧落点|并发自证未过/ },
		why: '量的是「`lint-story` 的中间目录**本次运行唯一**」（改回按 slug 固定 ⇒ 两个并发进程互相踩 ⇒ 假红「编译不幂等」；本件用「旧落点没被重建」这条**与并发时序无关**的判据把它钉死 ✓）—— 否则「并发安全」只写在注释里 ✗',
	},
	{
		// `#1019` 第 4 件 ✓：`test/social-lever.mjs`（`#1011` 保覆盖版，接手 `#360` 的交涉筹码分派门）。
		//  刀＝在 `adv`（优势筹码）分支**补回 `S.applyAskEffect(a, pc)`** ⇒ 正是 `#360` **修复前**的形状
		//  （UI 标了"更有把握"、实际走免检完成 ✓）⇒ 门必红并点名「优势筹码不得直接完成诉求」✓。
		//  ⚠️ 选这条断言是因为它**与并发无关**（本仓刚被"共享目录/时序"那类判据咬过两次 ✗）：
		//   它量的是"这一支有没有完成诉求"，只看状态、不看时序 ✓。
		//  ⚠️ **必须 `pre` ＋ `rebuild` 两处都给** ✗：被测面在 `src/**`（引擎源）⇒ 判据对象是**编译产物** ✓
		//   ⇒ `pre` 建基线产物 ✓、`rebuild` 在**变异之后**重编（否则量不到变异 ＝"判据没坏但没量到东西" ✗）
		//   ＋**还原之后**再跑一次（不留变异版产物 ⇒ 不污染后续段相序 ✓）。
		//   ➕ 这是 `rebuild` 那两处语义的**第一个真实用例**（`#1026` 落地／本条用上 ✓）。
		id: 'test/social-lever.mjs',
		tier: 'fast',
		pre: ['node build.mjs >/dev/null'],
		cmd: 'node test/social-lever.mjs',
		rebuild: 'node build.mjs >/dev/null',
		mutation: {
			file: 'src/engine/40-sim/21-resolve.twee',
			find: "\t\t\t\tif (lv.gives === 'adv') {\n\t\t\t\t\t// #360：优势筹码只把「这一问更有把握」摆出来——**不完成诉求**。\n\t\t\t\t\tpc.ev.soc_lever = lv.id;",
			replace: "\t\t\t\tif (lv.gives === 'adv') {\n\t\t\t\t\tS.applyAskEffect(a, pc);   // 探针：改回 #360 修复前形状 ✓\n\t\t\t\t\tpc.ev.soc_lever = lv.id;",
		},
		expect: { rc: 1, stdout: /优势筹码不得直接完成诉求/ },
		why: '量的是「**优势筹码只给优势、不完成诉求**」那一支真的在守（把 `applyAskEffect` 补回 `adv` 分支 ⇒ 门必红并点名 ✓）—— 否则 `#360` 那类"UI 标了优势、实际走免检"会静默回来 ✗',
	},
	{
		// `#1033` ✓：编辑器入口那条 —— 刀＝把**服务根**从"仓根"改成 `editor/web` ✗。
		//  ⚠️ 为什么这把刀对 ✓：它正打在**本票的关键读数**上（`app.mjs` 跨目录 import `../lib/core/**` ⇒
		//  根必须是仓根 ✓）；改小根 ⇒ 那个跨目录资源 404 ⇒ 测试件的"**跨目录可达**"那格**确定性**变红 ✓
		//  （不靠并发/时序 ✓ —— 本仓刚被那类判据咬过两次 ✗）。
		//  ⚠️ 不需要 `rebuild`：被测面是 **scripts/** 的运行时行为（不编译进产物 ✓）。
		//  ⚠️ 被测件在 `scripts/**` ⇒ 与 `cmdNeedsProducts` 无关（该件不引 `boot.mjs` ✓）⇒ `pre: []` ✓。
		id: 'test/serve-editor.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/serve-editor.mjs',
		mutation: {
			file: 'scripts/serve-editor.mjs',
			find: "export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/$/, '');",
			replace: "export const ROOT = fileURLToPath(new URL('../editor/web', import.meta.url)).replace(/\\/$/, '');   // 探针：把服务根改小 ⇒ 跨目录那格必红 ✓",
		},
		expect: { rc: 1, stdout: /跨目录/ },
		why: '量的是「编辑器入口**真的以仓根为服务根**（＝页面能跑起来）」那一手在守（把根改小 ⇒ `app.mjs` 跨目录 import 的资源取不到 ⇒ 测试件必红并点名"跨目录" ✓）—— 否则"能开"与"看着像能开"会混为一谈 ✗',
	},
];
