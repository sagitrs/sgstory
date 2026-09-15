// ⓪ad 引擎门"无故事字面量"门（`#602`）——**引擎门**（判它的是"引擎门与故事内容解耦"这条结构不变量）。
//
// 为什么要有它：`AUDIT_ENGINE` 声明"判据与故事无关"，但实测出现过**假解耦**——
//   · `--text` 把**故事 1 的主题词表**与**风格违和词黑名单**写死在门代码里 ⇒ 换故事后① 主题词照打印故事 1 的词
//     （全 0 照绿＝**空判**）② 风格门拿**别人的黑名单**判你（**假红**）；
//   · `--reads` 把**故事 1 的已知存量基线**写死在门里 ⇒ 口径错位；
//   · `--sitedisc` 的自证夹具里用了**真实地名**（无害但是同一种味道）。
// ⇒ 单靠"这次搬干净"不够：**必须有门咬人**，否则下次谁往引擎门里写一个 `['月光','星']` 无人拦。
//
// 判据（三条）：
//   ① **黑名单来自故事自己**：从 `stories/**/*.twee` 自动抽"故事专有 token"——**段落名** ＋ 故事侧引用的 `Game.<X>`；
//   ② **只扫代码**：注释里的历史记述不算违规（经 `maskComments` 遮掉——本仓注释里大量记着"当初错在哪"）；
//   ③ **白名单要带理由＋票号**，且**腐烂即红**（写进白名单但已不再命中 ⇒ 报，逼你删）。
//
// 反例自证：往任一引擎门里塞一个故事词 ⇒ 必须红（本门自己的 `--selftest` 用合成源码演示；PR 里另有真实探针）。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../dist-paths.mjs';
import { allSourceFiles, CONST_SECTION } from '../../module-order.mjs';
import vm from 'node:vm';
import { maskComments } from '../lib/mask.mjs';
import { AUDIT_ENGINE } from '../../test-plan.mjs';

export const flag = 'engine-story-free';
export const flags = ['engine-story-free'];

/** 引擎/通用符号：在引擎门里出现是**份内**（不是故事专有）——新增请连同理由写这里。 */
export const ENGINE_COMMON = new Set([
	'Game', 'Game.Rules', 'Game.Pc', 'Game.Checks', 'Game.Combat', 'Game.Items', 'Game.Economy', 'Game.Gear',
	'Game.Social', 'Game.State', 'Game.Notes', 'Game.Damage', 'Game.Era', 'Game.Choice',
	'StoryInit', 'StoryCaption', 'StoryTitle', 'StoryData', 'StoryScript', 'StoryBindings', 'Story',
]);

/** 白名单**数据**（`scripts/audit/engine-story-allow.json`）：键 `<门文件>::<token>` → `理由（#票号）`。
 *  为什么放 JSON 不写在本文件：检查器**自己**也在被扫的门里——把 token 写进代码会被自己命中（实测过一次）。
 *  纪律：理由**必须带票号**；声明了却不再命中 ⇒ 报（逼你删，不留僵尸豁免）。 */
export const loadAllow = ({ root = ROOT } = {}) => {
	const p = join(root, 'scripts/audit/engine-story-allow.json');
	if (!existsSync(p)) throw new Error('缺 scripts/audit/engine-story-allow.json（白名单是数据，必须显式存在；空对象也要写）');
	return JSON.parse(readFileSync(p, 'utf8')).allow ?? {};
};

/** 纯函数：从故事源码抽"故事专有 token"（段落名 ＋ `Game.<X>`）。 */
export const storyTokensOf = (sources) => {
	const out = new Set();
	for (const src of Object.values(sources ?? {})) {
		const text = maskComments(String(src ?? ''));
		for (const m of text.matchAll(/^::\s*([^\n\[]+?)\s*(?:\[[^\]]*\])?\s*$/gm)) {
			const name = m[1].trim();
			if (name && !ENGINE_COMMON.has(name)) out.add(name);
		}
		for (const m of text.matchAll(/\bGame\.([A-Z][A-Za-z0-9_]*)/g)) {
			const sym = `Game.${m[1]}`;
			if (!ENGINE_COMMON.has(sym)) out.add(sym);
		}
	}
	return out;
};

