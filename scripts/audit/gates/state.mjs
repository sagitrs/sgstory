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
import { declWriteKeys, qualifiedWriteKeys, keyCharsetViolations, readKeys, noteReadKeys, noteWriteKeys, ruleRowKeys, ruleRowSetKeys, maskComments, notePaths } from '../lib/shared.mjs';

export const flag = 'state';
export const flags = ['state'];

const stripComments = (t) => t.replace(/\/%[\s\S]*?%\//g, '');

// ── 动态写点（#436-c①）：模板字面量键（``<<firstTime `"cellar_" + $era`>>``）──────────────────
// **静态看不到具体键**（`analyze()` 的字面量正则匹配不到）⇒ 这类键此前**既不算写点、也不进域表**，
// 即「按域表盘点」会静默漏掉它们（`#432` 的 93 键盘点就踩过同一口子：文档写 78，实测 93）。
// 口径：**看不见的要看得见地登记**——故事侧在 `Game.State.dynamicKeys` 里声明**族**（`prefix`／`via`／`values`），
// 本门负责：① 展开成具体键**参与既有四条判定**；② **未覆盖**的动态写点 ⇒ 红（防悄悄多出一族）；
//            ③ 声明了却没有对应写点 ⇒ 红（**反沉默**：搬家/改名后声明不许留成僵尸）。
export const dynamicSites = (sources) => {
	const out = [];
	for (const [f, raw] of Object.entries(sources)) {
		const t = stripComments(raw);
		let passage = '?';
		for (const line of t.split('\n')) {
			if (line.startsWith(':: ')) passage = line.slice(3).trim();
			for (const m of line.matchAll(/<<(firstTime|setflag)\s+`([^`]*)`/g)) {
				out.push({ file: f.split('/').pop(), passage, via: m[1], expr: m[2].trim() });
			}
		}
	}
	return out;
};

// 纯函数：声明族 → 具体键（`ev.<prefix><value>`；`firstTime` 写/读的都是 **ev 域**，见 `10-core` 的 widget）
export const expandDynamic = (declared = []) => {
	const keys = [];
	for (const fam of declared) {
		for (const v of fam.values ?? []) keys.push({ key: `ev.${fam.prefix}${v}`, family: fam });
	}
	return keys;
};

// 纯函数：动态写点 × 声明族 → 问题清单（未覆盖写点 ⇒ 红；僵尸声明 ⇒ 红）
export const checkDynamic = (sites, declared = []) => {
	const problems = [];
	const covered = (s) => declared.some((fam) => fam.via === s.via && String(s.expr).includes(fam.prefix));
	for (const s of sites) {
		if (!covered(s)) {
			problems.push({
				kind: 'undeclared-dynamic',
				key: s.expr,
				detail: `${s.file}:${s.passage} 的 \`<<${s.via} \`…\`>>\`（表达式 \`${s.expr}\`）**没有任何声明的动态族覆盖它** ⇒ 这类键静态看不见、会静默漏出域表。请在 \`Game.State.dynamicKeys\` 登记 { prefix, via, values }`,
			});
		}
	}
	for (const fam of declared) {
		const hit = sites.some((s) => fam.via === s.via && String(s.expr).includes(fam.prefix));
		if (!hit) problems.push({ kind: 'stale-dynamic', key: fam.prefix, detail: `声明了动态族 \`${fam.prefix}\`（via ${fam.via}）但**源码里没有对应的动态写点**——改名/搬家后请同步声明（否则声明会烂在那里）` });
	}
	return problems;
};

// 纯函数（#476 复核遗留的**地雷**）：键名不匹配 `[a-z_]\w*` 的写点，写点正则会**静默漏检**它。
// 旧位置在 `analyze()` 里往一个**那个作用域根本不存在的 `problems`** 上 push ⇒ 一旦真出现这类键，
// 门会 **抛 ReferenceError（崩）而不是报红**（今天现网无此类键 ⇒ 潜伏）。这里改成独立纯函数：
// `analyze()` 保持纯、由调用方（`run()`）合并进 problems，且**可被自证直接驱动**（含"不崩"这一条）。
export const charsetViolations = (sources) => {
	const out = [];
	for (const [f, raw] of Object.entries(sources)) {
		const t = stripComments(raw);
		let passage = '?';
		for (const line of t.split('\n')) {
			if (line.startsWith(':: ')) passage = line.slice(3).trim();
			for (const k of keyCharsetViolations(line)) {
				out.push({ kind: 'key-charset', key: k, detail: `${f.split('/').pop()}:${passage} 的键名不匹配 [a-z_]\\w* —— 写点正则会静默漏检它（要么改名，要么放宽 WRITE_PATTERNS 并同步 state.mjs）` });
			}
		}
	}
	return out;
};

