// 门的**发现与归属**（`#607` 方案 2 · P0）：门住哪、谁拥有它、按什么顺序跑——**一处权威**。
//
// 背景：`#602` 方案 1 已把**判据数据**按故事落了（`stories/<slug>/audit.json`）。本文件管**门代码**的归属。
// 今天 34 道门全部登记在 `scripts/audit/registry.mjs` 的 `GATES` 里，其中 12 道判的是**故事 1 的内容**——
// 而"这道门属于哪个故事"此前只存在于 `test-plan.mjs` 的 `AUDIT_STORY` 字符串数组里（它只说"是故事门"，
// **说不出"是谁的门"**）⇒ `--story hollow-cave --truth` 会**照跑故事 1 的门**：拿别人的判据判你
// （`#602` 那类"空判/假红"在**门侧**的同一成因）。设计见 `docs/story-gates-design.md`。
//
// 本片（P0）**不搬任何门**，只把机制与校验立起来（**零行为变化**是硬要求：`audit:golden` 零漂移为机械证据）：
//   · **落点**：故事门住 `stories/<slug>/gates/*.mjs`（P1 起逐门搬入）；
//   · **声明**：`stories/<slug>/00-story.json` 的 `gates: [...]`（**路径**；顺序即本故事内执行顺序）；
//   · **发现**：引擎门（registry 里 flag ∈ `AUDIT_ENGINE`）∪ **待迁移**（registry 里其余的门——历史包袱，
//     搬完一批删一批）∪ **本故事已声明的门**；
//   · **执行顺序**：`GATE_ORDER`（表见下）——保证"搬家"只改**住址**、不改**输出次序** ⇒ golden 零漂移可比对；
//   · **fail-loud**：清单缺键／路径不存在／越界／文件存在但未声明／形状不对／跨故事重名／故事门偷用引擎 flag
//     ⇒ 逐条报错（空数组是**合法**声明：与 `#602` 的空词表同纪律）。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, storySlugs, readStory } from '../dist-paths.mjs';
import { GATES } from './registry.mjs';
import { AUDIT_ENGINE } from '../test-plan.mjs';

/** 门的稳定标识：**声明的 flags 排序后接起来**（多 flag 别名门如 `--sel` 也唯一）。
 *  它是"跨层/跨故事不许重名"的判据载体，也是 `GATE_ORDER` 的键。 */
export const gateKey = (mod) => [...new Set(mod.flags ?? [])].sort().join('+');

/** **执行顺序表**（计划面：只定**次序**，不含任何判据与数据）。
 *  为什么需要它：搬运会改门的住址，若次序跟着住址走，`--truth` 的输出块就会挪位置 ⇒ golden 漂移，
 *  而"零漂移"正是"搬家不改行为"的**机械证据**。⇒ 次序由本表钉住（与 `test-plan.mjs` 的 `SEGMENTS` 同性质）。
 *  纪律：新增门**必须**在此登记位置（否则 fail-loud）；本表里的键不许"僵尸"（门删了要删键）。
 *  ⚠️ `#1004` B2 实测 ✗：删掉两个旧故事后，本表里 **24 个键成了僵尸** ✓（它们的门住在
 *    `stories/<slug>/gates/**` ⇒ 随故事一起没了 ✓）—— 而本表是**最后一个**还在"枚举"这些 flag 的地方 ✓
 *    ⇒ 于是 `audit.mjs` 的**全跑**仍会为它们产块 ⇒ `golden` 的清单红 ✓（且那些块实际是 **ENOENT 崩栈** ✓）。
 *    ⇒ 已按本表自己的纪律删键 ✓，**保留的 11 个＝现存门 flag** ✓（`scripts/audit/gates/*.mjs` ∪ 剩下故事的 `gates/` ✓）。
 *    ⚠️ 判据（可复核 ✓）：`node -e "import('./scripts/audit/discovery.mjs').then(m=>console.log(m.GATE_ORDER))"` ✓
 *    ⇒ 每个键都必须在现存门模块的 `flag`／`flags` 里找得到 ✓。 */
export const GATE_ORDER = [
	'a11y', 'consequences', 'sitedisc', 'text',
	'state', 'literals', 'slots', 'status', 'waves', 'roads', 'engine-story-free',
];

/** 引擎门：flag ∈ `AUDIT_ENGINE`（`test-plan.mjs` 是层表的单一权威）。 */
export const engineGates = () => GATES.filter((m) => (m.flags ?? []).some((f) => AUDIT_ENGINE.includes(f)));

