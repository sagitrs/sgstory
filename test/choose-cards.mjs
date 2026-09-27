// `#1222`-L3（UI 票）自证：`Sg.draw.cards`（纯函数）＋ `Sg.choose`（交互面 —— "点选 ⇒ 效果"）
//
// ★判据（照 L3 票面）：
//   ① ★**原语纯函数可测**（node 侧直接量 —— ✗ 不开浏览器；且**空 ⇒ 不产字节**，照 `bar`／`list` 红线②）
//   ② ★**"给定选项 ⇒ 卡片列表"**（每项一卡；`data-sg-choice`＝`id`；`label`／`hint` 在场；`disabled` 卡✗ 可点）
//   ③ ★**点选触发效果**（`onPick(id)` 恰一次）＋ ★**能假：撤 `onPick` ⇒ 红**（throw，✗ 静默挂"点了没反应"的卡）
//   ④ ★交互面的**边界**：卸载 ⇒ ✗ 再调｜`once` ⇒ 同卡只一次｜`render` 先卸后挂（✗ 叠监听）｜宿主拿不到 ⇒ 抛
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { maskComments } from '../editor/lib/core/mask.mjs';

let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

const FILE = 'src/engine/50-present/13-draw.twee';
const code = maskComments(readFileSync(FILE, 'utf8'), { file: FILE, twee: true });
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>');
globalThis.document = dom.window.document;
const host = dom.window.document.getElementById('host');
// ★把 twee 当 JS 跑（先剥注释 —— 与结构判据同一个遮蔽器 ✓）
const w = { Sg: {} };
new Function('window', code.replace(/^::.*$/m, ''))(w);
const D = w.Sg.draw, C = w.Sg.choose;
const click = (sel) => { const el = host.querySelector(sel); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); };

// ── ① 纯函数面 ────────────────────────────────────────────────
t('① 原语**纯函数**：`cards()` 不给选项 ⇒ **空串**（✗ 引擎不自造"没有可选项" ✓ · 红线②）',
	D.cards({ options: [] }) === '' && D.cards({}) === '');
t('① 原语**无状态**：同参数两次调用 ⇒ **逐字相同**（✗ 内部攒状态 ✓）',
	D.cards({ prompt: 'P', options: [{ id: 'a', label: '甲' }] }) === D.cards({ prompt: 'P', options: [{ id: 'a', label: '甲' }] }));

// ── ② "给定选项 ⇒ 卡片列表" ────────────────────────────────────
{
	const html = D.cards({ prompt: '要哪件？', options: [
		{ id: 'a', label: '短刀', hint: '轻' }, { id: 'b', label: '长枪', disabled: true }] });
	const tmp = dom.window.document.createElement('div'); tmp.innerHTML = html;
	t('② 每项一卡（2 选项 ⇒ 2 卡 · `data-sg-choice`＝`id` ✓）',
		tmp.querySelectorAll('.sg-card').length === 2
		&& tmp.querySelector('[data-sg-choice="a"]') !== null && tmp.querySelector('[data-sg-choice="b"]') !== null);
	t('② `prompt`／`label`／`hint` **都在场**（故事给的字原样画 ✓）',
		/sg-cards-prompt/.test(html) && html.includes('要哪件？') && html.includes('短刀') && html.includes('轻'));
	t('② `disabled` 的选项**照画**（玩家看得见"有这么一条"）**但✗ 可点**',
		tmp.querySelector('[data-sg-choice="b"]')?.hasAttribute('disabled') === true
		&& /sg-card-disabled/.test(html));
}

