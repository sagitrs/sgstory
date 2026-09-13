// 可复算随机源（#519）：门里跑蒙特卡洛/抽牌要**同种子同序列**，否则 golden 会抖、
// 失败会复现不出来（`#451`／`#484` 那类 flake 的温床）。
//
// 为什么单独一个 lib：门与门之间不许互相 import（约定见 `scripts/audit/context.mjs` 的头注释），
// 而 `--dragon`（MC 三门）与 `--combat`（抽牌张数）都需要同一套种子源 ⇒ 放共享 lib。
//
// 两个东西：
//   · `mulberry32(seed)`  —— 小、快、**确定性**（同种子同序列）；返回 `() => [0,1)`
//   · `asSugarRandom(fn)` —— 把 `() => [0,1)` 适配成 `Game.Rules.rng.d(n)` 要的形状。
//     `Game.Rules.rng.d(n)` 内部调 `_impl(1, n)`，而 SugarCube 的 `random(1,n) = floor(random()*n)+1`
//     ⇒ 适配式 `lo + floor(fn() * (hi - lo + 1))` 与之**同公式** ⇒ 用它注入后，
//     原先吃 `Math.random()` 的调用点（如 `Combat.offer`）行为**逐位不变**。

/** mulberry32：小、快、**确定性**（同种子同序列）——MC/彩蛋率可信的前提。 */
export const mulberry32 = (a) => () => {
	a |= 0; a = (a + 0x6d2b79f5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 把 `() => [0,1)` 适配成 `Game.Rules.rng` 的实现（签名 `(lo, hi)`，返回 `[lo, hi]` 整数）。 */
export const asSugarRandom = (fn) => (lo, hi) => lo + Math.floor(fn() * (hi - lo + 1));

/** 在 `Game.Rules.rng` 上装一条种子流跑 `body()`，跑完**复位**（同进程内别把种子留给后面的门）。 */
export const withSeededRng = (Game, seed, body) => {
	Game.Rules.rng.set(asSugarRandom(mulberry32(seed)));
	try { return body(); } finally { Game.Rules.rng.reset(); }
};
