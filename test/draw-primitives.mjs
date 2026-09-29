// `#1534`／`#1537`（表示面 P1）自证：图形原语 `Sg.draw.bar`／`Sg.draw.list` —— ★无领域语义 ✓
//
// ★判据分两层（照复核席「**黑名单必漏，结构约束漏不掉**」）：
//   ① **结构约束（主判）**：★本件实现块里 **`pc` 命中 0** ＋ **领域词命中 0**（★**先剥注释** ——
//      ✗ 正则扫注释会把说明文字判红 ✓）。★为什么主判取结构：★黑名单**今天扫全引擎就全红**
//      （`hp` 104／`gold` 41／…）★且**必然漏**（`心情`／`钥匙` 同样是"某故事的概念"却不在表里 ✓）。
//   ② **行为**：★`bar` 给数 ⇒ 给定串｜★`list` **空且无 `empty` ⇒ 空串**（✗ 引擎不自造"（空）" ✓）｜★给了 `empty` ⇒ 用故事的 ✓。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { maskComments } from '../editor/lib/core/mask.mjs';
import { engineFiles, MODULES } from '../scripts/module-order.mjs';   // ★`#1541`：**归属**的唯一权威（✗ 本地再算一次）
import { DIST_DIR } from '../scripts/dist-paths.mjs';   // ★`#1541` ③c：产物根走**单一权威**（`#1267` 随故事根）

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
	// ★★`#1560`：`list` 的**块标题维**（`label` —— 与 `bar` 的 `label` 对称）。三格＝"给／不给／空块"。
	t('★行为：`list` 给了 `label` ⇒ **标题出现**（`#1560` —— 与 `bar` 的 `label` 对称）',
		D.list({ items: ['甲'], label: '物品栏' }).includes('物品栏'),
		JSON.stringify(D.list({ items: ['甲'], label: '物品栏' })));
	t('★行为：`list` **✗ 不给 `label`** ⇒ 标题位**不产字节**（✗ 引擎不自造名字 ✓）',
		!D.list({ items: ['甲'] }).includes('sg-list-text'), JSON.stringify(D.list({ items: ['甲'] })));
	t('★行为（★这条是本维的**边界**）：空块 ＋ 给了 `label` 但**✗ 没给 `empty`** ⇒ **仍空串**'
		+ '（"空 ⇒ 不产字节"优先 ⇒ ✗ 不许标题把空块"救活" ✓）',
		D.list({ items: [], label: '物品栏' }) === '', JSON.stringify(D.list({ items: [], label: '物品栏' })));
	t('★行为：空块 ＋ 给了 `label` **且**给了 `empty` ⇒ 标题与空文案**同现**（＝故事显式要它看得见 ✓）', (() => {
		const s3 = D.list({ items: [], label: '物品栏', empty: '（空）' });
		return s3.includes('物品栏') && s3.includes('（空）');
	})());
}

