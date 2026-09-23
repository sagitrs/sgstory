// #300 §5 行为门（测试基建）：**就地行动 → 立即存读档 → 状态保值**
//
// 为什么需要这张门：P1（门厅/花田原地取物后立即 S/L 丢进度）能长期存在，是因为
// · test/saveui.mjs 只做 Game.Pc.migrate＋渲染，从不调用真实保存/加载；
// · 浏览器用例在「操作后」就停，从不按 S/L。
// 于是「操作后状态」与「存档快照」之间的一致性从来没被断言过（#300 §4）。
//
// 本门对 test/saveload-sites.json 里每个站点跑：
// 导航到站点 → 就地操作 → 快照 → Sg.save.quick() → Sg.save.load(1) → 快照 → 逐项比对
// 断言项取登记表里的 assert（物品/旗标/HP/金币/检定记录），另加「不得重复发物」。
//
// **当前状态：本门在 #300 修复前应当是红的**——那是缺陷基线证据，不是测试写错。
// 接入 npm test 的时机＝#300 修复合入的 PR（届时本门由「证据」转「硬红」）。
// 站点清单由 test/saveload-inventory.mjs（静态门）保证不漏登记。

import { renderedElsOf } from '../editor/lib/core/preview.mjs';   // `#761` 六片A：选择器只有一处
import { readFileSync } from 'node:fs';
import { boot, CLICKABLE_SEL } from './boot.mjs';
import { newGame as openGame } from './harness.mjs';   // #317①：公共 harness（不再自建 newGame/click）

