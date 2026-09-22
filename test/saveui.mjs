// #264（#185 阶段六）旧存档 × 新界面 兼容矩阵。
//
// 与 test/rules.mjs 的 L4「迁移律」互补：那边只验 pc 形状（补键/保值/修型/幂等）；
// 这里把每个历史 fixture 的 pc **放进新界面**跑一遍，验四条「界面不撒谎」的律：
// ① 不凭空补造历史结果：旧档没有 last_result → 不出现「本次结果」槽（scene-feedback）
// ② 不串反馈：旧档载入后渲染任意段落，不得把别的段落的判定/结果带进来
// ③ 不崩：无 uncaught、无.error 元素，段落有输出
// ④ 首遇门控对旧档安全：缺 keeper_intro/tav_seen 等新旗标 → 走「首遇」支（不崩、不跳支）
import { readdirSync, readFileSync } from 'node:fs';
import { boot, CLICKABLE } from './boot.mjs';
import { makeSession } from './harness.mjs';   // #317①：公共 harness

const fixtureDir = 'test/fixtures/saves';
const fixtures = readdirSync(fixtureDir).filter((f) => f.endsWith('.json')).sort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

// 新旧界面都会用到的代表段落：行动区/结果槽/首遇门控/战斗/结局 各有
// `#1004` B2b 复核席按**裁定 A** 重指（面级 → 重指到有该面的样本）：六个旧场景名里
// `雾之魔物·战` → 夹具的 `洞穴·战斗`、`宴·散场` → 夹具的 `地下宴会厅`（另四个**段名同款**，
// 夹具按裁定 (甲) 沿用段名）。注意：判据（矩阵四律：不崩／有输出／无凭空结果槽／无 uncaught）**一字未改**。
const SCENES = ['门厅', '守林人', '书房', '洞穴·战斗', '地下宴会厅', '结局 死亡'];

console.log('══ 旧存档 × 新界面 兼容矩阵（#264）══');
console.log(`   fixtures：${fixtures.length} 版历史形状 × ${SCENES.length} 代表段落`);

const { w, uncaught } = await boot({ random: 0.5 });

for (const file of fixtures) {
	const fx = JSON.parse(readFileSync(`${fixtureDir}/${file}`, 'utf8'));
	const label = file.split('.')[0];
	const before = uncaught.length;
	// 把 fixture 的 pc 载进引擎（走真实迁移路径 Game.Pc.migrate），并清掉界面态残留
	w.eval(`(function(){
		const v = SugarCube.State.variables;
		const raw = ${JSON.stringify(fx.pc)};
		v.pc = Game.Pc.migrate(JSON.parse(JSON.stringify(raw)));
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
		// ⛔ **退役 ＋ 声明**（`#1004` B2b，按裁定 A 的"剧情级"半边）：原「首遇门控」那一格
		//（旧档没有 `keeper_intro` → 守林人首屏必须是**完整相认**支，认的是台词「我就是守林人」）
		// —— 那是**旧故事侧**的首遇门控逻辑 ＋ 它的台词 → 面夹具的 `守林人` 只是一个 hub（`他拄着杖站在路口。` ＋ `<<socpanel>>`），
		// **没有**首遇门控这一面 → 该格**没有对象**（不是判据坏了）。
		//注意：**声明**：**「老档 × 首遇门控（`keeper_intro` 类）分支」这一面自此无端到端守护** → 日后要动它 → 先补一个带该门控的样本。
		// 保留（引擎级、与故事无关）：`无 undefined/NaN/object 渲染` 那一格照旧对**每个**场景都在跑（见下）。
		if (!forwarded) {
			const cruft = out.includes('undefined') || out.includes('NaN') || out.includes('[object');
			check(!cruft, `[${label}] ${name}：无 undefined/NaN/object 渲染`);
		}
	}
	check(uncaught.length === before, `[${label}] 全程无 uncaught（${uncaught.slice(before).join(' | ').slice(0, 120)}）`);

	// 旧档 + 一次真实点击：结果槽只带本次结果，且不重复结算
	w.eval(`(function(){ const v=SugarCube.State.variables; v.pc.hp = Math.max(v.pc.hp ?? 0, 18); v.pc.max_hp = Math.max(v.pc.max_hp ?? 0, 18); v.pc.inv = v.pc.inv || {}; v.pc.ev = v.pc.ev || {}; delete v.pc.inv['坏哨']; delete v.pc.ev.hall_seen; SugarCube.Engine.play('门厅'); })()`);
	await sleep(150);
	// #317①：点击走 harness（可选点击：入口不存在时返回 null，不抛）
	const s1 = makeSession(w, { sleep, wait: 150 });
	// `#1004` B2b：点击入口与在屏文案按**夹具**改准（夹具 `门厅` 的观察入口叫 `看钉`、
	// 结果正文是「钉子旁边那圈灰不太对」；旧写的 `先看清钉子`／`看清` 是旧故事的文案）。
	if (await s1.tryClickByLabel('看钉')) {
		const slots = w.document.querySelectorAll('#passages .scene-feedback').length;
		const hasText = (w.document.querySelector('#passages')?.textContent ?? '').includes('钉子旁边那圈灰');
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
	// #317①：走 harness 的可选点击（返回元素或 null）
	const s2 = makeSession(w2, { sleep, wait: 250, scope: 'any' });
	const took = await s2.tryClickByLabel('把墙上那支哨子摘下来');
	check(!!took, '[P1] 门厅取物入口存在');
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
	// `#1004` B2b：**判据不放宽**，只把它**对准夹具里等价的那个可观察面**：
	// 旧故事用旁白「……翻找过」表达"已取过"；夹具用**条件渲染**表达同一件事
	//（`<<if not $pc.world.whistle_taken>>` 包住那条摘取链接）→ 判据仍是**原来那句**
	//「**读档后不回到可摘取**」，只是用夹具的等价读数来量（链接不在了 **且** 旗标在）。
	check(w2.eval("SugarCube.State.variables.pc.world?.whistle_taken === true && !document.querySelector('#passages').textContent.includes('把墙上那支哨子摘下来')"),
		'#300 P1：读档后门厅处于「已取过」态（不回到可摘取：旗标在 ＋ 摘取入口不再出现）');
}

console.log(`\n${fails ? '✗' : '✔'} 旧存档 × 新界面：${fails ? `${fails} 项失败` : '全部通过'}`);
process.exit(fails ? 1 : 0);
