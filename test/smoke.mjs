// 无头冒烟测试（jsdom，M1a-2 换骨后）：启动 → 快速车卡 → 酒馆 → 森林边缘 → 洞穴 + 侧栏/存档/物品栏
import { boot } from './boot.mjs';
import { makeSession } from './harness.mjs';   // #317①：公共 harness（不再自建 links/click/pc）

const pageErrors = [];
const { w, sleep, settle } = await boot({ random: 0.5 });
w.addEventListener('error', (...a) => pageErrors.push(String(a[0]).slice(0, 200)));

const assert = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) process.exitCode = 1;
};
// #317①：这几行原本是本文件自建的一套；现在由 harness 提供（scope=any + 350ms 保持原行为）
const { links, clickByLabel: click, pc } = makeSession(w, { settle, sleep, scope: 'any', wait: 350 });

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
// M9：打听是动作——检定不再自动发生，先问，才掷骰
assert(!w.document.querySelector('#passages .check-result'), 'M9：进酒馆不再自动掷打听检定');
// B2：打听入口升级为「交涉面板」——同一句诉求列出多种开口方式（换手段＝换属性判定）
assert(links().some((a) => a.textContent.includes('把话说圆：游说')), 'B2：交涉面板渲染（游说开口）');
assert(links().some((a) => a.textContent.includes('先看他手里攥着什么：洞悉')), 'B2：同诉求的第二条路走别的属性（洞悉）');
assert(links().some((a) => a.textContent.includes('亮一亮手里的家伙：恐吓')), 'B2：第三条路（恐吓，代价不同）');
assert(links().some((a) => a.textContent.includes('拿出筹码：请她喝一轮')), 'B2：筹码（把对方想要的摆出来＝不必掷骰）');
assert(p.textContent.includes('冷淡 → DC12'), 'B2：面板标出态度与 DC');
assert(links().length >= 12, `酒馆打听 hub 臂数 ≥12（实际 ${links().length}）`);
assert(!w.document.querySelector('#passages .link-broken'), '酒馆传闻选项没有错误目标');
// #180：三区分区——行动分组与已读折叠
assert(w.document.querySelector('#passages .tavern-actions'), '酒馆行动区容器存在');
assert(w.document.querySelectorAll('#passages .act-group').length === 3, '酒馆动作分为三组');
const tavFold = w.document.querySelector('#passages .heard-fold');
assert(tavFold && !tavFold.open, '已听传闻默认收起');
assert(w.document.querySelector('#passages .act-group .act-n').textContent !== '', '分组条数角标已渲染');
await click('接嘴的那个人');
assert(pc().ev.tav_ageless === true && w.SugarCube.State.passage === '酒馆', '不老女人传闻显示完整，点击后留在酒馆并记账');
// #179 复发修复（#180 三区补全）：本次回答搬进紧贴行动区的槽位，场景内阅读方向恒向下
const FOLLOWING = w.Node.DOCUMENT_POSITION_FOLLOWING;
let fresh = w.document.querySelector('.fresh-heard');
assert(fresh && !fresh.hidden, '本次回答槽存在且已亮出');
assert(fresh.textContent.includes('前年我上山'), '不老女人传闻内容显示在本次回答槽');
// #304 口径（断言与渲染路径解耦）：**信息可见**用「文本在屏」验（上面两条已覆盖：槽存在/未隐藏/含本次内容），
// **键盘可续**用「焦点落在 #passages 内」验——保留 #185 的键盘可达要求，但不再绑定「焦点落在哪个元素」。
// 旧写法绑 `.fresh-heard` / `[data-heard=…]`：共用层一调反馈目标就假红（#304 flake 实证），且它挡不住真回归。
// 真正的契约在实现侧：焦点掉到 body 时把焦点**收回 `#passages` 内**的反馈元素（80-script 的 MutationObserver）。
const focusInPassages = () => !!w.document.activeElement?.closest('#passages');
assert(focusInPassages(), '同页提问后焦点仍在正文区（键盘可续，#304 口径）');
assert(fresh.compareDocumentPosition(w.document.querySelector('.tavern-actions')) & FOLLOWING, '本次回答槽在行动区之前（读完就是选项）');
assert(links().filter((a) => fresh.compareDocumentPosition(a) & FOLLOWING).length >= 5, '本次回答之后还有可点选项——阅读方向向下，不回头向上找');
assert(!w.document.querySelector('.heard-fold') || w.document.querySelector('.heard-fold').hidden, '首次打听后记录区为空，整块隐藏不留空壳');
await click('跑生意的');   // 逆序问一桌
assert(w.SugarCube.State.variables.pc.ev.tav_grudge === true, '问过的那桌记账（tav_grudge）');
fresh = w.document.querySelector('.fresh-heard');
assert(fresh.textContent.includes('雾是它谢下来的') && !fresh.textContent.includes('前年我上山'), '本次回答槽只留最新一条');
assert(focusInPassages(), '逆序提问后焦点仍在正文区（键盘可续，#304 口径）');
const tavFold2 = w.document.querySelector('.heard-fold');
assert(tavFold2 && !tavFold2.hidden && tavFold2.textContent.includes('前年我上山'), '上一条回到已读折叠归档');
assert(links().filter((a) => fresh.compareDocumentPosition(a) & FOLLOWING).length >= 5, '逆序提问后剩余选项仍在回答之后（方向不回头）');
// #179 全场景原则「推进剧情的选项在最后」：折叠区整体在行动区之上——翻完旧账往下读就是出口
assert(tavFold2.compareDocumentPosition(fresh) & FOLLOWING, '已读折叠在「本次回答」之前（翻旧账向下读完就是选项）');
assert(tavFold2.compareDocumentPosition(w.document.querySelector('.tavern-actions')) & FOLLOWING, '已读折叠在行动区之前（展开态出口仍在最后）');
tavFold2.open = true;   // 最坏展开态：折叠区最后一段之后必须还有可点出口
const lastHeard = [...tavFold2.querySelectorAll('p')].pop();
assert(links().filter((a) => lastHeard.compareDocumentPosition(a) & FOLLOWING).length >= 3, '展开折叠读到底，其后仍有出口（不回头向上找）');
assert(links().some((a) => a.textContent.includes('金币：买一支火把')), '火把购买链接存在（表驱动价）');
assert(links().some((a) => a.textContent.includes('请他讲讲洞里的路')), '付费传闻链接存在（表驱动价）');
await click('离店前，去井台打点水');   // #217：灯的传闻散布到井台
assert(w.SugarCube.State.variables.pc.ev.tav_light === true, '井台的灯传闻记账（tav_light）');
assert(w.document.querySelector('#passages').textContent.includes('三百年了，那灯没灭过'), '井台的灯传闻渲染');
await click('回酒馆');

