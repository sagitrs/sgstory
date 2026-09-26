// A5「回读友好」门（#296 走查的机检部分）：**可回看不泄底**。
//
// 为什么能机检：A5 的判据在实现上是「**门控**」问题——图鉴条目/线索必须由**发现**（`test(pc)` 谓词）
// 解锁。票面要求「复核其**行为**而非字符串」（#220 同类实锤就是这么漏的），故 R1/R2 是**行为**断言：
// 给一个零状态档，任何已解锁的东西都是泄底。
//
// 判据（本件现存两维）：
// R1 零状态档：新卡（`Game.Pc.defaults()`）下，图鉴**不得有任何线索谓词为真**
// R2 空记录：空图鉴记录（`blank()`）下，不得有任何条目 `isUnlocked`
//
// ★★ `#1315` 审计（下架复验）：**R3–R6 退役**（判据随对象退役 ✓）——
//   原 R3/R4/R5/R6 判的是「**谜底级/终局级知识的门控**」，其**声明面**是 `Game.Truth.claims`
//   （`containers.Truth.claims`：命题 ＋ `sites[].via` 措辞）。我核过：**`claims` 在全仓 0 命中**
//   （引擎源／`editor/`／全部夹具都无）⇒ 那是**随旧 demo 走掉的机制**（`#1261` 大裁剪）
//   ⇒ 按三问①（**对象已走**）：**判据随对象退役**，✗ 不是「夹具缺面」、✗ 也不是修对象。
//   ★`Game.Truth` 本身**还在**（object，夹具声明 `Truth:{facts:{}}`）⇒ 退役的是它**没有的那个字段**
//     （`claims`）所支撑的那几维 ⇒ 与「面不在 ⇒ 未判」**不同族** ✓
//   ★恢复条件＝**该机制复活**（届时同笔恢复 R3–R6 —— 判据与它的对象同生同死 ✓）
//
// 自证：`node test/reread.mjs --selftest`（**现存两维**各带会红的反例）

import { createContext } from '../scripts/audit/context.mjs';
import { storySlugs } from '../scripts/dist-paths.mjs';   // `#1315` 审计：零故事守卫（同 `#1267` 尾件② 同规）

// ── 纯函数（依赖注入：自证时喂夹具，不与真实游戏耦合）────────────────────
// R1：零状态档下为真的线索
export const virginLeaks = (items, virginPc, holds = null) => {
	const out = [];
	for (const [item, def] of Object.entries(items ?? {})) {
		for (const c of def.clues ?? []) {
			let v = false;
			// `#785` 第 1 族：线索判定已**声明式** → 两条路：
			// ① **无任何条件**（没有 `req`/`any`/`exclude`）→ 恒真 → **必泄**（结构判定，**不依赖引擎**
			// —— 这正是 A5 门「咬合力」的底线：新形状下「忘写条件」仍必须被抓）；
			// ② 有条件 → 交给引擎的条件求值器（调用方注入 `holds`；缺注入时不臆断，按不泄计）。
			const noConds = !['req', 'any', 'exclude'].some((k) => c && c[k] !== undefined);
			v = noConds;
			if (!noConds && holds) { try { v = !!holds(c, virginPc); } catch { v = false; } }
			if (v) out.push(`${item}:${c.id}`);
		}
	}
	return out;
};

// R2：空记录下被解锁的条目
export const blankUnlocks = (items, api, store) => {
	const out = [];
	for (const item of Object.keys(items ?? {})) {
		let v = false;
		try { v = !!api.isUnlocked(item, store); } catch { v = false; }
		if (v) out.push(item);
	}
	return out;
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	//注意：夹具**仅用于自证「门还咬得住」**：条件形用新形状（`req`），条件求值用这个*只认 `inv:` 与点分键*的最小实现
	//（真路径走引擎 `Sg.rules.matches` —— 自证跑在 main 之前，运行时那时还没建）。
	const fxHolds = (c, pc) => (c?.req ?? []).every((k) => String(k).startsWith('inv:') ? !!(pc?.inv ?? {})[String(k).slice(4)] : !!pc?.[String(k).split('.')[0]]?.[String(k).split('.')[1]]);
	const items = { 护符: { clues: [{ id: 'a', req: ['inv:护符'] }, { id: 'b', req: ['world.seen'] }] } };
	const virgin = { inv: {}, world: {} };

	t('R1 正例：零状态档下无泄漏', virginLeaks(items, virgin, fxHolds).length === 0);
	t('R1 反例：**无任何条件**的线索必须被抓（新形状下忘写条件仍要咬得住）', virginLeaks({ X: { clues: [{ id: 'z' }] } }, virgin, fxHolds).includes('X:z'));

	const api = { isUnlocked: (item, store) => !!store.clues?.[item] };
	t('R2 正例：空记录下无解锁', blankUnlocks(items, api, { clues: {} }).length === 0);
	t('R2 反例：`isUnlocked: () => true` 必须被抓', blankUnlocks(items, { isUnlocked: () => true }, { clues: {} }).length === Object.keys(items).length);

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——A5 门没有咬合力`); process.exit(1); }
	console.log('\n✔ 自证通过：零状态档泄漏 / 空记录解锁 两类反例都会红（★R3–R6 已随 `claims` 对象退役，见件头注释）');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ── 真实运行 ─────────────────────────────────────────────────────────
// ★ `#1315` 审计（下架复验）：**零故事守卫** —— 本件读故事面（`Game.Codex.items`／`Game.Pc`），
//   零故事态下没有可启动的故事页 ⇒ 按 `#1267` 尾件② 同规：**前提不成立就明说未判 ＋ 不计红** ✓
if (storySlugs().length === 0) {
	console.log('○ 零故事：仓内无故事 → 本项**未判**（不计红；接故事根后即参与判定）');
	process.exit(0);
}
// `#1132` 块 1：**顺手修掉一个潜伏地雷** —— 本文件曾有回调引用**未声明标识符 `w`**（HEAD 版即如此），
// 只因 `Game.Codex.items` 为空、那个回调**从未被调用** → 一直不炸（故在此把 `w` 变成**真定义**：
// `createContext()` 返回 `...ctx`，其中含 `window`）。
const { Game, passageSrc, window: w } = createContext();
const fails = [];
const show = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };

const items = Game.Codex?.items ?? {};
const leak = virginLeaks(items, Game.Pc.defaults(), (c, pc) => w.Sg.rules.matches(c, pc, new Set()));
show(leak.length === 0, `R1 零状态档下图鉴无已解锁线索${leak.length ? `：泄漏 ${leak.join(', ')}` : ''}`);

const blanks = blankUnlocks(items, Game.Codex, { clues: {}, endings: [], finals: [] });
show(blanks.length === 0, `R2 空图鉴记录下无已解锁条目${blanks.length ? `：${blanks.join(', ')}` : ''}`);

console.log(`\n  A5 口径（现存两维）：图鉴 ${Object.keys(items).length} 条目 · ${Object.values(items).reduce((n, d) => n + (d.clues?.length ?? 0), 0)} 线索`
	+ `　★R3–R6（谜底/终局级门控）已随声明面 \`Truth.claims\` 退役（全仓 0 命中，见件头注释）`);
if (fails.length) { console.error(`\n✗ A5 回读友好门未通过（${fails.length} 项）`); process.exit(1); }
console.log('✔ A5 回读友好门通过：零状态不泄底、空记录不泄底（★后四维已随对象退役；恢复条件见件头注释）');
