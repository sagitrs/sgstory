// 位点文案门（`#785` 机制片 · 接缝 5）——**下沉不改契约**
//
// `Game.Combat.siteInfo(actionId)` 原住故事表（直读 `Checks.sites` ＋ `this.actions`）→ 下沉为引擎
// **经接入契约取数**（`Sg.story.combatAction(id)` ＋ `Sg.story.checkSite(name)` —— 两者本来就有 → 无新成员）。
// 判据（三条）：
// ① **矩阵**：全部已登记 action × 4 种位点形态（技能／`con` 体质豁免／其它属性／缺位点）逐值等于**测试侧独立重算**；
// ② **退化不当崩**（行为陷阱）：**未登记动作** → `''`（不是抛 —— `combatAction` 自己会抛 由本方法吞掉）；
// ③ **格式**：`<标签> DC<dc>` 逐字符（标签走引擎 `Game.Rules.skillLabel`）。
//
// 用法：node test/siteinfo-sink.mjs [--selftest]

import { boot } from './boot.mjs';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';   // `#1004` B2b：默认故事走单一权威

let bad = 0;
const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}${extra ? ' · ' + extra : ''}`); } };

/** 测试侧**独立**重算：只读声明数据，不复用引擎的分支写法。 */
export const refSiteInfo = (sites, actions, skillLabel, actionId) => {
	const a = actions?.[actionId];
	const s = a?.site ? sites?.[a.site] : null;
	if (!s) return '';
	const what = s.skill ? skillLabel(s.skill) : (s.abil === 'con' ? '体质豁免' : s.abil);
	return `${what} DC${s.dc}`;
};

if (process.argv.includes('--selftest')) {
	const sites = { A: { skill: '运动', dc: 12 }, B: { abil: 'con', dc: 10 }, C: { abil: 'wis', dc: 9 } };
	const acts = { x: { site: 'A' }, y: { site: 'B' }, z: { site: 'C' }, w: {} };
	const L = (s) => `${s}检定（力量）`;
	const cases = [
		['正例·技能位点', refSiteInfo(sites, acts, L, 'x') === '运动检定（力量） DC12'],
		['正例·`con` ⇒ 体质豁免', refSiteInfo(sites, acts, L, 'y') === '体质豁免 DC10'],
		['正例·其它属性原样', refSiteInfo(sites, acts, L, 'z') === 'wis DC9'],
		['🔴 边界·动作没挂位点 ⇒ 空串（不抛）', refSiteInfo(sites, acts, L, 'w') === ''],
		['🔴 边界·未登记动作 ⇒ 空串（不抛）', refSiteInfo(sites, acts, L, 'zzz') === ''],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（5 例）');
	process.exit(0);
}

// `#1004` B2b：旧故事已删 → 换到**默认故事**（＝`DEFAULT_SLUG`，现为面夹具 `face-fixture`，
// 位点表／动作表都是它的满配面）—— 本件量的是"表 ↔ 引擎查询"的**接缝**，与哪个故事无关。
const { w, close } = await boot({ story: DEFAULT_SLUG, random: 0.5 });
try {
	const data = w.eval('(() => ({ sites: window.Game?.Checks?.sites ?? {}, actions: window.Game?.Combat?.actions ?? {}, has: typeof window.Game.Combat.siteInfo }))()');
	const ids = Object.keys(data.actions ?? {});
	ok('取到位点表／动作表／方法', ids.length > 0 && Object.keys(data.sites).length > 0 && data.has === 'function', `${ids.length} 动作 · ${Object.keys(data.sites).length} 位点`);

	let diff = 0;
	for (const id of ids) {
		const got = w.eval(`window.Game.Combat.siteInfo(${JSON.stringify(id)})`);
		const want = refSiteInfo(data.sites, data.actions, (s) => w.eval(`window.Game.Rules.skillLabel(${JSON.stringify(s)})`), id);
		if (got !== want) { diff++; if (diff <= 3) console.error(`      ${id} ⇒ 实得 ${JSON.stringify(got)}，参考 ${JSON.stringify(want)}`); }
	}
	ok(`矩阵：全部已登记 action 等于独立重算（${ids.length} 组）`, diff === 0, `不一致 ${diff}`);

	const unknown = w.eval('(() => { try { return { v: window.Game.Combat.siteInfo("__未登记__") }; } catch (e) { return { err: String(e.message).slice(0, 80) }; } })()');
	ok('退化不当崩：未登记动作 ⇒ 空串（不是抛）', unknown.v === '' , unknown.err ? `抛了：${unknown.err}` : '');
} finally { close?.(); }

if (bad) { console.error(`\n✗ 位点文案门未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ 位点文案门通过（矩阵 · 退化不当崩 · 格式）');
