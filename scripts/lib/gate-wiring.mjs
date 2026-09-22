// `#1100`：**判据「接线」的可观测量**（B′1–B′4 ＋ R1／R2／R3 + 逐门不变量）。
//
// ## 现象（`#1100` §一 实测）
// ```
// `scripts/probe-gates.mjs` 里 `probeStructureProblems(PROBES)` 换成 `[]` → `--check` 与 `--selfcheck` **都 rc=0**
// → **判据在、接线被摘、无人报** → 之后违规**全链路漏报**
// ```
// ## 口径（评审席定稿：**乙′ ＋ 派生覆盖面**）
// ```
// B′1 集合 ＝ 门模块侧（`scripts/audit/gates/*.mjs` 的 `flags`）↔ registry 侧（`GATES` 并集）→ **两向相等 ＋ 打印两面与差集**
// B′3 锚 ＝ **逐门具名判据体**（`GATE_ANCHORS` 显式表；**不指 `run`**）
// R1 锚符号在目标文件里**恰 1 处定义**（0 → 判据体被删／≥2 → 锚不唯一 → 读数不可信）
// R2 锚符号**必须在同模块 `run` 那一段里被调用**（判 `sym(` 调用形态，不是"名字出现过"）
// ```
// ##注意：边界（**不得宣称"不可摘"**）
// ```
// · 本判据**不是锁**：把"派生 ＋ 核对"整体删掉 → 门内抓不到
// · 它给的是**可观测的数**：两面差集／锚处数／字形读数
// · **唯一的外部可见性** ＝ **台账 diff**（`REASONS` 纪律）
// ·注意：R2 的字面量挖空**连 `${…}` 一起挖** —— 若有人把**真代码**写进模板字面量，本判据会**假红**
//（门模块里不会这么写 → 接受；写在这里是为了**别让读者以为它无懈可击**）
// ```
import { readFileSync, readdirSync } from 'node:fs';
import { GATES } from '../audit/registry.mjs';   // B′1：registry 侧那面（单一权威）
import { mask } from '../audit/lib/mask.mjs';   // `#1100`：**单一权威**词法遮蔽器（`export *` 自 `editor/lib/core/mask.mjs`）

export const GATE_DIR = 'scripts/audit/gates';
/** `#1100` (甲)：**逐门锚 ＝ 该门的具名判据体**（不指 `run`）。 */
export const GATE_ANCHORS = {
	a11y: 'contrastFindings',
	consequences: 'judgeConsequences',
	'engine-story-free': 'judgeStoryFree',
	literals: 'analyze',
	roads: 'judgeRoads',
	sitedisc: 'judgeFailBranches',
	slots: 'violations',
	state: 'analyze',
	status: 'planViolations',
	text: 'judgePayloads',
	waves: 'traceViolations',
};

const realRead = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

/** 从某门模块源码里抽 `export const flags = [...]`（**门自己声明 **）。 */
export const moduleFlags = (src) => [...String(src).matchAll(/export const flags\s*=\s*\[([^\]]*)\]/g)]
	.flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean));

/** registry 侧的门 flag 集合（**另一面**）。 */
export const registryFlags = () => [...new Set(GATES.flatMap((g) => g.flags ?? []))].sort();

/** **词法区段**：`export const run` 到**下一个顶层 `export `**（或文件尾） —— 不解析 JS（配平那条路已废）。 */
export const runRegionOf = (code) => {
	const t = String(code);
	const at = t.indexOf('export const run');
	if (at < 0) return null;
	const next = t.indexOf('\nexport ', at + 1);
	return next < 0 ? t.slice(at) : t.slice(at, next);
};

/** **跨行字面量整段挖空**（保持长度与换行 → 行列稳定）。注意：`${…}` 一并挖（边界见文件头）。 */
export const blankLiterals = (code) => {
	const t = String(code);
	let out = '';
	let q = null;
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (q) {
			if (c === '\\') { out += t[i + 1] === '\n' ? '  ' : '  '; i++; continue; }
			if (c === q) { out += c; q = null; continue; }
			out += c === '\n' ? '\n' : ' ';
			continue;
		}
		if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue; }
		out += c;
	}
	return out;
};

/** **按行**挖空字面量（每行独立扫描 → **绝不跨行吞后段**）。
 *注意：边界（如实）：跨行模板／字符串的**后续行不挖** → 若有人把 `sym(` 写进跨行模板正文，本判据会**假过**
 *（而"跨行整段挖"会在遇到正则里的撇号时吞掉整段 → 造成**假红** —— 两者都写在这里，供后人取择）。 */
export const blankLiteralsLinewise = (code) => String(code).split('\n').map((line) => {
	let out = ''; let q = null;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (q) { if (c === '\\') { out += '  '; i++; continue; } if (c === q) { out += c; q = null; continue; } out += ' '; continue; }
		if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue; }
		out += c;
	}
	return out;
}).join('\n');


/** `#1100` **驱动层**（三层判别力的中间一层）：**注册表 → 被驱动** 这条链必须成立。
 *注意：一手事实（本仓实形）：驱动器 ＝ `scripts/audit/lib/shared.mjs` 的 `runSelectedGates` → 循环体调 **`g.run(ctx)`**；
 * 枚举源 ＝ `scripts/audit/discovery.mjs` → 它必须从**注册表 `GATES`** 取（唯一枚举源）。
 * 抓的是**这条链**，不是某个具体写法（换写法 → 改这里的锚，但"链断必红"不变）。 */
