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

// 能假：故事声明**与引擎同名**的容器（取第一个派生到的命名空间），成员必须仍在
const [ns, members] = [...engineNs.entries()][0] ?? ['Checks', ['resolve']];
const seg = emitTables({ containers: { [ns]: { storyDeclared: 1 } } });

const run = () => {
	const ctx = { window: { Game: {} } };
	// ① 先播种**引擎成员**（模拟引擎件已跑过）
	ctx.window.Game[ns] = Object.fromEntries(members.map((m) => [m, () => {}]));
	vm.runInNewContext(seg, ctx);
	return ctx.window.Game[ns];
};
const after = run();
const kept = members.filter((m) => typeof after[m] === 'function');
t(`② 故事声明 \`Game.${ns}\` 之后，引擎成员**仍在**（派生到的 ${members.length} 个）`, kept.length === members.length);
t('③ 故事自己声明的键**也在**（合并而非替换）', after.storyDeclared === 1);
console.log(`    故事段：${seg.split('\n')[0]}${seg.includes('\n') ? ' …（逐容器合并）' : ''}`);

if (bad) { console.error(`✗ ns-merge：${bad} 格红`); process.exit(1); }
console.log('✓ ns-merge：全部通过');
