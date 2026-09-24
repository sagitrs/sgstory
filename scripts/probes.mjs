/** 探针清单（`#908` ①）—— **台账「自证」列的下一格**。
 *
 * ## 为什么要有它
 * `docs/gate-ledger.md` 的「自证」列是**抽取式代理**：`hasSelfProof()` 只量「测试件里（注释外）**写没写** `反例/selftest` 那句话」
 * —— 它证明的是"**写了那句话**"，**不是**"那个判据真会红"。探针化 = 把这一格从**代理**换成**直接读数**。
 *
 * ## 一条探针长什么样（形状见 `#908` 评论 `5725279414` —— **写形状，不写"谁定的"**）
 * **最小变异 ＋ 必须红**，且**两半都要**：
 * ① **正**：变异**前** `cmd` **rc=0**（否则"红"可能来自别的原因 → 这条读数不成立）；
 * ② **反**：对 `mutation.file` 做一次**最小**改动（`find` → `replace`）→ `cmd` **rc=1** **且报文点名** `expect.stdout`；
 * 变异**备份还原**在 `finally`，并把「**注入确认 N 处**」打出来（`N=0` → 探针**没下到刀** → 红，不许读成"读数没牙" —— 同族坑实测栽过一次：正则没命中 → "注入 0 处"）。
 *
 * ## 三条纪律（每条都为"能假"服务）
 * - **探针件必须入仓**（不许只活在某个人的 `/tmp`）＋ **可粘贴复跑命令**一起进仓（`#913` 的活教训：命令没写出来 → 后人复现不了）；
 * - **前置写进命令**：要 `node build.mjs` 就写 `pre`；缺前置 → 运行器**点名报「缺前置」**，**不许报成"探针不咬"**（那是两件事）；
 * - **`rebuild`（可选）跑两处**（`#1012`／`#1019`）：**① 变异之后、`cmd` 之前**（判据对象是**产物**的探针必须重建，否则量的是上一代产物＝**假不咬**）· **② 还原被测件之后**（不留变异版产物 → 不污染后续段的相序）；两处任一失败 → **红**。不改 `pre` 语义（仍是"变异之前"）。
 * - **成本分档**：`tier: 'fast'` 进 CI 常规段、`'full'` 走 `--probe=full`（手动／夜跑）；台账里写明**本轮覆盖到哪一档**（⑲：适用面）。
 *
 * ## 加一条探针的最短路径
 * ```jsonc
 * { id: '<台账行的 id，逐字 >', tier: 'fast', pre: [], cmd: '<那一行的 cmd >',
 * mutation: { file: '<被测件（不是测试件）>', find: '<唯一真语句 >', replace: '<最小变异 >'},
 * expect: { rc: 1, stdout: /<点名那条判据 >/}, why: '<这条量的是哪个判据 >'}
 * ```
 * 自检：`node scripts/probe-gates.mjs --probe=fast`（`--list` 看清单、`--check` 只做结构校验不跑）。
 *
 *注意：**`build/probe-results.json` 是会被污染的产物**（不入仓，但同一个工作树里会被**上一次**实跑覆盖）：
 * 手动跑过负控（把某条探针改成"不咬"）之后，**台账那一格会红** —— 那不是台账坏了，是记录还留着上次的字 → **先重跑探针、再跑台账段**。
 */

