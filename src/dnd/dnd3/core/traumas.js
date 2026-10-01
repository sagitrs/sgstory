/* DND3 跨场物理 debuff（创伤）—— #1780（10–19 档 = 二段 #1730）
 *
 * 设计稿（**单一权威源**，本文件的规范句均出自该稿；✗ 本文件自造规范）：
 *   `docs/plan/1780-dnd3-cross-battle-trauma.md`（§二 条目／§三 施加／§四 消费／§五 解除／§六 持久化）
 *
 * ★**条目为 house rule（非 SRD）**：3.5 版 SRD **无跨场创伤系统**（3E pin 面 5 份反向扫：
 *   `创伤/跨场/持续伤害/永久/persistent/crippl` 全 0 命中——读数见设计稿 §一）。
 *   但**机制形**贴源（✗ 自造一套「敷药即消」）：源 A＝Caltrops 条（伤 ⇒ **持续到 DC 15
 *   治疗检定**或魔法治疗）；源 B＝Clay Golem 的 Cursed Wound（**不自愈/抗治疗**）。
 *   ⇒ 两处出处（含 pin 行号与逐字引文）在设计稿 §一；**✗ 本文件复述版本号与行号**，防两处漂移。
 *
 * `scope: 'persistent'` 的**语义**引 `docs/plan/1689-5e-conditions.md` §十.3（**单一权威源**，✗ 复述）。
 */

/* ---------- 条目表（4 条；house rule（非 SRD））----------
 * `dc` ＝ 解除所需**治疗检定**的目标值（源 A 用 DC 15）｜`desc` 只写**本文件已实现**的面
 * （未实现者显式标注 —— 遵 #1758 T 席 MAJOR-1 立的模板）。
 */
DND3.Traumas = {
	laceration: {
		name: '裂伤',
		desc: '每场战斗首回合攻击掷骰 −1；整备时经治疗检定解除。',
		scope: 'persistent',
		dc: 15,
	},
	fracture: {
		name: '骨裂',
		desc: '近战伤害 −1（攻击掷骰不受此条）；钝击类武器重击造成；治疗检定解除。',
		scope: 'persistent',
		dc: 18,
	},
	concussion: {
		name: '脑震荡',
		desc: '豁免掷骰 −1；重击且伤害达目标上限一半时造成；治疗检定解除。',
		scope: 'persistent',
		dc: 18,
	},
	bleeding: {
		name: '失血',
		desc: '每场战斗开始 −1 HP（不低于 1，不致死）；**不自愈**，须治疗（魔法治疗或治疗检定）。',
		scope: 'persistent',
		dc: 15,
		magicalCure: true,   // 源 A/B 的「魔法治疗」通路：任一 healing 效果可解（§五 H2）
	},
};

/* ---------- 注册进 Effect 注册表（#1727 单层权威）---------- */
for (const [id, tr] of Object.entries(DND3.Traumas)) {
	RPG.defEffect({
		id,
		name: tr.name,
		desc: tr.desc,
		kind: 'debuff',
		scope: tr.scope,
		trauma: true,
		dc: tr.dc,
	});
}

/* ---------- 战斗边界：首回合标记（C1 的攻击罚窗口；C4 的失血 tick 时机）----------
 * core **没有** `battle:start` 事件（`src/core/40-battle.js` 只发 turnStart／turnEnd／end）
 * ⇒ 「首回合」＝本场**首次** `battle:turnEnd` 之前；`battle:end` 复位（下一场重新算）。
 * 断言锚：设计稿 §四 C1／C4。 */
let firstRound = true;

/** 当前是否处于**本场战斗的首回合**（✗ 未开战时的直调也算首回合——即「开场」语义） */
DND3.inFirstBattleRound = () => firstRound;

RPG.events.on('battle:turnEnd', () => { firstRound = false; });
RPG.events.on('battle:end', () => { firstRound = true; });

/* ---------- 消费面（全部为整数加法：3E 惯用，✗ 用 5E 的 adv/dis 词汇）---------- */

/** C1 `裂伤`：攻击掷骰罚（**首回合**才生效） */
DND3.traumaAttackMod = (c) => (c?.contains?.('laceration') && firstRound ? -1 : 0);

/** C2 `骨裂`：近战**伤害**罚（✗ 不作用于攻击掷骰——与 C1 分属不同量纲） */
DND3.traumaDamageMod = (c) => (c?.contains?.('fracture') ? -1 : 0);

