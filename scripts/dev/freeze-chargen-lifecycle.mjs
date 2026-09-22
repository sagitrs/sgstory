#!/usr/bin/env node
// `#1132` B3 **第一步：冻结基线**（动手**之前**用还在的 old JS 跑 ⇒ 之后才能安全删旧 ✓）
//
// 为什么必须"动手前跑"（协调席确认 ✓）：B3 要**删旧 JS** ✗ ⇒ 删完**旧路就没了** ✗
//   ⇒ 生命周期等价格（含 `finalize` 派生 `max_hp`/`hp` ✓）就**没得比** ⇒ 必须先把旧路的结果**冻成文件** ✓
//   ⇒ 从旧提交取**不可取** ✗（rebase 会改写 ⇒ 基线不稳 ✓）
//
// 冻结内容：3 套 preset（`picks` 序列）各跑一遍完整生命周期 ⇒ **整份 pc** 快照（不含引擎流程外的临时量 ✓）
import { boot } from '../../test/boot.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const OUT = new URL('../../stories/face-fixture/gates/chargen-lifecycle-baseline.json', import.meta.url).pathname;
const { w } = await boot({ random: 0.5 });
const Pc = w.Game.Pc, G = w.Game.Chargen;

const snap = (pc) => JSON.parse(JSON.stringify(pc));   // 深拷贝（只留数据 ✓ 函数/临时量不进 ✓）
const freeze = {};
for (const pr of G.presets) {
	// ⚠️ 冻结主体＝**引擎当前 pc**（`pick()` 内部读 `State.variables.pc` ✓ 实测：不设则 null 崩 ✗）
	const St = w.SugarCube.State;
	St.variables.pc = Pc.defaults();
	// ⚠️ 必须走**真生命周期**（`pick()` ✓）：直接调 `option.apply` 会**绕过去重** ✗（实测 skills 带重复 ✗ ⇒ 与新路假不等 ✓）
	for (let r = 0; r < pr.picks.length; r++) G.pick(r, pr.picks[r]);   // 旧路：真流程（含去重／picked／round ✓）
	const pc = St.variables.pc;
	if (typeof G.finalize === 'function' && !pc.finalized) { G.finalize(pc); pc.finalized = true; }
	freeze[pr.name] = { picks: [...pr.picks], pc: snap(pc) };
}
writeFileSync(OUT, JSON.stringify(freeze, null, '\t') + '\n');

// 写完**读回**校验（`#1112` 族：副作用以"看到产物"收尾 ✓）
const back = JSON.parse(readFileSync(OUT, 'utf8'));
console.log(`✔ 冻结完成：${Object.keys(back).length} 套 preset ✓ ⇒ ${OUT.split('/').slice(-3).join('/')}`);
for (const [k, v] of Object.entries(back)) console.log(`   · ${k}：picks ${JSON.stringify(v.picks)} ｜ max_hp=${v.pc.max_hp ?? '-'} hp=${v.pc.hp ?? '-'} skills=${JSON.stringify(v.pc.skills ?? [])}`);
