// 分支场景测试：5 条完整路线（车卡 8 轮 + 检定驱动剧情）
// Math.random 劫持：0.99 → d20 恒 20（自然 20 必成）；0.01 → 恒 1（自然 1 必败）
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
// 交互覆盖采集（L3 消费）：点击前后段落都算交互到达
const visited = new Set();

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
	const w = dom.window;
	// 就绪轮询替代固定等待（#27 CI 教训）：9 路线并行在 2 核 runner 上，
	// 脚本加载的固定 1.2s 不成立 → "starting passage not selected"。
	// 轮询消灭时序假设：SugarCube 就绪（Wikifier 可用）→ StoryInit → 起始段渲染完成。
	const pollUntil = async (cond, timeoutMs, what) => {
		const t0 = Date.now();
		while (!cond()) {
			if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时：${what}`);
			await sleep(50);
		}
	};
	await pollUntil(() => typeof w.SugarCube?.Wikifier === 'function' && w.document.querySelector('#passages'), 30000, 'SugarCube 加载');
	new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
	w.SugarCube.Engine.start();
	await pollUntil(() => w.document.querySelector('#passages .passage[data-passage="开场"]'), 15000, '起始段渲染');
	await sleep(150);

	const clickLabel = async (label) => {
		const a = [...w.document.querySelectorAll('#passages a.link-internal')]
			.find((x) => x.textContent === label);
		if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}`);
		visited.add(`${w.SugarCube.State.passage}|${w.SugarCube.State.variables?.era ?? '-'}`);
		const before = uncaught.length;
		a.click();
		await sleep(320);
		visited.add(`${w.SugarCube.State.passage}|${w.SugarCube.State.variables?.era ?? '-'}`);
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

// 路线收集器：并行执行（每路线独立 JSDOM，天然隔离无串扰——#27 提速方案，
// 替代"单启动+状态还原"：无还原即无还原不净风险，隔离语义与逐路线启动完全一致）
const pending = [];
function scenario(name, fn) { pending.push({ name, fn }); }

// ── 路线 A：全自然 20 → 察觉直接发现宝箱 → 护身符结局 ──
scenario('路线A：火把+全检定成功 → 结局「月光倾城」', async () => {
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
scenario('路线B：摸黑+断桥 → 结局「空手而归」', async () => {
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
scenario('路线C：贿赂哥布林 → 结局「平凡之光」', async () => {
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
scenario('路线D：两次鲁莽挑战 → 结局「死亡」', async () => {
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
scenario('路线E：放走哥布林 → 塔·温室彩蛋 → 结局「新守林人」', async () => {
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
	// 化身战（#23）：月光花在怀 → 终击优势；伤害 max(1,3−T)+max(1,4−T)+max(1,1−T) = 2+3+1
	if (passageOf(w) !== '雾之化身战') throw new Error(`新守林人必经化身战，实际 ${passageOf(w)}`);
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击');
	if (pc().hp !== 8) throw new Error(`化身战 1 信物应剩 8（14-2-3-1），实际 ${pc().hp}`);
	await clickLabel('握起法杖');
	if (passageOf(w) !== '结局 新守林人') throw new Error(`结局不对：${passageOf(w)}`);
});


// ── 路线 F：全自然 20 → 四层四信物 → 顶楼解放（真结局）──
scenario('路线F：全信物登塔 → 真结局「解放」', async () => {
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
	await clickLabel('试着说明来意（它看起来并不好说话）');
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

// ── 路线 G：全自然 1 → 零信物脆法 → 化身战败 → 塔的回声不死（#23 echo 守卫）──
scenario('路线G：脆法零信物 → 化身战败 → 塔的回声（不死+递增）', async () => {
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
	await clickLabel('折断法杖，让塔与雾一同终结');
	if (passageOf(w) !== '雾之化身战') throw new Error(`焚塔必经化身战，实际 ${passageOf(w)}`);
	await clickLabel('迎击');
	if (pc().hp !== 4) throw new Error(`R1 零信物受 3 伤应 4，实际 ${pc().hp}`);
	await clickLabel('她将你拽入回忆');
	// 7hp: 3+4=7 → 归零 → echo 守卫：hp=1、败计数+1、送塔的回声
	if (passageOf(w) !== '塔的回声') throw new Error(`战败应送塔的回声，实际 ${passageOf(w)}`);
	if (pc().hp !== 1) throw new Error(`echo 守卫应 hp=1，实际 ${pc().hp}`);
	if ((pc().tower.defeats ?? 0) !== 1) throw new Error(`败计数应 1，实际 ${pc().tower.defeats}`);
	await clickLabel('缓过气来');
	if (passageOf(w) !== '楼梯间') throw new Error(`应回楼梯间，实际 ${passageOf(w)}`);
	// 再战：rage +1 → R1 伤害 4 → hp1 归零再败，败计数 2
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('折断法杖，让塔与雾一同终结');
	if (!w.document.querySelector('#passages').textContent.includes('悲鸣比上次更烈（伤害 +1）')) throw new Error('战败后重进战场应显示递增提示');
	await clickLabel('迎击');
	if (passageOf(w) !== '塔的回声') throw new Error(`rage+1 应再败（hp1-4），实际 ${passageOf(w)}`);
	if ((pc().tower.defeats ?? 0) !== 2) throw new Error(`败计数应 2，实际 ${pc().tower.defeats}`);
});

// ── 路线 I：硬汉零信物 → 化身战全承 → 焚塔（战斗 build 的高潮兑现，#23）──
scenario('路线I：战士零信物硬接化身 → 结局「焚塔」', async () => {
	const { w, clickLabel } = await newGame(0.01, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '长剑', '坚韧', '勇气',
	]);
	const pc = () => pcOf(w);
	if (pc().gold !== 25) throw new Error(`起始金币应 25，实际 ${pc().gold}`);
	await clickLabel('买一支火把（10 金币）');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('拔剑！');
	await clickLabel('捡起护身符，追上去斩草除根（+3 金币）');
	await clickLabel('听她说完');
	if (pc().hp !== pc().max_hp) throw new Error('委托后应满血');
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('折断法杖，让塔与雾一同终结');
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击');
	// 14 − (3+4+1) = 6：零信物硬接全部伤害仍活
	if (pc().hp !== 6) throw new Error(`硬接 3+4+1 后应 6，实际 ${pc().hp}`);
	await clickLabel('折断法杖');
	if (passageOf(w) !== '结局 焚塔') throw new Error(`结局不对：${passageOf(w)}`);
});


// ── 路线 K：满配 spender（#25 经济 sink 全踩）→ 贿赂园丁+乌鸦 → 半途结算 ──
scenario('路线K：全消费（传闻+情报×2+药膏+贿赂+乌鸦） → 终局 6 金', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '火把与绳索', '坚韧', '勇气',
	]);
	const pc = () => pcOf(w); // 坑2：跨导航禁止持有 $pc 引用
	// 酒馆：买传闻（5 金——原免费送，#25 第一个 sink）
	await clickLabel('花 5 金币听老猎人讲实话（他说第三块板子是脆的）');
	if (pc().gold !== 20) throw new Error(`买传闻后应 20，实际 ${pc().gold}`);
	if (!w.SugarCube.State.variables.heard_rumor) throw new Error('传闻旗标应置位');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝'); // 宝箱 +25 → 45
	if (pc().gold !== 45) throw new Error(`宝箱后应 45（25-5+25），实际 ${pc().gold}`);
	await clickLabel('听她说完');
	// 女巫摊子：情报 ×2（8 金/条，铁卫无烙印无折扣）+ 药膏（8 金，库存 +1）
	await clickLabel('看看她的乌木匣（情报与药膏，收现金）');
	if (passageOf(w) !== '女巫 摊子') throw new Error(`应停在女巫 摊子，实际 ${passageOf(w)}`);
	await clickLabel('花 8 金币：书房烤炉后的暗格藏着什么');
	await clickLabel('花 8 金币：星图的残页在哪里对得齐');
	await clickLabel('花 8 金币买一副药膏（当前 0 副，受伤自动回 4）');
	if (pc().gold !== 21) throw new Error(`三购后应 21（45-8-8-8），实际 ${pc().gold}`);
	if (pc().salves !== 1) throw new Error(`药膏库存应 1，实际 ${pc().salves}`);
	if (!(w.SugarCube.State.variables.hint_diary && w.SugarCube.State.variables.hint_star)) throw new Error('两条情报旗标应置位');
	await clickLabel('回到炉边');
	// 入塔（past）：贿赂园丁拿月光花（10 金确定替代 DC13）
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	await clickLabel('翻转护身符：坠入『过去』（剩 3 次）');
	await clickLabel('三层 · 温室');
	await clickLabel('塞给它 10 金币——哥布林都爱钱，它应该也是');
	if (passageOf(w) !== '温室 贿赂') throw new Error(`应停在温室 贿赂，实际 ${passageOf(w)}`);
	if (!pc().tokens.includes('月光花')) throw new Error('贿赂应得月光花');
	if (pc().gold !== 11) throw new Error(`贿赂后应 11（21-10），实际 ${pc().gold}`);
	await clickLabel('返回楼梯间');
	// 乌鸦向导（5 金）：只读高亮——已取的月光花不再列出
	await clickLabel('给檐上的乌鸦 5 金币（它在这塔里活了一百年）');
	if (passageOf(w) !== '乌鸦指路') throw new Error(`应停在乌鸦指路，实际 ${passageOf(w)}`);
	const crowText = w.document.querySelector('#passages').textContent;
	if (!crowText.includes('铜哨') || crowText.includes('月光花')) throw new Error('乌鸦应列未取的铜哨、不列已取的月光花');
	if (pc().gold !== 6) throw new Error(`乌鸦后应 6（11-5），实际 ${pc().gold}`);
	await clickLabel('回到楼梯');
	await clickLabel('下塔离开');
	if (passageOf(w) !== '结局 半途') throw new Error(`结局不对：${passageOf(w)}`);
	// 终局账本（#25 验收）：满配 spender 落在设计区间 5~25
	if (pc().gold !== 6) throw new Error(`终局金币应 6，实际 ${pc().gold}`);
	if (pc().tokens.length !== 1) throw new Error(`只取月光花应 1 信物，实际 ${pc().tokens.length}`);
});

// ── 路线 H：旧存档形状模拟（第二章上线前的档）→ 迁移 → 入塔不崩 ──
scenario('路线H：旧档缺字段 → Pc.migrate 兜底 → 入塔正常', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'勇武型', '佣兵', '矮人', '战士', '荒野技艺', '火把与绳索', '坚韧', '勇气',
	]);
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	// 模拟读旧档：整体替换为第二章之前的 $pc 形状（fixture 单一源：s0-chapter1，与 L4 矩阵共用）。
	// 注意（坑10测试注）：必须用 w.eval 在页面域内构造——SugarCube 建历史快照时用
	// instanceof 判型，Node 侧构造的对象数组是跨 realm 的，会触发
	// "attempted to clone unsupported type: Array"（真实浏览器读档无此问题）
	const oldShape = JSON.parse(readFileSync('test/fixtures/saves/s0-chapter1.json', 'utf8')).pc;
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
	// 全自然 20：三段全闪避/扛住/命中，零伤通关
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击');
	if (pcOf(w).hp !== 14) throw new Error(`化身战零伤应仍 14，实际 ${pcOf(w).hp}`);
	await clickLabel('握起法杖');
	if (passageOf(w) !== '结局 新守林人') throw new Error(`结局不对：${passageOf(w)}`);
	if (pcOf(w).name !== '旧档旅人') throw new Error('迁移不应覆盖已有字段');
});

// 覆盖落盘（L3 消费）——在全部路线完成后（#27 并行化后落盘点随执行点后移）
import { writeFileSync, mkdirSync } from 'node:fs';

const results = await Promise.all(pending.map(async ({ name, fn }) => {
	try { await fn(); return { name, ok: true }; }
	catch (e) { return { name, ok: false, msg: e.message }; }
}));
mkdirSync('build', { recursive: true });
writeFileSync('build/coverage-scenarios.json', JSON.stringify({ cells: [...visited] }, null, 1));
for (const r of results) {
	if (r.ok) console.log(`✓ ${r.name}`);
	else { failures++; console.error(`✗ ${r.name}\n    ${r.msg}`); }
}
console.log(failures ? `\n${failures} 个场景失败` : '\n全部场景通过');
process.exit(failures ? 1 : 0);
