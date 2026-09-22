// `#1132` B3：**生命周期等价格**（引擎按 json 建的行为 ↔ 动手前用旧 JS 冻结的基线）。
// 为什么换口径：B2 比的是「旧故事侧 `apply(pc)` 对新声明式施加器」，而旧路随
// `stories/face-fixture/10-fixture.twee` 删除已消失 → 该前提在树上不再成立。
// 现口径三层：① 预设生命周期对照冻结基线（无排除面）；② 宏面（姓名与模式由宏接管）；
// ③ 注入格（证明①能红）。第②层对照的是**当前宏的契约**，不是基线，因为基线的口径是
// `applyPreset` 路径（不含宏的 `mode`／`finalized`／姓名三步）。
import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

const BASE = JSON.parse(readFileSync(new URL('../stories/face-fixture/gates/chargen-lifecycle-baseline.json', import.meta.url), 'utf8'));
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`      ✓ ${label}`);
	else { bad++; console.log(`      ✗ ${label}${extra ? ' ⇒ ' + extra : ''}`); }
};

const names = Object.keys(BASE);
console.log(`  冻结基线：${names.length} 个预设（${names.join('、')}）`);

// ① 预设生命周期：各起净实例，只跑 applyPreset，比终态逐字段
const finals = new Map();
for (const name of names) {
	const { w } = await boot({ random: 0.5 });
	const idx = w.Game.Chargen.presets.findIndex((p) => p.name === name);
	ok(`${name}：引擎里有同名预设`, idx >= 0);
	if (idx < 0) continue;
	w.Game.Chargen.applyPreset(idx);
	const pc = w.SugarCube.State.variables.pc;
	finals.set(name, pc);
	const exp = BASE[name].pc;
	const keys = new Set([...Object.keys(pc), ...Object.keys(exp)]);
	const bads = [];
	for (const k of keys) if (!deepEq(pc[k], exp[k])) bads.push(`${k}：基线=${JSON.stringify(exp[k])} 现值=${JSON.stringify(pc[k])}`);
	ok(`${name}：终态与基线逐字段相同（${keys.size} 字段）`, bads.length === 0, bads.join(' ｜ ').slice(0, 500));
	ok(`${name}：picked 条数与基线 picks 一致`, pc.picked.length === BASE[name].picks.length, `现值 ${pc.picked.length}／基线 ${BASE[name].picks.length}`);
}

// ② 宏面：走 `<<applyQuickPreset>>`，姓名、模式、终局标记由宏接管
{
	const { w } = await boot({ random: 0.5 });
	const pc = w.SugarCube.State.variables.pc;
	const idx = 0;
	const expectName = w.Game.Chargen.presets[idx].pcName;
	pc.presetIdx = idx;
	const host = w.document.createElement('div');
	new w.SugarCube.Wikifier(host, '<<applyQuickPreset>>');
	ok('宏面：模式置为 quick', pc.mode === 'quick', `现值 ${JSON.stringify(pc.mode)}`);
	ok('宏面：终局标记置真', pc.finalized === true);
	ok(`宏面：姓名由数据接管（期望 ${JSON.stringify(expectName)}）`, pc.name === expectName, `现值 ${JSON.stringify(pc.name)}`);
}

// ③ 注入格：改一位能力值 → 与基线必不等（证明①的比较能红）
{
	const sample = finals.get(names[0]);
	const key = sample && Object.keys(sample.abilities ?? {})[0];
	if (!sample || !key) ok('注入格：样本含 abilities 面', false);
	else {
		const clone = JSON.parse(JSON.stringify(sample));
		clone.abilities[key] = Number(clone.abilities[key] ?? 0) + 1;
		ok('注入格：改一位能力值后与基线必不等', !deepEq(clone, BASE[names[0]].pc));
	}
}

console.log(bad ? `\n✗ 生命周期等价格未通过（${bad} 项）` : `\n✔ 生命周期等价格通过：${names.length} 个预设终态与冻结基线逐字段相同，宏面三步照旧`);
process.exit(bad ? 1 : 0);
