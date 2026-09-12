// 分支场景测试（M1a-2 换骨后）：金路径 + 分支矩阵（每条结局一条路线）
// Math.random 劫持：0.99 → d20 恒 20（自然 20 必成）；0.01 → 恒 1（自然 1 必败）；0.5 → 恒 11
// 交互覆盖落盘 build/coverage-scenarios.json（coverage.mjs 门禁用）
//
// JSDOM 启动 / 就绪轮询 / uncaught 监听 / 退出清理全部走 test/boot.mjs——一处修，全脚本受益。
import { writeFileSync, mkdirSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { boot, CLICKABLE, CLICKABLE_SEL } from './boot.mjs';

let failures = 0;
const visited = new Set();
const clickedLinks = new Map(); // `${段落}|${时代}` → 真被点过的链接标签集（#168 机检⑩）

// ── #295（E4 节奏 / C4 相异度）：每条路线的可机读轨迹 ───────────────────
// 路线是并行跑的，所以「现在跑的是哪条路线」不能用全局变量——用 AsyncLocalStorage
// 跟着异步上下文走，才不会串台。轨迹落 build/route-traces.json，由
// scripts/report-rhythm.mjs 消费（报告型探索票，不并进 audit.mjs）。
const routeCtx = new AsyncLocalStorage();
const syntheticRoutes = new Set();   // 注册表里标了 synthetic 的路线名（见 routes 表第三列）
const traces = new Map();        // 路线名 → { passages, clicks, milestones, ending }
const passageTexts = new Map();  // 段落 → 归一化屏文（去重存一份，供 C4 n-gram 用）
const MILESTONE_PASSAGES = {     // 首个不可逆点（E4）：花田＝致死位点；龙战＝决战
	花田: ['塔外花田'],
	龙战: ['龙·战', '封印·并肩'],
};
// 段落里的可见文本（去掉标签与多余空白）——n-gram 只吃正文，不吃 markup
const screenText = (w) => (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function newGame(randomStub, preset = 0) {
	// random 传函数：每次调用都取同一个定值，d20 于是变成确定骰
	const { w, uncaught, sleep, settle } = await boot({ random: () => randomStub });
	// 同一条路线可能 boot 多次（跨周目/读档用例）——轨迹按路线名累加，不覆盖
	const routeName = routeCtx.getStore() ?? '(未命名路线)';
	const trace = traces.get(routeName) ?? { passages: [], clicks: 0, milestones: {}, ending: null };
	traces.set(routeName, trace);
	// #338/#357：**合成用例标记**（注册表第三列 `{ synthetic: true }`）——
	// 「夹具注入 + 少量点击却走完到结局」的构造性用例不该计入 C4/E4 的完整路线样本，
	// 否则会抬高家族数、压低最少交互数（实测两次：E4 最早交互数 3<5、C4 家族 18→19 打掉 R1b 自证）。
	if (routeCtx.getStore() && syntheticRoutes.has(routeCtx.getStore())) trace.synthetic = true;
	const mark = () => {
		const p = w.SugarCube.State.passage;
		visited.add(`${p}|${w.SugarCube.State.variables?.era ?? '-'}`);
		// #295 轨迹：段落序列（相邻重复折叠，回退重访仍计一次）+ 屏文去重入库
		if (trace.passages[trace.passages.length - 1] !== p) trace.passages.push(p);
		if (!passageTexts.has(p)) passageTexts.set(p, screenText(w));
		if (p.startsWith('结局')) trace.ending = p;
		// 首个不可逆点：到达时记下「已点了几下」与「当时手里有多少情报旗标」
		const ev = w.SugarCube.State.variables?.pc?.ev ?? {};
		for (const [key, list] of Object.entries(MILESTONE_PASSAGES)) {
			if (!trace.milestones[key] && list.includes(p)) {
				trace.milestones[key] = { atClick: trace.clicks, passage: p, evCount: Object.keys(ev).length, flags: Object.keys(ev).sort() };
			}
		}
	};
	const findLink = (label) => {
		// 只看"当前这一段"（data-passage 与 State.passage 相符的那个 .passage）：
		// State 已经变了、旧段落元素还没被换下来时，全局查找会点到上一段的链接。
		const cur = [...w.document.querySelectorAll('#passages .passage')]
			.find((e) => e.dataset.passage === w.SugarCube.State.passage);
		const pool = cur ? [cur] : [...w.document.querySelectorAll('#passages')];
		const links = pool.flatMap((el) => [...el.querySelectorAll(CLICKABLE_SEL)]);
		// 精确优先：避免「塔」被「守塔的人家」这类包含关系抢先命中（子串兜底保留，供动态文案用）
		return links.find((x) => x.textContent === label) ?? links.find((x) => x.textContent.includes(label));
	};
	const click = async (label) => {
		await settle();          // 等上一翻画完再点——否则 SugarCube 会丢掉这次点击
		let a = findLink(label);
		// 并行跑三十来条路线时，段落元素偶发晚一拍才换（State 已经变了、DOM 还没换完）——
		// 这一条兜底等一下，省得把"机器忙"报成"游戏坏了"
		for (let i = 0; i < 20 && !a; i++) { await sleep(100); await settle(); a = findLink(label); }
		if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}（可选：${[...w.document.querySelectorAll(CLICKABLE)].map((x) => x.textContent).join(' / ')}）`);
		mark();
		// 链接级覆盖（#168 机检⑩）：记下"这一段|这个时代里真被点过的那条链接"——
		// 只记段落格是看不见链接盲区的（P1-1 的断链、P1-29 的抄书人跑腿都从没被点过）。
		{
			const key = `${w.SugarCube.State.passage}|${w.SugarCube.State.variables.era}`;
			if (!clickedLinks.has(key)) clickedLinks.set(key, new Set());
			clickedLinks.get(key).add(a.textContent.replace(/\s+/g, ' ').trim());
		}
		const before = uncaught.length;
		trace.clicks += 1;   // #295：玩家动作计数（一次点击＝一次交互）
		a.click();
		await settle();
		await sleep(120);
		mark();
		if (uncaught.length > before) throw new Error(`点击「${label}」后脚本异常：${uncaught[before].slice(0, 160)}`);
	};
	// 车卡 + 出发
	await click('踏上旅途');
	if (preset) {
		// 选第 N 套预设（点第 N 张卡里的「快速成型」；不带 preset 则默认第一张）
		const cards = [...w.document.querySelectorAll('.choice-card')];
		cards[preset].querySelector('a').click();
		await sleep(300);
	} else {
		await click('快速成型');
	}
	await click('出发，前往歪脖子鸭酒馆');
	return { w, click, uncaught };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const linksOf = (w) => [...w.document.querySelectorAll(CLICKABLE)].map((x) => x.textContent);
// 当前段落的链接（只认 data-passage 与 State.passage 相符的那个 .passage）。
// 并行跑三十来条路线时，State 已经变了、段落元素偶发晚一拍——先等一下再取，
// 免得把"机器忙"读成"这一段没有出口"。
async function waitLinks(w, timeoutMs = 2000) {
	const t0 = Date.now();
	for (;;) {
		const cur = [...w.document.querySelectorAll('#passages .passage')]
			.find((e) => e.dataset.passage === w.SugarCube.State.passage);
		const links = cur ? [...cur.querySelectorAll(CLICKABLE_SEL)] : [];
		if (links.length || Date.now() - t0 > timeoutMs) return links;
		await sleep(50);
	}
}
const passageOf = (w) => w.SugarCube.State.passage;
// 当前屏上的可读文本（给"不许提前泄底"这类断言用）
const passageText = (w) => w.document.querySelector('#passages').textContent.replace(/\s+/g, ' ');
// B1：战斗每一轮的面板是随机 3 选 1——测试不去猜哪三张，只管"有牌就打"
// 直到出现目标链接（战斗的出口）或段落里已经没有链接（已经落到结局）
async function fightTo(c, w, stops, maxRounds = 12) {
	const where = passageOf(w);
	for (let i = 0; i < maxRounds; i++) {
		if (passageOf(w) !== where) return;   // 已经离开战斗（落到结局）
		const els = await waitLinks(w);
		if (passageOf(w) !== where) return;   // 等 DOM 的这段工夫里可能已经落到结局了
		if (!els.length) return;
		const links = els.map((x) => x.textContent);
		if (links.some((l) => stops.includes(l))) return;
		// 备药优先：池子第一轮一定把「涂毒」发到手上
		const pref = els.find((x) => x.textContent === '把花汁抹在刃上');
		await c((pref ?? els[0]).textContent);
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

// ── 路线 35：唤醒不洗状态（#178）——同一头龙：重进不回血、不败次清零 ──
async function routeNoDragonWash() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('收下钥匙');
	await c('下楼赴宴');                    // 地下宴会厅（过去）
	await c('翻转护身符：回到');                 // 地下宴会厅（现在）
	// 预置打了一半的龙状态（打过几轮、败次 2＝rage 顶格），再从宴会厅重进「叫醒它」
	w.eval('(function(){const p=SugarCube.State.variables.pc;p.dragon.awake=true;p.dragon.hp=30;p.dragon.defeats=2;})()');
	await c('叫醒它');
	if (!passageText(w).includes('它没有再睡回去')) throw new Error('#178：重进唤醒没有「未再睡去」态文案');
	if (pcOf(w).dragon.hp !== 30) throw new Error(`#178：重进唤醒洗了龙血（期望 30，实际 ${pcOf(w).dragon.hp}）`);
	if (pcOf(w).dragon.defeats !== 2) throw new Error(`#178：重进唤醒洗了败次（期望 2，实际 ${pcOf(w).dragon.defeats}）`);
	await c('动手');
	if (pcOf(w).dragon.hp !== 30) throw new Error(`#178：龙·战 fresh 逻辑洗了龙血（期望 30，实际 ${pcOf(w).dragon.hp}）`);
	return { w };
}

// ── 路线 34：中性骰金路径（#196）——d20 恒 11，检定会真失败；失败不锁死、替代路在、仍达真结局 ──
//    既有金路径用 0.99（恒天然 20）：所有检定必成，「失败路径的体验」（重试/软锁/数值压力）从未被测过。
async function routeNeutralGold() {
	const { w, click: c } = await newGame(0.5, 0);      // d20 恒 11（中性骰）
	const pc = () => pcOf(w);
	// 酒馆问路：游说（冷淡 DC12）· 魅力 +0 → 11 必败 → 失败后其余手段仍在（B2：这一手更难 ≠ 封门）
	await c('把话说圆：游说（问路）');
	const tavText = passageText(w);
	if (!tavText.includes('恐吓（问路）') || !tavText.includes('表演（问路）')) throw new Error('游说失败后问路的其余手段不在了（失败锁死）');
	await toWitch(c);
	await c('问塔里的门道');               // witch_hint（-8 金）
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('为什么不自己去送');
	await c('回到守林人');
	await c('你守的到底是什么');
	await c('回到守林人');
	// 问花：护符＝凭据 → 友好 DC7 · 11+0 过（中性骰也问得动——凭据的意义）
	await c('把话说圆：游说（问花）');
	if (pc().world.flower_warned !== true) throw new Error('友好态度（护符在场）下游说（DC7）该成功');
	await c('收下钥匙');
	await c('把墙上那支哨子摘下来');       // 调查 DC10 · 11+0 勉强过
	await c('出塔，回到塔外');
	await c('翻转护身符：回到');
	await c('塔基墙根那片花');
	await c('伸手去摘最靠里的那一朵');
	await c('回塔门');
	await c('翻转护身符：坠入');
	await c('推门进去');
	await c('先上二楼看看');
	await c('指出架上一册错抄的星象历');   // 历史 · 11+0 过（+6 金）
	await c('到拐角的小工坊看看');
	await c('把它打完');                   // 护臂（-8 金 → 0）
	await c('上三楼');
	await c('在书架上找到一册');
	await c('上顶楼');
	await c('下楼，打开地下那道门');
	await c('在宴上找人说话');
	await c('问那位一直在算星的人');
	await c('它从哪颗星来');
	await c('回到观星者');
	await c('拿出筹码：把风化了的书放回案上（求图）'); // 有书 → 免检
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位握着哨子的人');
	await c('在塔里找那根杖');
	// 寻杖：问孩子（游说 DC12 · 11+0 必败）→ 失败后另两条路仍在 → 翻（调查 DC13 必败 → #199 带伤也拿到）
	await c('拉住那个在桌子底下钻的孩子，问他看没看见一根杖');
	if (pc().ev.staff_found === true) throw new Error('中性骰下游说（+0 vs DC12）不该找到杖');
	const altText = passageText(w);
	if (!altText.includes('自己动手翻') || !altText.includes('站在一边看')) throw new Error('问孩子失败后寻杖的另两条路不在了（失败锁死）');
	const hpBefore = pc().hp;
	await c('自己动手翻：桌布底下、酒箱后头都掀开看');
	if (pc().ev.staff_found !== true) throw new Error('翻找失败也该带伤拿到杖（#199）');
	if (pc().hp !== hpBefore - 1) throw new Error('带伤路没有付出 1 点代价（#199）');
	await c('把杖拿回去还她');
	if (pc().world.family_favor !== true) throw new Error('还杖未置 family_favor');
	await c('开口：把她那支哨换过来（换哨）');
	await c('把那支哨收好');
	await c('回到当时的女巫');
	await c('回到宴上');
	await c('找厅角那位不肯多说的老人');
	await c('回到宴上');
	await c('去把花喂给它');
	await c('回到宴上');
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');
	await c('安静地退出去');
	await c('先上二楼看看');
	await c('伸手去摸烤炉后头的暗格');     // witch_hint → 免检
	await c('把暗格里的东西取出来');
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	await c('把卷轴和星图交给他');
	await c('下楼');
	await c('叫醒它');
	await c('让守林人动手');
	await c('看着它走完');
	if (passageOf(w) !== '结局 送星归位') throw new Error(`中性骰金路径未达真结局（停在 ${passageOf(w)}）`);
	return { w };
}

// ── 路线 36：#219 B1① 夺杖检定——失败＝带伤退回可重试，不直落结局 ──
async function routeSeizeStaffFail() {
	const { w, click: c } = await newGame(0.5, 2);   // 秘典：运动无受训/力弱 → 11+0 vs DC15 必败
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手，退开一步');       // 秘典不经打：走窄路见守林人
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
	await c('先上二楼看看');
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	const hp0 = pcOf(w).hp, salves0 = pcOf(w).salves ?? 0;
	await c('抢他的杖，自己去打');         // 失败：手被按住，挨一记退回窗边
	if (passageOf(w) === '结局 讨伐') throw new Error('#219 B1①：检定没过不该直落讨伐结局');
	// 秘典带药膏：缺口满一副恢复量 → 自动烧掉抵伤（#201）；没药膏则净掉 4
	const net = hp0 - pcOf(w).hp;
	if (net !== 0 && net !== 4) throw new Error(`#219 B1①：夺杖失败伤势对不上（${hp0} → ${pcOf(w).hp}）`);
	if (net === 0 && pcOf(w).salves !== salves0 - 1) throw new Error('#219 B1①：净伤 0 应是烧了一副药膏');
	if (!linksOf(w).some((x) => x === '抢他的杖，自己去打')) throw new Error('#219 B1①：失败后应可重试');
	return { w };
}

// ── 路线 37：#219 A3/C1②——宴散自动回未来（不耗星力）＋首次翻转免费 ──
async function routeBanquetEnds() {
	const { w, click: c } = await newGame(0.5, 0);
	await toWitch(c);
	await c('问塔里的门道');
	await toTower(c);
	await c('坠入');                       // 第一次翻转：免费（C1②）
	if (pcOf(w).star.spent !== 0) throw new Error(`#219 C1②：首次翻转不该收费（spent=${pcOf(w).star.spent}）`);
	await c('继续往塔那边走');
	await c('有人从门里出来，拦住你');
	await c('收下钥匙');
	await c('下楼赴宴');
	await c('在宴上找人说话');
	await c('看厅中央：仪式开始了');
	await c('等宴散，护符自己会带你回去');  // A3：自动回未来
	await c('看看现在这门外的雾');
	if (w.SugarCube.State.variables.era !== 'present') throw new Error('#219 A3：宴散该自动回到现在');
	if (passageOf(w) !== '塔门') throw new Error(`#219 A3：宴散该落在塔门（${passageOf(w)}）`);
	if (pcOf(w).star.spent !== 0) throw new Error(`#219 A3：宴散自动回未来不该耗星力（spent=${pcOf(w).star.spent}）`);
	if (!passageText(w).includes('淡了一些')) throw new Error('#219 A3：回现在该渲染「雾淡了一些」');   // flip 渲染即消耗 fog_thin
	await c('翻转护身符：坠入');
	if (pcOf(w).star.spent !== 1) throw new Error(`#219 C1②：首翻之后该正常收费（spent=${pcOf(w).star.spent}）`);
	return { w };
}

// ── 路线 38：#230 劝杀负例——三路检定可失败、可换路重试、可收回 ──
async function routePersuadeFail() {
	const { w, click: c } = await newGame(0.5, 0);   // d20 恒 11：历史/洞悉/游说 +0 全败
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手，退开一步');
	await c('顺着那条窄路走过去');
	await c('逼他动手');
	await c('摆出雾情');                     // 11+0 vs DC13 败
	if (passageOf(w) !== '守林人·劝杀') throw new Error(`#230：雾情说败该留在劝杀可重试（${passageOf(w)}）`);
	await c('自己担下来');                   // 11+0 vs DC13 败
	if (passageOf(w) !== '守林人·劝杀') throw new Error('#230：自担说败该留在劝杀可重试');
	await c('把话收回来');
	if (passageOf(w) !== '守林人') throw new Error('#230：该能空手收回话头');
	if (linksOf(w).some((x) => x === '逼他动手：让他亲手了结它') === false) throw new Error('#230：收回后该还能再劝');
	return { w };
}

// ── 路线 1：金路径 → 送星归位 ─────────────────────────────
async function truePath(w, c) {
	// 金路径的共同部分（走到「地下宴会厅（现在）」），供真结局路线与软限路线复用
	await toWitch(c);                     // 女巫小屋：护符
	await c('问塔里的门道');               // witch_hint
	await toTower(c);                     // 林间小径
	await c('坠入');                      // 翻到过去
	await c('继续往塔那边走');             // 塔门（过去）
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('为什么不自己去送');           // 守林人·送
	await c('回到守林人');
	await c('你守的到底是什么');           // 守林人·守
	await c('回到守林人');
	await c('把话说圆：游说（问花）'); // B2：花田的事得自己问（空手 → 游说 DC12，d20 恒 20 必成）
	await c('收下钥匙');                   // 门厅
	await c('把墙上那支哨子摘下来');       // M9：墙上那支哨子要自己摘（调查 DC10，d20 恒 20 必成）
	await c('出塔，回到塔外');             // 塔门（过去）——守林人已警告
	await c('翻转护身符：回到');           // #168 P1-8：花只长在"现在"这一侧，得先翻回现在（花→过去喂＝闭环）
	await c('塔基墙根那片花');             // 塔外花田（现在）
	await c('伸手去摘最靠里的那一朵');     // M9：采摘是动作 → 免判定拿花
	await c('回塔门');                     // 塔门（现在）
	await c('翻转护身符：坠入');           // 揣着花翻回过去（喂花只能在过去做）
	await c('推门进去');                   // 门厅（过去）
	await c('先上二楼看看');               // 书房（过去：暗格是空的）
	await c('指出架上一册错抄的星象历');   // #168 P1-29：这份跑腿只在过去那一侧（d20 恒 20 → 成）
	await c('到拐角的小工坊看看');         // 工坊（同一层）
	await c('把它打完');                   // 龙鳞护臂
	await c('上三楼');                     // 天文台
	await c('在书架上找到一册');           // 观星者的书
	await c('上顶楼');                     // 顶楼
	await c('下楼，打开地下那道门');       // 地下宴会厅（过去）
	await c('在宴上找人说话');             // 宴会·过去
	await c('看厅中央：仪式开始了');           // #219 A3：送星宴仪式上演
	if (pcOf(w).ev.ritual_seen !== true) throw new Error('#219 A3：看过仪式没落 ritual_seen');
	await c('回到宴上');
	await c('问那位一直在算星的人');       // 观星者
	await c('它从哪颗星来');
	await c('回到观星者');
	await c('今晚的仪式能成吗');
	await c('回到观星者');
	await c('拿出筹码：把风化了的书放回案上（求图）'); // B2：有书 → 免检筹码（不必掷骰）
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位握着哨子的人'); // 当时的女巫（她本人）
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
	if (!passageText(w).includes('蜷着睡下了') || passageText(w).includes('雾从它身上')) {
		throw new Error('喂花后过去的宴会厅没有对应安睡状态，或混入了未来的雾');
	}
	await c('翻转护身符：回到');           // 翻回现在
	await c('安静地退出去');               // 门厅
	await c('先上二楼看看');
	await c('伸手去摸烤炉后头的暗格');     // M9：暗格要自己摸（有门道＝免检 → 直接知道位置）
	await c('把暗格里的东西取出来');       // M10：知道位置之后，取物是另一步
	await c('把日记往下读');             // 深读落 observation_lock（图鉴·日记三线索）
	await c('到拐角的小工坊看看');
	await c('上三楼');
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
	// #291 I1-G1：现象层钩子——翻得多了，雾与人都要能被「感觉到」（不显示任何数字）
	if (pcOf(w).star.spent >= 3) {
		await c('翻转护身符：坠入');
		await c('翻转护身符：回到');
		if (!passageText(w).includes('薄了一层')) throw new Error('#291 G1：翻多次后雾的递进描写没出');
		if (!passageText(w).includes('被抽走了一点点什么')) throw new Error('#291 G1：翻多次后没有代价的现象层提示');
		w.eval("SugarCube.Engine.play('守林人')"); await sleep(150);
		if (!passageText(w).includes('雾薄了')) throw new Error('#291 G1：守林人中途台词没出');
		w.eval("SugarCube.Engine.play('地下宴会厅')"); await sleep(150);   // 归位到路线原所在段
	}
	await c('叫醒它');                    // 唤醒
	if ([...w.document.querySelectorAll(CLICKABLE)].some((x) => x.textContent.includes('让守林人动手'))) {
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
	await c('走进山脚的洞穴');
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
	await c('到拐角的小工坊看看');
	await c('上三楼');
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
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	await c('折断杖');
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
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	await c('抢他的杖');
	if (passageOf(w) !== '结局 讨伐') throw new Error(`未达讨伐（${passageOf(w)}）`);
	// #300 裁决：结局页不显示「本次结果」槽（保持纯净）——那一掷在豁免表登记理由
	if (w.document.querySelector('#passages .scene-feedback')) throw new Error('#300 裁决：结局页出现了结果槽');
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
	// #230：说服链——预置日记（routeKill 走守林人先行路线，身上没带；同 #178 预置手法）
	w.eval('(function(){SugarCube.State.variables.pc.inv["日记"]=true;})()');
	await c('把话收回来');                     // 预置后折返：重进劝杀，日记路出现
	await c('逼他动手');
	await c('摊开日记');
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
	// #310：战斗动作的标签必须读出**进攻意图**（含哨子这一手），且不得把安抚性吹哨也改成攻击口径
	{
		const A = w.Game.Combat.actions;
		if (!String(A['封印·找旧伤'].label).includes('刺')) throw new Error('#310：找旧伤标签未表达攻击意图');
		if (!String(A['封印·吹哨'].label).includes('出刀')) throw new Error('#310：吹哨标签未表达攻击意图');
		const calm = String(A['雾影·亮哨'].label) + String(A['雾影·亮哨'].ok?.text ?? '');
		if (/刺|砍|劈|出刀/.test(calm)) throw new Error('#310：安抚性吹哨被改成攻击口径');
	}
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
	await getKey(c);                        // 钥匙：顶楼才能打开地下那道门
	await c('先上二楼看看');
	await c('伸手去摸烤炉后头的暗格');     // M9：先摸到日记
	await c('把暗格里的东西取出来');       // M10：取物是另一步
	await c('把日记往下读');               // → 观察到"没人看过它睡得怎么样"
	// #219 B1②：施术门——先下去看过它（hall_seen），术式才对得上地方
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	await c('下楼，打开地下那道门');
	if (pcOf(w).ev.below_seen !== true) throw new Error('下过地下宴会厅，below_seen 没落账');
	await c('安静地退出去');
	await c('先上二楼看看');
	await c('照着守林人家那卷封印术念一遍');
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
		await c('到拐角的小工坊看看');
		await c('上三楼');
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
	// 还在龙·战（没被打死）才点"再冲一次"——别拿上一段残留的 DOM 去点
	if (passageOf(w) === '龙·战' && (await waitLinks(w)).some((x) => x.textContent.includes('爬起来，再冲一次'))) {
		await c('爬起来，再冲一次'); // d20=1 → 龙·再冲 必败
	}
	if (passageOf(w) !== '结局 死亡') throw new Error(`未达死亡（${passageOf(w)}；走过：${w.SugarCube.State.passages.slice(-6).join(' → ')}）`);
	return { w };
}

// ── 路线 9：唤醒两支（自愿的长眠 / 再度沉睡）──
async function routeSleepForever() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('收下钥匙');
	await c('先上二楼看看');
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	await c('下楼，打开地下那道门');
	await c('在宴上找人说话');
	await c('找厅角那位不肯多说的老人');   // 老巫女（晚年穿越的那位）
	await c('回到宴上');
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');
	await c('安静地退出去');
	await c('先上二楼看看');
	await c('到拐角的小工坊看看');
	await c('上三楼');
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
	await c('走进山脚的洞穴');
	await c('拔家伙');
	if (pcOf(w).world.goblin_spared) throw new Error('动武分支不应置 goblin_spared');
	if (passageOf(w) !== '森林边缘') throw new Error(`动武后应回森林边缘（实际 ${passageOf(w)}）`);
	// #300 P2：跨段导航后这一掷的骰面不得丢——结果槽须带着检定行（DC/骰面）
	const slot = w.document.querySelector('#passages .scene-feedback');
	const diceLine = w.document.querySelector('#passages .check-result');
	const slotText = slot?.textContent ?? '';
	if (!diceLine && !/DC\d|d20|检定/.test(slotText)) throw new Error('#300 P2：跨段后检定框被吞（骰面丢失）');
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
	// #168 P2-12：道具页只列身上有的——不许把好哨 / 完整星图 / 传送术卷轴这类终局件先摆出来
	{
		const t = passageText(w);
		if (/好哨|完整星图|传送术卷轴/.test(t)) throw new Error(`道具页提前泄底：${t.slice(0, 90)}`);
	}
	await c('回设定集');
	await c('术语');
	// v17 补正 #7：雾＝星力的谜底只在设定集·术语，且要走到过终局（SgCodex.finals）才揭开
	if (passageText(w).includes('漏出来的力气')) throw new Error('没走到终局就把雾的谜底揭开了');
	w.SgCodex.recordEnding('送星归位', 'final');
	if (!w.SgCodex.seenFinal()) throw new Error('终局没记进 SgCodex.finals');
	await c('回设定集');
	await c('术语');
	if (!passageText(w).includes('漏出来的力气')) throw new Error('走到终局后，设定集·术语没有揭开谜底');
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
	// 日记三线索齐（来历 / 那一夜发不动 / 深读观测锁）→ 该页解锁（#219 A2 后改用本页做解锁示例）
	if (!w.SgCodex.unlocked('日记')) {
		const got = JSON.stringify(store.clues['日记'] ?? {});
		throw new Error(`日记线索齐了却没解锁（${got}）`);
	}
	// 坏哨 2/3 锁定（#219 A2：past 金路径不打雾——「带着它，雾里的东西会迟疑」须现在侧相遇才落账）
	if (w.SgCodex.unlocked('坏哨')) throw new Error('坏哨三线索不齐却解锁了（fight 线索应须现在侧相遇）');
	const whistleIds = w.Game.Codex.clueIds('坏哨');
	const whistleGot = w.SgCodex.read().clues['坏哨'] ?? {};
	if (whistleIds.filter((id) => whistleGot[id]).length !== 2) throw new Error(`坏哨应为 2/3 进度（实际 ${JSON.stringify(whistleGot)}）`);
	// 月光花只差"毒液抹刃"（那条在封印战线）→ 必须仍是锁定页
	if (w.SgCodex.unlocked('月光花')) throw new Error('月光花线索未齐却解锁了（解锁条件应是"全部线索"）');
	await c('打开设定集');
	await c('图鉴');
	const txt = w.document.querySelector('#passages').textContent;
	if (!txt.includes('日记')) throw new Error('图鉴未列出已解锁的日记');
	if (!txt.includes('她记那一夜的那一本')) throw new Error('图鉴未列出已解锁页的线索（日记·own）');
	const names = Object.keys(w.Game.Codex.items);
	const unlocked = names.filter((n) => w.SgCodex.unlocked(n));
	if (unlocked.includes('月光花')) throw new Error('月光花只差一条线索，却也解锁了（解锁条件应是"全部线索"）');
	const locked = names.filter((n) => !unlocked.includes(n));
	if (!locked.length) throw new Error('金路径不该把所有页都解锁（毒液那条只在封印战线）');
	if ((txt.match(/？？？/g) ?? []).length !== locked.length) {
		throw new Error(`图鉴锁定页数量与账本不符（渲染 ${(txt.match(/？？？/g) ?? []).length} / 账本 ${locked.length}）`);
	}
	if (!txt.includes('塔根墙下那片银白')) throw new Error('走到过终局后，锁定页未给出指向');
	if (!txt.includes(`已解锁 ${unlocked.length} / ${names.length}`)) throw new Error('图鉴计数行不对');
	return { w };
}


// ── #308／#312：退出选项必须让玩家分清「返回」与「结束本次旅程」（文案批 A）──
async function routeExitLabels() {
	const { w, click: c } = await newGame(0.99, 0);
	// ① 半途的林子：结局出口须写明「结束本次旅程」，普通返回不写
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.inv=pc.inv||{};pc.ev=pc.ev||{};pc.world=pc.world||{};pc.keeper=pc.keeper||{};pc.keeper.met=false;SugarCube.State.variables.era="present";SugarCube.Engine.play("半途的林子");})()');
	await sleep(150);
	{
		const labels = linksOf(w);
		const ending = labels.find((x) => x.includes('回头'));
		const back = labels.find((x) => x.includes('回大门'));
		if (!ending?.includes('结束本次旅程')) throw new Error('#308：半途林子的结局出口没写「结束本次旅程」');
		if (back?.includes('结束本次旅程')) throw new Error('#308：普通返回被写成结束旅程');
	}
	// ② 唤醒：无哨时的出口＝结束；且标签带「结束本次旅程」；点它确到结局
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.inv=pc.inv||{};pc.keeper=pc.keeper||{};pc.dragon=pc.dragon||{};pc.dragon.awake=true;delete pc.inv["好哨"];pc.keeper.state="ally";pc.world.flower_fed=false;SugarCube.Engine.play("唤醒");})()');
	await sleep(150);
	{
		const exit = linksOf(w).find((x) => x.includes('退出去'));
		if (!exit?.includes('结束本次旅程')) throw new Error('#308：唤醒的结局出口没写「结束本次旅程」');
	}
	// ③ 归位：缺花时的出口是**返回**（回到唤醒），不得写「结束本次旅程」，且点击后确回唤醒
	w.eval("SugarCube.Engine.play('归位')"); await sleep(150);
	{
		const back = linksOf(w).find((x) => x.includes('退开一步'));
		if (!back) throw new Error('#308：归位缺花出口不见了');
		if (back.includes('结束本次旅程')) throw new Error('#308：归位的返回出口被写成结束旅程');
		await c('退开一步');
		if (passageOf(w) !== '唤醒') throw new Error(`#308：归位返回应回唤醒（实际 ${passageOf(w)}）`);
	}
	// ④ #312：唤醒入口标签不得再暗示「准备已齐」
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.inv=pc.inv||{};pc.inv["好哨"]=true;pc.keeper.state="ally";SugarCube.Engine.play("地下宴会厅");})()');
	await sleep(150);
	{
		const all = linksOf(w).join('|');
		if (all.includes('现在可以了')) throw new Error('#312：地下宴会厅仍出现「现在可以了」的暗示');
		const wake = linksOf(w).find((x) => x.includes('叫醒它'));
		if (!wake) throw new Error('#312：叫醒入口不见了');
	}
	return { w };
}

