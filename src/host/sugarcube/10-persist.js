/* L0 宿主适配 · **PersistContract 实现**（`sgstory#1912` 交付 1 · 步 2）
 *
 * 契约在 `src/core/ports/index.js`（**接口由 L1 定义、实现由 L0 给**）⇒ 本档是**唯一**允许碰
 * `State`／`Save`／`Config` 的地方（L1 只经 `RPG.portOf('persist')` 取）。
 *
 * ## 宿主真面（本席按码读到的，✗ 凭记忆）
 *   · 槽位：`Save.slots.save(slot, …)`／`Save.slots.load(slot)`／`Save.slots.has(slot)`（`Save.browser.*` 为其一层）
 *   · 自动档：`Config.saves.maxAutoSaves` —— ⚠ 产物里其访问器**读一下就把 0 抬成 1**（`ports/index.js` 档头
 *     的记入）⇒ 本实现**不假设**「auto no-op」，而是把「auto 参不参与」**显式声明**在 `slotSemantics()` 里。
 *   · 事实块落点：`State.variables` 的**域**由内核 `80-save.js` 的 `DOMAINS` 管；本端口只做「整块存取」，
 *     ✗ 不逐键写（那是内核的事）。
 *   ⚠ 触点纪律：内核侧 `State.variables` 的出现次数被门**按次数**盯着（`80-save.js` 保持 1 处）⇒
 *     本档作为**允许层**可以写，但**只在一处**收口（`vars()`），✗ 满地撒。
 */
(() => {
	/* 无宿主时（纯单元测试／构建期）一律走内存：让「端口在」与「端口真能存」不同形。 */
	const 有宿主 = () => typeof State !== 'undefined' && State && typeof State.variables === 'object';
	const 有槽 = () => typeof Save !== 'undefined' && Save?.slots && typeof Save.slots.save === 'function';

	/** ★唯一的 `State.variables` 触点（本档就这一处 —— 便于门按次数盯）。 */
	const vars = () => State.variables;

	const 内存 = new Map();                 // 无宿主时的替身（键＝slot）

	const 事实键 = '__portsFacts';
	const 版本键 = '__portsSchema';

	RPG.defPort('persist', {
		/** 当前 slot（宿主决定）。无宿主 ⇒ `null` ⇒ 内核走「不落盘」路（✗ 假装有档）。 */
		slotId() {
			if (typeof Config !== 'undefined' && Config?.saves?.slot != null) return String(Config.saves.slot);
			return null;
		},

		/** 把事实**整块**写进 slot。有宿主槽 ⇒ 走 `Save.slots`；否则落 `State.variables`；再否则内存。 */
		save(facts, { slot } = {}) {
			const s = slot ?? this.slotId();
			if (有槽() && s != null) {
				try { Save.slots.save(s, { [事实键]: facts, [版本键]: this.schemaVersion() }); return { ok: true, slot: s }; }
				catch (e) { return { ok: false, slot: s, reason: String(e?.message ?? e) }; }
			}
			if (有宿主()) {
				const v = vars();
				v[事实键] = facts;
				v[版本键] = this.schemaVersion();
				return { ok: true, slot: s ?? '(state)' };
			}
			内存.set(s ?? '(mem)', facts);
			return { ok: true, slot: s ?? '(mem)' };
		},

		/** 读出事实块；schema 版本不匹配 ⇒ 交给 `migrate`（✗ 就地丢字段）。 */
		load(slot) {
			const s = slot ?? this.slotId();
			let 包 = null;
			if (有槽() && s != null) {
				try { 包 = Save.slots.load(s) ?? null; } catch { 包 = null; }
			} else if (有宿主()) {
				包 = { [事实键]: vars()[事实键], [版本键]: vars()[版本键] };
			} else if (内存.has(s ?? '(mem)')) {
				包 = { [事实键]: 内存.get(s ?? '(mem)'), [版本键]: this.schemaVersion() };
			}
			if (!包 || 包[事实键] == null) return null;
			const 版 = Number(包[版本键] ?? 0);
			return 版 === this.schemaVersion() ? 包[事实键] : this.migrate(包[事实键], 版);
		},

		/** 该 slot 是否有档（Continue／autosave 面读它）。 */
		has(slot) {
			const s = slot ?? this.slotId();
			if (有槽() && s != null) {
				try { return Save.slots.has(s) === true; } catch { return false; }
			}
			if (有宿主()) return vars()[事实键] != null;
			return 内存.has(s ?? '(mem)');
		},

		/** 事实块版本（迁移链的锚）。 */
		schemaVersion() { return 1; },

		/** 逐版迁移。链在**实现侧**演进（内核✗持迁移表）。当前只有 v1 ⇒ 原样返回但**具名说明**。 */
		migrate(facts, fromVer) {
			/* 只有一版时不再造迁移 —— 但**不许静默**：抛出具名错，让「版本对不上」与「迁移成功」不同形。 */
			if (Number(fromVer) === this.schemaVersion()) return facts;
			throw new Error(`PersistContract.migrate：事实块版本 ${fromVer} → ${this.schemaVersion()} 的迁移链尚未建立`);
		},

		/**
		 * **显式声明**槽语义（内核只依赖这份声明，✗ 依赖宿主默认值）。
		 * ⚠ `auto` 的判法**只看显式配置**：`Config.saves.maxAutoSaves` 在产物里会被**读活**，故不据它推断。
		 */
		slotSemantics() {
			const 显式 = [];
			if (typeof Config !== 'undefined' && Array.isArray(Config?.saves?.slots)) 显式.push(...Config.saves.slots.map(String));
			const auto = typeof Config !== 'undefined' && Config?.saves?.autosave === true;   // ★显式 pin 才算参与
			return { auto, explicitSlots: 显式 };
		},
	});
})();
