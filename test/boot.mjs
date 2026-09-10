// 共享 JSDOM boot（白盒检视 A9 修复）：#27 的 pollUntil 就绪轮询 + 坑11 的 uncaught 监听
// 统一进此 helper——修复辐射不再依赖"记得改每个文件"。
// 用法：const { w, uncaught } = await boot({ random: 0.5, start: false });
//
// 退出清理也收在这一处：以前"跑完不退"要靠每个脚本各自记得 dom.window.close()/process.exit()，
// 漏一个就变成 CI 上的莫名超时。现在两件事都在本模块里解决——
//   ① 让事件循环真的能空下来（见下面那段"非零视口"：SugarCube 的视口就绪轮询永不收尾）；
//   ② boot 出来的每个窗口登记在 live 里，beforeExit / exit / SIGINT / SIGTERM 统一 close。
// 于是脚本不再需要自己收场，`await boot()` 的脚本跑完就退。
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
	// 就绪轮询（#27 CI 教训：固定 sleep 在 2 核 runner 上不成立）
	const t0 = Date.now();
	while (!(typeof w.SugarCube?.Wikifier === 'function' && w.document.querySelector('#passages'))) {
		if (Date.now() - t0 > 30000) throw new Error('等待超时：SugarCube 加载');
		await sleep(50);
	}
	new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
	if (start) {
		w.SugarCube.Engine.start();
		const t1 = Date.now();
		while (!w.document.querySelector('#passages .passage[data-passage="开场"]')) {
			if (Date.now() - t1 > 15000) throw new Error('等待超时：起始段渲染');
			await sleep(50);
		}
	}
	await sleep(150);
	// dom 一并返回：游走器等老调用点仍在用；新代码请用 close()
	return { w, dom, uncaught, sleep, close };
}

export { cleanup as closeAllWindows };
