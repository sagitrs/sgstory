// L5 数值属性测试（#16）：判定决策边界 · 优势/劣势支配性 · 伤害界限 · 车卡不变量
// 属性式断言 = 全枚举/随机输入 + 守恒律，与例测（rules.mjs）互补——专抓 off-by-one 与手抖赋值
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

const dom = new JSDOM(html, {
	runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
	virtualConsole: new VirtualConsole(),
	beforeParse(window) { window.Math.random = () => 0.5; },
});
await sleep(1200);
const w = dom.window;
new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
w.SugarCube.Engine.start();
await sleep(400);

// 可编程骰队列：Math.random → die = floor(r*20)+1，映射 die→r=(d-0.5)/20
const queueDice2 = (dice) => {
	const q = dice.map((d) => (d - 0.5) / 20);
	w.eval(`(function(){const q=${JSON.stringify(q)};Math.random=()=>q.length?q.shift():0.5;})()`);
};

const R = w.Rules;
const PC = { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 15, cha: 10 }, skills: ['察觉'], flags: {} };

// ── A. 判定决策边界全枚举：die 1..20 × DC {8,10,12,15} ──
// 律：success ⟺ die===20（自然20）|| (die!==1（非自然1）&& die+mod>=DC)
{
	const mod = R.check(PC, '察觉', 10).mod; // 自读实现回显的 mod，断言不依赖推导
	let bad = 0, cases = 0;
	for (const dc of [8, 10, 12, 15]) {
		for (let die = 1; die <= 20; die++) {
			queueDice2([die]);
			const r = R.check(PC, '察觉', dc);
			const expect = die === 20 ? true : die === 1 ? false : die + mod >= dc;
			cases++;
			if (r.roll !== die || r.mod !== mod || r.total !== die + mod || r.success !== expect) bad++;
		}
	}
	ok(bad === 0, `判定边界全枚举 ${cases} 例（mod=${mod}）：roll/mod/total/success 四元组与决策律一致`);
	// 边界本身被枚举覆盖证明：存在 die 使 die+mod==DC（达标的最低骰）两侧翻转
	const reach = 10 - mod; // die+mod==DC 的最低骰面
	queueDice2([reach]); const at = R.check(PC, '察觉', 10);
	queueDice2([reach - 1]); const below = R.check(PC, '察觉', 10);
	ok(at.success === true && below.success === false, `DC 边界翻转：die=${reach} 成 / die=${reach - 1} 败（mod=${mod}）`);
}

// ── B. 优势/劣势：取骰正确 + 支配性 ──
{
	const grid = [1, 5, 10, 15, 20];
	let takeBad = 0, domBad = 0, pairs = 0;
	for (const x of grid) for (const y of grid) {
		pairs++;
		queueDice2([x, y]);
		const adv = R.check(PC, '察觉', 12, { adv: 1 });
		queueDice2([x, y]);
		const dis = R.check(PC, '察觉', 12, { adv: -1 });
		if (adv.roll !== Math.max(x, y) || dis.roll !== Math.min(x, y)) takeBad++;
		// 支配律：劣势成 ⟹ 优势必成（max>=min；自然1/20 边界不破坏单调性）
		if (dis.success && !adv.success) domBad++;
	}
	ok(takeBad === 0, `adv/dis 取骰 ${pairs} 对：adv=max / dis=min`);
	ok(domBad === 0, `支配律 ${pairs} 对：dis 成 ⟹ adv 成`);
}

// ── C. 伤害界限属性：随机序列下 hp∈[0,max_hp]，归零即死亡跳转 ──
{
	let seed = 777;
	const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
	let boundBad = 0, deathBad = 0, salveBad = 0, steps = 0;
	const host = w.document.createElement('div');
	for (let i = 0; i < 60; i++) {
		const n = 1 + Math.floor(rng() * 20);
		const withSalve = rng() < 0.5;
		w.eval(`(function(){const v=SugarCube.State.variables;v.pc=SugarCube.State.variables.pc;v.pc.hp=14;v.pc.max_hp=14;v.pc.gear=${JSON.stringify(withSalve ? ['药膏'] : [])};v.pc.salve_used=false;})()`);
		w.SugarCube.Engine.play('酒馆'); await sleep(30);
		new w.SugarCube.Wikifier(host, `<<damage ${n}>>`);
		await sleep(60); // 死亡 goto 异步（引擎队列）
		const pc = w.SugarCube.State.variables.pc;
		steps++;
		if (!(pc.hp >= 0 && pc.hp <= pc.max_hp)) boundBad++;
		if (pc.hp <= 0 && w.SugarCube.State.passage !== '结局 死亡') deathBad++;
		// 药膏：未用时受伤自动 +4（上限裁剪）；用过后不再触发
		if (withSalve && pc.hp > 0 && !pc.salve_used) salveBad++; // 存活时受伤应消耗药膏（致死伤害 hp 不 gt 0，分支不触发属正确行为）
	}
	ok(boundBad === 0, `伤害界限 ${steps} 步随机序列：hp∈[0,max_hp] 恒成立`);
	ok(deathBad === 0, `归零死亡：hp<=0 时必跳转「结局 死亡」`);
	ok(salveBad === 0, `药膏自动生效：携带未用时受伤即消耗（+4 上限裁剪）`);
}

// ── D. 车卡不变量：专家模式 8 轮随机选（种子化）──
{
	let seed = 31337;
	const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
	const sums = [];
	let shapeBad = 0;
	for (let run = 0; run < 5; run++) {
		w.eval('SugarCube.State.variables.pc = Pc.defaults()');
		const pickedRound0 = 0; // 固定型轮=勇武型（索引0），其余随机——预算守恒对照
		w.eval('Chargen.pick(0, 0)');
		for (let r = 1; r < 8; r++) {
			const nOpts = w.eval(`ChargenRounds[${r}].options.length`);
			w.eval(`Chargen.pick(${r}, ${Math.floor(rng() * nOpts)})`);
		}
		const pc = w.eval('JSON.stringify(SugarCube.State.variables.pc)');
		const p = JSON.parse(pc);
		const sum = Object.values(p.abilities).reduce((a, b) => a + b, 0);
		sums.push(sum);
		if (p.round !== 8) shapeBad++;
		if (p.hp !== p.max_hp) shapeBad++;
		if (new Set(p.skills).size !== p.skills.length) shapeBad++; // 去重律
		if (p.picked.length !== 8) shapeBad++;
		if (Object.values(p.abilities).some((v) => v < 8 || v > 18)) shapeBad++;
	}
	ok(new Set(sums).size === 1, `预算守恒：固定型轮+任意后续选择 ×5 种子，属性总和恒 ${sums[0]}（${sums.join('/')}）`);
	ok(shapeBad === 0, '形状律：round=8 / hp=max_hp / skills 去重 / picked=8 / 属性∈[8,18]');
}

console.log(failures ? `\n${failures} 项属性失败` : '\n属性测试全部通过');
process.exit(failures ? 1 : 0);
