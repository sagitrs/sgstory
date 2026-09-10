// 分支场景测试（M1a-2 换骨后）：金路径 + 分支矩阵（每条结局一条路线）
// Math.random 劫持：0.99 → d20 恒 20（自然 20 必成）；0.01 → 恒 1（自然 1 必败）；0.5 → 恒 11
// 交互覆盖落盘 build/coverage-scenarios.json（coverage.mjs 门禁用）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const visited = new Set();

async function newGame(randomStub, preset = 0) {
	const uncaught = [];
	const vc = new VirtualConsole();
	vc.on('jsdomError', (e) => {
		const msg = String(e?.message ?? e);
		if (msg.startsWith('Uncaught')) uncaught.push(msg);
	});
	const dom = new JSDOM(html, {
		runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
		beforeParse(window) { window.Math.random = () => randomStub; },
	});
	const w = dom.window;
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
	await sleep(120);

	const mark = () => visited.add(`${w.SugarCube.State.passage}|${w.SugarCube.State.variables?.era ?? '-'}`);
	const click = async (label) => {
		// 精确优先：避免「塔」被「守塔的人家」这类包含关系抢先命中（子串兜底保留，供动态文案用）
		const links = [...w.document.querySelectorAll('#passages a.link-internal, #passages a.soc-opt')];
		const a = links.find((x) => x.textContent === label) ?? links.find((x) => x.textContent.includes(label));
		if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}（可选：${[...w.document.querySelectorAll('#passages a.link-internal, #passages a.soc-opt')].map((x) => x.textContent).join(' / ')}）`);
		mark();
		const before = uncaught.length;
		a.click();
		await sleep(300);
		mark();
		if (uncaught.length > before) throw new Error(`点击「${label}」后脚本异常：${uncaught[before].slice(0, 160)}`);
	};
	// 车卡 + 出发
	await click('踏上旅途');
	await click('快速成型');
	if (preset) {
		// 选第 N 套预设（车卡页有多张卡片）
		const cards = [...w.document.querySelectorAll('.choice-card')];
		cards[preset].querySelector('a.link-internal').click();
		await sleep(300);
	}
	await click('出发，前往歪脖子鸭酒馆');
	return { w, click, uncaught };
}

const linksOf = (w) => [...w.document.querySelectorAll('#passages a.link-internal, #passages a.soc-opt')].map((x) => x.textContent);
const passageOf = (w) => w.SugarCube.State.passage;
// B1：战斗每一轮的面板是随机 3 选 1——测试不去猜哪三张，只管"有牌就打"
// 直到出现目标链接（战斗的出口）或段落里已经没有链接（已经落到结局）
async function fightTo(c, w, stops, maxRounds = 12) {
	const where = passageOf(w);
	for (let i = 0; i < maxRounds; i++) {
		if (passageOf(w) !== where) return;   // 已经离开战斗（落到结局）
		const links = linksOf(w);
		if (links.some((l) => stops.includes(l))) return;
		if (!links.length) return;
		// 备药优先：池子第一轮一定把「涂毒」发到手上
		const pref = links.find((l) => l === '把花汁抹在刃上');
		await c(pref ?? links[0]);
	}
	throw new Error(`战斗没能在 ${maxRounds} 轮内结束（等「${stops.join('/')}」@ ${passageOf(w)}）`);
}
const pcOf = (w) => w.SugarCube.State.variables.pc;

// ── 公共前段：酒馆 → 女巫小屋 → 林间小径 ──
async function toWitch(c) {
	await c('问一句女巫小屋怎么走');
}
async function toTower(c) {
	await c('往林子深处走');
}
// 拿钥匙：雾之魔物 → 守林人 → 门厅
async function getKey(c) {
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
}

// ── 路线 1：金路径 → 送星归位 ─────────────────────────────
async function truePath(w, c) {
	// 金路径的共同部分（走到「地下宴会厅（现在）」），供真结局路线与软限路线复用
	await toWitch(c);                     // 女巫小屋：护符
	await c('问塔里的门道');               // witch_hint
	await toTower(c);                     // 林间小径
	await c('坠入');                      // 翻到过去
	await c('继续往塔那边走');             // 塔门（过去）
	await c('雾里有个影子挡着路');         // 雾之魔物
	await c('举起武器');                   // 雾之魔物·战（d20=20 → 每一手大成功）
	await fightTo(c, w, ['往塔那边去']);   // B1：打两轮手上的牌
	await c('往塔那边去');                 // 守林人
	await c('为什么不自己去送');           // 守林人·送
	await c('回到守林人');
	await c('你守的到底是什么');           // 守林人·守
	await c('回到守林人');
	await c('把话说圆：游说（问花）'); // B2：花田的事得自己问（空手 → 游说 DC12，d20 恒 20 必成）
	await c('收下钥匙');                   // 门厅
	await c('把墙上那支哨子摘下来');       // M9：墙上那支哨子要自己摘（调查 DC10，d20 恒 20 必成）
	await c('出塔，回到塔外');             // 塔门（过去）——守林人已警告
	await c('塔基墙根那片花');             // 塔外花田
	await c('伸手去摘最靠里的那一朵');     // M9：采摘是动作 → 免判定拿花
	await c('回塔门');                     // 塔门
	await c('推门进去');                   // 门厅
	await c('先上二楼看看');               // 书房（过去：暗格是空的）
	await c('上三楼');                     // 温室（纯氛围）
	await c('上三楼拐角看看');             // 工坊
	await c('把它打完');                   // 龙鳞护臂
	await c('上四楼');                     // 天文台
	await c('在书架上找到一册');           // 观星者的书
	await c('上顶楼');                     // 顶楼
	await c('下楼，打开地下那道门');       // 地下宴会厅（过去）
	await c('在宴上找人说话');             // 宴会·过去
	await c('问那位一直在算星的人');       // 观星者
	await c('它从哪颗星来');
	await c('回到观星者');
	await c('那一夜会怎么样');
	await c('回到观星者');
	await c('拿出筹码：把风化了的书放回案上（求图）'); // B2：有书 → 免检筹码（不必掷骰）
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位从不离手一支哨子的老人'); // 当时的女巫（她本人）
	await c('在塔里找那根杖');
	await c('自己动手翻：桌布底下、酒箱后头都掀开看');   // M10：翻找是动作（d20 恒 20 必成）
	await c('把杖拿回去还她');             // M10：还杖是动作（还完就站在她面前）
	if (pcOf(w).world.family_favor !== true) throw new Error('还杖未置 family_favor');
	await c('开口：把她那支哨换过来（换哨）');   // B2：图与杖齐了 → willing，不掷骰
	await c('把那支哨收好');                       // → 当时的女巫·换（哨是她的）           // → 好哨（哨是她的）
	await c('回到当时的女巫');
	await c('回到宴上');
	await c('找厅角那位不肯多说的老人');   // 老巫女（只露面，不持关键信息）
	await c('回到宴上');
	await c('去把花喂给它');               // 喂花
	await c('回到宴上');
	await c('回到地下宴会厅');             // 地下宴会厅（过去）
	await c('翻转护身符：回到');           // 翻回现在
	await c('安静地退出去');               // 门厅
	await c('先上二楼看看');
	await c('伸手去摸烤炉后头的暗格');     // M9：暗格要自己摸（有门道＝免检 → 直接知道位置）
	await c('把暗格里的东西取出来');       // M10：知道位置之后，取物是另一步
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('把卷轴和星图交给他');         // 交付（现在）
	await c('下楼');                       // 地下宴会厅（现在）
}

async function routeTrue() {
	const { w, click: c } = await newGame(0.99, 0);
	await truePath(w, c);
	await c('叫醒它');                     // 唤醒
	await c('让守林人动手');               // 归位
	await c('看着它走完');                 // 结局 送星归位
	if (passageOf(w) !== '结局 送星归位') throw new Error(`金路径未达真结局（停在 ${passageOf(w)}）`);
	if (pcOf(w).world.flower_warned !== true) throw new Error('守林人未给出花田警告（flower_warned）');
	if (pcOf(w).world.flower_fed !== true) throw new Error('金路径未拿到并喂下月光花（flower_fed 未置位）');
	if (passageOf(w) !== '结局 送星归位') throw new Error(`金路径未达真结局（停在 ${passageOf(w)}）`);
	if (pcOf(w).world.flower_warned !== true) throw new Error('守林人未给出花田警告（flower_warned）');
	if (pcOf(w).world.flower_fed !== true) throw new Error('金路径未拿到并喂下月光花（flower_fed 未置位）');
	return { w, c, pc: pcOf(w) };
}

// ── 路线 28：乱翻的代价（A4）——翻太多，真结局就接不上了（canon §3.5 软限）──
async function routeTooManyFlips() {
	const { w, click: c } = await newGame(0.99, 0);
	await truePath(w, c);
	for (let i = 0; i < 3; i++) {
		await c('翻转护身符：坠入');
		await c('翻转护身符：回到');
	}
	if (pcOf(w).star.spent <= w.Game.Star.budget) throw new Error(`乱翻之后 spent=${pcOf(w).star.spent} 没超过预算`);
	if (w.SugarCube.State.variables.era !== 'present') throw new Error('乱翻之后没有停在现在');
	await c('叫醒它');                    // 唤醒
	if ([...w.document.querySelectorAll('#passages a.link-internal, #passages a.soc-opt')].some((x) => x.textContent.includes('让守林人动手'))) {
		throw new Error('翻太多之后还出现了「让守林人动手」——软限没生效');
	}
	await c('退出去');
	if (passageOf(w) !== '结局 再度沉睡') throw new Error(`软限降级没有落到「再度沉睡」（停在 ${passageOf(w)}）`);
	if (pcOf(w).ev.star_short !== true) throw new Error('降级结局没落 star_short（结局文案变体出不来）');
	if (!w.document.querySelector('#passages').textContent.includes('该有的都在')) throw new Error('降级结局没渲染变体文案');
	return { w };
}

// ── 路线 21：花田死亡（v16 补正 #6）——没见守林人、无情报 → 贸然采花 → 体质豁免失败 → 死亡 ──
async function routeFlowerDeath() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');           // 塔门（现在）——绕开守林人，所以没有情报
	w.eval('Math.random = () => 0.01'); // 花田体质豁免必败
	await c('塔基墙根那片花');           // 塔外花田
	await c('伸手去摘最靠里的那一朵');     // M9：动手才掷骰 → 贸然采摘
	if (passageOf(w) !== '结局 死亡') throw new Error(`花田未致死（停在 ${passageOf(w)}）`);
	if (pcOf(w).world.flower_sleep !== true) throw new Error('死亡结局未走花田变体（flower_sleep 未置位）');
	if (pcOf(w).inv['月光花']) throw new Error('昏迷却拿到了花');
	return { w };
}

// ── 路线 22：花田·哥布林情报（v16 补正 #6）——放生 → 哥布林警告 → 免判定拿花 ──
async function routeFlowerGoblin() {
	const { w, click: c } = await newGame(0.5, 0); // d20 恒 11：若情报路径误走判定，DC16 必败
	await c('推门出发，走进暮色');
	await c('打着火把，走进山脚的洞穴');
	await c('拿出筹码：把几枚金币放在石头上（让路）'); // B2：给钱＝免检
	await c('从它旁边过去');
	if (pcOf(w).world.goblin_spared !== true) throw new Error('买路未置 goblin_spared');
	await c('去那间亮着灯的小屋');       // 森林边缘 → 女巫小屋
	await c('谢过她，往林子深处走');     // → 林间小径
	await c('继续往塔那边走');           // → 塔门（现在）
	await c('塔基墙根那片花');           // → 花田：哥布林警告
	await c('伸手去摘最靠里的那一朵');     // → 免判定拿花
	if (pcOf(w).inv['月光花'] !== true) throw new Error('有情报仍未拿到月光花（情报路径误走判定？）');
	if (pcOf(w).world.flower_sleep) throw new Error('有情报却睡过去了');
	if (pcOf(w).world.flower_warned !== true) throw new Error('哥布林未记录情报');
	return { w };
}

// ── 路线 2：平凡之路 ──
async function routeQuit() {
	const { w, click: c } = await newGame(0.5, 0);
	await c('就此回头');
	if (passageOf(w) !== '结局 平凡之路') throw new Error(`未达平凡之路（${passageOf(w)}）`);
	return { w };
}

// ── 路线 3：银月之赐 ──
async function routeMoon() {
	const { w, click: c } = await newGame(0.5, 0);
	await toWitch(c);
	await toTower(c);
	await c('就此收手');
	if (passageOf(w) !== '结局 银月之赐') throw new Error(`未达银月之赐（${passageOf(w)}）`);
	return { w };
}

// ── 路线 4：半途 ──
async function routeHalf() {
	const { w, click: c } = await newGame(0.5, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('绕到塔后');
	await c('算了，回头');
	if (passageOf(w) !== '结局 半途') throw new Error(`未达半途（${passageOf(w)}）`);
	return { w };
}

// ── 路线 5：新任守林人 / 焚塔者 / 讨伐（三条短支）──
async function routeTop() {
	const { w, click: c } = await newGame(0.5, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('推门进去');
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('接他的班');
	if (passageOf(w) !== '结局 新任守林人') throw new Error(`未达新任守林人（${passageOf(w)}）`);
	return { w };
}
async function routeBurn() {
	const { w, click: c } = await newGame(0.5, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('推门进去');
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('折断法杖');
	if (passageOf(w) !== '结局 焚塔者') throw new Error(`未达焚塔者（${passageOf(w)}）`);
	return { w };
}
async function routeKeeperFight() {
	const { w, click: c } = await newGame(0.5, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('推门进去');
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('抢他的杖');
	if (passageOf(w) !== '结局 讨伐') throw new Error(`未达讨伐（${passageOf(w)}）`);
	return { w };
}

// ── 路线 6：守林人击杀 / 送入虚空 ──
async function routeKill() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('逼他动手');
	if (passageOf(w) !== '结局 守林人击杀') throw new Error(`未达守林人击杀（${passageOf(w)}）`);
	return { w };
}
async function routeVoid() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	// 好感链：空手见守林人不被纠正"封印"，说一句"它不会变成恶龙"（对话层，不落旗），好感不换放行
	await c('说一句：它不会变成恶龙');
	await c('回到守林人');
	await c('把话说圆：游说（求术）');   // B2：求他动术式（游说 DC13，d20 恒 20 必成）
	await c('那就让他念——用他家的封印术'); // → 守林人·封印
	if (pcOf(w).keeper.state !== 'seal') throw new Error('封印计划未落 state=seal');
	await c('明白了。下去');               // 门厅
	// 顺手把花带上：毒液抹刃 → 龙的攻击劣势（v17 补正 #3）
	await c('出塔，回到塔外');             // 塔门
	await c('塔基墙根那片花');             // 塔外花田
	await c('伸手去摘最靠里的那一朵');     // M9：动手才掷骰（d20 恒 20 → 体质豁免必成）
	if (pcOf(w).inv['月光花'] !== true) throw new Error('封印战路线没拿到月光花');
	await c('回塔门');
	await c('推门进去');                   // 门厅
	await c('用钥匙打开铁门');
	await c('叫醒它');                   // → 唤醒（无好哨）
	await c('和守林人并肩');             // → 封印·并肩
	if (pcOf(w).dragon.hp > w.Game.Dragon.hp) throw new Error('封印战未初始化龙的血量');
	// B1：把它打到 sealAt 以下（d20 恒 20 → 每一手都大成功；吐息必免）
	await fightTo(c, w, ['让他把最后一句念完'], 30);
	if (pcOf(w).dragon.hp > w.Game.Dragon.sealAt) throw new Error(`封印战没打下去（hp=${pcOf(w).dragon.hp}）`);
	if (pcOf(w).dragon.venom !== true) throw new Error('封印战未走涂毒支（战斗动作池·封印·涂毒 未覆盖）');
	if (pcOf(w).hp <= 0) throw new Error('封印战里倒下了（本路线骰面恒 20，不该受伤）');
	await c('让他把最后一句念完');
	if (passageOf(w) !== '结局 送入虚空') throw new Error(`未达送入虚空（${passageOf(w)}）`);
	return { w };
}

// ── 路线 7：劣化封印（书房日记 → 页边术式）──
async function routeSeal() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('推门进去');
	await c('先上二楼看看');
	await c('伸手去摸烤炉后头的暗格');     // M9：先摸到日记
	await c('把暗格里的东西取出来');       // M10：取物是另一步
	await c('把日记往下读');               // → 观察到"没人看过它睡得怎么样"
	await c('照她抄在页边的封印术');
	if (passageOf(w) !== '结局 劣化封印') throw new Error(`未达劣化封印（${passageOf(w)}）`);
	return { w };
}

// ── 路线 8：龙·战 三支（星落 / 坠星之死 / 死亡）──
async function routeDragonBattle(withBook) {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	if (withBook) {
		await c('先上二楼看看');
		await c('上三楼');
		await c('上三楼拐角看看');
		await c('上四楼');
		await c('在书架上找到一册');
		await c('上顶楼');
		await c('下楼，打开地下那道门');
	} else {
		await c('用钥匙打开铁门');
	}
	await c('攻击它');
	await fightTo(c, w, ['爬起来，再冲一次']);   // B1：先打两轮手上的牌
	await c('爬起来，再冲一次');
	await c('你杀了它');
	if (passageOf(w) !== (withBook ? '结局 星落' : '结局 坠星之死')) throw new Error(`未达 ${withBook ? '星落' : '坠星之死'}（${passageOf(w)}）`);
	return { w };
}
async function routeDragonDeath() {
	const { w, click: c } = await newGame(0.01, 0); // d20=1 必败
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('用钥匙打开铁门');
	await c('攻击它');
	// B1：d20=1 → 每一手都大失败；可能还没打完两轮就被打成 结局 死亡
	await fightTo(c, w, ['爬起来，再冲一次']);
	if (linksOf(w).includes('爬起来，再冲一次')) await c('爬起来，再冲一次'); // d20=1 → 龙·再冲 必败
	if (passageOf(w) !== '结局 死亡') throw new Error(`未达死亡（${passageOf(w)}）`);
	return { w };
}

// ── 路线 9：唤醒两支（自愿的长眠 / 再度沉睡）──
async function routeSleepForever() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('下楼，打开地下那道门');
	await c('在宴上找人说话');
	await c('找厅角那位不肯多说的老人');   // 老巫女（晚年穿越的那位）
	await c('回到宴上');
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');
	await c('安静地退出去');
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('下楼');
	await c('叫醒它');
	if (passageOf(w) !== '唤醒') throw new Error(`未到唤醒（${passageOf(w)}）`);
	// 无星图 → 无换哨 → 无哨 → 退出去 = 再度沉睡
	await c('退出去');
	if (passageOf(w) !== '结局 再度沉睡') throw new Error(`未达再度沉睡（${passageOf(w)}）`);
	return { w };
}

// ── 路线 10：洞穴动武（自然 20 成 / 自然 1 败）──
async function routeCave() {
	const { w, click: c } = await newGame(0.99, 0);
	await c('推门出发，走进暮色');
	await c('打着火把，走进山脚的洞穴');
	await c('拔家伙');
	if (pcOf(w).world.goblin_spared) throw new Error('动武分支不应置 goblin_spared');
	if (passageOf(w) !== '森林边缘') throw new Error(`动武后应回森林边缘（实际 ${passageOf(w)}）`);
	return { w };
}

// ── 路线 12：设定集四页（任意结局 → 打开设定集）──
async function routeCodex() {
	const { w, click: c } = await newGame(0.5, 0);
	await c('就此回头');
	await c('打开设定集');
	await c('世界三律');
	await c('回设定集');
	await c('守塔的人家');
	await c('回设定集');
	await c('塔');
	await c('回设定集');
	await c('道具');
	await c('回设定集');
	await c('术语');
	await c('回设定集');
	await c('结局');
	if (passageOf(w) !== '设定集·结局') throw new Error(`未达设定集·结局（${passageOf(w)}）`);
	await c('回设定集');
	await c('图鉴');
	if (passageOf(w) !== '设定集·图鉴') throw new Error(`未达设定集·图鉴（${passageOf(w)}）`);
	await c('回设定集');
	// M10：计算过程开关（就地重画，不换段落）
	const before = w.SgUI.showDetail();
	await c(before ? '关掉：只留骰面与总修正' : '打开：显示属性、熟练与取骰过程');
	if (w.SgUI.showDetail() === before) throw new Error('计算过程开关没有翻转');
	if (passageOf(w) !== '设定集') throw new Error('开关不该离开设定集页（应就地重画）');
	await c(before ? '打开：显示属性、熟练与取骰过程' : '关掉：只留骰面与总修正');
	if (w.SgUI.showDetail() !== before) throw new Error('计算过程开关没有翻回去');
	return { w };
}

// ── 路线 12b：图鉴（线索齐才解锁 ＋ 终局后空页给指向）──
async function routeBestiary() {
	// 直接跑金路径（每个路线都是独立 jsdom → localStorage 干净）
	const { w, c } = await routeTrue();
	const store = w.SgCodex.read();
	if (!store.finals.includes('送星归位')) throw new Error('终局未登记进图鉴账本（finals 为空）');
	// 坏哨三线索齐（拿到 / 带着它在雾里交手 / 见过另一支）→ 该页解锁
	if (!w.SgCodex.unlocked('坏哨')) {
		const got = JSON.stringify(store.clues['坏哨'] ?? {});
		throw new Error(`坏哨线索齐了却没解锁（${got}）`);
	}
	// 月光花只差"毒液抹刃"（那条在封印战线）→ 必须仍是锁定页
	if (w.SgCodex.unlocked('月光花')) throw new Error('月光花线索未齐却解锁了（解锁条件应是"全部线索"）');
	await c('打开设定集');
	await c('图鉴');
	const txt = w.document.querySelector('#passages').textContent;
	if (!txt.includes('坏哨')) throw new Error('图鉴未列出已解锁的坏哨');
	if (!txt.includes('守林人家削的引路哨')) throw new Error('图鉴未列出已解锁页的线索');
	const names = Object.keys(w.Game.Codex.items);
	const unlocked = names.filter((n) => w.SgCodex.unlocked(n));
	if (unlocked.includes('月光花')) throw new Error('月光花只差一条线索，却也解锁了（解锁条件应是"全部线索"）');
	const locked = names.filter((n) => !unlocked.includes(n));
	if (!locked.length) throw new Error('金路径不该把所有页都解锁（毒液那条只在封印战线）');
	if ((txt.match(/？？？/g) ?? []).length !== locked.length) {
		throw new Error(`图鉴锁定页数量与账本不符（渲染 ${(txt.match(/？？？/g) ?? []).length} / 账本 ${locked.length}）`);
	}
	if (!txt.includes('塔基外侧墙根那片银白')) throw new Error('走到过终局后，锁定页未给出指向');
	if (!txt.includes(`已解锁 ${unlocked.length} / ${names.length}`)) throw new Error('图鉴计数行不对');
	return { w };
}

// ── 路线 13：龙·巢边（现在年代，翻检龙身下的收藏）──
async function routeLair() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('用钥匙打开铁门');
	await c('绕着它走一圈');
	await c('识货，捡几件值钱的');
	if (pcOf(w).gold < 10) throw new Error(`识货未入账（gold=${pcOf(w).gold}）`);
	await c('退开');
	return { w };
}

// ── 路线 14：老妇人（过去宴上的搭话）──
async function routeOldWoman() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('用钥匙打开铁门');
	await c('在宴上找人说话');
	await c('找刚才拦住你的老妇人');
	await c('回到宴上');
	return { w };
}

// ── 路线 15：自愿的长眠（有哨无卷轴）──
async function routeSleepVoluntary() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('用钥匙打开铁门');
	await c('在宴上找人说话');
	await c('问那位一直在算星的人');
	await c('引一段先例：历史（求图）');   // B2：无书 → 历史检定（d20=20 必成）
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位从不离手一支哨子的老人'); // 当时的女巫（她本人）
	await c('在塔里找那根杖');
	await c('自己动手翻：桌布底下、酒箱后头都掀开看');   // M10：翻找是动作（d20 恒 20 必成）
	await c('把杖拿回去还她');                          // M10：还杖是动作
	await c('开口：把她那支哨换过来（换哨）');   // B2：图与杖齐了 → willing，不掷骰
	await c('把那支哨收好');                       // → 当时的女巫·换（哨是她的）
	await c('回到当时的女巫');
	await c('回到宴上');
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');
	await c('叫醒它');
	await c('看着它再睡下去');
	if (passageOf(w) !== '结局 自愿的长眠') throw new Error(`未达自愿的长眠（${passageOf(w)}）`);
	return { w };
}

// ── 路线 23：换哨双门槛（无好感不换 / 无星图不换）──
async function routeExchangeGate() {
	const { w, click: c } = await newGame(0.99, 0);
	const links = () => [...w.document.querySelectorAll('#passages a.link-internal, #passages a.soc-opt')].map((x) => x.textContent);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('用钥匙打开铁门');
	await c('在宴上找人说话');
	await c('找那位从不离手一支哨子的老人');
	// ① 无星图 → 无换哨选项
	if (links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('无星图却出现换哨选项');
	// ② 还杖（好感）→ 仍无星图 → 仍无换哨
	await c('在塔里找那根杖');
	await c('自己动手翻：桌布底下、酒箱后头都掀开看');   // M10：翻找是动作（d20 恒 20 必成）
	await c('把杖拿回去还她');                          // M10：还杖是动作
	if (pcOf(w).world.family_favor !== true) throw new Error('还杖未置 family_favor');
	if (links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('有好感但无星图，仍不该出现换哨选项');
	if (pcOf(w).inv['好哨']) throw new Error('门槛未过却拿到好哨');
	// ③ 取星图 → 换哨选项出现
	await c('回到宴上');
	await c('问那位一直在算星的人');
	await c('引一段先例：历史（求图）');
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位从不离手一支哨子的老人');
	if (!links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('好感 + 星图齐备后仍无换哨选项');
	return { w };
}

// ── 路线 16：时代分叉（宴会·过去|现在 / 交付|过去）──
async function routeEraBranches() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('用钥匙打开铁门');
	await c('在宴上找人说话');       // 宴会·过去（过去）
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');     // 地下宴会厅（现在）
	await c('在宴上找人说话');       // 宴会·过去（现在）← 覆盖
	await c('翻转护身符：坠入');     // 宴会·过去（过去）
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');     // 地下宴会厅（现在）
	await c('安静地退出去');
	await c('翻转护身符：坠入');     // 门厅（过去）
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');               // 顶楼（过去）
	await c('把卷轴和星图交给他');   // 交付（过去）← 覆盖
	if (passageOf(w) !== '交付') throw new Error(`未达交付（${passageOf(w)}）`);
	return { w };
}

// ── 路线 25：打听碰壁 → 越问越难 → 换手段/换筹码（B2：代价因手段而异）──
async function routeTavernAsk() {
	const { w, click: c } = await newGame(0.01, 0);   // d20 恒 1：所有检定必败
	// 酒馆：一桌一问（问过就消失）
	await c('靠窗那桌——他们在讲塔上那盏灯');
	if (pcOf(w).ev.tav_light !== true) throw new Error('问过的那桌没记账');
	// ① 游说失败 → 「这一手」的 DC 递增（2024：不许原地重掷）
	const dcOf = (site) => w.eval(`Game.Social.dcOf(Game.Social.ask('老板娘·进塔'), '${site}', SugarCube.State.variables.pc)`);
	const before = Object.fromEntries(['酒馆·打听', '老板娘·吓'].map((s) => [s, dcOf(s)]));
	await c('把话说圆：游说（问路）');              // 游说 → 必败
	const last = pcOf(w).ev.soc_last?.['老板娘·进塔'];
	if (!last || last.kind !== 'bad') throw new Error('游说失败却没记成失败档');
	if (pcOf(w).ev.tav_tips) throw new Error('游说失败却拿到了忠告');
	if (dcOf('酒馆·打听') !== before['酒馆·打听'] + 5) throw new Error(`游说失败后 DC 没涨（${before['酒馆·打听']} → ${dcOf('酒馆·打听')}）`);
	if (dcOf('老板娘·吓') !== before['老板娘·吓']) throw new Error('重试代价只该压在这一手上，不该牵连别的手段');
	// ② 换手段＝换属性：恐吓（同一句诉求走魅力另一条路），代价是「得手也记仇」
	await c('亮一亮手里的家伙：恐吓（问路）');
	if (pcOf(w).soc.att['老板娘'] !== -1) throw new Error(`恐吓失败没损态度（att=${pcOf(w).soc.att['老板娘']}）`);
	if (dcOf('老板娘·吓') !== before['老板娘·吓'] + 5) throw new Error('态度降一级＝整条轴都变贵（敌意 +5 是全局的，与重试代价不同）');
	// ③ 筹码：把对方想要的摆出来 → 免检得手（不给骰子机会）
	const gold0 = pcOf(w).gold;
	await c('拿出筹码：请她喝一轮（问路）');
	if (pcOf(w).ev.tav_tips !== true) throw new Error('请了酒还是没听到忠告');
	if (pcOf(w).gold !== gold0 - 3) throw new Error(`请酒没扣钱（${gold0} → ${pcOf(w).gold}）`);
	if (pcOf(w).soc.att['老板娘'] !== 0) throw new Error('筹码该把态度拉回冷淡以上（shift +1）');
	if (!w.document.querySelector('#passages').textContent.includes('别在雾里睡觉')) throw new Error('忠告没渲染出来');
	await c('推门出发，走进暮色');
	await c('在雾里站住，听一听');                  // 察觉 DC10 → 必败 → 什么都没听清
	if (pcOf(w).ev.forest_heard !== false) throw new Error('察觉失败却记成听清了');
	await c('去那间亮着灯的小屋');
	await c('问：雾到底是什么');
	if (pcOf(w).ev.wq_fog !== true) throw new Error('女巫小屋的提问没记账');
	await c('谢过她，往林子深处走');
	await c('继续往塔那边走');
	// 不采花：花田必须给"先别动它"的退路（M9：采摘是动作）
	await c('塔基墙根那片花');
	await c('先别动它，退回塔门');
	if (passageOf(w) !== '塔门') throw new Error(`花田退路没回塔门（${passageOf(w)}）`);
	if (pcOf(w).inv['月光花']) throw new Error('没动手却拿到了花');
	return { w };
}

// ── 路线 26：情报自己问、暗格自己摸（M9）——含"女巫门道"免检 ──
async function routeAskForIt() {
	const { w, click: c } = await newGame(0.99, 0);
	await c('把话说圆：游说（问路）');            // B2：游说 DC12 → 必成 → 忠告 + 雾气来向
	if (pcOf(w).ev.tav_tips !== true || pcOf(w).ev.tav_fog !== true) throw new Error('游说成功没拿到忠告/雾气来向');
	if (!w.document.querySelector('#passages').textContent.includes('雾是从塔那边来的')) throw new Error('雾气来向没渲染');
	await c('问一句女巫小屋怎么走');
	for (const q of ['问：画上那场宴是怎么回事', '问：三百年前那一夜，你们家没送成的是什么', '问：这护符到底怎么用', '问：塔底下锁着的到底是什么', '问：你就这么看着，什么也不做？', '问：我一个人上去，够吗']) {
		await c(q);
	}
	const wq = pcOf(w).ev;
	if (!(wq.wq_painting && wq.wq_night && wq.wq_talisman && wq.wq_under && wq.wq_past && wq.wq_alone)) throw new Error('女巫小屋提问未全部记账');
	const wqText = w.document.querySelector('#passages').textContent;
	if (!wqText.includes('行头是一代一代传下来的')) throw new Error('§3.9 传说"行头"锚句未渲染');
	if (!wqText.includes('改不了的不是历史')) throw new Error('observation_lock 锚句（女巫小屋侧）未渲染');
	await c('花 8 金币：问塔里的门道');              // witch_hint
	await c('谢过她，往林子深处走');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('先上二楼看看');
	w.eval('Math.random = () => 0.01');             // 以后所有检定必败
	await c('伸手去摸烤炉后头的暗格');               // 有门道 → 免检（不再掷骰），直接知道暗格在哪
	if (pcOf(w).ev.study_found !== true) throw new Error('女巫门道没免掉书房的检视（该直接知道暗格位置）');
	await c('把暗格里的东西取出来');                 // M10：取物是另一步
	if (pcOf(w).inv['日记'] !== true || pcOf(w).inv['传送术卷轴'] !== true) throw new Error('暗格里的东西没拿到');
	// 没有门道就得掷骰：这里的失败分支留在下一段
	await c('把日记往下读');
	if (pcOf(w).ev.observation_lock !== true) throw new Error('"往下读"没记账');
	if (!w.document.querySelector('#passages').textContent.includes('没人看过它睡得怎么样')) throw new Error('observation_lock 锚句（书房侧）未渲染');
	return { w };
}

// ── 路线 27：非酋不读档（M10）——把"主路属性"打瘸，靠另一条路照样拿全 ──
//    智力 8（-1）· 感知 16（+3）· 骰面恒 11：调查类必败，感知类必成。
async function routeNoSaveScum() {
	const { w, click: c } = await newGame(0.5, 0);      // d20 恒 11
	const pc = pcOf(w);
	pc.abilities = { str: 10, dex: 10, con: 14, int: 8, wis: 16, cha: 8 };
	pc.ev = {};
	await c('靠窗那桌——他们在讲塔上那盏灯');     // 酒馆问一桌
	await c('推门出发，走进暮色');
	await c('去那间亮着灯的小屋');
	await c('谢过她，往林子深处走');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	// 守林人：游说（魅力 8 → 必败）换"察觉"这条路
	await c('先看清他身上那点不对劲：察觉（问花）');
	if (pcOf(w).world.flower_warned !== true) throw new Error('察觉路没换来花田警告');
	await c('收下钥匙');
	// 门厅：先看清钉子（感知 → 必成），不必赌调查
	await c('先看清钉子是怎么卡的');
	if (pcOf(w).ev.hall_seen !== true) throw new Error('察觉路没换来"钉子看清了"');
	await c('摘哨子（钉子怎么卡的，你已经看清了）');
	if (pcOf(w).inv['坏哨'] !== true) throw new Error('看清钉子之后没拿到哨子');
	// 花田：走"下风处"（生存 → 必成）
	await c('出塔，回到塔外');
	await c('塔基墙根那片花');
	await c('绕到下风处，连土一起端起来');
	if (pcOf(w).inv['月光花'] !== true) throw new Error('生存路没拿到月光花');
	await c('回塔门');
	await c('推门进去');
	await c('先上二楼看看');
	// 书房：调查（智力 8 → 10 < 12 必败）→ 改敲墙（感知 → 必成）
	await c('伸手去摸烤炉后头的暗格');
	if (pcOf(w).ev.study_found) throw new Error('智力 8 的调查不该成功（骰面恒 11 → 10 < 12）');
	await c('先敲一敲炉膛后头的墙');
	if (pcOf(w).ev.study_found !== true) throw new Error('察觉路没换来暗格位置');
	await c('把暗格里的东西取出来');
	if (pcOf(w).inv['日记'] !== true) throw new Error('换路之后没拿到日记');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('把护臂翻过来，看内侧的记号');        // 察觉 → 必成
	if (pcOf(w).ev.forge_seen !== true) throw new Error('察觉路没换来护臂来历');
	await c('上四楼');
	await c('盯住缺口里那几粒没连上的点');        // 察觉 → 必成（本条路线故意不拿那册书）
	if (pcOf(w).ev.star_ledger !== true) throw new Error('察觉路没换来那笔账');
	await c('上顶楼');
	await c('下楼，打开地下那道门');
	await c('翻转护身符：坠入');                  // 先翻到过去（位置决定年代）
	await c('在宴上找人说话');
	await c('问那位一直在算星的人');
	await c('先看他手里攥着什么：洞悉（求图）');    // B2：洞悉 → 必成
	if (pcOf(w).ev.seer_gave !== true) throw new Error('洞悉路没换来星图');
	await c('把那张抄好的图收下');
	if (pcOf(w).inv['完整星图'] !== true) throw new Error('星图没拿到');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位从不离手一支哨子的老人');
	await c('在塔里找那根杖');
	await c('站在一边看：厅里谁一直在瞟那张空架子');  // 洞悉 → 必成
	if (pcOf(w).ev.staff_found !== true) throw new Error('洞悉路没找到杖');
	await c('把杖拿回去还她');
	if (pcOf(w).world.family_favor !== true) throw new Error('还杖没落 family_favor');
	await c('先看他手里攥着什么：洞悉（看哨）');   // B2：看哨色也要自己开口                   // 洞悉 → 必成
	if (pcOf(w).ev.witch_grip !== true) throw new Error('洞悉路没看清哨子');
	await c('开口：把她那支哨换过来（换哨）');   // B2：图与杖齐了 → willing，不掷骰
	await c('把那支哨收好');                       // → 当时的女巫·换（哨是她的）
	if (pcOf(w).inv['好哨'] !== true) throw new Error('好哨没换到');
	return { w };
}

const routes = [
	['金路径 送星归位', routeTrue],
	['平凡之路', routeQuit],
	['银月之赐', routeMoon],
	['半途', routeHalf],
	['新任守林人', routeTop],
	['焚塔者', routeBurn],
	['讨伐', routeKeeperFight],
	['守林人击杀', routeKill],
	['送入虚空', routeVoid],
	['劣化封印', routeSeal],
	['星落', () => routeDragonBattle(true)],
	['坠星之死', () => routeDragonBattle(false)],
	['死亡', routeDragonDeath],
	['再度沉睡', routeSleepForever],
	['洞穴动武', routeCave],
	['设定集四页', routeCodex],
	['图鉴·永久解锁', routeBestiary],
	['龙·巢边', routeLair],
	['老妇人', routeOldWoman],
	['自愿的长眠', routeSleepVoluntary],
	['时代分叉', routeEraBranches],
	['花田死亡', routeFlowerDeath],
	['花田·哥布林情报', routeFlowerGoblin],
	['换哨双门槛', routeExchangeGate],
	['打听·碰壁与请酒', routeTavernAsk],
	['情报自己问（免检暗格）', routeAskForIt],
	['非酋不读档（换属性路）', routeNoSaveScum],
	['乱翻的代价（星力软限）', routeTooManyFlips],
];

const results = await Promise.all(routes.map(async ([name, fn]) => {
	try {
		await fn();
		console.log(`✓ ${name}`);
		return null;
	} catch (e) {
		console.error(`✗ ${name}：${e.message}`);
		return name;
	}
}));
failures = results.filter(Boolean).length;

mkdirSync('build', { recursive: true });
writeFileSync('build/coverage-scenarios.json', JSON.stringify({ cells: [...visited].sort() }, null, 1));
console.log(`\n路线 ${routes.length} 条 · 交互覆盖 ${visited.size} 格`);
if (failures) { console.error(`✗ ${failures} 条路线失败`); process.exit(1); }
console.log('✔ 分支场景测试通过');
process.exit(0);
