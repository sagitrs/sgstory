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
import { absPath } from '../scripts/dist-paths.mjs';   // `#1267`
import { boot } from './boot.mjs';
import { DEFAULT_SLUG, storySlugs } from '../scripts/dist-paths.mjs';
import { PC_BASE_KEYS, PC_STORY_CONCEPTS, PC_GAMEPLAY_HOME, PC_GROUP_SIGNALS, PC_GAMEPLAY_CONCEPTS } from '../editor/lib/core/pc-state-map.mjs';
import { allSourceFiles } from '../scripts/module-order.mjs';   // `#1186`：扫描面走单一权威

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
/** 反向核：三故事的键数与基础面规模（改契约或改基础面时同片更新）。 */
// `#1267` 尾件②：期望表只对**生效根下存在**的样本生效（枚举面走 storySlugs()）；
// 样本缺席 → 明说未判（不静默判红／判绿）。
const HAVE = new Set(storySlugs());
// ★ `#1315` 审计（下架复验）：原 `EXPECTED_KEYS` **钉死三个旧 slug**（face-fixture／night-ferry／minimal-demo）
//   ⇒ 三者均随 `#1261` 删除（全仓 0 命中）⇒ 那是「**把故事样本当判据**」的分类错 ✗
//   （与 `#1433` 的「自算计数」同族：写死名单／数字 ⇒ 必腐烂）
//   ⇒ 改为「**对在场的故事逐 slug 核**」：约束换成两条**结构不变量**——
//     ① 每个在场故事的键集合 ⊇ `PC_BASE_KEYS`（格① 已核 ✓）
//     ② **各在场故事的键名集合两两相等**（形状单一源：故事只能给数值、✗ 不能改形状 ✓）
//   ★恢复条件＝参考故事集复活时，可回头补「逐 slug 钉死值」（届时同笔 ✓）
const EXPECTED_BASE = 7;

let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

// `#1267` 尾件①：故事根下的路径经 `absPath`（仓内恒等 → 行为不变）。
const contractOf = (slug) => JSON.parse(readFileSync(absPath(`stories/${slug}/data/contract.json`), 'utf8'));
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
	// ★ `#1315`：改成「对**在场**故事逐 slug 核」（✗ 不写死名单）—— 两条约束：
	//   ① ✗ **不空跑**（至少一个在场）② **形状单一源**（各在场故事的键名集合两两相等）
	{
		const present = Object.keys(stateOf);
		ok('⑤ 反向核：**至少一个在场故事**（✗ 空跑也不可当通过）', present.length > 0, `在场 ${present.length}`);
		// ★ 空跑防御：**只有一个在场故事时**，「两两相等」是**平凡真** ✗
		//   （实测：只给一个故事时，改它的键集合本格**仍绿** ✗）⇒ 按仓内口径：**前提不成立就明说未判**（✗ 不算绿）
		if (present.length < 2) {
			console.log(`  ○ 未判：形状单一源（只有 ${present.length} 个在场故事 ⇒ 无从比对；两个以上时即参与判定）`);
		} else {
			const base = [...stateOf[present[0]]].sort().join(',');
			const diff = present.filter((x) => [...stateOf[x]].sort().join(',') !== base);
			ok('⑤ 反向核：**形状单一源**（各在场故事的键名集合两两相等 ✓）', diff.length === 0, diff.length ? `与 ${present[0]} 不同：${diff.join(',')}` : `共 ${present.length} 个故事一致`);
		}
	}
	ok('⑤ 反向核：玩法概念名表 ＝ 归属表 ＋ 世界观概念（同源）', PC_GAMEPLAY_CONCEPTS.length === Object.keys(PC_GAMEPLAY_HOME).length + PC_STORY_CONCEPTS.length);
}

// ④ `#1186`：**可见面**判据 —— 侧栏玩法区块（`meta`／`soc-meta`）必须落在"引用该模块状态或契约面"的守卫上下文里。
// `meta` 是 `#1227` 片二的族名（原 `fight-meta`）：同一类名同时用于 div 与 span，故为次要文字角色，不是容器。
// 口径来自读数：这两个区块的渲染守卫本来就是模块状态本身（战斗 `ev.fight`／`dragon`；交涉 `soc`），
// 所以本条不是新造机制，而是把"可见面天然由状态门控"钉住。窗口取 ±15 行（守卫常写在区块上方几行）。
const BLOCK_GUARDS = {
	'meta': { need: ['ev.fight', '_L.foe', 'Game.Combat', 'dragon', 'combatPool', 'combatAction'], pin: 5 },   // 只数**渲染站点**（样式表已跳过）
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
				// 精确到 class 属性里的**整词**：`meta` 不得命中 `soc-meta`（词界两侧都不许是 [\w-]）。
				if (!new RegExp('class="[^"]*(?<![\\w-])' + cls + '(?![\\w-])').test(l)) return;
				counts[cls] += 1;
				// CSS 选择器行不算**渲染站点**（`90-style.twee` 里是样式规则：`.meta{…}`）→ 不计入守卫要求。
				if (new RegExp(`^[\\s.#>]*[.#]${cls}\\b`).test(l)) return;
				const ctx = lines.slice(Math.max(0, i - 25), i + 3).join('\n');   // 窗口 ±25：守卫常写在区块上方若干行（如 `_L` 取自更上面的 `ev.fight.log`）
				if (!spec.need.some((n) => ctx.includes(n))) misses.push(`${f}:${i + 1}`);
			});
		}
	}
	ok('④ 侧栏玩法区块都落在模块状态／契约面的守卫上下文里', misses.length === 0, misses.join(' / '));
	// 反向核：出现次数钉死（防扫描抽空）；`soc-meta` 在主干上为 0 → 本格只钉 `meta`（原 `fight-meta`）
	const wrong = Object.entries(BLOCK_GUARDS).filter(([cls, spec]) => spec.pin > 0 && counts[cls] !== spec.pin);
	ok('④ 反向核：类名出现次数命中钉死值', wrong.length === 0, wrong.map(([c, s]) => `${c} 期望 ${s.pin} 实得 ${counts[c]}`).join(' / '));
	// 能假对：合成一个"无守卫上下文"的输入 → 判据层必须能点名
	const synth = ['<div class="meta">无守卫</div>'];
	const violated = synth.filter((l) => BLOCK_GUARDS['meta'].need.every((n) => !l.includes(n)));
	ok('④ 能假：合成长无守卫的区块 ⇒ 判据点名', violated.length === 1);
}

