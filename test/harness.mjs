// 测试公共 harness（#317①）：把「boot → 车卡 → 在当前段落里找链接 → 点击 → 等稳定」这一套
// 从 5 个测试脚本里收拢到一处。此前 `newGame`/`click`/`findLink`/`passageOf`/`pc` 各抄一份，
// 于是「点击时序」这类修法要改 5 个地方（#27「固定 sleep 在 2 核 runner 上不成立」就是此类教训）。
//
// 设计要点（为了迁移时**行为不变**）：
//   · `scope: 'current'`（默认）只在 `data-passage === State.passage` 的那个 `.passage` 里找链接——
//     并行跑多条路线时，State 已变而旧段落元素还没换下来，全局查找会点到上一段的链接；
//   · `scope: 'any'` 保留旧行为（全程 `#passages` 内查找），供既有脚本无痛迁移；
//   · `wait` 可调：不同脚本原本用 140 / 220 / 350ms 的固定等待，迁移时保持原值，避免顺手改行为。
//
// 未迁移（有意）：
//   · `scenarios.mjs`——#317② 本轮已迁（文案批 #308–#313 合入后）；
//   · `walker.mjs` 的对抗式游走（元素级点击 + `checkErrors()` + 种子流 + 选项卡也在候选里）语义特殊，
//     点击壳保留它自己的检查逻辑——强行统一会改动「游走器看得到哪些链接」，那是覆盖率的自变量。

import { renderedElsOf } from '../editor/lib/core/preview.mjs';   // `#761` 六片A：选择器只有一处 ✓
import { boot, CLICKABLE, CLICKABLE_SEL } from './boot.mjs';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';   // `#1004` B2b：`story` 的默认值走本仓**单一权威** ✓（不写死 slug ✗）

