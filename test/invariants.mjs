// #189 规则属性三件套——跨步骤状态不变量（walker 每步挂检；可独立单测/负例验证）。
// ① 单调：同局内 dragon.defeats / dragon.awake 只进不退（#178：重进不洗状态）
// ② once-only：一次性旗标置位后永不回落（结算不因重访/重进被吞）
// ③ 前置蕴含：持有物/状态蕴含其来源（好哨⇒还过杖；卷轴⇒日记；喂花⇒到过宴会厅……）
export function mkHist() {
	return { prev: { dragon: {} }, onceTrue: new Map() };
}

// once-only 旗标闭集：置 true 后任何回落都是违法（新开一局＝新 hist，不在此列）
const ONCE_TRUE = [
	['ev', 'study_found'], ['ev', 'forge_seen'], ['ev', 'star_ledger'], ['ev', 'staff_found'],
	['ev', 'witch_grip'], ['ev', 'threshold'], ['ev', 'seer_gave'], ['ev', 'wq_blessed'],
	['ev', 'forge_thanks'], ['ev', 'keeper_told'], ['ev', 'failure_cause'],
	['world', 'family_favor'], ['world', 'flower_warned'], ['world', 'flower_fed'],
	['world', 'goblin_gone'], ['world', 'goblin_spared'], ['world', 'hoard_looted'],
	['world', 'whistle_blown'], ['world', 'mist_fought'], ['world', 'rumor'], ['world', 'witch_hint'],
	['dragon', 'awake'], ['keeper', 'met'], ['keeper', 'key'],
];

// 前置蕴含闭集：左侧成立 ⇒ 右侧必须成立（来源链不凭空出现）
const IMPLIES = [
	[['inv', '好哨'], ['world', 'family_favor'], '好哨在手 ⇒ 还过杖（换哨的意愿门）'],
	[['inv', '好哨'], ['inv', '坏哨', false], '好哨在手 ⇒ 坏哨已交出（交换完成）'],
	[['inv', '完整星图'], ['ev', 'seer_gave'], '完整星图 ⇒ 观星者落过账（求图）'],
	[['inv', '传送术卷轴'], ['inv', '日记'], '卷轴 ⇒ 日记同源（暗格一套取出）'],
	[['world', 'flower_fed'], ['ev', 'threshold'], '喂过花 ⇒ 到过地下宴会厅（阈值先行）'],
	[['inv', '守林人的钥匙'], ['keeper', 'met'], '钥匙在手 ⇒ 见过守林人'],
];

const get = (pc, [scope, key]) => {
	const o = scope === 'inv' ? pc.inv : pc[scope];
	return o ? o[key] : undefined;
};

// 每步调用：hist 是同一局的跨步记忆；返回违法描述数组（空＝干净）
export function checkStep(hist, pc) {
	if (!pc || !pc.abilities) return [];          // 车卡前不适用
	const bad = [];
	// ① 单调：defeats 只增不减（rage 不因重进清零）；awake 只进不退
	const dNow = pc.dragon?.defeats ?? 0;
	const dPrev = hist.prev.dragon.defeats ?? 0;
	if (dNow < dPrev) bad.push(`defeats 回落 ${dPrev}→${dNow}（重进洗状态？#178）`);
	hist.prev.dragon.defeats = dNow;
	// ② once-only：true 过的旗标不许变 false
	for (const flag of ONCE_TRUE) {
		const key = flag.join('.');
		const now = get(pc, flag) === true;
		if (now) hist.onceTrue.set(key, true);
		else if (hist.onceTrue.get(key) && get(pc, flag) !== true) bad.push(`once-only 旗标回落：${key}（结算被吞？）`);
	}
	// ③ 前置蕴含
	for (const [lhs, rhs, why] of IMPLIES) {
		const lhsOk = rhs[2] === false ? get(pc, lhs) === true : get(pc, lhs) === true;
		if (!lhsOk) continue;
		const rhsWant = rhs[2] === false ? false : true;    // [scope,key,false] ⇒ 必须为假
		const rhsGot = get(pc, rhs) === true;
		if (rhsGot !== rhsWant) bad.push(`前置蕴含破裂：${why}`);
	}
	return bad;
}
