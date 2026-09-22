// D9①「前提可溯源」门（#407 探索票 / #404 实例）：选项的前提词必须**在玩家可见文本里出现过**。
//
// 为什么：机制门（依据旗标）只回答"玩家够不够格问"，不回答"问题里那个概念他有没有可能知道"。
// #404 实锤：「问她：那一夜该烧的是什么？」——「烧」在玩家可见文本里**只出现在这个选项自己身上**，
// 于是选项替玩家问了一个他不可能知道的问题（canon 的意图是让他**拼**出那笔账，不是被选项告知）。
//
// 判据：对每条**声明了 `premise`** 的条目，找到**授予它依据键**的段落，断言 premise 词至少出现在其中一个段落里
// —— 即"你能问出这句，是因为你在某处读到过这个概念"。
//
// 数据源（`#435` 阶段 4 后为**两源并存**，都判；表行接管后删 `crossEraGates` 那行属阶段 5）：
// ① `Game.Investment.eraDomain.crossEraGates`（既有）：依据键＝`pastFlags` ∪ `presentFlags`；
// ② **条件表**（`Sg.story.rules()`）：依据键＝`req` ∪ `any`（＝旧 `pastFlags`/`presentFlags` 的角色）。
// **"谁授予了这个键"由表自己回答**：某行的 `yields` 含该键（note id 先展开成 `flagPath`）→
// 该行的 `scope`（`段落#位点` 取 `#` 前的段落名）就是授予段落，其 `text` 就是玩家可见文本。
// —— 票面口径「数据来源＝表的 `yields`＋`premise`」落在这一条上。
//注意：为什么**不是**用「该行自己的 `yields`」当依据：`yields` 是 A 方案下**本行授予**的键
//（`<<rules>>` 渲染成功后落 `Sg.notes.add`）——拿"结果"当"前提"会让老巫女那行用自己的产出
//（`n_witch_fire_hint`）当依据 → 假红。与旧口径一一对应的是 `req`/`any`。
// 源码写点（`$pc.ev.k to/=`、`Sg.notes.add('n_k')`，走 `shared.mjs` 单一权威）仍是两条源的**兜底**：
// 段落尚未搬进表时，依据照样可溯源。
//
// 已知缺陷姿态（本仓约定）：`PREMISE_KNOWN` 里的条目**报告但不判失败**（main 不被卡住）；
// 修完删掉条目即自动转严格。要**红证**时跑 `--strict`（把已知缺陷也当失败）。
//
// 自证：`node test/premise-source.mjs --selftest`

import { createContext } from '../scripts/audit/context.mjs';
import { notePaths, noteWriteRefs, condKeysOf } from '../scripts/audit/lib/shared.mjs';

export const PREMISE_KNOWN = {};   // #404 已修（问法改建立于「缺的从来不是咒」）——白名单已清空，本门转严格

const asList = (x) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
const norm = (k) => String(k).replace(/^(ev|world)\./, '');

/** 条目 → **依据键**（两种数据源共用；缺省空数组）。 */
export const evidenceKeys = (entry) => [
	...asList(entry?.keys), ...asList(entry?.pastFlags), ...asList(entry?.presentFlags),
	// `#491` 另票：对象算子形条件（`{ gte: ['star.spent', 3]}`）的**键**同样是依据
	...[...asList(entry?.req), ...asList(entry?.any)].flatMap(condKeysOf),
];

/** 纯函数（自证与真实运行同一份代码）：grantOf(key) → [{ p, src}] */
export const judgePremise = (entry, grantOf) => {
	if (!entry?.premise) return null;                       // 未声明的条目不判（登记制：声明才管）
	const keys = evidenceKeys(entry);
	const grants = keys.flatMap((k) => grantOf(k));
	const hit = grants.filter((g) => g.src.includes(entry.premise));
	return { id: entry.id, premise: entry.premise, keys, grants: grants.map((g) => g.p), hit: hit.map((g) => g.p) };
};

/** 条件表行的 `yields` → 归一后的键集合（`n_*` 先展开成该笔记的 `flagPath`；`ev.`/`world.` 前缀抹掉）。 */
export const expandYields = (row, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const y of asList(row?.yields)) {
		out.add(norm(y));
		if (String(y).startsWith('n_')) for (const p of (paths.get(String(y)) ?? [])) out.add(norm(p));
	}
	return out;
};

