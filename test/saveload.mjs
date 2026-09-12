// #300 §5 行为门（测试基建）：**就地行动 → 立即存读档 → 状态保值**
//
// 为什么需要这张门：P1（门厅/花田原地取物后立即 S/L 丢进度）能长期存在，是因为
//   · test/saveui.mjs 只做 Pc.migrate＋渲染，从不调用真实保存/加载；
//   · 浏览器用例在「操作后」就停，从不按 S/L。
// 于是「操作后状态」与「存档快照」之间的一致性从来没被断言过（#300 §4）。
//
// 本门对 test/saveload-sites.json 里每个站点跑：
//   导航到站点 → 就地操作 → 快照 → sgQuickSave() → sgLoadSlot(1) → 快照 → 逐项比对
// 断言项取登记表里的 assert（物品/旗标/HP/金币/检定记录），另加「不得重复发物」。
//
// **当前状态：本门在 #300 修复前应当是红的**——那是缺陷基线证据，不是测试写错。
// 接入 npm test 的时机＝#300 修复合入的 PR（届时本门由「证据」转「硬红」）。
// 站点清单由 test/saveload-inventory.mjs（静态门）保证不漏登记。

import { readFileSync } from 'node:fs';
import { boot, CLICKABLE_SEL } from './boot.mjs';

const MANIFEST = JSON.parse(readFileSync(new URL('./saveload-sites.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newGame(randomStub) {
	const { w, settle } = await boot({ random: () => randomStub });
	const find = (label) => {
		const cur = [...w.document.querySelectorAll('#passages .passage')].find((e) => e.dataset.passage === w.SugarCube.State.passage);
		const pool = cur ? [cur] : [...w.document.querySelectorAll('#passages')];
		const links = pool.flatMap((el) => [...el.querySelectorAll(CLICKABLE_SEL)]);
		return links.find((x) => x.textContent === label) ?? links.find((x) => x.textContent.includes(label));
	};
	const click = async (label) => {
		await settle();
		let a = find(label);
		for (let i = 0; i < 20 && !a; i++) { await sleep(100); await settle(); a = find(label); }
		if (!a) {
			const avail = [...w.document.querySelectorAll(CLICKABLE_SEL)].map((x) => x.textContent.replace(/\s+/g, '')).join(' / ');
			throw new Error(`找不到「${label}」@ ${w.SugarCube.State.passage}（可选：${avail}）`);
		}
		a.click(); await settle(); await sleep(120);
	};
	await click('踏上旅途');
	await click('快速成型');
	await click('出发，前往歪脖子鸭酒馆');
	return { w, click, settle };
}

// ── 导航到各站点（与 #300 复现路径一致）──────────────────────────────
const NAV = {
	async 'hall-direct'(c) { await toHall(c); },
	async 'hall-observe'(c) { await toHall(c); },
	async 'hall-observed'(c) { await toHall(c); await c('先看清钉子是怎么卡的'); },
	async flower(c) {
		await c('问一句女巫小屋怎么走');
		await c('往林子深处走');
		await c('继续往塔那边走');
		await c('塔基墙根那片花');
	},
};
async function toHall(c) {
	await c('问一句女巫小屋怎么走');
	await c('往林子深处走');
	await c('继续往塔那边走');
	await c('雾里有个影子挡着路');
	await c('慢慢放下手');
	await c('顺着那条窄路走过去');
	await c('收下钥匙');
}

// ── 快照与比对 ──────────────────────────────────────────────────────
const snapshot = (w) => {
	const pc = w.SugarCube.State.variables.pc;
	return {
		inv: JSON.stringify(Object.keys(pc.inv ?? {}).sort()),
		ev: JSON.stringify(Object.keys(pc.ev ?? {}).sort()),
		world: JSON.stringify(Object.keys(pc.world ?? {}).sort()),
		hp: pc.hp, gold: pc.gold,
		last_roll: pc.ev?.last_roll?.site ?? null,
	};
};
const FIELD = {
	inv: (s) => `物品 ${s.inv}`, ev: (s) => `旗标 ${s.ev}`, world: (s) => `世界态 ${s.world}`,
	hp: (s) => `HP ${s.hp}`, gold: (s) => `金币 ${s.gold}`, last_roll: (s) => `检定记录 ${s.last_roll ?? '（无）'}`,
};
const SET_FIELDS = new Set(['inv', 'ev', 'world']);
// 集合类字段只报**差集**（丢什么/多什么），整表刷屏看不清真正的证据
const delta = (aStr, bStr) => {
	const A = new Set(JSON.parse(aStr)), B = new Set(JSON.parse(bStr));
	const lost = [...A].filter((x) => !B.has(x));
	const gained = [...B].filter((x) => !A.has(x));
	return `丢 [${lost.join(', ') || '—'}]${gained.length ? ` ｜ 多 [${gained.join(', ')}]` : ''}`;
};

let failures = 0;
const rows = [];
for (const site of MANIFEST.sites) {
	const { w, click, settle } = await newGame(0.99);   // d20 恒 20：就地操作必成，排除「检定失败」干扰
	try {
		await NAV[site.nav](click);
		const beforeAction = snapshot(w);
		await click(site.label);
		const afterAction = snapshot(w);
		const acted = JSON.stringify(afterAction) !== JSON.stringify(beforeAction);
		w.sgQuickSave();
		await sleep(200);
		const p = w.sgLoadSlot(1);
		if (p?.then) await p.catch(() => {});
		await settle(); await sleep(400);
		const afterLoad = snapshot(w);
		const fields = [...(site.assert ?? []), 'last_roll'];
		const lost = fields.filter((f) => afterAction[f] !== afterLoad[f]);
		const dup = (() => {
			try { return JSON.parse(afterLoad.inv).length > JSON.parse(afterAction.inv).length; } catch { return false; }
		})();
		const ok = acted && lost.length === 0 && !dup;
		if (!ok) failures++;
		rows.push({ site, ok, acted, lost, dup, afterAction, afterLoad });
	} catch (e) {
		failures++;
		rows.push({ site, ok: false, error: e.message });
	}
}

for (const r of rows) {
	const tag = r.ok ? '✓' : '✗';
	console.log(`${tag} ${r.site.where}｜「${r.site.label.replace(/（[^）]*）/g, '')}…」${r.site.ticket}`);
	if (r.error) { console.log(`    导航/操作失败：${r.error}`); continue; }
	if (!r.acted) console.log('    ⚠ 就地操作没有改变任何被观测状态——站点定位可能已漂移（门本身需要校准）');
	for (const f of r.lost) {
		const like = SET_FIELDS.has(f)
			? delta(r.afterAction[f], r.afterLoad[f])
			: `${FIELD[f]?.(r.afterAction) ?? f} → ${FIELD[f]?.(r.afterLoad) ?? '（空）'}`;
		console.log(`    丢 ${f}：${like}`);
	}
	if (r.dup) console.log('    ✗ S/L 后物品变多（重复发放）');
}

console.log(`\n就地行动站点 ${rows.length} 个：${rows.filter((r) => r.ok).length} 保值 / ${failures} 不保值`);
if (failures) {
	console.error('✗ 存读档一致性门未通过（#300 P1：就地行动后的状态没有进入存档快照）');
	console.error('  说明：本门在 #300 修复合入前**应当是红的**——它是缺陷基线证据，不是测试写错。');
	process.exit(1);
}
console.log('✔ 就地行动 → 立即 S/L：物品/旗标/HP/金币/检定记录全部保值');
