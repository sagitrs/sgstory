// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['checks']。校验：npm run audit:golden。
export const flag = 'checks';
export const flags = ["checks"];

// ── #342 F2 自证：报表里的两个真判据 ──
// ① 天然位点（`nat`）不走普通成功率：概率＝1/20（劣势再平方），**全预设同**
// ② 优势标记：`adv - plain > 0.001` 才打 ★（阈值是判据的一部分，边界要钉住）
export const natProb = (site) => (1 / 20) * (site?.dis ? 1 / 20 : 1);
export const advMark = (plain, adv) => (adv - plain > 0.001 ? '★' : ' ');
export const advNeverLower = (sites, successRate, presets) => {
	const out = [];
	for (const [key, site] of Object.entries(sites ?? {})) {
		if (site.nat) continue;
		for (const p of presets) {
			const plain = successRate(p.pc, site, false), adv = successRate(p.pc, site, true);
			if (adv + 1e-9 < plain) out.push(`${key}@${p.name}：优势 ${adv.toFixed(3)} < 普通 ${plain.toFixed(3)}`);
		}
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;
if (wantAll || arg('checks')) {
	console.log('\n══ ① 检定成功率矩阵（位点 × 预设，含优势位）══');
	let bad = 0;
	// 自证 3 例
	{
		const cases = [
			['天然位点概率＝1/20＝5%', Math.abs(natProb({ nat: '20' }) - 0.05) < 1e-12],
			['天然+劣势 ⇒ 概率平方 ⇒ 0.25%', Math.abs(natProb({ nat: '20', dis: true }) - 0.0025) < 1e-12],
			['优势标记：差 0.01 ⇒ ★', advMark(0.5, 0.51) === '★'],
			// 浮点陷阱：`0.501 - 0.5` 在 IEEE 下＝0.0009999999999999454（**比 0.001 小**）⇒
			// 拿它钉"恰好等于阈值"是不可靠的。边界只用无歧义的两侧：
			['优势标记：差明显小于阈值 ⇒ 不打★', advMark(0.5, 0.5005) === ' '],
			['优势标记：差明显大于阈值 ⇒ 打★', advMark(0.5, 0.502) === '★'],
		];
		for (const [label, ok] of cases) { if (!ok) bad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	}
	console.log('格式：位点（技能/豁免 DC）→ 铁卫 / 影手 / 秘典  ·★=有优势条件位');
	for (const [key, site] of Object.entries(Game.Checks.sites)) {
		const what = site.abil ? `豁免${site.abil}` : site.skill;
		// #237②：nat 位点不走普通成功率——按彩蛋口径标注（与 --dragon 段同一算法），不再显示 30%(51%) 假数
		if (site.nat) {
			const pTrue = natProb(site);
			console.log(`${key.padEnd(10, '　')} ${what} DC${String(site.dc).padEnd(3)} → 彩蛋位：天然${site.nat}${site.dis ? '×劣势' : ''} ≈ ${(pTrue * 100).toFixed(2)}%（全预设同）`);
			continue;
		}
		const cells = presets.map((p) => {
			const plain = successRate(p.pc, site, false);
			const adv = successRate(p.pc, site, true);
			const mark = advMark(plain, adv);
			return `${(plain * 100).toFixed(0).padStart(3)}%${mark}${adv > plain ? `(${(adv * 100).toFixed(0)}%)` : '    '}`;
		});
		console.log(`${key.padEnd(10, '　')} ${what} DC${String(site.dc).padEnd(3)} → ${cells.join('  ')}`);
	}
	// 不变量：优势位点的成功率**不可能低于**普通（低了说明 successRate 或位点表有矛盾）
	const viol = advNeverLower(Game.Checks.sites, successRate, presets);
	if (viol.length) { for (const v of viol.slice(0, 5)) console.log(`  ✗ 优势反而更难：${v}`); bad += viol.length; }
	else console.log('  ✓ 所有位点：优势 ≥ 普通（成功率单调性成立）');
	if (process.argv.includes('--check') && bad) { console.error(`\n✗ 检定矩阵段：${bad} 项`); process.exit(1); }
}
};
