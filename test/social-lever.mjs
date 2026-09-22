// 交涉筹码分派门（`#360`）—— **保覆盖版**（`#1011`）
//
// 来历：原件在 `#1004` B 段退役（`test/social-lever.mjs` 的样本＝旧故事内容专属）。
// 本件把它**接回来**：**换样本，不换标准** —— 样本换成 `face-fixture` 里 `老板娘·进塔`
// 那条 ask 的两枚筹码（`read`＝`adv`／`drink`＝`auto`+`econ`），三块判据逐条保持原强度。
//
// 判据（与退役件逐条对应，`#360` 实锤：UI 把 `gives:'adv'` 的筹码标成「后续更有把握」，
// 点击后却走 lever 分支的「免检完成」路径 → 诉求当场 done、掷骰从未发生）：
// ① **adv 筹码** → **不完成诉求** ＋ 记 `pc.ev.soc_lever` ＋ 面板回显「**下一掷有优势**」
// ② **随后选手段掷骰** → `last_roll.adv` 为真 ＋ `advWhy` **取自该筹码的 `note`** ＋ `soc_lever` **被消费后清空**
// ③ **auto／econ 筹码** → **仍然免检完成**（不得被 ① 的修复一起改坏）＋（econ）**真的扣钱**
//
//注意：与退役件的**唯一取值方式差异**（**判据强度不变**）：`advWhy` 的期望文案**不写死** ——
// 从夹具数据 `tables.json` 读该筹码的 `note` 再断言 `advWhy` **包含**它
//（旧件写死「先人」是**旧样本的内容**，换样本就得跟着换值；写死新值会把下一轮"换样本"再罚一次）。
//
//注意：**驱动面（如实声明，见件尾"覆盖面差异"）**：退役件点 DOM 上的 `a.soc-opt` 走**点击处理器**；
// 夹具的 `<<socpanel>>` 是**裸调用**（不传 ask id → 什么都不渲染，实测 0 面板）→ 点击路径
// **在夹具里没有可点的消费者** → 本件改走引擎为**本测试专门抽出**的入口
//（`src/10-core.twee` `<<widget "socresolve">>` 件头原话：「抽出的意义：`test/social-lever.mjs`
// 可以**不经浏览器驱动整个交涉回合**」）→ `Game.Social.resolveAsk(...)` ＋ **真渲染面板**
//（`new SugarCube.Wikifier(host, '<<socpanel "老板娘·进塔">>')`）做「面板回显」那一条。
//
// 用法：node test/social-lever.mjs
import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

// 样本与筹码：**从夹具数据读**（单源，不写死 id／文案）
const ASK_ID = '老板娘·进塔';
const tables = JSON.parse(readFileSync(new URL('../stories/face-fixture/data/tables.json', import.meta.url), 'utf8'));
const ask = tables.containers.Social.asks.find((a) => a.id === ASK_ID);
if (!ask) { console.error(`✗ 夹具里找不到 ask「${ASK_ID}」（样本改了吗？）`); process.exit(1); }
const advLever = (ask.levers ?? []).find((l) => l.gives === 'adv');
const econLever = (ask.levers ?? []).find((l) => l.econ);
if (!advLever || !econLever) { console.error('✗ 夹具该 ask 缺 adv 或 econ 筹码——本件样本前提不成立'); process.exit(1); }

