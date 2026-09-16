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
const R = w.Game.Rules;

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
const nat20 = dom20.w.Game.Rules.check(pc, '运动', 30);
ok(nat20.roll === 20 && nat20.success, '自然 20 → 无视 DC 必然成功');
ok(dom20.w.Game.Rules.save(pc, 'str', 25).success, '豁免同样适用自然 20 规则');
const dom1 = await boot({ random: 0.0001 });
const nat1 = dom1.w.Game.Rules.check(pc, '察觉', 1);
ok(nat1.roll === 1 && !nat1.success, '自然 1 → 无视加值必然失败');

// ── 车卡：3 轮 × 每轮 3 选项，apply 均可执行 ──
const rounds = w.Game.Chargen.rounds;
eq(rounds.length, 3, '车卡共 3 轮（职业/背景/种族）');
ok(rounds.every((r) => r.options.length === 3), '每轮恰好 3 个选项');
ok(rounds.every((r) => r.options.every((o) => typeof o.apply === 'function')), '所有选项都有 apply 函数');
ok(rounds.every((r) => r.options.every((o) => o.name && o.desc && o.effect)), '选项均有名称/描述/效果三件套');

const v = w.SugarCube.State.variables;
const freshPc = () => { v.pc = w.Game.Pc.defaults(); return v.pc; };
freshPc();
for (const [r, o] of [[0, 0], [1, 0], [2, 2]]) w.Game.Chargen.pick(r, o); // 铁卫 / 佣兵 / 矮人
eq(v.pc.round, 3, '车卡完成 3 轮');
eq(v.pc.picked.length, 3, 'picked 记录 3 条');
eq(v.pc.abilities.str, 17, '铁卫 16 + 矮人 1 = 17');
eq(v.pc.abilities.con, 17, '铁卫 15 + 矮人 2 = 17');
eq(v.pc.max_hp, 12 + 2 * 3, 'HP = 职业基础 12 + 体(17→+3)×2 = 18');
eq(v.pc.hp, v.pc.max_hp, '满血出场');
eq(v.pc.gold, 10, '佣兵金币 10');
eq(v.pc.skills.filter((s) => s === '运动').length, 1, '职业/背景重复技能已去重');
ok(v.pc.gear.includes('长剑'), '职业行囊生效');
{
	const sage = w.Game.Chargen.presets.find((x) => x.name === '秘典');
	const pc2 = w.Game.Pc.defaults();
	w.SugarCube.State.variables.pc = pc2;
	for (let i = 0; i < sage.picks.length; i++) w.Game.Chargen.pick(i, sage.picks[i]);
	eq(pc2.salves, 1, '秘典的"药膏"是可用的药膏（salves），不是装备栏里的死物');
	eq(pc2.gear.length, 0, '秘典不带表外装备');
	w.SugarCube.State.variables.pc = v.pc;
}
ok(v.pc.name === '无名旅人', '未取名时默认「无名旅人」');

// ── 快速模式预设：索引有效、applyPreset 数值与摘要一致 ──
const presets = w.Game.Chargen.presets;
eq(presets.length, 3, '三套快速预设');
ok(presets.every((p) => p.picks.length === rounds.length), '每套预设覆盖全部 3 轮');
ok(presets.every((p) => p.picks.every((i, r) => i >= 0 && i < rounds[r].options.length)), '预设索引均有效');
freshPc(); w.Game.Chargen.applyPreset(0);
eq(v.pc.abilities.str, 17, '铁卫预设：力 17');
ok(v.pc.speciesKey === 'dwarf' && v.pc.classKey === 'guard', '铁卫预设：矮人铁卫');
freshPc(); w.Game.Chargen.applyPreset(1);
eq(v.pc.abilities.dex, 18, '影手预设：敏 18（16+精灵2）');
ok(v.pc.bgKey === 'wanderer', '影手预设：修行者出身');
freshPc(); w.Game.Chargen.applyPreset(2);
ok(v.pc.flags.lore && v.pc.skills.includes('调查'), '秘典预设：学识烙印 + 调查');

// ── Pc 形状迁移：基础行为 + 存档兼容矩阵（fixture 驱动）──
const oldPc = { name: '旧档', round: 8, gold: 40, hp: 14, max_hp: 14, skills: ['运动'], gear: ['火把'], abilities: { str: 15 }, flags: { courage: true } };
const m1 = w.Game.Pc.migrate(oldPc);
eq(m1.inv, {}, '旧档缺 inv → 补空对象');
ok(m1.star && typeof m1.star === 'object' && m1.star.charge === 12, '旧档缺 star → 补默认星力');
ok(m1.keeper && m1.keeper.met === false, '旧档缺 keeper → 补默认关系态');
ok(m1.dragon && m1.dragon.hp === 0, '旧档缺 dragon → 补默认战斗态');
eq(m1.gold, 40, '已有字段保留不动');
ok(m1.flags.courage === true, '嵌套已有值保留');
const m2 = w.Game.Pc.migrate({ skills: '损坏', star: null, inv: [] });
ok(Array.isArray(m2.skills) && m2.skills.length === 0, '类型损坏修正（skills 非数组）');
ok(m2.star && typeof m2.star === 'object', '类型损坏修正（star 为 null）');
ok(!Array.isArray(m2.inv) && typeof m2.inv === 'object', '类型损坏修正（inv 为数组）');
ok(w.Game.Pc.migrate(undefined).name === '', 'undefined → 整体默认');
w.Game.Pc.migrate(m1);
eq(m1.gold, 40, '迁移幂等（重复跑不破坏）');
// #486（S1）：新增 `gearHp`（装备耐久 `{ 具名: 剩余 }`）⇒ 26 → 27。
// 这个计数是**防误删**的栅栏：加/删字段都要在这里显式改一次并说明理由（改动即审计线索）。
eq(Object.keys(w.Game.Pc.defaults()).length, 28, '默认形状字段数守恒（28，防误删；#486 加 gearHp · #487 加 statuses）');

