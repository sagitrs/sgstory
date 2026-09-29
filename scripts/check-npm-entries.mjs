#!/usr/bin/env node
// `#1200`：**npm 入口差集护栏**（`npm run check:npm-entries`）—— 文档与代码里声明的 `npm run <name>`
// 必须在 `package.json` 的 `scripts` 里存在。
//
// 为什么要它（一次真实漏判）：`#1181`（人类面存量清理）评审时，原文里写着 `npm run lint:style`，
// 而当头那份 `package.json` 根本没有这个 script。漏判的根因不是"没查"，而是**引用过的事实没在复验时回读**。
// 这条护栏把该形态机械化：名字集合做差集，差出来的必须逐项回读上下文（要么补 script，要么登记豁免）。
//
// **判据**：引用的脚本名集合 − `package.json` 的 scripts 键集合 − 豁免清单 = 空集。
//
// **读法**：本件不请自来的前提是"引用就是缺口"。但引用也常出现在**否定语境**里（"已退役"、"不再提供"、
// "已随某票删除"），那不算缺口。判据做不到自动判语境，所以：
// ① 报告会把每个缺口的**引用现场**（文件:行 ＋ 该行原文）印出来，让人能直接回读；
// ② 确属否定语境的登记进 `EXEMPT`（**有名有目**，每条写理由与票号）；
// ③ 豁免项自身也要防腐烂：已不再被任何地方引用的豁免项会被报出来（"白名单腐烂"）。
//
// **边界（本件量不到的地方，明写）**：
// · 只覆盖 `npm run` 这一面。同类形态还有"脚本头注写的用法"（例如 `node scripts/x.mjs --flag` 里的
// flag 是否存在），那层不在本件覆盖内，别假装覆盖。
// · 名字集合差集外，**另判一层**：`node <件>` 形脚本的入口件**必须在仓**（`#1635` 补，见 `entryFileProblems`）。
//   原先此处写的是"**不判**该 script 指向的文件是否存在（那是另一件事）" —— ★`#1635` 把那"另一件事"做了 ✓
//   （实测来源：`audit:golden` 指向的 `test/audit-golden.mjs` 已删，而**没有任何门**看得见 ⇒
//    跑 `npm run audit:golden` 直接 `Cannot find module`，台账还写着 `wired: true` ✓）。
//   仍未覆盖（明写）：`gh`／`make`／`python` 等非 `node` 命令；`node -e` 内联；依赖目录里的 bin ✓。
// · **本工具自身不在扫描面内**（自证夹具里写着假脚本名 → 否则自己咬自己）。
//
// 用法：node scripts/check-npm-entries.mjs [--stat|--selftest]

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** 扫描面：文档、代码、配置。跳过依赖目录与构建产物目录。 */
const SCAN_EXT = ['.mjs', '.js', '.md', '.json', '.yml', '.yaml'];
const SKIP_DIR = /^(node_modules|\.git|dist|build|coverage)$/;

/** **豁免清单（有名有目）**：键＝脚本名，值＝理由（写清为什么引用它不算缺口）。 */
export const EXEMPT = {
};

/** ★ `#1635`：**入口件必须在仓** —— `package.json` 里每个 `node <件>` 形的脚本，那个"件"必须真存在。
 *
 * ★为什么单列一格（✗ 并入名字差集）：★两者量的是**不同的东西** —— 名字差集问
 *   "`npm run X` 这个名字有没有定义"；本格问"**定义了的那个 X 指向的文件还在不在**" ✓
 *   ★实测（`#1635`）：`audit:golden` 名字**有**（差集绿）、★但它指向的 `test/audit-golden.mjs`
 *   **已随 `1f90880d` 删除** ⇒ ★**名字差集对此完全无感** ✗ ⇒ 这就是本格存在的理由 ✓
 *
 * ★判法（宁可粗糙，✗ 不假装精细）：★值按 `&&`／`||`／`;` 切段 ⇒ ★每段找 `node` ⇒★其后**第一个非旗标 token**
 *   （`--watch` 这类被跳过 ✓）⇒ ★形如入口件（`.mjs`／`.cjs`／`.js` 后缀，或含 `/`）⇒ ★要求存在于仓 ✓
 *
 * ★边界（明写，✗ 别当它比实际强）：★① 只查 **`node <件>`**（`gh`／`make`／`python` 等**不查** ✓）；
 *   ★② `node -e`／`-p` 内联 ⇒ **无入口件** ⇒ 跳过 ✓；★③ 不查 `node_modules/.bin`（那属依赖面 ✓）。
 * @returns {{name:string, cmd:string, entry:string}[]} 缺口（空＝绿）
 */
