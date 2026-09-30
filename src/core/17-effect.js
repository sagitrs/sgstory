/* RPG 核心 —— 状态效果：定义、注册表与归一化
 *
 * Effect extends Object —— 效果基类（纯数据/标记类）。
 * Debuff extends Effect —— 减益子类。
 *
 * RPG.defEffect(def) —— 声明式注册（与 defItem / defCharacter 同形）：
 *   返回**定义单例**并登记进 RPG.effects（base id → 单例；各包共用一张表，同 items）。
 *   实例 = def 的**全部字段**（除 kind 用于定类）——如 selfRollMode / hooks / levels 等
 *   声明字段随之挂载；否则「声明层与实例层塌缩为一层」不成立（#1713 F2）。
 *
 * 归一化（RPG.effectSpec / resolveEffect / effectOf）：把「id 串 / Effect 实例 / 层级 id」
 *   统一解析为描述子 { base, level, id, def, leveled }。
 *   ⚠ **读路径严格**：未注册 / 形态非法 / 层数缺失或越域一律抛错（err.code 见 #1713 §1.3），
 *   不再落入 Character.contains 的道具检索分支（那条宽松老路会把裸 id 静默变成「首个道具」）。
 *
 * 层级效果用**参数化 id**（如 'exhaustion:3'）：c.effects 仍是纯字符串数组，存档面零改，
 *   级数无需另存 stats 旁路（#1689 §九.3 的甲/乙二择由此消解）。
 *
 * 效果通过 Character.gain / lose / contains / effectLevel 挂到角色身上，见 20-character。
 */

/** 效果子系统的错误工厂：固定 `code`（用例断言 err.code，不断言给人看的完整消息） */
RPG.effectError = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/** 层级 id 拆分：'exhaustion:3' → { base: 'exhaustion', levelText: '3' } */
RPG.effectSplit = (id) => {
	const i = id.indexOf(':');
	return i === -1
		? { base: id, levelText: null }
		: { base: id.slice(0, i), levelText: id.slice(i + 1) };
};

/** 规范十进制（拒绝 ':03' / ':3.0'：防同义异形进存档）与 levels 定义校验 */
const LEVEL_TEXT = /^(0|[1-9][0-9]*)$/;
const levelDefOk = (l) =>
	l != null && Number.isInteger(l.min) && Number.isInteger(l.max) && l.min >= 1 && l.min <= l.max;

/** id 串 → 级数（非层级 / 非规范 / 越域 ⇒ 0）。def 省略时自行查注册表 */
RPG.effectLevelOfId = (id, def = null) => {
	const { base, levelText } = RPG.effectSplit(id);
	const d = def ?? RPG.effects.get(base);
	if (!levelDefOk(d?.levels) || levelText === null || !LEVEL_TEXT.test(levelText)) return 0;
	const n = Number(levelText);
	return n >= d.levels.min && n <= d.levels.max ? n : 0;
};

RPG.Effect = class Effect extends Object {
	constructor(def = {}) {
		super();
		if (!def || !def.id) throw new Error('Effect 定义缺少 id');
		for (const k of Object.keys(def)) this[k] = def[k]; // 全字段挂载（F2）
		if (def.name === undefined) this.name = def.id;
		if (def.desc === undefined) this.desc = '';
	}
};

RPG.Debuff = class Debuff extends RPG.Effect {};

/** 声明式注册效果定义（推荐）。
 *  def = { id, name?, desc?, kind?: 'effect'|'debuff', levels?: {min,max}, hooks?, …声明字段 }
 *  重复 id ⇒ console.warn + 覆盖（与 registerItem / defCharacter 的库内形态一致）。
 *  ⚠ 层级 id 不得直接注册：层级由 levels 声明，运行期用「base:级数」。 */
