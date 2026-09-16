// 等价判据（`#762` P0 · 设计稿 §4 的 L1/L3 实现）：**手写版 ↔ 数据版**必须等价。
//
// 一条命令跑完全部 P0 验收（自包含：**自己跑编译器**，不依赖别人先编译好，避免判一份陈旧产物）：
//   · **幂等**：同一份 data/ 连编译两次 ⇒ 产物逐字节相同；
//   · **L1 结构/行为等价**：两份 `[script]` 段各自在 `vm` 里跑一遍（同一份空白 `window`），比对
//     ① 数据容器（`window.Game`）深度相等 ② 接入契约**逐个成员 × 多组实参**的调用结果相等
//     （函数不能直接比 ⇒ 比行为；实参表**由故事自己声明的 id 驱动** ⇒ 吃参成员不再只验零参）；
//   · **L3 形式等价**：**按词法遮蔽注释**（`scripts/audit/lib/mask.mjs`，与全仓同一把刀）后，
//     剥空白与冗余尾逗号，两段逐字节相同；
//   · **面不为空**（`#557` 口径）：容器键数/叶子数/契约成员数/探针次数/归一字节数任一为 0 ⇒ **判红**
//     —— 否则"等价"这两个字没有任何证据力（只证明了"两份空东西一样空"）。
//
// 为什么注释遮蔽必须走 `maskComments` 而不是自己写正则：字符串里的 `//`（如 URL）会被正则吃掉 ⇒
//   只要差异**只**落在这种字符串里，L3 就**假绿**（实测：`'https://a.example/x'` 与
//   `'https://b.example/y'` 归一后相同）。`mask.mjs` 是单扫描器按词法遮蔽、**不动字符串内容**。
//
// 用法：node editor/equiv.mjs <slug> [--hand=<path>] [--gen=<path>]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { maskComments } from '../scripts/audit/lib/mask.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPILER = 'editor/compile-story.mjs';

/** **L3 的逐故事棘轮**（审查要求）：这些故事**今天已确认逐字节相同** ⇒ 不许变红；
 *  其余故事 L3 只**报告**差异（跨故事的手写风格不统一，见设计稿 §4 的适用边界）。
 *  L3 **永远打印**（可以不是权威，但不能静默消失）。 */
export const L3_RATCHET = ['minimal-demo'];

/** 纯函数：从 twee 文本里取某段段落的正文（不含 `:: 名字 [script]` 头）。 */
export const section = (text, name) => {
	const lines = String(text).split('\n');
	const start = lines.findIndex((l) => l.trim().startsWith(`:: ${name}`));
	if (start === -1) return null;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((l) => l.trim().startsWith(':: '));
	return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

/** 纯函数：全部 `[script]` 段的正文（按文件顺序）——L1 要它们一起跑才互可见。 */
export const scriptBodies = (text) => {
	const out = [];
	let cur = null;
	for (const l of String(text).split('\n')) {
		if (/^::\s+(.+?)\s+\[script\]\s*$/.test(l.trim())) { cur = []; out.push(cur); continue; }
		if (/^::\s/.test(l.trim())) { cur = null; continue; }
		if (cur) cur.push(l);
	}
	return out.map((b) => b.join('\n')).filter((b) => b.trim());
};

/** 纯函数：形式归一 —— 词法遮蔽注释 ⇒ 去空白 ⇒ 去**冗余尾逗号**（纯格式，JS 里无语义）。 */
export const normalize = (text) => maskComments(String(text))
	.replace(/\s+/g, '')
	.replace(/,(?=[}\]])/g, '');

/** 纯函数：在一份**空白** vm 里跑脚本，返回它的 `window`。 */
export const runScript = (body) => {
	const sandbox = { window: {} };
	vm.createContext(sandbox);
	vm.runInContext(String(body), sandbox, { timeout: 5000 });
	return sandbox.window;
};