// ── #309／#311／#313：选项指向与措辞（B 批）——每处读得出「我在做什么」──
async function routeClarityB() {
	const { w } = await newGame(0.99, 0);
	const play = async (p, set) => { if (set) { w.eval(set); } w.eval(`SugarCube.Engine.play(${JSON.stringify(p)})`); await sleep(150); };
	// #311-A：未获警告时，现场给出身体征兆；已获警告时选项体现屏息
	await play('塔外花田', '(function(){const pc=SugarCube.State.variables.pc;pc.world.goblin_spared=false;pc.world.flower_warned=false;pc.world.flower_mud=false;pc.inv={};SugarCube.State.variables.era="present";})()');
	if (!passageText(w).includes('眼皮跟着沉了沉')) throw new Error('#311：未警告的花田缺「靠近有危险」的征兆');
	if (linksOf(w).some((x) => x.includes('憋住气，伸手去摘'))) throw new Error('#311：未警告时不该预先给出屏息动作');
	await play('塔外花田', '(function(){SugarCube.State.variables.pc.world.flower_warned=true;})()');
	if (!linksOf(w).some((x) => x.includes('憋住气，伸手去摘最靠里的那一朵'))) throw new Error('#311：已警告时选项未体现屏息');
	// #311-B：护臂选项写出导致受伤的擦锈动作
	await play('工坊', null);
	if (!linksOf(w).some((x) => x.includes('擦开内侧的锈'))) throw new Error('#311：护臂选项未写出擦锈动作');
	// #309：劝杀入口与日记论据都读得出「了结它」
	await play('守林人', '(function(){const pc=SugarCube.State.variables.pc;pc.inv={};pc.inv["日记"]=true;pc.keeper.met=true;pc.keeper.state="ally";SugarCube.State.variables.era="present";})()');
	if (!linksOf(w).some((x) => x.includes('逼他动手：让他亲手了结它'))) throw new Error('#309：劝杀入口未写清动手对象与目的');
	await play('守林人·劝杀', null);
	const diary = linksOf(w).find((x) => x.includes('摊开日记'));
	if (!diary?.includes('了结它')) throw new Error('#309：日记论据未表达是在说服对方了结它');
	// #313：其余选项的行动指向
	await play('酒馆', '(function(){const pc=SugarCube.State.variables.pc;pc.gold=99;pc.ev=pc.ev||{};SugarCube.State.variables.era="present";})()');
	if (!linksOf(w).some((x) => x.includes('问一句女巫小屋怎么走，然后过去'))) throw new Error('#313①：问路选项未写出随后动身');
	if (!linksOf(w).some((x) => x.includes('请他讲讲洞里的路'))) throw new Error('#313⑤：传闻选项仍以「实话」作主句');
	await play('森林边缘', null);
	if (!linksOf(w).some((x) => x.includes('凑近辨认木牌上的字'))) throw new Error('#313②：木牌选项仍是环境陈述');
	await play('洞穴', '(function(){SugarCube.State.variables.pc.world.goblin_spared=false;})()');
	if (!linksOf(w).some((x) => x.includes('拔家伙，逼它退开'))) throw new Error('#313④：洞穴选项缺「做什么」的主句');
	await play('龙·巢边', '(function(){SugarCube.State.variables.pc.world.hoard_looted=false;})()');
	if (!linksOf(w).some((x) => x.includes('从零碎里挑出几件值钱的'))) throw new Error('#313⑥：战利品选项仍在对玩家本领作评价');
	await play('观星者', '(function(){const pc=SugarCube.State.variables.pc;pc.ev.seer_asked=false;SugarCube.State.variables.era="past";})()');
	if (!linksOf(w).some((x) => x.includes('今晚的仪式能成吗'))) throw new Error('#313③：观星者问句仍用「那一夜」指代当晚');
	return { w };
}

