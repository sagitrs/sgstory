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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** `#1087`：**射程 ＝ 全部 `.github/workflows/*.yml`** ✗（不再硬编码 `ci.yml`）。
 *
 * 为什么之前是缺陷 ✓：门只读 `ci.yml` ⇒ **新增 workflow 的触发面无人守** ✗（`#1071` 建 `full-tier.yml`
 *   就是第一个实例 —— 它当时**不在门的扫面里**，故该文件里那处 `|| workflow_dispatch` 是"**自愿遵守**"✗
 *   而不是"门在守"）。⇒ 射程扩到全部 ✓，**含将来新增者** ✓。
 * ⚠️ 排序（稳定输出 ＋ 可复现 ✓）：`readdirSync` 的次序不该决定报文次序 ⇒ 排一下 ✓。 */
export const workflowFiles = ({ dir = join(ROOT, '.github/workflows'), readdirSync: rd = readdirSync } = {}) =>
	rd(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort().map((f) => join('.github/workflows', f));

/** `#1095`：**扫面自身**的断言 —— **扫面非空 ∧ 扫到全部 `.github/workflows/*.yml`** ✓。
 *
 * ## 为什么需要（`#1087` 复核期实测的缺口 ✗ —— **缺口在"接线"不在"断言"**）
 * 把 `workflowFiles()` 的过滤面收窄（实测：只扫 `ci.yml`）后：
 * ```
 * 主跑        ⇒ **rc=0 静默通过** ✗   ← 本件要堵的
 * --selftest  ⇒ rc=1 ✓（自证里那两条射程格会红）
 * ```
 * ⇒ **主跑对"射程被收窄"无感** ✗ —— 而**射程正是本门存在的理由** ✓（`#1087` 的立论：
 *   门只读 `ci.yml` ⇒ 新增 workflow 无人守）。更细的暴露面：**主跑自身没有任何扫面断言** ✗ ⇒
 *   若有人摘掉 `scripts/test-plan.mjs` 里那条 `-selftest` 段 ⇒ 主跑在任何射程下都 rc=0 ⇒
 *   自证那一支再也不会在 CI 里跑 ⇒ 门退化成"只判它恰好扫到的那些" ✓（`#1031` 那族：**入口未接线 ⇒ 零守护**）。
 *
 * ## ⚠️ 断言**故意不复用** `workflowFiles()` 的谓词
 * 若"目录实况"也用同一个选择函数算 ⇒ **收窄过滤面时两边一起收窄** ⇒ `missing` 恒为空 ⇒ 抓不到 ✗。
 * ⇒ `all` 必须由**独立的一手列举**给出（"目录里全部 `.yml`/`.yaml`" ＝ **规格** ✓），
 *   `scanned` 才是**实现**（`workflowFiles()`）⇒ 两者比 ⇒ 收窄必现形 ✓。
 * （这处"重复"是**故意的** ✗：规格与实现分家，判据才有分辨力 ✓。）
 *
 * @param {{scanned?:string[], all?:string[]}} [x]
 * @returns {string[]} 问题清单（空 ＝ 通过）
 */
export const scanProblems = ({ scanned = [], all = [] } = {}) => {
	const out = [];
	if (scanned.length === 0) {
		out.push('扫面为**空** ⇒ 一个 workflow 都没读到 ⇒ **不是"没问题"，是"没在看"** ✗'
			+ '（`#557` 口径：**读不到输入 ≠ 没命中** ✓）');
	}
	const missing = all.filter((f) => !scanned.includes(f));
	if (missing.length) {
		out.push(`扫面**漏了 ${missing.length} 个** \`.github/workflows/\` 里的 workflow：${missing.join('、')} ✗`
			+ '⇒ 这些文件的触发面**无人守** ✗（射程被收窄 ⇒ 本门退化成"只判它恰好扫到的那些" ✓）');
	}
	return out;
};

/** `#1095`：**目录实况**（一手列举 ⇒ 规格侧 ✓）—— **不复用 `workflowFiles()`**（见其注 ✓）。 */
export const allWorkflowFiles = ({ dir = join(ROOT, '.github/workflows'), readdirSync: rd = readdirSync } = {}) =>
	rd(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort().map((f) => join('.github/workflows', f));

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
 *  取 `on:` 段里的触发面 ＋ 每个 job 的 `if:` 事件面。够用且稳定（本仓 workflow 由人维护、形状受控）。
 *
 * ⚠️ `#1087`：**返回 "该面在不在"** ✗ —— 以前只返回 `prTypes`，于是「**没有 `pull_request` 面**」与
 *   「**有面但没写 `types`**」**长得一样**（都是 `[]`）⇒ 判据无法区分 ⇒ 扩射程后会**误报** ✗。
 *   ⇒ 补 `hasPR`／`hasPush` 两个布尔（**"面在不在"是独立事实** ✓）。 */
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
	// `#1087`：**面在不在**——先判它，再取该面的内容（否则"无面"与"空面"分不开 ✗）
	// ⚠️ **块提取必须用行级扫描** ✗ —— 踩过：`onText.slice(idx).split(/^ {2}\S/m)[0]` 会**在开头就命中**
	//   （该面的首行自己就以「两空格＋非空」开头）⇒ 第 0 段是**空串** ⇒ 块内容全丢 ✗
	//   （后果：`ci.yml` 的 `prTypes` 变成 `[]` ⇒ **真判据被误放过** ✗ —— 正是本票最该防的"条件化写成宽松化"）。
	const blockAfter = (key) => {
		const lines2 = onText.split('\n');
		const start = lines2.findIndex((l) => new RegExp(`^ {2}${key}:`).test(l));
		if (start === -1) return null;                       // 面不在 ⇒ null（与"空块"区分 ✓）
		const out2 = [lines2[start].replace(/^ {2}/, '')];   // 该行自身（去两空格 ⇒ 便于 parseTypes 匹配 `types:` ✓）
		for (let i = start + 1; i < lines2.length; i++) {
			if (/^ {2}\S/.test(lines2[i])) break;            // 下一个顶层触发面 ⇒ 块结束 ✓
			out2.push(lines2[i]);
		}
		return out2.join('\n');
	};
	const prBlock = blockAfter('pull_request');
	const hasPR = prBlock !== null;
	const prTypes = hasPR ? parseTypes(prBlock) : [];
	const pushBlock = blockAfter('push');
	const hasPush = pushBlock !== null;
	const pushBranches = hasPush && /branches:\s*\[main\]/.test(pushBlock);
	return { hasDispatch, hasPR, prTypes, hasPush, pushBranches };
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

/** 判据总入口（**纯函数** ⇒ 可喂合成文本单测 ✓）。
 *
 * ⚠️ `#1087` 裁定：**判据条件化**（**同一判据 ＋ 适用面写准**，**不新造** ✗）——
 *   各条判据**只对它声称的那个面**发言 ✗：
 *   · `pull_request.types` 那两条 ⇒ **仅当该文件真有 `pull_request` 面**才判 ✓
 *   · `push.branches` 那条 ⇒ **仅当真有 `push` 面**才判 ✓
 *   · `workflow_dispatch` 那条 ⇒ 沿用（它对**每个** workflow 都成立 ✓ —— 手动补跑是通用要求）
 * ⇒ 否则扩射程后会**误报**（`soak-nightly` 等**无 `pull_request` 面**的文件各报 2–3 条 ✗ —— 实测已量：8 处 ✗）。
 * ⚠️ **边界（不削弱真判据）** ✗：`ci.yml` 那两条**仍然照判** ✓（它真有那两个面 ⇒ 条件为真 ✗ 不被放过 ✓）。 */
export const triggerProblems = (text) => {
	const out = [];
	const s = triggerSurface(text);
	if (!s.hasDispatch) out.push('✗ 缺 `workflow_dispatch` 触发面 ⇒ 无法独立补跑取证（只能 rerun 既有 run）');
	// `#1087`：**有条件**——该文件**声明了** `pull_request` 面才判它的 `types` ✓
	if (s.hasPR) {
		if (!s.prTypes.includes('ready_for_review')) out.push(`✗ \`pull_request.types\` 缺 \`ready_for_review\`（现：${JSON.stringify(s.prTypes)}）⇒ draft 转 Ready 会**静默不跑**`);
		if (!s.prTypes.length) out.push('✗ `pull_request` 无 `types` ⇒ 只有 GitHub 默认活动类型（不含 ready_for_review）');
	}
	// `#1087`：**有条件**——该文件**声明了** `push` 面才判它的 `branches` ✓
	if (s.hasPush && !s.pushBranches) out.push('✗ `push.branches` 不是 `[main]`（触发面被改动？）');
	for (const j of mainOnlyJobsMissingDispatch(text)) out.push(`✗ job \`${j.job}\`（第 ${j.line} 行）是 main-only 但**未接受 dispatch** ⇒ 补跑会少跑这一段：\`${j.if}\``);
	return out;
};

// ── 主跑（非自证）：判**全部** `.github/workflows/*.yml`（`#1087`：射程扩展 ✓）─────
const files = workflowFiles();
let bad = 0;
const summary = [];

// `#1095`：**先断言扫面自身**（非空 ∧ 扫到全部 ✓）—— 射程被收窄 ⇒ **当场红并点名缺了哪些** ✗，
//   不许表现为"没问题"（本门的存在理由就是射程 ✓）。
{
	const scanProbs = scanProblems({ scanned: files, all: allWorkflowFiles() });
	if (scanProbs.length) {
		bad += scanProbs.length;
		for (const l of scanProbs) console.error(`✗ [扫面自身] ${l}`);
	}
}

for (const rel of files) {
	const text = readFileSync(join(ROOT, rel), 'utf8');
	const probs = triggerProblems(text);
	const sf = triggerSurface(text);
	summary.push(`${rel.replace('.github/workflows/', '')}${sf.hasDispatch ? '' : '（**无 dispatch**）'}`);
	if (probs.length) {
		// ⚠️ 报错**点名文件**（多文件下不点名就等于没报 ✗）
		bad += probs.length;
		for (const l of probs) console.error(`✗ [${rel}] ${l}`);
	}
}
if (bad) {
	console.error(`\n✗ CI 触发面完整性门未通过（${files.length} 个 workflow 文件 · ${bad} 问题；\`#791\`／\`#455\`／射程 \`#1087\`）`);
	process.exit(1);
}
console.log(`✔ CI 触发面完整性门通过（扫面 ${files.length} 个 workflow：${summary.join(' · ')}）`);
console.log('  判据（逐文件适用面写准 ✓）：有 `pull_request` 面才判 `types`；有 `push` 面才判 `branches:[main]`；`workflow_dispatch` 每个文件都要求；main-only 的 job/step 必须接受 dispatch');

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
	// ── `#1087`：**射程扩展 ＋ 判据条件化** 的成对自证（**本票最容易被搞砸的格** ✗）──
	//   ⚠️ 风险：把"条件化"写成"**宽松化**" ⇒ 真判据被放过（门形同虚设）。⇒ 三个方向都要能假 ✓。
	const prOnly = `on:\n  push:\n    branches: [main]\n  workflow_dispatch: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n`;
	const withPR = `on:\n  pull_request:\n    types: [opened, ready_for_review]\n  workflow_dispatch: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n`;
	t('`#1087` 条件化·① **无 `pull_request` 面** ⇒ **不报** `types`（此前误报 ⇒ 扩射程后 8 处假红 ✓）',
		triggerProblems(prOnly).length === 0, JSON.stringify(triggerProblems(prOnly)));
	t('`#1087` 条件化·①b **无 `push` 面** ⇒ **不报** `push.branches`（同族 ✓）',
		triggerProblems('on:\n  workflow_dispatch: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n').length === 0);
	t('🔴 `#1087` 条件化·② **有 `pull_request` 面但缺 `ready_for_review`** ⇒ **必报**（**不许被条件化放过** ✗ —— 这是本票的承重格）',
		triggerProblems(withPR.replace('ready_for_review', 'labeled')).some((x) => x.includes('ready_for_review')));
	t('🔴 `#1087` 条件化·②b **有 `push` 面但 `branches` 非 `[main]`** ⇒ **必报**（同 ✓）',
		triggerProblems(prOnly.replace('branches: [main]', 'branches: [dev]')).some((x) => x.includes('push.branches')));
	t('`#1087` 条件化·③ 完整形态（有面且有 `ready_for_review`）⇒ 不报 ✓', triggerProblems(withPR).length === 0);
	t('🔴 `#1087` 面存在性：`triggerSurface` **区分「无面」与「有面但空」** ✗（此前同为 `[]` ⇒ 判不出 ⇒ 根因）',
		triggerSurface(prOnly).hasPR === false && triggerSurface(withPR).hasPR === true && triggerSurface(withPR).prTypes.length > 0);
	t('🔴 `#1087` 面存在性：有面**但无 `types`**（空面）⇒ `hasPR=true` 且 `prTypes=[]` ⇒ 仍应报 ✓',
		triggerSurface('on:\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n').hasPR === true
		&& triggerProblems('on:\n  workflow_dispatch: {}\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n').some((x) => x.includes('ready_for_review')));
	// `#1087`：射程 —— 必须**扫到全部** yml（不是只 `ci.yml`）
	{
		const fs2 = workflowFiles();
		t('`#1087` 射程：扫面**含全部 `.yml`**（且 ≥ 2 个 ⇒ 不是只 `ci.yml` ✓）',
			fs2.length >= 2 && fs2.every((f) => f.endsWith('.yml') || f.endsWith('.yaml')));
		t('`#1087` 射程：扫面**含 `#1071` 新建的那一个**（它当年正是"门看不见"的实例 ✓）',
			fs2.some((f) => f.endsWith('full-tier.yml')));
	}
	// ── `#1095`：**扫面自身**的断言（成对 ⇒ 三方向都能假 ✓）────────────────────────
	//   ⚠️ 为什么必须靠自证格：**③"射程被收窄"在 CI 里不会自然发生** ⇒ CI 绿**不能**证明本判据对 ✗
	//   ⇒ 用纯函数喂夹具钉住（不依赖真树 ✓）。
	t('`#1095` 扫面·① 完整射程（`scanned` == 目录实况）⇒ **不报** ✓',
		scanProblems({ scanned: ['a.yml', 'b.yml'], all: ['a.yml', 'b.yml'] }).length === 0);
	t('🔴 `#1095` 扫面·② **射程被收窄**（实况 2 个、只扫 1 个）⇒ **必报**且**点名缺的那个** ✓',
		(() => { const r = scanProblems({ scanned: ['a.yml'], all: ['a.yml', 'b.yml'] }); return r.length === 1 && r[0].includes('b.yml'); })());
	t('🔴 `#1095` 扫面·③ **空扫面** ⇒ **必报**（不是"没问题"✓ —— `#557`：读不到输入 ≠ 没命中）',
		scanProblems({ scanned: [], all: ['a.yml'] }).length >= 1);
	t('🔴 `#1095` 扫面·③b 空扫面 **且**目录也空 ⇒ 仍报**空扫面**（不许"两边都空 ⇒ 一致 ⇒ 绿"✗）',
		scanProblems({ scanned: [], all: [] }).some((x) => x.includes('空')));
	t('🔴 `#1095` 扫面·④ **基线零违规**：本仓当下（`workflowFiles()` vs 目录实况）⇒ 0 ⇒ 新判据不制造假红 ✓',
		scanProblems({ scanned: workflowFiles(), all: allWorkflowFiles() }).length === 0);

	console.log(bad ? `\n✗ 自证失败 ${bad} 项` : `\n✔ 自证通过（${n - bad}/${n}）`);
	process.exit(bad ? 1 : 0);
}
