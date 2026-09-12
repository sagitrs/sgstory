// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['investment']。校验：npm run audit:golden。
export const flag = 'investment';
export const flags = ["investment"];

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪t I1 投入—回报（#291）：G2 失败产出内容 / G4 立场被记住（行为门＋反例）＋ G1·G5·G6 只读报告 ──
// G3：跨时代合龙门（独立核，跑一次真数据；不进 investmentProblems 以免污染其自证样本）
function crossEraProblems() {
	const problems = [], notes = [];
	const dom = Game.Investment?.eraDomain ?? {};
	const past = new Set(dom.past ?? []), branch = new Set(dom.branch ?? []);
	const flagPassages = new Map();
	const note = (flag, p) => { if (!flagPassages.has(flag)) flagPassages.set(flag, new Set()); flagPassages.get(flag).add(p); };
	for (const [name, src] of passageSrc) {
		for (const m of src.matchAll(/<<setflag\s+"(\w+)"/g)) note(m[1], name);
		for (const m of src.matchAll(/<<set\s+\$pc\.(?:world|ev)\.(\w+)\s+to\s+true/g)) note(m[1], name);
	}
	const eraDecl = dom.flagEra ?? {};
	const derive = (flag) => {
		const ps = flagPassages.get(flag);
		if (!ps || !ps.size) return 'unknown';
		if ([...ps].every((p) => past.has(p))) return 'past';
		if ([...ps].some((p) => branch.has(p))) return 'ambiguous';
		return 'present';
	};
	const eraOf = (flag) => eraDecl[flag] ?? derive(flag);
	const crossEra = [];
	for (const [name, src] of passageSrc) {
		for (const m of src.matchAll(/<<if([^>]*)>>((?:(?!<<\/if>>)[\s\S]){0,400}?)<<\/if>>/g)) {
			if (!/<<link[^>]*>>/.test(m[2])) continue;
			const flags = [...m[1].matchAll(/\$pc\.(?:world|ev)\.(\w+)/g)].map((x) => x[1]);
			if (flags.length < 2) continue;
			const eras = new Set(flags.map(eraOf));
			if (eras.has('past') && eras.has('present')) crossEra.push(`${name}（${flags.join('、')}）`);
		}
	}
	if (crossEra.length < 1) problems.push('G3 全仓找不到「跨时代合龙门」：没有任何选项同时引用过去与现在两侧旗标');
	else notes.push(`G3 跨时代合龙门 ${crossEra.length} 处：${crossEra.slice(0, 3).join('；')}`);
	for (const g of dom.crossEraGates ?? []) {
		const src = passageSrc.get(g.p);
		if (!src) { problems.push(`G3 登记段落不存在：${g.p}`); continue; }
		const at = src.indexOf(g.label);
		if (at < 0) { problems.push(`G3 登记选项已不在「${g.p}」：${g.label}`); continue; }
		const slice = src.slice(Math.max(0, at - 300), at);
		const ifs = [...slice.matchAll(/<<if([^>]*)>>/g)];
		const cond = ifs.length ? ifs[ifs.length - 1][1] : '';
		for (const f of g.pastFlags ?? []) {
			if (!cond.includes(f)) problems.push(`G3 「${g.label}」条件里缺过去侧旗标 ${f}`);
			else if (eraOf(f) !== 'past') problems.push(`G3 旗标 ${f} 判定为 ${eraOf(f)}，声明为 past——与时代域表/声明不符`);
		}
		for (const f of g.presentFlags ?? []) {
			if (!cond.includes(f)) problems.push(`G3 「${g.label}」条件里缺现在侧旗标 ${f}`);
			else if (eraOf(f) !== 'present') problems.push(`G3 旗标 ${f} 判定为 ${eraOf(f)}，声明为 present——与时代域表/声明不符`);
		}
	}
	// 歧义旗标（写在 $era 分支段落里）被跨时代门用到时必须显式声明
	for (const g of dom.crossEraGates ?? []) {
		for (const f of [...(g.pastFlags ?? []), ...(g.presentFlags ?? [])]) {
			if (!eraDecl[f] && derive(f) === 'ambiguous') problems.push(`G3 旗标 ${f} 写在时代分支段落内，需在 eraDomain.flagEra 显式声明时代`);
		}
	}
	notes.push(`G3 时代域：past ${(dom.past ?? []).length} 段 · branch ${(dom.branch ?? []).length} 段 · 登记门 ${(dom.crossEraGates ?? []).length} 处`);
	return { problems, notes };
}

