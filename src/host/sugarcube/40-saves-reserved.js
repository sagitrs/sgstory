/* ★`sgstory#1938`（对接 `sagitrs/sgstory-books#210`）：**保留槽判定**（决策层）
 *
 * 目的：给宿主存档浏览器一个**可问**的面 —— 「哪些槽是**系统自己用的**（快存／战前保底）」，
 * 从而让呈现层把这些槽**标出来／挡掉玩家手写**（✗ 挡住故事自身的系统写入 —— 见 `#210` 第 5 条）。
 *
 * ## 为什么是「读故事侧一处源」而不是引擎写死
 *   故事侧已有唯一取源：`stories/babel/src/world/encounters.js`
 *       const 槽位 = Object.freeze({ 快存: 3, 战前保底: 4, 手动: 5 });
 *   ⇒ 引擎**只读** `setup.BABEL.槽位`（✗ 复制数值）：换号／加号只改故事侧一处 ✓。
 *   ★本档**不碰 DOM**（`vendor/format.js` 造的存档行由宿主层的**呈现层**后处理 —— 见 `#1938` 六步序第 3 步 ✓）。
 *
 * ## 判定规则（就两条，✗ 不引入第三套真值）
 *   1. **除「手动」外**的所有数值槽号 ⇒ 系统保留（故事侧用「手动」这一名表示**玩家自己用**的槽 ✓；
 *      ✗ 不改写成「取前两个」/「取最小的两个」那种靠位置的规则 —— 位置不是语义 ✓）。
 *   2. `槽位` **读不到**／形状不对 ⇒ ★**出声**（`console.warn`，✗ 静默）＋ 返回**空集** ——
 *      口径是「**宁可少保护，也不误伤**」：空集 ⇒ 只是没有标记（玩家仍能手写），
 *      ✗ 不会把**手动槽**误标成「系统槽」而挡掉玩家的正常存档 ✓。
 *
 * ⚠ 返回值是**快照**（新数组、去重排序）⇒ 调用方改动它 ✗ 不影响任何内部状态 ✓。
 */
(() => {
	if (typeof RPG === 'undefined') return;                        // 与同层其余档同形：无宿主则静默不装
	if (typeof RPG.reservedSlots === 'function') return;           // 幂等：重复装配不覆盖

	/** 故事侧「玩家自己用」的槽位名（**唯一**排除项；其余数值槽号皆视为系统保留）。 */
	const 手动名 = '手动';

	/** ★保留槽号：读 `setup.BABEL.槽位`（故事侧一处源）。@returns `number[]`（快照，去重升序） */
	RPG.reservedSlots = function reservedSlots(槽位表) {
		const 表 = 槽位表 !== undefined ? 槽位表 : (typeof setup !== 'undefined' ? setup?.BABEL?.槽位 : undefined);
		if (表 == null || typeof 表 !== 'object' || Array.isArray(表)) {
			/* ★出声（✗ 静默）：这是**环境缺失**，不是「没有保留槽」——
			 *   两者必须不同形，否则后来者分不清「故事侧还没接」与「确实一个都没有」✗。 */
			if (typeof console !== 'undefined' && typeof console.warn === 'function') {
				console.warn('[RPG] 保留槽判定：读不到故事侧 `setup.BABEL.槽位` ⇒ 按**空集**处理（宁可少保护，也不误伤手动槽）');
			}
			return [];
		}
		const 集 = [];
		for (const k of Object.keys(表)) {
			if (k === 手动名) continue;                             // ★唯一的排除项（语义名，✗ 位置/大小）
			const v = 表[k];
			if (typeof v === 'number' && Number.isFinite(v)) 集.push(v);
		}
		return [...new Set(集)].sort((a, b) => a - b);              // ★快照：去重 ＋ 升序（✗ 递内部引用）
	};
})();
