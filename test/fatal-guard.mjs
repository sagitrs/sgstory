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
// ⚠️ `#1004` B2b（换样本）：站点表原本是**旧故事**的三个位点（`顶楼`／`书房`／`工坊`）✗ —— 那两个内容故事
//   已被代码级删除 ⇒ 本门按发起者口径**换成存活样本驱动**：站点住**面夹具**（`face-fixture`）✗ ——
//   夹具的短战斗池（`洞穴·战斗`：`<<fightbegin "雾影">>` ＋ `<<fightpanel>>`）提供「一击可以打死人」的伤害支 ✓；
//   本门测的是**行为**（死亡不被覆盖／不被复活）✗，不是那三段剧情 ⇒ 换样本后判据**逐条不变** ✓。
//
// 用法：node test/fatal-guard.mjs
import { newGame } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;

// 站点表：每个「一击致死」的位点，注入「必败骰 ＋ 1 点血」的状态各验一遍。
// 换样本依据（实测读数）：`洞穴·战斗` 里点「迎上去」⇒ 落 `结局 死亡` · `hp=0` · `pc.ev.ending='死亡'` · 无继续出口 ✓。
const SITES = [
	{ p: '洞穴·战斗', label: '迎上去', why: '面夹具：短战斗池的**玩家**动作（d20 恒 1 ⇒ 失手挨打 ⇒ 必死）' },
	{ p: '封印·并肩', label: '挥刃压上去', why: '面夹具：封印池的**玩家失手反伤**支（`bad.hurt` ⇒ hp=1 必死；与上一条走的是**不同**的伤害入口）' },
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