/** 纯函数：表数据源 —— 哪些行授予了 `key`（`scope` 的 `#` 前是段落名；段落文本优先，取不到就用该行 `text`）。 */
export const tableGrants = (rows, key, { entries = {}, passageSrc = new Map() } = {}) =>
	(rows ?? []).filter((r) => r?.id && expandYields(r, entries).has(norm(key)))
		.map((r) => {
			const p = String(r.scope ?? '').split('#')[0];
			return { p, src: passageSrc.get(p) ?? String(r.text ?? '') };
		});

/** 条件表里声明了 `premise` 的行 → 本门的条目形状。 */
export const ruleEntries = (rows) => (rows ?? [])
	.filter((r) => r?.id && r.premise)
	.map((r) => ({ id: r.id, premise: r.premise, req: r.req, any: r.any, label: `<<rules "${r.scope}">>`, source: '表' }));

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const grant = (map) => (flag) => (map[flag] ?? []).map(([p, src]) => ({ p, src }));
	const e = { id: 'x', premise: '烧', pastFlags: ['a'], presentFlags: ['b'] };

	t('正例：前提词出现在授予旗标的段落里', judgePremise(e, grant({ a: [['P', '那一夜烧的是什么']] })).hit.length === 1);
	t('反例①：依据旗标都在，但段落里没有前提词 → 判红', judgePremise(e, grant({ a: [['P', '别的文本']], b: [['Q', '别的']] })).hit.length === 0);
	t('反例②：一个授予段落都找不到 → 判红（无法证明"玩家可能知道"）', judgePremise(e, grant({})).grants.length === 0);
	t('正例：未声明 premise 的条目不判（登记制）', judgePremise({ id: 'y', pastFlags: ['a'] }, grant({})) === null);

	// 新数据源（#435 阶段 4）：条件表
	const notes = { entries: { n_cause: { flagPath: 'ev.cause' } } };
	const rows = [
		{ id: 'A', scope: '书房#日记', yields: ['n_cause'], text: '纸上写着：缺的从来不是咒。' },
		{ id: 'B', scope: '老巫女', req: ['n_cause'], premise: '缺的从来不是咒', text: '问她' },
	];
	const tg = (key) => tableGrants(rows, key, { entries: notes.entries });
	t('正例（表）：`req` 的 note id 由别的行的 `yields` 声明授予 ⇒ 命中所属段落', judgePremise(rows[1], tg).hit.join() === '书房');
	t('正例（表）：`yields` 里的 note id 展开成 `flagPath` 后，裸键也认得', tg('cause').length === 1 && tg('ev.cause').length === 1);
	t('反例（表）：授予行的文本里没有前提词 ⇒ 判红', judgePremise(rows[1], () => tableGrants([{ ...rows[0], text: '别的' }], 'n_cause', { entries: notes.entries })).hit.length === 0);
	t('反例（表）：表里没有行授予该键 ⇒ 判红（无法证明"玩家可能知道"）', judgePremise(rows[1], (k) => tableGrants([], k, { entries: notes.entries })).grants.length === 0);
	t('边界（表）：取不到段落文本时退回该行 `text`（数据行的位点也成立）', tableGrants(rows, 'n_cause', { entries: notes.entries })[0].src.includes('缺的从来不是咒'));
	t('纯函数：`ruleEntries()` 只收声明了 `premise` 的行', ruleEntries([...rows, { id: 'C', scope: 'S' }]).length === 1);
	t('边界：`req`/`any` 都算依据键（旧字段在前 ⇒ 跨时代门的显示顺序逐字不变）', evidenceKeys({ req: ['a'], any: ['b'], pastFlags: ['c'] }).join() === 'c,a,b');
	t('反例（源码兜底）：`Sg.notes.add("n_x")` 也是“授予”（note id 形状）', noteWriteRefs(`<<run Sg.notes.add('n_x')>>`).includes('n_x'));

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：前提词命中绿 / 有依据无前提词红 / 找不到授予段落红 / 未声明不判 · 表数据源（yields 展开）与源码兜底各 4 例');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ── 真实运行 ─────────────────────────────────────────────────────────
const ctx = createContext();
const { Game, passageSrc } = ctx;
const NOTES = Game.Notes?.entries ?? {};
const rows = ctx.Sg?.story?.rules?.() ?? [];
const entries = [
	...(Game.Investment?.eraDomain?.crossEraGates ?? []).map((e) => ({ ...e, source: '跨时代门' })),
	...ruleEntries(rows),
];
const WRITE = (flag) => new RegExp(`ev\\.${flag}\\s*(?:to|=)(?!=)`);   // `$pc.ev.k to true` / `pc.ev.k = true`
// #434：#434 之后旗标也可能**经 `Sg.notes.add('n_x')`** 被授予（写的是该笔记 flagPath 的键）——
// 故"可溯源"要认这条形状；口径走单一权威 `noteWriteFlags()`（与 --state／D2／--sel-gear／--sitedisc 同一份）。
const { noteWriteFlags } = await import('../scripts/audit/lib/shared.mjs');
const srcGrants = (key) => {
	const bare = norm(key);
	const writes = [...passageSrc].filter(([, src]) =>
		WRITE(bare).test(src) || noteWriteFlags(src, NOTES).includes(bare) ||
		(String(key).startsWith('n_') && noteWriteRefs(src).includes(String(key))));
	return writes.map(([p, src]) => ({ p, src }));
};
const grantOf = (key) => [...tableGrants(rows, key, { entries: NOTES, passageSrc }), ...srcGrants(key)];

