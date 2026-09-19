// #247 F2「门的行为化率」台账（生成 + 自检）
//
// 背景：本仓常年有几十个常设机检。它们的**风险不是漏测，而是空判**——门在跑、输出很绿，
// 但断言其实咬不住任何东西（本日实际集齐四类：覆盖≠验收 / 反例空判 / 死开关 #331 /
// 原理不可达断言 #338）。F2 的判据就是给每个门标出：
//   形态（行为化 / 仅登记 / 人工走查）· 是否有**自证**（反例真会红）· 是否**接线**（在 npm test 里）
// 并要求：**仅登记 / 未接线必须写明理由**，否则本门报红。
//
// 台账本身也要防腐：`docs/gate-ledger.md` 由本脚本 **生成**（--update），`--check` 校验
// 「文件与实况一致」＋「无理由的仅登记/未接线」——文档漂移＝红（与 F6 同源纪律）。
//
// 用法：
//   node scripts/report-gate-ledger.mjs            # 打印台账 + 一致性检查
//   node scripts/report-gate-ledger.mjs --update   # 重新生成 docs/gate-ledger.md
//   node scripts/report-gate-ledger.mjs --selftest # 自证（合成输入，验判定会咬）

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { planChain, testPlan } from './test-plan.mjs';
import { maskComments } from '../editor/lib/core/mask.mjs';   // `#899` ③：**同一把刀**（全仓唯一遮蔽器 ✓ —— 不新增第二份 ✗）
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PROBES } from './probes.mjs';   // `#908` ①：探针清单（**直接读数** ✓ —— 与「自证」那一格的**代理**分家 ✓）

const LEDGER = 'docs/gate-ledger.md';
const PKG = 'package.json';

