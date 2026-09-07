// 规则层单元测试：mod/skillMod/check/	save/修饰栈/车卡数据完整性
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('dist/index.html', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const dom = new JSDOM(html, {
	runScripts: 'dangerously',
	pretendToBeVisual: true,
	url: 'http://localhost/',
	virtualConsole: new VirtualConsole(),
	beforeParse(window) {
		window.Math.random = () => 0.5; // d20 恒为 11
	},
});
await sleep(1200);
const w = dom.window;
const init = w.document.querySelector('tw-passagedata[name="StoryInit"]');
new w.SugarCube.Wikifier(null, init.textContent);
w.SugarCube.Engine.start();
await sleep(500);

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
// 重新加载一个 nat20 环境
const dom20 = new JSDOM(html, {
	runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
	virtualConsole: new VirtualConsole(),
	beforeParse(window) { window.Math.random = () => 0.999; },
});
await sleep(1200);
new dom20.window.SugarCube.Wikifier(null, dom20.window.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
dom20.window.SugarCube.Engine.start();
await sleep(400);
const nat20 = dom20.window.Rules.check(pc, '运动', 30); // 20-1=19 < 30，仍应成功
ok(nat20.roll === 20 && nat20.success, '自然 20 → 无视 DC 必然成功');
const nat20save = dom20.window.Rules.save(pc, 'str', 25);
ok(nat20save.success, '豁免同样适用自然 20 规则');

const dom1 = new JSDOM(html, {
	runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
	virtualConsole: new VirtualConsole(),
	beforeParse(window) { window.Math.random = () => 0.0001; },
});
await sleep(1200);
new dom1.window.SugarCube.Wikifier(null, dom1.window.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
dom1.window.SugarCube.Engine.start();
await sleep(400);
const nat1 = dom1.window.Rules.check(pc, '察觉', 1); // 1+4=5 ≥ 1，仍应失败
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

// ── Pc 形状迁移（坑10：旧存档缺新增字段）──
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

console.log(failures ? `\n${failures} 项失败` : '\n规则层测试全部通过');
process.exit(failures ? 1 : 0);
