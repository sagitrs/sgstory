/* RPG 核心 —— Object 的 choice 接口（交互选择）
 *
 * 任何对象都可以 .choice(options) 打印一排按钮作为选项，
 * 等待玩家点击其中一个，返回 Promise<string>——resolve 对应选项的 value。
 * 选中后按钮组即消失。
 *
 * options: [{ text: string, value: string }, ...]
 * 典型用法（配合 await）：
 *   const v = await this.choice([{ text: '攻击', value: 'atk' }, ...]);
 *
 * ★★`opts.收`（可选 · `sgstory#2054`）：**把「收掉这一盘」的能力交给问话方**。
 *   出处：`books#402` writer-2 实测（新局自然复现 · 抛出点 `src/core/60-map.js:359`）——
 *   旧形里本档**自己**订阅 `battle:submit`，一有提交就把**任何**待答的盘收掉并 `resolve(null)`；
 *   而 `choice` 的契约是「返回**对应选项的 value**」⇒ 消费方 `picked.startsWith('a')` 当场 `TypeError`
 *   （战斗中从页脚背包用药 ⇒ 打中**地图那一盘**）。
 *   ★新形：只有**问话的那一处**知道「这一问被谁答了、答成什么」⇒ 本档把 `收` 交出去，
 *     ✗ 自己不再猜（也 ✗ 再产出 `null` —— 契约外的值一个都不产出 ✓）。
 */

/* ★开启中的盘（`id ⇒ 收自己`）与序号 —— 与 `RPG.Battle.弃局` 同旨：给判据一处**可观测的口**
 *   （为什么需要：本档的回收动作落在 DOM 上，而无头宿主的 jQuery 是 no-op 桩 ⇒ 只靠 DOM 判定不了）。 */
RPG.choiceBoxes = RPG.choiceBoxes ?? new Map();
RPG.choiceBoxSeq = Number.isInteger(RPG.choiceBoxSeq) ? RPG.choiceBoxSeq : 0;

Object.defineProperty(Object.prototype, 'choice', {
	value: function choice(options, opts = {}) {		if (!Array.isArray(options) || options.length === 0) {
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
				/* ★★**回收口归问话方**（`sgstory#2054` · 病灶与形见本档头注）——
				 *   本档是 `.choice-box` 的**唯一**制造者 ⇒ DOM 仍归本档收；但「**何时**收」只有
				 *   问话的那一处知道（答成什么值也由它定）⇒ 本档把 `收自己` 交给它（`opts.收`）。
				 *   ⚠ 旧形（本档自己订阅 `battle:submit` ⇒ 任何盘都收掉并 `resolve(null)`）已删：
				 *     那是**逆契约**的（本档头注：返回对应选项的 value），且会把无关的盘一并打死。
				 *   ⚠ 开启的盘登记在 `RPG.choiceBoxes`（`id ⇒ 收`）—— 与 `RPG.Battle.弃局` 同旨：
				 *     给判据一处**可观测的口**（✗ 靠 DOM：无头宿主下 DOM 是 no-op 桩 ✓）。 */
				const id = ++RPG.choiceBoxSeq;
				const 收自己 = () => {
					if (!RPG.choiceBoxes.delete(id)) return;      // 已收 ⇒ 幂等（✗ 重复动 DOM）
					if ($box.parent().length > 0) $box.remove();
				};
				RPG.choiceBoxes.set(id, 收自己);
				try { opts?.收?.(收自己); } catch (e) {
					/* ✗ 吞：交不出回收能力就记下 —— 但那**不影响**本盘照旧能被点击答掉 ✓ */
					console.warn('[RPG] choice 的回收回调抛了（这一盘仍可点）', e);
				}
				for (const opt of options) {
					const $btn = jQuery('<button>').text(opt.text);
					$btn.on('click', () => {
						收自己(); // 选中后选项消失
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