export { CLICKABLE, LINKS, LINKS_SEL, CLICKABLE_SEL, trailingAfterLast } from './boot.mjs';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 段落名含中文与「·」，属性选择器里需要转义引号/反斜杠
const CSS_ESC = (v) => String(v).replace(/["\\]/g, '\\$&');

// 一个会话：绑定某个 jsdom 窗口与它的 settle/sleep
export function makeSession(w, { settle = async () => {}, sleep = defaultSleep, scope = 'current', wait = 140, tries = 20, waitRaf = false } = {}) {
	// #484：**等产品自己的时钟**。产品在 `requestAnimationFrame` 回调里做 `hidden=false` ＋ `focus()`（`src/80-script.twee`），
	// 而测试原先只等**定时器**（`sleep`）—— 高负载下 rAF 晚于定时器 ⇒ 断言读到 `hidden` ⇒ 那 5 条同型假红。
	// 逐 tick 实测：**等 1 个 tick 就够**（产品的回调注册在 `:passageend` 内，早于测试的注册 ⇒ FIFO 它先跑），2 个 tick 同样 ✓。
	// 默认 **关**（不动既有脚本行为 ✗）；按需开启。
	const rafTick = () => new Promise((r) => {
		if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(() => r());
		else setTimeout(r, 16);
	});
	const links = () => {
		if (scope === 'any') return [...w.document.querySelectorAll(CLICKABLE)];
		const cur = [...renderedElsOf(w)].find((e) => e.dataset.passage === w.SugarCube.State.passage);
		return cur ? [...cur.querySelectorAll(CLICKABLE_SEL)] : [...w.document.querySelectorAll(CLICKABLE)];
	};
	// 精确优先，子串兜底（避免「塔」被「守塔的人家」抢先命中；兜底供动态文案用）
	const byLabel = (label) => {
		const ls = links();
		return ls.find((x) => x.textContent === label) ?? ls.find((x) => x.textContent.includes(label));
	};
	const passage = () => w.SugarCube.State.passage;
	const text = () => (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ');
	const pc = () => w.SugarCube.State.variables.pc;
	const clickEl = async (el, { wait: w2 = wait } = {}) => {
		await settle();
		el.click();
		await settle();
		if (waitRaf) await rafTick();   // #484：先等产品的一个 rAF tick，再等定时器
		await sleep(w2);
	};
	const clickByLabel = async (label, { wait: w2 = wait, tries: n = tries } = {}) => {
		await settle();
		let a = byLabel(label);
		for (let i = 0; i < n && !a; i++) { await sleep(100); await settle(); a = byLabel(label); }
		if (!a) {
			const avail = links().map((x) => x.textContent.replace(/\s+/g, '')).join(' / ');
			throw new Error(`找不到链接「${label}」@ ${passage()}（可选：${avail}）`);
		}
		await clickEl(a, { wait: w2 });
		return a;
	};
	// 可选点击：找不到链接时返回 null（供「入口可能存在也可能不存在」的检查用）
	const tryClickByLabel = async (label, opts) => {
		if (!byLabel(label)) return null;
		return clickByLabel(label, opts);
	};

	// ── #317②：按**稳定 key** 定位（不再依赖中文文案）──────────────────────────
	// key 由 `src/80-script.twee` 末尾的派生 pass 写进 `data-choice` ＝ 目标段落名；
	// 作者可用 `data-key` 容器覆盖。**定位用 key，断言仍用文案**（两者分开，改文案不再连动测试）。
	const byKey = (key, { scope: sc = scope } = {}) => {
		const pool = sc === 'any' ? [...w.document.querySelectorAll(`[data-choice="${CSS_ESC(key)}"]`)]
			: [...(currentBox()?.querySelectorAll(`[data-choice="${CSS_ESC(key)}"]`) ?? [])];
		return pool[0] ?? null;
	};
	// 三元组：派生值 / 作者覆盖 / 兜底文案——便于统计「还有多少点击在靠文案定位」
	const keyOf = (el) => ({
		choice: el?.dataset?.choice ?? null,
		authored: el?.closest('[data-key]')?.dataset?.key ?? null,
		label: (el?.textContent ?? '').trim().replace(/\s+/g, ' '),
	});
	const clickByKey = async (key, { wait: w2 = wait, tries: n = tries, scope: sc } = {}) => {
		await settle();
		let a = byKey(key, { scope: sc });
		for (let i = 0; i < n && !a; i++) { await sleep(100); await settle(); a = byKey(key, { scope: sc }); }
		if (!a) {
			const avail = links().map((x) => keyOf(x).choice ?? x.textContent.replace(/\s+/g, '')).join(' / ');
			throw new Error(`找不到 key「${key}」@ ${passage()}（可选：${avail}）`);
		}
		await clickEl(a, { wait: w2 });
		return a;
	};
	return { w, links, byLabel, byKey, keyOf, clickEl, clickByLabel, clickByKey, tryClickByLabel, passage, text, pc, settle, sleep, rafTick };
}

// 开一局。
//
// ⚠️ `#1004` B2b 基建 ✓：原写法把**一整个故事的开场链**写死在这里 ✗
//   （「踏上旅途 → 快速成型（或第 N 张卡） → 出发，前往歪脖子鸭酒馆」✓ —— 那三条全是 `mist-forest` 的段落 ✓）；
//   故事一删 ✓，**8 件用 `newGame` 的件全卡在第一步** ✗（报 `找不到链接「踏上旅途」`✓）。
// ⇒ 改成**问接入契约** ✗（不猜、也不假定每故事都有车卡 ✓）：
//   · `story` 可传 ✓（默认 `DEFAULT_SLUG` ✓ —— 与本仓其它消费者同一口径 ✓）；
//   · **有没有车卡**问题由 `Sg.story.hasChargen()` 回答 ✓ —— 这正是**引擎自己**判那一支的方式 ✓
//     （`src/10-core.twee:707`："车卡是本故事的页面（引擎不知道故事名）"✓）；
//   · 没车卡的故事 ⇒ **跳过车卡链** ✓（`boot()` 已停在 `00-story.json::entry` ✓ ＝ 与"车卡后"等价的起始态 ✓）；
//   · 有车卡的故事 ⇒ 走 `chargen` 两步 ✓，两步的文案**可传参** ✓（默认仍是旧链那两句 ✓ ——
//     夹具故事按裁定 (甲) **沿用旧段名**✓ ⇒ 传参甚至用不上 ✓，但留出口子 ✓）。
// ⚠️ 控制 ✓：`startLabel` 改成**存在才点** ✗（旧写法是"必须点到"✗）—— 它原本是"车卡终于走完、进正戏"那一步 ✓；
//   无车卡的故事里没有那一步 ✓，硬点会把"没有车卡"变成一条假红 ✗。⇒ 用 `tryClickByLabel` ✓，
//   并把"点了没"如实返回 ✓（要严格断言是否进入正戏的件，自己看读数 ✓）。
export async function newGame({ story = DEFAULT_SLUG, random = 0.5, preset = 0, session = {},
	chargen = ['踏上旅途', '快速成型'], startLabel = '出发，前往歪脖子鸭酒馆' } = {}) {
	const { w, uncaught, settle, sleep } = await boot({ story, random: typeof random === 'function' ? random : () => random });
	const s = makeSession(w, { settle, sleep, ...session });
	const hasChargen = !!w.Sg?.story?.hasChargen?.();
	let charged = false;
	if (hasChargen) {
		await s.clickByLabel(chargen[0]);
		if (preset) {
			// 选第 N 套预设（点第 N 张卡里的「快速成型」；不带 preset 则默认第一张）
			const cards = [...w.document.querySelectorAll('.choice-card')];
			if (!cards[preset]) throw new Error(`没有第 ${preset + 1} 张预设卡（共 ${cards.length} 张）`);
			const a = [...cards[preset].querySelectorAll('a')][0];
			await s.clickEl(a, { wait: 300 });
		} else {
			await s.clickByLabel(chargen[1]);
		}
		charged = true;
	}
	// 进正戏那一步：**有才点** ✗（无车卡的故事 `boot()` 已经停在 entry ✓）
	const started = charged && startLabel ? Boolean(await s.tryClickByLabel(startLabel)) : false;
	return { ...s, uncaught, charged, started, hasChargen, story };
}
