// D9①「前提可溯源」门（#407 探索票 / #404 实例）：选项的前提词必须**在玩家可见文本里出现过**。
//
// 为什么：机制门（依据旗标）只回答"玩家够不够格问"，不回答"问题里那个概念他有没有可能知道"。
// #404 实锤：「问她：那一夜该烧的是什么？」——「烧」在玩家可见文本里**只出现在这个选项自己身上**，
// 于是选项替玩家问了一个他不可能知道的问题（canon 的意图是让他**拼**出那笔账，不是被选项告知）。
//
// 判据：对每条 `Game.Investment.eraDomain.crossEraGates` 里声明了 `premise` 的条目，
//       找到**授予它依据旗标**的段落（写 `$pc.ev.<flag>` 的段落），断言 **premise 词至少出现在其中一个段落里**。
//       —— 即"你能问出这句，是因为你在某处读到过这个概念"。
//
// 已知缺陷姿态（本仓约定）：`PREMISE_KNOWN` 里的条目**报告但不判失败**（main 不被卡住）；
// 修完删掉条目即自动转严格。要**红证**时跑 `--strict`（把已知缺陷也当失败）——这正是 #404 要的复现命令。
//
// 自证：`node test/premise-source.mjs --selftest`

import { createContext } from '../scripts/audit/context.mjs';

export const PREMISE_KNOWN = { witch_fire: '#404' };   // 修完删除本条

// 纯函数（自证与真实运行同一份代码）：grantOf(flag) → [{ p, src }]
export const judgePremise = (entry, grantOf) => {
	if (!entry?.premise) return null;                       // 未声明的条目不判（登记制：声明才管）
	const flags = [...(entry.pastFlags ?? []), ...(entry.presentFlags ?? [])];
	const grants = flags.flatMap((f) => grantOf(f));
	const hit = grants.filter((g) => g.src.includes(entry.premise));
	return { id: entry.id, premise: entry.premise, flags, grants: grants.map((g) => g.p), hit: hit.map((g) => g.p) };
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const grant = (map) => (flag) => (map[flag] ?? []).map(([p, src]) => ({ p, src }));
	const e = { id: 'x', premise: '烧', pastFlags: ['a'], presentFlags: ['b'] };

	t('正例：前提词出现在授予旗标的段落里', judgePremise(e, grant({ a: [['P', '那一夜烧的是什么']] })).hit.length === 1);
	t('反例①：依据旗标都在，但段落里没有前提词 → 判红', judgePremise(e, grant({ a: [['P', '别的文本']], b: [['Q', '别的']] })).hit.length === 0);
	t('反例②：一个授予段落都找不到 → 判红（无法证明"玩家可能知道"）', judgePremise(e, grant({})).grants.length === 0);
	t('正例：未声明 premise 的条目不判（登记制）', judgePremise({ id: 'y', pastFlags: ['a'] }, grant({})) === null);

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：前提词命中绿 / 有旗标无前提词红 / 找不到授予段落红 / 未声明不判');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ── 真实运行 ─────────────────────────────────────────────────────────
const ctx = createContext();
const { Game, passageSrc } = ctx;
const entries = Game.Investment.eraDomain.crossEraGates ?? [];
const WRITE = (flag) => new RegExp(`ev\\.${flag}\\s*(?:to|=)(?!=)`);   // `$pc.ev.k to true` / `pc.ev.k = true`
const grantOf = (flag) => [...passageSrc].filter(([, src]) => WRITE(flag).test(src)).map(([p, src]) => ({ p, src }));

console.log(`══ D9① 前提可溯源门（#407）══  跨时代问句 ${entries.length} 条｜声明了 premise 的 ${entries.filter((e) => e.premise).length} 条`);
let fails = 0;
for (const e of entries) {
	const r = judgePremise(e, grantOf);
	if (!r) { console.log(`  · ${e.id}：未声明 premise（登记制：不判）`); continue; }
	const known = PREMISE_KNOWN[e.id];
	const ok = r.hit.length > 0;
	if (!ok) fails++;
	const tag = ok ? '✓' : known ? `⏳ [已知缺陷 ${known}]` : '✗';
	console.log(`  ${tag} ${e.id}：「${e.premise}」的依据旗标 ${r.flags.join('/')} 由段落 [${r.grants.join(', ') || '（无）'}] 授予；其中含前提词的：${r.hit.join(', ') || '（无）'}`);
	if (!ok) console.log(`      ↳ 选项「${e.label}」替玩家问了一个正文里没有的概念——要么补前提（在授予旗标的段落里落下它），要么改问法`);
}

const strict = process.argv.includes('--strict');
const failed = (e) => !!e.premise && judgePremise(e, grantOf).hit.length === 0;
// 仍在失败的已知缺陷（**已修好的不算**——否则消息会掩盖状态转变）
const knownStillFailing = entries.filter((e) => e.id in PREMISE_KNOWN && failed(e));
// 白名单腐烂：条目已在 KNOWN 里、但现在已经通过 ⇒ 该删条目（与 test/globals.mjs 的 A2 同款）
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
