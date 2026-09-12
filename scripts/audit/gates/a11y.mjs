// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { assertFreshDist } from '../../dist-fresh.mjs';
// flags=['a11y']。校验：npm run audit:golden。
export const flag = 'a11y';
export const flags = ["a11y"];

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;


// ── ⓪s 可访问性门（#272）：对比度 AA ＋ lang ＋ 装饰 glyph 语义 ──
if (wantAll || arg('a11y')) {
	console.log('\n══ ⓪s 可访问性门（#272）——对比度 / lang / 装饰语义 ══');
	let bad = 0;
	const css = readFileSync('src/90-style.twee', 'utf8');
	const lum = (h) => {
		h = h.replace('#', '');
		if (h.length === 3) h = [...h].map((c) => c + c).join('');
		const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
			.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
	const baseMatch = css.match(/body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/);
	const base = baseMatch ? baseMatch[1] : '#191722';
	// AA 门槛：正文 4.5；装饰性/大字白名单 3.0（每条须给理由——仿 #247 的「声明须带理由」）
	const DECOR = { '.title-card .engine-credit': '引擎署名（纯装饰，非玩家内容：仅需大字门槛 3.0，提亮到 3.01:1）' };
	const seen = new Set();
	for (const m of css.matchAll(/([^{}]*?)\{([^}]*)\}/g)) {
		const sel = m[1].trim().split('\n').pop().trim();
		const cm = m[2].match(/(?<!-)\bcolor\s*:\s*(#[0-9a-fA-F]{6})/);
		if (!cm || !sel) continue;
		const key = `${sel}|${cm[1]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const r = ratio(cm[1], base);
		const floor = DECOR[sel] ? 3.0 : 4.5;
		if (r + 1e-9 < floor) { console.log(`  ✗ 对比度 ${r.toFixed(2)}:1 < ${floor} —— ${sel} { color: ${cm[1]} }`); bad++; }
	}
	console.log(`  · 对比度扫描：基准底色 ${base}，检查 ${seen.size} 条声明（阈值 正文 ≥4.5 / 装饰 ≥3.0，装饰白名单 ${Object.keys(DECOR).length} 条带理由）`);
	// lang：构建期注入（dist 存在时一并核对产物）
	const bm = readFileSync('build.mjs', 'utf8');
	if (!/<html[^>]*\\slang=/.test(bm) && !bm.includes('lang="zh-CN"')) { console.log('  ✗ build.mjs 未注入 <html lang>'); bad++; }
	else {
		// #319③：读构建产物前先过新鲜度守卫——过期/缺失都响亮报错（此前缺产物会静默跳过＝假绿）
		assertFreshDist({ who: '可访问性门（lang 检查）' });
		if (!/<html[^>]*\slang="zh-CN"/.test(readFileSync('dist/index.html', 'utf8'))) { console.log('  ✗ dist/index.html 缺 lang="zh-CN"'); bad++; }
	}
	// 装饰 glyph：✦ 必须被 aria-hidden 包裹；.act-n 角标必须 aria-hidden
	let bare = 0;
	for (const f of SRC_FILES) {
		const t = readFileSync(f, 'utf8');
		for (const m of t.matchAll(/✦/g)) {
			const before = t.slice(Math.max(0, m.index - 40), m.index);
			if (!/aria-hidden="true">$/.test(before)) bare++;
		}
	}
	if (bare) { console.log(`  ✗ 有 ${bare} 个 ✦ 未被 aria-hidden 包裹（读屏会念出装饰字符）`); bad++; }
	const actn = SRC_FILES.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<span class="act-n"(\s[^>]*)?><\/span>/g)]);
	const actnBad = actn.filter((m) => !(m[1] ?? '').includes('aria-hidden')).length;
	if (actnBad) { console.log(`  ✗ .act-n 角标 ${actnBad} 处缺 aria-hidden`); bad++; }
	console.log('  · 语义：✦ 装饰 glyph 全包裹、.act-n 角标 aria-hidden、<html lang="zh-CN"> 构建期注入');
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 可访问性门：${bad} 项不达标`); process.exit(1); }
		console.log('\n✔ 可访问性门通过（对比度 AA／lang／装饰语义）');
	}
}
};
