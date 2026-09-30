/* D20M 怪物 —— 骨架型无人机（Armature 机架 · Small · PL 5）
 *
 * 数值出处：SRD d20M · source/4Future未来/9FutureRobots.md:140
 *   （「Table: Armature Robot Frames (Pl 5)」的 **Small** 行）
 *   源表逐列读数：Base Purchase DC 16｜Base Hit Dice 1/2d10｜Extra Hit Points 5｜
 *   Str 11｜Dex 12｜Con —｜Int —｜Wis 10｜Cha 1｜Maximum Hit Dice —（不可加 HD）。
 *   机架节入口见同文 :124（「ARMATURE (PL 5)」）。
 *   通性引用：SRD d20M · source/4Future未来/9FutureRobots.md:85-86
 *     （:85「Hit Die: d10.」；:86「Base Attack Bonus: 3/4 of total Hit Dice.」）
 *   另 :97（armature／biomorph／liquid-state 机架**不受重击**）—— 本笔未落该面，见下「不做的」。
 *
 * ★本笔的 **house rule（非 SRD）** 面（✗ 源表直读；权威形见 `README.md` §三.5 第 5 条「不许无出处」）：
 *   · hp/maxHp 8 ＝ :140 的 `1/2d10`（骰面固定化）＋ `Extra Hit Points 5` 的 **house rule（非 SRD）** 取值；
 *   · ac 12 ＝ 10 ＋ 灵巧调整值(+1) ＋ Small 尺寸加值(+1) —— 尺寸加值表不在本笔 pin 面内（house rule 面）；
 *   · bab 0 ＝ :86 公式（3/4 × 1/2 HD）＋ 同源向下取整总则的结果（`2msrdbasics基本.md:25`）；
 *   · cr 0 ＝ house rule（非 SRD）（源机架表**无** CR 列）。
 * ★**缺口登记（house rule 面，✗ 声称对齐）**：:90 明说机器人「have no Constitution score and usually
 *   no Intelligence score」——而本仓 STAT_BLOCK 是**六维对称块**（#1697 §决策二 的对称不变量）
 *   ⇒ **无「none」这一态的表示** ⇒ 本笔只能落缺省 10 并登记为缺口（其落地须先动 STAT_BLOCK 语义，
 *   属后续票）。
 * ★✗ 落：不受重击（:97）／免疫面（:91-92）／修复检定（:96）—— 均无引擎承载体（#1744 票面 ✗ 不做）。
 */

D20M.ArmatureDrone = RPG.defCharacter({
	id: 'armature-drone',
	name: '骨架型无人机',
	hp: 8, maxHp: 8,
	stats: D20M.stats({
		str: 11, dex: 12, wis: 10, cha: 1, // 同 :140（Small 行的 Base Ability Scores 列）
		ac: 12, bab: 0, cr: 0,
	}),
	items: [{ id: 'beretta-92f', equipped: true }],
});

jQuery(document).on(':enginerestart', () => {
	D20M.ArmatureDrone.hp = 8; D20M.ArmatureDrone.effects = [];
	D20M.ArmatureDrone.items = [{ id: 'beretta-92f', equipped: true }];
});
