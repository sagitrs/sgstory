/* RPG 核心 —— 采集原语最小形（#1747：一段「收集-建设-升层」的收集侧）
 *
 * 设计裁定（领队 @ #1729 ①）：资源模型采**甲案** —— **资源即 Item**，零新 face。
 *   「石料/木材/火种/种子/铜矿」全部是普通 `Item`（`10-item.js defItem`），
 *   库存、掉落（`30-inventory.js RPG.loot`）、发放（`RPG.give`）**一律复用**，
 *   本文件**不新增任何数据结构**。
 *
 * 本文件只提供**采集动作入口**：把「收进背包」这一步语义化，使「在 1–9 层采到铜矿」
 *   可判、可测、可叙事，而**不引入 node/矿脉/资源记账面**（那属二段以后的复杂度阶梯）。
 *
 * ★ 为何是「道具上的动作」而非新函数：
 *   经 `RPG.act(actor, point, target, 'gather')` 的统一入口分派 ⇒ 施术者背包、原子提交、
 *   事件、成本后置全部复用既有语义（`30-inventory.js RPG.act`）。
 *   采集与使用/装备走**同一条通路**，不造第二套入口（与领队裁 ③ 的「防两套权威」同源）。
 */

/**
 * 共享动作：按**产出表**把资源放进 `from` 的背包。
 * 用法：采集点道具声明 `actions: { gather: RPG.gatherFrom }`，并以 `yields` 描述产出。
 *
 * `this.yields` 条目：`{ id, n?, chance? }`
 *   - `id`     产出资源（须是**已注册**的 Item）
 *   - `n`      数量，默认 1；可为 `"1d4"` 形式（经 `RPG.roll`，走 `RPG.rng` 唯一随机入口）
 *   - `chance` 概率，默认 1；`0.35` ⇒ `RPG.rng.unit() < 0.35` 才产出
 *
 * 采一次扣一次 `charges` 由 **`RPG.act` 统一提交**（动作本体不碰快照）——故有限次采集点
 *   只需声明 `charges: 3`，其余交给 `act`（这也是复用统一入口的直接收益）。
 *
 * 全部条目都未产出 ⇒ `perform` 一行「什么也没采到」，**不抛错**（采空是正常叙事结果）。
 * 产出 id 未注册（数据拼写错）⇒ **跳过该项并提示**，✗ 不抛错（数据面由完整性测试抓）。
 */
RPG.gatherFrom = function gatherFrom(that, from) {
	const who = from ?? that;
	const list = this.stats?.yields;
	if (!Array.isArray(list) || list.length === 0) {
		this.perform(`「${this.name}」没有产出表——无法采集。`);
		return false;
	}
	if (!Array.isArray(who?.items)) {
		this.perform(`「${who?.name ?? '?'}」没有背包，采不了。`);
		return false;
	}
	/* 投递复用 `RPG.deliverYields`（与合成**同一实现** —— 产出如何进背包只有一处）。
	 * 未命中概率者静默跳过（概率是设计，不是错误）；全部未产出 ⇒ 一行提示。 */
	const got = RPG.deliverYields(who, list, this.name);
	if (got.length > 0 && this.charges != null) {
		/* ★ **采一次耗一分** —— 扣在**实例**上（✗ 不调 `RPG.take`），理由（实测）：
		 *   `RPG.act` 在动作**之后**跑 `RPG.commit`，而 commit 会把**还原实例**的 `charges`
		 *   写回快照 ⇒ 若动作内用 `RPG.take` 改的是**快照**，会被 commit **覆盖**回去
		 *   （实测：采集前 6 ⇒ take 后快照 5 ⇒ commit 写回实例的 6 ⇒ 表面「采了不耗」）。
		 *   故此处只改 `this.charges`（实例），**提交交给 `act` 的既有 commit**（一条通路）。
		 *   ⚠ `act` 的「`charges <= 0` ⇒ 移除槽」仅覆盖 `use` 动作 ⇒ 采空时**由本动作自行摘槽**
		 *   （`who.items` 就是快照数组；摘掉后 `commit` 的 `find` 找不到槽即静默返回）。 */
		this.charges -= 1;
		if (this.charges <= 0) {
			/* 摘槽：`who.items` 就是快照数组（同引用）。**按 id 找索引**即可，
			 *   ✗ 不必绕「先 find 实例、再 indexOf 恒等」（`#1776` D 席 N-2：可读性）。 */
			const at = who.items.findIndex((s) => s.id === this.id);
			if (at >= 0) who.items.splice(at, 1);
		}
	}
	if (got.length === 0) this.perform(`在「${this.name}」处什么也没采到。`);
	else this.perform(`采得：${got.join('、')}。`);
	/* ★ 返回值契约（`#1776` D 席缺陷 2 定形）：**只有「这次做不到」才 `return false`**
	 *   （如「没有产出表」「没有背包」）。
	 *   「未命中概率／产出 id 未注册被跳过」⇒ 采集**确实执行了**（只是产出为空）⇒ 返回 `undefined`
	 *   （= 成功）；否则 `RPG.act` 会报成 `rejected/action-refused`，调用方误以为没采成
	 *   —— 而采集点该扣的次已经扣了（本席实测到这一矛盾后定形）。 */
};

/**
 * 采集入口（糖）：对**采集点道具**执行 `gather` 动作。
 * 语义等价于 `RPG.act(actor, pointId, actor, 'gather')`（后者是**托管路径**的显式形）。
 *
 * @param pointId 采集点道具 id（须已注册且声明 `actions.gather`）
 * @param actor   施术者；缺省取 `RPG.playerActor()`（与 `RPG.useItem` 同一缺省语义）
 * @returns 见 `RPG.act`：`{ status, item?, reason? }`；无玩家角色时 `false`
 */
RPG.gather = (pointId, actor) => {
	const who = actor ?? RPG.playerActor();
	if (!who) return false;   // 未注册玩家角色（纯 core 场景）⇒ 与「背包里没有」同形
	return RPG.act(who, pointId, who, 'gather');
};
