/* RPG 核心 —— 面板刷新域（B1 · 能力伞首期 `#1798`）
 *
 * 面（`#1798` B1）：「**状态栏整段重绘＝D2 根治面**」—— 现状是每次状态变化都把状态栏整段重画
 *   （或像 C1/B4 那样在绑定里 `$x.html(...)` 硬塞），于是：① 重绘范围不可控（整段 ⇒ 闪、丢焦点、
 *   覆盖别人写的内容）② **没人知道谁该重绘**（散在各处的 jQuery 调用）③ 重绘次数不可观测。
 *
 * 本模块给的是**注册制局部刷新**：
 *   ① `RPG.registerPanel(id, {name, render, host})` —— 一个**可独立重绘的区域**：id、显示名、
 *      **渲染函数**、**宿主选择器**（如 `'.statusbar .panel-hp'`）。同构先例：`defEffect`（`#1727`）／
 *      `defItem`／`registerBuild`（`#1776`）／`defNotice`（B4）。
 *   ② `RPG.refreshPanels(ids?, opts)` —— 只重绘指定（或全部）面板；每个面板**只写自己的宿主**
 *      ⇒ 兄弟面板的内容不会被牵连。
 *   ③ `RPG.panelHTML(id)` —— 面板体的 HTML（宿主里那份）。
 *   ④ **重绘计数** `RPG.panelRenderCount(id)`：局部刷新最容易被说成「看不见的效果」⇒ 计数让
 *      「**恰 N 次**」可断言（`#1812`／`#1814` 要的「渲染次数」判据）。
 *
 * ⚠ 本模块**不改判定**，也**不自己找宿主**：宿主选择器由**注册方**给 ⇒ 故事（twee）决定版式，
 *   引擎只负责「把渲染函数的输出写回该区域」。
 *
 * ★**本模块不碰 DOM**（`#1804` 件二的宿主触点棘轮门）：写回动作由**注入的 writer** 完成 ——
 *   `RPG.panelWriter = (hostSelector, html) => boolean`（命中并写入 ⇒ true），由**故事侧**注册
 *   （`stories/babel/src/ui/panels.js` 用 jQuery 实现）。核心因此**零新增宿主触点**：
 *     ① 核不再认识 jQuery/DOM ② 无头环境只要不注入 writer，面板面就自然「全 skip」（✗ 需要 `typeof jQuery` 兜底）
 *     ③ 用例可注入**假 writer** 直接观测「写到哪个宿主、写了什么」（比假 jQuery 更贴近契约）。
 */

/** 面板注册表：id → { id, name, render, host, count } */
RPG.panels = new Map();

/** 写回器（**由故事侧注入**；核心不碰 DOM）。签名：`(hostSelector, html) => 是否命中并写入`。
 *  未注入 ⇒ `refreshPanels` 把全部目标记为 `skipped`（无呈现层 —— 与「页面上没有该宿主」同形）。
 *  ★可选第三参 `opts.preserve`：**重绘时须保留的宿主内交互态**（见 `RPG.preservePanelState`）。
 *   向后兼容：writer 只声明两个形参 ⇒ 第三参被忽略，行为与既有完全一致。 */
RPG.panelWriter = null;

/**
 * **重绘须保留的宿主内交互态**（`#1877` P1-3 复现的根因）。
 *
 * ★症状（我在 jsdom 实测，✗ 推断）：面板重绘走 `$host.html(html)` ⇒ **整块替换**。于是宿主里
 *   **任何只存在于 DOM 的交互态都被清掉** —— 当前唯一一处是通知面板的 `<details class="rpg-notice-box">`：
 *   玩家展开「最近的通知」后，一次动作（`:passagedisplay` 每次都 `refreshPanels`）或点一次开关（切档重绘）
 *   就把 `open` 打回默认**折叠** ⇒ 实测读数：展开 `open=true` → 刷新 `open=false`
 *   ⇒ 玩家反复看到「计数在涨，可列表（在折叠里）看不到」＝ 操作者报的「恒空」。
 *
 * ★**为何不是「让 `render()` 自己保住 open」**：`render()` 契约是**纯函数**（`registerPanel` 明写
 *   「必须是纯函数式的 —— 带副作用会让重绘变成再执行一次动作」）；而「玩家此刻展开了没有」**不在 game state 里**
 *   （它是 DOM 的），`render()` 无从读到 ⇒ 只能由**唯一碰 DOM 的那层**（writer）在替换**前后**搬运。
 *
 * ★**搬运规则**：`sel`（`preserve[].sel`）在**旧宿主**内命中且 `open === true` ⇒ 记下；
 *   写完新 HTML 后，若新宿主内**同 `sel`** 命中，则把记下的 `open` 写回。
 *   ⇒ 判据：**「同一个 sel」＝ 同一个玩家可见的可展开块**（✗ 不按 index 配对 —— 那样列表顺序一变就错位）。
 * ⚠ 只搬 `open` 一个属性：`<details>` 的其余性质（是否可展开）由新 HTML 决定，**不从旧 DOM 继承**，
 *   免得把「上一次渲染的状态」当成「本次渲染的真相」。
 */
