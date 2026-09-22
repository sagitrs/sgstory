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

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
/** 反向核：三故事的键数与基础面规模（改契约或改基础面时同片更新）。 */
const EXPECTED_KEYS = { 'face-fixture': 28, 'night-ferry': 14, 'minimal-demo': 14 };
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

console.log(bad === 0 ? '\n✔ 角色状态基础面判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
