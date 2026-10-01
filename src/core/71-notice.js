/* RPG 核心 —— 通知中心与过滤器（B4 · 能力伞首期 `#1798`）
 *
 * 面（`#1798` B4）：「**perform 行内刷屏**」—— 战斗一回合打出十几行，段落被日志淹没，
 *   玩家想看的「打完了没／掉了什么／我死了」反而被冲掉。本模块提供：
 *
 *   ① **通道注册表**（`RPG.defNotice(id, {name, level})`）—— 每条输出**属于哪个通道**、该通道
 *      **默认是「常态」还是「关键」**，由**注册面**回答（✗ 本模块里写 `if (text.includes('战斗'))` 这类猜测）。
 *      同构先例：`defEffect`（`#1727`）／`defItem`／`registerBuild`（`#1776`）。
 *   ② **过滤器**：`'all'`（全部，默认）｜`'key'`（只看关键）。
 *      ★**默认 `'all'` ⇒ 不传 opts 的既有调用零行为变化**（本笔的第一安全属性）。
 *   ③ **通知缓冲**：所有行（含被过滤掉的）都进 `State.variables.rpgNotices`（**有界**，默认 200）
 *      ⇒ 「刚才被折掉的那几行」随时可回看，且**随存档往返**（✗ 存堆上）。
 *   ④ **呈现**：`RPG.noticesHTML()`（面板体）／`RPG.noticeToggleHTML()`（过滤器开关）／
 *      `RPG.bindNoticeUI()`（委托绑定，幂等）。
 *
 * ⚠ 本模块**不改判定**：它只决定**一行输出去哪**（进正文／只进通知中心），✗ 不产生、✗ 不吞判定信息
 *   —— 被过滤的行**仍在缓冲里**（可回看），不像「静默丢弃」那样丢证据。
 */

/** 通道注册表：id → { id, name, level }；`level ∈ {'log','key'}` */
RPG.noticeChannels = new Map();

/**
 * 注册一个输出通道。
 * @param id   通道 id（如 `'battle-end'`）
 * @param def.name  显示名（面板里用）
 * @param def.level 默认级别：`'log'`（常态，默认）｜`'key'`（关键：过滤到「只看关键」时仍进正文）
 * @returns 通道定义；重复注册**告警不抛**（与 `defEffect`／`registerBuild` 同形：后注册者覆盖但不静默）
 */
RPG.defNotice = (id, { name = id, level = 'log' } = {}) => {
	if (typeof id !== 'string' || id === '') throw new Error('defNotice 需要非空 id');
	if (level !== 'log' && level !== 'key') throw new Error(`defNotice 的 level 须是 'log'｜'key'（收到 ${level}）`);
	if (RPG.noticeChannels.has(id) && RPG.noticeChannels.get(id).declared !== false) {
		console.warn(`[RPG] 通知通道「${id}」重复注册：将被覆盖。`);
	}
	const def = { id, name, level, declared: true };
	RPG.noticeChannels.set(id, def);
	return def;
};

/** 默认通道（未声明通道的输出都归它） */
RPG.defNotice('default', { name: '常规', level: 'log' });

/* ---------- 首期三个**关键**通道（core 自带的结论性输出；✗ 不含内容侧语义）----------
 * 判据：玩家**必须看到**的「结论行」—— 战斗结算／死亡回层／战利品与锻造产出。
 * 其余（逐回合、逐次命中、掉落明细）留在 `default`＝常态 ⇒ 「仅关键」档下不刷屏。 */
RPG.defNotice('battle-end', { name: '战斗结算', level: 'key' });
RPG.defNotice('death', { name: '阵亡', level: 'key' });
RPG.defNotice('loot', { name: '产出', level: 'key' });

/** 取通道定义（未注册 ⇒ 回落到 `default`，并**保留**请求的 id 以便面板显示来源） */
RPG.noticeChannel = (id) => {
	if (id == null) return RPG.noticeChannels.get('default');
	const found = RPG.noticeChannels.get(id);
	if (found) return found;
	return { id, name: id, level: 'log', declared: false };
};

/* ---------- 通知缓冲（有界，随存档往返）---------- */

/** 缓冲上限（按条数；超出丢**最旧**的） */
RPG.noticeLimit = 200;

/** 内存兜底（无 State 环境时用；✗ 参与存档）——纯 core 场景不因缺 State 而丢条目 */
const memNotices = [];

/**
 * 取**末尾 n 条**（`n == null` ⇒ 全部）。
 * ★✗ 直接用 `slice(-n)`：`n === 0` 时 `-0 === 0` ⇒ 会取**全部**（JS 的 `-0` 陷阱）——
 *   而 `limit: 0` 的直觉语义是「不要」。故显式钳到 `[0, len]`（本笔用例钉住）。
 */
