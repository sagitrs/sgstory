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

/** @type {{id:string,tier:'fast'|'full',pre:string[],cmd:string,mutation:{file:string,find:string,replace:string},expect:{rc:number,stdout:RegExp},why:string}[]} */
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
	{
		// 台账行：`test/web-settle.mjs` ✓（车道 D · `--settle` 页内面 ✓）
		id: 'test/web-settle.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/web-settle.mjs',
		mutation: {
			// 把页内那一支的判定**掐掉**（返回空 ✗）⇒ “非空上的同判”必红 ✓（这一步只动页内 ✗ ⇒ 不会把两侧一起变 ✗）。
			file: 'editor/web/settle-view.mjs',
			find: 'for (const prob of settleProblems(p.text, p.name)) problems.push(prob);',
			replace: 'for (const prob of []) problems.push(prob);',
		},
		expect: { rc: 1, stdout: /非空/ },
		why: '量的是「页内**真的在判**（与 CLI 同一份 core ✓），而不是把结论抄一遍／判空」（掐掉页内那一步 ⇒ “非空上的同判”那条必红 ✓）—— 否则“两侧同判”会被写成“两侧都空”✗',
	},
];
