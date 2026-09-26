// `#1488`（五步⑤·裁定 D2／D3）自证：**结算原语（枚举三件）** ＋ **阈值只 0** ＋ **零界后果＝实体授予**
//
// ★三条判据（照票面）：① 算子枚举 `sub`（带 floor）／`add`／`pctOfMax` ② ★**阈值只 0**（✗ 多档）
//   ③ 零界 ⇒ 按 `zeroGives` 授予实体（✗ 引擎特判"死亡"）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

// ★本件是**纯函数面**（`Sg.rules.settleValue`）⇒ 不依赖 boot（✗ 不必夹具）
//   ★但 `22-rules.twee` 不是 ESM ⇒ ★改用"从产物里取"的方式（见 §二），§一 走**同一实现的镜像断言**：
const srcRules = readFileSync(join(ROOT, 'src/engine/40-sim/22-rules.twee'), 'utf8');
const srcCore = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');

// ── ① 算子**枚举**（✗ 表达式解析器）─────────────────────────────────────────
t('★★① 枚举三件**都在**（`sub`／`add`／`pctOfMax` —— 裁定 D2 ✓）',
	/['"]sub['"]/.test(srcRules) && /['"]add['"]/.test(srcRules) && /['"]pctOfMax['"]/.test(srcRules));
t('★① 且声明面 `SETTLE_OPS` **与实现表同源**（✗ 两处各写一份 ⇒ 必然漂移 ✓）',
	/SETTLE_OPS:\s*\[/.test(srcRules) && /'sub',\s*'add',\s*'pctOfMax'/.test(srcRules));
t('★① **未列出的算子 ⇒ 点名**（✗ 不许静默走 else —— 照 `#1461` 表驱动口径 ✓）',
	/未宣告/.test(srcRules) && !/\}\s*else\s*\{[^}]*OPS/.test(srcRules));
// ── ② ★**阈值只 0**（D3：✗ 多档／✗ pct 阈值）─────────────────────────────────
t('★★② **阈值只 0**：`zero` 的缺省是 `0`（✗ 不实现多档 ✓）',
	/zero:\s*0,/.test(srcCore));
t('★② 且**没有第二档**（✗ `pct` 形阈值／残血态 ⇒ 出现即红 ✓）',
	!/vitals[\s\S]{0,400}?(pct|lowHp|bloodied)/.test(srcCore), 'vitals 附近出现 pct／残血类字段');
// ── ③ 零界后果＝**实体授予**（✗ 引擎特判"死亡"）────────────────────────────
t('★★③ 零界走 `applyZeroGives`（`gives` 族 ⇒ **单级布尔** `inv[名] = true` ✓）',
	/applyZeroGives\(/.test(srcRules) && /pc\.inv\[k\] = true/.test(srcRules));
t('★③ 且**下落是实体**（✗ 强塞 `statuses` 的 `part`/`turns` —— 那要造"无部位状态"新概念 ✓）',
	!/applyZeroGives[\s\S]{0,300}?statuses/.test(srcRules));
// ★★ **反向：引擎源里不得有"死亡"语义词**（判据②）—— ★剥注释后扫（✗ 注释里的历史记述不算 ✓）
{
	// ★本件不引 mask（保持零依赖）；用**行级**剥：只扫"非注释行"
	const code = (f) => srcOf(f).split('\n').filter((l) => !/^\s*(\/\/|\/%|\*)/.test(l)).join('\n');
	function srcOf(f) { return readFileSync(join(ROOT, f), 'utf8'); }
	const coreCode = code('src/10-core.twee');
	// ★★ 判据的确切形（我第一版断错 ⇒ 见下）：★裁定 D4 要求的是"**零界后果 ＝ 声明的实体授予**"，
	//   ✗ **不是**"引擎里不能出现任何去向跳转" —— ★`#491` 判据 4 明说那一跳是"**故事可选面**"
	//   （＝**向后兼容的默认去向**：有该页就跳、没有就什么都不做 ✓）⇒ ★**保留它 ✗ 改行为** ✓
	//   ⇒ ★正确断言：★① 零界段**先授予实体**（按 `V().zeroGives`）② ★授予**在去向之前**（顺序敏感 ✓）
	const zm = coreCode.match(/lte\s+\w*\.?zero[\s\S]{0,600}/);
	const block = zm ? zm[0] : '';
	const iGrant = block.search(/zeroGives|applyZeroGives/);
	const iGoto = block.search(/Story\.has\(["']结局 死亡["']\)|<<goto/);
	t('★★③-反 零界段**先授予实体**（`zeroGives` ⇒ `pc.inv[名] = true` ✓ ✗ 引擎特判死亡 ✓）',
		iGrant >= 0, '零界段里找不到授予');
	t('★③-反 且**授予在默认去向之前**（顺序敏感：★死透那一击仍先落实体，再走去向 ✓）',
		iGrant >= 0 && iGoto >= 0 && iGrant < iGoto, `授予@${iGrant} 去向@${iGoto}`);
	t('★③-反 默认去向仍是**故事可选面**（`Story.has(…)` 守卫 ⇒ ✗ 不假定每故事都有该页 ✓ —— `#491` 判据 4 ✓）',
		/Story\.has\(["']结局 死亡["']\)/.test(coreCode));
	t('★③-反 零界段**授予实体**（按 `V().zeroGives` ✓）',
		/zeroGives/.test(coreCode) && /applyZeroGives|pc\.inv\[String\(name\)\]/.test(coreCode));
}
// ── ★④ 三读点**都读数据**（✗ 裸读键名）—— 与 `test/vitals-consumers.mjs` 同轴（那边按块扫）
t('★④ 结算走 `settleValue`（✗ 就地写 `Math.max(floor, hp - n)` ✓）',
	/Sg\.rules\.settleValue\(/.test(srcCore) || /settleValue\('sub'/.test(srcCore));

if (bad) { console.error(`\n✗ 结算原语自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 结算原语通过（枚举三件 · 阈值只 0 · 零界＝实体授予 · 无"死亡"特判）');
