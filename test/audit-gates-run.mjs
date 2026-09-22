// `#572`：**「选中 → 真跑」门** —— 门被选中了却一行不输出，是本仓最难发现的一类假绿。
//
// 背景（本票实测）：`scripts/audit.mjs` 的 `selected` 决定**调用谁**，而每道门的 `run()` 开头还有一道
// `if (!wantAll &&!arg('<自己的flag>')) return;`。`createContext` 里 `wantAll =!argv.some(a => a.startsWith('--'))`
// → 只给 `--engine-only --check` 时九道引擎门里**只有不带守卫的 `state`／`literals` 真跑**，其余七道逐个早退，
// 而计划里那两段却把它当成「四道引擎门对第二/第三故事绿」的证据 → 假绿（`#557` 同族）。
//
// 本文件两件事：
// ① 自证：`runSelectedGates()`（跑门并记录「有没有输出过」）的正反例 + 边界；
// ② 回归：**默认故事**跑 `--engine-only --check` → 必须真的跑满 9 门并在末行报「选中 N 门 · 实跑 N 门」
//（修前那条汇总行根本不会出现 → 本用例就是它的红证）。
import { spawnSync } from 'node:child_process';
import { runSelectedGates } from '../scripts/audit/lib/shared.mjs';
import { AUDIT_ENGINE } from '../scripts/test-plan.mjs';

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

console.log('══ 「选中 ⇒ 真跑」门（#572）══');

// ── ① `runSelectedGates` 的纯逻辑自证（不碰 CLI）──
// 注意：假门必须往**注入的 log** 写（真跑时 `log === console`，所以等价）。
{
	const mkLog = () => ({ log: () => {} });
	const gate = (flag, body) => ({ flags: [flag], run: () => body() });
	{
		const log = mkLog();
		const loud = gate('a', () => log.log('跑了 a 门'));
		const r = runSelectedGates([loud], {}, log);
		case_('正例：门产出过输出 ⇒ 不算静默', r.silent.length === 0 && r.ran === 1 && r.selected === 1, JSON.stringify(r));
	}
	{
		const log = mkLog();
		const loud = gate('a', () => log.log('跑了 a 门'));
		const quiet = gate('b', () => { /* 静默早退——修前那七道门的形状 */ });
		const r = runSelectedGates([loud, quiet], {}, log);
		case_('🔴 反例：某门一行不输出 ⇒ 点名报静默（这就是 `#572` 的形状）', r.silent.length === 1 && r.silent[0] === 'b', JSON.stringify(r));
	}
	{
		const log = mkLog();
		const quiet = gate('b', () => {});
		const errOnly = gate('c', () => console.error('只报错不输出'));
		const r = runSelectedGates([quiet, errOnly], {}, log);
		case_('边界：只往 stderr 写也算静默（判据看的是“有没有输出”，不看流）', r.silent.join() === 'b,c', JSON.stringify(r.silent));
	}
	case_('边界：空选择 ⇒ 不报静默（“一门没选”由上层响亮报错，不在这里兜）', runSelectedGates([], {}, mkLog()).silent.length === 0);
}

// ── ② 回归：真跑 CLI —— 默认故事的引擎门必须**跑满** ──
{
	const r = spawnSync(process.execPath, ['scripts/audit.mjs', '--engine-only', '--check'], { encoding: 'utf8', timeout: 240_000 });
	const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
	const headers = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('══')).length;
	const summary = `✔ 选中 ${AUDIT_ENGINE.length} 门 · 实跑 ${AUDIT_ENGINE.length} 门`;
	case_(`真跑：\`--engine-only --check\` 退出码 0（引擎门对默认故事全绿）`, r.status === 0, `status=${r.status}`);
	case_(`真跑：末行报「选中 ${AUDIT_ENGINE.length} 门 · 实跑 ${AUDIT_ENGINE.length} 门」（**修前没有这一行**）`, out.includes(summary), out.slice(-160).replace(/\n/g, ' | '));
	case_(`真跑：九道引擎门各打了一次表头（表头数 ${headers} ≥ ${AUDIT_ENGINE.length}）`, headers >= AUDIT_ENGINE.length, `headers=${headers}`);
}

if (bad) {
	console.error(`\n✗ 「选中 ⇒ 真跑」门未通过（${bad} 项）—— 被选中的门必须真的产出输出（#572）`);
	process.exit(1);
}
console.log('\n✔ 「选中 ⇒ 真跑」门通过（9 道引擎门真跑 + 静默门会点名）');
