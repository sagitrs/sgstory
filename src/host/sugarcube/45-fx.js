/* L0 宿主适配 · **修饰宏（B-呈现）**（`sgstory#1982` · 0.0.2 rider · 纯增量）
 *
 * 契约/先例：本包是全仓**唯一允许出现宿主符号**的层（`00-init.js` 头注 · 架构档 L0）；
 *   形照 `40-pace.js`（`#1981`）：装宏返回"装上没有"、无宿主**静默跳过**、输出经 `RPG.perform`、
 *   非法入参**具名拒绝**（✗ 静默）。
 *
 * ## 本档只做最小形（✗ 免得读者当漏）
 *   · 三宏：`<<shake>>`（抖一下）／`<<board>>`（信息板）／`<<fx heart>>`（指名效果）。
 *   · **只动自己印的那一段**：✗ 不碰既有正文、✗ 不写裸 HTML 到叙事里（宿主侧用类名 ✓）。
 *   · ★**名义**面：本档只到「**发事件 ＋ 给一个名义时长/档名**」这一步 —— 真正的动画把延迟
 *     落进宿主显示队列属**后续版本**的全量（本档**不假装已做** ✓，同 `40-pace.js` 的边界写法 ✓）。
 *   · cssVar 写入留 `#cssVar` 票（票面已注 ✓）。
 *   · 叙事侧**只许经宏写样式**（`#1940` ui-engine-lessons §二）：三个宏就是那条"唯一出口" ✓。
 */
(() => {
	/** 名义时长（毫秒）—— 只作读数，✗ 不当真延迟用（见头注"名义面"）。 */
	const 名义 = Object.freeze({ shake: 240, board: 0, heart: 600 });

	/** 宿主侧真面：有 `document` 就给最近的段落挂个类名（✗ 无宿主 ⇒ 只发事件）。 */
	const 挂类 = (类名) => {
		try {
			if (typeof document === 'undefined') return false;
			const 段 = document.querySelector('#passages .passage:last-child') ?? document.getElementById('passages');
			if (!段 || typeof 段.classList?.add !== 'function') return false;
			段.classList.add(类名);
			setTimeout(() => { try { 段.classList.remove(类名); } catch { /* 段被换掉 ⇒ 无事可做 */ } }, 名义[类名] ?? 0);
			return true;
		} catch { return false; }
	};

	/** 发一条修饰事件（判据吃它 ✓；命名与 `pace:set` 同族）。 */
	const 发 = (名, 载荷) => { RPG.events?.emit?.(名, 载荷); return 载荷; };

	/** 装宏（✗ 无宿主 ⇒ 静默跳过；返回是否装上）。 */
	const 装 = () => {
		const M = globalThis.Macro;
		if (M?.add == null) return false;

		/* `<<shake>>` —— 抖一下（只动自己印的那段）。 */
		M.add('shake', {
			handler() {
				发('fx:shake', { 毫秒: 名义.shake, 挂上: 挂类('shake') });
			},
		});

		/* `<<board>>` —— 信息板：把参数当**文本**印（经 `perform` ✓ 叙事侧不写裸 HTML ✓）。 */
		M.add('board', {
			handler() {
				const 文 = String(this.args.join(' ') ?? '').trim();
				if (文 === '') {
					/* 空板 ⇒ 具名拒绝（✗ 静默印一个空框） */
					throw new Error('<<board>> 需要内容（✗ 空板）：例 `<<board 探索点 3/5>>`');
				}
				RPG.perform?.(`〔${文}〕`);
				发('fx:board', { 文本: 文 });
			},
		});

		/* `<<fx 名>>` —— 指名效果（当前只有 `heart`；非法名 ⇒ 具名拒绝 ✗ 静默）。 */
		M.add('fx', {
			handler() {
				const 名 = String(this.args[0] ?? '').trim();
				if (!Object.prototype.hasOwnProperty.call(名义, 名) || 名 === 'shake' || 名 === 'board') {
					throw new Error(`<<fx>> 不识效果 ${JSON.stringify(名)}（现有：${JSON.stringify(['heart'])}）`);
				}
				发('fx:play', { 名, 毫秒: 名义[名], 挂上: 挂类(名) });
			},
		});
		return true;
	};

	const 装上 = 装();
	RPG.fx = Object.freeze({ 名义, 装上, 装 });   // ★装上/装 递出去 ⇒ 判据与刀都够得着（同 `install` 族 ✓）
})();
