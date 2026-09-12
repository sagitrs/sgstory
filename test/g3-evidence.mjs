// G3 跨时代合龙门 · 证据支路可达性（#365）：过去侧证据有**两条**（问过观星者 / 星图坐标），
// 两条都应该能单独配合现在侧日记（failure_cause）把选项问出来。
//
// 为什么需要它：#365 实测「问答支路失效」——生产者 `<<setflag "seer_asked">>` 写 **world**，
// 而合龙门读 **ev.seer_asked** → 只带日记＋问过观星者（未取星图）时**选项不出现**，
// 整条推理路线的另一半静默死掉。静态侧由 `audit --state` 的「命名空间一致性」断言常设看住；
// 本文件补的是一条**行为断言**：两种过去侧证据各自都能开门。
import { boot, CLICKABLE_SEL } from './boot.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { w, settle } = await boot({ random: () => 0.99 });
const hasOption = () => [...w.document.querySelectorAll(CLICKABLE_SEL)].some((a) => a.textContent.includes('那一夜该烧的是什么'));

const probe = async (seed) => {
	w.eval(`(function(){const pc=SugarCube.State.variables.pc;pc.ev=pc.ev||{};
		delete pc.ev.failure_cause; delete pc.ev.seer_asked; delete pc.ev.coord; delete pc.world.seer_asked;
		${seed} pc.ev.old_witch=true; SugarCube.State.variables.era='past';})()`);
	w.SugarCube.Engine.play('老巫女');
	await settle();
	for (let i = 0; i < 20 && !hasOption(); i++) { await sleep(100); await settle(); }
	return hasOption();
};

const cases = [
	['日记 ＋ 问过观星者（无星图）→ 必须出现', 'pc.ev.failure_cause=true; pc.ev.seer_asked=true;', true],
	['日记 ＋ 星图坐标 → 必须出现', 'pc.ev.failure_cause=true; pc.ev.coord=true;', true],
	['只有日记 → 不得出现', 'pc.ev.failure_cause=true;', false],
	['只有问过观星者 → 不得出现', 'pc.ev.seer_asked=true;', false],
	['只有星图坐标 → 不得出现', 'pc.ev.coord=true;', false],
];
let bad = 0;
for (const [label, seed, expect] of cases) {
	const got = await probe(seed);
	const ok = got === expect;
	if (!ok) bad++;
	console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `（实况：${got ? '出现' : '不存在'}）`}`);
}
console.log(bad ? `\n✗ G3 证据支路门未通过（${bad} 项）` : '\n✔ G3 证据支路门通过（两条过去侧证据都能单独开门 · 单侧不足不开门）');
if (bad) process.exit(1);
