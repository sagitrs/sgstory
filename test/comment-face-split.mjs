// `#1208`：**分面接线**的能红格 —— 代码面走词法器、散文面留启发式。
//
// 为什么单独立一格（而不是只靠行为读数）：分面这件事的**载体是"哪个调用点用了哪个函数"**。
// 行为读数（金标逐字节）只能证明"当下没变"，证明不了"以后不会有人把散文启发式拿回去扫代码" ✗。
// 所以这里直接把接线钉住：谁该 import 谁、谁不该出现旧名。
//
// 谁能红它：把任一处代码面调用点改回 `stripProseComments`（或让旧名重新出现在代码区），本格必红。

import { readFileSync, existsSync } from 'node:fs';
import { maskComments } from '../editor/lib/core/mask.mjs';
import { stripProseComments } from '../editor/lib/core/audit-shared.mjs';

let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
// 代码区（去掉整行 `//` 注释看，避免注释里的历史记述误判）
const codeOf = (p) => read(p).split('\n').map((l) => (l.trim().startsWith('//') ? '' : l)).join('\n');

// ① 三处**代码面**必须走词法器 `maskComments`
const CODE_FACES = [
	['scripts/audit/gates/state.mjs', '源码读写点扫描'],
	['scripts/report-selftest-validity.mjs', '判 `自证·` 在不在代码里'],
	['editor/lib/core/text.mjs', '机制段（mech）'],
];
for (const [f, why] of CODE_FACES) {
	const c = codeOf(f);
	ok(`①-${f} 用 maskComments（${why}）`, maskComments.name.length > 0 && /maskComments\s*\(/.test(c));
	ok(`①-${f} 不把散文启发式拿来扫代码`, !/stripProseComments\s*\(/.test(c));
}

// ② 散文面必须留启发式（且**只有**散文面用它）
const prose = codeOf('scripts/audit/gates/text.mjs');
ok('②-散文面（总字）用 stripProseComments', /stripProseComments\s*\(/.test(prose));
ok('②-散文面不误用词法器', !/maskComments\s*\(/.test(prose));

// ③ 旧名（名不副实的那一个）在**代码区**不许复活
const revived = [...CODE_FACES.map(([x]) => x), 'scripts/audit/gates/text.mjs', 'editor/lib/core/audit-shared.mjs', 'scripts/audit/lib/shared.mjs']
	.filter((f) => /stripJsComments\s*\(/.test(codeOf(f)));
ok('③-旧名 stripJsComments 在代码区已绝迹', revived.length === 0, revived.join(' / '));

// ④ 两个面**行为上确实是两种东西**（这格同时说明"为什么必须分面"）：
//    词法器不吞真代码；散文启发式**会**吞（它的已知限度 ⇒ 所以只能用在散文面）。
const TRIGGER = ['// 见 `src/engine/**` 的实现', 'const REAL_CODE = 1;', 'function f() { /** 文档 */ }'].join('\n');
ok('④-词法器不吞真代码（代码面权威的底线）', maskComments(TRIGGER).includes('REAL_CODE'));
ok('④-散文启发式会吞（已知限度 ⇒ 故只能扫散文）', !stripProseComments(TRIGGER).includes('REAL_CODE'));
ok('④-散文启发式只有一份定义（audit-shared）',
	(codeOf('editor/lib/core/audit-shared.mjs').match(/export const stripProseComments/g) ?? []).length === 1);

console.log(bad === 0 ? '\n✔ 分面接线全部通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
