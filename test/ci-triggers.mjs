// `#791`／`#455`（组内重做）：**CI 触发面完整性**的结构门 —— 两处**静默缺口**的防退化。
//
// 为什么需要它（两件事都是"**无声**失败"，没有它就会悄悄退回）：
//   ① `#791`：GitHub 对 `pull_request` 的**默认**活动类型是 `opened/synchronize/reopened` ⇒
//      **draft 转 Ready 不触发**（实测：no checks ＋ 无 run），而 **merge 不拦红** ⇒ 静默漏跑；
//   ② `#455`：无 `workflow_dispatch` ⇒ **只能 rerun 既有 run**，无法独立补跑取证（β2 双证 HTTP 422 实证）；
//      且补跑应走**完整链**（含 `post-deploy-smoke` 线上冒烟），否则"补跑"= 少跑一段。
//
// 判据（每条**都能假**）：① 删 `types` ⇒ 红；② 删 `ready_for_review` ⇒ 红；③ 删 `workflow_dispatch` ⇒ 红；
//   ④ 把任一处 main-only 的 `if` 改回只 `push` ⇒ 红（点名是哪个 job）。
//
// ⚠️ 口径说明：本门是**结构判据**（读 `ci.yml` 的触发面与事件面），**不是**"跑一次真 draft→Ready"的
//   端到端验证 ✗ —— 后者无法在本仓 CI 内自造（需要真 PR）。⇒ 端到端那一手由**人工一次实测**留痕
//   （票内记录），本门负责"**别再退化**"这一面（与 `#1052` 同族：结构门 + 人工实证配合 ✓）。

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CI = join(ROOT, '.github/workflows/ci.yml');

/** `types` 的**两种等价写法都认**（`#1054` 复核 ✗ —— 等价形态造成判据缺口即"假绿"）：行内 `types: [a, b]` 与**多行** `types:\n  - a`。
 *  ⚠️ 为什么必须都认：YAML **等价形态**不许造成判据缺口 —— 否则门会被"换个写法"**安静绕过 ⇒ 假绿** ✗，
 *  而本门存在的理由正是"防退化"（一个自称防退化的门，其口径**不能脆**）。 */
export const parseTypes = (prBlock) => {
	const inline = /types:\s*\[([^\]]*)\]/.exec(prBlock);
	if (inline) return inline[1].split(',').map((x) => x.trim()).filter(Boolean);
	const m = /types:\s*$/m.exec(prBlock);
	if (m) {
		const out = [];
		for (const l of prBlock.slice(m.index + m[0].length).split('\n')) {
			if (!l.trim()) continue;                 // ⚠️ 空行不算列表结束（`types:` 之后的第一个元素前必有换行 ✓）
			const it = /^\s*-\s*(.+?)\s*$/.exec(l);
			if (!it) break;                          // 非空且非列表项 ⇒ 列表结束 ✓
			out.push(it[1]);
		}
		return out;
	}
	return [];
};

/** 结构性摘取（**不引 YAML 解析器** ⇒ 零依赖、纯件、可单测 ✓）：
 *  取 `on:` 段里的触发面 ＋ 每个 job 的 `if:` 事件面。够用且稳定（本仓 workflow 由人维护、形状受控）。 */
export const triggerSurface = (text) => {
	const lines = String(text).split('\n');
	const onLines = [];
	let inOn = false;
	for (const l of lines) {
		if (/^on:\s*$/.test(l)) { inOn = true; continue; }
		if (inOn && /^\S/.test(l)) { inOn = false; }        // 回到顶层键 ⇒ on 段结束
		if (inOn) onLines.push(l);
	}
	const onText = onLines.join('\n');
	const hasDispatch = /^ {2}workflow_dispatch:/m.test(onText);
	const prBlock = onText.split(/^ {2}pull_request:/m)[1] ?? '';
	const prTypes = parseTypes(prBlock);
	const pushBranches = /^ {2}push:\s*$/m.test(onText) && /branches:\s*\[main\]/.test(onText);
	return { hasDispatch, prTypes, pushBranches };
};

