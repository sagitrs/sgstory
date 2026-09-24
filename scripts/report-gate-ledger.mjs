// #247 F2「门的行为化率」台账（生成 + 自检）
//
// 背景：本仓常年有几十个常设机检。它们的**风险不是漏测，而是空判**——门在跑、输出很绿，
// 但断言其实咬不住任何东西（本日实际集齐四类：覆盖≠验收 / 反例空判 / 死开关 #331 /
// 原理不可达断言 #338）。F2 的判据就是给每个门标出：
// 形态（行为化 / 仅登记 / 人工走查）· 是否有**自证**（反例真会红）· 是否**接线**（在 npm test 里）
// 并要求：**仅登记 / 未接线必须写明理由**，否则本门报红。
//
// 台账本身也要防腐：`docs/gate-ledger.md` 由本脚本 **生成**（--update），`--check` 校验
//「文件与实况一致」＋「无理由的仅登记/未接线」——文档漂移＝红（与 F6 同源纪律）。
//
// 用法：
// node scripts/report-gate-ledger.mjs # 打印台账 + 一致性检查
// node scripts/report-gate-ledger.mjs --update # 重新生成 docs/gate-ledger.md
// node scripts/report-gate-ledger.mjs --selftest # 自证（合成输入，验判定会咬）
//
// 退出码（`#1242` ① 起细分）：
// 0 = 判得了，且一致
// 1 = 判得了，但**不一致**（报文点名首个不同行号／列／两侧值）
// 2 = **判不了**（探针读数不足：整体缺失／陈旧／不覆盖本档）——**不是失败，是判不了**；
// 报文列明缺哪一类，并声明「本次不作结构判定」；显式 `--allow-stale-probe` 时走既有降级

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { planChain, testPlan, tierOf, FULL_REASONS } from './test-plan.mjs';
import { maskComments } from '../editor/lib/core/mask.mjs';   // `#899` ③：**同一把刀**（全仓唯一遮蔽器 —— 不新增第二份）
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PROBES } from './probes.mjs';
// `#1261` 甲（台账侧）：**临时下架**的段/探针在台账里**单列**，既不报「未接线但没写理由」，
// 也不算「未探」—— 它们是「对象在、样本暂缺」的可见状态（各带 why/until）。
import { SUSPENDED } from './test-plan.mjs';   // `#908` ①：探针清单（**直接读数** —— 与「自证」那一格的**代理**分家）

const LEDGER = 'docs/gate-ledger.md';
const PKG = 'package.json';

// ── 仅登记 / 未接线的理由（必须逐条写明；新增未写理由的项 → 本门红）──────────
//「仅登记」＝只出报告、不做断言（允许，但必须说明为什么不设为门）；
//「未接线」＝不在 npm test 链里（允许，但必须说明谁来跑、何时跑）。
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
	// `#1056`（**假阳性那一格**）：本件的 `--selftest` **不是入口** —— 它是**真断言的载荷**
	//（`cli(['--selftest'])` 在测壳的旗标面）→ 裸调与 `--selftest` 输出**逐字节相同**。
	// 处置＝**不接也不删**（`#1031` 的口径）：硬接一个无意义旗标 ＝ 为凑绿而接线；删那个字符串 ＝ 拆真断言。
	//注意：本件**已接**在 `test-plan` 里（裸调段 ＋ `test-story-ci-mjs-selftest` 段跑的是**同一件事** ——
	// 那是 `#1031` 留的**成对登记形状**，非本片新增）；`selftestDispatched` 修掉后这一行
	// **不再被要求接线** → 台账里它是「行为化 ✅」。
	'test/story-ci.mjs': { wired: true, form: '行为化', reason: '**自证的归位（`#1056`）**：本件的 `--selftest` **不是入口** ✗ —— 它是**真断言的载荷**（`cli([\'--selftest\'])` 测壳的旗标面 ✓）⇒ 裸调与 `--selftest` 输出逐字节相同 ✓。⇒ **不接也不删**（`#1031` 口径 ✓）：硬接无意义旗标 ＝ 为凑绿而接线 ✗、删字符串 ＝ 拆真断言 ✗。真断言面由**裸调段**（`test-story-ci-mjs`）执行 ✓ —— `test-plan` 里那个 `-selftest` id 跑的就是裸调 ✓。' },
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
// 否则门一搬走，台账里那几行会**静默消失**（形态检测也读不到源码 → 误判）。
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
// 再与台账声明对账：声明「仅登记」但门里已有判定（bad++/ /exit(1)/failures.push）＝形态升级未同步 → 红。
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

/** `#908` ②：**形态**的判定（纯函数 → 自证段能驱动它）。
 *注意：**修掉一处自相矛盾**（本票实测）：旧写法对 `kind === '测试脚本'` **无条件**给 `'行为化'`
 * → `#899` ③ 把「自证」列收紧后，`test/**` 里那三行（`自证 = —`）被标成 `行为化`、**却进不了「缺自证」工作清单**
 * → 生成物**自己的标题行写「有断言但缺自证：0」**、而表里明明有三行 `—`（正是本列“让缺自证的看得见”的反面）。
 * 正形：测试脚本**不再特殊** —— 有自证才 `行为化`，没自证就落 `行为化（缺自证）`（与其它 kind 同口径）。 */
//注意：`#924` 复核留（非阻塞）：旧写法两臂**逐字相同** → `kind` 已不影响结果 → 化简掉它
//（留着死三元 → 下一个改一行的人会以为两臂不同 → 改了等于没改 —— 与「声称 vs 实际」同族）。
export const formOf = ({ selfProof = false, form } = {}) => form ?? (selfProof ? '行为化' : '行为化（缺自证）');

/** `#908` ①：**探针**那一格（**直接读数**，不是"文件在不在"那种代理）。
 *
 * 三态：`✅`（有探针件 **且**最近一次实跑**咬住** **且**被测件**没改过**）／`—`（未探）／` `（探针**不咬** → 红）。
 * 新鲜度是这条读数的命门：记录里存 `targetSha` → 被测件一改，`✅` 自动回落成 `—`（拿旧读数充数 → 红）。
 * **上限只许收缩**：`scripts/probe-budget.json` 里 `maxUnprobed` 是 `—` 的**上限** → 加了新门却没探 → 突破上限 → 红
 *（要放宽就得改那个数字 —— 改它是一次**显式决定**，不是顺手 —— 与本仓 `escape-hatch.json` 同族）。 */
