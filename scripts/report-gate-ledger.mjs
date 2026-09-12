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

const LEDGER = 'docs/gate-ledger.md';
const PKG = 'package.json';

// ── 仅登记 / 未接线的理由（必须逐条写明；新增未写理由的项 → 本门红）──────────
// 「仅登记」＝只出报告、不做断言（允许，但必须说明为什么不设为门）；
// 「未接线」＝不在 npm test 链里（允许，但必须说明谁来跑、何时跑）。
export const REASONS = {
	// ── audit 开关（id 形如 audit:<flag>）──
	'audit:economy': { form: '仅登记', reason: '收支时间线是人读报表（数值本身由 --checks/--gear 门覆盖）' },
	'audit:items': { form: '仅登记', reason: '龙战伤害矩阵是人读对照表（战斗数值由 --dragon 分布门覆盖）' },
	'audit:tokens': { form: '仅登记', reason: '与 --items 同族：词法/道具矩阵报表' },
	'audit:text': { reason: '文本载荷门（**有判定**：载荷阈值）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补（密度 ratchet 在 --craft，本门是自己的载荷线）' },
	'audit:checks': { form: '仅登记', reason: '检定位点总表（覆盖性由 --sitedisc/--interact 族门承担）' },
	'audit:systems': { reason: '机制×锚句门（**有判定**：机制必须有可感知锚句）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补' },
	'audit:canon': { reason: '禁词/回流扫描（断言存在，但**没有自证**——已列入 F2 工作清单；§10 已裁剪项不得回流）' },
	'audit:sel': { wired: true, reason: '接线说明：--sel 只是 --nosl＋--gear 的便捷别名，链上跑的是更具体的两个 flag，故没有单独的 --sel --check（**形态是有判定的门**，此前台账误标「仅登记」，已由形态对账改正）' },
	// ── 报告脚本（id 形如 scripts/<file>）──
	'scripts/report-rhythm.mjs': { wired: true, form: '行为化', reason: 'R1/R1b/R2/正例 四例自证，已入 npm test' },
	'scripts/report-ledger-freshness.mjs': { form: '行为化', reason: '**离线段已入 npm test**（`--ledger --check`：#297 对标台账行级新鲜度——行数栅栏/复核日期在期/触发条件非空/落点引用的门旗标与文件真实存在，7 例自证）；**网络段仍需 token**（#NNN 标记与 GitHub 真实状态一致），不塞主链路，由 `npm run report:freshness:check` 人工/定时跑' },
	'scripts/report-gate-ledger.mjs': { wired: true, form: '行为化', reason: '本文件自身的自检（台账不腐），已入 npm test' },
	// ── 测试脚本（id 形如 test/<file>）──
	'test/walker.mjs': { wired: false, reason: '随机游走 soak（npm run soak）：耗时长、种子流非确定，不进 npm test' },
	'test/browser.mjs': { wired: false, reason: '需真实 Chrome（npm run browser / soak）；CI 由 soak job 跑' },
	'test/audit-golden.mjs': { wired: false, form: '行为化', reason: '按需跑（npm run audit:golden）：拆/改 audit 时用；全量跑 24 个开关较慢' },
	'test/saveload-inventory.mjs': { wired: true, form: '行为化', reason: '自证 6 例（含 widget 间接改状态）' },
	'test/layering.mjs': { wired: true, form: '行为化', reason: '自证 5 例' },
};


const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const testChain = pkg.scripts.test ?? '';

// ── 枚举：常设机检 = audit 开关 + scripts/report-*.mjs + test/*.mjs ──────────
const MODIFIERS = ['check'];
// #316 第 2 步：门拆到 scripts/audit/gates/*.mjs —— 枚举与自证检测都覆盖两处
const gateFiles = readdirSync('scripts/audit/gates').filter((f) => f.endsWith('.mjs')).sort();
const gateSrc = Object.fromEntries(gateFiles.map((f) => [f, readFileSync(`scripts/audit/gates/${f}`, 'utf8')]));
const auditSrc = [readFileSync('scripts/audit.mjs', 'utf8'), ...Object.values(gateSrc)].join('\n');
// **以注册表为权威声明**（此前用正则扫 arg('x')——新门若只写 flags:['state'] 就会被误判成幻影门）
const registry = await import('./audit/registry.mjs');
const gateMods = [];
for (const f of gateFiles) gateMods.push({ file: `scripts/audit/gates/${f}`, mod: await import(`./audit/gates/${f}`) });
const auditFlags = [...new Set(registry.GATES.flatMap((g) => g.flags ?? []))].filter((f) => !MODIFIERS.includes(f)).sort();
const moduleOfFlag = (flag) => gateMods.find((g) => (g.mod.flags ?? []).includes(flag));

