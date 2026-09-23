// `#1223` 步一：`Sg.notes` **缺席容忍**的判据面（正反各配）。
//
// 为什么必须有格（复核意见原文口径）：**静默是默认态**，，没有格时，"设计上的静默"与
// "故障造成的静默"在读数上**长相完全一样**；回归只会表现成"更安静"，而"更安静"不会红。
// 所以本件把两侧都钉住：**缺席 则 静默**（不抛、不写状态、不渲染）／**作者错 则 仍出声**。
//
// 六格（每格附"能假"依据：把哪一步弄反/弄坏会让它红）：
//   ① 未注册 则 `table()` 返回空表且**不抛**          ，能假：改回 `throw` 则 红
//   ② 空表上 `add` 则 **no-op**（不抛、不写 `pc.ev.notes`），能假：删掉空表早退 则 抛 则 红
//   ③ 空表上 `addPath` 则 **no-op**                   ，能假：同上
//   ④ 注册了但**畸形**（null／数组／非对象）则 **抛**    ，能假：把畸形也并进"缺席 则 静默" 则 红
//   ⑤ 表非空但**未登记 id** 则 **抛**                  ，能假：把"缺 id"也并进静默 则 红
//   ⑥ 表非空但**路径不属于该 id** 则 **抛**            ，能假：拆掉多源护栏 则 红
//
// 用法：node test/notes-absence.mjs
import { boot } from './boot.mjs';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';

const SLUG = process.env.STORY || DEFAULT_SLUG;
let fail = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`  ✔ ${name}`); return; }
	fail++;
	console.log(`  ✖ ${name}${detail ? '  ← ' + detail : ''}`);
};
const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };

const { w, close } = await boot({ story: SLUG, start: true });
const Sg = w.Sg;
if (!Sg?.notes || typeof Sg.notes.add !== 'function') {
	console.log(`  ✖ 前置：${SLUG} 未暴露 Sg.notes（本件需要笔记面在册的故事）`);
	process.exit(1);
}

// 原 provider 与 pc（用例后还原，避免相互污染）
const savedProvider = Sg.story?.notes;
const SC = w.SugarCube ?? w;
const pc = (SC.State?.variables ?? w.State?.variables ?? {}).pc;
const savedEvNotes = pc && pc.ev ? pc.ev.notes : undefined;

// ── ① 未注册 则 空表且不抛 ────────────────────────────────────────────────
if (Sg.story) Sg.story.notes = undefined;
{
	const e = threw(() => Sg.notes.table());
	const t = e ? null : Sg.notes.table();
	ok('① 未注册 ⇒ table() 不抛', !e, e && String(e.message).slice(0, 60));
	ok('① 未注册 ⇒ table() 返回空表', t && typeof t === 'object' && !Array.isArray(t) && Object.keys(t).length === 0);
}

// ── ②③ 空表上 add／addPath 则 no-op（不抛、不写状态）────────────────────────
{
	if (pc) { pc.ev = pc.ev ?? {}; pc.ev.notes = {}; }
	const e2 = threw(() => Sg.notes.add('n_不存在'));
	ok('② 空表 add ⇒ 不抛', !e2, e2 && String(e2.message).slice(0, 60));
	ok('② 空表 add ⇒ 不写状态', !(pc?.ev?.notes && Object.keys(pc.ev.notes).length), JSON.stringify(pc?.ev?.notes));
	const e3 = threw(() => Sg.notes.addPath('n_不存在', 'ev.whatever'));
	ok('③ 空表 addPath ⇒ 不抛', !e3, e3 && String(e3.message).slice(0, 60));
	ok('③ 空表 addPath ⇒ 不写状态', !(pc?.ev?.notes && Object.keys(pc.ev.notes).length));
}

// ── ④ 注册了但畸形 则 仍抛（三种形态各一）──────────────────────────────────
for (const [label, bad] of [['null', () => null], ['数组', () => []], ['非对象', () => 'x']]) {
	if (Sg.story) Sg.story.notes = bad;
	const e = threw(() => Sg.notes.table());
	ok(`④ 畸形（${label}）⇒ 抛`, !!e, '未抛（被静默吞掉）');
}

// ── ⑤⑥ 表非空但作者错 则 仍抛（缺 id ／ 路径不属于该 id）────────────────────
{
	// 用**最小自造表**（不依赖具体故事内容 则 换故事也不换标准）
	if (Sg.story) Sg.story.notes = () => ({ n_在册: { flagPath: 'ev.demo' } });
	const e5 = threw(() => Sg.notes.add('n_未登记'));
	ok('⑤ 缺 id ⇒ 抛', !!e5, '未抛（把作者错当缺席吞了）');
	const e6 = threw(() => Sg.notes.addPath('n_在册', 'ev.别的路径'));
	ok('⑥ 路径不属于该 id ⇒ 抛', !!e6, '未抛（多源护栏被拆）');
	const e6b = threw(() => Sg.notes.addPath('n_在册', 'ev.demo'));
	ok('⑥ 反向：路径属于该 id ⇒ 不抛', !e6b, e6b && String(e6b.message).slice(0, 60));
}

// 还原
if (Sg.story) Sg.story.notes = savedProvider;
if (pc && pc.ev) pc.ev.notes = savedEvNotes;
if (typeof close === 'function') close();

console.log(fail ? `\n  笔记缺席判据：${fail} 格未过` : '\n  笔记缺席判据：全过（缺席⇒静默 ／ 作者错⇒出声 各就各位）');
process.exit(fail ? 1 : 0);
