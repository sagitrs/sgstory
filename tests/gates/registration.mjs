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

/** ★本门**未覆盖**的注册面（`#1816` MAJOR-1 明账）。
 *  本门只扫 `defItem`／`defCharacter`／`defEffect`／`registerItem`（+ builder 调用点）；
 *  其余注册入口**不在此门**——列出它们使「不覆盖什么」**可见**（✗ 让读者误以为全覆盖）。
 *  `dupHandling` 如实标注：`上报+覆盖`（`sgstory#295` 乙 后的形：注册点调 `RPG.regWarn.报`，
 *    加载期由 `RPG.regWarn.汇总()` **印一条**汇总 —— 仍是**如实出声**，✗ 不是静默）
 *    ／ `warn+覆盖`（本笔**之前**的旧形：注册点当场 `console.warn`；本门仍认这个标签，✗ 不逼人改）
 *    ／ `纯静默`（连提示都没有，冲突时**完全无声**）。 */
export const REG_SURFACES = [
	/* defStock 已由 `#1816` 乙**并入本门覆盖**（见 DECL_RE），故不列于此。 */
	{ fn: 'defPipeline',           file: 'src/core/45-pipeline.js:29',   dupHandling: '上报+覆盖' },
	{ fn: 'registerBuild',         file: 'src/core/36-build.js:129',     dupHandling: '上报+覆盖' },
	{ fn: 'defNotice',             file: 'src/core/71-notice.js:30',     dupHandling: '上报+覆盖' },
	{ fn: 'registerScene',         file: 'src/core/50-scene.js:68',      dupHandling: '上报+覆盖' },   // #1816 本笔补
	{ fn: 'registerEncounterTable', file: 'src/core/65-encounters.js:153', dupHandling: '上报+覆盖' }, // #1816 本笔补
	{ fn: 'registerLayerMeta',     file: 'src/core/40-battle.js:137',    dupHandling: '上报+覆盖' },   // #1816 本笔补
];

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
/* ★`#1816` 乙（顺）：把 `defStock` **并入覆盖**——它由本席 `#1777` D1 引入，**自带 `pack` 字段**
 *   ⇒ 跨包判定天然可算（✗ 不像 item/character 那样只能靠目录推包）。 */
const DECL_RE = /(?:defItem|defCharacter|defEffect|registerItem|defStock)\s*\(\s*\{?[^)]*?\bid:\s*'([^']+)'/gs;
/** ③ 循环/简写形：`{ id, … }` 紧贴注册调用 ⇒ `id` 是变量，**静态不可解析** */
const SHORTHAND_RE = /(?:defItem|defCharacter|defEffect|registerItem|defStock)\s*\(\s*\{[^}]*?\bid\s*,(?!\s*:)/gs;
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
	/* ★`#1816` MAJOR-2（D 席 dev-10 复核所报）：**两个口径混用**——
	 *   `declared` 是**行数**（同一 id 可多次出现），而 `rtTotal` 是**唯一 id 数**
	 *   ⇒ 两者相减**单位不同**，差数与假阳判据**天然带偏**（本席实测：行 93／唯一 id 81／运行期 100）。
	 *   ⇒ 本函数**同时**返回两个口径，由调用方按用途取：
	 *      · **差与假阳** ⇒ 用 `uniqueIds`（与运行期同口径）；
	 *      · **人读的「扫到多少条声明」** ⇒ 用 `declared`（行数，另列，✗ 参与比较）。 */
	return { problems, samePack, crossPack, declared: rows.length, uniqueIds: byId.size, files: new Set(rows.map((r) => r.file)).size };
};

/** 运行期交叉判定的**纯函数**（✗ 埋在 main 里）—— 便于自检刀直接喂入。
 *  ★这是 `#1807` 二轮 RC-A 的同一条要求：**判据若不可被刀直喂，就等于没有机械承载**。 */
/** ★`#1818` 折 RC 乙：**运行期判据没跑成**时的处置 —— 抽**纯函数**使刀可直喂
 *   （照 E2 子条「抽纯函数，✗ 埋 `main()`」；埋了就只能靠「真把 helper 打坏」的集成级验法）。
 *   `skip==='no-bundle'` 与 `rt.error` **分开**：前者是**位次**问题（bundle 不在），
 *   后者是 helper **真故障**（bundle 在、它自己崩）—— 混称会让人按错误的方向去查。
 *   带旗（`--require-bundle`）时**两者皆红**：位次错 ⇒ 运行期判据全失效；helper 崩 ⇒ 权威判据**从未执行**。 */