// ── #291 I1：投入—回报（G2 失败给情报＋下次优势；G4 立场被记住）──
async function routeInvestment() {
	const { w, click: c } = await newGame(0.01, 0);   // 低骰：检定必败
	await toWitch(c);
	await toTower(c);
	await c('继续往塔那边走');
	await c('推门进去');                                // 门厅
	// G2：看钉失败 → 产出情报旗标（失败给信息）＋ 屏上留提示
	await c('先看清钉子是怎么卡的');
	if (pcOf(w).world.hall_hint !== true) throw new Error('#291 G2：看钉失败未产出情报旗标');
	if (!passageText(w).includes('弯钩')) throw new Error('#291 G2：失败后屏上没留情报提示');
	// 情报接进优势通道（下一次同一手自动双骰取高，且检出行标注来源）
	if (w.Game.Checks.knowledge['门厅·看钉'] !== 'hall_hint') throw new Error('#291 G2：情报未接入位点优势');
	// 可重试的位点验证「带情报重试」：天文台·典籍（失败 → ledger_hint → 重试标注优势来源）
	await c('先上二楼看看');
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('顺着注记读一读缺口边上那半幅星轨');
	if (pcOf(w).world.ledger_hint !== true) throw new Error('#291 G2：典籍失败未产出情报旗标');
	if (!passageText(w).includes('等分')) throw new Error('#291 G2：失败后屏上没留情报提示');
	await c('顺着注记读一读缺口边上那半幅星轨');
	if (!passageText(w).includes('情报')) throw new Error('#291 G2：带情报重试未标注优势来源');
	// G3：跨时代合龙门——单侧证据问不出那一句（反例），两侧齐才出现（正例）
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.ev=pc.ev||{};pc.ev.failure_cause=true;delete pc.ev.seer_asked;delete pc.ev.coord;pc.ev.old_witch=true;SugarCube.State.variables.era="past";})()');
	w.eval("SugarCube.Engine.play('老巫女')"); await sleep(150);
	if (linksOf(w).some((x) => x.includes('那一夜该烧的'))) throw new Error('#291 G3：只带现在侧证据也问得出（门形同虚设）');
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.ev.seer_asked=true;})()');
	w.eval("SugarCube.Engine.play('老巫女')"); await sleep(150);
	if (!linksOf(w).some((x) => x.includes('那一夜该烧的'))) throw new Error('#291 G3：两侧证据齐了却问不出（门不可达）');
	await c('问她：那一夜该烧的是什么？');
	if (pcOf(w).ev.witch_fire_hint !== true) throw new Error('#291 G3：合龙门未产出只言片语');
	if (!passageText(w).includes('等一个不在场的人把话说完')) throw new Error('#291 G3：只言片语没落地');

	// G4：表达型选择（立场）必须被记住
	w.eval("SugarCube.Engine.play('守林人')"); await sleep(150);
	await c('说一句：它不会变成恶龙');
	if (pcOf(w).ev.keeper_kind !== true) throw new Error('#291 G4：立场选择未写入状态');
	w.eval("SugarCube.Engine.play('守林人')"); await sleep(150);
	if (!passageText(w).includes('你那天那句话')) throw new Error('#291 G4：立场未被守林人回收（说了等于没说）');
	return { w };
}

