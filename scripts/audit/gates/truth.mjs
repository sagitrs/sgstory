// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['truth']。校验：npm run audit:golden。
export const flag = 'truth';
export const flags = ["truth"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;
// ── D1/D8 判据实现（#247 D8）：锚数 ≥3 ＋ 类型 ≥2 ＋ 类型声明与来源一致 ──
// 类型口径（可机检）：codex＝设定集/图鉴页；echo＝该 (p,anchor) 出现在 Game.Echoes.list；social＝锚句出现在
// 交涉面板文本里；prose＝其余正文。声明与来源不符即红——防「标签造假」的假冗余。
function claimProblems(claims, { minAnchors = 3, minTypes = 2 } = {}) {
	const problems = [];
	const echoPairs = new Set();
	for (const e of Game.Echoes?.list ?? []) for (const x of e.echo ?? []) echoPairs.add(`${x.p}::${x.anchor}`);
	const socialText = (Game.Social?.asks ?? []).map((a) => [a.ok, a.bad, a.will, a.auto, a.why].filter(Boolean).join(' ')).join(' ');
	const sourceTypeOf = (site) => {
		if (echoPairs.has(`${site.p}::${site.anchor}`)) return 'echo';
		if ((site.p ?? '').startsWith('设定集') || (site.p ?? '').startsWith('图鉴')) return 'codex';
		if (socialText.includes(site.anchor)) return 'social';
		return 'prose';
	};
	for (const c of claims) {
		const n = (c.sites ?? []).length;
		if (n < minAnchors) problems.push(`${c.id}：锚 ${n} < ${minAnchors}`);
		const types = new Set((c.sites ?? []).map((s) => s.type ?? sourceTypeOf(s)));
		if (types.size < minTypes) problems.push(`${c.id}：线索类型 ${types.size} < ${minTypes}（${[...types].join('/')}）`);
		for (const site of c.sites ?? []) {
			const src = passageSrc.get(site.p);
			if (src === undefined) { problems.push(`${c.id}：段落「${site.p}」不存在`); continue; }
			if (!src.includes(site.anchor)) problems.push(`${c.id}：锚句丢失「${site.p}」→「${site.anchor}」`);
			if (site.type && site.type !== sourceTypeOf(site)) {
				problems.push(`${c.id}：类型声明不符（声明 ${site.type}／实际 ${sourceTypeOf(site)}）「${site.p}」→「${site.anchor}」`);
			}
		}
	}
	return { problems, echoPairs };
}
if (wantAll || arg('truth')) {
	console.log('\n══ ⓪ 真相可达性（D1/D8）——每命题 ≥3 通路，线索类型 ≥2，类型声明须与来源一致 ══');
	const { problems, echoPairs } = claimProblems(Game.Truth.claims);
	let bad = problems.length;
	for (const c of Game.Truth.claims) {
		const types = [...new Set(c.sites.map((s) => s.type))].join('/');
		const miss = problems.filter((p) => p.startsWith(`${c.id}：`));
		console.log(`  ${miss.length ? '⚠' : ' '} ${c.id}（锚 ${c.sites.length}·${types}）：${c.claim}`);
		for (const s of c.sites) console.log(`      ✓${s.p}（${s.type}）${s.via ? ` · ${s.via}` : ''}`);
		miss.forEach((m) => console.log(`      ✗ ${m.split('：').slice(1).join('：')}`));
	}
	// 反例自证（#247「门必须行为化」）：合成四条样本，检查器必须按预期判红/判绿
	{
		const mk = (id, sites) => ({ id, claim: '合成样本', sites });
		const cases = [
			['正例：3 锚 2 类型', mk('ok', [
				{ p: '设定集·术语', anchor: '星力', type: 'codex' },
				{ p: '门厅', anchor: '铁门', type: 'prose' },
				{ p: '门厅', anchor: '挂哨子', type: 'prose' }]), 0],
			['反例：锚数不足', mk('few', [
				{ p: '设定集·术语', anchor: '星力', type: 'codex' },
				{ p: '门厅', anchor: '铁门', type: 'prose' }]), 1],
			['反例：类型单一', mk('mono', [
				{ p: '门厅', anchor: '铁门', type: 'prose' },
				{ p: '门厅', anchor: '挂哨子', type: 'prose' },
				{ p: '书房', anchor: '二楼', type: 'prose' }]), 1],
			['反例：类型声明造假', mk('fake', [
				{ p: '门厅', anchor: '铁门', type: 'codex' },
				{ p: '门厅', anchor: '挂哨子', type: 'prose' },
				{ p: '书房', anchor: '二楼', type: 'prose' }]), 1],
		];
		let selfBad = 0;
		for (const [label, sample, expect] of cases) {
			const hit = claimProblems([sample]).problems.length;
			const ok = (expect === 0 ? hit === 0 : hit > 0);
			if (!ok) selfBad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${hit}（期望${expect === 0 ? ' 0' : ' >0'}）`);
		}
		if (selfBad) bad += selfBad;
		console.log(`      自证：回声锚对 ${echoPairs.size} 个（类型判定源）`);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D1/D8 真相门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D1/D8 真相门通过（全命题 ≥3 锚 · 类型 ≥2 · 声明与来源一致 · 反例自证通过）');
	}
}
};
