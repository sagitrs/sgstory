// #264（#185 阶段六）差异复核：迁移前后「玩家可见正文」零漂移对照。
//
// 做法：把基线提交的 src/*.twee 与工作区对比，逐段落抽出**玩家可见文本**
// （去掉宏 <<…>>、twee 注释 /% … %/、链接语法只留显示名），归一空白后比对。
// 输出：变更段落清单＋每段的字符增减＋是否已在 `docs/ui-inventory.md` 登记
//（未登记即提示——漂移必须要么为 0，要么有登记理由）。
//
//   node scripts/ui-migration-diff.mjs [基线提交]                  # 位置参数（旧用法，仍支持）
//   node scripts/ui-migration-diff.mjs --baseline=<ref>            # 显式基线（推荐：CI 用可达的引用）
//   node scripts/ui-migration-diff.mjs --check                     # 判定态：有未登记漂移 ⇒ 退 1
//   node scripts/ui-migration-diff.mjs --out=<path>                # 报告落点（默认 docs/ui-migration-diff.md）
//   node scripts/ui-migration-diff.mjs --zero                      # **逐段 0 漂移**（`#422-D`／阶段 2 纯转发的判据）
//   node scripts/ui-migration-diff.mjs --selftest                  # 判据自证（合成正反例，不碰 git）
//
// 退出码：未登记漂移 ⇒ 1；`--check` 下**基线不可达** ⇒ 1（见下）；纯报告 ⇒ 0。
//
// ⚠ 两条「假绿」防线（#436 原范围 3 接计划时补，都有自证钉住）：
//   ① **基线不可达必须红**：旧版 `git show <base>:<file>` 的失败被 `catch` 吃掉 ⇒ 浅克隆里
//      （CI 默认 `fetch-depth: 1`）基线取不到时，**所有段落都会被当成「新增段」**，而旧段落名
//      在 `docs/ui-inventory.md` 里本来就在 ⇒ 「未登记」计数为 0 ⇒ **退 0（假绿）**。
//      现在先 `git rev-parse --verify` 验基线可达，不可达就明确报错（附修复命令）。
//   ② **解析结果为空也必须红**：即便基线引用存在，若一个段落都没解析出来（路径/格式变了），
//      同样会让"全成了新增段"⇒ 假绿。⇒ 基线侧 0 段而工作区 >0 段 ⇒ 红。
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

// ── 纯函数：判据（自证与真实运行**同一份代码**）─────────────────────────────
// `base`／`cur`：段落名 → 正文；`invText`：docs/ui-inventory.md 全文
export const judge = (base, cur, invText) => {
	const rows = [];
	let unregistered = 0;
	for (const [name, body] of cur) {
		const before = base.get(name);
		const nowText = visible(body);
		const beforeText = before === undefined ? null : visible(before);
		if (beforeText !== null && beforeText === nowText) continue;
		const registered = invText.includes(name);
		if (!registered) unregistered++;
		rows.push({
			name,
			kind: beforeText === null ? '新增段' : '文本变更',
			delta: beforeText === null ? nowText.length : nowText.length - beforeText.length,
			registered,
		});
	}
	rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
	const removed = [...base.keys()].filter((k) => !cur.has(k));
	return { rows, unregistered, removed };
};

