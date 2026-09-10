// L1 全段落渲染冒烟：jsdom 启动一次 → 程序化完成车卡（真实角色状态）→ 快照；
// 逐段落 Engine.play（含 $era 双变体），断言：
//   · 渲染确实发生（State.passage 变化——防 no-op 假绿，Engine.show 曾无声失败）
//   · 无 uncaught 异常 · 无 .error 渲染元素 · 输出非空
// 渲染期自动跳转（检定失败→死亡等）记为 forward 信息不算失败，但错误/空输出仍算。
import { boot, CLICKABLE_SEL } from './boot.mjs';

// 白盒 A9：共享 boot（d20 恒 11：中性、无自然 20/1；uncaught 监听内置）
const { w, uncaught, sleep } = await boot({ random: 0.5 });

// ── 构造"车卡后"角色状态（裸 StoryInit 状态检定必败→连锁死亡 goto，不具代表性）──
const byLabel = (t) => [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent === t);
const step = async (label) => { const a = byLabel(label); if (!a) throw new Error(`车卡引导失败：找不到「${label}」`); a.click(); await sleep(300); };
await step('踏上旅途');
await step('快速成型'); // 第一张预设（铁卫）——随机中性，任何预设都构成合法角色
await step('出发，前往歪脖子鸭酒馆');
if (typeof w.SugarCube.State.variables.pc?.abilities?.str !== 'number') throw new Error('车卡后状态不完整（abilities 缺失）——L1 快照不可用');

// 快照：完整角色 + 世界默认旗标；每次 play 前整备还原。
// ⚠ State.variables 是 getter-only（descriptor 无 writable）：整体赋值是静默 no-op（坑12，
// 曾让本文件的"状态重置"失效——era 变体碰巧靠属性赋值生效才全绿）。
// 必须逐键 delete + Object.assign 到活对象上。
const snapshot = JSON.stringify(w.SugarCube.State.variables);
const restore = (era) => {
	w.eval(`(function(){const v=SugarCube.State.variables;for(const k of Object.keys(v))delete v[k];Object.assign(v,${snapshot});${era ? `v.era=${JSON.stringify(era)};` : ''}})()`);
};

// 内容段落全集（跳过基础设施：script/widget/stylesheet 段与 Story 元数据）
const all = [...w.document.querySelectorAll('tw-passagedata')].map((el) => ({
	name: el.getAttribute('name'),
	tags: (el.getAttribute('tags') ?? '').trim().split(/\s+/).filter(Boolean),
	src: el.textContent,
}));
const isInfra = (p) => p.name.startsWith('Story') || p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
const content = all.filter((p) => !isInfra(p) && p.name);

const linkMap = new Map();
let fails = 0, renders = 0;
const covered = [], forwards = [];
// 注意：连续两个段落都自动跳转到同一目标时，「上一次渲染后的 State.passage」会与本次相同
//（如 龙·战 → 结局 死亡，紧接着 龙·再冲 → 结局 死亡）——用「上一次显式 play 的段落」判定，
//避免把合法 forward 误判成 no-op。真正的 no-op（play 静默失败）仍由「输出为空」兜住。
let lastPlayed = w.SugarCube.State.passage;
for (const p of content) {
	// 引用 $era 的段落渲染双时代变体（覆盖 (段落|时代) 状态格——对抗席盲区实测点）
	const variants = p.src.includes('$era') ? [null, 'past'] : [null];
	for (const era of variants) {
		const before = uncaught.length;
		const prevPassage = lastPlayed;
		lastPlayed = p.name;
		restore(era);
		w.SugarCube.Engine.play(p.name);
		await sleep(80);
		renders++;
		const shown = w.SugarCube.State.passage;
		covered.push(`${p.name}|${era ?? w.SugarCube.State.variables.era}`);
		const problems = [];
		if (shown === prevPassage && shown !== p.name) problems.push('play() no-op（段落未实际渲染）');
		if (shown !== p.name) forwards.push(`${p.name} → ${shown}`); // 渲染期自动跳转（合法）
		const errs = w.document.querySelectorAll('#passages .error').length;
		const out = (w.document.querySelector('#passages')?.textContent ?? '').trim();
		// 断链门（#168 P1-1）：标签里嵌引号这类写法会让 SugarCube 把整段宏体当成"跳到不存在的段落"，
		// 渲染成 .link-broken。源码层完全看不出来（L0 只查悬空引用/裸 goto），只有这一步能抓。
		const broken = [...w.document.querySelectorAll('#passages a.link-broken')]
			.map((a) => `${a.getAttribute('data-passage') ?? '?'}（${a.textContent.slice(0, 20)}）`);
		if (broken.length) problems.push(`${broken.length} 条断链（link-broken）：${broken.join(' | ')}`);
		// 裸标记门（#168 P1-2）：畸形闭合标记（<</<</if>>）会在屏上漏出字面 `<` / `<</`
		if (out.includes('<')) {
			const at = out.indexOf('<');
			problems.push(`渲染文本里有裸标记：${JSON.stringify(out.slice(Math.max(0, at - 20), at + 20))}`);
		}
		// 链接清单（#168 机检⑩）：把"这一段渲染出来的可点元素"落盘，交给 coverage.mjs 的链接级覆盖门
		// 对账——按"段落|时代"记格的老口径看不见"同段里有一条链接从没被点过"（P1-1 / P1-29 都这么漏）。
		linkMap.set(`${p.name}|${era ?? w.SugarCube.State.variables.era}`, [...new Set([...w.document.querySelectorAll(`#passages ${CLICKABLE_SEL}`)].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))]);
		if (uncaught.length > before) problems.push(`uncaught: ${uncaught[before].slice(0, 120)}`);
		if (errs > 0) { const t = [...w.document.querySelectorAll('#passages .error')].map((e) => e.textContent.slice(0, 80)).join(' | '); problems.push(`${errs} 个 .error：${t}`); }
		if (!out) problems.push('输出为空');
		if (problems.length) {
			fails++;
			console.log(`✗ ${p.name}${era ? `(${era})` : ''} → ${problems.join('；')}`);
		}
	}
}
// 覆盖落盘（L3 消费）
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('build', { recursive: true });
writeFileSync('build/coverage-render.json', JSON.stringify({ cells: [...new Set(covered)] }, null, 1));
writeFileSync('build/coverage-links.json', JSON.stringify({ links: Object.fromEntries([...linkMap].sort((a, b) => a[0].localeCompare(b[0]))) }, null, 1));

console.log(`\n渲染 ${renders} 次（${content.length} 内容段落 × era 变体）· 覆盖 ${new Set(covered).size} 格 · 自动跳转 ${forwards.length} 次${forwards.length ? '（' + [...new Set(forwards)].join('，') + '）' : ''}`);
if (fails) { console.error(`✗ ${fails} 处渲染失败`); process.exit(1); }
console.log('✔ 全段落渲染冒烟通过');
process.exit(0);