// ── L4 存档兼容矩阵：每版历史形状一个 fixture，统一断言四条律 ──
const DEFAULT_KEYS = Object.keys(w.Game.Pc.defaults());
const fixtureDir = 'test/fixtures/saves';
const fixtures = readdirSync(fixtureDir).filter((f) => f.endsWith('.json')).sort();
ok(fixtures.length >= 5, `存档 fixture 至少 5 版历史形状（现有 ${fixtures.length}）`);
for (const file of fixtures) {
	const fx = JSON.parse(readFileSync(`${fixtureDir}/${file}`, 'utf8'));
	const m = w.Game.Pc.migrate(JSON.parse(JSON.stringify(fx.pc)));
	const label = file.split('.')[0];
	const missingKeys = DEFAULT_KEYS.filter((k) => !(k in m));
	ok(missingKeys.length === 0, `[${label}] 补齐：defaults 全键在（缺 ${missingKeys.join(',') || '无'}）`);
	for (const [k, want] of Object.entries(fx.keep ?? {})) {
		ok(JSON.stringify(m[k]) === JSON.stringify(want), `[${label}] 保值：${k}=${JSON.stringify(want)} 不被覆盖`);
	}
	ok(m.abilities === null || typeof m.abilities === 'object', `[${label}] 修型：abilities 型合法`);
	for (const k of ['skills', 'feats', 'gear', 'picked']) ok(Array.isArray(m[k]), `[${label}] 修型：${k} 为数组`);
	for (const k of ['inv', 'star', 'keeper', 'ev', 'dragon', 'world', 'flags', 'soc']) ok(m[k] && typeof m[k] === 'object' && !Array.isArray(m[k]), `[${label}] 修型：${k} 为对象`);
	const again = w.Game.Pc.migrate(JSON.parse(JSON.stringify(m)));
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
	ok(!!w.Game?.Codex?.items, 'Game 表已加载（Codex.items 在）');
	// 〇 图鉴表契约（v17 M8）：页 = 道具清单；线索不白送 / 都能挣；解锁＝全部线索
	{
		const C = w.Game.Codex, defs = Object.keys(w.Game.Items.defs).sort();
		eq(Object.keys(C.items).sort().join(','), defs.join(','), '图鉴页与 Items.defs 一一对应');
		const fresh = w.Game.Pc.defaults();
		for (const [item, def] of Object.entries(C.items)) {
			ok(def.clues.length >= 2, `图鉴「${item}」线索 ≥2`);
			ok(def.clues.every((cl) => !w.Sg.rules.matches(cl, fresh, new Set())), `图鉴「${item}」新档下无白送线索`);   // 声明式条件（`#785`）
		}
		// 解锁＝线索集齐（半齐不解锁，齐了才解锁）
		const store = { clues: { 月光花: { own: true, warned: true, fed: true } }, endings: [], finals: [] };
		ok(!w.Game.Codex.isUnlocked('月光花', store), '月光花 3/4 线索不解锁');
		store.clues.月光花.venom = true;
		ok(w.Game.Codex.isUnlocked('月光花', store), '月光花 4/4 线索解锁');
		eq(w.Game.Codex.progress('月光花', { clues: { 月光花: { own: true } } }).got, 1, 'progress 计数');
		// 永久性：store 里没有的页就是锁定页
		ok(!w.Game.Codex.isUnlocked('坏哨', { clues: {} }), '空账本 → 未解锁');
	}
	// ① 位点 DC：改表 → sitecheck 用新 DC
	w.eval('Game.Checks.sites["洞穴·战斗"].dc = 20');
	w.SugarCube.State.variables.pc = w.Game.Pc.defaults();
	new w.SugarCube.Wikifier(null, '<<sitecheck "洞穴·战斗">>');
	ok(v.last_check.dc === 20, `位点 DC 表驱动：sitecheck 用表值 20（实际 ${v.last_check?.dc}）`);
	w.eval('Game.Checks.sites["洞穴·战斗"].dc = 12');
	// ② 经济事件：改表 → econ 用新金额
	w.eval('Game.Economy.events.dragon_hoard.delta = 7');
	v.pc.gold = 10;
	new w.SugarCube.Wikifier(null, '<<econ "dragon_hoard">>');
	ok(v.pc.gold === 17, `经济事件表驱动：econ 用表值 +7（实际 ${v.pc.gold}）`);
	w.eval('Game.Economy.events.dragon_hoard.delta = 10');
	// ②b 判定标注 + 计算过程（M10）
	{
		const R = w.Game.Rules;
		const pc = w.Game.Pc.defaults();
		pc.abilities = { str: 16, dex: 10, con: 14, int: 8, wis: 16, cha: 8 };
		pc.skills = ['运动'];
		let r = R.check(pc, '运动', 12);
		eq(r.label, '运动检定（力量）', '标注判定属性：技能 → 属性');
		eq(r.ability, 'str', '技能映射到属性');
		eq(r.mod, 5, '修正构成 = 力量 +3 + 熟练 +2');
		eq(r.parts.map((x) => `${x.k}${x.v}`).join(' '), '力量3 熟练2', '修正拆项（属性 + 熟练）');
		r = R.check(pc, '调查', 12);
		eq(r.label, '调查检定（智力）', '未熟练的技能照样标注属性');
		eq(r.parts.length, 1, '未熟练 → 只有属性一项');
		eq(r.mod, -1, '智力 8 → -1');
		r = R.save(pc, 'con', 13);
		eq(r.label, '体质豁免', '豁免标注为"体质豁免"');
		eq(r.parts[0].k, '体质', '豁免也是按属性算');
		// 优势：两枚都记下来（计算过程要能显示"取高/取低"）
		w.eval(`(function(){const q=[0.12,0.82];Math.random=()=>q.length?q.shift():0.5;})()`);
		r = R.check(pc, '运动', 12, { adv: 1, advWhy: '测试' });
		eq(r.rolls.length, 2, '优势记两枚骰');
		eq(r.roll, Math.max(...r.rolls), '优势取高');
		w.eval(`(function(){const q=[0.12,0.82];Math.random=()=>q.length?q.shift():0.5;})()`);
		r = R.check(pc, '运动', 12, { adv: -1, disWhy: '测试' });
		eq(r.roll, Math.min(...r.rolls), '劣势取低');
		// 渲染：计算过程 + 为什么
		w.SugarCube.State.variables.pc = pc;   // 渲染宏读的是 State 上的 $pc
		let frag = w.document.createDocumentFragment();
		new w.SugarCube.Wikifier(frag, '<<check "运动" 12>>');
		let txt = frag.textContent;
		ok(txt.includes('运动检定（力量）'), '渲染：标注"用什么属性判定"');
		ok(txt.includes('力量') && txt.includes('熟练') && txt.includes('DC12') && txt.includes('d20('), '渲染：计算过程（属性+熟练+骰面+DC）');
		// 优势时把"为什么"和两枚骰都写出来
		w.eval(`(function(){const q=[0.12,0.82];Math.random=()=>q.length?q.shift():0.5;})()`);
		frag = w.document.createDocumentFragment();
		new w.SugarCube.Wikifier(frag, '<<check "运动" 12 adv 0 0 "测试位点" "道具·坏哨" "">>');
		txt = frag.textContent;
		ok(txt.includes('测试位点') && txt.includes('优势：道具·坏哨') && txt.includes('取高'), '渲染：位点 + 优势来源 + 取骰过程');
		// 开关：关掉明细 → 只剩 d20 + 总修正
		const before = w.Sg.UI.showDetail();
		w.Sg.UI.setDetail(false);
		frag = w.document.createDocumentFragment();
		new w.SugarCube.Wikifier(frag, '<<check "运动" 12 adv 0 0 "测试位点" "道具·坏哨" "">>');
		txt = frag.textContent;
		ok(!txt.includes('熟练') && !txt.includes('取高') && txt.includes('d20('), '关掉明细：只留骰面与总修正');
		w.Sg.UI.setDetail(before);
		ok(w.Sg.UI.showDetail() === before, '开关回写（localStorage 持久化）');
	}

	// ②c 行囊（A1/A2）：装备进数值，不是装饰
	{
		const G = w.Game.Gear, I = w.Game.Items, D = w.Game.Dragon, S = w.Game.Star;
		eq(G.damageBonus(['长剑']), 1, '行囊：长剑 → 伤害 +1');
		eq(G.damageBonus(['短刃']), 1, '行囊：短刃 → 伤害 +1');
		eq(G.damageBonus([]), 0, '行囊：空手 → 无加成');
		eq(G.advSource('门厅·看钉', ['火把']), '火把', '行囊：火把给"看不清"的位点优势');
		eq(G.advSource('门厅·看钉', ['长剑']), '', '行囊：剑不给看东西的优势');
		eq(I.advSource('门厅·看钉', {}, ['火把']), '火把', '行囊优势接进道具侧查询（<<sitecheck>> 用同一条路）');
		eq(I.advSource('雾之魔物·挥击', { 坏哨: true }, ['火把']), '坏哨', '道具优先，其次行囊（先说清是哪一件）');
		// #235：武器加成接进真实战斗（playerEff＝fightresolve 同一条路）
		{
			const C = w.Game.Combat;
			const crit = { roll: 20, success: true }, ok = { roll: 14, success: true }, bad = { roll: 5, success: false };
			const withSword = C.playerEff('龙·斩击', crit, { gear: ['长剑'] });
			eq(withSword.eff.dmg, C.actions['龙·斩击'].crit.dmg + 1, '出剑：大成功 +武器 +1');
			eq(withSword.gearBonus, 1, '出剑：加成来源标记');
			eq(C.playerEff('龙·斩击', ok, { gear: ['长剑'] }).eff.dmg, C.actions['龙·斩击'].ok.dmg + 1, '出剑：成功档同样 +1');
			eq(C.playerEff('龙·斩击', bad, { gear: ['长剑'] }).eff.dmg ?? 0, 0, '失手不吃武器加成');
			eq(C.playerEff('龙·斩击', crit, { gear: [] }).gearBonus, undefined, '空手无加成标记');
			eq(C.playerEff('龙·斩击', crit, { gear: ['火把'] }).eff.dmg, C.actions['龙·斩击'].crit.dmg, '火把不加伤害（只给优势）');
			eq(w.Game.Gear.damageSource(['火把', '长剑']), '长剑', '加成来源说得出是哪件');
			// 动作表不被污染（eff 是克隆，不是引用）
			C.playerEff('龙·斩击', crit, { gear: ['长剑'] });
			eq(C.actions['龙·斩击'].crit.dmg, withSword.eff.dmg - 1, '动作表单源未被就地改写');
		}
		// 行囊表的每一件都要有来源、说法、效果（与 audit ⓪j 同一口径）
		for (const [k, d] of Object.entries(G.defs)) {
			ok(!!d.from && !!d.note, `行囊「${k}」有来源与说法`);
			ok((d.damage ?? 0) > 0 || (d.advSites ?? []).length > 0, `行囊「${k}」有效果`);
			for (const s of d.advSites ?? []) ok(!!w.Game.Checks.sites[s], `行囊「${k}」的优势位点存在：${s}`);
		}
		// 星力软限（canon §3.5/§7；#256 方案 A：budget 6，序表承诺余量）
		eq(S.budget, 6, '星力预算＝6（#256 方案 A：一次失误仍可通关）');
		ok(!w.Sg.story.overBudget({ star: { spent: 6 } }), '翻 6 次仍在预算内');
		ok(w.Sg.story.overBudget({ star: { spent: 7 } }), '翻 7 次超预算 → 真结局降级');
		ok(!w.Sg.story.overBudget({}), '旧档无 star 不炸');
		// 序表契约（行为化）：五类可信序都必须满足 budget − spent ≥ floor——
		// 改 budget / 首翻免费 / 散场回程免费，都必须同步 orders，否则本断言红
		ok((S.orders ?? []).length >= 5, '软限序表已登记（≥5 类可信序）');
		for (const o of S.orders ?? []) ok(S.budget - o.spent >= o.floor, `序「${o.id}」余量 ${S.budget - o.spent} ≥ 承诺 ${o.floor}`);
	}

	// ③ 战斗伤害：改减伤 → battleDamage 跟随（#236 数值：基档 5/6/6 · 减伤件 −2 · 毒 −3 且压怒 · 败次封顶 +2）
	const I = w.Game.Items;
	eq(I.battleDamage(1, {}, 0), 5, 'battleDamage：空手 R1 = 4+1 = 5');
	eq(I.battleDamage(2, {}, 0), 6, 'battleDamage：空手 R2 = 4+2 = 6');
	eq(I.battleDamage(3, {}, 0), 6, 'battleDamage：空手 R3 封顶 6');
	eq(I.battleDamage(1, { 龙鳞护臂: true }, 0), 3, 'battleDamage：龙鳞护臂 −2');
	eq(I.battleDamage(1, { 日记: true, 龙鳞护臂: true }, 0), 1, 'battleDamage：日记+护臂 −4（地板 1）');
	eq(I.battleDamage(1, {}, 2), 7, 'battleDamage：败次 +2 封顶');
	eq(I.battleDamage(2, { 日记: true }, 5), 6, 'battleDamage：多败次封顶 +2（5 败 → +2）');
	// #236：毒液既 −3 也压怒（poisoned=true → rage 归零，连败的火也压熄）
	eq(I.battleDamage(2, {}, 3, true), 3, 'battleDamage：涂毒＝−3 且压怒（6−3+0，连败 3 次不吃 rage）');
	eq(I.battleDamage(2, {}, 3, false), 8, 'battleDamage：未涂毒＝连败 3 次吃满 rage（6+2）');
	w.eval('Game.Items.effects.日记.flatDamageReduce = 3');
	eq(I.battleDamage(1, { 日记: true }, 0), 2, `battleDamage 表驱动：日记减伤改 3 → R1 = max(1,5-3)=2（实际 ${I.battleDamage(1, { 日记: true }, 0)}）`);
	w.eval('Game.Items.effects.日记.flatDamageReduce = 2');
	// ④ 位点优势：advAt 表驱动 + 件数共鸣
	ok(I.advAt('雾之魔物·挥击', { 坏哨: true }), 'advAt：坏哨给雾之魔物挥击优势');
	ok(!I.advAt('雾之魔物·心防', { 坏哨: true }), 'advAt：坏哨不给心防优势');
	ok(I.advAt('龙·吐息', { 观星者的书: true }), 'advAt：观星者的书给吐息优势');
	ok(I.advAt('龙·斩击', { 坏哨: true }), 'advAt：坏哨给封印战攻击优势（v17 补正 #3）');
	ok(!I.advAt('龙·斩击', { 月光花: true }), 'advAt：月光花不给攻击优势——它让龙变弱（毒液），不是让你变强');
	ok(!I.advAt('龙·斩击', { a: 1, b: 2 }), 'advAt：件数共鸣已移除（M5b）');
	ok(!I.advAt('龙·终击', { 月光花: true, 日记: true, 龙鳞护臂: true }), 'advAt：彩蛋位点不吃任何道具优势');
	// ④b 道具位点优势自动接线：坏哨 → <<sitecheck>> 自动双骰取高
	const diceQueue = [0.12, 0.82]; // d20 → 3, 17
	w.eval(`(function(){const q=${JSON.stringify(diceQueue)};Math.random=()=>q.length?q.shift():0.5;})()`);
	v.pc = w.Game.Pc.defaults(); v.pc.inv['坏哨'] = true;
	new w.SugarCube.Wikifier(null, '<<sitecheck "雾之魔物·挥击">>');
	ok(v.last_check.roll === 17, `sitecheck 自动优势：坏哨 → 双骰取高（实际 ${v.last_check.roll}）`);
	v.pc.inv = {};
	w.eval(`(function(){const q=${JSON.stringify(diceQueue)};Math.random=()=>q.length?q.shift():0.5;})()`);
	new w.SugarCube.Wikifier(null, '<<sitecheck "雾之魔物·挥击">>');
	ok(v.last_check.roll === 3, `sitecheck 无道具：单骰（实际 ${v.last_check.roll}）`);
	w.eval('Math.random = () => 0.5');
	// ④c 情报位点优势（M6d）：老猎人的话（world.rumor）→ 洞穴战斗自动双骰取高
	ok(w.Game.Checks.knowledge?.['洞穴·战斗'] === 'rumor', 'knowledge 表：洞穴·战斗 ← world.rumor');
	ok(w.Game.Checks.knowledge?.['书房·检视'] === 'witch_hint', 'knowledge 表：书房·检视 ← world.witch_hint');
	// knowledge 的 key 必须是已登记位点（表一致性）
	ok(Object.keys(w.Game.Checks.knowledge).every((k) => k in w.Game.Checks.sites), 'knowledge 的位点均存在于 Checks.sites');
	const dq3 = [0.12, 0.82];
	// `#733` 片 2-b：情报优势看笔记面 ⇒ 给存储（`ev.notes`），不再靠 `world.rumor` 旗标
	v.pc = w.Game.Pc.defaults(); v.pc.ev.notes = { n_rumor: true };
	w.eval(`(function(){const q=${JSON.stringify(dq3)};Math.random=()=>q.length?q.shift():0.5;})()`);
	new w.SugarCube.Wikifier(null, '<<sitecheck "洞穴·战斗">>');
	ok(v.last_check.roll === 17, `情报优势：rumor → 双骰取高（实际 ${v.last_check.roll}）`);
	v.pc.ev.notes = {};
	w.eval(`(function(){const q=${JSON.stringify(dq3)};Math.random=()=>q.length?q.shift():0.5;})()`);
	new w.SugarCube.Wikifier(null, '<<sitecheck "洞穴·战斗">>');
	ok(v.last_check.roll === 3, `无情报：单骰（实际 ${v.last_check.roll}）`);
	w.eval('Math.random = () => 0.5');
	// ④c-2 塔基花田（v16 补正 #6）：贸然采花＝较高体质豁免，失败＝死亡结局；有情报＝免判定
	const fsite = w.Game.Checks.sites['塔外花田'];
	ok(fsite?.abil === 'con', '塔外花田：体质豁免（不是技能检定）');
	ok(fsite?.dc >= 15, `塔外花田：DC 较高（≥15；实际 ${fsite?.dc}）`);
	ok(w.Game.Checks.knowledge?.['塔外花田'] === undefined, '塔外花田：不入情报表——有情报是「免判定」，不是「优势」');
	ok(!w.Game.Items.advAt('塔外花田', { 坏哨: true, 观星者的书: true, 月光花: true }), '塔外花田：任何道具都不给优势');
	const ssite = w.Game.Checks.sites['寻杖'];
	ok(ssite?.skill === '调查', '寻杖：调查检定（在塔里找那根被藏起来的杖）');
	ok(ssite?.dc >= 12 && ssite?.dc <= 15, `寻杖：中等难度（12–15；实际 ${ssite?.dc}）`);
	w.eval('Math.random = () => 0.5');
	// ④d 彩蛋击杀（M5b）：<<sitecheck "龙·终击">> 需天然 20 + 劣势 → 1/400 ≈ 0.25%
	const ks = w.Game.Checks.sites['龙·终击'];
	ok(ks?.nat === 20 && ks?.dis === true, '龙·终击：需天然 20 且带劣势（≈0.25%）');
	v.pc = w.Game.Pc.defaults();
	const atRoll = (r) => {
		w.eval(`Math.random = () => ${(r - 0.5) / 20}`);
		return w.Game.Rules.check(v.pc, '运动', 20, { nat: 20, bonus: 100 });
	};
	ok(atRoll(20).success === true, 'nat 机制：天然 20 必成（加值/DC 不参与）');
	ok(atRoll(19).success === false, 'nat 机制：天然 19 即使 +100 也失败');
	w.eval('Math.random = () => 0.99');
	new w.SugarCube.Wikifier(null, '<<sitecheck "龙·终击">>');
	ok(v.last_check.roll === 20 && v.last_check.success === true && v.last_check.nat === 20, '彩蛋位点：桩 20 → 成功且标记 nat');
	w.eval('Math.random = () => 0.5');
	// ⑤ sitecheck 分流：abil 位点走 <<save>>（#236 后龙·吐息改洞悉，用塔外花田的 con 豁免做分流例）
	w.eval('Game.Checks.sites["塔外花田"].dc = 9');
	new w.SugarCube.Wikifier(null, '<<sitecheck "塔外花田">>');
	ok(v.last_check?.dc === 9 && /体质/.test(v.last_check?.label ?? ''), `sitecheck 豁免分流走 save（dc=${v.last_check?.dc}，label=${v.last_check?.label}）`);
	w.eval('Game.Checks.sites["塔外花田"].dc = 16');
	// ⑥ #25 sink 契约：gives 入账 + 烙印/技能折扣表驱动
	v.pc = w.Game.Pc.defaults();
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
	ok(v.pc.inv['日记'] === true && w.Game.Pc.has('日记'), 'give 词汇：入物品栏');
	// ⑨ damage 词汇：扣血 + 药膏自动生效
	v.pc = w.Game.Pc.defaults(); v.pc.max_hp = 14; v.pc.hp = 14; v.pc.salves = 1;
	new w.SugarCube.Wikifier(null, '<<damage 5>>');
	ok(v.pc.hp === 13 && v.pc.salves === 0, `damage 词汇：5 伤回 4 → 13/14，药膏 1→0（实际 ${v.pc.hp}/${v.pc.salves}）`);
	// ⑩ flip 词汇：时代翻转 + 隐藏星力 + 雾淡留痕（点击链接驱动）
	// ⚠ SugarCube 每次导航会克隆 State.variables：点击后必须重新取引用，否则读到旧时刻
	const V = () => w.SugarCube.State.variables;
	V().pc = w.Game.Pc.defaults(); V().pc.inv['时光护符'] = true; V().era = 'present';
	const flipHost = w.document.createElement('div');
	new w.SugarCube.Wikifier(flipHost, '<<flip>>');
	const flipLink = flipHost.querySelector('a.link-internal');
	ok(!!flipLink && flipLink.textContent.includes('过去'), 'flip 词汇：现在时渲染「坠入过去」链接');
	flipLink.click();
	await sleep(250);
	// #219 C1②：首次翻转不收费（first_free 置位，spent 不动）
	ok(V().era === 'past' && V().pc.star.spent === 0 && V().pc.star.first_free === true, `flip 词汇：首翻免费——era past / spent 0 / first_free（实际 ${V().era}/${V().pc.star.spent}/${V().pc.star.first_free}）`);
	const flipHost2 = w.document.createElement('div');
	new w.SugarCube.Wikifier(flipHost2, '<<flip>>');
	const flipLink2 = flipHost2.querySelector('a.link-internal');
	ok(!!flipLink2 && flipLink2.textContent.includes('现在'), 'flip 词汇：过去时渲染「回到现在」链接');
	flipLink2.click();
	await sleep(250);
	ok(V().era === 'present' && V().pc.world.fog_thin === true, `flip 词汇：回现在留「雾淡」痕迹（实际 ${V().era}/${V().pc.world.fog_thin}）`);
	ok(V().pc.star.spent === 1, `flip 词汇：首翻之后正常收费 spent=1（实际 ${V().pc.star.spent}）`);
}

