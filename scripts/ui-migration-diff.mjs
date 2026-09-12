// #264（#185 阶段六）差异复核：迁移前后「玩家可见正文」零漂移对照。
//
// 做法：把基线提交的 src/*.twee 与工作区对比，逐段落抽出**玩家可见文本**
// （去掉宏 <<…>>、twee 注释 /% … %/、链接语法只留显示名），归一空白后比对。
// 输出 docs/ui-migration-diff.md：变更段落清单＋每段的字符增减＋是否已在
// docs/ui-inventory.md 登记（未登记即提示——漂移必须要么为 0，要么有登记理由）。
//
//   node scripts/ui-migration-diff.mjs [基线提交]        # 默认 92f3d04（阶段三之前）
//
// 退出码：有「未登记且非零漂移」的段落 ⇒ 1（可当门用）；纯报告 ⇒ 0。
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? '92f3d04';
const FILES = ['20-chargen', '30-ch1', '40-ch2', '50-ch3', '60-endings', '70-codex', '11-scene'];
const SRC = FILES.map((f) => `src/${f}.twee`);

const visible = (body) => body
	.replace(/\/%[\s\S]*?%\//g, '')            // twee 注释
	.replace(/<%[\s\S]*?%>/g, '')              // 原始 HTML 块
	.replace(/<<[^>]*>>/g, '')                 // 宏
	.replace(/\[\[([^\]|]+)\|?[^\]]*\]\]/g, '$1') // 链接：留显示名
	.replace(/''/g, '').replace(/\/\//g, '')
	.replace(/\s+/g, '');

function parsePassages(twee) {
	const out = new Map();
	const parts = twee.split(/^:: (.+?)(?:\s*\[(.*?)\])?$/m);
	// parts: [前言, name, tags, body, name, tags, body, ...]
	for (let i = 1; i < parts.length; i += 3) {
		const name = parts[i].trim();
		const tags = parts[i + 1] ?? '';
		const body = parts[i + 2] ?? '';
		if (tags.includes('script') || tags.includes('stylesheet') || name.startsWith('Story')) continue;
		out.set(name, body);
	}
	return out;
}

const cur = new Map();
for (const f of SRC) {
	let t = '';
	try { t = readFileSync(f, 'utf8'); } catch { continue; }
	for (const [k, v] of parsePassages(t)) cur.set(k, v);
}

let base = new Map();
for (const f of SRC) {
	try {
		const t = execSync(`git show ${BASE}:${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		for (const [k, v] of parsePassages(t)) base.set(k, v);
	} catch { /* 基线上没有这个文件（新增文件） */ }
}

const inv = readFileSync('docs/ui-inventory.md', 'utf8');
const rows = [];
let unregistered = 0;
for (const [name, body] of cur) {
	const before = base.get(name);
	const nowText = visible(body);
	const beforeText = before === undefined ? null : visible(before);
	if (beforeText !== null && beforeText === nowText) continue;
	const registered = inv.includes(name);
	if (!registered) unregistered++;
	rows.push({
		name,
		kind: beforeText === null ? '新增段' : '文本变更',
		delta: beforeText === null ? nowText.length : nowText.length - beforeText.length,
		registered,
	});
}
// 被删段落（基线有、现在无）
const removed = [...base.keys()].filter((k) => !cur.has(k));

rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
const pad = (s, n) => String(s).padEnd(n, ' ');
const md = [
	`# UI 迁移差异复核（#185 阶段六 / #264）`,
	'',
	`> 基线 \`${BASE}\`（阶段三之前）→ 工作区。比对口径：**玩家可见正文**（去宏、去 twee 注释、链接只留显示名、空白归一）。`,
	'> 逐段登记的适配与新增见 `docs/ui-inventory.md`；本表只列**正文有变化**的段落。',
	'',
	`- 变更段落：**${rows.length}**（未登记：**${unregistered}**）`,
	`- 删除段落：${removed.length ? removed.join('、') : '无'}`,
	'',
	'| 段落 | 类型 | 可见文本字符增减 | 已登记 |',
	'|---|---|---|---|',
	...rows.map((r) => `| ${r.name} | ${r.kind} | ${r.delta > 0 ? '+' : ''}${r.delta} | ${r.registered ? '✓' : '**未登记**'} |`),
	'',
	'## 口径说明',
	'',
	'- 「文本变更」为可见文本差异（宏/注释/链接目标不计）；**0 差异的段落不列出**——迁移以展示层为主，正文按设计保持原样。',
	'- 与剧情基线（#182+、#219 批次、#227–#252 各票）相关的正文变化已随各自 PR 记录；本表用于**复核迁移本身没有顺带改字**。',
	'- 若有段落既未登记、又有非零漂移，脚本退出码为 1（可作门用）。',
	'',
].join('\n');

writeFileSync('docs/ui-migration-diff.md', md);
console.log(`✔ 差异复核：变更 ${rows.length} 段（未登记 ${unregistered}）· 删除 ${removed.length} 段 → docs/ui-migration-diff.md`);
if (unregistered) {
	console.log('  ⚠ 未登记但正文有变化：');
	for (const r of rows.filter((x) => !x.registered)) console.log(`    · ${r.name}（${r.delta > 0 ? '+' : ''}${r.delta}）`);
}
process.exit(unregistered ? 1 : 0);
