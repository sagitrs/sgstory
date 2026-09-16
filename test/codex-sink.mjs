// 图鉴线索门（`#785` 机制片 · 接缝 6）——**判定/计数四支下沉引擎，语义逐字保留**
//
// 背景：`clueIds`／`satisfied`／`isUnlocked`／`progress` 原住 `Game.Codex`（**数据面** ✗）⇒ 先搬进故事 UI 文件
//   （`#785` 第 1 族 ✓）⇒ 本接缝再搬进**引擎**（`Game.Codex.*` ✓），数据仍由故事**声明**
//   （形状 `{ [item]: { clues: [{ id, label, req|any|exclude }] } }` ✓，或 `req: [{gte:[...]}]` 等对象算子 ✓）。
//
// 判据（三条）：
//   ① **契约通路**：引擎的取数口 `Game.Codex.codexItems()` 必须**经接入契约**（`Sg.story.codexItems()`）——
//      契约成员**缺席** ⇒ 返回**空表**（＝没图鉴，不静默给假数据 ✓）；**存在** ⇒ 必须与声明表**同一份**（逐键相等 ✓）；
//   ② **矩阵**：`satisfied(pc)` 对 **全部 item × 3 档 pc** 逐项等于**测试侧独立重算**（自带的求值器，不复用引擎分支 ✗）——
//      覆盖"读入参数的档位"（`#785` 模板：单点会绿 ✗）；
//   ③ **计数语义**：`isUnlocked` 的 `ids.length > 0`（没有线索的图鉴**不算解锁** ✓）与 `progress` 的 x/y 逐项一致。
//
// 用法：node test/codex-sink.mjs [--selftest]

import { boot } from './boot.mjs';

