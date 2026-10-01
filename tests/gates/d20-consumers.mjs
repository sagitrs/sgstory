#!/usr/bin/env node
/* d20 消费点**差集门**（`#1804`；D 席 dev-9 提，领队准）
 *
 * ## 要防的
 *   `d20()`（各包 00-init 定义的 1d20）**可以在任何地方被调用** ⇒ 新落点**没人知道**。
 *   而 d20 是**一切检定的基础**（pin: `2msrdbasics基本-d20m.md:37`）⇒ 它的消费面**应当是已知集合**：
 *   将来要做「检定管线」／「掷骰确定性」／「优势劣势统一」时，**第一件事就是知道谁在掷**。
 *   ⇒ 本门把该集合**具名化**，新落点**即点名**（形态同 `merge.md:147` 的「**枚举 vs 实际集合**」差集断言）。
 *
 * ## 判据
 *   ① 出现**不在具名白名单**里的 d20 消费/定义点 ⇒ **红**（并**点名**文件与次数）
 *   ② 白名单里的文件**次数变了**（多 ⇒ 红；少 ⇒ 绿但出声，同 `host-touchpoints` 的棘轮取向）
 *   ③ 白名单含**本仓已不存在的文件** ⇒ 红（过期登记，承【过期兼容】）
 *   ④ **本条界定判据①的覆盖范围**：识别形见 `CALL_RE`／**`DEF_RE`（家族 A 的定义点）**／`CHECKROLL_RE`／`ADV_*_RE`；
 *      本门**不识别**的形见 `KNOWN_BLIND_SPOTS`（**每次运行打印**，✗ 静默不覆盖）。
 *      ⇒ 判据①只覆盖**已识别形** —— ✗ 读成「凡是掷 d20 的都被管住」。
 *      ★为何要写进**判据节**（而非只留在家族清单里）：判据节是**规范面**，
 *        家族清单是**描述**；同一件事两处陈述时，**读者据规范面判断**（`#1819` RC 的教训）。
 *
 * ## 口径（★读数须注明）
 *   · **代码面**：复用 `host-touchpoints.mjs` 的 `stripCommentsAndStrings`（✗ 各写一套剥法 ——
 *     本席在 `#1810` 实测过：朴素剥法遇「正则字面量含引号」会**吞半份文件**、**静默漏计**；
 *     共用一份 ⇒ 两门**同口径**，且修一处两门同受益）；
 *   · 识别形：**调用** `X.d20(`（含 `?.` 可选链）与**定义** `setup.X.d20 =`；
 *   · 扫描面 `src/**`（含各包）；计数单位＝命中次数。
 *
 * 用法：node tests/gates/d20-consumers.mjs [--verbose] [--selftest]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { stripCommentsAndStrings } from './host-touchpoints.mjs';

/** ★本文件自己的「是否直接运行」（**✗ 复用宿主文件算出来的那个**：
 *  它在宿主模块里用**宿主的** `import.meta.url` 计算 ⇒ 对导入方恒为 false —— 本席实测踩到，
 *  表现为「`--selftest` 一声不响、rc=0」，即**自检根本没跑**。
 *  ⇒ 凡跨模块判定「是否主模块」，**必须用各自的 `import.meta.url`**。 */
const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));

/** 定义点（应当恰每个包一处：各包 00-init 的 `setup.X.d20 = …`） */
export const DEFINITIONS = {
	'src/dnd/dnd-5e/00-init.js': 1,
	'src/dnd/dnd3/00-init.js': 1,
	'src/dnd/d20m/00-init.js': 1,
};

/** 消费点白名单 —— ★**按语义类别分组**（领队 2026-10-01 裁：类别非文件路径
 *  ⇒ 新增一个**同类**落点时只需在**该类别下加一行**，✗ 不必改两处结构）。
 *  值是「文件 → 该类别的调用次数」；同一文件可出现在多个类别（如 combat.js 兼具攻击骰与重击确认）。 */
