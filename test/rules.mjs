// 规则层单元测试（M1a-2 换骨后）：mod/skillMod/check/save · 车卡 3 轮 · Pc 形状迁移 · 表契约
import { readFileSync, readdirSync } from 'node:fs';
import { boot } from './boot.mjs';
let failures = 0;
const eq = (actual, expected, msg) => {
	const okk = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${okk ? '✓' : '✗'} ${msg}${okk ? '' : `（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`}`);
	if (!okk) failures++;
};
const ok = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) failures++;
};

// 白盒 A9/A10：共享 boot ×3 实例（pollUntil + uncaught；random 参数化替代手写 JSDOM）
const { w, sleep } = await boot({ random: 0.5 }); // d20 恒为 11
const R = w.Rules;

// ── 调整值 ──
eq(R.mod(10), 0, 'mod(10) = 0');
eq(R.mod(14), 2, 'mod(14) = +2');
eq(R.mod(8), -1, 'mod(8) = -1');
eq(R.mod(16), 3, 'mod(16) = +3');
eq(R.fmod(17), '+3', 'fmod(17) 带符号');
eq(R.fmod(8), '-1', 'fmod(8) 负号');
eq(R.fmod(10), '+0', 'fmod(10) 零');

// ── 技能加值 ──
const pc = { abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 15, cha: 13 }, skills: ['察觉'], flags: {} };
eq(R.skillMod(pc, '察觉'), 4, '熟练察觉：感(15)+2熟练 = +4');
eq(R.skillMod(pc, '运动'), -1, '未熟练运动：力(8) = -1');
eq(R.skillMod({ ...pc, skills: [...pc.skills, '运动'] }, '运动'), 1, '熟练运动：-1+2 = +1');
eq(R.skillMod(pc, '游说'), 1, '未熟练游说：魅(13) = +1');
ok((() => { try { R.skillMod(pc, '不存在的技能'); return false; } catch { return true; } })(), '未知技能抛错（表外技能不可静默通过）');

// ── d20 检定（random 恒定 0.5 → d20=11）──
const mid = R.check(pc, '游说', 11);
eq(mid.roll, 11, '常规骰 d20=11');
ok(mid.success, '11+1=12 ≥ DC11 → 成功');
ok(!R.check(pc, '游说', 13).success, '11+1=12 < DC13 → 失败');
eq(R.d20(1), 11, '优势取高');
eq(R.d20(-1), 11, '劣势取低');
const lucky = R.check({ ...pc, flags: { luck: true } }, '游说', 13);
ok(lucky.success && lucky.mod === 2, '机运烙印：+1 加值（12+1=13 ≥ 13）');
const bonused = R.check(pc, '游说', 20, { bonus: 6 });
ok(bonused.mod === 7, '情境加值并入修正（+1+6）');

// ── 自然 20 / 自然 1（SRD 5.2）──
const dom20 = await boot({ random: 0.999 });
const nat20 = dom20.w.Rules.check(pc, '运动', 30);
ok(nat20.roll === 20 && nat20.success, '自然 20 → 无视 DC 必然成功');
ok(dom20.w.Rules.save(pc, 'str', 25).success, '豁免同样适用自然 20 规则');
const dom1 = await boot({ random: 0.0001 });
const nat1 = dom1.w.Rules.check(pc, '察觉', 1);
ok(nat1.roll === 1 && !nat1.success, '自然 1 → 无视加值必然失败');

// ── 车卡：3 轮 × 每轮 3 选项，apply 均可执行 ──
const rounds = w.ChargenRounds;
eq(rounds.length, 3, '车卡共 3 轮（职业/背景/种族）');
ok(rounds.every((r) => r.options.length === 3), '每轮恰好 3 个选项');
ok(rounds.every((r) => r.options.every((o) => typeof o.apply === 'function')), '所有选项都有 apply 函数');
ok(rounds.every((r) => r.options.every((o) => o.name && o.desc && o.effect)), '选项均有名称/描述/效果三件套');

const v = w.SugarCube.State.variables;
const freshPc = () => { v.pc = w.Pc.defaults(); return v.pc; };
freshPc();
for (const [r, o] of [[0, 0], [1, 0], [2, 2]]) w.Chargen.pick(r, o); // 铁卫 / 佣兵 / 矮人
eq(v.pc.round, 3, '车卡完成 3 轮');
eq(v.pc.picked.length, 3, 'picked 记录 3 条');
eq(v.pc.abilities.str, 17, '铁卫 16 + 矮人 1 = 17');
eq(v.pc.abilities.con, 17, '铁卫 15 + 矮人 2 = 17');
eq(v.pc.max_hp, 12 + 2 * 3, 'HP = 职业基础 12 + 体(17→+3)×2 = 18');
eq(v.pc.hp, v.pc.max_hp, '满血出场');
eq(v.pc.gold, 10, '佣兵金币 10');
eq(v.pc.skills.filter((s) => s === '运动').length, 1, '职业/背景重复技能已去重');
ok(v.pc.gear.includes('长剑'), '职业行囊生效');
ok(v.pc.name === '无名旅人', '未取名时默认「无名旅人」');

// ── 快速模式预设：索引有效、applyPreset 数值与摘要一致 ──
const presets = w.ChargenPresets;
eq(presets.length, 3, '三套快速预设');
ok(presets.every((p) => p.picks.length === rounds.length), '每套预设覆盖全部 3 轮');
ok(presets.every((p) => p.picks.every((i, r) => i >= 0 && i < rounds[r].options.length)), '预设索引均有效');
freshPc(); w.Chargen.applyPreset(0);
eq(v.pc.abilities.str, 17, '铁卫预设：力 17');
ok(v.pc.speciesKey === 'dwarf' && v.pc.classKey === 'guard', '铁卫预设：矮人铁卫');
freshPc(); w.Chargen.applyPreset(1);
eq(v.pc.abilities.dex, 18, '影手预设：敏 18（16+精灵2）');
ok(v.pc.bgKey === 'wanderer', '影手预设：修行者出身');
freshPc(); w.Chargen.applyPreset(2);
ok(v.pc.flags.lore && v.pc.skills.includes('调查'), '秘典预设：学识烙印 + 调查');

// ── Pc 形状迁移：基础行为 + 存档兼容矩阵（fixture 驱动）──
const oldPc = { name: '旧档', round: 8, gold: 40, hp: 14, max_hp: 14, skills: ['运动'], gear: ['火把'], abilities: { str: 15 }, flags: { courage: true } };
const m1 = w.Pc.migrate(oldPc);
eq(m1.inv, {}, '旧档缺 inv → 补空对象');
ok(m1.star && typeof m1.star === 'object' && m1.star.charge === 12, '旧档缺 star → 补默认星力');
ok(m1.keeper && m1.keeper.met === false, '旧档缺 keeper → 补默认关系态');
ok(m1.dragon && m1.dragon.hp === 0, '旧档缺 dragon → 补默认战斗态');
eq(m1.gold, 40, '已有字段保留不动');
ok(m1.flags.courage === true, '嵌套已有值保留');
const m2 = w.Pc.migrate({ skills: '损坏', star: null, inv: [] });
ok(Array.isArray(m2.skills) && m2.skills.length === 0, '类型损坏修正（skills 非数组）');
ok(m2.star && typeof m2.star === 'object', '类型损坏修正（star 为 null）');
ok(!Array.isArray(m2.inv) && typeof m2.inv === 'object', '类型损坏修正（inv 为数组）');
ok(w.Pc.migrate(undefined).name === '', 'undefined → 整体默认');
w.Pc.migrate(m1);
eq(m1.gold, 40, '迁移幂等（重复跑不破坏）');
eq(Object.keys(w.Pc.defaults()).length, 25, '默认形状字段数守恒（25，防误删）');

// ── L4 存档兼容矩阵：每版历史形状一个 fixture，统一断言四条律 ──
const DEFAULT_KEYS = Object.keys(w.Pc.defaults());
const fixtureDir = 'test/fixtures/saves';
const fixtures = readdirSync(fixtureDir).filter((f) => f.endsWith('.json')).sort();
ok(fixtures.length >= 5, `存档 fixture 至少 5 版历史形状（现有 ${fixtures.length}）`);
for (const file of fixtures) {
	const fx = JSON.parse(readFileSync(`${fixtureDir}/${file}`, 'utf8'));
	const m = w.Pc.migrate(JSON.parse(JSON.stringify(fx.pc)));
	const label = file.split('.')[0];
	const missingKeys = DEFAULT_KEYS.filter((k) => !(k in m));
	ok(missingKeys.length === 0, `[${label}] 补齐：defaults 全键在（缺 ${missingKeys.join(',') || '无'}）`);
	for (const [k, want] of Object.entries(fx.keep ?? {})) {
		ok(JSON.stringify(m[k]) === JSON.stringify(want), `[${label}] 保值：${k}=${JSON.stringify(want)} 不被覆盖`);
	}
	ok(m.abilities === null || typeof m.abilities === 'object', `[${label}] 修型：abilities 型合法`);
	for (const k of ['skills', 'feats', 'gear', 'picked']) ok(Array.isArray(m[k]), `[${label}] 修型：${k} 为数组`);
	for (const k of ['inv', 'star', 'keeper', 'ev', 'dragon', 'world', 'flags']) ok(m[k] && typeof m[k] === 'object' && !Array.isArray(m[k]), `[${label}] 修型：${k} 为对象`);
	const again = w.Pc.migrate(JSON.parse(JSON.stringify(m)));
	ok(JSON.stringify(again) === JSON.stringify(m), `[${label}] 幂等：二次迁移深度相等`);
	if (fx.expectSalves !== undefined) ok(m.salves === fx.expectSalves, `[${label}] 保值：salves=${fx.expectSalves}`);
	if (fx.expectJunkKept) ok('futureVersionField' in m, `[${label}] 余键：未知字段不删（向前兼容）`);
}

// ── #28 表契约：表→行为耦合（页面域改表值，jsdom 断言行为跟随——防表/实现漂移）──
{
	ok(!!w.Game?.Checks?.sites, 'Game 表已加载（sites 在）');
	ok(!!w.Game?.Economy?.events, 'Game 表已加载（events 在）');
	ok(!!w.Game?.Items?.defs, 'Game 表已加载（Items.defs 在）');
	ok(!!w.Game?.Truth?.claims?.length, 'Game 表已加载（Truth.claims 在）');
	// ① 位点 DC：改表 → sitecheck 用新 DC
	w.eval('Game.Checks.sites["洞穴·战斗"].dc = 20');
	w.SugarCube.State.variables.pc = w.Pc.defaults();
	new w.SugarCube.Wikifier(null, '<<sitecheck "洞穴·战斗">>');
	ok(v.last_check.dc === 20, `位点 DC 表驱动：sitecheck 用表值 20（实际 ${v.last_check?.dc}）`);
	w.eval('Game.Checks.sites["洞穴·战斗"].dc = 12');
	// ② 经济事件：改表 → econ 用新金额
	w.eval('Game.Economy.events.dragon_hoard.delta = 7');
	v.pc.gold = 10;
	new w.SugarCube.Wikifier(null, '<<econ "dragon_hoard">>');
	ok(v.pc.gold === 17, `经济事件表驱动：econ 用表值 +7（实际 ${v.pc.gold}）`);
	w.eval('Game.Economy.events.dragon_hoard.delta = 10');
	// ③ 战斗伤害：改减伤 → battleDamage 跟随
	const I = w.Game.Items;
	eq(I.battleDamage(1, {}, 0), 4, 'battleDamage：空手 R1 = 3+1 = 4');
	eq(I.battleDamage(2, {}, 0), 5, 'battleDamage：空手 R2 = 3+2 = 5');
	eq(I.battleDamage(3, {}, 0), 5, 'battleDamage：空手 R3 封顶 5');
	eq(I.battleDamage(1, { 龙鳞护臂: true }, 0), 3, 'battleDamage：龙鳞护臂 −1');
	eq(I.battleDamage(1, { 日记: true, 龙鳞护臂: true }, 0), 2, 'battleDamage：日记+护臂 −2');
	eq(I.battleDamage(1, {}, 2), 6, 'battleDamage：败次 +2 封顶');
	eq(I.battleDamage(2, { 日记: true }, 5), 6, 'battleDamage：多败次封顶 +2（5 败 → +2）');
	w.eval('Game.Items.effects.日记.flatDamageReduce = 3');
	eq(I.battleDamage(1, { 日记: true }, 0), 1, `battleDamage 表驱动：日记减伤改 3 → R1 = max(1,4-3)=1（实际 ${I.battleDamage(1, { 日记: true }, 0)}）`);
	w.eval('Game.Items.effects.日记.flatDamageReduce = 1');
	// ④ 位点优势：advAt 表驱动 + 件数共鸣
	ok(I.advAt('雾之魔物·挥击', { 坏哨: true }), 'advAt：坏哨给雾之魔物挥击优势');
	ok(!I.advAt('雾之魔物·心防', { 坏哨: true }), 'advAt：坏哨不给心防优势');
	ok(I.advAt('龙·吐息', { 观星者的书: true }), 'advAt：观星者的书给吐息优势');
	ok(I.advAt('龙·斩击', { 月光花: true }), 'advAt：月光花给斩击优势');
	ok(I.advAt('龙·斩击', { a: 1, b: 2 }), 'advAt：持 2 件给终击优势（共鸣）');
	ok(!I.advAt('龙·斩击', { a: 1 }), 'advAt：1 件不给终击优势');
	// ④b 道具位点优势自动接线：坏哨 → <<sitecheck>> 自动双骰取高
	const diceQueue = [0.12, 0.82]; // d20 → 3, 17
	w.eval(`(function(){const q=${JSON.stringify(diceQueue)};Math.random=()=>q.length?q.shift():0.5;})()`);
	v.pc = w.Pc.defaults(); v.pc.inv['坏哨'] = true;
	new w.SugarCube.Wikifier(null, '<<sitecheck "雾之魔物·挥击">>');
	ok(v.last_check.roll === 17, `sitecheck 自动优势：坏哨 → 双骰取高（实际 ${v.last_check.roll}）`);
	v.pc.inv = {};
	w.eval(`(function(){const q=${JSON.stringify(diceQueue)};Math.random=()=>q.length?q.shift():0.5;})()`);
	new w.SugarCube.Wikifier(null, '<<sitecheck "雾之魔物·挥击">>');
	ok(v.last_check.roll === 3, `sitecheck 无道具：单骰（实际 ${v.last_check.roll}）`);
	w.eval('Math.random = () => 0.5');
	// ④c 情报位点优势（M6d）：老猎人的话（world.rumor）→ 洞穴战斗自动双骰取高
	ok(w.Game.Checks.knowledge?.['洞穴·战斗'] === 'rumor', 'knowledge 表：洞穴·战斗 ← world.rumor');
	const dq3 = [0.12, 0.82];
	v.pc = w.Pc.defaults(); v.pc.world.rumor = true;
	w.eval(`(function(){const q=${JSON.stringify(dq3)};Math.random=()=>q.length?q.shift():0.5;})()`);
	new w.SugarCube.Wikifier(null, '<<sitecheck "洞穴·战斗">>');
	ok(v.last_check.roll === 17, `情报优势：rumor → 双骰取高（实际 ${v.last_check.roll}）`);
	v.pc.world.rumor = false;
	w.eval(`(function(){const q=${JSON.stringify(dq3)};Math.random=()=>q.length?q.shift():0.5;})()`);
	new w.SugarCube.Wikifier(null, '<<sitecheck "洞穴·战斗">>');
	ok(v.last_check.roll === 3, `无情报：单骰（实际 ${v.last_check.roll}）`);
	w.eval('Math.random = () => 0.5');
	// ⑤ sitecheck 分流：abil 位点走 <<save>>
	w.eval('Game.Checks.sites["龙·吐息"].dc = 9');
	new w.SugarCube.Wikifier(null, '<<sitecheck "龙·吐息">>');
	ok(v.last_check?.dc === 9 && /体质/.test(v.last_check?.label ?? ''), `sitecheck 豁免分流走 save（dc=${v.last_check?.dc}，label=${v.last_check?.label}）`);
	w.eval('Game.Checks.sites["龙·吐息"].dc = 14');
	// ⑥ #25 sink 契约：gives 入账 + 烙印/技能折扣表驱动
	v.pc = w.Pc.defaults();
	v.pc.gold = 30;
	new w.SugarCube.Wikifier(null, '<<econ "salve_buy">>');
	ok(v.pc.gold === 22 && v.pc.salves === 1, `salve_buy：-8 金且 gives 入账 salves 0→1（实际 ${v.pc.gold}/${v.pc.salves}）`);
	v.pc.flags.lore = true;
	ok(w.Game.Economy.priceOf('witch_hint', v.pc) === -5, 'priceOf：学识烙印半价 8→5');
	v.pc.flags.lore = false;
	ok(w.Game.Economy.priceOf('witch_hint', v.pc) === -8, 'priceOf：无烙印原价 8');
	v.pc.skills = ['医药'];
	ok(w.Game.Economy.priceOf('salve_buy', v.pc) === -5, 'priceOf：医药熟练药膏 8→5');
	v.pc.skills = ['恐吓'];
	ok(w.Game.Economy.priceOf('goblin_bribe', v.pc) === -3, 'priceOf：恐吓熟练买路 5→3');
	v.pc.skills = [];
	ok(w.Game.Economy.priceOf('goblin_bribe', v.pc) === -5, 'priceOf：无恐吓原价 5');
	// ⑦ setflag 词汇（$pc.world 层）
	new w.SugarCube.Wikifier(null, '<<setflag "goblin_spared">>');
	ok(v.pc.world.goblin_spared === true, 'setflag 词汇：世界旗标置真');
	// ⑧ give 词汇（物品栏）
	new w.SugarCube.Wikifier(null, '<<give "日记">>');
	ok(v.pc.inv['日记'] === true && w.Pc.has('日记'), 'give 词汇：入物品栏');
	// ⑨ damage 词汇：扣血 + 药膏自动生效
	v.pc = w.Pc.defaults(); v.pc.max_hp = 14; v.pc.hp = 14; v.pc.salves = 1;
	new w.SugarCube.Wikifier(null, '<<damage 5>>');
	ok(v.pc.hp === 13 && v.pc.salves === 0, `damage 词汇：5 伤回 4 → 13/14，药膏 1→0（实际 ${v.pc.hp}/${v.pc.salves}）`);
	// ⑩ flip 词汇：时代翻转 + 隐藏星力 + 雾淡留痕（点击链接驱动）
	// ⚠ SugarCube 每次导航会克隆 State.variables：点击后必须重新取引用，否则读到旧时刻
	const V = () => w.SugarCube.State.variables;
	V().pc = w.Pc.defaults(); V().pc.inv['时光护符'] = true; V().era = 'present';
	const flipHost = w.document.createElement('div');
	new w.SugarCube.Wikifier(flipHost, '<<flip>>');
	const flipLink = flipHost.querySelector('a.link-internal');
	ok(!!flipLink && flipLink.textContent.includes('过去'), 'flip 词汇：现在时渲染「坠入过去」链接');
	flipLink.click();
	await sleep(250);
	ok(V().era === 'past' && V().pc.star.spent === 1, `flip 词汇：现在→过去，星力 spent +1（实际 ${V().era}/${V().pc.star.spent}）`);
	const flipHost2 = w.document.createElement('div');
	new w.SugarCube.Wikifier(flipHost2, '<<flip>>');
	const flipLink2 = flipHost2.querySelector('a.link-internal');
	ok(!!flipLink2 && flipLink2.textContent.includes('现在'), 'flip 词汇：过去时渲染「回到现在」链接');
	flipLink2.click();
	await sleep(250);
	ok(V().era === 'present' && V().pc.world.fog_thin === true, `flip 词汇：回现在留「雾淡」痕迹（实际 ${V().era}/${V().pc.world.fog_thin}）`);
}

console.log(failures ? `\n${failures} 项失败` : '\n规则层测试全部通过');
process.exit(failures ? 1 : 0);
