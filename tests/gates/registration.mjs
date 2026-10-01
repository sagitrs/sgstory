#!/usr/bin/env node
/* 注册面 fail-loud 门（`#1804` 件一；病根⑤「注册面静默遮蔽」）
 *
 * ## 病灶（本条要治的）
 *   `defItem`／`defCharacter`／`defEffect`／`registerItem` 遇重复 id **只 `console.warn` 然后覆盖**
 *   （`10-item.js:75`／`17-effect.js:87`／`20-character.js:229`）⇒ **谁被遮蔽取决于加载序**，
 *   且**无人被拦**。实证：`chain-shirt` 首踩（`#1782`）、`iron-sword`／`iron-longsword` 撞车（`#1788`）＋
 *   `#1743` 的跨包族。当时是 **dev-10 手工 `grep` 求「全仓零交集」＝人肉当门**（`#1781`）。
 *
 * ## 判据（本门机械化的正是那次手工 grep）
 *   ① **同包重定义**（同一 `(包, id)` 声明 ≥2 次）⇒ **红**（真错；当前 **0** 例 ⇒ 零误伤）
 *   ② **跨包同 id** ⇒ 须在 `registration-ledger.json` **登记**（每项须有 `reason` ＋ `ticket`），
 *      未登记 ⇒ **红**。★现状 10 例（`#1743` 的处置面）⇒ 本门**不假装它们不存在**，而是把它们**钉在册上**：
 *      登记即声明「这是**已知且被接受的**」，未登记的**新**冲突当场红。
 *   ③ 登记项缺 `reason`／`ticket` ⇒ **红**（承【过期兼容】纪律：说不出「当初为何加」即视为过期）。
 *
 * ## ★为何是 **CI 门**而非「装载期 throw」（本席实测的取舍，须留痕）
 *   件一原文要「装载期 error」。实测：**跨包同 id 现 10 例**（`club`／`player` 各跨 3 包；
 *   items 6：bandage/bomb/boots/club/coin/sword；characters 4：player/goblin/goblin-boss/guard）
 *   ⇒ 若装载期直接 throw，**两个规则包一加载即亡**（单测、游戏全灭）。
 *   ⇒ 故本门落在 **CI**：**在合入前拦住新的遮蔽**（这正是那次人肉 grep 的位置），
 *     而**不**在运行期把既有内容炸掉。真正的「装载期 throw」须待：
 *     ⑴ `#1743` 处置完 10 例（前缀化／命名空间／显式拒绝三选一）
 *     ⑵ 注册 API 带上**所属包**（现 `defItem` 在 core 层，✗ 不知道自己属于哪个包）
 *     ⑶ 测试夹具不得跨用例泄漏注册（`#1750` 在册：`__resetState` 不清注册表 ⇒ 现 `u-god-sword` 等**测试自重定义**）
 *     三条齐备后，本门的判据可原样搬到 `registerItem` 里变成 throw（判据是同一套）。
 *
 * 用法：node tests/gates/registration.mjs [--root <dir>] [--verbose]
 *       node tests/gates/registration.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(valOf('--root') ?? path.join(import.meta.dirname, '..', '..'));
const VERBOSE = has('--verbose');

/* ---------------- 声明侦察（三种形） ----------------
 *
 * ★★`#1807` T 席（代行 `sagitrs-developer`）实测出一条 **BLOCKING**：本门**首版只认**「`id` 是紧跟
 *   注册调用处的字符串字面量」⇒ **两条常见形一律不可见**：
 *     ① **builder 形**：`DND3.IronLongsword = ironWeapon({ id: 'iron-longsword', … })`
 *        （builder 定义体写的是 `RPG.defItem({ id: def.id, … })` ⇒ 两处都不含字面量 id）；
 *     ② **循环形**：`for (const [id, cond] of Object.entries(DND5E.Conditions)) RPG.defEffect({ id, … })`
 *        （`conditions.js` 的 **15** 条 effect 全走此形）。
 *   ⇒ 运行期唯一 id **100**（items 65／characters 14／effects 21，T 席直读注册表），而首版只扫到 **59** 条声明
 *     ⇒ **约四成不可见**，且**动机案例 `#1788`（iron-sword／iron-longsword）自己就不可见**。
 *
 * ## 本版的处置（三形分别对待，✗ 一律含糊过去）
 *   ① **字面量形** ⇒ 精确收集（原形）；
 *   ② **builder 形** ⇒ **两步**：先找出「builder 函数」（其函数体调用注册 API 者），再收其**调用点**的
 *      字面量 id —— 覆盖 `iron-lineage.js` 那 7 件铁器（`#1788` 的当事族）；
 *   ③ **循环形** ⇒ **静态不可解析**（`id` 来自 `Object.entries`）。★**不假装覆盖**：另计
 *      `unresolvable` 数并**每次打印**，且**未登记即红**（见 `KNOWN_UNRESOLVABLE`）——
 *      把「扫不到」从**静默**变成**明账**（这是本条相对首版最重要的改变）。
 */

