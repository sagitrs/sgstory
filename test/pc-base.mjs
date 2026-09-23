// `#1186`（父票 `#1184` 流一·甲）：角色状态基础面的判据面。
//
// 口径（票面评论有全文）：基础面**显式清单化**；玩法状态随模块走；**默认值从模块来**（不从数据面来）；
// 未声明模块的故事，角色状态**零玩法概念**。
//
// 取数一律走**声明面**（故事契约 JSON ＋ 归属表 import），与测试宿主无关；实际状态用引擎的
// `Game.Pc.defaults()`（既有件 `test/pc-defaults.mjs` 第 32 行的取法）。
//
// 四格：① 基础面显式且每故事都在；② 未声明模块 → 该模块的键**一个都不出现**（最硬的能假）；
// ③ 默认值来源：模块键不在数据面（`pcDefaults`）里声明；⑤ 反向核（键数、清单规模、两处信号表一致）。
//（④ 侧栏玩法区块随声明出现：属可见面，判据要读 DOM／渲染条件，留作同片下一步。）

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boot } from './boot.mjs';
import { DEFAULT_SLUG, storySlugs } from '../scripts/dist-paths.mjs';
import { PC_BASE_KEYS, PC_STORY_CONCEPTS, PC_GAMEPLAY_HOME, PC_GROUP_SIGNALS, PC_GAMEPLAY_CONCEPTS } from '../editor/lib/core/pc-state-map.mjs';
import { allSourceFiles } from '../scripts/module-order.mjs';   // `#1186`：扫描面走单一权威

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
/** 反向核：三故事的键数与基础面规模（改契约或改基础面时同片更新）。 */
const EXPECTED_KEYS = { 'face-fixture': 28, 'night-ferry': 8, 'minimal-demo': 8 };   // `#1216` B 半：补回夹具三名（checkSite/dragonMaxHp/poisonReduce）后随契约面更新   // `#1216` B 半：随契约面去声明而变（`rules`／`notes`／`pcDefaults` 为必给、已恢复 ✓）   // `#1186`：世界观概念改由故事声明后，无概念的两故事少两键
const EXPECTED_BASE = 7;

let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

const contractOf = (slug) => JSON.parse(readFileSync(join(ROOT, 'stories', slug, 'data', 'contract.json'), 'utf8'));
const slugs = [DEFAULT_SLUG, ...storySlugs().filter((s) => s !== DEFAULT_SLUG)];
const stateOf = {};
for (const slug of slugs) {
	const { w } = await boot({ story: slug, random: 0.5 });
	stateOf[slug] = Object.keys(w.eval('Game.Pc.defaults()'));
}
const keysOfGroup = (group) => Object.entries(PC_GAMEPLAY_HOME).filter(([, home]) => home === group).map(([k]) => k);

// ① 基础面显式、每故事都在
{
	const missing = [];
	for (const slug of slugs) for (const k of PC_BASE_KEYS) if (!stateOf[slug].includes(k)) missing.push(`${slug}:${k}`);
	ok('① 基础面每一项在每个故事里都在', missing.length === 0, missing.join(' / '));
	ok(`① 基础面是显式清单且规模在预期区间（${EXPECTED_BASE} 项）`, PC_BASE_KEYS.length === EXPECTED_BASE, `实得 ${PC_BASE_KEYS.length}`);
}

// ② 未声明模块 → 该模块的键一个都不出现（能假）
{
	const problems = [];
	for (const slug of slugs) {
		const members = contractOf(slug).members ?? [];
		for (const [group, sig] of Object.entries(PC_GROUP_SIGNALS)) {
			const present = sig.faces.some((f) => members.some((m) => m.name === f));
			const ks = keysOfGroup(group);
			if (present) continue;
			const leaked = ks.filter((k) => stateOf[slug].includes(k));
			if (leaked.length) problems.push(`${slug} 未声明 ${group}：${leaked.join(',')}`);
		}
	}
	ok('② 未声明模块的故事零玩法概念（该组的键一个不出现）', problems.length === 0, problems.join(' / '));
	// 能假的另一半：合成一个"偷带"的输入，判据必须能点名（纯函数层）
	const synthesized = { story: 'x', state: [...PC_BASE_KEYS, 'dragon'], declared: [] };
	const leaked = keysOfGroup('combat').filter((k) => synthesized.state.includes(k));
	ok('② 能假：合成"偷带 dragon"⇒ 判据层能点名', leaked.length === 1 && leaked[0] === 'dragon');
}