// ── B1 战斗动作池：每轮随机 3 选 1（每手＝一次属性化检定，三档后果）──
{
	const C = w.Game.Combat;
	const sites = w.Game.Checks.sites;
	const full = w.Game.Pc.defaults();
	full.inv = { 坏哨: true, 月光花: true, 龙鳞护臂: true };
	full.gear = [];
	full.dragon = { venom: false, defeats: 0, hp: 60 };
	// ① 池子与出牌数
	ok(Object.keys(C.pools).length === 3, `三个战斗池（雾影/封印/龙，实际 ${Object.keys(C.pools).length}）`);
	for (const [pool, ids] of Object.entries(C.pools)) {
		const hand = C.offer(pool, 1, full, null);
		ok(hand.length === 3, `${pool}：每轮恰好给 3 张牌（实际 ${hand.length}）`);
		ok(new Set(hand).size === 3, `${pool}：三张牌不重复`);
		ok(hand.every((id) => ids.includes(id)), `${pool}：发出来的牌都在池子里`);
	}
	// ② 上一轮用过的牌不再发（防"一路同一手"）
	const first = C.offer('雾影', 1, full, null)[0];
	let rerolled = [];
	for (let i = 0; i < 8; i++) rerolled.push(...C.offer('雾影', 2, full, first));
	ok(!rerolled.includes(first) || rerolled.length > 8, `上一手「${first}」被排除在下一轮手牌外`);
	// ③ 需求门：没有花就不给「涂毒」，有花且第一轮一定给
	const noFlower = w.Game.Pc.defaults(); noFlower.inv = {}; noFlower.dragon = {};
	ok(!C.eligible('封印', noFlower).includes('封印·涂毒'), '没有月光花：涂毒不在可出牌里');
	ok(C.eligible('封印', noFlower).length >= 3, '没有任何道具也至少抽得满 3 张（不会空手）');
	ok(C.offer('封印', 1, full, null).includes('封印·涂毒'), '有花且第一轮：涂毒一定进手牌（备药优先）');
	full.dragon.venom = false;
	ok(C.offer('封印', 1, full, '封印·涂毒').includes('封印·涂毒'), '备药优先：第一轮一定把涂毒发到手上（哪怕上一手刚点过）');
	full.dragon.venom = true;
	ok(!C.offer('封印', 1, full, '封印·涂毒').includes('封印·涂毒'), '已涂过毒：备药优先不再生效（涂毒按普通牌走）');
	// ④ 定档：骰面 20 → 大成功；成败 → 各自档位
	eq(C.pick('龙·斩击', { roll: 20, success: true }).kind, 'crit', '骰面 20 → 大成功档');
	eq(C.pick('龙·斩击', { roll: 11, success: true }).kind, 'ok', '成功 → 成功档');
	eq(C.pick('龙·斩击', { roll: 1, success: false }).kind, 'bad', '失败 → 失败档');
	ok((() => { try { C.pick('不存在的动作', { roll: 11, success: true }); return false; } catch { return true; } })(), '未登记的动作抛错');
	// ⑤ 每一手都写明走哪项属性、DC 多少
	ok(C.siteInfo('雾影·蹲低') === '隐匿检定（敏捷） DC12', `siteInfo 标注属性与 DC（实际 ${C.siteInfo('雾影·蹲低')}）`);
	ok(C.siteInfo('封印·硬扛') === '体质豁免 DC13', `save 位点标成豁免（实际 ${C.siteInfo('封印·硬扛')}）`);
	for (const id of Object.keys(C.actions)) ok(!!C.siteInfo(id), `动作「${id}」有属性标注`);
	// ⑥ 效果落状态：伤害/优势/减伤/免出手/旗标/毒
	const f = { adv: 0, guard: 0, skipFoe: false, venom: false, flee: false };
	const probe = w.Game.Pc.defaults();
	probe.dragon = { hp: 60, venom: false };
	probe.ev = {};
	C.applyEffect(probe, { dmg: 9, adv: 1, guard: 4, skipFoe: true, flag: 'mist_guard', venom: true, flee: true }, f);
	ok(probe.dragon.hp === 51, `打掉血：60 → ${probe.dragon.hp}`);
	ok(f.adv === 1 && f.guard === 4 && f.skipFoe === true && f.flee === true && probe.dragon.venom === true && probe.ev.mist_guard === true, '优势/减伤/免出手/可撤退/毒/旗标全部落到状态上');
	// ⑦ 失败档不许给收益（三池通检）
	const MECH = ['dmg', 'adv', 'guard', 'skipFoe', 'venom', 'flag', 'flee'];
	const greedy = Object.entries(C.actions).filter(([, a]) => MECH.some((m) => a.bad?.[m])).map(([k]) => k);
	eq(greedy, [], '所有动作的失败档都不给任何收益（失败就得疼）');
	// ⑧ 池内判定分化：不同选择＝不同属性（否则"选择"只是同一掷的重命名）
	for (const [pool, ids] of Object.entries(C.pools)) {
		const kinds = new Set(ids.map((id) => sites[C.actions[id].site]?.skill ?? `save:${sites[C.actions[id].site]?.abil}`));
		ok(kinds.size >= 2, `${pool}：池内至少两项不同判定（实际 ${[...kinds].join('/')}）`);
	}
}
// ── B2 交涉：意愿三档 · 手段换属性/换代价 · 筹码免检 · 落账与 DC 阶梯 ──
{
	const S = w.Game.Social;
	const sites = w.Game.Checks.sites;
	// ① 态度阶梯就是 DMG 社交交互表压成的一根轴
	eq(S.attAdj, { friendly: -5, neutral: 0, hostile: 5 }, '态度修正 −5/0/+5（DMG 社交交互表）');
	// ② 每件诉求都发得出来：手段有属性标注、筹码真能开
	for (const a of S.asks) {
		for (const site of a.sites ?? []) {
			const sk = sites[site]?.skill;
			ok(!!sk && !!S.approaches[sk], `诉求「${a.id}」的开口方式「${site}」（${sk}）在手段表里`);
		}
		for (const lv of a.levers ?? []) {
			ok(['auto', 'adv'].includes(lv.gives), `筹码「${lv.name}」gives=${lv.gives}`);
			if (lv.econ) ok(!!w.Game.Economy.events[lv.econ], `筹码「${lv.name}」的经济事件存在（${lv.econ}）`);
		}
	}
	// ③ DC ＝ 位点基础 + 态度 + 5×同一手试过几次
	const pc = w.Game.Pc.defaults();
	const a0 = S.ask('老板娘·进塔');
	const base = sites['酒馆·打听'].dc;
	ok(S.dcOf(a0, '酒馆·打听', pc) === base, `冷淡：DC ＝ 基础 ${base}`);
	S.shift(pc, '老板娘', 1);
	ok(S.dcOf(a0, '酒馆·打听', pc) === base - 5, '友好：DC −5');
	pc.soc.att['老板娘'] = -1;
	ok(S.dcOf(a0, '酒馆·打听', pc) === base + 5, '敌意：DC +5');
	pc.soc.att['老板娘'] = 0;
	// ④ 重试代价只给「话说死了」的手，且只压这一手
	pc.soc.tries['老板娘·进塔|酒馆·打听'] = 2;
	ok(S.dcOf(a0, '酒馆·打听', pc) === base + 10, '同一手试过两次：DC +10');
	ok(S.dcOf(a0, '老板娘·吓', pc) === sites['老板娘·吓'].dc, '重试代价不牵连别的手段（各手段各算）');
	ok(S.settle(a0, pc, '酒馆·打听', 'bad').some((n) => n.includes('更难')), '游说失败 → 明说"再开口更难"');
	ok(pc.soc.tries['老板娘·进塔|酒馆·打听'] === 3, '游说失败 → 这一手计一次');
	const att0 = pc.soc.att['老板娘'] ?? 0;
	S.settle(a0, pc, '老板娘·吓', 'bad');
	ok(pc.soc.att['老板娘'] === att0 - 1, '恐吓失败 → 态度降一级（代价与游说不同）');
	ok(!pc.soc.tries['老板娘·进塔|老板娘·吓'], '恐吓的代价是态度，不是重试代价');
	const att1 = pc.soc.att['老板娘'];
	S.settle(a0, pc, '老板娘·接话', 'bad');
	ok(pc.soc.att['老板娘'] === att1, '表演失败 → 态度不动（代价最低，只是没接上话）');
	// ⑤ 意愿三档：愿意＝不掷骰直接给；不肯＝掷骰也没用
	const emptyPc = () => { const p2 = w.Game.Pc.defaults(); p2.inv = {}; p2.ev = {}; p2.world = {}; p2.keeper = { met: false, trust: 0, state: 'post', key: false }; return p2; };
	const swap = S.ask('女巫·换哨');
	const p3 = emptyPc();
	eq(S.verdict(swap, p3), 'unwilling', '换哨：图与杖都没凑齐 → 不肯（不是"难"，是"没得谈"）');
	p3.inv['完整星图'] = true; p3.world.family_favor = true;
	eq(S.verdict(swap, p3), 'unwilling', '换哨（#177）：图与杖齐了但手里没那支哨 → 仍不肯（正文不收你根本没有的东西）');
	p3.inv['坏哨'] = true;
	eq(S.verdict(swap, p3), 'willing', '换哨：图、杖、哨三齐 → 愿意（不掷骰）');
	const ask0 = S.ask('老巫女·开口');
	eq(S.verdict(ask0, p3), 'unwilling', '老巫女：始终不肯——演示"掷骰无用"这一步');
	ok(!!ask0.why && ask0.no, '始终不肯的诉求写清了为什么 + 回绝过场');
	// ⑥ 筹码：给出去的与摆出来的都真的落到状态上（且免检不经骰子）
	const p4 = emptyPc();
	p4.gold = 99; p4.inv['时光护符'] = true; p4.world.family_favor = true; p4.keeper = { met: true, trust: 0, state: 'post', key: false };
	const art = S.ask('守林人·术');
	ok(S.verdict(art, p4) !== 'willing', '空手（只有护符）还没到"他本来就要说"');
	ok(S.levers(art, p4).some((lv) => lv.id === 'talisman'), '护符在手 → 亮护符这一枚筹码可用');
	const p5 = emptyPc();
	ok(!S.levers(S.ask('哥布林·路'), p5).some((lv) => lv.id === 'stones'), '没读过它之前，"把石头捡回去"这枚筹码不可见');
	p5.soc.read['哥布林'] = true;
	ok(S.levers(S.ask('哥布林·路'), p5).some((lv) => lv.id === 'stones'), '读过它之后 → 筹码出现（读人＝洞悉，换出筹码）');
	// ⑦ 落账：成功＝apply 真的给东西；失败＝什么也不给
	const p6 = emptyPc();
	w.Game.Social.applyAskEffect(S.ask('观星者·图'), p6);
	ok(p6.ev.seer_gave === true, '观星者成功 → seer_gave 落账');
	const p7 = emptyPc();
	w.Game.Social.applyAskEffect(S.ask('守林人·花'), p7);
	// `#733` 片 2-b：单源笔记停写旗标 ⇒ 断言改看**存储**（形式无关）
	ok(p7.ev?.notes?.n_flower_warned === true && p7.ev?.notes?.n_keeper_told === true, '守林人花事成功 → 警告 + 记账（笔记存储）');
	const p8 = emptyPc();
	p8.inv['坏哨'] = true;
	w.Game.Social.applyAskEffect(S.ask('女巫·换哨'), p8);
	ok(p8.inv['好哨'] === true && !p8.inv['坏哨'], '换哨成功 → 好哨入手、坏哨交出');
	// ⑧ 掷骰用的技能必须与位点一致（面板写什么、骰子就掷什么）
	const res = S.roll(pc, '酒馆·打听', 5, '');
	ok(res.skill === '游说' && res.label === '游说检定（魅力）', `roll 走位点技能（${res.label}）`);
	ok(res.site === '酒馆·打听', 'roll 记下位点（<<lastcheckFor>> 靠它复显）');
	// ⑨ 位点若声明的是属性豁免（abil），开口方式也照样走得通（不硬塞技能）
	const saveRes = S.roll(pc, '塔外花田', 12, '');
	ok(saveRes.label.includes('豁免') && saveRes.ability === 'con', `abil 位点走豁免（${saveRes.label}）`);
}

