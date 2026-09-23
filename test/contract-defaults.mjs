// `#1188` 续片·A 半的判据件（规格在 `editor/lib/core/contract-defaults.mjs`）。
//
// 三格是**失败面**（红即要处理）：
// 死声明：声明了但引擎从不读
// 冗余声明：值等于缺省、且读点全带守卫 → 这条声明该去掉（去声明的前提就是读点全带守卫）
// 读了而没声明又没有缺省：缺口（这条替代了原先设想的"可选面白名单"）
// 一格是**信息面**（打印工作清单，不算红）：
// 值等于缺省但读点有无守卫的 → 先加守卫才谈得上去声明（B 半清单，票面钉进度）
//
// 外加：守卫判据的**能红对**（合成输入：无守卫 → 不算可去；有守卫 → 算可去），以及反向核
//（引擎读点与成员数必须命中钉死值，防"抽不到东西 → 判据空转假绿"）。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS, CAPABILITY_MEMBERS, equalsDefault, isGuardedRead, dataMemberCount, defaultProblems, READ_FORMS, deriveContractAliases, isTweeFile, contractReadDomain } from '../editor/lib/core/contract-defaults.mjs';
import { storySlugs } from '../scripts/dist-paths.mjs';
import { maskComments } from '../editor/lib/core/mask.mjs';
import { outsideQuotes } from '../editor/lib/host/k6criteria.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
/** 反向核：三故事的数据成员数（能力开关不计）。改动契约时同片更新。 */
// 现状（A 半不动契约）。B 半逐名加守卫并去声明之后，这三个数会下降（票面 `#1216` 钉进度）。
const EXPECTED_DATA_MEMBERS = { 'face-fixture': 21, 'minimal-demo': 9, 'night-ferry': 10 };   // `#1186`（流一）引入契约面 `pcShape` 后 face-fixture +1（跨票联动：谁后合谁带上）

let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

// ── 采集：故事声明的成员 ＋ 引擎读点（含成员名之后的原文，用来判守卫）──
const membersByStory = {};
for (const slug of storySlugs().filter((s) => !s.startsWith('__'))) {
	const p = join(ROOT, 'stories', slug, 'data', 'contract.json');
	if (!existsSync(p)) continue;
	membersByStory[slug] = JSON.parse(readFileSync(p, 'utf8')).members ?? [];
}
const readsByMember = {};
// 判据的**域**：只采集"某故事声明过的契约成员"的读点（域的定义在权威件 `contractReadDomain` 里）。
const readDomain = contractReadDomain(membersByStory);
const walk = (rel) => {
	const abs = join(ROOT, rel);
	for (const e of readdirSync(abs, { withFileTypes: true })) {
		const r = `${rel}/${e.name}`;
		if (e.isDirectory()) { if (!/^(node_modules|dist|build|\.)/.test(e.name)) walk(r); continue; }
		if (!r.endsWith('.twee')) continue;
		const srcText = readFileSync(join(ROOT, r), 'utf8');
		const lines = maskComments(srcText).split('\n');
		const isTwee = isTweeFile(r);
		for (let i = 0; i < lines.length; i++) {
			// 读点**形态**取权威表（一处定义、别处引用）。别名形态按 `X = Sg.story` **派生**，不硬编具体别名。
			const specs = [{ re: new RegExp(READ_FORMS[0].re.source, 'g'), beforeOf: (m) => m[0] }];
			// 别名形态对**所有件**都成立（twee 件里的 JS 块同样会 `const S = Sg.story`）⇒ 不按件类型收窄。
			for (const a of deriveContractAliases(srcText)) {
				const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				specs.push({ re: new RegExp(esc + '\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)', 'g'), beforeOf: (m) => m[0] });
			}
			for (const spec of specs) {
				spec.re.lastIndex = 0;
				let m;
				while ((m = spec.re.exec(lines[i])) !== null) {
					// JS 件里字符串字面量中的**提名**不是读点（错误消息文案常见）；twee 件的 `` `…` `` 是**表达式插值** ⇒ 不跳。
					if (!outsideQuotes(lines[i], m.index, { backtickIsQuote: !isTwee })) continue;
					const tail = lines[i].slice(m.index + m[0].length);
					if (!readDomain.has(m[1])) continue;
					(readsByMember[m[1]] ??= []).push({ file: r, line: i + 1, tail, before: spec.beforeOf(m) });
				}
			}
		}
	}
};
walk('src');
const readNames = Object.keys(readsByMember);
const problems = defaultProblems({ membersByStory, readsByMember, defaults: DEFAULTS });