function investmentProblems({ keyYields = [], expressive = [], failClueExempt = {} } = {}) {
	const problems = [], notes = [];
	// 关键位点＝yields 落在 keyYields 的位点（keyYields 是「产出」，不是位点名）
	const keySites = new Set(Object.entries(Game.Checks.sites ?? {})
		.filter(([, d]) => d.yields && keyYields.includes(d.yields))
		.map(([name]) => name));
	const CLUE = /<<setflag\s+"|<<give\s+"|<<set\s+\$pc\.(?:world|ev)\.[A-Za-z_]+\s+to\s+true/;
	// G2：关键产出位点的失败档必须给知识型产出（情报旗标／物品）——失败＝信息，不只扣资源
	let seen = 0;
	for (const [name, src] of passageSrc) {
		for (const m of src.matchAll(/<<sitecheck\s+"([^"]+)"[^>]*>>[\s\S]{0,900}?<<if\s+\$last_check\.success>>([\s\S]*?)<<else>>([\s\S]*?)<<\/if>>/g)) {
			const site = m[1];
			if (!keySites.has(site)) continue;
			seen++;
			if (CLUE.test(m[3])) continue;
			if (failClueExempt[site]) { notes.push(`G2 豁免：${site}（${failClueExempt[site]}）`); continue; }
			problems.push(`G2 关键位点「${site}」失败档无知识产出（${name}）`);
		}
	}
	notes.push(`G2 关键位点失败档扫描 ${seen} 处`);
	// G4：表达型选择（立场）必须写入可回收状态，且在别处被消费
	for (const e of expressive) {
		const src = passageSrc.get(e.p);
		if (!src) { problems.push(`G4 登记段落不存在：${e.p}`); continue; }
		const at = src.indexOf(e.label);
		if (at < 0) { problems.push(`G4 登记的立场选项已不在「${e.p}」：${e.label}`); continue; }
		const body = src.slice(at, at + 240);
		const writes = new RegExp(`(?:world|ev)\\.${e.flag}\\b`).test(body) || new RegExp(`setflag\\s+"${e.flag}"`).test(body);
		if (!writes) { problems.push(`G4 立场「${e.label}」未写入 ${e.flag}（说了等于没说）`); continue; }
		const consumed = [...passageSrc.entries()].some(([n, s]) => n !== e.p && new RegExp(`<<if[^>]*\\$pc\\.(?:world|ev)\\.${e.flag}\\b`).test(s));
		if (!consumed) problems.push(`G4 立场旗标 ${e.flag} 未被任何别处回收（记了没用）`);
	}
	return { problems, notes };
}
if (wantAll || arg('investment')) {
	console.log('\n══ ⓪t 投入—回报对称性（I1/#291）——失败给信息 · 立场被记住 · 三条只读报告 ══');
	const I = Game.Investment ?? {};
	const { problems, notes } = investmentProblems({
		keyYields: Game.Checks.keyYields ?? [],
		expressive: I.expressive ?? [],
		failClueExempt: I.failClueExempt ?? {},
	});
	const g3 = crossEraProblems();
	problems.push(...g3.problems);
	notes.push(...g3.notes);
	let bad = problems.length;
	problems.forEach((p) => console.log(`  ✗ ${p}`));
	notes.forEach((n) => console.log(`  · ${n}`));
	// 反例自证（#247「门必须行为化」）：合成登记表 → 检查器须按预期判红/判绿
	{
		const cases = [
			['正例：立场已写入且被回收（真实已接线样本）', { keyYields: [], expressive: [{ id: 'ok', p: '守林人', label: '说一句：它不会变成恶龙', flag: 'keeper_kind' }] }, 0],
			['反例：写了但没回收', { keyYields: [], expressive: [{ id: 'norec', p: '顶楼', label: '折断', flag: 'never_consumed_xyz' }] }, 1],
			['反例：选项已不在段落', { keyYields: [], expressive: [{ id: 'gone', p: '顶楼', label: '不存在的标签', flag: 'x' }] }, 1],
		];
		let selfBad = 0;
		for (const [label, sample, expect] of cases) {
			const hit = investmentProblems(sample).problems.length;
			const ok = expect === 0 ? hit === 0 : hit > 0;
			if (!ok) selfBad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${hit}（期望${expect === 0 ? ' 0' : ' >0'}）`);
		}
		if (selfBad) bad += selfBad;
	}
	// G1/G5/G6 只读报告（有意不 ratchet：数字入基线，等数据说话）
	{
		const clockish = [...passageSrc.values()].join(' ').match(/clock|timer|日程|day_count/gi) ?? [];
		const fogHooks = [...passageSrc.entries()].filter(([, s]) => /fog_thin|fog_/.test(s)).length;
		const seenFinal = [...passageSrc.values()].join(' ').match(/seenFinal\(\)/g)?.length ?? 0;
		const spatial = [...passageSrc.entries()].filter(([, s]) => /二楼|三楼|顶楼|塔基|厅的那一头|门边/.test(s)).length;
		console.log(`  · G1 时间可感：时钟类状态 ${clockish.length} 处（设计如此：§3.5 星账不可测量）；现象层钩子（雾/星力叙述）${fogHooks} 段`);
		console.log(`  · G5 重玩换视角：二周目专属知识层 ${seenFinal} 处（谜底门）`);
		console.log(`  · G6 空间记忆锚：含空间锚句的段落 ${spatial} 段（不引入地图系统，锚走文字）`);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ I1 投入—回报门：${bad} 项`); process.exit(1); }
		console.log('\n✔ I1 投入—回报门通过（G2 失败有信息 · G4 立场被记住 · 自证通过）');
	}
}
};
