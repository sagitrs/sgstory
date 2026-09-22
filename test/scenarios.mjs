// 分支场景测试（M1a-2 换骨后）：金路径 + 分支矩阵（每条结局一条路线）
// Math.random 劫持：0.99 → d20 恒 20（自然 20 必成）；0.01 → 恒 1（自然 1 必败）；0.5 → 恒 11
// 交互覆盖落盘 build/coverage-scenarios.json（coverage.mjs 门禁用）
//
// JSDOM 启动 / 就绪轮询 / uncaught 监听 / 退出清理全部走 test/boot.mjs——一处修，全脚本受益。
//
//注意：`#1004` B2b（**换样本** —— 发起者裁定 5740615725 第 2 条）：旧路线表 **20+ 条逐条以已删故事的结局命名**
//（`mist-forest` 的 15 个结局）→ 那些内容随故事一起被代码级删除 → 本件**按存活样本 `night-ferry` 重写路线表**
//（11 段落 · 6 步链 · 2 个「结局…」 —— 它就是**仍在仓里的那个有真剧情的样本**，且它的 `gates/witness-trace.json`
// 与 `--verify` 已冻结在仓）。
//注意：本件**不摆造剧情**、也不把判据改成面驱动（那是**掏空**）：路线表按新样本的**真实分叉**写，
// 判据仍是「走到结局 ・无宏错误红框 ・不同屏重复骰面 ・结局页收尾 ・按 key 可点」。
//注意：它**没有车卡**（`hasChargen()` → `false`）→ 起始走它自己的开场段（`渡口`），
// 与夹具的 `踏上旅途／快速成型／出发，前往歪脖子鸭酒馆` 三段链**无关**（那道链只在 `chargen:true` 时走）。
//注意：由此引起的两处阈值**重推**（不是调参）与一处棘轮**向下重签**（显式事件）写在 `scripts/report-rhythm.mjs`
// 与 `test/coverage-baseline.json` 的就地注释里 —— 两处都注明「这处是 `scenarios` 重写引起的」。
import { renderedElsOf } from '../editor/lib/core/preview.mjs';   // `#761` 六片A：选择器只有一处
import { writeFileSync, mkdirSync } from 'node:fs';
import * as os from 'node:os';   // `#647`：失败行带 loadavg（分诊用）
import { AsyncLocalStorage } from 'node:async_hooks';
import { boot, CLICKABLE, CLICKABLE_SEL } from './boot.mjs';

let failures = 0;
const visited = new Set();
const ALL_LOC = [];   // #317②：每次点击的定位方式（key / 文案）汇总
const clickedLinks = new Map(); // `${段落}|${时代}` → 真被点过的链接标签集（#168 机检⑩）

// ── #295（E4 节奏 / C4 相异度）：每条路线的可机读轨迹 ───────────────────
// 路线是并行跑的，所以「现在跑的是哪条路线」不能用全局变量——用 AsyncLocalStorage
// 跟着异步上下文走，才不会串台。轨迹落 build/route-traces.json，由
// scripts/report-rhythm.mjs 消费（报告型探索票，不并进 audit.mjs）。
const routeCtx = new AsyncLocalStorage();
const syntheticRoutes = new Set();   // 注册表里标了 synthetic 的路线名（见 routes 表第三列）
const traces = new Map();        // 路线名 → { passages, clicks, milestones, ending}
const passageTexts = new Map();  // 段落 → 归一化屏文（去重存一份，供 C4 n-gram 用）
const MILESTONE_PASSAGES = {     // 首个不可逆点（E4）
	//注意：`#1004` B2b（换样本）：旧值 [`花田`('塔外花田') / `龙战`('龙·战','封印·并肩')] 是**旧故事**的首个不可逆点
	// → 按存活样本 `night-ferry` 重推：它 6 步链上**唯一的不可逆分叉**就是「河心」之后那一手 ——
	// 举灯 → `靠岸`→`结局 抵岸`；等浪 → `翻船`→`结局 沉船`（两条互斥、不可回头）
	// → 故里程碑取**这两段的到达**（与 `report-rhythm.mjs` 的 `FIRST_MILESTONES` **同口径**）。
	靠岸: ['靠岸'],
	翻船: ['翻船'],
};
// 段落里的可见文本（去掉标签与多余空白）——n-gram 只吃正文，不吃 markup
// #451：**只读与 `State.passage` 对齐的那一段**。
// 原先读**整个 `#passages`** → SugarCube 过渡期旧段落元素还在容器里 → 那一瞬容器文本含**新旧两段**
// →「不许提前泄底」这类断言会命中**上一段**的文字而假红（本机窗口 ≈2–3ms；CI 2 核＋并发下变宽 → 偶发）。
// 口径与 `pool()`（:57）和 `boot.mjs` 的 `settle()` 一致 → **语义不变、脆性消失**；
// 仅在对齐元素缺位时兜底读容器（那一步本该被 `settle()` 挡住）。
const alignedText = (w) => {
	const cur = [...renderedElsOf(w)]
		.find((e) => e.dataset.passage === w.SugarCube.State.passage);
	return ((cur ?? w.document.querySelector('#passages'))?.textContent ?? '');
};
const screenText = (w) => alignedText(w).replace(/\s+/g, ' ').trim();

