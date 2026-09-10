// L0 静态完整性门：不启动游戏，纯静态扫描 src/*.twee
// 硬错误（exit 1）——三类机械 bug 在构建期归零：
//   1. 悬空引用：链接/goto/include/Actions 的目标段落不存在（坑11 线上实锤类）
//   2. goto 裸词参数：SugarCube 宏参数裸词=字面字符串，不求值（坑11 根因）
//   3. 未定义宏/widget：拼写错误（<<st>> / <<erashfit>> 类）
// 警告（不阻断）：静态不可达段落（动态跳转可致误报，仅提示）
// 用法：node test/integrity.mjs [srcDir=src]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = process.argv[2] ?? 'src';

// SugarCube 2.37 内置宏（宁多勿漏——漏一个就是误报）
const BUILTIN = new Set('set unset if elseif else endif for to step break continue switch case default endswitch while endwhile print nprint run script silent endsilent nobr endnobr include link endlink linkappend endlinkappend linkprepend endlinkprepend linkreplace endlinkreplace button endbutton actions addclass removeclass toggleclass append prepend replace textbox radio checkbox listbox endlistbox option optionsfrom numberbox cycle endcycle list endlist dropdown enddropdown goto back return repeat endrepeat stop timed endtimed next widget endwidget capture endcapture forget remember remove comment endcomment audio createsoundmacro masteraudio playlist done'.split(/\s+/));

// ── 解析段落（先收全部头行，再切相邻头之间的 body——避免越界吞并）──
const passages = new Map(); // name → { file, line, tags, body }
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.twee')).sort()) {
	const lines = readFileSync(join(SRC, f), 'utf8').split('\n');
	const heads = []; // { i, name, tags }
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^::\s+(.+?)\s*(?:\[([^\]]*)\])?\s*(?:\{.*\})?\s*$/);
		if (m) heads.push({ i, name: m[1].trim(), tags: (m[2] ?? '').trim().split(/\s+/).filter(Boolean) });
	}
	heads.forEach((h, k) => {
		const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
		passages.set(h.name, { file: f, line: h.i + 1, name: h.name, tags: h.tags, body: lines.slice(h.i + 1, end).join('\n') });
	});
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
const edges = []; // { from, target, dynamic, kind }
const kindCount = {};
const push = (p, target, kind, dynamic = false) => {
	edges.push({ from: p, target, dynamic, kind });
	kindCount[kind] = (kindCount[kind] ?? 0) + 1;
};

