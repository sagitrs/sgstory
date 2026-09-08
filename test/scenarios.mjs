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
	// #36 恐吓折扣：佣兵熟练恐吓 → 贿赂 5→3（标签同源动态价）
	await clickLabel('慢慢后退，扔过去 3 枚金币');
	if (pc().gold !== 27) throw new Error(`恐吓折扣贿赂后应 27（30-3），实际 ${pc().gold}`);
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

// ── 路线 M：三章结构验收（C1 #49）——锚切换免费、水闸跨时代机关、环路闭合 ──
scenario('路线M：战胜化身 → 塌井入塔底 → 锚切+水闸机关 → 前厅封印门 → 环路回顶', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'勇武型', '佣兵', '人类', '战士', '荒野技艺', '火把与绳索', '坚韧', '勇气',
	]);
	const pc = () => pcOf(w); // 坑2：跨导航禁止持有 $pc 引用
	const era = () => w.SugarCube.State.variables.era;
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('折断法杖，让塔与雾一同终结');
	// 化身战三连（0.99 全过，无信物无伤）
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击');
	if (!pc().tower.avatar_down) throw new Error('战胜化身应置 avatar_down');
	// C1 入口一：战后裂口
	await clickLabel('俯身探看裂口，下到塔底（第三章）');
	if (passageOf(w) !== '塔底·塌井厅') throw new Error(`应落塌井厅，实际 ${passageOf(w)}`);
	// 共鸣锚：免费切换（不耗充能——与二章 erashift 的判别断言）
	const chargesBefore = pc().amulet_charges;
	await clickLabel('触动共鸣锚：坠入『过去』');
	if (era() !== 'past' || passageOf(w) !== '塔底·塌井厅') throw new Error(`锚切后应留在原段 past，实际 ${passageOf(w)}/${era()}`);
	if (pc().amulet_charges !== chargesBefore) throw new Error('共鸣锚不得耗充能');
	await clickLabel('去封印大厅');
	if (!w.document.querySelector('#passages').textContent.includes('四道锁槽')) throw new Error('past 封印大厅应见四锁槽');
	// 水闸机关：past 开闸
	await clickLabel('去水淹机房');
	await clickLabel('转动水闸，让暗河流往它该去的地方');
	if (!pc().tower.sluice) throw new Error('水闸应置 tower.sluice');
	await clickLabel('回到机房');
	await clickLabel('触动共鸣锚：回到『现在』');
	if (era() !== 'present') throw new Error('机房锚应可切回 present');
	await clickLabel('回封印大厅');
	if (!w.document.querySelector('#passages').textContent.includes('沟壑状抓痕')) throw new Error('present 封印大厅应见龙迹');
	// 跨时代后果：河床见底新通路（C2↔ENG 环路）
	await clickLabel('去暗河码头');
	await clickLabel('顺河床深入机房');
	if (passageOf(w) !== '塔底·水淹机房') throw new Error(`河床新通路应达机房，实际 ${passageOf(w)}`);
	await clickLabel('回封印大厅');
	// C1 全 locale 配测（L3）：宝藏厅/熔炉/囚室顺访
	await clickLabel('去宝藏厅');
	await clickLabel('回封印大厅');
	await clickLabel('去熔炉');
	await clickLabel('回封印大厅');
	await clickLabel('去囚室');
	if (!w.document.querySelector('#passages').textContent.includes('指骨仍抵在地面星轨图')) throw new Error('present 囚室应见星轨图骸骨（past 伏笔由 render-all 双态覆盖）');
	await clickLabel('回封印大厅');
	// 观测廊双态（past 残卷=真相层）
	await clickLabel('去观测廊');
	await clickLabel('触动共鸣锚：坠入『过去』');
	if (!w.document.querySelector('#passages').textContent.includes('雾生于龙梦')) throw new Error('past 观测廊应见《坠星志》残卷');
	await clickLabel('回封印大厅');
	// 前厅封印门 + 环路闭合
	await clickLabel('去龙穴前厅');
	if (!w.document.querySelector('#passages').textContent.includes('等四件东西')) throw new Error('前厅应见四锁槽封印门');
	await clickLabel('退回封印大厅');
	await clickLabel('去塌井厅');
	await clickLabel('触动共鸣锚：回到『现在』');
	await clickLabel('攀回顶楼');
	if (passageOf(w) !== '顶楼') throw new Error(`环路应回顶楼，实际 ${passageOf(w)}`);
});