// ── #407 D9②（次数面·**通用版**）：点击态同屏去重 ──────────────────────────────
// 判据：**一次点击之后**，同一屏上同一组骰面（位点｜DC｜d20）**只许出现一遍**。
// 为什么必须补这一半：`test/render-all.mjs` 的不变量看的是**静止的渲染态** → 对「点一下才产生」的重复
// **抓不到**（实测：反做 #403 的修法——把 `<<lastcheck>>` 加回 `hallResult`——渲染级仍 0 命中）。
// 实测的形态（本判据就是按它写的）：点「把墙上那支哨子摘下来」后，结果被写进**同一个**反馈块两次
// ` …〔门厅·翻检〕· DC10：d20(20) … …〔门厅·翻检〕· DC10：d20(20) …`（修复态只有一份）
// → 所以计数口径必须按**骰面三元组的出现次数**，而不是“块数”（重复在一个块里）。
// 采样时点：块在点击后 ≈+30ms 出现（`settle()` ＋ `sleep(120)` 之后稳定存在）。

// 纯函数：从一段文本里抽出所有「位点｜DC/天然｜d20」三元组
export const diceSegments = (text) => [...String(text).matchAll(/〔([^〕]+)〕\s*·\s*([^：:]*?)[：:]\s*d20\s*\(\s*(\d+)\s*\)/g)]
	.map((m) => `${m[1]}|${m[2].replace(/\s+/g, '')}|d20(${m[3]})`);

// 纯函数：给一批检定反馈块的归一化文本，返回出现 ≥2 遍的骰面三元组（自证见 `--selftest`）
export const duplicateDice = (texts) => {
	const seen = new Map();
	for (const t of texts) for (const k of diceSegments(t)) seen.set(k, (seen.get(k) ?? 0) + 1);
	return [...seen].filter(([, n]) => n >= 2).map(([key, n]) => ({ key, n }));
};

// 取当前屏上的检定反馈块（两个来源：段落内联的 `.check-result` ＋ 反馈槽 `.scene-feedback`
// —— `#403` 的重复就落在后者，只看 `.check-result` 会漏）。
// 口径与 `alignedText` 一致：**别把转场期旧段落里的块算进来**（否则会把转场期上一段的骰面误判成重复）。
const feedbackTexts = (w) => {
	const cur = [...renderedElsOf(w)]
		.find((e) => e.dataset.passage === w.SugarCube.State.passage);
	const mine = (el) => { const p = el.closest('.passage'); return !p || p === cur; };
	return [...w.document.querySelectorAll('#passages .check-result, #passages .scene-feedback')]
		.filter(mine).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
};



   // 本 RUN 真的命中过的登记位点（用于白名单腐烂检测）

// 已知缺陷登记（**报告但不判失败**；修好后删条目即转严格 —— 本仓约定，同 `test/premise-source.mjs`）。
// `--strict` 把已知缺陷也当失败（这就是那批修复工作的**红证**）。
//注意：白名单**腐烂**由本门自己报：登记了却没再命中 → 修好忘删（见文末）。
export const DUP_KNOWN = {
	// #516 已修（2026-09-13）：三处同屏重复的根因都是「段落级 `<<lastcheckFor>>` ＋ `<<socpanel>>` 内复显
	// 渲染同一颗骰」→ 删掉段落级那两行（正文保留、面板那份兜住骰面）。本表留空 → 再出现即**新缺陷**，
	// 门会当作 fresh 判红（登记腐烂也会被 knownDupSeen 的腐烂检查报出来）。
};
export const dupSite = (key) => String(key).split('|')[0];
export const splitDuplicates = (dups, known = DUP_KNOWN) => ({
	fresh: dups.filter((d) => !known[dupSite(d.key)]),
	known: dups.filter((d) => known[dupSite(d.key)]),
});
const STRICT = process.argv.includes('--strict');
const knownDupSeen = new Set();   // 本 RUN 真的命中过的登记位点（用于白名单腐烂检测）