/** **待迁移**的故事门：登记在 registry 里、却不在引擎层——这些是 `#602` 之前的历史包袱，
 *  P1 起逐门搬进 `stories/<slug>/gates/`（搬走一批，这里少一批）。 */
export const pendingGates = () => GATES.filter((m) => !(m.flags ?? []).some((f) => AUDIT_ENGINE.includes(f)));

// ── 纯函数（可自证；IO 在外层）────────────────────────────────────────

/** 校验清单的 `gates` 声明。`existingFiles` = 该故事 `gates/` 目录下**实际存在**的 `.mjs`（相对仓库根）。
 *  空数组 ⇒ 0 条（合法）。 */
export const judgeManifestGates = ({ slug, manifest, existingFiles = [], exists = () => true }) => {
	const out = [];
	const dir = `stories/${slug}/gates/`;
	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return [`故事「${slug}」的清单不是对象`];
	if (!Array.isArray(manifest.gates)) return [`故事「${slug}」的 \`00-story.json\` 缺 \`gates\` 键——故事的**门归属**必须显式声明（没有门也要写 \`[]\`；#607）`];
	const seen = new Set();
	for (const p of manifest.gates) {
		if (typeof p !== 'string' || !p.startsWith(dir) || !p.endsWith('.mjs')) {
			out.push(`故事「${slug}」的 \`gates\` 条目「${String(p)}」越界或形状不对（必须是本故事目录下的 \`.mjs\` 路径：\`${dir}<名字>.mjs\`）`);
			continue;
		}
		if (seen.has(p)) out.push(`故事「${slug}」的 \`gates\` 重复声明：${p}`);
		seen.add(p);
		if (!exists(p)) out.push(`故事「${slug}」声明的门文件不存在：${p}`);
	}
	for (const f of existingFiles) if (!seen.has(f)) out.push(`故事「${slug}」的 \`gates/\` 下有**未被声明**的门文件：${f}——放了门却没人跑（请写进清单，或删掉）`);
	return out;
};

/** 校验一组门的**集合面**：顺序表登记、**key 唯一**（跨层/跨故事不许重名）、故事门不许声明引擎 flag。 */
export const judgeGateSet = ({ gates = [], order = GATE_ORDER, engineFlags = AUDIT_ENGINE, nameOf = (m) => m?.file ?? '?' }) => {
	const out = [];
	const byKey = new Map();
	for (const m of gates) {
		const k = gateKey(m);
		if (!order.includes(k)) out.push(`门「${nameOf(m)}」（key \`${k}\`）未在 \`GATE_ORDER\` 里登记执行顺序——新增门请登记位置`);
		if (byKey.has(k)) out.push(`门的 key 冲突「${k}」：${nameOf(byKey.get(k))} 与 ${nameOf(m)}——同一 flag 集合不许被两处声明（跨层/跨故事都不行）`);
		else byKey.set(k, m);
	}
	for (const m of gates) {
		if (nameOf(m).startsWith('stories/') && (m.flags ?? []).some((f) => engineFlags.includes(f))) {
			out.push(`故事门「${nameOf(m)}」声明了**引擎层**的 flag（${m.flags.filter((f) => engineFlags.includes(f)).join('、')}）——故事门不许占用引擎门名`);
		}
	}
	return out;
};

/** 校验 `GATE_ORDER` 与真实门的**全集**一致（两个方向都要：未登记 ⇒ 红；僵尸键 ⇒ 红）。 */
export const judgeOrderCoverage = ({ order = GATE_ORDER, keys = [] } = {}) => {
	const out = [];
	for (const k of keys) if (!order.includes(k)) out.push(`门 key \`${k}\` 未登记进 \`GATE_ORDER\``);
	for (const k of order) if (!keys.includes(k)) out.push(`\`GATE_ORDER\` 里的 \`${k}\` 已无对应门（僵尸顺序）——门搬走/删了请同步删键`);
	return out;
};

// ── IO 层 ────────────────────────────────────────────────────────────

const gatesDirOf = (slug, root = ROOT) => join(root, 'stories', slug, 'gates');
const existingGateFiles = (slug, root = ROOT) => {
	const dir = gatesDirOf(slug, root);
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => `stories/${slug}/gates/${f}`).sort();
};

