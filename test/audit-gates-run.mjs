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
import { storySlugs, STORIES_DIR, ROOT } from '../scripts/dist-paths.mjs';   // `#1315`：零故事态／外根判「未判」
import { join } from 'node:path';

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
// `#1315`（**未判**口径）：本格的**对象**是「选中 ⇒ 真跑」这条**机制**（门被选中就必须跑满、不许静默），
// 而它的**前提**是「仓内有一份默认故事」。零故事态（`#1265` 后是常态）⇒ **前提不成立** ⇒
// **出声说"未判"**（不算红、不算绿）—— ✗ 不再把整段挂起：**挂起 ＝ 判据不可见**（`#1267` 尾件那条教训），
// 而机械面向上的**纯函数格（上面那批）仍在跑**，机制面并不失去看护。
// `#1321` 复核（写作者 RC ＋ 协调席裁定）：**外根也要未判** —— 本格量的三项是「**某个故事根下审计是否全绿**」
// ⇒ 属**故事侧健康读数**；按 Operator 口径（引擎能力不以故事为前提／用户的故事不是测试用例）
// ⇒ **它不是引擎能力的判据** ⇒ 外根（如 books）时同样只出声「未判」（照 `test/size-gate.mjs` 的 `EXTERNAL` 先例）。
const EXTERNAL = STORIES_DIR !== join(ROOT, 'stories');
if (storySlugs().length === 0 || EXTERNAL) {
	const why = storySlugs().length === 0 ? '仓内零故事（无默认故事）' : ('外根模式（故事根＝' + STORIES_DIR + '）');
	console.log('  ○ 未判：' + why + '⇒ 「选中 ⇒ 真跑」的 **CLI 半段**未判'
		+ '（对象在：`scripts/audit.mjs`；前提不成立：没有默认故事可跑）；纯函数格已跑，机制面仍有着护。');
} else {
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
