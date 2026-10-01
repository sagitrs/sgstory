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
const root = path.resolve(here, '..', '..');
const load = (f) => eval(fs.readFileSync(f, 'utf8'));

/* ---------- 断言收集（✗ 用 assert 立刻抛：装配检查要一次看全部问题）---------- */
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const head = (s) => console.log(`\n─ ${s}`);

/* ---------- 环境（镜像 tests/unit/headless.mjs）---------- */
globalThis.window = globalThis;
globalThis.document = { title: '', getElementById: () => ({ insertAdjacentHTML() {}, innerHTML: '' }) };
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
	ok(map.locations.size === 13, `地点数应为 13（L1–L9 ＋ L10 三地点 ＋ L11），实为 ${map.locations.size}`);
}
console.log(`  地点 ${map.locations.size} 个｜边 ${map.exits.length} 条`);

/* ---------- ② 层与内容（1–9 层：采集点 ＋ 遭遇 ＋ 向上的路）---------- */
head('② 1–9 层逐层');
for (let i = 1; i <= 9; i++) {
	const id = `L${i}`;
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
head('③ 单向门 10 → 11');
const gate = map.exitsFrom('L10-gate');
ok(gate.some((e) => e.to === 'L11'), '`L10-gate` 没有通往 L11 的边');
ok(map.exitsFrom('L11').length === 0, `L11 有回边（不是单向门）：${map.exitsFrom('L11').map((e) => e.to).join('、')}`);
const reach = map.reachableFrom('L1');                       // Set 或数组（两种都兼容）
ok(reach.has ? reach.has('L11') : reach.includes('L11'), 'L11 从 L1 不可达');
console.log(`  L10-gate 出口：${gate.map((e) => e.to).join('、')}｜L11 出口：${map.exitsFrom('L11').length} 条`);

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
head('⑦ 穿越单向门');
map.moveTo('L10-gate');
map.moveTo('L11');
ok(map.current === 'L11', '穿门后应到 L11');
ok(State.variables.babelRun.deepest === 'L11', '`deepest` 读数没更新');
map.moveTo('L10-gate');   // 玩家在 L11 时**没有**回边的选项 ⇒ 这条仅证明图上有路，不代表 UI 会给
ok(map.exitsFrom('L11').length === 0, 'L11 出现回边');
console.log(`  当前位置：${map.current}｜deepest=${State.variables.babelRun.deepest}`);

/* ---------- 汇总 ---------- */
console.log(`\n${fails.length === 0 ? '✓ 装配自检通过' : `✗ 装配自检失败 ${fails.length} 条`}`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
