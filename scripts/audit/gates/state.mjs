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
				...[...line.matchAll(/\$pc\.(?:ev|world)\.([a-z_]\w*)\s+to\b/g)].map((m) => m[1]),
				...[...line.matchAll(/\bpc\.(?:ev|world)\.([a-z_]\w*)\s*=[^=]/g)].map((m) => m[1]),
				...[...line.matchAll(/<<setflag "([a-z_]\w*)"/g)].map((m) => m[1]),
				...[...line.matchAll(/<<firstTime "([a-z_]\w*)"/g)].map((m) => m[1]),
				...[...line.matchAll(/\$pc\.ev\[['"]([a-z_]\w*)['"]\]/g)].map((m) => m[1]),
			];
			for (const k of writes) bump(k, 'w', site);
			// firstTime 是「读一次再写」——记成动态读，避免误判「只有写」
			for (const m of line.matchAll(/<<firstTime "([a-z_]\w*)"/g)) { bump(m[1], 'r', site + '(firstTime)'); keys.get(m[1]).dynamic = true; }
			const reads = [
				...[...line.matchAll(/\$pc\.(?:ev|world)\.([a-z_]\w*)/g)].map((m) => m[1]),
				...[...line.matchAll(/\bpc\.(?:ev|world)\.([a-z_]\w*)/g)].map((m) => m[1]),
				...[...line.matchAll(/\bp\.world\?\.([a-z_]\w*)/g)].map((m) => m[1]),
				// 表内谓词的另一形态：p.ev?.keeper_why（#318 实测漏检 → 误报「只有写」）
				...[...line.matchAll(/\bp\.ev\??\.([a-z_]\w*)/g)].map((m) => m[1]),
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
export const check = (keys, domains, bookkeeping = []) => {
	const problems = [];
	const match = (k) => domains.filter((d) => (d.keys ?? []).includes(k) || (d.prefix ?? []).some((p) => k.startsWith(p)));
	for (const [k, v] of keys) {
		const hits = match(k);
		if (hits.length === 0) problems.push({ kind: 'undeclared', key: k, detail: `未落入任何域（Game.State.domains）——新增状态键必须登记` });
		else if (hits.length > 1) problems.push({ kind: 'ambiguous', key: k, detail: `同时命中 ${hits.map((d) => d.id).join('/')}，归属必须唯一` });
		// 「仅记账」：消费者就是登记表本身（出处/复访记账）——必须在 Game.State.bookkeeping 里显式声明，否则照旧红
		if (v.w.size && !v.r.size && !bookkeeping.includes(k)) problems.push({ kind: 'write-only', key: k, detail: `只有写没有读（写于 ${[...v.w].join('、')}）；若确属「仅记账」请登记进 Game.State.bookkeeping` });
		if (v.r.size && !v.w.size) problems.push({ kind: 'read-only', key: k, detail: `只有读没有写（读于 ${[...v.r].slice(0, 3).join('、')}）——幽灵条件/死分支` });
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
		['正例：声明域内且有写有读', analyze(SELF_GOOD), D, 0],
		['未声明域 → 红', analyze(SELF_UNDECLARED), D, 1],
		['只有写 → 红', analyze({ 'a.twee': ':: P\n<<set $pc.ev.tav_z to true>>' }), D, 1],
		['只有读 → 红', analyze({ 'a.twee': ':: P\n<<if $pc.ev.tav_q>>y<</if>>' }), D, 1],
		['歧义（命中两个域）→ 红', analyze(SELF_GOOD), [{ id: 'a', prefix: ['tav_'] }, { id: 'b', prefix: ['tav_x'] }], 1],
	];
	let selfBad = 0;
	for (const [label, k, d, expect] of selfCases) {
		const hit = check(k, d).length;
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
	const byKind = problems.reduce((acc, p) => (acc[p.kind] = (acc[p.kind] ?? 0) + 1, acc), {});
	const perDomain = domains.map((d) => {
		const n = [...keys.keys()].filter((k) => (d.keys ?? []).includes(k) || (d.prefix ?? []).some((p) => k.startsWith(p))).length;
		return `${d.id} ${n}`;
	});
	const bk = (ctx.Game.State?.bookkeeping ?? []).filter((k) => keys.get(k)?.w.size && !keys.get(k)?.r.size);
	console.log(`  状态键 ${keys.size} 个｜域 ${domains.length} 个（${perDomain.join(' · ')}）`);
	if (bk.length) console.log(`  仅记账键（已声明，无行为消费者）：${bk.join('、')}`);
	console.log(`  问题：未声明 ${byKind.undeclared ?? 0} · 歧义 ${byKind.ambiguous ?? 0} · 只有写 ${byKind['write-only'] ?? 0} · 只有读 ${byKind['read-only'] ?? 0}`);
	for (const p of problems.slice(0, 12)) { console.log(`  ✗ ${p.key}：${p.detail}`); bad++; }
	if (problems.length > 12) { console.log(`  …另有 ${problems.length - 12} 项`); bad += problems.length - 12; }

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 状态契约门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 状态契约门通过（键全有域归属 · 无歧义 · 有写有读 · 自证通过）');
	}
};