/** ① 字面量形（紧贴注册调用） */
const DECL_RE = /(?:defItem|defCharacter|defEffect|registerItem)\s*\(\s*\{?[^)]*?\bid:\s*'([^']+)'/gs;
/** ③ 循环/简写形：`{ id, … }` 紧贴注册调用 ⇒ `id` 是变量，**静态不可解析** */
const SHORTHAND_RE = /(?:defItem|defCharacter|defEffect|registerItem)\s*\(\s*\{[^}]*?\bid\s*,(?!\s*:)/gs;
/** ①′ 引用形（**须排除**）：`items: [{ id: 'club' }]`、`inventory: […]` —— 那是**携带**而非**声明** */
const REF_RE = /(?:items|inventory)\s*:\s*\[[^\]]*\]/gs;

/** ② builder 函数名：函数体里调用注册 API 者（`const ironWeapon = (def) => RPG.defItem({ id: def.id, … })`） */
const findBuilders = (src) => {
	const names = new Set();
	const DEF_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b[^(]*)?\([^)]*\)\s*=>\s*\{?/g;
	for (const m of src.matchAll(DEF_RE)) {
		// 取该定义之后的 400 字符窗口，看是否调用注册 API
		const win = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
		const body = win.slice(0, win.indexOf('\n}') >= 0 ? win.indexOf('\n}') : 400);
		if (/\b(?:RPG|setup\.RPG)\s*\.\s*(?:defItem|defCharacter|defEffect|registerItem)\b/.test(body)) names.add(m[1]);
	}
	/* 也收「回调式 builder 定义」：`function ironWeapon(def) { return RPG.defItem(…) }` */
	for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
		const win = src.slice(m.index, m.index + 500);
		if (/\b(?:RPG|setup\.RPG)\s*\.\s*(?:defItem|defCharacter|defEffect|registerItem)\b/.test(win)) names.add(m[1]);
	}
	return [...names];
};

const walk = (dir, out = []) => {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) { if (!['node_modules', 'dist', 'build', '.git'].includes(e.name)) walk(p, out); }
		else if (e.name.endsWith('.js')) out.push(p);
	}
	return out;
};

/** 收集声明：id → [{ pack, file }] */
const collect = (srcDir) => {
	const rows = [];
	const unresolvable = [];
	for (const f of walk(srcDir).sort()) {
		const rel = path.relative(ROOT, f).split(path.sep).join('/');
		const pack = rel.startsWith('src/dnd/') ? rel.split('/')[2] : 'core';
		const raw = fs.readFileSync(f, 'utf8');
		const code = raw.replace(REF_RE, '');          // ★排除 `items: [{id}]` 引用形
		for (const m of code.matchAll(DECL_RE)) rows.push({ id: m[1], pack, file: rel });
		/* ② builder 调用点：`ironWeapon({ id: 'iron-longsword', … })` */
		for (const b of findBuilders(raw)) {
			const CALL_RE = new RegExp(`\\b${b}\\s*\\(\\s*\\{[^)]*?\\bid:\\s*'([^']+)'`, 'gs');
			for (const m of code.matchAll(CALL_RE)) rows.push({ id: m[1], pack, file: rel, via: b });
		}
		/* ③ 循环/简写形 ⇒ 明账（✗ 静默） */
		const sh = code.match(SHORTHAND_RE);
		if (sh) unresolvable.push({ file: rel, n: sh.length });
	}
	return { rows, unresolvable };
};

