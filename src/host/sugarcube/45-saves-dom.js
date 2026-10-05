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
		/* ★两形状都认（领队 2026-10-05 06:09 准）：宿主的 `行` 可能是**桩/jQuery 形**（实测：真浏览器宿主
		 *   也走这条路）⇒ ✗ 不能只 `行.querySelectorAll(...)` ⇒ 先试 jQuery 形，再试原生形。 */
		var 选 = function (根, 选择子) {
			if (!根) return [];
			try {
				if (typeof 根.querySelectorAll === 'function') return Array.prototype.slice.call(根.querySelectorAll(选择子));
				if (window.jQuery && typeof window.jQuery === 'function') {
					var j = window.jQuery(根);
					return (j && typeof j.find === 'function') ? Array.prototype.slice.call(j.find(选择子).toArray ? j.find(选择子).toArray() : j.find(选择子)) : [];
				}
			} catch (e) { /* ✗ 吞：下面记明账 */ }
			return [];
		};
		var 得 = 选(行, 'button, a.button, a.link, input');
		if (得.length === 0 && (行.textContent || '').length > 0) {
			/* ★明账（✗ 不静默）：这一行有字却取不到控件 ⇒ 极可能是"形状不认识" */
			try { if (window.console && console.warn) console.warn('[reserved] 取控件为空：行形状=' + (行 && 行.tagName ? 行.tagName : typeof 行)); } catch (e) { /* ✗ 吞 */ }
		}
		return 得;
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
		/* ★`books#280` ⑫（P1 修件）：**弃破坏性克隆** ⇒ 改「**捕获阶段吞事件**」✓（领队 02:xx 裁、dev-10 钉的根因 ✓）。
		 *   旧形把受保留槽的写控件**替换成克隆** ✗ ⇒ ①每轮渲染都换节点（**不幂等** ✗）②顺带扔掉那些节点上原有的监听/引用 ✗。
		 *   新形：**一个**监听挂在 `document` 的**捕获阶段** ✓ ⇒ 命中"受保留槽那一行里的控件"就吞掉 ✓
		 *   ⇒ 宿主自带的处理**根本跑不到** ✓（程序化 `click()` 也走这条 ⇒ 比 `disabled` 可靠 ✓）；依然 ✗ 不碰 `Save.slots.save()` ✓。
		 *   ★本函数因此**幂等**：只加标记／置属性（✗ 不改结构）✓ —— 同一份 DOM 跑 N 次结果相同 ✓。 */
		var 吞保留点击 = function (ev) {
			try {
				var el = ev.target, 行 = null;
				while (el && el !== document && !行) { if (el.classList && el.classList.contains('rpg-reserved-row')) 行 = el; el = el.parentNode; }
				if (!行) return;
				if (typeof ev.preventDefault === 'function') ev.preventDefault();
				if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
				if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
				return false;
			} catch (e) { /* ✗ 吞：吞不掉也不许把点击流程弄坏 */ }
		};
		if (typeof document.addEventListener === 'function' && !document.__rpgReservedCapture) {
			document.addEventListener('click', 吞保留点击, true);   /* ★捕获阶段 ✓ 只挂**一次** ✓ */
			document.__rpgReservedCapture = 吞保留点击;
		}
		if (行.classList) 行.classList.add('rpg-reserved-row');
		return true;
	};

	/** 由槽码取靶行：★照判据档的形（`#saves-save-<码>` ⇒ `closest('tr')`）✓ */
	var 行of = function (码) {
		/* ★**形状无关**（领队 2026-10-05 06:58 裁甲）：旧形只认 `#saves-save-<码>` ⇒ 取不到就 `null` ⇒
		 *   `锁一行(null)` **静默**返回 ⇒ **行永远不被标**（实测：臂①「写前合格=true（保留码拿得到）＋
		 *   写后 有标记=false」与「①红②③绿」都由此而来）。⇒ 按下列顺序找，**任一中即返回**：
		 *   ① id 原形 ② 别的 id 变体／`[data-slot]` ③ jQuery 形 ④ **按"行文含「槽位 <码>」"兜底**
		 *   （第 ④ 条与宿主形状无关 —— 实测该行行文正是 `未入层 槽位 4`）。 */
		var 提 = function (x) {
			if (!x) return null;
			try {
				if (typeof x.closest === 'function') { var tr0 = x.closest('tr'); if (tr0) return tr0; }
				if (x.nodeType === 1) return (typeof x.closest === 'function' ? x : x.parentNode || null);
				if (x.parentNode) return x.parentNode;
			} catch (e) { /* ✗ 吞 */ }
			return null;
		};
		var 行 = null, 钮 = document.getElementById('saves-save-' + 码);
		/* ★**一刀**（领队 2026-10-05 07:48 准）：**钮的名字随"占位与否"而变** —— 空槽是 `saves-save-<码>`、
		 *   占位后变成 `saves-load-<码>`（实测：写槽 3 再重渲染 ⇒ 页上再无 `saves-save-3` ✗ ⇒ `行of` 给 null ⇒
		 *   `锁一行(null)` **静默** ⇒ 那一行不被标 ⇒ 臂①「写前合格=true／写后 有标记=false」由此而来）。
		 *   ⇒ **认三种前缀（save|load|delete）**，✗ 不写死 `saves-save-` ⇒ **与装置 `行形` 同一口径** ✓。 */
		if (!钮) {
			try {
				var 候 = document.querySelectorAll('#saves-list [id]');
				for (var i = 0; i < 候.length; i += 1) {
					var m = /saves-(?:save|load|delete)-(\d+)$/.exec(候[i].id || '');
					if (m && m[1] === String(码)) { 钮 = 候[i]; break; }
				}
			} catch (e) { /* ✗ 吞 */ }
		}
		if (!钮) 钮 = document.querySelector('#saves-' + 码 + ', [data-slot="' + 码 + '"], [data-save="' + 码 + '"]');
		行 = 提(钮);
		if (!行 && window.jQuery && typeof window.jQuery === 'function') {
			try { var j = window.jQuery('#saves-save-' + 码); if (j && j.length) 行 = 提(j[0]); } catch (e) { /* ✗ 吞 */ }
		}
		/* ★**收窄**（领队 2026-10-05 07:44 准）：删掉"按行文含「槽位 N」兜底" ✗ —— 它按**文**找行、
		 *   而显示名与钮 id **偏移一行**（实测：行文「槽位 3」的那一行，钮 id 是 `saves-save-2`）⇒ 标记落到了**另一行**上；
		 *   而 tester-3 的臂① 是**按钮 id** 找行的（`行形` 从 `saves-(save|load|delete)-(\d+)` 取码 ✓）
		 *   ⇒ 两边口径不同、判的是两行（臂①红、②③绿 —— 全部读数由此自洽）。
		 *   ⇒ **与臂同口径**：只按 id 找行（`#saves-save-<码>` ⇒ `closest('tr')`）✓ ✗ 不按文。 */
		/* ★仍保留：别的 id 变体／jQuery 形（同为"按 id"的口径 ✓，✗ 不引入第二口径） */
		if (!行) {
			try {
				var 钮2 = document.querySelector('[id$="-save-' + 码 + '"], [data-save="' + 码 + '"]');
				行 = 提(钮2);
			} catch (e) { /* ✗ 吞 */ }
		}
		return 行;
	};

	/**
	 * 对存档对话框做后处理：把保留槽那几行锁上。
	 *   ★可重入：`UI.saves()` 每次开都重画 ⇒ 每次重处理（幂等 ✓）。
	 * @returns {number} 本次锁住的行数（0 ＝ 无 DOM／无对话框／无保留槽 ⇒ 都不抛 ✓）
	 */
	var 处理存档对话框 = function () {
		/* ★`books#280` ⑫ 的**中间态机读面**（`tester-3` 提 · 领队 2026-10-05 08:05 准「A（两笔）」）：
		 *   把「本趟后处理跑到哪一步」记在 `setup.RPG.reservedSlots.lastRun` 上，供臂/人直接读。
		 *   ★为何要它：`#2015` 作者自陈「**凭推断改了六轮**，唯一直击真因的是**把中间态打出来**」—— 本面把那句**固化**下来。
		 *   ✗ 不拿 `console` 文本当接口（脆 ✗）。★四字段：`观察者醒`／`取到行`／`锁上`／★`末次结论`
		 *   ★★`锁上` 的准确语义（**被首份真读数校正过** `2026-10-05`）：它是**本趟「新锁」的行数** ——
		 *     `锁一行` 遇 `已有标记(行)` 即 `return false`（幂等 ✓）⇒ **`锁上=0` ✗ 不等于「没锁上」**
		 *     （重渲染那趟的行**早被上趟标好** ⇒ 本趟自然新锁 0 ⇒ 实测 `醒=1／取到行=2／锁上=0` 而**行为完全正常** ✓）。
		 *     ⇒ ★读这三数时**须结合「行此刻是否在保护中」**（那要看 DOM 的行类/文）才判得出「幂等」vs「真没锁上」✓。
		 *   —— ★第四字段必要：「保留表空（重试中）」那类趟会落成「醒>0 且 取到行=0」，只看三数会被误读成「没锁上」✗。 */
		var 记趟 = function (结论, 取到行, 锁上) {
			try {
				var R0 = (typeof RPG !== 'undefined' && RPG) ? RPG : ((typeof setup !== 'undefined' && setup) ? setup.RPG : null);
				if (!R0) return;
				if (!R0.reservedSlots) R0.reservedSlots = function () { return []; };
				var 前 = R0.reservedSlots.lastRun;
				R0.reservedSlots.lastRun = {
					观察者醒: ((前 && Number.isFinite(前.观察者醒)) ? 前.观察者醒 : 0) + 1,
					取到行: Number(取到行) || 0,
					锁上: Number(锁上) || 0,
					末次结论: String(结论 || '')
				};
			} catch (e) { /* ✗ 吞：记面失败 ✗ 不得影响本体 */ }
		};
		/* ★末趟快照（✗ 非累计）：起点先清上趟的计数 —— 否则臂读到的三数会跨趟累加，读不出「这趟怎么了」。 */
		try {
			var R1 = (typeof RPG !== 'undefined' && RPG) ? RPG : ((typeof setup !== 'undefined' && setup) ? setup.RPG : null);
			if (R1 && R1.reservedSlots) R1.reservedSlots.lastRun = { 观察者醒: 0, 取到行: 0, 锁上: 0, 末次结论: '本趟开始' };
		} catch (e) { /* ✗ 吞 */ }
		
		if (typeof document === 'undefined') { return 0; }
		var 箱 = document.getElementById('ui-dialog-body');
		if (!箱) { 记趟('无对话框（✗ 不是本趟的账）', 0, 0); return 0; }
		if (箱.classList && !箱.classList.contains('saves') && !箱.querySelector('#saves-list')) { 记趟('对话框不是存档面', 0, 0); return 0; }
		var 列 = document.getElementById('saves-list') || 箱.querySelector('.saves-list');
		/* ★jsdom 健壮性（领队 2026-10-05 05:04 裁①）：引擎 headless 宿主对 DOM 有**桩/代理** ⇒ 
		 *   `document.getElementById(...) || 箱.querySelector(...)` 可能**不是元素** ⇒ 旧形在下一行 
		 *   `列.querySelectorAll(...)` 上**直接抛** ⇒ 整趟"标记＋禁用"没跑成，且**静默**（实测：单测路由它踩红）。
		 *   ⇒ 不是元素就**具名放弃这一趟**（✗ 不抛、✗ 不假装做过）。 */
		/* ★两形状都认（同 ②）：宿主可能给 jQuery/桩形 —— 只认 `querySelectorAll` 会把**整趟**静默丢掉
		 *   （实测：真浏览器宿主也桩形 ⇒ 原形在这里**抛**、被包一层的 try 吞掉 ⇒ 从未标上）。 */
		if (列 && typeof 列.querySelectorAll !== 'function' && !(window.jQuery && typeof window.jQuery === 'function' && 列 && 列.jquery !== undefined)) {
			try { if (window.console && console.warn) console.warn('[reserved] 存档列表形状不认识（既无 querySelectorAll 也非 jQuery 形）⇒ 本趟放弃'); } catch (e) { /* ✗ 吞 */ }
			记趟('列表形状不认识', 0, 0);
			return 0;
		}
		if (!列) { 记趟('无 saves-list', 0, 0); return 0; }
		var 保留 = (typeof RPG.reservedSlots === 'function') ? RPG.reservedSlots() : [];
		/* ★第 2 步口径：读不到 ⇒ 那档已出声 ＋ 空集 ⇒ 本档**不猜**（✗ 不默认锁 3／4）✓ */
		/* ★「保留为空」＝**还没到时候**（✗ 不是"这一趟做完了"）：
		 *   ① 宿主 `40-saves-reserved.js` 读不到 `setup.BABEL.槽位` 时**按设计**返回空集（它已 warn 过一句 ✗ 但没人看）；
		 *   ② 故事侧 `world/encounters.js` 才把 `槽位` 挂上（世界模块执行时）；
		 *   ③ 本档在对话框后处理里比它**先跑** ⇒ 那一刻读到空 ⇒ 旧形**直接 return** ⇒ 保留行**永远不被标**（实测：tester-3 的臂① 一直红）。
		 *   ⇒ 所以这里**有界重试**（✗ 不当作做完）＋ 到顶**记明账**（✗ 不静默）。 */
		if (!保留 || !保留.length) {
			var w0 = (typeof window !== 'undefined') ? window : null;
			if (w0) {
				w0.__rpgReserved试 = (w0.__rpgReserved试 || 0) + 1;
				if (w0.__rpgReserved试 <= 40) {
					if (typeof setTimeout === 'function') {
						setTimeout(function () { try { 处理存档对话框(); } catch (e) { /* ✗ 吞 */ } }, 250);
					}
				} else if (!w0.__rpgReserved账) {
					w0.__rpgReserved账 = true;
					try { if (window.console && console.warn) console.warn('[reserved] 保留槽表始终读不到（重试 40 次 ≈ 10s）⇒ 本档**未做**任何标记（✗ 不是做过）'); } catch (e) { /* ✗ 吞 */ }
				}
			}
			记趟('保留表空（重试中）', 0, 0);
			return 0;
		}
		/* ★拿到保留码 ⇒ 重试计数清零（下次换档/重建从头算） */
		try { if (typeof window !== 'undefined') window.__rpgReserved试 = 0; } catch (e) { /* ✗ 吞 */ }
		var n = 0, 得行 = 0;
		保留.forEach(function (码) {
			if (!Number.isInteger(码)) return;
			var 行 = 行of(码);
			if (行) 得行 += 1;
			if (锁一行(行)) n += 1;
		});
		记趟('已处理', 得行, n);
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
				new MutationObserver(function (muts) { 包一层();
				try {
					var 关 = muts.some(function (m) {
						var nd = m.target;
						if (nd && nd.nodeType !== 1) nd = nd.parentNode;
						/* ★闸的界＝**存档对话框**（`.saves` 箱）—— ✗ 不是「必须落在 `#saves-list` 节点里面」：
						 *   `UI.saves()` **整段重建**时，变更的 target 常是**箱子那一层**／已摘下的旧节点 ⇒ 旧闸会把
						 *   **唯一要紧的那一次**挡在门外（实测：臂①「重渲染后标记/禁用双失」＋臂③「程序化 click 真删」）。 */
						/* ★两腿形（领队 2026-10-05 06:03 裁）：**同步腿**在入口尽力标、**异步腿**在这里保证"真落地必再标"。
						 *   ⇒ 闸**放宽成「文档里有 `#saves-list` 就处理」**：`处理存档对话框()` 自身**幂等且找不到就 return 0**
						 *   ⇒ 所以"多跑几次"没有代价 ✓；而收紧的闸（"target 必须落在 `#saves-list` 里"✗）会把
						 *   "整段重建时 target 是箱子那一层／已摘下的旧节点"这一**最要紧的一次**挡在门外（实测：臂① 红）。 */
						try {
							if (document.getElementById && document.getElementById('saves-list')) return true;
							if (document.querySelector && document.querySelector('.saves-list')) return true;
						} catch (e) { return true; }
						return !!nd;   /* 连表都还没有（不是存档面）⇒ ✗ 不空跑 */

						try {
							if (nd.id === 'saves-list' || nd.id === 'probe12') return true;
							if (nd.classList && (nd.classList.contains('saves') || nd.classList.contains('saves-list'))) return true;
							if (nd.closest && (nd.closest('#saves-list') || nd.closest('.saves'))) return true;
							if (nd.querySelector && (nd.querySelector('#saves-list') || nd.querySelector('.saves'))) return true;
						} catch (e) { return true; }
						return false;
					});
				} catch (e) { var 关 = true; }
				if (关) 处理存档对话框();
				/* ★这就是"观察面收窄" —— 落在**判据**里（✗ 不落在挂点上） */ })   /* ★⑫③：观察面已**收窄到 `#saves-list` 子树**（见下 observe 参数 ✓）*/
					.observe(document.documentElement, { childList: true, subtree: true }
			/* ★⑫③ 的**正解**（本席实测撞出来）：观察面**不能钉在 `#saves-list` 这个节点上** ——
			 *   `UI.saves()` 重建时**把该节点整个换掉** ⇒ 观察者盯的是**已摘下的旧节点** ⇒ 之后再不会回调
			 *   （实测：臂①「重渲染后仍受保护」与臂③「程序化 click 不得真删」**双双红**）。
			 *   ⇒ 观察面钉**稳定祖先**（`documentElement`），把"收窄"落进**回调的判据**里（下一步）：
			 *   既不漏"重建后的那一次"，也不被无关 DOM 抖动牵着跑。 */);
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

	/* 加载即接线（✗ 不等待别的事件 —— 对话框可能在任意时刻开 ✓） */
	接线();
})();