await click('推门出发，走进暮色');

// ── 森林边缘：检定结果框 ──
assert(w.SugarCube.State.passage === '森林边缘', '到达森林边缘');
assert(!w.document.querySelector('#passages .action-feedback'), '换场景不沿用上一页反馈目标');
assert(!w.document.querySelector('#passages .check-result'), 'M9：森林边缘不再自动掷察觉');
await click('在雾里站住，听一听');            // 玩家的动作
// #361：动作后的骰面可能由**结果槽**承载（#300 P2「同一颗骰不显示两遍」）——
// 历史块改用 lastcheckFor 后，当场那一掷在槽里显示，不再另起一个 .check-result
const checkBox = w.document.querySelector('#passages .check-result') ?? w.document.querySelector('#passages .scene-feedback');
assert(!!checkBox, '玩家发起后：森林察觉检定结果框渲染（.check-result 或结果槽）');
assert(checkBox.textContent.includes('察觉'), '玩家发起后：骰面确实是这次察觉检定');
assert(checkBox.textContent.includes('察觉检定（感知）'), 'M10：判定标注了属性（察觉检定（感知））');
assert(checkBox.textContent.includes('感知') && checkBox.textContent.includes('DC10'), 'M10：显示计算过程（属性 + DC + 骰面）');
const lc = w.SugarCube.State.variables.last_check;
assert(lc && lc.roll === 11 && lc.label === '察觉检定（感知）' && lc.site === '森林·察觉', '<<sitecheck>> 经 <<check>> 产出 $last_check（含位点与属性标注）');
assert(w.SugarCube.State.variables.pc.ev.forest_heard === true, '听雾结果落旗标（forest_heard）');
const fontCss = w.document.querySelector('#font-face')?.textContent ?? '';
assert(fontCss.includes("'LXGW WenKai'") && fontCss.includes('fonts/LXGWWenKai-Regular.woff2') && fontCss.includes('font-display: swap'), '霞鹜文楷子集外链 dist/fonts（swap，非阻塞）');
assert(w.document.querySelectorAll('head link[rel="preload"][as="font"]').length === 2, '字体 preload ×2（与解析并行）');