// `#1247`：路径读写器的**形态三类**。
// 口径：**读是查询**（缺项即无数据，按默认）；**写是命令**（没有目的地不等于缺数据）。
// 所以"缺项即静默"**只对读侧成立**：写侧的缺项与结构畸形**同归出声**。
// 三类：(1) 缺项（undefined／键不存在）(2) 结构畸形（非字符串／空串／空段 a..b）(3) 多源数组（读 OR／写出声）
{
	const { w: w2, close } = await boot({ story: DEFAULT_SLUG, random: 0.5 });
	const Sg = w2.Sg;
	const SC = w2.SugarCube ?? w2;
	const pc = (SC.State?.variables ?? w2.State?.variables)?.pc;
	const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };

	// 正向：先证"合法的真能过"（免得整段只有反例，成恒真式）
	const box = { ev: { a: true }, world: { b: false } };
	ok('门 · 正向：合法路径写，真写到', (() => { Sg.notes.writePath(box, 'ev.c', 7); return box.ev.c === 7; })());
	ok('门 · 正向：合法路径读，读到值', Sg.notes.readPath(box, 'ev.c') === 7);

	// (3) 多源数组：读取 OR（出处 `#432-B8/B12`）
	ok('门 · (3) 多源读，OR（任一真即真）', Sg.notes.readPath(box, ['ev.a', 'world.b']) === true);
	ok('门 · (3) 多源读，OR（全假即假；`some` 返回布尔）', Sg.notes.readPath(box, ['world.b', 'ev.z']) === false);

	// (1) 缺项：读侧**静默**
	ok('门 · (1) 读侧缺项（undefined），不抛且 undefined', threw(() => Sg.notes.readPath(pc, undefined)) === null
		&& Sg.notes.readPath(pc, undefined) === undefined);
	ok('门 · (1) 读侧键不存在，静默 undefined', Sg.notes.readPath(box, 'ev.__不存在__') === undefined);

	// (2) 结构畸形：读侧**出声**
	for (const badv of ['', 'ev.', '.x', 'a..b', 5]) {
		ok(`门 · (2) 畸形读（${JSON.stringify(badv)}），抛`, !!threw(() => Sg.notes.readPath(box, badv)));
	}

	// (1)(2) 写侧：缺项与畸形**同归出声**（与读侧的**不对称**，写死在格名里）
	ok('门 · (1) 写侧缺项（undefined），抛（没有目的地不等于缺数据）', !!threw(() => Sg.notes.writePath(box, undefined, 1)));
	for (const badv of ['', 'ev.', 'a..b', 5]) {
		ok(`门 · (2) 畸形写（${JSON.stringify(badv)}），抛`, !!threw(() => Sg.notes.writePath(box, badv, 1)));
	}

	// (3) 写侧数组：出声（歧义目的地；多源必须显式给 setPath，见 `#434`）
	ok('门 · (3) 写侧多源数组，抛', !!threw(() => Sg.notes.writePath(box, ['ev.a', 'ev.b'], 1)));

	// 反向格：修 (2) 的出声**不得**改坏 (1) 的读侧静默（两处各钉一次）
	ok('门 · 反向：读侧缺项仍静默（未被 (2) 出声波及）', threw(() => Sg.notes.readPath(box, undefined)) === null);
	ok('门 · 反向：读侧键缺失仍静默（同上）', Sg.notes.readPath(box, 'world.__缺失__') === undefined);

	// 面 2：`<<setflag>>` 空参**不落脏键**（走写侧出声，而非 `$pc.world[''] = true`）
	ok('门 · 面 2：空参不写脏键', (() => {
		const before = pc?.world ? Object.keys(pc.world).length : 0;
		try { new SC.Wikifier(null, '<<setflag>>'); } catch { /* 出声即可，键不落 */ }
		const after = pc?.world ? Object.keys(pc.world).length : 0;
		return !pc?.world?.hasOwnProperty?.('') && after === before;
	})());

	if (typeof close === 'function') close();
}

console.log(bad === 0 ? '\n✔ 角色状态基础面判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
