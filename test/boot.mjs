
import { defaultStoryHtml, storyHtml, DEFAULT_SLUG, readStory, STORIES_DIR } from '../scripts/dist-paths.mjs';
import { pathToFileURL } from 'node:url';
// 共享 JSDOM boot（白盒检视 A9 修复）：#27 的 pollUntil 就绪轮询 + 坑11 的 uncaught 监听
// 统一进此 helper——修复辐射不再依赖"记得改每个文件"。
// 用法：const { w, uncaught} = await boot({ random: 0.5, start: false});
//
// 退出清理也收在这一处：以前"跑完不退"要靠每个脚本各自记得 dom.window.close()/process.exit()，
// 漏一个就变成 CI 上的莫名超时。现在两件事都在本模块里解决——
// ① 让事件循环真的能空下来（见下面那段"非零视口"：SugarCube 的视口就绪轮询永不收尾）；
// ② boot 出来的每个窗口登记在 live 里，beforeExit / exit / SIGINT / SIGTERM 统一 close。
// 于是脚本不再需要自己收场，`await boot()` 的脚本跑完就退。
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { assertFreshDist } from '../scripts/dist-fresh.mjs';
import { JSDOM, VirtualConsole } from 'jsdom';
// `#761` P1 六片A：**取渲染文本只有一处** —— 本文件与页面侧同用 `lib/core/preview.mjs`
//（原来是这里内联的 `#passages.passage` 选择器 → 抽走后**不再有第二份取法**）。
import { renderedPassages, renderedTextOf } from '../editor/lib/core/preview.mjs';

