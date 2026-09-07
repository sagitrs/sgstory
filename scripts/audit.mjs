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
				console.log(`    ${key.padEnd(13, ' ')} ${d >= 0 ? '+' : ''}${String(d).padStart(3)}  ${g >= 10 ? '' : ' ⚠低于10金'} ${ev.note}${ev.delta === null ? '（动态：不计入）' : ''}`);
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