const loadLedger = () => {
	const p = path.join(ROOT, 'tests/gates/registration-ledger.json');
	if (!fs.existsSync(p)) return { entries: null, path: p };
	return { entries: JSON.parse(fs.readFileSync(p, 'utf8')), path: p };
};

/** 核心判定（纯函数，便于自检刀直接调用） */
const judge = (rows, ledger) => {
	const problems = [];
	const byId = new Map();
	for (const r of rows) {
		if (!byId.has(r.id)) byId.set(r.id, []);
		byId.get(r.id).push(r);
	}
	const samePack = [];
	const crossPack = [];
	for (const [id, rs] of [...byId].sort()) {
		const packs = [...new Set(rs.map((r) => r.pack))];
		/* ★① 同包重复：**对所有 id 都查**（`#1807` 交接缺口：原形把它放在「单包」分支里 ⇒
		 *   **跨包 id 走不到** ⇒ 那种 id 的同包重复被**漏检**。本席复现：`club` 在 dnd3 声明 2 次
		 *   且 dnd-5e 也有 ⇒ 原形 `problems` 为**空**（跨包分支只查台账）。tester-4 改派前核出。）
		 *   ★原自检刀 K1 的输入恰是「**只有单包**的重复」⇒ 落在**有效**的那条分支上 ⇒ 缺口零覆盖
		 *     （「输入若落在不受影响的路径上，用例就没有判别力」的同族）。补 K9 覆盖。 */
		const perPack = new Map();
		for (const r of rs) perPack.set(r.pack, (perPack.get(r.pack) ?? 0) + 1);
		for (const [pk, n] of [...perPack].sort()) {
			if (n <= 1) continue;
			const files = rs.filter((r) => r.pack === pk).map((r) => r.file);
			samePack.push({ id, pack: pk, n, files });
			problems.push(`同包重定义：${pk} 的「${id}」声明 ${n} 次（${files.join('、')}）`
				+ ' ⇒ 同包内重复是**真错**（后声明者静默覆盖先声明者）'
				+ (packs.length > 1 ? '；★该 id **同时跨包**（跨包本身另按台账判）' : ''));
		}
		if (packs.length === 1) continue;
		crossPack.push({ id, packs, files: rs.map((r) => r.file) });
		/* 未登记 ⇒ 红；已登记但材料不全 ⇒ 红（承【过期兼容】） */
		if (!Object.prototype.hasOwnProperty.call(ledger, id)) {
			problems.push(`未登记的跨包同 id：「${id}」出现在 ${packs.join('／')}`
				+ ' ⇒ 须在 registration-ledger.json 登记（reason ＋ ticket），否则不得新增');
			continue;
		}
		const e = ledger[id];
		for (const k of ['reason', 'ticket']) {
			if (typeof e?.[k] !== 'string' || e[k].trim() === '') {
				problems.push(`登记项「${id}」缺 ${k} ⇒ 说不出「当初为何接受」即视为过期（【过期兼容】纪律）`);
			}
		}
	}
	/* 反向：登记了但实际已无冲突 ⇒ 也算红（防「过期登记」长存 —— 与【过期兼容】同旨）。
	 *  ⚠ `_` 前缀是**台账元数据**（如 `_note`），✗ 算登记项。 */
	for (const id of Object.keys(ledger).filter((k) => !k.startsWith('_'))) {
		if (!crossPack.some((c) => c.id === id)) {
			problems.push(`登记项「${id}」已无实际跨包冲突 ⇒ 应删除（✗ 让过期登记长存，否则台账失去信息量）`);
		}
	}
	return { problems, samePack, crossPack, declared: rows.length };
};

/** 运行期交叉判定的**纯函数**（✗ 埋在 main 里）—— 便于自检刀直接喂入。
 *  ★这是 `#1807` 二轮 RC-A 的同一条要求：**判据若不可被刀直喂，就等于没有机械承载**。 */
