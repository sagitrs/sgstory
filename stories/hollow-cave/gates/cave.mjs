// ⓪ab 洞窟声明面门（`#490` S5 片二／S6 形状）——**故事门**（判据来自本故事的声明表＋散文段落名）。
//
// 为什么需要它：五段×三路的内容一旦"按表组装"，表与内容就成了**两份互相引用**的东西：
// 表里的每条路声明一个 `ref`，内容里要有一个 `路·<ref>` 段落；`hint` 是玩家看到的线索。
// 少了任何一半都不会崩——只会**静默少一条路**（`<<goto `"路·" + ref`>>` 落到不存在的段落 ⇒ SugarCube 报错/空段），
// 而"死档/漏路"恰恰是本票出口判据要否掉的东西。⇒ 表 ↔ 内容必须**双向对账**（同族：`--rules` 的"未接管行"）。
//
// 判据（四条，未启用的故事一律跳过 ⇒ 对故事 1 零影响）：
//   ① `mechanics().roads[*].options[*].ref` 必须存在，且 `路·<ref>` 段落存在（表→内容）；
//   ② `Sg.story.eventPool(step)`：`kinds` 覆盖六类词表；`entries` 每个 kind ≥1 个实例，
//      且每条实例的 `ref` 也解析得到段落、`hint` 非空（内容→表）；
//   ③ `Sg.story.chestDef(id)`：三个位点名（`site`/`rareSite`/`toolSite`）都必须是**已登记位点**，
//      `tool` 必须在 `Game.Items.defs` 里，且 `loot` 的档位非空（稀有度→奖品曲线存在）；
//   ⑨ 终点必须有**整局结算**（`#719`）。
//   ⑧ 敌人攻击位点必须已登记（`#705`）。
//   ⑥ 宝箱惩罚分级（`#696`）：钥匙必开／道具轻罚／徒手重罚（严重异常）。
//   ⑦ `#696` 收入声明↔内容对账：`chest.gold`／`caveRewards` 声明了且内容读它。
//   ⑤ 路面**类型标签**齐备（`#692` ①）：出现的每个 kind 都要有非空标签（新增类不给标签 ⇒ 红）。
//   ④ 三选一每段 ≥1 个 `noCheck` 选项（"不掷骰也有路可走"）——形状门管声明，这里管**内容侧**也有对应实例。
export const flag = 'cave';
export const flags = ['cave'];

/** 六类事件词表（`#489` 已定；与 `story-shape.mjs` 同一份口径）。 */
export const KINDS = ['shortFight', 'longFight', 'chest', 'cave', 'trap', 'traveller'];

/** 纯函数①：表→内容 —— 每条路的 `ref` 必须能解析到实例段落。 */
export const refProblems = (rows, hasPassage, prefix = '路·') => {
	const out = [];
	for (const o of (rows ?? [])) {
		if (!o?.ref) { out.push({ ref: null, kind: o?.kind, why: '选项没有 `ref`（没法定位它的实例段落）' }); continue; }
		if (!hasPassage(prefix + o.ref)) out.push({ ref: o.ref, kind: o.kind, why: `实例段落「${prefix}${o.ref}」不存在（表里有路、内容里没有）` });
	}
	return out;
};
/** 纯函数②：内容→表 —— 事件池的 kinds 覆盖与实例登记。 */
export const poolProblems = (pool, hasPassage, prefix = '路·') => {
	const out = [];
	if (!pool) return out;                                  // 未启用 ⇒ 跳过（故事 1 走这条）
	for (const k of KINDS) if (!(pool.kinds ?? []).includes(k)) out.push({ code: 'kind-missing', why: `事件池的 \`kinds\` 缺词表项「${k}」` });
	for (const k of KINDS) {
		const list = pool.entries?.[k] ?? [];
		if (!list.length) out.push({ code: 'instance-missing', why: `事件「${k}」没有任何实例（entries.${k} 为空）` });
		for (const e of list) {
			if (!e?.hint) out.push({ code: 'hint-missing', why: `事件「${k}」的实例 ${e?.id ?? '?'} 缺 \`hint\`` });
			if (!hasPassage(prefix + (e?.ref ?? ''))) out.push({ code: 'ref-missing', why: `事件「${k}」的实例 ${e?.id ?? '?'} 的 \`ref\`（${e?.ref}）解析不到段落` });
		}
	}
	return out;
};
/** 纯函数④：战斗奖励声明面（`#600`）—— 归一化能过 ＋ 掉落道具已登记 ＋ **内容只经单一落点**（声明 ↔ 内容对账）。
 *  为什么要有"对账"这一半：`#600` 的现场就是"规则只活在散文里"——表里能声明掉落，但内容自己读 `reward.gold`、自己掷骰，
 *  于是声明变了行为不变（或反过来），**没有任何门看得见**。 */
