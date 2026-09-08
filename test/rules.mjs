// 规则层单元测试：mod/skillMod/check/	save/修饰栈/车卡数据完整性
import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';
let failures = 0;
const eq = (actual, expected, msg) => {
	const ok = actual === expected;
	console.log(`${ok ? '✓' : '✗'} ${msg}${ok ? '' : `（期望 ${expected}，实际 ${actual}）`}`);
	if (!ok) failures++;
};
const ok = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) failures++;
};

// 白盒 A9/A10：共享 boot ×3 实例（pollUntil + uncaught；random 参数化替代三份手写 JSDOM）
const { w } = await boot({ random: 0.5 }); // d20 恒为 11

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
const pc = {
	abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 15, cha: 13 },
	skills: ['察觉'],
	flags: {},
};
eq(R.skillMod(pc, '察觉'), 4, '熟练察觉：感(15)+2熟练 = +4');
eq(R.skillMod(pc, '运动'), -1, '未熟练运动：力(8) = -1');
eq(R.skillMod({ ...pc, skills: [...pc.skills, '运动'] }, '运动'), 1, '熟练运动：-1+2 = +1');
eq(R.skillMod(pc, '游说'), 1, '未熟练游说：魅(13) = +1');

// ── d20 检定（随机数恒定 0.5 → d20=11）──
const mid = R.check(pc, '游说', 11);
eq(mid.roll, 11, '常规骰 d20=11');
ok(mid.success, '11+1=12 ≥ DC11 → 成功');
const miss = R.check(pc, '游说', 13);
ok(!miss.success, '11+1=12 < DC13 → 失败');

// 优势/劣势：双骰仍为 11/11
eq(R.d20(1), 11, '优势取高');
eq(R.d20(-1), 11, '劣势取低');

// 机运烙印 +1
const lucky = R.check({ ...pc, flags: { luck: true } }, '游说', 13);
ok(lucky.success && lucky.mod === 2, '机运烙印：+1 加值（12+1=13 ≥ 13）');

// ── 修饰栈（Another-RPG-Engine Stat 模式）──
const stat = R.makeStat(10);
eq(stat.value, 10, '修饰栈基值');
stat.add('装备', 2);
stat.add('诅咒', -1);
eq(stat.value, 11, '叠加修饰 10+2-1');
stat.remove('装备');
eq(stat.value, 9, '移除装备修饰 10-1');

// ── 自然 20 / 自然 1（SRD 5.2）──
// nat20/nat1：boot 参数化 random（A10——不再为骰子 stub 起两份手写 JSDOM）
const dom20 = await boot({ random: 0.999 });
const nat20 = dom20.w.Rules.check(pc, '运动', 30); // 20-1=19 < 30，仍应成功
ok(nat20.roll === 20 && nat20.success, '自然 20 → 无视 DC 必然成功');
const nat20save = dom20.w.Rules.save(pc, 'str', 25);
ok(nat20save.success, '豁免同样适用自然 20 规则');

const dom1 = await boot({ random: 0.0001 });
const nat1 = dom1.w.Rules.check(pc, '察觉', 1); // 1+4=5 ≥ 1，仍应失败
ok(nat1.roll === 1 && !nat1.success, '自然 1 → 无视加值必然失败');

// ── 车卡数据完整性：8 轮 × 每轮 3 选项，apply 均可执行 ──
const rounds = w.ChargenRounds;
eq(rounds.length, 8, '车卡共 8 轮');
ok(rounds.every((r) => r.options.length === 3), '每轮恰好 3 个选项');
ok(rounds.every((r) => r.options.every((o) => typeof o.apply === 'function')), '所有选项都有 apply 函数');

// 逐轮选第一个选项，走完整车卡
const pc2 = w.SugarCube.State.variables;
pc2.pc = { name: '', round: 0, picked: [], abilities: null, skills: [], feats: [], gear: [], flags: {}, gold: 0, has_torch: false, has_rope: false, salve_used: false };
rounds.forEach((r, i) => w.Chargen.pick(i, 0));
eq(pc2.pc.round, 8, '车卡完成 8 轮');
eq(pc2.pc.abilities.str, 15, '勇武数组：力量 15');
eq(pc2.pc.abilities.int, 12, '学者背景：智力 10+2=12');
eq(pc2.pc.max_hp, 12, '战士 10+体(14→+2) = 12（首轮选警觉无HP加成）');
eq(pc2.pc.hp, 12, '满血出场');
eq(pc2.pc.gold, 20, '学者 10 + 人类 10 = 20 金币');
ok(pc2.pc.skills.includes('运动') && pc2.pc.skills.includes('察觉'), '技能包生效');
ok(pc2.pc.has_torch && pc2.pc.has_rope, '火把与绳索行囊生效');
ok(pc2.pc.flags.courage, '命运烙印生效');

