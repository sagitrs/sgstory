import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { absPath } from '../scripts/dist-paths.mjs';   // `#1267`
// `#660` 片三-3：`Game.Pc.defaults()` —— **形状住引擎、数值走故事**（`Sg.story.pcDefaults()`）
//
// 判据（每条对应一处失效方式）：
// ① **形状中性**：把故事面摘掉后，引擎给的**每个值都必须是中性的**（0/''/false/[]/{}/null）——
// 否则"故事 1 的数值"又硬编码回引擎（`star.charge = 12`／`keeper.state = 'post'` 就是原样）。
// ② **故事值生效**：真机（当前故事）—— **故事声明面给的每个叶子值都生效**，且**没把兄弟键抹掉**（深合并一层）。
//   ★ `#1353` 批 3：原格钉的是**旧故事**那套具体值（`star.charge=12`／`keeper.state='post'`）——
//     那两个概念随 `#1261` 删除 ⇒ 任何别的样本都会当场 TypeError（真因是"把某故事的数值当判据"）。
//     ⇒ 改成**自洽**：期望值**从故事自己的 `pcDefaults` 声明面读**，再断言它落在 `Game.Pc.defaults()` 里（✗ 不钉具体数字）。
// ③ **缺面降级**（必须的反例）：故事**未声明** `Sg.story.pcDefaults` → 仍返回**完整形状**、**不抛错**。
// ④ **结构畸形 → 报错**：面存在但返回非对象 → fail-loud（不许静默当空）。
// ⑤ **兜底住引擎**：`migrate()` 给旧档补键时**带上故事数值**（旧档读进来不能缺声明面的任一项）。
// ⑥ **形状单一源**：**仓内各故事**的键集合**完全一致**（故事只能给数值，不能改形状）（`#1004` B2b：名单走 `storySlugs()`）。
import { boot } from './boot.mjs';
import { DEFAULT_SLUG, storySlugs } from '../scripts/dist-paths.mjs';   // `#1004` B2b：默认故事与名单都走单一权威
import { PC_BASE_KEYS, PC_STORY_CONCEPTS, PC_GAMEPLAY_HOME, PC_GROUP_SIGNALS } from '../editor/lib/core/pc-state-map.mjs';   // `#1186`：声明面单一真相
let failures = 0;
const eq = (actual, expected, msg) => {
	const okk = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${okk ? '✓' : '✗'} ${msg}${okk ? '' : `（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`}`);
	if (!okk) failures++;
};
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

/** 中性值判定：0 / '' / false / [] / {} / null 才算"引擎形状该有的值"。 */
const isNeutral = (v) => v === null || v === 0 || v === '' || v === false
	|| (Array.isArray(v) && v.length === 0)
	|| (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(isNeutral));

// `#1004` B2b：旧故事已删 → 换到**默认故事**。
// ★ `#1353` 批 3：原来这里假定"面夹具的 `pcDefaults()` 与旧故事同形同值（`star.charge=12`／`keeper.state='post'`）" ——
//   那两个概念已随 `#1261` 删除，夹具也没有它们 ⇒ ②⑤ 两格改成**从夹具自己的声明面读期望**（自洽，✗ 不钉旧故事的值）。
// ★ `#1353` 批 3（零故事守卫）：本件原先直接 `boot({ story: DEFAULT_SLUG })` ——
//   零故事态 `DEFAULT_SLUG === null` ⇒ `boot()` 裸抛（与 `#1295` 口径不符）。
//   照同批门（`test/chargen-apply.mjs`／`test/audit-gates-run.mjs`）的形：**前提不成立 ⇒ 点名未判 ＋ 不计红**。
if (!DEFAULT_SLUG) {
	console.log('  ○ 未判：生效根下没有故事（零故事态）⇒ 本件整件未判（对象在：`Game.Pc.defaults()`；前提不成立：没有默认故事可启）；机制面仍有着护。');
	process.exit(0);
}
const { w } = await boot({ story: DEFAULT_SLUG, random: 0.5 });
const keysOf = (o) => Object.keys(o).sort().join(',');
// ② 真机（故事 1）：故事数值生效 ＋ 深合并不抹兄弟键
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const real = w.eval('Game.Pc.defaults()');
// `#1353` 批 3：期望改从**故事自己的声明面**来（样本无关）。
// ★ `#1484`（五步①·定名后）：车卡族静态初值**就写在 `pcShape` 里**（复用"形状与初值一处给"）
//   ⇒ ★门测的是"**故事声明 ⇒ 效果**" ⇒ ★数值声明面 ＝ `pcDefaults`（自定义键）＋ `pcShape`（含车卡族初值）✓
// ★ `#1484`：`storyDefaults`＝**故事自定义键**（`pcDefaults`，判据 ③ 用）；
//   `storyNumeric`＝数值声明面的**全部**（自定义键 ＋ `pcShape` 里的车卡族初值）✓
const storyDefaults = w.eval('(Sg.story.pcDefaults ? Sg.story.pcDefaults() : null)') ?? {};
const storyNumeric = { ...storyDefaults, ...(w.eval('(Sg.story.pcShape ? Sg.story.pcShape() : null)') ?? {}) };
const flatPairs = (o, prefix = '') => Object.entries(o ?? {}).flatMap(([k, v]) =>
	(v && typeof v === 'object' && !Array.isArray(v)) ? flatPairs(v, prefix + k + '.') : [[prefix + k, v]]);
const flatOf = (o) => Object.fromEntries(flatPairs(o));
const declaredFlat = flatOf(storyNumeric);
const actualFlat = flatOf(real);
const missingVal = Object.entries(declaredFlat).filter(([k, v]) => JSON.stringify(actualFlat[k]) !== JSON.stringify(v));
ok(missingVal.length === 0, `② 真机：故事声明的**每个叶子值**都生效（${Object.keys(declaredFlat).length} 项）`,
	missingVal.map(([k, v]) => `${k} 期望 ${JSON.stringify(v)} 实得 ${JSON.stringify(actualFlat[k])}`).join(' / '));
// 深合并一层：**只在"形状侧已给同名对象"时才有可测面**（那时深合并与整块替换不同）。
//   ★实测：本夹具 `hasChargen=false` ⇒ 形状侧不预置 `abilities` ⇒ 两法无差别 ⇒ 该格应**明说未判**（✗ 不当纯过）。
const shapeOnly = w.eval('(() => { const f = Sg.story.pcDefaults; delete Sg.story.pcDefaults; try { return Game.Pc.defaults(); } finally { Sg.story.pcDefaults = f; } })()');
const objKeys = Object.entries(storyNumeric).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k]) => k);
const overlap = objKeys.filter((k) => shapeOnly[k] && typeof shapeOnly[k] === 'object');
if (overlap.length) {
	const notMerged = overlap.filter((k) => Object.keys(storyNumeric[k]).some((kk) => !Object.keys(real[k] ?? {}).includes(kk)));
	ok(notMerged.length === 0, `② 深合并一层：与形状重叠的声明对象，子键全部到位（${overlap.join('、')}）`);
} else {
	console.log(`  ○ 未判：声明的对象键（${objKeys.join('、') || '无'}）与形状侧已给的对象**无重叠** ⇒ 「深合并 vs 整块替换」今日无差别（✗ 不当纯过）。`);
}
for (const [k, v] of Object.entries(real)) {
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		// ★ `#1484`：子键期望要取**两个口的并**（车卡族键的声明住 `pcChargen` ⇒ 只用 pcDefaults 会把它们误判成未声明 ✗）
		const expSub = storyNumeric[k] ?? {};
		const extras = Object.keys(v).filter((kk) => !(kk in expSub));
		ok(extras.every((kk) => isNeutral(v[kk])), `② 深合并：「${k}」里故事未声明的子键均为中性值（${extras.join('、') || '无'}）`);
	}
}

