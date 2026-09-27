// `#1534`／`#1537`（表示面 P1）自证：图形原语 `Sg.draw.bar`／`Sg.draw.list` —— ★无领域语义 ✓
//
// ★判据分两层（照复核席「**黑名单必漏，结构约束漏不掉**」）：
//   ① **结构约束（主判）**：★本件实现块里 **`pc` 命中 0** ＋ **领域词命中 0**（★**先剥注释** ——
//      ✗ 正则扫注释会把说明文字判红 ✓）。★为什么主判取结构：★黑名单**今天扫全引擎就全红**
//      （`hp` 104／`gold` 41／…）★且**必然漏**（`心情`／`钥匙` 同样是"某故事的概念"却不在表里 ✓）。
//   ② **行为**：★`bar` 给数 ⇒ 给定串｜★`list` **空且无 `empty` ⇒ 空串**（✗ 引擎不自造"（空）" ✓）｜★给了 `empty` ⇒ 用故事的 ✓。
import { readFileSync } from 'node:fs';
import { maskComments } from '../editor/lib/core/mask.mjs';

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

if (bad) { console.error(`\n✗ 图形原语自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 图形原语自证通过（结构：pc=0 ／ 领域词=0 ⇒ 无领域语义；行为：bar 给数、list 空则不产字节）');
