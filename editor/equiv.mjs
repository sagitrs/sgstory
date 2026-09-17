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
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { maskComments } from '../scripts/audit/lib/mask.mjs';
import { engineScripts } from './extract-story.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPILER = 'editor/compile-story.mjs';

/** L3 的**档位**：`hard`（默认，差异判红）／`report`（只打印）。
 *  **为什么用命令行而不是内建白名单**：降级必须**显式**写在调用处 ⇒ CI 计划里一眼看得见（K5「让步留痕」）；
 *  内建"某些故事默认放行"等于把让步藏进代码。L3 **永远打印**（可以不是权威，但不能静默消失）。 */
export const L3_MODES = ['hard', 'report'];

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
/** 求值一侧的脚本体，**失败也返回结果**（判据的红要讲人话，不许抛栈 ✗ —— 复核席实测：
 *  基线被改坏时 `equiv` 吐的是**崩溃栈**，看红的人会误判"是不是环境坏了"）。 */
export const evalSide = (body, label = '') => {
	try { return { win: runScript(body) }; }
	catch (e) { return { err: `${label}求值失败：${String(e?.message ?? e).slice(0, 140)}` }; }
};

export const runScript = (body) => {
	// **环境契约**（同一族坑的第三处）：故事段会直接读引擎常量（`window.Game.Era.PRESENT` 等）
	// ⇒ 沙箱必须**先跑引擎常量**（真加载顺序：`ORDER` 里引擎在前）。少了它，抽出来的/比对的两侧都会静默缺字段。
	const sandbox = { console: { log() {}, error() {} } };
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(engineScripts() + '\n' + String(body), sandbox, { timeout: 5000 });
	return sandbox.window;
};