RPG.preservePanelState = [{ sel: 'details.rpg-notice-box' }];

/**
 * 注册一个可独立重绘的面板。
 * @param id          面板 id（如 `'inventory'`）
 * @param def.name    显示名（诊断/日志用）
 * @param def.render  渲染函数：`() => string`（HTML）。**必须是纯函数式的**（读状态、返回串）
 *                    —— 带副作用会让「重绘」变成「再执行一次动作」（危险）。
 * @param def.host    宿主选择器（jQuery 选择器串；缺省 `[data-panel="<id>"]`）
 * @returns 面板登记项；重复注册**告警不抛**（与 `defEffect`／`registerBuild`／`defNotice` 同形）
 */
RPG.registerPanel = (id, { name = id, render, host, refresh = null, cssVar = null, tint = null, tintOf = null, thresholds = null } = {}) => {
	if (typeof id !== 'string' || id === '') throw new Error('registerPanel 需要非空 id');
	if (typeof render !== 'function') throw new Error(`registerPanel「${id}」需要 render 函数`);
	if (RPG.panels.has(id)) console.warn(`[RPG] 面板「${id}」重复注册：将被覆盖。`);
	/* ★`sgstory#1763`（B1+1.1/1.2）：`refresh` = 该面板所属的**刷新域**（缺省 `null` = 不属任何域）。
	 *   域是**自由串**（✗ 不预先登记）：`refreshDomain(域)` 只重绘**声明了该域**的面板 —— 这样「改一域」
	 *   就天然**不动他域**，而「改了就整段重绘」被结构上排除。空/非法值 ⇒ 视为 `null`（具名告警，✗ 静默吞）。 */
	const 域 = (typeof refresh === 'string' && refresh !== '') ? refresh : null;
	if (refresh != null && 域 === null) console.warn(`[RPG] 面板「${id}」的 refresh 不是非空字符串：已按「不属任何域」处理`);
	/* ★`sgstory#1983`（B2·机制强度＝呈现强度）：面板可**声明**它驱动哪个 CSS 变量（`cssVar`）、
	 *   状态名→色的色板（`tint`）、当前生效的键（`tintOf: () => 状态名`）与**阈值人话表**（`thresholds`）。
	 *   引擎**只承载声明**（✗ 不碰 DOM、✗ 不写色）：写回仍走注入的 `panelWriter`，本档只把
	 *   `css = { [cssVar]: 色 }` 作为 `opts.css` 交给它 ⇒ 「变量名与色值」由 writer 落。
	 *   ⚠ `tintOf` 是**本席补的一处**（`#1983` 票面只写了 `tint`）：判据②要「**色值**逐字进 writer」，
	 *     而 `tint` 是**表** ⇒ 引擎必须知道当前哪个键生效 ⇒ 用 `tintOf()` 取键、查表得色（✗ 猜第一个键）。
	 *   ⚠ 非法值一律**具名告警＋退缺省**（同本档 `refresh` 那列的形，✗ 静默吞、✗ 抛）。 */
	const 色板 = (tint != null && typeof tint === 'object' && !Array.isArray(tint)) ? tint : null;
	const CSS变量 = (typeof cssVar === 'string' && cssVar !== '') ? cssVar : null;
	const 阈值表 = Array.isArray(thresholds) ? thresholds : null;
	if (cssVar != null && CSS变量 === null) console.warn(`[RPG] 面板「${id}」的 cssVar 不是非空字符串：已按「不驱动变量」处理`);
	if (tint != null && 色板 === null) console.warn(`[RPG] 面板「${id}」的 tint 不是对象：已按「无色板」处理`);
	if (thresholds != null && 阈值表 === null) console.warn(`[RPG] 面板「${id}」的 thresholds 不是数组：已按「无表」处理`);
	if (tintOf != null && typeof tintOf !== 'function') console.warn(`[RPG] 面板「${id}」的 tintOf 不是函数：已按「无当前键」处理`);
	const 取键 = (tintOf != null && typeof tintOf === 'function') ? tintOf : null;
	const entry = { id, name, render, host: host ?? `[data-panel="${id}"]`, refresh: 域, count: 0,
		cssVar: CSS变量, tint: 色板, tintOf: 取键, thresholds: 阈值表 };
	RPG.panels.set(id, entry);
	return entry;
};

