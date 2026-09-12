// 共享 JSDOM boot（白盒检视 A9 修复）：#27 的 pollUntil 就绪轮询 + 坑11 的 uncaught 监听
// 统一进此 helper——修复辐射不再依赖"记得改每个文件"。
// 用法：const { w, uncaught } = await boot({ random: 0.5, start: false });
//
// 退出清理也收在这一处：以前"跑完不退"要靠每个脚本各自记得 dom.window.close()/process.exit()，
// 漏一个就变成 CI 上的莫名超时。现在两件事都在本模块里解决——
//   ① 让事件循环真的能空下来（见下面那段"非零视口"：SugarCube 的视口就绪轮询永不收尾）；
//   ② boot 出来的每个窗口登记在 live 里，beforeExit / exit / SIGINT / SIGTERM 统一 close。
// 于是脚本不再需要自己收场，`await boot()` 的脚本跑完就退。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const distPath = new URL('../dist/index.html', import.meta.url);
const html = readFileSync(distPath, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── dist 过期守卫（一次修，全脚本受益）──────────────────────────────
// test/*.mjs 跑的是构建产物 dist/index.html，不是 src/*.twee。
// 源码改了、忘了 build 时，所有 jsdom 测试都会基于**旧游戏**断言 → 得到与源码不符的
// 假红（或假绿）。2026-09-12 实际咬过一次：pull 了 G3 之后直接跑 scenarios，
// 得到「门不可达」的假红，实际只是 dist 落后 4 分钟。
// 这里不自动 build（那会掩盖问题），而是**大声报错并给出修复命令**。
const newestSrc = Math.max(
	...readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.twee'))
		.map((f) => statSync(new URL(`../src/${f}`, import.meta.url)).mtimeMs),
);
if (statSync(distPath).mtimeMs < newestSrc) {
	throw new Error('dist/index.html 比 src/*.twee 旧——先跑 `npm run build`（否则断言基于旧游戏，结果是假红/假绿）');
}

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
// 「出口在最后」走查（#179）：最后一个可点元素之后的全部正文（按文本节点数，含收起 details——
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

export async function boot({ random = 0.5, start = true } = {}) {
	hookExit();
	const uncaught = [];
	const vc = new VirtualConsole();
	vc.on('jsdomError', (e) => {
		const msg = String(e?.message ?? e);
		if (msg.startsWith('Uncaught')) uncaught.push(msg);
	});
	const dom = new JSDOM(html, {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		url: 'http://localhost/',
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
	// 「等到这一翻真的画完」。两个条件都要：
	//   ① Engine.isIdle()——上一翻还在画的时候点下一翻，SugarCube 会把这次点击**丢掉**；
	//   ② DOM 跟上了 State——回退 / 读档走的是 State.goTo() + 异步 engineShow()，State.passage
	//      会先变，段落元素晚一拍才换（并行跑多条路线时尤其明显）。
	const settle = async (timeoutMs = 3000) => {
		const t = Date.now();
		for (;;) {
			const els = w.document.querySelectorAll('#passages .passage');
			const domSynced = els.length === 0 || [...els].some((e) => e.dataset.passage === w.SugarCube.State.passage);
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
		while (!w.document.querySelector('#passages .passage[data-passage="开场"]')) {
			if (Date.now() - t1 > 15000) throw new Error('等待超时：起始段渲染');
			await sleep(50);
		}
		await settle();
	}
	await sleep(50);
	// dom 一并返回：游走器等老调用点仍在用；新代码请用 close()
	return { w, dom, uncaught, sleep, settle, close };
}

export { cleanup as closeAllWindows };
