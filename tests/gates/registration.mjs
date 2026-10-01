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

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(valOf('--root') ?? path.join(import.meta.dirname, '..', '..'));
const VERBOSE = has('--verbose');

/** 声明形：`defItem({…id:'x'})` / `defCharacter` / `defEffect` / `registerItem`
 *  ⚠ **只认声明**：形如 `items: [{ id: 'club' }]` 的**引用**不算（怪物携带道具即此形）。 */
const DECL_RE = /(?:defItem|defCharacter|defEffect|registerItem)\s*\(\s*\{?[^)]*?\bid:\s*'([^']+)'/gs;

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
	for (const f of walk(srcDir).sort()) {
		const rel = path.relative(ROOT, f).split(path.sep).join('/');
		const pack = rel.startsWith('src/dnd/') ? rel.split('/')[2] : 'core';
		for (const m of fs.readFileSync(f, 'utf8').matchAll(DECL_RE)) rows.push({ id: m[1], pack, file: rel });
	}
	return rows;
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

/* ---------------- 主判定 ---------------- */
const { entries, path: ledgerPath } = loadLedger();
if (entries == null) {
	console.error(`  ✗ 门红：缺登台账 ${path.relative(ROOT, ledgerPath)}（跨包冲突须有台账，✗ 静默放过）`);
	process.exit(1);
}
const rows = collect(path.join(ROOT, 'src'));
const { problems, samePack, crossPack, declared } = judge(rows, entries);

console.log('  注册面 fail-loud 门（#1804 件一）');
console.log(`  扫描：src/** ⇒ 声明 ${declared} 条（✗ 不认 items:[{id}] 这类引用形）`);
const ledgered = Object.keys(entries).filter((k) => !k.startsWith('_'));
console.log(`  同包重定义 ${samePack.length} ｜ 跨包同 id ${crossPack.length}（已登记 ${ledgered.length}）`);
if (VERBOSE) for (const c of crossPack) console.log(`    · ${c.id}：${c.packs.join('／')}`);
if (problems.length) {
	console.log('  ✗ 门红：');
	for (const p of problems) console.log(`    - ${p}`);
	process.exit(1);
}
console.log('  ✓ 门绿（无未登记的跨包同 id、无同包重定义、无过期登记）');
