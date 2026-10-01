/* 巴别之井 · 试玩版 —— **装配自检**（故事侧脚本，✗ 规则内核）
 *
 * 这个脚本回答一个问题：**「这一段线真的能走通吗？」**
 *   —— 用车间的头无头环境（与 `tests/unit/headless.mjs` 同一套 shim）把**插件 ＋ 故事脚本**装起来，
 *      然后按票面的可玩线走一遍：L1 苏醒 → 采集 → 遭遇 → 战斗 →（死/胜）→ 聚落建设 → 单向门 → 收尾。
 *
 * 它**不是**规则用例（判定数学的用例在 `tests/unit/**`，归测试席）；这里只核**装配**：
 *   地图是否合法、层是否可达、单向门是否真的单向、跨包 API 有没有接错、桥函数的读数对不对。
 *
 * 用法（先构建，再跑）：
 *     python3 build.py stories/babel --out babel-trial.html
 *     node stories/babel/verify.mjs
 * 退出码：全部通过 0；有失败 1（并逐条打印）。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const here = import.meta.dirname;

/* ---------- 引擎根（`books#76` 相 A：故事与引擎**可**分仓）----------
 *   ① **同仓布局**（故事住在 `sgstory/stories/<名>` 里）⇒ 引擎根＝两个上级（缺省，本仓现状）；
 *   ② **拆分布局**（故事在 books 仓、引擎在别处检出）⇒ `--engine <引擎检出目录>`。
 * ⚠ 引擎根不对 ⇒ **显式报错**（✗ 静默按「文件不存在」崩 —— 那会把「路径配错」伪装成「装配坏了」）。 */
const argOf = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const engineArg = argOf('--engine');
const root = engineArg ? path.resolve(engineArg) : path.resolve(here, '..', '..');
const shimsPath = path.join(root, 'tests/unit/framework/shims.js');
if (!fs.existsSync(shimsPath)) {
	console.error(`✗ 引擎根不对：${root}\n  在该处找不到 ${path.relative(root, shimsPath)}`
		+ '\n  ⇒ 拆分仓布局请显式给：node stories/babel/verify.mjs --engine <sgstory 检出目录>');
	process.exit(2);
}
const load = (f) => eval(fs.readFileSync(f, 'utf8'));

/* ---------- 断言收集（✗ 用 assert 立刻抛：装配检查要一次看全部问题）---------- */
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const head = (s) => console.log(`\n─ ${s}`);

/** ★失败形必须是「**干净红 ＋ 汇总**」（D 席 M9 的形态：中途裸访问崩溃 ⇒ 吞掉此前已收集的失败）。
 *   故先把汇总抽成函数，并给「未捕获异常」挂兜底 —— 任何崩溃都先打印已收集的失败再退出。 */
let summaryPrinted = false;
const printSummary = (extra) => {
	if (summaryPrinted) return;                 // 幂等：崩溃兜底与正常出口只打印一次
	summaryPrinted = true;
	if (extra) fails.push(extra);
	console.log(`\n${fails.length === 0 ? '✓ 装配自检通过' : `✗ 装配自检失败 ${fails.length} 条`}`);
	for (const f of fails) console.log(`  ✗ ${f}`);
	process.exit(fails.length === 0 ? 0 : 1);
};
process.on('uncaughtException', (e) => printSummary(`★未捕获异常（脚本中途崩了）：${e?.message ?? e}`));
process.on('unhandledRejection', (e) => printSummary(`★未处理的拒绝：${e?.message ?? e}`));
/* ★**「恒绿门」自证**（本笔实测踩过：把汇总的**尾调用**搬去别处 ⇒ 脚本正常结束、`exit=0` ⇒
 *   下面十几节断言**全部沦为装饰**）。⇒ 任何「正常结束却没打印过汇总」的路径都强制红。
 *   这一条守的是**门自己**，✗ 被测物。 */
process.on('exit', () => {
	if (!summaryPrinted) {
		console.log('\n✗ 装配自检失败 1 条');
		console.log('  ✗ ★恒绿门：脚本正常结束但从未打印汇总（`printSummary()` 的调用被搬走/删掉）');
		process.exitCode = 1;
	}
});


/* ---------- 环境（镜像 tests/unit/headless.mjs）---------- */
globalThis.window = globalThis;
globalThis.document = { title: '', getElementById: () => ({ insertAdjacentHTML() {}, innerHTML: '' }) };
/* ★载入序须与引擎的 `tests/unit/headless.mjs` 一致：**host.js（宿主仿真）先于 shims.js**
 *   —— 引擎演进后 `shims` 依赖 `host`（未加载即抛「framework/host.js 未加载」）；
 *   本脚本是**故事侧消费者**，引擎换载入序时它**不会自动跟着变** ⇒ 曾在 main 上静默变红（本笔修的）。
 *   ⚠ 故此处用「**存在即加载**」的形（✗ 写死）：引擎若回退到无 `host.js` 的旧形也照跑。 */
if (fs.existsSync(path.join(root, 'tests/unit/framework/host.js'))) {
	load(path.join(root, 'tests/unit/framework/host.js'));
}
load(path.join(root, 'tests/unit/framework/shims.js'));

/** 记录「跳到哪个段落」——战斗死亡会跳「死亡回溯」，本脚本据此判定走了哪条路 */
globalThis.__played = [];
SugarCube.Engine.play = (name) => { globalThis.__played.push(name); };

load(path.join(root, 'tests/unit/dist/bundle.js'));   // 插件源码（build.py 生成）

