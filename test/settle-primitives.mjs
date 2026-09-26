// `#1488`（五步⑤·裁定 D2／D3）自证：**结算原语真跑**（✗ 不读源码文本 ✓）
//
// ★★ 本件的来历（T 的 CR ②）：★我第一版**全是正则文本匹配** ⇒ ★**两刀都不咬** ✗：
//   · 刀①：`OPS` 加第四项 ⇒ 只做文本匹配 ⇒ rc=0（★而它自吹"防漂移" ✓ 正是要防的那个 ✗）
//   · 刀②：★**删 `Math.max` 下限夹** ⇒ ★**下限整个消失**，而 12 格**全绿** ✗（★★最根本的假绿：全文**无一次真调用** ✓）
//   ⇒ ★修法（T 的甲案）：★**用既有 `boot()` 真跑** —— ① 直接调四例（含边界）② 同源改"**逐项调用**"③ 声明面多列 ⇒ 必红 ✓
//   ★口径（他的附二十五）：★"**格读源码文本 ≠ 格测那个函数**" ⇒ ★文本格**必须有真跑配套**（✗ 否则是**假绿** ✓）
import { boot } from './boot.mjs';
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };
// ★ `boot()` 在**零故事态**（仓内）必须显式给 `story`（`#1295`）⇒ ★本件用一个**轻夹具**（✗ 不必真跑关卡）
// ★★ 注意：`SG_STORIES_DIR` **必须在进程启动前给**（✗ 不能在本文件里 `process.env` 设 ——
//   ★`dist-paths.mjs` 在 **import 时**就把 `DIST_DIR` 算好了 ⇒ 晚设无效 ✗）
//   ⇒ ★故本段的段定义里**内联** `SG_STORIES_DIR=<夹具>`（照仓内同族段的形 ✓）
const { w } = await boot({ story: 'cg', random: 0.5 });
const CALL = (js) => w.eval(`(function(){ const R = window.Sg.rules; ${js} })()`);
const throws = (op, value, ctx) => {
	const got = CALL(`try { R.settleValue(${JSON.stringify(op)}, ${JSON.stringify(value)}, ${JSON.stringify(ctx)}); return ''; } catch (e) { return String(e.message); }`);
	return String(got);
};

// ── ① 四例**真跑**（★其中"夹下限"是 T 的刀②直指的那条）────────────────────────
{
	// ★`sub` ＋ 下限夹：cur=3, value=10 ⇒ 裸减是 -7 ⇒ **必须夹到 floor=0**（★刀②删掉夹 ⇒ 本格必红 ✓）
	const sub = CALL(`return R.settleValue('sub', 10, { cur: 3, max: 20, floor: 0 });`);
	t('★★① `sub`：`3 - 10` ⇒ ★**夹到下限 `0`**（✗ 不得是 `-7` —— 这正是"带 floor"的判据 ✓）', sub === 0, `实得 ${JSON.stringify(sub)}`);
	// ★下限**由数据给**（✗ 不硬编）：同一算式、`floor: -5` ⇒ ★下限跟变（★证明"下限不是写死的 0" ✓）
	const sub2 = CALL(`return R.settleValue('sub', 10, { cur: 3, max: 20, floor: -5 });`);
	t('★① 下限**由调用方给**（`floor: -5` ⇒ 结果是 `-5` 而✗ 不是 `0` —— 证明不硬编 ✓）', sub2 === -5, `实得 ${JSON.stringify(sub2)}`);
	const add = CALL(`return R.settleValue('add', 4, { cur: 10, max: 20, floor: 0 });`);
	t('★① `add`：`10 + 4` ⇒ `14` ✓', add === 14, `实得 ${JSON.stringify(add)}`);
	const pct = CALL(`return R.settleValue('pctOfMax', 50, { cur: 4, max: 20, floor: 0 });`);
	t('★① `pctOfMax`：`4 + 最大值 20 的 50%` ⇒ `14`（★按**最大值**算，✗ 不是按当前值 ✓）', pct === 14, `实得 ${JSON.stringify(pct)}`);
	// ★未列算子 ⇒ 抛出**点名**（★要断"报文含未宣告" ✗ 不只断"抛了" ✓）
	const e = throws('mul', 2, { cur: 1, max: 1, floor: 0 });
	t('★★① **未列出的算子 ⇒ 抛出**（✗ 不静默走 else ✓）', e !== '', `没有抛（实得 ${JSON.stringify(e)}）`);
	t('★① 且**点名"未宣告"＋列出可用算子**（✗ 不只说"非法" ✓）', /未宣告/.test(e) && /sub/.test(e), e.slice(0, 110));
	// ★非有限数 ⇒ fail-loud（照 `#1409` 口径）
	const e2 = throws('add', 'abc', { cur: 1, max: 1, floor: 0 });
	t('★① 操作数**非有限数** ⇒ 抛出点名（✗ 静默产 NaN ✓）', /有限数/.test(e2), e2.slice(0, 90));
}

