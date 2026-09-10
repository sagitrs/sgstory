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
		const a = [...w.document.querySelectorAll('#passages a.link-internal')]
			.find((x) => x.textContent === label || x.textContent.includes(label));
		if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}（可选：${[...w.document.querySelectorAll('#passages a.link-internal')].map((x) => x.textContent).join(' / ')}）`);
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

const passageOf = (w) => w.SugarCube.State.passage;
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
async function routeTrue() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);                     // 女巫小屋：护符 + 请柬
	await c('问塔里的门道');               // witch_hint
	await toTower(c);                     // 林间小径
	await c('坠入');                      // 翻到过去
	await c('继续往塔那边走');             // 塔门（过去）
	await c('雾里有个影子挡着路');         // 雾之魔物
	await c('举起武器');                   // 雾之魔物·战（d20=20 全成）
	await c('爬起来，往塔那边去');         // 守林人
	await c('为什么不自己去送');           // 守林人·送
	await c('回到守林人');
	await c('你守的到底是什么');           // 守林人·守
	await c('回到守林人');
	await c('收下钥匙');                   // 门厅
	await c('出塔，回到塔外');             // 塔门（过去）——守林人已警告
	await c('塔基墙根那片花');             // 塔外花田 → 免判定拿花
	await c('回塔门');                     // 塔门
	await c('推门进去');                   // 门厅
	await c('先上二楼看看');               // 书房 → 日记
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
	await c('求他把完整星图给你');         // 观星者·图（有书 → 直接给）
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位从不离手一支哨子的老人'); // 当时的女巫（她本人）
	await c('把她那支哨换过来');           // → 好哨（哨是她的）
	await c('回到当时的女巫');
	await c('回到宴上');
	await c('找厅角那位不肯多说的老人');   // 老巫女（晚年穿越回来的那位）
	await c('把三百年后的办法告诉她');     // 告知与告别 → 卷轴
	await c('回到宴上');
	await c('去把花喂给它');               // 喂花
	await c('回到宴上');
	await c('回到地下宴会厅');             // 地下宴会厅（过去）
	await c('翻转护身符：回到');           // 翻回现在
	await c('安静地退出去');               // 门厅
	await c('先上二楼看看');
	await c('上三楼');
	await c('上三楼拐角看看');
	await c('上四楼');
	await c('上顶楼');
	await c('把卷轴和星图交给他');         // 交付（现在）
	await c('下楼');                       // 地下宴会厅（现在）
	await c('叫醒它');                     // 唤醒
	await c('让守林人动手');               // 归位
	await c('看着它走完');                 // 结局 送星归位
	if (passageOf(w) !== '结局 送星归位') throw new Error(`金路径未达真结局（停在 ${passageOf(w)}）`);
	if (pcOf(w).world.flower_warned !== true) throw new Error('守林人未给出花田警告（flower_warned）');
	if (pcOf(w).world.flower_fed !== true) throw new Error('金路径未拿到并喂下月光花（flower_fed 未置位）');
	return { w, c, pc: pcOf(w) };
}

// ── 路线 21：花田死亡（v16 补正 #6）——没见守林人、无情报 → 贸然采花 → 体质豁免失败 → 死亡 ──
async function routeFlowerDeath() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');           // 塔门（现在）——绕开守林人，所以没有情报
	w.eval('Math.random = () => 0.01'); // 花田体质豁免必败
	await c('塔基墙根那片花');           // 塔外花田 → 贸然采摘
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
	await c('买条路过去');               // goblin_spared
	if (pcOf(w).world.goblin_spared !== true) throw new Error('买路未置 goblin_spared');
	await c('去那间亮着灯的小屋');       // 森林边缘 → 女巫小屋
	await c('谢过她，往林子深处走');     // → 林间小径
	await c('继续往塔那边走');           // → 塔门（现在）
	await c('塔基墙根那片花');           // → 花田：哥布林警告 → 免判定
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
	await c('从碎掉的望远镜里挑');         // 碎镜片（现在年代）
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
	await c('那就用他家的封印术');
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
	await c('爬起来，再冲一次'); // d20=1 → 龙·再冲 必败 → 死亡
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
	await c('三家');
	await c('回设定集');
	await c('塔');
	await c('回设定集');
	await c('道具');
	await c('回设定集');
	await c('术语');
	await c('回设定集');
	await c('结局');
	if (passageOf(w) !== '设定集·结局') throw new Error(`未达设定集·结局（${passageOf(w)}）`);
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
	await c('从它身下抽出那半页碎纸');
	await c('识货，捡几件值钱的');
	if (!pcOf(w).inv['星名页']) throw new Error('龙·巢边未取得星名页');
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
	await c('求他把完整星图给你');   // 无书 → 说服检定（d20=20 必成）
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位从不离手一支哨子的老人'); // 当时的女巫（她本人）
	await c('把她那支哨换过来');
	await c('回到当时的女巫');
	await c('回到宴上');
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');
	await c('叫醒它');
	await c('看着它再睡下去');
	if (passageOf(w) !== '结局 自愿的长眠') throw new Error(`未达自愿的长眠（${passageOf(w)}）`);
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
	['龙·巢边', routeLair],
	['老妇人', routeOldWoman],
	['自愿的长眠', routeSleepVoluntary],
	['时代分叉', routeEraBranches],
	['花田死亡', routeFlowerDeath],
	['花田·哥布林情报', routeFlowerGoblin],
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