// ① + ③ 摘掉故事面 → 形状中性 ＋ 不抛错（缺面＝显式降级）
// `#1186`：概念改由故事声明（契约面 `pcShape`）→ "摘故事面"要**两处都摘**（数值面 `pcDefaults` ＋ 形状面 `pcShape`）。
// ★ `#1484`：摘面＝**两处**（数值面 `pcDefaults` ＋ 形状面 `pcShape`）—— ★车卡族静态初值**就在 pcShape 里** ✓
const bare = w.eval('(() => { const f = Sg.story.pcDefaults, g = Sg.story.pcShape; delete Sg.story.pcDefaults; delete Sg.story.pcShape; try { return Game.Pc.defaults(); } finally { Sg.story.pcDefaults = f; Sg.story.pcShape = g; } })()');
ok(isNeutral(bare), '① 摘掉两处故事面后：引擎给的**每个值都中性**（故事 1 的数值没有硬编码回引擎）');
// `#1186`：世界观概念由故事声明 → 两处都摘后这些键**不存在**（不再有"引擎预置的中性值"可断言）。
// `#1353` 批 3：概念键由**本故事**声明 ⇒ 断言它的键集合里没有声明面的任何顶层键（✗ 不钉具体概念名）。
ok(Object.keys(storyDefaults).every((k) => !(k in bare)), '③ 缺面 ⇒ 概念键不存在（概念随故事声明；引擎不预置）');
ok(Object.keys(storyDefaults).every((k) => !keysOf(bare).includes(k)), '③ 缺面 ⇒ 键集合里也没有这些概念键');