// ── 快速模式预设：索引有效、applyPreset 数值与摘要一致 ──
const presets = w.ChargenPresets;
eq(presets.length, 3, '三套快速预设');
ok(presets.every((p) => p.picks.length === rounds.length), '每套预设覆盖全部 8 轮');
ok(presets.every((p) => p.picks.every((i, r) => i >= 0 && i < rounds[r].options.length)), '预设索引均有效');

// 铁卫：力17 体15 / HP 14 / 火把与绳索
pc2.pc = { name: '', round: 0, picked: [], mode: '', abilities: null, skills: [], feats: [], gear: [], flags: {}, gold: 0, has_torch: false, has_rope: false, salve_used: false };
w.Chargen.applyPreset(0);
eq(pc2.pc.abilities.str, 17, '铁卫：力 17');
eq(pc2.pc.max_hp, 14, '铁卫：HP 14');
eq(pc2.pc.gold, 15, '铁卫：佣兵金币 15');
ok(pc2.pc.has_torch && pc2.pc.has_rope, '铁卫：火把与绳索');

// 影手：精灵游荡者 HP 10 / 金币 12+5=17
pc2.pc = { name: '', round: 0, picked: [], mode: '', abilities: null, skills: [], feats: [], gear: [], flags: {}, gold: 0, has_torch: false, has_rope: false, salve_used: false };
w.Chargen.applyPreset(1);
eq(pc2.pc.max_hp, 10, '影手：HP 10');
eq(pc2.pc.gold, 17, '影手：金币 17（修行者12+游荡者5）');
ok(pc2.pc.flags.luck && pc2.pc.speciesKey === 'elf', '影手：机运烙印与精灵');

// 秘典：巫师 HP 7 / 学识烙印
pc2.pc = { name: '', round: 0, picked: [], mode: '', abilities: null, skills: [], feats: [], gear: [], flags: {}, gold: 0, has_torch: false, has_rope: false, salve_used: false };
w.Chargen.applyPreset(2);
eq(pc2.pc.abilities.int, 17, '秘典：智 17');
eq(pc2.pc.max_hp, 7, '秘典：HP 7（6+1）');
ok(pc2.pc.flags.lore && pc2.pc.gear.includes('药膏'), '秘典：学识烙印与药膏');
ok(pc2.pc.skills.filter((s) => s === '历史').length === 1, '秘典：学者/巫师重复历史技能已去重');

// ── Pc 形状迁移：基础行为 + 存档兼容矩阵（#15，fixture 驱动）──
const oldPc = { name: '旧档', round: 8, gold: 40, hp: 14, max_hp: 14, skills: ['运动'], gear: ['火把'], abilities: { str: 15 }, flags: { courage: true } };
const m1 = w.Pc.migrate(oldPc);
eq(m1.tokens.length, 0, '旧档缺 tokens → 补空数组');
ok(m1.tower && typeof m1.tower === 'object', '旧档缺 tower → 补对象');
eq(m1.gold, 40, '已有字段保留不动');
eq(m1.ch2, false, '缺 ch2 → 补默认 false');
ok(m1.flags.courage === true, '嵌套已有值保留');
const m2 = w.Pc.migrate({ tokens: '损坏', tower: null, mode: undefined });
ok(Array.isArray(m2.tokens) && m2.tokens.length === 0, '类型损坏修正（tokens 非数组）');
ok(m2.tower && typeof m2.tower === 'object', '类型损坏修正（tower 为 null）');
ok(w.Pc.migrate(undefined).name === '', 'undefined → 整体默认');
w.Pc.migrate(m1);
eq(m1.gold, 40, '迁移幂等（重复跑不破坏）');
eq(Object.keys(w.Pc.defaults()).length, 23, '默认形状字段数守恒（23，防误删）');

