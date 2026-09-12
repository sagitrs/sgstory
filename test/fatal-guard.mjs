// 致命伤门（#357）：**死亡是一手行动的终点**——死亡跳转不得被后续 <<goto>> 覆盖，
// 也不得被 :passagestart 的 hp≤0 安全网复活。
//
// 为什么单独一个门而不是 scenarios 路线：C4/E4 的判据建立在「完整路线」上，而本检查是
// **状态夹具 + 一次点击**的构造性用例；放进路线体系会抬高家族数、扰动节奏/相异度度量
// （本次实测：家族 18→19，导致同伴的 R1b 反例自证失效）。
//
// 静态那一半（九处「damage 后无条件 goto」已全部包进存活条件）在 test/integrity.mjs；
// 本门验行为那一半：真致命伤 → 落在结局页、hp 不被修回、没有继续剧情的出口。
//
// 用法：node test/fatal-guard.mjs
import { newGame } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;

// 站点表：每个「致命伤后紧跟普通跳转」的历史位点，注入「一击必死」的状态各验一遍
const SITES = [
	{ p: '顶楼', label: '抢他的杖，自己去打', why: '#357 原始复现点（damage heavy → goto 顶楼 覆盖死亡）' },
	{ p: '书房', label: '伸手去摸烤炉后头的暗格', why: '#357 夹具二（study_found 支）' },
	{ p: '工坊', label: '把护臂翻过来，擦开内圈看刻痕', why: '同族站点（graze + goto 工坊）', optional: true },
];

console.log('══ 致命伤门（#357：死亡不得被覆盖／复活）══');
for (const site of SITES) {
	const s = await newGame({ random: 0.01, session: { wait: 140 } });   // d20 恒 1 → 检定必败，走伤害支
	const w = s.w;
	try {
		w.eval(`(function(){const pc=SugarCube.State.variables.pc;pc.hp=1;pc.salves=0;pc.ev=pc.ev||{};pc.world=pc.world||{};pc.keeper=pc.keeper||{};})()`);
		w.SugarCube.Engine.play(site.p); await sleep(220);
		const links = [...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent.trim());
		if (!links.some((x) => x.includes(site.label))) {
			if (site.optional) { console.log(`  ○ 跳过「${site.p}｜${site.label}」（本版本无此选项）`); continue; }
			throw new Error(`找不到选项「${site.label}」@ ${site.p}`);
		}
		await s.clickByLabel(site.label);
		await sleep(250);
		const pc = w.SugarCube.State.variables.pc;
		const passage = w.SugarCube.State.passage;
		const problems = [];
		if (!String(passage).startsWith('结局')) problems.push(`致命伤后没有落在结局页（停在「${passage}」）——死亡跳转被覆盖`);
		if ((pc.hp ?? 0) > 0) problems.push(`hp 被修回 ${pc.hp}（安全网复活了刚受致命伤的角色）`);
		if (pc.ev?.ending !== '死亡') problems.push(`致命伤没有登记结局（ending=${pc.ev?.ending ?? 'null'}）`);
		const cont = [...w.document.querySelectorAll('#passages a.link-internal')]
			.map((a) => a.textContent.trim())
			.filter((x) => !x.includes('设定集'));
		if (cont.some((x) => x.includes('下楼') || x.includes('抢他的杖') || x.includes('摸') )) problems.push(`死亡后仍有继续剧情的出口：${cont.join(' / ')}`);
		if (problems.length) { bad++; for (const x of problems) console.error(`  ✗ ${site.p}｜${site.label}：${x}`); }
		else console.log(`  ✓ ${site.p}｜${site.label}（${site.why}）`);
	} catch (e) {
		bad++;
		console.error(`  ✗ ${site.p}｜${site.label}：${e.message.slice(0, 120)}`);
	} finally {
		w.close?.();
	}
}

if (bad) {
	console.error(`\n✗ 致命伤门：${bad} 项（死亡被覆盖或复活）`);
	process.exit(1);
}
console.log('✔ 致命伤是一手行动的终点（结局页落地 · hp 不修回 · 无继续剧情出口）');