// ── 仅登记 / 未接线的理由（必须逐条写明；新增未写理由的项 → 本门红）──────────
// 「仅登记」＝只出报告、不做断言（允许，但必须说明为什么不设为门）；
// 「未接线」＝不在 npm test 链里（允许，但必须说明谁来跑、何时跑）。
export const REASONS = {
	// ── audit 开关（id 形如 audit:<flag>）──
	'audit:economy': { form: '行为化', reason: '收支时间线：**报表算术即判据**（`delta:null` 不计入／按**章序**累计／序走最低），自证 3 例（#342 第 8 波；此前标「仅登记」，由形态对账查出并改正）' },
	'audit:items': { form: '行为化', reason: '龙战伤害矩阵：**两条不变量**（减伤件更多 ⇒ 伤害不增；败次 0→2 ⇒ 伤害不减）＋自证 3 例（合成 I，不依赖真表）' },
	'audit:tokens': { form: '行为化', reason: '与 --items 同族：伤害矩阵不变量 ＋ 自证（同一次改动）' },
	'audit:text': { reason: '文本载荷门（**有判定**：载荷阈值）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补（密度 ratchet 在 --craft，本门是自己的载荷线）' },
	'audit:checks': { form: '行为化', reason: '检定矩阵：天然位点概率（1/20，劣势平方）＋优势标记阈值＋**单调性不变量**（优势 ≥ 普通），自证 5 例（含浮点边界陷阱留注）' },
	'audit:systems': { reason: '机制×锚句门（**有判定**：机制必须有可感知锚句）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补' },
	'audit:canon': { form: '行为化', reason: '禁词/回流扫描：表格解析/§10 行覆盖/守林人代词/§9 双读（含 `allow` 白名单与 `/% %/` 剥注释）/§3.9 传说投放，**自证 6 例**（#342 第 8 波）' },
	'audit:sel': { wired: true, reason: '接线说明：--sel 只是 --nosl＋--gear 的便捷别名，链上跑的是更具体的两个 flag，故没有单独的 --sel --check（**形态是有判定的门**，此前台账误标「仅登记」，已由形态对账改正）' },
	// ── 报告脚本（id 形如 scripts/<file>）──
	'scripts/report-rhythm.mjs': { wired: true, form: '行为化', reason: 'R1/R1b/R2/正例 四例自证，已入 npm test' },
	'scripts/report-polarity-gap.mjs': { form: '行为化', reason: '**未接线（report-only）**：条件原子 × 极性的**覆盖缺口报告**（伞 `#626`／本票 `#628`）。它**刻意不是门**——观测是抽样的（未观测 ≠ 断言不存在），设成门就等于用抽样运气冒充「行为符合预期」（正是伞票要改掉的形态）。谁来跑：`npm run report:polarity`（前置 `npm run build`）；何时跑：裁决撤 soak 之前先看缺口、以及矩阵门（依赖 `#629`）落码前定行数。自证 8 例（注释遮蔽／`elseif`／widget 标记／`era` 两态／三档计数正反例／渲染点名），`--selftest` 能红。' },
	'scripts/report-two-state.mjs': { form: '行为化', reason: '**未接线（原型）**：两态**注入**原型（伞 `#626`／本票 `#629`）——证明目标段的每个条件站点**真/假两侧都能由真实渲染观测到**（状态注入 ＋ `Engine.play` 直达；真机口径同 `#491`）。它刻意不是门：门形态等伞票裁决（落点见 `#607`）。谁来跑：`npm run report:two-state`（前置 `npm run build`）；何时跑：矩阵门（依赖本票结论）落码前验证执行器可行性。自证 9 例（期望五类 text/noText/choice/noChoice/lands 各带反例 ＋ 两态归纳单态必 false），`--selftest` 能红。' },
	'scripts/report-ledger-freshness.mjs': { form: '行为化', reason: '**离线段已入 npm test**（`--ledger --check`：#297 对标台账行级新鲜度——行数栅栏/复核日期在期/触发条件非空/落点引用的门旗标与文件真实存在，7 例自证）；**网络段仍需 token**（#NNN 标记与 GitHub 真实状态一致），不塞主链路，由 `npm run report:freshness:check` 人工/定时跑' },
	'scripts/report-gate-ledger.mjs': { wired: true, form: '行为化', reason: '本文件自身的自检（台账不腐），已入 npm test' },
	'scripts/move-precheck.mjs': { wired: true, form: '行为化', reason: '#458 前置：**六处同步**校验（源文件/ORDER/MODULES/故事清单/常量声明/聚合返回）＋单根假设清点；自证 **11** 条断言（**量法**：`node scripts/move-precheck.mjs --selftest` 输出里 `✓`/`✗` 行计数）；覆盖面＝六处正反例 ＋ **两层登记**（引擎件 ⊂ ORDER/MODULES ✓／故事件 ⊂ 清单 ✓）正反例 ＋ 聚合返回。`#893` 第三步：`②③④` 按层分工（引擎侧安全网一律不撤 ✓）' },
	'scripts/report-selftest-validity.mjs': { wired: true, form: '行为化', reason: '**已入 npm test**（#474 接线）：静态扫描 `自证·` 是否「失败计入退出码」＋ 自增量是否「不崩」（TDZ/未声明）。接线前修掉剥离器**配对错位**（四条正则顺序剥 ⇒ 跨行贪婪吞代码 ⇒ `counters` 空 ⇒ 假阳性；**顺序治不了** ⇒ 改单扫描器按 JS 词法一次遮蔽注释/字符串/模板/正则，未闭合保守剥＋报诊断）。自证 18 例（V1×8＋V2×10），探针：删某门 `process.exit(1)` ⇒ 必报、退 1' },
	// ── 测试脚本（id 形如 test/<file>）──
	'test/walker.mjs': { wired: false, reason: '随机游走 soak（npm run soak）：耗时长、种子流非确定，不进 npm test' },
	'test/browser.mjs': { wired: false, reason: '需真实 Chrome（npm run browser / soak）；CI 由 soak job 跑' },
	'test/audit-golden.mjs': { wired: true, form: '行为化', reason: '**已入 npm test**（#436 收编）：实测全量 **8.0s**（dragon 7.0s ＋ 其余每个 30–55ms ⇒ 无需子集；此前"24 个开关较慢"的估计不成立）。收编时逐条归因既有漂移（18 个开关：10 纯自证插入／3 含新不变量行／3 数值替换／1 `state`（#483））' },
	'test/saveload-inventory.mjs': { wired: true, form: '行为化', reason: '自证 6 例（含 widget 间接改状态）' },
	'test/layering.mjs': { wired: true, form: '行为化', reason: '自证 **33** 条断言（**量法**：`node test/layering.mjs --selftest` 输出里 `✓`/`✗` 行计数）；覆盖面＝模块依赖（`cases` 11 项，含 `#893` 两层登记的三条正反例）/ 点号 defines / 层间方向 / engine rank 派生与四条禁止边' },
	'test/saveload.mjs': { wired: true, form: '行为化', reason: '**自证按需跑**：`node test/saveload.mjs --selftest`（故障注入＝落档后人为扰动，断言比较器判红）；不塞主链的理由＝自证需完整导航（成本≈主跑 30s，收益不值）' },
};


const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
// #381：「跑哪些段」的单一权威是 `scripts/test-plan.mjs`（引入跑器后不再靠匹配 package.json 的长 `&&` 串——
// 那串已改成一行 `node scripts/run-tests.mjs`）。但**仍要校验 npm test 真的在跑那个跑器**：
// 计划里写了、CI 却没人跑 ＝ 幻影门（见下方 phantom-runner 判定）。
const testChain = planChain();
const testEntry = pkg.scripts.test ?? '';
const RUNNER_RE = /scripts\/run-tests\.mjs/;

