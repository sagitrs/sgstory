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
// · 只做名字集合差集，**不判**该 script 指向的文件是否存在（那是另一件事）。
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
	matrix: '`docs/dev-conventions.md`：退役说明里的引用（"已随内容故事删除"），属否定语境，不是缺口',
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
		if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
		console.log('\n✔ 自证通过');
		process.exit(0);
	}

	const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {}));
	const sources = collectSources();
	const r = entryProblems({ sources, scripts, allow: EXEMPT });

	if (has('stat')) {
		console.log(`  扫描 ${sources.length} 件｜引用到的脚本 ${r.referenced.length} 个｜package.json scripts ${scripts.size} 个`);
		console.log(`  缺口 ${r.missing.length} 个｜豁免 ${Object.keys(EXEMPT).length} 个（腐烂 ${r.stale.length} 个）`);
		return;
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
	console.log(`✔ npm 入口差集为空（扫描 ${sources.length} 件，引用 ${r.referenced.length} 个脚本，豁免 ${Object.keys(EXEMPT).length} 个）`);
};

if (process.argv[1] && process.argv[1].endsWith('check-npm-entries.mjs')) main();