/* ---------- 装载故事侧脚本（与 build.py 同形：IIFE ＋ RPG 别名）---------- */
const storySrc = path.join(here, 'src');
const jsFiles = [];
(function walk(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (e.name.endsWith('.js')) jsFiles.push(p);
	}
})(storySrc);
jsFiles.sort();
for (const f of jsFiles) eval(`(function (RPG, $) {\n${fs.readFileSync(f, 'utf8')}\n})(setup.RPG, jQuery);`);

const R = setup.RPG;
const RPG_create = (id) => R.createItem(id);
const D = setup.DND3;
const B = setup.BABEL;
const map = B?.map;

/* StoryInit 的变量（twee 不在本脚本里执行，故手工摆上 —— 与 meta/init.twee 逐项同形）。
 * ★ `effects: []` / `inventory: []` 不是可选项：缺 `effects` 时 `Player.contains()` 会抛
 *   （访问器桥到 `$player.effects`）—— 本自检最初就是这样抓到「StoryInit 少给一项」的。 */
State.variables.player = {
	name: '无名者', hp: 18, maxHp: 20,
	stats: setup.DND3.stats({ ac: 12, str: 12, dex: 12, heal_bonus: 0 }),
	effects: [],
};
State.variables.inventory = [];
State.variables.babelRun = { deaths: 0, kills: 0, gathered: 0, harvests: 0, traumasSeen: [], deepest: 'L1' };
State.variables.babelGiven = {};
State.variables.span1Farms = 0;
State.variables.span1Harvests = 0;

/* ---------- ① 装配面 ---------- */
head('① 装配面');
ok(!!B, '故事脚本未挂上 `setup.BABEL`（脚本没被装载？）');
ok(map instanceof R.WorldMap, '`setup.BABEL.map` 不是 WorldMap');
if (map) {
	ok(map.validate().length === 0, `地图结构不合法：${map.validate().join('；')}`);
	ok(map.validateConnectivity('L1').length === 0, `L1 出发不可达：${map.validateConnectivity('L1').join('；')}`);
	ok(map.locations.size === 26, `地点数应为 26（一段 13 ＋ 二段 L11–19 九层 ＋ L20 三地点 ＋ 故事侧军械堆/马厩），实为 ${map.locations.size}`);
}
console.log(`  地点 ${map.locations.size} 个｜边 ${map.exits.length} 条`);

/* ---------- ② 层与内容（1–9 层：采集点 ＋ 遭遇 ＋ 向上的路）---------- */
head('② 全梯逐层（一段 1–9 ＋ 二段 11–19：采集点 ＋ 遭遇 ＋ 向上的路）');
const CLIMB_LAYERS = [...Array(9).keys()].map((i) => `L${i + 1}`).concat([...Array(9).keys()].map((i) => `L${i + 11}`));
for (const id of CLIMB_LAYERS) {
	const i = Number(id.slice(1));
	const loc = map.locations.get(id);
	ok(!!loc, `缺层 ${id}`);
	if (!loc) continue;
	const acts = loc.availableActions.map((a) => (typeof a.text === 'function' ? a.text() : a.text));
	ok(acts.some((t) => t.includes('采集')), `${id} 没有采集动作`);
	ok(acts.some((t) => t.includes('遭遇')), `${id} 没有遭遇动作`);
	ok(!!B.gatherOf(id), `${id} 没有配采集点`);
	if (typeof R.layerOfLocation === 'function') ok(R.layerOfLocation(id)?.id === id, `${id} 判不出层（层表未配对？）`);
	console.log(`  ${id}：采集点 ${B.gatherOf(id)}｜动作 ${acts.length} 个`);
}
if (typeof R.layerOfLocation === 'function') {
	ok(R.layerOfLocation('L10-camp')?.id === 'L10', '`L10-camp` 判不出层 L10（最长前缀匹配失效？）');
	ok(R.layerType('L10') === 'hub', 'L10 应是 hub 型（遭遇面应结构性跳过）');
	console.log(`  L10-camp ⇒ 层 ${R.layerOfLocation('L10-camp')?.id}（type=${R.layerType('L10')}）｜层读面：#1784 在场`);
} else {
	console.log('  L10-camp ⇒ 层读面（#1784）缺席，走本图命名约定兜底（L10-* 判不出层）');
}

/* ---------- ③ 单向门（段间封闭：10 → 11 有边、11 → 无回边）---------- */
head('③ 段间封闭（10→11 接通 ＋ 20→21 只定义不挂图）');
const gate = map.exitsFrom('L10-gate');
ok(gate.some((e) => e.to === 'L11'), '`L10-gate` 没有通往 L11 的边（10→11 未接通）');
ok(!map.exitsFrom('L11').some((e) => e.to === 'L10' || e.to.startsWith('L10-')),
	`L11 有回 L10 的边（段间不是封闭的）：${map.exitsFrom('L11').map((e) => e.to).join('、')}`);