// 自证：`node test/scenarios.mjs --selftest`（不 boot，秒级；样本取实测文本）
if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const FIXED = '🎯 察觉检定（感知） 〔森林·察觉〕 · DC10：d20(20) +0 = 20 ★ 大成功 雾里那点动静又响了一次，你分得清它从哪边来。';
	const DUP = '🎯 察觉检定（感知） 〔森林·察觉〕 · DC10：d20(20) +0 = 20 ★ 大成功 🎯 察觉检定（感知） 〔森林·察觉〕 · DC10：d20(20) +0 = 20 ★ 大成功 雾里那点动静又响了一次，你分得清它从哪边来。';
	t('正例：修复态的单份结果不报（实测文本）', duplicateDice([FIXED]).length === 0);
	t('反例：同一个块里骰面出现两遍 ⇒ 必须报（#403 的反做形态，实测文本）', duplicateDice([DUP]).length === 1 && duplicateDice([DUP])[0].n === 2);
	t('反例：跨两个块重复同一骰面 ⇒ 必须报', duplicateDice([FIXED, FIXED]).length === 1);
	t('边界：两个**不同位点**各一份 ⇒ 不报', duplicateDice([FIXED, FIXED.replace(/森林·察觉/g, '门厅·看钉')]).length === 0);
	t('边界：同一位点但**骰面不同**（20 / 3）⇒ 不报', duplicateDice([FIXED, FIXED.replace('d20(20)', 'd20(3)')]).length === 0);
	t('边界：块里没有骰面（如纯道具反馈）⇒ 不报', duplicateDice(['获得【火把】', '获得【火把】']).length === 0);
	// 已知缺陷姿态（本仓约定：登记 → 只报告；未登记 → 判红；白名单腐烂单独报）
	const KD = { 位点A: '#1（示例）' };
	t('登记命中：已在 DUP_KNOWN 里的位点 ⇒ 归 known（不判失败）', splitDuplicates([{ key: '位点A|DC10|d20(20)', n: 2 }], KD).known.length === 1 && splitDuplicates([{ key: '位点A|DC10|d20(20)', n: 2 }], KD).fresh.length === 0);
	t('登记未命中：不在名单里的位点 ⇒ 归 fresh（会判红）', splitDuplicates([{ key: '位点B|DC10|d20(20)', n: 2 }], KD).fresh.length === 1);
	console.log(bad ? `\n✗ #407 D9② 自证未通过（${bad} 项）` : '\n✔ #407 D9② 自证通过（正例 1 · 反例 2 · 边界 3 · 登记 2）');
	process.exit(bad ? 1 : 0);
}

