// 分支场景测试：用固定随机数走完三条完整路线，验证各结局可达
// 原理：SugarCube 的 random() 底层用 Math.random，
// 在 jsdom 的 beforeParse 阶段替换它 → 骰子结果完全可控、测试可复现。
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

// 加载一局新游戏；diceValue 0~0.99 会被映射成 1~6 的固定骰子
async function newGame(randomStub) {
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		url: 'http://localhost/',
		virtualConsole: new VirtualConsole(),
		beforeParse(window) {
			window.Math.random = () => randomStub; // 劫持骰子
		},
	});
	await sleep(1200);
	const w = dom.window;
	// jsdom 补齐启动链（真实浏览器自动完成）：StoryInit + 引擎启动
	const init = w.document.querySelector('tw-passagedata[name="StoryInit"]');
	new w.SugarCube.Wikifier(null, init.textContent);
	w.SugarCube.Engine.start();
	await sleep(500);
	return w;
}

// 按链接文字依次点击
async function clickThrough(w, labels) {
	for (const label of labels) {
		const link = [...w.document.querySelectorAll('#passages a.link-internal')]
			.find((a) => a.textContent === label);
		if (!link) throw new Error(`找不到链接「${label}」，当前段落：${w.SugarCube.State.passage}`);
		link.click();
		await sleep(350);
	}
}

const passageOf = (w) => w.SugarCube.State.passage;
const varsOf = (w) => w.SugarCube.State.variables;

async function scenario(name, fn) {
	try {
		await fn();
		console.log(`✓ ${name}`);
	} catch (e) {
		failures++;
		console.error(`✗ ${name}\n    ${e.message}`);
	}
}

// ── 场景 1：骰子全 6（0.99）→ 买火把 → 洞穴开出宝箱 → 护身符结局 ──
await scenario('路线A：火把+宝箱 → 结局「月光倾城」', async () => {
	const w = await newGame(0.99);
	await clickThrough(w, [
		'踏上旅途',
		'买一支火把（10 金币）',
		'回到大厅',
		'推门出发，走进暮色',
		'打着火把，走进山脚的洞穴',
		'收好护身符，穿过后洞的裂缝',
		'听她说完',
	]);
	if (passageOf(w) !== '结局 月光倾城') throw new Error(`结局不对：${passageOf(w)}`);
	if (!varsOf(w).has_amulet) throw new Error('应持有护身符');
	if (varsOf(w).gold !== 35) throw new Error(`金币应为 20-10+25=35，实际 ${varsOf(w).gold}`);
});

// ── 场景 2：骰子全 1（0.01）→ 不买火把 → 摸黑撞伤+吊桥坠落 → 空手结局 ──
await scenario('路线B：摸黑+断桥 → 结局「空手而归」', async () => {
	const w = await newGame(0.01);
	await clickThrough(w, [
		'踏上旅途',
		'推门出发，走进暮色',
		'摸黑走进山脚的洞穴（很危险）',
		'改走吊桥',
		'走向小屋',
		'转身离开森林',
	]);
	if (passageOf(w) !== '结局 空手而归') throw new Error(`结局不对：${passageOf(w)}`);
	if (varsOf(w).hp !== 55) throw new Error(`血量应为 100-15-30=55，实际 ${varsOf(w).hp}`);
});

// ── 场景 3：骰子全 1 → 持火把遇哥布林 → 贿赂结友 → 和平结局 ──
await scenario('路线C：贿赂哥布林 → 结局「平凡之光」', async () => {
	const w = await newGame(0.01);
	await clickThrough(w, [
		'踏上旅途',
		'买一支火把（10 金币）',
		'回到大厅',
		'推门出发，走进暮色',
		'打着火把，走进山脚的洞穴',
		'慢慢后退，扔过去 5 枚金币',
		'钻过石缝',
		'接过汤碗',
	]);
	if (passageOf(w) !== '结局 平凡之光') throw new Error(`结局不对：${passageOf(w)}`);
	if (!varsOf(w).goblin_spared) throw new Error('goblin_spared 应为 true');
	if (varsOf(w).gold !== 5) throw new Error(`金币应为 20-10-5=5，实际 ${varsOf(w).gold}`);
});

// ── 场景 4：连吃两次 60 伤害 → 死亡结局 & <<damage>> Widget 的死亡跳转 ──
await scenario('路线D：两次挑衅影子 → 结局「死亡」', async () => {
	const w = await newGame(0.01);
	await clickThrough(w, ['踏上旅途', '推门出发，走进暮色', '对着雾气大吼，宣示存在']);
	if (varsOf(w).hp !== 40) throw new Error(`第一次受伤后血量应为 40，实际 ${varsOf(w).hp}`);
	// 回到森林边缘再挑衅一次：40-60 → 0，应触发死亡跳转
	await clickThrough(w, ['明智起见，还是选条正经路', '对着雾气大吼，宣示存在']);
	if (passageOf(w) !== '结局 死亡') throw new Error(`应死亡，当前：${passageOf(w)}`);
	if (varsOf(w).hp !== 0) throw new Error(`血量应归零，实际 ${varsOf(w).hp}`);
});

console.log(failures ? `\n${failures} 个场景失败` : '\n全部场景通过');
process.exit(failures ? 1 : 0);
