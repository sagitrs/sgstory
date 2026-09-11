// 视口冒烟（#208D，手动档）：构建产物在四档视口下 ① 无页面/console 错误 ② scrollWidth 不劣于基线（ratchet 只许降）。
// 首跑自建档 test/viewport-baseline.json；390 档存在既有横向溢出（#169 实测），基线如实记录、后续只紧不松。
// 运行：node scripts/viewport-smoke.mjs（需 playwright：npm i --no-save playwright && npx playwright install chromium）
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WIDTHS = [360, 390, 768, 1440];
const BASE = 'test/viewport-baseline.json';
if (!existsSync('dist/index.html')) { console.error('✗ 缺 dist/index.html，请先构建'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const results = {};
for (const w of WIDTHS) {
	await page.setViewportSize({ width: w, height: 900 });
	await page.goto(pathToFileURL('dist/index.html').href);
	await page.waitForSelector('#passages .passage', { timeout: 15000 });
	await page.waitForTimeout(300);
	results[w] = { scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) };
}
await browser.close();

let bad = 0;
if (errors.length) { console.error(`✗ 页面错误 ${errors.length} 处：`); errors.slice(0, 5).forEach((e) => console.error('  ' + e)); bad++; }

const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
if (!base) {
	writeFileSync(BASE, JSON.stringify({
		note: '视口冒烟基线：各档 document.scrollWidth，只许降不许升（390 档存在既有溢出，如实建档）。首跑自建档， worseness 即红。',
		widths: Object.fromEntries(Object.entries(results).map(([w, r]) => [w, r.scrollWidth])),
	}, null, '\t') + '\n', 'utf8');
	console.log('✔ 首跑建档：', results);
	process.exit(0);
}
for (const w of WIDTHS) {
	const b = base.widths?.[w];
	if (b == null) { console.log(`ℹ ${w}: 基线缺失（实测 ${results[w].scrollWidth}），已按实测收紧`); base.widths ??= {}; base.widths[w] = results[w].scrollWidth; continue; }
	if (results[w].scrollWidth > b) { console.error(`✗ ${w}: scrollWidth ${results[w].scrollWidth} > 基线 ${b}`); bad++; }
	else { console.log(`✓ ${w}: ${results[w].scrollWidth} ≤ 基线 ${b}`); if (results[w].scrollWidth < b) base.widths[w] = results[w].scrollWidth; }
}
if (!bad) writeFileSync(BASE, JSON.stringify(base, null, '\t') + '\n', 'utf8');
if (bad) { console.error(`\n✗ 视口冒烟未过（${bad} 项）`); process.exit(1); }
console.log('✔ 视口冒烟通过（无页面错误 · scrollWidth 不劣于基线）');
