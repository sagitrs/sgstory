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
 *
 * ## 宿主：三端口之上的一层（`sgstory#1989` 阶段 6）
 *   三端口是**能力契约**，宿主是**提供者**。`#1989` 之前提供者没有身份：`RPG.ports` 是一张平表，
 *   谁后 `defPort` 谁覆盖（重复只 warn）⇒ 两个宿主同载时，「哪个宿主在跑」取决于**加载序**。
 *   本层给宿主一个可登记、可选择、可读数的身份，并把「未选择」做成**具名抛错**：
 *
 *   · 登记：`RPG.defHost(id, {desc})` 开一个宿主；`RPG.defPort(key, impl, {host})` 把端口**填进指定的宿主**
 *     （`host` 必填 —— ✗ 缺省落影子表，那会让宿主身份重新变成装饰件）。
 *   · 解析：**已定宿主** ＝ 显式选择（`RPG.useHost(id)`）?? 恰好一个登记（自动）?? 无。
 *     0 个登记 ⇒ 抛「无宿主登记」；≥2 且未选 ⇒ 抛「宿主未选择 ＋ 候选清单」——**两种不同形**，
 *     ✗ 静默取第一个（那正是本层要消灭的形）。单宿主时自动定 ⇒ 既有宿主的行为**逐字不变**。
 *   · `RPG.ports` ＝**已定宿主**的端口袋（同一对象）；未定 ⇒ 空袋（✗ 留影子表）。
 *   · ⚠ 本档**不得出现任何宿主 id 字面量**（连注释里的例子也用占位符）——
 *     `tests/gates/host-touchpoints.mjs` 的「宿主标识」判据按 `src/host/**` 的实际登记**动态**盯着这条。
 */

/* ── slot 语义（sgstory#1912；`dev-10` 2026-10-03 的静态读数 ＋ 本席自查的记入处）────────────────
 * ⚠ **不得假设「自动存档是 no-op」**：引擎 `src/core/80-save.js:215-218` 的注释写「`Config.saves.maxAutoSaves`
 *   默认 0 ⇒ `Save.browser.auto.save()` 是 no-op」，而**产物内** `Config.saves.isAllowed` 的访问器结尾是
 *   `0===maxAutoSaves&&(maxAutoSaves=1)` ⇒ **读一下就把自动存档抬活**（0 ⇒ 1）⇒ 该前提在产物中**不成立**
 *   （`dev-10` 未做行为实验，票面已注）。推论两条，实现与消费方都照此：
 *     ① 「临时开户 ⇒ 写一次 ⇒ 复原」的**复原半**可能只是把值放回 0，而**下一次读取又会抬活**
 *        ⇒ 想在产物里得到「auto 关着」的稳态，**须显式 pin 住**（✗ 靠默认值与复原）；
 *     ② 因此**槽语义必须显式**：本端口只承认「**显式 slot 的读写**」，**auto 槽**是否参与**由实现声明**
 *        （见 `methods.slotSemantics`），内核**不**依赖 auto 的存在或缺失。
 * ⚠ 本席 2026-10-03 自查（grep 读数，**已按 `dev-10` 的更正改准** —— 我首版把「内核侧无引用」写错了）：
 *   · **内核侧唯一依赖那条前提的地方 ＝ `src/core/80-save.js`**：`maxAutoSaves` 命中 **5 处**，其中
 *     `:236-242` 是**真代码**（`const before = saves.maxAutoSaves;` / `if (!(Number(before) > 0)) saves.maxAutoSaves = 1;` /
 *     `saves.maxAutoSaves = before;`）—— 「临时开户 ⇒ 写一次 ⇒ 复原」的实现本体，其注释 `:215-218` 正是那条被推翻的前提。
 *   · **本档**（`src/core/ports/index.js`）对 `maxAutoSaves` 的提及**全部**在注释与契约字符串里（无一处代码引用）。
 *     ★**这里故意不写死计数**（`dev-10` 2026-10-03 的更正）：本档每改一次，提及数就变一次
 *       ⇒ 写死的数**必然**在下一版失真（本席连着两版写错：先「4 处」、再险些「0 处」；第三版写「7 行／9 次」，
 *       而那两个数取自**上一头** ⇒ `dev-10` 在本头复数是 **9 行／13 次**）。规矩改成三件：**命令 ＋ 输出 ＋ 取自哪一头**；
 *       要数就在**当前头**上重跑这条（✗ 引用旧输出）：
 *       $ git show <头>:src/core/ports/index.js | grep -c "maxAutoSaves|autoSave"   # 行口径（次口径加 -o … | wc -l）
 *       ⇒「数与输出一致」只保一半；**「输出取自交付的那一头」**是另一半 —— 缺它，数就是别的头的数。
 *   · **故事侧／装置侧**：只有 **`sagitrs/sgstory-books`** 仓的 `tools/e2e-drive.mjs` 用 `Save.slots.save/load`
 *     （⚠ 跨仓一律写**全名**：在引擎仓按同一形态 grep 只命中本档与构建产物 `tests/unit/dist/bundle.js`，
 *     那个装置**不在本仓**—— 裸号会让后来者照本仓找）；引擎侧**无**「战前保底／快存」形；**故事侧有** —— `stories/babel/src/world/encounters.js` 的
 *     `const 槽位 = Object.freeze({ 快存: 3, 战前保底: 4, 手动: 5 })`（★本条 2026-10-04 更正：原文写「两侧无」✗，
 *     那是**过期注释** ⇒ 保留槽保护 `sgstory#1938`／`sgstory-books#210` 正是读它这**一处源** ✓）⇒
 *     我这一侧**不存在依赖 auto-no-op 的槽用法**（这一条经 `dev-10` 独立核过 ✓）。
 *   ⇒ 实现落成时按 `slotSemantics` 写明即可；`80-save.js` 那条前提本身的复核在 `#183`／`#1877 P1-7` 的线上（同源）。
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
			slotSemantics: '() => ({auto: boolean, explicitSlots: string[]}) —— 实现**显式声明**槽语义'
				+ '（auto 槽参不参与、显式槽有哪些）；内核**只**依赖这份声明，✗ 依赖宿主默认值'
				+ '（产物里 maxAutoSaves 会被读活 ⇒「默认 no-op」不可假设，见本档头注）',
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

/** 已定宿主的端口袋：`{persist: impl, render: impl, lifecycle: impl}`。
 *  ⚠ 定义权在**宿主登记面**（下）——宿主变更时由 `同步端口袋()` 重指；`portOf`／`portsReady` 都读它。 */
