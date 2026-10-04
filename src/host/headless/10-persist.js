/* L0 宿主适配 · **PersistContract 实现（内存）** —— `sgstory#1998`
 *
 * 契约在 `src/core/ports/index.js`（接口由 L1 定义、实现由 L0 给）。本实现：
 *   · 事实块按 slot 收进一个 `Map`（**深拷贝**进出：✗ 递内部引用 —— 那会让「存档」变成「后门」）；
 *   · **只有显式槽**（`slotSemantics().explicitSlots` 为空是本实现的声明，✗ 不谎报「支持自动档」）；
 *   · 迁移链只有一版：版本对不上 ⇒ **具名抛**（✗ 原样返回 —— 那会把「迁移成功」与「没法迁」同形）。
 */
(() => {
	/** slot → 事实块（深拷贝存，深拷贝取）。 */
	const 内存 = new Map();
	const 副本 = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
	const 键 = (slot) => String(slot ?? '(mem)');

	RPG.defPort('persist', {
		/** 无宿主环境 ⇒ `null`（内核据此走「不落盘」支，✗ 假装有档）。 */
		slotId() { return null; },

		save(facts, { slot } = {}) {
			const s = 键(slot);
			内存.set(s, 副本(facts ?? null));
			return { ok: true, slot: s };
		},

		load(slot) {
			const s = 键(slot);
			return 内存.has(s) ? 副本(内存.get(s)) : null;
		},

		has: (slot) => 内存.has(键(slot)),

		schemaVersion: () => 1,

		migrate(facts, fromVer) {
			if (Number(fromVer) === 1) return facts;
			throw new Error(`[headless] 迁移链：没有 ${fromVer} ⇒ 1 的迁移（当前 schema 版本 1；`
				+ '链的演进在实现侧，✗ 内核持迁移表）');
		},

		/** 本实现的**显式声明**：不参与自动档，也没有宿主槽（内核只依赖这份声明）。 */
		slotSemantics: () => ({ auto: false, explicitSlots: [] }),

		/* ---- 读数面（✗ 在契约里；供装置/判据取）---- */
		/** 现有槽 id（排序）。 */
		slots: () => [...内存.keys()].sort(),
	}, { host: HEADLESS.id });
})();
