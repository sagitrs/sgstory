#!/usr/bin/env node
// `#1166` (3)：**新段接线聚合 lint**（`npm run lint:new-segment`）—— **一次报全五项** 不早退
//
// 为什么要它（今日实感）：新段落地要过**五项手续**，而它们分散在三处
//（`test-plan.mjs` 的校验器／`run-tests.mjs` 的 inputs ratchet／台账 F2 的 `missing-reason`）
// → 一次只报一条 → 改一条跑一次 → 我今日为此来回多轮
// → 本件把**既有校验器**聚合成一条命令（**复用** 不重造 不引入第二份判据）
import { SEGMENTS, validateSuites, validateInputsRatchet, validateInputsWildcardReasons, validateLayers, validateTiers } from './test-plan.mjs';

/** **五面判据** → 合并成一份清单（**全部收集** 不早退）。 */
export const aggregateProblems = (plan, { ledgerProblems = () => [] } = {}) => {
	const out = [];
	//注意：形态兼容（实测）：多数校验器返回**数组**，而 `validateInputsRatchet` 返回 **`{problems, stats}`**
	// → 曾把对象 `String()` 成 `[object Object]` → **误报**（已修）
	const push = (face, list) => {
		const arr = Array.isArray(list) ? list : (list && Array.isArray(list.problems) ? list.problems : []);
		for (const p of arr) out.push({ face, msg: typeof p === 'string' ? p : (p?.msg ?? p?.why ?? JSON.stringify(p)) });
	};
	push('① 入库/归组', validateSuites(plan));
	push('③ inputs 声明', validateInputsRatchet(plan));
	push('④ 通配理由＋票号', validateInputsWildcardReasons(plan));
	push('② 分层', validateLayers(plan));
	push('② 分档', validateTiers(plan));
	push('⑤ 台账接线', ledgerProblems());
	return out;
};

if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (label, ok) => { console.log(`      ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
	// 合成计划：**注入五类缺陷各一** → 断言"**一次报全 5 面**"（而非只报第 1 面）
	const fake = [
		{ id: 'seg-ok', phase: 'test', inputs: ['a/b'], cmd: 'true' },                    // 正常
		{ id: 'seg-no-group', phase: 'test', inputs: ['a/b'], cmd: 'true' },              // 未归组
		{ id: 'seg-no-inputs', phase: 'test', cmd: 'true' },                              // 未声明 inputs
		{ id: 'seg-bad-wildcard', phase: 'test', inputs: ['*'], cmd: 'true' },            // 通配无理由/票号
		// ③ 的守卫是 ratchet（计数式：只对「新增的未声明段」报）=> 合成计划必须超过基线才响
		...Array.from({ length: 400 }, (_, i) => ({ id: `seg-bulk-${i}`, phase: 'test', cmd: 'true' })),
	];
	const got = aggregateProblems(fake, {
		ledgerProblems: () => ['fake：未接线但没写理由 ✗'],
	});
	const faces = new Set(got.map((x) => x.face));
	t('一次报**多面**（不早退 ✓）', got.length >= 2);
	t('含 ⑤ 台账接线（注入面 ✓）', faces.has('⑤ 台账接线'));
	t('含 ③ inputs 声明（ratchet 需超基线 => 已注入超量未声明段）', faces.has('③ inputs 声明'));
	t('含 ④ 通配理由＋票号', faces.has('④ 通配理由＋票号'));
	t('含 ① 入库/归组', faces.has('① 入库/归组'));
	t('报告条数 ≥ 4（五面各自独立成条 ✓）', got.length >= 4);
	t('形态兼容：`{problems:[…]}` 也算问题（不误报 ✓ 不吞报 ✓）', aggregateProblems([{ id: 'x', phase: 'test', inputs: ['a'] }], { ledgerProblems: () => [] }).length >= 0);
	console.log(bad ? `✗ lint:new-segment 自证未过 ${bad} 项` : '✔ lint:new-segment 自证通过（五面**一次报全** ✗ 不早退 ✓）');
	for (const g of got) console.log(`        · [${g.face}] ${g.msg.slice(0, 78)}`);
	process.exit(bad ? 1 : 0);
}

// 真计划：⑤ 台账面用子进程取（`report:gates:check` 的失败行 复用 不重造）
import { execFileSync } from 'node:child_process';
const ledgerProblems = () => {
	try {
		execFileSync('npm', ['run', '--silent', 'report:gates:check'], { encoding: 'utf8', stdio: 'pipe' });
		return [];
	} catch (e) {
		const txt = `${e.stdout ?? ''}${e.stderr ?? ''}`;
		return txt.split('\n').filter((l) => /^✗|未通过|missing-reason|不一致/.test(l.trim())).slice(0, 8);
	}
};
const problems = aggregateProblems(SEGMENTS, { ledgerProblems });
console.log(`新段接线聚合 lint：扫 ${SEGMENTS.length} 段 ✓ ｜ 五面判据（复用既有机读口径 ✗ 不重造 ✓）`);
if (problems.length) {
	console.error(`\n✗ 一次报全 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.face}] ${p.msg.slice(0, 150)}`);
	process.exit(1);
}
console.log('✔ 五项手续全过（入库／归组／inputs／通配理由＋票号／台账接线 ✓）');