/** 纯函数：一段"门源码"里是否出现故事 token（已遮注释）。 */
export const judgeStoryFree = ({ file = '?', src = '', tokens, allow = {} }) =>
	[...(tokens ?? [])]
		.filter((tk) => maskComments(String(src)).includes(tk))
		.filter((tk) => !allow[`${file}::${tk}`])
		.map((tk) => ({ file, token: tk }));

/** **第二档 · 成员档**（`#660` 片三-0，dev 裁定）：引擎文件里**按成员名**咬"直读故事数据"。
 *
 *  规则（刻意**不做数据流分析**）：引擎源码里出现 `(window.)?Game.<表>.<成员>`，或**一层别名**（`const T = window.Game` 之后 `T.<成员>`）
 *  —— 其中 `<表>`/`<成员>` 来自**故事声明面自动抽取**（见 `storyTableMembers()`）—— 未登记白名单 ⇒ 红。
 *  为什么按成员名：`21-resolve` 的头注记着「层间门按字面量匹配，这里**曾用别名 `T.Game` 躲过它**」⇒ 别名只要成员名对得上就跑不掉。
 *  为什么只做一层别名：**追别名是为了少误报，不是为了抓漏**（dev 口径）；更深的传播交给白名单＋理由登记。
 *  **已知漏（静态不可判，自证里断言它会漏）**：`const { events } = Game.Economy` 之后裸用 `events` —— 不解构分析、不做数据流。
 *  误报控制：只在**接收者是故事表或其一级别名**时匹配（不裸匹配 `\.events`——SugarCube/DOM 上遍地都是）。 */
/** **从故事声明面自动抽取「表 → 成员」**（`#660` 片三-0，dev 口径：成员集要自动抽、别手维护）。
 *  做法：把故事的表段（`window.Game = Object.assign(…)`）在 vm 里跑一遍（与 `test/integrity.mjs` 同法，
 *  先按 `CONST_SECTION` 跑常量行 = 真实加载顺序），再取每个 `Game.<表>` 的**自有键**。
 *  为什么不用正则解析表：表是 JS（IIFE ＋ `Object.assign`），正则会漏；vm 拿到的就是**引擎真会看到的那个对象**。 */
/** **`[script]` 段的正文**（twee 文件里按 `^:: 名 [tags]` 切块；只取带 `script` 的那种）。
 *  为什么必须切段：故事文件里**一个文件多个段**（如 `15-tables.twee` 有 `Game Tables` ＋ `StoryBindings`），
 *  整文件丢给 vm 会因为 `::` 头不是 JS 而抛错 ⇒ 成员集抽出来是**空的**（我第一版就踩了这个：0 成员）。 */
/** 逐行解析（**别用 lookahead 正则**：`\s*$` 在 `m` 模式下会在线尾提前命中 ⇒ 拿到空正文，我第一版就这么坏的）。 */
export const scriptBodies = (fileSrc) => {
	const out = [];
	let tags = null, buf = [];
	const flush = () => { if (tags && /\bscript\b/.test(tags)) out.push(buf.join('\n')); buf = []; };
	for (const line of String(fileSrc ?? '').split('\n')) {
		const h = /^::\s*[^\[]*(\[[^\]]*\])?\s*$/.exec(line);
		if (h) { flush(); tags = h[1] ?? ''; continue; }
		if (tags !== null) buf.push(line);
	}
	flush();
	return out;
};

export const storyTableMembers = (sources = {}, { seedSrc = '', onSkip = () => {} } = {}) => {
	const tables = {};
	for (const [file, src] of Object.entries(sources ?? {})) {
		for (const body of scriptBodies(String(src ?? ''))) {
			if (!/window\.Game\s*=/.test(body)) continue;
			const ctx = { window: { Game: {} } };
			const seeded = new Set();
			try {
				for (const m of String(seedSrc).matchAll(/^window\.Game\.[A-Za-z]+ \??= .*$/gm)) { vm.runInNewContext(m[0], ctx); seeded.add((/^window\.Game\.([A-Za-z]+)/.exec(m[0]) ?? [])[1]); }
				vm.runInNewContext(body, ctx);
			} catch (e) { onSkip({ file, why: e?.message ?? String(e) }); continue; }   // 段里有其它依赖 ⇒ 跳过并留痕
			// ⚠️ 只收**故事段自己声明/改动的**表：seed 进来的引擎常量（`Era`/`Damage`）不算故事成员
			//（否则 `<<damage `Game.Damage.hurt`>>` 这种**引擎用自己常量**的地方会被误报——我第一版就踩了）。
			for (const [table, v] of Object.entries(ctx.window.Game ?? {})) {
				if (seeded.has(table)) continue;
				if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
				tables[table] = [...new Set([...(tables[table] ?? []), ...Object.keys(v)])];
			}
		}
	}
	return tables;
};

