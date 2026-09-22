// L0 静态完整性门：不启动游戏，纯静态扫描 src/*.twee
// 硬错误（exit 1）——三类机械 bug 在构建期归零：
// 1. 悬空引用：链接/goto/include/Actions 的目标段落不存在（坑11 线上实锤类）
// 2. goto 裸词参数：SugarCube 宏参数裸词=字面字符串，不求值（坑11 根因）
// 3. 未定义宏/widget：拼写错误（<<st>> / <<erashfit>> 类）
// 警告（不阻断）：静态不可达段落（动态跳转可致误报，仅提示）
// 用法：node test/integrity.mjs [srcDir=src]
import { passagesOf } from '../editor/lib/core/passages.mjs';   // `#1114` 2b-2b：切段单一权威
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { scopedFiles, CONST_SECTION } from '../scripts/module-order.mjs';
import { ROOT, DEFAULT_SLUG, readStory } from '../scripts/dist-paths.mjs';
// #460／#441-E：**故事作用域** —— 内容面判据只判**默认故事**（宇宙＝引擎 ∪ 该故事清单）。
// 不收进来 → 第二个故事一进来就被本故事的判据要求（段落登记是故事 1 的手册、可达性带单故事假设）。
const STORY_FILES = scopedFiles(readStory(DEFAULT_SLUG));
const allSourceFiles = () => STORY_FILES;
import { join } from 'node:path';
import vm from 'node:vm';
import { conditionReadsFlag, noteIdsForFlag } from '../scripts/audit/lib/shared.mjs';

const SRC = process.argv[2] ?? null;   // #458 切片C：默认走**单一权威**（搬家后＝src/**＋stories/**）；显式传参时仍按目录扫

// SugarCube 2.37 内置宏（宁多勿漏——漏一个就是误报）
const BUILTIN = new Set('set unset if elseif else endif for to step break continue switch case default endswitch while endwhile print nprint run script silent endsilent nobr endnobr include link endlink linkappend endlinkappend linkprepend endlinkprepend linkreplace endlinkreplace button endbutton actions addclass removeclass toggleclass append prepend replace textbox radio checkbox listbox endlistbox option optionsfrom numberbox cycle endcycle list endlist dropdown enddropdown goto back return repeat endrepeat stop timed endtimed next widget endwidget capture endcapture forget remember remove comment endcomment audio createsoundmacro masteraudio playlist done'.split(/\s+/));

// ── 解析段落（`#1114` 2b-2b：切段走 core 的 `passagesOf` —— **单一分派点**，md/twee 同入口）──
const passages = new Map(); // name → { file, line, tags, body}
for (const f of (SRC ? readdirSync(SRC).filter((x) => x.endsWith('.twee')).sort().map((x) => [x, join(SRC, x)]) : allSourceFiles().map((p) => [p.split('/').pop(), p]))) {
	//注意：原先本件自写 `/^::\s+/` 逐行切段 → `passages/` 下的 md（无 `:: ` 段头）**一段也收不到**
	// → 它们的段名不在 `passages` 里 → 全文里指向它们的 `[[…]]`/`goto` 全被判「懬空」（实测：30 硬错）。
	for (const p of passagesOf(readFileSync(f[1], 'utf8'), f[1])) {
		passages.set(p.name, { file: f, line: p.line, name: p.name, tags: p.tags, body: p.body });
	}
}

const errors = [], warnings = [];
const E = (p, msg) => errors.push(`${p.file}:${p.line} ${msg}`);
const W = (p, msg) => warnings.push(`${p.file}:${p.line} ${msg}`);

