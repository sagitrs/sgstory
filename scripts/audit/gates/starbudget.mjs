// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['starbudget']。校验：npm run audit:golden。
export const flag = 'starbudget';
export const flags = ["starbudget"];

// 纯函数（供自证；判据与真实运行同一份代码）：余量承诺 = budget − spent ≥ floor
export const judgeOrders = (orders, budget) => {
	const empty = !(orders ?? []).length;
	const findings = (orders ?? []).map((o) => ({ id: o.id, margin: budget - o.spent, floor: o.floor })).filter((x) => x.margin < x.floor);
	return { empty, findings };
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪r 软限余量门（#256 方案 A）：五类可信序的付费翻转数 vs budget − 承诺余量 ══
if (wantAll || arg('starbudget')) {
	console.log('\n══ ⓪r 软限余量门（#256）——budget − spent ≥ floor（按序）══');
	const S = Game.Star;
	let bad = 0;
	// ── 自证（先证会红，再判真实数据）──
	{
		const cases = [
			['正例：余量恰好达标', judgeOrders([{ id: 'a', spent: 4, floor: 2 }], 6), 0, false],
			['反例①：余量不足', judgeOrders([{ id: 'a', spent: 5, floor: 2 }], 6), 1, false],
			['反例②：多序中一条违背', judgeOrders([{ id: 'a', spent: 2, floor: 2 }, { id: 'b', spent: 6, floor: 1 }], 6), 1, false],
			['反例③：表没登记（空）', judgeOrders([], 6), 0, true],
		];
		for (const [label, got, wantN, wantEmpty] of cases) {
			const ok = got.findings.length === wantN && got.empty === wantEmpty;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got.findings.length}（期望 ${wantN}）· 空表=${got.empty}（期望 ${wantEmpty}）`);
			if (!ok) bad++;
		}
	}
	for (const o of S.orders ?? []) {
		const margin = S.budget - o.spent;
		const ok = margin >= o.floor;
		if (!ok) bad++;
		console.log(`  ${ok ? '✓' : '✗'} ${o.id}：spent ${o.spent}，budget ${S.budget} → 余 ${margin}（承诺 ≥${o.floor}）${ok ? '' : ' ← 违背余量承诺'}`);
	}
	if (!S.orders?.length) { console.log('  ✗ Star.orders 未登记（无法验证余量承诺）'); bad++; }
	console.log(`  （首翻免费＝额外 1 次不计入 spent；宴·散场回程不耗星力。改 budget/免费额度必须同步本表与 canon §3.5）`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 软限余量门：${bad} 项违背余量承诺`); process.exit(1); }
		console.log('\n✔ 软限余量门通过（五类可信序均在承诺余量内）');
	}
}
};