// ── ⑩ 授予三面**同处**执行（`#435` Q1）：“表＝声明（条件/文本/授予），写点执行恒在 `<<rules>>` 一处”──
// 为什么要端到端测（这个文件是唯一带真 SugarCube 的 harness）：`notes-write.mjs` 只能证三个 `apply*` 各自对；
// “三面都接在 `<<rules>>` 上、且连渲两次只落一次”只能在这里证。
{
	const Sg = w.Sg;
	const keep = w.Sg.story.rules;
	const noted = Sg.notes.ids().find((id) => { const e = Sg.notes.entry(id); return e && !Array.isArray(e.flagPath); });
	w.Sg.story.rules = () => [{ id: '__测试·三面', scope: '__测试域', prio: 1, text: '（三面）', yields: [noted], gives: ['__测试道具_e2e'], sets: ['__测试旗标_e2e'] }];
	const vars = w.SugarCube.State.variables;
	Sg.notes.writePath(vars.pc, Sg.notes.entry(noted).flagPath, false);   // 三面先复位到“未授予”
	if (vars.pc.ev.notes) delete vars.pc.ev.notes[noted];
	delete vars.pc.inv['__测试道具_e2e'];
	vars.pc.ev.__测试旗标_e2e = false;
	new w.SugarCube.Wikifier(w.document.createElement('div'), '<<rules "__测试域">>');
	ok(Sg.notes.has(noted) && vars.pc.inv['__测试道具_e2e'] === true && vars.pc.ev.__测试旗标_e2e === true,
		'一次 `<<rules>>` 渲染 ⇒ **三面同落**（yields 笔记 ＋ gives 物品 ＋ sets 状态键）');
	const before = JSON.stringify({ ev: vars.pc.ev, world: vars.pc.world, inv: vars.pc.inv });
	new w.SugarCube.Wikifier(w.document.createElement('div'), '<<rules "__测试域">>');
	ok(JSON.stringify({ ev: vars.pc.ev, world: vars.pc.world, inv: vars.pc.inv }) === before,
		'连渲两次 ⇒ 状态**逐字节不变**（三面各自幂等，结果留屏重放/重渲染安全）');
	w.Sg.story.rules = keep;
	delete vars.pc.ev.__测试旗标_e2e; delete vars.pc.inv['__测试道具_e2e'];
}