/** @type {{id:string,tier:'fast'|'full',pre:string[],cmd:string,rebuild?:string, // `#1012`：变异后重建产物（还原之后跑，失败即红）
mutation:{file:string,find:string,replace:string},expect:{rc:number,stdout:RegExp},why:string}[]} */
export const PROBES = [
	{
		id: 'test/gen-needed.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/gen-needed.mjs',
		mutation: {
			file: 'scripts/lib/gen-needed.mjs',
			find: "const missing = products.filter((f) => !exists(f));",
			replace: "const missing = products;   // 探针：改回恒真形态（不看在否）",
		},
		expect: { rc: 1, stdout: /只产子集且产物齐备/ },
		why: '量的是「缺件才编」那一支（改回"忽略 exists"的恒真写法 ⇒ 第一格当场点名）。',
	},
	// `#1189`：量的是「覆盖格真的在守」那一支 —— 刀＝往 `src/` 里插一段合成现场（形态与真的一样，不进表）。
	{
		id: 'test/route-registry.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/route-registry.mjs',
		mutation: {
			file: 'src/engine/40-sim/32-social.twee',
			find: "\tapplyAskEffect(a, pc) {",
			replace: "\tapplyAskEffectFake(a, pc) {\n\t\tconst hook = window.Sg?.story?.socialHooks?.()?.[a.id]?.apply;\n\t},\n\tapplyAskEffect(a, pc) {",
		},
		expect: { rc: 1, stdout: /覆盖：每个现场都在表里|反向核/ },
		why: '量的是「新增多路线行为必须同片带表项」那条出生规则（插一段不带表项的现场 ⇒ 覆盖格或反向核点名）。',
	},
	// `#1188`：量的是「有没有默认，就是该不该声明的判据」那一支 —— 刀＝把规格里的一条缺省删掉
	//（选 `lootText`：它「引擎在读、三故事都没声明」→ 删掉缺省后缺口格必须点名）。
	{
		id: 'test/contract-defaults.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/contract-defaults.mjs',
		mutation: {
			file: 'editor/lib/core/contract-defaults.mjs',
			find: "	combatAction: { kind: 'null', verified: VERIFIED },",
			replace: "	// 探针：删掉这条缺省（引擎仍在读它、三故事都没声明，缺口格应点名）",
		},
		expect: { rc: 1, stdout: /default-missing|combatAction/ },
		why: '量的是「**已声明成员的缺省**被用」那一支（B 半收口后：读点按域收窄 ⇒ 旧靶子“任意名的缺省”已失效；删该成员缺省 ⇒ 判据件当场点名该成员）。',
	},
	// `#1186`：量的是「未声明模块的故事零玩法概念」那一支 —— 刀＝把战斗组的在场门从"按契约面"改成
	// "恒在场"（即让 `dragon` 无条件出现）→ 第二格必须点名。
	// 不需要 `rebuild`：被测面是引擎那段的门与状态形状。
	{
		id: 'test/pc-base.mjs',
		tier: 'fast',
		// 本判据读**构建产物**（`boot` 起真产物）→ 与 `test/social-lever.mjs` 那条同形：`pre` 建基线、`rebuild` 在变异后重编。
		pre: ['node build.mjs >/dev/null'],
		rebuild: 'node build.mjs >/dev/null',
		cmd: 'node test/pc-base.mjs',
		mutation: {
			file: 'src/10-core.twee',
			find: "\t\tif (window.Sg?.story?.hasChargen?.() === true) {",
			replace: "\t\tif (true) {   // 探针：车卡族改回无条件（无车卡的故事应零玩法概念，此时必红）",
		},
		expect: { rc: 1, stdout: /零玩法概念|未声明/ },
		why: '量的是「玩法状态随模块走」那一支（改回无条件 ⇒ 第二格当场点名）。',
	},
	// `#1208`：量的是「代码面**真的**用的是词法器」那一支在守 —— 刀＝把 `state.mjs` 的代码面调用点
	// 换回散文启发式（这正是分面要防的"拿启发式扫代码"）→ 分面接线格必须点名。
	//注意：不需要 `rebuild`（被测面是门读源码时的接线，不编译进产物）。
	{
		id: 'test/comment-face-split.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/comment-face-split.mjs',
		mutation: {
			file: 'scripts/audit/gates/state.mjs',
			// `#1269` A 类：靶同步 —— 被测语句已改走 `absPath(f)`（符号名 ⇒ 真身），
			// 探针靶必须跟着改（否则"注入确认 0 处"＝**刀没下到真语句**，读数不成立 ✗）。
			find: "sources[f] = maskComments(readFileSync(absPath(f), 'utf8'));",
			replace: "sources[f] = stripProseComments(readFileSync(absPath(f), 'utf8'));   // 探针：拿散文启发式扫代码",
		},
		expect: { rc: 1, stdout: /不把散文启发式拿来扫代码|用 maskComments/ },
		why: '量的是「按输入面分派实现」那一支真的在守（把代码面改回散文启发式 ⇒ 接线格当场点名 ✓）。',
	},
		// `#1206`：量的是「剥注单一权威**按出现序做词法扫描**」那一支真的在守 —— 刀＝把权威
		// 换回病历写法（先剥块注释、不先剥行注释）→ `//` 行里的 `/*` 会与后面的 `*/` 配对，
		// 把夹在中间的真代码吞掉 → 能红格必须点名（本格 ① 两格就是为此写的）。
		//注意：不需要 `rebuild`：被测面是**门自己读源码时的遮蔽口径**（不编译进产物）。
		{
			id: 'test/comment-mask.mjs',
			tier: 'fast',
			cmd: 'node test/comment-mask.mjs',
			mutation: {
				file: 'editor/lib/core/mask.mjs',
				find: "export const maskComments = (src, opts) => mask(src, opts).text;",
				replace: "export const maskComments = (src) => String(src ?? '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/^\\s*\\/\\/.*$/gm, '');   // 探针：改回病历写法",
			},
			expect: { rc: 1, stdout: /旧写法吞真代码|权威遮蔽器不吞/ },
			why: '量的是「剥注按出现序扫，行注释里的记号不吞真代码」那一支真的在守（改回"先剥块注释"的病历写法 ⇒ 能红格当场点名 ✓）。',
		},
	// `#1200`：量的是「差集护栏真的在守」那一支 —— 刀＝往一个扫描面内的件里插一行
	// 引用不存在脚本的注释（引用出现在注释里也算引用，这正是文档面的常态）。
	// 不需要 `rebuild`：被测面是脚本自身的扫描行为。
	{
		id: 'test/npm-entries-guard.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/npm-entries-guard.mjs',
		mutation: {
			file: 'docs/dev-conventions.md',
			find: "# 工程约定（Dev Conventions）",
			replace: "# 工程约定（Dev Conventions）\n\n（探针：这里引用 `npm run probe-missing-entry`，不存在，应被点名）",
		},
		expect: { rc: 1, stdout: /probe-missing-entry/ },
		why: '量的是「引用不存在脚本会被点名」那一支（插一行假引用 ⇒ 护栏 rc=1 并印出现场）。',
	},
	{
		// 台账行：`test/state-diagnose.mjs`（34 条断言，是本仓"能假"写得最足的一件）
		id: 'test/state-diagnose.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/state-diagnose.mjs',
		mutation: {
			// 被测件 ＝ `lib/core/**`（**不是**测试件）：把「字面状态读」那一路的**产出**掐掉
			file: 'editor/lib/core/stateDiagnose.mjs',
			find: 'for (const key of literalReadKeys(k)) {',
			replace: 'for (const key of []) out.push(',
		},
		expect: { rc: 1, stdout: /字面状态读/ },
		why: '量的是 `tableReadProblems` 的**读侧判定**真的会红 （`test/state-diagnose.mjs:111` 那条「反例·`tableReadProblems`」）—— 掐掉产出  该断言必须红 ',
	},
	{
		// 台账行：`scripts/report-gate-ledger.mjs` —— 探针刀口对着**台账自己**
		id: 'scripts/report-gate-ledger.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node scripts/report-gate-ledger.mjs --selftest',
		mutation: {
			// 把「自证」判定改成**恒真** → 它自己那 4 条正反例里，「只在注释里写 → false」必须红
			//注意：锚必须**唯一**：`#1056` 新增了 `selftestDispatched`（内部也是同一个 `maskComments(...)` 表达式）
			// → 旧锚（只锤 `.test(maskComments(...))` 那半句）变成 **2 处** →「锚不唯一」。
			// → 带上 `export const hasSelfProof` 头，锚定到**那一条声明**（实测：改后 `--probe=fast` 1 处）。
			file: 'scripts/report-gate-ledger.mjs',
			find: 'export const hasSelfProof = (src) => /负例|反例|selftest/.test(maskComments(String(src ?? \'\'), { file: \'ledger\', twee: false }));',
			replace: 'export const hasSelfProof = (src) => true || /负例|反例|selftest/.test(maskComments(String(src ?? \'\'), { file: \'ledger\', twee: false }));',
		},
		expect: { rc: 1, stdout: /hasSelfProof/ },
		why: '量的是「自证」判定**自己**能假 （本列若恒真  整列读数作废 ）—— 与 `#899` ③ 同源：**判定也要有能假的另一半** ',
	},
	{
		// 车道 G 前半 · 切片 1c（`#215` 报备 `18503697` / 开工报备 `18503987`）：**反向哨兵**（退出条件）真的在守
		id: 'test/contract-compat.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/contract-compat.mjs',
		mutation: {
			// 把“退出条件成立 → 该删”那一路**让过去** → 条目腐烂不再被抓 → 必红
			file: 'editor/lib/core/contractCompat.mjs',
			find: 'if (retireWhenMet(e?.retireWhen, storyVersions)) {',
			replace: 'if (false && retireWhenMet(e?.retireWhen, storyVersions)) {',
		},
		expect: { rc: 1, stdout: /retired|该删|退出条件/ },
		why: '量的是「**退出条件真的会被执行**」（＝`escapeHatchProblems` 的“登记腐烂  红”同构）：把它排掉  “退出条件已成立而条目还在”静默通过  必红且点名  —— 否则上限 ＋ 退出条件就是“只增不减”的摆设 ',
	},
	// ⛔ **退役 ＋ 声明**（`#1004` B2b）：本行探针随 `test/web-settle.mjs` 一起退役。
	// 因由：该件的**门侧样本**是 `stories/hollow-cave/gates/settle.mjs` —— 该故事已删（B2a）
	// → 件本体在 `ee67dcd` 退役 → 探针**目标文件已不存在** → `node scripts/probe-gates.mjs --probe=fast`
	// 实测「变异前就红（rc=1）→ 这次"红"不是变异造成的」 → **setup 层一红即中止整条 `npm test`**。
	//注意：声明：**「落点文案（`--settle`）页内与 CLI 同判」这一面自此无探针守护**
	//（页内件 `editor/web/settle-view.mjs` 与 core `editor/lib/core/settleRows.mjs` 都还在册，
	// 缺的是**带 settle 门侧样本的故事**）→ 日后要动它 → **先补一个带 `gates/settle.mjs` 的样本**，
	// 再把本行按原形状接回（`checkClaims` 式的判定机制没丢 —— 与本仓 `test/rules-claims.mjs` 的退役同款）。
	//注意：台账面不受影响：`docs/gate-ledger.md` 里**本来就没有这一行**（段表在 `ee67dcd` 已清）
	// → 本行是**孤儿探针** → 删它**不动** `scripts/probe-budget.json` 的 `maxUnprobed`。
	{
		// `#984`（P3-④ 用户故事 CI）：把「**发现到了却没进编排 → 点名**」那条判据掐掉（恒不报）
		// →「新故事不会静默漏掉」就成了空话 → 自证里那条**能假**必红并点名。
		id: 'test/story-ci.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/story-ci.mjs',
		mutation: {
			file: 'editor/lib/core/storyCi.mjs',
			// `#999`：目标行**改了**（`missingFromPlan` 改成认尾段）→ 探针的 `find` 必须跟上
			//（注意：台账的 `— 未探 / 不咬` 那行**当场**把它标成「不咬」 —— 这正是 ratchet 要抓的「门改了、探针没跟」）。
			find: 'const hit = (s) => plan.some((p) => p.cmd.some((a) => a === s || a.endsWith(`/${s}`)));',
			replace: 'const hit = () => true;   // 探针：恒命中  missingFromPlan 恒空  “能假”那条必红 ',
		},
		expect: { rc: 1, stdout: /发现了却没进编排/ },
		why: '量的是「**发现 ≠ 覆盖**」那一步真的在守（让 `missingFromPlan` 恒不报  `test/story-ci.mjs` 的“能假”那条必红 ）—— 否则“新故事自动被覆盖”只是句口号 ',
	},
	{
		// `#1004` B2b：`ci.yml` 的**故事页路径不许硬编码**（`test/multi-story.mjs` 的 **P6**）。
		// 为什么它值得一条探针：那两条判据是「**只在合后才跑的门**」（`post-deploy-smoke` 只在 push to main 跑）
		// 在 **PR 阶段的唯一能见度** —— 实测就该作业硬引用已删故事页而 PR CI 全绿。
		//注意：**刀要打在洞里**（复核席给的读数）：早先那版判据只抓「已删 slug」 → 变异**已删**那一支
		// ＝**重复已覆盖的分支**、对洞无感 → 本刀＝**锚点仍在** ＋ 另起一行写死一个**【现存】**故事页
		// → 若判据回退成"只抓已删" → 这条探针**当场不咬**（这正是它要守的那条线）。
		id: 'test/multi-story.mjs',
		tier: 'fast',
		pre: ['node build.mjs'],   // 本件读 `dist/` 产物 → 前置写进命令（缺前置报「缺前置」，不报"不咬"）
		cmd: 'node test/multi-story.mjs',
		mutation: {
			file: '.github/workflows/ci.yml',
			find: "STORY_PATH=$(grep -oE 'stories/[A-Za-z0-9._-]+/index\\.html' /tmp/idx.html | head -1)",
			replace: "STORY_PATH=$(grep -oE 'stories/[A-Za-z0-9._-]+/index\\.html' /tmp/idx.html | head -1)\n          STORY=\"${URL}stories/face-fixture/index.html\"   # 探针：锚点仍在 ＋ 另起一行写死【现存】故事 ⇒ P6 必红 ✓",
		},
		expect: { rc: 1, stdout: /P6/ },
		why: '量的是「冒烟作业里的故事页路径**不许硬编码**（⚠️ **现存/已删一律** ✗）＋ **必须从书架页现场取**」（锚点仍在 ＋ 写死一个**现存**故事 ⇒ P6 必红 ✓）—— 该判据是"只在合后跑的门"在 PR 阶段的唯一能见度 ✗',
	},
	// ⛔ **退役 ＋ 声明**（`#1226` 探针身份门的首个实测样本；形态照 `#1004` B2b）：
	// 为什么退役：本片把结局段容器 `.ending-acts` 改名 `.acts` 后，`.acts` 在**多出 7 段**出现 
	// 焦点有**两处互补机制**（`80-script.twee` 的 `:passageend.sgFocusNav` 与 `:passageend.sgBackToActs`）
	// **单点变异不再能让该判据红**（禁其一，另一处仍把焦点留在 `#passages` 内） 变异"不咬"属**机制性**，非腐烂。
	// 红能力由谁承担：`test/focus-after-nav.mjs --selftest` 的**合成反例**（"导航型但焦点丢到 body" 等三例 必红）。
	// 何时可接回：若将来只剩一处焦点机制（另一处删除/改名），可按原形状（变异 `sgFocusNav` 那行）接回本条目。
	/* 原条目（保留原文，便于接回）：
		{
			// `#1012`：**导航型交互之后焦点仍在正文内**（`test/focus-after-nav.mjs`）—— 契约见
			// `docs/dev-conventions.md` §6「键盘可续」（`activeElement.closest('#passages')`，**不绑元素**）。
			//注意：被测面是 `src/**` 的**引擎行为** → 本门读的是**产物**：`pre` 只建基线，
			// 真正让变异生效的是 `rebuild` 的**第一处**（变异之后、`cmd` 之前）—— 写成 `pre` 会得到
			// "变异后仍绿" 的**假不咬**（改了源却不重建 → 量的是上一代产物）。
			//注意：刀必须换**事件名**：`jQuery.on('ev.ns')` 的 **namespace 不挡事件分发** → 只改 namespace
			//（如 `sgFocusNav-DISABLED`）那一手**根本没禁掉** —— 实测踩过：会误判成"本门不咬"。
			id: 'test/focus-after-nav.mjs',
			tier: 'fast',
			// `pre` ＝**变异之前**建一次基线产物（本门读 `dist/` → 没产物会"凭空红"× 不是"不咬"）。
			pre: ['node build.mjs >/dev/null'],
			cmd: 'node test/focus-after-nav.mjs',
			// `rebuild` **跑两处**（`#1012` 实测／`#1019` 口径）：**变异后**（不然量的是上一代产物）
			// ＋ **还原后**（不然 `dist/` 里留着变异版 → 后续 **37 段** boot 类门全红 → 探针自污染相序）。
			rebuild: 'node build.mjs >/dev/null',
			mutation: {
				file: 'src/80-script.twee',
				find: "jQuery(document).on(':passageend.sgFocusNav', (ev) => {",
				replace: "jQuery(document).on(':passageendDISABLED.sgFocusNav', (ev) => {",
},
			expect: { rc: 1, stdout: /焦点跑出正文/},
			why: '量的是「**导航型交互之后焦点仍在正文内**」那一手真的在守（禁用 `:passageend.sgFocusNav` 导航后 `activeElement` 落 `body` 本件必红并点名）—— 否则「焦点回收」只写在注释里（`#1012`）',
},
	*/

	{
		// 台账行：`test/repo-shape.mjs`（`#1008` 第二半：**仓根顶层条目**守卫）。
		// 刀打在**第 ① 支**（实际有、声明没有 ＝ **新顶层目录**走的那一支），且**不碰测试件**：
		// 被测件＝白名单**数据**（`scripts/repo-shape.json`）—— 把 `docs` 这条改个名 → 仓根真实存在的
		// `docs/` 立刻成为「未登记的顶层条目」→ 与「新顶层目录」走**同一条比较分支**。
		//注意：反向那一支（声明有、实际没有）**只**由 `test/repo-shape.mjs --selftest` 的 ② 组守
		// → 那一条**已成对登记**进 `scripts/test-plan.mjs`（复核席在 PR `#1018` 上点名的阻断：
		// 只登记正跑 → ② 支在 CI 里零守护，而本注释又声称它被守 → 声称 ≠ 实际）。
		// → 本刀**不分支隔离**（改白名单 `docs` 名会同时触发 ① 与 ②）→ 它咬得住，
		// 但**不能**据此认为 ② 支被本探针覆盖 —— 两条一起才覆盖完整形状。
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
		why: '量的是「仓根出现**未登记的顶层条目**时门会红并点名它」（误提交的临时件是**结构错**：`unclaimed-file` 只管源文件、`build.mjs` 只盯 `*.twee`  拦不住顶层目录；来历＝#874 的 home/** 与 #1008 本片删掉的 tmp/mf3.json）—— 白名单里把 `docs` 改名  真实存在的 `docs/` 成为未登记项  门必须红并点名',
	},
	{
		// `#1044`：段间产物依赖边守护门 —— 刀＝把 `test-lint-scratch-mjs` 的 needs 改回缺边形（修复前形状）。
		//注意：为什么这一刀**确定性**有效：本门是纯静态判定（读 SEGMENTS 的 needs 数组 不跑并发 不赌时序）
		// → 删边 → 判据①当场红并点名两端（与 `#1024` 探针「旧落点没被重建」同为静态锚）。
		//注意：`pre: []`：本门只读 `scripts/test-plan.mjs` 源（入口件不 import `boot.mjs` → `cmdNeedsProducts` 判其不读产物）。
		id: 'test/plan-needs.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/plan-needs.mjs',
		mutation: {
			file: 'scripts/test-plan.mjs',
			find: "needs: ['build-mjs', 'test-lint-story-mjs'], cmd: \"node test/lint-scratch.mjs\"",
			replace: "needs: ['build-mjs'], cmd: \"node test/lint-scratch.mjs\"",
		},
		expect: { rc: 1, stdout: /缺 needs 依赖|边表端点/ },
		why: '量的是「`test-lint-scratch-mjs` 对 `test-lint-story-mjs` 的产物依赖边**真的在册**」（删边  并发跑器不再保证相序  同波读到半成品  假红回归 `#1044` ）—— 否则这条边只活在注释里 ',
	},
	{
		// `#1078`：读路径门（「按任务读」死链必红点名）。刀＝往真表插一行死链（虚构文档）→ 门必红并点名行号与路径。
		//注意：该刀**与并发/时序无关**（纯读 docs/README.md → 静态确定性）。
		//注意：`pre: []`：本门只读 docs/README.md（入口件不 import `boot.mjs` → `cmdNeedsProducts` 判其不读产物）。
		id: 'test/docs-read-path.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/docs-read-path.mjs',
		mutation: {
			file: 'docs/README.md',
			find: "| 查历史 / 作废稿（含已删故事 1 的设定·设计·实施三件套，`#1077`） | `docs/archive/README.md` | — |",
			replace: "| 查历史 / 作废稿（含已删故事 1 的设定·设计·实施三件套，`#1077`） | `docs/archive/README.md` | — |\n| 探针：虚构文档 | `docs/no-such-doc-probe.md` | — |   # 探针：死链  门必红 ",
		},
		expect: { rc: 1, stdout: /no-such-doc-probe|不存在/ },
		why: '量的是「按任务读表引用的文档必须存在（死链红点名）」那一手真的在守（插一行死链  门必红并点名行号与路径 ）—— 否则必读面死链只活在注释里 （`#1078` ）',
	},
	{
		// `#1087`：修 `#1054` 落在 main 上的**探针缺陷** ——
		//注意：原条目**只有 `id` 一行**（缺自己的 `cmd`/`mutation`/`expect`/`why`），且它**在同一个 `{…}` 里**
		// → JS **对象重复键** → `id` 被后写的覆盖，**其余字段沿用了上一个条目（`docs-read-path`）的**
		// → 实测：`PROBES.find(id==='test/ci-triggers.mjs')` 的 `cmd` 是 `node test/docs-read-path.mjs`、
		// `mutation.file` 是 `docs/README.md` → 它**"咬住"了，但证明的是另一个门**
		//（「**探针在册但证明的不是那个门**」 —— 与本仓"`✅` 不代表断言真会红"同族）。
		// 刀：把本门**条件化**那一手掐掉（`if (s.hasPR)` → `if (true)`）→ 无 `pull_request` 面的文件
		//（`soak-nightly` 等）会**再次假红** → 本门必红并点名该文件。
		id: 'test/ci-triggers.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/ci-triggers.mjs',
		mutation: {
			file: 'test/ci-triggers.mjs',
			find: '\tif (s.hasPR) {',
			replace: '\tif (true) {   // 探针：条件化被掐掉  无 pr 面的文件又会假红 ',
		},
		expect: { rc: 1, stdout: /soak-nightly|viewport-smoke|pull_request\.types/ },
		why: '量的是「**逐文件适用面写准**（有该面才判）那一手真的在守」（掐掉条件化  `soak-nightly.yml` 等无 `pull_request` 面的文件立刻假红并点名文件 ）—— 否则扩射程后 8 处假红回归 （`#1087`）',
	},
	{
		// `#1089`（乙′）：**未跟踪扫描面 → 红** 的**接线**守护 ——注意：本条的刀**必须打在"门里"**，
		// 因为 `test/untracked-guard.mjs` 测的是**纯函数**（判据本身对），
		// 而「**门到底有没有调用它**」纯函数自证**看不见** —— 那正是领队转达的那格
		//（本仓老账：**自证测纯函数、不测接线** → 删掉接入点自证仍全绿）。
		// 刀：把门外层那一步**拆掉**（`untrackedScannedProblems` 的调用 → 不再收进 `fail[]`/`bad++`）
		// → 未跟踪的夹具件**不再被判** → 门**应当不再红** —— 但这条探针量的是**反方向**：
		// 我们要的是"**接线在** → 未跟踪 → 红" → 所以刀**反过来下**：
		// 把门里那个**判据谓词**改成"恒假"（`isScanned` → `() => false`）→ 未跟踪件不再算"落在扫描面"
		// → 门**不再报** → 而 `test/untracked-guard.mjs` 的**端到端那一格**（真 git 三态）
		// 仍会红 → 可定位到"谓词被改坏"。
		//注意：**靶件由本件自建自清**（`test/untracked-guard.mjs` 的端到端段：`writeFileSync` 造夹具 →
		// `finally` 删 ＋ 清场自证）→ **不用 `pre`** —— 探针运行器**没有 `pre` 的清理钩**，
		// 用它造文件会**残留污染工作树**（本片实测踩过：带 `pre` 那次，靶件被 `git add -A`
		// 带进了暂存区 —— 与「探针跑起来之后禁 `git add -A`」同族）。
		id: 'test/untracked-guard.mjs',
		tier: 'fast',
		pre: [],
		cmd: 'node test/untracked-guard.mjs',
		mutation: {
			// 被测件＝**助手本身**（纯函数层）→ 把"是否算落在扫描面"改成**恒假** → 未跟踪件不再被算
			file: 'scripts/lib/untracked-guard.mjs',
			find: 'const unscanned = [...new Set(untracked)].filter((p) => p && isScanned(p) && !ex.has(p) && !isTransient(p)).sort();',
			replace: 'const unscanned = [...new Set(untracked)].filter((p) => p && false && isScanned(p) && !ex.has(p) && !isTransient(p)).sort();',
		},
		expect: { rc: 1, stdout: /未跟踪/ },
		why: '量的是「**未跟踪  红**」这一手真的在守（把"落在扫描面"的判定掐掉  本件端到端那格必红并点名"未跟踪" ）—— 否则该缺口只活在注释里 （`#1089` 乙′）',
		//注意：本刀打在**纯函数**上 → 它证的是"判据这一手在"；**门接线**由三个门的 `--selftest`／实测守
		//（本仓口径：探针量"变异前绿 → 变异后红且点名" → 本条的"点名"＝助手件里那条 "未跟踪" 断言）
	},
];
// `#1261` 大裁剪：以下探针的**靶对象已删**（随 demo/WebUI/判据件下架）→ 退役；
// 判据：**对象已删 → 退役**／对象在但样本暂缺 → 临时下架（见下架台账）／对象在且样本在 → 修到绿。
// - test/k4-references.mjs
// - test/event-graph.mjs
// - test/web-event-graph.mjs
// - test/dialect.mjs
// - test/contract-version.mjs
// - test/web-rule-rows.mjs
// - test/web-read-faces.mjs
// - test/equiv-scratch.mjs
// - test/witness-trace.mjs
// - test/lint-scratch.mjs
// - test/social-lever.mjs
// - test/serve-editor.mjs
// - test/cond-keyform.mjs
// - test/prose-vocabulary.mjs
// - test/web-export.mjs
// - test/notes-absence.mjs