export const judgeRuntime = (rt, rb, declared) => {
	const problems = [], notes = [];
	if (rt == null) return { problems, notes, skip: 'no-bundle' };
	if (rt.error) return { problems, notes, skip: rt.error };
	const rtTotal = (rt.items ?? 0) + (rt.characters ?? 0) + (rt.effects ?? 0);
	if (declared > rtTotal) {
		problems.push(`静态扫描 ${declared} 条 > 运行期注册 ${rtTotal} 条 ⇒ 扫描**把引用当声明了**（假阳）`);
	}
	if (rb == null) {
		problems.push('缺 `_runtimeBaseline`（运行期上下界）⇒ ✗ 静默放过：无法判「注册量是否静默流失」或「盲区内是否新出重复」');
		return { problems, notes, rtTotal };
	}
	for (const k of ['items', 'characters', 'effects']) {
		const floor = rb.floor?.[k] ?? 0;
		if ((rt[k] ?? 0) < floor) {
			problems.push(`运行期 ${k} ${rt[k]} < 下限 ${floor} ⇒ **注册量静默流失**（应 --update-baseline 并解释，✗ 悄悄少）`);
		}
	}
	for (const kind of ['item', 'character', 'effect']) {
		const known = new Set(rb.dups?.[kind] ?? []);
		for (const id of [...new Set(rt.dups?.[kind] ?? [])]) {
			if (!known.has(id)) {
				problems.push(`★运行期**重复注册**告警出现未在册的 id：「${id}」（${kind}）`
					+ ' ⇒ 该重复**静态扫不到**（循环/builder 形）⇒ 正是本判据要抓的形态');
			}
		}
		const missed = [...known].filter((x) => !(rt.dups?.[kind] ?? []).includes(x));
		if (missed.length) notes.push(`在册重复已消失：${kind} ${missed.join('、')}（★好事 ⇒ 请 --update-baseline）`);
	}
	return { problems, notes, rtTotal };
};