// ── `#568` 条件项的**对象算子形**（`gte`／`lte`／`oneOf`）：引擎兑现 ＋ 结构畸形 fail-loud ──
// 背景：门侧（`#560`）早已能**解析**对象形条件项，而引擎只会按字符串键做真值判断
// ⇒ `{ gte: ['star.spent', 3] }` 会被当成"某个键"取真值 ⇒ **静默为假**（行为错，且没有任何门看得见）。
// 这一段就是那个缺口的回归门：正例／反例／边界（缺键、类型不可比）／fail-loud 四类。
{
	const Sg = w.Sg;
	const OPS = (await import('../scripts/audit/lib/shared.mjs')).OPS;
	eq(Sg.rules.ops, OPS, '`Sg.rules.ops` 与门侧 `OPS` 是**同一词表**（两侧漂移会被 `--rules` 抓住）');
	const p = { ev: { seen: true, n: 7 }, world: { done: false }, inv: { 钥匙: true }, star: { spent: 3 }, keeper: { state: 'seal' } };
	const M = (row) => Sg.rules.matches(row, p, new Set());
	// 正例 / 反例（gte · lte）
	ok(M({ req: [{ gte: ['star.spent', 3] }] }), 'gte：`star.spent`=3 ≥ 3 ⇒ 匹配（第三命名空间读得到）');
	ok(!M({ req: [{ gte: ['star.spent', 4] }] }), 'gte：3 ≥ 4 不成立 ⇒ 不匹配');
	ok(M({ req: [{ lte: ['star.spent', 3] }] }), 'lte：3 ≤ 3 ⇒ 匹配（边界取等）');
	ok(!M({ req: [{ lte: ['star.spent', 2] }] }), 'lte：3 ≤ 2 不成立 ⇒ 不匹配');
	// oneOf：两种写法都认（嵌套数组 / 平铺）
	ok(M({ any: [{ oneOf: ['keeper.state', ['seal', 'open']] }] }), 'oneOf（嵌套数组）：seal ∈ 集合 ⇒ 匹配');
	ok(M({ any: [{ oneOf: ['keeper.state', 'seal', 'open'] }] }), 'oneOf（平铺）：同上 ⇒ 匹配');
	ok(!M({ any: [{ oneOf: ['keeper.state', ['open']] }] }), 'oneOf：seal ∉ [open] ⇒ 不匹配');
	// 边界：缺键 ⇒ 不匹配且不抛（"还没发生"是合法状态，不是结构缺陷）
	ok(!M({ req: [{ gte: ['star.nope', 1] }] }), '边界：键缺失 ⇒ 不匹配且**不抛错**');
	ok(!M({ req: [{ oneOf: ['ev.nope', [true]] }] }), '边界：`oneOf` 遇缺键 ⇒ 不匹配');
	ok(!M({ req: [{ gte: ['keeper.state', 1] }] }), '边界：数值算子遇非数值 ⇒ 不匹配（不抛错、不做字符串比）');
	// 与字符串键混用；exclude / 前缀键也走同一条判据
	ok(M({ req: [{ gte: ['star.spent', 1] }, 'ev.seen'] }), '混合：对象形 ＋ 字符串键 ⇒ 都中才匹配');
	ok(!M({ req: [{ gte: ['star.spent', 1] }, 'ev.nope'] }), '混合：字符串键不中 ⇒ 不匹配');
	ok(!M({ exclude: [{ oneOf: ['keeper.state', ['seal']] }] }), 'exclude 认对象形：命中即排除');
	ok(M({ req: [{ oneOf: ['inv:钥匙', [true]] }] }), '前缀键：`inv:钥匙` 在对象形里照样求值 ⇒ 匹配');
	// 结构畸形 ⇒ fail-loud（静默为假正是本票要根除的那类）
	const throws = (row) => { try { M(row); return false; } catch { return true; } };
	ok(throws({ req: [{ gt: ['star.spent', 1] }] }), '未宣告算子「gt」⇒ **抛错**（不静默为假）');
	ok(throws({ req: [{ gte: ['star.spent', 1], lte: ['star.spent', 9] }] }), '一个对象里两个算子 ⇒ 抛错（结构畸形）');
	ok(throws({ req: [{ gte: ['star.spent'] }] }), '算子参数只有键、没有值 ⇒ 抛错');
	ok(throws({ req: [{ gte: 'star.spent' }] }), '算子参数不是数组 ⇒ 抛错');
}

