// 经济事件价门（`#785` 机制片 · 接缝 4）——**下沉不许改契约**
//
// 背景：`Game.Economy.priceOf(key, pc)` 原先住在**故事表**（直读 `this.events`）⇒ 下沉为引擎读接入契约
//   （`this.econEvents()`，与 `apply()` 同源）。语义逐字保留：`delta` 基准 ＋ 两个折扣规则
//   （`featDiscount` 旗标 / `skillDiscount` 技能，命中即取 `to`，**旗标先于技能**）＋ 未知事件 throw。
//
// 判据（四条）：
//   ① **基准**：无折扣输入 ⇒ `events[key].delta`；
//   ② **折扣**：给出该 key 声明的 `featDiscount`/`skillDiscount` 输入 ⇒ 取 `to`；两规则并存时**旗标优先**（顺序是语义）；
//   ③ **矩阵**：**全 key × 3 档 pc**（`{}` / 全旗标 / 全技能）逐值等于**测试侧独立重算**的值
//      —— 覆盖"读入参数的档位"（`#785` 模板：单点会绿 ✗）；
//   ④ **caller 面**：`Sg.rules.termValue({ price: id }, pc)` 必须恒等于 `-priceOf(id, pc)`
//      （只钉实现不钉 caller ＝ 把契约交给"没人改 caller"的运气 ✗）。
//
// ⚠️ 诚实说明：故事侧成员删除**前**，活的是**故事那份**函数（同内容）⇒ 本门此刻守的是**契约**；
//   故事侧一删（同一分支的批改），本门立刻开始守**引擎那份**实现 ✓。
//
// 用法：node test/econ-price.mjs [--selftest]

import { boot } from './boot.mjs';

let bad = 0;
const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}${extra ? ' · ' + extra : ''}`); } };

/** **测试侧独立重算**（只读数据字段，不复用引擎的分支顺序写法）。 */
export const refPrice = (events, key, pc) => {
	const ev = events?.[key];
	if (!ev) throw new Error(`未知经济事件: ${key}`);
	const feat = ev.featDiscount, skill = ev.skillDiscount;
	if (feat?.flag && pc?.flags?.[feat.flag]) return feat.to;
	if (skill?.skill && pc?.skills?.includes(skill.skill)) return skill.to;
	return ev.delta;
};

if (process.argv.includes('--selftest')) {
	// 自证：判据函数本身要能红（合成数据，不依赖故事）
	const E = { a: { delta: 7 }, b: { delta: 9, featDiscount: { flag: 'f', to: 3 } }, c: { delta: 9, featDiscount: { flag: 'f', to: 3 }, skillDiscount: { skill: 's', to: 5 } } };
	const cases = [
		['正例·基准', refPrice(E, 'a', {}) === 7],
		['正例·旗标折扣命中', refPrice(E, 'b', { flags: { f: true } }) === 3],
		['正例·旗标优先于技能（顺序是语义）', refPrice(E, 'c', { flags: { f: true }, skills: ['s'] }) === 3],
		['正例·只有技能 ⇒ 取技能折扣', refPrice(E, 'c', { skills: ['s'] }) === 5],
		['🔴 反例·未知事件 ⇒ throw', (() => { try { refPrice(E, 'zzz', {}); return false; } catch { return true; } })()],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（5 例）');
	process.exit(0);
}

const { w, close } = await boot({ story: 'mist-forest', random: 0.5 });
try {
	const data = w.eval('(() => ({ ev: window.Sg.story.econEvents(), po: window.Game.Economy.priceOf }))()');
	const events = data.ev ?? {};
	const keys = Object.keys(events);
	ok('取到事件表与 priceOf', keys.length > 0 && typeof data.po === 'function', `${keys.length} 个事件`);
	ok('`priceOf` 挂在 `Game.Economy` 上（`termValue` 的硬依赖：宿主不许变）', w.eval('typeof window.Game.Economy.priceOf') === 'function');

	const flags = [...new Set(keys.flatMap((k) => (events[k].featDiscount ? [events[k].featDiscount.flag] : [])))];
	const skills = [...new Set(keys.flatMap((k) => (events[k].skillDiscount ? [events[k].skillDiscount.skill] : [])))];
	const presets = [{ label: '空 pc', pc: {} }, { label: '全旗标', pc: { flags: Object.fromEntries(flags.map((f) => [f, true])) } }, { label: '全技能', pc: { skills } }];

	let mismatch = 0;
	for (const { pc } of presets) for (const key of keys) {
		const got = w.eval(`window.Game.Economy.priceOf(${JSON.stringify(key)}, ${JSON.stringify(pc)})`);
		const want = refPrice(events, key, pc);
		if (got !== want) { mismatch++; if (mismatch <= 3) console.error(`      ${key} · ${JSON.stringify(pc)} ⇒ 实得 ${got}，参考 ${want}`); }
	}
	ok(`矩阵：全 key × 3 档 pc 逐值等于独立重算（共 ${keys.length * presets.length} 组）`, mismatch === 0, `不一致 ${mismatch}`);

	let callerBad = 0;
	for (const { pc } of presets) for (const key of keys) {
		const viaTerm = w.eval(`window.Sg.rules.termValue({ price: ${JSON.stringify(key)} }, ${JSON.stringify(pc)})`);
		const direct = w.eval(`-window.Game.Economy.priceOf(${JSON.stringify(key)}, ${JSON.stringify(pc)})`);
		if (viaTerm !== direct) callerBad++;
	}
	ok('caller 面：`termValue({price:id})` 恒等于 `-priceOf(id)`', callerBad === 0, `不一致 ${callerBad}`);

	const threw = w.eval("(() => { try { window.Game.Economy.priceOf('__不存在__', {}); return false; } catch (e) { return e.message === '未知经济事件: __不存在__'; } })()");
	ok('未事件 ⇒ throw 且报文逐字不变', threw === true);
} finally { close?.(); }

if (bad) { console.error(`\n✗ 经济事件价门未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ 经济事件价门通过（基准 · 折扣 · 矩阵 · caller 面 · 报文）');