/** `#1097`：**这份读数是否可信地覆盖当前树**（纯函数 注入 → 可单测）。
 *
 * 从实测来：**同一棵树、同一命令，只差一个陈旧本地产物 → 结论相反**
 * 原本抹平只在「**无读数**」时生效 → **有但陈旧**（③态）没识别 → 严格比对 → **假红**。
 * 三态：① 无读数（PR 档常态）→ 抹平（`#1079` 修的正是它）；② 新鲜且覆盖 → 严格；
 * ③ **有但陈旧／不覆盖** → 本函数认出它。
 * ##注意：「缺件」那一支**按记录自称的档位定范围**
 * `fast` 记录**只要求 fast 档探针全覆盖** —— 否则将来加一条 `full` 档探针 →
 * 每台跑过 `fast` 的机器都会判「缺件 → 陈旧」→ **抹平整面探针列**，且**报错原因还是错的**。
 * ## 两种原因**必须分开报**：`stale`＝有读数但 `targetSha` 不符；`missing`＝本档应有的没记。
 * @returns {{stale: string[], missing: string[], required: number}}
 */
export const probeFreshnessProblems = ({ probes = [], records = [], mode = null, targetShaOf = () => null, sha = (x) => x } = {}) => {
	// 本档应覆盖哪些探针（`full` → 全集；其它 → 非 `full` 档的那些）
	const required = probes.filter((p) => (mode === 'full' ? true : p.tier !== 'full'));
	const stale = [], missing = [];
	for (const p of required) {
		const r = records.find((x) => x.id === p.id);
		if (!r) { missing.push(p.id); continue; }
		const cur = (() => { try { return targetShaOf(p); } catch { return null; } })();
		if (r.targetSha && cur && r.targetSha !== sha(cur)) stale.push(p.id);
	}
	return { stale, missing, required: required.length };
};

export const probeStateOf = ({ entry, record, targetSha, sha = (x) => x } = {}) => {
	if (!entry) return '—';
	if (!record) return '—';
	if (record.ok !== true) return '✗';
	if (record.targetSha && targetSha && record.targetSha !== sha(targetSha)) return '—';   // 被测件改过 → 旧读数作废
	return '✅';
};

const PROBE_RECORD = 'build/probe-results.json';
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const probeRecords = () => {
	try {
		const j = JSON.parse(readFileSync(PROBE_RECORD, 'utf8'));
		// `#1097`：**保留 `mode`** —— 原来只取 `probes` → 档位信息丢了 → 没法判「记录是否覆盖本档」
		return { mode: j?.mode ?? null, probes: j?.probes ?? [] };
	} catch { return { mode: null, probes: [] }; }
};

/** `#1079`：把**探针面**（唯一依赖 `build/probe-results.json` 的那两部分）从 markdown 里**抹平**。
 *
 * 为什么要它（实测）：台账 markdown 里的**探针列**与**探针计数行**随 `build/probe-results.json` 变，
 * 而那个文件是 **gitignored**且由 `scripts-probe-gates.mjs --probe=fast` 产出 → `#1070` 把探针段
 * 移出 PR 档后，**PR 上必定没有读数** → 生成的 markdown ≠ 入仓的 → **逐字节比对全红**
 *（而红因**只是**那一列，不是“台账真的陈旧” —— 实测：无读数时 ` ` 行**只有**这一条）。
 *
 * 口径（**只抹平探针面，其余面照旧严格**）：
 * · 抹的是：① 每行表格的第 5 格（探针列）② 摘要里的 `**探针（直接读数…` 那一行；
 * · **不抹**：任何别的格（形态／自证／接线／理由）、行集合（新增/删段）、工作清单
 * →「新增了门却没重生成台账」**照样红**（这才是这条比对的价值所在 不能一起丢掉）。
 *
 *注意：**边界（不夸大）**：本函数不解“探针面本身”的陈旧（无读数时那一面**本来就没值** → 由 full 档
 *（有读数）盯；这是 `#1070` 减负的**显式代价**，已在票面与 `FULL_REASONS` 写明）。 */
