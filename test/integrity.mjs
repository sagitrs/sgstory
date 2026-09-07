// L0 静态完整性门：不启动游戏，纯静态扫描 src/*.twee
// 硬错误（exit 1）——三类机械 bug 在构建期归零：
//   1. 悬空引用：链接/goto/include/Actions 的目标段落不存在（坑11 线上实锤类）
//   2. goto 裸词参数：SugarCube 宏参数裸词=字面字符串，不求值（坑11 根因）
//   3. 未定义宏/widget：拼写错误（<<st>> / <<erashfit>> 类）
// 警告（不阻断）：静态不可达段落（动态跳转可致误报，仅提示）
// 用法：node test/integrity.mjs [srcDir=src]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