// ── ★ `#1484`（五步①·裁定甲**＋定名**）：车卡族静态初值**复用 `pcShape`** ──────────────
// 三条判据（★照票面）：① 不跑车卡也能给终值 ② 与**车卡流程**并存 ⇒ fail-loud（单产生路径）③ 自定义键仍走 `pcDefaults`
{
	// ① 不跑车卡也能给终值（本夹具 `hasChargen:true` 但**不跑流程** ⇒ 值只能来自本口）
	const d = w.eval('Game.Pc.defaults()');
	// ★定名后：车卡族静态初值就写在 `pcShape` 里（✗ 无独立口）
	const shapeVals = w.eval('(Sg.story.pcShape ? Sg.story.pcShape() : null)') ?? {};
	const got = (shapeVals.hp !== undefined) && d.hp === shapeVals.hp && d.max_hp === shapeVals.max_hp;
	ok(got, `★① 静态初值口生效（✗ 不跑车卡也有终值）：hp=${d.hp}／max_hp=${d.max_hp}`);
	// ② ★**二选一**：与车卡流程并存 ⇒ fail-loud 点名
	const dup = w.eval(`(() => { const h = Sg.story.pcShape; Sg.story.chargen = () => ({ rounds: [], presets: [] });
		try { return (Game.Pc.defaults(), '没报错'); } catch (e) { return 'ERR:' + e.message; } finally { delete Sg.story.chargen; } })()`);
	ok(/二选一|并存|两条产生路径/.test(String(dup)), '★② 与车卡流程并存 ⇒ **fail-loud**（单产生路径纪律）', String(dup).slice(0, 90));
	// ③ ★定名后语义变了：`pcShape` **允许**给基础/车卡族键的初值（也允许自定义键）⇒ ✗ 不再"非车卡族即报"
	//    ⇒ 改断言**分工**：`pcShape` 给的键**一律生效**（✗ 被吞）；★而 `pcDefaults` 给**引擎已知键** ⇒ 仍 fail-loud（收束 ✓）
	const shapeOk = w.eval(`(() => { const h = Sg.story.pcShape; Sg.story.pcShape = () => ({ 心情: 3 });
		try { const r = Game.Pc.defaults(); return r['心情'] === 3 ? 'OK' : '未生效:' + JSON.stringify(r['心情']); }
		finally { Sg.story.pcShape = h; } })()`);
	ok(String(shapeOk) === 'OK', '★③ `pcShape` 给自定义键 ⇒ **生效**（✗ 不被吞 —— 与 `pcDefaults` 的分工不同）', String(shapeOk).slice(0, 80));
}

// ④ 面返回非对象 → 报错
const msgs = [];
for (const bad of ['() => 42', '() => []', "() => 'x'"]) {
	const got = w.eval(`(() => { const f = Sg.story.pcDefaults; Sg.story.pcDefaults = ${bad}; try { Game.Pc.defaults(); return '没报错'; } catch (e) { return e.message; } finally { Sg.story.pcDefaults = f; } })()`);
	if (/必须返回对象/.test(String(got))) msgs.push(bad);
}
eq(msgs.length, 3, '④ 结构畸形（`42` / `[]` / 字符串）⇒ 三条都 fail-loud（报"必须返回对象"）');

// ⑤ migrate 兜底：旧档补键要带上故事数值
const mig = w.eval('Game.Pc.migrate({ hp: 3 })');
// `#1353` 批 3：同一条自洽律 —— 声明面有的叶子，`migrate()` 补键后必须都在。
//   ★注意：`migrate({ hp: 3 })` 是**给旧档补键**（✗ 不是覆盖）⇒ 旧档已有的键（`hp`）**保留旧值**是**对的**
//     ⇒ 只断言"声明面里**旧档没有**的那些叶子都补上了"（✗ 不拿总表逐项对 ⇒ 那会把"保留旧值"误判为缺）。
{
	const migFlat = flatOf(mig);
	const lost = Object.entries(declaredFlat).filter(([kk, vv]) => !(kk in migFlat));
	ok(lost.length === 0, `⑤ migrate() 给旧档补键：声明面里旧档缺的叶子都被补上（补了 ${Object.keys(declaredFlat).length - lost.length} / ${Object.keys(declaredFlat).length} 项）`);
	ok(mig.hp === 3, '⑤ 旧档已有的键保留旧值（`migrate` 是补键，✗ 不覆盖）');
}

