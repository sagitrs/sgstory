/* RPG 核心 —— Object 的 choice 接口（交互选择）
 *
 * 任何对象都可以 .choice(options) 打印一排按钮作为选项，
 * 等待玩家点击其中一个，返回 Promise<string>——resolve 对应选项的 value。
 * 选中后按钮组即消失。
 *
 * options: [{ text: string, value: string }, ...]
 * 典型用法（配合 await）：
 *   const v = await this.choice([{ text: '攻击', value: 'atk' }, ...]);
 */

Object.defineProperty(Object.prototype, 'choice', {
	value: function choice(options) {
		if (!Array.isArray(options) || options.length === 0) {
			return Promise.reject(new Error('choice 的参数应是非空的 {text, value} 选项数组'));
		}
		for (const opt of options) {
			if (opt == null || typeof opt.text !== 'string' || typeof opt.value !== 'string') {
				return Promise.reject(
					new Error('choice 的每个选项都应是 { text: string, value: string }')
				);
			}
		}
		return new Promise((resolve) => {
			// 渲染中（<<run>> 里发起的选择）会先缓冲，段落挂载后再显示按钮
			RPG.deferOutput(() => {
				const $host = jQuery('#passages .passage').last();
				const $box = jQuery('<div>').addClass('choice-box');
				/* ★`sgstory#2003`（`sgstory-books#280` ⑧）：**外部提交到达 ⇒ 这盘按钮已作废**。
				 *   战斗循环那边由提交**当场兑现**（那一问已经答了）⇒ 屏幕上这组按钮必须收掉，
				 *   否则玩家会对着一个「点了也不会改变结果」的菜单点（本批同族教训：看着有反应、其实没接上）。
				 *   ⚠ 只做「收掉」：值由**提交面**决定（`40-battle.js` 的 `#choose`）——本档 ✗ 不参与判定，
				 *     也不去猜该选哪个（那会是第二条取值路）。
				 *   ⚠ DOM 所有权：本档就是 `.choice-box` 的**唯一**制造者 ⇒ 「谁造谁收」（core 不碰 DOM 的棘轮不受影响）。 */
				const 收按钮 = () => {
					/* ⚠ 只在**战斗进行中**收（`RPG.Battle.current` 是那面旗）：本事件只在提交战斗行动时发，
					 *   而若别处恰好也挂着一次 choice（段落选择等），不该被这条牵着走。 */
					if (!RPG.Battle?.current) return;
					if ($box.parent().length > 0) { $box.remove(); resolve(null); }
					取消订阅();
				};
				const 取消订阅 = RPG.events.on('battle:submit', 收按钮);
				for (const opt of options) {
					const $btn = jQuery('<button>').text(opt.text);
					$btn.on('click', () => {
						$box.remove(); // 选中后选项消失
						取消订阅();
						resolve(opt.value); // 把对应链接的值交回调用方
					});
					$box.append(jQuery('<p>').append($btn));
				}
				const $foot = $host.find('.statusbar').first();
				if ($foot.length) $box.insertBefore($foot);
				else $box.appendTo($host);
			});
		});
	},
	writable: true,
	configurable: true,
	enumerable: false,
});