async function newGame(randomStub, preset = 0, { story = null, chargen = true } = {}) {
	// `#1004` B2b（换样本）：`story` 显式指定样本（不传 → 默认故事＝面夹具）；
	// `chargen:false` → 不跑车卡链（**没有车卡的故事**（`night-ferry`）走它自己的开场段）。
	// random 传函数：每次调用都取同一个定值，d20 于是变成确定骰
	const { w, uncaught, sleep, settle } = await boot({ story, random: () => randomStub });
	// 同一条路线可能 boot 多次（跨周目/读档用例）——轨迹按路线名累加，不覆盖
	const routeName = routeCtx.getStore() ?? '(未命名路线)';
	const trace = traces.get(routeName) ?? { passages: [], clicks: 0, milestones: {}, ending: null };
	traces.set(routeName, trace);
	// #338/#357：**合成用例标记**（注册表第三列 `{ synthetic: true}`）——
	//「夹具注入 + 少量点击却走完到结局」的构造性用例不该计入 C4/E4 的完整路线样本，
	// 否则会抬高家族数、压低最少交互数（实测两次：E4 最早交互数 3<5、C4 家族 18→19 打掉 R1b 自证）。
	if (routeCtx.getStore() && syntheticRoutes.has(routeCtx.getStore())) trace.synthetic = true;
	const mark = () => {
		const p = w.SugarCube.State.passage;
		visited.add(`${p}|${w.SugarCube.State.variables?.era ?? '-'}`);
		// #295 轨迹：段落序列（相邻重复折叠，回退重访仍计一次）+ 屏文去重入库
		if (trace.passages[trace.passages.length - 1] !== p) trace.passages.push(p);
		if (!passageTexts.has(p)) passageTexts.set(p, screenText(w));
		if (p.startsWith('结局')) trace.ending = p;
		// 首个不可逆点：到达时记下「已点了几下」与「当时手里有多少情报旗标」
		const ev = w.SugarCube.State.variables?.pc?.ev ?? {};
		for (const [key, list] of Object.entries(MILESTONE_PASSAGES)) {
			if (!trace.milestones[key] && list.includes(p)) {
				trace.milestones[key] = { atClick: trace.clicks, passage: p, evCount: Object.keys(ev).length, flags: Object.keys(ev).sort() };
			}
		}
	};
	// 只看"当前这一段"（data-passage 与 State.passage 相符的那个.passage）：
	// State 已经变了、旧段落元素还没被换下来时，全局查找会点到上一段的链接。
	const pool = () => {
		const cur = [...renderedElsOf(w)]
			.find((e) => e.dataset.passage === w.SugarCube.State.passage);
		return (cur ? [cur] : [...w.document.querySelectorAll('#passages')]).flatMap((el) => [...el.querySelectorAll(CLICKABLE_SEL)]);
	};
	// #317②：**按稳定 key 定位**（`data-choice` ＝ 目标段落名，由 80-script 的派生 pass 写入）
	const findKey = (key) => pool().find((x) => x.dataset?.choice === key) ?? null;
	// #317②：对外的小工具（与 test/harness.mjs 同形）——`keyOf` 返回三元组：派生 key / 作者覆盖 / 文案兜底
	const keyOf = (el) => ({
		choice: el?.dataset?.choice ?? null,
		authored: el?.closest('[data-key]')?.dataset?.key ?? null,
		label: (el?.textContent ?? '').trim().replace(/\s+/g, ' '),
	});
	// 定位方式统计（#317② 验收要的「还有多少点击靠文案定位」）——每个 session 一份，汇总时相加
	const locStats = { key: 0, label: 0 };
	ALL_LOC.push(locStats);   // 汇总到模块级（验收要看「还有多少点击靠文案」）
	const findLink = (label) => {
		const links = pool();
		// 精确优先：避免「塔」被「守塔的人家」这类包含关系抢先命中（子串兜底保留，供动态文案用）
		return links.find((x) => x.textContent === label) ?? links.find((x) => x.textContent.includes(label));
	};
	// #317②：`what` 先当 **key** 找（`data-choice`），找不到再当**文案**找。
	// 于是「迁移」＝把调用点的中文文案换成目标段落名，未迁的调用点行为完全不变（渐进迁移）。
	const click = async (what) => {
		await settle();          // 等上一翻画完再点——否则 SugarCube 会丢掉这次点击
		let a = findKey(what);
		if (a) locStats.key += 1; else locStats.label += 1;
		// 并行跑三十来条路线时，段落元素偶发晚一拍才换（State 已经变了、DOM 还没换完）——
		// 这一条兜底等一下，省得把"机器忙"报成"游戏坏了"
		for (let i = 0; i < 20 && !a; i++) { await sleep(100); await settle(); a = findKey(what) ?? findLink(what); }
		if (!a) throw new Error(`找不到「${what}」（key 或文案都试过）@ ${w.SugarCube.State.passage}（可选：${[...w.document.querySelectorAll(CLICKABLE)].map((x) => x.textContent).join(' / ')}）`);
		mark();
		// 链接级覆盖（#168 机检⑩）：记下"这一段|这个时代里真被点过的那条链接"——
		// 只记段落格是看不见链接盲区的（P1-1 的断链、P1-29 的抄书人跑腿都从没被点过）。
		{
			const key = `${w.SugarCube.State.passage}|${w.SugarCube.State.variables.era}`;
			if (!clickedLinks.has(key)) clickedLinks.set(key, new Set());
			clickedLinks.get(key).add(a.textContent.replace(/\s+/g, ' ').trim());
		}
		const before = uncaught.length;
		trace.clicks += 1;   // #295：玩家动作计数（一次点击＝一次交互）
		a.click();
		await settle();
		await sleep(120);
		mark();
		if (uncaught.length > before) throw new Error(`点击「${what}」后脚本异常：${uncaught[before].slice(0, 160)}`);
		// `#647`／实测（2026-09-15，故事 2 的同类缺陷）：**SugarCube 的宏错误不是 JS 未捕获** ——
		// 它渲染成 DOM 里的 `.error` 元素 → 只数 `uncaught` 会**漏报**（故事 2 那条 `roadOffer(6)` 红框就是这么漏掉的）。
		// 故事 1 此前也只看 `uncaught` → 同一个盲区。这里补上：每次点击后扫 DOM 红框，命中即当路线失败（带原文）。
		{
			const errs = [...w.document.querySelectorAll('#passages .error, #passages .error-view, #error')]
				.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
			if (errs.length) throw new Error(`点击「${what}」后屏上出现**宏错误红框**：${errs[0].slice(0, 200)}`);
		}
		// #407 D9②（通用版）：点一下之后，同一屏上同一组骰面只许出现一遍（#403 是天然反例：
		// `<<sitecheck>>` 渲染一次、`hallResult` 的复显再写一次 → 同一颗骰面在一屏上两遍）
		{
			const { fresh, known } = splitDuplicates(duplicateDice(feedbackTexts(w)));
			for (const d of known) {
				if (knownDupSeen.has(dupSite(d.key))) continue;   // 同一处只报一次（几十条路线会反复命中）
				knownDupSeen.add(dupSite(d.key));
				console.log(`⏳ [已知缺陷 ${DUP_KNOWN[dupSite(d.key)]}] 同屏重复骰面 ×${d.n}：${d.key}（点「${what}」）——报告但不判失败`);
			}
			if (fresh.length) throw new Error(`同屏重复检定结果（#407 D9② 点击态）：点「${what}」后同一组骰面出现 ${fresh[0].n} 遍 —— ${fresh[0].key}`);
			if (STRICT && known.length) throw new Error(`同屏重复检定结果（--strict：已知缺陷也判失败）：点「${what}」后 ${known[0].key}`);
		}
	};
	// 车卡 + 出发（**有车卡的故事**才有这三步 —— `hasChargen()` 为假的故事直接起在它自己的开场段）
	if (chargen) {
		await click('踏上旅途');
		if (preset) {
			// 选第 N 套预设（点第 N 张卡里的「快速成型」；不带 preset 则默认第一张）
			const cards = [...w.document.querySelectorAll('.choice-card')];
			cards[preset].querySelector('a').click();
			await sleep(300);
		} else {
			await click('快速成型');
		}
		await click('出发，前往歪脖子鸭酒馆');
	} else {
		await settle();
		mark();   // 无车卡路径也要**记下开场段**（否则轨迹里缺第一步）
	}
	return { w, click, uncaught, locStats, byKey: findKey, keyOf };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const linksOf = (w) => [...w.document.querySelectorAll(CLICKABLE)].map((x) => x.textContent);
// 当前段落的链接（只认 data-passage 与 State.passage 相符的那个.passage）。
// 并行跑三十来条路线时，State 已经变了、段落元素偶发晚一拍——先等一下再取，
// 免得把"机器忙"读成"这一段没有出口"。
async function waitLinks(w, timeoutMs = 2000) {
	const t0 = Date.now();
	for (;;) {
		const cur = [...renderedElsOf(w)]
			.find((e) => e.dataset.passage === w.SugarCube.State.passage);
		const links = cur ? [...cur.querySelectorAll(CLICKABLE_SEL)] : [];
		if (links.length || Date.now() - t0 > timeoutMs) return links;
		await sleep(50);
	}
}
const passageOf = (w) => w.SugarCube.State.passage;
// 当前屏上的可读文本（给"不许提前泄底"这类断言用）—— #451：只读与 `State.passage` 对齐的那一段
const passageText = (w) => alignedText(w).replace(/\s+/g, ' ');

/** `Engine.play()` 之后的**等渲染稳定**（`#647`）：轮询到目标段落**真的渲染出来**为止。
 * 为什么替掉"固定 `sleep(150)`"：本机渲染窗口 ≈2–3ms，而 CI 2 核＋三十来条路线并发时 DOM 会**晚一拍**——
 * 固定睡眠会在机器忙时把"DOM 还没换完"报成"游戏坏了"（实测：`#291 I1` 那条路线偶发红）。
 * 口径与 `click()` 里那段兜底「段落元素偶发晚一拍才换」**同源**；超时仍**抛错**（真坏了要红，而不是静默继续）。 */
const waitRendered = async (w, passage, tries = 25) => {
	for (let i = 0; i < tries; i++) {
		await new Promise((r) => setTimeout(r, 40));
		const el = [...renderedElsOf(w)].find((e) => e.dataset.passage === passage);
		if (el && (el.textContent ?? '').trim()) return;
	}
	throw new Error(`Engine.play('${passage}') 之后该段落没渲染出来（${tries}×40ms 超时）——机器忙或段落名写错（#647）`);
};
// B1：战斗每一轮的面板是随机 3 选 1——测试不去猜哪三张，只管"有牌就打"
// 直到出现目标链接（战斗的出口）或段落里已经没有链接（已经落到结局）
//注意：`#1004` B2b（换样本）：本函数**去掉了旧样本的"备药优先"偏好**（那一手是旧故事的战斗池专属）——
// 剩下的部分是**通用**的：「有牌就打，直到看到出口」，对任何故事的战斗池都成立（夹具的战斗池也适用）。
async function fightTo(c, w, stops, maxRounds = 12) {
	const where = passageOf(w);
	for (let i = 0; i < maxRounds; i++) {
		if (passageOf(w) !== where) return;   // 已经离开战斗（落到结局）
		const els = await waitLinks(w);
		if (passageOf(w) !== where) return;   // 等 DOM 的这段工夫里可能已经落到结局了
		if (!els.length) return;
		const links = els.map((x) => x.textContent);
		if (links.some((l) => stops.includes(l))) return;
		await c(els[0].textContent);
	}
	throw new Error(`战斗没能在 ${maxRounds} 轮内结束（等「${stops.join('/')}」@ ${passageOf(w)}）`);
}
const pcOf = (w) => w.SugarCube.State.variables.pc;

// ═══════════ 换样本（`#1004` B2b）：路线表按存活样本 `night-ferry` 重写 ═══════════
//
// 旧路线表 20+ 条**逐条以已删故事的结局命名** → 随那两个内容故事一起退场。
// 现样本 `night-ferry`（11 段落 · 6 步链 · 2 个「结局…」） 的分叉**实测**如下（逐条真跑得出）：
//
// 渡口 ──┬─ 把两枚钱数给他 → 付钱 ─┐
// └─ 接过竹篙 → 撑篙 ─┴─ 船头 ──┬─ 把灯挂在船头，让它亮着 ┐
// └─ 把灯攥在手里 ┴─ 河心 ──┬─ 把灯举高 → 举灯 → 靠岸 → 结局 抵岸
// └─ 伏在船板上等 → 等浪 → 翻船 → 结局 沉船
//
//注意：**只能两条**（每条结局一条）—— 实测：**「挂灯/攥灯」只是 `船头` 页内的两个链接标签**（两处都去 `河心`）
// → 任何"换灯"的组合路线与另一条**逐字同文** → 独有的 5-gram 恒为 **0**（实测：三条时两条抵岸路线各 0）
// → 路线集合＝**每个结局一条**（这两条把 5 个内容段落全部覆盖，且两两不重文）。
// → **两条**完整路线（都走到 `结局…` → C4 的完整路线样本就是它们）：
//注意：**不能只做两两组合** —— 实测（本片第一版就是 4 条两两组合）：4 条路把每段正文都访问了**恰好 2 次** →
// `report-rhythm.mjs` 的 **DF 过滤**（被 ≥2/4 条共享的 5-gram 不算独有）会把**每条路线**的独有 5-gram 清零 →
// `route-indistinct` 4 条全红。→ 路线集合要**让每条路线都留下只属于自己的正文**（三条各差一处组合）。
// ＋ 一条**构造性**路线（结局页收尾，标 `synthetic` → 不入 C4/E4 样本 —— 与旧口径同）。
//注意：它**没有车卡** → 一律 `newGame(random, 0, { story: 'night-ferry', chargen: false})`。

/** 开场段（`渡口`）——路的起点；本样本的 `StoryData.start` 就是它。 */
const FERRY = 'night-ferry';

// ── 路线 1：金路径（付钱 → 挂灯 → 举灯 → 靠岸 → 抵岸）────────────────────────
async function routeFerryAshore() {
	const { w, click: c } = await newGame(0.5, 0, { story: FERRY, chargen: false });
	if (passageOf(w) !== '渡口') throw new Error(`开场不在渡口（在「${passageOf(w)}」）`);
	await c('把两枚钱数给他');
	await c('上船');
	await c('把灯挂在船头，让它亮着');
	await c('把灯举高');
	await c('把灯推向岸边');
	await c('踏上岸');
	if (passageOf(w) !== '结局 抵岸') throw new Error(`金路径没到「结局 抵岸」（停在「${passageOf(w)}」）`);
	if (pcOf(w).ev?.ending !== '抵岸') throw new Error(`结局未登记（ending=${pcOf(w).ev?.ending ?? 'null'}）`);
	return { w };
}

// ── 路线 2：撑篙入场 ＋ 等浪 → 沉船（另一个结局，且入场正文完全不同）────
async function routeFerrySink() {
	const { w, click: c } = await newGame(0.5, 0, { story: FERRY, chargen: false });
	await c('接过竹篙');
	await c('把船撑离岸');
	await c('把灯攥在手里');
	await c('伏在船板上等');
	await c('抓住船舷');
	await c('松开手');
	if (passageOf(w) !== '结局 沉船') throw new Error(`沉船路线没到「结局 沉船」（停在「${passageOf(w)}」）`);
	if (pcOf(w).ev?.ending !== '沉船') throw new Error(`结局未登记（ending=${pcOf(w).ev?.ending ?? 'null'}）`);
	return { w };
}

// ── 路线 5（构造性 但**真走**）：面夹具的**链接遍历**（让交互覆盖 ⊇ 渲染覆盖）──────
// 为什么需要它：`test/coverage.mjs` 把「渲染出来的每一格/每一条链接」与**交互轨迹**对照 ——
//注意：换样本后，渲染侧是**默认故事（＝面夹具，27 格）**、交互侧若只跑 `night-ferry` → 两侧**不是同一个故事**
// → 门 3（交互盲区）／门 5（**交互格 ≥ 渲染格**）／门 6（链接级缺口）**在数学上不可能过**
// → 本条把**面夹具的每条链接各点一次**（确定性、无随机、不注入状态）→ 两侧重新对齐。
// 口径：逐段 `Engine.play(p)` → 取该段当前链接清单 →「回到该段再点下一条」（点完会换段）；
// `结局…` 段放最后（点一次即离开，不再回）；条件分支里当时不存在的链接**直接跳过**（那是判据的一部分，不是缺陷）。
//注意：标 `synthetic`：它在段落之间**瞬移**（`Engine.play`）→ 不是"玩家游玩路线" → 不入 C4/E4 样本
//（与旧口径同：构造性用例只供覆盖门）。
async function routeFixtureSweep() {
	const { w, click: c } = await newGame(0.5, 0);   // 默认故事＝面夹具 ＋ 车卡链三步
	const all = [...w.document.querySelectorAll('tw-passagedata')].map((el) => ({
		name: el.getAttribute('name'),
		tags: (el.getAttribute('tags') ?? '').trim().split(/\s+/).filter(Boolean),
	}));
	const isInfra = (p) => p.name.startsWith('Story') || p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
	const content = all.filter((p) => !isInfra(p) && p.name);
	const normal = content.filter((p) => !p.name.startsWith('结局'));
	const endings = content.filter((p) => p.name.startsWith('结局'));
	const linkLabels = () => [...new Set([...w.document.querySelectorAll('#passages a.link-internal')]
		.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))];
	let clicks = 0, skipped = 0;
	for (const name of [...normal.map((p) => p.name), ...endings.map((p) => p.name)]) {
		w.SugarCube.Engine.play(name);
		await waitRendered(w, name).catch(() => {});   // 自动转场（如 `塔门` 的 hp≤0）容许
		if (passageOf(w) !== name) { skipped += 1; continue; }   // 该段在本态下自动转场 → 不点
		// `#1004` B2b：**逐轮重取快照**（不是一次取好再逐条点） —— 菜单行是**一次性**的（点一次即写笔记 →
		// 该行按 `exclude` 不再渲染），而**点一条会改动 DOM 顺序与行集合** → 固定清单会对着"已经不在的行"点空。
		// 口径：每轮重放该段 → 取当前标签 → 点**第一个还没点过的**（直到没有新标签为止）。
		const done = new Set();
		for (let pass = 0; pass < 30; pass++) {
			w.SugarCube.Engine.play(name);             // 回原位（上一手可能已经把我们带走了）
			await sleep(60);
			if (passageOf(w) !== name) break;
			const next = linkLabels().find((l) => !done.has(l));
			if (!next) break;
			done.add(next);
			try { await c(next); clicks += 1; } catch { skipped += 1; }
			if (name.startsWith('结局') && done.size >= 1) break;   // 结局页点一手（出口）就够
		}
	}
	console.log(`  · 夹具遍历：点 ${clicks} 手 · 跳过 ${skipped} 处（条件分支/自动转场 ✓）`);
	return { w };
}

