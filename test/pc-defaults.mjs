import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { absPath } from '../scripts/dist-paths.mjs';   // `#1267`
// `#660` 片三-3：`Game.Pc.defaults()` —— **形状住引擎、数值走故事**（`Sg.story.pcDefaults()`）
//
// 判据（每条对应一处失效方式）：
// ① **形状中性**：把故事面摘掉后，引擎给的**每个值都必须是中性的**（0/''/false/[]/{}/null）——
// 否则"故事 1 的数值"又硬编码回引擎（`star.charge = 12`／`keeper.state = 'post'` 就是原样）。
// ② **故事值生效**：真机（故事 1）`star.charge === 12` · `keeper.state === 'post'`，且**没把兄弟键抹掉**（深合并一层）。
// ③ **缺面降级**（必须的反例）：故事**未声明** `Sg.story.pcDefaults` → 仍返回**完整形状**、**不抛错**。
// ④ **结构畸形 → 报错**：面存在但返回非对象 → fail-loud（不许静默当空）。
// ⑤ **兜底住引擎**：`migrate()` 给旧档补键时**带上故事数值**（旧档读进来不能缺 `star.charge`）。
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

// `#1004` B2b：旧故事已删 → 换到**默认故事**（面夹具 `face-fixture` —— 它的 `pcDefaults()` 与旧故事**同形同值**：
// `star.charge=12`／`keeper.state='post'` → 本件 ②⑤ 两格的期望值**不用改**，这正是夹具"接住老消费者"的意思）。
const { w } = await boot({ story: DEFAULT_SLUG, random: 0.5 });
const keysOf = (o) => Object.keys(o).sort().join(',');

// ② 真机（故事 1）：故事数值生效 ＋ 深合并不抹兄弟键
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const real = w.eval('Game.Pc.defaults()');
eq(real.star.charge, 12, '② 真机：`star.charge === 12`（故事面给的数值）');
eq(real.keeper.state, 'post', '② 真机：`keeper.state === "post"`（故事面给的数值）');
eq([real.star.spent, real.star.first_free], [0, false], '② 深合并一层：`star` 的其余子键仍在（没被整块替换）');
eq(real.soc.att, {}, '② 深合并一层：`soc` 的空子表仍是空表');

// ① + ③ 摘掉故事面 → 形状中性 ＋ 不抛错（缺面＝显式降级）
// `#1186`：概念改由故事声明（契约面 `pcShape`）→ "摘故事面"要**两处都摘**（数值面 `pcDefaults` ＋ 形状面 `pcShape`）。
const bare = w.eval('(() => { const f = Sg.story.pcDefaults, g = Sg.story.pcShape; delete Sg.story.pcDefaults; delete Sg.story.pcShape; try { return Game.Pc.defaults(); } finally { Sg.story.pcDefaults = f; Sg.story.pcShape = g; } })()');
ok(isNeutral(bare), '① 摘掉两处故事面后：引擎给的**每个值都中性**（故事 1 的数值没有硬编码回引擎）');
// `#1186`：世界观概念由故事声明 → 两处都摘后这些键**不存在**（不再有"引擎预置的中性值"可断言）。
ok(!('star' in bare) && !('keeper' in bare), '③ 缺面 ⇒ 概念键不存在（概念随故事声明；引擎不预置）', JSON.stringify({ star: bare.star, keeper: bare.keeper }));
ok(!keysOf(bare).includes('star') && !keysOf(bare).includes('keeper'), '③ 缺面 ⇒ 键集合里也没有这两个键');

// ④ 面返回非对象 → 报错
const msgs = [];
for (const bad of ['() => 42', '() => []', "() => 'x'"]) {
	const got = w.eval(`(() => { const f = Sg.story.pcDefaults; Sg.story.pcDefaults = ${bad}; try { Game.Pc.defaults(); return '没报错'; } catch (e) { return e.message; } finally { Sg.story.pcDefaults = f; } })()`);
	if (/必须返回对象/.test(String(got))) msgs.push(bad);
}
eq(msgs.length, 3, '④ 结构畸形（`42` / `[]` / 字符串）⇒ 三条都 fail-loud（报"必须返回对象"）');

// ⑤ migrate 兜底：旧档补键要带上故事数值
const mig = w.eval('Game.Pc.migrate({ hp: 3 })');
eq([mig.hp, mig.star.charge, mig.keeper.state], [3, 12, 'post'], '⑤ `migrate()` 给旧档补键时带上故事数值（旧档不缺 `star.charge`）');

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
	for (const [group, sig] of Object.entries(PC_GROUP_SIGNALS)) {
		if (!sig.faces.some((f) => facePresent(members, f, sig.kind))) continue;
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