export const normalizeProbeFace = (md) => String(md ?? '')
	.split('\n')
	.map((l) => {
		// ① 摘要的探针计数行（整行抹平 —— 它含 ✅/—/ 三个计数）
		if (l.startsWith('**探针（直接读数')) return '**探针（直接读数 ✓…）：〔本次不参与比对（无读数 `--allow-stale-probe`）〕**';
		// ② 表格行的第 5 格＝探针列（其前四格 kind/form/selfProof 不含 `|` → 用定点正则而非切分）
		return l.replace(/^(\| `[^`]+` \| [^|]+ \| [^|]+ \| [^|]+ \| )[^|]+( \|)/, '$1〔探针〕$2');
	})
	.join('\n');

const { mode: recMode, probes: recs } = probeRecords();   // `#908` ①：上一次探针实跑的读数（没有就是空 → 全列 `—` 不假装；`#1097` 连 `mode` 一起取）

const rows = [];
const push = (id, kind, wired, selfProof, extra = {}) => {
	const r = REASONS[id] ?? {};
	// 形态三态（永远可归类，不留「未标注」）：
	// 行为化 ＝有自证（反例真会红）
	// 行为化（缺自证）＝**有断言但从未证明咬得住** → F2 的**工作清单**（不是违规，是待补）
	// 仅登记 ＝只出报告不做断言（必须写理由）
	const form = formOf({ kind, selfProof, form: r.form });
	rows.push({
		id, kind,
		// `#908` ①：探针状态（直接读数）—— 记录在 `build/probe-results.json`（不入仓）
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

/** `#899` ③：`test/**` 那一格的**自证**判定（**先剥注释**再匹配）。
 *
 * 旧口径：`/负例|反例|selftest/.test(原文)` —— **纯措辞**：注释里写一句就能冒充自证（实测：75 个文件里 **4 个**的
 * ✅ 完全靠注释撑着：`fatal-guard` · `invariants` · `notes-write` · `pc-defaults`）。
 * 新口径：同一把刀剥注释（`editor/lib/core/mask.mjs` 的 `maskComments`）后再匹配 →
 * ① 注释里的提及**不算**（本仓老纪律：`#459`／`#580` 同族）；
 * ② 判定做成**纯函数** → 能被 `--selftest` 驱动 → 这一格**能假**（旧口径没有能假的另一半）。
 *
 *注意：**已知边界（写清楚，不假装它是全的）**：字符串**仍算**（`t(' 反例：…')` 的**标签**照旧计入）——
 * 本函数量的是"**信号出现在代码/字符串面**"，**不是**"断言真会红"（后者要逐文件变异 → 不在本片）。
 * → 这一列**只能说它真正比过的东西**；更强的证据得走探针（另票）。
 * **量法（可粘贴复跑）**：`node scripts/report-gate-ledger.mjs --selftest`（四条正反例）＋ `--update` 看那一列的变化。 */
export const hasSelfProof = (src) => /负例|反例|selftest/.test(maskComments(String(src ?? ''), { file: 'ledger', twee: false }));

/** `#1056`：**入口**判定 —— 件里是否真有 `--selftest` 的**真派发**（而不是"提到了这个词"）。
 *
 * 洞（实测）：`test/story-ci.mjs` 里的 `--selftest` **只是一个真断言的载荷** ——
 * `cli(['--selftest'])` 在测**壳的旗标面** → 裸调与 `--selftest` **输出逐字节相同**，
 * 件内没有"看见 `--selftest` 就走另一条分支"这回事 —— 而**子串**判据（`/--selftest/`）
 * 把它当成"暴露了入口" → 再去要求"接线"→ 逼人加一个**无意义的旗标**（本仓禁的"为凑绿而接线"）。
 *
 * → 判据换成**两个条件的合取**：件里既**提到** `--selftest` **又**读了命令行（`process.argv`）。
 *注意：**合取，不是只看 `process.argv`**（实测踩过）：`test/integrity.mjs` 读了 argv（`process.argv[2]`）
 * 但**根本没有 `--selftest`** → 只看 argv 会把它的行为化率读数**错误地降级**（无入口却被要求接线）。
 * 本仓 37 个提到 `--selftest` 的件里**恰好 1 个**不符（`story-ci.mjs`）—— 实测可复跑：
 * `git ls-files test` ＋ 剥注释后同时判 `/--selftest/` 与 `/process\.argv/`。
 *
 *注意：**它是什么、不是什么**（不夸大）：这是一个**入口**的近似判据 ——
 * `process.argv` 出现只证明"件**读了**命令行"，**不证明**那句自证"真会红"（那要**探针**，见 `probeStateOf`），
 * 也不排除"读了 argv 但分支与 `--selftest` 无关"的写法。本票拒绝"输出是否不同"那种**代理**（要跑件、要 subprocess），
 * 取**能机判、清单量（37 件）可逐件复核**的较小口径 —— 边界写在这里，别读成"已证明派发"。
 *
 * **量法（可粘贴复跑）**：`node scripts/report-gate-ledger.mjs --selftest`（四条正反例）＋
 * 把某件的 `--selftest` 派发行**原样保留**、只删 `test-plan` 里的接线 → 该行仍变 `—`（"真未接线"照样抓得住）。 */
export const selftestDispatched = (src) => {
	const code = maskComments(String(src ?? ''), { file: 'ledger', twee: false });
	return /--selftest/.test(code) && /process\.argv/.test(code);
};

/** `#1019` ④：自证列**从"关键词代理"升级为"**要求接线 + 读到执行**"**。
 *
 * 洞（实测）：`test/repo-shape.mjs` 那类件**写了 `--selftest` 且实现了**，但 `test-plan.mjs` 里**只登记了正跑**、
 * `--selftest` **零调用点** → 旧口径（只看关键词）照样标 `✅` → **自证在 CI 里从未真跑过**却看上去有。
 *
 * 新口径两条**都得满足**：
 * ① **实现**：件里确实有"反例/负例/selftest"的**代码/字符串面**信号（剥注释 —— 保留旧口径的能假那半）；
 * ② **接线**：`test-plan.mjs` 里存在一个段，其 `cmd` 真跑 `test/<f> --selftest`（**逐字匹配命令**，
 * 不是"有个名字像的 id"）→ 即"**该自证真的在链上会跑**"。
 *
 *注意：**做到哪一步要写清**：本函数验的是「**接线**」（静态、确定、可机判），它**不验**"最近一次实跑 rc=0" ——
 * 那需要**跑器落读数文件**（现无此产物；且落地要考虑它对 `--check` 在干净树上确定性的影响 → 另议）。
 * → 这一格**只说它真正比过的东西**（本仓老口径）。
 *
 * **量法（可粘贴复跑）**：`node scripts/report-gate-ledger.mjs --selftest`（含本函数正反例）
 * ＋ 把某件的 `-selftest` 段从 `test-plan.mjs` 拿掉 → 该行**当场从 `✅` 变 `—`**（这就是它的能假那一半）。 */
export const selfProofWired = (file, src, { plan = testPlan() } = {}) => {
	if (!hasSelfProof(src)) return false;                       // ① 实现面（剥注释后确有"反例/负例/selftest"的信号）
	const code = maskComments(String(src ?? ''), { file, twee: false });
	// ② **只对"暴露了 `--selftest` 入口"的件**追加接线要求（`#1056`：入口 → 真派发，不是词出现）——
	//注意：否则**过严**：多数件把负控制**写在主跑里**（顶层 `t(' 反例：…')` 由主段执行 → 自证**确实在跑**），
	// 要求它们也单独接一个 `--selftest` 段 ＝ 逼人加空壳（实测：一刀切会把 21 行从 ✅ 打成 `—`，
	// 行为化率 69.8% → 43.8% —— 那是**量法错**，不是真相）。
	// → 真正要守的那一格是 `#1018` 的形状：**件里实现了 `--selftest` 却没接线** → 那句"自证"在 CI 里从未跑过。
	//注意：`#1056` 修正：上句的"**实现了**"要用 `selftestDispatched` 判（**真派发**）——
	// 子串口径会把 `test/story-ci.mjs`（`--selftest` 只是**真断言载荷**）误判成"有入口" → 假阳性。
	// 那一格的合法归位（**不接也不删** ＋ 理由）见 `REASONS['test/story-ci.mjs']`。
	if (!selftestDispatched(src)) return true;                  // 无 selftest **入口** → 无接线可要求
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
	// `#1261` 甲：台账行的 id 是**文件路径**（test/rules.mjs），而 SUSPENDED 的键是**段 id**
	//（test-rules-mjs）→ 两种都算：直接命中，或按"段 id -> 文件路径"的两种常见变换命中。
	const suspKeys = new Set(Object.keys(SUSPENDED));
	const toFileGuess = (segId) => {
		const base = segId.replace(/-mjs(-selftest)?$/, '.mjs');
		if (base.startsWith('test-')) return 'test/' + base.slice(5);
		if (base.startsWith('scripts-')) return 'scripts/' + base.slice(8);
		if (base.startsWith('editor-')) return 'editor/' + base.slice(7);
		return base;
	};
	const suspIsSuspended = (rowId) => suspKeys.has(rowId) || [...suspKeys].some((k) => toFileGuess(k) === rowId);
	for (const r of rows) {
		// `#1261` 甲：**临时下架**的段已知原因（样本暂缺）→ 不报 missing-reason；其状态在台账单列。
		if ((!r.wired || r.form === '仅登记') && !r.reason && !suspIsSuspended(r.id)) {
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
	// `#908` ①：探针三态计数（`✅` 是**直接读数** → 它不许由"清单里有没有这一条"推出来）
	const probeOk = rows.filter((r) => r.probe === '✅').length;
	const probeNone = rows.filter((r) => r.probe === '—').length;
	const probeBad = rows.filter((r) => r.probe === '✗').length;
	let cap = 0;
	try { cap = JSON.parse(readFileSync('scripts/probe-budget.json', 'utf8')).maxUnprobed ?? 0; } catch { cap = -1; }
	return { total: rows.length, behavioral: beh, assertOnly, registry: reg, rate: +(beh / rows.length * 100).toFixed(1), probeOk, probeNone, probeBad, probeCap: cap < 0 ? '缺件 ✗' : cap };
};

const markdown = (rows) => {
	const s = summary(rows);
	// `#908` ②：**「自证」列的图例**（口径 ＋ 量法 ＋ 已知边界）—— 用单引号数组组装（**不写进模板字面量**：内层反引号会截断外层模板 —— 同一族今晚刚栽过一次）。
const LEGEND = [
	'> **「自证」这一列量的是什么（口径 ＋ 量法 ＋ 已知边界 ✗）** —— 免得把 `✅` 读成“断言真会红” ✗：',
	'> · 量的是「**信号出现在代码/字符串面**」✓：先用**全仓唯一遮蔽器**剥注释（`editor/lib/core/mask.mjs` ✓）⇒ **注释里写不算** ✗；',
	'> · **字符串里的标签算** ✓（`t(\'🔴 反例：…\')` ✓）⇒ 它 **≠** “断言真会红”✗ ⇒ 更强的证据要**探针**（票 `#908` ① ✓）；',
	'> · **量法（可粘贴复跑 ✓）**：`node scripts/report-gate-ledger.mjs --selftest`（含 4 条 `hasSelfProof` 正反例 ✓）；',
	'> · **缺自证的几行**（`—` ✓）：补一条**能假的负控制** ✓，或按 `#908` ① 登记探针 ✓ —— 名单见下方「工作清单」（**动态生成** ✗，不写死 ✓）。',
].join('\n');

// `#1070`：**档位（tier）留痕** —— K5「降频必须留痕」的落地处。
//注意：这一段必须**随台账生成**（不是手写）：`full` 段的集合变了 → 本段跟着变 → 自证/评审看得见。
// 理由来源＝`FULL_REASONS`（与计划同处一处评审 —— 不在本文件重写一遍）。
const TIER_NOTE = (() => {
	const full = testPlan().filter((s) => tierOf(s) === 'full');
	if (!full.length) return '**档位（tier）**：全部段均在 **PR 档（fast）** ✓（无 `full` 段 ⇒ 无降频 ✓）。';
	const lines = full.map((s) => `| \`${s.id}\` | ${s.cost ?? 0}s | ${(FULL_REASONS[s.id] ?? '').replace(/\n/g, ' ')} |`);
	return [
		`**档位（tier，\`#1070\`）：PR 档（\`--tier=fast\`）只跑 \`tier:'fast'\` 的段；下列 **${full.length} 段**在 \`full\` 档（\`npm run test:full\`；nightly/main 由 \`#1071\` 接线）。**降频必须留痕** ✓（K5）——理由如下（单一权威＝\`scripts/test-plan.mjs\` 的 \`FULL_REASONS\` ✓）：**`,
		'| 段 | 实测成本 | 为什么不在 PR 档（理由 ＋ 代价） |',
		'|---|---|---|',
		...lines,
	].join('\n');
})();

const head = `# 门的行为化率台账（F2）

> **由 \`scripts/report-gate-ledger.mjs\` 生成**（\`npm run report:gates:update\`）——**不要手改**：\`npm run report:gates:check\` 会校验「文件与实况一致」，漂移即红（与 F6 同源纪律）。（校验退出码：0＝一致／1＝不一致（点名首处差异）／2＝判不了（读数不足，本次不作结构判定））
>
> 判据（#247 F2）：常设机检分三种形态——
> **行为化**＝有**正例＋反例自证**（反例真会红）；**仅登记**＝只出报告、不做断言；**人工走查**＝需人判断。
> 纪律：**仅登记 / 未接线必须写明理由**（理由写在脚本的 \`REASONS\` 里，与代码同处一处评审）。
> 为什么要有这张表：本仓当日集齐四类「空判」——覆盖≠验收 / **反例空判** / **死开关**（#331）/ **原理不可达断言**（#338）。
> 台账的首要用途不是统计，而是**让「没有自证的门」在表上看得见**。
>
${LEGEND}

**严格行为化率（有自证）：${s.behavioral}/${s.total} = ${s.rate}%** ｜ **有断言但缺自证：${s.assertOnly}**（＝下方工作清单）｜ 仅登记：${s.registry}
**探针（直接读数 ✓，不是\"文件在不在\"那种代理 ✗）：\`✅\` ${s.probeOk} 项 ｜ \`—\` 未探 ${s.probeNone} 项（**上限 ${s.probeCap}** ✓ 超过即红 ✗；**调高它**是一次显式手改 ⇒ 靠评审拦 ✗，机器拦不住“手改上限”本身 ✓ —— 边界记在票 #908 内 ✗）｜ \`✗\` 不咬 ${s.probeBad} 项（**>0 即红** ✓）** —— 档位／清单：\`node scripts/probe-gates.mjs --probe=fast\` ✓（⑲：本轮覆盖到哪一档写在这行里 ✓）${s.probeOk === 0 && s.probeNone > 0 ? '〔**本次无读数**：生成时 \`build/probe-results.json\` 缺失，经 \`--allow-missing-probe\` 显式逃生 ⇒ **本行与探针列都不是覆盖读数**，不可据此判断探针面 ✗〕' : ''}
${TIER_NOTE}

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
/** `#1242` (1)：把 `--check` 的"**判不了**（前置不足）"与"**判了，不一致**"分开。
 *
 * 症状（已两次）：无读数/读数陈旧时，`--check` 落到逐字节比对 因此 报成"台账与实况不一致" 因此
 * 读的人先怀疑结构，其实**读数不在册**。因此 两态两码：**2＝判不了**、**1＝判了，不一致**。
 * 显式给了 `--allow-stale-probe` 因此 视作"探针面排除、其余面照旧严格"（既有语义，不改）。
 */
export const checkStateProblems = ({ recs = [], fresh = {}, allowStale = false } = {}) => {
	if (allowStale) return null;
	const stale = fresh.stale ?? [];
	const missing = fresh.missing ?? [];
	const noReadings = recs.length === 0;
	const incomplete = recs.length > 0 && (stale.length > 0 || missing.length > 0);
	if (!noReadings && !incomplete) return null;              // 读数在册且新 因此 可判结构
	const brief = (xs) => `${xs.slice(0, 8).join('、')}${xs.length > 8 ? ' …' : ''}`;
	const lines = [];
	if (noReadings) lines.push('探针读数**整体缺失**（`build/probe-results.json` 不存在或为空）');
	if (stale.length) lines.push(`读数**陈旧**（\`targetSha\` 不符）**${stale.length}** 条：${brief(stale)}`);
	if (missing.length) lines.push(`**记录不覆盖本档**（应有 ${fresh.required ?? '?'} 条、缺 **${missing.length}** 条）：${brief(missing)}`);
	return { kind: 'no-readings', noReadings, stale, missing, lines };
};

/** `#1242` (1)：结构不一致时**点名**（首个不同行号 ＋ 表格列名 ＋ 两侧值），别只说"不一致"。 */
export const ledgerDiff = (a = '', b = '') => {
	const A = String(a).split('\n');
	const B = String(b).split('\n');
	const n = Math.max(A.length, B.length);
	const cells = (row) => String(row ?? '').split('|');
	for (let i = 0; i < n; i++) {
		if ((A[i] ?? '') === (B[i] ?? '')) continue;
		const ca = cells(A[i]);
		const cb = cells(B[i]);
		let cell = null;
		for (let c = 0; c < Math.max(ca.length, cb.length); c++) if ((ca[c] ?? '') !== (cb[c] ?? '')) { cell = c; break; }
		let column = null;
		if (cell !== null) {
			for (let h = i; h >= 0; h--) if (/^\|\s*-{2,}/.test(A[h] ?? '')) { column = (cells(A[h - 1])[cell] ?? '').trim() || null; break; }
		}
		return { line: i + 1, cell, column, expected: A[i] ?? '(缺行)', actual: B[i] ?? '(缺行)' };
	}
	return null;
};

const selftest = () => {
	// `#899` ③：这一格的**取数**也能是假的 —— 先把「自证」判定本身拿出来量（注释里写算不算）
	let hbad = 0;
	const h = (label, ok) => { if (!ok) hbad++; console.log(`${ok ? '✓' : '✗'} ${label}`); };
	h('`hasSelfProof`：正文里写「反例」⇒ true ✓', hasSelfProof('t("反例：坏输入 ⇒ 必红", () => 1)') === true);
	h('`hasSelfProof`：**只在注释里**写「反例/selftest」⇒ false ✗（旧口径在这里会误判 ✅ ✗）', hasSelfProof('// 本文件有 selftest 与反例\nconsole.log("hi");\n') === false);
	h('`hasSelfProof`：只在块注释里写 ⇒ 同样 false ✗', hasSelfProof('/* selftest */\nconst x = 1;\n') === false);
	h('`hasSelfProof`：什么都没写 ⇒ false ✓（能假的另一半 ✓）', hasSelfProof('const x = 1;\n') === false);
	// `#1019` ④：**接线面**（新口径）—— 两格成对：写了实现 ＋ **已接线** → true；写了实现但**未接线** → false。
	h('`selfProofWired`：**无 `--selftest` 入口**（负控制写在主跑里）⇒ 不看接线，true ✓',
		selfProofWired('x.mjs', 't("🔴 反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs' }] }) === true);
	h('`selfProofWired`：**有 `--selftest` 入口 ＋ 已接线** ⇒ true ✓',
		selfProofWired('x.mjs', 'if (process.argv.includes("--selftest")) {} t("反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs --selftest' }] }) === true);
	h('🔴 `selfProofWired`：**有 `--selftest` 入口但未接线** ⇒ false ✓（`#1018` 那个形状 ✓）',
		selfProofWired('x.mjs', 'if (process.argv.includes("--selftest")) {} t("反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs' }] }) === false);
	h('`selfProofWired`：没实现 ⇒ false ✓（能假的另一半 ✓）',
		selfProofWired('x.mjs', 'const a = 1;', { plan: [{ cmd: 'node test/x.mjs --selftest' }] }) === false);
	// `#1056`（假阳性那一格）—— 三条成对：子串不算入口 ／真未接线照旧抓得住 ／真派发照旧要求接线
	h('🔴 `selftestDispatched`：`--selftest` **只作断言载荷**（无 `process.argv`）⇒ false ✓（旧子串口径在这里误判为"有入口"✗）',
		selftestDispatched('const r = cli(["--selftest"]);\nt("壳级自证通过", r.status === 0);') === false);
	h('🔴 `selftestDispatched`：读 argv 但件里**根本没有 `--selftest`** ⇒ false ✓（只看 argv 会把无入口的件误降级 ✗）',
		selftestDispatched('const SRC = process.argv[2] ?? null;\nconsole.log(SRC);') === false);
	h('🔴 `selfProofWired`：上述件 ⇒ **true 且不看接线** ✓（＝不逼人加无意义旗标 ✗； `story-ci` 那一格的归位 ✓）',
		selfProofWired('story-ci.mjs', 'const r = cli(["--selftest"]); t("🔴 反例：…", () => 1);', { plan: [{ cmd: 'node test/story-ci.mjs' }] }) === true);
	h('`selftestDispatched`：**真派发**（`--selftest` ＋ `process.argv` 都在）⇒ true ✓（能假的另一半 ✓）',
		selftestDispatched('if (process.argv.includes("--selftest")) selftest();') === true);
	h('`selfProofWired`：真派发 ＋ **未接线** ⇒ 仍 false ✓（`#1056` 没把这一格放宽 ✗ —— 修的是假阳性，不是拆闸门 ✓）',
		selfProofWired('x.mjs', 'if (process.argv.includes("--selftest")) {} t("反例：…", () => 1)', { plan: [{ cmd: 'node test/x.mjs' }, { cmd: 'node test/x.mjs --selftest' }] }) === true
		&& selfProofWired('y.mjs', 'if (process.argv.includes("--selftest")) {} t("反例：…", () => 1)', { plan: [{ cmd: 'node test/y.mjs' }] }) === false);
	// `#908` ②：**形态**判定（纯函数）—— 修掉的正是"测试脚本无条件算行为化"那一处自相矛盾
	h('`formOf`：测试脚本 ＋ **无自证** ⇒ \`行为化（缺自证）\` ✓（旧写法会误标 `行为化` ✗ ⇒ 进不了工作清单 ✗）', formOf({ kind: '测试脚本', selfProof: false }) === '行为化（缺自证）');
	h('`formOf`：测试脚本 ＋ **有自证** ⇒ `行为化` ✓（能假的另一半 ✓）', formOf({ kind: '测试脚本', selfProof: true }) === '行为化');
	h('`formOf`：显式给了 `form` ⇒ 以它为准 ✓（`REASONS` 里的手写标注不被覆盖 ✓）', formOf({ kind: '测试脚本', selfProof: false, form: '仅登记' }) === '仅登记');
	// `#908` ①：**探针**那一格（直接读数）—— 五条，每条都对应一种"假 ✅"
	// `#1097`：**三态识别**（纯函数注入 → 可单测）—— ①②③ 与**档位范围**各一格
	h('`probeFreshnessProblems`：② **新鲜且覆盖** ⇒ `stale`／`missing` 皆空 ✓',
		(() => { const r = probeFreshnessProblems({ probes: [{ id: 'a', tier: 'fast', mutation: { file: 'f' } }], records: [{ id: 'a', targetSha: 'X' }], mode: 'fast', targetShaOf: () => 'now', sha: () => 'X' }); return r.stale.length === 0 && r.missing.length === 0; })());
	h('🔴 `probeFreshnessProblems`：③ **陈旧**（`targetSha` 不符）⇒ 记入 `stale` 并**点名** ✓',
		(() => { const r = probeFreshnessProblems({ probes: [{ id: 'a', tier: 'fast', mutation: { file: 'f' } }], records: [{ id: 'a', targetSha: 'X' }], mode: 'fast', targetShaOf: () => 'now', sha: () => 'Y' }); return r.stale.length === 1 && r.stale[0] === 'a'; })());
	h('🔴 `probeFreshnessProblems`：③ **缺件**（本档应有、记录里没有）⇒ 记入 `missing` ✓',
		(() => { const r = probeFreshnessProblems({ probes: [{ id: 'a', tier: 'fast', mutation: { file: 'f' } }], records: [], mode: 'fast' }); return r.missing.length === 1 && r.stale.length === 0; })());
	//注意：本格是**潜伏陷阱**的守卫：将来加一条 `full` 档探针 → 跑过 `fast` 的机器不许判"缺件"，
	// 否则会**抹平整面探针列** ＋ **报错原因还是错的**（说"陈旧"，真实是"不覆盖档位"）。
	h('🔴 `probeFreshnessProblems`：**档位范围**——`mode=fast` 的记录**不要求** `full` 档探针 ⇒ 缺它**不算缺件** ✓',
		(() => { const r = probeFreshnessProblems({ probes: [{ id: 'a', tier: 'fast', mutation: { file: 'f' } }, { id: 'b', tier: 'full', mutation: { file: 'g' } }], records: [{ id: 'a', targetSha: 'X' }], mode: 'fast', targetShaOf: () => 'now', sha: () => 'X' }); return r.missing.length === 0 && r.required === 1; })());
	h('`probeFreshnessProblems`：`mode=full` ⇒ **要求全集** ⇒ 缺 `full` 档那条 ⇒ 记 `missing` ✓（同一条探针、两种档位两种判 ✓）',
		(() => { const probes = [{ id: 'a', tier: 'fast', mutation: { file: 'f' } }, { id: 'b', tier: 'full', mutation: { file: 'g' } }]; const r = probeFreshnessProblems({ probes, records: [{ id: 'a', targetSha: 'X' }], mode: 'full', targetShaOf: () => 'now', sha: () => 'X' }); return r.missing.length === 1 && r.missing[0] === 'b' && r.required === 2; })());
	//注意：**边界：只抹"探针面"** —— 其余面（行集合/形态/自证/接线/理由）**照旧严格**
	// → "新增门没重生成"这类**真**不一致**照样红**（不许因为读数不可信就把整张台账放过）。
	h('🔴 `normalizeProbeFace`：**只抹探针列** —— 其余格逐字保留 ✓（"真不一致"照样红 ✓）',
		(() => { const md = '| `x` | 形态A | 行为化 | ✅ | ✅ | 理由R |\n**探针（直接读数 ✓）：`✅` 26 项**'; const n = normalizeProbeFace(md); return n.includes('形态A') && n.includes('理由R') && n.includes('〔探针〕') && !/26 项/.test(n); })());
	h('`probeStateOf`：无探针件 ⇒ `—` ✓', probeStateOf({}) === '—');
	h('`probeStateOf`：有探针件但**从没跑过** ⇒ `—` ✗（不假装 ✅ ✓）', probeStateOf({ entry: { id: 'x' }, record: null }) === '—');
	h('`probeStateOf`：跑了但**不咬** ⇒ `✗` ✓（>0 即红 ✓）', probeStateOf({ entry: { id: 'x' }, record: { ok: false } }) === '✗');
	h('`probeStateOf`：咬住 ＋ 被测件**没改** ⇒ `✅` ✓', probeStateOf({ entry: { id: 'x' }, record: { ok: true, targetSha: 'aa' }, targetSha: 'now', sha: () => 'aa' }) === '✅');
	h('`probeStateOf`：咬住但**被测件改过** ⇒ 回落 `—` ✗（禁拿旧读数充数 ✓）', probeStateOf({ entry: { id: 'x' }, record: { ok: true, targetSha: 'aa' }, targetSha: 'now', sha: () => 'bb' }) === '—');
	// `#1079`：探针面抹平（`--allow-stale-probe`）—— 三格：**能假的两个方向**都要有（不然就是"抹掉一切 → 永远绿"）
	{
		const md = [
			'**探针（直接读数 ✓）：`✅` 21 项 ｜ `—` 未探 73 项 ｜ `✗` 不咬 0 项**',
			'| `a.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |',
			'| `b.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |',
		].join('\n');
		const norm = normalizeProbeFace(md);
		h('`normalizeProbeFace`：**摘要的探针计数行**被抹平（✅/—/✗ 计数不再影响比对）', !/`21 项`/.test(norm) && /不参与比对/.test(norm));
		h('`normalizeProbeFace`：**表格行的探针列**（第 5 格）被抹平（✅ ⇒ 〔探针〕）', norm.includes('| ✅ | 〔探针〕 | ✅ |') && !/〔探针〕 \| — \|/.test(norm));
		h('🔴 `normalizeProbeFace`：**其余格照旧保留** ✗（自证／接线／形态／理由一字不动 ⇒ 区分度还在 ✓）',
			norm.includes('| `a.mjs` | 测试脚本 | 行为化 | ✅ |') && norm.includes('|  |') && !/其他/.test(norm));
		h('🔴 **只抹探针面 ≠ 抹掉一切**：行集合变化（新增/删段）**仍会报** ✓', normalizeProbeFace('| `a.mjs` | x | 行为化 | ✅ | ✅ | ✅ |  |') !== normalizeProbeFace('| `zz.mjs` | x | 行为化 | ✅ | ✅ | ✅ |  |'));
		h('🔴 **同一行的自证列变化**（`✅`⇒`—`）⇒ 抹平后**仍不等** ✓（这是“新增门没重生成”的价值面，不能一起丢）',
			normalizeProbeFace('| `a.mjs` | x | 行为化 | ✅ | ✅ | ✅ | r |') !== normalizeProbeFace('| `a.mjs` | x | 行为化（缺自证） | — | ✅ | ✅ | r |'));
	}
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
	// `#1242` (1)：**判不了 vs 判了不一致** 的能假格（三态 + 一条反向）
	{
		const cases2 = [
			['读数整体缺失 因此 判不了（缺读数类）', () => checkStateProblems({ recs: [], fresh: {} }),
				(r) => r && r.kind === 'no-readings' && r.noReadings === true && r.lines.some((l) => /整体缺失/.test(l))],
			['读数陈旧 因此 判不了（点名陈旧条数）', () => checkStateProblems({ recs: [{ id: 'a' }], fresh: { stale: ['a', 'b'], missing: [], required: 2 } }),
				(r) => r && r.stale.length === 2 && r.lines.some((l) => /陈旧/.test(l))],
			['记录不覆盖本档 因此 判不了（点名缺条数）', () => checkStateProblems({ recs: [{ id: 'a' }], fresh: { stale: [], missing: ['b'], required: 2 } }),
				(r) => r && r.missing.length === 1 && r.lines.some((l) => /不覆盖本档/.test(l))],
			['读数在册且新 因此 可判（不得报缺读数）', () => checkStateProblems({ recs: [{ id: 'a' }], fresh: { stale: [], missing: [], required: 1 } }),
				(r) => r === null],
			['显式 --allow-stale-probe 因此 走既有降级（不得报缺读数）', () => checkStateProblems({ recs: [], fresh: {}, allowStale: true }),
				(r) => r === null],
			['结构不一致 因此 点名行号与两侧值', () => ledgerDiff('a\n| x | 1 |\n', 'a\n| x | 2 |\n'),
				(r) => r && r.line === 2 && r.expected.includes('1') && r.actual.includes('2')],
			['两侧一致 因此 不得报差异', () => ledgerDiff('a\nb\n', 'a\nb\n'), (r) => r === null],
		];
		for (const [name, run, want] of cases2) {
			const got = run();
			const okk = want(got);
			if (!okk) bad++;
			console.log(`${okk ? '' : ''} ${name}`);
		}
	}
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：仅登记无理由红 / 未接线无理由红 / 合规绿 / 有理由的仅登记绿 ＋ `hasSelfProof` 四条正反例（注释不算 ✓）＋ `#1019` **接线面**四条正反例 ✓ ＋ `#1056` **入口面**四条（子串不算入口 ✓／真派发照旧要求接线 ✓）');
};

