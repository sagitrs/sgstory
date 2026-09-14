// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { storyText } from '../lib/shared.mjs';
// flags=['npc']。校验：npm run audit:golden。
export const flag = 'npc';
export const flags = ["npc"];

// ── #342 F2 自证：D7 门的"三查"都是**集合覆盖 + 文本包含**，可剥成纯函数喂合成输入 ──
const stripBlockComments = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '');
/** `<<give "X">>` 调用点 → `段落::道具` 集合（「道具」＝社交 ok 模板的泛型占位，由 social 条目覆盖 ⇒ 跳过 Game Tables 那条）。
 *  `#435` 前置 0：条件表行的 `gives: ['月光花']` 也是 give 位点（写点已搬到 `<<rules>>` 一处）——
 *  归属段落＝该行 `scope` 的 `#` 前那一截；不收进来 ⇒ 物品授予就从 NPC 动机登记簿里"消失"。 */
export const giveSitesOf = (passageSrc, rows = []) => {
	const out = new Set();
	for (const [name, src0] of passageSrc) {
		const src = stripBlockComments(src0);
		for (const m of src.matchAll(/<<give "([^"]+)">>/g)) {
			if (m[1] === '道具' && name === 'Game Tables') continue;
			out.add(`${name}::${m[1]}`);
		}
	}
	for (const r of rows ?? []) {
		const p = String(r?.scope ?? '').split('#')[0];
		for (const g of (Array.isArray(r?.gives) ? r.gives : r?.gives ? [r.gives] : [])) if (p) out.add(`${p}::${String(g)}`);
	}
	return out;
};
/** 未登记的 give 位点。 */
export const uncoveredGiveSites = (sites, entries) =>
	[...sites].sort().filter((site) => {
		const [p, item] = site.split('::');
		return !entries.some((e) => e.act === `give:${item}` && e.p === p);
	});
/** 未登记的社交让渡（三形态：`social:<id>` / `flag:<x>` / 无冒号 ⇒ `give:<y>`）。 */
export const uncoveredYields = (asks, entries) =>
	(asks ?? []).filter((ask) => {
		if (!ask.yield) return false;
		const flagYield = String(ask.yield).startsWith('flag:') ? String(ask.yield).slice(5) : null;
		return !entries.some((e) =>
			e.act === `social:${ask.id}`
			|| (flagYield && e.act === `flag:${flagYield}`)
			|| (!flagYield && !String(ask.yield).includes(':') && e.act === `give:${ask.yield}`));
	}).map((a) => `${a.id}（yield ${a.yield}）`);
/** 立场旗标：正文里出现（剥注释后）却没登记 ⇒ 报。 */
export const uncoveredFlagSites = (flagSites, passageSrc, entries) =>
	flagSites.filter(([act, re]) => [...passageSrc.values()].some((src) => re.test(src) || re.test(stripBlockComments(src))) && !entries.some((e) => e.act === act)).map(([act]) => act);
