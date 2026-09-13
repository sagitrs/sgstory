// 笔记模型门（伞 #422 阶段 1）：`Game.Notes` 的形状与「与现有状态对得上」。
//
// 阶段 1 的契约：笔记是**视图**（grant 只读现有旗标），所以本门不测行为、只测**对齐**——
//   ① 必需字段齐全（title/src/body/tags/era/flagPath/grant）；
//   ② `flagPath` 的键必须**登记在状态契约域**里（Game.State.domains）——防「笔记引用了一个
//      系统里根本不存在的旗标」（比字符串搜索强：它绑定的是 `--state` 那份权威表）；
//   ③ `grant` 是函数，且在**未满足**的默认状态下为假（防「写死 true 的笔记」）；
//   ④ 合成反例自证（缺字段／旗标未登记／grant 写死 true 都必须被检出）。
// 用法：node test/notes-model.mjs [--selftest]
import { readFileSync } from 'node:fs';
import { createContext } from '../scripts/audit/context.mjs';

const SELFTEST = process.argv.includes('--selftest');
const REQUIRED = ['title', 'src', 'body', 'tags', 'era', 'flagPath'];

// `flagPath` 可以是字符串或**字符串数组**（多源 OR，#432-B8/B12）：
// 同一知识的几条获取路径取 any（例：`world.hall_hint` ∨ `ev.hall_seen`）。
// 每条路径都必须①已登记在状态契约域、②在空状态下为假。
export const flagPaths = (e) => (Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath == null ? [] : [e.flagPath]));
const keyOf = (p) => String(p ?? '').split('.').pop();

// 纯函数检查器（自证与真实运行同一份代码）
export function auditNotes(entries, domainKeys) {
	const problems = [];
	for (const [id, e] of Object.entries(entries ?? {})) {
		for (const f of REQUIRED) {
			const v = e?.[f];
			const empty = v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
			if (empty) problems.push(`${id}：缺字段「${f}」`);
		}
		if (e?.grant != null && typeof e.grant !== 'function') problems.push(`${id}：grant 必须是函数或省略（省略＝用 flagPath 求值）`);
		for (const p of flagPaths(e)) {
			const key = keyOf(p);
			// 「域.键」形状：域只能是 ev / world（笔记读的是知识与世界态；持有物不进笔记——#432-B11）
			if (!/^(ev|world)\.[a-z_]\w*$/.test(String(p ?? ''))) problems.push(`${id}：flagPath「${p}」不是「域.键」形状（应为 ev.<键> 或 world.<键>）`);
			else if (!domainKeys.has(key)) problems.push(`${id}：flagPath 的键「${key}」未登记在状态契约域（--state）里`);
		}
	}
	return problems;
}