/* ---------------- 自检刀 ---------------- */
if (has('--selftest')) {
	const mk = (rows) => rows.map(([id, pack]) => ({ id, pack, file: `src/dnd/${pack}/x.js` }));
	const L = { club: { reason: 'r', ticket: '#1743' } };
	const knives = [
		['K0 空刀：合法单声明 ⇒ 绿', mk([['sword', 'dnd-5e']]), {}, 0],
		['K1 同包重定义 ⇒ 红', mk([['sword', 'dnd-5e'], ['sword', 'dnd-5e']]), {}, 1],
		['K2 跨包未登记 ⇒ 红', mk([['club', 'dnd-5e'], ['club', 'dnd3']]), {}, 1],
		['K3 跨包已登记（材料齐）⇒ 绿', mk([['club', 'dnd-5e'], ['club', 'dnd3']]), L, 0],
		['K4 登记缺 reason ⇒ 红', mk([['club', 'dnd-5e'], ['club', 'dnd3']]), { club: { ticket: '#1743' } }, 1],
		['K5 过期登记（实际无冲突）⇒ 红', mk([['sword', 'dnd-5e']]), L, 1],
		['K6 引用形不计（items:[{id}]）⇒ 绿', mk([['sword', 'dnd-5e']]), {}, 0],
		/* ★K9（#1807 交接缺口）：**跨包 id 同时同包重复** ⇒ 须红。
		 *   原形因 `continue` 使跨包 id 免检同包重复 ⇒ 本刀在原形上**绿**（缺口复现）。 */
		['K9 ★跨包 id ＋ 同包重复 ⇒ 红（原形漏检）',
			[{ id: 'club', pack: 'dnd3', file: 'src/dnd/dnd3/a.js' }, { id: 'club', pack: 'dnd3', file: 'src/dnd/dnd3/b.js' },
				{ id: 'club', pack: 'dnd-5e', file: 'src/dnd/dnd-5e/c.js' }], L, 1],
	];
	let n = 0, knivesLen = knives.length;   // 计数器与总数一起走（扫描形刀会追加）
	for (const [name, rows, led, want] of knives) {
		const got = judge(rows, led).problems.length === 0 ? 0 : 1;
		const ok = got === want;
		n += ok ? 1 : 0;
		console.log(`  ${ok ? '✓' : '✗'} ${name} — 实得 ${got === 0 ? '绿' : '红'}（期望 ${want === 0 ? '绿' : '红'}）`);
	}
	/* ★★`#1807` 二轮 RC-A（必）：**直喂 `collect()`** 的扫描形刀 ——
	 *   上面所有刀都打 `judge()`（判定面），而本笔的两项核心修复在 **`collect()`（扫描面）**：
	 *   ① builder 形两跳 ② 循环/简写形计入 `unresolvable`。
	 *   ⇒ 若没有刀打 `collect()`，**这两项修复可以静默回退而 `--selftest` 仍 8/8 绿、退出码 0**
	 *     （＝「改坏 findBuilders 须红」这句话**没有机械承载**）⇒ 违「刀须接 CI」。
	 *   ⚠ 夹具建在 `ROOT` 下的临时目录（`path.relative(ROOT,…)` 才成立）；pack 推导对本刀**无关**
	 *     （断言的是 **id 提取**与**盲区计数**，✗ 归属）。 */
	{
		const tmp = fs.mkdtempSync(path.join(ROOT, 'tests/gates', '.tmp-scan-'));
		try {
			const d = path.join(tmp, 'src', 'dnd', 'dnd3', 'items');
			fs.mkdirSync(d, { recursive: true });
			/* ① 字面量形 ＋ ② builder 形（定义 ＋ 调用点）＋ ③ 循环/简写形 ＋ ④ 引用形（须排除） */
			/* ★引用形的**承载位置**（本席实测更正）：`DECL_RE` 要求 id 落在 `defItem(...)` 之内，
			 *   故「独立成句的 `items:[{id}]`」**本来就匹配不到** ⇒ 拿它做断言是**空刀**（实测 M-A4 全绿）。
			 *   真正会误捕的是 **builder 调用点**那条（`\b builder \s*\(\s*\{ [^)]*? \bid: '…'`）：
			 *   `[^)]*?` 会**跨进嵌套数组** ⇒ `ironThing({ name:'x', items:[{ id:'nested-ref' }] })`
			 *   会把 `nested-ref` 当声明。⇒ 夹具必须用**这一形**，刀才有判别力。 */
			fs.writeFileSync(path.join(d, 'lit.js'),
				"RPG.defItem({ id: 'lit-ok', name: 'x' });\n"
				+ "const gear = { items: [{ id: 'ref-not-decl' }] };   // 独立成句的引用形（本就匹配不到，仅留档）\n");
			fs.writeFileSync(path.join(d, 'builder.js'),
				"const ironThing = (def) => RPG.defItem({ id: def.id, name: def.n });\n"
				+ "DND3.IronA = ironThing({ id: 'iron-a', n: 'a' });\n"
				+ "DND3.IronB = ironThing({ id: 'iron-b', n: 'b' });\n"
				/* ★嵌套引用形（承载位置）：`items:[{id}]` 在 builder 实参里 ⇒ 不得被当声明 */
				+ "DND3.Bundle = ironThing({ n: 'x', items: [{ id: 'nested-ref' }] });\n");
			fs.writeFileSync(path.join(d, 'loop.js'),
				"for (const [id, c] of Object.entries(TBL)) RPG.defEffect({ id, ...c });\n");
			const got = collect(tmp);
			const ids = new Set(got.rows.map((r) => r.id));
			const via = new Set(got.rows.filter((r) => r.via).map((r) => r.id));
			const checks = [
				['A1 字面量形被收', ids.has('lit-ok')],
				['A2 ★引用形**不得**被当声明（★承载位置＝builder 实参里的嵌套 `items:[{id}]`）',
					!ids.has('nested-ref') && !ids.has('ref-not-decl')],
				['A3 ★builder 形：调用点字面量被收（iron-a／iron-b）', ids.has('iron-a') && ids.has('iron-b')],
				['A4 ★builder 形：标了 `via`（可追溯经哪个 builder）', via.has('iron-a') && via.has('iron-b')],
				['A5 ★循环/简写形 ⇒ 计入 `unresolvable`（✗ 静默）',
					got.unresolvable.some((u) => u.file.endsWith('loop.js'))],
				['A6 ★`unresolvable` 的计数**为 1**（该文件一处）',
					(got.unresolvable.find((u) => u.file.endsWith('loop.js')) ?? {}).n === 1],
			];
			for (const [name, ok] of checks) { n += ok ? 1 : 0; console.log(`  ${ok ? '✓' : '✗'} ${name}`); }
			knivesLen += checks.length;
			/* ★★RC-C 的运行期判据刀（**必**：判据若不可被刀直喂＝没有机械承载） */
			const RB = {
				floor: { items: 65, characters: 14, effects: 21 },
				dups: { item: ['club'], character: ['player'], effect: [] },
			};
			const mkRt = (over = {}) => ({
				items: 65, characters: 14, effects: 21,
				dups: { item: ['club'], character: ['player'], effect: [] }, ...over,
			});
			const rtChecks = [
				['C1 与基线同 ⇒ 绿', judgeRuntime(mkRt(), RB, 93).problems.length === 0],
				['C2 ★floor 下限：注册量**静默流失**（items 65→64）⇒ 红',
					judgeRuntime(mkRt({ items: 64 }), RB, 93).problems.some((x) => /静默流失/.test(x))],
				['C3 ★盲区内**新出重复**（未在册 id）⇒ 红',
					judgeRuntime(mkRt({ dups: { item: ['club', 'ghost-dup'], character: ['player'], effect: [] } }), RB, 93)
						.problems.some((x) => /未在册的 id/.test(x))],
				['C4 ★缺 `_runtimeBaseline` ⇒ 红（✗ 静默放过）',
					judgeRuntime(mkRt(), null, 93).problems.some((x) => /_runtimeBaseline/.test(x))],
				['C5 静态多报（声明 > 运行期）⇒ 红（假阳）',
					judgeRuntime(mkRt({ items: 10, characters: 1, effects: 1 }), RB, 99).problems.some((x) => /假阳/.test(x))],
				['C6 在册重复**消失** ⇒ 绿但出声（✗ 红）',
					judgeRuntime(mkRt({ dups: { item: [], character: ['player'], effect: [] } }), RB, 93)
						.problems.length === 0],
			];
			for (const [name, ok] of rtChecks) { n += ok ? 1 : 0; console.log(`  ${ok ? '✓' : '✗'} ${name}`); }
			knivesLen += rtChecks.length;
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });   // ★夹具必清（✗ 留残留污染真树扫描）
		}
	}
	console.log(n === knivesLen ? `  ✓ ${n}/${knivesLen} 刀全部如期` : `  ✗ ${n}/${knivesLen} 刀如期`);
	process.exit(n === knivesLen ? 0 : 1);
}