const reach = map.reachableFrom('L1');                       // Set 或数组（两种都兼容）
const has = (x) => (reach.has ? reach.has(x) : reach.includes(x));
ok(has('L11'), 'L11 从 L1 不可达');
ok(has('L20-gate'), 'L20-gate 从 L1 不可达（二段没接上？）');
/* ★ 20→21：定义存在、**图里没有**（`L21` 属三段）—— 这是「只定义不挂图」的机械判据。 */
ok(typeof D.span2GateExit === 'function', '`DND3.span2GateExit` 定义缺失');
ok(D.span2GateExit().to === 'L21', '`span2GateExit` 的 to 不是 L21');
ok(!map.locations.has('L21'), '★图里出现了 L21（`span2GateExit` 被挂上了 —— 应只定义不挂图）');
ok(!map.exitsFrom('L20-gate').some((e) => e.to === 'L21'), '★`L20-gate` 挂了通往 L21 的边');
ok(map.exitsFrom('L21').length === 0, 'L21 出现回边');
console.log(`  L10-gate ⇒ ${gate.map((e) => e.to).join('、')}｜L11 回边 ${map.exitsFrom('L11').filter((e) => e.to.startsWith('L10')).length} 条`
	+ `｜L20-gate 出口 ${map.exitsFrom('L20-gate').length} 条（L21 未挂 ✓）`);

/* ---------- ④ 采集（#1776 的真 API）---------- */
head('④ 采集闭环（L1 的碎石堆）');
map.moveTo('L1');
ok(!R.has('stone-pile'), '起点背包里不该已经有采集点');
const findAction = map.locations.get('L1').availableActions.find((a) => String(a.text).includes('翻找'));
ok(!!findAction, 'L1 没有「翻找（找采集点）」动作');
if (findAction) findAction.action();
ok(R.has('stone-pile'), '翻找后采集点没进背包');
const before = State.variables.babelRun.gathered;
B.gather();
ok(State.variables.babelRun.gathered === before + 1, `采集读数没涨：${before} → ${State.variables.babelRun.gathered}`);
ok(R.has('rock'), '采集没有产出石料（`yields` 未生效？）');
console.log(`  背包：${R.inventoryLabel()}｜读数 gathered=${State.variables.babelRun.gathered}`);

/* ---------- ⑤ 遭遇 + 战斗（#1784 的 API 缺席 / 在场两种形）---------- */
head('⑤ 遭遇 + 战斗');
map.moveTo('L1');
/* 遭遇面在场与否，是本节的**分岔点**（先判，后按分支跑）——
 *   在场（联调形：把 `#1784` 的分支并进来）：走真 API；
 *   缺席（main 形）：走**契约桩**，并先断言桥会**显式报缺**（✗ 静默降级）。 */
const encounterFaceReal = typeof R.rollEncounter === 'function' && typeof R.rollLoot === 'function';
console.log(`  遭遇面：${encounterFaceReal ? '真 API（#1784 在场）' : '桩（#1784 缺席，按契约注入）'}`);
if (!encounterFaceReal) {
	const said = [];
	const origPerform = R.perform;
	R.perform = (s) => { said.push(String(s)); return origPerform.call(R, s); };
	await B.fight({ interactive: false });   // 必须走**自动通路**：交互通路要等 UI 选择（无头会挂起）
	R.perform = origPerform;
	ok(said.some((s) => s.includes('装配缺口')), '`#1784` 缺席时应显式报「装配缺口」，实测未报');
	console.log(`  未接线时：${said.filter((s) => s.includes('装配缺口')).length} 条显式提示`);
	R.rollEncounter = (layer) => [{ ref: 'badger', elite: true, layer }];
	R.rollLoot = (layer) => [{ id: 'coin', n: 1, layer }];
}
R.give('club');                                 // 与故事里 L1 的「拾起木棒」同形：没武器就出不了手
R.equip('club');
R.rng.set(() => 0.99);   // 确定性：重击频出 ⇒ 战斗必在回合上限内分出结果
const protoHp = R.characters.get('badger').hp;
const coins0 = State.variables.inventory.filter((s) => s.id === 'coin').length;
await B.fight({ interactive: false });   // 无头环境必须走自动通路（交互通路等 UI 选择 ⇒ 会挂起）
R.rng.reset();
const badger = R.characters.get('badger');
ok(badger.hp === protoHp, `注册面单例被战斗改写（hp ${protoHp} → ${badger.hp}）—— 副本没生效`);
const run = State.variables.babelRun;
ok((run.kills > 0) !== (run.deaths > 0), `应恰好走一条路（胜/败），实测 kills=${run.kills} deaths=${run.deaths}`);
if (run.deaths > 0) {
	ok(map.current === 'L1', `死亡后应回起点层 L1，实为 ${map.current}`);
	ok(D.Player.hp === D.Player.maxHp, `死亡重生后体力应满，实为 ${D.Player.hp}/${D.Player.maxHp}`);
	ok(globalThis.__played.includes('死亡回溯'), '死亡后没有跳「死亡回溯」段落');
	ok(D.Player.effects.length === 0, `重生后应清空效果，实为 [${D.Player.effects.join(',')}]`);
} else {
	ok(State.variables.inventory.filter((s) => s.id === 'coin').length > coins0, '胜后没拿到掉落表的铜币');
	ok(D.Player.contains('fracture') || D.Player.contains('bleeding') || D.Player.contains('concussion')
		|| D.Player.effects.length === 0, '创伤面异常');   // 只核不崩
}
console.log(`  kills=${run.kills} deaths=${run.deaths}｜玩家 ${D.Player.hp}/${D.Player.maxHp}`
	+ `｜创伤 [${D.Player.effects.filter((e) => D.Traumas[e]).join(',')}]`);

/* ---------- ⑤b 死亡回起点层（票面「死亡回 1」这一步，强制走一次）----------
 * 构造：玩家体力压到 1 ＋ 把注册面单例临时配成「重甲般能打」（副本会继承）＋ rng 定值 ⇒
 *   第 1 回合必被击倒 ⇒ 走 `RPG.respawn` 的死亡分支。跑完复原单例，✗ 污染后续段落。 */
