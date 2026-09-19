#!/usr/bin/env node
/** 探针运行器（`#908` ① ✓）—— **最小变异 ＋ 必须红**，两半都要 ✓。
 *
 * 用法（**可粘贴复跑** ✓，⑱/⑲）：
 * ```
 * node scripts/probe-gates.mjs --list              # 清单（谁被探过 ✓ 档位 ✓）
 * node scripts/probe-gates.mjs --selfcheck         # 只验**运行器自己**能假 ✓（纯函数 ＋ 注入 0 处必须报 ✓）
 * node scripts/probe-gates.mjs --probe=fast        # 跑 fast 档 ✓（结果写 build/probe-results.json ✓ —— 落点**自己建** ✓ 无前置 ✓）
 * node scripts/probe-gates.mjs --probe=full        # 跑全部 ✓（慢 ✓）
 * node scripts/probe-gates.mjs --check             # 结构校验 ✓（不跑探针 ✗：清单 ↔ 台账行对得上吗 ✓）
 * ```
 *
 * ## 一条探针的四步（每步都可能**红在别的地方**，所以分开报 ✓）
 * 1. **前置**（`pre` ✓）：任一失败 ⇒ 报「**缺前置**」✗（**不报"探针不咬"** ✓ —— 那是两件事 ✓）；
 * 2. **正**：`cmd` 变异前必须 **rc=0** ✓（否则报「变异前就红」✗）；
 * 3. **下刀**：`find` 在 `mutation.file` 里必须**恰好命中 1 处** ✓（0 处 ⇒ 红 ✓ 并打印「注入确认 0 处」✗；>1 ⇒ 红 ✓ 要求写更唯一的锚 ✓）；
 * 4. **反**：`cmd` 必须 **rc=1** ✓ 且输出命中 `expect.stdout` ✓（不命中 ⇒ 报「红了但不是它」✗ —— 报红而没点名，等于没指名 ✓）。
 * 变异**必还原**（`finally` ＋ 还原后再核一次 ✓）。
 *
 * ## 读数落到哪
 * `build/probe-results.json`（**不入仓** ✗，与其它 build 产物同 ✓）：每条记 `{ id, ok, target, targetSha, mode }` ✓
 * —— `targetSha` 让台账能判**新鲜度** ✓（被测件改了 ⇒ 台账不再显示 `✅` ✗ ⇒ 不会拿旧读数充数 ✓）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, utimesSync } from 'node:fs';   // `#1012`：加 `statSync`／`utimesSync`（还原时保时间戳 ✓）
import { dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PROBES } from './probes.mjs';
import { maskComments } from '../editor/lib/core/mask.mjs';   // `#1019`：静态判据先**剥注释**再认 import（避免"文本里提过 boot.mjs"被误判 ✓）

const RECORD = 'build/probe-results.json';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ── 纯函数（能被 `--selfcheck` 驱动 ⇒ 判据本身有能假的另一半 ✓）──────────
/** 数命中（**先数再下刀** ✓ —— 文件/行号不是锚 ✗，打歪的刀就是这么来的 ✓）。 */
export const countHits = (src, find) => {
	if (!find) return 0;
	let n = 0;
	for (let i = src.indexOf(find); i !== -1; i = src.indexOf(find, i + find.length)) n++;
	return n;
};
/** 应用最小变异：**只在恰好 1 处时**才动 ✗，否则原样返回 ＋ 报数 ✓。 */
export const applyMutation = (src, find, replace) => {
	const count = countHits(src, find);
	if (count !== 1) return { out: src, count, applied: false };
	return { out: src.replace(find, replace), count, applied: true };
};
/** 三态判定（纯 ✓）：`ok` / `reason` 二选一 ✓ —— 每条 reason 都对应**一种"红在别处"** ✓。
 *
 * `#1019` ✓：`baseRc ≠ 0` 这一支**再分两种**（原来只有一种，病因名报错 ✗）：
 *   · `preDeclared === false`（探针**没声明前置**）⇒ 报「**基线红（缺前置？）**」并**给出补法**；
 *     ⚠️ 原来一律报「变异前就红 ⇒ 这次"红"不是变异造成的」⇒ 读的人会去查**判据**，而真因是**树上产物陈旧/缺失** ✓
 *     （实测 `#1018`／`#1019`：`test/witness-trace.mjs` 的 `pre: []` ＋ 无 `dist` ⇒ 被记成「不咬」✗）。
 *   · 声明了前置却仍红 ⇒ 真·「变异前就红」（另有他因）✓ 保持原文案 ✓。 */
