/* RPG 核心 —— 骰子工具
 * 支持 '1d6'、'2d4+1'、'1d8-2' 记法，以及固定值 '3'。
 * 规则无关：dnd3 的 1d20 检定与 wfrp 的 1d100 百分骰都用它。
 *
 * 随机源：所有骰面一律经 `RPG.rng.pick(sides)`（唯一随机入口）。
 *   为什么：直调 `Math.random()` 时用例只能做范围断言；收成单一入口后用例可注入
 *   固定序列做确定性断言。设计与契约见 docs/plan/1697-character-creation.md §决策五。
 */

/** 随机源：唯一注入面。
 *
 * 默认源**动态读取** `Math.random`（不在定义时冻结）——冻结会让既有「替换
 * `Math.random`」的用例注入**静默失效**（测试仍绿而实为真随机）。
 */
RPG.rng = {
	_impl: null,

	/** 唯一注入形态：`fn` 与 `Math.random` 同形（无参，返回 `[0,1)`） */
	set(fn) {
		if (typeof fn !== 'function') {
			throw new Error(`RPG.rng.set 需要函数（与 Math.random 同形），收到：${typeof fn}`);
		}
		this._impl = fn;
		return this;
	},

	/** 便捷件：注入固定序列（单元值数组）。按次消耗，**耗尽即抛错**——
	 *  不静默回退真随机、不重复末值：假确定性必须当场可见。 */
	setSequence(values) {
		if (!Array.isArray(values) || values.length === 0) {
			throw new Error('RPG.rng.setSequence 需要非空的单元值数组');
		}
		const rest = [...values];
		return this.set(() => {
			if (rest.length === 0) {
				throw new Error('RPG.rng：注入序列已耗尽（不静默回退真随机）');
			}
			return rest.shift();
		});
	},

	/** 复位：回到默认源（用例前置挂点调用，防注入跨用例残留） */
	reset() { this._impl = null; return this; },

	/** 掷单颗骰：映射与历史实现逐字相同（`1 + floor(unit * sides)`） */
	pick(sides) {
		const unit = this._impl ? this._impl() : Math.random();   // ★默认源动态读取
		return 1 + Math.floor(unit * sides);
	},
};

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
		rolls.push(RPG.rng.pick(sides));   // 唯一随机入口（#1706）
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