head('⑤b 死亡回起点层（强制）');
map.moveTo('L1');
const proto = R.characters.get('badger');
const savedItems = proto.items;
const savedBab = proto.stats.bab;
proto.items = [{ id: 'club', equipped: true }];
proto.stats.bab = 20;
D.Player.hp = 1;
D.Player.gain('bleeding');           // 顺手验「死亡清档」也清 persistent 创伤
R.rng.set(() => 0.5);                // d20=11、伤害骰中值 ⇒ 一击必倒、必中
globalThis.__played.length = 0;
await B.fight({ interactive: false });
R.rng.reset();
proto.items = savedItems;
proto.stats.bab = savedBab;
const r2 = State.variables.babelRun;
ok(r2.deaths === 1, `应记 1 次死亡，实为 ${r2.deaths}`);
ok(map.current === 'L1', `死亡后应回起点层 L1，实为 ${map.current}`);
ok(D.Player.hp === D.Player.maxHp, `重生后体力应满，实为 ${D.Player.hp}/${D.Player.maxHp}`);
ok(!D.Player.contains('bleeding'), '重生后跨场创伤（bleeding）应被清掉（#1760 裁定⑤）');
ok(globalThis.__played.includes('死亡回溯'), `死亡后应跳「死亡回溯」，实测跳了 [${globalThis.__played.join(',')}]`);
console.log(`  deaths=${r2.deaths}｜回层 ${map.current}｜体力 ${D.Player.hp}/${D.Player.maxHp}｜创伤 [${D.Player.effects.join(',')}]`);

/* ---------- ⑥ 第 10 层聚落（#1776 的建造/收获）---------- */
head('⑥ 聚落闭环（L10）');
map.moveTo('L10-settlement');
R.give('farm-plot');
R.give('seed', 2);
const res = R.act(D.Player, 'farm-plot', D.Player, 'build');
ok(res?.status === 'applied', `开垦失败：${JSON.stringify(res)}`);
ok(State.variables.span1Farms === 1, `农田计数应为 1，实为 ${State.variables.span1Farms}`);
R.harvest();
ok(R.has('ration'), '收获没有产出「口粮」');
ok(State.variables.span1Farms === 0, '收获后农田应清空（`#1776` 的「收完即需重耕」）');
console.log(`  开垦 ${res?.status}｜收获后 口粮=${State.variables.inventory.filter((s) => s.id === 'ration').length} 份`
	+ `｜累计收获 ${State.variables.span1Harvests}`);

/* ---------- ⑦ 穿越单向门 ---------- */
head('⑦ 穿越单向门（10→11 接通 ⇒ 二段可走）');
map.moveTo('L10-gate');
map.moveTo('L11');
ok(map.current === 'L11', '穿门后应到 L11');
ok(State.variables.babelRun.deepest === 'L11', '`deepest` 读数没更新');
ok(map.exitsFrom('L11').some((e) => e.to === 'L12'), '★L11 没有通往 L12 的路（10→11 接了但二段没接？）');
map.moveTo('L20-gate');
ok(State.variables.babelRun.deepest === 'L20', '走到 L20-gate 后 `deepest` 没更新（应记层 id L20）');
const terminus = map.locations.get('L20-gate').availableActions.map((a) => String(a.text));
ok(terminus.some((x) => x.includes('看看这一局')), '★L20-gate 没有收尾读数入口（试玩终点没搬过来）');
console.log(`  L10-gate ⇒ L11 ⇒ L12 通路 ✓｜终点已搬到 L20-gate（deepest=${State.variables.babelRun.deepest}）`);

/* ---------- ⑧ 整备闭环（**不变式：遍历全部 hub 层**）----------
 * ★本节的两次演化（两席各自的 RC，形态同族）：
 *   ① `#1785`（dev-9）：本笔是装配票 ⇒ 「整备点接了 `treatTrauma`」必须有断言 —— 否则换成常量照样全绿
 *      （那正是 `#1780` §八.2 记的 hub 解除闭环缺口）。当时只点了**一段**的 `L10-camp`。
 *   ② `#1792`（dev-9 BLOCKING ＋ T 席独立复现）：本笔**新增**了二段整备点，而本节仍只断一段
 *      ⇒ A′ 刀（把 `span2-hub.js` 的 `treatTrauma` 换常量）**exit=0**。
 * ⇒ 故本节不再「手工补一支」，改成**根因形**（dev-10 建议）：**遍历层表里所有 `hub` 层**，
 *   对每个 hub 的每个整备入口跑**同一段双向检查**（高掷治愈／低掷保留）—— 将来加 hub **自动被覆盖**。
 *   （与「遍历层组写不变式」同思路：把「哪些 hub」交给**层表**回答，✗ 由人记着补。） */