RPG.defEffect = (def) => {
	if (!def || def.id === undefined) throw RPG.effectError('DEFEFFECT_BAD_ID', 'defEffect 定义缺少 id');
	if (typeof def.id !== 'string' || def.id === '')
		throw RPG.effectError('DEFEFFECT_BAD_ID', 'defEffect 的 id 应是非空字符串');
	if (def.id.includes(':'))
		throw RPG.effectError('DEFEFFECT_BAD_ID',
			`defEffect 的 id 不得含「:」（层级由 levels 声明，运行期用「id:级数」）：${def.id}`);
	if (def.levels !== undefined && !levelDefOk(def.levels))
		throw RPG.effectError('DEFEFFECT_BAD_LEVELS',
			`defEffect「${def.id}」的 levels 应是 { min, max }（1 ≤ min ≤ max 的整数）`);
	if (def.hooks !== undefined) {
		const allowed = ['onTurnStart', 'onTurnEnd'];
		if (def.hooks === null || typeof def.hooks !== 'object')
			throw RPG.effectError('DEFEFFECT_BAD_HOOK', `defEffect「${def.id}」的 hooks 应是对象`);
		for (const k of Object.keys(def.hooks)) {
			if (!allowed.includes(k))
				throw RPG.effectError('DEFEFFECT_BAD_HOOK', `defEffect「${def.id}」的 hooks 含未知键：${k}`, { allowed });
			if (typeof def.hooks[k] !== 'function')
				throw RPG.effectError('DEFEFFECT_BAD_HOOK', `defEffect「${def.id}」的 hooks.${k} 应是函数`);
		}
	}
	const { kind, ...fields } = def;
	const inst = kind === 'debuff' ? new RPG.Debuff(fields) : new RPG.Effect(fields);
	if (RPG.effects.has(def.id)) {
		console.warn(`[RPG] 效果 id「${def.id}」重复注册：${RPG.effects.get(def.id).name} 被覆盖。`);
	}
	RPG.effects.set(def.id, inst);
	return inst;
};

/** 归一化：任意合法 ref → 描述子 { base, level, id, def, leveled }
 *  mode：'id'（gain —— 层级效果须带层数）| 'all'（lose —— 裸 base ＝ 全层级）| 'any'（contains/effectOf/effectLevel） */
RPG.effectSpec = (ref, mode = 'id') => {
	let raw;
	if (ref instanceof RPG.Effect) raw = ref.id;
	else if (typeof ref === 'string') raw = ref;
	else {
		const received = ref === null ? 'null' : typeof ref;
		throw RPG.effectError('EFFECT_BAD_REF',
			`效果参数应是 id 字符串或 RPG.Effect 实例，收到：${received}`, { received });
	}
	if (raw === '') throw RPG.effectError('EFFECT_BAD_REF', '效果参数不应是空字符串', { received: 'string' });

	const { base, levelText } = RPG.effectSplit(raw);
	const def = RPG.effects.get(base);
	if (!def) {
		throw RPG.effectError('EFFECT_UNKNOWN', `未注册的效果 id「${raw}」`,
			{ registeredIds: [...RPG.effects.keys()].sort() });
	}
	if (!levelDefOk(def.levels)) {
		if (levelText !== null)
			throw RPG.effectError('EFFECT_NO_LEVELS', `效果 id「${raw}」的 base 未声明 levels`);
		return { base, level: null, id: base, def, leveled: false };
	}
	if (levelText === null) {
		if (mode === 'id') {
			throw RPG.effectError('EFFECT_LEVEL_REQUIRED', `层级效果「${base}」必须带层数`,
				{ range: `${def.levels.min}..${def.levels.max}` });
		}
		return { base, level: null, id: null, def, leveled: true }; // 'all' / 'any'
	}
	if (!LEVEL_TEXT.test(levelText))
		throw RPG.effectError('EFFECT_LEVEL_SYNTAX', `层级效果「${raw}」须为规范十进制整数（如 ${base}:1）`);
	const level = Number(levelText);
	if (level < def.levels.min || level > def.levels.max)
		throw RPG.effectError('EFFECT_LEVEL_RANGE', `层级效果「${raw}」超出域 ${def.levels.min}..${def.levels.max}`);
	return { base, level, id: `${base}:${level}`, def, leveled: true };
};

/** 归一化为「存入 c.effects 的 id 串」（层级效果须带层数） */
RPG.resolveEffect = (ref) => RPG.effectSpec(ref, 'id').id;

/** 取效果定义单例（层级 id 取其 base 的定义）；未注册 ⇒ 抛错 */
RPG.effectOf = (ref) => RPG.effectSpec(ref, 'any').def;

/* ---------- 核心自身的效果定义（零 pack 依赖：文案与本地化属 core） ---------- */

/** death —— 生命值归零的标记，由武器攻击在目标 HP 归零时施加（见 dnd3/items/club.js）。
 *  ⚠ pack 的效果（如 dnd3 的 fear）由各自 pack 注册，不由 core 代劳。 */
RPG.death = RPG.defEffect({
	id: 'death',
	name: '死亡',
	desc: '生命值已归零，无法行动。',
	kind: 'debuff',
});
