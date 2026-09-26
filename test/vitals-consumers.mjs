// `#1487`（T 的消费面格，裁定甲）：**"结算点真读数据"的静态判据** —— 按**块**扫（✗ 不整文件 ✓）
//
// ★为什么需要它（T 的刀给的实证）：★把 `vk('hp')` 整份撤回（改回字面量 `'hp'`）⇒
//   ★**86 格 ＋ 五段全绿** ✗ ⇒ ★即"**无人守消费点**" —— 而本票的正题恰是"结算逻辑里 ✗ 出现键名字面量" ✓
//   ⇒ ★故要一格**直接扫源码的结算块**：断「旧形命中 0 ＋ 新形命中 ≥ 1」✓
//
// ★为什么**按块**扫（✗ 不整文件）：★`10-core:545` 的 hpbar 是**展示**字面量（归 `#1518` 展示票）⇒
//   ★整文件扫 ⇒ **假红** ✗（展示面**允许**用键名 —— D1 明说"展示层需要键名 ⇒ 展示层读数据" ✓）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// ★★ 必须用**全仓唯一遮蔽器**剥注释（本仓口径 ✓）——★实测：`resolveFoe` 的注释里**记述着旧写法**
//   （「旧写法 `if (pc.hp > 0)` 是裸读」）⇒ ★不剥 ⇒ **假红** ✗（它记述历史，✗ 不是活代码 ✓）
import { maskComments } from '../editor/lib/core/mask.mjs';
const ROOT = process.cwd();
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

/** 取 `<<widget "名">> … <</widget>>` 的正文（含头行）。 */
const widgetBody = (src, name) => {
	const i = src.indexOf(`<<widget "${name}">>`);
	if (i < 0) return null;
	const j = src.indexOf('<</widget>>', i);
	return j < 0 ? src.slice(i) : src.slice(i, j);
};
/** 取 `名(…) { … }` 方法体（大括号配对 ⇒ ✗ 不按行猜）。 */
const methodBody = (src, name) => {
	const i = src.indexOf(`\t${name}(`);
	if (i < 0) return null;
	const open = src.indexOf('{', i);
	if (open < 0) return null;
	let depth = 0;
	for (let k = open; k < src.length; k++) {
		if (src[k] === '{') depth++;
		else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
	}
	return src.slice(i);
};

const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
const combat = readFileSync(join(ROOT, 'src/engine/40-sim/40-combat.twee'), 'utf8');

// ── 块清单（★本票声称"结算点已读数据"的那些块）────────────────────────────────
const BLOCKS = [
	['10-core 的 `<<damage>>`', widgetBody(core, 'damage')],
	['40-combat 的 `settle`', methodBody(combat, 'settle')],
	['40-combat 的 `resolveFoe`', methodBody(combat, 'resolveFoe')],
].map(([n, b]) => [n, typeof b === 'string' ? maskComments(b, { file: n, twee: false }) : b]);   // ★剥注释（✗ 历史记述 ✗ 活代码 ✓）
// ★每块必须**真取到**（✗ 取不到 ⇒ 本件"没对象"，✗ 不假装绿 ✓）
for (const [name, body] of BLOCKS) {
	t(`① 块取到：${name}（✗ 取不到 ⇒ 本件没对象 ✓）`, typeof body === 'string' && body.length > 40, String(body ?? '(null)').slice(0, 60));
}
// ★旧形（结算块里 ✗ 允许）：裸读量纲键名／裸比零界字面量
const OLD = [/pc\.hp\b/, /pc\.max_hp\b/, /pc\.salves\b/, /\$pc\.hp\b/, /\$pc\.max_hp\b/, /\$pc\.salves\b/];
// ★新形（必须有）：`vk('…')` 取值
const NEW = [/vk\('/, /V\(\)/];
for (const [name, body] of BLOCKS) {
	if (typeof body !== 'string') continue;
	const hitOld = OLD.filter((re) => re.test(body));
	const hitNew = NEW.filter((re) => re.test(body));
	t(`★★② ${name}：**旧形命中 0**（✗ 裸读量纲键名 —— 本票正题 ✓）`, hitOld.length === 0, hitOld.map(String).join(' / '));
	t(`★★③ ${name}：**新形命中 ≥1**（vk(…) ／ V() ✓）`, hitNew.length >= 1, '未取到 vk/V');
}
// ★反向（防空判）：**展示块**（hpbar／`snap`）**允许**字面量 ⇒ ★本件**不扫它**（✗ 扫了就是假红 ✓）
t('★④ 反向：本件的**块清单里不含展示块**（hpbar 归 `#1518` ⇒ ✗ 不整文件扫 ✓）',
	!BLOCKS.some(([, b]) => typeof b === 'string' && /hpbar/.test(b)));

if (bad) { console.error(`\n✗ vitals 消费面自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ vitals 消费面通过（结算块：旧形 0 ／ 新形 ≥1 —— 展示块不扫）');