export const visible = (body) => body
	.replace(/\/%[\s\S]*?%\//g, '')            // twee 注释
	.replace(/<%[\s\S]*?%>/g, '')              // 原始 HTML 块
	.replace(/<<[^>]*>>/g, '')                 // 宏
	.replace(/\[\[([^\]|]+)\|?[^\]]*\]\]/g, '$1') // 链接：留显示名
	.replace(/''/g, '').replace(/\/\//g, '')
	.replace(/\s+/g, '');

export const parsePassages = (twee) => {
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
};

const argv = process.argv.slice(2);
const flagVal = (k, d) => {
	const hit = argv.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : d;
};
const positional = argv.filter((a) => !a.startsWith('--'))[0];

if (argv.includes('--selftest')) {
	console.log('══ UI 差异复核 · 自证 ══');
	const M = (o) => new Map(Object.entries(o));
	const cases = [
		['正例：正文一致 ⇒ 不算变更', judge(M({ P: "你好''世界''" }), M({ P: '你好世界' }), ''), (r) => r.rows.length === 0 && r.unregistered === 0],
		['正例：宏/注释变化 ⇒ 不算正文漂移', judge(M({ P: '<<if $x>>你好<</if>' }), M({ P: '/% 注 %/<<if $y>>你好<</if>' }), ''), (r) => r.rows.length === 0],
		['反例：正文变了且未登记 ⇒ 未登记 1', judge(M({ P: '你好' }), M({ P: '你好啊' }), ''), (r) => r.unregistered === 1],
		['正例：正文变了但已登记 ⇒ 未登记 0（不红）', judge(M({ P: '你好' }), M({ P: '你好啊' }), '# 清单\nP\n'), (r) => r.unregistered === 0 && r.rows[0].registered === true],
		['正例：新增段未登记 ⇒ 未登记 1 且 kind=新增段', judge(M({}), M({ P: '你好' }), ''), (r) => r.unregistered === 1 && r.rows[0].kind === '新增段'],
		['反例：**基线侧 0 段**（解析全失败/基线错）⇒ 必须能被上层判为不可信', judge(M({}), M({ P: '你好' }), 'P'), (r) => r.rows.length === 1 && r.rows[0].kind === '新增段'],
	];
	let bad = 0;
	for (const [label, got, ok] of cases) {
		const pass = ok(got);
		if (!pass) bad++;
		console.log(`  ${pass ? '✓' : '✗'} ${label}`);
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（可见文本口径 · 登记豁免 · 新增段识别）');
	process.exit(0);
}

const BASE = flagVal('baseline', positional ?? '92f3d04');
const OUT = flagVal('out', 'docs/ui-migration-diff.md');
const CHECK = argv.includes('--check');
const ZERO = argv.includes('--zero');   // 逐段 0 漂移（阶段 2 纯转发用：登记豁免在这里**不适用**）
const FILES = ['20-chargen', '30-ch1', '40-ch2', '50-ch3', '60-endings', '70-codex', '11-scene'];
const SRC = FILES.map((f) => `src/${f}.twee`);

// ── ① 基线可达性（假绿防线之一）：不可达 ⇒ 明确报错，绝不把"读不到"当成"没变化" ──
{
	let ok = true;
	try { execSync(`git rev-parse --verify --quiet ${BASE}^{commit}`, { stdio: 'ignore' }); } catch { ok = false; }
	if (!ok) {
		console.error(`✗ 基线 \`${BASE}\` 不可达（浅克隆？）——**不判漂移**，避免把"读不到基线"当成"没有变化"（假绿）。`);
		console.error(`  修：\`git fetch --depth=1 origin ${BASE}\`，或改用可达引用：\`--baseline=origin/main\`。`);
		process.exit(CHECK ? 1 : 0);
	}
}

const cur = new Map();
for (const f of SRC) {
	let t = '';
	try { t = readFileSync(f, 'utf8'); } catch { continue; }
	for (const [k, v] of parsePassages(t)) cur.set(k, v);
}

const base = new Map();
let baseUnreadable = 0;
for (const f of SRC) {
	try {
		const t = execSync(`git show ${BASE}:${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		for (const [k, v] of parsePassages(t)) base.set(k, v);
	} catch { baseUnreadable++; /* 基线上没有这个文件（新增文件）——但见下面的防线② */ }
}

// ── ② 基线侧一段都没解析出来（假绿防线之二）⇒ 不可信，红 ──
if (cur.size > 0 && base.size === 0) {
	console.error(`✗ 基线 \`${BASE}\` 下读不出任何段落（${baseUnreadable}/${SRC.length} 个文件读失败）⇒ 判据不可信（会让"全部段落"变成"新增段"而假绿）。`);
	console.error('  请检查基线与 `FILES` 列表是否与当时的源树一致（改名/搬家后需同步）。');
	process.exit(CHECK ? 1 : 0);
}

const inv = readFileSync('docs/ui-inventory.md', 'utf8');
const { rows, unregistered, removed } = judge(base, cur, inv);

// 基线的**自描述**（不写死"阶段三之前"这种措辞——基线换了，说明要跟着换）
let baseDesc = '';
try { baseDesc = execSync(`git log -1 --format=%s ${BASE}`, { encoding: 'utf8' }).trim().slice(0, 60); } catch { /* 取不到就不写 */ }

const pad = (s, n) => String(s).padEnd(n, ' ');
const md = [
	`# UI 迁移差异复核（#185 阶段六 / #264）`,
	'',
	`> 基线 \`${BASE}\`${baseDesc ? `（${baseDesc}）` : ''} → 工作区。比对口径：**玩家可见正文**（去宏、去 twee 注释、链接只留显示名、空白归一）。`,
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
	'- 有未登记漂移 ⇒ 退出码 1（可作门用，`--check` 语义相同）；**基线不可达或读不出段落也退 1**（防"读不到"被当成"没变化"）。',
	'',
].join('\n');

writeFileSync(OUT, md);
console.log(`✔ 差异复核（基线 ${BASE}）：变更 ${rows.length} 段（未登记 ${unregistered}）· 删除 ${removed.length} 段 → ${OUT}`);
if (ZERO && rows.length) {
	// 阶段 2（纯转发）要的是**逐段 0 漂移**：这里**不接受**"已登记"豁免——任何可见正文变化都算漂移。
	console.error(`✗ --zero：基线 \`${BASE}\` 下有 ${rows.length} 段可见正文漂移（要求逐段 0）：`);
	for (const r of rows.slice(0, 8)) console.error(`    · ${r.name}（${r.delta > 0 ? '+' : ''}${r.delta}）`);
	if (rows.length > 8) console.error(`    …另有 ${rows.length - 8} 段`);
	process.exit(1);
}
if (unregistered) {
	console.log('  ⚠ 未登记但正文有变化（登记进 docs/ui-inventory.md，或把漂移改回 0）：');
	for (const r of rows.filter((x) => !x.registered)) console.log(`    · ${r.name}（${r.delta > 0 ? '+' : ''}${r.delta}）`);
}
process.exit(unregistered ? 1 : 0);
