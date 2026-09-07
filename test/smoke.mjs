// 无头冒烟测试（jsdom）
// 说明：jsdom 不会触发 SugarCube 依赖的完整启动链，所以手动调用 Engine.start()。
// 覆盖：引擎启动、开场渲染、链接跳转、变量赋值与插值、Widget/宏解析无错误。
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const vc = new VirtualConsole();
const pageErrors = [];
vc.on('error', (...a) => pageErrors.push(String(a[0]).slice(0, 200)));
vc.on('jsdomError', () => {}); // 忽略 jsdom 未实现的 API（scroll 等）

const html = readFileSync('dist/index.html', 'utf8');
const dom = new JSDOM(html, {
	runScripts: 'dangerously',
	pretendToBeVisual: true,
	url: 'http://localhost/',
	virtualConsole: vc,
});
const w = dom.window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await sleep(1200);
// jsdom 不会触发 SugarCube 完整启动链，这里手动补齐：先执行 StoryInit，再启动引擎。
// （真实浏览器无需此步骤，会自动走完整流程）
const storyInit = w.document.querySelector('tw-passagedata[name="StoryInit"]');
new w.SugarCube.Wikifier(null, storyInit.textContent);
w.SugarCube.Engine.start();
await sleep(600);

const assert = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) process.exitCode = 1;
};

const start = w.document.querySelector('#passages .passage');
assert(!!start, '开场段落渲染');
assert(start?.textContent.includes('迷雾森林'), '标题画面文字正确');

const links = [...w.document.querySelectorAll('#passages a.link-internal')];
assert(links.some((a) => a.textContent === '踏上旅途'), '开场链接存在');

// 点击"踏上旅途" → 酒馆（$player_name 默认为 无名旅人）
links.find((a) => a.textContent === '踏上旅途').click();
await sleep(600);

const tavern = w.document.querySelector('#passages .passage');
assert(tavern?.textContent.includes('歪脖子鸭'), '跳转到酒馆');
assert(tavern?.textContent.includes('无名旅人'), '玩家名变量插值正确');
assert(tavern?.textContent.includes('20 枚金币'), '金币变量插值正确');
assert(w.SugarCube.State.variables.player_name === '无名旅人', 'StoryInit/变量赋值正确');

const buyLink = [...w.document.querySelectorAll('#passages a.link-internal')]
	.find((a) => a.textContent.includes('买一支火把'));
assert(!!buyLink, '条件链接（金币足够时显示买火把）');

if (buyLink) {
	buyLink.click();
	await sleep(500);
	const after = w.document.querySelector('#passages .passage');
	assert(after?.textContent.includes('十个金币'), '买火把事件触发');
	assert(w.SugarCube.State.variables.has_torch === true, '$has_torch 更新');
	assert(w.SugarCube.State.variables.gold === 10, '$gold 扣减正确');
}

assert(pageErrors.length === 0, `页面无运行时错误${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`);
console.log(process.exitCode ? '\n冒烟测试失败' : '\n冒烟测试全部通过');
process.exit(process.exitCode ?? 0);
