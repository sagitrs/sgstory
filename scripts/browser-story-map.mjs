// ★ `#1532`（`#1516` C 案 · books tier 形）：**乙类段名/键的映射表** —— **无副作用**模块。
//
// 为什么单独一个文件（而不是留在 `test/browser.mjs` 顶层）：
//   ★原写法把"读 env ＋ 解析 ＋ 失败即 `process.exit(1)`"写在 `browser.mjs` 的**顶层 IIFE** 里
//   ⇒ ★`browser.mjs` 是**顶层 await 脚本** ⇒ ★**无法在进程内 import 它**来量"注入到底生效没有" ✗
//   ⇒ ★于是自证只能**在远处**断言（"默认值＝旧值"）—— 而**注入那一路**（`SG_BROWSER_STORY_MAP`）
//     就**没有近格**（★"守卫在远处" ✗）。
//   ★抽成本模块 ⇒ ★门（`browser.mjs`）与**格**（`--selftest`）**同 import 同一份实现**
//   ⇒ ★注入可**进程内量**（`resolveStoryMap({ env: {...} })` ⇒ 断 `=== 'X'` ✓）。
//
// ★纪律：本模块**不得有副作用**（✗ 不 `process.exit`、✗ 不读 `process.env` 之外的全局）——
//   解析失败以**返回值**表达（`{ map, error }`），由**调用方**决定怎么处置。

/** 默认值 ＝ **旧值**（★迁移纪律：新机制上场时默认行为逐字不变 ✗ 不许顺手"改良"）。 */
export const DEFAULT_STORY_MAP = Object.freeze({
	witchHut: { passage: '女巫小屋' },
	caveFight: { passage: '洞穴·战斗' },
	// ★ `#1532`（T 的 B3 更正）：旧值 `门厅`／入口 `看钉` ⇒ 改 **`里屋`**（books 的 `north-room` 里那段名）。
	//   两个条件都要核（T 的判法）：① **内容性质**：动作要**跨段**（导航型）；
	//   ② **渲染性质**：它要落在 **`.acts`** 里（由段的 `present` 决定 ✓）。
	//   为什么 `门厅` ✗：`north-room` 全菜单形（不落 `.acts`）⇒ 只满足 ①，✗ 满足 ② ✗
	//   （✗ 不是"旧段名没了"那么简单 —— 是**渲染性质不对** ✗）
	hall: { passage: '里屋', expect: '里屋·察觉' },
	keeper: { passage: '守林人', state: 'pc.keeper=pc.keeper||{};' },
	multi: { passage: '岔路' },
});

/**
 * 解析映射表（**纯函数**：env 由调用方给 ⇒ 可两态复算）。
 * 覆盖语义：`SG_BROWSER_STORY_MAP` 是 JSON ⇒ **整体覆盖**（逐作用名浅合并，缺的落回默认）。
 * @returns {{ map: object, error: string|null }}
 */
export const resolveStoryMap = ({ env = {} } = {}) => {
	const raw = env?.SG_BROWSER_STORY_MAP;
	if (raw == null || String(raw).trim() === '') return { map: DEFAULT_STORY_MAP, error: null };
	try {
		const parsed = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { map: DEFAULT_STORY_MAP, error: 'SG_BROWSER_STORY_MAP 必须是 JSON 对象' };
		}
		return { map: { ...DEFAULT_STORY_MAP, ...parsed }, error: null };
	} catch (e) {
		return { map: DEFAULT_STORY_MAP, error: 'SG_BROWSER_STORY_MAP 不是合法 JSON：' + e.message };
	}
};
