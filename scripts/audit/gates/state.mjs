// ⓪u 状态契约门（#318①/#318②）：`pc.ev` / `pc.world` 的键必须落在 `Game.State.domains` 的某个域里。
//
// 为什么：这些键是自由名字空间（81 个，散在 9 个 src 文件里写），此前没有任何一处能回答
// 「当前有哪些键、谁写、谁读、语义是什么」。契约表在 `src/15-tables.twee` 的 `Game.State`。
//
// 四条判定（附合成自证，跑本门时会先自证再判真实数据）：
//   ① 未声明域：键匹配不到任何域 → 红（新增键必须登记，或落入既有域）
//   ② 歧义：键同时命中 ≥2 个域 → 红（归属必须唯一）
//   ③ 只有写：写了但没有任何读取 → 红（无消费者的状态＝写了没人看）
//   ④ 只有读：读了但没有任何写入 → 红（幽灵条件＝死分支）
//
// 扫描必须覆盖**三类动态形式**（否则会误报——本仓踩过）：
//   `<<setflag "k">>` / `<<firstTime "k">>`（动态写入 `$pc.ev[k]` 并动态读回）· `$pc.ev["k"]`
//   · 表内谓词 `(p) => p.world?.k`。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

export const flag = 'state';
export const flags = ['state'];

