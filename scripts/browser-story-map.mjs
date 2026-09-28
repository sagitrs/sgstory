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
	// ★★ `#1592` M7（迁宿主时**逐项归因**后的重指；旧值见 git 历史）——
	//   ★为什么每键都带「story」：★story 档的格会 `loadFresh(<story>)`（✗ 从前 `loadFresh()` 无参
	//     ⇒ **全部格跑在同一个故事页**（`DEFAULT_SLUG`）⇒ 五键的段在那一个故事里**一个都不在** ✗
	//     ⇒ 那些格**永远找不到对象**（实测：真跑 ⇒ 13 红 ✓）。★改的是**接法**，✗ 断言 ✓。
	witchHut: { story: 'fruit-demo', passage: '房间' },   // ★`keyboardCase` 要「**行动区最大**」：语料实测 **12 链**（＞ mist-forest 3 ✓）
	caveFight: { story: 'mist-forest', passage: '洞穴·战斗' },   // ★A（裁＝乙）：**○ 未判**（对象形＝宏式战斗面板已随 `#1506` 溶解 ⇒ ★阶 3 落地后重定 ✓）
	hall: { story: 'north-room', passage: '里屋', expect: '里屋·察觉' },   // ★B：语料里段与 `check:` 都在 ✓
	keeper: { story: 'mist-forest', passage: '守林人', state: 'pc.keeper=pc.keeper||{};' },   // ★C（裁）：对象**未就绪**（`books#26` 第二章）⇒ 该组走「○ 未判 ＋ 出声」
	multi: { passage: '岔路' },   // ★✗ 不动：用在 **engine 档**（`runsEngine` 块），而 `nocar-basic` **确有** `岔路` ✓
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
