// #28 表驱动审计：node scripts/audit.mjs —— 查 window.Game 三表产出伞 #21/#22 报表，
// 替代一次性 jsdom 探查脚本。改表即改报告，秒级重算（无需启动场景）。
// 用法：node scripts/audit.mjs [--canon] [--checks] [--economy] [--items] [--dragon] [--combat] [--social]（缺省全输出）
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createContext } from './audit/context.mjs';

// #316 拆分第 1 步：加载区（源文件发现 / vm 直载 [script] / 预设 / 段落索引 / CLI）已抽到
// scripts/audit/context.mjs——各门模块的共同依赖。此处仅做绑定，**不改任何加载语义**。
const ctx = createContext();
const { SRC_FILES, Rules, Pc, Chargen, ChargenPresets, Game, presets, passageSrc, passageRaw, passageTags, arg, wantAll } = ctx;

// ── ⓪ D1 真相可达性（#35）：命题 × 通路，锚点机检 ──
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

// ── ⓪b D4 世界活性（#38）：回声锚检 + set-never-echoed 覆盖门 ──
// #267：叙事态分级——每个被写入的旗标必须落一桶（echo/mechanic/ending/codex/provenance/engine）
// 推导优先，声明兜底：导出不了桶 → 红；声明 provenance/engine 却仍有叙事条件消费 → 错标红
function classifyNarrativeState() {
	// 注释（/% … %/）里的示例不是代码——先剥离，免得把文档里的 <<firstTime "X">> 当成真写入
	const stripped = new Map([...passageSrc.entries()].map(([n, src]) => [n, src.replace(/\/%[\s\S]*?%\//g, ' ')]));
	const isEngine = (name) => !!passageTags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
	const isEnding = (name) => name.startsWith('结局');
	const hasIf = (src, flag) => new RegExp(`<<if[^>]*\\$pc\\.(?:world|ev)\\.${flag}\\b`).test(src);
	const written = new Set();
	for (const src of stripped.values()) {
		for (const m of src.matchAll(/<<setflag\s+"(\w+)"/g)) written.add(m[1]);
		for (const m of src.matchAll(/<<set\s+\$pc\.(?:world|ev)\.(\w+)\s*to/g)) written.add(m[1]);
		for (const m of src.matchAll(/pc\.(?:world|ev)\.(\w+)\s*=\s*true/g)) written.add(m[1]);
		for (const m of src.matchAll(/pc\.(?:world|ev)\[["'](\w+)["']\]\s*=\s*true/g)) written.add(m[1]);
		// #267：宏式写入（键是字面量参数）——<<firstTime "X">> 走 $pc.ev[X]，静态 set 正则看不见
		for (const m of src.matchAll(/<<firstTime\s+"(\w+)">>/g)) written.add(m[1]);
	}
	const E = Game.Echoes;
	const echoFlags = new Set([...E.list.flatMap((e) => [e.cause.flag, e.cause.token]), ...E.revisit.flatMap((r) => [r.flag, r.inv])].filter(Boolean));
	const tblSrc = passageSrc.get('Game Tables') ?? '';
	const codexFlags = new Set([...tblSrc.matchAll(/p\.(?:ev|world)\??\.(\w+)/g)].map((m) => m[1]));
	const decl = { ...(Game.Consequences?.provenance ?? {}), ...(Game.Consequences?.engine ?? {}) };
	const prop = { ...(Game.Consequences?.provenance ?? {}) };
	const buckets = new Map();
	const problems = [];
	for (const flag of written) {
		// 先算派生桶（echo 优先——回声表本身就是登记表），再校验声明是否与实况一致
		const narrHit = [...stripped.entries()].some(([n, src]) => !isEngine(n) && !isEnding(n) && hasIf(src, flag));
		const endHit = [...stripped.entries()].some(([n, src]) => isEnding(n) && hasIf(src, flag));
		const engHit = [...stripped.entries()].some(([n, src]) => isEngine(n) && hasIf(src, flag));
		let derived = null;
		if (echoFlags.has(flag)) derived = 'echo';
		else if (narrHit) derived = 'mechanic';
		else if (endHit) derived = 'ending';
		else if (codexFlags.has(flag)) derived = 'codex';
		else if (engHit) derived = 'engine?';
		if (flag in decl) {
			const claimed = flag in prop ? 'provenance' : 'engine';
			if (derived && derived !== 'engine?') problems.push(`「${flag}」声明为 ${claimed}，但实际属于 ${derived}——错标（声明与实况不一致）`);
			else if (!String(decl[flag] ?? '').trim()) problems.push(`「${flag}」声明缺理由（why）`);
			buckets.set(flag, claimed);
			continue;
		}
		if (derived === 'engine?') { buckets.set(flag, 'engine?'); problems.push(`「${flag}」只在引擎段落被读——请登记为 engine（带理由）或补叙事消费`); continue; }
		if (derived) { buckets.set(flag, derived); continue; }
		buckets.set(flag, 'none');
		problems.push(`「${flag}」无任何桶——无正文消费也无登记（假选择嫌疑）`);
	}
	return { written, buckets, problems };
}

// #266：锚句「条件归属」扫描——从段首到锚点走一遍条件栈，取出锚点处生效的 if 条件
//（支持 if/elseif/else/switch 与 link 体；`not` 归一化为 negated 标记，else 分支取反）
function conditionOwner(src, anchor) {
	const idx = src.indexOf(anchor);
	if (idx < 0) return { conds: [], inLink: false };
	const re = /<<(\/?if|\/?link|elseif|else|\/?switch)\b[^>]*>>/g;
	const stack = [];
	const norm = (tok) => {
		const m = tok.match(/<<if\s+not\s+([\s\S]*?)>>/);
		return m ? { text: m[1], negated: true } : { text: tok.replace(/^<<(?:if|elseif|switch)\s*/, '').replace(/>>$/, ''), negated: false };
	};
	let m;
	while ((m = re.exec(src)) && m.index < idx) {
		const tok = m[1];
		if (tok === '/if' || tok === '/switch' || tok === '/link') { stack.pop(); continue; }
		if (tok === 'if' || tok === 'switch') { stack.push({ kind: 'cond', cond: norm(m[0]) }); continue; }
		if (tok === 'elseif') { const top = stack[stack.length - 1]; if (top?.kind === 'cond') top.cond = norm(m[0]); continue; }
		if (tok === 'else') { const top = stack[stack.length - 1]; if (top?.kind === 'cond') top.cond = { text: top.cond.text, negated: !top.cond.negated }; continue; }
		if (tok === 'link') stack.push({ kind: 'link' });
	}
	return {
		conds: stack.filter((s) => s.kind === 'cond' && s.cond).map((s) => ({ ...s.cond, raw: '' })),
		inLink: stack.some((s) => s.kind === 'link'),
	};
}
// 登记 cause → 期望条件正则（flag → world/ev.X；token → inv["X"]；towerFlag → tower.X）
function causeReg(cause) {
	if (!cause) return /$^/;
	if (cause.token) return new RegExp(`inv\\s*(?:\\.|\\[)?["']?${cause.token}`);
	if (cause.towerFlag) return new RegExp(`tower\\.${cause.towerFlag}`);
	if (cause.gear) return new RegExp(`gear[^]*${cause.gear}`);
	return new RegExp(`(?:world|ev)\\s*(?:\\.|\\[)["']?${cause.flag}`);
}

if (wantAll || arg('echoes')) {
	console.log('\n══ ⓪b 世界活性回声（D4/#38）——行为×回声，锚句须在位 ══');
	let bad = 0;
	const kinds = {};
	for (const e of Game.Echoes.list) {
		kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
		for (const site of e.echo) {
			const src = passageSrc.get(site.p);
			if (src === undefined) { console.log(`  ✗ ${e.id}：位点段落「${site.p}」不存在`); bad++; continue; }
			if (!src.includes(site.anchor)) { console.log(`  ✗ ${e.id}：「${site.p}」锚句丢失「${site.anchor}」`); bad++; continue; }
			// #266 条件归属：锚句必须落在以登记 cause（或显式 gate）为条件的块内，且不在 <<link>> 体内
			const own = conditionOwner(src, site.anchor);
			const expect = site.gate ? new RegExp(site.gate) : causeReg(e.cause);
			if (own.inLink && !site.inLinkOk) {
				console.log(`  ✗ ${e.id}：「${site.p}」锚句在 <<link>> 体内（点击态文本——入场看不到，且多随 goto 重绘消失）`); bad++; continue;
			}
			if (!own.conds.length) {
				console.log(`  ✗ ${e.id}：「${site.p}」锚句无条件门（假回声——任何人都看得到，与 cause 无因果）`); bad++; continue;
			}
			if (!own.conds.some((c) => expect.test(c.text) && (!c.negated || site.negate))) {
				console.log(`  ✗ ${e.id}：「${site.p}」条件归属不符——登记 cause ${JSON.stringify(e.cause)}，实际最内层门：${own.conds.slice(-2).map((c) => (c.negated ? '!' : '') + c.text).join(' / ')}`); bad++; continue;
			}
			console.log(`  ✓ ${e.id}（${e.kind}）→ ${site.p}`);
		}
	}
	for (const r of Game.Echoes.revisit) {
		const src = passageSrc.get(r.p);
		if (src === undefined || !src.includes(r.anchor)) { console.log(`  ✗ revisit ${r.flag ?? r.inv}：「${r.p}」锚句丢失「${r.anchor}」`); bad++; continue; }
		const own = conditionOwner(src, r.anchor);
		const expect = r.gate ? new RegExp(r.gate) : causeReg(r.inv ? { token: r.inv } : { flag: r.flag });
		if (!own.conds.length || !own.conds.some((c) => expect.test(c.text) && (!c.negated || r.negate))) {
			console.log(`  ✗ revisit ${r.flag ?? r.inv}：「${r.p}」条件归属不符（实际最内层门：${own.conds.slice(-2).map((c) => (c.negated ? '!' : '') + c.text).join(' / ') || '无'}）`); bad++;
		}
	}
	console.log(`  （revisit 留痕 ${Game.Echoes.revisit.length} 处全锚定；分类：${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' ')}）`);
	// #267：旗标分级由 ⓪q 选择后果门统一裁决（回声门只管回声本身）
	const _cls = classifyNarrativeState();
	if (_cls.problems.length) console.log(`  （另有 ${_cls.problems.length} 项旗标分级问题——见 ⓪q 选择后果门）`);

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D4 回声门：${bad} 项失锚/未覆盖`); process.exit(1); }
		console.log('\n✔ D4 回声门通过（全回声锚句在条件门内；旗标分级见 ⓪q）');
	}
}

// ── ⓪c D2 选择意义感（#36）：选择表机检 + 幽灵技能门 + 过程差异占比 ──
if (wantAll || arg('choices')) {
	console.log('\n══ ⓪c 选择意义感（D2/#36）——非任意·非二元·后果可见 ══');
	let bad = 0;
	// 可点臂数（下界）：每个 <<link>> 与 [[ ]] 记一臂——同目标的两个选择肢也算两臂
	const outEdges = (name) => {
		const src = passageSrc.get(name) ?? '';
		return (src.match(/<<link\b/g) ?? []).length + (src.match(/\[\[/g) ?? []).length;
	};
	// 交涉面板（B2）也发臂：<<socpanel "诉求">> 的每条开口方式与筹码都是可点的一项
	const socArms = (name) => {
		let n = 0;
		for (const m of (passageSrc.get(name) ?? '').matchAll(/<<socpanel\s+"([^"]+)"/g)) {
			const a = Game.Social?.ask?.(m[1]);
			if (!a) continue;
			n += (a.sites ?? []).length + (a.levers ?? []).length + (a.willing ? 1 : 0);
		}
		return n;
	};
	let nonEnding = 0;
	for (const c of Game.Choices.sites) {
		let okArm = true;
		if (c.kind === 'chargen') {
			const n = ctx.ChargenRounds[c.round]?.options.length;
			okArm = n === c.arms;
			if (!okArm) { console.log(`  ✗ ${c.id}：ChargenRounds[${c.round}] 臂数 ${n} ≠ 表 ${c.arms}`); bad++; }
		} else {
			const src = passageSrc.get(c.p);
			if (src === undefined) { console.log(`  ✗ ${c.id}：段落「${c.p}」不存在`); bad++; okArm = false; }
			else {
				const e = outEdges(c.p) + socArms(c.p);
				okArm = e >= c.arms;
				if (!okArm) { console.log(`  ✗ ${c.id}：「${c.p}」可点臂 ${e} < 表臂 ${c.arms}（臂数虚标？）`); bad++; }
			}
		}
		if (c.landing !== 'ending') nonEnding++;
		if (okArm) console.log(`  ✓ ${c.id}（${c.arms} 臂 → ${c.landing}）`);
	}
	const ratio = nonEnding / Game.Choices.sites.length;
	console.log(`  过程差异（landing≠ending）占比 ${(ratio * 100).toFixed(0)}%（验收 ≥50%）`);
	if (ratio < 0.5) { console.log('  ✗ 过程差异占比不足 50%'); bad++; }
	// 幽灵技能门：车卡注入技能 ⊆ 位点技能 ∪ 特殊消费 ∪ 豁免
	const siteSkills = new Set(Object.values(Game.Checks.sites).map((x) => x.skill).filter(Boolean));
	// 特殊消费从表派生（防门与表脱节）：经济 skillDiscount + 文本消费声明
	const consumed = new Set([...Object.values(Game.Economy.events).map((e) => e.skillDiscount?.skill).filter(Boolean), '洞悉']);
	const exempt = new Set(Object.keys(Game.Choices.exemptSkills));
	const injected = new Set();
	for (const round of ctx.ChargenRounds) for (const opt of round.options) for (const m of String(opt.apply).matchAll(/skills\.push\(([^)]*)\)/g)) for (const sk of m[1].matchAll(/'([^']+)'/g)) injected.add(sk[1]);
	const ghosts = [...injected].filter((sk) => !siteSkills.has(sk) && !consumed.has(sk) && !exempt.has(sk));
	if (ghosts.length) { console.log(`  ✗ 幽灵技能（注入无消费未豁免）：${ghosts.join('、')}`); bad += ghosts.length; }
	else console.log(`  幽灵技能门：注入 ${injected.size} 技能全部有消费或豁免`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D2 选择门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D2 选择门通过');
	}
}

// ── ⓪i 反 S/L 门（M10）：关键产出不许只有一条路 ──
if (wantAll || arg('sel') || arg('nosl')) {
	console.log('\n══ ⓪i 反 S/L 门（M10）——关键东西不止一条路，且判定属性不同 ══');
	let bad = 0;
	const sites = Game.Checks.sites;
	const keys = Game.Checks.keyYields ?? [];
	const byYield = new Map(keys.map((k) => [k, []]));
	for (const [site, d] of Object.entries(sites)) {
		if (!d.yields) continue;
		if (!byYield.has(d.yields)) { console.log(`  ✗ 位点「${site}」的 yields=「${d.yields}」不在 keyYields 里`); bad++; continue; }
		const ab = d.abil ?? Rules.SKILLS[d.skill];
		byYield.get(d.yields).push({ site, ab, dc: d.dc });
	}
	// 交涉诉求（B2）：同一句诉求换手段＝换属性；另有一条"免检筹码"（不给骰子机会）
	for (const a of Game.Social?.asks ?? []) {
		if (!a.yield) continue;
		if (!byYield.has(a.yield)) { console.log(`  ✗ 诉求「${a.id}」的 yield=「${a.yield}」不在 keyYields 里`); bad++; continue; }
		const list = byYield.get(a.yield);
		for (const site of a.sites ?? []) {
			const d = sites[site];
			if (!d) { console.log(`  ✗ 诉求「${a.id}」的开口方式「${site}」不是位点`); bad++; continue; }
			list.push({ site, ab: d.abil ?? Rules.SKILLS[d.skill], dc: d.dc });
		}
		if ((a.levers ?? []).some((l) => l.gives === 'auto') || a.willing) list.free = true;
	}
	for (const [key, paths] of byYield) {
		const abilities = [...new Set(paths.map((p2) => p2.ab))];
		// 交涉诉求：掷骰路子属性不同，**或者**有一条免检筹码（把对方想要的摆出来＝不必掷骰）
		// —— 这就是 D&D 2024「give them what they want → no check」落成的反 S/L 保障
		const ok = paths.free || (paths.length >= 2 && abilities.length >= 2);
		if (!ok) {
			bad++;
			console.log(`  ✗ 「${key}」通路 ${paths.length} 条 · 判定属性 ${abilities.length} 种 · 免检 ${paths.free ? '有' : '无'}——既要多路不同属性，也要有一条不靠骰子的路`);
		}
		console.log(`  ${ok ? '✓' : '✗'} ${key}：${paths.map((p2) => `${p2.site}（${p2.ab} DC${p2.dc}）`).join(' · ')}${paths.free ? ' · 免检筹码' : ''}`);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 反 S/L 门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 反 S/L 门通过（关键产出全部多路可达）');
	}
}

// ── ⓪j 行囊门 + 经济门（A1/A2/A5）：花了钱、带在身上的，必须真的有用 ──
//    行囊＝职业装备（长剑 / 火把），不进口具表（canon §5.0 仍是 10 件），但必须进数值。
if (wantAll || arg('sel') || arg('gear')) {
	console.log('\n══ ⓪j 行囊门 + 经济门——钱花出去、东西带在身上，都要落到机制上 ══');
	let bad = 0;
	const srcAll = SRC_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
	const gearRows = Game.Gear?.defs ?? {};

	// ① 每件行囊：有来源、有说法、有效果、发得出来、优势位点真实
	for (const [k, d] of Object.entries(gearRows)) {
		const eff = (d.damage ?? 0) > 0 || (d.advSites ?? []).length > 0;
		if (!d.from || !d.note || !eff) { console.log(`  ✗ 行囊「${k}」缺来源/说法/效果`); bad++; }
		for (const s of d.advSites ?? []) {
			if (!Game.Checks.sites[s]) { console.log(`  ✗ 行囊「${k}」的优势位点在位点表里不存在：${s}`); bad++; }
		}
		const granted = new RegExp(`gear:\\s*\\[[^\\]]*['"]${k}['"]`).test(srcAll) || srcAll.includes(`gear.push('${k}')`);
		if (!granted) { console.log(`  ✗ 行囊「${k}」没有任何发放点（说了有、没人给）`); bad++; }
		console.log(`  · ${k}：${d.note}（${d.from}）`);
	}
	// ② 正文发的行囊必须在表里（不许有表外装备）
	for (const m of srcAll.matchAll(/gear\.push\(['"]([^'"]+)['"]\)/g)) {
		if (!gearRows[m[1]]) { console.log(`  ✗ 正文发了未登记的行囊：${m[1]}`); bad++; }
	}
	for (const m of srcAll.matchAll(/gear:\s*\[([^\]]*)\]/g)) {
		for (const raw of m[1].split(',')) {
			const k = raw.trim().replace(/['"]/g, '');
			if (k && !gearRows[k]) { console.log(`  ✗ 经济表发了未登记的行囊：${k}`); bad++; }
		}
	}

	// ③ 经济事件必须落地：给东西 / 落旗标 / 给道具，或写明"纯收入/纯代价"的理由
	const CLAIM = {
		torch_buy:    { kind: 'gives' },
		salve_buy:    { kind: 'gives' },
		rumor_buy:    { kind: 'flag', flag: 'rumor' },
		witch_hint:   { kind: 'flag', flag: 'witch_hint' },
		goblin_bribe: { kind: 'flag', flag: 'goblin_spared' },
		forged_scale: { kind: 'item', item: '龙鳞护臂' },
		drink_round:  { kind: 'flag', flag: 'ev.tav_tips' },
		goblin_kill:  { kind: 'income', reason: '打跑了才捡得到——纯收入那一侧' },
		study_errand: { kind: 'income', reason: '跑腿钱——纯收入那一侧' },
		dragon_hoard: { kind: 'income', reason: '巢边识货——纯收入那一侧' },
	};
	const rows = SRC_FILES.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line) => [f, line]));
	// 交涉筹码（B2）：levers[].econ 也是经济事件的使用点——落点不靠"同一行里有 setflag"，
	// 而是**真调一次 apply() 看旗标有没有落地**（比行匹配更硬）
	const leverUses = [];
	for (const a of Game.Social?.asks ?? []) for (const lv of a.levers ?? []) if (lv.econ) leverUses.push({ ask: a, lever: lv });
	const socialSettles = (flagTail, item) => {
		for (const u of leverUses) {
			const stub = ctx.Pc.defaults();
			stub.inv = {}; stub.ev = {}; stub.world = {}; stub.keeper = { met: false, trust: 0, state: 'post', key: false };
			try {
				for (const lv2 of u.ask.levers ?? []) if (typeof lv2.need !== 'function' || lv2.need(stub)) u.ask.apply(stub);
			} catch { /* 条件不满足就算了 */ }
			if (flagTail && (stub.ev?.[flagTail] === true || stub.world?.[flagTail] === true)) return true;
			if (item && stub.inv?.[item]) return true;
		}
		return false;
	};
	for (const [key, ev] of Object.entries(Game.Economy.events)) {
		const c = CLAIM[key];
		const uses = rows.filter(([, line]) => line.includes(`econ "${key}"`));
		const leverOk = leverUses.some((u) => u.lever.econ === key);
		if (!c) { console.log(`  ✗ 经济事件「${key}」没声明落点——要么给出东西，要么在 CLAIM 里写理由`); bad++; continue; }
		if (uses.length === 0 && !leverOk) { console.log(`  ✗ 经济事件「${key}」没有任何使用点（表里挂着、正文没花）；或去掉。）`); bad++; continue; }
		const text = uses.map(([f, line]) => line).join('\n');
		const fail = (why) => { console.log(`  ✗ 经济事件「${key}」${why}`); bad++; };
		if (c.kind === 'gives' && !ev.gives) fail('表里没写 gives');
		const flagTail = (c.flag ?? '').replace(/^ev\./, '');
		if (c.kind === 'flag' && !(text.includes(`setflag "${c.flag}"`) || text.includes(`${flagTail} to true`)) && !socialSettles(flagTail, null)) fail(`正文没落旗标 ${c.flag}（正文与交涉筹码都没落到）`);
		if (c.kind === 'item' && !text.includes(`give "${c.item}"`) && !socialSettles(null, c.item)) fail(`正文没给道具 ${c.item}`);
		if (c.kind === 'income' && !(ev.delta > 0)) fail('写成纯收入却是扣钱');
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 行囊门 + 经济门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 行囊门 + 经济门通过（装备有来源有效果 · 每笔钱都落到东西/旗标上）');
	}
}

// ── ⓪h 互动门（M9）：信息靠动作与交涉换来，不靠自动检定 ──
if (wantAll || arg('interact')) {
	console.log('\n══ ⓪h 互动门（M9）——信息必须由玩家动作发起 ══');
	let bad = 0;
	const stripLinks = (src) => src.replace(/<<link\b[\s\S]*?<\/link>>/g, '（link）');
	const sites = Game.Checks.sites;
	const usedSites = new Set();
	// 战斗动作池（B1）：池里的位点由玩家从面板上选——等同「玩家发起」；
	// 对手位点由 <<fightresolve "位点">> 驱动——等同「进场即动手」（须标 auto）。
	const poolSites = new Set(Object.values(Game.Combat?.actions ?? {}).map((a) => a.site));
	let autoTop = 0, inLink = 0;
	for (const [name, srcRaw] of passageSrc) {
		const tags0 = passageTags.get(name) ?? [];
		if (tags0.includes('script') || tags0.includes('stylesheet') || tags0.includes('widget')) continue; // 只扫正文
		const src = srcRaw.replace(/\/%[\s\S]*?%\//g, '');
		const outer = stripLinks(src);
		for (const m of src.matchAll(/<<sitecheck\s+"([^"]+)"/g)) {
			usedSites.add(m[1]);
			if (!sites[m[1]]) { console.log(`  ✗ 段落「${name}」引用了不存在的位点「${m[1]}」`); bad++; }
		}
		// 战斗结算：<<fightresolve "对手位点" …>> 每一轮都掷——必须存在且标 auto
		for (const m of outer.matchAll(/<<fightresolve\s+"([^"]+)"/g)) {
			usedSites.add(m[1]);
			autoTop++;
			if (!sites[m[1]]) { console.log(`  ✗ 段落「${name}」的战斗对手位点「${m[1]}」不存在`); bad++; continue; }
			if (!sites[m[1]].auto) { console.log(`  ✗ 段落「${name}」的战斗对手位点「${m[1]}」未标 auto 理由`); bad++; }
		}
		// ① 顶层（非 link 内）的检定＝自动检定：只有"进场即动手"的战斗位点可以
		for (const m of outer.matchAll(/<<sitecheck\s+"([^"]+)"/g)) {
			autoTop++;
			const site = sites[m[1]];
			if (!site) continue;
			if (!site.auto) { console.log(`  ✗ 段落「${name}」自动检定「${m[1]}」——信息类检定必须由玩家动作发起（移进 <<link>>，或给位点标 auto 并写明理由）`); bad++; }
		}
		// ② 渲染期读 $last_check ⇒ 同段落顶层必须有检定（否则会读到上一段落的陈旧结果）
		if (outer.includes('$last_check') && !/<<sitecheck\s+"/.test(outer)) {
			console.log(`  ✗ 段落「${name}」顶层读 $last_check 却没有本轮检定——判定结果必须落旗标后再渲染`); bad++;
		}
		inLink += (src.match(/<<sitecheck/g) ?? []).length - (outer.match(/<<sitecheck/g) ?? []).length;
	}
	// ②b 战斗动作池：池里的位点必须在表里（孤儿门的另一半）
	for (const s of poolSites) {
		if (!sites[s]) { console.log(`  ✗ 战斗动作池引用了不存在的位点「${s}」`); bad++; continue; }
		usedSites.add(s);
	}
	// ②c 交涉诉求（B2）：由 <<socpanel "诉求">> 发牌，位点写在诉求的 sites 里——也算「玩家发起」
	const socSites = new Set();
	for (const a of Game.Social?.asks ?? []) for (const s of a.sites ?? []) {
		if (!sites[s]) { console.log(`  ✗ 交涉诉求「${a.id}」引用了不存在的位点「${s}」`); bad++; continue; }
		socSites.add(s); usedSites.add(s);
	}
	// ③ 位点无孤儿（表里有、正文没人用）
	for (const s of Object.keys(sites)) if (!usedSites.has(s)) { console.log(`  ✗ 位点「${s}」在表里但正文没人用`); bad++; }
	// ④ 选择密度（报告项）：内容段落的 字/臂
	const dens = [];
	for (const [name, srcRaw] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet') || name.startsWith('Story')) continue;
		if (name.startsWith('结局') || name.includes('设定集') || name === '样式') continue;
		const src = srcRaw.replace(/\/%[\s\S]*?%\//g, '');
		const chars = src.replace(/\s/g, '').length;
		const arms = (src.match(/<<link\b/g) ?? []).length + (src.match(/\[\[/g) ?? []).length;
		if (arms) dens.push({ name, chars, arms, r: chars / arms });
	}
	dens.sort((x, y) => y.r - x.r);
	console.log(`  检定：${autoTop + inLink + poolSites.size + socSites.size} 处（玩家发起 ${inLink + socSites.size}（交涉 ${socSites.size}）· 进场即动手 ${autoTop} · 战斗动作池 ${poolSites.size}）`);
	console.log(`  最"薄"的五个段落（字/臂）：${dens.slice(0, 5).map((d) => `${d.name} ${d.r.toFixed(0)}`).join(' · ')}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 互动门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 互动门通过（信息类检定全部由玩家动作发起）');
	}
}

// ── ⓪l 交涉门（B2 · D&D 2024 Influence）：意愿三档 · 手段换属性 · 代价因手段而异 ──
if (wantAll || arg('social')) {
	console.log('\n══ ⓪l 交涉门（B2）——同一句诉求换手段、态度定 DC、代价因手段而异 ══');
	let bad = 0;
	const S = Game.Social;
	if (!S?.asks?.length) { console.log('  ✗ 交涉表不存在'); bad++; }
	const apKeys = Object.keys(S?.approaches ?? {});
	const failKinds = new Set();
	// DC 阶梯：态度修正必须就是 DMG 社交交互表压成的那根轴（友好 −5 / 冷淡 0 / 敌意 +5）
	const bogus = Object.entries(S?.attAdj ?? {}).filter(([, v]) => ![0, 5, -5].includes(v));
	if (bogus.length || Object.keys(S?.attAdj ?? {}).length !== 3) {
		console.log(`  ✗ 态度修正不是 DMG 表里的 −5/0/+5 三档：${JSON.stringify(S?.attAdj)}`); bad++;
	} else console.log('  态度阶梯：友好 −5 · 冷淡 0 · 敌意 +5（DMG 社交交互表）');
	for (const a of S?.asks ?? []) {
		const opts = [];
		for (const site of a.sites ?? []) {
			const d = Game.Checks.sites[site];
			if (!d) { console.log(`  ✗ 诉求「${a.id}」的开口方式「${site}」不是位点`); bad++; continue; }
			if (d.abil && !S.approaches[d.abil]) { console.log(`  ✗ 位点「${site}」用 ${d.abil} 豁免，但手段表里没有 ${d.abil} 这一手`); bad++; continue; }
			const sk = d.abil ? d.abil : d.skill;
			if (!S.approaches[sk]) { console.log(`  ✗ 位点「${site}」的技能「${sk}」不在手段表里——面板发不出来`); bad++; continue; }
			opts.push(`${sk} DC${d.dc}`);
		}
		// 筹码：道具/行囊/情报必须真的存在
		for (const lv of a.levers ?? []) {
			if (lv.need) {
				const probe = ctx.Pc.defaults();
				probe.inv = { 日记: true, 观星者的书: true, 时光护符: true, 完整星图: true };
				probe.world = { family_favor: true };
				let okReq = false;
				try { okReq = !!lv.need(probe); } catch { okReq = false; }
				if (!okReq) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」条件在任何情况下都不成立`); bad++; }
			}
			if (lv.needRead && !(a.sites ?? []).some((s) => S.approaches[Game.Checks.sites[s]?.skill ?? Game.Checks.sites[s]?.abil]?.read)) {
				console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」要"读过这人"，但这个诉求没有读人的手`); bad++;
			}
			if (lv.econ && !Game.Economy.events[lv.econ]) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」用了不存在的经济事件「${lv.econ}」`); bad++; }
			if (!['auto', 'adv'].includes(lv.gives)) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」gives=${lv.gives}（只能 auto＝免检 或 adv＝优势）`); bad++; }
		}
		// 三档意愿：至少要有回绝（否则"掷骰无用"这一步没被演示过）
		if (a.unwilling && !a.why) { console.log(`  ✗ 诉求「${a.id}」有 unwilling 分支却没写 why——玩家看不到"为什么掷骰没用"`); bad++; }
		if (a.willing && !a.will) { console.log(`  ✗ 诉求「${a.id}」有 willing 分支却没写 will——免检的过场文案缺了`); bad++; }
		if ((a.sites ?? []).length) {
			if (!a.ok || !a.bad) { console.log(`  ✗ 诉求「${a.id}」有掷骰的路子，却没写成/败两档文案`); bad++; }
			if (!a.done) { console.log(`  ✗ 诉求「${a.id}」没写 done——面板会一直发同一手`); bad++; }
			if (!a.apply) { console.log(`  ✗ 诉求「${a.id}」没写 apply——成功之后拿不到任何东西`); bad++; }
			if ((a.levers ?? []).some((l) => l.gives === 'auto') && !a.auto) { console.log(`  ✗ 诉求「${a.id}」有免检筹码却没写 auto 过场文案`); bad++; }
			const fails = new Set((a.sites ?? []).map((s) => {
				const d = Game.Checks.sites[s];
				const ap = S.approaches[d.abil ? d.abil : d.skill] ?? {};
				return ap.onFail?.retry ? '重试代价' : (ap.onFail?.att ? '态度代价' : '无代价');
			}));
			for (const f of fails) failKinds.add(f);
		}
		console.log(`  ${a.sites?.length || a.levers?.length ? '✓' : '·'} ${a.id}（${a.sites?.length ?? 0} 种开口 · ${a.levers?.length ?? 0} 件筹码${a.willing ? ' · 有愿意' : ''}${a.unwilling ? ' · 有回绝' : ''}）${opts.length ? '：' + opts.join(' / ') : ''}`);
	}
	// 代价要因手段而异（2024：不同手段的失败代价不同）
	for (const k of ['重试代价', '态度代价', '无代价']) if (!failKinds.has(k)) { console.log(`  ✗ 没有任何一手是「${k}」——手段之间没有代价差异`); bad++; }
	console.log(`  代价差异：${[...failKinds].join(' · ')}（游说/历史＝越问越难 · 欺瞒/恐吓＝态度下降 · 表演/洞悉/察觉＝只丢这一句）`);
	// 至少一条常驻面板的「unwilling」示范（让玩家看见"掷骰无用"这一步存在）
	const stubborn = (S.asks ?? []).filter((a) => a.unwilling && !(a.willing));
	if (!stubborn.length) console.log('  ⚠ 没有任何"始终不肯"的诉求——意愿三档里的 unwilling 只是理论');
	else console.log(`  回绝示范：${stubborn.map((a) => a.id).join('、')}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪l 交涉门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪l 交涉门通过（手段换属性、态度定 DC、代价因手段而异、筹码真的存在）');
	}
}

// ── ⓪k 战斗动作池门（B1）：每轮 3 选 1，每个动作三档结果 —— 不许空手、不许无后果 ──
if (wantAll || arg('combat')) {
	console.log('\n══ ⓪k 战斗动作池门（B1）——随机 3 选 1，每手都有属性、成/败/大成功都有后果 ══');
	let bad = 0;
	const C = Game.Combat;
	const MECH = ['dmg', 'adv', 'guard', 'skipFoe', 'venom', 'flag', 'flee'];
	const nakedPc = { inv: {}, gear: [], dragon: {} };
	for (const [pool, ids] of Object.entries(C.pools)) {
		// ① 池子够大：3 选 1 才有意义（去重后）
		const uniq = [...new Set(ids)];
		if (uniq.length < 3) { console.log(`  ✗ 池「${pool}」只有 ${uniq.length} 个动作——凑不出 3 选 1`); bad++; }
		// ② 不同选择＝不同判定：池内至少 2 项属性/技能
		const skills = new Set(uniq.map((id) => {
			const s = Game.Checks.sites[C.actions[id]?.site];
			return s ? (s.skill ?? `save:${s.abil}`) : '缺失';
		}));
		if (skills.size < 2) { console.log(`  ✗ 池「${pool}」所有动作都走同一项判定（${[...skills].join('/')}）——选择没有分化`); bad++; }
		let canHurt = 0, canGuard = 0;
		for (const id of uniq) {
			const a = C.actions[id];
			if (!a) { console.log(`  ✗ 池「${pool}」列了未登记的动作「${id}」`); bad++; continue; }
			if (!Game.Checks.sites[a.site]) { console.log(`  ✗ 动作「${id}」的位点「${a.site}」不在 Checks.sites`); bad++; }
			if (!a.label) { console.log(`  ✗ 动作「${id}」缺 label（面板上没字）`); bad++; }
			for (const k of ['ok', 'crit', 'bad']) {
				const eff = a[k];
				if (!eff || !eff.text) { console.log(`  ✗ 动作「${id}」缺 ${k} 档文案——玩家会撞上"没有后果"`); bad++; }
			}
			// 失败不许给好处（假代价门在战斗里的对应条目）
			const bad_ = a.bad ?? {};
			if (MECH.some((m) => bad_[m])) { console.log(`  ✗ 动作「${id}」的失败档给了收益（${MECH.filter((m) => bad_[m]).join('/')}）——失败就得疼`); bad++; }
			if (MECH.some((m) => a.ok?.[m] || a.crit?.[m])) canHurt++;
			if (a.ok?.guard || a.ok?.skipFoe || a.crit?.guard || a.crit?.skipFoe) canGuard++;
			if (a.need?.startsWith('inv:') && !Game.Items.defs[a.need.slice(4)]) {
				console.log(`  ✗ 动作「${id}」要求道具「${a.need.slice(4)}」，但道具表里没有——这手永远抽不到`);
				bad++;
			}
		}
		// ③ 反 S/L：池里必须同时有"能推进"和"能保命"的手（不会出现全是废牌的死局）
		if (!canHurt) { console.log(`  ✗ 池「${pool}」没有任何能推进战斗的动作——玩家只能挨打`); bad++; }
		if (!canGuard) { console.log(`  ✗ 池「${pool}」没有任何减伤/免伤的动作——只能硬换血`); bad++; }
		// ④ 空手不会死人：裸装（无道具）也能抽出 3 张牌
		const naked = C.offer(pool, 1, nakedPc, null);
		if (naked.length < 3) { console.log(`  ✗ 池「${pool}」裸装只抽到 ${naked.length} 张牌——手牌不足 3 选 1`); bad++; }
		if (ids.some((id) => !C.actions[id])) { /* 上面已报 */ } else { /* 去重后统计 */ }
		const dup = ids.length - uniq.length;
		if (dup) { console.log(`  ✗ 池「${pool}」有重复动作 ${dup} 个`); bad++; }
		console.log(`  ✓ ${pool}：${uniq.length} 手 → 每轮 3 选 1 · 判定 ${[...skills].join('/')} · 可推进 ${canHurt} · 可保命 ${canGuard}`);
	}
	// ⑤ 定档：天然 20＝大成功，其余按成败——三档都必须真的落到动作表里
	const probe = Object.keys(C.actions)[0];
	if (probe) {
		const critOk = C.pick(probe, { roll: 20, success: true }).kind === 'crit';
		const okKind = C.pick(probe, { roll: 11, success: true }).kind === 'ok';
		const badKind = C.pick(probe, { roll: 1, success: false }).kind === 'bad';
		if (!(critOk && okKind && badKind)) { console.log(`  ✗ 定档不对（20→${!critOk} / 成→${!okKind} / 败→${!badKind}）`); bad++; }
		else console.log('  ✓ 定档：骰面 20 → 大成功 · 成功 → 成功档 · 失败 → 失败档');
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪k 战斗动作池门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪k 战斗动作池门通过（每手三档齐备、失败不给收益、裸装也抽得满 3 张）');
	}
}


// ── ⓪s 可访问性门（#272）：对比度 AA ＋ lang ＋ 装饰 glyph 语义 ──
if (wantAll || arg('a11y')) {
	console.log('\n══ ⓪s 可访问性门（#272）——对比度 / lang / 装饰语义 ══');
	let bad = 0;
	const css = readFileSync('src/90-style.twee', 'utf8');
	const lum = (h) => {
		h = h.replace('#', '');
		if (h.length === 3) h = [...h].map((c) => c + c).join('');
		const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
			.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
	const baseMatch = css.match(/body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/);
	const base = baseMatch ? baseMatch[1] : '#191722';
	// AA 门槛：正文 4.5；装饰性/大字白名单 3.0（每条须给理由——仿 #247 的「声明须带理由」）
	const DECOR = { '.title-card .engine-credit': '引擎署名（纯装饰，非玩家内容：仅需大字门槛 3.0，提亮到 3.01:1）' };
	const seen = new Set();
	for (const m of css.matchAll(/([^{}]*?)\{([^}]*)\}/g)) {
		const sel = m[1].trim().split('\n').pop().trim();
		const cm = m[2].match(/(?<!-)\bcolor\s*:\s*(#[0-9a-fA-F]{6})/);
		if (!cm || !sel) continue;
		const key = `${sel}|${cm[1]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const r = ratio(cm[1], base);
		const floor = DECOR[sel] ? 3.0 : 4.5;
		if (r + 1e-9 < floor) { console.log(`  ✗ 对比度 ${r.toFixed(2)}:1 < ${floor} —— ${sel} { color: ${cm[1]} }`); bad++; }
	}
	console.log(`  · 对比度扫描：基准底色 ${base}，检查 ${seen.size} 条声明（阈值 正文 ≥4.5 / 装饰 ≥3.0，装饰白名单 ${Object.keys(DECOR).length} 条带理由）`);
	// lang：构建期注入（dist 存在时一并核对产物）
	const bm = readFileSync('build.mjs', 'utf8');
	if (!/<html[^>]*\\slang=/.test(bm) && !bm.includes('lang="zh-CN"')) { console.log('  ✗ build.mjs 未注入 <html lang>'); bad++; }
	else if (existsSync('dist/index.html') && !/<html[^>]*\slang="zh-CN"/.test(readFileSync('dist/index.html', 'utf8'))) { console.log('  ✗ dist/index.html 缺 lang="zh-CN"'); bad++; }
	// 装饰 glyph：✦ 必须被 aria-hidden 包裹；.act-n 角标必须 aria-hidden
	let bare = 0;
	for (const f of SRC_FILES) {
		const t = readFileSync(f, 'utf8');
		for (const m of t.matchAll(/✦/g)) {
			const before = t.slice(Math.max(0, m.index - 40), m.index);
			if (!/aria-hidden="true">$/.test(before)) bare++;
		}
	}
	if (bare) { console.log(`  ✗ 有 ${bare} 个 ✦ 未被 aria-hidden 包裹（读屏会念出装饰字符）`); bad++; }
	const actn = SRC_FILES.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<span class="act-n"(\s[^>]*)?><\/span>/g)]);
	const actnBad = actn.filter((m) => !(m[1] ?? '').includes('aria-hidden')).length;
	if (actnBad) { console.log(`  ✗ .act-n 角标 ${actnBad} 处缺 aria-hidden`); bad++; }
	console.log('  · 语义：✦ 装饰 glyph 全包裹、.act-n 角标 aria-hidden、<html lang="zh-CN"> 构建期注入');
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 可访问性门：${bad} 项不达标`); process.exit(1); }
		console.log('\n✔ 可访问性门通过（对比度 AA／lang／装饰语义）');
	}
}

// ── ⓪r 软限余量门（#256 方案 A）：五类可信序的付费翻转数 vs budget − 承诺余量 ══
if (wantAll || arg('starbudget')) {
	console.log('\n══ ⓪r 软限余量门（#256）——budget − spent ≥ floor（按序）══');
	const S = Game.Star;
	let bad = 0;
	for (const o of S.orders ?? []) {
		const margin = S.budget - o.spent;
		const ok = margin >= o.floor;
		if (!ok) bad++;
		console.log(`  ${ok ? '✓' : '✗'} ${o.id}：spent ${o.spent}，budget ${S.budget} → 余 ${margin}（承诺 ≥${o.floor}）${ok ? '' : ' ← 违背余量承诺'}`);
	}
	if (!S.orders?.length) { console.log('  ✗ Star.orders 未登记（无法验证余量承诺）'); bad++; }
	console.log(`  （首翻免费＝额外 1 次不计入 spent；宴·散场回程不耗星力。改 budget/免费额度必须同步本表与 canon §3.5）`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 软限余量门：${bad} 项违背余量承诺`); process.exit(1); }
		console.log('\n✔ 软限余量门通过（五类可信序均在承诺余量内）');
	}
}

// ── ⓪q D2 选择后果门（#267）：每个被写入旗标必须落一桶 ══
if (wantAll || arg('consequences')) {
	console.log('\n══ ⓪q 选择后果门（#267）——非任意·非二元·后果可见（机械判据）══');
	const { written, buckets, problems } = classifyNarrativeState();
	const by = {};
	for (const b of buckets.values()) by[b] = (by[b] ?? 0) + 1;
	console.log(`  写入旗标 ${written.size} 个 → ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
	const META = { echo: '回声表（Echoes）', mechanic: '正文条件消费', ending: '结局分支消费', codex: '图鉴线索消费', provenance: '出处登记（带理由）', engine: '引擎/界面态（带理由）' };
	for (const [k, v] of Object.entries(META)) if (by[k]) console.log(`    ${k.padEnd(11)} ${by[k]} 项 ← ${v}`);
	if (problems.length) for (const p of problems) console.log(`  ✗ ${p}`);
	else console.log('  ✓ 每个写入旗标都有归属桶；provenance/engine 声明均带理由且无叙事消费');
	if (process.argv.includes('--check')) {
		if (problems.length) { console.error(`\n✗ 选择后果门：${problems.length} 项未归类/错标`); process.exit(1); }
		console.log('\n✔ 选择后果门通过（旗标分级齐备、声明与实况一致）');
	}
}

// ── ⓪p 位点失败纪律门（#199/#195）：带伤失败必须有解，无解决不许带伤 ──
if (wantAll || arg('sitedisc')) {
	console.log('\n══ ⓪p 位点失败纪律（#199）——伤＝代价，不是空手；无解决不许带伤 ══');
	let bad = 0;
	let seen = 0;
	for (const [name, src] of passageSrc) {
		const re = /<<sitecheck\s+"([^"]+)"[^>]*>>[\s\S]{0,1200}?<<if\s+\$last_check\.success>>([\s\S]*?)<<else>>([\s\S]*?)<<\/if>>/g;
		for (const m of src.matchAll(re)) {
			const site = m[1], badBranch = m[3];
			if (!badBranch.includes('<<damage')) continue; // 只管带伤的失败档
			seen++;
			const resolves = /<<give\s|<<set\s+\$pc\.|<<goto\s/.test(badBranch);
			if (!resolves) {
				console.log(`  ✗ ${name} · ${site}：失败档带 <<damage>> 却不给结果（可无限磨伤）`);
				bad++;
			}
		}
	}
	console.log(`  带伤失败档 ${seen} 处，全部落结果（给东西/置旗标/退场）`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪p 位点失败纪律门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪p 位点失败纪律门通过（带伤失败必有解，无磨伤死角）');
	}
}

// ── ⓪d D3 系统可玩性（#37）：机制发现性门 + 组合矩阵出具 ──
if (wantAll || arg('systems')) {
	console.log('\n══ ⓪d 系统可玩性（D3/#37）——规则不可知则不可实验：发现性锢点机检 ══');
	let bad = 0;
	const chargenText = ctx.ChargenRounds.flatMap((r) => r.options.flatMap((o) => [o.name, o.desc, o.effect])).join('\n');
	for (const m of Game.Systems.mechanics) {
		const src = m.p === '[chargen]' ? chargenText : passageSrc.get(m.p);
		if (src === undefined) { console.log(`  ✗ ${m.id}：源「${m.p}」不存在`); bad++; continue; }
		if (!src.includes(m.anchor)) { console.log(`  ✗ ${m.id}：${m.p} 锚句丢失「${m.anchor}」——规则对玩家不可见`); bad++; continue; }
		console.log(`  ✓ ${m.id}：${m.rule}`);
	}
	// C1 共鸣锚（#49）：锚段落存在且挂了 <<flip>>
	for (const a of Game.Shifts.anchors) {
		const src = passageSrc.get(a);
		if (src === undefined) { console.log(`  ✗ 共鸣锚段落「${a}」不存在`); bad++; continue; }
		if (!passageRaw.get(a).includes('<<flip>>')) { console.log(`  ✗ 共鸣锚「${a}」未挂 <<flip>>`); bad++; continue; }
	}
	console.log(`  共鸣锚：${Game.Shifts.anchors.length} 处全锚定（${Game.Shifts.unlimited ? '免费无限·位置门控' : ''}）`);
	console.log('  ── 机制×机制组合（实现证据出具）──');
	for (const c of Game.Systems.combos) console.log(`  · ${c.a} × ${c.b} ← ${c.evidence}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D3 系统门：${bad} 项规则不可发现`); process.exit(1); }
		console.log('\n✔ D3 系统门通过（核心机制全部有玩家侧说明）');
	}
}