export const CONSUMER_CATEGORIES = {
	'攻击骰': {
		'src/dnd/dnd-5e/core/combat.js': 1,
		'src/dnd/dnd3/core/combat.js': 1,
		'src/dnd/d20m/core/combat.js': 1,
	},
	'重击确认': {
		'src/dnd/dnd3/core/combat.js': 1,
		'src/dnd/d20m/core/combat.js': 1,
	},
	'陷阱/开箱/投掷物': {
		'src/dnd/dnd3/items/trap-shock.js': 1,
		'src/dnd/dnd3/items/trap-needle.js': 1,
		'src/dnd/dnd3/items/trap-fire.js': 1,
		'src/dnd/dnd3/items/bomb.js': 1,
	},
};

/** 由类别表摊平出「文件 → 期望总次数」（同一文件跨类别时**求和**） */
export const flattenCategories = (cats = CONSUMER_CATEGORIES) => {
	const out = {};
	for (const files of Object.values(cats)) {
		for (const [f, n] of Object.entries(files)) out[f] = (out[f] ?? 0) + n;
	}
	return out;
};

const CONSUMERS = flattenCategories();

/**
 * ★**静态认不出的形**（`#1819` RC 裁：照姊妹门 `#1810` 的 `KNOWN_BLIND_SPOTS` **同判据一致适用**）——
 *   本门**每次打印**，使边界**可见**（✗ 静默不覆盖）。
 *   ★为何用「明账」而非「尽力正则」：这些形**需要类型/数据流分析**才能认出，
 *     正则硬做只会造**假正**（把变量名当骰面）—— 与 `#1810` 同判据。
 *   ★规范层 vs 描述层（本席自纠）：`DEFINITIONS`／各类白名单是**判据**（须准确、须被差集核）；
 *     本表是**描述**（述「我们不覆盖什么」）⇒ 两者**不可混**：本席首版正是在同一文件里
 *     对同一件事**两处陈述取了弱的**（注释写「消费 0」而表里已有更准的信息）。
 */
export const KNOWN_BLIND_SPOTS = [
	{ shape: "裸 `RPG.roll('1d20')`（第四形）",
		example: "setup.DND5E.d20 = () => setup.RPG.roll('1d20');",
		why: "骰面是**字符串实参** ⇒ 认它须做**跨语句常量传播**（`const S = '1d20'; roll(S)` 同理）；"
			+ "正则硬做会把变量名当骰面 ⇒ 假正。本仓现**仅见于各包 00-init 的定义点**（那里是"
			+ "**它唯一该在的地方**），且**全部服务于家族 A/C**（`d20`／`d20adv`／`d20dis`）"
			+ "⇒ 其消费已由 A/C 覆盖。" },
	{ shape: '间接骰面（变量/常量）', example: "const DIE = '1d20'; RPG.roll(DIE);",
		why: '同上：须常量传播' },
	{ shape: "别名包装", example: "const R = RPG.roll; R('1d20');",
		why: '别名可任意重命名，静态不可追（同 #1810）' },
];

/** 家族 C 定义点白名单（2 处，同一文件：d20adv ＋ d20dis） */
export const ADV_DEFS = { 'src/dnd/dnd-5e/00-init.js': 2 };

/** 家族 B 白名单 —— 按语义类别（与家族 A 同规）。★新增 `checkRoll` 落点须在此登记。 */
export const CHECKROLL_CATEGORIES = {
	'豁免': {
		'src/dnd/dnd-5e/core/conditions.js': 1,
		'src/dnd/dnd3/core/saves.js': 1,
		'src/dnd/dnd3/core/traumas.js': 1,
	},
	'陷阱/开箱/投掷物': {
		'src/dnd/dnd3/core/chest.js': 1,
	},
};
const CHECKROLLS = flattenCategories(CHECKROLL_CATEGORIES);