// ── 定义收集：widget + Macro.add ─────────────────────────
const defined = new Set();
for (const p of passages.values()) {
	for (const m of p.body.matchAll(/<<widget\s+["']([^"']+)["']/g)) defined.add(m[1]);
	for (const m of p.body.matchAll(/Macro\.add\(\s*["']([\w-]+)["']/g)) defined.add(m[1]);
}

// ── 引用提取与检查 ───────────────────────────────────────
const edges = []; // { from, target, dynamic, kind}
const kindCount = {};
const push = (p, target, kind, dynamic = false) => {
	edges.push({ from: p, target, dynamic, kind });
	kindCount[kind] = (kindCount[kind] ?? 0) + 1;
};

// ──「可选面」守卫（`#1004` B2）：引擎对**故事可选面**的合法写法是 `<<if Story.has("X")>>…<</if>>` ──
// 为什么必须认它："故事与引擎的接缝"是**引擎侧契约**（见 `src/10-core.twee:707` 与 `#491` 判据 4：
//「设定集是本故事的页面（引擎不知道故事名）→ **存在才渲染**；否则侧栏会出现死链」 —— 同一句写法
// 也用在 `<<damage>>` 的「结局 死亡」那一跳）。→ 只要仓里**没有任何故事**提供那个面，
// 这些**被守卫的**引用就会被本门当"悬空"报出来 —— 那是**误报**（运行期它根本不会执行）。
// → 本门先算出「守卫生效区间」（按 `<<if>>`／`<<elseif>>`／`<<else>>`／`<</if>>` 配对切分支），
// 只有当引用的**位置真的落在**以该目标为守卫的那个分支里 → 才放过。
//注意：控制（这条修正**不许**把真悬空一起放过）：
// · 只放过**条件里点名了该目标**的那一支 —— 同一段里另写一句**没守卫**的 `<<goto "X">>` 仍照报；
// · `<<else>>` 那一支**不带守卫**（"不存在"那一支里再引用它，仍是 bug）。
const HAS_RX = /Story\.has\(\s*["']([^"']+)["']\s*\)/g;
const optionGuardSpans = (body) => {
	const spans = [];
	const targetsOf = (s) => new Set([...s.matchAll(HAS_RX)].map((m) => m[1]));
	const stack = [];
	for (const m of body.matchAll(/<<(if|elseif|else|\/if)\b[^>]*?>>/g)) {
		const kind = m[1];
		const top = stack[stack.length - 1];
		if (kind === 'if') stack.push({ branch: { start: m.index + m[0].length, targets: targetsOf(m[0]) } });
		else if (kind === 'elseif' && top) { top.branch.end = m.index; spans.push(top.branch); top.branch = { start: m.index + m[0].length, targets: targetsOf(m[0]) }; }
		else if (kind === 'else' && top) { top.branch.end = m.index; spans.push(top.branch); top.branch = { start: m.index + m[0].length, targets: new Set() }; }
		else if (kind === '/if' && top) { top.branch.end = m.index; spans.push(top.branch); stack.pop(); }
	}
	while (stack.length) { const top = stack.pop(); top.branch.end = body.length; spans.push(top.branch); }
	return spans.filter((s) => s.targets.size);
};
const guardedAt = (spans, pos, target) => spans.some((s) => pos >= s.start && pos < s.end && s.targets.has(target));

for (const p of passages.values()) {
	const isScript = p.tags.includes('script') || p.name === 'StoryData';
	const body = p.body.replace(/\/%[\s\S]*?%\//g, ''); // 摘除注释
	const guards = optionGuardSpans(body);        // `#1004` B2：本次扫描的「可选面守卫」区间
	let macroScanText = body.replace(/<<script>>[\s\S]*?<<\/script>>/g, '');
	if (isScript) macroScanText = ''; // script 段落是纯 JS，宏检查跳过

	// 1) 链接四形态（含 setter 尾巴 [[..|Target][$x to 1]]）
	for (const m of body.matchAll(/\[\[([^\]|]+)?(?:\||->|<-)([^\]|]+?)\]\]|\[\[([^\]|]+?)\]\]/g)) {
		const raw = m[0];
		let target;
		if (raw.includes('->')) target = m[2];
		else if (raw.includes('<-')) target = m[1];
		else if (m[2] !== undefined) target = m[2];
		else target = m[3];
		target = (target ?? '').replace(/\[\$[^\]]*\]\s*$/, '').trim();
		if (!target) continue;
		push(p, target, 'link');
		if (!passages.has(target) && !guardedAt(guards, m.index, target)) E(p, `悬空链接 ${raw.slice(0, 50)} → 段落「${target}」不存在`);
	}
	// 1b) 未闭合 wiki 链接（#80 线上实锤：[[..|..] 单括号尾静默降级纯文本→玩家卡死）
	for (const m of body.matchAll(/\[\[[^\]\n]*\](?!\])/g)) {
		E(p, `未闭合 wiki 链接（会渲染成纯文本）: ${m[0].slice(0, 50)}`);
	}
	// #435 附：**JS 转义串的归一**（本门第一版的假阳就出在这）——
	// 条件表把文案放在 JS 字符串里（`text: '…<<goto \"塔门\">>…'`），而门扫的是**源码形态**：
	// 那时的参数看起来是 `\"塔门\"`（既不以引号开头、也不是反引号/`$`）→ 被判成"裸词"，
	// 但**运行期**它就是普通字符串参数。→ 判据前先折回运行期形态（与 `#508`"别名让层间门变瞎"同类：
	// 门不能拿源码形态当运行期形态）。
	// 边界：只在**整体被转义引号包住**时归一（`\"x\"` → `"x"`），避免把普通正文里真写错的 `\"` 一起放过。
	const unescapeArg = (a) => (/^\\["'][\s\S]*\\["']$/.test(a) ? a.replace(/\\"/g, '"').replace(/\\'/g, "'") : a);
	// 2) goto：引号=字面量（查存在）；裸词=错误；反引号/$var=动态（跳过）
	for (const m of body.matchAll(/<<goto\s+([^>]*?)>>/g)) {
		const arg = unescapeArg(m[1].trim());
		if (/^["']/.test(arg)) {
			const t = arg.slice(1, -1).trim();
			push(p, t, 'goto');
			if (!passages.has(t) && !guardedAt(guards, m.index, t)) E(p, `悬空 goto → 段落「${t}」不存在`);
		} else if (/^`/.test(arg) || /^\$/.test(arg)) {
			push(p, null, 'goto', true);
		} else {
			E(p, `goto 裸词参数「${arg}」——裸词不求值，将被当作字面字符串（坑11），需反引号 \`...\` 或引号`);
		}
	}
	// 3) include / link|button 带目标参数 / actions
	for (const m of body.matchAll(/<<include\s+([^>]*?)>>/g)) {
		const arg = unescapeArg(m[1].trim());
		if (/^["']/.test(arg)) {
			const t = arg.slice(1, -1).trim();
			push(p, t, 'include');
			if (!passages.has(t) && !guardedAt(guards, m.index, t)) E(p, `悬空 include → 段落「${t}」不存在`);
		} else if (/^`/.test(arg) || /^\$/.test(arg)) push(p, null, 'include', true);
		else E(p, `include 裸词参数「${arg}」（同坑11类，需引号或反引号）`);
	}
	for (const m of body.matchAll(/<<(?:link|button)\s+("[^"]*"|'[^']*'|`[^`]*`)\s+(["'`][^>]*?)\s*>>/g)) {
		if (/^["']/.test(m[2])) {
			const t = m[2].slice(1, -1).trim();
			push(p, t, 'link-arg');
			if (!passages.has(t) && !guardedAt(guards, m.index, t)) E(p, `悬空 link/button 目标 → 段落「${t}」不存在`);
		} else push(p, null, 'link-arg', true);
	}
	for (const m of body.matchAll(/<<actions\s+([^>]*?)>>/g)) {
		for (const q of m[1].matchAll(/["']([^"']+)["']/g)) {
			push(p, q[1], 'actions');
			if (!passages.has(q[1]) && !guardedAt(guards, m.index, q[1])) E(p, `悬空 actions 项 → 段落「${q[1]}」不存在`);
		}
	}
	// 4) 未定义宏（闭合标签 <</if>> 不算）
	for (const m of macroScanText.matchAll(/<<\/?([a-zA-Z][\w-]*)/g)) {
		const name = m[1];
		if (BUILTIN.has(name.toLowerCase()) || defined.has(name)) continue;
		E(p, `未定义宏 <<${name}>> —— 拼写错误或漏注册（已注册：${[...defined].join(', ')}）`);
	}
}

// ── 词汇表纪律警告（#29，不阻断；豁免：段落内 /% vocab: exempt W1|W2|W3 理由 %/ 留痕）──
// 目标：内容限定既定词汇 → 配测负担 O(内容)→O(机制)。三类越界：
// W1 link/button 体内裸 set/run/script（点击态代码只有手写路线能测——O(内容) 负担源头）
// W2 era 写越界出塔层（set/赋值/erashift 调用；读不禁——结局状态栏展示属合法读）
// W3 旗标生命周期（set 从不 use / use 从不 set）
const vocabWarn = [];
const vocabExempts = [];
// A6→M1：era 写白名单=挂了 <<flip>> 的段落所在文件（v16 补正 #2：翻转不受地点限制）
const ERA_FILES = new Set([...passages.values()].filter((p) => p.body.includes('<<flip>>')).map((p) => p.file));
const COMMENT_RX = /\/%[\s\S]*?%\//g;
const isInfraBody = (p) => p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t)) || ['StoryInit', 'StoryData', 'StoryTitle'].includes(p.name);
const exemptOf = (p) => {
	const m = p.body.match(/vocab:\s*exempt\s+((?:W\d+[\s,|]*)+)(.*?)%/);
	return m ? { kinds: m[1].match(/W\d+/g), reason: m[2].replace('/', '').trim() } : null;
};
for (const p of passages.values()) {
	if (isInfraBody(p)) continue;
	const body = p.body.replace(COMMENT_RX, '');
	const ex = exemptOf(p);
	const warn = (kind, msg) => {
		if (ex?.kinds.includes(kind)) { const line = `${p.file}:${p.line} 段落「${p.name}」豁免 ${kind}：${ex.reason}`; if (!vocabExempts.includes(line)) vocabExempts.push(line); }
		else vocabWarn.push(`${p.file}:${p.line} [${kind}] 段落「${p.name}」${msg}`);
	};
	// W1：点击态裸状态变更（词汇允许：Engine.restart 导航 / Game.Chargen.* 模块 API）
	for (const m of body.matchAll(/<<(link|button|linkappend|linkprepend|linkreplace)\b[^>]*>>([\s\S]*?)<<\/\1>>/g)) { // 开标签>>：[^>]*后须吃两个>，否则捕获体残留>使^锚失效
		const stripped = m[2].replace(/^\s*<<run\s+(?:Engine\.restart\s*\(\s*\)|Game\.Chargen\.\w+\s*\([^)]*\))\s*>>\s*$/gm, '');
		const hits = [...new Set([...stripped.matchAll(/<<(set|run|script)\b/g)].map((x) => x[1]))];
		if (hits.length) warn('W1', `link 体内裸 ${hits.join('/')}（点击态代码 → 提升为词汇宏或豁免）：${m[0].replace(/\s+/g, ' ').slice(0, 50)}`);
	}
	// W2：era 写越界（只禁写）
	if (!ERA_FILES.has(p.file)) {
		if (/<<\s*set\s+\$era\b/.test(body) || /variables\.era\s*=[^=]/.test(body)) warn('W2', 'era 写入越界出翻转域（状态空间翻倍源头）');
		if (/<<\s*flip\s*>>/.test(body)) warn('W2', 'flip 调用越界出翻转域');
	}
}
// W3：旗标生命周期（全 src 含 JS 引用；pc 对象不计——成员级变更合法）
{
	const all = [...passages.values()].map((p) => ({ p, text: p.body.replace(COMMENT_RX, '') }));
	const names = new Set();
	for (const { text } of all) for (const m of text.matchAll(/\$([A-Za-z_]\w*)\b/g)) names.add(m[1]);
	for (const name of [...names].filter((n) => n !== 'pc' && n !== 'args')) { // args=widget 形参伪变量
		const setterRx = new RegExp(`<<\\s*set\\s+\\$${name}\\b|variables\\.${name}\\s*=[^=]|<<run[^>]*\\$${name}\\s*=[^=]`, 'g');
		const useRx = new RegExp(`\\$${name}\\b|[^.\\w]${name}\\b`, 'g');
		let setters = 0, uses = 0;
		const setterHosts = [];
		for (const { p, text } of all) {
			const n = (text.match(setterRx) ?? []).length;
			setters += n;
			if (n) setterHosts.push(p);
			uses += (text.replace(setterRx, '').match(useRx) ?? []).length;
		}
		// W3 豁免：setter 所在段落带 exempt W3 → 留痕放行（旗标级问题，豁免锚在写点）
		const exHost = setterHosts.find((p) => exemptOf(p)?.kinds.includes('W3'));
		if (exHost) { const ex = exemptOf(exHost); vocabExempts.push(`${exHost.file}:${exHost.line} 段落「${exHost.name}」豁免 W3：旗标 $${name} —— ${ex.reason}`); continue; }
		if (setters > 0 && uses === 0) vocabWarn.push(`[W3] 旗标 $${name} 只写不读（死旗标）`);
		if (setters === 0 && uses > 0) vocabWarn.push(`[W3] 旗标 $${name} 只读不写（幽灵引用）`);
	}
}
if (vocabExempts.length) { console.log(`\nℹ 词汇豁免留痕 ${vocabExempts.length}：`); vocabExempts.forEach((x) => console.log('  ' + x)); }
if (vocabWarn.length) { console.log(`\n⚠ 词汇纪律警告 ${vocabWarn.length}：`); vocabWarn.forEach((x) => console.log('  ' + x)); }

// ── 数据表一致性（#28，硬门）────────────────────────────
// window.Game 三表（Economy/Checks/Tokens）vm 直载；正文只许经词汇宏引用。
// 三拦：①引用键不存在（typo 即 build 断）②表孤儿项（表陈旧告警）③正文硬编码残留
const gamePassage = [...passages.values()].find((p) => /window\.Game\s*=/.test(p.body));
const Game = (() => {
	// `window.Game` 在真实加载顺序里先由引擎建出来（我们这里**先给它一个空壳**，再跑常量行）
	const ctx = { window: { Game: {} } };
	// `#660` 片一：故事表里的 `Game.Era.*` 是**引擎常量**（单源在 `10-core`），而本门只 vm 载入**表段**（不加载引擎）
	// → 先把常量行跑一遍（真实加载顺序就是引擎在前）；跑不出来的话下面会点名（反沉默，别静默 undefined）。
	const constFiles = CONST_SECTION.files.map((f) => join(ROOT, f));
	const constSrc = constFiles.filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
	// 常量行两种形状都跑：`window.Game.Era = {…}`（`#660` 片二后的单源）与旧的 `??= {…}`
	for (const m of constSrc.matchAll(/^window\.Game\.[A-Za-z]+ \??= .*$/gm)) vm.runInNewContext(m[0], ctx);
	if (!ctx.window.Game?.Era || !ctx.window.Game?.Damage) errors.push('引擎常量未被载入（CONST_SECTION.files 里应有 `Game.Era ??=`／`Game.Damage ??=` 两行）——数据表会拿到 undefined');
	vm.runInNewContext(gamePassage.body, ctx);
	return ctx.window.Game;
})();
if (!Game?.Checks?.sites || !Game?.Economy?.events) errors.push('Game 表加载失败（window.Game/Economy/Checks 缺失）');
else {
	const refKeys = { site: new Set(), econ: new Set() };
	for (const p of passages.values()) {
		const body = p.body.replace(COMMENT_RX, '');
		for (const m of body.matchAll(/<<(?:sitecheck|attackroll)\s+"([^"]+)"/g)) refKeys.site.add(m[1]);
		for (const m of body.matchAll(/<<econ\s+"([^"]+)"/g)) refKeys.econ.add(m[1]);
	}
	for (const [k, tbl, kind] of [['site', Game.Checks.sites, '位点'], ['econ', Game.Economy.events, '事件']]) {
		for (const key of refKeys[k]) if (!(key in tbl)) errors.push(`[表引用] ${kind}键「${key}」不在 Game 表中（typo 或漏迁移）`);
		for (const key of Object.keys(tbl)) if (!refKeys[k].has(key)) warnings.push(`[表孤儿] ${kind}「${key}」未被任何词汇引用（表陈旧？）`);
	}
	// 残留：非 infra 段落不得再硬编码经济/DC（wrapper 宏内允许——那里是词汇实现层）
	for (const p of passages.values()) {
		if (isInfraBody(p)) continue;
		const body = p.body.replace(COMMENT_RX, '');
		if (/<<\s*set\s+\$pc\.gold\b/.test(body)) errors.push(`[残留] ${p.file}:${p.line} 段落「${p.name}」直改 $pc.gold——经济必须走 <<econ 事件>>`);
		for (const m of body.matchAll(/<<(check|save)\s+"[^"]+"\s+\d+/g)) errors.push(`[残留] ${p.file}:${p.line} 段落「${p.name}」硬编码 DC（${m[0]}）——检定必须走 <<sitecheck 位点>>`);
	}
	// `#1004` B2：道具表那格的形状跟**现存契约**走 —— 旧写法读 `Game.Items.effects`（那是已删故事的**表形状**，
	// 引擎侧从来只经 `Sg.story.itemEffect(k)` 读道具 —— `src/engine/40-sim/20-items.twee` 的 `itemEffect`（`#1187` 第四块后；**不写行号**——会随拆分腐烂））；
	// 现存两样本声明的都是 `Items.defs` → 按现况读 ＋ 防御式取键（表缺了也不该把这句**信息行**变成崩栈）。
	console.log(`表：位点 ${Object.keys(Game.Checks.sites).length} · 经济事件 ${Object.keys(Game.Economy.events).length} · 道具条目 ${Object.keys(Game.Items.defs ?? {}).length}（引用 位点 ${refKeys.site.size} / 事件 ${refKeys.econ.size}）`);
}

// ── 可达性（信息性）──────────────────────────────────────
// 过近似：widget 段落内的 goto 目标与 script 段落里的 Engine.play/show 字面量
// 作为"随处可达"种子；从 StoryData.start BFS
const sd = passages.get('StoryData');
const start = sd?.body.match(/"start"\s*:\s*"([^"]+)"/)?.[1] ?? '开场';
if (!passages.has(start)) errors.push(`StoryData.start「${start}」不存在`);
const seed = new Set([start]);
for (const p of passages.values()) {
	if (p.tags.includes('widget')) for (const e of edges) if (e.from === p && e.target) seed.add(e.target);
	if (p.tags.includes('script')) for (const m of p.body.matchAll(/Engine\.(?:play|show)\(\s*["']([^"']+)["']/g)) seed.add(m[1]);
}
const adj = new Map();
for (const e of edges) {
	if (!e.target || !passages.has(e.target)) continue;
	if (!adj.has(e.from.name)) adj.set(e.from.name, new Set());
	adj.get(e.from.name).add(e.target);
}
const seen = new Set(seed);
const queue = [...seed];
while (queue.length) {
	const n = queue.shift();
	for (const t of adj.get(n) ?? []) if (!seen.has(t)) { seen.add(t); queue.push(t); }
}
const INFRA = (p) => p.name.startsWith('Story') || p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t)) || p.name === '样式';
for (const p of passages.values()) {
	if (!INFRA(p) && !seen.has(p.name)) W(p, `段落「${p.name}」静态不可达（若仅经动态跳转到达请忽略，否则是死内容）`);
}

// ── 序章白名单：开场在车卡之前，玩家一次门都没进过 ────────────
// 反例（M16 修）：开场里写着「酒馆里的人说过很多种版本……」——可酒馆是**车卡之后**才第一次进门的地方
//（`角色卡` 结尾那句「酒馆的门还亮着」才把它摆到眼前）。语义门测不到"把还没经历的地方当已发生"，
// 但至少把地名钉住：这几段里不许出现后文才到的地方。
const PRELUDE_BANS = {
	'开场': ['酒馆', '歪脖子鸭'],
};
for (const [name, terms] of Object.entries(PRELUDE_BANS)) {
	const p = passages.get(name);
	if (!p) continue;
	const body = p.body.replace(COMMENT_RX, '');
	for (const t of terms) {
		if (body.includes(t)) errors.push(`[序章] ${p.file}:${p.line} 段落「${name}」提到了还没到的地方「${t}」——开场在车卡之前，玩家没进过任何一处；若确要写远景，放宽这条规则并在注释里写明理由`);
	}
}

// ── 回指门：写「你想起某人说过的话」之前，先确认你真听过 ──────
// 反例（M16 一起修的）：开场写「酒馆里的人说过……」（那时还没进门）；洞穴写
//「你想起酒馆里那些人的话」（那桌人从没讲过石头）；女巫小屋写「你在酒馆的旧画上见过」
//（没看画也照写）。这类"凭空记得"是语义问题，机器只能钉住**已知的几处**：
// 短语必须落在 `<<if $pc.ev.<flag>>>` 里，否则红。新增此类回指就往表里加一行。
// 旗标 → 笔记 id：从**笔记表**读（`15-tables.twee` 与增量文件里的 `flagPath`）——供回指门认新形状
const NOTE_IDS = (() => {
	const text = (SRC ? readdirSync(SRC).filter((x) => x.endsWith('.twee')).sort().map((f) => readFileSync(join(SRC, f), 'utf8')) : allSourceFiles().map((p) => readFileSync(p, 'utf8'))).join('\n');
	const entries = {};
	for (const m of text.matchAll(/\b(n_[a-z0-9_]+):\s*\{/g)) {
		const start = m.index + m[0].length - 1;
		let depth = 0, i = start;
		for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') { depth--; if (!depth) break; } }
		const body = text.slice(start, i);
		const fp = /flagPath:\s*(\[[^\]]*\]|'[^']*')/.exec(body);
		if (fp) for (const p of fp[1].matchAll(/'([^']+)'/g)) { const f = p[1].replace(/^(ev|world)\./, ''); (entries[f] ??= []).push(m[1]); }
	}
	return new Map(Object.entries(entries));
})();

// ⛔ **表空 ＋ 声明**（`#1004` B2）：上表原有 4 行**全是 `mist-forest` 的内容**（段落「洞穴」／「女巫小屋」／
//「塔门」／「半途的林子」＋ NPC「老板娘」／「守林人」）—— 它随故事一起没了 → 那 4 行已删。
//注意：**声明**："**NPC 口头承诺 ／ 回指**"这一面在本仓**已无样本** → 本门当前**空转**（**不是**"已覆盖"）；
// 机制完整保留（表结构、`scope`／`saidIn`／`conditionReadsFlag` 那整套）＋ **表自身的守卫仍在**
//（写错段落名／找不到短语／门外引用／承诺无人说过 → 逐条仍红）。
// → 日后有故事带这类回指 → **按原表形状补行**（不为凑绿造样本）。
//注意：同族两条**一并登记**（不删、也不再有任何对象）：`PRELUDE_BANS`（开场禁提后文地名，「开场」在 `minimal-demo` 里存在
// 但禁令词 `酒馆`／`歪脖子鸭` 已不存在 → 空转）；`ENDGAME_KNOWN`（终局级知识白名单，见 `test/reread.mjs`）。
const CALLBACKS = [];
for (const c of CALLBACKS) {
	const p = passages.get(c.passage);
	if (!p) { errors.push(`[回指] 表里写的段落「${c.passage}」不存在`); continue; }
	const body = p.body.replace(COMMENT_RX, '');
	const idx = body.indexOf(c.phrase);
	if (idx < 0) { errors.push(`[回指] 「${c.passage}」里找不到短语「${c.phrase}」（改了文案就同步这张表）`); continue; }
	// 数一下这句话前面有没有"还开着的"条件门（含 not 的不算——那是不许引用）。
	// #433 阶段 2：条件可写成 `Sg.notes.has('n_x')` → 走**单一权威** `conditionReadsFlag()`，两种形状都认。
	let depth = 0;
	for (const m of body.slice(0, idx).matchAll(/<<if\s+([^>]*)>>|<<\/if>>/g)) {
		if (m[0].startsWith('<<if')) {
			const ns = `\\$${(c.scope ?? 'pc.ev').replace(/\./g, '\\.')}\\.`;
			const direct = new RegExp(`${ns}${c.flag}\\b`).test(m[1]);
			const viaNote = conditionReadsFlag(m[1], c.flag, NOTE_IDS.get(c.flag) ?? []);
			if ((direct || viaNote) && !/\bnot\b/.test(m[1])) depth++;
		} else depth = Math.max(0, depth - 1);
	}
	if (depth <= 0) errors.push(`[回指] ${p.file}:${p.line} 「${c.passage}」提到「${c.phrase}」，但这一句没有落在 <<if $${c.scope ?? 'pc.ev'}.${c.flag}>> 里——玩家可能根本没听过`);
	// 光挂门控还不够（#168 P1-11 的反例：门控是对的，那句话却**全篇没人说过**）——
	// 回指的承诺必须真在某处的 NPC 嘴里兑现：
	if (c.said) {
		const from = passages.get(c.saidIn);
		if (!from) errors.push(`[回指] 表里写的出处段落「${c.saidIn}」不存在`);
		else if (!from.body.replace(COMMENT_RX, '').includes(c.said)) {
			errors.push(`[回指] 「${c.passage}」回指的「${c.said}」在「${c.saidIn}」里没人说过——NPC 的承诺也得到场（#168 批次二）`);
		}
	}
}

// ── 楼层数字门（#168 P1-4）：说了「X楼」就必须与设定书的楼层定案一致 ──
// 反例（M14 撤温室重排楼层时漏改）：工坊写"三楼拐角"、天文台写"四楼是天文台"，
// 而定义集 §5 的定案是 1F 门厅 / 2F 书房·工坊 / 3F 天文台 / 顶楼。
const FLOOR_OF = { 门厅: 1, 书房: 2, 工坊: 2, 天文台: 3 };
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
for (const p of passages.values()) {
	const lines = p.body.replace(COMMENT_RX, '').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// (a) 同一行里点名了房间、又写了「N楼」→ 两处必须一致
		for (const [room, floor] of Object.entries(FLOOR_OF)) {
			if (!line.includes(room)) continue;
			const m = line.match(/([一二三四五])楼/);
			if (m && CN_NUM[m[1]] !== floor) {
				errors.push(`[楼层] ${p.file}:${p.line + i} 「${room}」是 ${floor} 楼，这里写「${m[1]}楼」——与设定书楼层定案不符`);
			}
		}
		// (b) 链接「上N楼」的目标段落必须就在 N 楼
		for (const m of line.matchAll(/\[\[上([一二三四五])楼\|([^\]]+)\]\]/g)) {
			const floor = Object.entries(FLOOR_OF).find(([room]) => m[2].includes(room))?.[1];
			if (floor && CN_NUM[m[1]] !== floor) {
				errors.push(`[楼层] ${p.file}:${p.line + i} 链接「${m[0]}」把玩家带到 ${floor} 楼的「${m[2]}」`);
			}
		}
	}
}

// ── 满血门（#168 P1-3）：免费回满只许出现在一次性/条件门控里 ──
// 反例：女巫小屋把 <<set $pc.hp to $pc.max_hp>> 放在段落顶层，每次进门满血——
// 药膏（8 金）、洞穴 4 点伤害、花田掉血于是全部失去意义。
const HEAL = '<<set $pc.hp to $pc.max_hp>>';
for (const p of passages.values()) {
	const lines = p.body.replace(COMMENT_RX, '').split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].includes(HEAL)) continue;
		const prev = [...lines.slice(0, i)].reverse().find((l) => l.trim()) ?? '';
		if (!/^<<if\b/.test(prev.trim())) {
			errors.push(`[满血] ${p.file}:${p.line + i} 段落「${p.name}」的 ${HEAL} 不在 <<if>> 门控里——免费回满会把药膏与伤害的意义抹掉`);
		}
	}
}