export const entryFileProblems = ({ scripts = {}, root = ROOT, exists = existsSync } = {}) => {
	const out = [];
	const isEntry = (t) => /\.(?:mjs|cjs|js)$/.test(t) || t.includes('/');
	for (const [name, cmd] of Object.entries(scripts)) {
		for (const seg of String(cmd ?? '').split(/\s*(?:&&|\|\||;)\s*/)) {
			const toks = seg.trim().split(/\s+/).filter(Boolean);
			const i = toks.indexOf('node');
			if (i < 0) continue;
			// `node -e`／`-p`／`--eval`／`--print` ⇒ 内联代码，没有入口件
			if (toks.slice(i + 1).some((t) => /^-(?:e|p|-eval|-print)$/.test(t))) continue;
			const entry = toks.slice(i + 1).find((t) => !t.startsWith('-'));   // ★旗标（`--watch` 等）跳过 ✓
			if (!entry || !isEntry(entry)) continue;
			if (!exists(join(root, entry))) out.push({ name, cmd: String(cmd), entry });
		}
	}
	return out;
};

/** **纯函数**：引用集合 × scripts × 豁免 → 问题清单（空＝绿）。 */
export const entryProblems = ({ sources = [], scripts = new Set(), allow = {} } = {}) => {
	const RE = /\bnpm run ([a-z0-9:_-]+)/g;
	const hits = new Map();   // name -> [{file, line, text}]
	for (const { file, text } of sources) {
		const lines = String(text ?? '').split('\n');
		let m;
		RE.lastIndex = 0;
		while ((m = RE.exec(lines.join('\n'))) !== null) {
			const upto = lines.join('\n').slice(0, m.index);
			const line = upto.split('\n').length;
			const name = m[1];
			if (!hits.has(name)) hits.set(name, []);
			hits.get(name).push({ file, line, text: (lines[line - 1] ?? '').trim() });
		}
	}
	const missing = [...hits.keys()].filter((n) => !scripts.has(n) && !(n in allow)).sort()
		.map((n) => ({ name: n, hits: hits.get(n) }));
	const stale = Object.keys(allow).filter((n) => !hits.has(n)).sort();
	return { missing, stale, referenced: [...hits.keys()].sort() };
};

/** 走仓取扫描面（只读文件文本，不解析）。 */
const collectSources = () => {
	const out = [];
	const walk = (rel) => {
		const abs = join(ROOT, rel);
		let entries;
		try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(r); continue; }
			if (!SCAN_EXT.includes(e.name.slice(e.name.lastIndexOf('.')))) continue;
			// 本工具自身排除：自证夹具里写着假脚本名（`npm run nope-xyz`），把它自己当引用是假阳性。
			// （原先此处引 `scripts/lint-human-face.mjs` 的「豁免本工具自身」作类比；该工具已随 `#1314` 撤销。）
			if (r === 'scripts/check-npm-entries.mjs') continue;
			// 探针登记表也排除：它的 `mutation.replace` 载荷里写着假脚本名（那是夹具，不是文档里的引用）。
			// 不排除的后果很具体：护栏在**变异前就是红的** → 探针永远"不咬"（我实测撞到过）。
			if (r === 'scripts/probes.mjs') continue;
			// 判据件（`test/npm-entries-guard.mjs`）同理排除：它必须有反例名才能验"能红"。
			// 这三件是**夹具面**，不是"文档里声明的入口"。
			if (r === 'test/npm-entries-guard.mjs') continue;
			try { out.push({ file: r, text: readFileSync(join(ROOT, r), 'utf8') }); } catch { /* 读不到就跳过，下面统计会显示件数 */ }
		}
	};
	walk('');
	return out;
};

const SELF_CASES = [
	['正例：引用存在 ⇒ 无问题', { sources: [{ file: 'x.md', text: '跑 `npm run build` 即可' }], scripts: new Set(['build']) }, 0],
	['反例：引用不存在 ⇒ 报缺口', { sources: [{ file: 'x.md', text: '跑 `npm run nope-xyz` 即可' }], scripts: new Set(['build']) }, 1],
	['反例：现场要能印出来（回读上下文的前提）', { sources: [{ file: 'x.md', text: 'a\nb `npm run nope-xyz`\nc' }], scripts: new Set() }, 1],
	['豁免：登记过的不算缺口', { sources: [{ file: 'x.md', text: '`npm run matrix` 已退役' }], scripts: new Set(), allow: { matrix: '否定语境' } }, 0],
	['反例：豁免项没人引用了 ⇒ 白名单腐烂', { sources: [{ file: 'x.md', text: '无关内容' }], scripts: new Set(), allow: { matrix: '否定语境' } }, 1],
];

/** ★ `#1635` 自证格：入口件存在性（正／反／两条边界／反假绿）。 */
const SELF_ENTRY_CASES = [
	['正例：入口件在仓 ⇒ 不报', { scripts: { build: 'node build.mjs' }, exists: () => true }, 0],
	['🔴 反例：入口件不在仓 ⇒ 报（这正是 `audit:golden` 那一形 ✓）', { scripts: { 'audit:golden': 'node test/audit-golden.mjs' }, exists: () => false }, 1],
	['边界：`node --watch <件>` ⇒ 旗标被跳过、查的是件（✗ 不把 `--watch` 当入口）', { scripts: { watch: 'node --watch scripts/x.mjs' }, exists: () => false }, 1],
	['边界：非 `node` 命令（`gh`／`make`）⇒ 不查（✗ 不越界假红）', { scripts: { a: 'gh pr list', b: 'make test' }, exists: () => false }, 0],
	['边界：`node -e` 内联 ⇒ 无入口件 ⇒ 不查', { scripts: { c: "node -e 'console.log(1)'" }, exists: () => false }, 0],
	['边界：多段（`&&` 切）⇒ 逐段查，缺一段也报', { scripts: { d: 'node build.mjs && node scripts/gone.mjs' }, exists: (p) => /build\.mjs$/.test(p) }, 1],
	['🔴 反假绿：全局 `exists` 恒真 ⇒ 那两格必须**不报**（否则上面的"反例"是假绿）', { scripts: { 'audit:golden': 'node test/audit-golden.mjs' }, exists: () => true }, 0],
];

