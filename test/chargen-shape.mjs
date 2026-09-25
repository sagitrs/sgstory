// 车卡面判据（`#1353` 乙组·从 `test/properties.mjs` **拆出**）。
//
// ★ 本件**暂未接入**（`test-plan` 挂起表登记）：真因＝**引擎段序缺陷 `#1418`**
//   —— `Game.Chargen` 在"故事声明了 `data/chargen.json`"的故事上是 `undefined`（一次性判定早于故事件加载）
//   ⇒ 本件今天必崩在 `Game.Chargen.rounds`；待 `#1418` 修好 ⇒ 接夹具 `m3-chargen-fixture` 并撤挂 ✓
//
// 跑法（修好后）：SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node test/chargen-shape.mjs

import { boot } from './boot.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

const { w, uncaught: _uncaught, sleep } = await boot({ random: 0.5 });

// ── 车卡不变量：专家模式 3 轮随机选（种子化）（原 `properties` D 段，`#1353` 乙组拆出）──
{
	let seed = 31337;
	const rng = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed >>>= 0; seed ^= seed << 5; seed >>>= 0; return seed / 0xffffffff; };
	let shapeBad = 0;
	const runs = [];
	for (let run = 0; run < 6; run++) {
		w.eval('SugarCube.State.variables.pc = Game.Pc.defaults()');
		for (let r = 0; r < 3; r++) {
			const n = w.eval(`Game.Chargen.rounds[${r}].options.length`);
			w.eval(`Game.Chargen.pick(${r}, ${Math.floor(rng() * n)})`);
		}
		const p = JSON.parse(w.eval('JSON.stringify(SugarCube.State.variables.pc)'));
		runs.push(`${p.classKey}/${p.bgKey}/${p.speciesKey}`);
		if (p.round !== 3) shapeBad++;
		if (p.hp !== p.max_hp || !(p.max_hp > 0)) shapeBad++;
		if (new Set(p.skills).size !== p.skills.length) shapeBad++;
		if (p.picked.length !== 3) shapeBad++;
		if (Object.values(p.abilities).some((v) => v < 8 || v > 20)) shapeBad++;
		if (!p.classLabel || !p.bgLabel || !p.speciesLabel) shapeBad++;
	}
	ok(shapeBad === 0, `车卡形状律 ×6 种子：round=3 / hp=max_hp / skills 去重 / picked=3 / 属性∈[8,20] / 三项标签齐（${runs.slice(0, 3).join(' ')}…）`);
	ok(new Set(runs).size > 1, `随机组合产生多样角色（${new Set(runs).size} 种 / 6 次）`);
}

console.log(failures ? `\n${failures} 项失败` : '\n车卡形状判据全部通过');
process.exit(failures ? 1 : 0);
