// 无头冒烟测试（jsdom）：启动 → 车卡 8 轮 → 酒馆 → 森林（检定 UI）
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const vc = new VirtualConsole();
const pageErrors = [];
vc.on('error', (...a) => pageErrors.push(String(a[0]).slice(0, 200)));
vc.on('jsdomError', () => {});

const html = readFileSync('dist/index.html', 'utf8');
const dom = new JSDOM(html, {
	runScripts: 'dangerously',
	pretendToBeVisual: true,
	url: 'http://localhost/',
	virtualConsole: vc,
	beforeParse(window) {
		window.Math.random = () => 0.5; // d20 恒 11：无自然 20/1 干扰
	},
});
const w = dom.window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await sleep(1200);
// jsdom 补齐启动链：StoryInit + 引擎启动（真实浏览器自动完成）
new w.SugarCube.Wikifier(null, w.document.querySelector('tw-passagedata[name="StoryInit"]').textContent);
w.SugarCube.Engine.start();
await sleep(600);

const assert = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) process.exitCode = 1;
};
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];
const click = async (label) => {
	const a = links().find((x) => x.textContent === label);
	if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}`);
	a.click();
	await sleep(400);
};

// ── 开场 ──
let p = w.document.querySelector('#passages .passage');
assert(p?.textContent.includes('迷雾森林'), '开场段落渲染');
await click('踏上旅途');

// ── 车卡：快速模式（预设）──
assert(w.SugarCube.State.passage === '车卡', '进入车卡流程');
const cards = [...w.document.querySelectorAll('.choice-card')];
assert(cards.length === 3, '三套预设选项卡');
assert(cards.map((c) => c.querySelector('.choice-name').textContent).join(',') === '铁卫,影手,秘典', '预设名称渲染');
assert(links().some((a) => a.textContent.includes('逐轮细调')), '专家模式入口存在');
await click('快速成型'); // 第一张卡：铁卫

// ── 角色卡 ──
assert(w.SugarCube.State.passage === '角色卡', '快速预设后直达角色卡');
const sheet = w.document.querySelector('#passages .passage').textContent;
assert(sheet.includes('力量') && sheet.includes('17'), '角色卡显示属性表');
assert(sheet.includes('战士'), '角色卡显示职业');
assert(sheet.includes('无名旅人'), '角色卡显示默认名');
const pc = () => w.SugarCube.State.variables.pc;
assert(pc().abilities.str === 17 && pc().abilities.con === 15, '预设数值生效（力17 体15）');
assert(pc().max_hp === 14 && pc().hp === 14, '生命值计算正确（10+2 + 坚固2 = 14/14）');
assert(pc().gold === 15, '起始金币 15（佣兵）');
assert(pc().skills.filter((s) => s === '运动').length === 1, '背景与职业重复技能已去重');
assert(pc().has_torch && pc().has_rope, '预设行囊生效');

await click('出发，前往歪脖子鸭酒馆');

// ── 酒馆 ──
p = w.document.querySelector('#passages .passage');
assert(p.textContent.includes('歪脖子鸭'), '进入酒馆');
assert(p.textContent.includes('无名旅人'), '角色名插值');
assert(p.textContent.includes('15 枚金币'), '金币插值');
assert(!links().some((a) => a.textContent.includes('买一支火把')), '已带火把 → 购买链接隐藏');
assert(links().some((a) => a.textContent.includes('金币听老猎人讲实话')), '付费传闻链接存在（#25 收 5 金）');

await click('推门出发，走进暮色');

// ── 森林边缘：血条宏 + 检定入口 ──
assert(w.SugarCube.State.passage === '森林边缘', '到达森林边缘');
assert(!!w.document.querySelector('#passages .hpbar'), '血条宏（$pc 版）渲染');
await click('打着火把，走进山脚的洞穴');

// ── 洞穴：检定结果框 ──
assert(w.SugarCube.State.passage === '洞穴', '进入洞穴');
const checkBox = w.document.querySelector('#passages .check-result');
assert(!!checkBox, '检定结果框渲染');
const styleStory = w.document.querySelector('#style-story')?.textContent ?? '';
assert(styleStory.includes('LXGW WenKai') && styleStory.includes('@font-face'), '霞鹜文楷子集已内嵌（@font-face）');
const lc = w.SugarCube.State.variables.last_check;
assert(lc && lc.roll === 11 && lc.label === '察觉检定', '<<check>> 宏产出 $last_check');

assert(pageErrors.length === 0, `页面无运行时错误${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`);
console.log(process.exitCode ? '\n冒烟测试失败' : '\n冒烟测试全部通过');
process.exit(process.exitCode ?? 0);