// ── ⓪e D5 语言经济（#39）：载荷标注门 + 词频报告 + 套路句式门 ──
if (wantAll || arg('text')) {
	console.log('\n══ ⓪e 语言经济（D5/#39）——每段有载荷，无陈词滥调 ══');
	let bad = 0;
	// 载荷门：内容段落须有 payload 标注（信息/张力/选择 ≥1）
	const payloads = new Map();
	for (const [name, src] of passageRaw) {
		if (name === 'StoryInit' || name.startsWith('Story')) continue;
		if (passageTags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t))) continue;
		const m = src.match(/payload:\s*(信息|张力|选择)(?:[|｜](?:信息|张力|选择))*/);
		if (!m) { console.log(`  ✗ 段落「${name}」缺 payload 标注`); bad++; }
		else payloads.set(name, m[0].split(':')[1]);
	}
	console.log(`  载荷标注：${payloads.size}（信息 ${[...payloads.values()].filter((v) => v.includes('信息')).length} · 张力 ${[...payloads.values()].filter((v) => v.includes('张力')).length} · 选择 ${[...payloads.values()].filter((v) => v.includes('选择')).length}）`);
	// 词频报告（主题词健康度）
	let narrative = '';
	for (const src of passageSrc.values()) narrative += src.replace(/\/%[\s\S]*?%\//g, '').replace(/<<[^>]*>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[\s''/]/g, '');
	const words = ['雾','星','塔','月光','森林','守林人','信物','三百'];
	console.log(`  主题词密度：${words.map((w) => `${w}×${narrative.split(w).length - 1}`).join(' ')}（总字 ${narrative.length}）`);
	// 套路句式门：白名单外命中即红（改写后划掉）
	const CLICHE = ['如潮水', '毛骨悚然', '倒吸一口', '心中一紧', '你感到一阵', '不由得'];
	// ── D5.6 风格门（#72 西式统一）：违和词黑名单——命名回潮/佛教词/中式餐具与体例
	for (const f of SRC_FILES) {
		const raw = readFileSync(f, 'utf8');
		for (const w of ['青梧', '星官', '星落林', '坠星志', '月光倾城', '平凡之光', '执念', '动筷', '汤盅', '温了又温', '一坛', '爬回了天上', '森林的根里']) {
			const i2 = raw.indexOf(w);
			if (i2 >= 0) {
				const line = raw.slice(0, i2).split('\n').length;
				console.log(`  ✗ 风格违和词「${w}」@ ${f.split('/').pop()}:${line}（#72 黑名单——替换表 docs/archive/westward-unification.md）`);
				bad++;
			}
		}
	}
	console.log('  风格门：黑名单 13 词扫描完成');
		const hits = CLICHE.filter((c) => narrative.includes(c));
	if (hits.length) { console.log(`  ✗ 套路句式命中：${hits.join('、')}`); bad += hits.length; }
	else console.log('  套路句式门：零命中');
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D5 文本门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D5 文本门通过');
	}
}