/** 读清单 + 校验 + **动态载入**（有问题即抛，不静默）。 */
export const declaredGates = async (slug, { root = ROOT } = {}) => {
	const manifest = readStory(slug);
	const files = existingGateFiles(slug, root);
	const problems = judgeManifestGates({ slug, manifest, existingFiles: files, exists: (p) => existsSync(join(root, p)) });
	if (problems.length) throw new Error(problems.join('；'));
	const mods = [];
	for (const p of manifest.gates) {
		const mod = await import(pathToFileURL(join(root, p)).href);
		if (!Array.isArray(mod.flags) || !mod.flags.length || typeof mod.run !== 'function') {
			throw new Error(`故事门「${p}」形状不对：必须导出非空 \`flags\` 数组与 \`run(ctx)\`（#607）`);
		}
		mods.push({ ...mod, file: p });
	}
	return mods;
};

/** 全部已声明的故事门（跨故事；用于 flag 唯一性与层覆盖判定）。 */
export const declaredGatesAll = async ({ root = ROOT } = {}) => {
	const out = [];
	for (const slug of storySlugs()) for (const m of await declaredGates(slug, { root })) out.push({ ...m, owner: slug });
	return out;
};

/** 当前作用域的门：**引擎门 ∪ 待迁移 ∪ 本故事已声明**，按 `GATE_ORDER` 排（P0 阶段与今天的 `GATES` 逐字同序）。 */
export const gatesForStory = async (slug, { root = ROOT } = {}) => {
	const declared = await declaredGates(slug, { root });
	const all = [...engineGates(), ...pendingGates(), ...declared.map((m) => ({ ...m, owner: slug }))];
	const problems = judgeGateSet({ gates: all, nameOf: (m) => m.file ?? `(待迁移) ${gateKey(m)}` });
	if (problems.length) throw new Error(problems.join('；'));
	return [...all].sort((a, b) => GATE_ORDER.indexOf(gateKey(a)) - GATE_ORDER.indexOf(gateKey(b)));
};

/** 纯函数：点名了**别的故事**的门 ⇒ 问题（设计稿 §3.3 的反沉默守卫）。
 *  `declared` ＝ 全部**已声明**的门 `[{ owner, file, flags }]`（未迁移的门不在其中 ⇒ 仍按今天"谁都能跑"的口径）。 */
export const judgeFlagOwnership = ({ flags = [], slug, declared = [] }) => {
	const out = [];
	const mine = new Set(declared.filter((m) => m.owner === slug).flatMap((m) => m.flags ?? []));
	for (const m of declared) {
		if (m.owner === slug) continue;
		for (const f of new Set(flags)) if ((m.flags ?? []).includes(f) && !mine.has(f)) {
			out.push(`门 --${f} 属于故事「${m.owner}」（${m.file}）——请改用 --story ${m.owner}（当前 --story ${slug}）`);
		}
	}
	return [...new Set(out)];
};

/** IO：收集已声明的门 → 判定（见 `judgeFlagOwnership`）。 */
export const checkFlagOwnership = async ({ flags = [], slug, root = ROOT } = {}) =>
	judgeFlagOwnership({ flags, slug, declared: await declaredGatesAll({ root }) });

/** 全部**已知**的开关名（CLI 的"未知开关"判定用）：引擎门 ∪ 待迁移 ∪ 所有故事的声明。 */
export const allKnownFlags = async ({ root = ROOT } = {}) => {
	const flags = new Set([...engineGates(), ...pendingGates()].flatMap((m) => m.flags ?? []));
	for (const m of await declaredGatesAll({ root })) for (const f of m.flags ?? []) flags.add(f);
	return flags;
};

/** 全仓自检（每次 audit 调用都跑一次；有问题 ⇒ 调用方响亮退出）：三份清单 + 顺序表覆盖。 */
export const validateDiscovery = async ({ root = ROOT } = {}) => {
	const problems = [];
	const keys = [...engineGates(), ...pendingGates()].map(gateKey);
	for (const slug of storySlugs()) {
		const files = existingGateFiles(slug, root);
		problems.push(...judgeManifestGates({ slug, manifest: readStory(slug), existingFiles: files, exists: (p) => existsSync(join(root, p)) }));
		try { for (const m of await declaredGates(slug, { root })) keys.push(gateKey(m)); }
		catch (e) { problems.push(String(e.message ?? e)); }
	}
	problems.push(...judgeOrderCoverage({ keys: [...new Set(keys)] }));
	// 跨故事/跨层**重名**：把全部已声明的门放到一起判（`gatesForStory` 只看当前故事 ⇒ 这里补全集面）
	try {
		const all = [...engineGates(), ...pendingGates(), ...(await declaredGatesAll({ root }))];
		problems.push(...judgeGateSet({ gates: all, nameOf: (m) => m.file ?? `(registry) ${gateKey(m)}` }));
	} catch (e) { problems.push(String(e.message ?? e)); }
	return [...new Set(problems)];
};