// ── #259 M1/M2：交付后的互锁（顶楼连续性／书房劣化封印禁用）──
async function routeDeliveredLocks() {
	const { w } = await newGame(0.99, 0);
	// 真实路径等价：先首访顶楼（设 firstTime 旗标——交付动作本身也在顶楼发生），再置盟约态
	w.eval("SugarCube.Engine.play('顶楼')"); await sleep(120);
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.world=pc.world||{};pc.world.scroll_delivered=true;pc.keeper=pc.keeper||{};pc.keeper.met=true;pc.keeper.key=true;pc.keeper.state="ally";pc.inv=pc.inv||{};pc.inv["守林人的钥匙"]=true;})()');
	// M1：顶楼＝人已下去；抢杖收紧；另两出口改写
	w.eval("SugarCube.Engine.play('顶楼')"); await sleep(150);
	const top = passageText(w);
	if (!top.includes('瞭望位空着')) throw new Error('#259 M1：交付后顶楼仍写守林人站在瞭望位');
	if (linksOf(w).some((x) => x.includes('抢他的杖'))) throw new Error('#259 M1：交付后仍可抢他的杖');
	if (!linksOf(w).some((x) => x.includes('违背约定'))) throw new Error('#259 M1：接班出口未按盟约态改写');
	if (!linksOf(w).some((x) => x.includes('折断那半卷手稿'))) throw new Error('#259 M1：焚塔出口未改写');
	// M2：书房劣化封印禁用＋ack（施术口在 observation_lock 之后）
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.ev.observation_lock=true;})()');
	w.eval("SugarCube.Engine.play('书房')"); await sleep(150);
	const study = passageText(w);
	if (linksOf(w).some((x) => x.includes('照着守林人家那卷封印术念一遍'))) throw new Error('#259 M2：交付后仍可施劣化封印');
	if (!study.includes('那卷术式在他手上')) throw new Error('#259 M2：缺禁用 ack 文案');
	// 反例：未交付时抢杖仍在（确认门确是按 scroll_delivered 收的）
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.world.scroll_delivered=false;})()');
	w.eval("SugarCube.Engine.play('顶楼')"); await sleep(150);
	if (!linksOf(w).some((x) => x.includes('抢他的杖'))) throw new Error('#259 M1：未交付时抢杖被误收');
	// m4：喂过花再并肩，开场应有互文
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.world.flower_fed=true;pc.ev.fight=null;pc.hp=18;pc.max_hp=18;})()');
	w.eval("SugarCube.Engine.play('封印·并肩')"); await sleep(150);
	if (!passageText(w).includes('花让它睡得沉')) throw new Error('#259 m4：喂花后并肩缺互文');
	// m5：伤过的龙在归位段有 ack
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.dragon=pc.dragon||{};pc.dragon.hp=Game.Dragon.hp-12;pc.dragon.awake=true;})()');
	w.eval("SugarCube.Engine.play('归位')"); await sleep(150);
	if (!passageText(w).includes('刚结的血口')) throw new Error('#259 m5：伤龙归位缺 ack');
	// m3：盟约态但手里没有好哨——唤醒处要给出「哨在长桌尽头」的指引
	w.eval('(function(){const pc=SugarCube.State.variables.pc;delete pc.inv["好哨"];pc.keeper.state="ally";pc.dragon.awake=true;})()');
	w.eval("SugarCube.Engine.play('唤醒')"); await sleep(150);
	if (!passageText(w).includes('在长桌尽头那位手里')) throw new Error('#259 m3：无哨唤醒缺指引');
	return { w };
}