export const runtimeUnavailableProblems = (skip, required) => {
	if (!skip) return [];
	if (skip === 'no-bundle') {
		return required
			? ['缺 tests/unit/dist/bundle.js ⇒ 运行期交叉核对**无法执行**（本门须摆在 python3 build.py **之后**；CI 位次错则运行期判据全部失效）']
			: [];
	}
	/* 真故障：带旗必红（✗ 只留 ⚠ = **假保险**）；不带旗⇒出声不红（与本门「减少⇒绿但出声」同一取向） */
	return required
		? [`运行期交叉核对**真故障**（helper 非零退出／输出不可解析）：${skip} ⇒ 权威判据**未执行**（✗ 位次问题：bundle 在，是 helper 自己崩）`]
		: [];
};
/* ============================================================================
 * ★`#1826` **镜像契约自检**：`_runtime-registry.mjs` 的加载序须与 `tests/unit/headless.mjs` **一致（前缀）**。
 *
 *   病灶（`#1818` RC 实证）：helper **自称镜像** headless 序（其**文件头自己写着**「若 headless 改了加载序，
 *   此处须同改」），而 `#1820` 把 `framework/host.js` 插进 headless 序时**没跟改** ⇒ `shims.js` 的自守当场抛
 *   ⇒ helper **崩**，门在 `--require-bundle` 下只留 ⚠、**仍 rc=0** ＝ **假保险**（权威判据**从未执行**）。
 *   ⇒ 义务被声明了**两次**（文件头＋README）、**零机械保证** ⇒ **迟早不同步**（`#1826` 即为此而立）。
 *
 *   ★判据形＝**前缀**，✗ 全等：helper 只需到 `dist/bundle.js`（它**不跑用例** ⇒ 不需 harness／scenario）
 *     ⇒ 写全等会**假红**（把 helper 逼着装无关件）。
 */
