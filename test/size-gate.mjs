// L0.5 产物体积 ratchet（对抗席评估 → #187）：首屏字节预算，只许降不许升。
// 超基线 → 红；低于基线 → 提示收紧。重签：node test/size-gate.mjs --update-size（PR 写明理由）。
import { statSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const BASELINE = 'test/size-baseline.json';
const update = process.argv.includes('--update-size');

if (!existsSync('dist/index.html')) { console.error('✗ 缺 dist/index.html，请先构建'); process.exit(1); }
const rows = { 'index.html': statSync('dist/index.html').size };
rows.fonts = readdirSync('dist/fonts').reduce((a, f) => a + statSync(`dist/fonts/${f}`).size, 0);

let failures = 0;
const parsed = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { rows: {}, tolerancePct: {} };
const base = parsed.rows;
const tol = parsed.tolerancePct ?? {};
for (const [k, v] of Object.entries(rows)) {
	const b = base[k];
	if (b == null) { console.error(`✗ ${k}: 基线缺失（${v}B）——请 --update-size 重签`); failures++; continue; }
	const allow = Math.ceil(b * ((tol[k] ?? 0) / 100));
	if (v > b + allow) { console.error(`✗ ${k}: ${v}B > 基线 ${b}B +容差 ${allow}B。确需增大：node test/size-gate.mjs --update-size 并在 PR 写明理由`); failures++; }
	else if (v > b) console.log(`~ ${k}: ${v}B 在容差内（基线 ${b}B +${v - b} ≤ ${allow}B，构建噪声）`);
	else if (v < b) console.log(`ℹ ${k}: ${v}B < 基线 ${b}B（-${b - v}）——可收紧：node test/size-gate.mjs --update-size`);
	else console.log(`✓ ${k}: ${v}B = 基线`);
}
if (update) {
	writeFileSync(BASELINE, JSON.stringify({ note: '产物体积预算（字节）。只许降不许升——确需增大请 --update-size 重签并在 PR 写明理由。', rows }, null, '\t') + '\n', 'utf8');
	console.log('✔ 体积基线已重签');
	process.exit(0);
}
if (failures) { console.error(`\n✗ 体积门未过（${failures} 项超预算）`); process.exit(1); }
console.log('✔ 体积 ratchet 通过（首屏字节在预算内）');