// ── 路线 5（构造性）：**结局页收尾**（C1）—— 每个「结局…」段都要给出三条出口 ──────
//注意：这是本片里**最通用**的一条判据：它与"哪个故事"无关 —— 任何故事的每个结局页都必须
//「退回上一步 / 读档 / 从头再来」三条出口（旧样本这一条是 `routeEndingFooter`，换成新样本后逐字保留语义）。
async function routeEndingFooter() {
	const { w } = await newGame(0.5, 0, { story: FERRY, chargen: false });
	const endings = ['结局 抵岸', '结局 沉船'];
	const problems = [];
	for (const name of endings) {
		w.SugarCube.Engine.play(name);
		await waitRendered(w, name);
		const foot = w.document.querySelector('#passages .ending-foot');
		if (!foot) { problems.push(`「${name}」没有收尾卡（.ending-foot）`); continue; }
		const acts = [...foot.querySelectorAll('a, button')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
		for (const want of ['退回上一步', '读档', '从头再来']) {
			if (!acts.some((x) => x.includes(want))) problems.push(`「${name}」收尾卡缺出口「${want}」（实得：${acts.join(' / ')}）`);
		}
	}
	if (problems.length) throw new Error(problems.join('；'));
	return { w };
}

// ── 路线 6（构造性）：**结局可达性** —— 两个结局都要有条路线走到（防"写了结局没人到"）──
//注意：为什么独立于路线 1/2：那两条也会顺带走到 —— 但它们是**完整路线样本**，
// 一旦哪天被改成别的走法，这条判据会**静默跟着变**；这里显式再量一次（两条各 Engine.play 之后
// 断言仍落在结局页 ＋ 结局登记与该页一致）。
async function routeEndingReachable() {
	const { w } = await newGame(0.5, 0, { story: FERRY, chargen: false });
	const problems = [];
	for (const [name, key] of [['结局 抵岸', '抵岸'], ['结局 沉船', '沉船']]) {
		w.SugarCube.Engine.play(name);
		await waitRendered(w, name);
		if (passageOf(w) !== name) problems.push(`Engine.play('${name}') 之后落在「${passageOf(w)}」`);
		if (pcOf(w).ev?.ending !== key) problems.push(`「${name}」没有把结局登记成「${key}」（实得 ${pcOf(w).ev?.ending ?? 'null'}）`);
	}
	if (problems.length) throw new Error(problems.join('；'));
	return { w };
}

// `#338`/`#357` 约定：**第三列 `{ synthetic: true}`** 标记「夹具注入 + 少量点击」的构造性用例——
// 它们仍会跑（覆盖门需要），但**不计入** C4/E4 的「完整路线」样本（否则抬高家族数、压低最少交互数）。
// `#1004` B2b：本片里标 synthetic 的是**通用判据**那两条（结局页收尾 ／结局可达） ——
// 它们对任何故事都成立，但走法不是"玩家游玩路线"（直接 `Engine.play` 到结局页）→ 不入样本。
const routes = [
	['金路径 抵岸（付钱·挂灯）', routeFerryAshore],
	['沉船（撑篙·等浪）', routeFerrySink],
	['面夹具·链接遍历', routeFixtureSweep, { synthetic: true }],
	['结局页收尾（C1）', routeEndingFooter, { synthetic: true }],
	['结局可达性', routeEndingReachable, { synthetic: true }],
];

const routeTimes = new Map();
const loadAt = () => { try { return os.loadavg()[0].toFixed(2); } catch { return '?'; } };
const results = await Promise.all(routes.map(async ([name, fn, meta]) => {
	if (meta?.synthetic) syntheticRoutes.add(name);
	const t0 = Date.now();
	try {
		await routeCtx.run(name, fn);   // #295：把路线名绑到该路线的异步上下文上
		routeTimes.set(name, Date.now() - t0);
		console.log(`✓ ${name}（${Date.now() - t0}ms）`);
		return null;
	} catch (e) {
		const ms = Date.now() - t0;
		routeTimes.set(name, ms);
		console.error(`✗ ${name}：${e.message}　【分诊（#647）：本路线 ${ms}ms · loadavg ${loadAt()} · 并发路线 ${routes.length} 条】`);
		return name;
	}
}));
failures = results.filter(Boolean).length;

mkdirSync('build', { recursive: true });
writeFileSync('build/coverage-scenarios.json', JSON.stringify({ cells: [...visited].sort() }, null, 1));
writeFileSync('build/coverage-links-scenarios.json', JSON.stringify({ links: Object.fromEntries([...clickedLinks].map(([k, v]) => [k, [...v].sort()]).sort((a, b) => a[0].localeCompare(b[0]))) }, null, 1));
// #295：路线轨迹（E4 节奏 / C4 相异度 的原始数据）
writeFileSync('build/route-traces.json', JSON.stringify({
	routes: Object.fromEntries([...traces].sort((a, b) => a[0].localeCompare(b[0]))),
	passageTexts: Object.fromEntries([...passageTexts].sort((a, b) => a[0].localeCompare(b[0]))),
}, null, 1));
// #317② 机制自证（**不走路线**）：证明「定位用 key、断言用文案」这条路真的通——
// 取当前段落的可点链接：① 每条都带派生 key；② keyOf 给出三元组；③ 按 key 点一条能真的走过去。
{
	const s2 = await newGame(0.5, 0);
	const { w: w2, click: c2, keyOf } = s2;
	const anchorOf = () => [...w2.document.querySelectorAll('#passages a.link-internal[data-passage]')].filter((a) => a.dataset.choice);
	const links = anchorOf();
	if (!links.length) throw new Error('当前段落没有带 key 的内部链接（派生 pass 没跑？）');
	if (links.some((a) => !a.dataset.choice)) throw new Error('有内部链接缺 data-choice');
	const info = keyOf(links[0]);
	if (!info.choice || !info.label) throw new Error(`keyOf 三元组不全：${JSON.stringify(info)}`);
	const from = passageOf(w2);
	await c2(info.choice);                                   // **按 key 点**（不是文案）
	if (passageOf(w2) === from) throw new Error(`按 key「${info.choice}」点击后段落没变化`);
	console.log(`  ✓ 机制自证：${links.length} 条链接带 key｜keyOf=${JSON.stringify(info).slice(0, 70)}｜按 key 从「${from}」走到「${passageOf(w2)}」`);
}
{
	// #317②：定位方式统计——「还有多少点击靠中文文案」（迁移进度可见）
	const k = ALL_LOC.reduce((a, x) => a + x.key, 0);
	const l = ALL_LOC.reduce((a, x) => a + x.label, 0);
	const pct = k + l ? Math.round((k / (k + l)) * 100) : 0;
	console.log(`定位方式：key ${k} 次 / 文案 ${l} 次（key 占比 ${pct}%）`);
}
// #407 D9②：白名单腐烂检查——登记了却没再命中 → 修好忘删（本仓既有纪律：修好了就要删登记）
{
	const stale = Object.keys(DUP_KNOWN).filter((site) => !knownDupSeen.has(site));
	if (stale.length) {
		console.error(`⚠ [stale-whitelist] DUP_KNOWN 里的位点本次未再命中同屏重复：${stale.join('、')} ⇒ 若已修好请删登记（#516）`);
		if (STRICT) failures += 1;
	}
}
console.log(`\n路线 ${routes.length} 条 · 交互覆盖 ${visited.size} 格`);
if (failures) { console.error(`✗ ${failures} 条路线失败`); process.exit(1); }
console.log('✔ 分支场景测试通过');
process.exit(0);
