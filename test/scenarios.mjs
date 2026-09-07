// 分支场景测试：5 条完整路线（车卡 8 轮 + 检定驱动剧情）
// Math.random 劫持：0.99 → d20 恒 20（自然 20 必成）；0.01 → 恒 1（自然 1 必败）
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

async function newGame(randomStub, picks) {
	// uncaught 异常收集：SugarCube 交互宏抛错（如 goto 目标不存在）只走 jsdomError，
	// 无监听则被吞——测试绿但线上报错（坑11教训）。"Not implemented"（alert 等）不计。
	const uncaught = [];
	const vc = new VirtualConsole();
	vc.on('jsdomError', (e) => {
		const msg = String(e?.message ?? e);
		if (msg.startsWith('Uncaught')) uncaught.push(msg);
	});
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		url: 'http://localhost/',
		virtualConsole: vc,
		beforeParse(window) {
			window.Math.random = () => randomStub;
		},
	});
	await sleep(1200);
	const w = dom.window;
	new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
	w.SugarCube.Engine.start();
	await sleep(400);

	const clickLabel = async (label) => {
		const a = [...w.document.querySelectorAll('#passages a.link-internal')]
			.find((x) => x.textContent === label);
		if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}`);
		const before = uncaught.length;
		a.click();
		await sleep(320);
		if (uncaught.length > before) {
			throw new Error(`点击「${label}」后脚本异常：${uncaught[before].slice(0, 160)}`);
		}
	};

	await clickLabel('踏上旅途');
	await clickLabel('逐轮细调（专家模式 · 8 轮三选一）');
	// 专家模式：按选项名点对应卡片的"选择此项"
	for (const name of picks) {
		const card = [...w.document.querySelectorAll('.choice-card')]
			.find((c) => c.querySelector('.choice-name').textContent === name);
		if (!card) throw new Error(`车卡选项不存在「${name}」@ 第 ${w.SugarCube.State.variables.pc.round + 1} 轮`);
		card.querySelector('a.link-internal').click();
		await sleep(280);
	}
	if (w.SugarCube.State.passage !== '角色卡') throw new Error(`车卡未完成 @ ${w.SugarCube.State.passage}`);
	await clickLabel('出发，前往歪脖子鸭酒馆');
	return { w, clickLabel };
}

const passageOf = (w) => w.SugarCube.State.passage;
const pcOf = (w) => w.SugarCube.State.variables.pc;
const amuletOf = (w) => w.SugarCube.State.variables.has_amulet;

async function scenario(name, fn) {
	try {
		await fn();
		console.log(`✓ ${name}`);
	} catch (e) {
		failures++;
		console.error(`✗ ${name}\n    ${e.message}`);
	}
}

// ── 路线 A：全自然 20 → 察觉直接发现宝箱 → 护身符结局 ──
await scenario('路线A：火把+全检定成功 → 结局「月光倾城」', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '火把与绳索', '坚韧', '勇气',
	]);
	const pc = () => pcOf(w);
	if (pc().max_hp !== 14) throw new Error(`HP 应为 14（战士 10+2 + 坚韧 2），实际 ${pc().max_hp}`);
	if (pc().gold !== 25) throw new Error(`起始金币应为 25（佣兵15+人类10），实际 ${pc().gold}`);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	if (!w.SugarCube.State.variables.last_check.success) throw new Error('察觉检定应成功');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	if (passageOf(w) !== '女巫的委托') throw new Error(`应停在女巫的委托，实际 ${passageOf(w)}`);
	await clickLabel('功成身退');
	if (passageOf(w) !== '结局 月光倾城') throw new Error(`结局不对：${passageOf(w)}`);
	if (!amuletOf(w)) throw new Error('应持有护身符');
	if (pc().gold !== 50) throw new Error(`金币应为 25+25=50，实际 ${pc().gold}`);
	if (pc().hp !== 14) throw new Error(`全程无伤应满血，实际 ${pc().hp}`);
});

// ── 路线 B：全自然 1 → 摸黑+断桥 → 空手结局（矮人减伤验证）──
await scenario('路线B：摸黑+断桥 → 结局「空手而归」', async () => {
	const { w, clickLabel } = await newGame(0.01, [
		'博学型', '学者', '矮人', '巫师', '秘闻技艺', '长剑', '警觉', '机运',
	]);
	const pc = () => pcOf(w);
	if (pc().max_hp !== 7) throw new Error(`巫师 HP 应为 7（6+体12→+1），实际 ${pc().max_hp}`);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('摸黑走进山脚的洞穴（很危险）');
	if (pc().hp !== 5) throw new Error(`摸黑受伤后应 5（7-2），实际 ${pc().hp}`);
	await clickLabel('改走吊桥');
	if (pc().hp !== 1) throw new Error(`断桥受伤后应 1（5-4），实际 ${pc().hp}`);
	await clickLabel('走向小屋');
	// 金币 10 ≥ 10 → 治疗链接应存在，但选择离开
	const heal = [...w.document.querySelectorAll('#passages a.link-internal')]
		.some((a) => a.textContent.includes('请她治疗'));
	if (!heal) throw new Error('金币足够时治疗链接应存在');
	await clickLabel('转身离开森林');
	if (passageOf(w) !== '结局 空手而归') throw new Error(`结局不对：${passageOf(w)}`);
});

// ── 路线 C：察觉失败遇哥布林 → 贿赂结友 → 和平结局 ──
await scenario('路线C：贿赂哥布林 → 结局「平凡之光」', async () => {
	const { w, clickLabel } = await newGame(0.01, [
		'勇武型', '佣兵', '人类', '游荡者', '市井技艺', '火把与绳索', '坚韧', '勇气',
	]);
	const pc = () => pcOf(w);
	if (pc().gold !== 30) throw new Error(`起始金币应为 30（佣兵15+人类10+游荡者5），实际 ${pc().gold}`);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('慢慢后退，扔过去 5 枚金币');
	if (pc().gold !== 25) throw new Error(`贿赂后金币应 25，实际 ${pc().gold}`);
	if (!w.SugarCube.State.variables.goblin_spared) throw new Error('goblin_spared 应为 true');
	await clickLabel('钻过石缝');
	await clickLabel('接过汤碗');
	if (passageOf(w) !== '结局 平凡之光') throw new Error(`结局不对：${passageOf(w)}`);
});

// ── 路线 D：两次挑衅影子全豁免失败 → 死亡结局 ──
await scenario('路线D：两次鲁莽挑战 → 结局「死亡」', async () => {
	const { w, clickLabel } = await newGame(0.01, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '火把与绳索', '警觉', '机运',
	]);
	const pc = () => pcOf(w);
	if (pc().max_hp !== 12) throw new Error(`战士 HP 应为 12（无坚韧），实际 ${pc().max_hp}`);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('对着雾气大吼，宣示存在');
	if (pc().hp !== 6) throw new Error(`第一次豁免失败后应 6（12-6），实际 ${pc().hp}`);
	await clickLabel('明智起见，还是选条正经路');
	await clickLabel('对着雾气大吼，宣示存在');
	if (passageOf(w) !== '结局 死亡') throw new Error(`应死亡，当前：${passageOf(w)}`);
	if (pc().hp !== 0) throw new Error(`血量应归零，实际 ${pc().hp}`);
});

// ── 路线 E：酒馆买火把 → 战斗豁免失败受伤 → 仍获护身符 ──
await scenario('路线E：放走哥布林 → 塔·温室彩蛋 → 结局「新守林人」', async () => {
	const { w, clickLabel } = await newGame(0.01, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '长剑', '坚韧', '勇气',
	]);
	const pc = () => pcOf(w);
	if (pc().gold !== 25) throw new Error(`起始金币应为 25，实际 ${pc().gold}`);
	await clickLabel('买一支火把（10 金币）');
	if (pc().gold !== 15 || !pc().has_torch) throw new Error('买火把后金币/火把状态错误');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('拔剑！');
	if (pc().hp !== 10) throw new Error(`战斗受伤后应 10（14-4），实际 ${pc().hp}`);
	if (!amuletOf(w)) throw new Error('战斗获胜应获得护身符');
	await clickLabel('捡起护身符，目送它逃走');
	if (!w.SugarCube.State.variables.goblin_spared) throw new Error('放走哥布林应置 goblin_spared');
	await clickLabel('听她说完');
	if (passageOf(w) !== '女巫的委托') throw new Error(`应停在女巫的委托，实际 ${passageOf(w)}`);
	if (pc().hp !== 14) throw new Error(`女巫委托应回满血 14，实际 ${pc().hp}`);
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	// 坠入过去 → 温室：哥布林园丁认出"放走族崽"的恩人（跨章旗标彩蛋）
	await clickLabel('翻转护身符：坠入『过去』（剩 3 次）');
	if (w.SugarCube.State.variables.era !== 'past') throw new Error('时代未切换到过去');
	if (passageOf(w) !== '楼梯间') throw new Error(`翻转后应重渲染当前段落（楼梯间），实际 ${passageOf(w)}`);
	await clickLabel('三层 · 温室');
	if (!pc().tokens.includes('月光花')) throw new Error('温室彩蛋应赠月光花');
	if (pc().gold !== 20) throw new Error(`园丁赠金后应 20（15+5），实际 ${pc().gold}`);
	await clickLabel('返回楼梯间');
	await clickLabel('顶楼 · 守林人残影');
	if ([...w.document.querySelectorAll('#passages a.link-internal')].some((a) => a.textContent.includes('唤她回家'))) throw new Error('仅 1 件信物不应出现解放选项');
	await clickLabel('握住法杖，成为新的守林人');
	if (passageOf(w) !== '结局 新守林人') throw new Error(`结局不对：${passageOf(w)}`);
});


// ── 路线 F：全自然 20 → 四层四信物 → 顶楼解放（真结局）──
await scenario('路线F：全信物登塔 → 真结局「解放」', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '火把与绳索', '坚韧', '勇气',
	]);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	// 现在：门厅+书房
	await clickLabel('一层 · 门厅');
	if (!pcOf(w).tokens.includes('铜哨')) throw new Error('门厅应得铜哨');
	await clickLabel('返回楼梯间');
	await clickLabel('二层 · 书房');
	if (!pcOf(w).tokens.includes('日记')) throw new Error('书房应得日记');
	await clickLabel('返回楼梯间');
	// 过去：温室+天文台
	await clickLabel('翻转护身符：坠入『过去』（剩 3 次）');
	await clickLabel('三层 · 温室');
	if (!pcOf(w).tokens.includes('月光花')) throw new Error('温室应得月光花');
	await clickLabel('返回楼梯间');
	await clickLabel('四层 · 天文台');
	if (!pcOf(w).tokens.includes('星图残页')) throw new Error('天文台应得星图残页');
	await clickLabel('返回楼梯间');
	await clickLabel('顶楼 · 守林人残影');
	if (pcOf(w).tokens.length !== 4) throw new Error(`应集齐 4 信物，实际 ${pcOf(w).tokens.length}`);
	if (pcOf(w).amulet_charges !== 2) throw new Error(`充能应用去 1 剩 2，实际 ${pcOf(w).amulet_charges}`);
	await clickLabel('吹响铜哨，唤她回家');
	if (passageOf(w) !== '结局 解放') throw new Error(`结局不对：${passageOf(w)}`);
});

// ── 路线 G：全自然 1 → 零信物直上顶楼 → 焚塔 ──
await scenario('路线G：低层尽弃 → 结局「焚塔」', async () => {
	const { w, clickLabel } = await newGame(0.01, [
		'博学型', '学者', '人类', '巫师', '秘闻技艺', '长剑', '警觉', '机运',
	]);
	const pc = () => pcOf(w); // 坑2：跨导航禁止持有 $pc 引用，一律即时读取
	if (pc().max_hp !== 7) throw new Error(`巫师 HP 应 7，实际 ${pc().max_hp}`);
	if (pc().gold !== 20) throw new Error(`起始金币应 20（学者10+人类10），实际 ${pc().gold}`);
	await clickLabel('买一支火把（10 金币）');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('拔剑！');
	if (pc().hp !== 3) throw new Error(`战斗受创后应 3（7-4），实际 ${pc().hp}`);
	await clickLabel('捡起护身符，追上去斩草除根（+3 金币）');
	if (pc().gold !== 13) throw new Error(`追杀后金币应 13（10+3），实际 ${pc().gold}`);
	await clickLabel('听她说完');
	if (pc().hp !== 7) throw new Error(`女巫委托应回满 7，实际 ${pc().hp}`);
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	await clickLabel('顶楼 · 守林人残影');
	if (pc().tokens.length !== 0) throw new Error(`零探索应 0 信物，实际 ${pc().tokens.length}`);
	if ([...w.document.querySelectorAll('#passages a.link-internal')].some((a) => a.textContent.includes('唤她回家'))) throw new Error('零信物不应出现解放选项');
	await clickLabel('折断法杖，让塔与雾一同终结');
	if (passageOf(w) !== '结局 焚塔') throw new Error(`结局不对：${passageOf(w)}`);
});


// ── 路线 H：旧存档形状模拟（第二章上线前的档）→ 迁移 → 入塔不崩 ──
await scenario('路线H：旧档缺字段 → Pc.migrate 兜底 → 入塔正常', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'勇武型', '佣兵', '矮人', '战士', '荒野技艺', '火把与绳索', '坚韧', '勇气',
	]);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	// 模拟读旧档：整体替换为第二章之前的 $pc 形状（无 tokens/tower/ch2/amulet_charges 等）。
	// 注意（坑10测试注）：必须用 w.eval 在页面域内构造——SugarCube 建历史快照时用
	// instanceof 判型，Node 侧构造的对象数组是跨 realm 的，会触发
	// "attempted to clone unsupported type: Array"（真实浏览器读档无此问题）
	const oldShape = {
		name: '旧档旅人', round: 8,
		abilities: { str: 17, con: 15, dex: 13, wis: 12, int: 12, cha: 8 },
		skills: ['运动', '恐吓', '生存', '察觉'], feats: ['坚韧'], gear: ['火把', '绳索'],
		flags: { courage: true }, gold: 40, hp: 14, max_hp: 14,
		has_torch: true, has_rope: true, salve_used: false,
		speciesKey: 'dwarf', speciesLabel: '矮人', classLabel: '战士', bgLabel: '佣兵',
	};
	w.eval(`SugarCube.State.variables.pc = ${JSON.stringify(oldShape)};`);
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内'); // 塔门：Pc.migrate 归一化
	const pc = pcOf(w);
	if (!Array.isArray(pc.tokens) || pc.tokens.length !== 0) throw new Error(`tokens 应补齐为空数组，实际 ${typeof pc.tokens}`);
	if (pc.amulet_charges !== 3) throw new Error(`充能应为 3，实际 ${pc.amulet_charges}`);
	await clickLabel('一层 · 门厅');
	await clickLabel('返回楼梯间');
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('握住法杖，成为新的守林人');
	if (passageOf(w) !== '结局 新守林人') throw new Error(`结局不对：${passageOf(w)}`);
	if (pcOf(w).name !== '旧档旅人') throw new Error('迁移不应覆盖已有字段');
});

console.log(failures ? `\n${failures} 个场景失败` : '\n全部场景通过');
process.exit(failures ? 1 : 0);