// ── D7 NPC 动机登记簿门（#253）：三查 ──────────────────────────
// ① 位点全覆盖：全部 <<give>> 调用点＋社交 yield＋立场旗标落位点，必须有登记条目；
// ② 锚句在段内：每条 entry 的 anchor 必须存在于 p 段源码（动机在玩家可见正文有落点）；
// ③ 动机非空：motive 缺条目即红。
if (wantAll || arg('npc')) {
	console.log('\n══ D7 NPC 动机登记簿（#253）══');
	const entries = Object.values(Game.NPC.entries);
	let bad = 0;
	// 位点扫描：give 调用点（剥注释；「道具」＝社交 ok 模板的泛型占位，由 social 条目覆盖）
	const giveSites = new Set();
	for (const [name, src0] of passageSrc) {
		const src = src0.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const m of src.matchAll(/<<give "([^"]+)">>/g)) {
			if (m[1] === '道具' && name === 'Game Tables') continue;
			giveSites.add(`${name}::${m[1]}`);
		}
	}
	for (const site of [...giveSites].sort()) {
		const [p, item] = site.split('::');
		if (!entries.some((e) => e.act === `give:${item}` && e.p === p)) {
			console.log(`  ✗ give 位点未登记：${p} · ${item}`);
			bad++;
		}
	}
	// 社交 yield：全部带 yield 的诉求
	for (const ask of Game.Social.asks ?? []) {
		if (!ask.yield) continue;
		const flagYield = String(ask.yield).startsWith('flag:') ? String(ask.yield).slice(5) : null;
		const covered = entries.some((e) =>
			e.act === `social:${ask.id}`
			|| (flagYield && e.act === `flag:${flagYield}`)
			|| (!flagYield && !String(ask.yield).includes(':') && e.act === `give:${ask.yield}`));
		if (!covered) {
			console.log(`  ✗ 社交让渡未登记：${ask.id}（yield ${ask.yield}）`);
			bad++;
		}
	}
	// 立场旗标落位点
	const flagSites = [
		['flag:witch_hint', /setflag "witch_hint"|world\.witch_hint to true/],
		['flag:rumor', /setflag "rumor"|world\.rumor to true/],
		['flag:flower_warned', /flower_warned to true/],
		['flag:family_favor', /family_favor/],
		['flag:keeper.met', /keeper\.met to true/],
		['flag:keeper.state', /keeper\.state to ("ally"|'ally')/],
	];
	for (const [act, re] of flagSites) {
		const hasSite = [...passageSrc.values()].some((src) => re.test(src) || re.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
		if (hasSite && !entries.some((e) => e.act === act)) {
			console.log(`  ✗ 立场旗标未登记：${act}`);
			bad++;
		}
	}
	// 条目自检：anchor 在段内＋motive 非空
	for (const [id, e] of Object.entries(Game.NPC.entries)) {
		if (!e.motive || !e.motive.trim()) { console.log(`  ✗ ${id}：motive 为空`); bad++; continue; }
		const src = passageSrc.get(e.p);
		if (src === undefined) { console.log(`  ✗ ${id}：段落「${e.p}」不存在`); bad++; continue; }
		if (!src.includes(e.anchor)) { console.log(`  ✗ ${id}：锚句不在「${e.p}」内：「${e.anchor}」`); bad++; }
	}
	console.log(`  登记条目 ${entries.length} 条；give 位点 ${giveSites.size} 处；社交 yield ${ (Game.Social.asks ?? []).filter((a) => a.yield).length } 处`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D7 NPC 动机门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D7 NPC 动机门通过（位点全覆盖 · 锚句全在段内 · 动机非空）');
	}
}