/** 面板体的 HTML；未注册 ⇒ 抛错（面板名打错是**接线错**，✗ 静默返回空串） */
RPG.panelHTML = (id) => {
	const p = RPG.panels.get(id);
	if (!p) throw new Error(`未注册的面板「${id}」`);
	return p.render();
};

/** 该面板被重绘过几次（局部刷新的可观测面） */
RPG.panelRenderCount = (id) => RPG.panels.get(id)?.count ?? null;

/** 全部面板的重绘计数快照（诊断/用例） */
RPG.panelRenderCounts = () => Object.fromEntries([...RPG.panels.values()].map((p) => [p.id, p.count]));

/** 清空计数（用例用；✗ 不影响渲染） */
RPG.resetPanelCounts = () => { for (const p of RPG.panels.values()) p.count = 0; };

/**
 * 重绘面板。
 * @param ids  面板 id 数组；`null`/省略 ⇒ **全部**已注册面板
 * @param opts.into 自定义宿主（jQuery 对象/选择器串）；省略 ⇒ 用各面板注册时给的 `host`
 * @returns `{ rendered, skipped }` —— `skipped` 列出「注册了但当前页面上找不到宿主」的面板
 *   （★这是**正常情况**：面板只在含它的段落里存在；但**列出来**才能让「以为刷了其实没刷」现形）
 *
 * ⚠ **「只写自己的宿主」的强度（D 席 F6）**：宿主是**一个选择器**，可命中**多个节点**（例：同属性节点
 *   出现两次）⇒ 那时 `html()` 会写**全部命中**。twee 骨架无重复 ⇒ 今日无影响；若要**唯一**，须由注册方
 *   保证选择器唯一（本模块不擅自 `first()` —— 那会静默丢掉另一处）。
 * ⚠ 未注册 id ⇒ **先抛**（✗ 因缺 jQuery 而静默跳过 —— 那是两件事，见 D 席 NIT-6）。
 */
RPG.refreshPanels = (ids = null, { into, write } = {}) => {
	const targets = ids == null ? [...RPG.panels.keys()] : ids;
	for (const id of targets) if (!RPG.panels.has(id)) throw new Error(`refreshPanels：未注册的面板「${id}」`);
	const put = write ?? RPG.panelWriter;
	if (typeof put !== 'function') return { rendered: [], skipped: [...targets] };   // 无呈现层
	const rendered = [];
	const skipped = [];
	for (const id of targets) {
		const p = RPG.panels.get(id);
		const hit = put(into ?? p.host, p.render(), { preserve: RPG.preservePanelState, css: RPG.panelCSS(id) }) !== false;   // ✗ 命中 ⇒ false（writer 的契约）
		if (!hit) { skipped.push(id); continue; }                // 该面板不在当前段落
		p.count += 1;
		rendered.push(id);
	}
	return { rendered, skipped };
};

/**
 * ★`sgstory#1763`：**某个刷新域里的面板 id 列表**（只读；判据与宿主壳都取它，✗ 各自再筛一遍）。
 * @param 域  域串；`null`/省略 ⇒ 列出**不属任何域**的面板（`refresh === null`）
 * @returns `string[]`（注册序）
 */
RPG.panelsInDomain = (域 = null) => [...RPG.panels.values()].filter((p) => p.refresh === (域 ?? null)).map((p) => p.id);

