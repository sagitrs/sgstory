// `#1534`／`#1537`（表示面 P1）自证：图形原语 `Sg.draw.bar`／`Sg.draw.list` —— ★无领域语义 ✓
//
// ★判据分两层（照复核席「**黑名单必漏，结构约束漏不掉**」）：
//   ① **结构约束（主判）**：★本件实现块里 **`pc` 命中 0** ＋ **领域词命中 0**（★**先剥注释** ——
//      ✗ 正则扫注释会把说明文字判红 ✓）。★为什么主判取结构：★黑名单**今天扫全引擎就全红**
//      （`hp` 104／`gold` 41／…）★且**必然漏**（`心情`／`钥匙` 同样是"某故事的概念"却不在表里 ✓）。
//   ② **行为**：★`bar` 给数 ⇒ 给定串｜★`list` **空且无 `empty` ⇒ 空串**（✗ 引擎不自造"（空）" ✓）｜★给了 `empty` ⇒ 用故事的 ✓。
import { readFileSync, existsSync } from 'node:fs';
import { maskComments } from '../editor/lib/core/mask.mjs';
import { engineFiles, MODULES } from '../scripts/module-order.mjs';   // ★`#1541`：**归属**的唯一权威（✗ 本地再算一次）

let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

const FILE = 'src/engine/50-present/13-draw.twee';
const raw = readFileSync(FILE, 'utf8');

// ── ① 结构约束（主判）：剥注释后，本块 ✗ 得读 `pc`／✗ 得出现任何键名 ──────────
const code = maskComments(raw, { file: FILE, twee: true });
const pcHits = code.match(/\bpc\b/g) ?? [];
t('★结构（主判）：实现块里 **`pc` 命中 0**（✗ 读 pc ⇒ ✗ 知道去哪个键取值 ✓）', pcHits.length === 0, `命中 ${pcHits.length}`);
// ★领域词**降为例示**（✗ 不作判据）—— 但本件是**新件** ⇒ 它自己该是干净的 ✓
const DOMAIN = ['hp', 'gold', 'inventory', 'gear', 'status', 'salves', 'max_hp'];
const domHits = DOMAIN.filter((w) => new RegExp(`\\b${w}\\b`).test(code));
t('★结构：实现块里**领域词命中 0**（本件是新件 ⇒ 一个都不该有 ✓）', domHits.length === 0, domHits.join('/'));
t('★结构：**剥注释是必需的**（✗ 否则说明文字里的 `pc` 会被判红 ✓）',
	(raw.match(/\bpc\b/g) ?? []).length > 0 && pcHits.length === 0, `剥前 ${(raw.match(/\bpc\b/g) ?? []).length}`);

// ── ② 行为：真调原语（★纯函数 ⇒ node 侧可直接量）────────────────────────
const load = async () => {
	const w = { Sg: {} };
	// ★必须**先剥注释**再当 JS 跑（✗ 否则 twee 的 `/% … %/` 不是合法 JS ✓）—— ★与结构判据同一个遮蔽器 ✓
	new Function('window', code.replace(/^::.*$/m, ''))(w);
	return w.Sg.draw;
};

const D = await load();
{
	const s = D.bar({ value: 7, max: 20, label: '天' });
	t('★行为：`bar({value:7,max:20})` ⇒ 给定串（占比 35% ＋ 文案 `7 / 20` ✓）',
		typeof s === 'string' && s.includes('width:35%') && s.includes('7 / 20') && s.includes('天'), s.slice(0, 90));
	t('★行为：`bar` 的**色全由 `style` 给**（✗ 引擎不内置三档配色 ✓）',
		!D.bar({ value: 1, max: 2 }).includes('background:#'), '默认串里竟出现了配色');
	t('★行为：`bar` 边界 ⇒ **不产字节**（✗ 不印占位 ✓）',
		D.bar({ value: 1, max: 0 }) === '' && D.bar({ value: NaN, max: 10 }) === '');
	t('★行为：`list` 空且**无 `empty`** ⇒ **空串**（✗ 引擎不自造"（空）" ✓）', D.list({ items: [] }) === '', JSON.stringify(D.list({ items: [] })));
	t('★行为：`list` 给了 `empty` ⇒ **用故事的** ✓', D.list({ items: [], empty: '（空空）' }).includes('（空空）'));
	t('★行为：`list` 有项 ⇒ 逐项出现 ✓', (() => { const s2 = D.list({ items: ['甲', '乙'] }); return s2.includes('甲') && s2.includes('乙'); })());
}