// ── 致命伤不被覆盖门（#357）：<<damage>> 之后的同层 <<goto>> 必须包在存活条件里 ──
// 为什么：#357 实锤——「<<damage heavy>> … <<goto "顶楼">>」在致命伤时，damage 内的
//「<<goto 结局 死亡>>」会被随后的普通 goto 覆盖，玩家带着 hp0 继续剧情（更糟的是
//:passagestart 的 hp≤0 安全网会把 hp 修回 1，等于复活）。
// 判据（纯函数，便于合成反例）：在同一段落里，`<<damage …>>` 之后**中间没有 <<if/<<else/<</if>**
// 的第一个 `<<goto "…">>`，若它自己没有处在 `<<if $pc.hp gt 0>>` 里，即判红。
export const scanFatalOverrides = (body) => {
	const out = [];
	const rx = /<<damage[^\n>]*>>/g;
	let m;
	while ((m = rx.exec(body))) {
		const rest = body.slice(m.index + m[0].length, m.index + m[0].length + 400);
		const g = rest.match(/(?:(?!<<if|<<else|<<\/if>|<<link\b|::)[\s\S])*?(<<goto "[^"]+">>)/);
		if (!g) continue;
		const guarded = /<<if\s+\$pc\.hp\s+gt\s+0>>\s*$/.test(rest.slice(0, g.index)) || /<<if\s+\$pc\.hp\s+gt\s+0>>\s*<<goto/.test(rest.slice(0, g.index + g[0].length));
		if (!guarded) out.push({ goto: g[1], at: m.index });
	}
	return out;
};
// 自证：正例（有守卫）＋ 反例（无守卫）各一
{
	const good = '<<damage 4>>你挨了一下。<<if $pc.hp gt 0>><<goto "顶楼">><</if>>';
	const bad = '<<damage 4>>你挨了一下。<<goto "顶楼">>';
	const okGood = scanFatalOverrides(good).length === 0;
	const okBad = scanFatalOverrides(bad).length === 1;
	if (!okGood || !okBad) errors.push(`[致命伤门] 自证失败：正例 ${scanFatalOverrides(good).length}（期望 0）／反例 ${scanFatalOverrides(bad).length}（期望 1）`);
}
for (const p of passages.values()) {
	if (p.tags.some((t) => ['script', 'stylesheet'].includes(t))) continue;
	for (const f of scanFatalOverrides(p.body.replace(COMMENT_RX, ''))) {
		errors.push(`[致命伤] ${p.file}:${p.line} 段落「${p.name}」的 ${f.goto} 紧跟在 <<damage>> 之后却没有存活条件——致命伤时它会覆盖「结局 死亡」的跳转（#357）`);
	}
}

// ── 段落登记门（#262/#185 阶段四／#264）：每个内容段落必须登记在 docs/ui-inventory.md ──
//「新场景自动进入模板及覆盖清单」的静态那一半：新增段落未登记即红（另一半点（渲染/覆盖）在 coverage 门）。
{
	try {
		const inv = readFileSync(new URL('../docs/ui-inventory.md', import.meta.url), 'utf-8');
		for (const p of passages.values()) {
			if (p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t))) continue;
			if (p.name.startsWith('Story')) continue;
			if (!inv.includes(p.name)) errors.push(`内容段落「${p.name}」未登记在 docs/ui-inventory.md（#262 段落登记门）`);
		}
	} catch (e) {
		errors.push(`段落登记门读不到 docs/ui-inventory.md：${e.message}`);
	}
}