const tail = (arr, n) => {
	if (n == null) return arr.slice();
	const k = Math.max(0, Math.min(arr.length, Math.trunc(Number(n) || 0)));
	return arr.slice(arr.length - k);
};

/** 通知条的**唯一存放处**：有 State ⇒ 落 `State.variables.rpgNotices`（随存档往返）；否则落内存 */
const notices = () => {
	const v = typeof State === 'undefined' ? null : State?.variables;
	if (!v) return memNotices;
	if (!Array.isArray(v.rpgNotices)) v.rpgNotices = [];
	return v.rpgNotices;
};

/** 读通知（新的在前）。`opts.channel` 过滤来源；`opts.level` 过滤级别 */
RPG.notices = ({ channel, level, limit } = {}) => {
	const all = notices();
	const out = all.filter((n) => (channel == null || n.channel === channel) && (level == null || n.level === level));
	return tail(out, limit).reverse();
};

/** 记一条（不打印）——`perform` 与本模块共用；返回条目 */
RPG.pushNotice = (text, { channel = 'default' } = {}) => {
	const def = RPG.noticeChannel(channel);
	const list = notices();
	const entry = { text: String(text), channel: def.id, level: def.level, at: list.length + 1 };
	list.push(entry);
	while (list.length > RPG.noticeLimit) list.shift();
	return entry;
};

/** 清空通知（供「清屏」入口与用例） */
RPG.clearNotices = () => {
	notices().length = 0;
};

/* ---------- 过滤器（随存档往返）---------- */

/** 当前过滤档：`'all'`（默认）｜`'key'`。★`'all'` 是默认 ⇒ 既有调用零行为变化。 */
Object.defineProperty(RPG, 'noticeFilter', {
	get: () => (State?.variables?.rpgNoticeFilter === 'key' ? 'key' : 'all'),
	set: (mode) => RPG.setNoticeFilter(mode),
	configurable: true,
});

/** 设置过滤档；非法值抛错（✗ 静默回落 —— 拼错的档位会让人以为"过滤没生效"） */
RPG.setNoticeFilter = (mode) => {
	if (mode !== 'all' && mode !== 'key') throw new Error(`noticeFilter 只能是 'all'｜'key'（收到 ${mode}）`);
	if (State?.variables) State.variables.rpgNoticeFilter = mode;
	return mode;
};

/** 该行在当前档下**是否进正文**（关键档 ⇒ 只有 `key` 通道进正文；其余只进通知中心） */
RPG.noticeAdmits = (channel) => RPG.noticeFilter === 'all' || RPG.noticeChannel(channel).level === 'key';

/* ---------- 呈现 ---------- */

/** 最近 N 条的可读列表（面板体；新→旧）。`opts.limit` 默认 20。 */
RPG.noticesHTML = ({ limit = 20 } = {}) => {
	const list = tail(RPG.notices(), limit);          // ← 与 `notices()` 同一钳位（✗ 再写一遍 slice）
	if (list.length === 0) return '<span class="rpg-notice-empty">（没有通知）</span>';
	const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return list.map((n) => {
		const ch = RPG.noticeChannel(n.channel);
		const tag = ch.id === 'default' ? '' : `<span class="rpg-notice-ch">${esc(ch.name)}</span> `;
		return `<li class="${n.level === 'key' ? 'rpg-notice-key' : 'rpg-notice-log'}">${tag}${esc(n.text)}</li>`;
	}).join('');
};

/** 过滤器开关（一个可点的链，显示**当前档**与切过去的档）。 */
RPG.noticeToggleHTML = () => {
	const now = RPG.noticeFilter;
	const next = now === 'all' ? 'key' : 'all';
	const label = now === 'all' ? '通知：全部' : '通知：仅关键';
	const n = RPG.notices().length;
	return `<a href="#" class="rpg-notice-toggle" data-mode="${next}" `
		+ `title="点击切到「${next === 'all' ? '全部' : '仅关键'}」">${label}（${n}）</a>`;
};

/** 委托绑定：点开关 ⇒ 切档并**就地重绘**面板与开关（B1 的局部刷新域落地前的最小可信重绘）。 */
RPG.bindNoticeUI = () => {
	if (RPG.__noticeUIBound) return false;
	if (typeof document === 'undefined' || typeof jQuery === 'undefined') return false;
	jQuery(document).on('click', '.rpg-notice-toggle', function (ev) {
		ev.preventDefault();
		const mode = jQuery(this).attr('data-mode');
		if (mode !== 'all' && mode !== 'key') return;
		RPG.setNoticeFilter(mode);
		const $host = jQuery('#passages .passage').last();
		$host.find('.rpg-notice-toggle').replaceWith(RPG.noticeToggleHTML());
		$host.find('.rpg-notice-list').html(RPG.noticesHTML());
	});
	RPG.__noticeUIBound = true;
	return true;
};

RPG.bindNoticeUI();