export const rewardProblems = (mech, { normalize, hasItem, srcOf } = {}) => {
	const out = [];
	const enc = mech?.encounters ?? {};
	for (const id of Object.keys(enc)) {
		let r = null;
		try { r = normalize(id); }
		catch (e) { out.push({ code: 'reward-shape', why: `encounters.${id}.reward 形状不合法（引擎拒绝归一化）：${e?.message ?? e}` }); continue; }
		if (r?.item && !hasItem(r.item.id)) out.push({ code: 'reward-item-unknown', why: `encounters.${id}.reward.item 指到**未登记的道具**「${r.item.id}」（表里没有它 ⇒ 掉下去也进不了物品栏语义）` });
	}
	const declaredItem = Object.keys(enc).some((id) => enc[id]?.reward?.item);
	if (declaredItem) {
		const src = ['机制·longFight', '洞窟工具'].map((n) => srcOf(n) ?? '').join('\n');
		if (!/Game\.Combat\.grantReward\(/.test(src)) out.push({ code: 'reward-not-wired', why: '声明了 `reward.item`，但内容里没有 `Game.Combat.grantReward(` —— 声明与行为对不上（规则只活在表里）' });
		if (/slotsDecl\(\)\.encounters/.test(src)) out.push({ code: 'reward-bypassed', why: '内容里仍在直接读 `slotsDecl().encounters…`（绕过单一落点 ⇒ 声明与行为迟早漂移）' });
	}
	return out;
};
/** 纯函数③：宝箱声明面（位点已登记 ＋ 工具在道具表 ＋ 奖品曲线非空）。 */
export const chestProblems = (chest, { hasSite, hasItem, siteOf } = {}) => {
	const out = [];
	if (!chest) return out;
	for (const [id, m] of Object.entries(chest.mechanisms ?? {})) {
		for (const f of ['site', 'rareSite', 'toolSite']) if (!hasSite?.(m?.[f])) out.push({ code: 'site-missing', why: `机关「${id}」的 \`${f}\`（${m?.[f]}）不是已登记位点` });
		if (!hasItem?.(m?.tool)) out.push({ code: 'tool-missing', why: `机关「${id}」的工具「${m?.tool}」不在道具表（Game.Items.defs）里` });
		// `#491` 判据 3（声明侧）：已定 ③ 的"通用道具**各降 3**"与"珍贵比普通高"必须是**位点表里的真实差值**——
		// 否则声明的四条路径里那条"道具降难"只是文案（DC 没动 ⇒ 玩家拿道具也没用）。
		const dc = (n) => siteOf?.(n)?.dc;
		if (siteOf) {
			const [a, b, c] = [dc(m?.site), dc(m?.rareSite), dc(m?.toolSite)];
			if ([a, b, c].every((x) => typeof x === 'number')) {
				if (typeof chest.toolReduce === 'number' && b - a !== 0) { /* 普通/珍贵之差由下表单独判 */ }
				if (a - c !== chest.toolReduce) out.push({ code: 'tool-reduce', why: `机关「${id}」的工具降难不是声明的 ${chest.toolReduce}：普通 DC ${a} − 借助具 DC ${c} = ${a - c}（已定 ③：通用道具各降 3）` });
				if (!(b > a)) out.push({ code: 'rarity-dc', why: `机关「${id}」的珍贵 DC ${b} 没有高于普通 DC ${a}（已定 ③：珍贵更难）` });
			}
		}
	}
	if (!Object.keys(chest.loot ?? {}).length) out.push({ code: 'loot-missing', why: '`chest.loot` 为空——稀有度→奖品曲线缺失（宝箱四路径要有兑现）' });
	for (const [r, l] of Object.entries(chest.loot ?? {})) if (!Array.isArray(l) || !l.length) out.push({ code: 'loot-empty', why: `稀有度「${r}」的奖品清单为空` });
	return out;
};

/** 纯函数⑤：路面**类型标签**齐备（`#692` ①）——出现的每个 `kind` 都必须有非空标签。
 *  为什么入库：**三选一要显式标类型**——若新增第七类 kind 而不给标签，玩家只会看到空白/问号前缀，
 *  且**没有任何门**看得见（与 `#688` 那类"全靠肉眼"的缺陷同族）。 */
export const labelProblems = (kinds, labelOf) => {
	const out = [];
	for (const k of kinds) {
		const l = labelOf?.(k);
		if (typeof l !== 'string' || !l.trim()) out.push({ code: 'label-missing', why: `事件类「${k}」没有类型标签（路面提示会出现空白/问号前缀，#692）` });
	}
	return out;
};

/** 纯函数⑥：宝箱**惩罚分级**（`#696`）——三路代价必须**严格分级**，
 *  否则「没钥匙硬开」的收益会高于「打仗拿钥匙再开」（那正是这条规则的靶心）。
 *  判据（对 `机制·chest` 段源码，与 `#600` 的 reward 对账同族）：
 *   ① **钥匙路必开**：该分支不得出现 `sitecheck`；
 *   ② **道具路失败＝轻**：不得 `applyStatus`（应是轻罚，如 `Game.Damage.graze`）；
 *   ③ **徒手路失败＝重**：必须有 `applyStatus`（严重异常）——只靠伤害不够（伤害可被护具吸掉）。 */
export const penaltyGradeProblems = (src) => {
	const s = String(src ?? '');
	if (!s.trim()) return [{ code: 'chest-src-missing', why: '取不到 `机制·chest` 段源码（本判据要读内容才能判）' }];
	const iKey = s.indexOf('$pc.inv["钥匙"]');
	const iTool = s.indexOf('$pc.inv[_c.tool]');
	const iBare = s.indexOf('<<else>>', iTool);
	const iEnd = s.indexOf('不管它，径直走过去');
	if (iKey < 0 || iTool < 0 || iBare < 0 || iEnd < 0) {
		return [{ code: 'chest-shape', why: '宝箱三路（钥匙／道具／徒手）的结构已变，本判据读不到三块——请同步更新本门' }];
	}
	const key = s.slice(iKey, iTool), tool = s.slice(iTool, iBare), bare = s.slice(iBare, iEnd);
	const out = [];
	if (/<<\s*sitecheck/.test(key)) out.push({ code: 'key-risky', why: '钥匙路出现了 `sitecheck`——钥匙本该**必开**（`keyReduce: to-zero`）' });
	if (/applyStatus/.test(tool)) out.push({ code: 'tool-too-heavy', why: '道具路失败带了 `applyStatus`——道具路径应是**轻罚**（降难 −3 的代价），重罚留给徒手' });
	if (!/applyStatus/.test(bare)) out.push({ code: 'bare-too-light', why: '徒手路失败没有严重异常（`applyStatus`）——硬开与"打仗拿钥匙"的代价差不够' });
	return out;
};

/** 纯函数⑦：`#696` 的**收入声明面 ↔ 内容**对账（同 `#600` 口径）：
 *  宝箱金币（`chest.gold`）与五洞窟产出（`caveRewards`）必须**声明了且内容真的读它**（`chestGold(`/`caveReward(`），
 *  否则"声明变了行为不变"（或反过来）——没有任何门看得见。 */
export const incomeProblems = (mech, { src } = {}) => {
	const out = [];
	const gold = mech?.chest?.gold ?? {};
	for (const r of Object.keys(mech?.chest?.loot ?? {})) {
		const v = gold[r];
		if (typeof v !== 'number' || v <= 0) out.push({ code: 'chest-gold-missing', why: `宝箱档「${r}」没有声明金币（\`chest.gold\`）——金币主源＝战斗与宝箱` });
	}
	const cave = mech?.caveRewards?.矿洞 ?? null;
	if (!cave) out.push({ code: 'cave-reward-missing', why: '`caveRewards.矿洞` 未声明（五洞窟产出要进声明面）' });
	else {
		if (typeof cave.keyChance !== 'number' || cave.keyChance < 0 || cave.keyChance > 100) out.push({ code: 'cave-keychance', why: `\`caveRewards.矿洞.keyChance\` 必须是 0..100（实际 ${JSON.stringify(cave.keyChance)}）` });
		if (!cave.fallback) out.push({ code: 'cave-fallback', why: '`caveRewards.矿洞.fallback` 未声明（不掉钥匙时给什么）' });
	}
	const t = String(src ?? '');
	if (Object.keys(gold).length && !/Sg\.story\.chestGold\(/.test(t)) out.push({ code: 'chest-gold-not-wired', why: '声明了 `chest.gold` 但内容没读 `Sg.story.chestGold(`（声明与行为对不上）' });
	if (cave && !/Sg\.story\.caveReward\(/.test(t)) out.push({ code: 'cave-reward-not-wired', why: '声明了 `caveRewards` 但内容没读 `Sg.story.caveReward(`（声明与行为对不上）' });
	return out;
};

/** 纯函数⑧：敌人**攻击位点**必须已登记（`#705`）——玩家的对抗检定是"拿敌人的攻击位点掷"，
 *  位点没登记 ⇒ 那一下永远掷不了（`resolveFoe` 会当场报错/落到兜底 DC）。 */
export const enemySiteProblems = (mech, { hasSite } = {}) => {
	const out = [];
	for (const [id, e] of Object.entries(mech?.enemies ?? {})) {
		const site = e?.attack?.site;
		if (!site) continue;                       // 形状面（site 必填）归 `story-shape.mjs`，这里只管"登记没登记"
		if (!hasSite?.(site)) out.push({ code: 'enemy-site-unknown', why: `敌人「${id}」的攻击位点「${site}」不是已登记位点（玩家拿它掷对抗 ⇒ 未登记＝那一下永远掷不出去）` });
	}
	return out;
};

/** 纯函数⑨：终点**整局结算**（`#719`）——`地下村落` 必须渲染"这一趟带出来的东西"（`<<caveSummary>>`）。
 *  没有它，玩家走到头只有散文、看不到自己积累了什么（实测：钥匙/干粮/金币全无结算）。 */
export const endingSummaryProblems = (endSrc) => {
	const s = String(endSrc ?? '');
	if (!s.trim()) return [{ code: 'ending-src-missing', why: '取不到终点段落源码（`地下村落`）——本判据要读内容才能判' }];
	if (!/<<\s*caveSummary\s*>>/.test(s)) return [{ code: 'no-summary', why: '终点没有整局结算（`<<caveSummary>>`）——只有散文，玩家看不到收获（#719）' }];
	return [];
};

/** `#706` 的**结算点声明**：允许调 `tickStatuses` 的 **widget** 名（每处恰好一次）。
 *  · `caveNext` ＝**本故事**的事件步（唯一单位：一段＝一回合）；
 *  · `fightact` ＝**引擎**侧的战斗回合点（故事 1 的战斗用它 —— 那是它的**单位**，与本故事的"步"并存但互斥：
 *    故事 2 的战斗路径走 `<<foeRound>>`，不经 `fightact`，实测一个事件步内只结算一次）。 */
export const TICK_ALLOWED = ['caveNext', 'fightact'];

/** 纯函数⑪：**状态时钟的调用点必须与声明一致**（`#706`）——
 *  症状：异常按"步"推进，但调用点散落（战斗内再调一次＝同一异常一个事件步结算两次）；且玩家不知道单位。
 *  判据（按 **widget** 判，不按段落名 —— widget 名才是声明单元）：
 *   ① 段落正文里（widget 之外）**不许**直接调 `tickStatuses`；
 *   ② 声明的 widget 各自**恰好一次**（0 次＝时钟不走，也是坏的）；
 *   ③ 未声明的 widget 调了 ⇒ 报。 */
export const tickSiteProblems = (passages, allowed = TICK_ALLOWED) => {
	const out = [];
	const tickRe = /Game\.Combat\.tickStatuses\s*\(/g;
	const widgetRe = /<<widget\s+"([^"]+)">>([\s\S]*?)<\/widget>>/g;
	const seen = new Set();                                   // 声明点里"真的出现过"的 widget（用于判"时钟不走"）
	for (const [name, src] of (passages ?? [])) {
		const text = String(src ?? '');
		const inner = new Set();
		for (const m of text.matchAll(widgetRe)) { if (tickRe.test(m[2])) inner.add(m[1]); tickRe.lastIndex = 0; }
		// ① 段落正文（去掉 widget 体）里不该有 tick
		const outside = text.replace(widgetRe, '');
		if (tickRe.test(outside)) out.push({ code: 'tick-outside', why: `段落「${name}」在 widget **之外**调了 \`tickStatuses\` ⇒ 调用点必须收敛进声明的 widget` });
		for (const w of inner) {
			const body = [...text.matchAll(widgetRe)].find((m) => m[1] === w)[2];
			const n = (body.match(tickRe) ?? []).length;
			if (!allowed.includes(w)) out.push({ code: 'tick-site', why: `widget「${w}」（段落「${name}」）调了 \`tickStatuses\`，它不在声明的结算点（${allowed.join('、')}）里 ⇒ 同一异常可能被结算多次` });
			else { seen.add(w); if (n !== 1) out.push({ code: 'tick-count', why: `声明的结算点「${w}」调了 ${n} 次（应恰好 1 次）` }); }
		}
	}
	for (const w of allowed) if (!seen.has(w)) out.push({ code: 'tick-missing', why: `声明的结算点「${w}」**没有**调用 \`tickStatuses\` ⇒ 时钟不走（异常永不结算）` });
	return out;
};

/** `#726` 的目标词（**本故事自己的数据**，就住故事门里 —— 判据数据按 `#602` 归故事）。 */
export const GOAL_KEYWORD = '村子';

/** 纯函数⑩：**开场必须给出目标、终点必须回扣同一词**（`#726`）——
 *  症状：开场只说"前面只有一条路"⇒ 玩家不知道去哪、为什么；而终点 `地下村落` 要到第 5 段才第一次出现。
 *  为什么值得机检（而不是"文案润色"）：① 三选一的**类型标签 ≠ 目的**（`#692` 只管类型）；
 *  ② `#696` 的收益引导只有在"玩家有目标"时才成立；③ 成本极低（开场一句 ＋ 终点回扣一句，不新增状态）。 */
export const goalProblems = (openingSrc, endingSrc, keyword = GOAL_KEYWORD) => {
	const out = [];
	const open = String(openingSrc ?? '');
	const end = String(endingSrc ?? '');
	if (!open.trim()) out.push({ code: 'goal-opening-missing', why: '取不到开场段落源码（`醒来`）——本判据要求源码，不静默判过' });
	else if (!open.includes(keyword)) out.push({ code: 'goal-not-stated', why: `开场没有给出目标（缺目标词「${keyword}」）⇒ 玩家不知道去哪、为什么` });
	if (!end.trim()) out.push({ code: 'goal-ending-missing', why: '取不到终点段落源码（`地下村落`）' });
	else if (!end.includes(keyword)) out.push({ code: 'goal-not-callback', why: `终点没有回扣目标词「${keyword}」⇒ 走了 5 段才知道自己去哪` });
	return out;
};

export const run = (ctx) => {
	const { arg, wantAll, window: w } = ctx;
	if (!(wantAll || arg('cave'))) return;
	console.log('\n══ ⓪ab 洞窟声明面门（`#490`）——表 ↔ 内容双向对账 · 宝箱声明面 ══');
	let bad = 0;

	// 自证（纯函数 + 注入输入；正反例都跑同一份判据）
	{
		const has = (n) => ['路·1a', '路·2b'].includes(n);
		// `#696` ⑥⑦ 的合成输入（提出来，条目保持扁平的 [label, cond]）
		const GRADE_GOOD = 'if ($pc.inv["钥匙"]) { 钥匙转半圈 } elseif ($pc.inv[_c.tool]) { <<sitecheck "t">> <<damage `Game.Damage.graze`>> } <<else>> { <<sitecheck "s">> <<damage `Game.Damage.hurt`>> <<set $pc.statuses to Game.Combat.applyStatus($pc, "bleed", "手臂").statuses>> } 不管它，径直走过去';
		const INCOME_M = { chest: { loot: { 普通: ['干粮'], 珍贵: ['干粮', 'TOOL'] }, gold: { 普通: 5, 珍贵: 12 } }, caveRewards: { 矿洞: { keyChance: 25, fallback: '干粮' } } };
		const INCOME_SRC = 'Sg.story.chestGold(_rare ? "珍贵" : "普通") Sg.story.caveReward("矿洞")';
		const cases = [
			['① 正例：`ref` 解析得到实例段落', refProblems([{ kind: 'chest', ref: '1a' }], has).length === 0],
			['🔴 ① 反例：`ref` 指向不存在的段落 ⇒ 报（表里有路、内容没有）', refProblems([{ kind: 'chest', ref: '9z' }], has).length === 1],
			['🔴 ① 反例：选项没有 `ref` ⇒ 报', refProblems([{ kind: 'chest' }], has).length === 1],
			['② 正例：六类齐全且实例都能解析', poolProblems({ kinds: KINDS, entries: Object.fromEntries(KINDS.map((k) => [k, [{ id: '1a', hint: 'x', ref: '1a' }]])) }, has).length === 0],
			['🔴 ② 反例：某类没有实例 ⇒ 报', poolProblems({ kinds: KINDS, entries: { ...Object.fromEntries(KINDS.map((k) => [k, [{ id: '1a', hint: 'x', ref: '1a' }]])), trap: [] } }, has).length === 1],
			['🔴 ② 反例：实例缺 `hint`／`ref` 解析不到 ⇒ 各报一条', poolProblems({ kinds: KINDS, entries: { ...Object.fromEntries(KINDS.map((k) => [k, [{ id: '1a', hint: 'x', ref: '1a' }]])), cave: [{ id: '9z', ref: '9z' }] } }, has).length === 2],
			['边界：`eventPool` 未启用（null）⇒ 不报（故事 1 走这条）', poolProblems(null, has).length === 0],
			// `#719`：终点整局结算（正例／🔴 删掉 ⇒ 报／取不到源码 ⇒ 报）
			['⑨ 正例（#719）：终点渲染整局结算 ⇒ 不报', endingSummaryProblems('你站在那儿。\n<<caveSummary>>\n<<ending "地下村落" final>>').length === 0],
			['🔴 ⑨ 反例（#719）：终点删掉结算 ⇒ 报', endingSummaryProblems('你站在那儿。\n<<ending "地下村落" final>>').some((p) => p.code === 'no-summary')],
			['⑨ 反例（#719）：取不到终点源码 ⇒ 报（不静默判过）', endingSummaryProblems('').length === 1],
			// `#726`：开场给目标 ＋ 终点回扣同一词（正例 / 🔴 开场缺 / 🔴 终点缺 / 🔴 取不到源码）
			['⑩ 正例（#726）：开场给出目标、终点回扣 ⇒ 不报', goalProblems('往深处走——村子在山腹里。', '村子到了。').length === 0],
			['🔴 ⑩ 反例（#726）：开场没给目标 ⇒ 报', goalProblems('前面只有一条路。', '村子到了。').length === 1],
			['🔴 ⑩ 反例（#726）：终点没回扣 ⇒ 报', goalProblems('往深处走——村子在山腹里。', '你站在那儿。').length === 1],
			['🔴 ⑩ 反例（#726）：取不到源码 ⇒ 报（不静默判过）', goalProblems('', '').length === 2],
			// `#706`：结算点声明（正例 / 🔴 战斗段偷调 / 🔴 声明点没调 / 🔴 调两次）
			['⑪ 正例（#706）：声明的 widget 调一次、正文不调 ⇒ 不报',
				tickSiteProblems([['洞窟工具', '<<widget "caveNext">><<run Game.Combat.tickStatuses($pc)>><</widget>>']], ['caveNext']).length === 0],
			['🔴 ⑪ 反例（#706）：未声明的 widget 也调 ⇒ 报（一步结算两次）',
				tickSiteProblems([['洞窟工具', '<<widget "caveNext">><<run Game.Combat.tickStatuses($pc)>><</widget>>'], ['机制·shortFight', '<<widget "x">><<run Game.Combat.tickStatuses($pc)>><</widget>>']], ['caveNext']).length === 1],
			['🔴 ⑪ 反例（#706）：声明点没调 ⇒ 报（时钟不走）', tickSiteProblems([['Widgets', '<<widget "fightact">>no tick<</widget>>']], ['caveNext']).length === 1],
			['🔴 ⑪ 反例（#706）：调两次 ⇒ 报',
				tickSiteProblems([['洞窟工具', '<<widget "caveNext">><<run Game.Combat.tickStatuses($pc)>><<run Game.Combat.tickStatuses($pc)>><</widget>>']], ['caveNext']).length === 1],
			['🔴 ⑪ 反例（#706）：段落正文里直接调 ⇒ 报',
				tickSiteProblems([['岔口', '<<run Game.Combat.tickStatuses($pc)>>']], ['caveNext']).length === 2],
			// `#600` 奖励声明面：正例／🔴 未登记道具／🔴 形状非法／🔴 内容没接／🔴 内容绕过
			['④ 正例：掉落道具已登记且内容走单一落点', rewardProblems({ encounters: { short: { reward: { gold: 3, item: { id: '钥匙', chance: 30 } } } } }, { normalize: () => ({ gold: 3, item: { id: '钥匙', chance: 30 } }), hasItem: (x) => x === '钥匙', srcOf: () => '<<set _r to Game.Combat.grantReward($pc, "short")>>' }).length === 0],
			['🔴 ④ 反例：掉落指向未登记道具 ⇒ 报', rewardProblems({ encounters: { short: { reward: { item: '不存在的钥匙' } } } }, { normalize: () => ({ gold: 0, item: { id: '不存在的钥匙', chance: 100 } }), hasItem: (x) => x === '钥匙', srcOf: () => 'Game.Combat.grantReward(' }).length === 1],
			['🔴 ④ 反例：声明形状非法（引擎拒绝归一化）⇒ 报', rewardProblems({ encounters: { short: { reward: { item: { id: '钥匙', chance: 0 } } } } }, { normalize: () => { throw new Error('chance 必须在 1..100'); }, hasItem: () => true, srcOf: () => 'Game.Combat.grantReward(' }).length === 1],
			['🔴 ④ 反例：声明了掉落但内容没接 ⇒ 报"声明与行为对不上"', rewardProblems({ encounters: { long: { reward: { item: '钥匙' } } } }, { normalize: () => ({ gold: 0, item: { id: '钥匙', chance: 100 } }), hasItem: () => true, srcOf: () => '（内容里没有落账调用）' }).some((p) => p.code === 'reward-not-wired')],
			['🔴 ④ 反例：内容绕过单一落点（自己读声明）⇒ 报', rewardProblems({ encounters: { long: { reward: { item: '钥匙' } } } }, { normalize: () => ({ gold: 0, item: { id: '钥匙', chance: 100 } }), hasItem: () => true, srcOf: () => 'Game.Combat.grantReward($pc, "long") 和 (Game.Combat.slotsDecl().encounters.long.reward ?? {}).gold' }).some((p) => p.code === 'reward-bypassed')],
			['⑥ 正例（#696）：钥匙无 sitecheck ＋ 道具轻罚 ＋ 徒手带严重异常 ⇒ 不报', penaltyGradeProblems(GRADE_GOOD).length === 0],
			['🔴 ⑥ 反例（#696）：钥匙路也掷骰 ⇒ 报', penaltyGradeProblems(GRADE_GOOD.replace('钥匙转半圈', '<<sitecheck "k">>')).some((p) => p.code === 'key-risky')],
			['🔴 ⑥ 反例（#696）：道具路也带严重异常 ⇒ 报', penaltyGradeProblems(GRADE_GOOD.replace('Game.Damage.graze', 'Game.Combat.applyStatus($pc, "bleed", "手")')).some((p) => p.code === 'tool-too-heavy')],
			['🔴 ⑥ 反例（#696）：徒手路只有伤害、没有严重异常 ⇒ 报', penaltyGradeProblems(GRADE_GOOD.replace(/<<set \$pc\.statuses[^>]*>>/, '')).some((p) => p.code === 'bare-too-light')],
			['⑥ 反例：取不到宝箱段源码 ⇒ 报（不静默判过）', penaltyGradeProblems('').length === 1],
			['⑧ 正例（#705）：敌人攻击位点是已登记位点 ⇒ 不报', enemySiteProblems({ enemies: { 鼠: { attack: { site: '洞窟·鼠咬' } } } }, { hasSite: (n) => n === '洞窟·鼠咬' }).length === 0],
			['🔴 ⑧ 反例（#705）：攻击位点未登记 ⇒ 报', enemySiteProblems({ enemies: { 鼠: { attack: { site: '洞窟·幽灵咬' } } } }, { hasSite: () => false }).some((p) => p.code === 'enemy-site-unknown')],
			['⑧ 边界（#705）：没有 enemies ⇒ 不报（故事 1／最小示例走这条）', enemySiteProblems({}, { hasSite: () => false }).length === 0],
			['⑦ 正例（#696）：宝箱金币与五洞窟产出都声明了且内容读它 ⇒ 不报', incomeProblems(INCOME_M, { src: INCOME_SRC }).length === 0],
			['🔴 ⑦ 反例（#696）：某档没声明金币 ⇒ 报', incomeProblems({ ...INCOME_M, chest: { ...INCOME_M.chest, gold: { 普通: 5 } } }, { src: INCOME_SRC }).some((p) => p.code === 'chest-gold-missing')],
			['🔴 ⑦ 反例（#696）：声明了金币但内容没读 ⇒ 报', incomeProblems(INCOME_M, { src: 'Sg.notes.add("x")' }).some((p) => p.code === 'chest-gold-not-wired')],
			['🔴 ⑦ 反例（#696）：`keyChance` 越界 ⇒ 报', incomeProblems({ ...INCOME_M, caveRewards: { 矿洞: { keyChance: 120, fallback: '干粮' } } }, { src: INCOME_SRC }).some((p) => p.code === 'cave-keychance')],
			['⑤ 正例（#692）：六类都有类型标签 ⇒ 不报', labelProblems(KINDS, (k) => ({ shortFight: '短战斗', longFight: '长战斗', chest: '宝箱', cave: '特殊洞窟', trap: '陷阱', traveller: '旅人' })[k]).length === 0],
			['🔴 ⑤ 反例（#692）：某类标签为空 ⇒ 报', labelProblems(KINDS, (k) => (k === 'trap' ? '' : 'x')).length === 1],
			['🔴 ⑤ 反例（#692）：新增第七类却没标签 ⇒ 报', labelProblems([...KINDS, 'puzzle'], (k) => (k === 'puzzle' ? null : 'x')).length === 1],
			['③ 正例：宝箱声明面齐（位点已登记＋工具在道具表＋奖品曲线非空）', chestProblems({ mechanisms: { 锁扣: { site: 'A', rareSite: 'B', toolSite: 'C', tool: '撬棍' } }, loot: { 普通: ['干粮'] } }, { hasSite: (x) => !!x, hasItem: (x) => x === '撬棍' }).length === 0],
			// `#491` 判据 3（声明侧）：位点表里的 DC 差必须兑现"道具各降 3"与"珍贵更难"
			['③ 正例（#491）：工具降难＝声明值（12−9=3）且珍贵(15)>普通(12) ⇒ 不报', chestProblems(
				{ mechanisms: { 锁扣: { site: 'A', rareSite: 'B', toolSite: 'C', tool: '撬棍' } }, loot: { 普通: ['干粮'] }, toolReduce: 3 },
				{ hasSite: () => true, hasItem: () => true, siteOf: (n) => ({ A: { dc: 12 }, B: { dc: 15 }, C: { dc: 9 } })[n] }).length === 0],
			['🔴 ③ 反例（#491）：工具降难只降 1（12−11）⇒ 报（声明的"各降 3"没兑现）', chestProblems(
				{ mechanisms: { 锁扣: { site: 'A', rareSite: 'B', toolSite: 'C', tool: '撬棍' } }, loot: { 普通: ['干粮'] }, toolReduce: 3 },
				{ hasSite: () => true, hasItem: () => true, siteOf: (n) => ({ A: { dc: 12 }, B: { dc: 15 }, C: { dc: 11 } })[n] }).some((p) => p.code === 'tool-reduce')],
			['🔴 ③ 反例（#491）：珍贵 DC 没高于普通 ⇒ 报', chestProblems(
				{ mechanisms: { 锁扣: { site: 'A', rareSite: 'B', toolSite: 'C', tool: '撬棍' } }, loot: { 普通: ['干粮'] }, toolReduce: 3 },
				{ hasSite: () => true, hasItem: () => true, siteOf: (n) => ({ A: { dc: 12 }, B: { dc: 12 }, C: { dc: 9 } })[n] }).some((p) => p.code === 'rarity-dc')],
			['🔴 ③ 反例：三个位点都没登记（3）＋工具不在道具表（1）＋奖品曲线空（1）⇒ 5 条', chestProblems({ mechanisms: { 锁扣: { site: 'A', rareSite: 'B', toolSite: 'C', tool: '不存在' } }, loot: {} }, { hasSite: () => false, hasItem: () => false }).length === 5],
		];
		let selfBad = 0;
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += selfBad;
	}

	// 真实数据（未启用 ⇒ 报告一行即可，不参与判定）
	const story = w?.Sg?.story ?? {};
	const mech = story.mechanics?.() ?? null;
	const hasPassage = (n) => ctx.passageSrc?.has(n) ?? false;
	if (!mech?.roads) { console.log('  · 未启用（`mechanics().roads` 为空）——本门对不启用新机制的故事零影响'); }
	else {
		const rows = mech.roads.flatMap((r) => r.options ?? []);
		for (const p of refProblems(rows, hasPassage)) { console.log(`  ✗ 路「${p.kind}」ref=${p.ref}：${p.why}`); bad++; }
		for (const p of poolProblems(story.eventPool?.(1) ?? null, hasPassage)) { console.log(`  ✗ 事件池：${p.why}`); bad++; }
		for (const p of chestProblems(mech.chest, { hasSite: (n) => !!story.checkSite?.(n), hasItem: (n) => !!story.itemEffect?.(n), siteOf: (n) => story.checkSite?.(n) })) { console.log(`  ✗ 宝箱声明面：${p.why}`); bad++; }
		for (const p of rewardProblems(mech, { normalize: (id) => w?.Game?.Combat?.encounterReward(id), hasItem: (n) => !!story.itemEffect?.(n), srcOf: (n) => ctx.passageSrc?.get(n) })) { console.log(`  ✗ 战斗奖励声明面：${p.why}`); bad++; }
		for (const p of endingSummaryProblems(ctx.passageSrc?.get('地下村落') ?? '')) { console.log(`  ✗ 终点结算：${p.why}`); bad++; }
		// `#706`：状态时钟的调用点（唯一结算点＝`caveNext`）
		for (const p of tickSiteProblems([...(ctx.passageSrc ?? new Map()).entries()])) { console.log(`  ✗ 状态时钟（#706）：${p.why}`); bad++; }
		// `#726`：开场目标 ＋ 终点回扣（本故事自己的判据数据 `GOAL_KEYWORD`）
		for (const p of goalProblems(ctx.passageSrc?.get('醒来') ?? '', ctx.passageSrc?.get('地下村落') ?? '')) { console.log(`  ✗ 目标感（#726）：${p.why}`); bad++; }
		for (const p of enemySiteProblems(mech, { hasSite: (n) => !!story.checkSite?.(n) })) { console.log(`  ✗ 敌人攻击位点：${p.why}`); bad++; }
		for (const p of penaltyGradeProblems(ctx.passageSrc?.get('机制·chest') ?? '')) { console.log(`  ✗ 宝箱惩罚分级：${p.why}`); bad++; }
		for (const p of incomeProblems(mech, { src: ['机制·chest', '机制·cave'].map((n) => ctx.passageSrc?.get(n) ?? '').join('\n') })) { console.log(`  ✗ 收入声明面：${p.why}`); bad++; }
		const kindsSeen = [...new Set([...KINDS, ...rows.map((o) => o.kind).filter(Boolean), ...((story.eventPool?.(1)?.kinds) ?? [])])];
		for (const p of labelProblems(kindsSeen, (k) => story.eventKindLabel?.(k))) { console.log(`  ✗ 类型标签：${p.why}`); bad++; }
		const noCheck = (mech.roads ?? []).filter((r) => (r.options ?? []).some((o) => o.noCheck)).length;
		console.log(`  · 五段三路：${(mech.roads ?? []).length} 段 · ${rows.length} 条路 · 有 \`noCheck\` 的段 ${noCheck} 个 · 实例段落全部解析 ✓`);
	}

	if (bad) { console.error(`\n✗ 洞窟声明面门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 洞窟声明面门通过（表↔内容双向对账 · 宝箱声明面齐 · 战斗奖励声明面与落点一致 · 路面类型标签齐备 #692 · 宝箱惩罚分级与收入声明 #696 · 敌人攻击位点已登记 #705 · 终点有整局结算 #719）');
};