/* ---------------- ② 运行期交叉核对（★领队裁「必」：把「扫不到」变显式可见） ----------------
 *
 * 静态扫描**必然**漏（循环/表驱动形不可解析）⇒ 光靠正则永远说不清「覆盖了多少」。
 * 但**运行期注册表是权威**（`headless.mjs` 已加载 `dist/bundle.js` ⇒ `RPG.items` 等 Map 就绪）。
 * ⇒ 本段在**同一进程**里加载 bundle，读三张注册表的**实际条目数**，与静态扫描数比：
 *     **实际 < 静态** ⇒ 红（静态声称的比实际还多 ⇒ 扫描把**引用**当声明了，是假阳）；
 *     **实际 > 静态** ⇒ **非红**，但**必须打印差集规模**（把盲区**量化并可见**，✗ 静默）。
 * 为何不把「实际 > 静态」判红：**本仓现状就是**如此（循环形固有），判红等于门永远红 ⇒ 门会被人忽略
 *   （「恒红的门＝没有门」）。⇒ 采用与 `host-touchpoints` 同旨的取向：**量化 ＋ 出声**，✗ 假阻断。
 */
const loadRuntimeCounts = () => {
	const helper = path.join(ROOT, 'tests/gates/_runtime-registry.mjs');
	if (!fs.existsSync(helper)) return { error: '缺 _runtime-registry.mjs' };
	try {
		/* ★**子进程**读（✗ 在本进程里 eval bundle）：bundle 需要完整的宿主桩，
		 *   而既有运行器 `headless.mjs` 已有一套权威加载序 ⇒ 复用**那个**，✗ 在门里复刻一套
		 *   （本席首版在门内自建桩 ⇒ `Cannot read properties of undefined (reading 'on')`）。 */
		const out = execFileSync(process.execPath, [helper], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		const line = out.trim().split('\n').pop();
		return JSON.parse(line);
	} catch (e) {
		return { error: e.message.split('\n')[0] };
	}
};

/* ---------------- 主判定 ---------------- */
const { entries, path: ledgerPath } = loadLedger();
if (entries == null) {
	console.error(`  ✗ 门红：缺登台账 ${path.relative(ROOT, ledgerPath)}（跨包冲突须有台账，✗ 静默放过）`);
	process.exit(1);
}
const { rows, unresolvable } = collect(path.join(ROOT, 'src'));
const { problems, samePack, crossPack, declared } = judge(rows, entries);
/* ③ 循环形：**未登记即红**（把「扫不到」变成明账 —— 本条相对首版最重要的改变） */
const KNOWN_UNRESOLVABLE = entries._unresolvable ?? [];
for (const u of unresolvable) {
	const known = KNOWN_UNRESOLVABLE.some((k) => k.file === u.file);
	if (!known) problems.push(`循环/简写形声明（静态不可解析）：${u.file} 有 ${u.n} 处 `
		+ '⇒ 该文件的 id 由变量给出（如 Object.entries 循环），**本门扫不到**。'
		+ '须在 registration-ledger.json 的 `_unresolvable` 登记（附 reason ＋ ticket），使该盲区**可见**');
}

console.log('  注册面 fail-loud 门（#1804 件一）');
console.log(`  扫描：src/** ⇒ 声明 ${declared} 条（✗ 不认 items:[{id}] 这类引用形）`);
const ledgered = Object.keys(entries).filter((k) => !k.startsWith('_'));
console.log(`  同包重定义 ${samePack.length} ｜ 跨包同 id ${crossPack.length}（已登记 ${ledgered.length}）`);
console.log(`  ★静态盲区（循环/简写形）：${unresolvable.length} 个文件 / 共 ${unresolvable.reduce((a, b) => a + b.n, 0)} 处`
	+ `（已登记 ${KNOWN_UNRESOLVABLE.length}）—— 这些 id **本门扫不到**，登记只为让它**可见**`);
if (VERBOSE) for (const c of crossPack) console.log(`    · ${c.id}：${c.packs.join('／')}`);
/* ② 运行期交叉核对：**在 problems 判定之【前】**（★本席实测更正：原先排在判定**之后**
 *   ⇒ 它 push 的问题**永不参与判定** —— 盲区内重复的告警打印出来了、门却仍报绿，是本门最隐蔽的一处死区）。
 *   取向：静态多报（假阳）⇒ 红；运行期多出的**重复告警** ⇒ 红（那是**唯一**能看见盲区内重复的读数）；
 *   注册量低于上限（floor）⇒ 红；静态条数少于运行期（循环形固有）⇒ **出声**，✗ 不 red。 */
const rt = loadRuntimeCounts();
const jr = judgeRuntime(rt, entries._runtimeBaseline ?? null, declared);
if (!jr.skip) {
	console.log(`  ★运行期注册表（权威，读 dist/bundle.js）：items ${rt.items} ／ characters ${rt.characters}`
		+ ` ／ effects ${rt.effects} ⇒ 合计 ${jr.rtTotal}`);
	console.log(`    · 静态扫描 ${declared} 条 ⇒ 差 ${jr.rtTotal - declared} 条属**静态盲区**（循环/表驱动形，已在 _unresolvable 明账）`);
	console.log(`    · 重复告警：item ${(rt.dups?.item ?? []).length} ／ character ${(rt.dups?.character ?? []).length}`
		+ ` ／ effect ${(rt.dups?.effect ?? []).length} —— 已与在册台账比对（新 id ⇒ 红）`);
} else if (jr.skip === 'no-bundle') {
	console.log('  ⚠ 运行期交叉核对**跳过**（缺 tests/unit/dist/bundle.js ⇒ 先 python3 build.py）—— ✗ 静默：本行即出声');
} else {
	console.log(`  ⚠ 运行期交叉核对**失败**：${jr.skip}（单测 bundle 与门解耦 ⇒ 非阻断，但出声）`);
}
problems.push(...jr.problems);
for (const nt of jr.notes) console.log(`  ⚠ ${nt}`);

/* ★problems 判定在**全部**判据之后（含上方运行期面）—— 本席实测更正：原先它排在运行期块**之前**
 *   ⇒ 运行期 push 的问题**永不参与判定**（盲区内重复的告警打印了、门却报绿 ⇒ 一处死区）。 */
if (problems.length) {
	console.log('  ✗ 门红：');
	for (const p of problems) console.log(`    - ${p}`);
	process.exit(1);
}
console.log('  ✓ 门绿（无未登记的跨包同 id、无同包重定义、无过期登记）');
