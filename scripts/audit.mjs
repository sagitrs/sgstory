// #28 表驱动审计：node scripts/audit.mjs —— 查 window.Game 三表产出伞 #21/#22 报表，
// 替代一次性 jsdom 探查脚本。改表即改报告，秒级重算（无需启动场景）。
// 用法：node scripts/audit.mjs [--canon] [--checks] [--economy] [--items] [--dragon]（缺省全输出）
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

// ── 源文件发现（M1a-1）：不再硬编码路径——改文件名/拆文件不再牵动工具 ──
const SRC_FILES = readdirSync('src').filter((f) => f.endsWith('.twee')).sort().map((f) => `src/${f}`);

// ── vm 直载全部 [script] 段（按文件名序；浏览器专属全局用 stub 兑底）──
const ctx = {
	window: {}, console,
	Macro: { add() {} }, State: { variables: {} }, $: () => ({ append() {} }),
	Config: { history: {}, saves: {} },
	Save: { onSave: { add() {} }, onLoad: { add() {} }, slots: {} },
	jQuery: () => ({ on() {}, ariaClick() {}, off() {} }),
	UI: { alert() {}, saves() {} }, Engine: {}, Story: { has: () => false },
	setTimeout, clearTimeout, document: {},
};
for (const f of SRC_FILES) {
	const text = readFileSync(f, 'utf8');
	const scripts = [...text.matchAll(/::\s*[^\n[\]]+\[script\]([\s\S]*?)(?=\n::|$)/g)].map((m) => m[1]);
	for (const body of scripts) vm.runInNewContext(body, ctx, { filename: f });
}
// 浏览器侧 window.X 是全局——vm 侧需手动提升
for (const k of Object.keys(ctx.window)) if (!(k in ctx)) ctx[k] = ctx.window[k];
const { Rules, Pc, Chargen, ChargenPresets, Game } = ctx.window;

// ── 预设角色（车卡全链 apply，与运行时同构）──
const presets = ChargenPresets.map((p) => {
	const pc = Pc.defaults();
	ctx.State.variables.pc = pc; // Chargen.pick 直接读 State.variables.pc
	for (let r = 0; r < p.picks.length; r++) Chargen.pick(r, p.picks[r]);
	return { name: p.name, pc };
});

const arg = (k) => process.argv.includes(`--${k}`);
const wantAll = !process.argv.some((a) => a.startsWith('--'));