// ── 路线 N：C2 真相层验收（#50）——三命题五段全踩 + 星图弱点链 + 宴会第二义 ──
scenario('路线N：星图线 → 化身战后下塔底 → 囚徒三臂+信+星图对接 → 宴会第二义 → 顶楼两读', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'博学型', '学者', '人类', '巫师', '秘闻技艺', '长剑', '警觉', '机运',
	]);
	const pc = () => pcOf(w);
	const txt = () => w.document.querySelector('#passages').textContent;
	await clickLabel('买一支火把（10 金币）');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	// 星图残页：past 天文台（奥秘 0.99 必过）——塔内充能翻转（与三章共鸣锚判别）
	await clickLabel('翻转护身符：坠入『过去』（剩 3 次）');
	await clickLabel('四层 · 天文台');
	if (!pc().tokens.includes('星图残页')) throw new Error('奥秘 0.99 线应取得星图残页');
	await clickLabel('返回楼梯间');
	await clickLabel('翻转护身符：回到『现在』（剩 2 次）');
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('折断法杖，让塔与雾一同终结');
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击');
	await clickLabel('俯身探看裂口，下到塔底（第三章）');
	// past 囚徒三臂（互补型）
	await clickLabel('触动共鸣锚：坠入『过去』');
	await clickLabel('去封印大厅');
	if (!txt().includes('梦渗成雾')) throw new Error('past 封印大厅应闻守卫吟诵（dragon_mist 通路2）');
	await clickLabel('去囚室');
	await clickLabel('问青梧的事（她为何守在这里）');
	if (!txt().includes('守的从来不是悔恨——是封印')) throw new Error('囚徒·青梧应给 keeper_seal 证词');
	await clickLabel('回到囚室');
	await clickLabel('问龙的事（它到底是什么）');
	if (!txt().includes('雾是从龙的梦里渗出来的')) throw new Error('囚徒·龙应给 dragon_mist 证词');
	await clickLabel('回到囚室');
	await clickLabel('问出路（封印圈怎么破）');
	if (!txt().includes('得有人站在门里')) throw new Error('囚徒·出路应给封印圈机制');
	await clickLabel('回到囚室');
	if (!txt().includes('想知道的都告诉了你')) throw new Error('asked_seer 回声句应现');
	// present 信（keeper_seal+feast_meaning 通路）
	await clickLabel('回封印大厅');
	await clickLabel('触动共鸣锚：回到『现在』');
	await clickLabel('去囚室');
	await clickLabel('抽出那封信');
	if (!txt().includes('等它睡沉了，我再回来') || !txt().includes('菜要一直温着')) throw new Error('信应同时供 keeper_seal 与 feast_meaning 通路');
	await clickLabel('回到囚室');
	// 星图对接 → hint_weakness → 前厅回声
	await clickLabel('回封印大厅');
	await clickLabel('去观测廊');
	await clickLabel('细读那行小字');
	if (!w.SugarCube.State.variables.hint_weakness) throw new Error('星图对接应置 hint_weakness');
	await clickLabel('回到观测廊');
	await clickLabel('回封印大厅');
	await clickLabel('去龙穴前厅');
	if (!txt().includes('排成了坠星的轨迹')) throw new Error('前厅应现 hint_weakness 回声（星纹可读）');
	// 宴会第二义（门厅 past，avatar_down 后老妇人）
	await clickLabel('退回封印大厅');
	await clickLabel('沿河床回到塔门|去暗河码头'.split('|')[1]); // 防歧义：走暗河
	await clickLabel('触动共鸣锚：坠入『过去』');
	await clickLabel('去封印大厅');
	await w.SugarCube.Engine.play('门厅'); await sleep(200);
	if (!txt().includes('打完就回来吃饭') || !txt().includes('走不出去')) throw new Error('门厅 past 老妇人应现宴会第二义+封印圈伏笔');
	// 顶楼两读并存（尾声）：avatar_down 后残影补"守的不是悔恨"
	w.SugarCube.State.variables.era = 'present';
	await w.SugarCube.Engine.play('顶楼'); await sleep(200);
	if (!txt().includes('守的从来不是悔恨')) throw new Error('顶楼 present 应现两读句');
});

