// `#1132` B2：**状态无损等价读数**（旧 `apply(pc)` ↔ 新声明式施加器，吃同一份 json ✓）。
//   比较面＝**补丁覆盖的字段集**（施加器的契约面 ✓）——排除面见下（显式打印 ✓ 理由随读数走 ✓）。
import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

const J = JSON.parse(readFileSync(new URL('../stories/face-fixture/data/chargen.json', import.meta.url), 'utf8'));
const { w } = await boot({ random: 0.5 });
// boot 后命名空间：`State`/`Macro` 在 `w.SugarCube.*` ✓；而 `Game`/`Sg` 挂在 **window 根**（实测 ✓ 不猜 ✓）
let Pc = w.Game.Pc, Sg = w.Sg, G = w.Game.Chargen;   // `let`：预设段前**重新 boot**（(甲) 段隔离 ✓）
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
	const pcA = structuredClone(Pc.defaults()), pcB = structuredClone(Pc.defaults());
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
// ⚠️ (甲) **段隔离**：选项段跑过会影响本段的起点（实测：合跑时 r=0 就多出后续轮载荷 ✗）⇒ 本段**重新 boot** ✓
//   语义上没有损失：两段验的是**不同粒度**（单选项 vs 序列 ✓）
{
	const { w: wP } = await boot({ random: 0.5 });
	console.log(`        [boot 核] 旧 w 的 G 与 新 w 的 G 同一个? ${G === wP.Game.Chargen}（须 false ✓ 生效）`);
	Pc = wP.Game.Pc; Sg = wP.Sg; G = wP.Game.Chargen;
}
for (let i = 0; i < G.presets.length; i++) {
	const pr = G.presets[i], jp = J.presets[i];
	const pcA = structuredClone(Pc.defaults()), pcB = structuredClone(Pc.defaults());
	// ⚠️ **逐轮顺序施加**（不预合并 ✗）：同键的 `append` 若被 Object.assign 合并会被后轮**覆盖** ⇒ 顺序语义丢失 ✗
	//   （实测踩过：pre-merge 后 skills 少了「恐吓」✗）；比较面取三轮载荷的**键并集** ✓
	const agg = {};
	for (let r = 0; r < pr.picks.length; r++) {
		const patchR = J.rounds[r].options[pr.picks[r]].patch;
		G.rounds[r].options[pr.picks[r]].apply(pcA);   // 旧路（顺序 ✓）
		if (i === 0 && r === 0) console.log(`        [③ patchR 实体] ${JSON.stringify(patchR)}`);
		if (process.env.LOG_KEYS) console.log(`        [② 收到键] i=${i} r=${r} pick=${pr.picks[r]} ⇒ ${JSON.stringify(Object.keys(patchR))}`);
		Sg.Chargen.apply(pcB, patchR);                 // 新路（同顺序 ✓）
		Object.assign(agg, patchR);
		// 逐轮诊断（连循环变量一起打 ✓ 一眼见 off-by-one / 起点边界 ✗）
		console.log(`        · r=${r} pick=${pr.picks[r]} ｜ 旧 abilities=${JSON.stringify(Sg.notes.readPath(pcA, 'abilities'))} ｜ 新 abilities=${JSON.stringify(Sg.notes.readPath(pcB, 'abilities'))}`);
	}
	cmp(`preset#${i + 1} ${pr.name}（picks ${JSON.stringify(pr.picks)}）`, pcA, pcB, agg);
}

// 成对（乙）：注入 —— 某个 add 值改 1 ⇒ **必不等 ＋ 点名路径** ✗
{
	const r0 = 1, o0 = 0;                                   // 「背景·佣兵」的 gold.add
	const patch = JSON.parse(JSON.stringify(J.rounds[r0].options[o0].patch));
	patch.gold.add += 1;
	const pcA = structuredClone(Pc.defaults()), pcB = structuredClone(Pc.defaults());
	G.rounds[r0].options[o0].apply(pcA);
	Sg.Chargen.apply(pcB, patch);
	const A = readAt(pcA, 'gold'), B = readAt(pcB, 'gold');
	const caught = A !== B;
	console.log(`      ${caught ? '✓' : '✗'} 注入 add+1 ⇒ 必不等且点名路径：gold 旧=${A} 新=${B}${caught ? '' : '（未抓住 ✗）'}`);
	if (!caught) bad++;
}

// 回归格 A（协调席定 ✓）：**同一预设连用两次 ⇒ 两次结果全同** ✗（修前：第二次会被第一次污染 ⇒ 数值翻倍 ✗）
{
	const pr = G.presets[0], patches = pr.picks.map((pk, r) => J.rounds[r].options[pk].patch);
	const run = () => { const pc = structuredClone(Pc.defaults()); for (const q of patches) Sg.Chargen.apply(pc, q); return JSON.stringify(Sg.notes.readPath(pc, 'abilities')) + '|' + JSON.stringify(Sg.notes.readPath(pc, 'skills')); };
	const a = run(), b = run();
	console.log(`      ${a === b ? '✓' : '✗'} 回归A 同预设连用两次 ⇒ 全同：1st=${a} 2nd=${b}`);
	if (a !== b) bad++;
}
// 回归格 B（协调席定 ✓）：**施加后 json 对象未被改写** ✗（契约＝绝不改写调用方数据 ✓）
{
	const snap = JSON.stringify(J);
	const pc = structuredClone(Pc.defaults());
	for (const pr2 of G.presets) for (let r = 0; r < pr2.picks.length; r++) Sg.Chargen.apply(pc, J.rounds[r].options[pr2.picks[r]].patch);
	const after = JSON.stringify(J);
	console.log(`      ${snap === after ? '✓' : '✗'} 回归B 施加后 json 未被改写（深比 ✓）`);
	if (snap !== after) bad++;
}

console.log('      比较面＝patch 路径集；**不含** round／picked／去重序／max_hp／hp —— 引擎流程面，B3 归位 ✓');
console.log('      理由：B2 两路 finalize 同一份旧 JS ⇒ 比它恒同零信息 ✗；真分叉点在 B3 引用切换后 ✓');
console.log(bad ? `✗ 等价读数未通过 ${bad} 项` : '✔ 等价读数通过：9/9 option ＋ 3/3 preset 补丁面全同 ✓（注入格已证能抓 ✗）');
process.exit(bad ? 1 : 0);