// ── 枚举：常设机检 = audit 开关 + scripts/report-*.mjs + test/*.mjs ──────────
const MODIFIERS = ['check'];
// #316 第 2 步：门拆到 scripts/audit/gates/*.mjs —— 枚举与自证检测都覆盖两处
const gateFiles = readdirSync('scripts/audit/gates').filter((f) => f.endsWith('.mjs')).sort();
const gateSrc = Object.fromEntries(gateFiles.map((f) => [f, readFileSync(`scripts/audit/gates/${f}`, 'utf8')]));
const auditSrc = [readFileSync('scripts/audit.mjs', 'utf8'), ...Object.values(gateSrc)].join('\n');
// **以注册表为权威声明**（此前用正则扫 arg('x')——新门若只写 flags:['state'] 就会被误判成幻影门）
const registry = await import('./audit/registry.mjs');
// `#607` P1：**故事侧声明的门**（`stories/<slug>/gates/**`）同样是门——枚举与「自证/判定路径」检测都要覆盖它们，
// 否则门一搬走，台账里那几行会**静默消失**（形态检测也读不到源码 ⇒ 误判）。
const { declaredGatesAll } = await import('./audit/discovery.mjs');
const declaredMods = await declaredGatesAll();
const storyGateSrc = Object.fromEntries(declaredMods.map((m) => [m.file, readFileSync(m.file, 'utf8')]));
/** 门的源码：工具层按文件名取，故事侧按路径取。 */
const srcOf = (file) => (file.startsWith('scripts/audit/gates/') ? gateSrc[file.replace('scripts/audit/gates/', '')] : storyGateSrc[file]);
const gateMods = [];
for (const f of gateFiles) gateMods.push({ file: `scripts/audit/gates/${f}`, mod: await import(`./audit/gates/${f}`) });
for (const m of declaredMods) gateMods.push({ file: m.file, mod: m });
const auditFlags = [...new Set([...registry.GATES, ...declaredMods].flatMap((g) => g.flags ?? []))].filter((f) => !MODIFIERS.includes(f)).sort();
const moduleOfFlag = (flag) => gateMods.find((g) => (g.mod.flags ?? []).includes(flag));