/** C3 `脑震荡`：豁免掷骰罚 */
DND3.traumaSaveMod = (c) => (c?.contains?.('concussion') ? -1 : 0);

/** C4 `失血`：每场战斗开始 −1 HP（下限 1，✗ 不致死）。返回实际被扣者的条数 */
DND3.tickBleeding = (actors) => {
	let n = 0;
	for (const c of actors ?? []) {
		if (!(c instanceof RPG.Character) || !c.contains('bleeding')) continue;
		if ((c.hp ?? 0) <= 1) continue;
		c.hp = Math.max(1, c.hp - 1);
		n++;
	}
	return n;
};

/* 失血 tick 的接线：本场**首次** turnStart 时对该场全体结算（payload 无 battle 时退化为该回合角色）。 */
/* ⚠ **隐式契约（MN-1）**：本订阅读 `battle.players` / `battle.enemies` —— 这是 `RPG.Battle` 的**实例字段名**
 *   （core 未把它声明为契约）⇒ 若 `Battle` 改字段名或改用统一 `actors` 池，**失血 tick 会静默不触发**（无报错）。
 *   改动 `Battle` 字段者须同笔核此处（或以 `opts` 显式传池，见 `treatTrauma` 的 opts 形）。 */
RPG.events.on('battle:turnStart', ({ actor, battle } = {}) => {
	if (!firstRound) return;
	const pool = battle ? [...(battle.players ?? []), ...(battle.enemies ?? [])] : [actor];
	DND3.tickBleeding(pool);
});

/* ---------- 施加面（§三：重击确认命中 ⇒ 按**固定优先级**择一，✗ 随机表）---------- */

/** 由这一击的读数决定施加哪一条（**确定性**，便于用例复现；优先级见 §三 A2）。 */
DND3.traumaForHit = ({ damage = 0, maxHp = 0, crushing = false } = {}) => {
	if (maxHp > 0 && damage >= maxHp / 2) return 'concussion';
	if (crushing) return 'fracture';          // ★D 席 MAJOR 后**提序**：钝击判据先于伤害阈值
	if (damage >= 3) return 'bleeding';       //   （否则 `fracture` 只在「伤害恰为 2」的边界可达 ⇒ 事实死条目）
	return 'laceration';
};

/** 施加单条：只对 `RPG.Character`；已持有 ⇒ 幂等返回 null；已倒地 ⇒ 不施加（§三 A3/A4/A5） */
DND3.applyTrauma = (c, id) => {
	if (!(c instanceof RPG.Character)) return null;
	if (!DND3.Traumas[id]) throw new Error(`未知创伤：${id}`);
	if (c.hp <= 0) return null;
	if (c.contains(id)) return null;
	c.gain(id);
	return id;
};

/** 重击施加总入口（`DND3.meleeAttack` 在**重击确认命中**后调用；§三 A1） */
DND3.applyTraumaOnCrit = (target, hit) => DND3.applyTrauma(target, DND3.traumaForHit(hit));

/* ---------- 解除面（§五：治疗检定；形借源 A 的 DC 15 Heal check）---------- */

/**
 * 治疗检定：`1d20 + mod` 对抗该条的 `dc`（**`total >= dc` 即成功**——3E 惯用）。
 * **失败 ⇒ 保留**且返回 `ok:false`（✗ 不静默成功）。成功 ⇒ 移除并返回 `removed`。
 * `mod` 由调用方给（整备点/草药的治疗加值；缺省 0）。
 */
DND3.treatTrauma = (c, id, { mod = 0 } = {}) => {
	const tr = DND3.Traumas[id];
	if (!tr) throw new Error(`未知创伤：${id}`);
	if (!c.contains(id)) return { ok: false, roll: 0, total: 0, dc: tr.dc, removed: null, why: 'not-held' };
	const roll = DND3.d20();
	const total = roll + mod;
	const ok = total >= tr.dc;
	if (ok) c.lose(id);
	return { ok, roll, total, dc: tr.dc, removed: ok ? id : null };
};

/** 源 A/B 的「魔法治疗」通路：任一 healing 效果可解 `bleeding`（§五 H2；本仓以效果 id 约定）。 */
DND3.magicalCure = (c, effectId) => {           // MN-4：✗ 默认参（将来多条可解时语义含糊）
	const tr = DND3.Traumas[effectId];
	if (!tr?.magicalCure || !c.contains(effectId)) return false;
	c.lose(effectId);
	return true;
};