const stripComments = (t) => t.replace(/\/%[\s\S]*?%\//g, '');

// 纯函数：给 { 文件: 源码 }，返回键的写/读图（供自证喂合成源码）
// 命名空间：`ev.`（事件/证据）与 `world.`（世界态）。**同一个键名在两个域里各有一份**——
// 只按裸键名归并会漏掉「写 world.X / 读 ev.X」这类失效（#365：观星者写 world.seer_asked、
// 跨时代门读 ev.seer_asked → 证据支路静默失效）。故写/读都记成 `域.键`。
export const analyze = (sources) => {
	const keys = new Map();
	const bump = (k, kind, site) => {
		if (!keys.has(k)) keys.set(k, { w: new Set(), r: new Set(), dynamic: false });
		keys.get(k)[kind].add(site);
	};
	for (const [f, raw] of Object.entries(sources)) {
		const t = stripComments(raw);
		let passage = '?';
		for (const line of t.split('\n')) {
			if (line.startsWith(':: ')) passage = line.slice(3).trim();
			const site = `${f.split('/').pop()}:${passage}`;
			const writes = [
				...[...line.matchAll(/\$pc\.(ev|world)\.([a-z_]\w*)\s+to\b/g)].map((m) => `${m[1]}.${m[2]}`),
				...[...line.matchAll(/\bpc\.(ev|world)\.([a-z_]\w*)\s*=[^=]/g)].map((m) => `${m[1]}.${m[2]}`),
				// setflag / firstTime 写的是 **world 域**（见 10-core 的 setflag widget）
				...[...line.matchAll(/<<setflag "([a-z_]\w*)"/g)].map((m) => `world.${m[1]}`),
				...[...line.matchAll(/<<firstTime "([a-z_]\w*)"/g)].map((m) => `ev.${m[1]}`),
				...[...line.matchAll(/\$pc\.ev\[['"]([a-z_]\w*)['"]\]/g)].map((m) => `ev.${m[1]}`),
			];
			for (const k of writes) bump(k, 'w', site);
			// firstTime 是「读一次再写」——记成动态读，避免误判「只有写」
			// firstTime 读的是 **ev 域**（其 widget 写/读 `$pc.ev[$args[0]]`）——此前写成裸键名，
			// 导致 nsMismatch 报出「读的是 tav_seen.tav_seen」这种自指假阳性。
			for (const m of line.matchAll(/<<firstTime "([a-z_]\w*)"/g)) {
				const key = `ev.${m[1]}`;
				bump(key, 'r', site + '(firstTime)');
				if (keys.has(key)) keys.get(key).dynamic = true;
			}
			const reads = [
				...[...line.matchAll(/\$pc\.(ev|world)\.([a-z_]\w*)/g)].map((m) => `${m[1]}.${m[2]}`),
				...[...line.matchAll(/\bpc\.(ev|world)\.([a-z_]\w*)/g)].map((m) => `${m[1]}.${m[2]}`),
				...[...line.matchAll(/\bp\.(?:ev|world)\??\.([a-z_]\w*)/g)].map((m) => `${/p\.ev/.test(m[0]) ? 'ev' : 'world'}.${m[1]}`),
			];
			for (const k of reads) {
				if (new RegExp(`\\.${k}\\s*(=|to)\\b`).test(line)) continue; // 写行不算读
				bump(k, 'r', site);
			}
		}
	}
	return keys;
};

// 纯函数：给键图 + 域表，返回问题清单
// 裸键名（去掉 `域.` 前缀）——域归属按裸键名匹配 Game.State.domains
const bare = (k) => k.replace(/^(ev|world)\./, '');
const NS_OF = (k) => k.split('.')[0];

// 合并视图：裸键名 → { w:Set(域), r:Set(域), wSites:Set, rSites:Set }
// 为什么合并：同一个键名在 ev/world 两个域里各有一份，**域归属与「有写有读」都应按裸键名判**；
// 域差异单独由 nsMismatch 判（#365：写 world.seer_asked / 读 ev.seer_asked → 证据支路静默失效）。
export const mergeByBare = (keys) => {
	const M = new Map();
	for (const [k, v] of keys) {
		const b = bare(k);
		if (!M.has(b)) M.set(b, { w: new Set(), r: new Set(), wSites: new Set(), rSites: new Set(), nsW: new Set(), nsR: new Set() });
		const m = M.get(b);
		if (v.w.size) { m.nsW.add(NS_OF(k)); for (const x of v.w) m.wSites.add(x); }
		if (v.r.size) { m.nsR.add(NS_OF(k)); for (const x of v.r) m.rSites.add(x); }
		m.w = m.nsW; m.r = m.nsR;
	}
	return M;
};

// 命名空间不一致（#365）：**每个「读」的域都必须有同域的写入**——否则那一支读取永远不成立。
// 注意不是「域集合不相交」才算错：#365 里 `seer_asked` 同时有 world 读（表内谓词）与 ev 读（跨时代门），
// 而写入只有 world（setflag）→ 域集合相交，但 **ev 那一支是死的**。
export const nsMismatch = (keys) => {
	const out = [];
	for (const [b, m] of mergeByBare(keys)) {
		const deadReads = [...m.nsR].filter((ns) => !m.nsW.has(ns));
		if (deadReads.length) {
			out.push({
				key: b,
				detail: `读的域 ${deadReads.map((n) => n + '.' + b).join('/')} 没有同域写入（写的是 ${[...m.nsW].map((n) => n + '.' + b).join('/') || '（无）'}）——该分支永远不成立`,
			});
		}
	}
	return out;
};

export const check = (keys, domains, bookkeeping = []) => {
	const problems = [];
	const match = (b) => domains.filter((d) => (d.keys ?? []).includes(b) || (d.prefix ?? []).some((p) => b.startsWith(p)));
	for (const [b, m] of mergeByBare(keys)) {
		const hits = match(b);
		if (hits.length === 0) problems.push({ kind: 'undeclared', key: b, detail: `未落入任何域（Game.State.domains）——新增状态键必须登记` });
		else if (hits.length > 1) problems.push({ kind: 'ambiguous', key: b, detail: `同时命中 ${hits.map((d) => d.id).join('/')}，归属必须唯一` });
		// 「仅记账」：消费者就是登记表本身——必须显式声明
		if (m.wSites.size && !m.rSites.size && !bookkeeping.includes(b)) problems.push({ kind: 'write-only', key: b, detail: `只有写没有读（写于 ${[...m.wSites].join('、')}）；若确属「仅记账」请登记进 Game.State.bookkeeping` });
		if (m.rSites.size && !m.wSites.size) problems.push({ kind: 'read-only', key: b, detail: `只有读没有写（读于 ${[...m.rSites].slice(0, 3).join('、')}）——幽灵条件/死分支` });
	}
	return problems;
};

export const run = (ctx) => {
	console.log('\n══ ⓪u 状态契约门（#318）——pc.ev / pc.world 的键必须有域归属，且有写有读 ══');
	const domains = ctx.Game.State?.domains ?? [];
	let bad = 0;
	if (!domains.length) { console.log('  ✗ Game.State.domains 未登记'); bad++; }

	// ── 自证（先证会红，再判真实数据）──
	const SELF_GOOD = { 'a.twee': ':: P\n<<set $pc.ev.tav_x to true>>\n<<if $pc.ev.tav_x>>y<</if>>' };
	const SELF_UNDECLARED = { 'bad.twee': ':: P\n<<set $pc.ev.nosuch to true>>\n<<if $pc.ev.nosuch>>y<</if>>' };
	const D = [{ id: 'tavern', prefix: ['tav_'] }];
	const selfCases = [
		['正例：声明域内且有写有读', analyze(SELF_GOOD), D, 0, 'check'],
		['未声明域 → 红', analyze(SELF_UNDECLARED), D, 1, 'check'],
		['只有写 → 红', analyze({ 'a.twee': ':: P\n<<set $pc.ev.tav_z to true>>' }), D, 1, 'check'],
		['只有读 → 红', analyze({ 'a.twee': ':: P\n<<if $pc.ev.tav_q>>y<</if>>' }), D, 1, 'check'],
		['歧义（命中两个域）→ 红', analyze(SELF_GOOD), [{ id: 'a', prefix: ['tav_'] }, { id: 'b', prefix: ['tav_x'] }], 1, 'check'],
		// #365 类：setflag 写 **world**，条件却读 **ev** → ev 那一支永远不成立
		['命名空间不一致（写 world / 读 ev）→ 必须报', analyze({ 'a.twee': ':: P\n<<setflag "seer_asked">>\n<<if $pc.ev.seer_asked>>x<</if>>' }), D, 1, 'ns'],
		['写读同域（都 world）→ 不得报', analyze({ 'a.twee': ':: P\n<<setflag "seer_asked">>\n<<if $pc.world.seer_asked>>x<</if>>' }), D, 0, 'ns'],
	];
	let selfBad = 0;
	for (const [label, keys, dm, expect, kind] of selfCases) {
		const hit = kind === 'ns' ? nsMismatch(keys).length : check(keys, dm).length;
		// 语义：expect=0 表示「必须零检出」，expect>0 表示「必须有检出」（不锁具体条数）
		const ok = expect === 0 ? hit === 0 : hit > 0;
		if (!ok) selfBad++;
		console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${hit}（期望${expect === 0 ? ' 0' : ' >0'}）`);
	}
	bad += selfBad;

	// ── 真实数据 ──
	const sources = {};
	for (const f of ctx.SRC_FILES) sources[f] = readFileSync(f, 'utf8');
	const keys = analyze(sources);
	const problems = check(keys, domains, ctx.Game.State?.bookkeeping ?? []);
	// #365：命名空间不一致 → 现在**报告**（已知缺陷形式，不判失败），等修复后转严格
	const nsBad = nsMismatch(keys);
	const byKind = problems.reduce((acc, p) => (acc[p.kind] = (acc[p.kind] ?? 0) + 1, acc), {});
	const perDomain = domains.map((d) => {
		const n = [...mergeByBare(keys).keys()].filter((b) => (d.keys ?? []).includes(b) || (d.prefix ?? []).some((p) => b.startsWith(p))).length;
		return `${d.id} ${n}`;
	});
	const bk = (ctx.Game.State?.bookkeeping ?? []).filter((k) => keys.get(k)?.w.size && !keys.get(k)?.r.size);
	console.log(`  状态键 ${keys.size} 个｜域 ${domains.length} 个（${perDomain.join(' · ')}）`);
	if (bk.length) console.log(`  仅记账键（已声明，无行为消费者）：${bk.join('、')}`);
	console.log(`  问题：未声明 ${byKind.undeclared ?? 0} · 歧义 ${byKind.ambiguous ?? 0} · 只有写 ${byKind['write-only'] ?? 0} · 只有读 ${byKind['read-only'] ?? 0} · 命名空间不一致 ${nsBad.length}`);
	for (const p of problems.slice(0, 12)) { console.log(`  ✗ ${p.key}：${p.detail}`); bad++; }
	// 命名空间不一致（#365 已修 → 转严格：任何读域缺同域写入即红灯）
	for (const p of nsBad) { console.log(`  ✗ ${p.key}：${p.detail}`); bad++; }
	if (problems.length > 12) { console.log(`  …另有 ${problems.length - 12} 项`); bad += problems.length - 12; }

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 状态契约门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 状态契约门通过（键全有域归属 · 无歧义 · 有写有读 · 命名空间一致 · 自证通过）');
	}
};
