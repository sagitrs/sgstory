// 等价判据（`#762` P0 · 设计稿 §4 的 L1/L3 实现）：**手写版 ↔ 数据版**必须等价。
//
// L1 结构等价：把两份文件里**全部 `[script]` 段**各自在 `vm` 里跑一遍（同一个空白 `window`），比对：
//   · 数据容器（`window.Game`，可 JSON 化）**深度相等**；
//   · 接入契约（`window.Sg.story.*`）**键集合相同**，且**逐个调用后返回值相等**（函数不能直接比 ⇒ 比行为）。
// L3 产物等价：剥掉注释与全部空白后，两段**逐字节相同**。
//
// 为什么不用"dist 逐字节"当主判据：手写版带大量解释性注释，注释归文档；
//   L1 兜语义、L3 兜形式，两者合起来已足够强（设计稿 §4 写明了理由）。
//
// 用法：node editor/equiv.mjs <slug> [--hand=<path>] [--gen=<path>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
	const lines = String(text).split('\n');
	let cur = null;
	for (const l of lines) {
		const m = /^::\s+(.+?)\s+\[script\]\s*$/.exec(l.trim());
		if (m) { cur = []; out.push(cur); continue; }
		if (/^::\s/.test(l.trim())) { cur = null; continue; }
		if (cur) cur.push(l);
	}
	return out.map((b) => b.join('\n')).filter((b) => b.trim());
};

/** 纯函数：剥注释（行注释与块注释）＋ 全部空白 —— 用于 L3 的形式比对。 */
export const normalize = (text) => String(text)
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/\/\/[^\n]*/g, '')
	.replace(/\s+/g, '')
	.replace(/,(?=[}\]])/g, '');   // 冗余尾逗号是**格式**（JS 里无语义）⇒ 一并归一，否则等于把排版写进 schema

/** 纯函数：在一份**空白** vm 里跑脚本，返回它的 `window`。 */
export const runScript = (body) => {
	const sandbox = { window: {} };
	vm.createContext(sandbox);
	vm.runInContext(String(body), sandbox, { timeout: 5000 });
	return sandbox.window;
};

/** 纯函数：把契约成员的返回值变成可比较的形状（函数不能 deepEqual ⇒ 比**行为**）。 */
const probe = (fn, args) => {
	try { return { ok: JSON.stringify(fn(...args)) }; } catch (e) { return { threw: String(e && e.message).slice(0, 60) }; }
};

/** 纯函数：由 `window` 取出可比较的面（数据容器 ＋ 契约行为）。 */
export const snapshot = (win) => ({
	game: JSON.stringify(win.Game ?? null),
	contract: Object.fromEntries(Object.entries(win.Sg?.story ?? {}).map(([k, fn]) => {
		const args = k === 'actionLabel' ? ['x'] : [];
		return [k, probe(fn, args)];
	})),
});

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/equiv.mjs <slug> [--hand=…] [--gen=…]'); process.exit(2); }
	const arg = (name, dflt) => {
		const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
		return hit ? join(ROOT, hit.slice(name.length + 3)) : join(ROOT, dflt);
	};
	const handPath = arg('hand', `stories/${slug}/15-tables.twee`);
	const genPath = arg('gen', `build/generated/${slug}/15-tables.twee`);
	const hand = readFileSync(handPath, 'utf8');
	const gen = readFileSync(genPath, 'utf8');

	const hBodies = scriptBodies(hand), gBodies = scriptBodies(gen);
	const hWin = runScript(hBodies.join('\n'));
	const gWin = runScript(gBodies.join('\n'));
	const hs = snapshot(hWin), gs = snapshot(gWin);

	const results = [
		[hBodies.length === gBodies.length && hBodies.length > 0,
			`L1 段数一致：[script] 段 ${hBodies.length} 个（手写）vs ${gBodies.length} 个（生成）`],
		[hs.game === gs.game,
			`L1 数据容器深度相等（含 State/Notes/Consequences）${hs.game === gs.game ? '' : `\n    手写 ${String(hs.game).slice(0, 220)}\n    生成 ${String(gs.game).slice(0, 220)}`}`],
		[Object.keys(hs.contract).length > 0 && JSON.stringify(hs.contract) === JSON.stringify(gs.contract),
			`L1 契约键集合 ＋ 逐个调用行为相等（${Object.keys(hs.contract).length} 个成员）${JSON.stringify(hs.contract) === JSON.stringify(gs.contract) ? '' : `\n    手写 ${JSON.stringify(hs.contract)}\n    生成 ${JSON.stringify(gs.contract)}`}`],
	];
	const nh = scriptBodies(hand).map(normalize).join('|');
	const ng = scriptBodies(gen).map(normalize).join('|');
	results.push([nh === ng,
		`L3 产物等价：剥注释与空白后逐字节相同（手写 ${nh.length}B / 生成 ${ng.length}B）${nh === ng ? '' : `\n    首个差异 @${[...nh].findIndex((c, i) => c !== ng[i])}\n    手写 …${nh.slice(Math.max(0, [...nh].findIndex((c, i) => c !== ng[i]) - 40), [...nh].findIndex((c, i) => c !== ng[i]) + 60)}\n    生成 …${ng.slice(Math.max(0, [...nh].findIndex((c, i) => c !== ng[i]) - 40), [...nh].findIndex((c, i) => c !== ng[i]) + 60)}`}`]);

	let bad = 0;
	for (const [ok, msg] of results) { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) bad++; }
	console.log(bad ? `\n✗ 等价判据未通过（${bad} 项）` : `\n✔ ${slug}：手写版 ↔ 数据版 等价（L1 结构/行为 ＋ L3 形式）`);
	process.exit(bad ? 1 : 0);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