head('⑧ 整备闭环（不变式：遍历全部 hub 层）');
{
	/* hub 层的权威来源是**层表**（`#1784` 的 `layersOfType`）；该面缺席时退化为「本图里所有带歇脚动作的地点」。 */
	const hubLayers = typeof R.layersOfType === 'function'
		? R.layersOfType('hub').map((x) => x.id)
		: [...new Set([...map.locations.values()].map((l) => R.layerOfLocation(l.id)?.id).filter(Boolean))];
	const isRest = (a) => String(a.text).includes('歇一歇');
	let checked = 0;
	for (const layer of hubLayers) {
		const locs = [...map.locations.values()].filter((l) => (R.layerOfLocation(l.id)?.id ?? l.id) === layer);
		if (locs.length === 0) continue;
		const rests = locs.flatMap((l) => l.availableActions.filter(isRest).map((a) => ({ loc: l, act: a })));
		if (rests.length === 0) continue;          // 无整备入口的 hub（未来形态）不算错，跳过即可
		for (const { loc, act } of rests) {
			const id = 'bleeding';                  // 每次迭代自清理 ⇒ 各 hub 之间零干扰
			D.Player.stats.heal_bonus = 20;
			D.Player.gain(id);
			ok(D.Player.contains(id), `前置：${loc.id} 的检查需要一条可治创伤`);
			R.rng.set(() => 0.99);                  // d20 = 20 ⇒ 必成
			act.action();
			R.rng.reset();
			ok(!D.Player.contains(id), `★${loc.id} 整备**没治好**创伤 ⇒ 该 hub 接线未生效（换成常量也能过 = 本节点要堵的洞）`);

			D.Player.gain(id);
			D.Player.stats.heal_bonus = -100;
			R.rng.set(() => 0.01);                  // d20 = 1 ⇒ 必败
			act.action();
			R.rng.reset();
			ok(D.Player.contains(id), `★${loc.id} 低掷点却治好了 ⇒ DC 比对失效（判据恒真的恒等替换）`);
			D.Player.stats.heal_bonus = 0;
			D.Player.lose(id);
			checked += 1;
		}
	}
	ok(checked >= 2, `整备入口应至少覆盖 2 处（一段 L10 ＋ 二段 L20），实为 ${checked} ⇒ 不变式没生效`);
	console.log(`  hub 层 ${hubLayers.join('、')}｜整备入口 ${checked} 处，逐处 高掷治愈／低掷保留 ✓`);
}

/* ---------- ⑨ 二段遭遇（`span2` 真表；`#1791` 票面验收第 1 项）----------
 * **双向**：好的一侧抽得出二段敌人；坏的一侧 —— hub 层**结构性**抽不出、未注册层**抛错**。 */
head('⑨ 二段遭遇（span2 真表）');
{
	const r1 = R.rollEncounter('L13', { count: 1 });
	ok(r1.length === 1, `L13 抽不出遭遇（实得 ${r1.length} 条）`);
	ok(['fire-beetle', 'giant-bee', 'bombardier-beetle'].includes(r1[0]?.ref),
		`L13 抽出的不是二段敌人：${r1[0]?.ref}`);
	ok(R.rollEncounter('L20').length === 0, '★L20 是 hub，不该抽得出遭遇（结构性排除失效）');
	let thrown = null;
	try { R.rollEncounter('L99'); } catch (e) { thrown = e; }
	ok(thrown !== null, '★未注册的层应抛错（层 id 打错不该被当成「这层没遭遇」）');
	ok(R.layerType('L11') === 'climb' && R.layerType('L20') === 'hub', '二段层型不对（L11 climb／L20 hub）');
	console.log(`  L13 ⇒ ${r1.map((e) => e.ref).join('、')}｜L20 ⇒ ${R.rollEncounter('L20').length} 条｜L99 ⇒ ${thrown ? '抛错 ✓' : '未抛 ✗'}`);
}

/* ---------- ⑩ 创伤：真实暴露 ＋ 跨场存活（钝击 ⇒ 骨裂；`#1781`）----------
 * **双向**：钝击重击 ⇒ 骨裂（且**不是**失血 ⇒ 证明判据/提序是活的）；跨 `battle:end` 仍在（persistent）。 */
head('⑩ 创伤：真实暴露 ＋ 跨场存活（钝击 ⇒ 骨裂）');
{
	for (const id of Object.keys(D.Traumas)) if (D.Player.contains(id)) D.Player.lose(id);
	/* ★伤害**必须 ≥ 失血阈值 3**（且 < maxHp/2 ⇒ 不触发脑震荡）：否则「crushing 提序」这条判据
	 *   测不出来 —— 伤害 2 时两种次序都落到 `fracture`（本笔 K 刀实测：退回原序仍然全绿）。
	 *   取 1d6=3 ⇒ 伤害 2×3 = 6（≥3、<10）⇒ 提序在位才得骨裂，退回原序会得失血。 */
	const q = [0.99, 0.99, 0.4];    // 重击威胁 20／确认 20／伤害骰 1d6=3
	R.rng.set(() => (q.length ? q.shift() : 0.01));
	R.createItem('club').used(D.Player, { stats: { bab: 20, str: 10 } });   // club: type=bludgeoning
	R.rng.reset();
	ok(D.Player.contains('fracture'), '★钝击重击没有致骨裂（真实路径不通）');
	ok(!D.Player.contains('bleeding'), '★骨裂被失血遮蔽（判据提序失效）');
	const before = D.Player.hp;
	R.events.emit('battle:end', { players: [D.Player], enemies: [] });     // 跨场：一场战斗结束
	ok(D.Player.contains('fracture'), '★创伤没跨过 `battle:end`（persistent 语义失效）');
	ok(D.Player.hp === before, '`battle:end` 不该改体力');
	console.log(`  骨裂已施加 ✓｜跨场仍在 ✓｜失血未遮蔽 ✓｜体力 ${D.Player.hp}/${D.Player.maxHp}`);
}