export const storyMemberAliases = (src) => {
	const out = new Set();
	for (const m of String(src ?? '').matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.)?Game(?:\.[A-Za-z_$][\w$]*)?\s*[;\n]/g)) out.add(m[1]);
	return out;
};
export const memberTierProblems = ({ file = '?', src = '', tables = {}, allow = {} } = {}) => {
	const text = maskComments(String(src));
	const out = [];
	const membersOf = (table) => (tables?.[table] ?? []);
	// 形态 A：`(window.)?Game.<表>.<成员>`
	for (const m of text.matchAll(/(?:window\.)?Game\.([A-Z][A-Za-z0-9_]*)\.([A-Za-z_$][\w$]*)/g)) {
		const [full, table, member] = m;
		if (!membersOf(table).includes(member)) continue;
		const key = `${file}::Game.${table}.${member}`;
		if (!allow[key]) out.push({ file, key, form: full, why: '引擎直读故事数据成员' });
	}
	// 形态 B：**一层别名** `const A = window.Game…` ⇒ `A.<成员>`
	const aliases = storyMemberAliases(text);
	for (const a of aliases) {
		for (const m of text.matchAll(new RegExp(`\\b${a}\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
			const member = m[1];
			const tablesWith = Object.keys(tables).filter((t) => membersOf(t).includes(member));
			if (!tablesWith.length) continue;
			const key = `${file}::${a}.${member}`;
			if (!allow[key]) out.push({ file, key, form: `${a}.${member}`, why: '引擎经**一层别名**直读故事数据成员' });
		}
	}
	// 形态 C：**引擎在故事表上挂方法**时，方法里的 `this.<成员>` 就是故事数据
	//（`21-resolve` 的 `priceOf` 读 `this.events` 正是这一形态 —— 正则看不到 `Game.Economy.` 前缀，只能按"宿主"判）。
	let current = null;
	for (const line of text.split('\n')) {
		const host = /Object\.assign\(\(?window\.Game\.([A-Z][A-Za-z0-9_]*)/.exec(line);
		if (host) current = host[1];
		if (current && /^\s*\}\);\s*$/.test(line)) current = null;
		if (!current) continue;
		for (const m of line.matchAll(/\bthis\.([A-Za-z_$][\w$]*)/g)) {
			const member = m[1];
			if (!membersOf(current).includes(member)) continue;
			const key = `${file}::Game.${current}.this.${member}`;
			if (!allow[key]) out.push({ file, key, form: `this.${member}`, why: `引擎在故事表 \`Game.${current}\` 上挂的方法里直读故事数据` });
		}
	}
	return out;
};