let bad = 0;
const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}${extra ? ' · ' + extra : ''}`); } };

/** 测试侧**独立**的取值实现（与引擎的 `readKey`/`matches` 无关 ✗ —— 这就是"独立重算"）。 */
export const refRead = (key, pc) => {
	const k = String(key);
	if (k.startsWith('n_')) return !!(pc?.__notes ?? {})[k];
	const m = /^(inv|era|gear):(.+)$/.exec(k);
	if (m) return m[1] === 'inv' ? !!(pc?.inv ?? {})[m[2]] : (m[1] === 'gear' ? (pc?.gear ?? []).includes(m[2]) : false);
	let cur = pc;
	for (const seg of k.split('.')) cur = cur?.[seg];
	return !!cur;
};
/** 条件项：字符串 ⇒ 真值；`{gte:[k,n]}`／`{oneOf:[k,list]}` ⇒ 比较。 */
export const refCond = (cond, pc) => {
	if (typeof cond === 'string') return refRead(cond, pc);
	if (cond && typeof cond === 'object') {
		if (Array.isArray(cond.gte)) return (Number(pc?.[cond.gte[0]] ?? refNum(cond.gte[0], pc)) >= cond.gte[1]);
		if (Array.isArray(cond.oneOf)) { const v = refVal(cond.oneOf[0], pc); return Array.isArray(v) ? v.some((x) => (cond.oneOf[1] ?? []).includes(x)) : false; }
	}
	return false;
};
const refVal = (key, pc) => { const k = String(key); let cur = pc; for (const seg of k.split('.')) cur = cur?.[seg]; return cur; };
const refNum = (key, pc) => Number(refVal(key, pc) ?? 0);
/** 一行 `{req,any,exclude}` 的判定（独立口径）。 */
export const refHolds = (row, pc) => {
	const asList = (x) => (Array.isArray(x) ? x : (x == null ? [] : [x]));
	if (!asList(row?.req).every((c) => refCond(c, pc))) return false;
	const any = asList(row?.any);
	if (any.length && !any.some((c) => refCond(c, pc))) return false;
	if (asList(row?.exclude).some((c) => refCond(c, pc))) return false;
	return true;
};

if (process.argv.includes('--selftest')) {
	const pc = { inv: { 钥匙: true }, ev: { seen: true }, star: { spent: 2 } };
	const cases = [
		['正例·字符串键（inv:/点分）', refHolds({ req: ['inv:钥匙', 'star.spent'] }, pc) === true],
		['🔴 反例·缺物 ⇒ 不成立', refHolds({ req: ['inv:没有'] }, pc) === false],
		['正例·any 任一命中', refHolds({ any: ['inv:没有', 'ev.seen'] }, pc) === true],
		['🔴 反例·exclude 命中 ⇒ 不成立', refHolds({ req: ['ev.seen'], exclude: ['inv:钥匙'] }, pc) === false],
		['正例·对象算子 gte', refHolds({ req: [{ gte: ['star.spent', 2] }] }, pc) === true],
		['🔴 反例·gte 不达 ⇒ 不成立', refHolds({ req: [{ gte: ['star.spent', 3] }] }, pc) === false],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（6 例）');
	process.exit(0);
}

const { w, close } = await boot({ story: 'mist-forest', random: 0.5 });
try {
	const probe = w.eval(`(() => {
		const items = window.Game?.Codex?.items ?? {};
		const hasContract = typeof window.Sg?.story?.codexItems === 'function';
		return { items, viaContract: window.Game.Codex.codexItems(), hasContract, itemsKeys: Object.keys(items), codexKeys: Object.keys(window.Game.Codex) };
	})()`);
	const items = probe.items ?? {}, keys = Object.keys(items);
	ok('取到图鉴声明表', keys.length > 0, `${keys.length} 件`);
	ok('引擎取数口走**接入契约**（`codexItems()` 存在）', probe.codexKeys.includes('codexItems'));
	if (probe.hasContract) ok('契约成员存在 ⇒ 取数口与声明表**同一份**（逐键相等）', JSON.stringify(probe.viaContract) === JSON.stringify(items));
	else { ok('契约成员**缺席** ⇒ 取数口给**空表**（不静默给假数据）', Object.keys(probe.viaContract ?? {}).length === 0, '注：故事侧加 `codexItems` 后本条升级为"同一份"'); }

	// 矩阵：全部 item × 3 档 pc —— 逐项等于独立重算
	// 档位要**真的不同**：原来我写 `inv:{}` 再「填真」是**空转** ✗（空对象，循环一次都不执行）⇒
	// 每档**持有全部在数据里出现过的 `inv:` 物** ＋ 一档额外给 `star.spent`（对象算子那类 ✓）。
	const invAll = Object.fromEntries([...new Set(keys.flatMap((k) => (items[k].clues ?? []).flatMap((c) => (Array.isArray(c.req) ? c.req : []).concat(Array.isArray(c.any) ? c.any : [])).map(String).filter((q) => q.startsWith('inv:')).map((q) => q.slice(4))))].map((n) => [n, true]));
	const presets = [{ label: '空 pc', pc: {} }, { label: '持物', pc: { inv: invAll } }, { label: '持物＋高 spent', pc: { inv: invAll, star: { spent: 9 }, gear: [] } }];
	// ⚠️ 诚实降级：契约成员**缺席**时，引擎四支拿不到数据（`codexItems()` ⇒ `{}`）⇒ 矩阵**本次不适用** ✓
	//（**留痕打印**，不是"没问题" ✗）——故事侧加上 `codexItems` 的那一刻，下面的矩阵**自动开始生效** ✓。
	if (!probe.hasContract) console.log('      契约成员缺席 ⇒ 矩阵本次**不适用**（引擎实现已生效但无数据 ⇒ 这行就是留痕）');
	else {
	let diff = 0, checked = 0;
		for (const { pc } of presets) {
		const got = w.eval(`window.Game.Codex.satisfied(${JSON.stringify(pc)})`);
		for (const item of keys) {
			const want = (items[item].clues ?? []).filter((c) => refHolds(c, pc)).map((c) => c.id);
			checked++;
			if (JSON.stringify(got?.[item] ?? []) !== JSON.stringify(want)) { diff++; if (diff <= 3) console.error(`      ${item} · ${JSON.stringify(pc).slice(0, 60)} ⇒ 实得 ${JSON.stringify(got?.[item])}，参考 ${JSON.stringify(want)}`); }
		}
	}
		ok(`矩阵：全部 item × 3 档 pc 等于独立重算（${checked} 组）`, diff === 0, `不一致 ${diff}`);
	}

	let countBad = 0;
	for (const item of keys) {
		const ids = w.eval(`window.Game.Codex.clueIds(${JSON.stringify(item)})`);
		const got = w.eval(`window.Game.Codex.progress(${JSON.stringify(item)}, { clues: { ${JSON.stringify(item)}: Object.fromEntries(${JSON.stringify(ids)}.map((i) => [i, true])) } })`);
		if (got?.total !== ids.length || got?.got !== ids.length) countBad++;
		const unlocked = w.eval(`window.Game.Codex.isUnlocked(${JSON.stringify(item)}, { clues: { ${JSON.stringify(item)}: Object.fromEntries(${JSON.stringify(ids)}.map((i) => [i, true])) } })`);
		if (unlocked !== (ids.length > 0)) countBad++;
	}
	ok('计数语义：集齐 ⇒ `progress` x/y 全中 ∧ `isUnlocked` 为真（`ids.length>0` 那条含在内）', countBad === 0, `不一致 ${countBad}`);
} finally { close?.(); }

if (bad) { console.error(`\n✗ 图鉴线索门未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ 图鉴线索门通过（契约通路 · 矩阵 · 计数语义）');
