// canon 规则层声称门（#247「Game.Rules.claims」，实现名 Game.RuleClaims）——行为门：
//   每条＝一条 canon 条文 × 一条**可执行探针**（渲染某段落 × 某时代 × 某状态 → 断言屏上文本）。
//   ① 条文侧：docAnchor 必须逐字存在于 docs/lore-canon.md（条文被改写/删除＝红）；
//   ② 正文侧：include 必须全部在屏、exclude 必须全部不在屏（正文与 canon 脱钩＝红）；
//   ③ 空探针（只有登记没有断言）＝红（防纸面登记）。
// 溯源：#239 类「正文与 canon 各说各话」——人力走查发现，本门把它变成常设防线。
// 用法：node test/rules-claims.mjs [--selftest]
import { readFileSync } from 'node:fs';
// #381：boot 改为**延迟加载**——`--selftest` 是纯函数检查（合成夹具 + 假 render），
// 以前却要先付一次 jsdom 启动（实测 ~15s，与主跑同价）。ESM 顶层 import 会被提升到
// selftest 分支之前，所以只能动态 import。

const SELFTEST = process.argv.includes('--selftest');
const DOC = 'docs/lore-canon.md';
const docText = readFileSync(DOC, 'utf8');

// ── 纯函数检查器（合成反例可注入 render）────────────────────────
function checkClaims(claims, canonText, render) {
	const problems = [];
	for (const c of claims) {
		if (!c.docAnchor || !canonText.includes(c.docAnchor))
			problems.push(`条文锚丢失：${c.id} → ${DOC} 里已找不到「${c.docAnchor}」`);
		if (!(c.include?.length || c.exclude?.length))
			problems.push(`空探针（只有登记、没有断言）：${c.id}`);
		const text = render(c);
		if (text == null) { problems.push(`渲染失败：${c.id} → ${c.p}`); continue; }
		for (const s of c.include ?? [])
			if (!text.includes(s)) problems.push(`正文与 canon 脱钩：${c.id} → 「${s}」不在 ${c.p}/${c.era} 屏上`);
		for (const s of c.exclude ?? [])
			if (text.includes(s)) problems.push(`正文与 canon 脱钩：${c.id} → 「${s}」不该出现在 ${c.p}/${c.era}`);
	}
	return problems;
}

// ── 自证：正例 1 ＋ 反例 4（每条反例都必须真的被检出）────────────
if (SELFTEST) {
	console.log('══ canon 规则层声称门 · 自证 ══');
	const mk = (o) => ({ id: 'x', sec: '§0', docAnchor: '在塔门外翻转', p: 'P', era: 'past', include: ['甲'], exclude: [], ...o });
	let bad = 0;
	const cases = [
		['正例（好条目）', [mk({})], (c) => '甲 乙 丙', 0],
		['反例①：include 不在屏', [mk({ include: ['丁'] })], () => '甲 乙', 1],
		['反例②：exclude 命中', [mk({ exclude: ['乙'] })], () => '甲 乙', 1],
		['反例③：条文锚在文档里不存在', [mk({ docAnchor: '这条条文根本不存在于 canon' })], () => '甲', 1],
		['反例④：空探针（只有登记）', [mk({ include: [], exclude: [] })], () => '甲', 1],
	];
	for (const [label, claims, render, expect] of cases) {
		const got = checkClaims(claims, docText, render).length;
		const ok = got === expect;
		console.log(`  ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${expect}）`);
		if (!ok) bad++;
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（正例绿／脱钩红／越界红／条文锚丢失红／空探针红）');
	process.exit(0);   // #381：自证到此为止——以前没有这行，`--selftest` 会**继续跑完整个主流程**：
	                   // 既白花 ~15s（与主跑同价），又把「自证是否通过」和「主跑是否通过」混成一个退出码
}

// ── 真实运行：jsdom 渲染探针 ────────────────────────────────
// 车卡：boot（d20 恒 11，中性）＋ 等链接出现再点（固定 sleep 在 2 核 runner 上会假失败）
const { boot } = await import('./boot.mjs');   // #381 延迟加载：--selftest 不再付 jsdom 启动成本
const { w, sleep, uncaught } = await boot({ random: 0.5 });
const waitFor = async (fn, what, tries = 30) => {
	for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await sleep(100); }
	throw new Error(`等不到「${what}」@ ${w.SugarCube.State.passage}`);
};
const clickLabel = async (label) => {
	const a = await waitFor(() => [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent === label), label);
	a.click(); await sleep(250);
};
await clickLabel('踏上旅途');
await waitFor(() => w.document.querySelector('.choice-card'), '预设卡');
const card = [...w.document.querySelectorAll('.choice-card')][0];
const fast = await waitFor(() => [...card.querySelectorAll('a')].find((a) => a.textContent.includes('快速成型')), '快速成型');
fast.click(); await sleep(300);
await clickLabel('出发，前往歪脖子鸭酒馆');
if (typeof w.SugarCube.State.variables.pc?.abilities?.str !== 'number') throw new Error('车卡后状态不完整');
const snap = JSON.stringify(w.SugarCube.State.variables);
const setPath = (path, val) => w.eval(`(function(){const v=SugarCube.State.variables;v.${path}=${JSON.stringify(val)}})()`);
const render = (c) => {
	w.eval(`(function(){const v=SugarCube.State.variables;for(const k of Object.keys(v))delete v[k];Object.assign(v,${snap});})()`);
	setPath('era', c.era);
	for (const [path, val] of Object.entries(c.set ?? {})) setPath(path, val);
	return { play: c.p, state: c };
};

console.log('\n══ canon 规则层声称门（Game.Rules.claims）══');
const claims = w.Game.RuleClaims.claims;
console.log(`  声称 ${claims.length} 条｜canon 文档 ${DOC}`);
const texts = new Map();
for (const c of claims) {
	render(c);
	w.SugarCube.Engine.play(c.p);
	await sleep(200);
	texts.set(c.id, (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' '));
}
const problems = checkClaims(claims, docText, (c) => texts.get(c.id) ?? null);
if (problems.length) {
	for (const p of problems) console.error(`  ✗ ${p}`);
	console.error(`\n✗ canon 规则层声称门：${problems.length} 项`);
	process.exit(1);
}
console.log('✔ 全部声称与正文一致（条文锚在文档中、探针在屏上/越界句不在屏上、无空探针）');
