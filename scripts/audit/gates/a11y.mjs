
import { defaultStoryHtml } from '../../dist-paths.mjs';
// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { assertFreshDist } from '../../dist-fresh.mjs';
// flags=['a11y']。校验：npm run audit:golden。
export const flag = 'a11y';
export const flags = ["a11y"];

// ── #342 F2 自证：可访问性门的判据都是**纯算术/纯扫描**，抽出来喂合成输入 ──
export const luminance = (h) => {
	h = String(h).replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// AA 门槛：正文 4.5；装饰性白名单 3.0（每条须给理由——仿 #247 的「声明须带理由」）
export const DECOR_DEFAULT = { '.title-card .engine-credit': '引擎署名（纯装饰，非玩家内容：仅需大字门槛 3.0，提亮到 3.01:1）' };
/** 纯函数：CSS 文本 → 低对比度声明（`sel { color: #xxxxxx}`），按 body 底色算比值。 */
export const contrastFindings = (css, { base = '#191722', decor = DECOR_DEFAULT, bodyFloor = 4.5, decorFloor = 3.0 } = {}) => {
	const out = [];
	const seen = new Set();
	for (const m of String(css).matchAll(/([^{}]*?)\{([^}]*)\}/g)) {
		const sel = m[1].trim().split('\n').pop().trim();
		const cm = m[2].match(/(?<!-)\bcolor\s*:\s*(#[0-9a-fA-F]{6})/);
		if (!cm || !sel) continue;
		const key = `${sel}|${cm[1]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const r = contrastRatio(cm[1], base);
		const floor = decor[sel] ? decorFloor : bodyFloor;
		if (r + 1e-9 < floor) out.push({ sel, color: cm[1], ratio: r, floor });
	}
	return { findings: out, checked: seen.size };
};
/** 纯函数：` ` 装饰 glyph 未被 `aria-hidden="true">` 紧邻包裹的处数。 */
export const bareGlyphCount = (text, glyph = '\u2726') => {
	let n = 0;
	const t = String(text);
	for (const m of t.matchAll(new RegExp(glyph, 'g'))) {
		const before = t.slice(Math.max(0, m.index - 40), m.index);
		if (!/aria-hidden="true">$/.test(before)) n++;
	}
	return n;
};
/** 纯函数：`.act-n` 角标缺 `aria-hidden` 的处数。 */
export const actnMissingAria = (text) =>
	[...String(text).matchAll(/<span class="act-n"(\s[^>]*)?><\/span>/g)].filter((m) => !(m[1] ?? '').includes('aria-hidden')).length;

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;


// ── ⓪s 可访问性门（#272）：对比度 AA ＋ lang ＋ 装饰 glyph 语义 ──
if (wantAll || arg('a11y')) {
	console.log('\n══ ⓪s 可访问性门（#272）——对比度 / lang / 装饰语义 ══');
	let bad = 0;
	// `#1151`：**自证格**的计数单列（格红＝本门失能；与「判据发现」语义不同 → 分开记）
	let selfBad = 0;
	// #458（搬家）：CSS 源**不写死单根**——`src/90-style.twee` 已随目录级隔离落到 `src/engine/50-present/`。
	// 做法：在**源文件权威清单**（`allSourceFiles()` 的产物）里按 basename 找，且必须**唯一命中**
	//（0 或 >1 → 大声报错；宁可不跑，也不要静默拿错文件 —— 那就是「假绿」）。
	const styleSrcs = SRC_FILES.filter((f) => /(^|\/)90-style\.twee$/.test(f));
	if (styleSrcs.length !== 1) throw new Error(`a11y：源清单里 90-style.twee 命中 ${styleSrcs.length} 个（应为 1）——搬家/改名后请复查本判据`);
	const css = readFileSync(styleSrcs[0], 'utf8');
	const baseMatch = css.match(/body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/);
	const base = baseMatch ? baseMatch[1] : '#191722';
	const cf = contrastFindings(css, { base });
	for (const f of cf.findings) { console.log(`  ✗ 对比度 ${f.ratio.toFixed(2)}:1 < ${f.floor} —— ${f.sel} { color: ${f.color} }`); bad++; }
	console.log(`  · 对比度扫描：基准底色 ${base}，检查 ${cf.checked} 条声明（阈值 正文 ≥4.5 / 装饰 ≥3.0，装饰白名单 ${Object.keys(DECOR_DEFAULT).length} 条带理由）`);
	// 自证 6 例（纯算术/纯扫描，喂合成输入）
	{
		const cases = [
			['黑白对比 = 21:1', Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-9],
			['同色对比 = 1:1', Math.abs(contrastRatio('#123456', '#123456') - 1) < 1e-12],
			['三位 hex 展开（#fff 与 #ffffff 同值）', Math.abs(contrastRatio('#fff', '#000') - 21) < 1e-9],
			['低对比声明被抓（合成 CSS）', contrastFindings('body{background:#191722}\n.x{color:#222222}', { base: '#191722' }).findings.length === 1],
			// 门槛切换：同一个 sel 在白名单里时用 decorFloor（不是猜颜色，而是直接证明"用哪个阈值"是可注入且生效的）
			['装饰白名单：decorFloor 降到 1.0 ⇒ 不再报（证明阈值切换生效）', contrastFindings('.title-card .engine-credit{color:#555560}', { base: '#191722', decorFloor: 1.0 }).findings.length === 0],
			['同一行 CSS：不在白名单 ⇒ 用 4.5 门槛 ⇒ 报（对照）', contrastFindings('.other{color:#555560}', { base: '#191722' }).findings.length === 1],
			['✦ 未包裹 ⇒ 计 1；aria-hidden 包裹 ⇒ 计 0', bareGlyphCount('✦ 裸的') === 1 && bareGlyphCount('<span aria-hidden="true">✦</span>') === 0],
			['.act-n 缺 aria-hidden ⇒ 计 1', actnMissingAria('<span class="act-n"></span>') === 1 && actnMissingAria('<span class="act-n" aria-hidden="true"></span>') === 0],
		];
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	}
	// lang：构建期注入（dist 存在时一并核对产物）
	const bm = readFileSync('build.mjs', 'utf8');
	if (!/<html[^>]*\\slang=/.test(bm) && !bm.includes('lang="zh-CN"')) { console.log('  ✗ build.mjs 未注入 <html lang>'); bad++; }
	else {
		// #319③：读构建产物前先过新鲜度守卫——过期/缺失都响亮报错（此前缺产物会静默跳过＝假绿）
		assertFreshDist({ who: '可访问性门（lang 检查）' });
		if (!/<html[^>]*\slang="zh-CN"/.test((defaultStoryHtml() ? readFileSync(defaultStoryHtml(), 'utf8') : ''))) { console.log('  ✗ dist/index.html 缺 lang="zh-CN"'); bad++; }
	}
	// 装饰 glyph： 必须被 aria-hidden 包裹；.act-n 角标必须 aria-hidden
	let bare = 0;
	for (const f of SRC_FILES) {
		const t = readFileSync(f, 'utf8');
		bare += bareGlyphCount(t);
	}
	if (bare) { console.log(`  ✗ 有 ${bare} 个 ✦ 未被 aria-hidden 包裹（读屏会念出装饰字符）`); bad++; }
	const actnBad = SRC_FILES.reduce((n, f) => n + actnMissingAria(readFileSync(f, 'utf8')), 0);
	if (actnBad) { console.log(`  ✗ .act-n 角标 ${actnBad} 处缺 aria-hidden`); bad++; }
	console.log('  · 语义：✦ 装饰 glyph 全包裹、.act-n 角标 aria-hidden、<html lang="zh-CN"> 构建期注入');
	bad += selfBad;
	// `#1151`（同 `#1149`／`#1150`）⭐ **自证格的红必须进退出码** —— 格级属性，**不依赖 `process.argv`**
	//注意：与「判据发现」**分开报**：本条语义是「**本门自身失能**」，不是「故事数据/内容有问题」
	if (selfBad) {
		console.error(`\n✗ 可访问性门：**自证格**红 ${selfBad} 项 ⇒ **本门自身失能**（不是判据发现 ✗）—— 请修本门再跑 ✓（\`#1151\`）`);
		process.exit(1);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 可访问性门：${bad} 项不达标`); process.exit(1); }
		console.log('\n✔ 可访问性门通过（对比度 AA／lang／装饰语义）');
	}
}
};