// 纯函数：给 { 文件: 源码 }，返回键的写/读图（供自证喂合成源码）
// 命名空间：`ev.`（事件/证据）与 `world.`（世界态）。**同一个键名在两个域里各有一份**——
// 只按裸键名归并会漏掉「写 world.X / 读 ev.X」这类失效（#365：观星者写 world.seer_asked、
// 跨时代门读 ev.seer_asked → 证据支路静默失效）。故写/读都记成 `域.键`。
export const analyze = (sources, { notes, rules, asks, declReads } = {}) => {
	const keys = new Map();
	const bump = (k, kind, site) => {
		if (!keys.has(k)) keys.set(k, { w: new Set(), r: new Set(), dynamic: false });
		keys.get(k)[kind].add(site);
	};
	// `#785`：**声明式写点**（效果从函数搬进声明后，这是唯一来源 ✓）—— 调用方**注入** `asks`／`rules` ✓，
	// **不读环境** ✗（会污染自证夹具）；放在行循环**外**：它与行无关，逐行加会把站点点错 ✗。
	for (const k of declWriteKeys([...(rules ?? []), ...(asks ?? [])], notes)) bump(k, 'w', '数据面（声明）');
	for (const [f, raw] of Object.entries(sources)) {
		const t = stripComments(raw);
		let passage = '?';
		for (const line of t.split('\n')) {
			if (line.startsWith(':: ')) passage = line.slice(3).trim();
			const site = `${f.split('/').pop()}:${passage}`;
			// 写点形态取自**单一权威** `WRITE_PATTERNS`（#476 复核建议）；`$pc.ev['x']` 那一条是**读**
			// （firstTime 的读侧），不属于写点，仍留在本门。
			const writes = [
				...qualifiedWriteKeys(line),
				// #434：写点新增一种形状 —— `Sg.notes.add('n_x')` 写的是该笔记 `flagPath` 的键
				...noteWriteKeys(line, notes),
				...[...line.matchAll(/\$pc\.ev\[['"]([a-z_]\w*)['"]\]/g)].map((m) => `ev.${m[1]}`),
			];
			for (const k of writes) bump(k, 'w', site);
			// 键名形态的前提已抽成 `charsetViolations()`（#436-c①：原先在这里 push 一个**不存在的** `problems`
			// ⇒ 真出现这类键时门会崩而不是报红）；`analyze()` 保持纯函数，由 `run()` 合并进 problems。
			// firstTime 是「读一次再写」——记成动态读，避免误判「只有写」
			// firstTime 读的是 **ev 域**（其 widget 写/读 `$pc.ev[$args[0]]`）——此前写成裸键名，
			// 导致 nsMismatch 报出「读的是 tav_seen.tav_seen」这种自指假阳性。
			for (const m of line.matchAll(/<<firstTime "([a-z_]\w*)"/g)) {
				const key = `ev.${m[1]}`;
				bump(key, 'r', site + '(firstTime)');
				if (keys.has(key)) keys.get(key).dynamic = true;
			}
			// 读点形态取自**单一权威** `readKeys()`（`lib/shared.mjs`；与写点并列，`#436` 原范围 1）
			// ＋ **经笔记的读**（`#433` 阶段 2：`Sg.notes.has('n_x')` 读的是那条笔记的 flagPath 键）
			for (const k of [...readKeys(line), ...noteReadKeys(line, notes)]) bump(k, 'r', site);
		}
	}
	// 声明式写点（`#787` 翻面）：**条件行**与 **ask** 的 `sets`／`yields` 也是写点。
	// 此前只算文本形态（`$pc.ev.x = …`／`Sg.notes.add`）⇒ 故事把「谁写了哪个旗标」搬进数据面之后，
	// 这些写点**静默不可见** ⇒ 报「只有读没有写（幽灵条件）」的**假红** ✗（实测 6 项）。
	// 帮手 `ruleRowSetKeys`/`ruleRowKeys` 本就在本文件里（自证一直在用）⇒ 这里只是把它接到真路径上。
	// 声明面**读点**（`#787`）：条件行／诉求表的 `req`（以及 `run` 里 harvest 的 `any`／`req`）。
	// 写侧由 `declWriteKeys` 单一权威负责（K6 口径）⇒ 这里**只补读**，不再各写一份 ✗。
	const declSite = '声明面(data/)';
	for (const row of [...(Array.isArray(rules) ? rules : Object.values(rules ?? {})), ...(asks ?? [])]) {
		for (const k of ruleRowKeys(row ?? {}, notes ?? {})) bump(k, 'r', declSite);
	}
	// 声明面里的 `any`／`req` 条件键也算读 —— 但**只给"有人写的键"补读**：
	// 否则会把 `inv:时光护符`／笔记 id／嵌套路径也塞进门（实测：未声明 18 条、只有读 21 条的新噪声 ✗）。
	const bareOf = (x) => String(x).replace(/^(ev|world)\./, '');
	// 用**键图里那个键本身**去 bump（带上域前缀）—— 不能 bump 裸名：门的命名空间判定靠前缀，
	// 裸名会被读成"域 = 它自己"⇒ 报 12 条 `fog_thin.fog_thin` 式的**自指假红** ✗（实测）。
	for (const k of declReads ?? []) {
		if (!k) continue;
		const b = bareOf(k);
		for (const [mk, v] of keys) if (bareOf(mk) === b && v.w.size) { bump(mk, 'r', declSite); break; }
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
		if (isPortalKey(b)) continue;   // `#1132`：读取面键形（`codex:`）无写点 ⇒ 「同域写入」这条对它不适用 ✓（域归属由 `check` 查 ✓）
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

/** `#1132`：**读取面键形**（portal）—— 值来自**运行时面**（存档／持有物／时代／笔记），"写"发生在引擎机制或
 *  故事数据里，**不在 `pc` 键图里** ⇒ 它们**本来就没有写点** ✗。
 *  `inv:`／`era:`／`gear:`／`n_` 这一族走的是"根本不进键图"（扫键正则不含 `:`／`n_` 前缀 ⇒ 见 `analyze`）✓；
 *  而 `codex:` 会被**声明面读点**（条件行的 `req`）bump 进图 ⇒ 必须在此显式豁免"读写参与"✓。
 *  ⚠️ **豁免只针对读写判定** ✗：**域归属照查** ✓（扩员不许顺手把域门放掉 —— 评审点名的"域侧守卫" ✓）。 */
export const isPortalKey = (b) => /^codex:/.test(String(b));

export const check = (keys, domains, bookkeeping = [], notes = {}) => {
	// `#728`（C-2c-4 口径 (a)）：**单源笔记的 `flagPath` 键从状态图退场** ——
	// 它们的事实已住 `pc.ev.notes`（C-2c-2 起 `has(id) = stored(id)`），旗标写入正在退场（`add()` 停写）
	// ⇒ 留在图里只会剩"只有读"的假问题。**多源**笔记的键**不退场**（其 path 是"哪一条拿到了"的语义）。
	for (const [, paths] of notePaths(notes ?? {})) {
		if (paths.length !== 1) continue;
		const q = String(paths[0]);
		keys.delete(q);
		keys.delete(q.replace(/^(ev|world)\./, ''));
	}
	const problems = [];
	const match = (b) => domains.filter((d) => (d.keys ?? []).includes(b) || (d.prefix ?? []).some((p) => b.startsWith(p)));
	for (const [b, m] of mergeByBare(keys)) {
		const hits = match(b);
		if (hits.length === 0) problems.push({ kind: 'undeclared', key: b, detail: `未落入任何域（Game.State.domains）——新增状态键必须登记` });
		else if (hits.length > 1) problems.push({ kind: 'ambiguous', key: b, detail: `同时命中 ${hits.map((d) => d.id).join('/')}，归属必须唯一` });
		// 「仅记账」：消费者就是登记表本身——必须显式声明
		if (m.wSites.size && !m.rSites.size && !bookkeeping.includes(b)) problems.push({ kind: 'write-only', key: b, detail: `只有写没有读（写于 ${[...m.wSites].join('、')}）；若确属「仅记账」请登记进 Game.State.bookkeeping` });
		// `#1132`：读取面键形（`codex:`）**不参与读写判定** ✗（它本就没有写点 ✓）；域归属上面的 `undeclared/ambiguous` 照查 ✓。
		if (m.rSites.size && !m.wSites.size && !isPortalKey(b)) problems.push({ kind: 'read-only', key: b, detail: `只有读没有写（读于 ${[...m.rSites].slice(0, 3).join('、')}）——幽灵条件/死分支` });
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
		// #580：遮蔽（`writeKeys`/`qualifiedWriteKeys` 先遮后扫）——注释里的写点不是写点
		['正例（#580）：`//` 注释里的写点不算写 ⇒ 不报', analyze({ 'a.twee': ':: P\n// <<set $pc.ev.tav_x to true>>' }), D, 0, 'check'],
		['正例（#580）：`/* */` 里的写点不算写 ⇒ 不报', analyze({ 'a.twee': ':: P\n/* pc.ev.tav_x = true; */' }), D, 0, 'check'],
		['反例（#580）：真代码里的写点必须算 ⇒ 未读时必报', analyze({ 'a.twee': ':: P\n<<set $pc.ev.tav_x to true>>' }), D, 1, 'check'],
		['正例：声明域内且有写有读', analyze(SELF_GOOD), D, 0, 'check'],
		['未声明域 → 红', analyze(SELF_UNDECLARED), D, 1, 'check'],
		['只有写 → 红', analyze({ 'a.twee': ':: P\n<<set $pc.ev.tav_z to true>>' }), D, 1, 'check'],
		['只有读 → 红', analyze({ 'a.twee': ':: P\n<<if $pc.ev.tav_q>>y<</if>>' }), D, 1, 'check'],
		// `#1132`：**读取面键形（`codex:`）** 三格 —— 扩员只跳"读写判定"，**域归属照查** ✓
		['正例·portal：`codex:final` **有域** ⇒ 不报"只有读"（它本就没有写点 ✓）',
			analyze({ 'a.twee': ':: P\n<<rules "P">>' }, { notes: {}, rules: [{ id: 'r', scope: 'P', req: ['codex:final'] }] }),
			[{ id: 'fixture', prefix: [], keys: ['codex:final'] }], 0, 'check'],
		['🔴 域侧守卫：`codex:xxx` **无域** ⇒ 域缺失仍红 ✗（豁免不得吞掉域门 ✓）',
			analyze({ 'a.twee': ':: P\n<<rules "P">>' }, { notes: {}, rules: [{ id: 'r', scope: 'P', req: ['codex:xxx'] }] }),
			[{ id: 'fixture', prefix: [], keys: ['codex:final'] }], 1, 'check'],
		['🔴 反例：**普通键**只有读且无域 ⇒ 照红（证明 portal 只对 `codex:` 生效 ✓）',
			analyze({ 'a.twee': ':: P\n<<if $pc.ev.tav_q>>y<</if>>' }, { notes: {}, rules: [] }),
			[{ id: 'tv', prefix: ['tav_'] }], 1, 'check'],
		// `#608`：**声明面驱动的写点**——引擎侧是变量（`<<note _note>>`），字面 id 只在故事数据表里（`failNote`）
		['正例（#608）：声明面 `failNote` 的写点 ⇒ 不算「只有读」', analyze({ 'a.twee': `:: T\n\tencounters: { short: { failNote: 'n_tav_x' } },\n:: P\n<<if Sg.notes.has('n_tav_x')>>y<</if>>` }, { notes: { n_tav_x: { flagPath: 'ev.tav_x' } } }), [{ id: 'tavern', prefix: ['tav_'] }], 0, 'check'],
		['反例（#608／#728）：**多源**笔记且没有声明面写点 ⇒ 仍必须报「只有读」（保证上面那条不是空判）', { src: { 'a.twee': `:: P\n<<if Sg.notes.has('n_tav_x')>>y<</if>>` }, notes: { n_tav_x: { flagPath: ['ev.tav_x', 'world.tav_x2'] } } }, [{ id: 'tavern', prefix: ['tav_'] }], 1, 'retire'],
		['正例（#728）：**单源**笔记的 `flagPath` 键只有笔记本读 ⇒ 退场，不报「只有读」', { src: { 'a.twee': `:: P\n<<if Sg.notes.has('n_tav_x')>>y<</if>>` }, notes: { n_tav_x: { flagPath: 'ev.tav_x' } } }, [{ id: 'tavern', prefix: ['tav_'] }], 0, 'retire'],
		['🔴 反例（#728）：**非笔记**键只有读 ⇒ 照常报（退场只针对单源笔记的 flagPath）', { src: { 'a.twee': `:: P\n<<if $pc.ev.tav_loose>>y<</if>>` }, notes: { n_tav_x: { flagPath: 'ev.tav_x' } } }, [{ id: 'tavern', prefix: ['tav_'] }], 1, 'retire'],
		['歧义（命中两个域）→ 红', analyze(SELF_GOOD), [{ id: 'a', prefix: ['tav_'] }, { id: 'b', prefix: ['tav_x'] }], 1, 'check'],
		// #365 类：setflag 写 **world**，条件却读 **ev** → ev 那一支永远不成立
		['命名空间不一致（写 world / 读 ev）→ 必须报', analyze({ 'a.twee': ':: P\n<<setflag "seer_asked">>\n<<if $pc.ev.seer_asked>>x<</if>>' }), D, 1, 'ns'],
		['写读同域（都 world）→ 不得报', analyze({ 'a.twee': ':: P\n<<setflag "seer_asked">>\n<<if $pc.world.seer_asked>>x<</if>>' }), D, 0, 'ns'],
		// #436-c①：动态族（模板字面量键——静态看不见，必须由故事侧声明）
		['动态写点未声明族 → 红', analyze({ 'a.twee': ':: P\n<<firstTime `"cellar_" + $era`>>' }), D, 1, 'dynamic-undeclared'],
		['动态写点有声明覆盖 → 不得报', analyze({ 'a.twee': ':: P\n<<firstTime `"cellar_" + $era`>>' }), [{ id: 'tower', prefix: ['cellar_'] }], 0, 'dynamic-covered'],
		['声明了却没有写点（僵尸声明）→ 红', analyze(SELF_GOOD), D, 1, 'dynamic-stale'],
		['声明面读点（`#787`）：对**已写键**的 `any`／`req` 引用算读 ⇒ 不报「只有写」；而 `inv:…`／没人写的键必须被**过滤掉**（否则塞出新噪声）', null, D, 0, 'declRead'],
		['键名不匹配 `[a-z_]\\w*` → 检出，且 `analyze()` **不崩**（#476 遗留地雷）', analyze({ 'a.twee': ':: P\npc.ev.BadKey = true' }), D, 1, 'charset'],
		// #433 阶段 2：读点换了写法（`Sg.notes.has`）但「读了什么」不该消失
		['经笔记的读（`Sg.notes.has`）也算读 ⇒ 不再是"只有写"', null, D, 0, 'noteRead'],
		// #434 阶段 3：写点换了写法（`Sg.notes.add`）但「写了什么」不该消失 —— 未读时必须报"只有写"
		['经笔记的写（`Sg.notes.add`）也算写 ⇒ 未读时必报"只有写"', null, D, 1, 'noteWrite'],
		// #435 阶段 4：条件表行里的键＝读点（手写 `<<if>>` 搬进表后，源码里没有这个读点了）
		['条件表行引用的键算读 ⇒ 不再是"只有写"', null, D, 0, 'ruleRead'],
		['条件表行的 `sets` 算写 ⇒ 不再是"只有读"', null, D, 0, 'ruleSet'],
	];
	let selfBad = 0;
	for (const [label, keys, dm, expect, kind] of selfCases) {
			const hit =
			kind === 'ns' ? nsMismatch(keys).length
			: kind === 'charset' ? charsetViolations({ 'a.twee': ':: P\npc.ev.BadKey = true' }).length
			: kind === 'retire' ? (() => { const ks = analyze(keys.src, { notes: keys.notes }); return check(ks, dm, [], keys.notes).length; })()
			: kind === 'noteRead' ? check(analyze({ 'a.twee': ':: P\n<<set $pc.ev.tav_x to true>>\n<<setflag "tav_x2">>\n<<if Sg.notes.has(\'n_x\')>>y<</if>>' }, { notes: { n_x: { flagPath: ['ev.tav_x', 'world.tav_x2'] } } }), dm, [], { n_x: { flagPath: ['ev.tav_x', 'world.tav_x2'] } }).length
			: kind === 'noteWrite' ? check(analyze({ 'a.twee': ":: P\n<<run Sg.notes.add('n_x')>>" }, { notes: { n_x: { flagPath: 'ev.tav_x' } } }), dm).length
			: kind === 'ruleSet' ? (() => {
				const ks = analyze({ 'a.twee': ':: P\n<<if $pc.ev.tav_x>>y<</if>>' }, { notes: {}, rules: [{ id: 'r', scope: 'P', sets: ['ev.tav_x'] }] });
				for (const k of ruleRowSetKeys({ sets: ['ev.tav_x'] })) { if (!ks.has(k)) ks.set(k, { w: new Set(), r: new Set() }); ks.get(k).w.add('条件表:P'); }
				return check(ks, dm).length;
			})()
			: kind === 'ruleRead' ? (() => {
				const ks = analyze({ 'a.twee': ':: P\n<<set $pc.ev.tav_x to true>>' }, { notes: {}, rules: [{ id: 'r', scope: 'P', req: ['ev.tav_x'] }] });
				for (const k of ruleRowKeys({ req: ['ev.tav_x'] }, {})) (ks.get(k) ?? { r: new Set() }).r.add('条件表:P');
				return check(ks, dm).length;
			})()
			: kind === 'declRead' ? (() => {
				// `#787` 翻面：`declReads` ＝ 故事数据面 `any`／`req` 里的**候选**。期望：
				// ① `world.tav_x` 有人写 ⇒ 算读 ⇒ 不报「只有写」；② `inv:时光护符`／`world.lonely`（无人写）⇒ 丢掉 ⇒ 不造「未声明」噪声。
				const ks = analyze({ 'a.twee': ':: P\n<<set $pc.world.tav_x to true>>' }, { notes: {}, declReads: ['world.tav_x', 'inv:时光护符', 'world.lonely'] });
				return check(ks, dm).length;
			})()
			: kind === 'dynamic-undeclared' ? checkDynamic(dynamicSites({ 's.twee': ':: P\n<<firstTime `"cellar_" + $era`>>' }), []).length
			: kind === 'dynamic-covered' ? checkDynamic(dynamicSites({ 's.twee': ':: P\n<<firstTime `"cellar_" + $era`>>' }), [{ prefix: 'cellar_', via: 'firstTime', values: ['past'] }]).length
			: kind === 'dynamic-stale' ? checkDynamic([], [{ prefix: 'gone_', via: 'firstTime', values: ['past'] }]).length
			: check(keys, dm).length;
		// 语义：expect=0 表示「必须零检出」，expect>0 表示「必须有检出」（不锁具体条数）
		const ok = expect === 0 ? hit === 0 : hit > 0;
		if (!ok) selfBad++;
		console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${hit}（期望${expect === 0 ? ' 0' : ' >0'}）`);
	}
	bad += selfBad;
	// `#1149` ⭐ **自证格的红必须进退出码**（格级属性 ✓ —— `#1123`／`#1100` 族新实例 ✓）
	//   此前：自证格只并进 `bad` ⇒ 而 `bad` **仅在 `--check` 下**被检查（`:381`）✗
	//   ⇒ **裸跑 ⇒ 格红而 rc=0** ✗ ⇒ 门自身失能却静默通过 ✓
	//   ⚠️ 与"判据发现"分开报 ✓：本条的语义是"**本门自身失能**"，不是"故事数据有问题" ✓（同 `#1100` 验收第 3 条 ✓）
	if (selfBad) {
		console.error(`\n✗ 状态契约门：**自证格**红 ${selfBad} 项 ⇒ **本门自身失能**（不是判据发现 ✗）—— 请修本门再跑 ✓（\`#1149\`）`);
		process.exit(1);
	}

	// ── 真实数据 ──
	// 读/写点扫描前先遮 **JS 注释**（`#1208` 分面：本处是**代码面** ⇒ 用词法器 `maskComments`。
	//   散文面的启发式（`stripProseComments`）会吞真代码，**不能**拿来扫源码）：
	// 注释里的示例（例如引擎侧 `sets: ['world.flower_taken']` 的口径说明）不是写点——不剥就会造**假红**
	//（`#460` 实测：第二/第三故事因此报"flower_taken 只有写没有读"）。Twee 注释 `/% %/` 另由 `readKeys` 调用处剥。
	const sources = {};
	for (const f of ctx.SRC_FILES) sources[f] = maskComments(readFileSync(f, 'utf8'));
	const NOTES = ctx.Game.Notes?.entries;
	const RULES = ctx.window?.Sg?.story?.rules?.() ?? [];
	// `#785`：把**声明面**也传进去（条件行 ＋ 诉求表 ⇒ 写点才看得见 ✓）——经接入契约取，不直读数据容器 ✓。
	const ASKS = ctx.window?.Sg?.story?.socialAsks?.() ?? [];
	// 声明面**读点候选**（`#787` 翻面）：数据容器里处处是条件列表（`any`／`req`）——codex 线索、回声、选择…
	// 不把它们算读 ⇒ 报「只有写没有读」的假红 ✗（`mist_fought`／`whistle_blown` 就住在 codex 线索里）。
	// 「只给有人写的键补读」那道收紧在 `analyze` 里做（那里才有键图 ⇒ 否则会塞出「未声明 18 条」式的新噪声 ✗）。
	const DECL_READS = (() => {
		const out = new Set();
		const walk = (v, d = 0) => {
			if (d > 8 || !v || typeof v !== 'object') return;
			for (const [k, x] of Object.entries(v)) {
				if ((k === 'any' || k === 'req') && x && typeof x === 'object') for (const s of Object.values(x)) { if (typeof s === 'string') out.add(s); }
				else walk(x, d + 1);
			}
		};
		walk(ctx.window?.Game ?? ctx.Game ?? {});
		// **主路径**：经契约问故事（与其它门同形）——codex 的 `clues[].req` 就在那里。
		// （通用深挖在本运行时里拿不到（容器枚举方式与沙箱不同）⇒ 不赌它 ✓）
		try { walk(ctx.window?.Sg?.story?.codexItems?.() ?? {}); } catch { /* 拿不到就靠别的门叫 */ }
		return [...out];
	})();
	const keys = analyze(sources, { notes: NOTES, rules: RULES, asks: ASKS, declReads: DECL_READS });
	// #435 阶段 4：**条件表行里的键也是读点** —— 手写 `<<if>>` 搬进表之后，源码里就没有这个读点了；
	// 不补这一步，被引用的旗标会被判「只有写」⇒ 假红（阶段 4 版的"新形状"，排查清单第 1 条 🔴）。
	// 表侧读写点**对称**注入（`#435`）：`req`/`any`/`exclude` ＝ 读，`sets` ＝ 写。
	// 必须**两边都能建条目**：只手写 `sets`（无段落读点）而行的 `exclude` 又引用同一键时，
	// 若读侧"只给已出现的键补读点"就会漏 ⇒ 判成「只有写」（实测：`forge_thanks`，`#556` 的首个 `sets:` 行）。
	const bump2 = (k, kind, label) => {
		if (!keys.has(k)) keys.set(k, { w: new Set(), r: new Set() });
		keys.get(k)[kind].add(label);
	};
	for (const row of RULES) {
		const label = `条件表:${row.scope ?? '?'}`;
		for (const k of ruleRowKeys(row, NOTES)) bump2(k, 'r', label);
		for (const k of ruleRowSetKeys(row)) bump2(k, 'w', label);
	}
	const declaredDyn = ctx.Game.State?.dynamicKeys ?? [];
	// 动态族**展开成具体键**并入键图 ⇒ 这些键照样受「域归属／有写有读／命名空间」四条判定管
	for (const { key } of expandDynamic(declaredDyn)) {
		if (!keys.has(key)) keys.set(key, { w: new Set(), r: new Set(), dynamic: true });
		const e = keys.get(key);
		e.w.add('(dynamic:firstTime)'); e.r.add('(dynamic:firstTime)'); e.dynamic = true;
	}
	// `#460`：**引擎内部槽**（读写点**都**在机制段里，故事一个字没碰）⇒ 只要求登记域，
	// 不判「有写有读」——那是判**故事**有没有真用它；引擎自己的槽由引擎自洽（否则一个不用检定/交涉的
	// 故事会被判"幽灵条件/死分支"假红：`soc` 由引擎面板读、`last_roll` 由引擎 snapshot 写）。
	const isMechSite = (label) => /\[(script|widget|stylesheet)\]$/.test(String(label));
	// 注：`check()`/`nsMismatch()` 的 `key` 是**裸键名**（`mergeByBare` 的键）⇒ 这里同步存裸名
	const engineOnly = new Set([...keys].filter(([, v]) => {
		const sites = [...(v.wSites ?? v.w ?? []), ...(v.rSites ?? v.r ?? [])];
		return sites.length > 0 && sites.every(isMechSite);
	}).map(([k]) => k).map((k) => k.replace(/^(ev|world)\./, '')));
	const problems = [
		...check(keys, domains, ctx.Game.State?.bookkeeping ?? [], NOTES).filter((p) => !(engineOnly.has(p.key) && (p.kind === 'write-only' || p.kind === 'read-only'))),
		...([...engineOnly].length ? [] : []),
		...charsetViolations(sources),
		...checkDynamic(dynamicSites(sources), declaredDyn),
	];
	// #365：命名空间不一致 → 现在**报告**（已知缺陷形式，不判失败），等修复后转严格
	const nsBad = nsMismatch(keys).filter((p) => !engineOnly.has(p.key));   // 同 `check()`：引擎内部槽不判
	const byKind = problems.reduce((acc, p) => (acc[p.kind] = (acc[p.kind] ?? 0) + 1, acc), {});
	const perDomain = domains.map((d) => {
		const n = [...mergeByBare(keys).keys()].filter((b) => (d.keys ?? []).includes(b) || (d.prefix ?? []).some((p) => b.startsWith(p))).length;
		return `${d.id} ${n}`;
	});
	const bk = (ctx.Game.State?.bookkeeping ?? []).filter((k) => keys.get(k)?.w.size && !keys.get(k)?.r.size);
	console.log(`  状态键 ${keys.size} 个｜域 ${domains.length} 个（${perDomain.join(' · ')}）`);
	if (engineOnly.size) console.log(`  · 引擎内部槽（读写点都在机制段、故事未参与 ⇒ 只要求登记域，不判有写有读）：${[...engineOnly].sort().join('、')}`);
	if (bk.length) console.log(`  仅记账键（已声明，无行为消费者）：${bk.join('、')}`);
	const dynN = expandDynamic(declaredDyn).length;
	if (dynN) console.log(`  动态族 ${declaredDyn.length} 个 ⇒ 展开 ${dynN} 个动态键（已并入上面的「状态键」计数与四条判定）`);
	console.log(`  问题：未声明 ${byKind.undeclared ?? 0} · 歧义 ${byKind.ambiguous ?? 0} · 只有写 ${byKind['write-only'] ?? 0} · 只有读 ${byKind['read-only'] ?? 0} · 命名空间不一致 ${nsBad.length} · 键名形态 ${byKind['key-charset'] ?? 0} · 动态未声明 ${byKind['undeclared-dynamic'] ?? 0} · 僵尸动态声明 ${byKind['stale-dynamic'] ?? 0}`);
	for (const p of problems.slice(0, 12)) { console.log(`  ✗ ${p.key}：${p.detail}`); bad++; }
	// 命名空间不一致（#365 已修 → 转严格：任何读域缺同域写入即红灯）
	for (const p of nsBad) { console.log(`  ✗ ${p.key}：${p.detail}`); bad++; }
	if (problems.length > 12) { console.log(`  …另有 ${problems.length - 12} 项`); bad += problems.length - 12; }

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 状态契约门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 状态契约门通过（键全有域归属 · 无歧义 · 有写有读 · 命名空间一致 · 自证通过）');
	}
};
