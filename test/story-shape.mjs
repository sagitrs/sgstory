// 故事「新机制声明表」形状门（`#459` 剩余：形状落码 · 伞 `#441`／`#482`）
//
// 两道检查：
//   ① **真实契约**：当前故事（`Sg.story.mechanics()`）必须是「未启用」或「形状合法」——两者都不许是"看着像表其实坏掉"；
//   ② **自证（形状即判据的六条）**：每一条都给 正例（必须放过）＋ 反例（**必须抓住**）。
// 为什么必须有 ②：`docs/dev-conventions.md` §9 —— 打印了 `自证·` 不等于自证有效，**失败要计入退出码**，
// 且失败路径不能崩（本文件的 `bad` 计数器声明在**最前**，并进 `process.exit`）。
//
// 用法：node test/story-shape.mjs
import { createContext } from '../scripts/audit/context.mjs';
import { validateStoryMechanics, GRADE_SET, REDUCE_FORMS } from '../scripts/audit/lib/story-shape.mjs';

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

// ── 一份**合法**的基线声明（照 `#459` 的契约草案；各反例都从它派生一条错）──
const base = () => ({
	slots: {
		body: { protects: '躯干', label: '衣服' },
		head: { protects: '头', label: '头盔' },
		neck: { protects: null, label: '项链' },   // 不保护部位：可装备，但不参与部位减成
	},
	hitLocations: ['手', '手臂', '肩膀', '头', '躯干', '腿', '脚'],
	equipment: {
		皮甲: { slot: 'body', maxHp: 12, reduce: { flat: 2 } },
		长剑: { slot: 'body', maxHp: 8, reduce: { flat: 1 }, weapon: true },
	},
	statuses: {
		// #487（S2）：新增 `turns`（必填）· `perRound.hp`（可选）· `onFail` 效果只认已实现的两形态
		bleed: { label: '流血', parts: '*', turns: 5, perRound: { hp: -1 }, check: { attr: 'con', dc: 12 }, onFail: [{ harm: 'damage', dice: '1d4', when: 'most' }, { addStatus: 'random', part: 'random', when: 'low' }] },
		stun: { label: '眩晕', parts: ['头'], turns: 3, check: { attr: 'con', dc: 14 }, onFail: [{ harm: 'damage', dice: '1', when: 'most' }, { addStatus: 'random', part: 'random', when: 'low' }] },
	},
	statusPenalty: { 'stun@头': { check: -2 } },   // #487：本片只认 check（该部位判定减成）
	encounters: {
		short: { waves: [{ pool: 'cave.w1', difficulty: 1 }] },
		long: { waves: [{ pool: 'cave.w1', difficulty: 1 }, { pool: 'cave.w2', difficulty: 2, reinforce: true }], rewardsScale: 1.5 },
	},
	roads: [
		{ from: 0, to: 1, options: [{ kind: 'short', hint: '碎石间有拖行的痕迹' }, { kind: 'chest', hint: '岩壁凹处反着一点金属光' }, { kind: 'trap', hint: '地面浮土比别处松' }] },
	],
});
const ctx = { poolNames: () => ['cave.w1', 'cave.w2'], abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'] };
const run = (m) => validateStoryMechanics(m, ctx);
/** 派生一个"错一处"的声明：`mut` 收到深拷贝后可随意改。 */
const mutate = (mut) => { const m = JSON.parse(JSON.stringify(base())); mut(m); return m; };

console.log('══ 故事新机制声明表 · 形状门（六条可机检点）══');

// ── ① 保护关系 ──
case_('① 正例：protects 都在 hitLocations 里（含 null 的不保护槽）', run(base()).problems.length === 0, JSON.stringify(run(base()).problems));
case_('① 反例：protects 写了 hitLocations 之外的部位 ⇒ 必须抓（该槽位永远打不到）',
	run(mutate((m) => { m.slots.body.protects = '尾巴'; })).problems.some((p) => p.includes('永远打不到')));
case_('① 反例：槽位名（label）缺失 ⇒ 必须抓', run(mutate((m) => { delete m.slots.head.label; })).problems.some((p) => p.includes('label')));
case_('① 反例：hitLocations 重复 ⇒ 必须抓', run(mutate((m) => { m.hitLocations.push('头'); })).problems.some((p) => p.includes('重复')));

// ── ② 装备与耐久 ──
case_('② 正例：maxHp>0 ＋ reduce 只写一种', run(base()).problems.length === 0);
case_('② 反例：maxHp = 0 ⇒ 必须抓（耐久上限）', run(mutate((m) => { m.equipment.皮甲.maxHp = 0; })).problems.some((p) => p.includes('maxHp')));
case_('③ 反例：statuses 缺 `turns` ⇒ 必须抓（持续回合必须可声明，#487）',
	run(mutate((m) => { m.statuses.bleed.turns = undefined; })).problems.some((p) => p.includes('turns 必须是正数')));
case_('③ 反例：`perRound` 出现未实现的键 ⇒ 必须抓（#487）',
	run(mutate((m) => { m.statuses.bleed.perRound = { mp: -1 }; })).problems.some((p) => p.includes('perRound.mp 本片未实现')));
case_('③ 反例：`onFail` 效果形态未实现（缺 `dice` 的 harm）⇒ 必须抓（#487）',
	run(mutate((m) => { m.statuses.bleed.onFail[0] = { harm: 'damage', when: 'most' }; })).problems.some((p) => p.includes('效果形态未实现')));
case_('③ 反例：骰式不可解析（`1d4+2`）⇒ 必须抓（引擎只认 `N` / `NdM`，#487）',
	run(mutate((m) => { m.statuses.bleed.onFail[0] = { harm: 'damage', dice: '1d4+2', when: 'most' }; })).problems.some((p) => p.includes('无法解析')));
case_('③ 反例：`addStatus` 没给 `part` ⇒ 必须抓（引擎不知道往哪落，#487）',
	run(mutate((m) => { delete m.statuses.bleed.onFail[1].part; })).problems.some((p) => p.includes('效果形态未实现')));
case_('④ 反例：`statusPenalty` 出现非 `check` 键 ⇒ 必须抓（#487）',
	run(mutate((m) => { m.statusPenalty['stun@头'] = { all: -2 }; })).problems.some((p) => p.includes('all 本片未实现')));
case_('② 反例：reduce 声明了**未实现**的形态（`dice`）⇒ 必须抓（声明面不得大于实现面，#486）',
	run(mutate((m) => { m.equipment.皮甲.reduce = { dice: '1d4' }; })).problems.some((p) => p.includes('只写一种')));
case_('② 反例：reduce 写了两种形态 ⇒ 必须抓（引擎无法判定按哪种结算）',
	run(mutate((m) => { m.equipment.皮甲.reduce = { flat: 2, percent: 10 }; })).problems.some((p) => p.includes('只写一种')));
case_('② 反例：slot 不是已声明槽位 ⇒ 必须抓', run(mutate((m) => { m.equipment.皮甲.slot = 'tail'; })).problems.some((p) => p.includes('不是已声明槽位')));

// ── ③ 部位 × 异常 ──
case_('③ 正例：parts⊆hitLocations ＋ attr 在属性表 ＋ 分档穷尽', run(base()).problems.length === 0);
case_('③ 反例：parts 写了 hitLocations 之外的部位 ⇒ 必须抓',
	run(mutate((m) => { m.statuses.stun.parts = ['尾巴']; })).problems.some((p) => p.includes('hitLocations 的非空子集')));
case_('③ 反例：check.attr 不在属性表 ⇒ 必须抓', run(mutate((m) => { m.statuses.bleed.check.attr = 'luck'; })).problems.some((p) => p.includes('不在属性表')));
case_('③ 反例：onFail **只给一档** ⇒ 必须抓（「判了却没效果」）',
	run(mutate((m) => { m.statuses.bleed.onFail = [{ harm: 'damage', when: 'most' }]; })).problems.some((p) => p.includes('分档必须穷尽')));
case_('③ 反例：onFail 出现未知分档词 ⇒ 必须抓', run(mutate((m) => { m.statuses.stun.onFail[0].when = 'sometimes'; })).problems.some((p) => p.includes('未知分档')));
case_('③ 反例：statusPenalty 引用未声明的异常 ⇒ 必须抓',
	run(mutate((m) => { m.statusPenalty['poison@躯干'] = { all: -1 }; })).problems.some((p) => p.includes('未声明的异常')));

// ── ④ 波次（短/长的定义）──
case_('④ 正例：short=1 批 · long=2 批（第二批更难且增援）', run(base()).problems.length === 0);
case_('④ 反例：long 只有 1 批 ⇒ 必须抓（那就不叫长战斗）',
	run(mutate((m) => { m.encounters.long.waves = [m.encounters.long.waves[0]]; })).problems.some((p) => p.includes('必须恰好 2 批')));
case_('④ 反例：第二批 difficulty 没变大 ⇒ 必须抓',
	run(mutate((m) => { m.encounters.long.waves[1].difficulty = 1; })).problems.some((p) => p.includes('必须大于第一批')));
case_('④ 反例：第二批没标 reinforce ⇒ 必须抓', run(mutate((m) => { delete m.encounters.long.waves[1].reinforce; })).problems.some((p) => p.includes('reinforce')));
case_('④ 反例：pool 不是已登记作战池 ⇒ 必须抓', run(mutate((m) => { m.encounters.short.waves[0].pool = 'cave.w9'; })).problems.some((p) => p.includes('不是已登记的作战池')));

// ── ⑤ 线索可区分 ──
case_('⑤ 正例：同段三路线索两两不同', run(base()).problems.length === 0);
case_('⑤ 反例：两条路线索**等价**（只差空白）⇒ 必须抓',
	run(mutate((m) => { m.roads[0].options[1].hint = ' 碎石间有拖行的痕迹 '; })).problems.some((p) => p.includes('线索**等价**')));
case_('⑤ 反例：某选项缺 hint ⇒ 必须抓', run(mutate((m) => { delete m.roads[0].options[2].hint; })).problems.some((p) => p.includes('缺 hint')));
case_('⑤ 反例：选项不足 3 条 ⇒ 必须抓', run(mutate((m) => { m.roads[0].options.pop(); })).problems.some((p) => p.includes('至少 3 个选项')));

// ── 未启用 = 合法（兼容模式，见 #492）──
case_('边界：`mechanics()` 返回 null ⇒ `enabled:false` 且**不报错**（未启用新机制 ⇒ 引擎走旧路径）',
	run(null).enabled === false && run(null).problems.length === 0);
case_('边界：`enabled:true` 只表示"故事声明了这套表"，与"跑不跑"无关（未启用时 enabled=false）', run(base()).enabled === true && run(null).enabled === false);
case_('词表：分档词表与减成形态是**声明式枚举**（改口径要动这两处 ⇒ 门会跟着变）',
	GRADE_SET.join() === 'most,low' && REDUCE_FORMS.join() === 'flat');   // #486：只列**已实现**的形态

// ── ① 真实契约：当前故事必须"未启用"或"形状合法" ──
{
	const { window: w } = createContext({ argv: [] });
	const Sg = w.Sg ?? {};
	if (typeof Sg?.story?.mechanics !== 'function') {
		bad++;
		console.error('      ✗ 契约：`Sg.story.mechanics()` 未注册 —— 故事侧必须显式声明（未启用也要声明，见 #492）');
	} else {
		const m = Sg.story.mechanics();
		const poolNames = () => Object.keys(w.Game?.Combat?.pools ?? {});
		const abilities = Object.keys(w.Game?.Rules?.ABILITIES ?? {});
		const r = validateStoryMechanics(m, { poolNames, abilities });
		const ok = r.problems.length === 0;
		if (!ok) bad++;
		console.log(`      ${ok ? '✓' : '✗'} 真实契约：当前故事 ${r.enabled ? '**已启用**新机制（形状合法 ✓）' : '**未启用**（显式声明 null ⇒ 引擎走旧路径 ✓）'}${ok ? '' : '：' + r.problems.join('；')}`);
		if (r.enabled) console.log(`        （启用了 ${Object.keys(m.slots ?? {}).length} 槽位 · ${Object.keys(m.equipment ?? {}).length} 装备 · ${Object.keys(m.statuses ?? {}).length} 异常 · ${(m.roads ?? []).length} 段事件池）`);
	}
}

if (bad) {
	console.error(`\n✗ 形状门未通过（${bad} 项）—— 形状即判据：坏掉的表必须能被机器抓住，见 docs/engine-story-boundary.md`);
	process.exit(1);
}
console.log('\n✔ 形状门通过（六条可机检点 · 各带正反自证 · 当前故事显式声明未启用/已启用均合法）');