// ── ① 检定成功率矩阵（伞 #22：难度审计）──
// 成功率解析计算：d20 枚举（优势=双骰取高）；自然20必成/自然1必败（SRD 5.2）
function successRate(pc, site, adv) {
	const mod = site.abil ? Rules.save_mod_for_audit ?? Rules.abilityMod(pc, site.abil) : Rules.skillMod(pc, site.skill);
	const single = (r) => (r === 20 ? true : r === 1 ? false : r + mod >= site.dc);
	let win = 0, total = 0;
	for (let a = 1; a <= 20; a++) {
		if (!adv) { total++; if (single(a)) win++; }
		else for (let b = 1; b <= 20; b++) { total++; if (single(Math.max(a, b))) win++; }
	}
	return win / total;
}
// ── ⓪f 龙战推演（#236 改版：封印战三门＝分布感知蒙特卡洛；单挑段保留期望劝退证据）──
if (wantAll || arg('dragon')) {
	console.log('\n══ ⓪f 龙战推演（封印战 MC 三门 · 单挑期望劝退 · 彩蛋击杀率）══');
	const D = Game.Dragon;

	// #236：期望值对连败方差视而不见（旧模型给「只带花毒」发活证书，实测 2 万局活 6.7%）。
	// 改忠实规则的蒙特卡洛：offer 三选一/贪心选牌/道具优势/武器 +1/药膏缺口≥4 自动用/败次 rage 封顶。
	const GAMES = 20000;
	const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const d20 = (rng, adv) => {
		const r1 = 1 + Math.floor(rng() * 20), r2 = 1 + Math.floor(rng() * 20);
		return adv ? Math.max(r1, r2) : r1;
	};
	// 一次性模拟一局封印战（真实动作池/检定/结算——与 fightresolve 同语义）
	const simSeal = (rng, pc0, inv, salves) => {
		const pc = JSON.parse(JSON.stringify(pc0));
		pc.inv = { ...inv }; pc.salves = salves ?? 0; pc.dragon = { hp: D.hp, defeats: 0, venom: false };
		let round = 1, guard = 0, lastUsed = '';
		const modOf = (site) => {
			const s = Game.Checks.sites[site];
			const abil = s.abil ?? Rules.SKILLS[s.skill];
			return Rules.parts(pc, abil, { skill: s.skill }).reduce((a, p) => a + p.v, 0);
		};
		const hitP = (site, adv) => {   // 数值概率（选牌用；结算用真骰）
			let w = adv ? 3 : 1, l = adv ? 1 : 3;	// 20 记胜、1 记败（权重＝两骰取高/取低的计数）
			const mod = modOf(site), dc = Game.Checks.sites[site].dc, need = dc - mod;
			for (let r = 2; r <= 19; r++) (r >= need ? w++ : l++);
			return (w / 20) * (adv ? (w / 20) : 1) + (adv ? 0 : 0) || w / 20; // 简化：无优劣势即 w/20
		};
		const resolveDmg = (n) => {     // <<damage>>：缺口≥4 自动烧药膏（#201）
			pc.hp = Math.max(0, pc.hp - n);
			if (pc.salves > 0 && pc.hp > 0 && pc.max_hp - pc.hp >= 4) { pc.salves--; pc.hp += 4; }
		};
		while (pc.hp > 0 && pc.dragon.hp > D.sealAt && round <= 40) {
			let offer = Game.Combat.offer('封印', round, pc, lastUsed);
			// 贪心选牌：期望值＝命中率×(伤害+0.7×护)+毒(一次性估值 12) − 失手×挨伤
			let best = null, bestEv = -1e9;
			for (const id of offer) {
				const a = Game.Combat.actions[id];
				const site = Game.Checks.sites[a.site];
				const adv = Game.Items.advAt(a.site, pc.inv, pc.gear);
				const p = Math.max(0.05, Math.min(0.95, hitP(a.site, adv)));
				let ev = p * ((a.ok?.dmg ?? 0) + 0.7 * (a.ok?.guard ?? 0)) - (1 - p) * (a.bad?.hurt ?? 0);
				if (a.ok?.venom && !pc.dragon.venom) ev += 12;
				if (ev > bestEv) { bestEv = ev; best = id; }
			}
			// 结算：玩家一手（真骰；优劣势按道具）
			const act = Game.Combat.actions[best];
			const adv = Game.Items.advAt(act.site, pc.inv, pc.gear);
			const roll = d20(rng, adv);
			const mod = modOf(act.site);
			const success = roll === 20 ? true : roll === 1 ? false : roll + mod >= Game.Checks.sites[act.site].dc;
			const r = Game.Combat.playerEff(best, { roll, success }, pc);   // #235：武器 +1 在这条路上
			const eff = r.eff;
			if (eff.dmg) pc.dragon.hp = Math.max(0, pc.dragon.hp - eff.dmg);
			if (eff.guard) guard += eff.guard;
			if (eff.venom) pc.dragon.venom = true;
			if (eff.hurt) resolveDmg(eff.hurt);
			lastUsed = best;
			if (pc.hp <= 0) break;
			if (pc.dragon.hp <= D.sealAt) break;
			// 它的回合：龙·吐息（书＝优势）；败＝rage 递增的实伤
			const fAdv = Game.Items.advAt('龙·吐息', pc.inv, pc.gear);
			const fRoll = d20(rng, fAdv);
			const fMod = modOf('龙·吐息');
			const fOk = fRoll === 20 ? true : fRoll === 1 ? false : fRoll + fMod >= Game.Checks.sites['龙·吐息'].dc;
			if (!fOk) {
				pc.dragon.defeats++;
				const raw = Game.Items.battleDamage(round, pc.inv, pc.dragon.defeats, pc.dragon.venom);
				resolveDmg(Math.max(1, raw - guard));
			}
			round++; guard = 0;
		}
		// 存活＝不死：拖到 40 轮没打完＝玩家会「退出去」（再度沉睡结局，人活着）——与游戏语义一致
		return pc.hp > 0;
	};
	const mcRate = (pc, inv, salves) => {
		const rng = mulberry32(20260911);
		const saved = Math.random; Math.random = rng;	// offer 内部也走种子
		let win = 0;
		for (let i = 0; i < GAMES; i++) if (simSeal(rng, pc, inv, salves)) win++;
		Math.random = saved;
		return win / GAMES;
	};
	// 三门（canon §3.8 口径：满配稳 / 花毒+一件减伤才稳 / 裸装倒）
	const GATES = { '满配': 0.80, '花毒+护臂': 0.50, '裸装': 0.20 };
	const loadouts = {
		'满配':      { inv: { 日记: true, 龙鳞护臂: true, 观星者的书: true, 月光花: true }, salves: 4, up: true },
		'花毒+护臂': { inv: { 龙鳞护臂: true, 月光花: true }, salves: 3, up: true },
		'只带花毒':  { inv: { 月光花: true }, salves: 0, up: false },
		'裸装':      { inv: {}, salves: 0, up: false },
	};
	let mcBad = 0;
	const rates = {};
	for (const p of presets) {
		for (const [ln, L] of Object.entries(loadouts)) {
			const rate = mcRate(p.pc, L.inv, L.salves);
			rates[`${p.name}·${ln}`] = rate;
			const gate = GATES[ln];
			const pass = gate === undefined ? true : (ln === '裸装' ? rate <= gate : rate >= gate);
			if (!pass) mcBad++;
			console.log(`  ${p.name}·${ln}: 存活 ${(rate * 100).toFixed(1)}%（${GAMES} 局）${gate === undefined ? '' : pass ? ' ✓' : ' ✗ 门 ' + (ln === '裸装' ? '≤' : '≥') + Math.round(gate * 100) + '%'}`);
		}
	}
	if (arg('check') && mcBad) { console.error(`\n✗ 封印战 MC 三门未过：${mcBad} 项（分布口径，canon §3.8）`); process.exit(1); }
	console.log('（#236：三门改分布口径——期望值对连败方差视而不见的问题不再。只带花毒无门：canon 未承诺其存活。）');
	// 彩蛋击杀率（M5b 拍板）：需「天然 20」；若位点带劣势 → 1/400。>1% 即红。
	let dragonBad = 0;
	const kill = Game.Checks.sites['龙·终击'];
	if (!kill || kill.nat !== 20) {
		dragonBad++;
		console.log('  ✗ 未定义「龙·终击」彩蛋位点（nat: 20）');
	} else {
		const pNat = 1 / 20;
		const pKill = kill.dis ? pNat * pNat : pNat;
		const ok = pKill <= 0.01;
		if (!ok) dragonBad++;
		console.log(`  单挑彩蛋击杀率 ≈ ${(pKill * 100).toFixed(2)}%（天然 ${kill.nat}${kill.dis ? ' + 劣势' : ''}）→ ${ok ? '✓ 几乎不可达（≤1%）' : '✗ 过高（>1%）'}`);
	}
	const breakers = Object.entries(Game.Items.effects)
		.filter(([, e]) => e.advSite === '龙·终击' || (e.advSites ?? []).includes('龙·终击')).map(([k]) => k);
	if (breakers.length) { dragonBad++; console.log(`  ✗ 破坏平衡的道具仍在给彩蛋位点优势：${breakers.join('、')}`); }
	// 正文不得对「劣势位点」硬写优势（防绕过 effects 表）
	const disSites = Object.entries(Game.Checks.sites).filter(([, s]) => s.dis).map(([k]) => k);
	const hardcoded = [];
	for (const [name, src] of passageSrc) {
		for (const s of disSites) if (src.includes(`<<sitecheck "${s}" "adv">>`)) hardcoded.push(`${name}→${s}`);
	}
	if (hardcoded.length) { dragonBad++; console.log(`  ✗ 正文对劣势位点硬写优势：${hardcoded.join('，')}`); }
	// ── 封印战（v17 补正 #3）：与守林人并肩——把龙打到 sealAt 以下，他才能念完那一句 ──
	console.log('\n  ── 封印战（普通结局·信息不足线）：需打掉 ' + (D.hp - D.sealAt) + ' 点血 ──');
	const sealSite = Game.Checks.sites['龙·斩击'];
	const saveSite = Game.Checks.sites['龙·吐息'];
	const sealLoadouts = {
		'裸装':           { inv: {}, venom: false, adv: true },
		'只带花毒':       { inv: {}, venom: true, adv: true },
		'花毒+护臂':      { inv: { 龙鳞护臂: true }, venom: true, adv: true },
		'花毒+护臂+日记': { inv: { 龙鳞护臂: true, 日记: true }, venom: true, adv: true },
	};
	// 动作池 → 单轮期望（玩家手上有什么，决定这一轮的平均输出与平均减伤）
	const CombatRound = (pc, L) => {
		const A = Game.Combat.actions;
		const ids = Game.Combat.pools['封印'].filter((id) => {
			const need = A[id]?.need;
			return !need || (need.startsWith('inv:') && L.inv[need.slice(4)]);
		});
		let dmg = 0, guard = 0;
		for (const id of ids) {
			const site = Game.Checks.sites[A[id].site];
			const pHit = successRate(pc, site, L.adv);
			const okD = A[id].ok?.dmg ?? 0, crD = A[id].crit?.dmg ?? 0;
			// 大成功 ≈ 1/20（骰面 20），其余成功档
			dmg += (1 / 20) * crD + (pHit - 1 / 20) * okD;
			guard += (A[id].ok?.guard ?? 0) * pHit + (A[id].ok?.skipFoe ? 6 : 0) * pHit;
		}
		// 3 选 1：每轮手上只有 3 张，取池内均值
		return { dmg: dmg / Math.max(1, ids.length), guard: guard / Math.max(1, ids.length) };
	};
	const sealRows = [];
	for (const p of presets) {
		for (const [ln, L] of Object.entries(sealLoadouts)) {
			const pSave = successRate(p.pc, saveSite, !!(L.inv['观星者的书'] || L.adv && false));
			const need = D.hp - D.sealAt;
			// B1：伤害/减伤不再来自单一「斩击」，而是这一轮手上真抽得到的牌（按 3 选 1 的均匀抽样取均值）
			const rot = CombatRound(p.pc, L);
			let dhp = D.hp, taken = 0, r = 0;
			for (; r < 40 && dhp > D.sealAt; r++) {
				dhp -= rot.dmg;
				taken += Math.max(1, Game.Items.battleDamage(r + 1, L.inv, 0, L.venom) - rot.guard) * (1 - pSave);
			}
			const alive = taken <= p.pc.max_hp;
			sealRows.push({ preset: p.name, loadout: ln, rounds: r, taken: Math.round(taken * 10) / 10, hp: p.pc.max_hp, alive });
			console.log(`  ${p.name}·${ln}: 期望 ${r} 轮（每轮 ≈${rot.dmg.toFixed(1)} 伤 / −${rot.guard.toFixed(1)} 受击） · 受击 ${taken.toFixed(1)} vs HP${p.pc.max_hp} → ${alive ? '✓ 活着按住它' : '✗ 先倒下'}`);
		}
	}
	const nakedAlive = sealRows.filter((x) => x.loadout === '裸装' && x.alive).length;
	const bestDead = sealRows.filter((x) => x.loadout === '花毒+护臂+日记' && !x.alive).length;
	if (!(D.sealAt < D.hp)) { dragonBad++; console.log('  ✗ 封印阈值 sealAt 不小于龙的血量（封印无从发动）'); }
	// 门 A：准备不足必须有人站不住（≥1 个预设裸装倒下）
	if (nakedAlive >= presets.length) { dragonBad++; console.log('  ✗ 三个预设裸装都活着按完封印——准备完全无意义'); }
	// 门 B：备齐花毒+减伤必须人人活得下来（普通结局应可达）
	if (bestDead) { dragonBad++; console.log(`  ✗ 备齐花毒+减伤仍会倒下（${bestDead} 个预设）——普通结局应当可达`); }
	// 门 C：毒性/减伤必须真的有用（带花毒一律不比裸装更疼）
	const worse = presets.filter((p) => {
		const naked = sealRows.find((x) => x.preset === p.name && x.loadout === '裸装');
		const venom = sealRows.find((x) => x.preset === p.name && x.loadout === '只带花毒');
		return venom && naked && venom.taken > naked.taken;
	}).length;
	if (worse) { dragonBad++; console.log(`  ✗ 花毒反而更疼（${worse} 个预设）——毒液方向搞反了`); }
	if (process.argv.includes('--check') && dragonBad) { console.error('\n✗ ⓪f 龙战门：彩蛋击杀率或平衡项不合规'); process.exit(1); }
}