// ── ⓪ D1 真相可达性（#35）：命题 × 通路，锚点机检 ──
const passageSrc = new Map(); // name -> 去注释源文（锚点检查用）
const passageRaw = new Map(); // name -> 原文（payload 注释检查用）
const passageTags = new Map(); // name -> tags[]
for (const f of SRC_FILES) {
	const text = readFileSync(f, 'utf8');
	const parts = text.split(/^::\s*/m);
	for (const part of parts.slice(1)) {
		const nl = part.indexOf('\n');
		const name = part.slice(0, nl).replace(/\[[^\]]*\]\s*$/, '').trim();
		passageTags.set(name, (part.slice(0, nl).match(/\[([^\]]*)\]/)?.[1] ?? '').trim().split(/\s+/).filter(Boolean));
		passageRaw.set(name, part.slice(nl + 1));
		passageSrc.set(name, part.slice(nl + 1).replace(/\/%[\s\S]*?%\//g, ''));
	}
}
if (wantAll || arg('truth')) {
	console.log('\n══ ⓪ 真相可达性（D1/#35）——每命题须 ≥2 通路，锚句须在位 ══');
	let bad = 0;
	for (const c of Game.Truth.claims) {
		const rows = [];
		for (const site of c.sites) {
			const src = passageSrc.get(site.p);
			if (src === undefined) { rows.push(`✗位点段落「${site.p}」不存在`); bad++; continue; }
			if (!src.includes(site.anchor)) { rows.push(`✗「${site.p}」锚句丢失：「${site.anchor}」`); bad++; continue; }
			rows.push(`✓${site.p}${site.via ? `（${site.via}）` : ''}`);
		}
		const single = c.sites.length < 2;
		if (single) bad++;
		console.log(`  ${single ? '⚠单点' : '    '} ${c.id}：${c.claim}`);
		rows.forEach((r) => console.log(`      ${r}`));
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D1 真相门：${bad} 项失锚/单点`); process.exit(1); }
		console.log('\n✔ D1 真相门通过（全命题 ≥2 通路且锚句在位）');
	}
}

// ── ⓪b D4 世界活性（#38）：回声锚检 + set-never-echoed 覆盖门 ──
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
			console.log(`  ✓ ${e.id}（${e.kind}）→ ${site.p}`);
		}
	}
	for (const r of Game.Echoes.revisit) {
		const src = passageSrc.get(r.p);
		if (src === undefined || !src.includes(r.anchor)) { console.log(`  ✗ revisit ${r.flag}：「${r.p}」锚句丢失「${r.anchor}」`); bad++; continue; }
	}
	console.log(`  （revisit 留痕 ${Game.Echoes.revisit.length} 处全锚定；分类：${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' ')}）`);
	// 覆盖门：twee 中被写的旗标 ⊆ cause ∪ revisit ∪ exempt
	const written = new Set();
	for (const src of passageSrc.values()) {
		for (const m of src.matchAll(/<<set\s+\$pc\.tower\.(\w+)\s*to/g)) written.add(`tower:${m[1]}`);
		for (const m of src.matchAll(/<<set\s+\$(\w+)\s*to/g)) written.add(m[1]);
		for (const m of src.matchAll(/<<setflag\s+"(\w+)"/g)) written.add(m[1]);
	}
	const covered = new Set([
		...Game.Echoes.list.flatMap((e) => [e.cause.token ? `token:${e.cause.token}` : null, e.cause.towerFlag ? `tower:${e.cause.towerFlag}` : null, e.cause.flag ?? null, e.cause.gear ? `gear:${e.cause.gear}` : null].filter(Boolean)),
		...Game.Echoes.revisit.flatMap((r) => [r.flag, `tower:${r.flag}`]),
		...Object.keys(Game.Echoes.exempt),
		'pc', 'player_name', 'last_check', 'era', // A5：引擎底座变量（非叙事旗标）——语义即豁免
	]);
	const orphans = [...written].filter((w) => !covered.has(w) && !w.startsWith('gear:') && !w.startsWith('token:'));
	if (orphans.length) { console.log(`  ⚠ set-never-echoed：${orphans.join('、')}（被写但无回声/留痕/豁免）`); bad += orphans.length; }
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D4 回声门：${bad} 项失锚/未覆盖`); process.exit(1); }
		console.log('\n✔ D4 回声门通过（全回声锚句在位、无 set-never-echoed）');
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
				const e = outEdges(c.p);
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
// ── ⓪f 龙战整场推演（自检 #22 补账：单点命中率之外的整场胜率）──
if (wantAll || arg('dragon')) {
	console.log('\n══ ⓪f 龙战整场推演（Game.Dragon 数值单源 → 期望轮数/受击/存活）══');
	const D = Game.Dragon;
	const hit = (mod, dc) => Math.max(0.05, Math.min(0.95, (21 - (dc - mod)) / 20));
	const loadouts = {
		'满配':  { sneak: true, weak: 3, hitMod: 2, inv: { 日记: true, 龙鳞护臂: true } },
		'情报线': { sneak: false, weak: 3, hitMod: 2, inv: { 龙鳞护臂: true } },
		'裸装':  { sneak: false, weak: 1, hitMod: 0, inv: {} },
	};
	for (const p of presets) {
		const hp = p.pc.max_hp;
		for (const [ln, L] of Object.entries(loadouts)) {
			let r = 1, dhp = D.hp - (L.sneak ? D.sneakHit : 0), taken = 0;
			for (; r <= 12; r++) {
				dhp -= Math.max(1, D.hitBase + L.weak) * hit(L.hitMod, 10);
				if (dhp <= 0) break;
				taken += D.dragonDamage(L.inv, r, 0);
			}
			const survived = taken < hp;
			console.log(`  ${p.name}·${ln}: 期望 ${r} 轮 · 受击 ${taken} vs HP${hp} → ${survived ? '✓ 存活' : '✗ 单挑必败'}`);
		}
	}
	console.log('（v16 §3.8：龙＝标准 D&D 高挑战等级——单挑必败，基本仅允许机制胜利。本表只作劝退证据。）');
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
	const sealRows = [];
	for (const p of presets) {
		for (const [ln, L] of Object.entries(sealLoadouts)) {
			const pHit = successRate(p.pc, sealSite, L.adv);          // 坏哨（默认带）＝优势
			const pSave = successRate(p.pc, saveSite, !!(L.inv['观星者的书'] || L.adv && false));
			const need = D.hp - D.sealAt;
			const perHit = Math.max(1, D.bladeDamage);
			let dhp = D.hp, taken = 0, r = 0;
			for (; r < 30 && dhp > D.sealAt; r++) {
				dhp -= perHit * pHit;                                  // 期望伤害
				taken += Game.Items.battleDamage(r + 1, L.inv, 0, L.venom) * (1 - pSave);
			}
			const alive = taken <= p.pc.max_hp;
			sealRows.push({ preset: p.name, loadout: ln, rounds: r, taken: Math.round(taken * 10) / 10, hp: p.pc.max_hp, alive });
			console.log(`  ${p.name}·${ln}: 期望 ${r} 轮 · 受击 ${taken.toFixed(1)} vs HP${p.pc.max_hp} → ${alive ? '✓ 活着按住它' : '✗ 先倒下'}`);
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
	{ src: '月光花长在塔内温室', terms: ['塔·温室'], why: '花长在塔基外侧墙根（§5.4）' },
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
	];
	let dualHit = 0;
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet')) continue; // 只扫正文
		const text = src.replace(/\/%[\s\S]*?%\//g, ''); // 剥 /% %/ 注释
		for (const d of DUALREAD) {
			if (text.includes(d.t)) { dualHit++; bad++; console.log(`  ✗ 段落「${name}」出现「${d.t}」（${d.why}）`); }
		}
	}
	// ⑤ §3.9 传说覆盖门（v17）：每条传说都要①登记在对照表 ②在正文里有 NPC 投放锚
	const LEGENDS = [
		{ row: '那条龙早死了', anchors: ['那条龙早死了'], says: '长者' },
		{ row: '三百年前女巫把它封印在塔下', anchors: ['按在塔底下'], says: '酒客' },
		{ row: '雾是它死后的怨念', anchors: ['怨念', '怨灵'], says: '冒险者' },
		{ row: '月光花是这儿的特产', anchors: ['这儿的特产'], says: '游客' },
		{ row: '塔上住着个不老的女人', anchors: ['不老的女人'], says: '酒客' },
		{ row: '谁也说不清他守的是什么', anchors: ['他拦过我一回'], says: '酒客' },
		{ row: '雾是从塔那边来的', anchors: ['雾是从塔那边来的'], says: '老板娘' },
		{ row: '前些年进去过一队人', anchors: ['铁门锁着'], says: '酒客' },
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
		if (!use.length) { itemHit++; bad++; console.log(`  ✗ 道具「${name}」零消费（拿到即止，无任何下游；v17 补正 #4 已删三件同类）`); }
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
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ canon 门：${bad} 项回流/未认领`); process.exit(1); }
		console.log('\n✔ canon 门通过（§10 全行认领，禁词零回流）');
	}
}

console.log('\n（数据源：src/15-game-tables.twee —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');