RPG.ports = Object.create(null);

/* ── 宿主登记与选择（`sgstory#1989` 阶段 6）──────────────────────────────────
 * 判据：`tests/unit/core/hosts.test.js`（登记四路具名抛／多候选未选抛／自造宿主跑会话）。
 */

/** 已登记的宿主：id → `{id, desc, ports}`（`ports` ＝ 该宿主的端口袋，键＝`CONTRACTS` 的键）。 */
RPG.hosts = Object.create(null);

/** 显式选择的宿主 id（`useHost()` 设定）；`null` ＝ 未显式选择 ⇒ 走自动规则。 */
let 显式选择 = null;

/** **已定宿主**（「解析规则」的唯一实现点，✗ 不许第二处各写一份）。
 *  显式选择 ⇒ 它；否则**恰好一个**登记 ⇒ 它（自动 ⇒ 单宿主零改动）；否则 `null`。 */
const 已定宿主 = () => {
	if (显式选择 != null) return RPG.hosts[显式选择] ?? null;
	const ids = Object.keys(RPG.hosts);
	return ids.length === 1 ? RPG.hosts[ids[0]] : null;
};

/** 把 `RPG.ports` 重指为**已定宿主的端口袋**（未定 ⇒ 空袋）。
 *  ★唯一写点：宿主面任何变更（登记／填入／选择／清除）都经此 ⇒ 「未选择」不会残留上一个宿主的袋。 */
const 同步端口袋 = () => {
	const h = 已定宿主();
	RPG.ports = h ? h.ports : Object.create(null);
	return RPG.ports;
};

/** 候选清单（抛错消息里用；✗ 截断、✗ 排序成「看不出登记序」）。 */
const 候选清单 = () => {
	const ids = Object.keys(RPG.hosts);
	return ids.length ? ids.join('／') : '（无）';
};

/**
 * 登记一个宿主（**L0 调**）。
 * @param id   宿主 id（非空串；同一 id 只许登记一次）
 * @param desc 人读说明（可选）
 * @returns 该宿主的登记体（`{id, desc, ports}` —— ⚠ 其中的 `ports` 是**内部袋**：填端口一律走
 *          `defPort`（那里有缺方法校验）；拿它**只许读**（读数／判据），✗ 直接手塞
 */
RPG.defHost = (id, { desc } = {}) => {
	if (typeof id !== 'string' || id.trim() === '') {
		throw new Error(`defHost 需要非空的宿主 id，收到：${JSON.stringify(id)}`);
	}
	if (RPG.hosts[id]) {
		throw new Error(`宿主「${id}」重复登记（✗ 静默覆盖）—— 同一宿主只登记一次`);
	}
	RPG.hosts[id] = { id, desc: desc ?? '', ports: Object.create(null) };
	同步端口袋();
	return RPG.hosts[id];
};