// `#460`：**多故事真启动门**要一故事一启 → 产物与起始段都参数化（缺省仍是默认故事，向后兼容）
const HTML_OF = new Map();
const htmlOf = (story) => {
	const key = story ?? DEFAULT_SLUG;
	// `#1295`：**零故事态点名报错**（原来是裸 `TypeError: path must be string, received null` —— 看不出"因为仓内没有故事"）。
	if (!key) throw new Error('boot()：仓内**零故事**（`DEFAULT_SLUG === null`）→ 必须显式传 `story`；零故事态请由调用方先判并优雅跳过（`#1295`）');
	//注意：**工具契约**（复核席在 H5 配方里撞到的家族实例 —— `--out`／`--story-out`／`boot({story})` **同族**）：
	// `storyHtml()` 会把入参**当相对**（`join(ROOT,'dist',…)`）→ 传**绝对路径**会被拼成 `dist/…/home/…`
	// → **静默读到别的文件**（或 ENOENT 报文指错）。→ 这里**绝对路径按绝对处理**（`isAbsolute`）
	// 且**文件必须存在**（不存在就当场抛且报文点名 —— 不许静默走默认故事）。
	const path = isAbsolute(key) ? key : storyHtml(key);
	if (!existsSync(path)) throw new Error(`boot({story}) 找不到故事页 ✗：${path}（绝对路径按绝对处理 ✓；相对路径按 dist/ 解析 ✓）`);
	if (!HTML_OF.has(key)) HTML_OF.set(key, readFileSync(path, 'utf8'));
	return HTML_OF.get(key);
};
//注意：**清单读不到 → 点名**（`#215` 发起者裁 ②(b)：行为不变、只把话说清）。
// 为什么值得写一句：`storyHtml()` 那步**按绝对路径处理**，但**清单**这步仍是 `stories/<slug>/00-story.json`
// → 传绝对路径会被**当 slug** 拼出一个古怪的路径 → 旧行为是裸 ENOENT（看着像"文件没了"，其实是"口径只支持 slug"）。
const entryOf = (story) => {
	const key = story ?? DEFAULT_SLUG;
	try {
		return readStory(key).entry ?? '开场';
	} catch (cause) {
		const looked = join(STORIES_DIR, key, '00-story.json');
		throw new Error(
			`boot({story}) 读不到故事清单 ✗：story＝「${key}」⇒ 找的是「${looked}」\n` +
			'  ⚠️ 口径 ✓：**页面**那步收绝对路径 ✓（`storyHtml` 会按绝对处理 ✓），**清单**这步只认 `stories/<slug>/` ✓' +
			' ⇒ **交互式加载仓外故事包暂不支持** ✗（P4 的内容面就在仓内 ✓；真要用仓外包时另开票 ✓）',
			{ cause },
		);
	}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── dist 过期守卫：实现已抽到 scripts/dist-fresh.mjs（#319③，测试与 audit 共用一处）──
// test/*.mjs 跑的是构建产物 dist/index.html，不是 src/*.twee；过期/缺失 → 大声报错（不自动 build）。
assertFreshDist({ who: 'jsdom 测试' });

// ── 统一退出清理（一处修，全脚本受益）──────────────────────────────
const live = new Set();
let hooked = false;
function cleanup() {
	for (const dom of live) {
		try { dom.window.close(); } catch { /* 已经关了 */ }
	}
	live.clear();
}
function hookExit() {
	if (hooked) return;
	hooked = true;
	// exit：脚本自己 process.exit() 时同步触发（现有脚本全是这个收尾方式）
	process.on('exit', cleanup);
	// beforeExit：脚本直接跑完、没显式 exit 时兜住
	process.on('beforeExit', cleanup);
	for (const sig of ['SIGINT', 'SIGTERM']) {
		process.on(sig, () => { cleanup(); process.exit(130); });
	}
}

// 可点元素的统一选择器：普通链接 / 交涉面板选项 / 结局页收尾按钮。
// 一处定义，各测试脚本共用——新增一种控件只改这里（"修复辐射不再依赖记得改每个文件"）。
// 相对选择器（在某个段落元素里查）——别用字符串 replace 拼绝对选择器，那个坑很深
//「出口在最后」走查（#179）：最后一个可点元素之后的全部正文（按文本节点数，含收起 details——
// 最坏展开态）。twee 的裸链接 + <br> 布局不包块级元素，元素级兄弟走查会漏掉裸文本节点。
export const trailingAfterLast = (win, box, last) => {
	const FOLLOWING = win.Node.DOCUMENT_POSITION_FOLLOWING, INSIDE = win.Node.DOCUMENT_POSITION_CONTAINED_BY;
	const tw = win.document.createTreeWalker(box, win.NodeFilter.SHOW_TEXT);
	let text = '';
	for (let n = tw.nextNode(); n; n = tw.nextNode()) {
		const pos = last.compareDocumentPosition(n);
		if ((pos & FOLLOWING) && !(pos & INSIDE)) text += n.nodeValue;
	}
	return text.replace(/\s+/g, '');
};
export const CLICKABLE_SEL = 'a.link-internal, a.soc-opt, button[data-end-act]';
export const LINKS_SEL = 'a.link-internal, a.soc-opt'; // 只算"剧情链接"（不含结局页的导航按钮）
export const CLICKABLE = `#passages ${CLICKABLE_SEL}`;
export const LINKS = `#passages ${LINKS_SEL}`;

export async function boot({ random = 0.5, start = true, story = null, entry = null, url = 'http://localhost/' } = {}) {
	hookExit();
	const uncaught = [];
	const vc = new VirtualConsole();
	vc.on('jsdomError', (e) => {
		const msg = String(e?.message ?? e);
		if (msg.startsWith('Uncaught')) uncaught.push(msg);
	});
	const dom = new JSDOM(htmlOf(story), {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		url,                       // `#491` 判据 10：可传 `?seed=&pool=` 验调试开关
		virtualConsole: vc,
		// random 可以是定值（0.5 → 恒中性）也可以是函数（游走器用种子流）
		beforeParse(window) { window.Math.random = typeof random === 'function' ? random : () => random; },
	});
	live.add(dom);
	const w = dom.window;
	const close = () => { live.delete(dom); try { w.close(); } catch { /* 已经关了 */ } };
	// jsdom 不做布局：document.documentElement.clientWidth 恒为 0，于是 jQuery(window).width() 也是 0。
	// SugarCube 在 Engine.start() 内部用 `setInterval(… $window.width() && LoadScreen.size <= 1 …)`
	// 轮询"视口就绪"，这个条件永远不成立 → 那段轮询永不 clearInterval → node 的事件循环被一个
	// 40ms 计时器永久吊住（"测试跑完进程不退"，只能靠每个脚本自己 process.exit 收场）。
	// 给它一个非零视口，那段轮询下一拍就自己收尾——退出清理才有机会跑。
	for (const [prop, val] of [['clientWidth', 1024], ['clientHeight', 768]]) {
		try { Object.defineProperty(w.document.documentElement, prop, { value: val, configurable: true }); } catch { /* 老 jsdom 无妨 */ }
	}
	//「等到这一翻真的画完」。两个条件都要：
	// ① Engine.isIdle()——上一翻还在画的时候点下一翻，SugarCube 会把这次点击**丢掉**；
	// ② DOM 跟上了 State——回退 / 读档走的是 State.goTo() + 异步 engineShow()，State.passage
	// 会先变，段落元素晚一拍才换（并行跑多条路线时尤其明显）。
	const settle = async (timeoutMs = 3000) => {
		const t = Date.now();
		for (;;) {
			const names = renderedPassages(w);   // ← 共享件（唯一定义处）
			// `#864` 复核：原来 `names.length === 0 || …` → **"取不到"被当成"已同步"** → 取法改坏也不红。
			// → 只有"**State 本来就没有段落**"时，空 DOM 才算同步；否则必须**点名匹配**。
			const want = w.SugarCube?.State?.passage ?? '';
			const domSynced = want ? names.includes(want) : names.length === 0;
			const idle = typeof w.SugarCube?.Engine?.isIdle !== 'function' || w.SugarCube.Engine.isIdle();
			if (idle && domSynced) break;
			if (Date.now() - t > timeoutMs) break;
			await sleep(20);
		}
		await sleep(20);
	};
	// 就绪轮询（#27 CI 教训：固定 sleep 在 2 核 runner 上不成立）
	const t0 = Date.now();
	while (!(typeof w.SugarCube?.Wikifier === 'function' && w.document.querySelector('#passages'))) {
		if (Date.now() - t0 > 30000) throw new Error('等待超时：SugarCube 加载');
		await sleep(50);
	}
	new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
	if (start) {
		// Engine.start() 的 promise 要等"视口就绪 + 载入屏清空"才 resolve——视口非零之后它**真的会
		// resolve**（旧版视口恒 0，这个 promise 永远挂着，只能靠固定 sleep 猜启动完了没有）。
		// 现在 await 它就是"完全启动"的可靠信号；再等起始段落地，避免往还在启动的实例上点链接。
		await Promise.race([w.SugarCube.Engine.start(), sleep(15000)]);
		const t1 = Date.now();
		const entryPassage = entry ?? entryOf(story);
		// `#864` 复核：这里原来**手写选择器** → 共享件改坏了它也不动（实测：变异刀打不出红）。
		// → 改用共享件：它**超时会抛**（有牙）且报文点出"当前渲染的是什么"。
		while (!renderedPassages(w).includes(entryPassage)) {
			if (Date.now() - t1 > 15000) throw new Error(`等待超时：起始段渲染（${entryPassage}）—— 当前渲染的是 ${renderedPassages(w).join('、') || '（空）'}`);
			await sleep(50);
		}
		await settle();
	}
	await sleep(50);
	// dom 一并返回：游走器等老调用点仍在用；新代码请用 close()
	return { w, dom, uncaught, sleep, settle, close };
}

export { cleanup as closeAllWindows };