if (SELFTEST) {
	console.log('══ 笔记模型门 · 自证 ══');
	const dom = new Set(['tav_tips', 'flower_warned', 'hall_hint', 'hall_seen']);
	const good = { n_a: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
	const multi = { n_m: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: ['world.hall_hint', 'ev.hall_seen'] } };
	const cases = [
		['正例（字段齐全＋旗标已登记）', good, 0],
		['反例①：缺字段 body', { n_a: { ...good.n_a, body: '' } }, 1],
		['反例②：flagPath 的键未登记', { n_a: { ...good.n_a, flagPath: 'ev.no_such_key' } }, 1],
		['反例③：grant 写死非函数', { n_a: { ...good.n_a, grant: true } }, 1],
		['正例④：多源 OR（两条路径都已登记）', multi, 0],
		['反例④：多源 OR 其中一条未登记', { n_m: { ...multi.n_m, flagPath: ['world.hall_hint', 'ev.no_such_key'] } }, 1],
		['反例⑤：flagPath 不是「域.键」形状', { n_a: { ...good.n_a, flagPath: 'tav_tips' } }, 1],
	];
	let bad = 0;
	for (const [label, entries, expect] of cases) {
		const got = auditNotes(entries, dom).length;
		const ok = got === expect;
		console.log(`  ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${expect}）`);
		if (!ok) bad++;
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（正例绿／缺字段红／旗标未登记红／grant 写死红／多源 OR 两条路径都查）');
}

const ctx = createContext();
const entries = ctx.Game.Notes.entries;
// 状态契约域的全部键（权威表）
const domainKeys = new Set();
for (const d of ctx.Game.State.domains) {
	for (const k of d.keys ?? []) domainKeys.add(k);
	for (const pre of d.prefix ?? []) {
		for (const id of Object.keys(entries)) { for (const p of flagPaths(entries[id])) { const k = keyOf(p); if (k?.startsWith(pre)) domainKeys.add(k); } }
	}
}
console.log('\n══ 笔记模型门（阶段 1：形状与对齐）══');
console.log(`  笔记 ${Object.keys(entries).length} 条｜状态契约域键 ${domainKeys.size} 个`);
const problems = auditNotes(entries, domainKeys);
// ③ 空状态下不得"已知"（笔记不该一开局就成立）——按 flagPath 求值验证（多源 OR：每条路径都不得为真）
{
	const empty = { ev: {}, world: {}, inv: {} };
	for (const [id, e] of Object.entries(entries)) {
		for (const p of flagPaths(e)) {
			let cur = empty;
			for (const seg of String(p).split('.')) { cur = cur == null ? undefined : cur[seg]; }
			if (cur) problems.push(`${id}：flagPath「${p}」在空状态下为真（写死？）`);
		}
	}
}

// ── ⑦ 接入契约（#436-b）：`Sg.notes` 只经 `Sg.story.notes()` 取表；未注册 ⇒ fail-loud ──
{
	console.log('\n══ 接入契约（#436-b）══');
	const Sg = ctx.Sg;
	const story = Sg.story;
	const realNotes = story?.notes;
	let bad2 = 0;
	const t2 = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}`); else { bad2++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); } };
	t2('故事已注册 `Sg.story.notes()`（本仓在 `15-tables.twee` 的 `:: StoryBindings`）', typeof realNotes === 'function');
	// 行为化：换掉提供者 ⇒ `Sg.notes` 立刻反映（证明它**确实经契约取数**，不是自己去摸 Game.Notes）
	try {
		const probe = { n_probe: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
		story.notes = () => probe;
		t2('换掉 `Sg.story.notes()` ⇒ `Sg.notes.ids()` 立刻跟着变（＝确实经契约）', Sg.notes.ids().join() === 'n_probe', Sg.notes.ids().join());
		// 结构缺失 ⇒ fail-loud
		delete story.notes;
		let threw = '';
		try { Sg.notes.ids(); } catch (e) { threw = String(e.message); }
		t2('未注册 ⇒ **报错**（不静默当空表）', threw.includes('接入契约'), threw || '（没有报错）');
		// 结构**畸形**也要报错（只兜"数据缺失"，不兜"形状不对"）
		for (const [label, bad] of [['null', () => null], ['数组', () => []], ['非对象', () => 'x']]) {
			story.notes = bad;
			let th = '';
			try { Sg.notes.ids(); } catch (e) { th = String(e.message); }
			t2(`提供者返回 ${label} ⇒ **报错**（形状不对 ≠ 空表）`, th.includes('结构畸形'), th || '（没有报错）');
		}
		// 空对象是**合法空表**（数据缺失，不报错）
		story.notes = () => ({});
		let ok = true;
		try { ok = Sg.notes.ids().length === 0; } catch { ok = false; }
		t2('提供者返回 `{}` ⇒ 合法空表（数据缺失不报错）', ok);
	} finally { story.notes = realNotes; }   // 复原（下面的用例还要用真表）
	t2('复原后仍读真表', Sg.notes.ids().length >= 13, String(Sg.notes.ids().length));
	t2('`Sg.story.rules()` 已占位且返回数组（阶段 4／`#435` 落地时只改实现）', Array.isArray(Sg.story.rules?.()), String(Sg.story.rules?.()));
	if (bad2) { console.error(`\n✗ 接入契约：${bad2} 项`); process.exitCode = 1; }
}

if (problems.length) {
	for (const p of problems) console.error(`  ✗ ${p}`);
	console.error(`\n✗ 笔记模型门：${problems.length} 项`);
	process.exit(1);
}
console.log('✔ 全部笔记字段齐全、flagPath 与状态契约域对齐、grant 未写死');
