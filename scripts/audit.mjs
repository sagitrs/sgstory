// #28 表驱动审计：node scripts/audit.mjs —— 查 window.Game 三表产出伞 #21/#22 报表，
// 替代一次性 jsdom 探查脚本。改表即改报告，秒级重算（无需启动场景）。
// 用法：node scripts/audit.mjs [--checks] [--economy] [--tokens]（缺省全输出）
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// ── vm 直载三份 [script]（Rules → Chargen → Game，同 window）──
const ctx = { window: {}, console, Macro: { add() {} }, State: { variables: {} }, $: () => ({ append() {} }) };
for (const f of ['src/30-rules.twee', 'src/31-chargen-data.twee', 'src/15-game-tables.twee']) {
	const text = readFileSync(f, 'utf8');
	const scripts = [...text.matchAll(/::\s*[^\n[\]]+\[script\]([\s\S]*?)(?=\n::|$)/g)].map((m) => m[1]);
	for (const body of scripts) vm.runInNewContext(body, ctx, { filename: f });
	// 浏览器侧 window.X 是全局——vm 侧需手动提升
	for (const k of Object.keys(ctx.window)) if (!(k in ctx)) ctx[k] = ctx.window[k];
}
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
for (const f of ['src/00-meta.twee', 'src/10-init.twee', 'src/20-story.twee', 'src/30-rules.twee', 'src/31-chargen-data.twee', 'src/40-chargen.twee', 'src/50-tower.twee', 'src/55-dungeon.twee', 'src/60-codex.twee']) {
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
		...Game.Echoes.revisit.map((r) => `tower:${r.flag}`),
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
	// C1 共鸣锚（#49）：锚段落存在且挂了 <<anchorshift>>
	for (const a of Game.Shifts.anchors) {
		const src = passageSrc.get(a);
		if (src === undefined) { console.log(`  ✗ 共鸣锚段落「${a}」不存在`); bad++; continue; }
		if (!passageRaw.get(a).includes('<<anchorshift>>')) { console.log(`  ✗ 共鸣锚「${a}」未挂 <<anchorshift>>`); bad++; continue; }
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
	for (const f of ['src/20-story.twee', 'src/50-tower.twee', 'src/55-dungeon.twee', 'src/60-codex.twee']) {
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
	const presets = { '铁卫': 12, '影手': 9, '秘典': 7 }; // max_hp 代表值（车卡终值四舍五入）
	const hit = (mod, dc) => Math.max(0.05, Math.min(0.95, (21 - (dc - mod)) / 20));
	const loadouts = {
		'满配':  { sneak: true, weak: 3, hitMod: 2, subAll: true },   // 偷袭+scroll+name+地形（0.99 实证=路线 O）
		'情报线': { sneak: false, weak: 3, hitMod: 2, subAll: false },  // hint(+2 补偿位)+地形
		'裸装':  { sneak: false, weak: 1, hitMod: 0, subAll: false },   // 仅地形
	};
	for (const [pn, hp] of Object.entries(presets)) {
		for (const [ln, L] of Object.entries(loadouts)) {
			let r = 1, dhp = D.hp - (L.sneak ? D.sneakHit : 0), taken = 0, flower = L.subAll ? 2 : 0;
			for (; r <= 12; r++) {
				dhp -= Math.max(1, D.hitBase + L.weak + 1) * hit(L.hitMod, 8); // present 地形 +1（自检后 DC8）
				if (dhp <= 0) break;
				taken += Math.max(1, D.dragonDamage({ tokens: L.subAll ? ['星图残页'] : [], tower: { dragon_defeats: 0, whistle_blown: L.subAll ? 1 : 0 } }, r, 'present'));
			}
			const survived = taken - flower < hp;
			console.log(`  ${pn}·${ln}: 期望 ${r} 轮 · 受击 ${taken} − 回复 ${flower} = ${taken - flower} vs HP${hp} → ${survived ? '✓ 存活' : '✗ 险'}`);
		}
	}
	console.log('（保守上界：present 地形持续、无护甲、线性期望。情报线存活路径=past 石柱+龙鳞护甲（−2/轮 → 受击≈4）：收集即战力。裸装为设计性不可赢——回声守卫兜底劝退。实走见路线 O/P/Q）');
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

// ── ③ 信物效果与化身战数值（伞 #22：高潮战审计）──
if (wantAll || arg('tokens')) {
	console.log('\n══ ③ 信物效果 · 化身战伤害矩阵（受击方=玩家，败次 rage 0/2）══');
	const T = Game.Tokens;
	console.log(`共鸣：每件 −${T.perTokenDamageReduce} 伤；日记前两回合另 −1；败次 +1 封顶 +${T.rageCap}；终击信物≥${T.finalStrikeCountAdv} 优势`);
	for (const [name, e] of Object.entries(T.effects)) console.log(`  ${name.padEnd(6, '　')} ${e.advSite ? `优势@${e.advSite}` : `减伤−${e.flatDamageReduce}`} —— ${e.note}`);
	const sets = [[], ['日记'], ['铜哨'], ['星图残页', '日记'], ['铜哨', '星图残页', '月光花'], ['铜哨', '星图残页', '月光花', '日记']];
	console.log('  信物组合 → R1/R2/R3 伤害（rage=0 | rage=2）');
	for (const set of sets) {
		const f = (r) => `${T.battleDamage(r, set, 0)}/${T.battleDamage(r, set, 2)}`;
		console.log(`    [${set.join('、') || '空手'}] → ${f(1)} ${f(2)} ${f(3)}`);
	}
}
console.log('\n（数据源：src/15-game-tables.twee —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');
