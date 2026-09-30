/* DND3 核心扩展 —— 豁免检定与状态效果（恐惧）
 *
 * B/X 风格豁免：掷 1d20 + 调整值 vs DC，≥ DC 成功。
 * 豁免类型对应 3E：petrification（石化）、spells（法术）、fortitude 等，
 * 由 stats.save 里的字段提供调整值（默认 0）。
 */

/** 豁免检定：1d20 + save_mod vs DC，返回 { success, roll, needed } */
DND3.save = (character, type, dc) => {
	const mod = character?.stats?.[`save_${type}`] ?? 0;
	const roll = DND3.d20();
	const total = roll + mod;
	return { success: total >= dc, roll, total, dc, mod };
};

/** 便捷：执行豁免并 perform 结果 */
DND3.checkSave = (character, type, dc, label = type) => {
	const r = DND3.save(character, type, dc);
	RPG.perform(`（${character.name} 对抗${label}：${r.roll}` +
		`${r.mod ? RPG.formatMod(r.mod) : ''} vs DC ${dc} → ${r.success ? '成功' : '失败'}）`);
	return r.success;
};

/* ---------- 恐惧效果（区域 12 肉团的恐惧光环） ---------- */

RPG.fear = new RPG.Debuff({
	id: 'fear',
	name: '恐惧',
	desc: '被恐惧笼罩，只想逃离。',
});

/** 恐惧豁免：<4HD 生物见肉团须对抗法术，失败获得 fear 减益 */
DND3.fearCheck = (character, dc = 12) => {
	if (character.contains(RPG.fear)) return true; // 已恐惧
	const ok = DND3.checkSave(character, 'spells', dc, '恐惧');
	if (!ok) {
		character.gain(RPG.fear);
		RPG.perform(`${character.name}被恐惧吞噬，只想逃离！`);
	}
	return ok;
};