// ── ③ ★★“值对了 ≠ 值送到”（`#1541` 评审指出的真缺陷族）：**源码→产物**边界必须在本侧验一次 ──
// 本件前两节全在 node 侧跑源码 ⇒ 它们对“进没进产物”是**瞎的**：✗ 全部绿而 `window.Sg.draw` 在产物里
// 是 `undefined`（实测：`engineFiles()` 读 `modules[f]?.layer ?? 'story'`、**路径不兜底** ⇒ 漏登 `MODULES`
// 的引擎件被当成故事件 ⇒ 两头都不在 `storyOrder()` ⇒ 不进任何故事的产物）。
// 这里钉**三格**，都取**归属判定**而不是“扫产物文本”（后者要 build，会把本段拖成 `exclusive`）：
//   ③a 本件必须在 `engineFiles()` 里（＝它真会进 `scopedFiles()` → 真会进产物）；
//   ③b **归属只能有一个答案**：`MODULES[本件].layer` 与 `engineFiles()` 的判定必须一致
//        （防“只登 ORDER、漏登 MODULES”再现）；
//   ③c 产物面在场：**`<DIST_DIR>/INPUTS.json`** 里列着本件 —— 它是**构建器自己吐的输入清单**
//        （`build.mjs` 的 `writeInputsFingerprint`：件 → sha256），✗ 不是"某段恰好写过的中间文件"。
// `#1541` 修复面：`MODULES` 补登 `13-draw`（单行）＋ `build.mjs` 的 `checkRegistration` 开 `requireModules`
//（生产者侧 rc≠0 拦住断链产物）—— 本格是**本件自己的**回归牙（✗ 不靠别人代跑）。
//
// ★`#1541` 追加（本格自身的**实测缺陷**，修在**产物锚**上）：初版 ③c 读的是 `build/game.twee` ——
//   而那个文件是**逐故事**在 `for (const s of stories)` 里写的 ⇒ **零故事态永不写它**（CI 的 `npm test` 正是零故事）。
//   ⇒ 初版单跑当场红、**只在链上侥幸绿**（靠别的段 `SG_STORIES_DIR=… node build.mjs` 的**副作用**先把它写出来）
//   ⇒ 那是**跨段顺序依赖**（本仓 `run-tests` 的 DAG 明令禁止：段之间只允许通过 `needs` 表达依赖）——
//   证据：`rm -rf build && node build.mjs && node test/draw-primitives.mjs` ⇒ ③c **假红** ✗。
//   改用 `dist/INPUTS.json`：零故事态**也写**（`writeInputsFingerprint` 在故事循环之外），
//   且它列的正是"**哪些件真进了产物**"——与 `engineFiles()` 的**声明面**形成一对比：
//   一个问"它的归属对不对"、一个问"构建器实得有没有把它算进去"（✗ 同一件事两处断）。
{
	const EF = engineFiles();
	t('★③a **归属**（主判）：本件在 `engineFiles()` 里（⇒ 真会进 `scopedFiles()` → 真会进产物）',
		EF.includes(FILE), `engineFiles() 含本件 = false（长度 ${EF.length}）—— 它今天不会进任何故事的产物`);
	// ③b 两个口径必须同断（本件的归属只此一家）
	const viaModules = MODULES[FILE]?.layer === 'engine';
	t('★③b **单一答案**：MODULES 里本件的 layer 为 engine 与 engineFiles() 同断（✗ 两个口径两个答案）',
		viaModules === EF.includes(FILE), `MODULES 侧 = ${viaModules} ／ engineFiles() 侧 = ${EF.includes(FILE)}`);
	// ③c 产物面：`<DIST_DIR>/INPUTS.json` —— 构建器自己吐的**输入清单**（零故事态也写）。
	// ★路径走**单一权威** `DIST_DIR`（`#1267` 随故事根）—— ✗ 不硬编 `dist/`（跑仓外故事时它不在仓内）。
	const INPUTS = join(DIST_DIR, 'INPUTS.json');
	if (!existsSync(INPUTS)) {
		t('★③c 产物面在场：`<DIST_DIR>/INPUTS.json` 存在（build 一跑就写；✗ 不依赖某段先写 `game-<slug>.twee`（★`#1643` CR：逐故事稳定副本；★`#1648`：副本已落**随根**位 `<DIST_DIR>/` ⇒ 共享暂存名全废 ✓））',
			false, `${INPUTS} 不存在 —— 请先跑 node build.mjs（本段 ✗ 自建：同概念两处）`);
	} else {
		const raw = readFileSync(INPUTS, 'utf8');
		let list = null;
		try { list = Object.keys(JSON.parse(raw)); } catch { list = null; }
		t('★③c 输入清单可解析（构建器产物格式未变）', Array.isArray(list) && list.length > 0, `实得 ${raw.slice(0, 80)}`);
		if (Array.isArray(list)) {
			// 认**路径后缀**（清单里是绝对/相对路径，随 `#1267` 故事根而异）⇒ 比末段最稳
			t('★③c **本件真进了产物输入面**（`INPUTS.json` 列出它 —— 源码→产物边界在**产物侧**再问一次）',
				list.some((k) => String(k).endsWith(FILE)), `清单 ${list.length} 件里找不到 ${FILE}`);
		}
	}
}

if (bad) { console.error(`\n✗ 图形原语自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 图形原语自证通过（结构：pc=0 ／ 领域词=0 ⇒ 无领域语义；行为：bar 给数、list 空则不产字节、list 的 label 标题给而现／空块无 empty 仍空；归属：engineFiles() 含本件 ＋ 产物含本件段）');