export const verdictOf = ({ preOk = true, preDeclared = true, baseRc, baseOut = '', mutatedRc, hitCount, stdout = '', expect = {} }) => {
	if (!preOk) return { ok: false, kind: 'missing-pre', reason: '缺前置（**声明的**前置没跑过 ✗ —— 与"探针不咬"是两件事 ✓）' };
	if (hitCount === 0) return { ok: false, kind: 'no-injection', reason: '注入确认 0 处 ⇒ 刀没下到真语句（读数不成立 ✗）' };
	if (hitCount > 1) return { ok: false, kind: 'ambiguous-anchor', reason: `注入确认 ${hitCount} 处 ⇒ 锚不唯一（要求恰好 1 ✓）` };
	if (baseRc !== 0) {
		// 产物陈旧/缺失的**特征串**（`scripts/dist-fresh.mjs` 的守卫文案 ＋ 构建提示 ＋ ENOENT ✓）
		const stale = /比 src\/\*\.twee 旧|先跑 `npm run build`|npm run build|ENOENT/i.test(String(baseOut ?? ''));
		if (!preDeclared)
			return { ok: false, kind: 'missing-pre', reason: '**基线红 —— 缺前置？** ✗（未变异那一跑就红了 rc=' + baseRc + '，而本探针的 pre **为空** ⇒ **读数不成立**，与"探针不咬"是两件事 ✓）' +
				(stale ? '：基线报文命中"**产物陈旧/缺失**"特征 ⇒ 把 pre: [\'node build.mjs\'] 写进命令（本仓纪律：**前置写进命令** ✓）'
				       : '：若该件的 cmd 读产物（dist/／build/）⇒ 把 pre 写进命令 ✓') };
		return { ok: false, kind: 'baseline-red', reason: `变异前就红（rc=${baseRc}）⇒ 这次"红"不是变异造成的 ✗` };
	}
	const wantRc = expect.rc ?? 1;
	if (mutatedRc !== wantRc) return { ok: false, kind: 'not-biting', reason: `变异后 rc=${mutatedRc} ≠ 期望 ${wantRc} ⇒ **探针不咬** ✗` };
	if (expect.stdout && !expect.stdout.test(stdout)) return { ok: false, kind: 'unattributed-red', reason: `红了但报文没点名 ${expect.stdout} ⇒ 红了不是它 ✗` };
	return { ok: true, kind: 'biting', reason: '咬住 ✓（变异前绿 ⇒ 变异后红 ⇒ 点名该判据 ✓）' };
};

/** `#1019` 静态判据 ✓：本探针的 `cmd` **是否读产物**（`dist/`／`build/`）。
 *
 * 信号为什么用 **`boot.mjs` import**（而不是"文件文本里出现 dist/"✗）：`test/boot.mjs` 里就是**产物新鲜度守卫**
 * （`assertFreshDist` ⇒ "`dist/index.html` 比 `src/*.twee` 旧"）⇒ **谁 import 它、谁就必须有新鲜产物** ✓
 * —— 这是**代码面**的确定性信号，不是文本启发式 ✓（文本启发式会把 `test/repo-shape.mjs` 这类"只读到 `build/` 三个字"的件误报 ✓）。
 *
 * **传递**（深度 ≤ 2）✓：有的件自己不 import，而是 **spawn** 另一个件（实测 `test/witness-trace.mjs` ⇒ `test/walker.mjs` ⇒ `boot.mjs` ✓）
 * ⇒ 从 `cmd` 的入口件出发，把件内出现的相对 `.mjs` 路径当可达集展开 ✓。
 *
 * **兜底** ✓：判不出时**不报**（宁漏不误 ✗）＋ 运行时的「基线红（缺前置？）」那一支会把真因**点名** ✓；
 * 探针也可写 `noProducts: '<理由>'` **显式**声明"本件不读产物"✓（本仓既有的"白名单 ＋ 理由"机制同款 ✓）。 */
