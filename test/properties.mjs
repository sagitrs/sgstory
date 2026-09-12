// L5 数值属性测试（M1a-2 换骨后）：判定决策边界 · 优势/劣势支配性 · 伤害界限 · 战斗伤害界限 · 车卡不变量
// 属性式断言 = 全枚举/随机输入 + 守恒律，与例测（rules.mjs）互补——专抓 off-by-one 与手抖赋值
import { boot } from './boot.mjs';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

const { w, uncaught: _uncaught, sleep } = await boot({ random: 0.5 });

// 可编程骰队列：Math.random → die = floor(r*20)+1，映射 die→r=(d-0.5)/20
const queueDice = (dice) => {
	const q = dice.map((d) => (d - 0.5) / 20);
	w.eval(`(function(){const q=${JSON.stringify(q)};Math.random=()=>q.length?q.shift():0.5;})()`);
};

const R = w.Game.Rules;
const PC = { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 15, cha: 10 }, skills: ['察觉'], flags: {} };

// ── A. 判定决策边界全枚举：die 1..20 × DC {8,10,12,15} ──
{
	const mod = R.check(PC, '察觉', 10).mod;
	let bad = 0, cases = 0;
	for (const dc of [8, 10, 12, 15]) {
		for (let die = 1; die <= 20; die++) {
			queueDice([die]);
			const r = R.check(PC, '察觉', dc);
			const expect = die === 20 ? true : die === 1 ? false : die + mod >= dc;
			cases++;
			if (r.roll !== die || r.mod !== mod || r.total !== die + mod || r.success !== expect) bad++;
		}
	}
	ok(bad === 0, `判定边界全枚举 ${cases} 例（mod=${mod}）：roll/mod/total/success 四元组与决策律一致`);
	const reach = 10 - mod;
	queueDice([reach]); const at = R.check(PC, '察觉', 10);
	queueDice([reach - 1]); const below = R.check(PC, '察觉', 10);
	ok(at.success === true && below.success === false, `DC 边界翻转：die=${reach} 成 / die=${reach - 1} 败（mod=${mod}）`);
}

// ── B. 优势/劣势：取骰正确 + 支配性 ──
{
	const grid = [1, 5, 10, 15, 20];
	let takeBad = 0, domBad = 0, pairs = 0;
	for (const x of grid) for (const y of grid) {
		pairs++;
		queueDice([x, y]);
		const adv = R.check(PC, '察觉', 12, { adv: 1 });
		queueDice([x, y]);
		const dis = R.check(PC, '察觉', 12, { adv: -1 });
		if (adv.roll !== Math.max(x, y) || dis.roll !== Math.min(x, y)) takeBad++;
		if (dis.success && !adv.success) domBad++;
	}
	ok(takeBad === 0, `adv/dis 取骰 ${pairs} 对：adv=max / dis=min`);
	ok(domBad === 0, `支配律 ${pairs} 对：dis 成 ⟹ adv 成`);
}

// ── C. 伤害界限属性：随机序列下 hp∈[0,max_hp]，归零即死亡跳转；药膏自动消耗 ──
{
	let seed = 777;
	const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
	let boundBad = 0, deathBad = 0, salveBad = 0, steps = 0;
	const host = w.document.createElement('div');
	for (let i = 0; i < 40; i++) {
		const n = 1 + Math.floor(rng() * 20);
		const withSalve = rng() < 0.5;
		w.eval(`(function(){const v=SugarCube.State.variables;v.pc.hp=14;v.pc.max_hp=14;v.pc.salves=${withSalve ? 1 : 0};})()`);
		w.SugarCube.Engine.play('森林边缘'); await sleep(30);
		new w.SugarCube.Wikifier(host, `<<damage ${n}>>`);
		await sleep(80);
		const pc = w.SugarCube.State.variables.pc;
		steps++;
		if (!(pc.hp >= 0 && pc.hp <= pc.max_hp)) boundBad++;
		if (pc.hp <= 0 && w.SugarCube.State.passage !== '结局 死亡') deathBad++;
		// #201：缺口满 4（一副的恢复量）才自动烧——轻伤（n≤3）不烧，重伤存活（4≤n≤13）必烧，致死（n≥14）不烧
		if (withSalve) {
			const expect = (pc.hp > 0 && n >= 4) ? 0 : 1;
			if (pc.salves !== expect) salveBad++;
		}
	}
	ok(boundBad === 0, `伤害界限 ${steps} 步随机序列：hp∈[0,max_hp] 恒成立`);
	ok(deathBad === 0, '归零死亡：hp<=0 时必跳转「结局 死亡」');
	ok(salveBad === 0, '药膏自动生效（#201 门槛）：轻伤不烧、缺口满 4 必烧、致死不烧');

	// C1b. 药膏库存制：两副药膏挨两刀，每刀各自 +4（上限裁剪）
	w.eval('(function(){const p=SugarCube.State.variables.pc;p.hp=14;p.max_hp=14;p.salves=2;})()');
	w.SugarCube.Engine.play('森林边缘'); await sleep(30);
	// C1b-0（#201）：轻伤不烧——满血挨 3，药膏原封不动
	w.eval('(function(){const p=SugarCube.State.variables.pc;p.hp=14;p.max_hp=14;p.salves=2;})()');
	new w.SugarCube.Wikifier(host, '<<damage 3>>');
	await sleep(60);
	const s0 = w.SugarCube.State.variables.pc;
	ok(s0.hp === 11 && s0.salves === 2, `轻伤不烧药膏（#201）：3 伤停在 11/14，库存 2（实际 ${s0.hp}/${s0.salves}）`);
	w.eval('(function(){const p=SugarCube.State.variables.pc;p.hp=14;p.max_hp=14;p.salves=2;})()');
	new w.SugarCube.Wikifier(host, '<<damage 5>>');
	await sleep(60);
	const s1 = w.SugarCube.State.variables.pc;
	ok(s1.hp === 13 && s1.salves === 1, `第一刀：5 伤自动回 4（13/14），库存 2→1（实际 ${s1.hp}/${s1.salves}）`);
	new w.SugarCube.Wikifier(host, '<<damage 5>>');
	await sleep(60);
	const s2 = w.SugarCube.State.variables.pc;
	ok(s2.hp === 12 && s2.salves === 0, `第二刀：再回 4（12/14），库存 1→0（实际 ${s2.hp}/${s2.salves}）`);
	new w.SugarCube.Wikifier(host, '<<damage 3>>');
	await sleep(60);
	const s3 = w.SugarCube.State.variables.pc;
	ok(s3.hp === 9 && s3.salves === 0, `库存空：不再回血（9/14）（实际 ${s3.hp}/${s3.salves}）`);
}