// ── ③ 点选触发效果 ＋ 能假 ─────────────────────────────────────
{
	const got = []; const off = C.mount(host, { prompt: '选', options: [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }], onPick: (id) => got.push(id) });
	click('[data-sg-choice="a"]');
	t('③ **点选 ⇒ 效果**：`onPick(id)` 收到的是该卡的 `id` ✓', got.length === 1 && got[0] === 'a', JSON.stringify(got));
	click('[data-sg-choice="b"]');
	t('③ 另一张卡 ⇒ 另一个 `id`（✗ 写死第一张 ✓）', got.length === 2 && got[1] === 'b', JSON.stringify(got));
	off();
	click('[data-sg-choice="a"]');
	t('④ 卸载后点 ⇒ ✗ 再调（✗ 监听泄漏 ✓）', got.length === 2, JSON.stringify(got));
}
{
	let threw = null;
	try { C.mount(host, { options: [{ id: 'a', label: '甲' }] }); } catch (e) { threw = e; }
	t('③ ★**能假：撤 `onPick` ⇒ 抛**（✗ 静默挂"点了没反应"的卡片 —— 同族：`#1543`／`#1551` ✓）',
		threw !== null && /onPick/.test(String(threw?.message)), String(threw?.message ?? '（✗ 竟未抛）'));
	let threw2 = null;
	try { C.mount('#不存在', { onPick: () => {} }); } catch (e) { threw2 = e; }
	t('④ 宿主拿不到 ⇒ **抛**（✗ 静默什么都不画 ✓）', threw2 !== null);
}
{
	// disabled 卡（真渲染路径）
	const got = []; const off = C.mount(host, { options: [{ id: 'a', label: '甲', disabled: true }, { id: 'b', label: '乙' }], onPick: (id) => got.push(id) });
	click('[data-sg-choice="a"]');
	t('③ `disabled` 卡点选 ⇒ ✗ 调（0 次 ✓）', got.length === 0, JSON.stringify(got));
	click('[data-sg-choice="b"]');
	t('③ 同一次挂载里可点的卡仍可点（✗ 一格都不调 ✓）', got.length === 1 && got[0] === 'b');
	off();
}
// ── ④ `once` 与 `render` ───────────────────────────────────────
{
	const got = []; const off = C.mount(host, { options: [{ id: 'a', label: '甲' }], once: true, onPick: (id) => got.push(id) });
	click('[data-sg-choice="a"]'); click('[data-sg-choice="a"]');
	t('④ `once: true` ⇒ 同卡连点两次**只调一次**（★防连点 ⇒ 补丁叠加那类事故 ✓）', got.length === 1, JSON.stringify(got));
	off();
	const got2 = []; const off2 = C.mount(host, { options: [{ id: 'a', label: '甲' }], onPick: (id) => got2.push(id) });
	click('[data-sg-choice="a"]'); click('[data-sg-choice="a"]');
	t('④ 默认（✗ 不给 `once`）⇒ 每次点击都调（2 次 —— ★默认值是**显式**的，✗ 不偷改语义 ✓）', got2.length === 2, JSON.stringify(got2));
	off2();
}
{
	// ★render 前先给一个旧挂载 ⇒ 若叠监听，一次点击会触发两遍
	const got = []; const off1 = C.mount(host, { options: [{ id: 'a', label: '甲' }], onPick: () => got.push('old') });
	const off2 = C.render(host, { options: [{ id: 'a', label: '甲' }], onPick: () => got.push('new') });
	click('[data-sg-choice="a"]');
	t('④ `render` ⇒ **先卸后挂**：一次点击**只触发一次**（✗ 叠监听 ⇒ 触发两遍 ✓）',
		got.length === 1 && got[0] === 'new', JSON.stringify(got));
	t('④ 同宿主**重复 `mount`** 也✗ 叠（每宿主最多一个在用挂载 ✓）', (() => {
		const g2 = []; const a = C.mount(host, { options: [{ id: 'a', label: '甲' }], onPick: () => g2.push('A') });
		const b = C.mount(host, { options: [{ id: 'a', label: '甲' }], onPick: () => g2.push('B') });
		click('[data-sg-choice="a"]');
		const ok = g2.length === 1 && g2[0] === 'B';
		b(); a();   // ★后卸"先挂的那个"⇒ ✗ 把后来者的登记删掉（否则后来者成孤儿不可卸）
		const g3 = []; C.mount(host, { options: [{ id: 'a', label: '甲' }], onPick: () => g3.push('C') });
		click('[data-sg-choice="a"]');
		const ok2 = g3.length === 1;
		C.unmount(host); click('[data-sg-choice="a"]');
		return ok && ok2 && g3.length === 1;   // ★`unmount` 之后点 ⇒ ✗ 再调
	})());
	off2(); void off1;
}

// ── ⑤ 形（与结构同笔的那一半）────────────────────────────────
{
	const css = readFileSync('src/engine/50-present/90-style.twee', 'utf8');
	t('⑤ `.sg-cards*`／`.sg-card*` **有样式**（✗ 缺 ⇒ 卡片退化成挤在一起的文字 ⇒ 同族"看得见"面 ✓）',
		/\.sg-cards\s*\{/.test(css) && /\.sg-card\s*\{/.test(css) && /\.sg-card-label\s*\{/.test(css) && /\.sg-card-disabled\s*\{/.test(css));
	t('⑤ 主色走 `var(--sg-card-accent)`（★故事可用 `style.accent` 覆盖 ⇒ ✗ 引擎替故事定配色 ✓）',
		/var\(--sg-card-accent/.test(css));
}

if (bad) { console.error(`\n✗ 选择卡自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 选择卡自证通过（纯函数：空则不产字节／无状态；列表：每项一卡；交互：点选恰一次、disabled✗调、卸载✗调、once 可配、render 不叠；能假：撤 onPick ⇒ 抛）');