export const rowIds = rows.map((r) => r.id);

//注意：**import 门**：本文件被别处 `import` 时**不得跑主路径**（主路径结尾 `process.exit` → 会把调用方一起带走；
// 探针运行器要读 `rowIds` —— 第一版就是这么静默失败的：结构校验拿不到行 id → 退化成"只做清单自校验"）。
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

	// `#908` ①：探针那一格的**两条不变量** —— 刻意**不是**"有多少条探针"这种只增不读的统计
	if (s.probeBad > 0) {
	const why = rows.filter((r) => r.probe === '✗').map((r) => `【${r.id}】${(recs.find((x) => x.id === r.id)?.reason ?? '记录缺失').slice(0, 70)}`).join(' ｜ ');
	probs.push({ id: 'scripts/probe-gates.mjs', code: 'probe-not-biting', msg: `有 ${s.probeBad} 行的探针**不咬**（✗ ✓ ⇒ 必须当红处理 ✓，"跑了多少条"不算读数 ✗）：${why}` });
}
	if (s.probeCap === '缺件 ✗') probs.push({ id: 'scripts/probe-budget.json', code: 'probe-budget-missing', msg: '缺 `scripts/probe-budget.json` ✗ —— 没有上限，覆盖率就能悄悄下降 ✓' });
	else if (s.probeNone > s.probeCap) probs.push({ id: 'scripts/probe-budget.json', code: 'probe-coverage-drop', msg: `未探（\`—\`）的行数 ${s.probeNone} > 上限 ${s.probeCap} ⇒ 覆盖率**下降**了 ✗（加新门就得补探针 ✓；真要放宽上限，改那个数字是一次**显式决定** ✓）` });

	if (argv.includes('--update')) {
		// `#1174` RC③：**探针读数缺失时拒绝生成** ——
		// 为什么必须拒（实测踩过两次）：探针列与探针计数行取自 build/probe-results.json（gitignored，
		// 由 probe-gates.mjs --probe=fast 产出）；该文件不存在时上面读到的是空集，
		// 生成出的台账会把"未探"写成满额、把覆盖数写成 0，看起来像覆盖率暴跌，
		// 而真相只是没跑探针。那是"读数缺失被当成读数"（本仓反复踩的那族）。
		// 故缺读数时不写盘并提示怎么拿读数；有读数时照常写并如实入账。
		const rec = probeRecords();
		if (!rec.probes.length) {
			console.error('× 拒绝生成台账：探针读数缺失（build/probe-results.json 不存在或为空）');
			console.error('   原因：探针列与探针计数行取自该文件；缺读数时生成会把"未探"写成满额，看起来像覆盖率暴跌。');
			console.error('   修：先跑 node scripts/probe-gates.mjs --probe=fast 拿到读数，再 npm run report:gates:update。');
			console.error('   例外：确实要在无读数状态下看其余面，可加 --allow-missing-probe（该列将标注"无读数"）。');
			if (!argv.includes('--allow-missing-probe')) process.exit(2);
		}
		writeFileSync(LEDGER, md);
		console.log(`✔ 台账已生成 ${LEDGER}（${s.total} 项 · 行为化率 ${s.rate}%）`);
		process.exit(0);
	}

	let bad = probs.length;
	if (existsSync(LEDGER)) {
		// `#1079`：**无探针读数时**（PR 档不跑探针段）那一面**不参与逐字节比对**；
		// 其余面（行集合・形态・自证・接线・理由・工作清单）**照旧严格** →“新增门没重生成”照样红。
		//注意：**必须打印**（不静默 —— `#557` 口径：读不到输入 ≠ 没命中）。
		const ledgerNow = readFileSync(LEDGER, 'utf8');
		// `#1097`：**三态** —— ①无读数 ②新鲜且覆盖 ③**有但陈旧／不覆盖**
		//注意：③ 必须**视作①**（抹平 ＋ 指名打印）—— 拿旧读数当「现状」→ **假红**
		//（开发机撞过：同一棵树、同一命令，只差一个陈旧本地产物 → 结论相反）
		const fresh = probeFreshnessProblems({
			probes: PROBES, records: recs, mode: recMode,
			targetShaOf: (p) => (p.mutation?.file ? readFileSync(p.mutation.file, 'utf8') : null), sha: sha16,
		});
		const incomplete = recs.length > 0 && (fresh.stale.length > 0 || fresh.missing.length > 0);
		const staleProbe = argv.includes('--allow-stale-probe') && (recs.length === 0 || incomplete);
		if (staleProbe) {
			if (recs.length === 0) {
				console.log(`○ \`--allow-stale-probe\`：**本次无探针读数**（\`${PROBE_RECORD}\` 不存在或为空 ⇒ PR 档不跑探针段 ✓）⇒ **探针面跳过比对** ✗（该列降级 \`—\` ✓），**其余面照旧逐字节严格** ✓；有读数的档（\`npm run test:full\`）仍会当场校验 ✓`);
			} else {
				//注意：两种原因**分开报**（否则「说陈旧、真因是不覆盖档位」→ 误导读者）
				const parts = [];
				if (fresh.stale.length) parts.push(`**读数陈旧**（\`targetSha\` 不符）**${fresh.stale.length}** 条：${fresh.stale.slice(0, 6).join('、')}${fresh.stale.length > 6 ? ' …' : ''}`);
				if (fresh.missing.length) parts.push(`**记录不覆盖本档**（\`mode=${recMode ?? '?'}\` 应有 ${fresh.required} 条、缺 **${fresh.missing.length}** 条）：${fresh.missing.slice(0, 6).join('、')}${fresh.missing.length > 6 ? ' …' : ''}`);
				console.log(`○ \`--allow-stale-probe\`：**本地产物不覆盖当前树** ⇒ 视作「无读数」（**探针面跳过比对** ✗、该列降级 \`—\` ✓），**其余面照旧逐字节严格** ✓ —— ${parts.join(' ｜ ')}；要拿真读数请重跑 \`node scripts/probe-gates.mjs --probe=${recMode ?? 'fast'}\` ✓（**别拿上次的 json 当现状** ✗）`);
			}
		}
		// `#1242` (1)：**先判"判不了"**（读数不在册/陈旧）因此 不与"结构不一致"混为一谈。
		// 退出码语义：**2＝判不了（前置不足）／1＝判了，不一致**。显式 `--allow-stale-probe` 时跳过本段。
		const stateProblems = checkStateProblems({ recs, fresh, allowStale: argv.includes('--allow-stale-probe') });
		if (stateProblems) {
			console.error(' 判不了：**探针读数不足** 因此 本次**不作结构判定**');
			for (const l of stateProblems.lines) console.error(`   · ${l}`);
			console.error('   修：先 `node scripts/probe-gates.mjs --probe=fast` 拿读数，再 `npm run report:gates:check`；');
			console.error('       PR 档可加 `--allow-stale-probe`（探针面显式排除、其余面照旧严格）。');
			console.error('   因此 读数补齐后再判结构（本次结构面**未判**）。');
			process.exit(2);
		}
		const [a, b] = staleProbe ? [normalizeProbeFace(ledgerNow), normalizeProbeFace(md)] : [ledgerNow, md];
		if (a !== b) {
			// 报文说清**是哪一类**不一致（`#936` 老账：只说“不一致”不点哪一列 → 读的人要自己找）
			const d = ledgerDiff(a, b);
			console.error(` 台账与实况不一致${staleProbe ? '（**探针面已排除** 因此 差异不在探针列 ）' : ''}（新增 ${rows.length} 项）`);
			if (d) {
				console.error(`   首个不同：**第 ${d.line} 行**${d.column ? `（列「${d.column}」）` : (d.cell !== null ? `（第 ${d.cell} 列）` : '')}`);
				console.error(`     台账：${d.expected}`);
				console.error(`     实况：${d.actual}`);
			}
			bad++;
		}
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