export const loadSequence = (src) => [...String(src).matchAll(/^load\('([^']+)'\)/gm)].map((m) => m[1]);

export const mirrorProblems = (headSeq, helperSeq) => {
	const out = [];
	const upto = headSeq.indexOf('dist/bundle.js');
	if (upto < 0) return ['`headless.mjs` 的 `load` 序里找不到 `dist/bundle.js`（判据的锚点没了 ⇒ 须复核本判据）'];
	const want = headSeq.slice(0, upto + 1);
	if (helperSeq.length === 0) return ['`_runtime-registry.mjs` 里没解析出任何 `load(...)`（判据失锚）'];
	/* ★`#1848` dev-10 尾 NIT：**插入形态**的判词须报**件数**（纯诊断 —— 让读者一眼看出
	 *   「headless 插了几件而 helper 没跟」，✗ 只报「第 N 步不符」那种逐位描述）。 */
	let missing = 0;
	for (let i = 0; i < want.length; i++) if (helperSeq[i] === undefined) missing++;
	if (missing > 0) {
		out.push(`headless 的加载序**比 helper 多 ${missing} 件**（helper 须同跟 —— 这正是 #1820 那次的形态：`
			+ `headless 插件而 helper 不跟）`);
	}
	for (let i = 0; i < want.length; i++) {
		if (helperSeq[i] === undefined) {
			out.push(`helper 的加载序**缺**第 ${i + 1} 步：应为 \`${want[i]}\`（＝headless 序的前缀）`);
		} else if (helperSeq[i] !== want[i]) {
			out.push(`helper 第 ${i + 1} 步是 \`${helperSeq[i]}\`，而 headless 序该位是 \`${want[i]}\` ⇒ **次序不符**`);
		}
	}
	if (out.length === 0 && helperSeq.length !== want.length) {
		out.push(`helper 的加载序**多出** ${helperSeq.length - want.length} 步（前缀之外：${helperSeq.slice(want.length).join('、')}）`);
	}
	return out;
};

export const judgeRuntime = (rt, rb, staticUnique) => {
	const problems = [], notes = [];
	if (rt == null || rt.noBundle) return { problems, notes, skip: 'no-bundle' };
	if (rt.error) return { problems, notes, skip: rt.error };
	const rtTotal = (rt.items ?? 0) + (rt.characters ?? 0) + (rt.effects ?? 0);
	/* ★同口径比较（#1816 MAJOR-2）：静态侧取**唯一 id**，✗ 行数 */
	if (staticUnique > rtTotal) {
		problems.push(`静态唯一 id ${staticUnique} > 运行期注册 ${rtTotal} ⇒ 扫描**把引用当声明了**（假阳）`);
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
			/* ★★K24–K27 —— `#1818` 折 RC 乙的刀（dev-9／tester-4 **同根**）。
			 *   断**判决**（✗ 只断读数）：带旗时 helper 真故障 ⇒ **必产 problem**；
			 *   不带旗 ⇒ **不产 problem**（出声即可）；且两类 skip 的措辞**须可分辨**（位次 vs 真故障）。 */
			/* ★K28–K32（`#1826`）：**镜像契约**的刀（★断判决）。喂**纯函数** ⇒ 无自证循环之虞
			 *   （判据吃的是「两份源码解析出来的序」，✗ 不是被守护的表自身）。 */
			const mirrorKnives = [
				['K28 一致（helper 恰为 headless 到 bundle.js 的前缀）⇒ 绿',
					mirrorProblems(['framework/host.js', 'framework/shims.js', 'dist/bundle.js', 'framework/harness.js'], ['framework/host.js', 'framework/shims.js', 'dist/bundle.js']).length === 0],
				['K29 ★helper **缺 host.js**（＝`#1820` 那次的形态）⇒ 红',
					mirrorProblems(['framework/host.js', 'framework/shims.js', 'dist/bundle.js'], ['framework/shims.js', 'dist/bundle.js']).some((x) => /缺/.test(x))],
				['K30 ★helper **次序不符** ⇒ 红',
					mirrorProblems(['framework/host.js', 'framework/shims.js', 'dist/bundle.js'], ['framework/shims.js', 'framework/host.js', 'dist/bundle.js']).some((x) => /次序不符/.test(x))],
				['K31 ★headless **插入新件**而 helper 不跟 ⇒ 红（✗ 只守「缺」不守「插」）',
					mirrorProblems(['framework/host.js', 'framework/NEW.js', 'framework/shims.js', 'dist/bundle.js'], ['framework/host.js', 'framework/shims.js', 'dist/bundle.js']).length > 0],
				['K32 ★helper **多出前缀之外的步骤** ⇒ 红（✗ 只在「少」的方向判）',
					mirrorProblems(['framework/host.js', 'dist/bundle.js'], ['framework/host.js', 'framework/extra.js', 'dist/bundle.js']).length > 0],
			];
			for (const [name, ok] of mirrorKnives) { n += ok ? 1 : 0; console.log(`  ${ok ? '✓' : '✗'} ${name}`); }
			knivesLen += mirrorKnives.length;
			const rtUnavail = [
				['K24 ★带旗：helper **真故障** ⇒ 产 problem（✗ 只留 ⚠ ＝ **假保险**）',
					runtimeUnavailableProblems('Command failed: node …', true).length === 1
						&& /真故障/.test(runtimeUnavailableProblems('Command failed: node …', true)[0])],
				['K25 不带旗：同类故障 ⇒ **不产 problem**（出声不红）',
					runtimeUnavailableProblems('Command failed: node …', false).length === 0],
				['K26 ★两类 skip **措辞可分辨**：位次（bundle）／真故障 —— ✗ 混称',
					runtimeUnavailableProblems('no-bundle', true).length === 1
						&& /bundle\.js/.test(runtimeUnavailableProblems('no-bundle', true)[0])
						&& !/真故障/.test(runtimeUnavailableProblems('no-bundle', true)[0])],
				['K27 ★不带旗时**缺 bundle** 亦不判红（位次由 CI 保证，✗ 在本地逼人先 build）',
					runtimeUnavailableProblems('no-bundle', false).length === 0],
			];
			for (const [name, ok] of rtUnavail) { n += ok ? 1 : 0; console.log(`  ${ok ? '✓' : '✗'} ${name}`); }
			knivesLen += rtUnavail.length;
			/* ★★**判决路径刀**（本席 E2 子条【判决路径】的机械形态，挂母条二下）：
			 *   本席在本门**连踩三次**同一形态——判据块被排在 `if (problems.length) exit(1)` **之后**
			 *   ⇒ 该块 push 的问题**永不参与判决**（读数可见、门却报绿）。第三次是 `REG_SURFACES` 自证块。
			 *   ⇒ 本刀**读本文件自身源码**，断言：**最后一条 `problems.push` 出现在判决点之前**。
			 *     凡将来再往后追加判据块而忘了挪判决点 ⇒ **本刀即红**（✗ 靠人记得）。
			 *   ★这是「判据的判决路径也须有刀」的可运行形态；本席已把它提炼为 E2 子条。 */
			{
				const self = fs.readFileSync(path.join(ROOT, 'tests/gates/registration.mjs'), 'utf8');
				/* 判决点＝`if (problems.length)` 那一行（本门**唯一**的判决点；多出现即本刀红） */
				const verdictRe = /if \(problems\.length\) \{/g;
				const verdicts = [...self.matchAll(verdictRe)];
				/* push 点＝`problems.push(`（✗ 匹配注释里的同名文本：只看**代码行**） */
				const pushLines = self.split('\n')
					.map((l, i) => [l, i])
					.filter(([l]) => /^\s*problems\.push\(/.test(l) || /^\s*for \(const \w+ of \w+\) problems\.push\(/.test(l)
						|| /^\s*problems\.push\(\.\.\./.test(l));
				const verdictLine = verdicts.length ? self.slice(0, verdicts[0].index).split('\n').length : -1;
				const latePush = pushLines.filter(([, i]) => verdictLine > 0 && i + 1 > verdictLine);
				const ok1 = verdicts.length === 1;
				const ok2 = latePush.length === 0;
				const ok = ok1 && ok2;
				n += ok ? 1 : 0;
				console.log(`  ${ok ? '✓' : '✗'} K20 ★判决路径刀：判决点唯一(${verdicts.length}) 且**无 push 在其后**(${latePush.length} 处)`
					+ (ok ? '' : ` —— 死区！后置 push 行：${latePush.map(([, i]) => i + 1).join(',')}`));
				knivesLen += 1;
			}
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
	/* ★`#1816` NIT-6：**先分清**「缺 bundle」（位次问题 ⇒ 可判、可要求）与「helper 自身失败」（真故障）。
	 *   ✗ 混为一谈时 `--require-bundle` 永远不触发 —— 本席实测踩到（有旗仍 rc=0）。 */
	if (!fs.existsSync(path.join(ROOT, 'tests/unit/dist/bundle.js'))) return { noBundle: true };
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

/* ★`#1816` MN-5：本门原先**没有** `--update-baseline`（`_runtimeBaseline` 与 `_unresolvable` 只能手改）
 *   ⇒ 与 `host-touchpoints`／`refs-integrity` 的仪式不一致，且手改易错（本席自己就是手填的）。
 *   ⇒ 归入同一开关：**一次**产出「读数 ＋ 台账」，✗ 两处各填一遍。 */
if (has('--update-baseline')) {
	const rt0 = loadRuntimeCounts();
	const led = entries;
	if (rt0 && !rt0.error) {
		led._runtimeBaseline = {
			...(led._runtimeBaseline ?? {}),
			_seededAt: process.env.SEEDED_AT ?? 'unknown',
			floor: { items: rt0.items ?? 0, characters: rt0.characters ?? 0, effects: rt0.effects ?? 0 },
			dups: {
				item: [...new Set(rt0.dups?.item ?? [])],
				character: [...new Set(rt0.dups?.character ?? [])],
				effect: [...new Set(rt0.dups?.effect ?? [])],
			},
		};
		console.log('  ✓ `_runtimeBaseline` 已刷新（floor ＋ dups，dups 已去重）');
	} else {
		console.log('  ⚠ 运行期读数不可得 ⇒ `_runtimeBaseline` **未**刷新（✗ 静默略过：本行即出声）');
	}
	led._unresolvable = unresolvable.map((u) => {
		const prev = (led._unresolvable ?? []).find((k) => k.file === u.file);
		return { file: u.file, n: u.n,
			reason: prev?.reason ?? '（待补：该文件为循环/表驱动形，静态不可解析）',
			ticket: prev?.ticket ?? '#1807' };
	});
	fs.writeFileSync(ledgerPath, JSON.stringify(led, null, 2) + '\n');
	console.log('  ✓ `_unresolvable` 已刷新（既有 reason／ticket **保留**，✗ 静默抹掉）');
	console.log('  ✓ 基线刷新完毕 —— ★须人工复核并解释进 diff');
	process.exit(0);
}
const { problems, samePack, crossPack, declared, uniqueIds, files: staticFiles } = judge(rows, entries);
/* ③ 循环形：**未登记即红**（把「扫不到」变成明账 —— 本条相对首版最重要的改变） */
const KNOWN_UNRESOLVABLE = entries._unresolvable ?? [];
for (const u of unresolvable) {
	const known = KNOWN_UNRESOLVABLE.some((k) => k.file === u.file);
	if (!known) problems.push(`循环/简写形声明（静态不可解析）：${u.file} 有 ${u.n} 处 `
		+ '⇒ 该文件的 id 由变量给出（如 Object.entries 循环），**本门扫不到**。'
		+ '须在 registration-ledger.json 的 `_unresolvable` 登记（附 reason ＋ ticket），使该盲区**可见**');
}

console.log('  注册面 fail-loud 门（#1804 件一）');
console.log(`  扫描：src/** ⇒ 行 ${declared} 条（唯一 id 见下；✗ 不认 items:[{id}] 这类引用形）`);
const ledgered = Object.keys(entries).filter((k) => !k.startsWith('_'));
console.log(`  同包重定义 ${samePack.length} ｜ 跨包同 id ${crossPack.length}（已登记 ${ledgered.length}）`);
/* ★`#1816` MN-4：**处数 ↔ id 数并列** —— 静态数的是「**处**」（9 处循环形），
 *   而盲区口径是「**id**」（运行期 − 静态唯一 id）。两者单位不同，单看任一都会误读规模。 */
console.log(`  ★静态盲区（循环/简写形）：${unresolvable.length} 个文件 / 共 ${unresolvable.reduce((a, b) => a + b.n, 0)} 处`
	+ `（已登记 ${KNOWN_UNRESOLVABLE.length}）—— 这些 id **本门扫不到**，登记只为让它**可见**`);
if (VERBOSE) for (const c of crossPack) console.log(`    · ${c.id}：${c.packs.join('／')}`);
/* ② 运行期交叉核对：**在 problems 判定之【前】**（★本席实测更正：原先排在判定**之后**
 *   ⇒ 它 push 的问题**永不参与判定** —— 盲区内重复的告警打印出来了、门却仍报绿，是本门最隐蔽的一处死区）。
 *   取向：静态多报（假阳）⇒ 红；运行期多出的**重复告警** ⇒ 红（那是**唯一**能看见盲区内重复的读数）；
 *   注册量低于上限（floor）⇒ 红；静态条数少于运行期（循环形固有）⇒ **出声**，✗ 不 red。 */
const rt = loadRuntimeCounts();
const jr = judgeRuntime(rt, entries._runtimeBaseline ?? null, uniqueIds);   // ★传**唯一 id**（同口径）
if (!jr.skip) {
	console.log(`  ★运行期注册表（权威，读 dist/bundle.js）：items ${rt.items} ／ characters ${rt.characters}`
		+ ` ／ effects ${rt.effects} ⇒ 合计 ${jr.rtTotal}`);
	/* ★两个口径**分开列**（#1816 MAJOR-2）：行数只作人读，比较一律用唯一 id */
	console.log(`    · 静态：**唯一 id ${uniqueIds}**（另：行 ${declared}／文件 ${staticFiles}）`);
	const blindIds = jr.rtTotal - uniqueIds;
	const blindSites = unresolvable.reduce((a, b) => a + b.n, 0);
	console.log(`    · ⇒ 差 ${blindIds} **个 id** 属**静态盲区**（循环/表驱动形，已在 _unresolvable 明账）`
		+ '　★口径＝**唯一 id**（✗ 行数——两者单位不同，混用会带偏差与假阳判据）');
	console.log(`    · ★**处数 ↔ id 数并列**（#1816 MN-4）：静态 **${blindSites} 处**循环形 → 覆盖 **${blindIds} 个 id**`
		+ '（处 ≠ id：一处循环可发射多个 id ⇒ 只看处数会**低估**盲区规模）');
	/* ★`#1816` NIT-3：打印须用**唯一 id** 数（✗ 原始告警条数）——
	 *   原先报 character **5** 而台账是 **4**（同一 id 告警两次）⇒ 两个数不一致会让读者以为有出入。 */
	const dq = (k) => [...new Set(rt.dups?.[k] ?? [])].length;
	console.log(`    · 重复告警（**唯一 id**）：item ${dq('item')} ／ character ${dq('character')}`
		+ ` ／ effect ${dq('effect')} —— 已与在册台账比对（新 id ⇒ 红）`);
} else if (jr.skip === 'no-bundle') {
	/* ★`#1816` NIT-6：`--require-bundle` 使「本门须在 build **之后**跑」这一点**可判**。
	 *   ✗ 缺省只出声 —— 那会让「CI 里把人摆错位次」**静默退化为无运行期判据**（本席踩过）。 */
	problems.push(...runtimeUnavailableProblems('no-bundle', has('--require-bundle')));
	if (!has('--require-bundle')) {
		console.log('  ⚠ 运行期交叉核对**跳过**（缺 tests/unit/dist/bundle.js ⇒ 先 python3 build.py）—— ✗ 静默：本行即出声');
	}
} else {
	/* ★★`#1818` 折 RC 乙（dev-9／tester-4 **同根**）：与本块上一分支（缺 bundle）**同一取向** ——
	 *   带旗时「**运行期判据没跑成**」必须**判红**，✗ 只留一句 ⚠。
	 *   病灶实证：helper 曾因加载序缺 `host.js` 而**崩**，门却 `rc=0`＋一行 ⚠
	 *   = **假保险**（宣称运行期权威，实则**权威判据从未执行**）—— 与「判决死区」同族，且更险：
	 *     死区是**判据存在却不参与判定**；此处是**判据根本没跑而门报平安**。
	 *   ⚠ 与「缺 bundle」**分开报**（成因不同：那是**位次**问题、这是 helper **真故障**）——
	 *     混称会让读者按位次去查，而真因在 helper 自身。 */
	problems.push(...runtimeUnavailableProblems(jr.skip, has('--require-bundle')));
	if (!has('--require-bundle')) {
		console.log(`  ⚠ 运行期交叉核对**失败**：${jr.skip}（单测 bundle 与门解耦 ⇒ 非阻断，但出声）`);
	}
}
/* ★`#1826` 镜像契约（**真树**，✗ 只在自检里）：helper 崩的前因就是这条分叉 ⇒ 门须自己判它。
 *   ⚠ 取不到某一侧 ⇒ **出声**（✗ 静默 —— 那正是本票要消灭的形态）。 */
{
	const headPath = path.join(ROOT, 'tests/unit/headless.mjs');
	const helperPath = path.join(ROOT, 'tests/gates/_runtime-registry.mjs');
	if (fs.existsSync(headPath) && fs.existsSync(helperPath)) {
		const mp = mirrorProblems(loadSequence(fs.readFileSync(headPath, 'utf8')),
			loadSequence(fs.readFileSync(helperPath, 'utf8')));
		if (mp.length) problems.push(...mp.map((x) => `镜像契约（#1826）：${x}`));
		else console.log(`  ✓ 镜像契约（#1826）：helper 加载序 ＝ headless 到 \`dist/bundle.js\` 的前缀（${loadSequence(fs.readFileSync(helperPath, 'utf8')).length} 步）`);
	} else {
		console.log('  ⚠ 镜像契约（#1826）**未判**：两文件之一不存在（✗ 静默 ⇒ 本行即出声）');
	}
}

problems.push(...jr.problems);
for (const nt of jr.notes) console.log(`  ⚠ ${nt}`);

/* ★problems 判定在**全部**判据之后（含上方运行期面）—— 本席实测更正：原先它排在运行期块**之前**
 *   ⇒ 运行期 push 的问题**永不参与判定**（盲区内重复的告警打印了、门却报绿 ⇒ 一处死区）。 */
/* ★`#1816` MAJOR-1：**未覆盖的注册面**常驻明账（✗ 让读者以为本门覆盖全部注册面）。
 *   ★本表是「本门**不覆盖**什么」的权威清单 —— 改它须同笔说明。 */
/* ★★`REG_SURFACES` 须**自证**（✗ 手写即真相）：逐项去**源码里**核「该入口的函数体是否真有 `console.warn`」，
 *   与表里记的 `dupHandling` 比对 —— 不一致即红。
 *   ★理由：本席本笔**刚踩过**——我给三面补了 warn，但**表还写着「纯静默」** ⇒
 *     门会在**输出里说谎**（表说无提示、实码有提示）。⇒ 表与实码必须**机械交叉核对**（母条二对策）。 */
const surfaceDiffs = [];
for (const s of REG_SURFACES) {
	const src = path.join(ROOT, s.file.split(':')[0]);
	if (!fs.existsSync(src)) { surfaceDiffs.push(`${s.fn}：文件不存在 ${s.file}`); continue; }
	const text = fs.readFileSync(src, 'utf8');
	const idx = text.indexOf(`RPG.${s.fn} =`);
	if (idx < 0) { surfaceDiffs.push(`${s.fn}：源码里找不到该入口定义`); continue; }
	/* ★函数体边界＝**下一个顶层定义**（`\nRPG.` 或 `\nsetup.`）——
	 *   ✗ 固定字符窗口：本席首版用 700 字符 ⇒ `defPipeline`（校验代码长）的 warn **落在窗口外**
	 *   ⇒ 假报「表与实码不符」（实测）。⇒ 取**真边界**，✗ 猜长度。 */
	const rest = text.slice(idx + 1);
	const cuts = [rest.indexOf('\nRPG.'), rest.indexOf('\nsetup.'), rest.indexOf('\nconst ')]
		.filter((n) => n > 0).sort((a, b) => a - b);
	const body = cuts.length ? rest.slice(0, cuts[0]) : rest;
	const hasWarn = /console\.warn/.test(body);
	const hasRegWarn = /RPG\.regWarn\.报\(/.test(body);
	/* ★`#295` 乙：出声有**两形**（旧的当场 warn／新的**上报**给 `regWarn`）⇒ 表记哪一形就核哪一形，
	 *   并**明确报出实得的是哪一形**（✗ 只报「不符」—— 那会让人不知道往哪边改）。 */
	const 期望 = s.dupHandling === 'warn+覆盖' ? 'warn' : (s.dupHandling === '上报+覆盖' ? 'regWarn' : '静默');
	const 实得 = hasWarn ? 'warn' : (hasRegWarn ? 'regWarn' : '静默');
	if (实得 !== 期望) {
		surfaceDiffs.push(`${s.fn}（${s.file}）：表记「${s.dupHandling}」但源码窗口实得「${实得}」`
			+ `（warn=${hasWarn}／regWarn=${hasRegWarn}）⇒ 表与实码不符`);
	}
}
console.log(`  ⚠ 本门**未覆盖**的注册面（${REG_SURFACES.length} 个，明账 —— 这些入口的冲突本门**看不见**）`
	+ `　★表已与源码**交叉核对**${surfaceDiffs.length ? '（**不符 ' + surfaceDiffs.length + ' 项**）' : '（全部相符）'}：`);
for (const d of surfaceDiffs) problems.push(`未覆盖注册面的表与实码不符：${d}`);
for (const s of REG_SURFACES) {
	const mark = s.dupHandling === '上报+覆盖' ? '上报（`regWarn` 汇总时印一条）'
		: (s.dupHandling === 'warn+覆盖' ? '有 warn' : '★**纯静默**（无任何提示）');
	console.log(`      · ${s.fn}（${s.file}）：${mark}`);
}
if (problems.length) {
	console.log('  ✗ 门红：');
	for (const p of problems) console.log(`    - ${p}`);
	process.exit(1);
}
console.log('  ✓ 门绿（无未登记的跨包同 id、无同包重定义、无过期登记）');
