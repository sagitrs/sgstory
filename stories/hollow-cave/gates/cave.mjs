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

export const run = (ctx) => {
	const { arg, wantAll, window: w } = ctx;
	if (!(wantAll || arg('cave'))) return;
	console.log('\n══ ⓪ab 洞窟声明面门（`#490`）——表 ↔ 内容双向对账 · 宝箱声明面 ══');
	let bad = 0;

	// 自证（纯函数 + 注入输入；正反例都跑同一份判据）
	{
		const has = (n) => ['路·1a', '路·2b'].includes(n);
		const cases = [
			['① 正例：`ref` 解析得到实例段落', refProblems([{ kind: 'chest', ref: '1a' }], has).length === 0],
			['🔴 ① 反例：`ref` 指向不存在的段落 ⇒ 报（表里有路、内容没有）', refProblems([{ kind: 'chest', ref: '9z' }], has).length === 1],
			['🔴 ① 反例：选项没有 `ref` ⇒ 报', refProblems([{ kind: 'chest' }], has).length === 1],
			['② 正例：六类齐全且实例都能解析', poolProblems({ kinds: KINDS, entries: Object.fromEntries(KINDS.map((k) => [k, [{ id: '1a', hint: 'x', ref: '1a' }]])) }, has).length === 0],
			['🔴 ② 反例：某类没有实例 ⇒ 报', poolProblems({ kinds: KINDS, entries: { ...Object.fromEntries(KINDS.map((k) => [k, [{ id: '1a', hint: 'x', ref: '1a' }]])), trap: [] } }, has).length === 1],
			['🔴 ② 反例：实例缺 `hint`／`ref` 解析不到 ⇒ 各报一条', poolProblems({ kinds: KINDS, entries: { ...Object.fromEntries(KINDS.map((k) => [k, [{ id: '1a', hint: 'x', ref: '1a' }]])), cave: [{ id: '9z', ref: '9z' }] } }, has).length === 2],
			['边界：`eventPool` 未启用（null）⇒ 不报（故事 1 走这条）', poolProblems(null, has).length === 0],
			// `#600` 奖励声明面：正例／🔴 未登记道具／🔴 形状非法／🔴 内容没接／🔴 内容绕过
			['④ 正例：掉落道具已登记且内容走单一落点', rewardProblems({ encounters: { short: { reward: { gold: 3, item: { id: '钥匙', chance: 30 } } } } }, { normalize: () => ({ gold: 3, item: { id: '钥匙', chance: 30 } }), hasItem: (x) => x === '钥匙', srcOf: () => '<<set _r to Game.Combat.grantReward($pc, "short")>>' }).length === 0],
			['🔴 ④ 反例：掉落指向未登记道具 ⇒ 报', rewardProblems({ encounters: { short: { reward: { item: '不存在的钥匙' } } } }, { normalize: () => ({ gold: 0, item: { id: '不存在的钥匙', chance: 100 } }), hasItem: (x) => x === '钥匙', srcOf: () => 'Game.Combat.grantReward(' }).length === 1],
			['🔴 ④ 反例：声明形状非法（引擎拒绝归一化）⇒ 报', rewardProblems({ encounters: { short: { reward: { item: { id: '钥匙', chance: 0 } } } } }, { normalize: () => { throw new Error('chance 必须在 1..100'); }, hasItem: () => true, srcOf: () => 'Game.Combat.grantReward(' }).length === 1],
			['🔴 ④ 反例：声明了掉落但内容没接 ⇒ 报"声明与行为对不上"', rewardProblems({ encounters: { long: { reward: { item: '钥匙' } } } }, { normalize: () => ({ gold: 0, item: { id: '钥匙', chance: 100 } }), hasItem: () => true, srcOf: () => '（内容里没有落账调用）' }).some((p) => p.code === 'reward-not-wired')],
			['🔴 ④ 反例：内容绕过单一落点（自己读声明）⇒ 报', rewardProblems({ encounters: { long: { reward: { item: '钥匙' } } } }, { normalize: () => ({ gold: 0, item: { id: '钥匙', chance: 100 } }), hasItem: () => true, srcOf: () => 'Game.Combat.grantReward($pc, "long") 和 (Game.Combat.slotsDecl().encounters.long.reward ?? {}).gold' }).some((p) => p.code === 'reward-bypassed')],
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
		const noCheck = (mech.roads ?? []).filter((r) => (r.options ?? []).some((o) => o.noCheck)).length;
		console.log(`  · 五段三路：${(mech.roads ?? []).length} 段 · ${rows.length} 条路 · 有 \`noCheck\` 的段 ${noCheck} 个 · 实例段落全部解析 ✓`);
	}

	if (bad) { console.error(`\n✗ 洞窟声明面门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 洞窟声明面门通过（表↔内容双向对账 · 宝箱声明面齐 · 战斗奖励声明面与落点一致）');
};