// 每个 audit 开关的「自证」：其**门模块**里是否含「自证」字样（本仓既有形态）。
// #316 第 2 步后门已独立成文件 → 直接看该门所属模块。
// guest-1 建议③：形态（报告/判定）不应只手写——**从源码派生「有没有判定路径」**，
// 再与台账声明对账：声明「仅登记」但门里已有判定（bad++/✗/exit(1)/failures.push）＝形态升级未同步 → 红。
const ASSERT_PAT = /bad\s*\+\+|\(\+\+bad\)|✗|process\.exit\(1\)|failures\.push\(|problems\.push\(/;
const gateHasAssert = (flag) => {
	const g = moduleOfFlag(flag);
	return g ? ASSERT_PAT.test(gateSrc[g.file.replace('scripts/audit/gates/', '')]) : false;
};

const auditSelfProof = (flag) => {
	const g = moduleOfFlag(flag);
	return g ? /自证/.test(gateSrc[g.file.replace('scripts/audit/gates/', '')]) : false;
};

const reportScripts = readdirSync('scripts').filter((f) => f.startsWith('report-') && f.endsWith('.mjs')).sort();
const testFiles = readdirSync('test').filter((f) => f.endsWith('.mjs') && !['boot.mjs', 'harness.mjs', 'invariants.mjs'].includes(f)).sort();

const rows = [];
const push = (id, kind, wired, selfProof, extra = {}) => {
	const r = REASONS[id] ?? {};
	// 形态三态（永远可归类，不留「未标注」）：
	//   行为化        ＝有自证（反例真会红）
	//   行为化（缺自证）＝**有断言但从未证明咬得住** → F2 的**工作清单**（不是违规，是待补）
	//   仅登记        ＝只出报告不做断言（必须写理由）
	const form = r.form ?? (selfProof ? '行为化' : kind === '测试脚本' ? '行为化' : '行为化（缺自证）');
	rows.push({
		id, kind,
		wired: wired ?? r.wired ?? false,
		selfProof: selfProof ?? false,
		form,
		reason: r.reason ?? '',
		...extra,
	});
};

for (const f of auditFlags) push(`audit:${f}`, 'audit 开关', testChain.includes(`scripts/audit.mjs --${f} --check`), auditSelfProof(f), { hasAssert: gateHasAssert(f) });
for (const f of reportScripts) push(`scripts/${f}`, '报告脚本', testChain.includes(`scripts/${f}`), readFileSync(`scripts/${f}`, 'utf8').includes('--selftest'));
for (const f of testFiles) push(`test/${f}`, '测试脚本', testChain.includes(`test/${f}`), /负例|反例|selftest/.test(readFileSync(`test/${f}`, 'utf8')));

// ── 判定 ─────────────────────────────────────────────────────────────
// 链上出现的 audit 开关（用于「幻影门」反向查：链里跑了但 audit 里没有 = 手打字面量漂移/已删除）
export const chainFlags = (testChain) => [...new Set([...testChain.matchAll(/audit\.mjs --([a-z0-9-]+)/g)].map((m) => m[1]))];

export const problems = (rows, declared = null, chain = []) => {
	const out = [];
	if (declared) {
		// 幻影门：链上有、audit 声明里没有（guest-1 建议①）
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
	return { total: rows.length, behavioral: beh, assertOnly, registry: reg, rate: +(beh / rows.length * 100).toFixed(1) };
};

const markdown = (rows) => {
	const s = summary(rows);
	const head = `# 门的行为化率台账（F2）

> **由 \`scripts/report-gate-ledger.mjs\` 生成**（\`npm run report:gates:update\`）——**不要手改**：\`npm run report:gates:check\` 会校验「文件与实况一致」，漂移即红（与 F6 同源纪律）。
>
> 判据（#247 F2）：常设机检分三种形态——
> **行为化**＝有**正例＋反例自证**（反例真会红）；**仅登记**＝只出报告、不做断言；**人工走查**＝需人判断。
> 纪律：**仅登记 / 未接线必须写明理由**（理由写在脚本的 \`REASONS\` 里，与代码同处一处评审）。
> 为什么要有这张表：本仓当日集齐四类「空判」——覆盖≠验收 / **反例空判** / **死开关**（#331）/ **原理不可达断言**（#338）。
> 台账的首要用途不是统计，而是**让「没有自证的门」在表上看得见**。

**严格行为化率（有自证）：${s.behavioral}/${s.total} = ${s.rate}%** ｜ **有断言但缺自证：${s.assertOnly}**（＝下方工作清单）｜ 仅登记：${s.registry}

| 门 | 类型 | 形态 | 自证 | 接线（npm test） | 理由（仅登记/未接线必填） |
|---|---|---|---|---|---|
`;
	const body = rows.map((r) => `| \`${r.id}\` | ${r.kind} | ${r.form} | ${r.selfProof ? '✅' : '—'} | ${r.wired ? '✅' : '—'} | ${r.reason || ''} |`).join('\n');
	const debt = rows.filter((r) => r.form === '行为化（缺自证）');
	const debtSec = debt.length
		? `\n## F2 工作清单：有断言但**缺自证**（${debt.length} 项）\n\n> 这些门**在跑、也在断言**，但从没被证明「反例会红」——本仓当日四类空判（覆盖≠验收／反例空判／死开关 #331／原理不可达 #338）都出自这一类。\n> 补法：给该门加一个**合成反例**用例（正例＋反例），并在本脚本的 \`REASONS\` 里改标 \`行为化\`。\n\n`
			+ debt.map((r) => `- \`${r.id}\`（${r.kind}）`).join('\n') + '\n'
		: '';
	return `${head}${body}\n${debtSec}`;
};

// ── 自证 ─────────────────────────────────────────────────────────────
const selftest = () => {
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
	console.log('\n✔ 自证通过：仅登记无理由红 / 未接线无理由红 / 合规绿 / 有理由的仅登记绿');
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) { selftest(); process.exit(0); }

const md = markdown(rows);
const s = summary(rows);
const probs = problems(rows, auditFlags, chainFlags(testChain));

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