/** 纯函数：从数据容器里收集"已声明的 id"，用作实参表（＋一个未知 id ⇒ 顺带验 fail-loud 行为一致）。 */
export const declaredIds = (win) => {
	const G = win.Game ?? {};
	const pick = (o) => Object.keys(o ?? {}).sort();   // **排序**：两侧容器键序可能不同（产物按桶分组发射）⇒ 不排会造**实参错位**的假红
	const list = [
		...pick(G.Checks?.sites), ...pick(G.Combat?.actions), ...pick(G.Combat?.pools),
		...pick(G.Items?.defs), ...pick(G.Gear?.defs), ...pick(G.Economy?.prices),
		...pick(G.Notes?.entries), ...pick(G.Social?.asks?.[0] ?? {}),
	];
	// `#787`：**契约自身内联数据里的键**也要进探针语料 —— 否则"查表成员读一个不存在的根"这类缺陷会**同假**
	//（两边都 `null`／`''` ⇒ 探测不到 ✗；实测：洞窟六个成员读 `window.MECH`（局部常量）时 L1 曾静默通过 ✗）。
	// 取法：把**零参**契约成员求值后深挖键（如 `mechanics()` ⇒ `kindLabels`／`caveRewards`／`chest.gold` 的键）。
	const deepKeys = (v, out = new Set(), depth = 0) => {
		if (depth > 4 || !v || typeof v !== 'object') return out;
		for (const [k, x] of Object.entries(v)) { if (typeof k === 'string' && k.length <= 40) out.add(k); deepKeys(x, out, depth + 1); }
		return out;
	};
	for (const [name, fn] of Object.entries(win.Sg?.story ?? {})) {
		if (typeof fn !== 'function' || fn.length > 0) continue;                 // 只碰零参成员（带参的求值不了）
		try { for (const k of deepKeys(fn())) list.push(k); } catch { /* 成员自身抛错由别的判据报 */ }
	}
	const uniq = [...new Set(list)].filter((s) => s && s !== '__unknown__');
	// **整体排序**：两侧容器键集相同、但**顺序可能不同**（产物按桶分组发射；尾部来自零参成员深挖键 ⇒ `Set` 插入序）
	// ⇒ 不排会出现"同一探针位两侧收到不同实参"的**假红**（实测：`checkSite` 报 42 处，而生成物代码与手写逐字等价 ✗）。
	uniq.sort();
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

/** 纯函数：**逐成员**比契约行为，返回人可读差异（"两版行为不同"这种话不许出现——要说清哪个成员、哪组实参）。 */
export const diffContract = (h, g, limit = 3) => {
	const out = [];
	for (const k of Object.keys(h)) {
		if (!(k in g)) { out.push(`成员 \`${k}\`：生成版**没有**该成员`); continue; }
		for (let i = 0; i < h[k].length; i++) {
			const a = JSON.stringify(h[k][i][0]), x = h[k][i][1], y = g[k][i]?.[1];
			if (JSON.stringify(x) === JSON.stringify(y)) continue;
			const show = (r) => (r && 'threw' in r ? `抛错「${r.threw}」` : String(r?.ok)).slice(0, 60);
			out.push(`成员 \`${k}\` 实参 ${a}：手写 ${show(x)} / 生成 ${show(y)}`);
		}
	}
	for (const k of Object.keys(g)) if (!(k in h)) out.push(`成员 \`${k}\`：手写版**没有**该成员`);
	return { n: out.length, text: out.slice(0, limit).join('\n    ') + (out.length > limit ? `\n    …共 ${out.length} 处` : '') };
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
	// 容器比较用**规范化 JSON**（对象键**排序**、数组保序）：键序不是数据，而产物是按**桶分组**发射的 ⇒
	// 直接 `JSON.stringify` 会因键序差异**假红**（同族于下面契约那条"判行为不判顺序"的教训）。数组顺序仍然判（那可能是语义）。
	const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
	return { game: JSON.stringify(canon(win.Game ?? null)), contract, ids, probes, walk: walk(win.Game ?? {}) };
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
	t('差异要说清**哪个成员／哪组实参**（不许只说"两版行为不同"）', (() => {
		const mk = (r) => ({ a: [[['x'], r]] });
		const d = diffContract(mk({ ok: '1' }), mk({ ok: '2' }));
		return d.n === 1 && d.text.includes('`a`') && d.text.includes('手写 1 / 生成 2');
	})());
	t('求值失败 ⇒ **干净判据**（不抛栈）：语法坏的输入返回 { err } 而不是异常', (() => {
		const r = evalSide('const x = ;', '测试侧');
		return !!r.err && !r.win && /求值失败/.test(r.err);
	})());
	t('边界：调用抛错也记录（两版行为不同看得出来）',
		call(() => { throw new Error('boom'); }, []).threw === 'boom' && call((x) => x, [1]).ok === '1');
	t('边界：没有已声明 id 时实参表仍非空（未知 id 探针恒在）',
		declaredIds({ Game: {} }).all.length === 0 && probeArgs(declaredIds({ Game: {} })).length >= 3);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（8 例：字符串里的注释定界符 3 例 · 函数值 1 例 · 异常 1 例 · 空 id 实参表 1 例）');
};

// ⚠️ **主模块守卫**（实测踩到）：这些脚本**同时是库**（`equiv` 被 `extract` 导入、`compile` 被 `equiv` 起子进程）。
// 没有守卫时，`import` 它们会**执行对端的 CLI**（实测：`node editor/extract-story.mjs --selftest` 打出的是
// `equiv` 的自证然后退出 ⇒ 自己的自证根本没跑）。守卫＝「只在被当脚本执行时才跑 CLI」。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

/** 浏览器语义的沙箱（`window` 就是全局对象 ⇒ `window.Sg = {}` 之后裸 `Sg` 也能解析）。 */
const sandboxOf = () => {
	// 同样先跑引擎常量（`Game.Era`/`Game.Damage` 是引擎政策，不是故事数据）
	const box = { console: { log() {}, error() {} }, Sg: {} };
	box.window = box;
	vm.createContext(box);
	vm.runInContext(engineScripts(), box, { timeout: 5000 });
	return box;
};

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/equiv.mjs <slug> [--rules] [--l3=hard|report] [--hand=…] [--gen=…]'); process.exit(2); }
	const argOf = (name, dflt) => { const h = process.argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(name.length + 3) : dflt; };
	const rulesMode = process.argv.includes('--rules');
	const l3Mode = argOf('l3', 'hard');
	if (!L3_MODES.includes(l3Mode)) { console.error(`✗ --l3 只接受 ${L3_MODES.join('|')}（实得 ${l3Mode}）`); process.exit(2); }
	const handPath = join(ROOT, argOf('hand', rulesMode ? `stories/${slug}/17-rules.twee` : `stories/${slug}/15-tables.twee`));
	const hand = readFileSync(handPath, 'utf8');

	// ── 自跑编译器两次 ⇒ 幂等 ＋ 拿到产物（不判陈旧件） ──
	const genDir = join(ROOT, 'build/generated', slug);
	const idemDir = join(ROOT, 'build/generated', `.idem-${slug}`);
	execFileSync('node', [COMPILER, slug, `--out=${genDir}`], { cwd: ROOT });
	execFileSync('node', [COMPILER, slug, `--out=${idemDir}`], { cwd: ROOT });
	const names = [...new Set([...readdirSync(genDir), ...readdirSync(idemDir)])].sort();
	const idemOk = names.length > 0 && names.every((n) => readFileSync(join(genDir, n)).equals(readFileSync(join(idemDir, n))));
	const gen0 = readFileSync(join(genDir, rulesMode ? '17-rules.twee' : '15-tables.twee'), 'utf8');
	// **产物侧 ＝ 生成物 ＋ 登记过的手写逃生舱文件**（`#787` 翻面形状）：非 A 桶成员装不进生成物 ⇒ 它们住手写件，
	// 而行为门要比的是**整份契约**；手写侧（冻结基线）本来就含它们 ⇒ 只比生成物会得到"少了成员"的**假差** ✗。
	// 单一真源＝`editor/escape-hatch.json` 的 `hatchFiles`（这里只读它，不另立清单）。
	const hatchFiles = (() => {
		try { return JSON.parse(readFileSync(join(ROOT, 'editor', 'escape-hatch.json'), 'utf8')).hatchFiles ?? []; } catch { return []; }
	})().filter((f) => f.includes(`stories/${slug}/`)).map((f) => join(ROOT, f));
	const gen = [gen0, ...hatchFiles.map((f) => readFileSync(f, 'utf8'))].join('\n');

	const results = [[idemOk, `幂等：连编译两次产物逐字节相同（${names.length} 份：${names.join('、')}）`]];
	const l3Line = (nh, ng, what) => {
		const same = nh === ng;
		const at = [...nh].findIndex((c, i) => c !== ng[i]);
		return [same || l3Mode === 'report',
			`L3 形式等价（--l3=${l3Mode}）：${what}（手写 ${nh.length}B / 生成 ${ng.length}B）${same ? '' : `\n    首个差异 @${at}\n    手写 …${nh.slice(Math.max(0, at - 40), at + 60)}\n    生成 …${ng.slice(Math.max(0, at - 40), at + 60)}`}`];
	};

	if (rulesMode) {
		// ── 条件表：L1 = 两版各自求值后**行数组深度相等**（＝列级一致：少抽一个字段也会不等） ──
		const rowsOf = (text) => { const box = sandboxOf(); vm.runInContext(scriptBodies(text).join('\n'), box, { timeout: 5000 }); return box.Sg.story.rules(); };
		const hr = rowsOf(hand), gr = rowsOf(gen);
		/** 字段直方图：把"抽了哪些列"显式打出来（`#557` 那条老账：总体非空拦不住少抽一项）。 */
		const hist = (rows) => {
			const h = {};
			for (const r of rows) for (const k of Object.keys(r)) h[k] = (h[k] ?? 0) + 1;
			return Object.fromEntries(Object.entries(h).sort(([a], [b]) => (a < b ? -1 : 1)));
		};
		const hh = hist(hr), gh = hist(gr);
		results.push([JSON.stringify(hr) === JSON.stringify(gr),
			`L1 条件表**深度相等**（手写 ${hr.length} 行 / 生成 ${gr.length} 行）${JSON.stringify(hr) === JSON.stringify(gr) ? '' : '\n    两版不同（见下条字段直方图与 L3 定位）'}`]);
		results.push([JSON.stringify(hh) === JSON.stringify(gh),
			`L1 字段直方图一致（每列出现多少次）：${Object.entries(hh).map(([k, v]) => `${k} ${v}`).join(' · ')}`]);
		results.push(l3Line(normalize(section(hand, 'StoryRules') ?? ''), normalize(section(gen, 'StoryRules') ?? ''), '剥注释/空白/冗余尾逗号后逐字节相同'));
		results.push([hr.length > 0 && Object.keys(hh).length > 0, `判到的面不为空：条件表 ${hr.length} 行 · ${Object.keys(hh).length} 列`]);
	} else {
		// ── 表 ＋ 契约（P0 原口径） ──
		const H = evalSide(scriptBodies(hand).join('\n'), '手写侧（基线）');
		const G = evalSide(scriptBodies(gen).join('\n'), '生成侧（产物）');
		if (!H.win || !G.win) {
			results.push([false, `两侧求值（判据的红要讲人话 ✓）：${[H.err, G.err].filter(Boolean).join('；')}`]);
		}
		const hWin = H.win, gWin = G.win;
		const hs = hWin ? snapshot(hWin) : null, gs = gWin ? snapshot(gWin) : null;
		// 段数只**报告**（生成物的段划分与手写不要求同形：`Cave Declarations` 那类"局部常量段"会并进契约的 `const`）；
		// 真正要判的是**契约成员的键集合**（下面那条）＋ 行为。
		console.log(`  · 段数（只报告）：手写 ${scriptBodies(hand).length} 段 / 生成 ${scriptBodies(gen).length} 段`);
		if (hs && gs) {
			const hk = Object.keys(hs.contract).sort(), gk = Object.keys(gs.contract).sort();
			const onlyHand = hk.filter((k) => !gk.includes(k)), onlyGen = gk.filter((k) => !hk.includes(k));
			results.push([onlyHand.length === 0 && onlyGen.length === 0,
				`L1 契约**键集合**一致（手写 ${hk.length} / 生成 ${gk.length}）${onlyHand.length ? `\n    仅手写有：${onlyHand.join('、')}` : ''}${onlyGen.length ? `\n    仅生成有：${onlyGen.join('、')}` : ''}`]);
			results.push([hs.game === gs.game, `L1 数据容器深度相等（含 State/Notes/Consequences；**对象键序不计**，数组序仍判）${hs.game === gs.game ? '' : `\n    手写 ${String(hs.game).slice(0, 220)}\n    生成 ${String(gs.game).slice(0, 220)}`}`]);
			// 判**行为**，不判**顺序**：成员在源里的先后不是语义（曾因"生成物把某成员排到末尾"而假红 ✗）
			const cd = diffContract(hs.contract, gs.contract);
			results.push([Object.keys(hs.contract).length > 0 && cd.n === 0,
				`L1 契约**多实参**行为相等（${Object.keys(hs.contract).length} 个成员 × ${probeArgs(hs.ids).length} 组实参）${cd.n ? `\n    ${cd.text}` : ''}`]);
			results.push(l3Line(scriptBodies(hand).map(normalize).join('|'), scriptBodies(gen).map(normalize).join('|'), '词法遮蔽注释 ＋ 去空白/冗余尾逗号后逐字节相同'));
			results.push([hs.walk.functions === 0 && gs.walk.functions === 0, `数据面是数据：容器内函数值 0 个（手写 ${hs.walk.functions} / 生成 ${gs.walk.functions}）`]);
			const surface = { '容器键数': Object.keys(JSON.parse(hs.game === 'null' ? '{}' : hs.game)).length, '数据叶子数': hs.walk.leaves, '契约成员数': Object.keys(hs.contract).length, '探针调用次数': hs.probes, '归一字节数': scriptBodies(hand).map(normalize).join('|').length };
			const empty = Object.entries(surface).filter(([, v]) => !v).map(([k]) => k);
			results.push([empty.length === 0, `判到的面不为空：${Object.entries(surface).map(([k, v]) => `${k} ${v}`).join(' · ')}${empty.length ? `　✗ 为 0 的：${empty.join('、')}` : ''}`]);
		}
	}

	let bad = 0;
	for (const [ok, msg] of results) { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) bad++; }
	console.log(bad ? `\n✗ 等价判据未通过（${bad} 项）` : `\n✔ ${slug}${rulesMode ? '（条件表）' : ''}：手写版 ↔ 数据版 等价（幂等 ＋ L1 ＋ L3(--l3=${l3Mode}) ＋ 面非空）`);
	process.exit(bad ? 1 : 0);
};

if (isMain) main();
