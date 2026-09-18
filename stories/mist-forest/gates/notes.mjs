// ⓪w 笔记模型门（伞 #422；升级自 `test/notes-model.mjs`，`#436` 原范围 1＋2）：
//     ① **形状与对齐**：每条笔记字段齐全、`flagPath` 的键**登记在状态契约域**里、空状态下不为真；
//     ② **接入契约**（`#436-b`）：`Sg.notes` 只经故事注册的 `Sg.story.notes()` 取表，结构缺失／形状畸形 ⇒ 报错；
//     ③ **消费可数**：每条笔记**至少一个消费点**——把「加了线索没人用」变成红灯。
//        零消费者的笔记必须在 `Game.State.bookkeeping` 里**带理由**声明（复用既有单一权威，不另立清单）。
//
// 判据口径：
//   · 「消费」＝该笔记的 `flagPath` 键被**读**（`readKeys()`，与写点同一处权威）**或**笔记 id 被引用
//     （`note:n_x` / `Sg.notes.has('n_x')` —— 伞 #422 阶段 2/4 之后的主要形态，故现在就一起算，
//      这样门在阶段推进时**不需要改判据**）。
//   · **反沉默**：`bookkeeping` 里声明了零消费、实际却有消费点的笔记键 ⇒ 红（声明烂在那里）。
import { readFileSync, readdirSync } from 'node:fs';
import { readKeys, declCondRefs } from '../../../scripts/audit/lib/shared.mjs';
   // `#437` C-2c-3：单源读点基线（该故事的数据）

export const flag = 'notes';
export const flags = ['notes'];

// 形状与对齐的判定已搬到 core ✓（页面与门跑**同一份** ⇒ 一处实现 ✓）：
//   `editor/lib/core/stateDiagnose.mjs` 的 `auditShape` ✓（`findings` 形状照 `editor/lib/core/diagnose.mjs` ✓）。
//   ⚠️ 本文件**不再自带** `REQUIRED`／`keyOf`／`auditShape` 的定义 ✗ ⇒ 只 import ＋ 转出（老调用方不变 ✓）。
import { auditShape, flagPaths, keyOf, notepathProblems, singleReadProblems, singleWriteProblems, auditConsumption, rowReads } from '../../../editor/lib/core/stateDiagnose.mjs';
export { flagPaths };
// ── 纯函数：消费可数（#436 原范围 2）────────────────────────────────────────
// `reads`：限定键（`ev.x`/`world.x`）→ 读点集合；`refText`：整份源码文本（找 `note:<id>` 引用）
// `declaredNotes`（可选，`#785` 第 1 族收口）：**声明式条件**（`req: ['n_x']`）里引用的笔记 id ——
// 线索判定从"手写谓词"改声明式条件后，消费点住在**数据字符串**里 ⇒ 只认 `note:<id>`／`Sg.notes.has(...)`
// 的旧口径看不见它 ✗（实测 `n_keeper_why` 被判「零消费」）。传的是**权威口径** `declCondRefs()` 的结果 ✓。
// 消费可数（`auditConsumption`）已搬到 core ✓（页面与门同一份 ✓）；本文件不再自带它 ✗。
// ⚠️ 它在 core 里返回 **findings** ⇒ 消费点映回老形状（输出逐字节不变 ✓）；
//   而本门的**自证**直接用它（只断言 `.length` ✓）⇒ 无需改 ✓。
export const SINGLE_READ_BASELINE = {
	// ✅ `#437` C-2c-3 完成（2026-09-15，`#720` 的分类器扩面之后）：9 处单源读点全部改成 `Sg.notes.has(id, pc)`，
	// 基线**清空**（空对象＝"本故事没有单源 `readPath` 读点"）。新增一处 ⇒ 门当场红（判据在 `singleReadProblems()`）。
	// 多源笔记（`ev.hall_seen`／`ev.study_found`）**仍用 `readPath`** —— 那是"哪一条路径拿到了"的语义，必须保留。
};

