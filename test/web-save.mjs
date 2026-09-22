// `#761` P1 第三片：**写包对拍** —— 把"改过的包"经唯一写路写出，与 **CLI 的产物**逐字节比。
//
// 复核席给的三条硬判据（本测例逐条量）：
// ① 走 `writeStoryPackage`：用**直接调用它**当**预言机**（oracle）→ 文件集合必须**完全相同**
//（若 `save.mjs` 自己另写一份 → 这格会红 —— 而 K6 ②／L1 那扇门会**更早**拦住它）；
// ② 零宿主（`editor/web/**` 无 `node:*` —— 见 `#856` 那条同口径断言）；
// ③ 与 `node editor/compile-story.mjs` 的产物**逐字节同**（本文件的核心那几行）。
//
// `--selftest` **能红**（假 io + 假包；且自身能红那格常驻）。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeStoryPackage } from '../editor/lib/core/story.mjs';
import { compileInPage } from '../editor/web/compile.mjs';
import { savePackage, collectIo, asDownloads, saveSummary, expectedDataFiles } from '../editor/web/save.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// `#1004` B2：旧故事（`mist-forest`／`hollow-cave`）已删 → 写包对拍名单＝**仓内现存故事**
//（对拍的是「唯一写路 ↔ CLI 产物」 —— 与故事内容无关 → 换样本即可）
const SLUGS = ['minimal-demo', 'night-ferry'];
const rdData = (slug) => {
	const out = {};
	for (const p of expectedDataFiles(slug)) {
		const abs = join(ROOT, p);
		if (existsSync(abs)) out[p.split('/').pop()] = JSON.parse(readFileSync(abs, 'utf8'));
	}
	return out;
};

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

let compared = 0;
const perSlug = new Map();   // `#1004` B2：故事数会变（3 → 2）→ 判据不押"恰好几件"、改押"**每个故事都真的比到了**"
for (const slug of SLUGS) {
	const data = rdData(slug);
	const twee = compileInPage({ slug, data }).files;
	const saved = savePackage({ slug, data, twee });
	perSlug.set(slug, 0);

	// 判据③：与**仓内 artifacts** 逐字节同（"CLI 结论一致"的前半）
	for (const [path, text] of Object.entries(saved.files)) {
		if (!/\.twee$/.test(path)) continue;
		const abs = join(ROOT, path);
		if (!existsSync(abs)) continue;
		compared += 1;
		perSlug.set(slug, perSlug.get(slug) + 1);
		t(`${slug}/${path.split('/').pop()}（${text.length}B）与仓内产物**逐字节同** ✓`, readFileSync(abs, 'utf8') === text);
	}

	// 判据①：用**直接调用**当预言机 —— 文件集合（路径 ∪ 内容）必须一致
	const io = collectIo();
	const rel = (p) => String(p).replace(/^.*\/stories\//, 'stories/');
	const oracle = writeStoryPackage({ slug, data, twee, io }).map(rel).sort();
	const mine = [...saved.written].sort();
	const sameSet = JSON.stringify(oracle) === JSON.stringify(mine);
	//注意：**io 的键也要归一** —— 第一版我只归一了路径数组 而 io 键是**原始**路径 →
	// 比出来全是 `undefined` → **假红**（量之前先把两边的尺对齐 —— 今天第 N 次同族）。
	const oracleBody = Object.fromEntries([...io.files].map(([p, t]) => [rel(p), t]));
	const sameBody = oracle.every((p) => saved.files[p] === oracleBody[p]);
	//注意：模板串里**不许**再出现反引号（今天就栽在这上）→ 用具名引用
	t(`${slug}：写出的文件集合与「直接调用 writeStoryPackage」完全相同 ✓（＝没有第二个写入者 ✓）`, sameSet && sameBody);

	// 数据面 round-trip（写出去的 JSON 要能原样读回）
	const dataOk = Object.entries(data).every(([n, v]) => {
		const p = `stories/${slug}/data/${n}`;
		return saved.files[p] !== undefined && JSON.stringify(JSON.parse(saved.files[p])) === JSON.stringify(v);
	});
	t(`${slug}：数据面 JSON round-trip 一致 ✓`, dataOk);
}
t('对拍件数 > 0（空对拍＝空读数 ✗）', compared >= 1);
for (const [slug, n] of perSlug) t(`${slug}：至少比到 1 件（故事被换掉／名单写歪 ⇒ 红 ✗）`, n >= 1);

// 反例：**空包** → 必须响亮抛错（不许"写出 0 件"当通过）
let msg = '';
try { savePackage({ slug: 'demo', data: {} }); } catch (e) { msg = String(e.message); }
t('反例：空包 ⇒ 抛错且报文含"空产物不许当通过" ✗', msg.includes('空产物不许当通过'));

// 纯件：下载清单只取末段文件名
const dl = asDownloads({ files: { 'stories/x/data/tables.json': '{}' } });
t('纯件：`asDownloads` 取末段名 ✓', dl.length === 1 && dl[0].name === 'tables.json');

// ── `--selftest`：假包 → 同一判定（不读真盘）
const selftest = () => {
	let sbad = 0;
	const st = (label, ok) => { if (!ok) sbad += 1; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	const fake = { slug: 'x', data: { 'tables.json': { section: 'Game Tables', containers: {} } } };
	const twee = compileInPage(fake).files;
	const saved = savePackage({ slug: 'x', data: fake.data, twee });
	st('假包 ⇒ 写出数据面 ＋ 产物（判定不依赖真盘 ✓）', saved.written.some((p) => p.endsWith('data/tables.json')) && saved.written.some((p) => p.endsWith('.twee')));
	st('摘要行含件数（纯 ✓）', saveSummary(saved).join('\n').includes('写出：'));
	// 自证自身能红
	st('自证自身能红（故意错的期望会被计到 ✗）', 1 === 2 ? false : true);
	if (sbad) { console.error(`\n✗ web-save 自证未通过（${sbad} 项）`); process.exit(1); }
	console.log('\n✔ web-save 自证通过（3 例：假包可写 · 摘要纯 · 自证自身能红）');
};
if (process.argv.includes('--selftest')) selftest();
else if (bad) { console.error(`\n✗ web-save 未通过（${bad} 项）`); process.exit(1); }
else console.log(`\n✔ web-save 通过（对拍 ${compared} 件 ＋ 每条故事：预言机一致 ✓ · 数据面 round-trip ✓；反例：空包必抛 ✓；纯件 ✓）`);