// ③ 默认值来源：模块键不出现在数据面（`pcDefaults`）的声明里
{
	const problems = [];
	for (const slug of slugs) {
		const members = contractOf(slug).members ?? [];
		const pc = members.find((m) => m.name === 'pcDefaults');
		const declaredKeys = pc && pc.value && typeof pc.value === 'object' ? Object.keys(pc.value) : [];
		for (const k of declaredKeys) if (k in PC_GAMEPLAY_HOME) problems.push(`${slug}:${k}`);
	}
	ok('③ 模块键不由数据面声明（默认值从模块来）', problems.length === 0, problems.join(' / '));
	ok('③ 世界观概念可留在数据面（它们走声明路径）', PC_STORY_CONCEPTS.every((k) => !(k in PC_GAMEPLAY_HOME)));
}

// ⑤ 反向核
{
	const wrong = Object.entries(EXPECTED_KEYS).filter(([slug, n]) => (stateOf[slug] ?? []).length !== n);
	ok('⑤ 反向核：三故事键数命中钉死值', wrong.length === 0, wrong.map(([s, n]) => `${s} 期望 ${n} 实得 ${(stateOf[s] ?? []).length}`).join(' / '));
	ok('⑤ 反向核：玩法概念名表 ＝ 归属表 ＋ 世界观概念（同源）', PC_GAMEPLAY_CONCEPTS.length === Object.keys(PC_GAMEPLAY_HOME).length + PC_STORY_CONCEPTS.length);
}

// ④ `#1186`：**可见面**判据 —— 侧栏玩法区块（`fight-meta`／`soc-meta`）必须落在"引用该模块状态或契约面"的守卫上下文里。
// 口径来自读数：这两个区块的渲染守卫本来就是模块状态本身（战斗 `ev.fight`／`dragon`；交涉 `soc`），
// 所以本条不是新造机制，而是把"可见面天然由状态门控"钉住。窗口取 ±15 行（守卫常写在区块上方几行）。
const BLOCK_GUARDS = {
	'fight-meta': { need: ['ev.fight', '_L.foe', 'Game.Combat', 'dragon', 'combatPool', 'combatAction'], pin: 5 },   // 只数**渲染站点**（样式表已跳过）
	'soc-meta': { need: ['soc', 'Game.Social', 'socialAsks', 'socialHooks'], pin: 3 },   // 只数渲染站点（样式表已跳过）
};
{
	const files = allSourceFiles().filter((f) => f.startsWith('src/') && f.endsWith('.twee'));
	const misses = [];
	const counts = {};
	for (const [cls, spec] of Object.entries(BLOCK_GUARDS)) {
		counts[cls] = 0;
		for (const f of files) {
			// 样式表整件跳过：`90-style.twee` 里出现类名是 **CSS 选择器**（样式规则），不是渲染站点。
			if (/90-style\.twee$/.test(f)) continue;
			const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
			lines.forEach((l, i) => {
				if (!l.includes(cls)) return;
				counts[cls] += 1;
				// CSS 选择器行不算**渲染站点**（`90-style.twee` 里是样式规则：`.fight-meta{…}`）→ 不计入守卫要求。
				if (new RegExp(`^[\\s.#>]*[.#]${cls}\\b`).test(l)) return;
				const ctx = lines.slice(Math.max(0, i - 25), i + 3).join('\n');   // 窗口 ±25：守卫常写在区块上方若干行（如 `_L` 取自更上面的 `ev.fight.log`）
				if (!spec.need.some((n) => ctx.includes(n))) misses.push(`${f}:${i + 1}`);
			});
		}
	}
	ok('④ 侧栏玩法区块都落在模块状态／契约面的守卫上下文里', misses.length === 0, misses.join(' / '));
	// 反向核：出现次数钉死（防扫描抽空）；`soc-meta` 在主干上为 0 → 本格只钉 `fight-meta`
	const wrong = Object.entries(BLOCK_GUARDS).filter(([cls, spec]) => spec.pin > 0 && counts[cls] !== spec.pin);
	ok('④ 反向核：类名出现次数命中钉死值', wrong.length === 0, wrong.map(([c, s]) => `${c} 期望 ${s.pin} 实得 ${counts[c]}`).join(' / '));
	// 能假对：合成一个"无守卫上下文"的输入 → 判据层必须能点名
	const synth = ['<div class="fight-meta">无守卫</div>'];
	const violated = synth.filter((l) => l.includes('fight-meta') && !BLOCK_GUARDS['fight-meta'].need.some((n) => l.includes(n)));
	ok('④ 能假：合成长无守卫的区块 ⇒ 判据点名', violated.length === 1);
}

console.log(bad === 0 ? '\n✔ 角色状态基础面判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
