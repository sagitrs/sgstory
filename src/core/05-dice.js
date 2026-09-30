/* RPG 核心 —— 骰子工具
 * 支持 '1d6'、'2d4+1'、'1d8-2' 记法，以及固定值 '3'。
 * 规则无关：dnd3 的 1d20 检定与 wfrp 的 1d100 百分骰都用它。
 */

/** 掷骰，返回明细 { expr, count, sides, mod, rolls, total } */
RPG.rollDetail = (expr) => {
	const s = String(expr).replace(/\s+/g, '');
	let m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(s);
	if (!m) {
		m = /^(\d+)$/.exec(s); // 纯数字 = 固定值
		if (!m) throw new Error(`无法解析的骰子表达式：${expr}`);
		const n = Number(m[1]);
		return { expr, count: 1, sides: 1, mod: 0, rolls: [n], total: n };
	}
	const count = m[1] ? parseInt(m[1], 10) : 1;
	const sides = parseInt(m[2], 10);
	const mod = m[3] ? parseInt(m[3], 10) : 0;
	const rolls = [];
	for (let i = 0; i < count; i++) {
		rolls.push(1 + Math.floor(Math.random() * sides));
	}
	return {
		expr,
		count,
		sides,
		mod,
		rolls,
		total: rolls.reduce((a, b) => a + b, 0) + mod,
	};
};

/** 掷骰，只返回总数 */
RPG.roll = (expr) => RPG.rollDetail(expr).total;

/** 把数值调整成带符号文本：3 → '+3'，-2 → '-2' */
RPG.formatMod = (n) => (n >= 0 ? `+${n}` : String(n));