// ── `#624`：对象算子在**真表**里的首批位点（选择器端到端：`Sg.rules.pick(scope, {pc})`）──
// 与上面那段的区别：上面证"引擎能不能算"，这一段证"内容真的在用、且选出来的行对"。
{
	const Sg = w.Sg;
	const P = (ev = {}, keeper = {}, star = {}, inv = {}) => ({ ev, world: {}, keeper, star, inv, soc: {} });
	const pick = (scope, pc) => { const r = Sg.rules.pick(scope, { pc, chose: new Set() }); return r?.id ?? null; };
	eq(pick('守林人#软限', P({}, {}, { spent: 3 })), '守林人.软限', '`gte`：star.spent=3 ⇒ 守林人.软限（脚本 40-ch2 的星力软限那句已进表）');
	eq(pick('守林人#软限', P({}, {}, { spent: 2 })), null, '`gte` 边界：spent=2 ⇒ 不选中（原 `<<if>>` 也不渲染）');
	eq(pick('守林人#封印选项', P({}, { state: 'seal' })), '守林人.封印选项', '`oneOf`：keeper.state=seal ⇒ 封印选项行');
	eq(pick('守林人#封印选项', P({}, { state: 'ally' })), null, '`oneOf` 反例：ally ⇒ 不选中（原 `<<if>>` 同样不渲染）');
	eq(pick('地下宴会厅#哨子', P({}, { state: 'ally' }, {}, { 好哨: true })), '地下宴会厅.哨子', '复合 `req`（算子 ＋ `inv:` 键）：ally＋好哨 ⇒ 哨子选项');
	eq(pick('地下宴会厅#哨子', P({}, { state: 'ally' }, {}, {})), '地下宴会厅.哨子.else', '🔴 兜底行语义：ally 但**没哨子** ⇒ 走 else 选项（`exclude` 单条表达不了这种否定 ⇒ 更低 prio 的兜底行）');
	eq(pick('地下宴会厅#哨子', P({}, {}, {}, { 好哨: true })), '地下宴会厅.哨子.else', '兜底行：state 未设 ＋ 有哨子 ⇒ 仍走 else（与原文一致）');
	eq(pick('地下宴会厅#提醒', P({}, { state: 'seal' })), '地下宴会厅.提醒', '`any`＋`oneOf`：seal ⇒ 守林人那句');
	eq(pick('地下宴会厅#提醒', P({}, { state: 'ally' })), '地下宴会厅.提醒', '`oneOf` 多值：ally ⇒ 同一句（原文 `or`）');
	eq(pick('地下宴会厅#提醒', P({}, { state: 'none' })), '地下宴会厅.提醒.else', '否定行（`exclude`＋算子）：none ⇒ 门框小字那句');
	eq(pick('地下宴会厅#提醒', P({}, {})), '地下宴会厅.提醒.else', '边界：keeper.state **缺失** ⇒ 走 else（与原文 else 同语义）');
}