/* ---------- ⑪ 锻造闭环（`#1788` 的 craft 面；票面验收第 3 项）----------
 * ★两半，各点一件事（第二半的由来：本节点最初只直调 `RPG.act` ⇒ 把**锻造台动作**换成 no-op
 *   仍然全绿 —— 与 dev-9 对 ⑧ 的那条 RC 同族，故必须**走动作**，不只走引擎）：
 *   ① **接线**：走 L20-forge 的**锻造台动作**锻一件（给足料 ⇒ 到手；动作若被换成 no-op ⇒ 必红）；
 *   ② **引擎原子性**：直调 `RPG.act` 料不够 ⇒ rejected 且**输入不被扣**（这条测的是 `#1788`/`#1776` 的引擎，
 *      保留在此以便一眼看到「失败不留损」成立）。 */
head('⑪ 锻造闭环（料场 ⇒ 图纸 ⇒ 铁器）');
{
	map.moveTo('L20-settlement');
	const yard = map.locations.get('L20-settlement').availableActions.find((a) => String(a.text).includes('料场'));
	ok(!!yard, 'L20-settlement 没有「料场」动作（接线缺失）');
	if (yard) yard.action();
	const bps = D.span2Blueprints();
	ok(bps.length === 6, `图纸清单应为 6 张（从注册面派生），实为 ${bps.length}`);
	ok(bps.every((id) => R.has(id)), `料场没把图纸发齐：缺 ${bps.filter((id) => !R.has(id)).join('、')}`);
	/* ⚠ 判据要**从行首**匹配「采集」：料场那条动作的文本里也含「木料」（`…（图纸与木料）`），
	 *   用 `includes('木料')` 会先命中它 ⇒ 二次调用料场（no-op）而**采不到木**（本笔实测踩过）。 */
	const woodAction = map.locations.get('L20-settlement').availableActions.find((a) => String(a.text).startsWith('采集'));
	ok(!!woodAction, 'L20-settlement 没有「采集（枯倒的木料）」动作');
	if (woodAction) woodAction.action();
	ok(R.has('wood'), '采集木料没有产出木材（锻造的输入之一）');

	const countOf = (id) => (State.variables.inventory ?? []).filter((s) => s.id === id)
		.reduce((n, s) => n + (s.charges ?? 1), 0);

	/* ② 引擎原子性（料不够 ⇒ 拒绝且不扣料） */
	const ore0 = countOf('iron-ore'), wood0 = countOf('wood');
	const r1 = R.act(D.Player, 'forge-greatsword', D.Player, 'craft');   // 巨剑＝铁矿 3 ＋ 木材 2
	ok(r1?.status === 'rejected', `★料不够时应被拒（实为 ${r1?.status}）`);
	ok(countOf('iron-ore') === ore0 && countOf('wood') === wood0, '★被拒时输入被扣了（原子性破了）');

	/* ① 接线（走**包里的锻造台动作**） */
	map.moveTo('L20-forge');
	const forge = map.locations.get('L20-forge').availableActions.find((a) => String(a.text).includes('锻造台'));
	ok(!!forge, 'L20-forge 没有「锻造台」动作（#1791 的接线缺失）');
	R.give('iron-ore', 3);
	R.give('wood', 2);
	const ore1 = countOf('iron-ore'), wood1 = countOf('wood');
	const forgedBefore = D.span2Blueprints().filter((id) => RPG_create(id)?.stats?.recipe?.yields?.[0]?.id)
		.map((id) => RPG_create(id).stats.recipe.yields[0].id).filter((id) => R.has(id)).length;
	if (forge) forge.action();
	const forgedAfter = D.span2Blueprints().filter((id) => RPG_create(id)?.stats?.recipe?.yields?.[0]?.id)
		.map((id) => RPG_create(id).stats.recipe.yields[0].id).filter((id) => R.has(id)).length;
	ok(forgedAfter > forgedBefore, '★锻造台动作没有产出任何铁器 ⇒ 接线未生效（换成 no-op 也能过的形）');
	ok(countOf('iron-ore') < ore1 && countOf('wood') < wood1, '★锻造台产出了东西但输入没减少')
	console.log(`  图纸 ${bps.length} 张 ✓｜料不够 ⇒ rejected 且不扣料 ✓｜锻造台 ⇒ 铁器 +${forgedAfter - forgedBefore} 件`
		+ `（铁矿 ${ore1}→${countOf('iron-ore')}、木材 ${wood1}→${countOf('wood')}）`);
}

/* ---------- ⑫ 军械／马厩（票面第 5 条的「可观察」）---------- */
head('⑫ 军械堆（盾）／马厩（骑乘）');
{
	map.moveTo('L20-armory');
	const takeShield = map.locations.get('L20-armory').availableActions.find((a) => String(a.text).includes('小圆盾'));
	ok(!!takeShield, '军械堆没有发盾的动作');
	if (takeShield) takeShield.action();
	ok(R.has('buckler'), '★军械堆没有发出盾（盾装备面观察不到）');
	ok(!map.locations.get('L20-armory').availableActions.some((a) => String(a.text).includes('小圆盾')),
		'★已持有的盾仍在可领列表里（`when` 前置失效）');
	map.moveTo('L20-stable');
	const takeMount = map.locations.get('L20-stable').availableActions.find((a) => String(a.text).includes('骡子'));
	ok(!!takeMount, '马厩没有发坐骑的动作');
	if (takeMount) takeMount.action();
	ok(R.has('mule'), '★马厩没有发出坐骑（骑乘面观察不到）');
	console.log(`  小圆盾 ✓（AC 前缀 ${D.Player.stats.ac}）｜骡子 ✓`);
}

