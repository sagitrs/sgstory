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
RPG.registerPanel = (id, { name = id, render, host } = {}) => {
	if (typeof id !== 'string' || id === '') throw new Error('registerPanel 需要非空 id');
	if (typeof render !== 'function') throw new Error(`registerPanel「${id}」需要 render 函数`);
	if (RPG.panels.has(id)) console.warn(`[RPG] 面板「${id}」重复注册：将被覆盖。`);
	const entry = { id, name, render, host: host ?? `[data-panel="${id}"]`, count: 0 };
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
		const hit = put(into ?? p.host, p.render(), { preserve: RPG.preservePanelState }) !== false;   // ✗ 命中 ⇒ false（writer 的契约）
		if (!hit) { skipped.push(id); continue; }                // 该面板不在当前段落
		p.count += 1;
		rendered.push(id);
	}
	return { rendered, skipped };
};

/* 注（D 席 NIT-5）：曾有一个等价别名 `refreshAllPanels = () => refreshPanels(null)` ⇒ **已删** ——
 *   两个同义入口会漂移，而「全部」本来就是 `ids = null` 的既有语义。 */
