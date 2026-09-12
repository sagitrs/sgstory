// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['npc']。校验：npm run audit:golden。
export const flag = 'npc';
export const flags = ["npc"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── D7 NPC 动机登记簿门（#253）：三查 ──────────────────────────
// ① 位点全覆盖：全部 <<give>> 调用点＋社交 yield＋立场旗标落位点，必须有登记条目；
// ② 锚句在段内：每条 entry 的 anchor 必须存在于 p 段源码（动机在玩家可见正文有落点）；
// ③ 动机非空：motive 缺条目即红。
if (wantAll || arg('npc')) {
	console.log('\n══ D7 NPC 动机登记簿（#253）══');
	const entries = Object.values(Game.NPC.entries);
	let bad = 0;
	// 位点扫描：give 调用点（剥注释；「道具」＝社交 ok 模板的泛型占位，由 social 条目覆盖）
	const giveSites = new Set();
	for (const [name, src0] of passageSrc) {
		const src = src0.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const m of src.matchAll(/<<give "([^"]+)">>/g)) {
			if (m[1] === '道具' && name === 'Game Tables') continue;
			giveSites.add(`${name}::${m[1]}`);
		}
	}
	for (const site of [...giveSites].sort()) {
		const [p, item] = site.split('::');
		if (!entries.some((e) => e.act === `give:${item}` && e.p === p)) {
			console.log(`  ✗ give 位点未登记：${p} · ${item}`);
			bad++;
		}
	}
	// 社交 yield：全部带 yield 的诉求
	for (const ask of Game.Social.asks ?? []) {
		if (!ask.yield) continue;
		const flagYield = String(ask.yield).startsWith('flag:') ? String(ask.yield).slice(5) : null;
		const covered = entries.some((e) =>
			e.act === `social:${ask.id}`
			|| (flagYield && e.act === `flag:${flagYield}`)
			|| (!flagYield && !String(ask.yield).includes(':') && e.act === `give:${ask.yield}`));
		if (!covered) {
			console.log(`  ✗ 社交让渡未登记：${ask.id}（yield ${ask.yield}）`);
			bad++;
		}
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
	for (const [act, re] of flagSites) {
		const hasSite = [...passageSrc.values()].some((src) => re.test(src) || re.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
		if (hasSite && !entries.some((e) => e.act === act)) {
			console.log(`  ✗ 立场旗标未登记：${act}`);
			bad++;
		}
	}
	// 条目自检：anchor 在段内＋motive 非空
	for (const [id, e] of Object.entries(Game.NPC.entries)) {
		if (!e.motive || !e.motive.trim()) { console.log(`  ✗ ${id}：motive 为空`); bad++; continue; }
		const src = passageSrc.get(e.p);
		if (src === undefined) { console.log(`  ✗ ${id}：段落「${e.p}」不存在`); bad++; continue; }
		if (!src.includes(e.anchor)) { console.log(`  ✗ ${id}：锚句不在「${e.p}」内：「${e.anchor}」`); bad++; }
	}
	console.log(`  登记条目 ${entries.length} 条；give 位点 ${giveSites.size} 处；社交 yield ${ (Game.Social.asks ?? []).filter((a) => a.yield).length } 处`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D7 NPC 动机门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D7 NPC 动机门通过（位点全覆盖 · 锚句全在段内 · 动机非空）');
	}
}
};
