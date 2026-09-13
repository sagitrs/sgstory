// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['items', 'tokens']。校验：npm run audit:golden。
export const flag = 'items';
export const flags = ["items", "tokens"];

// ── #342 F2 自证：伤害矩阵的两条**不变量** ──
// ① 减伤件越多 ⇒ 伤害**不增**（子集关系下）② 败次 0→2 ⇒ 伤害**不减**
export const damageInvariants = (I, sets, rounds = [1, 2, 3]) => {
	const out = [];
	for (const A of sets) for (const B of sets) {
		if (A === B) continue;
		const keysA = Object.keys(A), keysB = Object.keys(B);
		const subset = keysA.every((k) => B[k]) && keysB.length > keysA.length; // A ⊊ B
		if (!subset) continue;
		for (const r of rounds) {
			const da = I.battleDamage(r, A, 0), db = I.battleDamage(r, B, 0);
			if (db > da) out.push(`R${r}：多带【${keysB.filter((k) => !A[k]).join('、')}】反而更疼（${da} → ${db}）`);
		}
	}
	for (const set of sets) for (const r of rounds) {
		const d0 = I.battleDamage(r, set, 0), d2 = I.battleDamage(r, set, 2);
		if (d2 < d0) out.push(`R${r}【${Object.keys(set).join('、') || '空手'}】：败次 2 的伤害(${d2}) < 败次 0(${d0})`);
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ③ 道具效果 · 龙战伤害矩阵（伞 #22：高潮战审计）──
if (wantAll || arg('items') || arg('tokens')) {
	console.log('\n══ ③ 道具效果 · 龙战伤害矩阵（受击方=玩家，败次 0/2）══');
	const I = Game.Items;
	console.log(`减伤件：每件 −${I.perItemDamageReduce}；败次 +1 封顶 +2（M5b：件数共鸣与月光花优势已移除）`);
	for (const [name, e] of Object.entries(I.effects)) {
		const sites = [e.advSite, ...(e.advSites ?? [])].filter(Boolean);
		console.log(`  ${name.padEnd(8, '　')} ${sites.length ? `优势@${sites.join('/')}` : `减伤−${e.flatDamageReduce}`} —— ${e.note}`);
	}
	const sets = [
		{},
		{ 日记: true },
		{ 坏哨: true },
		{ 日记: true, 龙鳞护臂: true },
		{ 日记: true, 龙鳞护臂: true, 观星者的书: true },
		{ 日记: true, 龙鳞护臂: true, 观星者的书: true, 坏哨: true },
	];
	// 自证 3 例（合成 I：可控，不依赖真表）
	{
		let bad = 0;
		const fakeI = { battleDamage: (r, set) => Math.max(1, r * 2 - Object.keys(set).length) };
		const okInv = damageInvariants(fakeI, [{}, { 甲: true }, { 甲: true, 乙: true }]);
		const badI = { battleDamage: (r, set) => (set.甲 ? r + 10 : r) };
		const cases = [
			['不变量正例：减伤件更多 ⇒ 伤害不增（合成 I）', okInv.length === 0],
			['不变量反例：多带一件反而更疼 ⇒ 报（三个回合各报一次 ⇒ 3）', damageInvariants(badI, [{}, { 甲: true }]).length === 3],
			['不变量：败次 0/2 也算（合成 I 里两档相同 ⇒ 不报）', damageInvariants(fakeI, [{ 甲: true }]).length === 0],
		];
		for (const [label, ok] of cases) { if (!ok) bad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		globalThis.__itemsSelfBad = bad;
	}
	console.log('  道具组合 → R1/R2/R3 伤害（败次=0 | 败次=2）');
	for (const set of sets) {
		const f = (r) => `${I.battleDamage(r, set, 0)}/${I.battleDamage(r, set, 2)}`;
		console.log(`    [${Object.keys(set).join('、') || '空手'}] → ${f(1)} ${f(2)} ${f(3)}`);
	}
	const viol = damageInvariants(I, sets);
	if (viol.length) { for (const v of viol.slice(0, 5)) console.log(`  ✗ 伤害不变量被打破：${v}`); }
	else console.log('  ✓ 伤害不变量成立（减伤件越多越不疼；败次越高越疼或不减）');
	if (process.argv.includes('--check') && (viol.length || globalThis.__itemsSelfBad)) { console.error(`\n✗ 道具/龙战矩阵段：${viol.length} 项不变量 + ${globalThis.__itemsSelfBad} 项自证`); process.exit(1); }
}
};