/** 家族 C 白名单（`#1819` RC 裁甲）—— **纳入两向差集**，✗ 仅打印。
 *  ★理由（RC 原文）：C 是**新落点不会受阻**的那一支，且正是本门自述动因
 *    （「优势/劣势统一」）的**工作面** ⇒ 只打印＝新落点无人拦（本席首版即栽：注释写 0、实际 2，无人抓）。 */
export const ADV_CATEGORIES = {
	'优势/劣势骰': {
		'src/dnd/dnd-5e/core/combat.js': 2,      // :185 advantage ／ :186 disadvantage
	},
};
const ADVS = flattenCategories(ADV_CATEGORIES);

/* ★★**三个家族**（本门首版只覆盖 A ⇒ 又是一次「枚举 vs 实际集合」的自犯）：
 *   **A 包级 `X.d20()`** —— 各包 00-init 定义的基础骰；
 *   **B core 级 `RPG.checkRoll(...)`** —— `#1809`（E1a）新增的**判定式收敛入口**，其 `die` 缺省 `'1d20'`
 *     ⇒ **它就是 d20 掷骰**，却**不含 `d20` 字样** ⇒ 首版正则**看不见**。本席实测：
 *     `#1809` 已把 A 的 **4 处**（conditions／saves／traumas／chest）**迁到 B** ——
 *     即**家族 A 的白名单当场减少**（本门的「向 B」方向恰好如实报了出来，见提交时的输出留痕）。
 *     ⇒ 若不补 B，本门将随收敛进程**逐渐失明**（越收敛越看不见）—— 这与病灶本身同型。
 *   **C 优劣骰 `d20adv`／`d20dis`** —— 5E 独有的两个 d20 掷骰入口（定义在 `00-init`），
 *     消费在 `dnd-5e/core/combat.js` 的 advantage／disadvantage 分支。
 *     ★**本行不写数字**：门每次运行会**打印现值**（本席首版在此写死「消费 0」而实为 2 ⇒
 *       从首提交即错、且因当时**只打印不判**而**无人能抓**）。⇒ 写死数字正是陈旧陈述的成因，
 *       故此处**只述形态、不述额度**（`#1819` RC 裁：删数字非改数字）。
 *   **D 第四形 `RPG.roll('1d20')`** —— 各包 `00-init` **定义点自用**（`d20` 各 1 处；5E 的
 *     `d20adv`／`d20dis` 各 2 处）⇒ 这是**最底层**的掷骰形，绕过 `X.d20()` 与 `checkRoll()` 两条链。
 *     ⚠ 本门**不判它**（理由见 `KNOWN_BLIND_SPOTS`）。
 */