// ── 路线 O：C3 龙战验收·满配线（#51）——四信物+识货+锻造+偷袭+三副动作+屠龙 ──
scenario('路线O：四信物 → 化身战 → 塔底经济（识货+10/锻造−8）→ 前厅四锁 → 偷袭 → 副动作三连 → 屠龙', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'博学型', '学者', '人类', '巫师', '秘闻技艺', '长剑', '警觉', '机运',
	]);
	const pc = () => pcOf(w);
	const txt = () => w.document.querySelector('#passages').textContent;
	const gold0 = () => pc().gold;
	await clickLabel('买一支火把（10 金币）');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	// 四信物（F 线序列）：present 门厅铜哨+书房日记 → past 温室花+天文台星图
	await clickLabel('一层 · 门厅');
	if (!pc().tokens.includes('铜哨')) throw new Error('门厅应得铜哨');
	await clickLabel('返回楼梯间');
	await clickLabel('二层 · 书房');
	if (!pc().tokens.includes('日记')) throw new Error('书房应得日记');
	await clickLabel('返回楼梯间');
	await clickLabel('翻转护身符：坠入『过去』（剩 3 次）');
	await clickLabel('三层 · 温室');
	await clickLabel('试着说明来意（它看起来并不好说话）');
	if (!pc().tokens.includes('月光花')) throw new Error('温室应得月光花');
	await clickLabel('返回楼梯间');
	await clickLabel('四层 · 天文台');
	if (pc().tokens.length !== 4) throw new Error(`应集齐 4 信物，实际 ${pc().tokens.length}`);
	await clickLabel('返回楼梯间');
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('折断法杖，让塔与雾一同终结');
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击');
	await clickLabel('俯身探看裂口，下到塔底（第三章）');
	// past 熔炉：8 金锻造龙鳞护臂（学者 20−10 火把=10 金 ≥8 ✓）
	await clickLabel('触动共鸣锚：坠入『过去』');
	await clickLabel('去封印大厅');
	await clickLabel('去熔炉');
	const gBefore = gold0();
	await clickLabel('花 8 金：用残料把那截龙鳞护臂锻完');
	if (!pc().tower.scale_armor) throw new Error('锻造应置 scale_armor');
	if (gold0() !== gBefore - 8) throw new Error(`锻造应 −8 金，实际 ${gold0() - gBefore}`);
	await clickLabel('回到熔炉');
	await clickLabel('回封印大厅');
	// present 宝藏厅识货（历史 ✓ 0.99）
	await clickLabel('触动共鸣锚：回到『现在』');
	await clickLabel('去宝藏厅');
	await clickLabel('拂去金像臂上的灰，细看铭文');
	if (!pc().tower.looted_hoard || gold0() !== gBefore - 8 + 10) throw new Error('识货应 +10 金');
	await clickLabel('回到宝藏厅');
	await clickLabel('回封印大厅');
	// past 前厅：四锁槽开门 → 巢室拾坠星志 → 偷袭
	await clickLabel('触动共鸣锚：坠入『过去』');
	await clickLabel('去龙穴前厅');
	await clickLabel('把哨、册、花、图逐一嵌入锁槽——开门');
	await clickLabel('拾起那半卷手稿');
	if (!pc().tower.scroll_lower) throw new Error('坠星志下半卷应置 scroll_lower');
	if (!txt().includes('坠星之芒可透其逆鳞')) throw new Error('下半卷应含弱点句');
	await clickLabel('回到巢穴');
	await clickLabel('趁它沉眠，先下手');
	if (pc().tower.dragon_hp !== w.Game.Dragon.hp - w.Game.Dragon.sneakHit) throw new Error(`偷袭后龙 HP 应 ${w.Game.Dragon.hp - 6}，实际 ${pc().tower.dragon_hp}`);
	await clickLabel('追向封印大厅');
	await clickLabel('迎战');
	// 战斗：三副动作（哨/花/名）→ 地形切 present → 迎击至屠龙
	await clickLabel('吹响铜哨——唤宴会宾客的残念');
	if (!pc().tower.whistle_blown) throw new Error('铜哨应置 whistle_blown');
	if (!txt().includes('温了三百年的菜')) throw new Error('铜哨应现宾客助战');
	await clickLabel('回到战斗');
	await clickLabel('翻开日记，念出她的名字');
	if (!pc().tower.name_struck) throw new Error('念名应置 name_struck');
	await clickLabel('回到战斗');
	await clickLabel('吞下月光花——银辉解毒');
	if (!pc().tower.flower_used_dragon) throw new Error('月光花应置 flower_used_dragon');
	await clickLabel('回到战斗');
	await clickLabel('触动共鸣锚：回到『现在』'); // 地形：废墟输出+1（战斗中锚切=战术动作）
	// 16 HP；输出 3+1scroll+2name+1present=7/轮（0.99 全命中）→ 3 轮
	await clickLabel('迎击——趁它换息的间隙逼近');
	await clickLabel('稳住身形，继续');
	await clickLabel('迎击——趁它换息的间隙逼近');
	await clickLabel('稳住身形，继续');
	await clickLabel('迎击——趁它换息的间隙逼近'); // 16−7−7=2 → 本轮 −7 后 ≤0：最后一击分支
	await clickLabel('最后一击落下——');
	if (passageOf(w) !== '塔底·屠龙') throw new Error(`3 轮 7 伤应屠龙（16HP），实际在 ${passageOf(w)}`);
	if (!pc().tower.dragon_down) throw new Error('屠龙应置 dragon_down');
	if (!txt().includes('三百年长梦，到此为止')) throw new Error('屠龙段应现收束文本');
	await clickLabel('走出塔底');
	if (passageOf(w) !== '结局 屠龙·占位') throw new Error(`应达占位结局，实际 ${passageOf(w)}`);
});