const main = () => {
	const argv = process.argv.slice(2);
	const has = (f) => argv.includes(`--${f}`);

	if (has('selftest')) {
		let bad = 0;
		for (const [name, input, wantProblems] of SELF_CASES) {
			const r = entryProblems(input);
			const got = r.missing.length + r.stale.length;
			const okk = wantProblems === 0 ? got === 0 : got > 0;
			if (!okk) { bad += 1; console.error(`✗ 自证未通过：${name}（问题数 ${got}）`); }
			else console.log(`✓ ${name}`);
		}
		// 自证里的现场信息必须真的带出来（不然"回读上下文"这句就是空话）
		const r = entryProblems({ sources: [{ file: 'x.md', text: 'a\nb `npm run nope-xyz`\nc' }], scripts: new Set() });
		const h = r.missing[0]?.hits?.[0];
		const okHit = h && h.file === 'x.md' && h.line === 2 && h.text.includes('nope-xyz');
		if (okHit) console.log('✓ 现场（文件:行 ＋ 原文）真的带出来了');
		else { bad += 1; console.error(`✗ 现场信息缺失或错位：${JSON.stringify(h)}`); }
		// 反向核：不能两边都空（否则上面的"正例"是假绿）
		const refs = entryProblems({ sources: [{ file: 'x.md', text: '`npm run a1` `npm run b2`' }], scripts: new Set(['a1', 'b2']) }).referenced;
		if (refs.length === 2) console.log('✓ 反向核：引用集合确实被抓到（2 个）');
		else { bad += 1; console.error(`✗ 反向核失败：referenced=${JSON.stringify(refs)}`); }
		// ★ `#1635`：入口件存在性那几格（★`exists` 注入 ⇒ 合成样本能假 ✓）
		for (const [name, input, wantProblems] of SELF_ENTRY_CASES) {
			const got = entryFileProblems(input).length;
			const okk = wantProblems === 0 ? got === 0 : got > 0;
			if (!okk) { bad += 1; console.error(`✗ 自证未通过（入口件）：${name}（问题数 ${got}）`); }
			else console.log(`✓ ${name}`);
		}
		if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
		console.log('\n✔ 自证通过');
		process.exit(0);
	}

	const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {}));
	const sources = collectSources();
	const scriptsMap = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {};
	const r = entryProblems({ sources, scripts, allow: EXEMPT });
	const ef = entryFileProblems({ scripts: scriptsMap });   // ★ `#1635`：入口件必须在仓

	if (has('stat')) {
		console.log(`  扫描 ${sources.length} 件｜引用到的脚本 ${r.referenced.length} 个｜package.json scripts ${scripts.size} 个`);
		console.log(`  缺口 ${r.missing.length} 个｜豁免 ${Object.keys(EXEMPT).length} 个（腐烂 ${r.stale.length} 个）`);
		console.log(`  入口件缺失 ${ef.length} 个（${ef.map((x) => x.name).join('、') || '—'}）`);
		return;
	}

	if (ef.length) {
		for (const { name, cmd, entry } of ef) console.error(`✗ 脚本 ${name} 的入口件不在仓：${entry}（cmd：${cmd}）`);
		console.error('\n修法：补回入口件，或把该 script（从 `package.json`）与它的登记一并删干净。');
		process.exit(1);
	}

	if (r.missing.length || r.stale.length) {
		for (const { name, hits } of r.missing) {
			console.error(`✗ 引用了 package.json 里没有的脚本：${name}`);
			for (const h of hits.slice(0, 4)) console.error(`    ${h.file}:${h.line}  ${h.text.slice(0, 110)}`);
			if (hits.length > 4) console.error(`    其余 ${hits.length - 4} 处略`);
		}
		for (const n of r.stale) console.error(`✗ 豁免腐烂：${n} 已不再被引用（理由：${EXEMPT[n]}）—— 接缝做完就删`);
		console.error('\n修法：补 `package.json` 的 script，或把**否定语境**的引用登记进本件 `EXEMPT`（写清理由）。');
		process.exit(1);
	}
	console.log(`✔ npm 入口差集为空 ＋ 入口件全在仓（扫描 ${sources.length} 件，引用 ${r.referenced.length} 个脚本，豁免 ${Object.keys(EXEMPT).length} 个，入口件 ${Object.keys(scriptsMap).length} 个）`);
};

if (process.argv[1] && process.argv[1].endsWith('check-npm-entries.mjs')) main();