/** 条目自检：motive 非空 / 段落存在 / 锚句在段内。 */
export const entryProblems = (entries, passageSrc) => {
	const out = [];
	for (const [id, e] of Object.entries(entries)) {
		if (!e.motive || !e.motive.trim()) { out.push(`${id}：motive 为空`); continue; }
		const src = passageSrc.get(e.p);
		if (src === undefined) { out.push(`${id}：段落「${e.p}」不存在`); continue; }
		if (!src.includes(e.anchor)) out.push(`${id}：锚句不在「${e.p}」内：「${e.anchor}」`);
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── D7 NPC 动机登记簿门（#253）：三查 ──────────────────────────
// ① 位点全覆盖：全部 <<give>> 调用点＋社交 yield＋立场旗标落位点，必须有登记条目；
// ② 锚句在段内：每条 entry 的 anchor 必须存在于 p 段源码（动机在玩家可见正文有落点）；
// ③ 动机非空：motive 缺条目即红。
if (wantAll || arg('npc')) {
	console.log('\n══ D7 NPC 动机登记簿（#253）══');
	const entries = Object.values(Game.NPC.entries);
	let bad = 0;
	// 位点扫描：give 调用点（剥注释；「道具」＝社交 ok 模板的泛型占位，由 social 条目覆盖）
	// ＋ `#435` 前置 0：表行的 `gives` 声明（按 `scope` 归属）
	const rules = ctx.window?.Sg?.story?.rules?.() ?? [];
	const giveSites = giveSitesOf(passageSrc, rules);
	for (const site of uncoveredGiveSites(giveSites, entries)) {
		const [p, item] = site.split('::');
		console.log(`  ✗ give 位点未登记：${p} · ${item}`);
		bad++;
	}
	for (const y of uncoveredYields(Game.Social.asks, entries)) { console.log(`  ✗ 社交让渡未登记：${y}`); bad++; }
	// 自证 6 例（合成输入）
	{
		const E = (act, p) => ({ act, p, motive: 'x', anchor: 'y' });
		const cases = [
			['give 位点提取：`<<give "日记">>` ⇒ 段落::道具', [...giveSitesOf(new Map([['P', '<<give "日记">>']]))].join() === 'P::日记'],
			['表行 `gives` 声明也算 give 位点（归属到 `scope` 的 `#` 前段落）', [...giveSitesOf(new Map(), [{ id: 'R', scope: '塔外花田#摘花', gives: ['月光花'] }])].join() === '塔外花田::月光花'],
			['表行 `gives` 与段落 `<<give>>` 合并去重', giveSitesOf(new Map([['P', '<<give "日记">>']]), [{ id: 'R', scope: 'P', gives: '日记' }]).size === 1],
			['泛型占位：`Game Tables` 段的 `<<give "道具">>` 被跳过（由 social 条目覆盖）', giveSitesOf(new Map([['Game Tables', '<<give "道具">>']])).size === 0 && giveSitesOf(new Map([['P', '<<give "道具">>']])).size === 1],
			['give 覆盖：有 `give:日记` 且同段 ⇒ 不报；换段 ⇒ 报', uncoveredGiveSites(new Set(['P::日记']), [E('give:日记', 'P')]).length === 0 && uncoveredGiveSites(new Set(['P::日记']), [E('give:日记', 'Q')]).length === 1],
			['yield 三形态：social:<id> / flag:<x> / 无冒号 ⇒ give:<y> 任一条都能覆盖', uncoveredYields([{ id: 'q', yield: 'flag:x' }], [E('flag:x', 'P')]).length === 0 && uncoveredYields([{ id: 'q', yield: '日记' }], [E('give:日记', 'P')]).length === 0 && uncoveredYields([{ id: 'q', yield: 'flag:x' }], []).length === 1],
			['立场旗标：正文出现但未登记 ⇒ 报；登记了 ⇒ 不报', uncoveredFlagSites([['flag:r', /world\.r to true/]], new Map([['P', 'world.r to true']]), []).length === 1 && uncoveredFlagSites([['flag:r', /world\.r to true/]], new Map([['P', 'world.r to true']]), [{ act: 'flag:r' }]).length === 0],
			// ⚠️ 钉住**现有语义**（不是我认为对的语义）：原实现先测**原始**源码、再测剥注释版 ⇒
			// **只出现在块注释里的旗标也被当作"位点"**（潜在假阳性：注释里提一句就得登记）。
			// 本 PR 不改语义（一个 PR 一个自变量）；已把这条观察写进 PR 描述，供后续决定是否收紧。
			['只出现在块注释里的旗标：**当前也算位点** ⇒ 未登记时仍报（语义留档，非本次改动）', uncoveredFlagSites([['flag:r', /world\.r to true/]], new Map([['P', '/* world.r to true */']]), []).length === 1],
			['条目自检：motive 空 / 段落不存在 / 锚句不在 ⇒ 各报一次', entryProblems({ a: { motive: ' ', p: 'P', anchor: 'x' }, b: { motive: 'm', p: '缺', anchor: 'x' }, c: { motive: 'm', p: 'P', anchor: '不在' } }, new Map([['P', '正文']])).length === 3],
		];
		for (const [label, ok] of cases) { if (!ok) bad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	}
	// 立场旗标落位点
	const flagSites = [
		['flag:witch_hint', /setflag "witch_hint"|world\.witch_hint to true/],
		['flag:rumor', /setflag "rumor"|world\.rumor to true/],
		['flag:flower_warned', /flower_warned to true/],
		['flag:family_favor', /family_favor/],
		['flag:keeper.met', /keeper\.met to true/],
		['flag:keeper.state', /keeper\.state to ("ally"|'ally')/],
	];
	for (const act of uncoveredFlagSites(flagSites, passageSrc, entries)) { console.log(`  ✗ 立场旗标未登记：${act}`); bad++; }
	for (const p of entryProblems(Game.NPC.entries, storyText({ passageSrc, passageTags, rows: rules }).text)) { console.log(`  ✗ ${p}`); bad++; }
	console.log(`  登记条目 ${entries.length} 条；give 位点 ${giveSites.size} 处；社交 yield ${ (Game.Social.asks ?? []).filter((a) => a.yield).length } 处`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D7 NPC 动机门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D7 NPC 动机门通过（位点全覆盖 · 锚句全在段内 · 动机非空）');
	}
}
};
