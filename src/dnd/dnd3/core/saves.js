/* DND3 核心扩展 —— 豁免检定与状态效果（恐惧）
 *
 * B/X 风格豁免：掷 1d20 + 调整值 vs DC，≥ DC 成功。
 * 豁免类型对应 3E：petrification（石化）、spells（法术）、fortitude 等，
 * 由 `stats.save_<类型>` 字段提供调整值（默认 0；与六维调整值无关）。
 */

/** 豁免检定：1d20 + save_mod **+ 创伤罚** vs DC，返回 { success, roll, total, dc, mod, trauma }。
 *  创伤罚（`脑震荡` −1）＝ #1780 §四 C3：**只进 total／success**，✗ 不改 `mod`（该字段保持「角色自身加值」语义）。 */
DND3.save = (character, type, dc) => {
	const mod = character?.stats?.[`save_${type}`] ?? 0;
	const trauma = DND3.traumaSaveMod?.(character) ?? 0;
	/* 判定式收敛（#1798 E1a）：创伤罚走 `bonus`（✗ 并入 `mod` —— `mod` 的既有语义是「角色自身加值」）。 */
	const r = RPG.checkRoll({ mod, dc, bonus: trauma });
	return { success: r.success, roll: r.roll, total: r.total, dc: r.dc, mod: r.mod, trauma };  // ★返回形逐键不变（S6）
};

/** 便捷：执行豁免并 perform 结果 */
DND3.checkSave = (character, type, dc, label = type) => {
	const r = DND3.save(character, type, dc);
	RPG.perform(`（${character.name} 对抗${label}：${r.roll}` +
		`${r.mod ? RPG.formatMod(r.mod) : ''} vs DC ${dc} → ${r.success ? '成功' : '失败'}）`);
	return r.success;
};

/* ---------- 恐惧效果（区域 12 肉团的恐惧光环） ---------- */

/** fear —— dnd3 包的效果定义（由**本包**注册，core 不代劳；见 #1713 F3）。
 *  注册后 `RPG.fear` 即定义单例，可以直接传给 gain/lose/contains（也可传 'fear'）。 */
RPG.fear = RPG.defEffect({
	id: 'fear',
	name: '恐惧',
	desc: '被恐惧笼罩，只想逃离。',
	kind: 'debuff',
});

/** 恐惧豁免：目标须对抗法术豁免，失败获得 fear 减益。
 *  dc 参数由调用方按目标挑战等级或场景决定（引擎本身无 HD 概念）。 */
DND3.fearCheck = (character, dc = 12) => {
	if (character.contains(RPG.fear)) return true; // 已恐惧
	const ok = DND3.checkSave(character, 'spells', dc, '恐惧');
	if (!ok) {
		character.gain(RPG.fear);
		RPG.perform(`${character.name}被恐惧吞噬，只想逃离！`);
	}
	return ok;
};
