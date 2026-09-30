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

	/** 取一个原始单元值 `[0,1)`。**本方法是全仓唯一读随机源之处**，其余消费点一律走 `pick`／`index`。 */
	unit() {
		return this._impl ? this._impl() : Math.random();   // ★默认源动态读取
	},

	/** 掷单颗骰：映射与历史实现逐字相同（`1 + floor(unit * sides)`） */
	pick(sides) {
		return 1 + Math.floor(this.unit() * sides);
	},

	/** 非骰面的等概率取值：返回 `[0, n)` 的下标。
	 *  用途：战斗 AI 选目标、宝箱陷阱取一——这些本来也直调 `Math.random()`，
	 *  收到本入口后「随机取值一律经 `RPG.rng`」才在仓内成立（#1706）。 */
	index(n) {
		if (!Number.isInteger(n) || n <= 0) {
			throw new Error(`RPG.rng.index 需要正整数，收到：${n}`);
		}
		return Math.floor(this.unit() * n);
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

/** 掷 `expr` 记法的骰子，取最高的 `keep` 枚（规则无关的组合子）。
 *  返回 `{ rolls, kept, total }`（`rolls` 为降序全量，`kept` 为计入的前 `keep` 枚）。
 *  用途：属性生成法（如 4d6 弃最低）的共有零件；**本体系取法住各自规则包**。
 *  `keep` 非整数或超出骰数即抛错（不静默截断）。 */
RPG.rollKeepHighest = (expr, keep) => {
	const d = RPG.rollDetail(expr);
	if (!Number.isInteger(keep) || keep < 1 || keep > d.rolls.length) {
		throw new Error(`取高枚数越域：keep=${keep}，骰数=${d.rolls.length}`);
	}
	const rolls = [...d.rolls].sort((a, b) => b - a);
	const kept = rolls.slice(0, keep);
	return { rolls, kept, total: kept.reduce((s, v) => s + v, 0) };
};

/** 把数值调整成带符号文本：3 → '+3'，-2 → '-2' */
RPG.formatMod = (n) => (n >= 0 ? `+${n}` : String(n));
