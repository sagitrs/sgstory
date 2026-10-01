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
import { pathToFileURL } from 'node:url';
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

/* ★★**三个家族**（本门首版只覆盖 A ⇒ 又是一次「枚举 vs 实际集合」的自犯）：
 *   **A 包级 `X.d20()`** —— 各包 00-init 定义的基础骰；
 *   **B core 级 `RPG.checkRoll(...)`** —— `#1809`（E1a）新增的**判定式收敛入口**，其 `die` 缺省 `'1d20'`
 *     ⇒ **它就是 d20 掷骰**，却**不含 `d20` 字样** ⇒ 首版正则**看不见**。本席实测：
 *     `#1809` 已把 A 的 **4 处**（conditions／saves／traumas／chest）**迁到 B** ——
 *     即**家族 A 的白名单当场减少**（本门的「向 B」方向恰好如实报了出来，见提交时的输出留痕）。
 *     ⇒ 若不补 B，本门将随收敛进程**逐渐失明**（越收敛越看不见）—— 这与病灶本身同型。
 *   **C 优劣骰 `d20adv`／`d20dis`** —— 5E 独有的两个 d20 掷骰入口（定义在 00-init）。
 *     本门**单列其定义数与消费数**（本仓消费 **0**），使「有这个家族」**可见**（✗ 静默不列）。 */
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
export const judge = (got, defs = DEFINITIONS, cons = CONSUMERS, exists = (f) => fs.existsSync(path.join(ROOT, f)), crs = CHECKROLLS) => {
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
		const ok = v === want; n += ok ? 1 : 0;
		console.log(`  ${ok ? '✓' : '✗'} ${name} — 实得 ${v === 0 ? '绿' : '红'}（期望 ${want === 0 ? '绿' : '红'}）`);
	}
	/* 口径刀：注释里的 d20 调用**不得**计入（共用剥法） */
	const src = "// DND5E.d20() 注释\nconst a = DND5E.d20(); /* DND3.d20() */";
	const cnt = (stripCommentsAndStrings(src).match(new RegExp(CALL_RE.source, 'g')) ?? []).length;
	const ok = cnt === 1; n += ok ? 1 : 0;
	console.log(`  ${ok ? '✓' : '✗'} K6 注释里的 d20 调用不计（只算代码面那 1 处）— 实得 ${cnt}`);
	/* 类别摊平刀：同一文件出现在两个类别 ⇒ 期望值须**求和**（✗ 取其一）
	 *   —— 真实例即 `combat.js`（攻击骰 1 ＋ 重击确认 1 ⇒ 期望 2）。 */
	const flat = flattenCategories({ A: { 'f.js': 1 }, B: { 'f.js': 2, 'g.js': 1 } });
	const okF = flat['f.js'] === 3 && flat['g.js'] === 1; n += okF ? 1 : 0;
	console.log(`  ${okF ? '✓' : '✗'} K7 同一文件跨类别 ⇒ 期望值**求和**（f.js 应 3，实得 ${flat['f.js']}）`);
	/* 两向差集刀：向 A（新落点）红；向 B（白名单多报）出声但**不红**（减少是好事） */
	const gotA = judge({ calls: { 'src/a.js': 1, 'src/new.js': 1 }, defs: { 'src/d.js': 1 } }, D, C, alwaysExists);
	const okA = gotA.problems.length === 1 && /向 A/.test(gotA.problems[0]); n += okA ? 1 : 0;
	console.log(`  ${okA ? '✓' : '✗'} K8 向 A（新落点）⇒ 红且**具名**「向 A」— 实得 ${gotA.problems.length} 问题`);
	/* 家族 B 刀：新增 checkRoll 落点 ⇒ 红（首版正则看不见它 ⇒ 本刀在原形上绿） */
	const gotCR = judge({ calls: {}, defs: { 'src/d.js': 1 }, checkrolls: { 'src/rc.js': 1 } }, D, C, alwaysExists, {});
	const okCR = gotCR.problems.some((x) => /家族 B/.test(x)); n += 1 ? (okCR ? 1 : 0) : 0;
	console.log(`  ${okCR ? '✓' : '✗'} K10 家族 B（checkRoll）未登记 ⇒ 红 — 实得 ${gotCR.problems.length} 问题`);
	const gotB = judge({ calls: {}, defs: { 'src/d.js': 1 } }, D, C, alwaysExists);
	const okB = gotB.problems.length === 0 && gotB.notes.some((x) => /向 B/.test(x)); n += okB ? 1 : 0;
	console.log(`  ${okB ? '✓' : '✗'} K9 向 B（白名单多报）⇒ **出声不红**（减少是好事）— notes=${gotB.notes.length} problems=${gotB.problems.length}`);
	const total = knives.length + 5;
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
console.log('  ✓ 门绿（d20 消费面与具名白名单一致）');
}

if (isMain) main();
