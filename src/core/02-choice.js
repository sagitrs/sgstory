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
				for (const opt of options) {
					const $btn = jQuery('<button>').text(opt.text);
					$btn.on('click', () => {
						$box.remove(); // 选中后选项消失
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