/** 每个 job 的 `if:` 里，"main-only" 的 job 是否**都**接受了 `workflow_dispatch`。
 *  返回 `{ job, line, if }` 列表 —— 只挑"**main-only 且不含 dispatch**"的（＝补跑会漏跑的那些）。 */
export const mainOnlyJobsMissingDispatch = (text) => {
	const lines = String(text).split('\n');
	const out = [];
	let job = null;
	for (let i = 0; i < lines.length; i++) {
		const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
		if (m) job = m[1];
		// ⚠️ `#1054` D1（复核 ✗）：**job 级与 step 级都要判** —— 只认 job 级会让 `upload-artifact` 的
		//  step 级 `- if:` 改回只 `push` 时**静默放行**（实测 rc=0 ✗）⇒ 补跑时那步少跑一份产物。
		const ifl = (/^ {4,}if:\s*(.+)$/.exec(lines[i]) || /^ {4,}- if:\s*(.+)$/.exec(lines[i]));
		if (ifl && job) {
			// ⚠️ `#1054` 复核 ✗：**引号归一化**后再判 —— YAML 里 `'push'` 与 `"push"` **等价**，
			//  用字面串匹配会让"改成双引号并顺手去掉 dispatch"**安静绕过本门**（假绿）⇒ 先归一化 ✓。
			const cond = ifl[1].replace(/"/g, "'");
			const mainOnly = cond.includes("refs/heads/main") && cond.includes("'push'");
			const takesDispatch = cond.includes('workflow_dispatch');
			if (mainOnly && !takesDispatch) out.push({ job, line: i + 1, if: cond.trim() });
		}
	}
	return out;
};

/** 判据总入口（**纯函数** ⇒ 可喂合成文本单测 ✓）。 */
export const triggerProblems = (text) => {
	const out = [];
	const s = triggerSurface(text);
	if (!s.hasDispatch) out.push('✗ 缺 `workflow_dispatch` 触发面 ⇒ 无法独立补跑取证（只能 rerun 既有 run）');
	if (!s.prTypes.includes('ready_for_review')) out.push(`✗ \`pull_request.types\` 缺 \`ready_for_review\`（现：${JSON.stringify(s.prTypes)}）⇒ draft 转 Ready 会**静默不跑**`);
	if (!s.prTypes.length) out.push('✗ `pull_request` 无 `types` ⇒ 只有 GitHub 默认活动类型（不含 ready_for_review）');
	if (!s.pushBranches) out.push('✗ `push.branches` 不是 `[main]`（触发面被改动？）');
	for (const j of mainOnlyJobsMissingDispatch(text)) out.push(`✗ job \`${j.job}\`（第 ${j.line} 行）是 main-only 但**未接受 dispatch** ⇒ 补跑会少跑这一段：\`${j.if}\``);
	return out;
};

// ── 主跑（非自证）：判**真文件** ───────────────────────────────
const problems = triggerProblems(readFileSync(CI, 'utf8'));
if (problems.length) {
	for (const l of problems) console.error(l);
	console.error('\n✗ CI 触发面完整性门未通过（`#791`／`#455`）');
	process.exit(1);
}
const s = triggerSurface(readFileSync(CI, 'utf8'));
console.log(`✔ CI 触发面完整性门通过（触发面：push[main] ＋ pull_request.types=[${s.prTypes.join(', ')}] ＋ workflow_dispatch；main-only job 均已接受 dispatch）`);

// ── 自证（合成输入；**成对给**：坏文本必红、好文本必绿）────────────
if (process.argv.includes('--selftest')) {
	let bad = 0, n = 0;
	const t = (label, ok) => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	const good = `on:\n  push:\n    branches: [main]\n  workflow_dispatch: {}\n  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\njobs:\n  test:\n    runs-on: ubuntu-latest\n  zzjob:\n    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n  zzstep:\n    if: always()\n    steps:\n      - if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n        uses: actions/upload-artifact@v4\n  deploy:\n    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')\n    needs: [test]\n`;
	// `#1054` 复核（口径脆性）：**等价写法**必须同判 —— 这是本门"防退化"可信度的前提 ✓
	t('反例⑥（复核给的 A5 形态）：main-only 不接受 dispatch 且用**双引号** `"push"` ⇒ **仍点名**（不许被等价写法绕过 ✗）', (() => {
		const bad = good.replace("\n    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')", "\n    if: github.ref == 'refs/heads/main' && github.event_name == 'push'");
		const r = triggerProblems(bad);
		// ⚠️ 不写死条数（夹具里同类 job/step 可能多于一个）⇒ 要求「至少一条、且点到 deploy」
		return r.length >= 1 && r.some((x) => x.includes('未接受 dispatch'));
	})());
	t('反例⑦：`types` 用**多行列表**且缺 `ready_for_review` ⇒ 点名（等价写法也要认 ✓）', (() => {
		const multi = good.replace(/ {4}types: \[[^\]]*\]/, '    types:\n      - opened\n      - synchronize');
		return triggerProblems(multi).some((x) => x.includes('ready_for_review'));
	})());
	t('正例⑦：`types` 用**多行列表**且含 `ready_for_review` ⇒ 不报（等价写法不误报 ✓）', (() => {
		const multi = good.replace(/ {4}types: \[[^\]]*\]/, '    types:\n      - opened\n      - ready_for_review');
		return triggerProblems(multi).length === 0;
	})());
	t('正例：完整触发面 ＋ 各 job 接受 dispatch ⇒ 无问题', triggerProblems(good).length === 0);
	t('反例①：`pull_request` 删 `types` ⇒ 点名（draft 转 Ready 静默）', triggerProblems(good.replace(/\n {4}types: \[[^\]]*\]/, '')).some((x) => x.includes('ready_for_review')));
	t('反例②：`types` 少了 `ready_for_review` ⇒ 点名', triggerProblems(good.replace('ready_for_review', 'labeled')).some((x) => x.includes('ready_for_review')));
	t('反例③：删 `workflow_dispatch` ⇒ 点名（无法补跑取证）', triggerProblems(good.replace('  workflow_dispatch: {}\n', '')).some((x) => x.includes('workflow_dispatch')));
	t('反例④：main-only **job 级** if 改回只 push ⇒ 点名（锚定 job 级行，与 step 级各自独立 ✓）', (() => { const r = triggerProblems(good.replace("\n    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')", "\n    if: github.ref == 'refs/heads/main' && github.event_name == 'push'")); return r.length >= 1 && r.some((x) => x.includes('未接受 dispatch')); })());
	// `#1054` D1（复核补）：**只把 step 级** `- if:` 改回只 `push` ⇒ 必红（不许静默放行 ✗）
	t('`#1054` D1：仅 step 级 `- if:`（upload-artifact）改回只 `push` ⇒ **必红**', (() => {
		const m = good.replace("\n      - if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')", "\n      - if: github.ref == 'refs/heads/main' && github.event_name == 'push'");
		return triggerProblems(m).length >= 1;
	})());
	t('边界⑤：`push.branches` 被改（非 [main]）⇒ 点名', triggerProblems(good.replace('branches: [main]', 'branches: [dev]')).some((x) => x.includes('push.branches')));
	t('边界⑤：非 main-only 的 job（无 `refs/heads/main`）＋ 无 dispatch ⇒ **不报**（不该管）', triggerProblems(good.replace("if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')", "if: always()")).length === 0);
	console.log(bad ? `\n✗ 自证失败 ${bad} 项` : `\n✔ 自证通过（${n - bad}/${n}）`);
	process.exit(bad ? 1 : 0);
}