// ── 失败面 ──
// 失败面只留两条：死声明、读了而没声明又无缺省。
// `redundant-declaration` 与 `needs-guard-first` 都归**信息面**（B 半工作清单）——理由：A 半实测过，去掉那三条
// `mechanics` 会撞 L1 契约键集合与等价面（九段红）→ "该去"与"能去"是两件事，先把前提摆出来，由 `#1216` 跟踪。
for (const code of ['dead-declaration', 'read-without-default']) {
	const list = problems.filter((p) => p.code === code);
	ok(`失败面·${code} 为空`, list.length === 0, list.map((p) => `${p.slug}:${p.name}${p.why ? `（${p.why}）` : ''}`).join(' / '));
}

// ── 信息面：B 半工作清单（不算红，但要打印出来给人看）──
{
	const needs = problems.filter((p) => p.code === 'needs-guard-first');
	console.log(`  · B 半工作清单（值等于缺省但读点无守卫，先加守卫再去声明）：${needs.length} 项`);
	for (const p of needs) console.log(`      ${p.slug}:${p.name}（${p.why}）`);
		for (const p of needs) console.log(`        点位：${(p.at ?? []).join(' ｜ ')}`);
	const redundant = problems.filter((p) => p.code === 'redundant-declaration');
	console.log(`  · 该去但前提未满足（去声明会撞 L1／等价面，见票面 #1216）：${redundant.length} 项`);
	for (const p of redundant) console.log(`      ${p.slug}:${p.name}（${p.why}）`);
	ok('信息面·该去的声明可枚举（不是空跑）', redundant.length + needs.length > 0);
	ok('信息面·B 半清单可枚举（不是空跑）', needs.length > 0);
}

// ── 能力开关 ──
{
	ok('能力开关仅一名', CAPABILITY_MEMBERS.size === 1 && CAPABILITY_MEMBERS.has('hasChargen'));
	ok('能力开关不混进数据成员计数（夜渡口径）', dataMemberCount(membersByStory['night-ferry'] ?? []) === EXPECTED_DATA_MEMBERS['night-ferry'], `实得 ${dataMemberCount(membersByStory['night-ferry'] ?? [])}`);
}

// ── 反向核：三故事数据成员数 ＋ 引擎读点规模 ──
{
	const wrong = Object.entries(EXPECTED_DATA_MEMBERS).filter(([slug, n]) => dataMemberCount(membersByStory[slug] ?? []) !== n);
	ok('反向核·三故事数据成员数命中钉死值', wrong.length === 0, wrong.map(([s, n]) => `${s} 期望 ${n} 实得 ${dataMemberCount(membersByStory[s] ?? [])}`).join(' / '));
	ok('反向核·引擎读点规模（成员名 ≥ 20）', readNames.length >= 20, `实得 ${readNames.length}`);
}

// ── 守卫判据的能红对（合成输入）──
{
	ok('能红·无守卫的读点不算"可去"', !isGuardedRead('(site)') && !isGuardedRead('()'));
	ok('能红·可选链与空值合并算"可去"', isGuardedRead('?.(site)') && isGuardedRead(' ?? {}'));
	const synthMembers = { 's1': [{ name: 'checkSite', kind: 'null' }] };
	const unguarded = defaultProblems({ membersByStory: synthMembers, readsByMember: { checkSite: [{ file: 'x.twee', line: 1, tail: '(site)' }] } });
	ok('能红·无守卫 ⇒ 报"先加守卫"且不报"冗余"', unguarded.some((p) => p.code === 'needs-guard-first') && !unguarded.some((p) => p.code === 'redundant-declaration'), JSON.stringify(unguarded));
	const guarded = defaultProblems({ membersByStory: synthMembers, readsByMember: { checkSite: [{ file: 'x.twee', line: 1, tail: '?.(site)' }] } });
	ok('能红·全带守卫 ⇒ 报"冗余声明"（该去掉）', guarded.some((p) => p.code === 'redundant-declaration'), JSON.stringify(guarded));
	// 规格自身的完整性
	const missingDate = Object.entries(DEFAULTS).filter(([, d]) => !d.verified);
	ok('规格每条缺省都带"最后一核验"', missingDate.length === 0, missingDate.map(([n]) => n).join(' / '));
	ok('规格里 equalsDefault 只认同形态或同值', equalsDefault({ name: 'mechanics', kind: 'null' }) && equalsDefault({ name: 'poisonReduce', kind: 'const', value: 0 }) && !equalsDefault({ name: 'poisonReduce', kind: 'const', value: 1 }));
}

console.log(bad === 0 ? '\n✔ 契约缺省规格判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
