// `#1538`（表示面 P2）契约成员 `panels` 的判据件 —— 规格在 `editor/lib/core/contract-defaults.mjs`
// 与 spec `docs/superpowers/specs/display-face.md` §1.2／§2.2／§5。
//
// ★范围（裁定甲：声明面与消费面分期）：本件只判**声明的登记与编译** —— 引擎**真按它渲染**是 P3（`#1539`）的语义位。
//   ⇒ 「零声明 ⇒ 玩家面不渲染」（spec §3／§4④）是**消费点**义务，**✗ 不在本件断言**（本件没有消费点可判）。
//
// ★为什么本件存在（照 `test/pc-defaults.mjs` 的定位）：新契约成员的**失效方式**有四类，
//   每一类都要有一格守着；否则"加了成员"与"加了成员且能被正确消费"**读数相同**。
//
// 判据：
// ① **面在但空**：缺省规格里有 `panels` 且 `kind === 'empty-array'`。
//    ★为什么：`defaultProblems` 对"已声明 ＋ 被读 ＋ 缺省规格里没有它"报 `default-missing`（读者必须先补缺省或加守卫）
//    ⇒ 缺这一行，普通故事一声明 `panels` 就会撞那条门。
// ② **不属必给**：`panels` ✗ 在 `REQUIRED_MEMBERS`（spec §1.2 定它是**可选声明**；
//    入必给集 ⇒ "可选"变"必给" ✗ —— 与 Q2 定位冲突）。
// ③ **编译层真的能发射它**（★本件的核心格）：把一份 `panels` 声明喂 `emitContract()`，
//    产物里必须出现该成员且**逐字保住声明**（值相同、`as`／`props` 结构相同）。
//    ★能假：若 `KINDS` 不认 `const` 数组、或 `emitContract` 的 hoist 分支漏此类，本格当场红。
// ④ **形不归一**（`#1535` 评审否掉乙案的机检形）：`bar` 的 prop 带 `maxKey`、`list` 的 prop 带 `empty`，
//    **发射后各自保住自己的键集** —— ✗ 不许被"统一成一个 prop 形状"（★那正是乙案"形跟着最弱的用法走"）。
// ⑤ **同一性**（`emit.mjs` 的 `__const_*` 语义）：两次调用返回**同一个对象**
//    ——★若就地内联成 `() => ({…})`，每次调用都是新对象 ⇒ 改声明面不生效（该坑 `emit.mjs` 注释里记着实测）。
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { DEFAULTS, REQUIRED_MEMBERS, equalsDefault } from '../editor/lib/core/contract-defaults.mjs';
import { emitContract } from '../editor/lib/core/emit.mjs';