// ── JS 注释泄漏门（#261/#185 阶段三）：twee 正文里的「// 注释」会当正文渲染 ──
// 只允许 //斜体// 成对写法；[script]/[stylesheet] 段是 JS，注释合法，跳过。
{
	for (const p of passages.values()) {
		if (p.tags.some((t) => ['script', 'stylesheet'].includes(t))) continue;
		p.body.split('\n').forEach((line, i) => {
			// 去掉成对的 //…// 斜体后，行内还残留 // → 注释泄漏
			const stripped = line.replace(/\/\/[^/\n]*\/\//g, '');
			if (/\S\s*\/\//.test(stripped)) {
				errors.push(`${p.name}:${i + 1} 正文含「//」注释（会渲染成文字）：${line.trim().slice(0, 60)}`);
			}
		});
	}
}

// ── 输出 ─────────────────────────────────────────────────
const lit = edges.filter((e) => !e.dynamic).length, dyn = edges.filter((e) => e.dynamic).length;
console.log(`段落 ${passages.size} · 宏/widget ${defined.size} · 边 ${lit} 静态 + ${dyn} 动态（${Object.entries(kindCount).map(([k, v]) => `${k}:${v}`).join(' ')}）`);
if (warnings.length) { console.log(`\n⚠ 警告 ${warnings.length}：`); warnings.forEach((x) => console.log('  ' + x)); }
if (errors.length) {
	console.error(`\n✗ 硬错误 ${errors.length}：`);
	errors.forEach((x) => console.error('  ' + x));
	process.exit(1);
}
console.log('\n✔ 静态完整性通过（悬空引用/裸词参数/未定义宏：0）');