export const run = (ctx) => {
	const { arg, wantAll } = ctx;
	if (!(wantAll || arg('engine-story-free'))) return;
	console.log('\n══ ⓪ad 引擎门"无故事字面量"门（`#602`）——声明成引擎门就得真的与故事无关 ══');
	let bad = 0;

	// ── 自证（纯函数，正反例都跑同一份判据）──
	{
		const tokens = new Set(['某故事段', 'Game.StoryThing']);
		const TB = { Economy: ['events'], Items: ['defs'] };   // 成员档的「故事声明面」夹具
		const cases = [
			['① 正例：干净的门源码 ⇒ 0 条', judgeStoryFree({ file: 'x.mjs', src: "if (arg('x')) console.log('ok')", tokens }).length === 0],
			['🔴 ① 反例：门里出现故事段落名 ⇒ 报', judgeStoryFree({ file: 'x.mjs', src: "const w = ['某故事段'];", tokens }).length === 1],
			['🔴 ① 反例：门里出现故事侧 `Game.<X>` ⇒ 报', judgeStoryFree({ file: 'x.mjs', src: 'return Game.StoryThing.items;', tokens }).length === 1],
			['② 正例：只在**注释**里提到 ⇒ 不算（本仓注释大量记述"当初错在哪"）', judgeStoryFree({ file: 'x.mjs', src: '// 历史：某故事段 曾写死在这里\nconsole.log(1)', tokens }).length === 0],
			['③ 正例：白名单（带理由＋票号）放行', judgeStoryFree({ file: 'x.mjs', src: "const a = '某故事段';", tokens, allow: { 'x.mjs::某故事段': '夹具沿用（#602）' } }).length === 0],
			['边界：无 token（故事都没声明）⇒ 0 条', judgeStoryFree({ file: 'x.mjs', src: '任何代码', tokens: new Set() }).length === 0],
			// ② **成员档**（`#660` 片三-0）
			['正例（成员档）：走 `Sg.story.econEvents()` ⇒ 0 条', memberTierProblems({ file: 'x', src: 'const e = Sg.story.econEvents();', tables: TB }).length === 0],
			['🔴 反例（成员档）：`Game.Economy.events` ⇒ 报', memberTierProblems({ file: 'x', src: 'const e = Game.Economy.events;', tables: TB }).length === 1],
			['🔴 反例（成员档）：**一层别名** `T.events` ⇒ 报（头注里「用 `T.Game` 躲过门」的那一幕）', memberTierProblems({ file: 'x', src: 'const T = window.Game;\nconst e = T.events;', tables: TB }).length === 1],
			['🔴 反例（成员档·形态 C）：在 `Game.Economy` 上挂的方法里读 `this.events` ⇒ 报（`priceOf` 的真实形态）', memberTierProblems({ file: 'x', src: 'Object.assign((window.Game.Economy ??= {}), {\n\tpick() { return this.events; },\n});', tables: TB }).length === 1],
			['边界（成员档）：引擎自有成员（`Game.Economy.apply`）⇒ 不报', memberTierProblems({ file: 'x', src: 'Game.Economy.apply(pc, "x");', tables: TB }).length === 0],
			['边界（成员档）：同名的**局部/域内**对象（`pc.events`）⇒ 不报（不裸匹配 `\\.events`）', memberTierProblems({ file: 'x', src: 'const n = pc.events.length;', tables: TB }).length === 0],
			['🔴 **已知漏**（断言它会漏）：`const { events } = Game.Economy` 之后裸用 ⇒ **0 条**（静态不可判，不做数据流）', memberTierProblems({ file: 'x', src: 'const { events } = Game.Economy;\nuse(events);', tables: TB }).length === 0],
		];
		let selfBad = 0;
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += selfBad;
	}

	// ── 真实数据：故事 token 集合 × 每个"引擎门"源码 ──
	const ALLOW = loadAllow({ root: ROOT });
	const storyFiles = allSourceFiles().filter((f) => f.startsWith('stories/'));
	const storySources = Object.fromEntries(storyFiles.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
	const tokens = storyTokensOf(storySources);
	const gatesDir = join(ROOT, 'scripts/audit/gates');
	const gateFiles = existsSync(gatesDir) ? readdirSync(gatesDir).filter((f) => f.endsWith('.mjs')) : [];
	const engineGates = [];
	for (const f of gateFiles) {
		const src = readFileSync(join(gatesDir, f), 'utf8');
		const declared = [...src.matchAll(/export const flags?\s*=\s*(?:\[([^\]]*)\]|'([^']+)')/g)]
			.flatMap((m) => (m[1] ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [m[2]]));
		if (declared.some((fl) => AUDIT_ENGINE.includes(fl))) engineGates.push({ file: f, src, flags: declared });
	}
	let hitsAll = 0;
	for (const g of engineGates) {
		const hits = judgeStoryFree({ file: g.file, src: g.src, tokens, allow: ALLOW });
		hitsAll += hits.length;
		for (const h of hits) { console.log(`  ✗ 引擎门「${h.file}」出现故事专有字面量「${h.token}」——数据请搬到 \`stories/<slug>/audit.json\` 或该故事自己的表（#602）`); bad++; }
	}
	// ── 第二档 · **成员档**（`#660` 片三-0，dev 裁定）：引擎**源码**里不许直读故事数据成员 ──
	//  成员集从**故事声明面自动抽**（`storyTableMembers()` 把故事表段跑一遍取自有键）；
	//  规则＝「出现故事表成员名（含**一层别名**与**在故事表上挂方法时的 `this.<成员>`**）、且未登记 ⇒ 红」。
	{
		const seedSrc = (CONST_SECTION.files ?? []).map((f) => { const fp = join(ROOT, f); return existsSync(fp) ? readFileSync(fp, 'utf8') : ''; }).join('\n');
		const skips = [];
		const tables = storyTableMembers(storySources, { seedSrc, onSkip: (x) => skips.push(x) });
		for (const s2 of skips) console.log(`  · 成员档：段载入跳过（${s2.file}）——${String(s2.why).slice(0, 80)}`);
		if (!Object.keys(tables).length) { console.log('  ✗ 成员档：**一张表都没抽到**（抽取器坏了？别让门静默变成空判）'); bad++; }
		const engineSrc = allSourceFiles().filter((f) => f.startsWith('src/'));
		let memberHits = 0, stales = 0;
		for (const f of engineSrc) {
			const src = readFileSync(join(ROOT, f), 'utf8');
			const hits = memberTierProblems({ file: f, src, tables, allow: ALLOW });
			memberHits += hits.length;
			for (const h of hits) { console.log(`  ✗ 引擎文件「${h.file}」${h.why}：\`${h.form}\`——请走 \`Sg.story.*\`（#660 片三）`); bad++; }
			// 白名单腐烂（成员档）：登记了、但**现在不再命中** ⇒ 报（逼你删）
			for (const [k, why] of Object.entries(ALLOW)) {
				if (!k.startsWith(`${f}::`)) continue;
				const bare = memberTierProblems({ file: f, src, tables, allow: {} }).map((x) => x.key);
				if (!bare.includes(k)) { console.log(`  ✗ 白名单腐烂（成员档）：「${k}」已不再命中——接缝做完就删（理由：${why}）`); bad++; stales++; }
			}
		}
		const memberTotal = Object.values(tables).reduce((a, m) => a + m.length, 0);
		console.log(`  · 成员档：故事成员 ${memberTotal} 项（${Object.keys(tables).length} 张表，**自动抽取**）· 引擎文件 ${engineSrc.length} 个 · 命中 ${memberHits} 处 · 腐烂 ${stales} 处`);
		console.log('  · 已知漏（静态不可判，**不上数据流分析**）：`const { events } = Game.Economy` 之后裸用；`this.<成员>` 在**没有** `Object.assign(window.Game.X…)` 包着时也判不出（自证里已断言两者会漏）');
	}

	// 白名单**理由必须带票号**（空理由/无票号 ⇒ 红）
	for (const [k, why] of Object.entries(ALLOW)) if (!/#\d+/.test(String(why))) { console.log(`  ✗ 白名单「${k}」的理由缺票号（必须写明"为什么放行"并挂票）`); bad++; }
	// 白名单腐烂（声明了却不再命中）⇒ 报，逼你删
	// 腐烂检查**只覆盖第一档（字面量档）**：成员档的键指向**引擎源文件**（`src/…`），由上面那块单独查 ✓
	const stale = Object.keys(ALLOW).filter((k) => !k.startsWith('src/')).filter((k) => {
		const [file, token] = k.split('::');
		const g = engineGates.find((x) => x.file === file);
		return !g || !g.src.includes(token);
	});
	for (const k of stale) { console.log(`  ✗ 白名单腐烂：「${k}」已不再命中——请删除（不留僵尸豁免）`); bad++; }
	console.log(`  · 故事 token ${tokens.size} 个（来自 ${storyFiles.length} 个故事文件）· 引擎门 ${engineGates.length} 个（${engineGates.map((g) => g.flags[0]).join(' ')}）· 命中 ${hitsAll} 处 · 白名单 ${Object.keys(ALLOW).length} 条`);

	if (bad) { console.error(`\n✗ 引擎门"无故事字面量"门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 引擎门"无故事字面量"门通过（两档：**字面量档**＝故事 token 不经引擎门；**成员档**＝引擎源文件不直读故事数据成员）· 注释不算 · 白名单带票号＋移除计划且不许腐烂');
};