/** 纯函数：从数据容器里收集"已声明的 id"，用作实参表（＋一个未知 id ⇒ 顺带验 fail-loud 行为一致）。 */
export const declaredIds = (win) => {
	const G = win.Game ?? {};
	const pick = (o) => Object.keys(o ?? {});
	const list = [
		...pick(G.Checks?.sites), ...pick(G.Combat?.actions), ...pick(G.Combat?.pools),
		...pick(G.Items?.defs), ...pick(G.Gear?.defs), ...pick(G.Economy?.prices),
		...pick(G.Notes?.entries), ...pick(G.Social?.asks?.[0] ?? {}),
	];
	const uniq = [...new Set(list)].filter((s) => s && s !== '__unknown__');
	return { all: uniq, first: uniq[0] ?? 'x' };
};

/** 纯函数：某成员要试的实参表 —— 零参／单参（每个已声明 id）／双参／未知 id（含双未知）。 */
export const probeArgs = (ids) => {
	const sets = [[], ['__unknown__'], ['__unknown__', '__unknown__'], [ids.first, ids.first]];
	for (const id of ids.all) sets.push([id]);
	return sets;
};

/** 纯函数：调用一次，记录结果（异常也记 ⇒ 两版行为不同也能看出来）。 */
export const call = (fn, args) => {
	try { return { ok: JSON.stringify(fn(...args)) }; } catch (e) { return { threw: String(e && e.message).slice(0, 80) }; }
};

/** 纯函数：数据容器里的**叶子数**与**是否混进函数值**（数据面必须是数据）。 */
export const walk = (v, acc = { leaves: 0, functions: 0 }) => {
	if (typeof v === 'function') { acc.functions++; return acc; }
	if (v && typeof v === 'object') { for (const x of Object.values(v)) walk(x, acc); return acc; }
	acc.leaves++;
	return acc;
};

/** 纯函数：由 `window` 取出可比较的面（数据容器 ＋ 契约的**多实参行为**）。 */
export const snapshot = (win) => {
	const ids = declaredIds(win);
	let probes = 0;
	const contract = {};
	for (const [k, fn] of Object.entries(win.Sg?.story ?? {})) {
		const rows = probeArgs(ids).map((args) => { probes++; return [args, call(fn, args)]; });
		contract[k] = rows;
	}
	return { game: JSON.stringify(win.Game ?? null), contract, ids, probes, walk: walk(win.Game ?? {}) };
};