if (wantAll || arg('checks')) {
	console.log('\n══ ① 检定成功率矩阵（位点 × 预设，含优势位）══');
	console.log('格式：位点（技能/豁免 DC）→ 铁卫 / 影手 / 秘典  ·★=有优势条件位');
	for (const [key, site] of Object.entries(Game.Checks.sites)) {
		const what = site.abil ? `豁免${site.abil}` : site.skill;
		// #237②：nat 位点不走普通成功率——按彩蛋口径标注（与 --dragon 段同一算法），不再显示 30%(51%) 假数
		if (site.nat) {
			const pNat = 1 / 20;
			const pTrue = site.dis ? pNat * pNat : pNat;
			console.log(`${key.padEnd(10, '　')} ${what} DC${String(site.dc).padEnd(3)} → 彩蛋位：天然${site.nat}${site.dis ? '×劣势' : ''} ≈ ${(pTrue * 100).toFixed(2)}%（全预设同）`);
			continue;
		}
		const cells = presets.map((p) => {
			const plain = successRate(p.pc, site, false);
			const adv = successRate(p.pc, site, true);
			const mark = adv - plain > 0.001 ? '★' : ' ';
			return `${(plain * 100).toFixed(0).padStart(3)}%${mark}${adv > plain ? `(${(adv * 100).toFixed(0)}%)` : '    '}`;
		});
		console.log(`${key.padEnd(10, '　')} ${what} DC${String(site.dc).padEnd(3)} → ${cells.join('  ')}`);
	}
}

