/* core/42-battle-intent.js（`sgstory#1914` 增量 3/3）：**单位号** —— 战斗里的稳定标识。
 *
 * ## 为什么需要
 * 现码用**名字**标识战斗单位：目标选项 `value: c.name`，解析时再按名 `find` ⇒ 两只同名单位
 * （如「幼獾」「幼獾」）**只能选中第一只**（本席实测：答第二只的名字，掉血的是第一只）。
 *
 * ## 形（公开面英文，与仓内既有引擎面 `RPG.deposit`／`canStack`／`noticeChannel` 一致）
 * - `of(u)`：取（必要时**发**）单位号 ⇒ 形如 `'u7'`（**不透明**，调用方不得解析其内容）。
 * - `resolve(id, list)`：按号找回；**找不到抛具名错**（调用方自行决定出声还是兜成拒绝）。
 * - `issued()`：已发号数（诊断量）。
 *
 * ## 为何用 **WeakMap**（✗ 实例字段）
 * `DND3.Player` 是**类级单例**且**随存档往返**（`Character.toJSON` 会序列化它）⇒ 写成实例字段会
 * **跟着档走**（旧档里冒出 `u7`），而号只在**本场战斗**有意义。WeakMap 只认对象同一性 ⇒ 不入档、
 * 不污染快照，对象回收即忘（无泄漏）。战斗**不允许中途存档**（P0）⇒ 这个生命周期足够。
 *
 * ## 装载序
 * 本件被 `40-battle.js` **之后**的代码使用（`build.py` 按字典序装载；`42` > `40`）⇒ 只在**运行时**
 * 取用，装载期不碰 `40` 的产物。
 */
(() => {
	const ids = new WeakMap();
	let seq = 1;

	/** 取（必要时发）单位号。非对象入参 ⇒ 具名错（✗ 静默给个假号）。 */
	const of = (u) => {
		if (u == null || (typeof u !== 'object' && typeof u !== 'function')) {
			throw new Error(`unitId.of：需要对象（收到 ${typeof u}）—— 号只发给战斗单位`);
		}
		let v = ids.get(u);
		if (v == null) { v = `u${seq++}`; ids.set(u, v); }
		return v;
	};

	/** 按号找回；`list` 缺省为空表 ⇒ 必找不到（照抛）。 */
	const resolve = (id, list) => {
		const 表 = list ?? [];
		const hit = 表.find((u) => ids.get(u) === id);
		if (hit == null) {
			throw new Error(`unitId.resolve：候选中没有号 ${JSON.stringify(id)}`
				+ `（候选 ＝ ${JSON.stringify(表.map((u) => [u?.name, ids.get(u) ?? null]))}）`);
		}
		return hit;
	};

	/** 已发号数（诊断量；判据用它证「同名两只是两只」）。 */
	const issued = () => seq - 1;

	RPG.unitId = Object.freeze({ of, resolve, issued });
})();
