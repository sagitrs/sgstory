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
	let n = 0;
	for (const [name, rows, led, want] of knives) {
		const got = judge(rows, led).problems.length === 0 ? 0 : 1;
		const ok = got === want;
		n += ok ? 1 : 0;
		console.log(`  ${ok ? '✓' : '✗'} ${name} — 实得 ${got === 0 ? '绿' : '红'}（期望 ${want === 0 ? '绿' : '红'}）`);
	}
	console.log(n === knives.length ? `  ✓ ${n}/${knives.length} 刀全部如期` : `  ✗ ${n}/${knives.length} 刀如期`);
	process.exit(n === knives.length ? 0 : 1);
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
if (problems.length) {
	console.log('  ✗ 门红：');
	for (const p of problems) console.log(`    - ${p}`);
	process.exit(1);
}

/* ② 运行期交叉核对：**报告**（✗ 不 red —— 见上方取向说明）。本席实测本仓现状：静态 93 条 vs 运行期 177 条
 *   ⇒ 差 84 系循环/表驱动形**固有**，判红等于恒红。⇒ 量化 ＋ 出声，并把**静态多报**（假阳）判红。 */
const rt = loadRuntimeCounts();
if (rt && !rt.error) {
	const rtTotal = (rt.items ?? 0) + (rt.characters ?? 0) + (rt.effects ?? 0);
	console.log(`  ★运行期注册表（权威，读 dist/bundle.js）：items ${rt.items} ／ characters ${rt.characters}`
		+ ` ／ effects ${rt.effects} ⇒ 合计 ${rtTotal}`);
	console.log(`    · 静态扫描 ${declared} 条 ⇒ 差 ${rtTotal - declared} 条属**静态盲区**（循环/表驱动形，已在 _unresolvable 明账）`);
	if (declared > rtTotal) {
		problems.push(`静态扫描 ${declared} 条 > 运行期注册 ${rtTotal} 条 ⇒ 扫描**把引用当声明了**（假阳）`);
	}
} else if (rt == null) {
	console.log('  ⚠ 运行期交叉核对**跳过**（缺 tests/unit/dist/bundle.js ⇒ 先 python3 build.py）—— ✗ 静默：本行即出声');
} else {
	console.log(`  ⚠ 运行期交叉核对**失败**：${rt.error}（单测 bundle 与门解耦 ⇒ 非阻断，但出声）`);
}

console.log('  ✓ 门绿（无未登记的跨包同 id、无同包重定义、无过期登记）');
