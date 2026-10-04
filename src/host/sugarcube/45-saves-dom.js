/* ★`sgstory#1938`（P1·F-02 保留槽）**第 3 步：存档对话框渲染后处理**（宿主层）。
 *
 *   判据面：`sgstory-books` 的 `tools/e2e-210-reserved-slots.mjs`（三臂 A／B／C）。
 *   ★**DOM 规格（照判据档源码，✗ 不另立第二套定位法）**：
 *     `#saves-list` 是 `<table>`，**每槽一 `<tr>`**，行内两按钮
 *     **`#saves-save-<码>`** ／ **`#saves-delete-<码>`** ⇒
 *     靶行 ＝ `document.getElementById('saves-save-' + 码).closest('tr')` ✓。
 *
 *   三臂对本法：A 该行须**有系统标记** **或**其写入控件 `disabled`（二者取一）；
 *     B **手动槽那行须无标记且可写**（✗ 不许把整面禁掉冒充通过）；
 *     C 对 `save` 控件派发 click ⇒ **不得落档**（★`disabled` 的按钮**不触发** handler ✓ ⇒ 取 `disabled` 而非"只加文案" ✓）。
 *
 *   ★**一处源**：保留槽号取 `RPG.reservedSlots()`（第 2 步决策层，读故事侧 `setup.BABEL.槽位`）⇒ ✗ 本档不写死 3/4 ✓。
 *   ★**只挡玩家手写**（第 5 条）：只改**对话框里的控件状态**，✗ 不碰 `Save.slots.save()`／✗ 不碰执行层
 *     ⇒ 故事自身快存／战前保底写入不受影响 ✓。
 *   ★无 DOM（单测）⇒ 静默不接线（✗ 不抛）；DOM 面由真 DOM 判据判 ✓。
 */