for (const p of passages.values()) {
	const isScript = p.tags.includes('script') || p.name === 'StoryData';
	const body = p.body.replace(/\/%[\s\S]*?%\//g, ''); // 摘除注释
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
		if (!passages.has(target)) E(p, `悬空链接 ${raw.slice(0, 50)} → 段落「${target}」不存在`);
	}
	// 1b) 未闭合 wiki 链接（#80 线上实锤：[[..|..] 单括号尾静默降级纯文本→玩家卡死）
	for (const m of body.matchAll(/\[\[[^\]\n]*\](?!\])/g)) {
		E(p, `未闭合 wiki 链接（会渲染成纯文本）: ${m[0].slice(0, 50)}`);
	}
	// 2) goto：引号=字面量（查存在）；裸词=错误；反引号/$var=动态（跳过）
	for (const m of body.matchAll(/<<goto\s+([^>]*?)>>/g)) {
		const arg = m[1].trim();
		if (/^["']/.test(arg)) {
			const t = arg.slice(1, -1).trim();
			push(p, t, 'goto');
			if (!passages.has(t)) E(p, `悬空 goto → 段落「${t}」不存在`);
		} else if (/^`/.test(arg) || /^\$/.test(arg)) {
			push(p, null, 'goto', true);
		} else {
			E(p, `goto 裸词参数「${arg}」——裸词不求值，将被当作字面字符串（坑11），需反引号 \`...\` 或引号`);
		}
	}
	// 3) include / link|button 带目标参数 / actions
	for (const m of body.matchAll(/<<include\s+([^>]*?)>>/g)) {
		const arg = m[1].trim();
		if (/^["']/.test(arg)) {
			const t = arg.slice(1, -1).trim();
			push(p, t, 'include');
			if (!passages.has(t)) E(p, `悬空 include → 段落「${t}」不存在`);
		} else if (/^`/.test(arg) || /^\$/.test(arg)) push(p, null, 'include', true);
		else E(p, `include 裸词参数「${arg}」（同坑11类，需引号或反引号）`);
	}
	for (const m of body.matchAll(/<<(?:link|button)\s+("[^"]*"|'[^']*'|`[^`]*`)\s+(["'`][^>]*?)\s*>>/g)) {
		if (/^["']/.test(m[2])) {
			const t = m[2].slice(1, -1).trim();
			push(p, t, 'link-arg');
			if (!passages.has(t)) E(p, `悬空 link/button 目标 → 段落「${t}」不存在`);
		} else push(p, null, 'link-arg', true);
	}
	for (const m of body.matchAll(/<<actions\s+([^>]*?)>>/g)) {
		for (const q of m[1].matchAll(/["']([^"']+)["']/g)) {
			push(p, q[1], 'actions');
			if (!passages.has(q[1])) E(p, `悬空 actions 项 → 段落「${q[1]}」不存在`);
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
//   W1 link/button 体内裸 set/run/script（点击态代码只有手写路线能测——O(内容) 负担源头）
//   W2 era 写越界出塔层（set/赋值/erashift 调用；读不禁——结局状态栏展示属合法读）
//   W3 旗标生命周期（set 从不 use / use 从不 set）
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
	// W1：点击态裸状态变更（词汇允许：Engine.restart 导航 / Chargen.* 模块 API）
	for (const m of body.matchAll(/<<(link|button|linkappend|linkprepend|linkreplace)\b[^>]*>>([\s\S]*?)<<\/\1>>/g)) { // 开标签>>：[^>]*后须吃两个>，否则捕获体残留>使^锚失效
		const stripped = m[2].replace(/^\s*<<run\s+(?:Engine\.restart\s*\(\s*\)|Chargen\.\w+\s*\([^)]*\))\s*>>\s*$/gm, '');
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
	const ctx = { window: {} };
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
	console.log(`表：位点 ${Object.keys(Game.Checks.sites).length} · 经济事件 ${Object.keys(Game.Economy.events).length} · 道具 ${Object.keys(Game.Items.effects).length}（引用 位点 ${refKeys.site.size} / 事件 ${refKeys.econ.size}）`);
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
// （`角色卡` 结尾那句「酒馆的门还亮着」才把它摆到眼前）。语义门测不到"把还没经历的地方当已发生"，
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
// 「你想起酒馆里那些人的话」（那桌人从没讲过石头）；女巫小屋写「你在酒馆的旧画上见过」
// （没看画也照写）。这类"凭空记得"是语义问题，机器只能钉住**已知的几处**：
// 短语必须落在 `<<if $pc.ev.<flag>>>` 里，否则红。新增此类回指就往表里加一行。
const CALLBACKS = [
	{ passage: '洞穴', phrase: '你想起老板娘那句话', flag: 'tav_tips' },
	{ passage: '女巫小屋', phrase: '你在酒馆那幅旧画上见过', flag: 'tav_painting' },
];
for (const c of CALLBACKS) {
	const p = passages.get(c.passage);
	if (!p) { errors.push(`[回指] 表里写的段落「${c.passage}」不存在`); continue; }
	const body = p.body.replace(COMMENT_RX, '');
	const idx = body.indexOf(c.phrase);
	if (idx < 0) { errors.push(`[回指] 「${c.passage}」里找不到短语「${c.phrase}」（改了文案就同步这张表）`); continue; }
	// 数一下这句话前面有没有"还开着的" <<if $pc.ev.flag>>（含 not 的不算——那是不许引用）
	let depth = 0;
	for (const m of body.slice(0, idx).matchAll(/<<if\s+([^>]*)>>|<<\/if>>/g)) {
		if (m[0].startsWith('<<if')) {
			if (new RegExp(`\\$pc\\.ev\\.${c.flag}\\b`).test(m[1]) && !/\bnot\b/.test(m[1])) depth++;
		} else depth = Math.max(0, depth - 1);
	}
	if (depth <= 0) errors.push(`[回指] ${p.file}:${p.line} 「${c.passage}」提到「${c.phrase}」，但这一句没有落在 <<if $pc.ev.${c.flag}>> 里——玩家可能根本没听过`);
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
