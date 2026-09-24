// `#1296`：**故事侧容器不得静默吃掉引擎命名空间**。
// 现场：故事表段原本 emit 成 `window.Game = Object.assign(window.Game ?? {}, {Checks:{…}})` ——
//   **顶层浅合并，因此同名容器被整块替换**，因此引擎 sim 面整体失效（`Checks.resolve`／`Items.advAt`／
//   `Economy.priceOf`／`Gear.damageBonus`／`Codex.*` … 全 undefined）。
// 为什么长期没被发现：`#1265` 后**仓内零故事**，因此引擎自跑没有故事容器，因此链全绿；M1 那 5 条恰好不经这些面
//  ，因此**"故事跑得通、引擎面是死的"**。
// 本件判据（能假）：**故事声明某容器后，该命名空间的引擎成员仍在** —— 把 emit 产物放进 vm 里，
//   先播种引擎成员（＝引擎件做的 `Object.assign((window.Game.X ??= {}), {…})`），再跑故事段。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { emitTables } from '../editor/lib/core/emit.mjs';
import { allSourceFiles } from '../scripts/module-order.mjs';

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

// 引擎侧**真实存在的**命名空间成员（从引擎源码**派生**，不硬编 —— `#1187` 口径：少一支就会腐烂）
const engineNs = (() => {
	const out = new Map();
	for (const f of allSourceFiles(['src'])) {
		if (!f.endsWith('.twee')) continue;
		let src = '';
		try { src = readFileSync(f, 'utf8'); } catch { continue; }
		for (const m of src.matchAll(/Object\.assign\(\(window\.Game\.([A-Za-z_$][\w$]*) \?\?= \{\}\), \{([\s\S]*?)\n\}\);/g)) {
			const members = [...m[2].matchAll(/^\t([A-Za-z_$][\w$]*)\s*[:(]/gm)].map((x) => x[1]);
			out.set(m[1], [...new Set([...(out.get(m[1]) ?? []), ...members])]);
		}
	}
	return out;
})();

t('① 派生到引擎命名空间（≥5 个 —— 票面列的波及面）', engineNs.size >= 5);
console.log(`    派生到：${[...engineNs.entries()].map(([k, v]) => `${k}(${v.length})`).join(' ')}`);

// 能假：故事声明**与引擎同名**的容器 → 该命名空间的引擎成员必须**仍在**。
//   `#1299` 复审（写作者同提）：**必须 loop 全部派生到的命名空间** —— 只测第一个（`Gear`）等于
//   把"能假覆盖"缩到 1/8；而各命名空间的**成员数差很大**（`Social` 21／`Combat` 60 → 最容易漏的就是它们）。
const badNs = [];
let ownKeyOK = true;
for (const [ns, members] of engineNs) {
	const seg = emitTables({ containers: { [ns]: { storyDeclared: 1 } } });
	const ctx = { window: { Game: {} } };
	// 先播种**该命名空间的引擎成员**（模拟引擎件已跑过），再跑故事段
	ctx.window.Game[ns] = Object.fromEntries(members.map((m) => [m, () => {}]));
	vm.runInNewContext(seg, ctx);
	const after = ctx.window.Game[ns];
	const lost = members.filter((m) => typeof after[m] !== 'function');
	if (lost.length) badNs.push(`${ns}（丢 ${lost.length}/${members.length}：${lost.slice(0, 3).join('、')}）`);
	if (after.storyDeclared !== 1) ownKeyOK = false;
}
t(`② **每一个**派生到的命名空间（${engineNs.size} 个）在故事声明同名容器后引擎成员**仍在**`,
	badNs.length === 0);
if (badNs.length) console.error(`     ✗ 丢成员的命名空间：${badNs.join(' ｜ ')}`);
t('③ 故事自己声明的键**也在**（合并而非替换）', ownKeyOK);
console.log(`    覆盖：${[...engineNs.entries()].map(([k, v]) => `${k}(${v.length})`).join(' ')}`);

if (bad) { console.error(`✗ ns-merge：${bad} 格红`); process.exit(1); }
console.log('✓ ns-merge：全部通过');