// 源用法三条（`notepathProblems`／`singleReadProblems`／`singleWriteProblems`）已搬到 core ✓
// （页面与门跑同一份 ⇒ 一处实现 ✓）；本文件不再自带它们 ✗ —— 只 import。
// ⚠️ 它们在 core 里返回 **findings**（四键同形 ✓）⇒ 本门在消费点映回老形状（输出逐字节不变 ✓）。
export const run = (ctx) => {
	console.log('\n══ ⓪w 笔记模型门（伞 #422）——形状/对齐 · 接入契约 · 消费可数 ══');
	const domains = ctx.Game.State?.domains ?? [];
	const entries = ctx.Game.Notes?.entries ?? {};
	const SRC_FILES = ctx.SRC_FILES ?? [];
	const sources = {};
	for (const f of SRC_FILES) sources[f] = readFileSync(f, 'utf8');
	const allText = Object.values(sources).join('\n');

	// 状态契约域的全部键（权威表）：`d.keys` ∪ 前缀匹配（前缀匹配需对**现有条目**求值，与既有实现一致）
	const domainKeys = new Set();
	for (const d of domains) {
		for (const k of d.keys ?? []) domainKeys.add(k);
		for (const pre of d.prefix ?? []) {
			for (const id of Object.keys(entries)) for (const p of flagPaths(entries[id])) { const k = keyOf(p); if (k?.startsWith(pre)) domainKeys.add(k); }
		}
	}
	// 读点集合（键 → 读点）：用**单一权威** `readKeys()`；`#435` 前置 0：再加上**表行的读点**
	// （`req`/`any`/`exclude` ⇒ `ruleRowKeys()`）——否则条件搬进表后笔记会被判「零消费」
	const reads = rowReads(ctx.window?.Sg?.story?.rules?.() ?? [], entries);
	for (const [f, src] of Object.entries(sources)) {
		for (const line of src.replace(/\/%[\s\S]*?%\//g, '').split('\n')) {
			for (const k of readKeys(line)) {
				if (!reads.has(k)) reads.set(k, new Set());
				reads.get(k).add(f.split('/').pop());
			}
		}
	}

	let bad = 0;
	// ── 自证（先证会红，再判真实数据；失败**计入退出码**且**不崩**——dev-conventions §9①②）──
	{
		const dom = new Set(['tav_tips', 'flower_warned', 'hall_hint', 'hall_seen']);
		const good = { n_a: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
		const cases = [
			['形状·正例（字段齐全＋旗标已登记）', auditShape(good, dom).length, 0],
			['形状·缺字段 body → 红', auditShape({ n_a: { ...good.n_a, body: '' } }, dom).length, 1],
			['形状·键未登记 → 红', auditShape({ n_a: { ...good.n_a, flagPath: 'ev.no_such_key' } }, dom).length, 1],
			['形状·grant 写死非函数 → 红', auditShape({ n_a: { ...good.n_a, grant: true } }, dom).length, 1],
			['形状·多源 OR 两条路径都查 → 红（其一未登记）', auditShape({ n_a: { ...good.n_a, flagPath: ['world.hall_hint', 'ev.no_such_key'] } }, dom).length, 1],
			['形状·flagPath 非「域.键」形状 → 红', auditShape({ n_a: { ...good.n_a, flagPath: 'tav_tips' } }, dom).length, 1],
		];
		for (const [label, got, want] of cases) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		// 消费可数：四种形态各一例（有读／零读⇒红／零读已声明⇒通过／声明却已读⇒僵尸）
		const R = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]));
		const cse = [
			['消费·正例：**限定键**有读点（`ev.tav_tips`）→ 通过', auditConsumption(good, R({ 'ev.tav_tips': ['a.twee'] }), [], '').length, 0],
			['消费·零读且未声明 → 红', auditConsumption(good, R({}), [], '').length, 1],
			['消费·零读但已声明（bookkeeping 带理由）→ 通过', auditConsumption(good, R({}), ['tav_tips'], '').length, 0],
			['消费·已声明却真的被读了 → 僵尸豁免红', auditConsumption(good, R({ 'ev.tav_tips': ['a.twee'] }), ['tav_tips'], '').length, 1],
			['消费·域写错（只有 `world.tav_tips` 的读点）⇒ 仍算零消费（#365 口径）', auditConsumption(good, R({ 'world.tav_tips': ['a.twee'] }), [], '').length, 1],
			['消费·**声明式条件**里的 note id（`req: [\'n_a\']`，经 `declCondRefs`）也算消费', auditConsumption(good, R({}), [], '', new Set(['n_a'])).length, 0],
			['消费·笔记 id 被条件引用（`note:n_a`）也算消费', auditConsumption(good, R({}), [], "req: ['note:n_a']").length, 0],
			// #435 前置 0：表行读点（`ruleRowKeys`）也算消费——否则搬家后笔记会被判"零消费"
			['消费·表行 `req` 里的 note id 算消费（经 `ruleRowKeys` 展开到 flagPath）', auditConsumption(good, rowReads([{ id: 'R', req: ['n_a'] }], good), [], '').length, 0],
			['消费·表行**没有**指向它的读点 ⇒ 仍算零消费（反沉默）', auditConsumption(good, rowReads([{ id: 'R', req: ['n_other'] }], good), [], '').length, 1],
		];
		// `#437` 批三 C-2b′：`<<notepath>>` 判据（path 合法性 · 多源必须显式声明）
		const multi = { n_hall: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: ['world.hall_hint', 'ev.hall_seen'] } };
		const single = { n_one: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
		const npc = [
			['notepath·正例：path 属于该笔记 ==> 0 项', notepathProblems({ entries: multi, sources: { 'a.twee': '<<notepath "n_hall" "ev.hall_seen">>' } }).length, 0],
			['notepath·🔴 path 不属于该笔记（typo）⇒ 报', notepathProblems({ entries: multi, sources: { 'a.twee': '<<notepath "n_hall" "ev.typo">>' } }).length, 1],
			['notepath·🔴 笔记 id 未登记 ⇒ 报', notepathProblems({ entries: single, sources: { 'a.twee': '<<notepath "n_nope" "ev.tav_tips">>' } }).length, 1],
			['notepath·🔴 多源笔记用 `<<note>>` ⇒ 报（必须声明写哪一条）', notepathProblems({ entries: { ...multi, ...single }, sources: { 'a.twee': '<<note "n_hall">>' } }).length, 1],
			['notepath·正例：单源笔记用 `<<note>>` ⇒ 不报', notepathProblems({ entries: single, sources: { 'a.twee': '<<note "n_one">>' } }).length, 0],
			['notepath·边界：多源**声明了 setPath** ⇒ `<<note>>` 合法（不搞一刀切）', notepathProblems({ entries: { n_hall: { ...multi.n_hall, setPath: 'ev.hall_seen' } }, sources: { 'a.twee': '<<note "n_hall">>' } }).length, 0],
			['notepath·边界：注释里的 `<<notepath>>` 示例不算（遮注释）', notepathProblems({ entries: single, sources: { 'a.twee': '/% 例：<<notepath "n_one" "ev.wrong">> %/' } }).length, 0],
		];
		// `#437` C-2c-3：单源笔记不得用 `readPath` 读（多源保留）
		const ent = {
			n_one: { flagPath: 'ev.one' },
			n_multi: { flagPath: ['world.m1', 'ev.m2'] },
		};
		const srp = [
			['单源读点·正例：`has(id)` ⇒ 不报', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.has('n_one')" } }).length, 0],
			['单源读点·🔴 单源笔记用 `readPath` ⇒ 报（基线外）', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.readPath(pc, 'ev.one')" } }).length, 1],
			['单源读点·✅ 基线内 ⇒ 不报（带移除计划，允许过渡）', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.readPath(pc, 'ev.one')" }, baseline: { 'a.twee::ev.one': 'C-2c-3 待搬' } }).length, 0],
			['单源读点·🔴 基线腐烂（已修好还留着基线）⇒ 报', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.has('n_one')" }, baseline: { 'a.twee::ev.one': 'C-2c-3 待搬' } }).length, 1],
			['单源读点·边界：**多源**笔记用 `readPath` ⇒ **不报**（那是"哪一条路径"的语义，必须保留）', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.readPath(pc, 'ev.m2')" } }).length, 0],
		];
		for (const [label, got, want] of srp) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		// `#733` 片 2：单源笔记不得走 notepath／addPath（与"多源必须显式"互补）
		const sing = { n_one: { flagPath: 'ev.one' } };
		const mul = { n_two: { flagPath: ['world.a', 'ev.b'] } };
		const swp = [
			['单源写·🔴 单源用 `<<notepath>>` ⇒ 报', singleWriteProblems({ entries: sing, sources: { 'a.twee': '<<notepath "n_one" "ev.one">>' } }).length, 1],
			['单源写·✅ 单源用 `<<note>>` ⇒ 不报', singleWriteProblems({ entries: sing, sources: { 'a.twee': '<<note "n_one">>' } }).length, 0],
			['单源写·🔴 单源用 `addPath()` ⇒ 报', singleWriteProblems({ entries: sing, sources: { 'a.twee': "Sg.notes.addPath('n_one', 'ev.one')" } }).length, 1],
			['单源写·边界：**多源**用 `<<notepath>>`／`addPath()` ⇒ 不报（那是必须的）', singleWriteProblems({ entries: mul, sources: { 'a.twee': '<<notepath "n_two" "ev.b">>' } }).length, 0],
		];
		for (const [label, got, want] of swp) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		for (const [label, got, want] of npc) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		for (const [label, got, want] of cases.length === 0 ? [] : cse) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
	}

	// ── 真实数据 ──
	const bk = ctx.Game.State?.bookkeeping ?? [];
	// `#877`：判定件出 **findings**（同形 ✓）⇒ 这里映回本门的老形状（输出逐字节不变 ✓）
	const shape = auditShape(entries, domainKeys).map((f) => ({ id: f.target.event, detail: f.detail }));
	const cons = auditConsumption(entries, reads, bk, allText, new Set(declCondRefs(allText).notes)).map((f) => ({ id: f.target.event, detail: f.detail }));
	const nps = notepathProblems({ entries, sources }).map((f) => ({ id: f.target.event, detail: f.detail }));   // `#437` C-2b′：`<<notepath>>` 的 path/多源判据
	const swps = singleWriteProblems({ entries, sources }).map((f) => ({ id: f.target.event, detail: f.detail }));   // `#733` 片 2：单源不得走 notepath／addPath
	const srps = singleReadProblems({ entries, sources, baseline: SINGLE_READ_BASELINE }).map((f) => ({ id: f.target.event, detail: f.detail }));   // `#437` C-2c-3
	// 空状态下不得"已知"（笔记不该一开局就成立）——按 flagPath 求值验证（多源 OR：每条路径都不得为真）
	const emptyProblems = [];
	{
		const empty = { ev: {}, world: {}, inv: {} };
		for (const [id, e] of Object.entries(entries)) {
			for (const p of flagPaths(e)) {
				let cur = empty;
				for (const seg of String(p).split('.')) { cur = cur == null ? undefined : cur[seg]; }
				if (cur) emptyProblems.push({ id, detail: `flagPath「${p}」在空状态下为真（写死？）` });
			}
		}
	}
	// 接入契约（#436-b）：`Sg.notes` 必须经故事注册的提供者取表；结构缺失／形状畸形 ⇒ 报错（行为化验证）
	const contract = [];
	{
		const Sg = ctx.Sg;
		const story = Sg?.story;
		const realNotes = story?.notes;
		if (typeof realNotes !== 'function') contract.push({ id: 'Sg.story.notes', detail: '故事未注册 `Sg.story.notes()`（接入契约 #436-b/#441-E）' });
		else {
			try {
				const probe = { n_probe: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
				story.notes = () => probe;
				const viaContract = Sg.notes.ids().join() === 'n_probe';   // 换提供者 ⇒ 立刻跟着变＝确实经契约
				story.notes = () => null;
				let threwNull = '';
				try { Sg.notes.ids(); } catch (e) { threwNull = String(e.message); }
				story.notes = () => [];
				let threwArr = '';
				try { Sg.notes.ids(); } catch (e) { threwArr = String(e.message); }
				story.notes = () => ({});
				let emptyOk = false;
				try { emptyOk = Sg.notes.ids().length === 0; } catch { /* 不该抛 */ }
				story.notes = () => { throw new Error('提供者内部炸'); };
				let threwFn = '';
				try { Sg.notes.ids(); } catch (e) { threwFn = String(e.message); }
				story.notes = realNotes;   // **复原**（后面还要用真表）
				if (!viaContract) contract.push({ id: 'Sg.notes', detail: '`Sg.notes` 未经 `Sg.story.notes()` 取表（换提供者后结果没变）' });
				if (!threwNull.includes('结构畸形')) contract.push({ id: 'Sg.notes', detail: '提供者返回 `null` 未报错（形状不对 ≠ 空表）' });
				if (!threwArr.includes('结构畸形')) contract.push({ id: 'Sg.notes', detail: '提供者返回数组未报错' });
				if (!emptyOk) contract.push({ id: 'Sg.notes', detail: '提供者返回 `{}` 应视为合法空表' });
				if (!threwFn) contract.push({ id: 'Sg.notes', detail: '提供者内部抛错应向上传播（不许静默吞）' });
			} catch (e) { contract.push({ id: 'Sg.notes', detail: `接入契约检查自身异常（${String(e.message).slice(0, 60)}）` }); }
			finally { story.notes = realNotes; }
		}
		if (!Array.isArray(ctx.Sg?.story?.rules?.())) contract.push({ id: 'Sg.story.rules', detail: '`Sg.story.rules()` 应返回数组（阶段 4／#435 的占位契约）' });
	}

	const printed = [...shape, ...emptyProblems, ...contract, ...cons, ...nps, ...srps, ...swps];
	console.log(`  笔记 ${Object.keys(entries).length} 条｜状态契约域键 ${domainKeys.size} 个｜零消费豁免 ${bk.filter((k) => Object.values(entries).some((e) => flagPaths(e).map(keyOf).includes(k))).length} 条`);
	if (!printed.length) console.log('  ✓ 形状齐全 · flagPath 与域表对齐 · 空状态不为真 · 接入契约成立 · 每条笔记都有消费点 · `<<notepath>>` 的 path 合法且多源已显式声明');
	for (const p of printed.slice(0, 12)) { console.log(`  ✗ ${p.id}：${p.detail}`); bad++; }
	if (printed.length > 12) { console.log(`  …另有 ${printed.length - 12} 项`); bad += printed.length - 12; }

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 笔记模型门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 笔记模型门通过（形状/对齐 + 接入契约 + 消费可数 + `notepath` path/多源 + 自证）');
	}
};