/** 已声明过的域（注册序去重）—— 宿主壳的「面板显隐」设置与诊断面用它。 */
RPG.panelDomains = () => [...new Set([...RPG.panels.values()].map((p) => p.refresh).filter((d) => d != null))];

/**
 * ★`sgstory#1983`（B2）**读口**：面板的色板声明（`{cssVar, tint, 当前键, 当前色}`）——
 *   判据①「声明随注册被记住」就取它（✗ 各自去翻注册表内部字段）。
 *   `当前色` 由 `tintOf()` 取键查表得（`tintOf` 缺席／键不在表里 ⇒ `null`，✗ 猜一个）。
 */
RPG.panelTint = (id) => {
	const p = RPG.panels.get(id);
	if (!p) throw new Error(`panelTint：未注册的面板「${id}」`);
	const 键 = p.tintOf ? p.tintOf() : null;
	return { cssVar: p.cssVar, tint: p.tint, 当前键: 键 ?? null, 当前色: (键 != null && p.tint) ? (p.tint[键] ?? null) : null };
};

/** ★`sgstory#1983`：**交给 writer 的 CSS 对**（`{变量名: 色值}`）。缺声明 ⇒ `null`（✗ 给空对象 ——
 *   「没声明」与「声明了空」必须不同形，同本档其它读口的旨）。
 */
RPG.panelCSS = (id) => {
	const t = RPG.panelTint(id);
	if (!t.cssVar || t.当前色 == null) return null;
	return { [t.cssVar]: t.当前色 };
};

/**
 * ★`sgstory#1983`（B2）**阈值人话表** —— **纯函数**：`(值, thresholds) => 一句人话`。
 *   语义**显式声明**（✗ 让读者从实现里猜）：按 `上界` **升序**取**第一个** `值 <= 上界` 的那条 ⇒ 取其 `文案`；
 *   ⇒ **`值 === 上界` 落在该档**（≤ 是闭的）；表外（值大于所有上界／空表／非法表）⇒ `''`。
 *   ⚠ **表在数据**（本条要的就是它）：函数体里**没有**任何档位常量 ⇒ 摘「表」即失效（刀据此落）。
 */
RPG.meterText = (值, thresholds) => {
	const 表 = Array.isArray(thresholds) ? thresholds : [];
	const 有效 = 表.filter((t) => t && typeof t === 'object' && Number.isFinite(Number(t.上界)) && typeof t.文案 === 'string');
	if (有效.length === 0) return '';
	const v = Number(值);
	if (!Number.isFinite(v)) return '';
	const 序 = [...有效].sort((a, b) => Number(a.上界) - Number(b.上界));
	for (const t of 序) if (v <= Number(t.上界)) return t.文案;
	return '';
};

/**
 * ★`sgstory#1763`（本票第 3 件）：**按域重绘** —— 只重绘声明了该域的面板，✗ 不碰其他域、✗ 不整段重绘。
 *   `refreshPanels(ids?)` 是「按下标/全量」，本面是「**按域**」：语义分开，✗ 不做成同一入口的两种参数
 *   （两个同义入口会漂移 —— 同本档 NIT-5 删别名的理由）。
 * @param 域  域串（自由串，✗ 不预先登记）
 * @param opts 与 `refreshPanels` 同（`into`／`write`）
 * @returns `{ 域, rendered, skipped, 无面板 }` —— `无面板: true` 表示**该域当前没有任何面板**
 *   （✗ 静默返回空对象：域名打错与「域里没面板」必须不同形，同本档「未注册 id 先抛」之旨）。
 */
RPG.refreshDomain = (域, opts = {}) => {
	if (typeof 域 !== 'string' || 域 === '') throw new Error('refreshDomain 需要非空域串');
	const ids = RPG.panelsInDomain(域);
	const r = RPG.refreshPanels(ids, opts);
	return { 域, rendered: r.rendered, skipped: r.skipped, 无面板: ids.length === 0 };
};

/* 注（D 席 NIT-5）：曾有一个等价别名 `refreshAllPanels = () => refreshPanels(null)` ⇒ **已删** ——
 *   两个同义入口会漂移，而「全部」本来就是 `ids = null` 的既有语义。 */
