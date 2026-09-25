#!/usr/bin/env node
// `#1012`：**导航型交互之后，焦点仍在正文内** —— `docs/criterion-design.md` §八 8.5「键盘可续」那条契约的**可机检**版
//
// 契约（**不绑元素**，照 §6 的口径）：交互之后 `document.activeElement.closest('#passages')` 必真
// —— 焦点落到 `body` 就是回归（键盘／读屏用户失去落点）。实测（`#1012` 修前）：**导航型**交互
//（`酒馆` 行动区的 `[[就地了结这一趟|结局 平凡之路]]`）`passage` 真变了 而 `activeElement` ＝ `body`。
//
// 两半都要能假（照 §6 的「实测咬合力」要求 —— 只关掉「丢焦回收」不该红，那是安全网）：
// ① **导航型交互**：行动区里的**段落链接**被激活 → `passage` 真变了 **且**焦点仍在正文内
//（注意：修前：`passage` 变了但焦点在 `body` → 这一格**真会红** —— 不是空判）；
// ② **反例·程序性导航不许抢焦点**：`Engine.play()`（页面载入／车卡引导／工具调用）**不得**移动焦点
// —— 否则 Tab 序列的起点会被挪到正文之后、越过「跳到正文」/「跳到行动」（`#284①` 守的正是它）。
//注意：本件**不**绑「焦点落在哪个元素」（`.fresh-heard`／`.acts`／段落根 都是实现路径，
// 共用层一改就假红 —— §6 明文）；
//注意：本件也**不**判「信息在屏」（那是 §6 的另一维，别把两件事写进一条断言）。
//
// 用法：`node test/focus-after-nav.mjs [--selftest]`｜前置：**先 `node build.mjs`**（读 `dist/` 产物，
// `boot()` 自带新鲜度守卫）。

import { boot } from './boot.mjs';

/** 纯函数：把**一次交互的读数**判成两半（合成用例可注入 → 这就是本件的 `--selftest` 面）。
 * `kind`：`'nav'`（导航型交互）／`'programmatic'`（程序性导航，反例那一半）。 */
export const judgeInteraction = ({ kind, passageBefore, passageAfter, focusInsideBefore, focusInsideAfter }) => {
	const problems = [];
	const navigated = passageBefore !== passageAfter;
	if (kind === 'nav') {
		if (!navigated) problems.push(`导航型样本**没导航**（passage 未变：${passageBefore}）—— 读数不成立（这条不是「修好了」，是「没测到」✗）`);
		if (!focusInsideAfter) problems.push('导航后**焦点跑出正文**（activeElement 不在 #passages 内）—— 回归（`#1012` ✓）');
		if (!focusInsideBefore) problems.push(`按键前焦点就不在正文（${focusInsideBefore}）—— 样本选错（这条要测的是「交互后回收」，不是「从头就没进去」✗）`);
	} else if (kind === 'programmatic') {
		if (focusInsideAfter) problems.push('**程序性导航抢了焦点** ✗ —— `Engine.play()` 不得移动焦点（会挪走 Tab 序列起点，越过跳转链接 ✓）');
	}
	return problems;
};