// ── L4 存档兼容矩阵：每版历史形状一个 fixture，统一断言四条律 ──
//   补齐（defaults 全键在）/ 保值（keep 表）/ 修型（数组对象型复原 + tokens 期望）/
//   幂等（二次迁移深度相等）——新增结构演进 = 新增 fixture + 全矩阵进 npm test（工具链纪律）
import { readdirSync } from 'node:fs';
const DEFAULT_KEYS = Object.keys(w.Pc.defaults());
const fixtureDir = 'test/fixtures/saves';
const fixtures = readdirSync(fixtureDir).filter((f) => f.endsWith('.json')).sort();
ok(fixtures.length >= 5, `存档 fixture 至少 5 版历史形状（现有 ${fixtures.length}）`);
for (const file of fixtures) {
	const fx = JSON.parse(readFileSync(`${fixtureDir}/${file}`, 'utf8'));
	const m = w.Pc.migrate(JSON.parse(JSON.stringify(fx.pc))); // 原样克隆入参
	const label = `${file.split('.')[0]}`;
	const missingKeys = DEFAULT_KEYS.filter((k) => !(k in m));
	ok(missingKeys.length === 0, `[${label}] 补齐：defaults 全键在（缺 ${missingKeys.join(',') || '无'}）`);
	for (const [k, want] of Object.entries(fx.keep ?? {})) {
		ok(JSON.stringify(m[k]) === JSON.stringify(want), `[${label}] 保值：${k}=${JSON.stringify(want)} 不被覆盖`);
	}
	if (fx.expectTokens !== undefined) {
		ok(Array.isArray(m.tokens) && JSON.stringify(m.tokens) === JSON.stringify(fx.expectTokens), `[${label}] 修型：tokens → ${JSON.stringify(fx.expectTokens)}`);
	}
	ok(m.abilities === null || typeof m.abilities === 'object', `[${label}] 修型：abilities 型合法`);
	for (const k of ['skills', 'feats', 'gear', 'picked', 'tokens']) ok(Array.isArray(m[k]), `[${label}] 修型：${k} 为数组`);
	const again = w.Pc.migrate(JSON.parse(JSON.stringify(m)));
	ok(JSON.stringify(again) === JSON.stringify(m), `[${label}] 幂等：二次迁移深度相等`);
	if (fx.expectSalves !== undefined) ok(m.salves === fx.expectSalves, `[${label}] 映射：salves=${fx.expectSalves}（salve_used→库存）`);
	ok(!('salve_used' in m), `[${label}] 映射：salve_used 键已消费删除`);
	if (fx.expectJunkKept) ok('futureVersionField' in m, `[${label}] 余键：未知字段不删（向前兼容）`);
}