// ── 路线 P：C3 龙战验收·零信物线（#51）——星纹共振开门 + 败-龙威递增-再战 ──
scenario('路线P：星图对接（零信物）→ 共振开门 → 空巢对决 → 战败回声 → 龙威递增再战', async () => {
	const { w, clickLabel } = await newGame(0.99, [
		'博学型', '学者', '人类', '巫师', '秘闻技艺', '长剑', '警觉', '机运',
	]);
	const pc = () => pcOf(w);
	const txt = () => w.document.querySelector('#passages').textContent;
	await clickLabel('买一支火把（10 金币）');
	await clickLabel('回到大厅');
	await clickLabel('推门出发，走进暮色');
	await clickLabel('打着火把，走进山脚的洞穴');
	await clickLabel('收好护身符，穿过后洞的裂缝');
	await clickLabel('听她说完');
	await clickLabel('登上守林人之塔（第二章）');
	await clickLabel('进入塔内');
	// 0.01 但星图对接走 N 线前置：天文台 past 0.01 会失败 → 改走女巫情报？0.01 全败。
	// 零信物+零情报的开门第三态：差的东西提示——js 侧直配 hint_weakness 模拟"已读懂星纹"的玩家
	w.SugarCube.State.variables.hint_weakness = true;
	await clickLabel('顶楼 · 守林人残影');
	await clickLabel('折断法杖，让塔与雾一同终结');
	await clickLabel('迎击');
	await clickLabel('她将你拽入回忆');
	await clickLabel('倾尽全力，最后一击'); // 0.01 终击也命中（终击无检定，见化身战）
	await clickLabel('俯身探看裂口，下到塔底（第三章）');
	await clickLabel('触动共鸣锚：坠入『过去』');
	await clickLabel('去封印大厅');
	await clickLabel('去龙穴前厅');
	// 星纹共振开门（hint_weakness 替代线）
	await clickLabel('以星图残页的共振强行开门');
	await clickLabel('趁它沉眠，先下手');
	await clickLabel('追向封印大厅');
	await clickLabel('迎战');
	pcOf(w).hp = 1; // 压血构造战败（战斗已开，首回合前）（每轮 −1）→ 龙爪/焰磨死 7HP 巫师 → 败
	await clickLabel('迎击——趁它换息的间隙逼近');
	await clickLabel('视野沉入雾中——');
	if (passageOf(w) !== '塔底·龙战·败') throw new Error(`0.01 脆法应战败，实际 ${passageOf(w)}`);
	if ((pc().tower.dragon_defeats ?? 0) !== 1) throw new Error('败段应计 dragon_defeats=1');
	if (!txt().includes('塔的回声接住了你')) throw new Error('败段应现回声守卫文本');
	// 回声守卫：不重置（信物/护臂保留），重开战斗
	await clickLabel('回到大厅，再战');
	if (pc().tower.dragon_r !== 1 || pc().tower.dragon_hp !== w.Game.Dragon.hp) throw new Error('回声应重置战斗不重置资产');
	// js 侧把龙打到残血验证龙威递增伤害（defeats=1 → dragonDamage +1）
	pc().tower.dragon_hp = 1;
	await clickLabel('迎击——趁它换息的间隙逼近');
	await clickLabel('最后一击落下——');
	if (passageOf(w) !== '塔底·屠龙') throw new Error(`残血 1HP 一击应屠龙，实际 ${passageOf(w)}`);
	await clickLabel('走出塔底');
	if (passageOf(w) !== '结局 屠龙·占位') throw new Error('应达占位结局');
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
