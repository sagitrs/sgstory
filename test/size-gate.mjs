// L0.5 产物体积 ratchet（对抗席评估 → #187）：首屏字节预算，只许降不许升。
// 超基线 → 红；低于基线 → 收紧。重签：node test/size-gate.mjs --update-size（PR 写明理由）。
//
// #362（P2）修复：此前**失败时也会写基线**，且写回的是「当前实际值」（含超预算项）→ 自愈放宽：
// 同一工作区第二次检查就变绿（实测：HTML 超 1B、字体缩小 1B → 首次退出 1 却已把 HTML 基线改大）。
// 现在：**失败不写**；成功只写**实际降低**的项（其余原值、容差表都保留）。
//
// 判定逻辑抽成纯函数 `judge()`，`--selftest` 用合成输入证明三条不变式（这也是本门的行为化自证）。
import { statSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

export const NOTE = '产物体积预算（字节）。只许降不许升——确需增大请 --update-size 重签并在 PR 写明理由。';

// 纯函数：给 rows 与基线，返回 { failures, lines, shrunken }
export const judge = (rows, parsed) => {
	const base = parsed.rows ?? {};
	const tol = parsed.tolerancePct ?? {};
	let failures = 0;
	const lines = [];
	const shrunken = {};
	for (const [k, v] of Object.entries(rows)) {
		const b = base[k];
		if (b == null) { lines.push(`✗ ${k}: 基线缺失（${v}B）——请 --update-size 重签`); failures++; continue; }
		const allow = Math.ceil(b * ((tol[k] ?? 0) / 100));
		if (v > b + allow) { lines.push(`✗ ${k}: ${v}B > 基线 ${b}B +容差 ${allow}B。确需增大：node test/size-gate.mjs --update-size 并在 PR 写明理由`); failures++; }
		else if (v > b) lines.push(`~ ${k}: ${v}B 在容差内（基线 ${b}B +${v - b} ≤ ${allow}B，构建噪声）`);
		else if (v < b) { lines.push(`✔ ${k}: ${v}B < 基线 ${b}B（-${b - v}）——收紧`); shrunken[k] = v; }
		else lines.push(`✓ ${k}: ${v}B = 基线`);
	}
	return { failures, lines, shrunken };
};

const selftest = () => {
	const P = { rows: { 'index.html': 1000, fonts: 2000 }, tolerancePct: { 'index.html': 0.5, fonts: 1 } };
	const cases = [
		['一超预算 + 一缩小 → 必须失败，且**只记录缩小项**、不得写任何超预算值',
			{ 'index.html': 1010, fonts: 1990 }, P,
			(r) => r.failures === 1 && r.shrunken.fonts === 1990 && r.shrunken['index.html'] === undefined],
		['全部在预算内 + 一项缩小 → 不失败，只收紧缩小项',
			{ 'index.html': 1000, fonts: 1900 }, P,
			(r) => r.failures === 0 && JSON.stringify(r.shrunken) === '{"fonts":1900}'],
		['全部等于基线 → 不失败也不收紧',
			{ 'index.html': 1000, fonts: 2000 }, P,
			(r) => r.failures === 0 && Object.keys(r.shrunken).length === 0],
		['容差内增长 → 不失败、不收紧（构建噪声）',
			{ 'index.html': 1004, fonts: 2000 }, P,
			(r) => r.failures === 0 && Object.keys(r.shrunken).length === 0],
		['超容差增长 → 失败',
			{ 'index.html': 1006, fonts: 2000 }, P,
			(r) => r.failures === 1 && Object.keys(r.shrunken).length === 0],
	];
	let bad = 0;
	for (const [label, rows, parsed, okFn] of cases) {
		const r = judge(rows, parsed);
		const ok = okFn(r);
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${label}（failures=${r.failures} shrunken=${JSON.stringify(r.shrunken)}）`);
	}
	if (bad) { console.error(`\n✗ 体积门自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 体积门自证通过：失败不写 / 只收紧实际降低项 / 容差内不动作');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const BASELINE = 'test/size-baseline.json';
const update = process.argv.includes('--update-size');

if (!existsSync('dist/index.html')) { console.error('✗ 缺 dist/index.html，请先构建'); process.exit(1); }
const rows = { 'index.html': statSync('dist/index.html').size };
rows.fonts = readdirSync('dist/fonts').reduce((a, f) => a + statSync(`dist/fonts/${f}`).size, 0);

const parsed = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { rows: {}, tolerancePct: {} };

if (update) {
	// 重签保留容差表（#211：跨环境噪声由容差吸收——丢了 tolerancePct 会退化成 0B 硬 ratchet）
	writeFileSync(BASELINE, JSON.stringify({ note: NOTE, rows, ...(parsed.tolerancePct ? { tolerancePct: parsed.tolerancePct } : {}) }, null, '\t') + '\n', 'utf8');
	console.log('✔ 体积基线已重签');
	process.exit(0);
}

const { failures, lines, shrunken } = judge(rows, parsed);
for (const l of lines) (l.startsWith('✗') ? console.error : console.log)(l);

if (failures) {
	// #362：**失败绝不写基线**（此前会写回当前实际值 → 自愈放宽）
	console.error(`\n✗ 体积门未过（${failures} 项超预算）——基线未改动`);
	process.exit(1);
}
if (Object.keys(shrunken).length) {
	const cur = JSON.parse(readFileSync(BASELINE, 'utf8'));
	for (const [k, v] of Object.entries(shrunken)) cur.rows[k] = v;   // 只写**实际降低**的项
	writeFileSync(BASELINE, JSON.stringify(cur, null, '\t') + '\n', 'utf8');
	console.log(`  （体积基线已收紧 ${Object.keys(shrunken).join('、')}——只紧不松；其余项与容差表保留）`);
}
console.log('✔ 体积 ratchet 通过（首屏字节在预算内）');