// ── 路线 39：跨周目粘性（#271：每条路线都是干净 localStorage，跨周目行为此前零覆盖）──
async function routeCrossRunSticky() {
	const { w, click: c } = await newGame(0.99, 0);
	// ① 干净档：未走到过终局 → 术语页不得出现谜底（防「谜底门」退化成按 run 也能揭）
	if (w.SgCodex.seenFinal()) throw new Error('干净新档不该 seenFinal');
	w.SugarCube.Engine.play('设定集·术语');
	await w.SugarCube.Engine.isIdle?.() ?? null;
	for (let i = 0; i < 20 && passageOf(w) !== '设定集·术语'; i++) await new Promise((r) => setTimeout(r, 50));
	if (w.document.querySelector('#passages').textContent.includes('它睡着时漏出来的力气')) {
		throw new Error('干净新档的设定集·术语就出现了谜底（谜底门应须 seenFinal）');
	}
	// ② 模拟「此前已通关」：写入跨周目账本（localStorage），再重开一局
	const seeded = { clues: { 日记: { own: true, cause: true, lock: true } }, endings: ['送星归位'], finals: ['送星归位'] };
	w.localStorage.setItem('sgstory.codex.v1', JSON.stringify(seeded));
	if (!w.SgCodex.seenFinal()) throw new Error('账本写入后 seenFinal 应为 true（粘性）');
	w.sgRestartRun();
	await new Promise((r) => setTimeout(r, 300));
	// ③ 新周目：run 状态重置，账本保留
	if (passageOf(w) !== '开场') throw new Error(`sgRestartRun 后应回开场（停在 ${passageOf(w)}）`);
	if (w.SugarCube.State.variables.pc?.ev?.ending) throw new Error('sgRestartRun 未清 run 态（ev.ending 仍在）');
	if (!w.SgCodex.seenFinal()) throw new Error('sgRestartRun 误清跨周目账本（seenFinal 丢了）');
	// ④ 新周目开局即见谜底（设计决定：「走到过终局」＝曾经，跨周目有效）
	w.SugarCube.Engine.play('设定集·术语');
	for (let i = 0; i < 20 && passageOf(w) !== '设定集·术语'; i++) await new Promise((r) => setTimeout(r, 50));
	const txt = w.document.querySelector('#passages').textContent;
	if (!txt.includes('它睡着时漏出来的力气')) throw new Error('走到过终局的档，新周目术语页应给出谜底');
	// ⑤ 图鉴：已解锁页保留 + 未解锁页给指向（seenFinal ⇒ 提示开）
	w.SugarCube.Engine.play('设定集·图鉴');
	for (let i = 0; i < 20 && passageOf(w) !== '设定集·图鉴'; i++) await new Promise((r) => setTimeout(r, 50));
	const bt = w.document.querySelector('#passages').textContent;
	if (!bt.includes('日记')) throw new Error('跨周目账本的已解锁页在新周目丢失');
	if (!betHasHint(bt)) throw new Error('seenFinal 档的图鉴未给锁定页指向');
	return { w };
}
function betHasHint(t) { return /塔根墙下那片银白|她把它从炉火边递到你手里|门厅门边那支锈的/.test(t); }