// ── #28 表契约：表→行为耦合（页面域改表值，jsdom 断言行为跟随——防表/实现漂移）──
{
	ok(!!w.Game?.Checks?.sites, 'Game 表已加载（sites 在）');
	ok(!!w.Game?.Economy?.events, 'Game 表已加载（events 在）');
	// ① 位点 DC：改表 → attackroll 用新 DC
	w.eval('Game.Checks.sites["哥布林·战斗"].dc = 20');
	w.SugarCube.State.variables.pc = w.Pc.defaults();
	new w.SugarCube.Wikifier(null, '<<attackroll "哥布林·战斗">>');
	ok(w.SugarCube.State.variables.last_check.dc === 20, `位点 DC 表驱动：attackroll 用表值 20（实际 ${w.SugarCube.State.variables.last_check?.dc}）`);
	w.eval('Game.Checks.sites["哥布林·战斗"].dc = 12');
	// ② 经济事件：改表 → econ 用新金额
	w.eval('Game.Economy.events.shadow_alms.delta = 7');
	w.SugarCube.State.variables.pc.gold = 10;
	new w.SugarCube.Wikifier(null, '<<econ "shadow_alms">>');
	ok(w.SugarCube.State.variables.pc.gold === 17, `经济事件表驱动：econ 用表值 +7（实际 ${w.SugarCube.State.variables.pc.gold}）`);
	w.eval('Game.Economy.events.shadow_alms.delta = 1');
	// 动态事件：显式金额覆盖（loot）
	w.SugarCube.State.variables.pc.gold = 0;
	new w.SugarCube.Wikifier(null, '<<econ "loot" 4>>');
	ok(w.SugarCube.State.variables.pc.gold === 4, '动态事件：<<econ "loot" 4>> 覆盖表 null');
	// ③ 化身战数值：改基础伤害 → battleDamage 跟随；日记只作用前两回合（原式语义）
	w.eval('Game.Tokens.roundBase[1] = 6');
	ok(w.Game.Tokens.battleDamage(1, [], 0) === 6, `化身战基础伤害表驱动（实际 ${w.Game.Tokens.battleDamage(1, [], 0)}）`);
	w.eval('Game.Tokens.roundBase[1] = 3');
	const T = w.Game.Tokens;
	eq(T.battleDamage(1, [], 0), 3, 'battleDamage：无信物 R1=3');
	eq(T.battleDamage(1, ['日记'], 0), 1, 'battleDamage：仅日记 R1 = max(1,3-1-1)=1');
	eq(T.battleDamage(2, ['铜哨', '日记'], 0), 1, 'battleDamage：2信物含日记 R2 = max(1,4-2-1)=1');
	eq(T.battleDamage(3, ['日记'], 0), 1, 'battleDamage：终击不减日记 = max(1,1-1)=1（与原式一致）');
	eq(T.battleDamage(1, [], 5), 5, 'battleDamage：败次封顶 +2 = 3+2=5');
	eq(T.battleDamage(2, ['铜哨', '星图残页', '月光花', '日记'], 2), 1, 'battleDamage：4信物满配 R2 下限 1');
	ok(T.advAt('化身·鞭击', ['铜哨']) && !T.advAt('化身·悲鸣', ['铜哨']), 'advAt：铜哨只给鞭击优势');
	ok(T.advAt('化身·悲鸣', ['星图残页']), 'advAt：星图残页给悲鸣豁免优势');
	ok(T.advAt('化身·终击', ['月光花']), 'advAt：月光花给终击优势');
	ok(T.advAt('化身·终击', ['铜哨', '星图残页']), 'advAt：信物≥2 给终击优势（共鸣）');
	ok(!T.advAt('化身·终击', ['铜哨']), 'advAt：1 件不给终击优势');
	// ④ sitecheck 分流：abil 位点走 <<save>>
	w.eval('Game.Checks.sites["雾影·抵抗"].dc = 9');
	new w.SugarCube.Wikifier(null, '<<sitecheck "雾影·抵抗">>');
	const lc = w.SugarCube.State.variables.last_check;
	ok(lc?.dc === 9 && /con|体质/i.test(lc?.label ?? ''), `sitecheck 豁免分流走 save（dc=${lc?.dc}，label=${lc?.label}）`);
	w.eval('Game.Checks.sites["雾影·抵抗"].dc = 15');
	// ⑤ #25 sink 契约：gives 入账 + 烙印折扣表驱动
	w.SugarCube.State.variables.pc = w.Pc.defaults();
	w.SugarCube.State.variables.pc.gold = 30;
	w.SugarCube.State.variables.pc.salves = 0;
	new w.SugarCube.Wikifier(null, '<<econ "salve_buy">>');
	let _pc = w.SugarCube.State.variables.pc;
	ok(_pc.gold === 22 && _pc.salves === 1, `salve_buy：-8 金且 gives 入账 salves 0→1（实际 ${_pc.gold}/${_pc.salves}）`);
	w.SugarCube.State.variables.pc.flags.lore = true;
	ok(w.Game.Economy.priceOf('witch_hint_diary', w.SugarCube.State.variables.pc) === -5, 'priceOf：学识烙印半价 8→5');
	w.SugarCube.State.variables.pc.flags.lore = false;
	ok(w.Game.Economy.priceOf('witch_hint_diary', w.SugarCube.State.variables.pc) === -8, 'priceOf：无烙印原价 8');
	// #36 技能折扣：医药→药膏批发价、恐吓→贿赂吓阻价
	w.SugarCube.State.variables.pc.skills = ['医药'];
	ok(w.Game.Economy.priceOf('salve_buy', w.SugarCube.State.variables.pc) === -5, 'priceOf：医药熟练药膏 8→5');
	w.SugarCube.State.variables.pc.skills = ['恐吓'];
	ok(w.Game.Economy.priceOf('bribe', w.SugarCube.State.variables.pc) === -3, 'priceOf：恐吓熟练贿赂 5→3');
	w.SugarCube.State.variables.pc.skills = [];
	ok(w.Game.Economy.priceOf('bribe', w.SugarCube.State.variables.pc) === -5, 'priceOf：无恐吓原价 5');
	// ⑤ setflag 词汇
	w.SugarCube.State.variables.goblin_spared = false;
	new w.SugarCube.Wikifier(null, '<<setflag "goblin_spared">>');
	ok(w.SugarCube.State.variables.goblin_spared === true, 'setflag 词汇：旗标置真');
}

console.log(failures ? `\n${failures} 项失败` : '\n规则层测试全部通过');
process.exit(failures ? 1 : 0);