export const DRIVER_CHAIN = { driver: 'scripts/audit/lib/shared.mjs', call: 'g.run(', source: 'scripts/audit/discovery.mjs', registry: 'GATES' };

/** 驱动层判据（**纯函数 ＋ 注入** → 自证能喂假事实）。 */
export const driverProblems = ({ read = realRead, chain = DRIVER_CHAIN } = {}) => {
	const problems = [];
	const d = read(chain.driver);
	if (!d) problems.push(`✗ **驱动层缺线**：驱动器 \`${chain.driver}\` **读不到** ✗（链断 ⇒ 注册门不会被真调用 ✓）`);
	else if (!String(d).includes(chain.call)) problems.push(`✗ **驱动层缺线**：\`${chain.driver}\` 里找不到 \`${chain.call}\` ✗（把驱动循环的调用摘掉 ⇒ 注册表就只是清单 ✓）`);
	const s = read(chain.source);
	if (!s) problems.push(`✗ **驱动层缺线**：门枚举源 \`${chain.source}\` **读不到** ✗`);
	else if (!String(s).includes(chain.registry)) problems.push(`✗ **驱动层缺线**：\`${chain.source}\` 不是从**注册表 \`${chain.registry}\`** 取门 ✗（换枚举源 ⇒ 注册表不再是唯一枚举源 ✓）`);
	return problems;
};

/** 核对（**纯函数 ＋ 全部注入** → 自证能喂假事实）。 */
export const wiringProblems = ({ read = realRead, list = () => readdirSync(GATE_DIR), dir = GATE_DIR, registry = registryFlags(), anchors = GATE_ANCHORS } = {}) => {
	const problems = [];
	const files = list().filter((f) => f.endsWith('.mjs')).sort();
	const fromModules = [];
	for (const f of files) {
		const path = `${dir}/${f}`;
		const src = read(path);
		if (!src) { problems.push(`✗ **接线缺失**：门模块 \`${path}\` **读不到** ✗（被删/改名 ⇒ 接线面失守）`); continue; }
		const fl = moduleFlags(src);
		const fl0 = fl[0];
		// 前置（验收第 3 条）：**词法读数不成立**与**接线缺失**分开报
		const { text: maskedText, unclosed } = mask(src);
		if (Array.isArray(unclosed) && unclosed.length) {
			problems.push(`✗ **读数不成立**（不是接线缺失 ✗）：\`${path}\` 的词法遮蔽报告未闭合 ${unclosed.length} 处 ⇒ 本门的接线读数不成立 ✓`);
			continue;
		}
		if (!fl.length) problems.push(`✗ **接线缺失**：\`${path}\` **没有声明 \`flags\`** ✗ ⇒ 在两面比对里不可见 ✓`);
		const sym = anchors[fl0] ?? '';
		if (!sym) problems.push(`✗ **接线缺失**：\`${path}\` 的 flag \`${fl0}\` **没在 \`GATE_ANCHORS\` 登记锚** ✗`);
		else {
			//注意：必须带**标识符边界** —— 否则 `judgeConsequencesX` 因以 `judgeConsequences` 开头而被数成 1 处（实测踩过）
			const n = [...src.matchAll(new RegExp('export const ' + sym + '\\b', 'g'))].length;
			if (n !== 1) problems.push(`✗ **接线缺失**：\`${path}\` 的锚 \`export const ${sym}\` 出现 **${n}** 处（须恰 1 ⇒ 0＝判据体被删 ✓／≥2＝锚不唯一 ⇒ 读数不可信 ✓）`);
			const region = (() => { const r = runRegionOf(maskedText); return r === null ? null : blankLiteralsLinewise(r); })();
			if (region === null) problems.push(`✗ **接线缺失**：\`${path}\` 取不到 \`export const run\` 那一段 ✗`);
			else if (!region.includes(`${sym}(`)) problems.push(`✗ **接线缺失**：\`${path}\` 的锚 \`${sym}\` **没有在 \`run\` 那一段里被调用**（判的是 \`${sym}(\` **调用形态** ✗ —— 不是"名字出现过"✓）`);
			const named = [...src.matchAll(/export const ([A-Za-z_$][\w$]*) = /g)].map((m) => m[1]).filter((x) => x !== 'run' && x !== 'flag' && x !== 'flags');
			if (!named.length) problems.push(`✗ **接线缺失**：\`${path}\` 除 \`run\` 外**没有具名判据导出** ✗（内联在 \`run\` 里 ⇒ 掏空 \`run\` 锚检照样绿 ✓）`);
		}
		fromModules.push(...fl);
	}
	problems.push(...driverProblems({ read }));   // `#1100` 驱动层：注册表 → 被驱动（接进主核对 → 对**真的**驱动器跑一次）
	const a = [...new Set(fromModules)].sort();
	const b = [...registry];
	const onlyA = a.filter((x) => !b.includes(x));
	const onlyB = b.filter((x) => !a.includes(x));
	const face = `○ 判据接线：门模块侧 ${a.length} 个 flag（${a.join('、')}）｜registry 侧 ${b.length} 个（${b.join('、')}）`
		+ `｜ 差集：模块独有 [${onlyA.join('、')}] · registry 独有 [${onlyB.join('、')}]`;
	if (onlyA.length || onlyB.length) {
		problems.push(`✗ **接线两面不等**：${face} ⇒ 新增/改名门必须**两边同改** ✗（B′2：这正是本判据的收益 ✓）`);
	}
	return { problems, face, moduleFlags: a, registryFlags: b, onlyA, onlyB };
};
