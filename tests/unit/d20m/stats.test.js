/* d20m 数值块与基础约定的单元测试
 * 断言锚：**#1744 §2.9a（原始分真值）** ＋ #1697 §决策二（对称不变量）—— docs/plan/1744-d20m-combat.md §四
 * ★本文件的头两格是**对称不变量守卫**（#1697 §决策二）——两包各有同款，新包必须自带
 *   （#1732 交叉 A-1 把它列为硬约束：义体等加值**须**走 STAT_BLOCK，否则这里当场红）。
 */
(() => {
	const D = () => setup.D20M;

	test('d20m：stats 填满全部字段且可覆盖', () => {
		const s = D().stats({ ac: 15 });
		assert.eq(Object.keys(s).length, Object.keys(D().STAT_BLOCK).length, '字段数一致');
		assert.eq(s.ac, 15, '覆盖生效');
		assert.eq(s.bab, 0, '默认基础攻击加值 0');
	});

	test('d20m：全部角色数值块完全对称', () => {
		const names = ['Player', 'ArmatureDrone'];
		const first = Object.keys(D()[names[0]].stats).sort().join(',');
		for (const n of names.slice(1)) {
			assert.eq(Object.keys(D()[n].stats).sort().join(','), first, `${n} 不对称`);
		}
	});

	test('d20m：数值块键集精确相等且不含调整值字段（#1697 P1）', () => {
		const keys = Object.keys(D().stats()).sort();
		const wants = ['ac', 'bab', 'cha', 'con', 'cr', 'dex', 'int', 'str', 'wis'].sort();
		assert.eq(keys.join(','), wants.join(','), '键集逐项相等');
		assert.ok(!keys.some((k) => k.endsWith('_mod')), '不含任何以 _mod 结尾的键');
	});

	/* 出处：SRD d20M · source/4Future未来/9FutureRobots.md:140（「Table: Armature Robot Frames」的 Small 行；
	 * 机架节入口见同文 :124）。HP/AC 为本仓 **house rule（非 SRD）**（骰面固定化 ＋ 尺寸加值），不在本格断言对齐。
	 * 锚：**#1744 §2.11**（无人机表值面） */
	test('d20m：骨架型无人机数值对齐 SRD d20M · Armature(Small)（AC 12, HP 8, STR 11, DEX 12）', () => {
		assert.eq(D().ArmatureDrone.stats.ac, 12);
		assert.eq(D().ArmatureDrone.maxHp, 8);
		assert.eq(D().ArmatureDrone.stats.str, 11, '原始分 STR 11（⇒ +0）');
		assert.eq(D().ArmatureDrone.stats.dex, 12, '原始分 DEX 12（⇒ +1）');
		assert.eq(D().ArmatureDrone.stats.cha, 1, '原始分 CHA 1（⇒ −5）');
	});
})();