let bad = 0;
const t = (label, ok, detail = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`); }
};

// ── ① 面在但空（缺省规格的形态）────────────────────────────────────────────
{
	const spec = DEFAULTS.panels;
	t('① 缺省规格有 `panels`（✗ 否则普通故事一声明它就撞 `default-missing`）', spec !== undefined);
	t('① 形态 = `empty-array`（"这一面在，但空"——与 `rules`／`combatPool` 同族）',
		spec?.kind === 'empty-array', `实得 ${JSON.stringify(spec)}`);
	t('① `equalsDefault({ name: \'panels\', kind: \'empty-array\' })` ⇒ true（冗余声明判定可用）',
		equalsDefault({ name: 'panels', kind: 'empty-array' }));
}

// ── ② 不属必给 ────────────────────────────────────────────────────────────
{
	t('② `panels` ✗ 在 `REQUIRED_MEMBERS`（spec §1.2：可选声明；入必给集 ⇒ "可选"变"必给" ✗）',
		!REQUIRED_MEMBERS.has('panels'));
}

// ── ③④⑤ 编译层：真喂一份声明走 `emitContract()`，读发射结果（✗ 不读文档措辞）────
// ★声明的**形状**照 spec §2.2 的示例形（`bar` 带 `valueKey`/`maxKey`；`list` 带 `valueKey`/`empty`）。
const DECL = [
	{ as: 'bar', props: [{ slot: 'sidebar.primary', valueKey: 'hp', maxKey: 'max_hp', label: '生命', style: 'hp' }] },
	{ as: 'list', props: [{ slot: 'sidebar.primary', valueKey: 'inv', empty: '（空）' }] },
];
{
	const out = emitContract({
		section: 'StoryBindings',
		members: [{ name: 'rules', kind: 'empty-array' }, { name: 'panels', kind: 'const', value: DECL }],
	});
	// ③ 编译层能发射 ＋ 逐字保住
	const ctx = { window: {}, Object, JSON, console };
	let threw = null;
	try { vm.runInNewContext(out, ctx); } catch (e) { threw = e; }
	t('③ `emitContract()` 接受 `panels`（`kind:\'const\'` ＋ 数组值）并**不抛**', threw === null,
		threw ? String(threw.message).slice(0, 120) : '');
	const face = ctx.window?.Sg?.story?.panels;
	t('③ 产物里**出现**该成员（`window.Sg.story.panels` 是函数 —— 消费点靠它取值）', typeof face === 'function',
		`实得 typeof = ${typeof face}`);
	if (typeof face === 'function') {
		const got = face();
		t('③ **逐字保住声明**（发射后与声明深等 —— ✗ 不许丢字段／改序／补默认）',
			JSON.stringify(got) === JSON.stringify(DECL),
			`期望 ${JSON.stringify(DECL)}／实得 ${JSON.stringify(got)}`);
		// ④ 形不归一
		const barProp = got?.find((p) => p.as === 'bar')?.props?.[0] ?? {};
		const listProp = got?.find((p) => p.as === 'list')?.props?.[0] ?? {};
		t('④ `bar` 的 prop 保住 `maxKey`（区间形的上界 —— ✗ 被归一掉）', 'maxKey' in barProp, JSON.stringify(barProp));
		t('④ `list` 的 prop **没有** `maxKey`（一元列表没有"上界"这一维 —— ✗ 被补齐）',
			!('maxKey' in listProp), JSON.stringify(listProp));
		t('④ 两形的 prop **键集不同**（★机检形：`#1535` 评审否掉乙案"形跟着最弱的用法走"的落点）',
			JSON.stringify(Object.keys(barProp).sort()) !== JSON.stringify(Object.keys(listProp).sort()),
			`bar=${Object.keys(barProp).sort().join('、')}／list=${Object.keys(listProp).sort().join('、')}`);
		t('④ `list` 的 `empty` 保住（"故事可显式给 `empty`"是 spec §2.1 红线③ 的故事侧权利）', 'empty' in listProp);
		// ⑤ 同一性（`__const_*` 语义）
		t('⑤ 两次调用返回**同一个对象**（改声明面 ⇒ 消费点跟着变；✗ 每次新对象）', face() === face());
	}
}

// ── ⑥ ★★（评审提请）**能被声明**那一面 ＋ **声明形态错 ⇒ 点名**（P2 的分期底线）──────
// ★为什么单独一组：本仓已有一条门 `dead-declaration`（`contract-defaults.mjs:364`：
//   “**声明了但引擎从不读**” ⇒ `test/contract-defaults.mjs:88` 把它归**失败面**，计入退出码）。
//   ⇒ 若只有 `DEFAULTS.panels` 而 **无引擎读点** ⇒ **任何故事一声明 `panels` 就红** ⇒
//   “声明面先行、消费面在后”的分期就**没有可声明窗口**（而 spec §3.1 正是要求故事**能先声明**：
//   “补一块声明 ⇒ 那一块**立即**改走声明”）。
//   ★本组的价值＝把“**只有声明面时也能如实声明**”变成**机检**（✗ 靠人记得先落读点）。
//   ★能假：把 `src/10-core.twee` 的 `panels()` 读点删掉 ⇒ ⑥a 当场红。
{
	const core = readFileSync('src/10-core.twee', 'utf8');
	// ⑥a 引擎侧**有读点**：`panels()`（与 `vk()`／`vl()` 同族的声明取值口）
	//     ★它**不渲染**（渲染归 P3 的消费面）—— 只把声明的**规范化与只读**放一处。
	t('⑥a 引擎侧**有** `panels` 读点（✗ 无读点 ⇒ 任何故事一声明它就撞 `dead-declaration` 失败面）',
		/panels\s*\(\s*\)\s*\{/.test(core), '`src/10-core.twee` 里没有 `panels()` 读点');
	// ⑥b 形态错 ⇒ fail-loud（照本仓同族教训：`#1543` 的 `fight` 类型错**静默路径**是门禁级缺陷）
	t('⑥b 读点对**非数组**声明 fail-loud（✗ 不静默当空 —— 与 `pcDefaults` 同族口径）',
		/panels\(\)[\s\S]{0,900}?Array\.isArray\(raw\)[\s\S]{0,400}?throw new Error/.test(core),
		'读点里找不到“非数组 ⇒ throw”那一支');
}

if (bad) { console.error(`\n✗ \`panels\` 声明维判据失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ `panels` 声明维通过（面在但空 · 非必给 · 编译层逐字发射 · 形不归一 · 同一性 · 有读点 · 形态错 fail-loud）');
console.log('  ○ 未判（**不在本件范围**）：spec §3／§4④ 的「零声明 ⇒ 玩家面不渲染」—— 那是**消费点**义务。'
	+ '★自 `#1539`（P3）起，该面由 `test/panels-render.mjs` 承接（本件与它**不同断**：本件判声明面，它判消费面）。');