console.log(`══ D9① 前提可溯源门（#407）══  条目 ${entries.length} 条（跨时代门 ${entries.length - ruleEntries(rows).length} ＋ 条件表 ${ruleEntries(rows).length}）｜声明了 premise 的 ${entries.filter((e) => e.premise).length} 条`);
let fails = 0;
for (const e of entries) {
	const r = judgePremise(e, grantOf);
	if (!r) { console.log(`  · [${e.source}] ${e.id}：未声明 premise（登记制：不判）`); continue; }
	const known = PREMISE_KNOWN[e.id];
	const ok = r.hit.length > 0;
	if (!ok) fails++;
	const tag = ok ? '✓' : known ? `⏳ [已知缺陷 ${known}]` : '✗';
	console.log(`  ${tag} [${e.source}] ${e.id}：「${r.premise}」的依据键 ${r.keys.join('/')} 由 [${r.grants.join(', ') || '（无）'}] 授予；其中含前提词的：${r.hit.join(', ') || '（无）'}`);
	if (!ok) console.log(`      ↳ 「${e.label ?? e.id}」替玩家问了一个正文里没有的概念——要么补前提（在授予依据键的段落里落下它），要么改问法`);
}

const strict = process.argv.includes('--strict');
const failed = (e) => !!e.premise && judgePremise(e, grantOf).hit.length === 0;
// 仍在失败的已知缺陷（**已修好的不算**——否则消息会掩盖状态转变）
const knownStillFailing = entries.filter((e) => e.id in PREMISE_KNOWN && failed(e));
// 白名单腐烂：条目已在 KNOWN 里、但现在已经通过 → 该删条目（与 test/globals.mjs 的 A2 同款）
const stale = entries.filter((e) => e.id in PREMISE_KNOWN && e.premise && !failed(e));
const freshFails = entries.filter((e) => e.premise && !(e.id in PREMISE_KNOWN) && failed(e));

if (stale.length) {
	console.error(`\n✗ 白名单腐烂：${stale.map((e) => `${e.id}（已通过，说明 ${PREMISE_KNOWN[e.id]} 已修）`).join('、')}——请从 PREMISE_KNOWN 删除该条，让门转严格`);
	process.exit(1);
}
if (freshFails.length) { console.error(`\n✗ 前提可溯源门未通过（${freshFails.length} 条**新**问题）`); process.exit(1); }
if (strict) {
	if (knownStillFailing.length) { console.error(`\n✗ 前提可溯源门未通过（--strict：${knownStillFailing.map((e) => e.id).join(', ')} 仍是已知缺陷）`); process.exit(1); }
}
console.log(knownStillFailing.length
	? `\n○ ${knownStillFailing.length} 条为已知缺陷（${knownStillFailing.map((e) => `${e.id}=#${PREMISE_KNOWN[e.id]}`).join(' ')}）——报告但不判失败；\`--strict\` 可当红证；修好后记得删白名单条目`
	: '\n✔ 前提可溯源门通过：所有声明的问句，其前提词都在玩家可见文本里出现过');