// ── `#624` 批 1：**菜单进表**（`<<rulelist>>` 渲染全部命中行）──
// 与 `pick()`（单选）互补：一个作用域 = 一个"还能问哪几个话题"的菜单。
// 注：话题行的条件键是**笔记 id**（`n_tav_*`）⇒ 走 `Sg.notes.has()`（不是 `pc.ev`），所以这里替换笔记判定做对照。
{
	const Sg = w.Sg;
	const P = { ev: {}, world: {}, keeper: {}, star: {}, inv: {}, soc: {} };
	const keep = Sg.notes.has;
	const withNotes = (list) => { const set = new Set(list); Sg.notes.has = (id) => set.has(String(id)); };
	const ids = (scope) => Sg.rules.pickAll(scope, { pc: P, chose: new Set() }).map((r) => r.id);
	withNotes([]);
	eq(ids('酒馆#打听').length, 6, '菜单：一个话题都没问过 ⇒ 6 行全渲染（`pick` 只会给 1 行）');
	ok(Sg.rules.pick('酒馆#打听', { pc: P, chose: new Set() }) !== null, '对照：单选入口 `pick()` 在同一作用域只给 1 行');
	withNotes(['n_tav_keeper']);
	eq(ids('酒馆#打听').length, 5, '问过一条 ⇒ 少一条（`exclude` 生效）');
	withNotes(['n_tav_keeper', 'n_tav_dragon', 'n_tav_grudge', 'n_tav_ageless', 'n_tav_flower', 'n_tav_painting']);
	eq(ids('酒馆#打听').length, 0, '全问过 ⇒ 菜单为空（不再渲染任何行）');
	withNotes([]);
	eq(ids('女巫小屋#打听').length, 7, '女巫小屋菜单：7 条话题');
	ok(ids('酒馆#打听').every((id) => id.startsWith('酒馆.t')), '菜单行的 id 归属正确（同 scope）');
	Sg.notes.has = keep;

	// 真机：渲染段落 ⇒ 数链接；点一条 ⇒ 笔记落下 ＋ 再渲染少一条
	w.SugarCube.Engine.play('酒馆');
	await sleep(200);
	const countLinks = () => [...w.document.querySelectorAll('#passages a.link-internal')].filter((a) => /讲守林人的那一桌|上了年纪的村人|跑生意的|接嘴的那个人|背着画板的游客|墙上那幅旧画/.test(a.textContent)).length;
	eq(countLinks(), 6, '真机：酒馆菜单渲染出 6 条话题链接');
	const pickLink = () => [...w.document.querySelectorAll('#passages a.link-internal')].find((a) => a.textContent.includes('讲守林人的那一桌'));
	pickLink().click();
	await sleep(300);
	ok(w.eval("Sg.notes.has('n_tav_keeper')") === true, '真机：点一次 ⇒ 笔记 n_tav_keeper 落下（`<<note>>` 点击态）');
	eq(countLinks(), 5, '真机：再渲染 ⇒ 菜单少一条（问过的不再出现）');
}

// ── `#624` 片二：**取值项**（`{ price: '<econ id>' }`）＋ 可负担性行（批 4）──
// 形状：`req: [{ gte: ['gold', { price: 'rumor_buy' }] }]` —— 操作数是"随状态变的值"，由引擎经封装层取。
{
	const Sg = w.Sg;
	const keepHas = Sg.notes.has, keepTerms = Sg.rules.terms;
	const setNotes = (list) => { const set = new Set(list); Sg.notes.has = (id) => set.has(String(id)); };
	const base = { ev: {}, world: {}, keeper: {}, star: {}, inv: {}, soc: {} };
	const pickId = (gold, notes = []) => { setNotes(notes); const r = Sg.rules.pick('酒馆#打听情报', { pc: { ...base, gold }, chose: new Set() }); return r?.id ?? null; };
	const price = -w.Game.Economy.priceOf('rumor_buy', { ...base, gold: 100 });
	ok(price > 0, `取值项：事件「rumor_buy」当前价 ${price} 金（经封装层算出，不是硬编码）`);
	eq(pickId(price), '酒馆.情报.买', `req 用取值项：钱刚好够（gold=${price}）⇒ 选中「买」行`);
	eq(pickId(price - 1), '酒馆.情报.else', '反例：少 1 金 ⇒ 落到兜底行（渲染"买不起"原文案）');
	eq(pickId(price, ['n_rumor']), '酒馆.情报.else', '已买过（n_rumor）⇒ 兜底行（`exclude` 生效）');
	eq(pickId(999, ['n_rumor']), '酒馆.情报.else', '边界：钱多但也已买过 ⇒ 仍兜底行（条件不看钱）');
	// 未宣告的取值项 ⇒ fail-loud（静默当字面量会让条件永假）
	Sg.rules.terms = [];
	let threw = false;
	try { pickId(999); } catch { threw = true; }
	ok(threw, '🔴 取值项未宣告 ⇒ **抛错**（不静默当真/假）');
	Sg.rules.terms = keepTerms;
	// 真机：钱够 ⇒ 看到带价格的买入口；点一次 ⇒ 扣钱 ＋ 落笔记；再渲染 ⇒ 换文案
	w.eval('SugarCube.State.variables.pc.gold = 99');
	setNotes([]);
	Sg.notes.has = keepHas;
	w.SugarCube.Engine.play('酒馆');
	await sleep(250);
	const buyLink = () => [...w.document.querySelectorAll('#passages a.link-internal')].find((a) => /请他讲讲洞里的路/.test(a.textContent));
	const goldBefore = Number(w.eval('SugarCube.State.variables.pc.gold'));
	ok(buyLink() !== undefined, '真机：钱够 ⇒ 酒馆里出现「请他讲讲洞里的路」入口');
	ok(new RegExp(`花 ${price} 金币`).test(buyLink().textContent), `真机：入口标签写着真实价格「花 ${price} 金币」（`<<price>>`／封装层口径）`);
	buyLink().click();
	await sleep(300);
	ok(Number(w.eval('SugarCube.State.variables.pc.gold')) === goldBefore - price, `真机：点一次扣 ${price} 金（${goldBefore} → ${goldBefore - price}）`);
	ok(w.eval("Sg.notes.has('n_rumor')") === true, '真机：笔记 n_rumor 落下（点击态 `<<note>>`）');
	setNotes(['n_rumor']);
	eq(pickId(999, ['n_rumor']), '酒馆.情报.else', '真机后再取：已买过 ⇒ 兜底行（与屏上一致）');
	Sg.notes.has = keepHas;
}