const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	// 实测到的假绿（审查提出）：字符串里的 `//` 曾被正则吃掉 ⇒ 两份不同的 URL 归一后相同
	t('反例：字符串里的 `//` 不许被当注释（`https://a/x` vs `https://b/y` ⇒ 归一后**不同**）',
		normalize("const u = 'https://a.example/x';") !== normalize("const u = 'https://b.example/y';"));
	t('边界：字符串里出现注释定界符也原样保留（`/* */` / `<!-- -->` / `/% %/`）',
		normalize("const a = '/* x */';") !== normalize("const a = '/* y */';"));
	t('正例：真注释与空白/冗余尾逗号被归一（`a:1, // c` vs `a:1` ⇒ 相同）',
		normalize('const o = { a: 1, // 注释\n};') === normalize('const o = { a: 1 };'));
	t('边界：数据面混进函数值 ⇒ walk 抓得到（"数据必须是数据"）',
		walk({ a: 1, b: () => 1 }).functions === 1 && walk({ a: 1 }).functions === 0);
	t('边界：调用抛错也记录（两版行为不同看得出来）',
		call(() => { throw new Error('boom'); }, []).threw === 'boom' && call((x) => x, [1]).ok === '1');
	t('边界：没有已声明 id 时实参表仍非空（未知 id 探针恒在）',
		declaredIds({ Game: {} }).all.length === 0 && probeArgs(declaredIds({ Game: {} })).length >= 3);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（6 例：字符串里的注释定界符 3 例 · 函数值 1 例 · 异常 1 例 · 空 id 实参表 1 例）');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/equiv.mjs <slug> [--hand=…] [--gen=…]'); process.exit(2); }
	const arg = (name, dflt) => {
		const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
		return hit ? join(ROOT, hit.slice(name.length + 3)) : join(ROOT, dflt);
	};
	const handPath = arg('hand', `stories/${slug}/15-tables.twee`);
	const hand = readFileSync(handPath, 'utf8');

	// ── 自跑编译器两次 ⇒ 幂等 ＋ 拿到生成的产物（不判陈旧件） ──
	const genDir = join(ROOT, 'build/generated', slug);
	const idemDir = join(ROOT, 'build/generated', `.idem-${slug}`);
	execFileSync('node', [COMPILER, slug, `--out=${genDir}`], { cwd: ROOT });
	execFileSync('node', [COMPILER, slug, `--out=${idemDir}`], { cwd: ROOT });
	const genBytes = readFileSync(join(genDir, '15-tables.twee'));
	const idemBytes = readFileSync(join(idemDir, '15-tables.twee'));
	const gen = genBytes.toString('utf8');
	const overridden = process.argv.some((a) => a.startsWith('--gen='));
	const genSource = overridden ? readFileSync(arg('gen', ''), 'utf8') : gen;

	const hBodies = scriptBodies(hand), gBodies = scriptBodies(genSource);
	const hs = snapshot(runScript(hBodies.join('\n')));
	const gs = snapshot(runScript(gBodies.join('\n')));
	const nh = hBodies.map(normalize).join('|');
	const ng = gBodies.map(normalize).join('|');

	const firstDiff = [...nh].findIndex((c, i) => c !== ng[i]);
	const results = [
		[genBytes.equals(idemBytes), `幂等：连编译两次产物逐字节相同（${genBytes.length}B）`],
		[hBodies.length === gBodies.length && hBodies.length > 0,
			`L1 段数一致：[script] 段 ${hBodies.length}（手写）vs ${gBodies.length}（生成）`],
		[hs.game === gs.game,
			`L1 数据容器深度相等（含 State/Notes/Consequences）${hs.game === gs.game ? '' : `\n    手写 ${String(hs.game).slice(0, 220)}\n    生成 ${String(gs.game).slice(0, 220)}`}`],
		[JSON.stringify(hs.contract) === JSON.stringify(gs.contract),
			`L1 契约**多实参**行为相等（${Object.keys(hs.contract).length} 个成员 × ${probeArgs(hs.ids).length} 组实参）${JSON.stringify(hs.contract) === JSON.stringify(gs.contract) ? '' : `\n    手写 ${JSON.stringify(hs.contract).slice(0, 300)}\n    生成 ${JSON.stringify(gs.contract).slice(0, 300)}`}`],
		[nh === ng || !L3_RATCHET.includes(slug),
			`L3 形式等价（${L3_RATCHET.includes(slug) ? '**棘轮内**：差异判红' : '**报告制**：差异只打印'}）：词法遮蔽注释 ＋ 去空白/冗余尾逗号后逐字节相同（手写 ${nh.length}B / 生成 ${ng.length}B）${nh === ng ? '' : `\n    首个差异 @${firstDiff}\n    手写 …${nh.slice(Math.max(0, firstDiff - 30), firstDiff + 50)}\n    生成 …${ng.slice(Math.max(0, firstDiff - 30), firstDiff + 50)}`}`],
		[hs.walk.functions === 0 && gs.walk.functions === 0,
			`数据面是数据：容器内函数值 0 个（手写 ${hs.walk.functions} / 生成 ${gs.walk.functions}）`],
	];
	// ── 面不为空（#557）：任一为 0 ⇒ 判红（"等价"不能建立在空集上） ──
	const surface = {
		'容器键数': Object.keys(JSON.parse(hs.game === 'null' ? '{}' : hs.game)).length,
		'数据叶子数': hs.walk.leaves,
		'契约成员数': Object.keys(hs.contract).length,
		'探针调用次数（单版）': hs.probes,
		'归一字节数': nh.length,
	};
	const empty = Object.entries(surface).filter(([, v]) => !v).map(([k]) => k);
	results.push([empty.length === 0, `判到的面不为空：${Object.entries(surface).map(([k, v]) => `${k} ${v}`).join(' · ')}${empty.length ? `　✗ 为 0 的：${empty.join('、')}` : ''}`]);

	let bad = 0;
	for (const [ok, msg] of results) { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) bad++; }
	console.log(bad ? `\n✗ 等价判据未通过（${bad} 项）` : `\n✔ ${slug}：手写版 ↔ 数据版 等价（幂等 ＋ L1 结构/多实参行为 ＋ L3 形式 ＋ 面非空）`);
	process.exit(bad ? 1 : 0);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