// ── D. 车卡不变量：专家模式 3 轮随机选（种子化）──
{
	let seed = 31337;
	const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
	let shapeBad = 0;
	const runs = [];
	for (let run = 0; run < 6; run++) {
		w.eval('SugarCube.State.variables.pc = Game.Pc.defaults()');
		for (let r = 0; r < 3; r++) {
			const n = w.eval(`Game.Chargen.rounds[${r}].options.length`);
			w.eval(`Game.Chargen.pick(${r}, ${Math.floor(rng() * n)})`);
		}
		const p = JSON.parse(w.eval('JSON.stringify(SugarCube.State.variables.pc)'));
		runs.push(`${p.classKey}/${p.bgKey}/${p.speciesKey}`);
		if (p.round !== 3) shapeBad++;
		if (p.hp !== p.max_hp || !(p.max_hp > 0)) shapeBad++;
		if (new Set(p.skills).size !== p.skills.length) shapeBad++;
		if (p.picked.length !== 3) shapeBad++;
		if (Object.values(p.abilities).some((v) => v < 8 || v > 20)) shapeBad++;
		if (!p.classLabel || !p.bgLabel || !p.speciesLabel) shapeBad++;
	}
	ok(shapeBad === 0, `车卡形状律 ×6 种子：round=3 / hp=max_hp / skills 去重 / picked=3 / 属性∈[8,20] / 三项标签齐（${runs.slice(0, 3).join(' ')}…）`);
	ok(new Set(runs).size > 1, `随机组合产生多样角色（${new Set(runs).size} 种 / 6 次）`);
}

// ── E. 战斗伤害界限属性：随机装备/回合/败次 → 伤害 ∈[1,7] 且对败次单调不减 ──
{
	const I = w.Game.Items;
	const keys = ['日记', '龙鳞护臂', '坏哨', '观星者的书', '月光花'];
	let seed = 4242;
	const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
	let boundBad = 0, monoBad = 0, cases = 0;
	for (let i = 0; i < 800; i++) {
		const inv = {};
		for (const k of keys) if (rng() < 0.5) inv[k] = true;
		const round = 1 + Math.floor(rng() * 3);
		const defeats = Math.floor(rng() * 4);
		const d = I.battleDamage(round, inv, defeats);
		cases++;
		if (!(d >= 1 && d <= 8)) boundBad++;   // #236：基档 5/6/6 + rage 封顶 +2 → 上界 8
		if (I.battleDamage(round, inv, defeats + 1) < d) monoBad++;
	}
	ok(boundBad === 0, `战斗伤害界限 ${cases} 例随机装备/回合/败次：1 ≤ d ≤ 8`);
	ok(monoBad === 0, `战斗伤害单调律 ${cases} 例：败次增加不降低伤害`);
}

// ── F. 位点优势单调律（M5b 重定）：空手无优势；加件不撤销优势；彩蛋位点永不吃优势 ──
{
	const I = w.Game.Items;
	const sites = ['雾之魔物·挥击', '雾之魔物·心防', '龙·吐息', '龙·斩击', '龙·终击', '塔外花田', '寻杖'];
	const items = ['坏哨', '观星者的书', '月光花', '日记', '龙鳞护臂'];
	const invOf = (keys) => Object.fromEntries(keys.map((k) => [k, true]));
	let bad = 0, checked = 0;
	for (const s of sites) {
		if (I.advAt(s, {})) bad++; // 空手一律无优势
		for (let m = 0; m < (1 << items.length); m++) {
			const base = items.filter((_, i) => m & (1 << i));
			if (!I.advAt(s, invOf(base))) continue;
			checked++;
			for (const extra of items) if (!I.advAt(s, invOf([...base, extra]))) bad++;
		}
	}
	ok(bad === 0, `advAt 单调律：空手无优势 · 加件不撤销（已检查 ${checked} 个真值点）`);
	ok(I.advAt('雾之魔物·挥击', invOf(items)) === true && I.advAt('龙·吐息', invOf(items)) === true, '满配：坏哨 / 观星者的书各给对应位点优势');
	ok(I.advAt('龙·斩击', invOf(items)) === true, 'v17 补正 #3：坏哨给封印战攻击优势');
	ok(I.advAt('龙·终击', invOf(items)) === false, 'M5b：彩蛋位点不吃任何道具优势');
}

console.log(failures ? `\n${failures} 项属性失败` : '\n属性测试全部通过');
process.exit(failures ? 1 : 0);