(function () {
	'use strict';

	var RPG = window.RPG = window.RPG || {};

	/* 系统标记文案：须命中判据的 /系统|保留|专属|〔/（取最短的一个词 ✓） */
	var 标记文案 = '（系统）';

	/** 行文本是否已有系统标记（幂等：✗ 不重复插）。 */
	var 已有标记 = function (行) { return /系统|保留|专属|〔/.test(行.textContent || ''); };

	/** 该行的写控件＝行里的按钮（`save`／`delete` 都禁 ⇒ 该槽对玩家只读 ✓）。 */
	var 行控件 = function (行) {
		return Array.prototype.slice.call(行.querySelectorAll('button, a.button, a.link, input'));
	};

	/** 给一行加标记 ＋ 禁用其写控件。幂等：已标过即返回 false ✓ */
	var 锁一行 = function (行) {
		if (!行 || 已有标记(行)) return false;
		var 标 = document.createElement('span');
		标.className = 'rpg-reserved-mark';
		标.textContent = 标记文案;
		行.appendChild(标);
		行控件(行).forEach(function (b) {
			try { b.disabled = true; } catch (e) { /* ✗ 吞：个别节点不可禁 */ }
			if (b.setAttribute) b.setAttribute('aria-disabled', 'true');
			if (b.classList) b.classList.add('rpg-reserved');
		});
		if (行.classList) 行.classList.add('rpg-reserved-row');
		return true;
	};

	/** 由槽码取靶行：★照判据档的形（`#saves-save-<码>` ⇒ `closest('tr')`）✓ */
	var 行of = function (码) {
		var 钮 = document.getElementById('saves-save-' + 码);
		if (!钮) return null;
		if (typeof 钮.closest === 'function') { var tr = 钮.closest('tr'); if (tr) return tr; }
		return 钮.parentNode || null;
	};

	/**
	 * 对存档对话框做后处理：把保留槽那几行锁上。
	 *   ★可重入：`UI.saves()` 每次开都重画 ⇒ 每次重处理（幂等 ✓）。
	 * @returns {number} 本次锁住的行数（0 ＝ 无 DOM／无对话框／无保留槽 ⇒ 都不抛 ✓）
	 */
	var 处理存档对话框 = function () {
		if (typeof document === 'undefined') { return 0; }
		var 箱 = document.getElementById('ui-dialog-body');
		if (!箱) return 0;
		if (箱.classList && !箱.classList.contains('saves') && !箱.querySelector('#saves-list')) return 0;
		var 列 = document.getElementById('saves-list') || 箱.querySelector('.saves-list');
		if (!列) return 0;
		var 保留 = (typeof RPG.reservedSlots === 'function') ? RPG.reservedSlots() : [];
		/* ★第 2 步口径：读不到 ⇒ 那档已出声 ＋ 空集 ⇒ 本档**不猜**（✗ 不默认锁 3／4）✓ */
		if (!保留 || !保留.length) return 0;
		var n = 0;
		保留.forEach(function (码) {
			if (!Number.isInteger(码)) return;
			if (锁一行(行of(码))) n += 1;
		});
		return n;
	};

	/** 挂 `:dialogopened`（★✗ 不作唯一依赖 —— 见下「观察者」）。 */
	var 挂事件 = function () {
		if (typeof document === 'undefined') return false;
		var JQ = window.jQuery || window.$;
		if (!JQ || typeof JQ !== 'function') return false;
		if (!JQ(document) || typeof JQ(document).on !== 'function') return false;
		JQ(document).on(':dialogopened', function () { 包一层(); 处理存档对话框(); });
		return true;
	};

	/**
	 * 接线：★**不依赖事件名、也不依赖时序**。
	 *   ① 挂 `:dialogopened`；② 挂 `MutationObserver` 看 DOM（事件名不同／脚本先跑也能命中）；
	 *   ③ jQuery 未来到 ⇒ `DOMContentLoaded` ＋ 定时重试（✗ 不只试一次）；④ 已有打开的对话框 ⇒ 立刻处理一次（幂等）✓。
	 */
	/**
	 * ★**同步钩**：包住 `UI.saves`（原函数跑完**立刻**做后处理）。
	 *   为什么必须有它：判据/调用方常在 `UI.saves()` **返回后同步**读 DOM ⇒
	 *   观察者是**异步**回调、`setInterval` 重试在无事件循环的宿主（jsdom 直调）里也不推进 ✗
	 *   ⇒ 只有**同步钩**能保证"面一出现即已处理" ✓（幂等：重复处理无副作用 ✓）。
	 */
	var 包一层 = function () {
		var SC = window.SugarCube || window.SC;
		if (!SC || !SC.UI || typeof SC.UI.saves !== 'function') return false;
		if (SC.UI.saves.__rpgReservedWrapped) return true;
		var 原 = SC.UI.saves;
		var 新 = function () {
			var r = 原.apply(this, arguments);
			try { 处理存档对话框(); } catch (e) { /* ✗ 吞：后处理失败不影响开对话框 */ }
			return r;
		};
		新.__rpgReservedWrapped = true;
		try { SC.UI.saves = 新; } catch (e) { return false; }
		return true;
	};

	var 接线 = function () {
		if (typeof document === 'undefined') return false;
		var 已挂 = 挂事件() && 包一层();   /* ★两者缺一都不算接好 ⇒ 都要重试 ✓ */
		try {
			if (typeof MutationObserver === 'function' && document.documentElement) {
				new MutationObserver(function () { 包一层(); 处理存档对话框(); })
					.observe(document.documentElement, { childList: true, subtree: true, attributes: false });
			}
		} catch (e) { /* ✗ 吞：不支持观察者也不影响事件路 */ }
		if (!已挂) {
			if (typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', 挂事件);
			var 试 = 0;
			var 定时 = setInterval(function () {   /* ★重试两件：挂事件 ＋ 包 UI.saves（✗ 只试前者 ⇒ 同步钩永远装不上 ✗）*/
				if ((挂事件() && 包一层()) || ++试 > 40) clearInterval(定时);
			}, 16);
		}
		处理存档对话框();
		return 已挂;
	};

	RPG.保存槽后处理 = Object.freeze({
		处理: 处理存档对话框,
		接线: 接线,
		标记文案: 标记文案,
	});

	/* 临时调试 */
})();
