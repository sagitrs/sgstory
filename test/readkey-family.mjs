// `#1156`：**「可读键形」的成对断言** —— 单一权威 `editor/lib/core/audit-shared.mjs` 的 `readKeyFamily`
// 与**引擎真源**（含 `Sg.rules.readKey`，`#1187` 起为 `src/engine/40-sim/22-rules.twee`；本件按锚派生）**分支族**必须一致。
// 为什么是断言而不是生成（领队裁 `#1156`）：**权威方向**是「引擎为源、core 为镜像」→ 若生成期从 core
// 产出引擎分支 → core 变主、引擎变派生（方向反）且生成机器＝新的失败面。跨语言边界（twee 不能 import JS）
// → 双份**故意存在**，但**不能悄悄漂移**（`#1054` 族既有手法：成对读数）。
// 两格：① 族集合相等（抽取面**锚在完整语法单元** 不用"出现即算"松锚）
// ② 能假证明（把引擎侧的族改名 → 格 ① 必须红 → 还原 → 绿）
import { readFileSync } from 'node:fs';
import { readKeyFamily } from '../editor/lib/core/audit-shared.mjs';
import { allSourceFiles } from '../scripts/module-order.mjs';   // `#1187`：引擎件清单（派生用）

// `#1187`：引擎真源**自动派生**（原先硬编 `21-resolve.twee` → 拆模块时本门当场腐烂，
// 实测：`Sg.rules` 拆到 `22-rules.twee` 后本门报"抽取失败"）。
// 口径：锚 `readKey(key, pc) {` 落在哪个引擎件就取那件；找不到 → 返回空串，由本门出声（不静默比空）。
const ENGINE = (() => {
	for (const f of allSourceFiles(['src'])) {
		if (!f.endsWith('.twee')) continue;
		try { if (readFileSync(f, 'utf8').includes('readKey(key, pc) {')) return f; } catch { /* 读不到 → 继续找 */ }
	}
	return '';
})();
if (!ENGINE) { console.error('✗ 读数不成立：引擎件里**派生不到**锚 `readKey(key, pc) {`（门比不了）'); process.exit(1); }
let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

/** 从引擎源码**静态抽取** `readKey` 的分支族（锚完整语法单元 → 每支必须**整句**在）。 */
export const engineFamiliesOf = (src = readFileSync(ENGINE, 'utf8')) => {
	const start = src.indexOf('readKey(key, pc) {');
	if (start < 0) return null;
	const end = src.indexOf('\n\t},', start);                 // 方法体结束（同级缩进）
	const body = src.slice(start, end < 0 ? undefined : end);
	const fam = new Set();
	// ① `n_` 笔记族
	if (/if \(k\.startsWith\('n_'\)\) return window\.Sg\.notes\.has\(k, pc\);/.test(body)) fam.add('note');
	// ② 前缀键族（引擎**一支三族** → 抽取面**展开**成三族 领队细化）
	const m = /const m = \/\^\(inv\|era\|gear\):\(\.\+\)\$\/\.exec\(k\);/.exec(body);
	if (m) { fam.add('inv'); fam.add('era'); fam.add('gear'); }
	// ③ 存档面谓词族
	if (/const cx = \/\^codex:\(\.\+\)\$\/\.exec\(k\);/.test(body)) fam.add('codex');
	// ④ 显式根族
	if (/if \(k\.startsWith\('pc\.'\)\) return window\.Sg\.notes\.readPath\(pc, k\.slice\(3\)\);/.test(body)) fam.add('pc');
	// ⑦ `chk:` 站点结果族（`#1275` 案 A：`chk:<站点>.<字段>`，值域＝**本次点击的运行时结果**表）
	// 两种等价形态都认（避免"谁定形态、谁来凑锚"的反向依赖）：**正则单元**（与 `inv|era|gear`／`codex` 同款）
	// ／**分支头**。任一句**整句**在 ⇒ 该族在 —— 两支都认能扛"加 else／换解析"这类重构，仍抓得住"族改名"。
	if (/const ck = \/\^chk:\(\.\+\)\\\.\(\[a-z\]\+\)\$\/\.exec\(k\);/.test(body)
		|| /(?:^|\s)(?:else\s+)?if \(k\.startsWith\('chk:'\)\) \{/.test(body)) fam.add('chk');
	// ⑤ 点分 ／ ⑥ 裸键（引擎同一 return 里的三元 → 两支）
	if (/return window\.Sg\.notes\.readPath\(pc, k\.includes\('\.'\) \? k : `ev\.\$\{k\}`\);/.test(body)) { fam.add('dotted'); fam.add('bare'); }
	return fam;
};

// ── 格 ① 族集合相等 ──────────────────────────────────────────────
const eng = engineFamiliesOf();
const EXPECT = ['note', 'inv', 'era', 'gear', 'chk', 'codex', 'pc', 'dotted', 'bare'];   // `#1275`：加 `chk:` 族
t(`① 抽取面命中了引擎 \`readKey\` 的**全部 ${EXPECT.length} 族**（锚完整语法单元 ✓ 少一支就会红）`,
	eng && EXPECT.every((f) => eng.has(f)));
const CORE = EXPECT;
const coreFams = new Set(CORE.map((f) => readKeyFamily(f === 'note' ? 'n_x' : f === 'inv' ? 'inv:x' : f === 'era' ? 'era:past'
	: f === 'gear' ? 'gear:x' : f === 'chk' ? 'chk:书房·敲墙.success' : f === 'codex' ? 'codex:final' : f === 'pc' ? 'pc.gold' : f === 'dotted' ? 'ev.a.b' : 'gold')));
t(`① 两侧族集合相等（core ${[...coreFams].sort().join('／')} ≡ 引擎 ${eng ? [...eng].sort().join('／') : '抽取失败 ✗'}）`,
	!!eng && coreFams.size === eng.size && [...coreFams].every((f) => eng.has(f)));

// ── 格 ② 能假证明（探针式：引擎侧改名 → 格 ① 必红）──────────────
// ②b（`#1275`）：`chk:` 族同理 —— 把源码里所有 `chk:` 换成 `chkX:` ⇒ 该族必须从抽取面**消失**。
const renamedChk = readFileSync(ENGINE, 'utf8').replace(/chk:/g, 'chkX:');
t('②b 能假证明：把引擎侧 `chk:` 族改名 ⇒ 该族从抽取面消失（证明本族的锚不是恒真）',
	engineFamiliesOf(renamedChk).has('chk') === false);
const renamed = readFileSync(ENGINE, 'utf8').replace(/const cx = \/\^codex:\(\.\+\)\$\/\.exec\(k\);/, 'const cx = /^codexX:(.+)$/.exec(k);');
t('② 能假证明：把引擎侧 `codex:` 族改名 ⇒ 格 ① 的"六族全中"**当场红** ✗（证明它不是恒真格 ✓）',
	engineFamiliesOf(renamed).has('codex') === false);

if (bad) { console.error(`\n✗ 可读键形成对断言：${bad} 格失败 ✗`); process.exit(1); }
console.log('\n✔ 可读键形成对断言通过 ✓（core 镜像 ≡ 引擎真源；改名即红 ✓）');
