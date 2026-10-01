/* RPG 核心 —— Object 的 perform 接口（全局输出通道）+ 输出缓冲
 *
 * 任何对象都可以 .perform(text) 把字符串打印到当前段落。
 * 这是引擎里所有消息的唯一出口：used / execute 等函数不再返回字符串，
 * 而是调用 this.perform(...) 直接打印。
 *
 * 实现要点：
 * 1. ⚠ 往 Object.prototype 上挂方法必须用 defineProperty 且 enumerable: false，
 *    否则方法会出现在 for...in 遍历、SugarCube 的存档克隆等所有地方，
 *    污染整个引擎。不可枚举的方法对 JSON.stringify / for...in 完全不可见。
 * 2. 段落渲染期间（<<run>> 执行时）新段落还未挂载到 DOM，直接找
 *    .passage 会命中正在退场的旧段落。因此监听 :passagestart /
 *    :passagedisplay 事件：渲染中先写入缓冲，段落真正显示后再落地。
 *    该缓冲通过 RPG.deferOutput(build) 暴露给 choice 等接口复用。
 */

const pendingQueue = []; // 待落地的输出任务（FIFO）
let rendering = false;

const print = (line) => {
	const $host = jQuery('#passages .passage').last();
	const $p = jQuery('<p>').text(line);
	// 插到状态栏（PassageFooter 里的 .statusbar）之前，保证它始终在页底
	const $foot = $host.find('.statusbar').first();
	if ($foot.length) $p.insertBefore($foot);
	else $p.appendTo($host);
};
const flush = () => {
	rendering = false;
	while (pendingQueue.length > 0) pendingQueue.shift()();
};

jQuery(document)
	.on(':passagestart', () => { rendering = true; })
	.on(':passagedisplay', flush);

/** 把一段“往页面上放东西”的任务放到正确时机执行（渲染中缓冲，否则立即） */
RPG.deferOutput = (build) => {
	if (rendering) pendingQueue.push(build);
	else build();
};

Object.defineProperty(Object.prototype, 'perform', {
	/**
	 * 打印一段文字到当前段落（每个非空行渲染为一个段落 <p>）。
	 *
	 * ★`opts.channel`（`#1798` B4）：这一行**属于哪个输出通道** ⇒ 决定它在「仅关键」档下是否仍进正文
	 *   （通道的默认级别由注册面 `RPG.defNotice` 回答，✗ 本函数猜文本）。
	 *   **不传 `opts` ⇒ 通道 `'default'`、级别 `'log'`，且默认档是 `'all'` ⇒ 既有调用行为逐字不变**；
	 *   被过滤掉的行**仍进通知缓冲**（`RPG.notices` 可回看）⇒ ✗ 丢证据。
	 * @param text string 要打印的字符串
	 * @param opts.channel string 输出通道 id（缺省 `'default'`）
	 */
	value: function perform(text, opts) {
		if (typeof text !== 'string') {
			throw new Error(`perform 的参数应是字符串，收到：${typeof text}`);
		}
		const channel = opts?.channel ?? 'default';
		const lines = text.split('\n').filter((line) => line.trim() !== '');
		/* 通知面可能尚未加载（本文件按序在 `71-notice.js` 之前）⇒ 能力探测，✗ 硬依赖 */
		const notify = typeof RPG.pushNotice === 'function' ? RPG.pushNotice : null;
		const admits = typeof RPG.noticeAdmits === 'function' ? RPG.noticeAdmits(channel) : true;
		lines.forEach((line) => { if (notify) notify(line, { channel }); });
		if (!admits) return this;     // 只进通知中心（可回看），✗ 进正文
		RPG.deferOutput(() => lines.forEach(print));
		return this;
	},
	writable: true,
	configurable: true,
	enumerable: false,
});