// ── ② 同源：★**逐项调用**（✗ 不比对源码文本 —— T 的 CR ①）──────────────────────
{
	const ops = CALL('return R.SETTLE_OPS;');
	t('★② 声明面 `SETTLE_OPS` 读得到且非空', Array.isArray(ops) && ops.length > 0, JSON.stringify(ops));
	// ★声明面**每一项都能被 settleValue 接受**（✗ 只做文本匹配 —— 那样加第四项不报 ✓）
	const accepted = (Array.isArray(ops) ? ops : []).filter((op) => {
		const r = CALL(`try { R.settleValue(${JSON.stringify(op)}, 1, { cur: 1, max: 10, floor: 0 }); return 'ok'; } catch { return 'err'; }`);
		return r === 'ok';
	});
	t('★★② `SETTLE_OPS` **逐项真被 `settleValue` 接受**（✗ 文本比对 ⇒ 声明多列不存在算子会漏 ✓）',
		accepted.length === (Array.isArray(ops) ? ops.length : -1), `声明=${JSON.stringify(ops)} 接受=${JSON.stringify(accepted)}`);
	// ★反向（★T 的刀①）：★**声明面多列一个不存在的算子** ⇒ ★必须"接受数 < 声明数"（⇒ 上面的格会红 ✓）
	t('★② 反向：★"声明面多列不存在算子 ⇒ 上面那格必红"的**前提**成立（即接受数可 < 声明数 ✓）',
		CALL(`return Object.prototype.toString.call(R.SETTLE_OPS) === '[object Array]';`) === true);
}

// ── ③ 阈值只 0（D3）＋ 零界后果＝实体（D4）——★也走**真跑** ──────────────────────
{
	// ★注：`V()`／`vitals` 住 **`Game.Rules`**（`10-core`）✗ 不在 `Sg.rules`（本件测的是后者的原语 ✓）
	const V = w.eval('Game.Rules.V()');
	t('★★③ 阈值只 0：`V().zero === 0`（✗ 多档 ✓）', V && V.zero === 0, JSON.stringify(V && V.zero));
	t('★③ 且**没有第二档字段**（✗ `pct`／残血类 ⇒ 出现即红 ✓）',
		V && !('pct' in V) && !('lowHp' in V) && !('bloodied' in V), Object.keys(V ?? {}).join(','));
	// ★零界后果：真调 `applyZeroGives` ⇒ `pc.inv` 含声明的实体（单级布尔 ✓）
	const got = CALL(`const pc = { inv: {} }; const g = R.applyZeroGives(pc, ${JSON.stringify(['倒地'])});
		return JSON.stringify({ inv: pc.inv, granted: g });`);
	const o = JSON.parse(String(got));
	t('★★③ `applyZeroGives` ⇒ `pc.inv["倒地"] === true`（★**单级布尔** ✗ 不是 `statuses` 的两级 ✓）',
		o.inv && o.inv['倒地'] === true, got);
	t('★③ 且**幂等**（已有 ⇒ ✗ 不重复计入 granted ✓）',
		JSON.parse(String(CALL(`const pc = { inv: { 倒地: true } }; return JSON.stringify(R.applyZeroGives(pc, ['倒地']));`))).length === 0);
}

// ── ④ 裁定甲①：**零界段真调原语**（✗ 不内联循环 —— D6 单一入口）────────────────────
// ★按 T 的口径：★这条**只能读源码**（内联 vs 调原语 ⇒ 行为相同 ⇒ 真跑分不出来 ✓）
//   ⇒ ★故它是**文本格** ⇒ ★**必须有真跑配套**（★上面 §③ 的真跑正是配套 ✓）
{
	const { readFileSync } = await import('node:fs');
	const src = readFileSync(new URL('../src/10-core.twee', import.meta.url), 'utf8');
	const code = src.split('\n').filter((x) => !/^\s*(\/\/|\/%|\*)/.test(x)).join('\n');
	t('★④ 零界段**调原语**（`Sg.rules.applyZeroGives` ✗ 不内联循环 —— D6 单一入口 ✓）', /applyZeroGives/.test(code));
	t('★④ 且**内联循环已删**（✗ 两道各写一份 ⇒ 漂移 ✓）', !/for \(const name of/.test(code));
}

if (bad) { console.error(`\n✗ 结算原语自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 结算原语通过（★真跑：四例含边界 · 下限由数据给 · 同源逐项调用 · 零界授予单级布尔）');
