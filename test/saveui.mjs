// #264（#185 阶段六）旧存档 × 新界面 兼容矩阵。
//
// 与 test/rules.mjs 的 L4「迁移律」互补：那边只验 pc 形状（补键/保值/修型/幂等）；
// 这里把每个历史 fixture 的 pc **放进新界面**跑一遍，验四条「界面不撒谎」的律：
//   ① 不凭空补造历史结果：旧档没有 last_result ⇒ 不出现「本次结果」槽（scene-feedback）
//   ② 不串反馈：旧档载入后渲染任意段落，不得把别的段落的判定/结果带进来
//   ③ 不崩：无 uncaught、无 .error 元素，段落有输出
//   ④ 首遇门控对旧档安全：缺 keeper_intro/tav_seen 等新旗标 ⇒ 走「首遇」支（不崩、不跳支）
import { readdirSync, readFileSync } from 'node:fs';
import { boot, CLICKABLE } from './boot.mjs';

const fixtureDir = 'test/fixtures/saves';
const fixtures = readdirSync(fixtureDir).filter((f) => f.endsWith('.json')).sort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

// 新旧界面都会用到的代表段落：行动区/结果槽/首遇门控/战斗/结局 各有
const SCENES = ['门厅', '守林人', '书房', '雾之魔物·战', '宴·散场', '结局 死亡'];

console.log('══ 旧存档 × 新界面 兼容矩阵（#264）══');
console.log(`   fixtures：${fixtures.length} 版历史形状 × ${SCENES.length} 代表段落`);

const { w, uncaught } = await boot({ random: 0.5 });

for (const file of fixtures) {
	const fx = JSON.parse(readFileSync(`${fixtureDir}/${file}`, 'utf8'));
	const label = file.split('.')[0];
	const before = uncaught.length;
	// 把 fixture 的 pc 载进引擎（走真实迁移路径 Pc.migrate），并清掉界面态残留
	w.eval(`(function(){
		const v = SugarCube.State.variables;
		const raw = ${JSON.stringify(fx.pc)};
		v.pc = Pc.migrate(JSON.parse(JSON.stringify(raw)));
		v.era = 'present';
		delete v.pc.ev.last_result;   // 旧档不该有（若 fixture 里带了也不该被信任——先清再看闸门）
	})()`);

	// ① 载入后：不得凭空出现「本次结果」槽
	for (const era of ['present', 'past']) {
		w.eval(`SugarCube.State.variables.era = ${JSON.stringify(era)};`);
		w.SugarCube.Engine.play('门厅');
		await sleep(120);
		const boxes = w.document.querySelectorAll('#passages .scene-feedback').length;
		check(boxes === 0, `[${label}/${era}] 门厅无凭空结果槽`);
	}

	// ②③④ 逐段渲染：不崩、有输出、首遇门控安全
	for (const name of SCENES) {
		w.eval(`SugarCube.State.variables.era = 'present';`);
		const prev = w.SugarCube.State.passage;
		w.SugarCube.Engine.play(name);
		await sleep(120);
		const out = (w.document.querySelector('#passages')?.textContent ?? '').trim();
		const errs = w.document.querySelectorAll('#passages .error').length;
		const shown = w.SugarCube.State.passage;
		const forwarded = shown !== name;               // 计定失败→死亡等自动转场（合法）
		const hasChar = !!fx.pc?.abilities;   // 手改/极简档可能没有角色——战斗等段落允许「不崩但无内容」
		check(errs === 0, `[${label}] ${name}：无 .error`);
		if (hasChar || name === '结局 死亡') {
			check(forwarded || out.length > 0, `[${label}] ${name}：有输出${forwarded ? `（自动转场→${shown}）` : ''}`);
		} else {
			check(true, `[${label}] ${name}：退化档（无角色）允许无内容——只要求不崩`);
		}
		// 首遇门控：旧档没有 keeper_intro ⇒ 守林人首屏必须是「完整相认」支
		if (name === '守林人' && !forwarded) {
			const intro = out.includes('我就是守林人');
			const cruft = out.includes('undefined') || out.includes('NaN') || out.includes('[object');
			check(intro, `[${label}] 守林人：旧档走首遇支（完整相认）`);
			check(!cruft, `[${label}] 守林人：无 undefined/NaN/object 渲染`);
		}
	}
	check(uncaught.length === before, `[${label}] 全程无 uncaught（${uncaught.slice(before).join(' | ').slice(0, 120)}）`);

	// 旧档 + 一次真实点击：结果槽只带本次结果，且不重复结算
	w.eval(`(function(){ const v=SugarCube.State.variables; v.pc.hp = Math.max(v.pc.hp ?? 0, 18); v.pc.max_hp = Math.max(v.pc.max_hp ?? 0, 18); v.pc.inv = v.pc.inv || {}; v.pc.ev = v.pc.ev || {}; delete v.pc.inv['坏哨']; delete v.pc.ev.hall_seen; SugarCube.Engine.play('门厅'); })()`);
	await sleep(150);
	const clickable = [...w.document.querySelectorAll(CLICKABLE)].find((a) => a.textContent.includes('先看清钉子'));
	if (clickable) {
		clickable.click();
		await sleep(150);
		const slots = w.document.querySelectorAll('#passages .scene-feedback').length;
		const hasText = (w.document.querySelector('#passages')?.textContent ?? '').includes('看清');
		check(slots <= 1 && hasText, `[${label}] 点击后结果在屏且不重复（槽=${slots}）`);
	}
}

