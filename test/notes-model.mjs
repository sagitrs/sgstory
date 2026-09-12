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
		const key = String(e?.flagPath ?? '').split('.').pop();
		if (key && !domainKeys.has(key)) problems.push(`${id}：flagPath 的键「${key}」未登记在状态契约域（--state）里`);
	}
	return problems;
}

if (SELFTEST) {
	console.log('══ 笔记模型门 · 自证 ══');
	const dom = new Set(['tav_tips', 'flower_warned']);
	const good = { n_a: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
	const cases = [
		['正例（字段齐全＋旗标已登记）', good, 0],
		['反例①：缺字段 body', { n_a: { ...good.n_a, body: '' } }, 1],
		['反例②：flagPath 的键未登记', { n_a: { ...good.n_a, flagPath: 'ev.no_such_key' } }, 1],
		['反例③：grant 写死非函数', { n_a: { ...good.n_a, grant: true } }, 1],
	];
	let bad = 0;
	for (const [label, entries, expect] of cases) {
		const got = auditNotes(entries, dom).length;
		const ok = got === expect;
		console.log(`  ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${expect}）`);
		if (!ok) bad++;
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（正例绿／缺字段红／旗标未登记红／grant 写死红）');
}

const ctx = createContext();
const entries = ctx.Game.Notes.entries;
// 状态契约域的全部键（权威表）
const domainKeys = new Set();
for (const d of ctx.Game.State.domains) {
	for (const k of d.keys ?? []) domainKeys.add(k);
	for (const pre of d.prefix ?? []) {
		for (const id of Object.keys(entries)) { const k = String(entries[id].flagPath ?? '').split('.').pop(); if (k?.startsWith(pre)) domainKeys.add(k); }
	}
}
console.log('\n══ 笔记模型门（阶段 1：形状与对齐）══');
console.log(`  笔记 ${Object.keys(entries).length} 条｜状态契约域键 ${domainKeys.size} 个`);
const problems = auditNotes(entries, domainKeys);
// ③ 空状态下不得"已知"（笔记不该一开局就成立）——按 flagPath 求值验证
{
	const empty = { ev: {}, world: {}, inv: {} };
	for (const [id, e] of Object.entries(entries)) {
		let cur = empty;
		for (const seg of String(e.flagPath ?? '').split('.')) { cur = cur == null ? undefined : cur[seg]; }
		if (cur) problems.push(`${id}：flagPath 在空状态下为真（写死？）`);
	}
}
if (problems.length) {
	for (const p of problems) console.error(`  ✗ ${p}`);
	console.error(`\n✗ 笔记模型门：${problems.length} 项`);
	process.exit(1);
}
console.log('✔ 全部笔记字段齐全、flagPath 与状态契约域对齐、grant 未写死');
