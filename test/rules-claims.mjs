// canon 规则层声称门（#247「Game.Rules.claims」，实现名 Game.RuleClaims）——行为门：
// 每条＝一条 canon 条文 × 一条**可执行探针**（渲染某段落 × 某时代 × 某状态 → 断言屏上文本）。
// ① 条文侧：docAnchor 必须逐字存在于 docs/archive/lore-canon.md（条文被改写/删除＝红；`#1077` 随文件入档改道）；
// ② 正文侧：include 必须全部在屏、exclude 必须全部不在屏（正文与 canon 脱钩＝红）；
// ③ 空探针（只有登记没有断言）＝红（防纸面登记）。
// 溯源：#239 类「正文与 canon 各说各话」——人力走查发现，本门把它变成常设防线。
// 用法：node test/rules-claims.mjs [--selftest]
import { readFileSync } from 'node:fs';
// #381：boot 改为**延迟加载**——`--selftest` 是纯函数检查（合成夹具 + 假 render），
// 以前却要先付一次 jsdom 启动（实测 ~15s，与主跑同价）。ESM 顶层 import 会被提升到
// selftest 分支之前，所以只能动态 import。

const SELFTEST = process.argv.includes('--selftest');
const DOC = 'docs/archive/lore-canon.md';   // `#1077`：故事 1 遗产入档——门改守 archive 冻结锚（历史不抹）
const docText = readFileSync(DOC, 'utf8');

// ── 纯函数检查器（合成反例可注入 render）────────────────────────
function checkClaims(claims, canonText, render) {
	const problems = [];
	for (const c of claims) {
		if (!c.docAnchor || !canonText.includes(c.docAnchor))
			problems.push(`条文锚丢失：${c.id} → ${DOC} 里已找不到「${c.docAnchor}」`);
		if (!(c.include?.length || c.exclude?.length))
			problems.push(`空探针（只有登记、没有断言）：${c.id}`);
		const text = render(c);
		if (text == null) { problems.push(`渲染失败：${c.id} → ${c.p}`); continue; }
		for (const s of c.include ?? [])
			if (!text.includes(s)) problems.push(`正文与 canon 脱钩：${c.id} → 「${s}」不在 ${c.p}/${c.era} 屏上`);
		for (const s of c.exclude ?? [])
			if (text.includes(s)) problems.push(`正文与 canon 脱钩：${c.id} → 「${s}」不该出现在 ${c.p}/${c.era}`);
	}
	return problems;
}

// ── 自证：正例 1 ＋ 反例 4（每条反例都必须真的被检出）────────────
if (SELFTEST) {
	console.log('══ canon 规则层声称门 · 自证 ══');
	const mk = (o) => ({ id: 'x', sec: '§0', docAnchor: '在塔门外翻转', p: 'P', era: 'past', include: ['甲'], exclude: [], ...o });
	let bad = 0;
	const cases = [
		['正例（好条目）', [mk({})], (c) => '甲 乙 丙', 0],
		['反例①：include 不在屏', [mk({ include: ['丁'] })], () => '甲 乙', 1],
		['反例②：exclude 命中', [mk({ exclude: ['乙'] })], () => '甲 乙', 1],
		['反例③：条文锚在文档里不存在', [mk({ docAnchor: '这条条文根本不存在于 canon' })], () => '甲', 1],
		['反例④：空探针（只有登记）', [mk({ include: [], exclude: [] })], () => '甲', 1],
	];
	for (const [label, claims, render, expect] of cases) {
		const got = checkClaims(claims, docText, render).length;
		const ok = got === expect;
		console.log(`  ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${expect}）`);
		if (!ok) bad++;
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（正例绿／脱钩红／越界红／条文锚丢失红／空探针红）');
	process.exit(0);   // #381：自证到此为止——以前没有这行，`--selftest` 会**继续跑完整个主流程**：
	                   // 既白花 ~15s（与主跑同价），又把「自证是否通过」和「主跑是否通过」混成一个退出码
}

// ⛔ **退役 ＋ 声明**（`#1004` B2b 复核席）：本件的**真数据半边**原样是——
// `boot()` 起**已删故事** `mist-forest` → 车卡三链 → 读 `Game.RuleClaims.claims` → 逐条渲染探针 → `checkClaims` 对 canon 文档。
//注意：面已消失（实测：`grep -rln 'RuleClaims\|rules\.claims' src/ stories/` → **零消费者**；
// 面夹具 `face-fixture` 只声明接入契约那些面，**不含 `RuleClaims`**）
// → 无对象（不是判据坏了）。
//注意：**声明**：**「canon 规则层声称（`Game.RuleClaims.claims` ↔ canon 文档条文）」这一面自此无端到端守护**
// → 日后要动它 → **先补一个带 `RuleClaims` 的样本**（不为凑绿加样本）。
// 保留：`checkClaims()` 与 `--selftest` 的**全部合成用例原样在册**（判定机制没丢，重开时按原形状接回即可）。
console.log('\n✔ canon 规则层声称门：⛔ 真数据半边随 `mist-forest` 退役（声明见上 ✗）—— `--selftest` 的合成用例仍全在 ✓');
process.exit(0);
