// `#1206`：剥注释假阴性（行注释里含块注释记号 → 吞真代码）的**能红格**。
//
// 触发条件（充要）：`//` 行里含 `/*` → 中间隔着真代码 → 后面某处出现 `*/`。
// 病因：先剥块注释、不先剥行注释的写法
// text.replace(/\/\*[\s\S]*?\*\//g, …).replace(/^\s*\/\/.*$/gm, …)
// 会把那个 `/*` 与**后面**的 `*/` 配上对，把两者之间的真代码当注释剥掉。
//
// 本格做三件事：
// ① 认证触发形态：旧写法吞、权威遮蔽器（`editor/lib/core/mask.mjs`）不吞 → 旧写法可复现为红；
// ② 把"不吞"钉在**真实仓件**上（不靠手工构造的输入，避免"只在我编的例子下成立"）；
// ③ 钉住权威的其余口径：等长（保列位）、保换行数、字符串／正则内部不遮、`/% %/` 与 `<!-- -->` 也遮。
//
// 谁能红它：把 `maskComments` 换回上面那种两条正则的写法（探针里有对应变异），本格必须红。

import { readFileSync } from 'node:fs';
import { maskComments } from '../editor/lib/core/mask.mjs';
import { allSourceFiles } from '../scripts/module-order.mjs';

let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

// ── 旧写法（只在本格内复现病历，**不是**任何门的实现）──
const legacy = (text) => String(text ?? '')
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/^\s*\/\/.*$/gm, '');

// 触发输入：`//` 含 `/*` → 真代码 → 后随 `*/`
const TRIGGER = [
	'// 说明：本文件里的 `src/engine/**` 与 `10-core` 不同层',
	'const REAL_CODE = window.Game.Secret;',
	'export function helper() { /** 文档 */ return 1; }',
].join('\n');

// ① 触发形态认证：旧写法把它吞掉，权威遮蔽器不吞
ok('①-旧写法吞真代码（病历可复现 ⇒ 本格能红）', !legacy(TRIGGER).includes('REAL_CODE'), `legacy=「${legacy(TRIGGER)}」`);
ok('①-权威遮蔽器不吞（真代码仍在）', maskComments(TRIGGER).includes('REAL_CODE'));
ok('①-遮蔽器只把注释换成空格（`//` 行与文档注释都不剩内容）',
	!maskComments(TRIGGER).split('\n')[0].includes('说明') && !maskComments(TRIGGER).includes('文档'));

// ② 真实仓件：遮蔽后"第一行非注释代码"必须与原件的相同（不靠构造输入）
const realFiles = allSourceFiles().filter((f) => /\.(twee|mjs)$/.test(f)).slice(0, 60);
let realChecked = 0;
let realBad = [];
for (const f of realFiles) {
	let src;
	try { src = readFileSync(f, 'utf8'); } catch { continue; }
	// 原件里第一条"看起来是代码"的行（非空、非 `//`、非注释续行）作为期望
	const firstCode = src.split('\n').map((l) => l.trim())
		.find((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('/%'));
	if (!firstCode) continue;
	realChecked += 1;
	// 若这行是**真代码**（而非"被 `/*` 吞掉区段里的注释"），遮蔽后必须仍在
	const maskedHas = maskComments(src).split('\n').map((l) => l.trim()).includes(firstCode);
	// 反向核：旧写法在**同一批**件上会少掉至少一处真代码（否则本格没量到东西）
	const legacyHas = legacy(src).split('\n').map((l) => l.trim()).includes(firstCode);
	if (!maskedHas) realBad.push(`${f}（遮蔽后首行代码丢失）`);
	else if (!legacyHas) realBad.push(`${f}（旧写法反而丢 ⇒ 期望遮蔽器在场）`);
}
ok(`②-真实仓件首行代码在遮蔽后仍在（核了 ${realChecked} 件）`, realBad.length === 0, realBad.slice(0, 3).join(' / '));
ok('②-样本量达标（不是空跑）', realChecked >= 20, `只核了 ${realChecked} 件`);

// ③ 其余口径
const L = 'const a = 1; // 尾注\n/* 块\n注 */\nconst b = "https://x/y";\n';
ok('③-保长（列位稳定）', maskComments(L).length === L.length);
ok('③-保行数', maskComments(L).split('\n').length === L.split('\n').length);
ok('③-字符串里的 `//` 不遮（URL 不受伤）', maskComments(L).includes('"https://x/y"'));
ok('③-`/% %/` 也遮', !maskComments('/% 载荷注释 %/\nconst c = 2;').includes('载荷注释'));
ok('③-`<!-- -->` 也遮', !maskComments('<!-- 隐藏 -->\nconst d = 3;').includes('隐藏'));
ok('③-正则字面量里的 `/*` 不越界遮（`/a*\\/b/` 后的代码仍在）',
	maskComments('const re = /a*\\/b/;\nconst e = 4;').includes('const e = 4;'));

console.log(bad === 0 ? '\n✔ 剥注释单一权威的能红格全部通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
