/* L1 领域内核 · **L0 宿主端口的接口定义**（`sgstory#1912` 交付 1／3；架构出处 `docs/arch/sgstory-arch-review.md` 的 L0 节）
 *
 * ## 本档是什么（依赖倒置的那一半）
 *   架构裁定：**接口由 L1 定义**（本档＝`src/core/ports/`），**实现由 L0 提供**（`src/host/sugarcube/`）
 *   ⇒ 依赖方向 **L0 → L1**，**内核永远不知宿主**。故本档：
 *     · ✗ 不 import／不引用任何宿主符号（`State`／`$`／`jQuery`／`Dialog`／`:passageinit` 一个都不许出现）；
 *     · 只**声明**每个端口要有什么方法、每个方法收什么、回什么，并提供**注册面 ＋ 校验器**。
 *   ⚠ 本档**故意不用** `build.py` 给 `src/core/**` 注入的那个 `$`（`(function (RPG, $) {…})(setup.RPG, jQuery)`）——
 *     那是**历史便门**；L0 端口存在的全部理由，就是把这些触点**收口到 `src/host/**` 一处**。
 *     本档若用了 `$`，收口就成了空话（判据面按这条钉：内核侧 grep 宿主符号须 0 处）。
 *
 * ## 三端口（与架构档逐条对齐，✗ 自拟第四端口）
 *   · **PersistContract**：slot 读写 ＋ **版本化 schema ＋ 迁移链**；`Save.onLoad` 钩子的**唯一**消费者。
 *     对 L1 暴露「按契约存取事实」的接口 —— 内核不知序列化细节。
 *   · **RenderPort**：`perform`／`render` 输出的抽象（`$()` 直写 DOM 的点**全部**收编于此）；
 *     并为测试提供**可注入的输出收集器**（无头可跑的前提）。
 *   · **LifecyclePort**：passage 切换／session 纪元／异步取消的宿主事件翻译。
 *     ⚠ 票面 `#1912` 的「导航」一面**归此**（架构档原文即「passage 切换」）——
 *       若实施中确证有收不进这两者的宿主事实，**带证据提票**再议（✗ 静默加端口）。
 *
 * ## 契约数据（机器可读）
 *   `methods` 里的每一项都写清「收什么／回什么／为什么在这个端口」——它是**判据的读数源**
 *   （判据按此断言「实现齐了哪些方法」，✗ 在判据里另写一份方法名清单）。
 */

/** 端口的**机器可读契约**：id（人读）＋ methods（每项＝名＋签名＋为何在此）。 */
const CONTRACTS = {
	persist: {
		id: 'PersistContract',
		why: '把「存档/读档/迁移」收成一处：内核只按契约取事实，✗ 不知 slot 形态与序列化细节',
		methods: {
			slotId: '() => string｜null —— 当前 slot（宿主决定；无 slot 环境回 null ⇒ 内核据此走「不落盘」支）',
			save: '(facts, {slot}) => {ok, slot} —— 把事实**整块**写进 slot（✗ 内核逐键写）',
			load: '(slot) => facts|null —— 读出事实块；schema 版本不匹配 ⇒ 交给 migrate',
			has: '(slot) => boolean —— 该 slot 是否有档（Continue／autosave 面读它）',
			schemaVersion: '() => number —— 本契约定的事实块版本（迁移链的锚）',
			migrate: '(facts, fromVer) => facts —— 逐版迁移到当前版本；链在实现侧演进（✗ 内核持迁移表）',
		},
	},
	render: {
		id: 'RenderPort',
		why: '把「一行输出去哪」收成一处（正文／通知／宿主面板），并让**无头**能注入收集器',
		methods: {
			output: '(text, {channel, level}) => void —— 输出一条（正文/通知的分派在此，✗ 各处直写 DOM）',
			render: '(node|text) => void —— 场景/面板级渲染（`render` 面，与逐行 `output` 分列）',
			setCollector: '(fn|null) => void —— 注入输出收集器（无头/测试用；null ⇒ 恢复真宿主）',
		},
	},
	lifecycle: {
		id: 'LifecyclePort',
		why: '把「段落切换／会话纪元／异步取消」收成一处：旧会话失效由端口统一分发，内核只消费「当前纪元是否有效」',
		methods: {
			epoch: '() => number —— 当前会话纪元（每次重开/换档 +1）',
			isCurrent: '(token) => boolean —— 内核持 token 判「我这一轮还算不算数」（✗ 内核自己比时间戳）',
			onPassage: '(fn) => unsubscribe —— 段落切换的宿主事件翻译（**导航**即 passage 切换 ⇒ 在此）',
			cancelPending: '(reason) => void —— 异步取消：把在飞的等待作废（旧纪元的输出**不得**落屏）',
		},
	},
};

/** 已注册的实现：`{persist: impl, render: impl, lifecycle: impl}`（L0 在装载期填）。 */
RPG.ports = Object.create(null);

/** 契约读面（判据/实现按它取读数，✗ 各自记一份方法名清单）。 */
RPG.portContracts = CONTRACTS;

/** 某个实现**缺了哪些方法**（✗ 不抛，返回具名清单 —— 让调用方能报「缺哪几个」）。 */
RPG.portMissing = (key, impl) => {
	const c = CONTRACTS[key];
	if (!c) throw new Error(`未定义的端口「${key}」（可用：${Object.keys(CONTRACTS).join('／')}）`);
	const miss = Object.keys(c.methods).filter((m) => typeof impl?.[m] !== 'function');
	return { id: c.id, missing: miss };
};

/**
 * 注册一个端口实现（**L0 调**）。缺方法 ⇒ **具名抛错**（✗ 静默接受半成品 ——
 * 那会让「内核以为有端口」与「实际没有」同形，正是本次重构要消灭的那类形）。
 * @param key  'persist'|'render'|'lifecycle'
 * @param impl 实现对象（须齐 `methods` 列出的方法）
 * @returns impl
 */
RPG.defPort = (key, impl) => {
	const { id, missing } = RPG.portMissing(key, impl);
	if (missing.length > 0) {
		throw new Error(`端口 ${id} 的实现缺方法：${missing.join('、')}（契约见 src/core/ports/index.js）`);
	}
	if (RPG.ports[key]) console.warn(`[RPG] 端口「${key}」重复注册：将被覆盖。`);
	RPG.ports[key] = impl;
	return impl;
};

/**
 * 取端口（**L1 调**）。未注册 ⇒ **具名抛错**（✗ 回落一个空实现：
 * 「端口不在」与「端口正常工作」必须不同形，否则无头面会把缺口读成绿）。
 */
RPG.portOf = (key) => {
	const c = CONTRACTS[key];
	if (!c) throw new Error(`未定义的端口「${key}」（可用：${Object.keys(CONTRACTS).join('／')}）`);
	const impl = RPG.ports[key];
	if (!impl) throw new Error(`端口 ${c.id} 未注册（宿主适配器未装载？见 src/host/sugarcube/）`);
	return impl;
};

/** 三端口是否都已在位（读数用：交付 1 的判据面据此报「几个端口在位」）。 */
RPG.portsReady = () => Object.keys(CONTRACTS).filter((k) => !!RPG.ports[k]);