// ── ③ ★★“值对了 ≠ 值送到”（`#1541` 评审指出的真缺陷族）：**源码→产物**边界必须在本侧验一次 ──
// 本件前两节全在 node 侧跑源码 ⇒ 它们对“进没进产物”是**瞎的**：✗ 全部绿而 `window.Sg.draw` 在产物里
// 是 `undefined`（实测：`engineFiles()` 读 `modules[f]?.layer ?? 'story'`、**路径不兜底** ⇒ 漏登 `MODULES`
// 的引擎件被当成故事件 ⇒ 两头都不在 `storyOrder()` ⇒ 不进任何故事的产物）。
// 这里钉**三格**，都取**归属判定**而不是“扫产物文本”（后者要 build，会把本段拖成 `exclusive`）：
//   ③a 本件必须在 `engineFiles()` 里（＝它真会进 `scopedFiles()` → 真会进产物）；
//   ③b **归属只能有一个答案**：`MODULES[本件].layer` 与 `engineFiles()` 的判定必须一致
//        （防“只登 ORDER、漏登 MODULES”再现）；
//   ③c 产物面在场：`build/game.twee` 在（且含本件段）―― `npm test` 的 `build` phase 先跑且独占 ⇒ 顺序有保证。
// `#1541` 修复面：`MODULES` 补登 `13-draw`（单行）＋ `build.mjs` 的 `checkRegistration` 开 `requireModules`
//（生产者侧 rc≠0 拦住断链产物）—— 本格是**本件自己的**回归牙（✗ 不靠别人代跑）。
{
	const EF = engineFiles();
	t('★③a **归属**（主判）：本件在 `engineFiles()` 里（⇒ 真会进 `scopedFiles()` → 真会进产物）',
		EF.includes(FILE), `engineFiles() 含本件 = false（长度 ${EF.length}）—— 它今天不会进任何故事的产物`);
	// ③b 两个口径必须同断（本件的归属只此一家）
	const viaModules = MODULES[FILE]?.layer === 'engine';
	t('★③b **单一答案**：MODULES 里本件的 layer 为 engine 与 engineFiles() 同断（✗ 两个口径两个答案）',
		viaModules === EF.includes(FILE), `MODULES 侧 = ${viaModules} ／ engineFiles() 侧 = ${EF.includes(FILE)}`);
	// ③c 产物面在场：build 段先跑且独占（build phase）⇒ 这里读得到；缺失则点名“没 build”而不是静默跳过
	const GT = 'build/game.twee';
	if (!existsSync(GT)) {
		t('★③c 产物在场：build/game.twee 存在（npm test 里由 build phase 段先跑 ⇒ 应有）', false, `${GT} 不存在 —— 请先跑 node build.mjs（本段 ✗ 自建：同概念两处）`);
	} else {
		const gt = readFileSync(GT, 'utf8');
		t('★③c 产物在场且**含本件段**（源码→产物边界，在**产物侧**再问一次）',
			gt.includes('Draw primitives') && gt.includes('sg-bar-fill'), '`build/game.twee` 里找不到本件段（段名/sg-bar-fill 皆无）');
	}
}

if (bad) { console.error(`\n✗ 图形原语自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 图形原语自证通过（结构：pc=0 ／ 领域词=0 ⇒ 无领域语义；行为：bar 给数、list 空则不产字节；归属：engineFiles() 含本件 ＋ 产物含本件段）');
