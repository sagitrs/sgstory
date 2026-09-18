// 车道 D · 切片 1（`#215` 报备评论 `18500772`）：**词表** —— `Sg.rules.*` 的**页内可读镜像** ✓
//
// ⚠️ **单一权威在引擎** ✗ —— 本件是它的镜像，**不是**第二处声明 ✓：
//   · 引擎侧声明：`src/engine/40-sim/21-resolve.twee` 的 `prefixes`／`effects`／`ops`／`terms` ✓（每轴都带"为什么必须由引擎宣告"的注释 ✓）；
//   · **钉法** ✓：`test/rules.mjs` 四轴逐条 `eq(Sg.rules.<axis>, VOCAB.<axis>)` ✓ ⇒ **只改一边 ⇒ 当场红** ✗。
// ⇒ **要加一项：先改引擎** ✗，再改这里 ✓（顺序反了会被门抓住 ✓）。
//
// 为什么页内需要它 ✗（P1-③「enum 取自 `Sg.rules.*`」✓）：编辑器要给**下拉/候选** ✓，
//   而页面是**静态**的（不经服务端 ✓、不跑 SugarCube ✓）⇒ 拿不到运行期的 `window.Sg.rules` ✗ ⇒ 必须有一份**可 import 的声明** ✓。
// 定位 ✓：本件是**声明**（不是判定 ✗）—— 与 `core/stateDiagnose.mjs`／`core/k4criteria.mjs` 那种"判据件"**分家** ✓
//   （同 `#215` 里"判据住自己的 core 件"的形状 ✓）；**浏览器安全** ✓：零宿主 import ✓（`core/**` 的老规矩 ✓）。

/** 四轴词表 ✓（`Object.freeze` ⇒ 页内拿到的是**只读**声明 ✗：改它没有意义，改引擎才有 ✓）。 */
export const VOCAB = Object.freeze({
	/** **键形前缀** ✓（`inv:<道具>`／`era:<时代>`／`gear:<道具>`）—— 行里用了未宣告的前缀 ⇒ `--rules` 判红 ✓。 */
	prefixes: Object.freeze(['inv', 'era', 'gear']),
	/** **引擎兑现的授予面** ✓（`yields`／`gives`／`sets`）—— 被引擎忽略的声明＝**静默空转** ✗。 */
	effects: Object.freeze(['yields', 'gives', 'sets']),
	/** **条件项的"对象算子"** ✓（`{ gte: […] }` 一族）—— 引擎不认的算子会让条件**永假** ✗。 */
	ops: Object.freeze(['gte', 'lte', 'oneOf']),
	/** **取值项** ✓（当前只 `price`）—— 未宣告的取值项 ⇒ fail-loud ✓。 */
	terms: Object.freeze(['price']),
});

/** 四个轴的**轴名** ✓（给"钉法"和 UI 遍历用 ✓ —— 免得下游各写一份轴名表 ✗）。 */
export const VOCAB_AXES = Object.freeze(['prefixes', 'effects', 'ops', 'terms']);

/** 某一轴的候选值 ✓（轴名不认识 ⇒ **讲人话地抛** ✗，不许静默给空数组 ⇒ "下拉空着"会被当成"没得选"✓）。 */
export const vocabOf = (axis) => {
	if (!Object.prototype.hasOwnProperty.call(VOCAB, axis)) {
		throw new Error(`vocabOf：未知轴「${axis}」✗（可用：${VOCAB_AXES.join('／')}）`);
	}
	return VOCAB[axis];
};