// ── ② 经济收支时间线（伞 #22：余额审计）──
if (wantAll || arg('economy')) {
	console.log('\n══ ② 经济收支时间线（起点 = 预设车卡终资）══');
	for (const p of presets) {
		console.log(`\n【${p.name}】起点 ${p.pc.gold} 金`);
		let g = p.pc.gold, min = g;
		const byChapter = {};
		for (const [key, ev] of Object.entries(Game.Economy.events)) (byChapter[ev.chapter] ??= []).push([key, ev]);
		for (const ch of Object.keys(byChapter).sort()) {
			console.log(`  第${ch}章：`);
			for (const [key, ev] of byChapter[ch]) {
				const d = ev.delta ?? 0;
				if (ev.delta !== null) { g += d; min = Math.min(min, g); }
				console.log(`    ${key.padEnd(17, ' ')} ${d >= 0 ? '+' : ''}${String(d).padStart(3)}  ${ev.note}${ev.delta === null ? '（动态：不计入）' : ''}`);
			}
		}
		console.log(`  全事件顺走（互斥事件同计=理论上界）：${g} 金（序走最低 ${min}）`);
	}
}

// ── ③ 道具效果 · 龙战伤害矩阵（伞 #22：高潮战审计）──
if (wantAll || arg('items') || arg('tokens')) {
	console.log('\n══ ③ 道具效果 · 龙战伤害矩阵（受击方=玩家，败次 0/2）══');
	const I = Game.Items;
	console.log(`减伤件：每件 −${I.perItemDamageReduce}；败次 +1 封顶 +2（M5b：件数共鸣与月光花优势已移除）`);
	for (const [name, e] of Object.entries(I.effects)) {
		const sites = [e.advSite, ...(e.advSites ?? [])].filter(Boolean);
		console.log(`  ${name.padEnd(8, '　')} ${sites.length ? `优势@${sites.join('/')}` : `减伤−${e.flatDamageReduce}`} —— ${e.note}`);
	}
	const sets = [
		{},
		{ 日记: true },
		{ 坏哨: true },
		{ 日记: true, 龙鳞护臂: true },
		{ 日记: true, 龙鳞护臂: true, 观星者的书: true },
		{ 日记: true, 龙鳞护臂: true, 观星者的书: true, 坏哨: true },
	];
	console.log('  道具组合 → R1/R2/R3 伤害（败次=0 | 败次=2）');
	for (const set of sets) {
		const f = (r) => `${I.battleDamage(r, set, 0)}/${I.battleDamage(r, set, 2)}`;
		console.log(`    [${Object.keys(set).join('、') || '空手'}] → ${f(1)} ${f(2)} ${f(3)}`);
	}
}
// ── ⓪g canon 门（M1b）：设定书 §10「已裁剪设定」→ src 回流检测 ──
// 权威链：docs/lore-canon.md §10 是唯一黑名单来源。本门做两件事：
//   ① 行覆盖：§10 每一行必须被下表认领（新增行不认领即红——防设定裁剪后正文悄悄回流）
//   ② 词扫描：认领行的禁词不得出现在 shipped 文本（正文 + 数据表字符串；JS/CSS 注释与 /% %/ 不计）
// 维护：设定书 §10 新增/修改行 → 同步下表（`src` 为行内可辨识子串）
const CANON_ROWS = [
	{ src: '封印双闩', terms: ['封印双闩', '星闩', '人闩', '以命为闩', '压梦'], why: '塔是送行工程' },
	{ src: '封印大厅', terms: ['封印大厅', '结界', '四锁槽', '锁槽', '封印崩坏'], why: '与「送它回家」母题冲突' },
	{ src: '宾客亡灵', terms: ['塌门亡灵', '宾客封印圈', '铜哨召'], also: [{ t: '亡灵', negate: true }], why: '无亡灵系；否定句（没有亡灵）允许' },
	{ src: '那顿饭没人撤', terms: ['没人撤', '落灰的碗筷', '没散的席面', '席面'], why: '宴是过去的事' },
	{ src: '有人在等它回去吃饭', terms: ['等它回去吃饭', '等它入席', '哨响即归'], why: '没有人还在等它吃饭' },
	{ src: '守龙人', terms: ['守龙人'], why: '守林人＝村子的守卫' },
	{ src: '悔念外化', terms: ['悔念外化'], why: '中boss＝雾之魔物' },
	{ src: '守林人＝塔顶亡灵', terms: ['塔顶亡灵'], why: '守林人是活人' },
	{ src: '守林人住在塔边（塔里）', terms: ['住在塔边', '守在塔边', '睡在塔里'], why: '他跟他母亲住在一起（女巫家）；塔里只有岗位' },
	{ src: '日记记着“雾就是它漏出来的力气”', terms: ['雾就是它漏出来的力气', '那是它的路费', '这笔账没人算过', '省下的是哪一笔'], why: '星账无人感知、不可测量（v17 补正 #7）——谜底只在设定集·术语（终局后）' },
	{ src: '守林人只留形', terms: ['只留形', '留形'], why: '送行术家传，终局由守林人施展' },
	{ src: '吹哨需守林人到场', terms: ['需守林人到场', '吹哨需'], why: '吹哨只需龙冷静' },
	{ src: '真结局＝历史被改', terms: ['历史被改', '在雾里散开'], why: '改为终止徒劳传送、省下最后一笔路费' },
	{ src: '藏杖闭环', terms: ['藏杖闭环'], why: '新增传送术卷轴' },
	{ src: '龙可以被打赢', skip: '数值门：audit --dragon（单挑必败）', why: 'v16 §3.8 五种打法' },
	{ src: '封印术＝古已有之', terms: ['古已有之'], why: '封印术＝守林人家家传' },
	{ src: '冒险者能学会传送术', terms: ['学会传送术'], why: '玩家最多学出劣化版封印术' },
	{ src: '每代少一句', terms: ['每代少一句', '磨损成无处'], why: '从失败推出的误判' },
	{ src: '盼有人改变未来', terms: ['改变未来'], why: '改为盼有人给它一个了结' },
	{ src: '囚室', terms: ['囚室', '囚徒', '星轨图'], why: '观星者＝死在工作台前的普通人' },
	{ src: '四信物', terms: ['四信物', '信物', '铜哨'], also: [{ t: '集齐开锁', negate: true }], why: '改为物品栏（§5.0）；否定句（不集齐开锁）允许' },
	{ src: '焐蛋人', terms: ['焐蛋'], why: '蛋由童年的她捡回孵化' },
	{ src: '初代子女', terms: ['初代长子', '初代女儿'], why: '如何分的不叙' },
	{ src: '女巫长生', terms: ['女巫长生'], why: '只有龙不老；「形似」误导允许（开场传闻）' },
	{ src: '充能三次', terms: ['充能', 'amulet_charges'], why: '改隐藏计数（§3.5）' },
	{ src: '魔力 / 星力混用', terms: ['魔力'], why: '术语统一为「星力」' },
	{ src: '占星师', terms: ['占星师'], why: '术语统一为「观星者」' },
	{ src: '卖星铁', terms: ['卖星铁'], why: '星铁不可卖；v16 的"碎镜片三用"一并作废（v17 补正 #4）' },
	{ src: '请柬 / 星名页 / 碎镜片', terms: ['请柬', '星名页', '碎镜片'], why: '三件闲物已删（假代价 / 零消费，v17 补正 #4）' },
	{ src: '乡愁雾', terms: ['乡愁雾', '悔雾', '梦雾', '双层雾'], why: '单层雾＝龙漏出的星力' },
	{ src: '共鸣锚免费无限切换', terms: ['共鸣锚'], why: '与隐藏星力冲突' },
	{ src: '龙威递增', terms: ['龙威', 'lair', '双态地形'], why: '归为游戏机制稿，不入设定书' },
	{ src: '星落＝送归成功', terms: ['星落＝送归', '送归成功'], why: '星落＝讨伐；送归＝真结局' },
	{ src: '罗温守孩子', terms: ['罗温', '以命续封'], why: '罗温是活着的现任守林人' },
	{ src: '龙名后半', terms: ['龙名后半'], why: '正文只出现「维」' },
	{ src: '「门」概念', terms: ['造门', '把门交给旅人', '门后等', '圈内圈外'], why: '龙沉睡无需门、也无法封印' },
	{ src: '送星宴的宴席描写', terms: ['炖肉', '布菜', '举杯', '入席'], why: '宴的功能是遇到所有人并目睹送星仪式' },
	{ src: '守林人有资质学传送术', terms: ['有资质', '资质'], why: '改为「练的是什么」' },
	{ src: '旅人劝她终止传送', terms: ['终止传送', '与龙告别'], why: '改为把办法告诉她' },
	{ src: '守林人为女性', targeted: '守林人', why: '改为男性（男系一脉）' },
	{ src: '星力不显示任何数字', skip: 'UI 门：正文无星力数字/进度条（smoke + 人工）', why: '隐藏计数（§3.5）' },
	{ src: '人们把它搬到塔底供奉', terms: ['搬到塔底', '供奉'], why: '它就睡在塔的地下' },
	{ src: '换哨＝与穿越回来的老巫女', terms: ['换哨＝与穿越回来的老巫女', '哨身太新', '晚年穿越'], why: '改为与当时的女巫交换（v16 补正 #7）；身份仍不点破（§9 #5）' },
	{ src: '老巫女在宴上讲过去知', terms: ['因为那一夜发不动'], why: '过去知只在日记里（v16 补正 #8）' },
	{ src: '卷轴由老巫女在宴上交出', terms: ['她递过来一卷纸', '改不了的那一夜，就交给三百年后的人'], why: '卷轴并入日记封底；杖由旅人找回（v16 补正 #9）' },
	{ src: '杖与项链分落两支后人', terms: ['长房', '次房', '三家各持一件'], why: '杖与项链都留在女巫一家（v17）' },
	{ src: '守林人 / 女巫有特殊身份', skip: '口径门：§9 纪律 #7（两人只是普通母子）', why: '去神秘化（v17）' },
	{ src: '冒险者受雇而来 / 为讨伐而来', terms: ['受雇'], why: '他只是被传闻吸引来看看（v17）' },
	{ src: '进塔的人会失忆', terms: ['记不清自己进去', '会失忆'], why: '没有失忆——塔是废塔（v17）' },
	{ src: '龙被封印＝事实（叙述者确认）', skip: '口径门：§9 纪律 #6/#8（传说只能 NPC 口吻；一族不纠正）', why: '没有咒也没有锁，它只是睡着（v17）' },
	{ src: '一族人当面纠正"封印"这个说法', terms: ['这塔里没有封印', '其实那不是封印'], why: '不知道来历的人面前不指正（v17 补正 #1）' },
	{ src: '"好感换放行"', skip: '口径门：§9 纪律 #8（守村的责任心优先）', why: '好感只影响说多少（v17 补正 #1）' },
	{ src: '两份好感（还杖人情 + 知情/信龙）', skip: '口径门：唯一人情线 family_favor＝还杖（v17 补正 #2）', why: '好感线合一是表结构，不走词扫描' },
	{ src: '封印术想发动就发动', terms: ['把它封进虚空，雾从此散尽'], why: '发动有前置：先把龙打到 sealAt 以下（v17 补正 #3，旧结局文案已改）' },
	{ src: '月光花无战斗用途', skip: '口径门：§5.4 毒液抹刃＝龙的攻击 −2（v17 补正 #3 部分回退）', why: 'advAt 恒 false 已由 rules/properties 机检' },
	{ src: '「信物」概念', terms: ['信物'], why: '改为物品栏' },
	{ src: '星图残页', terms: ['星图残页'], why: '证物改用观星者的书' },
	{ src: '封印门', terms: ['封印门', '四道锁槽', '星鬥', '人鬥', '启门韵', '星纹共振'], why: '只留一道通往地下宴会厅的门' },
	{ src: '塔顶留形＝老守林人', terms: ['塔顶留形'], why: '塔顶就是守林人本人' },
	{ src: '雾中的形＝龙的无意识', terms: ['龙的无意识', '初代巫女形'], why: '雾聚成的守卫，陪着守林人' },
	{ src: '与龙战必败（无论人数）', skip: '数值门：audit --dragon（单挑必败 / 说服击杀可赢）', why: 'v16 §3.8 五种打法' },
	{ src: '龙睡在塔的地下（进地下不必然看见）', skip: '内容门：进到地下一眼就看见（M2 文案）', why: '§4.5' },
	{ src: '翻转＝任意地点进任意时代', skip: '机制门：原地生效（integrity W2 + <<flip>> 原地重渲染）', why: '§3.3' },
	{ src: '钥匙要靠考验', terms: ['要靠考验', '利益交换'], why: '正常交涉即可（§5.12）' },
	{ src: '三百年后的地下是多房间地城', terms: ['多房间'], why: '只有一条巨龙' },
	{ src: '道具与存档都在侧栏', skip: 'UI 门：smoke 断言存档栏与物品栏分置（§5.0）', why: '道具在侧栏，存档常驻界面' },
	{ src: '无雾的房间翻不动', terms: ['翻不动'], why: '翻转不受雾限制（v16 补正 #2）' },
	{ src: '杖光＝唯一提示', terms: ['杖光'], why: '杖在真结局前只有微光；唯一提示＝雾淡' },
	{ src: '修镜', terms: ['修镜', '实拍今日星图', '标记坐标'], why: '坐标＝三百年前完整星图' },
	{ src: '二章三信物', terms: ['三信物'], why: '上塔无需道具门' },
	{ src: '坐标差之毫厘', terms: ['坐标差之毫厘', '坐标偏差'], why: '不存在坐标偏差降级' },
	{ src: '月光花自用＝解毒', terms: ['解毒', '自用'], why: '月光花只有献龙一用，无战斗功能（§5.4）' },
	{ src: '月光花长在塔内温室', terms: ['塔·温室', '温室'], why: '塔里没有温室这间房；花自己长在塔周围（§5.4）' },
	{ src: '月光花＝雾催生的花', terms: ['雾催生的花', '雾生'], why: '花沐浴星光自生；它和雾的关系无人知晓（§5.4）' },
	{ src: '贸然采花＝昏睡后可重试', terms: ['再凑近', '昏睡后可重试'], why: '贸然采花失败＝死亡结局（§5.4）' },
];
if (wantAll || arg('canon')) {
	console.log('\n══ ⓪g canon 门（设定书 §10 已裁剪设定）——禁止回流 ══');
	let bad = 0;
	const lore = readFileSync('docs/lore-canon.md', 'utf8');
	const s10 = lore.match(/^## 10\.[\s\S]*?(?=^## 11\.)/m)?.[0] ?? '';
	const rows = s10.split('\n').filter((l) => l.trim().startsWith('|'))
		.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
		.filter((c) => c[0] && c[0] !== '旧设定' && !/^[\s:\-]+$/.test(c[0]));
	// ① 行覆盖
	const uncovered = rows.filter((r) => !CANON_ROWS.some((e) => r[0].includes(e.src)));
	if (uncovered.length) {
		bad += uncovered.length;
		for (const r of uncovered) console.log(`  ✗ §10 行未被 canon 门认领：${r[0].slice(0, 60)}`);
	}
	// ② 词扫描（shipped 文本：正文 + 数据表字符串；JS 行注释 / CSS 块注释 / /% %/ 不计）
	const ship = [];
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		let text = src;
		if (tags.includes('script') || tags.includes('stylesheet')) {
			text = text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
		}
		ship.push({ name, text });
	}
	let termCount = 0, hit = 0;
	const check = (term, negate, why, entry) => {
		termCount++;
		for (const { name, text } of ship) {
			for (const m of text.matchAll(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) {
				if (negate) {
					const before = text.slice(Math.max(0, m.index - 2), m.index);
					if (/[没有无非不]/.test(before)) continue;
				}
				hit++; bad++;
				console.log(`  ✗ 回流「${term}」@ 段落「${name}」（§10：${entry.src} —— ${why}）`);
			}
		}
	};
	for (const e of CANON_ROWS) {
		for (const term of e.terms ?? []) check(term, false, e.why, e);
		for (const a of e.also ?? []) check(a.t, a.negate, e.why, e);
	}
	// ③ 定向：守林人段落不得出现女性代词
	for (const { name, text } of ship) {
		if (/^守林人/.test(name) && text.includes('她')) { hit++; bad++; console.log(`  ✗ 段落「${name}」出现「她」（§10：守林人为女性 —— 改为男性）`); }
	}
	// ④ §9 双读纪律（M6a）：正文不得点破的断言（只扫正文，不扫数据表脚本）
	const DUALREAD = [
		{ t: '长生', why: '§9 #2/#3：只有龙长寿；正文不出现「长生」断言' },
		{ t: '同一个人', why: '§9 #2：形似线永不出现「同一个人」的肯定句' },
		{ t: '初代巫女', why: '§9 #5：身份只住设定书，正文永不点破' },
		{ t: '初代', why: '§9 #5：正文不称「初代」' },
		{ t: '穿越', why: '§9 #5：正文不出现「穿越」' },
		{ t: '晚年', why: '§9 #5：不点破老巫女＝晚年回到那一夜' },
		// v17 补正 #7（#168 待确认②拍板）：星账正文无人感知、不可测量——"雾＝星力"谁也不许点破，谜底只在设定集·术语（终局后）
		{ t: '漏出来的力气', allow: ['设定集·术语'], why: 'v17 补正 #7：谜底只在设定集（SgCodex.seenFinal() 门内）' },
		{ t: '它自己的力气', allow: ['设定集·术语'], why: 'v17 补正 #7（#219 A1）：图鉴线索/正文不得写出等式变体' },
		{ t: '路费', why: 'v17 补正 #7：正文的雾不许被记成一笔账' },
		{ t: '这笔账', why: 'v17 补正 #7：星账无人感知、不可测量' },
		{ t: '攒得还不够', why: 'v17 补正 #7：没人算过它的积蓄' },
	];
	let dualHit = 0;
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet')) continue; // 只扫正文
		const text = src.replace(/\/%[\s\S]*?%\//g, ''); // 剥 /% %/ 注释
		for (const d of DUALREAD) {
			if ((d.allow ?? []).includes(name)) continue; // 白名单：谜底只许在设定集·术语
			if (text.includes(d.t)) { dualHit++; bad++; console.log(`  ✗ 段落「${name}」出现「${d.t}」（${d.why}）`); }
		}
	}
	// ⑤ §3.9 传说覆盖门（v17）：每条传说都要①登记在对照表 ②在正文里有 NPC 投放锚
	const LEGENDS = [
		{ row: '那条龙早死了', anchors: ['那条龙早死了'], says: '长者' },
		{ row: '三百年前女巫把它封印在塔下', anchors: ['按在塔底下'], says: '老猎人' },
		{ row: '雾是它死后的怨念', anchors: ['怨念', '怨灵'], says: '冒险者' },
		{ row: '月光花是这儿的特产', anchors: ['这儿的特产'], says: '游客' },
		{ row: '月光花夜里接着星光长，谢下来就散成雾', anchors: ['雾是它谢下来的'], says: '跑生意的' },
		{ row: '塔上住着个不老的女人', anchors: ['不老的女人'], says: '酒客' },
		{ row: '谁也说不清他守的是什么', anchors: ['他拦过我一回'], says: '酒客' },
		{ row: '雾是从塔那边来的', anchors: ['雾是从塔那边来的'], says: '老板娘' },
		{ row: '前些年进去过一队人', anchors: ['铁门锁着'], says: '废哨站钉牌' },
	];
	const s39 = lore.match(/^### 3\.9[\s\S]*?(?=^\n---\n)/m)?.[0] ?? '';
	const legendBlock = s39.split(/\n\s*\n/).find((b2) => b2.includes('传说（正文里只能出现在 NPC 口中）')) ?? '';
	const legendRows = legendBlock.split('\n').filter((l) => l.trim().startsWith('|'))
		.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
		.filter((c) => c[0] && !['传说（正文里只能出现在 NPC 口中）', '传说'].includes(c[0]) && !/^[\s:\-]+$/.test(c[0]));
	let legHit = 0;
	for (const r of legendRows) {
		if (!LEGENDS.some((e) => r[0].includes(e.row))) { legHit++; bad++; console.log(`  ✗ §3.9 传说行未被覆盖门认领：${r[0].slice(0, 40)}`); }
	}
	const prose = [];
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet')) continue;
		prose.push({ name, text: src.replace(/\/%[\s\S]*?%\//g, '') });
	}
	for (const e of LEGENDS) {
		for (const a of e.anchors) {
			if (!prose.some((p2) => p2.text.includes(a))) { legHit++; bad++; console.log(`  ✗ 传说未投放（${e.says}）：「${a}」——§3.9 登记了却没人说`); }
		}
	}
	// ⑥ 道具消费门（v17 补正 #4）：每件道具至少一处真消费；写了"永失/代价"的必须有下游
	const itemNames = Object.keys(Game.Items.defs ?? {});
	const econNotes = Object.entries(Game.Economy.events ?? {}).map(([k, e]) => `${k}${e.note ?? ''}`);
	const metaAnchors = JSON.stringify([Game.Truth?.claims ?? {}, Game.Echoes?.list ?? {}, Game.Choices?.sites ?? {}]);
	const giveOnly = (name) => new RegExp(`<<give ["']${name}["']>>`);
	let itemHit = 0;
	for (const name of itemNames) {
		const use = [];
		if (Game.Items.effects?.[name]) use.push('位点效果');
		if (econNotes.some((n) => n.includes(name))) use.push('经济事件');
		const holdLines = prose.flatMap((p2) => p2.text.split('\n'))
			.filter((l) => l.includes(`$pc.inv["${name}"]`) && !giveOnly(name).test(l));
		if (holdLines.length) use.push(`正文按持有分支×${holdLines.length}`);
		if (metaAnchors.includes(name)) use.push('Truth/Echoes 锚');
		// #250：战斗/机制表引用（Combat need/good/effects 里的 inv: 消耗）也算一类用途
		const tblSrc = passageSrc.get('Game Tables') ?? '';
		if (tblSrc.includes(`inv:${name}`) || tblSrc.includes(`|${name}`)) use.push('战斗/机制表');
		if (!use.length) { itemHit++; bad++; console.log(`  ✗ 道具「${name}」零消费（拿到即止，无任何下游；v17 补正 #4 已删三件同类）`); }
		// #250：真结局链道具 ≥2 用途（豁免须登记理由）
		const KEY_CHAIN = ['日记', '坏哨', '好哨', '月光花', '观星者的书', '完整星图', '传送术卷轴'];
		const KEY_EXEMPT = {};
		if (KEY_CHAIN.includes(name) && !KEY_EXEMPT[name] && use.length < 2) {
			itemHit++; bad++; console.log(`  ✗ 真结局链道具「${name}」仅 ${use.length} 类用途（#250：≥2，豁免须登记 KEY_EXEMPT）`);
		}
		const def = Game.Items.defs[name] ?? {};
		if (/永失|换掉就|献出去就/.test(def.note ?? '') && !use.some((u) => u.startsWith('正文按持有') || u === '经济事件')) {
			itemHit++; bad++; console.log(`  ✗ 道具「${name}」写了假代价（note 提"永失/换掉就"，但没有任何下游消费）`);
		}
	}
	console.log(`  §5.0 道具：清单 ${itemNames.length} 件 · 零消费 ${itemHit === 0 ? 0 : itemHit}（假代价同计）`);
	// ⑦ 道具图鉴门（v17 M8）：覆盖双向 · 线索可挣 · 线索可达 · 结局登记 · 提示不泄底
	const C = Game.Codex;
	let codexHit = 0;
	const codexItems = Object.keys(C?.items ?? {});
	for (const name of itemNames) if (!codexItems.includes(name)) { codexHit++; bad++; console.log(`  ✗ 图鉴缺页：「${name}」（Items.defs 有、Codex.items 没有）`); }
	for (const name of codexItems) if (!itemNames.includes(name)) { codexHit++; bad++; console.log(`  ✗ 图鉴多页：「${name}」（Codex.items 有、Items.defs 没有）`); }
	const freshPc = { ...Pc.defaults(), flags: [] };
	const fullPc = Pc.defaults();
	fullPc.inv = Object.fromEntries(itemNames.map((n) => [n, true]));
	fullPc.star = { ...fullPc.star, spent: 2, charge: 0 };
	fullPc.world = { fog_thin: true, mist_fought: true, family_favor: true, whistle_blown: true, flower_warned: true, flower_fed: true, seer_asked: true, present_done: true, scroll_delivered: true, rumor: true, goblin_spared: true, witch_hint: true };
	fullPc.ev = { failure_cause: true, observation_lock: true, keeper_why: true, letter_seen: true, coord: true, mist_guard: true, threshold: true, star_ledger: true, old_witch: true };
	fullPc.keeper = { ...fullPc.keeper, met: true, trust: 3, key: true, state: 'ally' };
	fullPc.dragon = { ...fullPc.dragon, venom: true, awake: true, hp: 1 };
	const clueTotal = codexItems.reduce((n, i) => n + (C.items[i].clues ?? []).length, 0);
	for (const name of codexItems) {
		const def = C.items[name];
		const clues = def.clues ?? [];
		if (clues.length < 2) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」线索不足（≥2；实际 ${clues.length}）`); }
		if (typeof def.hint !== 'string' || !def.hint.trim()) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」缺空页提示`); }
		else if (def.hint.length > 40) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」提示过长（≤40 字；实际 ${def.hint.length}）`); }
		for (const d of DUALREAD) if ((def.hint ?? '').includes(d.t)) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」提示出现「${d.t}」（${d.why}）`); }
		for (const cl of clues) for (const d of DUALREAD) if ((cl.label ?? '').includes(d.t)) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」线索「${cl.id}」出现「${d.t}」（${d.why}）`); } // #219 A1：线索 label 一并扫
		const ids = clues.map((c) => c.id);
		if (new Set(ids).size !== ids.length) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」线索 id 重复`); }
		for (const c of clues) {
			let free = false, ok2 = false;
			try { free = !!c.test(freshPc); } catch (e) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」线索函数报错：${e.message}`); continue; }
			try { ok2 = !!c.test(fullPc); } catch { ok2 = false; }
			if (free) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」新档即满足（线索必须挣得到）`); }
			if (!ok2) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」在全收集态仍不满足（字段名大概写错了）`); }
			if (!c.label || !String(c.label).trim()) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」缺线索文案`); }
		}
	}
	for (const [name, src] of passageSrc) {
		if (!/^结局/.test(name)) continue;
		const body = src.replace(/\/%[\s\S]*?%\//g, '');
		const m = body.match(/<<ending\s+"([^"]+)"(?:\s+(final|chapter))?>>/);
		if (!m) { codexHit++; bad++; console.log(`  ✗ 结局段落「${name}」未登记（缺 <<ending \"…\" final|chapter>>）`); }
		else if (!['final', 'chapter'].includes(m[2] ?? 'final')) { codexHit++; bad++; console.log(`  ✗ 结局段落「${name}」kind 非法：${m[2]}`); }
	}
	console.log(`  §5.0 图鉴：页 ${codexItems.length} · 线索 ${clueTotal} 条 · 命中 ${codexHit}`);
	console.log(`  §3.9 传说：表 ${legendRows.length} 行 · 认领 ${LEGENDS.length} 条 · 投放锚 ${LEGENDS.reduce((n, e) => n + e.anchors.length, 0)} 个 · 命中 ${legHit}（每行须有 ② 的真/误或 ① 的登记）`);
	console.log(`  §10 行 ${rows.length} · 认领 ${CANON_ROWS.length} 条 · 禁词 ${termCount} 个 · 命中 ${hit}`);
	console.log(`  §9 双读：禁断言 ${DUALREAD.length} 条 · 命中 ${dualHit}（正文不点破：长生/同一个人/初代/穿越/晚年）`);
	// 谜底门（v17 补正 #7）：雾＝星力只许在设定集·术语揭开，且必须落在 SgCodex.seenFinal()（走到过终局）门内
	{
		const src = passageSrc.get('设定集·术语') ?? '';
		const gi = src.indexOf('<<if SgCodex.seenFinal()>>');
		const ai = src.indexOf('漏出来的力气');
		const gated = gi >= 0 && ai > gi && !src.slice(gi, ai).includes('<</if>>');
		if (!gated) { bad++; console.log('  ✗ 谜底门：设定集·术语 的「雾＝星力」必须在 <<if SgCodex.seenFinal()>> 门内（v17 补正 #7——谜底只在终局后的设定集）'); }
		else console.log('  谜底门：设定集·术语 的揭示落在终局门内 ✓');
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ canon 门：${bad} 项回流/未认领`); process.exit(1); }
		console.log('\n✔ canon 门通过（§10 全行认领，禁词零回流）');
	}
}

// ── ⓪m 文字工艺门（#168 批次四 · 机检 ⑤–⑧）：重复台词 / 标点与斜体 / 措辞密度 / 道具名主张 ──
// 这四道落在"读起来"这一层：机器能替人盯住的只有形态——同一句重复、半角标点、斜体标记不成对、
// 某一段突然变密、正文里的道具写成了表里没有的名字。判不出好坏，但能把"改坏了"当场抓住。
if (wantAll || arg('craft')) {
	console.log('\n══ ⓪m 文字工艺门（#168 机检 ⑤–⑧）══');
	let bad = 0;
	const craftNames = [...passageSrc.keys()].filter((n) => !/^Story/.test(n) && !(passageTags.get(n) ?? []).some((t) => ['script', 'widget', 'stylesheet'].includes(t)));
	const strip = (s) => s.replace(/<<[\s\S]*?>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/''/g, '').replace(/<[^>]*>/g, '');

	// ⑤ 重复台词门：同一句出现在两段以上（≥10 汉字、只留汉字后比对）——结局层与 NPC 台词重复最伤
	//    白名单只放"结构性重复"（同一句回指在多个段落各出现一次，由 CALLBACKS 门保证它真说过）。
	const REPEAT_OK = [/^（守林人说过从大门走$/];
	const seen = new Map();
	for (const n of craftNames) {
		for (const x of strip(passageSrc.get(n)).split(/[。！？!?\n]/)) {
			const t = x.replace(/[\s「」"'‘’“”：:，,、—－-]/g, '');
			if (t.length < 10 || !/^[\u4e00-\u9fff]+$/.test(t)) continue;
			if (!seen.has(t)) seen.set(t, []);
			if (!seen.get(t).includes(n)) seen.get(t).push(n);
		}
	}
	const dups = [...seen].filter(([t, ps]) => ps.length > 1 && !REPEAT_OK.some((r) => r.test(t)));
	for (const [t, ps] of dups) { console.log(`  ✗ [重复] 同一句出现在 ${ps.length} 段：${ps.join(' / ')}\n        「${t}」`); bad++; }
	console.log(`  ⑤ 重复台词门：跨段落重复句 ${dups.length} 处（结构性白名单 ${REPEAT_OK.length} 条）`);

	// ⑥ 标点与斜体门：正文里不许混半角标点（`''` 是 Twee 的斜体标记，左侧半角括号/逗号最常混进来）；
	//    `''` 出现奇数次 → 斜体从那里一直吃到段尾，屏上是肉眼可见的错。
	const halfRx = /[\u4e00-\u9fff][,;!?()]|[,;!?()][\u4e00-\u9fff]/g;
	let half = 0, italBad = 0;
	for (const n of craftNames) {
		const hits = [...strip(passageSrc.get(n)).matchAll(halfRx)].map((m) => m[0]);
		if (hits.length) { console.log(`  ✗ [标点] 「${n}」混了半角标点：${hits.join(' ')}`); bad++; half += hits.length; }
		const q = (passageSrc.get(n).match(/''/g) ?? []).length;
		if (q % 2) { console.log(`  ✗ [斜体] 「${n}」的 '' 标记是奇数（${q}）——斜体会一直吃到段尾`); bad++; italBad++; }
	}
	console.log(`  ⑥ 标点与斜体门：半角混用 ${half} 处 · 斜体不成对 ${italBad} 段`);

	// ⑦ 措辞密度门（ratchet）：破折号 / 像 / 括号 三种"容易成瘾"的写法，按段落记密度，
	//    与 test/density-baseline.json 比——只许降不许升。改写确实需要变密时，跑 --update-density 重签基线并在 PR 里说明。
	const DENSITY = 'test/density-baseline.json';
	const densityOf = (src) => {
		const t = strip(src);
		const n = t.length || 1;
		return { dash: (t.split('——').length - 1) / n * 1000, like: (t.split('像').length - 1) / n * 1000, paren: (t.split('（').length - 1) / n * 1000, chars: t.length };
	};
	const now = {};
	for (const n of craftNames) now[n] = densityOf(passageSrc.get(n));
	if (process.argv.includes('--update-density')) {
		const rows = Object.fromEntries(Object.entries(now).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, { dash: +v.dash.toFixed(1), like: +v.like.toFixed(1), paren: +v.paren.toFixed(1), chars: v.chars }]));
		writeFileSync(DENSITY, JSON.stringify({ note: '#168 机检⑦ 措辞密度 ratchet：破折号/像/括号 每千字次数。只许降不许升——改写后确实要变密，请 --update-density 重签并在 PR 里写明理由。', rows }, null, '\t') + '\n');
		console.log(`  ⑦ 密度基线已重签：${Object.keys(rows).length} 段（${DENSITY}）`);
	} else {
		let base = { rows: {} };
		try { base = JSON.parse(readFileSync(DENSITY, 'utf8')); } catch { console.log('  ℹ 缺密度基线，先跑 node scripts/audit.mjs --craft --update-density'); }
		let over = 0;
		for (const [n, v] of Object.entries(now)) {
			const b = base.rows[n];
			if (!b) { if (Math.max(v.dash, v.like, v.paren) > 20) { console.log(`  ✗ [密度] 新段「${n}」最密项 ${Math.max(v.dash, v.like, v.paren).toFixed(1)}‰ > 20‰——先改写，或重签基线`); bad++; over++; } continue; }
			for (const k of ['dash', 'like', 'paren']) {
				if (v[k] > b[k] + 0.05) { console.log(`  ✗ [密度] 「${n}」${k} 从 ${b[k]}‰ 涨到 ${v[k].toFixed(1)}‰（只许降不许升）`); bad++; over++; }
			}
		}
		const top = Object.entries(now).sort((a, b) => Math.max(b[1].dash, b[1].like, b[1].paren) - Math.max(a[1].dash, a[1].like, a[1].paren)).slice(0, 3);
		console.log(`  ⑦ 措辞密度门：超基线 ${over} 项 · 当前最密 ${top.map(([n, v]) => `${n} ${Math.max(v.dash, v.like, v.paren).toFixed(1)}‰`).join(' / ')}`);
	}

	// ⑧ 道具名主张门：正文与表里提到的道具名，必须就是 Items.defs 的键（别名回流＝又一个"四个叫法"）；
	//    `$pc.inv["…"]` 里写的键也必须真的存在（写错一个字，那件道具永远不会被认出来）。
	const itemKeys = Object.keys(Game.Items.defs);
	const ALIAS_BAN = ['法杖', '星铁之杖', '龙穴', '女巫的门道'];
	let aliasHit = 0, keyBad = 0;
	for (const f of SRC_FILES) {
		const raw = readFileSync(f, 'utf8');
		for (const w of ALIAS_BAN) {
			const i = raw.indexOf(w);
			if (i >= 0) { console.log(`  ✗ [道具名] 别名「${w}」回流 @ ${f.split('/').pop()}:${raw.slice(0, i).split('\n').length}（Items.defs 只用：${itemKeys.join(' / ')}）`); bad++; aliasHit++; }
		}
	}
	for (const [n, src] of passageSrc) {
		for (const m of src.matchAll(/\$pc\.inv\[['"]([^'"]+)['"]\]/g)) {
			if (!itemKeys.includes(m[1])) { console.log(`  ✗ [道具名] 「${n}」引用了道具表里没有的键「${m[1]}」`); bad++; keyBad++; }
		}
	}
	for (const k of itemKeys) {
		const d = Game.Items.defs[k];
		if (!d.from || !d.note) { console.log(`  ✗ [道具名] 「${k}」缺 from/note（每件都要有来处与用途）`); bad++; }
	}
	console.log(`  ⑧ 道具名主张门：别名回流 ${aliasHit} 处 · 引用错键 ${keyBad} 处 · 表 ${itemKeys.length} 件`);

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 文字工艺门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 文字工艺门通过（重复 0 · 标点/斜体 0 · 密度未升 · 道具名与表一致）');
	}
}


console.log('\n（数据源：src/15-tables.twee —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');