const MANIFEST = JSON.parse(readFileSync(new URL('./saveload-sites.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newGame(randomStub) {
	// #317①：车卡与点击全走 test/harness.mjs（scope/wait 保持本脚本原有语义：当前段落、120ms）
	const s = await openGame({ random: randomStub, session: { wait: 120 } });
	return { w: s.w, click: s.clickByLabel, settle: s.settle };
}

// ⛔ **退役 ＋ 声明**（`#1004` B2b 复核席，按裁定 A：**剧情级 → 退役 ＋ 逐块声明**）：
// 这一段原是"**导航到各站点**"的五个 helper（`hall-direct`／`hall-observe`／`hall-observed`／`sealRound`／`flower`）
// ＋ `toSealRound()`／`toHall()` 两条长路线 —— 它们走的全是**已删故事 `mist-forest` 的具体路线与文案**
//（`问一句女巫小屋怎么走` → `往林子深处走` → `继续往塔那边走` → `塔基墙根那片花` / `雾里有个影子挡着路`）。
//注意：面夹具按裁定 (甲) **沿用段名、正文与分支全为新写** → 这些**路线**没有对应物（不是"判据坏了"）。
//注意：**声明**：**「门厅/花田/封印战的复现路线」这一面自此无对象** → 将来若有样本提供同类站点 →
// 按其真实路线补回 helper 即可（下面的**机制**全部原样保留：`MANIFEST.sites` 驱动 ＋ 快照/比对 ＋
// "就地操作 → 立即 S/L → 逐项保值 ＋ 不得重复发物" —— 站点清单为空时该循环**零行**，即"无站点可测"**如实为空** 而不是假装通过）。
// ── 导航到各站点（`#1004` B2b：按**裁定 A** 重指到面夹具 —— 站点与旧故事**形状同款**：
// 都是在 `门厅`／`塔外花田` 里"就地改状态 ＋ `<<goto>>` 回本段"）─────────────────────
const NAV = {
	async whistle(c) { await c('门厅'); },        // 酒馆 → 门厅（站点标签由主循环点）
	async flower(c) { await c('塔外花田'); },      // 酒馆 → 塔外花田
};

// ── 快照与比对 ──────────────────────────────────────────────────────
const snapshot = (w) => {
	const pc = w.SugarCube.State.variables.pc;
	return {
		inv: JSON.stringify(Object.keys(pc.inv ?? {}).sort()),
		ev: JSON.stringify(Object.keys(pc.ev ?? {}).sort()),
		world: JSON.stringify(Object.keys(pc.world ?? {}).sort()),
		hp: pc.hp, gold: pc.gold,
		dragon_hp: pc.dragon?.hp ?? null,
		round: pc.ev?.fight?.round ?? null,
		fight_log: (w.document.querySelector('.fight-log')?.textContent ?? '').replace(/\s+/g, ' ').trim() || null,
		last_roll: pc.ev?.last_roll?.site ?? null,
	};
};
const FIELD = {
	inv: (s) => `物品 ${s.inv}`, ev: (s) => `旗标 ${s.ev}`, world: (s) => `世界态 ${s.world}`,
	hp: (s) => `HP ${s.hp}`, gold: (s) => `金币 ${s.gold}`,
	dragon_hp: (s) => `龙血 ${s.dragon_hp}`, round: (s) => `回合 ${s.round}`,
	fight_log: (s) => `战报「${s.fight_log ?? '（无）'}」`, last_roll: (s) => `检定记录 ${s.last_roll ?? '（无）'}`,
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
	// #350：战斗站点要用**变化**的随机序列——固定值会让「重掷」算出相同结果而看不见
	let seq = 0;
	const SEQ = [0.99, 0.99, 0.02, 0.02, 0.99, 0.02, 0.99, 0.02];
	const rnd = site.randomSequence ? () => SEQ[(seq++) % SEQ.length] : 0.99;
	const { w, click, settle } = await newGame(rnd);   // 默认 d20 恒 20：就地操作必成，排除「检定失败」干扰
	try {
		await NAV[site.nav](click, w);
		const beforeAction = snapshot(w);
		if (site.clickNthAction) {
			// 战斗牌是随机抽的，按序号点（第 N 张），比按标签稳
			const acts = [...w.document.querySelectorAll('#passages .acts a.link-internal')];
			const el = acts[site.clickNthAction - 1];
			if (!el) throw new Error(`战斗面板第 ${site.clickNthAction} 张牌不存在`);
			el.click(); await sleep(300);
		} else {
			await click(site.label);
		}
		const afterAction = snapshot(w);
		const acted = JSON.stringify(afterAction) !== JSON.stringify(beforeAction);
		w.Sg.save.quick();
		await sleep(200);
		const p = w.Sg.save.load(1);
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


// ── 战斗回合 · 读档重放（#350）────────────────────────────────────────
// 战斗结算 `<<fightresolve>>` 跑在**段落渲染期**（40-ch2:156 / 50-ch3:591）——读档会重渲染，
// 于是同一轮被**再结算一次**：骰面重掷、成败翻面、HP 被改写（#350 实测：d20(20) 大成功 → d20(1) 大失败，hp18→14）。
// 本用例刻意用**交替 RNG**：若用确定性 RNG，重放会得到同样结果，**看不出**这种「重放」缺陷。
// 现状：**#350 已修（#355 合入）**：结算从渲染期搬到点击时刻 → 本用例转**严格**（不再容忍）。
//
// 红证来源（诚实记录）：本用例在修复前**确实报红**（当时以「已知缺陷 #350（不判失败）」形式长期报告：
// `读档前 d20(20) 大成功 → 读档后 d20(1) 大失败`）。修复把结算搬进点击时刻并**删除了 `<<fightresolve>>`
// 这个 widget 本身**（现在 src 里已无该名字）→ 所以**一行回退无法复现**该缺陷，红证只能由这段历史提供。
// 为使「比较器确实有牙」当场可证，本文件带 `--selftest`：正常流程后**注入一次人为扰动**
//（落档后改 hp），断言比较器判红——即它确实能看见「读档前后状态漂移」。
{
	const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
	let pick = 0;
	const { w, settle } = await boot({ random: () => (pick++ % 2 ? 0.01 : 0.99) });
	const find = (label) => {
		const cur = [...renderedElsOf(w)].find((e) => e.dataset.passage === w.SugarCube.State.passage);
		const pool = cur ? [cur] : [...w.document.querySelectorAll('#passages')];
		const links = pool.flatMap((el) => [...el.querySelectorAll(CLICKABLE_SEL)]);
		return links.find((x) => x.textContent === label) ?? links.find((x) => x.textContent.includes(label));
	};
	const c = async (label) => {
		await settle();
		let a = find(label);
		for (let i = 0; i < 20 && !a; i++) { await sleep2(100); await settle(); a = find(label); }
		if (!a) throw new Error(`找不到「${label}」@ ${w.SugarCube.State.passage}`);
		a.click(); await settle(); await sleep2(140);
	};
	try {
		// `#1004` B2b：路线按**裁定 A** 重指到"**有这一面的样本**" —— 战斗面在**面夹具**
		//（`酒馆` → `洞穴` → `拔家伙` → `洞穴·战斗`（`<<fightbegin "雾影">>`）→ 与旧故事那条四跳长链等价
		// 的那一段：**进一场短战斗**）。注意：判据本身一个字没改（下面仍是"读档不得重放本轮"）。
		await c('踏上旅途'); await c('快速成型'); await c('出发，前往歪脖子鸭酒馆');
		await c('洞穴'); await c('拔家伙');
		await settle(); await sleep2(300);
		const acts = [...w.document.querySelectorAll(CLICKABLE_SEL)].filter((x) => !x.textContent.includes('设定集'));
		if (!acts.length) throw new Error('战斗段没有可点行动');
		await c(acts[0].textContent.replace(/\s+/g, '').slice(0, 10));
		await settle(); await sleep2(300);
		const pc = () => w.SugarCube.State.variables.pc;
		const snap = () => `${pc().ev.fight?.round}|${pc().hp}|${(w.document.querySelector('#passages').textContent.replace(/\s+/g, ' ').match(/d20\(\d+\)[^｜]{0,24}/) ?? [''])[0]}`;
		const before = snap();
		w.Sg.save.quick(); await sleep2(200);
		const pr = w.Sg.save.load(1); if (pr?.then) await pr.catch(() => {});
		await settle(); await sleep2(600);
		const after = snap();
		if (before === after) {
			console.log(`✓ 战斗回合 · 读档不重放：${before}`);
			if (process.argv.includes('--selftest')) {
				// 故障注入：人为扰动 → 比较器必须判红（证明它不是空判）
				w.eval('(function(){const pc=SugarCube.State.variables.pc; if(pc.ev.fight) pc.hp = (pc.hp ?? 1) - 1;})()');
				const perturbed = snap();
				if (perturbed === before) { failures++; console.log('✗ 自证失败：人为扰动后比较器仍判「未漂移」——本用例是空判'); }
				else console.log(`✓ 自证：注入扰动后比较器判红（${before} → ${perturbed}）`);
			}
		} else {
			failures++;
			console.log(`✗ 战斗回合 · 读档重放本轮：读档前「${before}」→ 读档后「${after}」`);
			console.log('    根因应回看：<<fightresolve>> 是否又跑回了**段落渲染期**（读档重渲染即重放本轮）');
		}
	} catch (e) {
		failures++;
		console.log(`✗ 战斗回合用例未能跑通：${e.message}`);
	}
}

// ── #533：S1/S2/S3 的**新状态**必须进存档快照（`gearHp` ／ `statuses` ／ `ev.fight.wave`）──────────
// 为什么单列一块：上面那张表只看 `inv`／`ev`／`hp`／`gold`／检定记录 → **看不见**这三个新字段，
// 于是「读档把耐久重置成满值／异常清空／波次清零」这类**静默修复**不会被任何断言抓到。
//
//注意：三条**实测**的 moment 事实（本块第一版就是被它坑掉的，写下来别再踩）：
// ① 直接改活对象（Node 侧或 `w.eval` 直写）**不进存档**；
// ② 经**宏**写（`<<set>>`／`<<run>>`，即游戏自己的路径）**且之后有过一次导航**（`<<goto>>`／`Engine.play`）
// → 保值（存档捕获的是**最后一次导航时刻**的状态——与 `fightact` 注释里的 `#350` 同一条语义）；
// ③ 宏写但**不导航** → 仍然丢。
{
	const { w, settle } = await newGame(0.99);
	const live = () => w.SugarCube.State.variables.pc;      // 每次现取：读档会换掉整个状态对象图
	const read = () => { const p = live(); return {
		gearHp: JSON.stringify(p.gearHp ?? {}),
		statuses: JSON.stringify(p.statuses ?? {}),
		wave: JSON.stringify(p.ev?.fight?.wave ?? null),
	}; };
	const label = { gearHp: '装备耐久（含损坏态 0）', statuses: '部位×异常', wave: '波次状态' };
	const write = (sets) => {
		w.eval(`new window.SugarCube.Wikifier(null, ${JSON.stringify(sets)})`);       // 走宏（＝游戏路径）
		w.eval('window.SugarCube.Engine.play(window.SugarCube.State.passage)');        // 导航一次 → 写进 moment
	};
	let bad533 = 0;
	const t = (okk, msg, extra = '') => { if (okk) console.log(`    ✓ ${msg}`); else { bad533++; failures++; console.log(`    ✗ ${msg}${extra ? '：' + extra : ''}`); } };
	try {
		await settle();
		// 造出"有内容"的三个状态：护具**已损坏**(0) ／ 异常在身 ／ 波次进行到第二批
		write('<<set $pc.gearHp to {"布衣": 0, "护胫": 2}>><<set $pc.statuses to {"手": {"流血": 2}}>><<set $pc.ev.fight to {"pool": "p1", "round": 2, "wave": {"encounter": "long", "idx": 2, "hits": 1, "rounds": 2}}>>');
		await settle(); await sleep(200);
		const saved = read();
		w.Sg.save.quick();
		await sleep(250);
		live().gearHp = {}; live().statuses = {}; live().ev.fight = { pool: 'p1', round: 2, wave: null };   // 改坏活状态
		const p = w.Sg.save.load(1);
		if (p?.then) await p.catch(() => {});
		await settle(); await sleep(400);
		const back = read();
		const lost = Object.keys(saved).filter((k) => saved[k] !== back[k]);
		console.log(`\n#533 新状态保值（gearHp ／ statuses ／ ev.fight.wave）：宏写 → 导航 → 存 → 改坏 → 读`);
		for (const k of lost) console.log(`    丢 ${k}（${label[k]}）：${saved[k]} → ${back[k]}`);
		t(lost.length === 0, '三个新状态都进存档快照', lost.join(' / '));
		t(JSON.parse(back.gearHp)?.布衣 === 0, '损坏态保留为 **0**（不是缺项、不是满值）', back.gearHp);
		// 判据自证（反例）：把**损坏态**改成"满耐久"（最典型的静默修复）→ 判据必须报
		const bait = { ...back, gearHp: JSON.stringify({ 布衣: 3, 护胫: 2 }) };
		t(Object.keys(saved).some((k) => saved[k] !== bait[k]), '自证·反例：把 gearHp 重置成满耐久 ⇒ 判据会报');
		// 事实钉住（不是期望值）：**宏写但不导航** → 存档里没有它
		w.eval('new window.SugarCube.Wikifier(null, \'<<set $pc.ev.fight to {"pool":"p1","round":9,"wave":null}>>\')');
		w.Sg.save.quick();
		await sleep(250);
		const p2 = w.Sg.save.load(1);
		if (p2?.then) await p2.catch(() => {});
		await settle(); await sleep(300);
		t(JSON.stringify(live().ev?.fight ?? null) !== JSON.stringify({ pool: 'p1', round: 9, wave: null }),
			'事实钉住：宏写但**不导航** ⇒ 不进存档（moment 语义；红了说明 moment 变了，要重估本票判定方式）', JSON.stringify(live().ev?.fight ?? null));
	} catch (e) {
		failures++;
		console.log(`\n✗ #533 新状态保值：用例异常 —— ${e.message}`);
	}
	console.log(bad533 ? '' : '');
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

console.log(`\n就地行动站点 ${rows.length} 个：${rows.filter((r) => r.ok).length} 保值 / ${failures} 不保值（含战斗回合读档重放）`);
if (failures) {
	console.error('✗ 存读档一致性门未通过（#300 P1：就地行动后的状态没有进入存档快照）');
	console.error('  说明：本门在 #300 修复合入前**应当是红的**——它是缺陷基线证据，不是测试写错。');
	process.exit(1);
}
console.log('✔ 就地行动 → 立即 S/L：物品/旗标/HP/金币/检定记录全部保值');
