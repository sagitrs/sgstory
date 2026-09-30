/* RPG 核心 —— 背包与使用系统（SugarCube State 与道具实例之间的桥）
 *
 * $inventory 里存的是纯数据快照 [{id, charges, equipped}, ...]，
 * 一切修改都通过本模块进行，故事代码不需要关心还原/扣次数等细节。
 */

const inv = () => {
	const vars = State.variables;
	if (!Array.isArray(vars.inventory)) vars.inventory = [];
	return vars.inventory;
};

/** 发放道具（同 id 可叠加时会合并剩余次数） */
RPG.give = (id, n = 1) => {
	const def = RPG.createItem(id); // 读默认定义（次数、可否叠加）
	const list = inv();
	if (def.stackable && def.charges != null) {
		const slot = list.find((s) => s.id === id);
		if (slot) {
			slot.charges += def.charges * n;
			return;
		}
	}
	for (let i = 0; i < n; i++) list.push(def.toJSON());
};

/** 是否持有某道具 */
RPG.has = (id) => inv().some((s) => s.id === id);

/** 某道具当前是否已装备（剧情条件判断用） */
RPG.isEquipped = (id) => inv().some((s) => s.id === id && s.equipped);

/** 某装备槽当前已装备的道具（还原实例；没有则 null）。槽见 Item.slot。 */
RPG.equippedIn = (slotName) => {
	const s = inv().find((x) => x.equipped && RPG.reviveItem(x).slot === slotName);
	return s ? RPG.reviveItem(s) : null;
};

/** 当前已装备的武器（'weapon' 槽的便捷读取） */
RPG.equippedWeapon = () => RPG.equippedIn('weapon');

/* ---------- 共享动作库：任何道具都可在 actions 里直接引用 ---------- */

/**
 * 装备动作（槽位感知）：给道具打上 equipped 标记。
 * **同槽互斥**——该槽已有其他装备时失败（提示先卸下），不自动换装；
 * 不同槽（武器/身体/脚……）互不影响，可以同时装备。
 */
RPG.slotEquip = function slotEquip() {
	if (this.slot == null) {
		this.perform(`「${this.name}」不是可装备的物品。`);
		return;
	}
	const current = RPG.equippedIn(this.slot);
	if (current && current.id !== this.id) {
		this.perform(`「${current.name}」正占着${RPG.slotLabels[this.slot] ?? this.slot}槽——先卸下它。`);
		return;
	}
	this.equipped = true;
	this.perform(`你装备了「${this.name}」。`);
};

/** 卸下动作：清除 equipped 标记（未装备时是静默空操作） */
RPG.slotUnequip = function slotUnequip() {
	if (!this.equipped) return;
	this.equipped = false;
	this.perform(`你卸下了「${this.name}」。`);
};

/** 槽位中文名表（提示文案用）。core 不认识具体槽名——由规则包补全：
 *  RPG.slotLabels.weapon = '武器' 之类。 */
RPG.slotLabels = {};

/**
 * 战利品结算：把目标（Character / Chest）身上**未装备**的道具转移给玩家。
 * 规则：物品会掉落；装备与技能不会掉落。
 */
RPG.loot = (victim) => {
	const slots = victim.items;
	if (!Array.isArray(slots) || slots.length === 0) return;
	const dropped = slots.filter((s) => !s.equipped);
	if (dropped.length === 0) return;
	const names = dropped.map((s) => RPG.reviveItem(s).name);
	for (const s of dropped) {
		inv().push(s); // 原样转移快照（保留剩余次数）
		slots.splice(slots.indexOf(s), 1);
	}
	RPG.perform(`你获得了：${names.join('、')}。`);
};

/**
 * 使用道具（托管路径）：按 action 字符串分发给道具的动作处理器。
 *   item.used(that, from, action) → 提交可变状态 → 发事件。
 * 动作在实例上修改的 equipped 会提交回背包快照；
 * 只有默认动作 'use' 消耗充能（装备/卸下不耗次数）。
 */
RPG.useItem = (id, that, from, action = 'use') => {
	const list = inv();
	const slot = list.find((s) => s.id === id);
	if (!slot) {
		setup.RPG.perform(`背包里没有「${RPG.createItem(id).name}」。`);
		return false;
	}
	const item = RPG.reviveItem(slot);
	item.used(that, from, action);
	slot.equipped = item.equipped; // 动作里改的装备态 → 提交回快照
	if (action === 'use' && item.charges != null) {
		slot.charges = item.charges - 1;
		if (slot.charges <= 0) list.splice(list.indexOf(slot), 1);
	}
	RPG.events.emit('item:used', { id, name: item.name, action, target: that, from });
	return true;
};

/** 装备 = 对道具执行 equip 动作（语义由道具的 actions 定义） */
RPG.equip = (id) => RPG.useItem(id, null, null, 'equip');

/** 卸下 = unequip 动作 */
RPG.unequip = (id) => RPG.useItem(id, null, null, 'unequip');

/** 切换装备状态：已装备 → 卸下；未装备 → 装备 */
RPG.toggleEquip = (id) =>
	RPG.isEquipped(id) ? RPG.unequip(id) : RPG.equip(id);

/** 状态栏用：背包内容的可读名称（“绷带×2（已装备）”这种） */
RPG.inventoryLabel = () => {
	const list = inv();
	if (list.length === 0) return '（空）';
	return list
		.map((s) => {
			const item = RPG.reviveItem(s);
			const label =
				item.charges != null && item.charges > 1
					? `${item.name}×${item.charges}`
					: item.name;
			return item.equipped ? `${label}（已装备）` : label;
		})
		.join('、');
};