// ── #300 P1 回归：真实保存 / 加载往返（此前矩阵只做渲染，原理上抓不到「原地行动丢进度」）──
{
	const { w: w2 } = await boot({ random: 0.99 });   // 高骰：门厅取物必成
	w2.eval(`(function(){
		const pc = SugarCube.State.variables.pc;
		pc.abilities = pc.abilities || { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 };
		pc.max_hp = pc.max_hp || 18; pc.hp = pc.max_hp; pc.inv = pc.inv || {};
		delete pc.inv['坏哨']; delete pc.ev.hall_seen;
		SugarCube.Engine.play('门厅');
	})()`);
	await sleep(200);
	const click = (label) => {
		const a = [...w2.document.querySelectorAll('#passages a')].find((x) => x.textContent.includes(label));
		if (a) a.click();
		return !!a;
	};
	check(click('把墙上那支哨子摘下来'), '[P1] 门厅取物入口存在');
	await sleep(250);
	check(w2.eval("SugarCube.State.variables.pc.inv['坏哨'] === true"), '[P1] 取物后坏哨在行囊');
	check(w2.eval("!!document.querySelector('#passages .scene-feedback')"), '[P1] 取物后本次结果在屏');
	// 真实存 → 破坏 → 读
	w2.eval('SugarCube.Save.browser.slot.save(1, "P1 回归")');
	await sleep(250);
	w2.eval("(function(){ delete SugarCube.State.variables.pc.inv['坏哨']; delete SugarCube.State.variables.pc.ev.last_result; })()");
	check(w2.eval("SugarCube.State.variables.pc.inv['坏哨'] === undefined"), '[P1] 破坏态就位（哨与结果已清）');
	await w2.eval('SugarCube.Save.browser.slot.load(1)');
	await sleep(250);
	w2.eval('SugarCube.Engine.show()');
	await sleep(250);
	check(w2.eval("SugarCube.State.variables.pc.inv['坏哨'] === true"), '#300 P1：读档后坏哨须还在（原地行动状态进了 moment）');
	check(w2.eval("document.querySelector('#passages').textContent.includes('翻找过')"), '#300 P1：读档后门厅处于「已翻找」态（不回到可摘取）');
}

console.log(`\n${fails ? '✗' : '✔'} 旧存档 × 新界面：${fails ? `${fails} 项失败` : '全部通过'}`);
process.exit(fails ? 1 : 0);