/* ---------- ⑭ 通知中心（B4 · `#1798`）的**故事侧接线** ----------
 * ★承 ⑧ 的教训（den-9 的 RC：「接线有了、守卫没有」）⇒ 本笔的可见面（状态栏那一栏）也点一下：
 *   面板体／开关要**能渲染**，且「仅关键」档要真的**把常态行挡在正文外**（✗ 只存在一个函数没人调）。 */
head('⑭ 通知中心（B4）的故事侧接线');
{
	ok(typeof R.noticeToggleHTML === 'function' && typeof R.noticesHTML === 'function',
		'★B4 的呈现面不存在 ⇒ 状态栏那一栏渲染不出来');
	const before = R.noticeFilter;
	R.clearNotices();
	R.setNoticeFilter('all');
	const printed = [];
	const origDefer = R.deferOutput;
	R.deferOutput = (b) => { printed.push(1); return b(); };
	try {
		R.perform('逐回合的常态行（应被挡）。');
		R.perform('战斗结束：敌方被击败！', { channel: 'battle-end' });
		ok(printed.length === 2, '默认档下两行都应进正文（=既有无变化）');
		R.setNoticeFilter('key');
		printed.length = 0;
		R.perform('又一条常态行（应被挡）。');
		ok(printed.length === 0, '★「仅关键」档下常态行**不进正文**（✗ 只是存在开关没人用）');
		R.perform('你死在了第 3 层。', { channel: 'death' });
		ok(printed.length === 1, '★关键通道（death）的行仍进正文');
	} finally {
		R.deferOutput = origDefer;
		R.setNoticeFilter(before === 'key' ? 'all' : before);
	}
	ok(R.notices().length === 4, `★被挡下的行也要在通知缓冲里（✗ 丢证据），实得 ${R.notices().length}`);
	const toggle = R.noticeToggleHTML();
	ok(toggle.includes('data-mode='), '开关链应带 data-mode（点了才切得动）');
	ok(R.noticesHTML().includes('rpg-notice'), '面板体应渲染出条目');
	/* ★**接线**判据（✗ 只判能力存在）：状态栏（twee）里必须真的调了这两个面 ——
	 *   否则「能力有、没人用」= 玩家看不到（正是 dev-9 那条 RC 的形态）。 */
	const uiTwee = fs.readFileSync(path.join(storySrc, 'ui', 'ui.twee'), 'utf8');
	/* ★**接线**判据（✗ 只判能力存在）：开关与面板体必须**被故事侧真的调了** ——
	 *   否则「能力有、没人用」= 玩家看不到（正是 dev-9 那条 RC 的形态）。
	 *   ⚠ B1 之后这两处从 twee **移进了面板渲染函数**（`ui/panels.js`）⇒ 判据改为**两处都看**
	 *   （✗ 写死「必须在 twee 里」—— 那会随版式演进假红）。 */
	const uiPanelJs = fs.readFileSync(path.join(storySrc, 'ui', 'panels.js'), 'utf8');
	const wired = (needle) => uiTwee.includes(needle) || uiPanelJs.includes(needle);
	ok(wired('noticeToggleHTML'), '★故事侧没调 `noticeToggleHTML` ⇒ 开关渲染不出来（能力有、接线没有）');
	ok(wired('noticesHTML'), '★故事侧没调 `noticesHTML` ⇒ 面板体空');
	ok(wired('notice') && (uiTwee.includes('data-panel="notice"') || uiPanelJs.includes("registerPanel('notice'")),
		'★通知面板既没宿主也没注册');
	/* C1 的接线（状态栏有没有真的换用可点标签） */
	ok(wired('inventoryLinks'), '★故事侧没换用 `inventoryLinks()` ⇒ 道具名点不动（C1 的可见面没接上）');
	ok(uiTwee.includes('inventory-links'), '状态栏缺 `.inventory-links` 容器');
	console.log(`  开关：${toggle.replace(/<[^>]*>/g, '')}｜缓冲 ${R.notices().length} 条（含被挡的两条）`);
}

/* ---------- ⑮ 面板刷新域（B1 · `#1798`）的故事侧接线 ----------
 * ★判据形态（承 dev-9／dev-10 两轮 RC）：
 *   ① 「注册的宿主 ↔ 骨架里的宿主」**双向**一致（任一侧改名／多余宿主都要红）
 *   ② 接线判据要看**活行**（✗ 裸 `includes` —— 把绑定注释掉、字符串仍在 ⇒ 空刀）
 *   ③ 渲染函数**真的读状态**（逐面板两向，✗ 只看某一条）
 *   ④ **调用面**存在（本笔曾顺手删掉一条与版式无关的调用而无人抓 ⇒ 单列） */
