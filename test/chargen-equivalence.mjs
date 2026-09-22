// `#1132` B2：**状态无损等价读数**（旧 `apply(pc)` ↔ 新声明式施加器，吃同一份 json ✓）。
//   比较面＝**补丁覆盖的字段集**（施加器的契约面 ✓）——排除面见下（显式打印 ✓ 理由随读数走 ✓）。
import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

const J = JSON.parse(readFileSync(new URL('../stories/face-fixture/data/chargen.json', import.meta.url), 'utf8'));
const { w } = await boot({ random: 0.5 });
// boot 后命名空间：`State`/`Macro` 在 `w.SugarCube.*` ✓；而 `Game`/`Sg` 挂在 **window 根**（实测 ✓ 不猜 ✓）
const Pc = w.Game.Pc, Sg = w.Sg, G = w.Game.Chargen;
let bad = 0;

// 路径展开（点分 ⇒ 值列表；数组整体作为一个值 ✓ 顺序参与比较 ✓）
const readAt = (pc, path) => Sg.notes.readPath(pc, path);
const pathsOf = (patch) => Object.keys(patch);
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const diffLines = [];
const cmp = (label, oldPc, newPc, patch) => {
	const bads = [];
	for (const p of pathsOf(patch)) {
		const A = readAt(oldPc, p), B = readAt(newPc, p);
		if (!deepEq(A, B)) bads.push(`${p}: 旧=${JSON.stringify(A)} ≠ 新=${JSON.stringify(B)}`);
	}
	console.log(`      ${bads.length ? '✗' : '✓'} ${label}${bads.length ? ' ⇒ ' + bads.join(' ｜ ') : ''}`);
	if (bads.length) { bad++; diffLines.push(...bads); }
};

// 9 option：同起点、各走一路 ⇒ 比 patch 路径集
let n = 0;
for (let r = 0; r < G.rounds.length; r++) for (let o = 0; o < G.rounds[r].options.length; o++) {
	const option = G.rounds[r].options[o];
	const patch = J.rounds[r].options[o].patch;
	// 基值：把**前面各轮的同类 option** 先施加上（旧代码按**序列**设计：种族轮用 += 依赖职业轮已赋 abilities ✓）
	const pcA = Pc.defaults(), pcB = Pc.defaults();
	for (let rr = 0; rr < r; rr++) {
		const basePatch = J.rounds[rr].options[Math.min(o, G.rounds[rr].options.length - 1)].patch;
		G.rounds[rr].options[Math.min(o, G.rounds[rr].options.length - 1)].apply(pcA);   // 旧路基值
		Sg.Chargen.apply(pcB, basePatch);                                               // 新路基值
	}
	option.apply(pcA);                                  // 旧路（故事侧原 JS ✓）
	Sg.Chargen.apply(pcB, patch);                       // 新路（json ✓）
	cmp(`option#${++n} ${G.rounds[r].title}·${option.name}`, pcA, pcB, patch);
}

// 3 preset：按 picks 顺序施加三处 ⇒ 聚合比（同口径 ✓）
for (let i = 0; i < G.presets.length; i++) {
	const pr = G.presets[i], jp = J.presets[i];
	const pcA = Pc.defaults(), pcB = Pc.defaults();
	// ⚠️ **逐轮顺序施加**（不预合并 ✗）：同键的 `append` 若被 Object.assign 合并会被后轮**覆盖** ⇒ 顺序语义丢失 ✗
	//   （实测踩过：pre-merge 后 skills 少了「恐吓」✗）；比较面取三轮载荷的**键并集** ✓
	const agg = {};
	for (let r = 0; r < pr.picks.length; r++) {
		const patchR = J.rounds[r].options[pr.picks[r]].patch;
		G.rounds[r].options[pr.picks[r]].apply(pcA);   // 旧路（顺序 ✓）
		Sg.Chargen.apply(pcB, patchR);                 // 新路（同顺序 ✓）
		Object.assign(agg, patchR);
	}
	cmp(`preset#${i + 1} ${pr.name}（picks ${JSON.stringify(pr.picks)}）`, pcA, pcB, agg);
}

// 成对（乙）：注入 —— 某个 add 值改 1 ⇒ **必不等 ＋ 点名路径** ✗
{
	const r0 = 1, o0 = 0;                                   // 「背景·佣兵」的 gold.add
	const patch = JSON.parse(JSON.stringify(J.rounds[r0].options[o0].patch));
	patch.gold.add += 1;
	const pcA = Pc.defaults(), pcB = Pc.defaults();
	G.rounds[r0].options[o0].apply(pcA);
	Sg.Chargen.apply(pcB, patch);
	const A = readAt(pcA, 'gold'), B = readAt(pcB, 'gold');
	const caught = A !== B;
	console.log(`      ${caught ? '✓' : '✗'} 注入 add+1 ⇒ 必不等且点名路径：gold 旧=${A} 新=${B}${caught ? '' : '（未抓住 ✗）'}`);
	if (!caught) bad++;
}

console.log('      比较面＝patch 路径集；**不含** round／picked／去重序／max_hp／hp —— 引擎流程面，B3 归位 ✓');
console.log('      理由：B2 两路 finalize 同一份旧 JS ⇒ 比它恒同零信息 ✗；真分叉点在 B3 引用切换后 ✓');
console.log(bad ? `✗ 等价读数未通过 ${bad} 项` : '✔ 等价读数通过：9/9 option ＋ 3/3 preset 补丁面全同 ✓（注入格已证能抓 ✗）');
process.exit(bad ? 1 : 0);