// ── 洞穴：选择肢 + 旗标 ──
await click('走进山脚的洞穴');
assert(w.SugarCube.State.passage === '洞穴', '进入洞穴');
assert(links().length >= 3, `洞穴选择肢 ≥3（实际 ${links().length}）`);
await click('拿出筹码：把几枚金币放在石头上');
assert(w.SugarCube.State.variables.pc.world.goblin_spared === true, 'B2：买路筹码 → 世界旗标 goblin_spared（免检，不经掷骰）');
assert(pc().gold === 7, `买路扣 3 金（恐吓熟练折扣，10→7；实际 ${pc().gold}）`);
assert(w.document.querySelector('#passages').textContent.includes('让出半条路'), 'B2：筹码到账后才放行（结果文案在面板下方）');
await click('从它旁边过去');
assert(w.SugarCube.State.passage === '森林边缘', '买路后回到森林边缘');

// ── 经济闭环（#188）：金币不许为负——支付门 + 刷钱点一次性 ──
{
	const g = pc().gold;                                   // 买路后 7
	w.SugarCube.State.variables.pc.gold = 0;
	await w.SugarCube.Engine.play('酒馆'); await sleep(150);
	assert(!links().some((a) => a.textContent.includes('金币：请他讲讲洞里的路')), '金币 0：买传闻链接不亮（支付门）');
	assert(!links().some((a) => a.textContent.includes('金币：买一支火把')), '金币 0：买火把链接不亮（支付门）');
	assert(![...w.document.querySelectorAll('a.soc-opt')].some((a) => a.textContent.includes('请她喝一轮')), '金币 0：请她喝一轮筹码不亮（leverOpen 支付门）');
	await w.SugarCube.Engine.play('女巫小屋'); await sleep(150);
	assert(!links().some((a) => a.textContent.includes('金币：问塔里的门道')), '金币 0：问门道不亮（支付门）');
	w.SugarCube.State.variables.pc.gold = g;
	const g2 = pc().gold;                                  // 刷钱点一次性：龙·巢边 +10 只此一次
	await w.SugarCube.Engine.play('龙·巢边'); await sleep(150);
	const loot = links().find((a) => a.textContent.includes('从零碎里挑出几件值钱的'));
	assert(loot, '龙·巢边：挑零碎链接在');
	loot.click(); await sleep(200);
	assert(pc().gold === g2 + 10 && pc().world.hoard_looted === true, `识货 +10 一次性（${g2} → ${pc().gold}）`);
	assert(!links().some((a) => a.textContent.includes('从零碎里挑出几件值钱的')), '挑走后链接消失（不可重复刷）');
	w.SugarCube.State.variables.pc.world.goblin_spared = false;   // 哥布林遭遇一次性：战斗两分支都退场
	await w.SugarCube.Engine.play('洞穴'); await sleep(150);
	const fight = links().find((a) => a.textContent.includes('拔家伙'));
	assert(fight, '洞穴：哥布林遭遇在（未让路分支）');
	fight.click(); await sleep(250);
	assert(pc().world.goblin_gone === true, '战斗无论输赢哥布林都退场（goblin_gone）');
	await w.SugarCube.Engine.play('洞穴'); await sleep(150);
	assert(!links().some((a) => a.textContent.includes('拔家伙')), '退场后遭遇不可重复（不可刷 +3）');
	assert(links().some((a) => a.textContent.includes('从它旁边过去')), '退场后角落空置、仍可通行');
	w.SugarCube.State.variables.pc.world.goblin_spared = true;
	await w.SugarCube.Engine.play('森林边缘'); await sleep(150);
	assert(w.SugarCube.State.passage === '森林边缘', '经济闭环检查后回到森林边缘');
}

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