/**
 * 把一个端口的**实现**填进某个宿主（**L0 调**）。缺方法 ⇒ **具名抛错**（✗ 静默接受半成品 ——
 * 那会让「内核以为有端口」与「实际没有」同形，正是本次重构要消灭的那类形）。
 * @param key    `'persist'|'render'|'lifecycle'`
 * @param impl   实现对象（须齐 `methods` 列出的方法）
 * @param host   **必填**：填进哪一个宿主（✗ 缺省 ⇒ 影子表）
 * @returns impl
 */
RPG.defPort = (key, impl, { host } = {}) => {
	const c = CONTRACTS[key];
	if (!c) throw new Error(`未定义的端口「${key}」（可用：${Object.keys(CONTRACTS).join('／')}）`);
	if (host == null) {
		throw new Error(`defPort 需要 {host}：端口要填进**哪一个**宿主`
			+ `（✗ 缺省落影子表 ⇒ 宿主身份会重新变成装饰件）—— 例：RPG.defPort('persist', impl, { host: '<宿主 id>' })`);
	}
	const 宿主 = RPG.hosts[host];
	if (!宿主) {
		throw new Error(`defPort 的宿主「${host}」未登记（已登记：${候选清单()}）—— 先 RPG.defHost('<宿主 id>', {desc})`);
	}
	const { id, missing } = RPG.portMissing(key, impl);
	if (missing.length > 0) {
		throw new Error(`端口 ${id} 的实现缺方法：${missing.join('、')}（契约见 src/core/ports/index.js）`);
	}
	if (宿主.ports[key]) RPG.regWarn.报('宿主端口', `${host}:${key}`, `将被覆盖`);
	宿主.ports[key] = impl;
	同步端口袋();
	return impl;
};

/**
 * 选择宿主（**装载方／故事调**）。
 * @param id 宿主 id；`null` ⇒ 清除显式选择，回到自动规则（**不是**「选默认宿主」）
 * @returns 选择后的**已定宿主** id（读数）
 */
RPG.useHost = (id = null) => {
	if (id === null) {
		显式选择 = null;
		同步端口袋();
		return RPG.hostOf();
	}
	if (typeof id !== 'string' || !RPG.hosts[id]) {
		throw new Error(`未知宿主「${String(id)}」（已登记：${候选清单()}）`);
	}
	显式选择 = id;
	同步端口袋();
	return RPG.hostOf();
};

/** **已定宿主**的 id（读数）；未定 ⇒ `null`。 */
RPG.hostOf = () => 已定宿主()?.id ?? null;

/** 各宿主缺哪些端口（读数，**✗ 不抛**）——`{id: [缺的端口键, …]}`。
 *  与 `portOf` 的分工：这里是「盘存」，`portOf` 是「取用」；取用失败才抛。 */
RPG.hostsReady = () => Object.fromEntries(
	Object.values(RPG.hosts).map((h) => [h.id, Object.keys(CONTRACTS).filter((k) => RPG.portMissing(k, h.ports[k]).missing.length > 0)]),
);

/** 已登记的宿主 id（读数；门与判据据此取「宿主 id 集合」，✗ 各自抄一份清单）。 */
RPG.hostIds = () => Object.keys(RPG.hosts);

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
 * 取端口（**L1 调**）。解析自**已定宿主**；未定 ⇒ **具名抛错**（两种形：无宿主登记／宿主未选择），
 * 已定但该宿主没提供此端口 ⇒ 也**具名抛错**（✗ 回落空实现：「端口不在」与「端口正常工作」
 * 必须不同形，否则无头面会把缺口读成绿）。
 */
RPG.portOf = (key) => {
	const c = CONTRACTS[key];
	if (!c) throw new Error(`未定义的端口「${key}」（可用：${Object.keys(CONTRACTS).join('／')}）`);
	const 宿主 = 已定宿主();
	if (!宿主) {
		const ids = Object.keys(RPG.hosts);
		if (ids.length === 0) {
			throw new Error(`端口 ${c.id} 无处可解析：无宿主登记（宿主适配器未装载？见 src/host/）`);
		}
		throw new Error(`端口 ${c.id} 无处可解析：宿主未选择（已登记 ${ids.length} 个：${候选清单()}）`
			+ `—— 内核不替调用方猜，请 RPG.useHost('<宿主 id>')`);
	}
	const impl = 宿主.ports[key];
	if (!impl) {
		throw new Error(`端口 ${c.id} 未注册（宿主「${宿主.id}」未提供它；契约见 src/core/ports/index.js）`);
	}
	return impl;
};

/** 三端口是否都已在位（读数用：交付 1 的判据面据此报「几个端口在位」）。
 *  ⚠ 口径：这里问的是**已定宿主**在位几个 —— 未定宿主（零登记／多候选未选）⇒ 空数组，
 *  与「端口不在」同读但**取用**（`portOf`）时两形可分。 */
RPG.portsReady = () => { 同步端口袋(); return Object.keys(CONTRACTS).filter((k) => !!RPG.ports[k]); };