const SELFTEST = process.argv.includes('--selftest');
if (SELFTEST) {
	console.log('══ 导航后焦点 · 自证 ══');
	const base = { passageBefore: 'A', passageAfter: 'B', focusInsideBefore: true, focusInsideAfter: true };
	const cases = [
		['正例·导航型（passage 变了 ＋ 焦点仍在正文）', judgeInteraction({ kind: 'nav', ...base }), 0],
		['🔴 反例·导航型但**焦点丢到 body** ⇒ 报红', judgeInteraction({ kind: 'nav', ...base, focusInsideAfter: false }), 1],
		['🔴 反例·导航型但**根本没导航** ⇒ 报红（不算"修好了"）', judgeInteraction({ kind: 'nav', ...base, passageAfter: 'A' }), 1],
		['🔴 反例·样本选错（按键前焦点就不在正文）⇒ 报红', judgeInteraction({ kind: 'nav', ...base, focusInsideBefore: false }), 1],
		['正例·程序性导航**不**抢焦点', judgeInteraction({ kind: 'programmatic', ...base, focusInsideBefore: false, focusInsideAfter: false }), 0],
		['🔴 反例·程序性导航抢了焦点 ⇒ 报红', judgeInteraction({ kind: 'programmatic', ...base, focusInsideBefore: false, focusInsideAfter: true }), 1],
	];
	let bad = 0;
	for (const [label, problems, expect] of cases) {
		const ok = problems.length === expect;
		if (!ok) bad++;
		console.log(`  ${ok ? '✓' : '✗'} ${label}（检出 ${problems.length}，期望 ${expect}）`);
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（导航型两半 ＋ 程序性导航反例 ＋ 样本自检）');
	process.exit(0);
}

const { w, sleep } = await boot({ random: 0.5 });
const doc = w.document;
const state = () => {
	const a = doc.activeElement;
	return {
		passage: w.SugarCube.State.passage,
		focusInside: !!a?.closest?.('#passages'),
		focusTag: a?.tagName ?? '(none)',
		focusCls: String(a?.className ?? ''),
	};
};
const clickText = async (t) => {
	const a = [...doc.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.trim() === t);
	if (!a) throw new Error(`找不到引导链「${t}」 ✗（样本变了？）`);
	a.click();
	await sleep(250);
};

let bad = 0;
const fail = (msg) => { bad++; console.error(`✗ ${msg}`); };

// 车卡引导 → 进正戏（这一串本身就是**程序性导航**＋点击链）
	// `#1315` 乙批：**不再钉死旧故事的车卡引导链**（样本可换）—— 导航型那半按 `data-passage` 现取（见下）✓
	//   ✗ 原写法：`['踏上旅途','快速成型','出发，前往歪脖子鸭酒馆']` ⇒ 旧故事样本死了 ⇒ 判据跟着死 ✗
	//   ⇒ 口径：判据**只依赖「行动区里有会换段落的链接」**，✗ 不依赖某故事的具体文案 ✓
	//   ⇒ 兼顾程序性那半：**先进一次页面加载**（焦点落 body）⇒ 再试 `Engine.play` 不得抢焦点 ✓
	{ const t0 = state(); if (!t0.focusInside) console.log('  样本·初始：焦点不在正文（落 ' + t0.focusTag + '）✓（程序性那半需的前提）'); }

// ── ② 反例那一半先测：此刻焦点**不在**正文（页面载入后落 body）→ `Engine.play` 不许把它挪进去 ──
{
	const before = state();
	// `#1315` 乙批：**不写死旧段名** —— 用**当前段**做程序性导航的目标（✗ 不依赖某故事的段名 ✓）
	const _navTarget = (() => { const cur = w.SugarCube.State.passage;
		const a0 = [...doc.querySelectorAll('#passages a.link-internal')].find((x) => x.getAttribute('data-passage') && x.getAttribute('data-passage') !== cur);
		return a0?.getAttribute('data-passage') ?? cur; })();
	w.SugarCube.Engine.play(_navTarget);
	await sleep(300);
	const after = state();
	const problems = judgeInteraction({ kind: 'programmatic', passageBefore: before.passage, passageAfter: after.passage, focusInsideBefore: before.focusInside, focusInsideAfter: after.focusInside });
	console.log(`  读数·程序性导航：passage ${before.passage}→${after.passage} · 焦点在正文 ${before.focusInside}→${after.focusInside}（${after.focusTag}.${after.focusCls.slice(0, 24)}）`);
	for (const p of problems) fail(p);
}

// ── ① 导航型交互：行动区里**会换段落**的那条链接（按 `data-passage` 现取，不写死文案）──
{
	const cur = w.SugarCube.State.passage;
	const a = [...doc.querySelectorAll('#passages .acts a.link-internal')]
		.find((x) => (x.getAttribute('data-passage') ?? '') && x.getAttribute('data-passage') !== cur);
	if (!a) fail(`行动区里找不到「会换段落」的链接 ✗（样本变了？当前段 ${cur}）`);
	else {
		console.log(`  样本·导航型：行动区内「${a.textContent.trim().slice(0, 18)}」⇒ ${a.getAttribute('data-passage')}`);
		a.focus();
		const before = state();
		a.click();
		await sleep(400);
		const after = state();
		const problems = judgeInteraction({ kind: 'nav', passageBefore: before.passage, passageAfter: after.passage, focusInsideBefore: before.focusInside, focusInsideAfter: after.focusInside });
		console.log(`  读数·导航型：passage ${before.passage}→${after.passage} · 焦点在正文 ${before.focusInside}→${after.focusInside}（${after.focusTag}.${after.focusCls.slice(0, 24)}）`);
		for (const p of problems) fail(p);
	}
}

if (bad) { console.error(`\n✗ 导航后焦点门未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ 导航后焦点契约成立：**导航型交互后焦点仍在 `#passages` 内** ✓ ＋ **程序性导航不抢焦点** ✓（不绑具体元素 ✓）');