// 每个 audit 开关的「自证」：其**门模块**里是否含「自证」字样（本仓既有形态）。
// #316 第 2 步后门已独立成文件 → 直接看该门所属模块。
// 形态（报告/判定）不应只手写——**从源码派生「有没有判定路径」**，
// 再与台账声明对账：声明「仅登记」但门里已有判定（bad++/✗/exit(1)/failures.push）＝形态升级未同步 → 红。
const ASSERT_PAT = /bad\s*\+\+|\(\+\+bad\)|✗|process\.exit\(1\)|failures\.push\(|problems\.push\(/;
const gateHasAssert = (flag) => {
	const g = moduleOfFlag(flag);
	return g ? ASSERT_PAT.test(srcOf(g.file)) : false;
};

const auditSelfProof = (flag) => {
	const g = moduleOfFlag(flag);
	// 收紧（#247 F2 工作清单）：只认**打印约定** `自证·<label>：检出 N（期望 M）`——
	// 裸「自证」二字一句注释就能满足（本仓吃过这类文本启发式的亏），而 `自证·` 只有在夹具真跑时才打得出来。
	return g ? /自证·/.test(srcOf(g.file)) : false;
};

const reportScripts = readdirSync('scripts').filter((f) => f.startsWith('report-') && f.endsWith('.mjs')).sort();
const testFiles = readdirSync('test').filter((f) => f.endsWith('.mjs') && !['boot.mjs', 'harness.mjs', 'invariants.mjs'].includes(f)).sort();

/** `#908` ②：**形态**的判定（纯函数 ✓ ⇒ 自证段能驱动它 ✓）。
 *  ⚠️ **修掉一处自相矛盾** ✗（本票实测 ✓）：旧写法对 `kind === '测试脚本'` **无条件**给 `'行为化'` ✗
 *  ⇒ `#899` ③ 把「自证」列收紧后，`test/**` 里那三行（`自证 = —` ✓）被标成 `行为化` ✓、**却进不了「缺自证」工作清单** ✗
 *  ⇒ 生成物**自己的标题行写「有断言但缺自证：0」** ✗、而表里明明有三行 `—` ✗（正是本列“让缺自证的看得见”的反面 ✗）。
 *  正形 ✓：测试脚本**不再特殊** ✓ —— 有自证才 `行为化` ✓，没自证就落 `行为化（缺自证）`✓（与其它 kind 同口径 ✓）。 */
//   ⚠️ `#924` 复核留（非阻塞 ✓）：旧写法两臂**逐字相同** ✗ ⇒ `kind` 已不影响结果 ✓ ⇒ 化简掉它 ✓
//   （留着死三元 ⇒ 下一个改一行的人会以为两臂不同 ✗ ⇒ 改了等于没改 ✗ —— 与「声称 vs 实际」同族 ✓）。
export const formOf = ({ selfProof = false, form } = {}) => form ?? (selfProof ? '行为化' : '行为化（缺自证）');

/** `#908` ①：**探针**那一格（**直接读数** ✓，不是"文件在不在"那种代理 ✗）。
 *
 * 三态 ✓：`✅`（有探针件 ✓ **且**最近一次实跑**咬住** ✓ **且**被测件**没改过** ✓）／`—`（未探 ✓）／`✗`（探针**不咬** ⇒ 红 ✓）。
 * 新鲜度是这条读数的命门 ✗：记录里存 `targetSha` ✓ ⇒ 被测件一改，`✅` 自动回落成 `—` ✓（拿旧读数充数 ⇒ 红 ✓）。
 * **上限只许收缩** ✓：`scripts/probe-budget.json` 里 `maxUnprobed` 是 `—` 的**上限** ✓ ⇒ 加了新门却没探 ⇒ 突破上限 ⇒ 红 ✓
 *   （要放宽就得改那个数字 ✓ —— 改它是一次**显式决定**，不是顺手 ✓ —— 与本仓 `escape-hatch.json` 同族 ✓）。 */
export const probeStateOf = ({ entry, record, targetSha, sha = (x) => x } = {}) => {
	if (!entry) return '—';
	if (!record) return '—';
	if (record.ok !== true) return '✗';
	if (record.targetSha && targetSha && record.targetSha !== sha(targetSha)) return '—';   // 被测件改过 ⇒ 旧读数作废 ✓
	return '✅';
};

const PROBE_RECORD = 'build/probe-results.json';
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const probeRecords = () => {
	try { return JSON.parse(readFileSync(PROBE_RECORD, 'utf8')).probes ?? []; } catch { return []; }
};

const recs = probeRecords();   // `#908` ①：上一次探针实跑的读数 ✓（没有就是空 ⇒ 全列 `—` ✓ 不假装 ✓）

const rows = [];
const push = (id, kind, wired, selfProof, extra = {}) => {
	const r = REASONS[id] ?? {};
	// 形态三态（永远可归类，不留「未标注」）：
	//   行为化        ＝有自证（反例真会红）
	//   行为化（缺自证）＝**有断言但从未证明咬得住** → F2 的**工作清单**（不是违规，是待补）
	//   仅登记        ＝只出报告不做断言（必须写理由）
	const form = formOf({ kind, selfProof, form: r.form });
	rows.push({
		id, kind,
		// `#908` ①：探针状态（直接读数 ✓）—— 记录在 `build/probe-results.json` ✓（不入仓 ✗）
		probe: (() => {
			const entry = PROBES.find((p) => p.id === id);
			const rec = recs.find((x) => x.id === id);
			let cur = null;
			try { cur = entry?.mutation?.file ? readFileSync(entry.mutation.file, 'utf8') : null; } catch { cur = null; }
			return probeStateOf({ entry, record: rec, targetSha: cur, sha: sha16 });
		})(),
		wired: wired ?? r.wired ?? false,
		selfProof: selfProof ?? false,
		form,
		reason: r.reason ?? '',
		...extra,
	});
};

/** `#899` ③：`test/**` 那一格的**自证**判定（**先剥注释**再匹配 ✓）。
 *
 * 旧口径 ✗：`/负例|反例|selftest/.test(原文)` —— **纯措辞**：注释里写一句就能冒充自证（实测：75 个文件里 **4 个**的
 *  ✅ 完全靠注释撑着 ✗：`fatal-guard` · `invariants` · `notes-write` · `pc-defaults`）。
 * 新口径 ✓：同一把刀剥注释（`editor/lib/core/mask.mjs` 的 `maskComments` ✓）后再匹配 ⇒
 *   ① 注释里的提及**不算**（本仓老纪律：`#459`／`#580` 同族 ✓）；
 *   ② 判定做成**纯函数** ⇒ 能被 `--selftest` 驱动 ⇒ 这一格**能假** ✗（旧口径没有能假的另一半 ✓）。
 *
 * ⚠️ **已知边界（写清楚，不假装它是全的 ✗）**：字符串**仍算**（`t('🔴 反例：…')` 的**标签**照旧计入 ✓）——
 *   本函数量的是"**信号出现在代码/字符串面**"，**不是**"断言真会红"✗（后者要逐文件变异 ⇒ 不在本片 ✓）。
 *   ⇒ 这一列**只能说它真正比过的东西** ✓；更强的证据得走探针（另票 ✓）。
 * **量法（可粘贴复跑 ✓）**：`node scripts/report-gate-ledger.mjs --selftest`（四条正反例 ✓）＋ `--update` 看那一列的变化 ✓。 */
export const hasSelfProof = (src) => /负例|反例|selftest/.test(maskComments(String(src ?? ''), { file: 'ledger', twee: false }));

/** `#1019` ④ ✓：自证列**从"关键词代理"升级为"**要求接线 + 读到执行**"** ✗。
 *
 * 洞（实测 ✓）：`test/repo-shape.mjs` 那类件**写了 `--selftest` 且实现了** ✓，但 `test-plan.mjs` 里**只登记了正跑**、
 * `--selftest` **零调用点** ✗ ⇒ 旧口径（只看关键词）照样标 `✅` ⇒ **自证在 CI 里从未真跑过**却看上去有。
 *
 * 新口径两条**都得满足** ✓：
 *   ① **实现**：件里确实有"反例/负例/selftest"的**代码/字符串面**信号（剥注释 ✓ —— 保留旧口径的能假那半 ✓）；
 *   ② **接线**：`test-plan.mjs` 里存在一个段，其 `cmd` 真跑 `test/<f> --selftest`（**逐字匹配命令** ✓，
 *      不是"有个名字像的 id"✗）⇒ 即"**该自证真的在链上会跑**" ✓。
 *
 * ⚠️ **做到哪一步要写清** ✗：本函数验的是「**接线**」（静态、确定、可机判 ✓），它**不验**"最近一次实跑 rc=0" ——
 *   那需要**跑器落读数文件**（现无此产物 ✓；且落地要考虑它对 `--check` 在干净树上确定性的影响 ⇒ 另议 ✓）。
 *   ⇒ 这一格**只说它真正比过的东西**（本仓老口径 ✓）。
 *
 * **量法（可粘贴复跑 ✓）**：`node scripts/report-gate-ledger.mjs --selftest`（含本函数正反例 ✓）
 *   ＋ 把某件的 `-selftest` 段从 `test-plan.mjs` 拿掉 ⇒ 该行**当场从 `✅` 变 `—`** ✓（这就是它的能假那一半 ✓）。 */
export const selfProofWired = (file, src, { plan = testPlan() } = {}) => {
	if (!hasSelfProof(src)) return false;                       // ① 实现面（剥注释后确有"反例/负例/selftest"的信号 ✓）
	const code = maskComments(String(src ?? ''), { file, twee: false });
	// ② **只对"暴露了 `--selftest` 入口"的件**追加接线要求 ✗ ——
	//   ⚠️ 否则**过严**：多数件把负控制**写在主跑里**（顶层 `t('🔴 反例：…')` ✓ 由主段执行 ⇒ 自证**确实在跑** ✓），
	//   要求它们也单独接一个 `--selftest` 段 ＝ 逼人加空壳 ✗（实测：一刀切会把 21 行从 ✅ 打成 `—`，
	//   行为化率 69.8% ⇒ 43.8% ✓ —— 那是**量法错**，不是真相 ✓）。
	//   ⇒ 真正要守的那一格是 `#1018` 的形状：**件里实现了 `--selftest` 却没接线** ⇒ 那句"自证"在 CI 里从未跑过 ✗。
	if (!/--selftest/.test(code)) return true;                  // 无 selftest 入口 ⇒ 无接线可要求 ✓
	return plan.some((seg) => typeof seg?.cmd === 'string' && seg.cmd.includes(`test/${file} --selftest`));
};

for (const f of auditFlags) push(`audit:${f}`, 'audit 开关', testChain.includes(`scripts/audit.mjs --${f} --check`), auditSelfProof(f), { hasAssert: gateHasAssert(f) });
for (const f of reportScripts) push(`scripts/${f}`, '报告脚本', testChain.includes(`scripts/${f}`), readFileSync(`scripts/${f}`, 'utf8').includes('--selftest'));
for (const f of testFiles) push(`test/${f}`, '测试脚本', testChain.includes(`test/${f}`), selfProofWired(f, readFileSync(`test/${f}`, 'utf8')));

// ── 判定 ─────────────────────────────────────────────────────────────
// 链上出现的 audit 开关（用于「幻影门」反向查：链里跑了但 audit 里没有 = 手打字面量漂移/已删除）
// 修饰符：**自身不是门**（`check` 是退出码开关；`story <slug>`／`engine-only` 是作用域/选择面）
// —— 不过滤掉的话，形如 `audit.mjs --check --story …` 的段会被判成"幻影门 check"（本仓 #460 的实测）
export const CHAIN_MODIFIERS = ['check', 'strict', 'story', 'engine-only'];
export const chainFlags = (testChain) => [...new Set([...testChain.matchAll(/audit\.mjs --([a-z0-9-]+)/g)].map((m) => m[1]))].filter((f) => !CHAIN_MODIFIERS.includes(f));

export const problems = (rows, declared = null, chain = []) => {
	const out = [];
	if (declared) {
		// 幻影门：链上有、audit 声明里没有
		const ghosts = chain.filter((f) => !declared.includes(f));
		if (ghosts.length) out.push({ id: '(链)', code: 'phantom-flag', msg: `链上跑了 audit 未声明的开关（幻影门）：${ghosts.join(', ')}——多半是改 flag 名后漏改链` });
	}
	for (const r of rows) {
		if ((!r.wired || r.form === '仅登记') && !r.reason) {
			out.push({ id: r.id, code: 'missing-reason', msg: `${r.form === '仅登记' ? '仅登记' : '未接线'}但没写理由` });
		}
		// 形态对账（建议③）：声明「仅登记」但门里有判定路径 → 升级未同步
		if (r.hasAssert === true && r.form === '仅登记') {
			out.push({ id: r.id, code: 'form-drift', msg: '台账标「仅登记」，但门里已有判定路径（bad++/✗/exit(1)/failures.push）——形态升级未同步，请改标并复核理由' });
		}
		// 反向：门里没有任何判定、也没声明「仅登记」→ 它不是门
		if (r.hasAssert === false && r.form !== '仅登记') {
			out.push({ id: r.id, code: 'assertless-gate', msg: '门里没有任何判定路径，但台账未标「仅登记」——它其实是纯报告' });
		}
	}
	return out;
};

const summary = (rows) => {
	const beh = rows.filter((r) => r.form === '行为化' && r.selfProof).length;
	const assertOnly = rows.filter((r) => r.form === '行为化（缺自证）').length;
	const reg = rows.filter((r) => r.form === '仅登记').length;
	// `#908` ①：探针三态计数 ✓（`✅` 是**直接读数** ✓ ⇒ 它不许由"清单里有没有这一条"推出来 ✗）
	const probeOk = rows.filter((r) => r.probe === '✅').length;
	const probeNone = rows.filter((r) => r.probe === '—').length;
	const probeBad = rows.filter((r) => r.probe === '✗').length;
	let cap = 0;
	try { cap = JSON.parse(readFileSync('scripts/probe-budget.json', 'utf8')).maxUnprobed ?? 0; } catch { cap = -1; }
	return { total: rows.length, behavioral: beh, assertOnly, registry: reg, rate: +(beh / rows.length * 100).toFixed(1), probeOk, probeNone, probeBad, probeCap: cap < 0 ? '缺件 ✗' : cap };
};

const markdown = (rows) => {
	const s = summary(rows);
	// `#908` ②：**「自证」列的图例**（口径 ＋ 量法 ＋ 已知边界 ✓）—— 用单引号数组组装 ✓（**不写进模板字面量** ✗：内层反引号会截断外层模板 ✓ —— 同一族今晚刚栽过一次 ✓）。
const LEGEND = [
	'> **「自证」这一列量的是什么（口径 ＋ 量法 ＋ 已知边界 ✗）** —— 免得把 `✅` 读成“断言真会红” ✗：',
	'> · 量的是「**信号出现在代码/字符串面**」✓：先用**全仓唯一遮蔽器**剥注释（`editor/lib/core/mask.mjs` ✓）⇒ **注释里写不算** ✗；',
	'> · **字符串里的标签算** ✓（`t(\'🔴 反例：…\')` ✓）⇒ 它 **≠** “断言真会红”✗ ⇒ 更强的证据要**探针**（票 `#908` ① ✓）；',
	'> · **量法（可粘贴复跑 ✓）**：`node scripts/report-gate-ledger.mjs --selftest`（含 4 条 `hasSelfProof` 正反例 ✓）；',
	'> · **缺自证的几行**（`—` ✓）：补一条**能假的负控制** ✓，或按 `#908` ① 登记探针 ✓ —— 名单见下方「工作清单」（**动态生成** ✗，不写死 ✓）。',
].join('\n');

const head = `# 门的行为化率台账（F2）

> **由 \`scripts/report-gate-ledger.mjs\` 生成**（\`npm run report:gates:update\`）——**不要手改**：\`npm run report:gates:check\` 会校验「文件与实况一致」，漂移即红（与 F6 同源纪律）。
>
> 判据（#247 F2）：常设机检分三种形态——
> **行为化**＝有**正例＋反例自证**（反例真会红）；**仅登记**＝只出报告、不做断言；**人工走查**＝需人判断。
> 纪律：**仅登记 / 未接线必须写明理由**（理由写在脚本的 \`REASONS\` 里，与代码同处一处评审）。
> 为什么要有这张表：本仓当日集齐四类「空判」——覆盖≠验收 / **反例空判** / **死开关**（#331）/ **原理不可达断言**（#338）。
> 台账的首要用途不是统计，而是**让「没有自证的门」在表上看得见**。
>
${LEGEND}

**严格行为化率（有自证）：${s.behavioral}/${s.total} = ${s.rate}%** ｜ **有断言但缺自证：${s.assertOnly}**（＝下方工作清单）｜ 仅登记：${s.registry}
**探针（直接读数 ✓，不是\"文件在不在\"那种代理 ✗）：\`✅\` ${s.probeOk} 项 ｜ \`—\` 未探 ${s.probeNone} 项（**上限 ${s.probeCap}** ✓ 超过即红 ✗；**调高它**是一次显式手改 ⇒ 靠评审拦 ✗，机器拦不住“手改上限”本身 ✓ —— 边界记在票 #908 内 ✗）｜ \`✗\` 不咬 ${s.probeBad} 项（**>0 即红** ✓）** —— 档位／清单：\`node scripts/probe-gates.mjs --probe=fast\` ✓（⑲：本轮覆盖到哪一档写在这行里 ✓）

| 门 | 类型 | 形态 | 自证 | **探针** | 接线（npm test） | 理由（仅登记/未接线必填） |
|---|---|---|---|---|---|
`;
	const body = rows.map((r) => `| \`${r.id}\` | ${r.kind} | ${r.form} | ${r.selfProof ? '✅' : '—'} | ${r.probe} | ${r.wired ? '✅' : '—'} | ${r.reason || ''} |`).join('\n');
	const debt = rows.filter((r) => r.form === '行为化（缺自证）');
	const debtSec = debt.length
		? `\n## F2 工作清单：有断言但**缺自证**（${debt.length} 项）\n\n> 这些门**在跑、也在断言**，但从没被证明「反例会红」——本仓当日四类空判（覆盖≠验收／反例空判／死开关 #331／原理不可达 #338）都出自这一类。\n> 补法：给该门加一个**合成反例**用例（正例＋反例），并在本脚本的 \`REASONS\` 里改标 \`行为化\`。\n\n`
			+ debt.map((r) => `- \`${r.id}\`（${r.kind}）`).join('\n') + '\n'
		: '';
	return `${head}${body}\n${debtSec}`;
};

// ── 自证 ─────────────────────────────────────────────────────────────
const selftest = () => {
	// `#899` ③：这一格的**取数**也能是假的 ✗ —— 先把「自证」判定本身拿出来量（注释里写算不算 ✓）
	let hbad = 0;
	const h = (label, ok) => { if (!ok) hbad++; console.log(`${ok ? '✓' : '✗'} ${label}`); };
	h('`hasSelfProof`：正文里写「反例」⇒ true ✓', hasSelfProof('t("反例：坏输入 ⇒ 必红", () => 1)') === true);
	h('`hasSelfProof`：**只在注释里**写「反例/selftest」⇒ false ✗（旧口径在这里会误判 ✅ ✗）', hasSelfProof('// 本文件有 selftest 与反例\nconsole.log("hi");\n') === false);
	h('`hasSelfProof`：只在块注释里写 ⇒ 同样 false ✗', hasSelfProof('/* selftest */\nconst x = 1;\n') === false);
	h('`hasSelfProof`：什么都没写 ⇒ false ✓（能假的另一半 ✓）', hasSelfProof('const x = 1;\n') === false);
	// `#1019` ④：**接线面**（新口径）—— 两格成对 ✗：写了实现 ＋ **已接线** ⇒ true；写了实现但**未接线** ⇒ false。
	h('`selfProofWired`：**无 `--selftest` 入口**（负控制写在主跑里）⇒ 不看接线，true ✓',
		selfProofWired('x.mjs', 't("🔴 反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs' }] }) === true);
	h('`selfProofWired`：**有 `--selftest` 入口 ＋ 已接线** ⇒ true ✓',
		selfProofWired('x.mjs', 'if (process.argv.includes("--selftest")) {} t("反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs --selftest' }] }) === true);
	h('🔴 `selfProofWired`：**有 `--selftest` 入口但未接线** ⇒ false ✓（`#1018` 那个形状 ✓）',
		selfProofWired('x.mjs', 'if (process.argv.includes("--selftest")) {} t("反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs' }] }) === false);
	h('`selfProofWired`：没实现 ⇒ false ✓（能假的另一半 ✓）',
		selfProofWired('x.mjs', 'const a = 1;', { plan: [{ cmd: 'node test/x.mjs --selftest' }] }) === false);
	// `#908` ②：**形态**判定（纯函数 ✓）—— 修掉的正是"测试脚本无条件算行为化"那一处自相矛盾 ✗
	h('`formOf`：测试脚本 ＋ **无自证** ⇒ \`行为化（缺自证）\` ✓（旧写法会误标 `行为化` ✗ ⇒ 进不了工作清单 ✗）', formOf({ kind: '测试脚本', selfProof: false }) === '行为化（缺自证）');
	h('`formOf`：测试脚本 ＋ **有自证** ⇒ `行为化` ✓（能假的另一半 ✓）', formOf({ kind: '测试脚本', selfProof: true }) === '行为化');
	h('`formOf`：显式给了 `form` ⇒ 以它为准 ✓（`REASONS` 里的手写标注不被覆盖 ✓）', formOf({ kind: '测试脚本', selfProof: false, form: '仅登记' }) === '仅登记');
	// `#908` ①：**探针**那一格（直接读数 ✓）—— 五条，每条都对应一种"假 ✅" ✗
	h('`probeStateOf`：无探针件 ⇒ `—` ✓', probeStateOf({}) === '—');
	h('`probeStateOf`：有探针件但**从没跑过** ⇒ `—` ✗（不假装 ✅ ✓）', probeStateOf({ entry: { id: 'x' }, record: null }) === '—');
	h('`probeStateOf`：跑了但**不咬** ⇒ `✗` ✓（>0 即红 ✓）', probeStateOf({ entry: { id: 'x' }, record: { ok: false } }) === '✗');
	h('`probeStateOf`：咬住 ＋ 被测件**没改** ⇒ `✅` ✓', probeStateOf({ entry: { id: 'x' }, record: { ok: true, targetSha: 'aa' }, targetSha: 'now', sha: () => 'aa' }) === '✅');
	h('`probeStateOf`：咬住但**被测件改过** ⇒ 回落 `—` ✗（禁拿旧读数充数 ✓）', probeStateOf({ entry: { id: 'x' }, record: { ok: true, targetSha: 'aa' }, targetSha: 'now', sha: () => 'bb' }) === '—');
	if (hbad) { console.error(`\n✗ 「自证」判定的读数不成立（${hbad} 项）`); process.exit(1); }
	const cases = [
		['仅登记无理由 → 必须报', [{ id: 'x', kind: 'k', wired: true, selfProof: false, form: '仅登记', reason: '' }], 1],
		['未接线无理由 → 必须报', [{ id: 'x', kind: 'k', wired: false, selfProof: true, form: '行为化', reason: '' }], 1],
		['合规行 → 不得报', [{ id: 'x', kind: 'k', wired: true, selfProof: true, form: '行为化', reason: '' }], 0],
		['仅登记但写了理由 → 不得报', [{ id: 'x', kind: 'k', wired: true, selfProof: false, form: '仅登记', reason: '人读报表' }], 0],
		['幻影门（链上有、audit 无）→ 必须报', [{ id: 'a', kind: 'k', wired: true, selfProof: true, form: '行为化', reason: '' }], 1, ['a']],
		['标仅登记但门里有判定 → 必须报（形态升级未同步）', [{ id: 'x', kind: 'k', wired: true, selfProof: false, form: '仅登记', reason: '旧理由', hasAssert: true }], 1],
		['门里无判定却没标仅登记 → 必须报', [{ id: 'x', kind: 'k', wired: true, selfProof: false, form: '行为化', reason: '', hasAssert: false }], 1],
	];
	let bad = 0;
	for (const [name, input, want, decl] of cases) {
		const got = problems(input, decl ?? null, decl ? ['b'] : []).length;
		const ok = got === want;
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${name}（命中 ${got}，期望 ${want}）`);
	}
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：仅登记无理由红 / 未接线无理由红 / 合规绿 / 有理由的仅登记绿 ＋ `hasSelfProof` 四条正反例（注释不算 ✓）＋ `#1019` **接线面**四条正反例 ✓');
};

