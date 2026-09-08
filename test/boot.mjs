// 共享 JSDOM boot（白盒检视 A9 修复）：#27 的 pollUntil 就绪轮询 + 坑11 的 uncaught 监听
// 统一进此 helper——修复辐射不再依赖"记得改每个文件"。
// 用法：const { w, uncaught } = await boot({ random: 0.5, start: false });
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function boot({ random = 0.5, start = true } = {}) {
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
		beforeParse(window) { window.Math.random = () => random; },
	});
	const w = dom.window;
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
	return { w, uncaught, sleep };
}