// ── 路线 29：结局页的收尾入口（C1：退回上一步 / 读档 / 从头再来）──
async function routeEndingFooter() {
	const { w, click: c } = await newGame(0.99, 0);
	await c('就此回头，把这片林子留给别人');            // 章节出口（平凡之路）
	if (passageOf(w) !== '结局 平凡之路') throw new Error(`没走到章节出口（${passageOf(w)}）`);
	const foot = w.document.querySelector('#passages .ending-foot');
	if (!foot) throw new Error('结局页没挂收尾入口（退回上一步 / 读档 / 从头再来）');
	if (w.document.querySelector('#passages .passage').lastElementChild !== foot) throw new Error('收尾卡没挪到段落末尾');
	if (foot.querySelector('button[data-end-act="undo"]').disabled) throw new Error('刚走了几步就说不能退回上一步');
	if (!foot.textContent.includes('还没有存档')) throw new Error('没存档时"读档"应说明还没有存档');
	// 退回上一步 → 回酒馆；存一次档 → 再走到结局 → 读档回存档点
	await c('退回上一步');
	if (passageOf(w) !== '酒馆') throw new Error(`退回上一步没回到酒馆（${passageOf(w)}）`);
	w.sgQuickSave();
	if (!w.SugarCube.Save.browser.slot.has(1)) throw new Error('快速存档没落进 slot 1');
	await c('就此回头，把这片林子留给别人');
	await c('读档');
	if (passageOf(w) !== '酒馆') throw new Error(`读档没回到存档点（${passageOf(w)}）`);
	// 再走到结局 → 从头再来：回开场、本档清零、图鉴的永久记录留着
	await c('就此回头，把这片林子留给别人');
	if (w.document.querySelector('#passages .ending-foot').textContent.includes('还没有存档')) throw new Error('已经存过档，"读档"不该还说没有存档');
	await c('从头再来');
	if (passageOf(w) !== '开场') throw new Error(`从头再来没回到开场（${passageOf(w)}）`);
	const pc = pcOf(w);
	if (!pc || pc.hp !== pc.max_hp) throw new Error(`重开后本档没回到初始形状（hp=${pc?.hp}/${pc?.max_hp}）`);
	if (Object.keys(pc.soc?.tries ?? {}).length) throw new Error('重开后交涉账没清（本档应清零）');
	if (w.SugarCube.State.variables.era !== 'present') throw new Error('重开后 era 没回到 present');
	if (!w.SgCodex.read().endings.includes('平凡之路')) throw new Error('重开后图鉴的永久记录丢了（应当留着）');
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
	await c('挑出几件值钱的');
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
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('收下钥匙');
	await c('下楼赴宴');
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
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('收下钥匙');
	await c('把墙上那支哨子摘下来');               // #177：换哨要真拿着可换的那支
	await c('下楼赴宴');
	await c('在宴上找人说话');
	await c('问那位一直在算星的人');
	await c('引一段先例：历史（求图）');   // B2：无书 → 历史检定（d20=20 必成）
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位握着哨子的人'); // 当时的女巫（她本人）
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
	await c('告诉它还送不动，让它自行选择长眠');
	if (passageOf(w) !== '结局 自愿的长眠') throw new Error(`未达自愿的长眠（${passageOf(w)}）`);
	return { w };
}