head('⑮ 面板刷新域（B1）的接线');
{
	/** 去掉注释行后仍含该串（✗ 裸 `includes`：注释里含该串会被当成接线） */
	const liveLines = (src, needle) => src.split('\n')
		.filter((l) => l.includes(needle) && !/^\s*(\/\/|\*|\/\*)/.test(l));
	const uiTwee = fs.readFileSync(path.join(storySrc, 'ui', 'ui.twee'), 'utf8');
	const panelsJs = fs.readFileSync(path.join(storySrc, 'ui', 'panels.js'), 'utf8');
	const uiCore = fs.readFileSync(path.join(root, 'src', 'core', '70-ui.js'), 'utf8');
	const noticeCore = fs.readFileSync(path.join(root, 'src', 'core', '71-notice.js'), 'utf8');

	ok(typeof R.registerPanel === 'function' && typeof R.refreshPanels === 'function', '★B1 的面板面不存在');
	/* ★`want` **动态取自注册表**（✗ 硬编码 4 个 —— 那样「通知」永远被跳过） */
	const panels = [...R.panels.keys()];
	ok(panels.length >= 5, `★面板数应 ≥ 5（体力/位置/创伤/背包/通知），实得 ${panels.length}：${panels.join('、')}`);
	const hostsInMarkup = [...uiTwee.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);

	/* ① 双向一致：逐面板（宿主选择器里的**容器 class** 也要在骨架里；`?.` ⇒ 缺注册时干净红✗崩溃） */
	for (const id of panels) {
		const host = R.panels.get(id)?.host;
		ok(!!host, `★面板「${id}」没有宿主选择器`);
		if (!host) continue;
		ok(host.includes(`data-panel="${id}"`), `★面板「${id}」宿主（${host}）与骨架属性不一致`);
		for (const cls of host.match(/\.[A-Za-z][\w-]*/g) ?? []) {
			const name = cls.slice(1);
			/* ★class 值内的**词匹配**（两次 RC 后的定形）：
			 *   ① 初版 `includes('class="statusbar')` 是**无锚前缀** ⇒ `class="statusbarX"` 变体全绿（T 席 RC-1）；
			 *   ② 中版 `class="[^"]*(?:^|\s)<name>…"` 里 **`^` 在 `[^"]*` 之后永不成立** ⇒ 首类名位不匹配，
			 *      靠 `includes(\`${name}"\`)` 兜底掩盖 ⇒ 而该兜底对**多类名**（`class="statusbar extra"`，
			 *      本仓多处此形）失效 ⇒ **误伤合法版式**（T 席 RC-2 自纠）。
			 *   正解：`class="(?:[^"]*\s)?<name>(?=[\s"]|$)` —— 可选前导（覆盖首类名与后续类名），
			 *      ✗ 去 `^`；并**删掉 fallback**（它就是掩盖首类名失败的那一支）。 */
			ok(new RegExp(`class="(?:[^"]*\\s)?${name}(?=[\\s"]|$)`).test(uiTwee),
				`★面板「${id}」宿主的容器「${cls}」不在 twee 骨架里（容器改名 ⇒ 面板写到空处）`);
		}
		ok(hostsInMarkup.includes(id), `★骨架里没有面板「${id}」的宿主`);
	}
	/* ①′ 反向：骨架里每个宿主都得有人注册（多一个 ghost 宿主 ⇒ 红） */
	for (const id of hostsInMarkup) ok(R.panels.has(id), `★骨架里有**无人注册**的宿主 data-panel="${id}"`);

	/* ② 接线须是**活行** */
	ok(liveLines(panelsJs, ':passagedisplay').length > 0, '★填充点（`:passagedisplay` 绑定）不在了');
	ok(liveLines(panelsJs, 'refreshPanels()').length > 0, '★填充点没调 `refreshPanels()`');
	ok(liveLines(panelsJs, 'noteTraumas').length > 0,
		'★`noteTraumas` 的**调用面**不见了（每段落兜底 ⇒ 删了则「见过的创伤」恒空，且无面能抓）');
	ok(liveLines(uiCore, "refreshPanels(['inventory'])").length > 0, '★C1 的点击后重绘没走局部刷新域');
	ok(liveLines(noticeCore, "refreshPanels(['notice'])").length > 0,
		'★通知开关的重绘没走面板注册表（自己找 DOM 写 ⇒ 计数恒 0、同一结构两个产出者）');

	/* ③ 渲染函数真的读状态（逐面板；先归一创伤态，免「本来就持有 ⇒ 加不上 ⇒ 假红」） */
	for (const id of Object.keys(D.Traumas)) D.Player.lose(id);
	const before = {};
	for (const id of panels) before[id] = R.panelHTML(id);
	D.Player.hp -= 1;
	D.Player.gain('bleeding');
	const changed = panels.filter((id) => R.panelHTML(id) !== before[id]);
	D.Player.hp += 1;
	D.Player.lose('bleeding');
	ok(changed.includes('hp'), '★体力面板的渲染函数没读状态');
	ok(changed.includes('trauma'), '★创伤面板的渲染函数没读状态（改状态而面板体不变）');
	const invHTML = R.panelHTML('inventory');
	ok(invHTML.includes('rpg-item-link') || invHTML.includes('（空）'),
		`背包面板体应是可点标签（C1 的形），实得：${invHTML.slice(0, 60)}`);
	console.log(`  面板 ${panels.length} 个（${panels.join('、')}）｜宿主双向一致 ✓｜活行判据 ✓｜状态两向（${changed.join('、')}）✓`);
}

/* ---------- 汇总 ---------- */
/* 汇总与崩溃兜底的**定义**在文件开头**（见「失败形」一节）—— 那两行 `process.on` 必须在
 * 任何可能抛错的语句之前注册，否则中途崩溃时兜底还没挂上（本笔 M9′ 刀实测踩过）。 */

/* ★正常出口：**必须**在这里调用（`#1815` 的 BLOCKER：这一行被搬走 ⇒ 门恒绿）——
 *   连同上面的 `process.on('exit')` 自证，两层守「断言不是装饰」。 */
printSummary();