let bad = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { bad++; console.error(`  ✗ ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { w } = await boot({ random: 0.5 });

/** 基线角色（只跑一次）：金币、库存、世界旗标 */
const prep = () => {
	w.eval(`(function(){
		const pc = SugarCube.State.variables.pc;
		pc.max_hp = pc.max_hp || 18; pc.hp = pc.max_hp;
		pc.gold = 50; pc.inv = pc.inv || {}; pc.world = pc.world || {};
	})()`);
};
/** 把夹具的 ask 打开（`resolveAsk` 前提：`pc.ev.soc.id === ask.id`）
 *注意：**每一步都要重开** —— 这正是引擎点击处理器的做法
 *（`src/80-script.twee` `click.sgSocial`：每次先写 `pc.ev.soc = {id, how}` 再 `Engine.play`）
 * → 本件按同一时序驱动。
 *注意：`pc.soc` 要**全形** `{att,tries,read}`（引擎 `settle()` 自己初始化的就是这三键）——
 * 只给 `read` 会让 `shift()` 写 `pc.soc.att[npc]` 时抛错（实测：先扣了钱、却在 `shift` 上炸）。 */
const openAsk = () => {
	w.eval(`(function(){
		const pc = SugarCube.State.variables.pc;
		pc.soc = pc.soc || {};
		pc.soc.att = pc.soc.att || {}; pc.soc.tries = pc.soc.tries || {}; pc.soc.read = pc.soc.read || {};
		pc.soc.read[${JSON.stringify(ask.npc)}] = true;        // adv 筹码的 needRead 前提 ✓
		pc.ev = pc.ev || {};
		pc.ev.soc = { id: ${JSON.stringify(ASK_ID)} };
	})()`);
};
const pcv = () => w.SugarCube.State.variables.pc;
const call = (how) => w.eval(`Game.Social.resolveAsk(SugarCube.State.variables.pc, ${JSON.stringify(ASK_ID)}, ${JSON.stringify(how)})`);
const done = () => w.eval(`Game.Social.askDone(Game.Social.ask(${JSON.stringify(ASK_ID)}), SugarCube.State.variables.pc)`);
//注意：**不要拿 `done()` 当「诉求完成了吗」** —— 夹具的 `done.req` 用了键形 `note:<id>`，
// 而求值器**不认该前缀**（实测：note 已授予时 `matches({req:['note:n_x']})` **仍为 false**，
// 而 `{req:['n_x']}` 为 true）→ `askDone()` **恒假** → 拿它做断言＝**平凡真（假绿）**（本件首版就差点这么写）。
// → 改用**真的落账面**：本 ask 的 `yields` 里那枚笔记是否已授予（＝ `applyAskEffect` 的产物）。
const yieldId = String((ask.yields ?? [])[0] ?? '');
if (!yieldId) { console.error('✗ 夹具该 ask 没声明 yields——本件样本前提不成立'); process.exit(1); }
const granted = () => w.eval(`window.Sg.notes.has(${JSON.stringify(yieldId)}, SugarCube.State.variables.pc)`);
/** 用**真 widget** 渲染面板，取其文本（不是自造 HTML） */
const panelText = () => {
	const host = w.document.createElement('div');
	host.className = '__sl_host';
	w.document.querySelector('#passages .passage').appendChild(host);
	new w.SugarCube.Wikifier(host, `<<socpanel "${ASK_ID}">>`);
	const t = host.textContent;
	host.remove();
	return t;
};

prep();   // 基线角色（只跑一次）
console.log('══ 交涉筹码分派门（#360 · 保覆盖版 #1011）══');
console.log(`   样本：${ASK_ID}（夹具）｜adv 筹码＝${advLever.id}「${advLever.name}」｜econ 筹码＝${econLever.id}「${econLever.name}」`);

// ── ① adv 筹码：只给优势，不完成诉求 ────────────────────────────────────
try {
	w.eval('delete SugarCube.State.variables.pc.ev.soc_lever; delete SugarCube.State.variables.pc.ev.soc_last; delete SugarCube.State.variables.pc.ev.last_roll;');
	openAsk();
	const gold0 = pcv().gold;
	call(`lever:${advLever.id}`);
	await sleep(30);
	ok(granted() === false, `#360：优势筹码不得直接完成诉求（笔记 ${yieldId} 未授予=${!granted()}；修前会当场授予）`);
	ok(pcv().ev.soc_lever === advLever.id, `#360：优势筹码应记入 soc_lever（实际 ${pcv().ev.soc_lever ?? 'null'}）`);
	ok(pcv().gold === gold0, `#360：adv 筹码不该花钱（${gold0} → ${pcv().gold}）`);
	ok(panelText().includes('下一掷有优势'), '#360：面板应回显「下一掷有优势」');
} catch (e) { bad++; console.error(`  ✗ ① adv 筹码用例异常：${String(e.message).slice(0, 140)}`); }

// ── ② 随后选手段掷骰：吃优势 ＋ advWhy 来自筹码 note ＋ 消费后清空 ──────
try {
	const site = w.eval(`(function(){ const a = Game.Social.ask(${JSON.stringify(ASK_ID)}); const o = Game.Social.open(a, SugarCube.State.variables.pc); return o.length ? o[0].site : null; })()`);
	if (!site) { bad++; console.error('  ✗ ② 该 ask 没有可用的「手段」位点——样本前提变了'); }
	else {
		openAsk();
		call(`site:${site}`);
		await sleep(30);
		const r = pcv().ev.last_roll;
		ok(!!r && (r.adv ?? 0) > 0, `#360：优势筹码后的手段掷骰应吃优势（adv=${r?.adv ?? 'undefined'}）`);
		ok(String(r?.advWhy ?? '').includes(advLever.note), `#360：优势理由应取自筹码的 note「${advLever.note}」（实际「${r?.advWhy ?? ''}」）`);
		ok(pcv().ev.soc_lever == null, '#360：优势筹码被这一掷消费后应清空 soc_lever');
	}
} catch (e) { bad++; console.error(`  ✗ ② 优势掷骰用例异常：${String(e.message).slice(0, 140)}`); }

// ── ③ econ 筹码：仍然免检完成 ＋ 真的扣钱 ────────────────────────────────
try {
	w.eval('const pc0 = SugarCube.State.variables.pc; delete pc0.ev.soc_lever; delete pc0.ev.soc_last; delete pc0.ev.last_roll;');
	openAsk();
	const gold0 = pcv().gold;
	call(`lever:${econLever.id}`);
	await sleep(30);
	ok(pcv().gold < gold0, `#360：econ 筹码应真的扣钱（${gold0} → ${pcv().gold}）`);
	ok(granted() === true, `#360：免检筹码仍应直接完成诉求（笔记 ${yieldId} 已授予=${granted()}；不能被优势修复一起改坏）`);
} catch (e) { bad++; console.error(`  ✗ ③ 免检筹码用例异常：${String(e.message).slice(0, 140)}`); }

// ── 覆盖面差异（**如实声明**）────────────────────────────────────────────
// 退役件覆盖的「**点击处理器接线**」这一格（`#passages a.soc-opt` 的 `click.sgSocial` → 写 `pc.ev.soc`
// → `Engine.play` → 段落顶 `<<socresolve>>` 结算）在本件**无守护** —— 因为夹具的 `<<socpanel>>`
// 是裸调用（不传 ask id → 渲染 0 面板 实测），面板里根本没有可点的 `.soc-opt`。
// → 要守住那一格，需给夹具那行加 ask 参数（`<<socpanel "老板娘·进塔">>` ＋ 段落顶 `<<socresolve "…">>`）
// → 那是 `stories/**` 的改动（**本件不擅自扩**）→ 已在 `#1011` 票内提请发起者定。

if (bad) { console.error(`\n✗ 交涉筹码分派门：${bad} 项`); w.close?.(); process.exit(1); }
console.log('\n✔ 交涉筹码按类型分派（优势只给优势／免检照旧完成／优势被消费后清空）—— `#1011` 保覆盖版，样本＝face-fixture');
w.close?.();
process.exit(0);
