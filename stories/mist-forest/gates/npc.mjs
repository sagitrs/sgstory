// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { storyText } from '../../../scripts/../scripts/audit/lib/shared.mjs';
// flags=['npc']。校验：npm run audit:golden。
export const flag = 'npc';
export const flags = ["npc"];

// ── #342 F2 自证：D7 门的"三查"都是**集合覆盖 + 文本包含**，可剥成纯函数喂合成输入 ──
const stripBlockComments = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '');
/** `<<give "X">>` 调用点 → `段落::道具` 集合（「道具」＝社交 ok 模板的泛型占位，由 social 条目覆盖 ⇒ 跳过 Game Tables 那条）。
 *  `#435` 前置 0：条件表行的 `gives: ['月光花']` 也是 give 位点（写点已搬到 `<<rules>>` 一处）——
 *  归属段落＝该行 `scope` 的 `#` 前那一截；不收进来 ⇒ 物品授予就从 NPC 动机登记簿里"消失"。 */
export const giveSitesOf = (passageSrc, rows = [], tagsOf = () => []) => {
	const out = new Set();
	for (const [name, src0] of passageSrc) {
		// `[script]` 段（条件表）的源码里也能正则到 `<<give "…">>` —— 那是 **行 `text` 里的字符串**，
		// 不是该段的写点 ⇒ 跳过（它们的归属由下面按行 `scope` 归属；不跳就会多出 `StoryRules::…` 的假位点）。
		if ((tagsOf(name) ?? []).includes('script')) continue;
		const src = stripBlockComments(src0);
		for (const m of src.matchAll(/<<give "([^"]+)">>/g)) {
			if (m[1] === '道具' && name === 'Game Tables') continue;
			out.add(`${name}::${m[1]}`);
		}
	}
	for (const r of rows ?? []) {
		const p = String(r?.scope ?? '').split('#')[0];
		if (!p) continue;
		// `#624` 片一：表行 `text` 里也可以有 `<<give>>`（点击态词汇宏 —— 渲染域不许写，link 体内可以）
		// ⇒ 这些写点同样要归到该行的归属段落（`scope` 的 `#` 前那段），与 `gives` 声明同一口径；
		// 不收进来就会把它们算在 `StoryRules` 名下 ⇒ 假红「give 位点未登记」（本批实测撞到）。
		for (const m of String(r?.text ?? '').matchAll(/<<give "([^"]+)">>/g)) out.add(`${p}::${m[1]}`);
		for (const g of (Array.isArray(r?.gives) ? r.gives : r?.gives ? [r.gives] : [])) out.add(`${p}::${String(g)}`);
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
export const uncoveredYields = (asks, entries) => {
	// 形态表（`#733` 片 1 加一种）：`social:<askId>` · `flag:<x>` · **`note:<noteId>`** · 无冒号 ⇒ `give:<道具>`。
	// 为什么加 `note:`：单源知识在声明面改用笔记键（与读侧 `Sg.notes.has(id)` 同词根）——
	// 分类器的 `NOTE_REF_RE` 本来就认 `note:(n_…)`，引擎 `applyYields` 也认 id ⇒ 零新语法。
	const tail = (v, pre) => (String(v).startsWith(pre) ? String(v).slice(pre.length) : null);
	return (asks ?? []).filter((ask) => {
		if (!ask.yield) return false;
		const y = String(ask.yield);
		const flagYield = tail(y, 'flag:');
		const noteYield = tail(y, 'note:');
		return !entries.some((e) =>
			e.act === `social:${ask.id}`
			|| (flagYield && e.act === `flag:${flagYield}`)
			|| (noteYield && e.act === `note:${noteYield}`)
			|| (!flagYield && !noteYield && !y.includes(':') && e.act === `give:${y}`));
	}).map((a) => `${a.id}（yield ${a.yield}）`);
};
/** **声明的产出口必须真的落到**（`note:` 形态，`#733` 片 1 · dev 要求"新形状必须能红"）：
 *  某个 ask 声明 `yield: 'note:n_x'` ⇒ 故事源码里必须有对它的**写点**（`Sg.notes.add('n_x')`／`<<note "n_x">>`／
 *  `addPath('n_x', …)`／`<<notepath "n_x" …>>`）——否则"声明了但没人给"就是空头承诺（`--sel` 对经济事件已有同型判据）。 */
export const unlandedNoteYields = (asks, sources) => {
	const text = Object.values(sources ?? {}).join('\n');
	// `#785` 机制片：产出**可以由声明落地**（引擎按 ask 的 `yields` 授予 ✓）⇒ 判据的含义**随之改写**（不是放宽 ✗）：
	//   「诉求**承诺**的 note（`yield: 'note:X'`）必须真的**授予**：① 本 ask 的 `yields` 里含 `X`（声明式落地 ✓）；
	//     或 ② 正文/代码里有写点（老的函数式形态 ✓）。二者皆无 ⇒ **承诺没兑现** ⇒ 报 ✓。」
	// ⇒ 换含义**必须换反例**（自证里两条：承诺有授予 ⇒ 不报；承诺无授予又无写点 ⇒ 报 ✓）。
	return (asks ?? [])
		.map((a) => (String(a.yield ?? '').startsWith('note:') ? { id: String(a.yield).slice(5), a } : null))
		.filter(Boolean)
		.filter(({ id, a }) => {
			const declared = [a.yields ?? []].flat().map(String).some((y) => y === id || y === `note:${id}`);
			if (declared) return false;
			return !new RegExp(`(?:add|addPath)\\(\\s*['"]${id}['"]|<<\\s*(?:note|notepath)\\s+['"]${id}['"]`).test(text);
		})
		.map(({ id }) => `note:${id}`);
};
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
	const giveSites = giveSitesOf(passageSrc, rules, (p) => passageTags?.get(p) ?? []);
	for (const site of uncoveredGiveSites(giveSites, entries)) {
		const [p, item] = site.split('::');
		console.log(`  ✗ give 位点未登记：${p} · ${item}`);
		bad++;
	}
	for (const y of uncoveredYields(Game.Social.asks, entries)) { console.log(`  ✗ 社交让渡未登记：${y}`); bad++; }
	// `#733` 片 1：声明的 `note:` 产出必须有写点（"声明了但没人给"＝空头承诺）
	// ⚠️ 写点可能在**表侧**（`apply(pc)` 里 `Sg.notes.add(...)`）⇒ 必须扫**整个故事作用域**（引擎＋故事文件），
	//    只扫段落会把"表里给的"误判成"没人给"（实测：`n_tav_tips`/`n_flower_warned`/`n_witch_grip` 三条正是表侧授予）。
	const allStorySrc = Object.fromEntries(SRC_FILES.map((f) => { try { return [f, readFileSync(f, 'utf8')]; } catch { return [f, '']; } }));
	for (const y of unlandedNoteYields(Game.Social.asks, allStorySrc)) { console.log(`  ✗ 声明的产出没落到（找不到对 ${y} 的写点）`); bad++; }
	// 自证 6 例（合成输入）
	{
		const E = (act, p) => ({ act, p, motive: 'x', anchor: 'y' });
		const cases = [
			['give 位点提取：`<<give "日记">>` ⇒ 段落::道具', [...giveSitesOf(new Map([['P', '<<give "日记">>']]))].join() === 'P::日记'],
			['表行 `gives` 声明也算 give 位点（归属到 `scope` 的 `#` 前段落）', [...giveSitesOf(new Map(), [{ id: 'R', scope: '塔外花田#摘花', gives: ['月光花'] }])].join() === '塔外花田::月光花'],
			['表行 `gives` 与段落 `<<give>>` 合并去重', giveSitesOf(new Map([['P', '<<give "日记">>']]), [{ id: 'R', scope: 'P', gives: '日记' }]).size === 1],
			['泛型占位：`Game Tables` 段的 `<<give "道具">>` 被跳过（由 social 条目覆盖）', giveSitesOf(new Map([['Game Tables', '<<give "道具">>']])).size === 0 && giveSitesOf(new Map([['P', '<<give "道具">>']])).size === 1],
			['give 覆盖：有 `give:日记` 且同段 ⇒ 不报；换段 ⇒ 报', uncoveredGiveSites(new Set(['P::日记']), [E('give:日记', 'P')]).length === 0 && uncoveredGiveSites(new Set(['P::日记']), [E('give:日记', 'Q')]).length === 1],
			['yield 四形态（`#733`）：`note:<id>` 也能覆盖', uncoveredYields([{ id: 'q', yield: 'note:n_x' }], [E('note:n_x', 'P')]).length === 0 && uncoveredYields([{ id: 'q', yield: 'note:n_x' }], []).length === 1],
						['🔴 承诺 note 但**既无授予也无写点** ⇒ 点名（换含义后的新反例 ✓）', unlandedNoteYields([{ id: 'q', yield: 'note:n_x' }], { 'a.twee': '没写' }).length === 1],
			['✅ 承诺 note ＋ 本 ask 的 `yields` 里含它（**声明式落地** ✓）⇒ 不报', unlandedNoteYields([{ id: 'q', yield: 'note:n_x', yields: ['n_x'] }], { 'a.twee': '没写' }).length === 0],
			['🔴 承诺 `note:n_x` 但 `yields` 里是**别的** id（承诺与授予不一致）⇒ 报', unlandedNoteYields([{ id: 'q', yield: 'note:n_x', yields: ['n_y'] }], { 'a.twee': '没写' }).length === 1],
['🔴 声明的 note 产出**没有写点** ⇒ `unlandedNoteYields()` 点名（新形状必须能红）', unlandedNoteYields([{ id: 'q', yield: 'note:n_x' }], { 'a.twee': '<<note "n_other">>' }).length === 1],
			['✅ 有写点 ⇒ 不报（`<<note>>`／`add`／`notepath` 三种都认）', unlandedNoteYields([{ id: 'q', yield: 'note:n_x' }], { 'a.twee': "Sg.notes.add('n_x')" }).length === 0 && unlandedNoteYields([{ id: 'q', yield: 'note:n_x' }], { 'a.twee': '<<notepath "n_x" "ev.x">>' }).length === 0],
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
