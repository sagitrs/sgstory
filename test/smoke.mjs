// 无头冒烟测试（jsdom，M1a-2 换骨后）：启动 → 快速车卡 → 酒馆 → 森林边缘 → 洞穴 + 侧栏/存档/物品栏
import { boot } from './boot.mjs';

const pageErrors = [];
const { w, sleep } = await boot({ random: 0.5 });
w.addEventListener('error', (...a) => pageErrors.push(String(a[0]).slice(0, 200)));

const assert = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) process.exitCode = 1;
};
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];
const click = async (label) => {
	const a = links().find((x) => x.textContent === label || x.textContent.includes(label));
	if (!a) throw new Error(`找不到链接「${label}」@ ${w.SugarCube.State.passage}`);
	a.click();
	await sleep(350);
};
const pc = () => w.SugarCube.State.variables.pc;

// ── 开场 ──
let p = w.document.querySelector('#passages .passage');
assert(p?.textContent.includes('林子边缘的雾'), '开场段落渲染');
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
assert(sheet.includes('力量') && sheet.includes('17'), '角色卡显示属性表（力 17）');
assert(sheet.includes('铁卫'), '角色卡显示职业');
assert(sheet.includes('无名旅人'), '角色卡显示默认名');
assert(!!w.document.querySelector('#passages .hpbar'), '角色卡血条宏渲染');
assert(pc().abilities.str === 17 && pc().abilities.con === 17, '预设数值生效（力17 体17）');
assert(pc().hp === pc().max_hp && pc().max_hp === 18, '生命值计算正确（12 + 体+3×2 = 18/18）');
assert(pc().gold === 10, '起始金币 10（佣兵）');
assert(pc().skills.filter((s) => s === '运动').length === 1, '职业/背景重复技能已去重');
assert(pc().gear.includes('长剑'), '预设行囊生效（长剑）');

await click('出发，前往歪脖子鸭酒馆');

// ── 酒馆 ──
p = w.document.querySelector('#passages .passage');
assert(p.textContent.includes('歪脖子鸭'), '进入酒馆');
assert(p.textContent.includes('10 枚金币'), '金币插值');
assert(!!w.document.querySelector('#passages .check-result'), '酒馆打听检定结果框渲染');
assert(links().some((a) => a.textContent.includes('金币：买一支火把')), '火把购买链接存在（表驱动价）');
assert(links().some((a) => a.textContent.includes('听老猎人讲实话')), '付费传闻链接存在（表驱动价）');

await click('推门出发，走进暮色');

// ── 森林边缘：检定结果框 ──
assert(w.SugarCube.State.passage === '森林边缘', '到达森林边缘');
const checkBox = w.document.querySelector('#passages .check-result');
assert(!!checkBox, '森林察觉检定结果框渲染');
const lc = w.SugarCube.State.variables.last_check;
assert(lc && lc.roll === 11 && lc.label === '察觉检定', '<<sitecheck>> 经 <<check>> 产出 $last_check');
const styleStory = w.document.querySelector('#style-story')?.textContent ?? '';
assert(styleStory.includes('LXGW WenKai') && styleStory.includes('@font-face'), '霞鹜文楷子集已内嵌（@font-face）');

// ── 洞穴：选择肢 + 旗标 ──
await click('打着火把，走进山脚的洞穴');
assert(w.SugarCube.State.passage === '洞穴', '进入洞穴');
assert(links().length >= 3, `洞穴选择肢 ≥3（实际 ${links().length}）`);
await click('买条路过去');
assert(w.SugarCube.State.variables.pc.world.goblin_spared === true, '买路 → 世界旗标 goblin_spared');
assert(pc().gold === 7, `买路扣 3 金（恐吓熟练折扣，10→7；实际 ${pc().gold}）`);
assert(w.SugarCube.State.passage === '森林边缘', '买路后回到森林边缘');

// ── 侧栏：常驻存档入口 + 物品栏（v16 §5.0）──
// jsdom 不派发 :uiupdate（UI 栏在真实浏览器里才刷新），故直接渲染该段做单元检查。
const capFrag = w.document.createDocumentFragment();
new w.SugarCube.Wikifier(capFrag, w.document.querySelector('tw-passagedata[name="StoryCaption"]').textContent);
const capText = capFrag.textContent;
assert(capText.includes('快速存档') && capText.includes('快速读档') && capText.includes('存档 / 读档'), '侧栏常驻存档入口渲染');
assert(capText.includes('物品栏'), '侧栏物品栏渲染');
assert(capText.includes('无名旅人') && capText.includes('铁卫'), '侧栏角色卡渲染');
assert(!capText.includes('信物'), '侧栏不再出现「信物」口径');
assert(typeof w.sgQuickSave === 'function' && typeof w.sgQuickLoad === 'function' && typeof w.sgSaveMenu === 'function', '常驻存档全局函数已挂载');
// 存档位扩充 + 现代存档 API（Save.slots 已废弃 → Save.browser.slot）
assert(w.SugarCube.Config.saves.maxSlotSaves === 16, `存档位 16（默认 8；实际上限 ${w.SugarCube.Save.MAX_INDEX + 1}）`);
assert(w.SugarCube.Config.saves.maxSlotSaves <= w.SugarCube.Save.MAX_INDEX + 1, '存档位不越界');
w.sgQuickSave();
assert(w.SugarCube.Save.browser.slot.has(1) === true, '快速存档写入槽位（Save.browser.slot）');
assert(w.SugarCube.Save.browser.slot.size >= 1, '存档数 ≥1');

// ── 物品栏宏：给一件 → 侧栏列出 ──
new w.SugarCube.Wikifier(null, '<<give "日记">>');
const capFrag2 = w.document.createDocumentFragment();
new w.SugarCube.Wikifier(capFrag2, w.document.querySelector('tw-passagedata[name="StoryCaption"]').textContent);
assert(capFrag2.textContent.includes('日记'), '获得道具后侧栏物品栏列出（日记）');
assert(w.Pc.has('日记'), 'Pc.has 判定物品在栏');

assert(pageErrors.length === 0, `页面无运行时错误${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`);
console.log(process.exitCode ? '\n冒烟测试失败' : '\n冒烟测试全部通过');
process.exit(process.exitCode ?? 0);