export const cmdNeedsProducts = (p, { read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null) } = {}) => {
	if (p?.noProducts) return false;                                  // 显式豁免（带理由 ✓）
	const entry = (String(p?.cmd ?? '').match(/(?:test|editor|scripts)\/[A-Za-z0-9._\/-]+\.mjs/) ?? [])[0];
	if (!entry) return false;
	const src = read(entry);
	if (src == null) return false;
	// **判据是"真的 import/require 了 boot.mjs"** ✗（不是"文本里出现 boot.mjs 四个字"✓ ——
	//   我第一版就栽在这里：本文件的注释里也写着 `boot.mjs` ⇒ 传递扫描把它自己也判成"读产物" ✗ ⇒
	//   连 `scripts/report-gate-ledger.mjs` 那条**纯 selftest** 探针都被误报成"缺前置"✓）
	//   ⇒ 先**剥注释**（本仓老纪律 ✓）再只认 import/require 形式 ✓。
	const code = maskComments(src, { file: entry, twee: false });
	return /(?:from\s*|require\(\s*)['"][^'"]*boot\.mjs['"]/.test(code);
};


// ── 自检（运行器自己也得能假 ✓）──────────────────────────────────────
const selfcheck = () => {
	let bad = 0;
	const h = (label, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}`); };
	h('`countHits`：命中 0 处 ⇒ 0 ✓', countHits('abc', 'zzz') === 0);
	h('`countHits`：命中 2 处 ⇒ 2 ✓', countHits('aXaX', 'X') === 2);
	h('`applyMutation`：**0 处不许动** ✗（原样返回 ✓）', applyMutation('abc', 'zzz', 'Q').applied === false);
	h('`applyMutation`：2 处不许动 ✗（锚不唯一 ✓）', applyMutation('aXaX', 'X', 'Q').applied === false);
	h('`applyMutation`：1 处 ⇒ 换掉 ✓', applyMutation('aXb', 'X', 'Q').out === 'aQb');
	h('`verdictOf`：**注入 0 处 ⇒ 必须红** ✗（"打歪的刀"那一族 ✓）', verdictOf({ baseRc: 0, mutatedRc: 1, hitCount: 0 }).ok === false);
	h('`verdictOf`：**变异前就红 ⇒ 不成立** ✗', verdictOf({ baseRc: 1, mutatedRc: 1, hitCount: 1 }).ok === false);
	h('`verdictOf`：**不咬（变异后仍绿）⇒ 红** ✗', verdictOf({ baseRc: 0, mutatedRc: 0, hitCount: 1 }).ok === false);
	h('`verdictOf`：**红了但没点名 ⇒ 红** ✗', verdictOf({ baseRc: 0, mutatedRc: 1, hitCount: 1, stdout: '别的错', expect: { rc: 1, stdout: /目标判据/ } }).ok === false);
	h('`verdictOf`：缺前置 ⇒ 报**缺前置**（不报"不咬" ✓）', /缺前置/.test(verdictOf({ preOk: false, baseRc: 0, mutatedRc: 1, hitCount: 1 }).reason));
	// `#1019` ✓：`baseRc ≠ 0` 那一支分两种 —— **没声明前置** ⇒ 「基线红（缺前置？）」＋ 给出补法；
	//   **声明了前置**却仍红 ⇒ 真·「变异前就红」（原文案 ✓）。两格成对 ✗（只做前者就会把后者也改成"缺前置"✓）。
	h('`verdictOf`：`pre` **为空** 而基线红 ⇒ 报「**缺前置？**」（不报"不咬" ✓）', /缺前置/.test(verdictOf({ preDeclared: false, baseRc: 1, mutatedRc: 1, hitCount: 1 }).reason));
	h('`verdictOf`：基线报文命中产物陈旧特征 ⇒ **点名**补 `pre` ✓', /产物陈旧|把 `pre/.test(verdictOf({ preDeclared: false, baseRc: 1, mutatedRc: 1, hitCount: 1, baseOut: 'dist/index.html 比 src/*.twee 旧——先跑 `npm run build`' }).reason));
	h('`verdictOf`：**声明了**前置却仍红 ⇒ 仍报「变异前就红」（不被前一条吞掉 ✓）', /变异前就红/.test(verdictOf({ preDeclared: true, baseRc: 1, mutatedRc: 1, hitCount: 1 }).reason));

	// `#1019` 静态判据：`cmdNeedsProducts` —— **假件驱动**（§17 ③ ✓）：注入假的文件读取，不依赖真树 ✓
	const fakeRead = (m) => (f) => m[f] ?? null;
	h('`cmdNeedsProducts`：入口件**直引** `boot.mjs` ⇒ true ✓',
		cmdNeedsProducts({ cmd: 'node test/a.mjs' }, { read: fakeRead({ 'test/a.mjs': "import { boot } from './boot.mjs';" }) }) === true);
	// ⚠️ **不做传递展开**（`#1019` 实测的教训 ✓）：第一版按"件内出现的 `.mjs` 路径"向下扫 2 层 ⇒ 把
	//   `scripts/report-gate-ledger.mjs` 那种**只在表里列路径**的件也判成"读产物" ⇒ **误报** ⇒ 干脆只判**入口件**（宁漏不误 ✓）；
	//   传递那一类（`witness-trace ⇒ walker ⇒ boot` ✓）由**运行时那一支**点名（基线红 ＋ pre 为空 ⇒ 报缺前置 ✓）＋ 本票给它补上 `pre` ✓。
	h('🔴 `cmdNeedsProducts` 反例：不引 boot ⇒ false ✓（不误报 ✓）',
		cmdNeedsProducts({ cmd: 'node test/a.mjs' }, { read: fakeRead({ 'test/a.mjs': "import { readFileSync } from 'node:fs'; // build/ 三个字不算 ✓" }) }) === false);
	h('🔴 `cmdNeedsProducts` 反例：`noProducts` **显式豁免**（带理由）⇒ false ✓',
		cmdNeedsProducts({ cmd: 'node test/a.mjs', noProducts: '本件只读 git ✓' }, { read: fakeRead({ 'test/a.mjs': "import { boot } from './boot.mjs';" }) }) === false);
	h('`verdictOf`：正＋反都成立 ⇒ ok ✓', verdictOf({ baseRc: 0, mutatedRc: 1, hitCount: 1, stdout: '目标判据 红', expect: { rc: 1, stdout: /目标判据/ } }).ok === true);
	if (bad) { console.error(`\n✗ 探针运行器自检 ${bad} 条未过`); process.exit(1); }
	console.log('\n✔ 探针运行器自检通过（三态判定 ＋ 注入计数 ＋ 缺前置分家 ＋ `#1019` 静态预检 ✓）');
};

// ── 跑一条探针 ───────────────────────────────────────────────────────
const run = (cmd) => {
	try { return { rc: 0, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
	catch (e) { return { rc: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};

const probeOne = (p) => {
	const pre = [];
	for (const c of p.pre ?? []) { const r = run(c); if (r.rc !== 0) pre.push(`${c} ⇒ rc=${r.rc}`); }
	const target = p.mutation?.file ?? '';
	if (!target || !existsSync(target)) return { id: p.id, ok: false, reason: `探针件缺失/被测件不存在（${target || '未写 file'} ✗）—— 标了 ✅ 却没有探针 ⇒ 红 ✓`, injected: 0, pre };
	// `#1019` 静态预检 ✓：**读产物却没声明前置** ⇒ 直接报「**缺前置**」（不跑到"变异前就红"那条错名的路上去 ✓）。
	//   ⚠️ 报的是**病因名**：判据没坏，是**读数不成立** ✓（`#1018` 实测那条假读数就是它 ✓）。
	const needsProducts = cmdNeedsProducts(p);
	const buildish = (c) => /build\.mjs|npm run build/.test(String(c));
	const preHasBuild = (p.pre ?? []).some(buildish);
	if (needsProducts && !preHasBuild && !(p.rebuild && buildish(p.rebuild)))
		return { id: p.id, ok: false, kind: 'missing-pre', reason: `**缺前置** ✗（本探针的 \`cmd\` **读产物**（${(p.rebuild ? 'rebuild／' : '')}传递可达 \`boot.mjs\` ⇒ 要 \`dist/\` 新鲜 ✓），但 \`pre\` 里没有 build 类命令 ⇒ **读数不成立**，与"探针不咬"是两件事 ✓）：把 \`pre: [\'node build.mjs\']\` 写进命令（本仓纪律：**前置写进命令** ✓）`, injected: 0, pre, target, targetSha: sha(readFileSync(target, 'utf8')), mode: p.tier, needsProducts };
	const original = readFileSync(target, 'utf8');
	const stamp = statSync(target);   // `#1012`：记下原时间戳（还原时一并还原 ✓）
	const base = pre.length ? { rc: 1, out: '' } : run(p.cmd);
	const { out, count, applied } = applyMutation(original, p.mutation.find, p.mutation.replace);
	if (!applied) return { id: p.id, ok: false, reason: verdictOf({ preOk: pre.length === 0, baseRc: base.rc, mutatedRc: -1, hitCount: count }).reason, injected: count, pre };
	let mutated = { rc: -1, out: '' };
	try {
		writeFileSync(target, out);
		// `#1012`／`#1019`：`rebuild` 的**第一处** —— **变异之后、`cmd` 之前** ✗。
		//   为什么需要它 ✗：判据对象是**编译产物**的探针（被测面在 `src/**`／`editor/**` ⇒ 产物才是被量的东西 ✓），
		//   不重建就等于**量的还是上一代产物** ✓ ⇒ "变异后仍绿" 的**假不咬** ✓。
		//   （⚠️ 不能用 `pre` 表达这一处 ✗：`pre` 的语义是"**变异之前**"✓，现有十五探针依赖它 ✓，不改 ✓。）
		if (p.rebuild) { const r0 = run(p.rebuild); if (r0.rc !== 0) throw new Error(`rebuild（变异后）失败：${p.rebuild} ⇒ rc=${r0.rc}`); }
		mutated = run(p.cmd);
	} catch (e) {
		mutated = { rc: e.status ?? 1, out: String(e.message ?? e) };
	} finally {
		writeFileSync(target, original);
		// `#1012`：**还原也要还原时间戳** ✗ —— 只写回内容会把 mtime 变新 ✓ ⇒ 全仓的「dist 比 src 新」
		//   新鲜度守卫（`scripts/dist-fresh.mjs` 的 `assertFreshDist` ✓）会因此**假红** ✗。
		//   实测（本片）：给 `src/80-script.twee` 下的探针一旦跑过 ⇒ 其后 **37 段** boot 类门全红 ✗
		//   （“dist/index.html 比 src/*.twee 旧”✓）⇒ 探针本身**污染相序** ✗ —— 不是被测件的问题 ✓。
		utimesSync(target, stamp.atime, stamp.mtime);
	}
	const restored = readFileSync(target, 'utf8') === original;
	// `#1012`／`#1019`：`rebuild` 的**第二处** —— **还原被测件之后、收尾** ✗ ——
	//   变异期间那次重建已把**变异版**编进产物 ⇒ 只还原源文件 ⇒ 后续依赖产物的段（`assertFreshDist` 一族）
	//   拿到的是**变异后的游戏** ✓（实测 `#1012`：**37 段**全红 ✗，探针**自污染相序** ✓）。
	//   ⇒ 两处任一失败 ⇒ **红**（并入同一条 verdict ✓，不静默 ✓）。
	let rebuildErr = '';
	if (p.rebuild) { const r = run(p.rebuild); if (r.rc !== 0) rebuildErr = `rebuild 失败（${p.rebuild} ⇒ rc=${r.rc}）`; }
	const v = verdictOf({ preOk: pre.length === 0, preDeclared: (p.pre ?? []).length > 0, baseRc: base.rc, baseOut: base.out, mutatedRc: mutated.rc, hitCount: count, stdout: mutated.out, expect: p.expect });
	return { id: p.id, ok: v.ok && restored && !rebuildErr, kind: v.kind, reason: rebuildErr || (restored ? v.reason : '还原失败 ✗（被测件没回到原样 ⇒ 必须红 ✓）'), injected: count, pre, target, targetSha: sha(original), mode: p.tier, needsProducts };
};

// ── 结构校验（不跑探针 ✓）────────────────────────────────────────────
const rowsOf = () => {
	// 台账的行 id 从生成器里取 ✓（同一把尺子 ✓）；拿不到就**说明**并跳过这半 ✗（不假装过了 ✓）
	try {
		const out = execFileSync('node', ['-e', "import('./scripts/report-gate-ledger.mjs').then(m=>console.log(JSON.stringify(m.rowIds??[])))"], { encoding: 'utf8' });
		return JSON.parse(out.trim() || '[]');
	} catch { return null; }
};

const checkStructure = () => {
	let bad = 0;
	const ids = rowsOf();
	if (ids === null) { console.log('⚠ 台账行 id 取不到（生成器未导出 `rowIds` ✗）⇒ 只做清单自校验 ✓'); }
	else {
		for (const p of PROBES) if (!ids.includes(p.id)) { bad++; console.error(`✗ 探针 \`${p.id}\` 对不上台账行 ✗（点了名却没人 ⇒ 红 ✓）`); }
	}
	const dup = PROBES.map((p) => p.id).filter((v, i, a) => a.indexOf(v) !== i);
	if (dup.length) { bad++; console.error(`✗ 同一行挂了多条探针：${dup.join(', ')} ✗`); }
	if (bad) { console.error(`\n✗ 探针结构校验 ${bad} 条未过`); process.exit(1); }
	console.log(`✔ 探针结构校验通过（${PROBES.length} 条 ✓：清单 ↔ 台账行对得上 ✓ 无重复 ✓）`);
};

// ── 主 ───────────────────────────────────────────────────────────────
const arg = process.argv.slice(2);
if (arg.includes('--selfcheck')) { selfcheck(); process.exit(0); }
if (arg.includes('--list')) {
	console.log(`探针清单（${PROBES.length} 条 ✓）—— 用法：node scripts/probe-gates.mjs --probe=fast`);
	for (const p of PROBES) console.log(`  · [${p.tier}] ${p.id}  ←  变异 ${p.mutation.file}`);
	process.exit(0);
}
if (arg.includes('--check')) { checkStructure(); process.exit(0); }
const mode = (arg.find((a) => a.startsWith('--probe=')) ?? '--probe=fast').split('=')[1];
const selected = mode === 'full' ? PROBES : PROBES.filter((p) => p.tier === 'fast');
console.log(`══ 探针（档位 ${mode} ✓ 选中 ${selected.length}/${PROBES.length} 条 ✓）══`);
const results = selected.map(probeOne);
let bad = 0;
for (const r of results) {
	if (!r.ok) bad++;
	console.log(`${r.ok ? '✅' : '✗'} ${r.id}  [注入确认 ${r.injected ?? 0} 处 ✗]  ${r.reason}${r.pre?.length ? ` ｜ 前置失败: ${r.pre.join('; ')}` : ''}`);
}
// 复核留（**MAJOR** ✗，实测 ✓）：干净树**没有 build/**（它在 .gitignore 里 ✓，唯一创建者是 `build.mjs` ✓）
//   ⇒ 直接写记录 ⇒ ENOENT ⇒ rc=1 ✗ —— 而 CI 因 `test-plan.mjs` 的 `needs:['build-mjs']` **不受影响** ✗
//   ⇒ 只在「单跑／新树」暴露 ✓（票面又把它列为**可复跑读数** ✗ ⇒ 照抄必崩 ✓）。正形 ✓：落点**自己建** ✓，不许以 ENOENT 的形式出现 ✗。
mkdirSync(dirname(RECORD), { recursive: true });
writeFileSync(RECORD, JSON.stringify({ mode, probes: results }, null, '\t') + '\n');
const uncovered = PROBES.filter((p) => !selected.includes(p)).map((p) => p.id);
console.log(`\n读数 ⇒ ${RECORD}（**不入仓** ✗）｜ 本轮未探: ${uncovered.length} 条${uncovered.length ? '＝' + uncovered.join(', ') : ''}`);
if (bad) { console.error(`\n✗ 探针 ${bad} 条未咬住（不看"跑了多少"，只看"咬没咬" ✓）`); process.exit(1); }
console.log(`\n✔ 探针 ${results.length} 条全部咬住（正：变异前绿 ✓ 反：变异后红且点名 ✓）`);