// ⑥ `#1186`（新口径见票面评论）：每个故事的键集合 ＝ **基础面** ＋ **在场模块的状态组**。
// 期望值从**声明面数据**算（故事契约 JSON ＋ 归属表 import），与测试宿主无关——这正是既有件第 32 行的取法
// 范例的延伸（实际值仍用 `w.eval('Game.Pc.defaults()')`）。
// 基础面只取 `PC_BASE_KEYS`；世界观概念**不再恒在**——故事用契约面 `pcShape` 声明时才有（见下方 expectedFor）。
const BASE = [...PC_BASE_KEYS].sort();
// `#1267` 尾件①：经 `absPath`（仓内恒等）。
const contractOf = (slug) => JSON.parse(readFileSync(absPath(`stories/${slug}/data/contract.json`), 'utf8'));
const facePresent = (members, face, kind) => {
	const m = members.find((x) => x.name === face);
	if (!m) return false;
	// 函数面要求"调用后为真"→ 数据侧能表达的是它的值（本仓写成 kind:'const' ＋ value:false/true）
	if (kind === 'fn') return m.kind === 'const' ? m.value === true : true;
	if (m.kind === 'const') return m.value != null;
	return true;   // 声明了非 const 形态（game-ref／lookup 等）→ 视为在场
};
const expectedFor = (slug) => {
	const members = contractOf(slug).members ?? [];
	const out = new Set(BASE);
	// 故事自有形状（契约面 `pcShape`）：声明的键进期望，取数走声明面（与宿主无关）
	for (const k of Object.keys(members.find((m) => m.name === 'pcShape')?.value ?? {})) out.add(k);
	// ★ `#1353` 批 3（期望模型口径修正）：`pcDefaults` 的**顶层键也是键来源**。
	//   权威＝引擎 `Game.Pc.defaults()` 自己的实现（`src/10-core.twee` 的“故事数值叠加”段）：
	//   它把 `pcDefaults()` 的每个顶层键写成 `shape[k]`（两边都是对象时只**一层深合并**）⇒ 那些键**必然在场**。
	//   ✗ 旧模型只看“能力组的 HOME 键”：`abilities`/`hp`/`max_hp`/`salves` 归 `chargen` 组，而该组的信号是
	//   `hasChargen()`；夹具/故事可以**用 `pcDefaults` 直接给这几个值而不开 `hasChargen`** ⇒ 旧模型就会把它们错当“多出来的键”✗。
	for (const k of Object.keys(members.find((m) => m.name === 'pcDefaults')?.value ?? {})) out.add(k);
	for (const [group, sig] of Object.entries(PC_GROUP_SIGNALS)) {
		if (!sig.faces.some((f) => facePresent(members, f, sig.kind))) continue;
		// ★ `#1353` 批 3（期望模型口径修正·第二处）：`combat` 组的**伴生体键**不再从静态归属表推。
		//   口径来源：`#1227` 类一后“战斗组贡献什么键”由故事的 `foeStateShape()`（同 `pcShape` 一路）给，
		//   引擎实现是 `Object.assign(shape, Game.Combat.foeShape() ?? {})`；实测夹具 `foeShape()` 返 `{}` ⇒ **一个键也不进**。
		//   ⇒ 静态表里那个旧键（`dragon`）已不代表现在的行为 ⇒ 本件**不对该组作静态断言**，
		//     而改由**逐故事的真读数**看护（下面那条“本故事的键名集合”对每个在场故事实跑）。
		if (group === 'combat') continue;
		for (const [k, home] of Object.entries(PC_GAMEPLAY_HOME)) if (home === group) out.add(k);
	}
	return [...out].sort().join(' ');
};
const mismatches = [];
for (const story of [DEFAULT_SLUG, ...storySlugs().filter((x) => x !== DEFAULT_SLUG)]) {
	const { w: wi } = await boot({ story, random: 0.5 });
	const got = Object.keys(wi.eval('Game.Pc.defaults()')).sort().join(' ');
	const exp = expectedFor(story);
	if (got !== exp) mismatches.push(`${story}（实得 ${got.split(' ').length} 键／期望 ${exp.split(' ').length} 键）`);
}
ok(mismatches.length === 0, `⑥ 各故事键集合 ＝ 基础面 ＋ 在场模块的组：${mismatches.join(' / ')}`);

console.log(failures ? `\n${failures} 项失败` : '\npc 默认形状（形状住引擎 · 数值走故事）全部通过');
process.exit(failures ? 1 : 0);