export const rowIds = rows.map((r) => r.id);

// ⚠️ **import 门** ✓：本文件被别处 `import` 时**不得跑主路径** ✗（主路径结尾 `process.exit` ✗ ⇒ 会把调用方一起带走 ✓；
// 探针运行器要读 `rowIds` ✓ —— 第一版就是这么静默失败的 ✓：结构校验拿不到行 id ⇒ 退化成"只做清单自校验"✗）。
const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
const main = () => {
	const argv = process.argv.slice(2);
	if (argv.includes('--selftest')) { selftest(); process.exit(0); }

	const md = markdown(rows);
	const s = summary(rows);
	const probs = problems(rows, auditFlags, chainFlags(testChain));
	// 幻影门（反向查）：跑器没被 npm test 调用 → 表里的「已接线」全是假的
	if (!RUNNER_RE.test(testEntry)) {
		probs.push({ id: 'package.json:test', code: 'phantom-runner', msg: `npm test 没有调用 scripts/run-tests.mjs（当前：${testEntry.slice(0, 80)}）——计划与 CI 实况脱钩，本台账的「已接线」列全部不可信` });
	}

	// `#908` ①：探针那一格的**两条不变量** ✓ —— 刻意**不是**"有多少条探针"这种只增不读的统计 ✗
	if (s.probeBad > 0) {
	const why = rows.filter((r) => r.probe === '✗').map((r) => `【${r.id}】${(recs.find((x) => x.id === r.id)?.reason ?? '记录缺失').slice(0, 70)}`).join(' ｜ ');
	probs.push({ id: 'scripts/probe-gates.mjs', code: 'probe-not-biting', msg: `有 ${s.probeBad} 行的探针**不咬**（✗ ✓ ⇒ 必须当红处理 ✓，"跑了多少条"不算读数 ✗）：${why}` });
}
	if (s.probeCap === '缺件 ✗') probs.push({ id: 'scripts/probe-budget.json', code: 'probe-budget-missing', msg: '缺 `scripts/probe-budget.json` ✗ —— 没有上限，覆盖率就能悄悄下降 ✓' });
	else if (s.probeNone > s.probeCap) probs.push({ id: 'scripts/probe-budget.json', code: 'probe-coverage-drop', msg: `未探（\`—\`）的行数 ${s.probeNone} > 上限 ${s.probeCap} ⇒ 覆盖率**下降**了 ✗（加新门就得补探针 ✓；真要放宽上限，改那个数字是一次**显式决定** ✓）` });

	if (argv.includes('--update')) {
		writeFileSync(LEDGER, md);
		console.log(`✔ 台账已生成 ${LEDGER}（${s.total} 项 · 行为化率 ${s.rate}%）`);
		process.exit(0);
	}

	let bad = probs.length;
	if (existsSync(LEDGER)) {
		if (readFileSync(LEDGER, 'utf8') !== md) { console.error('✗ 台账与实况不一致（新增/改名了门但没重新生成）→ 跑 npm run report:gates:update'); bad++; }
	} else { console.error('✗ 台账文件不存在 → 跑 npm run report:gates:update'); bad++; }

	const wiredAudit = rows.filter((r) => r.kind === 'audit 开关' && r.wired).length;
	const chain = chainFlags(testChain);
	console.log(`══ F2 门的行为化率 ══  ${s.total} 项 · 行为化 ${s.behavioral} · 仅登记 ${s.registry} · **行为化率 ${s.rate}%**`);
	console.log(`   集合差：audit 声明 ${auditFlags.length} 门｜链中跑 ${chain.length} 门（已接线 ${wiredAudit}）｜仅登记 ${s.registry}｜未接线 ${rows.filter((r) => !r.wired).length}`);
	for (const p of probs) console.error(`   ✗ [${p.code}] ${p.id}：${p.msg}`);
	if (bad) { console.error(`\n✗ F2 台账未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 台账与实况一致，且所有「仅登记/未接线」项都写明了理由');
};

if (isMain) main();
