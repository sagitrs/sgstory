// `#1156`：**「可读键形」的成对断言** —— 单一权威 `editor/lib/core/audit-shared.mjs` 的 `readKeyFamily`
//   与**引擎真源** `src/engine/40-sim/21-resolve.twee` 的 `Sg.rules.readKey` **分支族**必须一致。
// 为什么是断言而不是生成（领队裁 `#1156`）：**权威方向**是「引擎为源、core 为镜像」⇒ 若生成期从 core
//   产出引擎分支 ⇒ core 变主、引擎变派生 ✗（方向反）且生成机器＝新的失败面。跨语言边界（twee 不能 import JS ✓）
//   ⇒ 双份**故意存在**，但**不能悄悄漂移** ✗（`#1054` 族既有手法：成对读数）。
// 两格：① 族集合相等（抽取面**锚在完整语法单元** ✓ 不用"出现即算"松锚 ✗）
//       ② 能假证明（把引擎侧的族改名 ⇒ 格 ① 必须红 ✗ ⇒ 还原 ⇒ 绿 ✓）
import { readFileSync } from 'node:fs';
import { readKeyFamily } from '../editor/lib/core/audit-shared.mjs';

const ENGINE = 'src/engine/40-sim/21-resolve.twee';
let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

/** 从引擎源码**静态抽取** `readKey` 的分支族（锚完整语法单元 ⇒ 每支必须**整句**在 ✓）。 */
export const engineFamiliesOf = (src = readFileSync(ENGINE, 'utf8')) => {
	const start = src.indexOf('readKey(key, pc) {');
	if (start < 0) return null;
	const end = src.indexOf('\n\t},', start);                 // 方法体结束（同级缩进 ✓）
	const body = src.slice(start, end < 0 ? undefined : end);
	const fam = new Set();
	// ① `n_` 笔记族
	if (/if \(k\.startsWith\('n_'\)\) return window\.Sg\.notes\.has\(k, pc\);/.test(body)) fam.add('note');
	// ② 前缀键族（引擎**一支三族** ⇒ 抽取面**展开**成三族 ✓ 领队细化）
	const m = /const m = \/\^\(inv\|era\|gear\):\(\.\+\)\$\/\.exec\(k\);/.exec(body);
	if (m) { fam.add('inv'); fam.add('era'); fam.add('gear'); }
	// ③ 存档面谓词族
	if (/const cx = \/\^codex:\(\.\+\)\$\/\.exec\(k\);/.test(body)) fam.add('codex');
	// ④ 显式根族
	if (/if \(k\.startsWith\('pc\.'\)\) return window\.Sg\.notes\.readPath\(pc, k\.slice\(3\)\);/.test(body)) fam.add('pc');
	// ⑤ 点分 ／ ⑥ 裸键（引擎同一 return 里的三元 ⇒ 两支）
	if (/return window\.Sg\.notes\.readPath\(pc, k\.includes\('\.'\) \? k : `ev\.\$\{k\}`\);/.test(body)) { fam.add('dotted'); fam.add('bare'); }
	return fam;
};

// ── 格 ① 族集合相等 ──────────────────────────────────────────────
const eng = engineFamiliesOf();
t('① 抽取面命中了引擎 `readKey` 的**全部六族**（锚完整语法单元 ✓ 少一支就会红）',
	eng && ['note', 'inv', 'era', 'gear', 'codex', 'pc', 'dotted', 'bare'].every((f) => eng.has(f)));
const CORE = ['note', 'inv', 'era', 'gear', 'codex', 'pc', 'dotted', 'bare'];
const coreFams = new Set(CORE.map((f) => readKeyFamily(f === 'note' ? 'n_x' : f === 'inv' ? 'inv:x' : f === 'era' ? 'era:past'
	: f === 'gear' ? 'gear:x' : f === 'codex' ? 'codex:final' : f === 'pc' ? 'pc.gold' : f === 'dotted' ? 'ev.a.b' : 'gold')));
t(`① 两侧族集合相等（core ${[...coreFams].sort().join('／')} ≡ 引擎 ${eng ? [...eng].sort().join('／') : '抽取失败 ✗'}）`,
	!!eng && coreFams.size === eng.size && [...coreFams].every((f) => eng.has(f)));

// ── 格 ② 能假证明（探针式：引擎侧改名 ⇒ 格 ① 必红）──────────────
const renamed = readFileSync(ENGINE, 'utf8').replace(/const cx = \/\^codex:\(\.\+\)\$\/\.exec\(k\);/, 'const cx = /^codexX:(.+)$/.exec(k);');
t('② 能假证明：把引擎侧 `codex:` 族改名 ⇒ 格 ① 的"六族全中"**当场红** ✗（证明它不是恒真格 ✓）',
	engineFamiliesOf(renamed).has('codex') === false);

if (bad) { console.error(`\n✗ 可读键形成对断言：${bad} 格失败 ✗`); process.exit(1); }
console.log('\n✔ 可读键形成对断言通过 ✓（core 镜像 ≡ 引擎真源；改名即红 ✓）');
