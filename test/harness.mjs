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
//   · `scenarios.mjs`——其路线体正被文案批（#308–#313）改动，等那批合入后再迁移，免同段冲突；
//   · `walker.mjs` 的对抗式游走（元素级点击 + `checkErrors()` + 种子流 + 选项卡也在候选里）语义特殊，
//     点击壳保留它自己的检查逻辑——强行统一会改动「游走器看得到哪些链接」，那是覆盖率的自变量。

import { boot, CLICKABLE, CLICKABLE_SEL } from './boot.mjs';

export { CLICKABLE, LINKS, LINKS_SEL, CLICKABLE_SEL, trailingAfterLast } from './boot.mjs';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 一个会话：绑定某个 jsdom 窗口与它的 settle/sleep
export function makeSession(w, { settle = async () => {}, sleep = defaultSleep, scope = 'current', wait = 140, tries = 20 } = {}) {
	const links = () => {
		if (scope === 'any') return [...w.document.querySelectorAll(CLICKABLE)];
		const cur = [...w.document.querySelectorAll('#passages .passage')].find((e) => e.dataset.passage === w.SugarCube.State.passage);
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
	return { w, links, byLabel, clickEl, clickByLabel, tryClickByLabel, passage, text, pc, settle, sleep };
}

// 开一局并把车卡走完（车卡 → 角色卡 → 出发）
// 各测试原本都以「踏上旅途 → 快速成型（或第 N 张卡）→ 出发，前往歪脖子鸭酒馆」开头。
export async function newGame({ random = 0.5, preset = 0, startLabel = '出发，前往歪脖子鸭酒馆', session = {} } = {}) {
	const { w, uncaught, settle, sleep } = await boot({ random: typeof random === 'function' ? random : () => random });
	const s = makeSession(w, { settle, sleep, ...session });
	await s.clickByLabel('踏上旅途');
	if (preset) {
		// 选第 N 套预设（点第 N 张卡里的「快速成型」；不带 preset 则默认第一张）
		const cards = [...w.document.querySelectorAll('.choice-card')];
		if (!cards[preset]) throw new Error(`没有第 ${preset + 1} 张预设卡（共 ${cards.length} 张）`);
		const a = [...cards[preset].querySelectorAll('a')][0];
		await s.clickEl(a, { wait: 300 });
	} else {
		await s.clickByLabel('快速成型');
	}
	if (startLabel) await s.clickByLabel(startLabel);
	return { ...s, uncaught };
}