// ── `#624` 批 2：act handler 里**可迁子集**（守卫是 era／world 的入口）──
{
	const Sg = w.Sg;
	const P = (world = {}) => ({ ev: {}, world, keeper: {}, star: {}, inv: {}, soc: {} });
	const V = w.SugarCube.State.variables, keep = V.era;
	const pickId = (scope, pc) => Sg.rules.pick(scope, { pc, chose: new Set() })?.id ?? null;
	V.era = w.Game.Era.PAST;
	eq(pickId('工坊#问铁匠', P()), '工坊.问铁匠', '`era:past` ⇒ 选中「问铁匠」入口（原手写 `<<if $era is Game.Era.PAST>>`）');
	V.era = w.Game.Era.PRESENT;
	eq(pickId('工坊#问铁匠', P()), null, '现在侧 ⇒ 不选中（与原文一致）');
	eq(pickId('天文台#取书', P()), '天文台.取书.现在', '取书：现在侧且没拿过 ⇒ 「找手稿」链接行');
	V.era = w.Game.Era.PAST;
	eq(pickId('天文台#取书', P()), '天文台.取书.过去', '取书：过去侧 ⇒ 「抄本都还新」那句（与原文 else 同语义）');
	V.era = w.Game.Era.PRESENT;
	eq(pickId('天文台#取书', P({ book_taken: true })), '天文台.取书.已取', '取书：已拿过 ⇒ 「已经不在架上了」（`req: [world.book_taken]`）');
	ok(pickId('天文台#取书', P({ book_taken: true })) !== null, '三行互斥：任一状态都恰好命中一行（不会空屏）');
	V.era = keep;
}

// ── `#624` 批 3：`50-ch3` 的四个可迁位点（守卫可表达 ＋ 体内全是词汇宏）──
{
	const Sg = w.Sg;
	const keepHas = Sg.notes.has;
	const setNotes = (list) => { const set = new Set(list); Sg.notes.has = (id) => set.has(String(id)); };
	const P = (ev = {}, world = {}) => ({ ev, world, keeper: {}, star: {}, inv: {}, soc: {} });
	const pickId = (scope, ...args) => Sg.rules.pick(scope, { pc: P(...args), chose: new Set() })?.id ?? null;
	setNotes([]);
	eq(pickId('龙·巢边#拾荒'), '龙巢边.拾荒.可拿', '拾荒：没拿过 ⇒ 「挑值钱的」入口（`<<econ>>`＋`<<setflag>>` 都在点击态）');
	eq(pickId('龙·巢边#拾荒', {}, { hoard_looted: true }), '龙巢边.拾荒.已拿', '拾荒：拿过 ⇒ 「你看过了」那句（`req: [world.hoard_looted]`）');
	eq(pickId('寻杖#还杖', { staff_found: true }), '寻杖.还杖', '还杖：`staff_found ∧ ¬family_favor` ⇒ 选中（原手写复合条件）');
	eq(pickId('寻杖#还杖', { staff_found: true }, { family_favor: true }), null, '还杖：已经还过（family_favor）⇒ 不选中');
	eq(pickId('寻杖#还杖', {}), null, '还杖：还没找到杖 ⇒ 不选中');
	setNotes(['n_failure_cause']);
	eq(pickId('老巫女#问她', { seer_asked: true }), '老巫女.问她', '问她：`n_failure_cause ∧ (seer_asked ∨ coord)` ⇒ 选中（`any` 两支任一）');
	eq(pickId('老巫女#问她', { coord: true }), '老巫女.问她', '问她：另一支（`coord`）同样成立');
	eq(pickId('老巫女#问她', {}), null, '问她：两件证据都没有 ⇒ 不选中');
	setNotes(['n_failure_cause', 'n_witch_fire_hint']);
	eq(pickId('老巫女#答话'), '老巫女.答话', '答话：拿到 `n_witch_fire_hint` ⇒ 渲染回答（**独立 scope**：与入口可同时存在）');
	setNotes([]);
	eq(pickId('观星者#取信'), '观星者.取信', '取信：没读过信 ⇒ 入口行');
	setNotes(['n_letter_seen']);
	eq(pickId('观星者#信已读'), '观星者.信已读', '信已读：读过 ⇒ 说明行（独立 scope）');
	Sg.notes.has = keepHas;
}

// ── `#624` 片三：两个新词汇宏解锁的位点（`<<take>>`／`<<setflag "ev.x">>`）──
{
	const Sg = w.Sg;
	const P = (inv = {}, ev = {}, fight = null) => ({ ev: fight ? { ...ev, fight } : ev, world: {}, keeper: {}, star: {}, inv, soc: {} });
	const pick = (scope, pc) => Sg.rules.pick(scope, { pc, chose: new Set() });
	eq(pick('当时的女巫#送花', P({ 月光花: true }))?.id, '当时的女巫.送花', '送花：带着月光花 ⇒ 选中（`req: [inv:月光花]`）');
	eq(pick('当时的女巫#送花', P({})), null, '送花：没有花 ⇒ 不选中');
	// 真机：点一次 ⇒ 花被取走（`<<take>>`）＋ ev 旗标置真（`<<setflag "ev.x">>`）
	const V = w.SugarCube.State.variables;
	V.pc.inv['月光花'] = true; delete V.pc.ev.witch_gifted;
	w.eval('SugarCube.Engine.play("当时的女巫")');
	await sleep(250);
	const link = () => [...w.document.querySelectorAll('#passages a.link-internal')].find((a) => /把那朵月光花送给她/.test(a.textContent));
	ok(link() !== undefined, '真机：带花进「当时的女巫」⇒ 出现送花入口');
	link().click();
	await sleep(300);
	ok(w.eval("SugarCube.State.variables.pc.inv['月光花'] === undefined"), '真机：点一次 ⇒ `<<take "月光花">>` 把花取走（inv 里没了）');
	ok(w.eval('SugarCube.State.variables.pc.ev.witch_gifted === true'), '真机：`<<setflag "ev.witch_gifted">>` 把 **ev** 旗标置真（原来只能裸 `<<set>>`）');
	// 战斗退开：守卫是战斗瞬态
}

// ── `#624` 片四：`gear:` 前缀（行囊/装备）—— 火把两处 ＋ 洞穴火光变体 ──
{
	const Sg = w.Sg;
	const pick = (scope, gear = [], gold = 0) => Sg.rules.pick(scope, { pc: { ev: {}, world: {}, keeper: {}, star: {}, inv: {}, soc: {}, gear, gold }, chose: new Set() })?.id ?? null;
	const price = -w.Game.Economy.priceOf('torch_buy', { ev: {}, world: {}, gear: [], gold: 100 });
	eq(pick('酒馆#买火把', [], price - 1), null, `买火把：没买过且钱不够（${price - 1} < ${price}）⇒ 什么都不渲染（与原文一致）`);
	eq(pick('酒馆#买火把', [], price), '酒馆.买火把', `买火把：钱刚好够（${price} 金）⇒ 出现买入口`);
	eq(pick('酒馆#买火把', ['火把'], 999), null, '买火把：已经有了 ⇒ 不再出买入口（`exclude: [gear:火把]`）');
	eq(pick('酒馆#火把已备', ['火把']), '酒馆.火把已备', '火把已备：行囊里有 ⇒ 出「看好火」那句');
	eq(pick('酒馆#火把已备', []), null, '火把已备：没有 ⇒ 不出（独立 scope）');
	eq(pick('洞穴#火光', ['火把']), '洞穴.火光.有火把', '洞穴：带火把 ⇒ 火光照出一地碎石头');
	eq(pick('洞穴#火光', []), '洞穴.火光.无火把', '洞穴：没火把 ⇒ 洞口漏进灰光（两行互斥，不会空屏）');
	// 真机：洞穴段落按行囊渲染不同那句 + 买火把入口带真实价格
	// ⚠️ 行囊是**数组**：必须**在页内**赋值（Node 那边造数组塞进去 ⇒ SugarCube 的 clone 不认外部 realm 的 Array，实测 TypeError）
	w.eval("SugarCube.State.variables.pc.gear = ['火把']");
	w.SugarCube.Engine.play('洞穴');
	await sleep(200);
	ok(/火把的光在石壁上摊开/.test(w.document.querySelector('#passages')?.textContent ?? ''), '真机：行囊有火把 ⇒ 洞穴渲染「火把的光…」');
	w.eval('SugarCube.State.variables.pc.gear = []');
	w.SugarCube.Engine.play('洞穴');
	await sleep(200);
	ok(/洞口漏进来一点灰光/.test(w.document.querySelector('#passages')?.textContent ?? ''), '真机：行囊没有火把 ⇒ 渲染「洞口漏进来一点灰光」');
	w.eval("SugarCube.State.variables.pc.gear = ['火把']");
	w.SugarCube.Engine.play('酒馆');
	await sleep(250);
	ok(![...w.document.querySelectorAll('#passages a.link-internal')].some((a) => /买一支火把/.test(a.textContent)), '真机：已有火把 ⇒ 酒馆不出买入口');
}

console.log(failures ? `\n${failures} 项失败` : '\n规则层测试全部通过');
process.exit(failures ? 1 : 0);
