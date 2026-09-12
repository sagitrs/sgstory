// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['checks']。校验：npm run audit:golden。
export const flag = 'checks';
export const flags = ["checks"];

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;
if (wantAll || arg('checks')) {
	console.log('\n══ ① 检定成功率矩阵（位点 × 预设，含优势位）══');
	console.log('格式：位点（技能/豁免 DC）→ 铁卫 / 影手 / 秘典  ·★=有优势条件位');
	for (const [key, site] of Object.entries(Game.Checks.sites)) {
		const what = site.abil ? `豁免${site.abil}` : site.skill;
		// #237②：nat 位点不走普通成功率——按彩蛋口径标注（与 --dragon 段同一算法），不再显示 30%(51%) 假数
		if (site.nat) {
			const pNat = 1 / 20;
			const pTrue = site.dis ? pNat * pNat : pNat;
			console.log(`${key.padEnd(10, '　')} ${what} DC${String(site.dc).padEnd(3)} → 彩蛋位：天然${site.nat}${site.dis ? '×劣势' : ''} ≈ ${(pTrue * 100).toFixed(2)}%（全预设同）`);
			continue;
		}
		const cells = presets.map((p) => {
			const plain = successRate(p.pc, site, false);
			const adv = successRate(p.pc, site, true);
			const mark = adv - plain > 0.001 ? '★' : ' ';
			return `${(plain * 100).toFixed(0).padStart(3)}%${mark}${adv > plain ? `(${(adv * 100).toFixed(0)}%)` : '    '}`;
		});
		console.log(`${key.padEnd(10, '　')} ${what} DC${String(site.dc).padEnd(3)} → ${cells.join('  ')}`);
	}
}
};
