// 位点优势单调律（`#1353` 乙组·从 `test/properties.mjs` **拆出**）。
//
// ★ 为什么单立：它需要**道具面**（`Items.effects` 的 `advSite`／`advSites`）＋**位点名** ⇒ 与 hp 面**不同族**
//   ⇒ 两半挤在一件里，一半缺面就整段红（实测：`m3-hp-e2e` 无 `Items` 面 ⇒ 这半必红 ✗）
//
// 跑法：SG_STORIES_DIR=test/fixtures/m3-items-adv-fixture/stories node test/locations-adv.mjs

import { boot } from './boot.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

const { w, uncaught: _uncaught, sleep } = await boot({ random: 0.5 });

// ── 位点优势单调律（原 `properties` F 段，`#1353` 乙组拆出；样本＝`m3-items-adv-fixture`）──
{
	const I = w.Game.Items;
	//注意：`#1004` B2b（**换样本**）：旧的位点/道具名单是**旧故事**的声明 → 按**面夹具**重钉；
	// **判据不动**（空手无优势 · 加件不撤销 · 未被任何效果授权的位点满配也不吃优势）。
	const sites = ['哨位·挥击', '记位·斩击', '别处·某位'];   // 夹具位点：前两处被道具授权，第三处**未被授权**（负控）
	const items = ['铜哨', '旧日记', '玻璃珠'];   // 前两件带 adv（单点／多点），第三件**不带**（负控）
	const invOf = (keys) => Object.fromEntries(keys.map((k) => [k, true]));
	let bad = 0, checked = 0;
	for (const s of sites) {
		if (I.advAt(s, {})) bad++; // 空手一律无优势
		for (let m = 0; m < (1 << items.length); m++) {
			const base = items.filter((_, i) => m & (1 << i));
			if (!I.advAt(s, invOf(base))) continue;
			checked++;
			for (const extra of items) if (!I.advAt(s, invOf([...base, extra]))) bad++;
		}
	}
	ok(bad === 0, `advAt 单调律：空手无优势 · 加件不撤销（已检查 ${checked} 个真值点）`);
	// 满配：夹具 `Items.effects` 里 `坏哨` 的 `advSite`（挥击）与其 `advSites`（龙·斩击）各自生效
	ok(I.advAt('哨位·挥击', invOf(items)) === true && I.advAt('记位·斩击', invOf(items)) === true, '满配：铜哨的 advSite / 旧日记的 advSites 各给对应位点优势');
	// 未被任何效果授权的位点（夹具 `森林·察觉`）→ 满配也不吃优势（原「彩蛋位点」判据的等价形态）
	ok(I.advAt('别处·某位', invOf(items)) === false, '未被效果授权的位点满配也不吃任何道具优势');
}

console.log(failures ? `\n${failures} 项失败` : '\n位点优势判据全部通过');
process.exit(failures ? 1 : 0);