const CALL_RE = /\b[Dd](?:ND5E|ND3|20M)\s*\.\s*d20\s*(?:\?\.)?\s*\(/g;
/** 家族 B：core 级判定入口（`RPG.checkRoll(`／`setup.RPG.checkRoll(`） */
const CHECKROLL_RE = /(?<![.\w$])(?:setup\s*\.\s*)?RPG\s*\.\s*checkRoll\s*\(/g;
/** 家族 C：优劣骰（定义与消费分开数） */
const ADV_DEF_RE = /\bsetup\s*\.\s*[A-Za-z0-9_$]+\s*\.\s*d20(?:adv|dis)\s*=/g;
const ADV_CALL_RE = /\b[A-Za-z0-9_$]+\s*\.\s*d20(?:adv|dis)\s*(?:\?\.)?\s*\(/g;
const DEF_RE = /\bsetup\s*\.\s*(?:DND5E|DND3|D20M)\s*\.\s*d20\s*=/g;

const walk = (dir, out = []) => {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) { if (!['node_modules', 'dist', 'build', '.git'].includes(e.name)) walk(p, out); }
		else if (e.name.endsWith('.js')) out.push(p);
	}
	return out;
};

/** 扫描（代码面）⇒ { calls: file→n, defs: file→n } */
export const scan = (srcDir) => {
	const calls = {}, defs = {}, checkrolls = {}, advDefs = {}, advCalls = {};
	for (const f of walk(srcDir).sort()) {
		const rel = path.relative(ROOT, f).split(path.sep).join('/');
		const code = stripCommentsAndStrings(fs.readFileSync(f, 'utf8'));
		const c = code.match(new RegExp(CALL_RE.source, 'g'));
		const d = code.match(new RegExp(DEF_RE.source, 'g'));
		const cr = code.match(new RegExp(CHECKROLL_RE.source, 'g'));
		const ad = code.match(new RegExp(ADV_DEF_RE.source, 'g'));
		const ac = code.match(new RegExp(ADV_CALL_RE.source, 'g'));
		if (c) calls[rel] = c.length;
		if (d) defs[rel] = d.length;
		if (cr) checkrolls[rel] = cr.length;
		if (ad) advDefs[rel] = ad.length;
		if (ac) advCalls[rel] = ac.length;
	}
	return { calls, defs, checkrolls, advDefs, advCalls };
};

/** 判定（纯函数，便于自检刀直接调用） */
export const judge = (got, defs = DEFINITIONS, cons = CONSUMERS, exists = (f) => fs.existsSync(path.join(ROOT, f)), crs = CHECKROLLS, advs = ADVS, advDefsDef = ADV_DEFS) => {
	const problems = [], notes = [];
	/* ★**两向差集都报**（领队 2026-10-01 裁③，「枚举 vs 实际集合」的对称面）：
	 *   向 A「实况有、清单无」= **新落点** ⇒ 红；
	 *   向 B「清单有、实况无/少」= **白名单过期** ⇒ 出声（少）／红（文件已不存在）。 */
	const diff = (label, want, actual) => {
		for (const [f, n] of Object.entries(actual)) {                 // 向 A
			const w = want[f] ?? 0;
			if (n > w) problems.push(`【向 A：新落点】未登记的 d20 ${label}：${f} 期望 ${w} 处、实得 ${n} 处 ⇒ 须同笔登记进白名单并说明理由`);
		}
		for (const [f, w] of Object.entries(want)) {                   // 向 B
			const n = actual[f] ?? 0;
			if (n < w) notes.push(`【向 B：白名单过期】d20 ${label}：${f} 期望 ${w} 处、实得 ${n} 处（★减少是好事 ⇒ 请刷新白名单，否则清单松弛）`);
			if (!exists(f)) problems.push(`【向 B：白名单过期】含本仓不存在的文件 ${f}（应移除）`);
		}
	};
	diff('定义点（家族 A）', defs, got.defs);
	diff('消费点（家族 A：包级 X.d20()）', cons, got.calls);
	diff('消费点（家族 B：core 级 RPG.checkRoll）', crs, got.checkrolls ?? {});
	diff('消费点（家族 C：优劣骰 d20adv／d20dis）', advs, got.advCalls ?? {});
	diff('定义点（家族 C）', advDefsDef, got.advDefs ?? {});
	const totalA = Object.values(got.calls).reduce((a, b) => a + b, 0);
	const totalB = Object.values(got.checkrolls ?? {}).reduce((a, b) => a + b, 0);
	return {
		problems, notes,
		total: totalA + totalB, totalA, totalB,
		files: new Set([...Object.keys(got.calls), ...Object.keys(got.checkrolls ?? {})]).size,
		advDefs: Object.values(got.advDefs ?? {}).reduce((a, b) => a + b, 0),
		advCalls: Object.values(got.advCalls ?? {}).reduce((a, b) => a + b, 0),
	};
};

if (isMain && has('--selftest')) {
	const alwaysExists = () => true;
	const base = { calls: { 'src/a.js': 1 }, defs: { 'src/d.js': 1 } };
	const D = { 'src/d.js': 1 }, C = { 'src/a.js': 1 };
	/* ★独立刀**自记总数**（✗ 硬编常量）：加刀忘改数 ⇒ 立刻显形（本席加 K11/K12 时即印出「13/11 刀如期」）。 */
	let standalone = 0;
	const tally = (ok) => { standalone += 1; if (ok) n += 1; };
	const knives = [
		['K0 空刀：与白名单同 ⇒ 绿', base, 0],
		['K1 新消费点（新文件）⇒ 红', { calls: { ...base.calls, 'src/new.js': 1 }, defs: base.defs }, 1],
		['K2 既有文件消费增多（1→2）⇒ 红', { calls: { 'src/a.js': 2 }, defs: base.defs }, 1],
		['K3 减少（1→0）⇒ 绿但出声', { calls: {}, defs: base.defs }, 0],
		['K4 新定义点（第二处 d20 定义）⇒ 红', { calls: base.calls, defs: { 'src/d.js': 1, 'src/d2.js': 1 } }, 1],
		['K5 过期登记（白名单文件已不存在）⇒ 红', { calls: {}, defs: {} }, 1],
	];
	let n = 0;
	for (const [name, got, want] of knives) {
		const exc = name.includes('过期') ? () => false : alwaysExists;
		const r = judge(got, D, C, exc);
		const v = r.problems.length === 0 ? 0 : 1;
		const ok = v === want; n += ok ? 1 : 0;   /* 数组内刀：总数由 knives.length 计，✗ tally */
		console.log(`  ${ok ? '✓' : '✗'} ${name} — 实得 ${v === 0 ? '绿' : '红'}（期望 ${want === 0 ? '绿' : '红'}）`);
	}
	/* 口径刀：注释里的 d20 调用**不得**计入（共用剥法） */
	const src = "// DND5E.d20() 注释\nconst a = DND5E.d20(); /* DND3.d20() */";
	const cnt = (stripCommentsAndStrings(src).match(new RegExp(CALL_RE.source, 'g')) ?? []).length;
	const ok = cnt === 1; tally(ok);
	console.log(`  ${ok ? '✓' : '✗'} K6 注释里的 d20 调用不计（只算代码面那 1 处）— 实得 ${cnt}`);
	/* 类别摊平刀：同一文件出现在两个类别 ⇒ 期望值须**求和**（✗ 取其一）
	 *   —— 真实例即 `combat.js`（攻击骰 1 ＋ 重击确认 1 ⇒ 期望 2）。 */
	const flat = flattenCategories({ A: { 'f.js': 1 }, B: { 'f.js': 2, 'g.js': 1 } });
	const okF = flat['f.js'] === 3 && flat['g.js'] === 1; tally(okF);
	console.log(`  ${okF ? '✓' : '✗'} K7 同一文件跨类别 ⇒ 期望值**求和**（f.js 应 3，实得 ${flat['f.js']}）`);
	/* 两向差集刀：向 A（新落点）红；向 B（白名单多报）出声但**不红**（减少是好事） */
	const gotA = judge({ calls: { 'src/a.js': 1, 'src/new.js': 1 }, defs: { 'src/d.js': 1 } }, D, C, alwaysExists);
	const okA = gotA.problems.length === 1 && /向 A/.test(gotA.problems[0]); tally(okA);
	console.log(`  ${okA ? '✓' : '✗'} K8 向 A（新落点）⇒ 红且**具名**「向 A」— 实得 ${gotA.problems.length} 问题`);
	/* 家族 B 刀：新增 checkRoll 落点 ⇒ 红（首版正则看不见它 ⇒ 本刀在原形上绿） */
	const gotCR = judge({ calls: {}, defs: { 'src/d.js': 1 }, checkrolls: { 'src/rc.js': 1 } }, D, C, alwaysExists, {});
	const okCR = gotCR.problems.some((x) => /家族 B/.test(x)); tally(okCR);
	console.log(`  ${okCR ? '✓' : '✗'} K10 家族 B（checkRoll）未登记 ⇒ 红 — 实得 ${gotCR.problems.length} 问题`);
	/* ★★K11／K12 —— **家族 C 的差集判据**须有刀守护（`#1819` RC 折毕自查时抓到**本席自己的洞**）：
	 *   折 RC 时我**声称**「家族 C 已纳入两向差集」，但自检里**没有任何刀喂 `advs`／`advDefs`**
	 *   ⇒ **实证**：把 judge() 里家族 C 的两条 `diff(...)` 整行删掉，自检**仍 11/11 全绿**
	 *   ⇒ 即「C 已纳入」这一声称**无刀守护、可被静默删除**（正是本门立案的病灶本身，栽在我自己折的那一刀上）。
	 *   ⇒ 本刀**断判决**（✗ 只断读数）：喂「C 新落点」期望**红**——若那两条 diff 被删，problems 为空 ⇒ 本刀**红**。
	 *   与 K10 的分工：K10 守家族 B，K11／K12 守家族 C 的**消费面／定义面**，三家族各有刀。 */
	const gotC = judge({ calls: base.calls, defs: base.defs, advCalls: { 'src/adv.js': 1 } }, D, C, alwaysExists, {}, { 'src/a.js': 1 });
	const okC = gotC.problems.some((x) => /家族 C/.test(x)); tally(okC);
	console.log(`  ${okC ? '✓' : '✗'} K11 家族 C（优劣骰消费）未登记 ⇒ 红 — 实得 ${gotC.problems.length} 问题`);
	const gotC2 = judge({ calls: base.calls, defs: base.defs, advDefs: { 'src/adv2.js': 1 } }, D, C, alwaysExists, {}, { 'src/a.js': 1 }, {});
	const okC2 = gotC2.problems.some((x) => /家族 C/.test(x)); tally(okC2);
	console.log(`  ${okC2 ? '✓' : '✗'} K12 家族 C（优劣骰定义）未登记 ⇒ 红 — 实得 ${gotC2.problems.length} 问题`);
	/* ★★K24 **识别形集合对账刀**（`#1834` 评审判可取）：断「**判据 ④ 点名的识别形集**」==
	 *   「**实现实际声明的识别形集**」。★它的来由：本笔首版 ④ 只点了 4 个，而实现有 5 个
	 *   （漏 `DEF_RE` —— 家族 A 的**定义点**）⇒ **④ 自称界定判据①的覆盖范围，却漏掉一支**，
	 *   而**判据①明写覆盖「消费／定义点」** ⇒ 读者据规范面会错判。**即 ④ 本身要修的那类病，栽在 ④ 上**。
	 *   ⇒ 本刀把「枚举 vs 实际集合」（本门判据①对**消费点**做的事）**用到识别形自己头上**。
	 *   ★为何不是「文字存在性刀」（K23 是后者，且被裁不做）：本刀断的是**两个集合相等**，
	 *     可机械核（✗ 断言「注释里出现某词」那种假装机械化）。
	 *   ⚠ 自含性：本刀**不内嵌任何识别形名**（名字从**源码**抽），故**不存在自我命中**（K23 首版的坑）。 */
	{
		const self2 = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
		/* 实现面：源码里声明为**正则字面量**的识别形（`const X_RE = /…/`） */
		const declared = [...self2.matchAll(/^const ([A-Z][A-Z0-9_]*_RE) = \//gm)].map((m) => m[1]);   // ★名里可含 `_`（`ADV_DEF_RE` 等）—— 首版本席漏了它 ⇒ 只抽到 3 个（自证：读数 3/3 而非 5/5）
		/* 规范面：判据 ④ 那一段里**反引号包起来的**识别形（含 `ADV_*_RE` 这类通配） */
		const i4 = self2.indexOf('本条界定判据①的覆盖范围');
		const block = i4 >= 0 ? self2.slice(i4, i4 + 400) : '';
		const pats = [...block.matchAll(/`([A-Z][A-Z0-9_*]*_RE)`/g)].map((m) => m[1]);   // ★同上：含 `_`
		const expand = (pat) => declared.filter((d) => new RegExp('^' + pat.replace(/\*/g, '[A-Z0-9]*') + '$').test(d));
		const namedSet = new Set(pats.flatMap(expand));
		const missing = declared.filter((d) => !namedSet.has(d));          // 实现有、④ 未点名
		const dangling = pats.filter((pat) => expand(pat).length === 0);   // ④ 点名了、实现里不存在（写错/陈旧）
		const okS = declared.length > 0 && missing.length === 0 && dangling.length === 0;
		tally(okS);
		console.log(`  ${okS ? '✓' : '✗'} K24 ★识别形集合对账：④ 点名 ${namedSet.size} ／ 实现声明 ${declared.length}`
			+ (okS ? '' : ` —— ④ 漏 ${missing.join(',') || '（无）'}${dangling.length ? ` ／ ④ 悬空 ${dangling.join(',')}` : ''}`));
	}
	const gotB = judge({ calls: {}, defs: { 'src/d.js': 1 } }, D, C, alwaysExists);
	const okB = gotB.problems.length === 0 && gotB.notes.some((x) => /向 B/.test(x)); tally(okB);
	console.log(`  ${okB ? '✓' : '✗'} K9 向 B（白名单多报）⇒ **出声不红**（减少是好事）— notes=${gotB.notes.length} problems=${gotB.problems.length}`);
	/* ★总数为**硬编常量**是陈旧陈述的温床（本席刚在此栽过：加 K11/K12 后印出「13/11 刀如期」）。
	 *   ⇒ 改为**数实际断言次数**：每加一刀忘改总数 ⇒ 立刻显形（✗ 静默错报）。 */
	const total = knives.length + standalone;
	console.log(n === total ? `  ✓ ${n}/${total} 刀全部如期` : `  ✗ ${n}/${total} 刀如期`);
	process.exit(n === total ? 0 : 1);
}

function main() {
const got = scan(path.join(ROOT, 'src'));
const { problems, notes, total, files, totalA, totalB, advDefs, advCalls } = judge(got);
console.log('  d20 消费点差集门（#1804；枚举 vs 实际集合）');
console.log(`  扫描面 src/**（代码面；剥法共用 host-touchpoints.mjs）`);
console.log(`  定义点 ${Object.keys(got.defs).length} 处 ／ 消费点 **A ${totalA} ＋ B ${totalB} ＝ ${total}** 处 ／ 涉及 ${files} 个文件`);
console.log(`  家族 C（优劣骰 d20adv／d20dis）：定义 ${advDefs} 处 ／ 消费 ${advCalls} 处`
	+ '（本门**单列**，使「有这个家族」可见，✗ 静默不列）');
console.log(`  白名单：${Object.keys(CONSUMER_CATEGORIES).length} 个语义类别 —— `
	+ Object.entries(CONSUMER_CATEGORIES).map(([c, fs]) => `${c}(${Object.keys(fs).length} 文件)`).join(' ｜ '));
if (has('--verbose')) for (const [f, n] of Object.entries(got.calls).sort()) console.log(`    · ${f}：${n}`);
for (const nt of notes) console.log(`  ⚠ ${nt}`);
if (problems.length) {
	console.log('  ✗ 门红：');
	for (const p of problems) console.log(`    - ${p}`);
	process.exit(1);
}
/* ★已知盲区**明账**（照姊妹门 #1810 同判据）：每次打印，使边界**可见**。 */
console.log(`  ⚠ 静态**认不出**的形（已知边界，明账 ${KNOWN_BLIND_SPOTS.length} 项，✗ 表示覆盖）：`);
for (const b of KNOWN_BLIND_SPOTS) console.log(`      · ${b.shape}：${b.example} —— ${b.why}`);
console.log('  ✓ 门绿（d20 消费面与具名白名单一致）');
}

if (isMain) main();