// ── 路线 23：换哨双门槛（无好感不换 / 无星图不换）──
async function routeExchangeGate() {
	const { w, click: c } = await newGame(0.99, 0);
	const links = () => [...w.document.querySelectorAll(CLICKABLE)].map((x) => x.textContent);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('收下钥匙');
	await c('下楼赴宴');
	await c('在宴上找人说话');
	await c('找那位握着哨子的人');
	// #249：宴上贺礼——月光花第三用途（预置一朵；赠出即失，三选一）
	w.eval('(function(){SugarCube.State.variables.pc.inv["月光花"]=true;})()');
	await c('回到宴上');
	await c('找那位握着哨子的人');
	if (!links().some((s) => s.includes('把那朵月光花送给她'))) throw new Error('#249：持花赴宴，该有赠礼入口');
	await c('把那朵月光花送给她');
	if (pcOf(w).ev.witch_gifted !== true) throw new Error('#249：赠礼未落 witch_gifted');
	if (pcOf(w).inv['月光花'] !== undefined) throw new Error('#249：赠出该失去（三选一）');
	if (!passageText(w).includes('它是药，也是毒')) throw new Error('#249：采药人的专业台词没落地');
	// ① 无星图 → 无换哨选项
	if (links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('无星图却出现换哨选项');
	// ② 还杖（好感）→ 仍无星图 → 仍无换哨
	await c('在塔里找那根杖');
	await c('自己动手翻：桌布底下、酒箱后头都掀开看');   // M10：翻找是动作（d20 恒 20 必成）
	await c('把杖拿回去还她');                          // M10：还杖是动作
	if (pcOf(w).world.family_favor !== true) throw new Error('还杖未置 family_favor');
	if (links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('有好感但无星图，仍不该出现换哨选项');
	if (pcOf(w).inv['好哨']) throw new Error('门槛未过却拿到好哨');
	// ③ 取星图（本路线没拿门厅的哨）→ #177：手里没哨仍不肯（正文不收你根本没有的东西）
	await c('回到宴上');
	await c('问那位一直在算星的人');
	await c('引一段先例：历史（求图）');
	await c('把那张抄好的图收下');
	await c('回到观星者');
	await c('回到宴上');
	await c('找那位握着哨子的人');
	if (links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('#177：图与杖齐了但手里没哨，不该出现可点的换哨');
	if (!passageText(w).includes('还挂在门厅的钉子上')) throw new Error('#177：无哨时没给「哨在门厅」的指引');
	if (pcOf(w).inv['好哨']) throw new Error('#177：无哨竟换到了好哨');
	// ④ 回门厅取哨（现在那侧的钉子上）→ 回来换哨成功
	await c('回到宴上');
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');
	await c('安静地退出去');
	await c('把墙上那支哨子摘下来');
	if (pcOf(w).inv['坏哨'] !== true) throw new Error('门厅（现在）没拿到坏哨');
	await c('翻转护身符：坠入');
	await c('下楼赴宴');
	await c('在宴上找人说话');
	await c('找那位握着哨子的人');
	if (!links().some((s) => s.includes('把她那支哨换过来'))) throw new Error('图、杖、哨三齐后仍无换哨选项');
	// #228：喂过花的人来换哨——她的 will 台词换成「那朵花」变体（挣扎半拍再交）
	w.eval('(function(){SugarCube.State.variables.pc.world.flower_fed=true;})()');
	await c('开口：把她那支哨换过来（换哨）');
	await c('把那支哨收好');
	if (pcOf(w).inv['好哨'] !== true || pcOf(w).inv['坏哨'] !== undefined) throw new Error('换哨没完成（好哨/坏哨交接）');
	if (!passageText(w).includes('那朵花')) throw new Error('#228：喂花后来换哨，她该先问「那朵花」');
	return { w };
}

// ── 路线 16：时代分叉（宴会·过去|现在 / 交付|过去）──
async function routeEraBranches() {
	const { w, click: c } = await newGame(0.99, 0);
	await toWitch(c);
	await toTower(c);
	await c('坠入');
	await c('继续往塔那边走');
	await c('塔基墙根那片花');       // 塔外花田（过去）：花还没长出来 ← #168 P1-8 覆盖
	if (pcOf(w).inv['月光花']) throw new Error('三百年前那一侧不该能摘到花（#168 P1-8）');
	if (linksOf(w).some((x) => x.includes('摘'))) throw new Error('过去那一侧还留着采摘入口（#168 P1-8）');
	await c('回塔门');
	// #219 A2：三百年前雾还没起——塔门（过去）不该出现雾之魔物
	if (linksOf(w).some((x) => x.includes('雾里有个影子'))) throw new Error('过去塔门出现了雾之魔物（#219 A2：雾起于龙睡后）');
	if (!linksOf(w).some((x) => x.includes('有人从门里出来'))) throw new Error('过去塔门缺守塔人拦路入口（#219 A2）');
	await c('推门进去');
	// #239②：宴当晚地下门不锁——过去门厅无钥匙也该能下楼赴宴
	if (!linksOf(w).some((x) => x.includes('下楼赴宴'))) throw new Error('过去门厅铁门还锁着（#239②：宴当晚门为客开）');
	if (!passageText(w).includes('铁门敞着')) throw new Error('过去门厅铁门仍写锁着（#239②）');
	await c('出塔，回到塔外');
	await c('有人从门里出来，拦住你');   // #219 A2：过去无雾——守塔人出来拦
	await c('收下钥匙');
	await c('下楼赴宴');
	await c('在宴上找人说话');       // 宴会·过去（过去）
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');     // 地下宴会厅（现在）
	// #313⑦：现在的地下宴会厅不再直接给「赴宴」动作——先提示要回到过去（不自动消耗翻转）
	if (linksOf(w).some((x) => x.includes('在宴上找人说话'))) throw new Error('#313⑦：现在侧仍直接给赴宴入口');
	if (!passageText(w).includes('得先翻转护符回到那一晚')) throw new Error('#313⑦：现在侧缺「先回到过去」的提示');
	await c('回那一晚看看');         // 宴会·过去（现在）：只给「先翻护符」的提示
	if (!passageText(w).includes('人声属于三百年前')) throw new Error('#313⑦：现在侧进入宴会未提示需翻转');
	await c('翻转护身符：坠入');     // 宴会·过去（过去）
	await c('回到地下宴会厅');
	await c('翻转护身符：回到');     // 地下宴会厅（现在）
	await c('安静地退出去');
	await c('翻转护身符：坠入');     // 门厅（过去）
	await c('先上二楼看看');
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');               // 顶楼（过去）
	await c('把卷轴和星图交给他');   // #219 D③：东西不齐＝就地反馈缺什么（不进交付）
	if (passageOf(w) !== '顶楼') throw new Error(`#219 D③：不齐时不该进交付（${passageOf(w)}）`);
	if (!passageText(w).includes('还没凑齐')) throw new Error('#219 D③：不齐反馈缺「还没凑齐」文案');
	// 预置两样（同 #178 预置手法）→ 覆盖「交付」过去支：给完该提示回宴会厅先翻转
	w.eval('(function(){const p=SugarCube.State.variables.pc;p.inv["传送术卷轴"]=true;p.inv["完整星图"]=true;})()');
	await c('把卷轴和星图交给他');       // 预置后首点＝重渲染（else 支链接换成交付链接）
	await c('把卷轴和星图交给他');
	if (passageOf(w) !== '交付') throw new Error(`未达交付（${passageOf(w)}）`);
	return { w };
}

// ── 路线 25：打听碰壁 → 越问越难 → 换手段/换筹码（B2：代价因手段而异）──
// ── 路线 31：酒馆·把桌子听遍（#168 机检⑩：这一段渲染出来的八桌人 + 那幅画，全都要真点过一次）──
// P1-1 的断链与 "不老的女人" 那桌就藏在这里：段落级覆盖一直是绿的，因为它只看"段落|时代"格。
async function routeTavernAllTables() {
	const { w, click: c } = await newGame(0.5, 0);
	const tables = [
		['讲守林人的那一桌', 'tav_keeper'],
		['上了年纪的村人', 'tav_dragon'],
		['跑生意的', 'tav_grudge'],
		['接嘴的那个人', 'tav_ageless'],
		['背着画板的游客——他在问月光花', 'tav_flower'],
		['墙上那幅旧画', 'tav_painting'],
	];
	for (const [label, flag] of tables) {
		await c(label);
		if (pcOf(w).ev[flag] !== true) throw new Error(`点了「${label}」却没记下 ${flag}（这一桌的内容没落地？）`);
	}
	const tavText = passageText(w);
	for (const key of ['不老的女人', '怨念']) {
		if (!tavText.includes(key)) throw new Error(`听完所有桌子，正文里没出现「${key}」`);
	}
	// 散布的三条（#217）：井台（灯）/ 废哨站（铁门）/ 林缘空地（封印）
	await c('离店前，去井台打点水');
	if (pcOf(w).ev.tav_light !== true) throw new Error('井台的灯传闻没记账（tav_light）');
	if (!passageText(w).includes('三百年了，那灯没灭过')) throw new Error('井台的灯传闻没落地');
	await c('推门出发，走进暮色');
	await c('辨认木牌');
	if (pcOf(w).ev.tav_iron !== true) throw new Error('哨站的铁门传闻没记账（tav_iron）');
	if (!passageText(w).includes('铁门锁着')) throw new Error('哨站的铁门传闻没落地');
	await c('退回林子');
	await c('林缘空地有人抽烟斗');
	if (pcOf(w).ev.tav_seal !== true) throw new Error('老猎人的封印传闻没记账（tav_seal）');
	if (!passageText(w).includes('按在塔底下')) throw new Error('老猎人的封印传闻没落地');
	await c('回到林子边缘');
}

async function routeTavernAsk() {
	const { w, click: c } = await newGame(0.01, 0);   // d20 恒 1：所有检定必败
	// 酒馆：一桌一问（问过就消失）
	await c('离店前，去井台打点水');
	if (pcOf(w).ev.tav_light !== true) throw new Error('井台的灯传闻没记账（tav_light）');
	await c('回酒馆');
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
	if (!w.document.activeElement.matches('.soc-said')) throw new Error('请酒后的焦点应落在本次回复，不能继续强调上次失败检定');
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
	for (const q of ['问：你们家与那座塔有什么渊源', '问：三百年前那一夜，发生过什么', '问：这护符到底怎么用', '问：塔底下锁着的到底是什么', '问：你就这么看着，什么也不做？', '问：我一个人上去，够吗']) {
		await c(q);
	}
	const wq = pcOf(w).ev;
	if (!(wq.wq_painting && wq.wq_night && wq.wq_talisman && wq.wq_under && wq.wq_past && wq.wq_alone)) throw new Error('女巫小屋提问未全部记账');
	const wqText = w.document.querySelector('#passages').textContent;
	if (!wqText.includes('别拿那幅画比')) throw new Error('女巫小屋的"形似"回指未渲染（#168 P1-14：不再给解释）');
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

// ── 路线 33：书房免伤路（#199）——敲墙照样通，一分血不花（多路不只在纸面）──
async function routeStudyKnock() {
	const { w, click: c } = await newGame(0.99, 0);
	await c('推门出发，走进暮色');
	await c('去那间亮着灯的小屋');
	await c('谢过她，往林子深处走');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('举起武器');                    // #219 A2 后：雾战＝现在侧内容，本路线补交互覆盖（d20 恒 20 无伤）
	await fightTo(c, w, ['往塔那边去']);
	await c('往塔那边去');
	await c('收下钥匙');
	await c('先上二楼看看');
	const hp0 = pcOf(w).hp;
	await c('先敲一敲炉膛后头的墙');
	if (pcOf(w).ev.study_found !== true) throw new Error('敲墙路没找到暗格');
	if (pcOf(w).hp !== hp0) throw new Error('敲墙路不该掉血（免伤路）');
	await c('把暗格里的东西取出来');
	if (pcOf(w).inv['日记'] !== true) throw new Error('敲墙路没拿到日记');
}

// ── 路线 27：非酋不读档（M10）——把"主路属性"打瘸，靠另一条路照样拿全 ──
//    智力 8（-1）· 感知 16（+3）· 骰面恒 11：调查类必败，感知类必成。
async function routeNoSaveScum() {
	const { w, click: c } = await newGame(0.5, 0);      // d20 恒 11
	const pc = pcOf(w);
	pc.abilities = { str: 10, dex: 10, con: 14, int: 8, wis: 16, cha: 8 };
	pc.ev = {};
	await c('离店前，去井台打点水');     // 酒馆问一桌 → 已散布到井台（#217）
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
	// 花田：走"上风处"（生存 → 必成；保留原位点 ID）
	await c('出塔，回到塔外');
	await c('塔基墙根那片花');
	await c('退到上风头，连土一起端起来');
	if (pcOf(w).inv['月光花'] !== true) throw new Error('生存路没拿到月光花');
	await c('回塔门');
	await c('推门进去');
	await c('先上二楼看看');
	// 书房：调查（智力 8 → 10 < 12 必败）→ #199 新纪律：带伤也拿到（伤＝代价不是空手）
	const hpBefore = pcOf(w).hp;
	await c('伸手去摸烤炉后头的暗格');
	if (pcOf(w).ev.study_found !== true) throw new Error('检定失败也该带伤拿到（#199）');
	if (pcOf(w).hp !== hpBefore - 1) throw new Error('带伤路没有付出 1 点代价');
	await c('把暗格里的东西取出来');
	if (pcOf(w).inv['日记'] !== true) throw new Error('换路之后没拿到日记');
	await c('到拐角的小工坊看看');
	await c('擦开内侧的锈');        // 察觉 → 必成
	if (pcOf(w).ev.forge_seen !== true) throw new Error('察觉路没换来护臂来历');
	await c('上三楼');
	await c('盯住缺口里那几粒没连上的点');        // 察觉 → 必成（本条路线故意不拿那册书）
	if (pcOf(w).ev.star_ledger !== true) throw new Error('察觉路没换来天文台的那半幅星轨');
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
	await c('找那位握着哨子的人');
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

// ── 路线 30：女巫小屋只治一次（#168 P1-3 满血门 · 行为侧）──
async function routeWitchHealOnce() {
	const { w, click, uncaught } = await newGame(0.99);
	const pc = pcOf(w);
	pc.max_hp = 14;
	pc.hp = 1;
	await click('问一句女巫小屋怎么走');   // 第一次见面：她给一次见面礼
	if (pcOf(w).hp !== pcOf(w).max_hp) throw new Error('首次见面没有回满（她该给一次见面礼）');
	pcOf(w).hp = 1;
	await w.SugarCube.Engine.play('女巫小屋');
	await sleep(200);
	if (pcOf(w).hp !== 1) throw new Error(`第二次带伤进门又回满了（${pcOf(w).hp}）——免费无限回血会让药膏与伤害失去意义`);
	if (uncaught.length) throw new Error(`uncaught：${uncaught[0].slice(0, 160)}`);
	return { w };
}

// ── 变基后文本复审：时代、入门前提与日记线索必须对应当前经历 ──
async function routeTextContext() {
	const { w, click: c } = await newGame(0.99, 0);
	const problems = [];
	const check = (ok, message) => { if (!ok) problems.push(message); };
	await toWitch(c);
	await toTower(c);
	check(passageText(w).includes('枯掉的月光花'), '现在的小径缺少枯花对照');
	await c('坠入');
	check(!passageText(w).includes('枯掉的月光花'), '过去的小径仍先描写未来才有的枯花');
	await c('继续往塔那边走');
	// #219 B1③：宴当晚大门对谁都开（原「现在的认可对三百年前门卫生效」是矛盾）
	check(linksOf(w).some((x) => x === '推门进去'), '过去大门该对谁都开（宴当晚开门迎客）');
	await c('塔基墙根那片花');
	check(!passageText(w).includes('花瓣都朝上张着'), '过去的花田仍描写盛开的花');
	await c('回塔门');
	await c('翻转护身符：回到');
	await getKey(c);
	await c('出塔，回到塔外');
	check(!passageText(w).includes('进不去'), '已见守林人后仍提示过去的大门进不去');
	await c('翻转护身符：坠入');
	await c('推门进去');
	await c('下楼赴宴');
	check(!passageText(w).includes('睡着一条龙'), '过去的宴会厅在喂花前就写龙睡着了');
	check(!passageText(w).includes('雾从它身上'), '过去的宴会厅仍写三百年后的雾');
	check(!passageText(w).includes('路费'), '未读日记就把雾的来历当作已知');
	await c('翻转护身符：回到');
	check(passageText(w).includes('睡着一条龙'), '现在的宴会厅缺少沉睡状态');
	check(!passageText(w).includes('路费'), '现在的宴会厅在未读日记时提前解释路费');
	await c('安静地退出去');
	await c('先上二楼看看');
	check(!passageText(w).includes('缺的从来不是咒'), '取出日记前提前显示内文');
	await c('伸手去摸烤炉后头的暗格');
	await c('把暗格里的东西取出来');
	check(pcOf(w).inv['日记'] && pcOf(w).inv['传送术卷轴'], '日记和卷轴未按既有规则取得');
	check(passageText(w).includes('缺的从来不是咒'), '日记取出后关键内文被同页重绘吃掉');
	check(w.document.activeElement?.textContent.includes('缺的从来不是咒'), '取出后焦点没有跟随日记线索');
	await c('到拐角的小工坊看看');
	await c('上三楼');
	await c('上顶楼');
	await c('下楼，打开地下那道门');
	check(!passageText(w).includes('路费'), '读过日记也不许点破雾的来历（v17 补正 #7：谜底只在设定集）');
	if (problems.length) throw new Error(problems.join('；'));
	return { w };
}

// #338/#357 约定：**第三列 `{ synthetic: true }`** 标记「夹具注入 + 少量点击」的构造性用例——
// 它们仍会跑（覆盖门需要），但不计入 C4/E4 的「完整路线」样本（否则抬高家族数、压低最少交互数，
// 扰动家族下限与 E4 里程碑带；实测两次：E4 最早交互数 3<5、C4 家族 18→19 打掉 R1b 自证）。
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
	['夺杖检定（#219 B1①）', routeSeizeStaffFail],
	['宴散自动回未来（#219 A3/C1②）', routeBanquetEnds],
	['劝杀三路可败可收（#230）', routePersuadeFail],
	['龙·巢边', routeLair],
	['老妇人', routeOldWoman],
	['自愿的长眠', routeSleepVoluntary],
	['时代分叉', routeEraBranches],
	['花田死亡', routeFlowerDeath],
	['花田·哥布林情报', routeFlowerGoblin],
	['换哨双门槛', routeExchangeGate],
	['酒馆·把桌子听遍', routeTavernAllTables],
	['打听·碰壁与请酒', routeTavernAsk],
	['情报自己问（免检暗格）', routeAskForIt],
	['非酋不读档（换属性路）', routeNoSaveScum],
	['书房免伤路（#199）', routeStudyKnock],
	['中性骰金路径（#196）', routeNeutralGold],
	['唤醒不洗状态（#178）', routeNoDragonWash],
	['乱翻的代价（星力软限）', routeTooManyFlips],
	['结局页收尾（C1）', routeEndingFooter],
	['女巫小屋·只治一次', routeWitchHealOnce],
	['文本上下文（时代与日记）', routeTextContext],
	['交付后互锁（#259）', routeDeliveredLocks, { synthetic: true }],   // 夹具驱动（13 处 w.eval / 0 点击）——不入 C4/E4 样本
	['退出选项指向（#308/#312）', routeExitLabels, { synthetic: true }], // 夹具驱动（4 处 w.eval / 1 点击）——不入 C4/E4 样本
	['选项指向与措辞（#309/#311/#313）', routeClarityB],
	['投入—回报（#291 I1）', routeInvestment],
	['跨周目粘性（#271）', routeCrossRunSticky],
];

const results = await Promise.all(routes.map(async ([name, fn, meta]) => {
	if (meta?.synthetic) syntheticRoutes.add(name);
	try {
		await routeCtx.run(name, fn);   // #295：把路线名绑到该路线的异步上下文上
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
writeFileSync('build/coverage-links-scenarios.json', JSON.stringify({ links: Object.fromEntries([...clickedLinks].map(([k, v]) => [k, [...v].sort()]).sort((a, b) => a[0].localeCompare(b[0]))) }, null, 1));
// #295：路线轨迹（E4 节奏 / C4 相异度 的原始数据）
writeFileSync('build/route-traces.json', JSON.stringify({
	routes: Object.fromEntries([...traces].sort((a, b) => a[0].localeCompare(b[0]))),
	passageTexts: Object.fromEntries([...passageTexts].sort((a, b) => a[0].localeCompare(b[0]))),
}, null, 1));
console.log(`\n路线 ${routes.length} 条 · 交互覆盖 ${visited.size} 格`);
if (failures) { console.error(`✗ ${failures} 条路线失败`); process.exit(1); }
console.log('✔ 分支场景测试通过');
process.exit(0);
