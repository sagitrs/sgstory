#!/usr/bin/env node
/* 玩家可见文本门（`#1863`：内部文本泄漏 —— 票号／英文动作名／系统话术／源码路径）
 *
 * ## 本门要产出什么
 *   一条**机械判据**：**上屏通路**里出现的**内部用语**（票号、英文动作名、源码路径、系统话术）⇒ 红。
 *   动机（`#1863`）：试玩实测出现「★连续 3 次无人能行动 ⇒ …（#1773 护栏）」「请用采集动作（gather）」等
 *   —— 这些是**开发者面**的话，玩家看到的是**噪声**（且泄漏内部结构）。处置口径＝**降级呈现**（✗ 删信息）。
 *
 * ## 判据（三条通路，逐条给判据；✗ 全仓裸 grep）
 *   ① **`perform` 直通**：行含 `.perform(` ⇒ 该字符串**即**玩家可见 ⇒ 扫。
 *   ② **道具抛错面**：路径含 `dnd/…/items/` 且行含 `throw new Error(` ⇒ 该文案经拒绝通路（`#1839`／`#1857`）
 *      上屏 ⇒ 扫。★**只扫 items**：core 的 `throw` 多为**API 契约错**（开发者面，票号合法，实测 2 处）。
 *   ③ **动作标签**：行含 `text:` ＋ 字符串字面量 ⇒ 地点/道具动作标签（玩家可见）⇒ 扫。
 *
 * ## 违规形（命中任一即红；逐条具名，✗ 只报总数）
 *   · `TICKET`    `#[0-9]{3,}`（票号）
 *   · `ENGLISH`   `（(gather|craft|build|use|act|equip|loot)）`（括号里的英文动作名）
 *   · `SRCPATH`   反引号里的 `*.js`／`*.md`（源码/文档路径）
 *   · `SYSTEM`    `请用.{0,8}动作`／`请用于(建造|锻造|合成)`（系统话术）
 *
 * ## 排除面（✗ 误伤 —— 本仓注释与测试里合法出现票号，实测）
 *   · **注释行**（`*`／`//`／`/*` 起首）：注释是**开发者面**，票号是**出处**，合法。
 *   · `console.` 行：console 是**开发者通道**（本票正是把开发者信号迁到那里）。
 *   · 测试面：`*.test.js`、`tests` 目录下任意文件、`verify.mjs`（断言里引票号是**出处**，合法）。
 *
 * ## 口径（读数须可复核）
 *   计数单位＝**违规命中次数**（同一行两形算两次）；扫描面＝`src/**`＋`stories/**` 的 `*.js`/`*.twee`。
 *
 * 用法：node tests/gates/player-text.mjs [--verbose]
 *       node tests/gates/player-text.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

/* 违规形（具名 ⇒ 自检可断「红在哪一支」） */
export const RULES = [
	{ id: 'TICKET', re: /#[0-9]{3,}/, what: '票号' },
	{ id: 'ENGLISH', re: /（(gather|craft|build|use|act|equip|loot)）/i, what: '英文动作名' },
	{ id: 'SRCPATH', re: /`[^`]*\.(js|mjs|md)`/, what: '源码/文档路径' },
	{ id: 'SYSTEM', re: /请用.{0,8}动作|请用于(建造|锻造|合成)/, what: '系统话术' },
];

/* 该行是否属**上屏通路**（①②③）；✗ 通路 ⇒ 不判（注释/契约错等） */
export function isPlayerPath(rel, line) {
	if (rel.includes('dnd/') && /\/items\//.test(rel) && /throw new Error\(/.test(line)) return 'throw-items';
	if (/\.perform\(/.test(line)) return 'perform';
	if (/\bperform\(/.test(line)) return 'perform';
	if (/\btext:\s*['"`]/.test(line)) return 'text';
	return null;
}

/* 排除面 */
export function isExcluded(rel, line) {
	const t = line.trim();
	if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return 'comment';
	if (/console\.(warn|error|log)/.test(line)) return 'console';
	if (/\.test\.js$/.test(rel) || /^(tests|stories\/[^/]+)\/(.*)?verify\.mjs$/.test(rel) || /\/tests\//.test(rel)) return 'test';
	if (/verify\.mjs$/.test(rel)) return 'test';
	return null;
}

/** 单文件判定 ⇒ [{rel, line, path, rule, text}] */
export function checkSource(rel, src) {
	const out = [];
	src.split('\n').forEach((line, i) => {
		if (isExcluded(rel, line)) return;
		const p = isPlayerPath(rel, line);
		if (!p) return;
		for (const r of RULES) if (r.re.test(line)) out.push({ rel, line: i + 1, path: p, rule: r.id, text: line.trim().slice(0, 140) });
	});
	return out;
}

/**
 * 豁免配对（★键＝**文件＋形＋内容子串**，✗ 行号）。
 * 为何 ✗ 行号：行号会被**无关插入**打脆 —— `#1865` CI 实测（main 前进 15 commit ⇒ 通路 B 五行整体下移
 *   ⇒ 按行号的豁免**全部误判过期**，而文案一字未改）。内容子串则：无关插入**不失效**；
 *   文案一改 ⇒ 命中消失 ⇒ **豁免自然过期**（正是我们要的）。
 * @returns {live, stale} live=须红未被豁免者；stale=清单里有、实际已不命中者
 */
export function applyExemptions(hits, ex) {
	const exHit = (e, h) => e.file === h.rel && e.rule === h.rule && h.text.includes(e.contains);
	return {
		live: hits.filter((h) => !ex.some((e) => exHit(e, h))),
		stale: ex.filter((e) => !hits.some((h) => exHit(e, h))),
	};
}

/* ---------------- 主判定 ---------------- */
const SKIP_DIRS = ['node_modules', 'dist', 'build', 'vendor', '.git', 'pin-cache'];
function walk(dir, acc) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.isDirectory()) { if (SKIP_DIRS.includes(e.name)) continue; walk(path.join(dir, e.name), acc); }
		else if (/\.(js|mjs|twee)$/.test(e.name)) acc.push(path.join(dir, e.name));
	}
	return acc;
}

if (isMain && !process.argv.includes('--selftest')) {
	const verbose = process.argv.includes('--verbose');
	const roots = ['src', 'stories'].map((d) => path.join(ROOT, d)).filter((d) => fs.existsSync(d));
	const files = roots.flatMap((d) => walk(d, []));
	const hits = files.flatMap((f) => checkSource(path.relative(ROOT, f), fs.readFileSync(f, 'utf8')));
	/* 待修豁免（#1863 分两笔）：命中与豁免**逐条配对**；★过期豁免 ⇒ 红（同 refs-integrity 纪律） */
	const exPath = path.join(ROOT, 'tests/gates/player-text-exemptions.json');
	const ex = fs.existsSync(exPath) ? (JSON.parse(fs.readFileSync(exPath, 'utf8')).豁免 ?? []) : [];
	const { live, stale } = applyExemptions(hits, ex);
	console.log('玩家可见文本门（#1863）');
	if (stale.length > 0) {
		console.error(`  ✗ 门红：**过期豁免** ${stale.length} 条（清单里有、实际已不命中 ⇒ 须删，✗ 留陈旧登记）：`);
		for (const e of stale) console.error(`    · ${e.file} [${e.rule}]「${e.contains}」（${e.ticket}）`);
		process.exit(1);
	}
	if (live.length === 0) {
		if (ex.length > 0) console.log(`  （待修豁免 ${ex.length} 条在册 —— 候 #1857；过期即红）`);
		console.log(`  ✓ 门绿：上屏通路内无内部用语（扫描 ${files.length} 个文件；面=perform／items-throw／text）`);
		process.exit(0);
	}
	console.error(`  ✗ 门红：上屏通路内出现**内部用语** ${live.length} 处（逐条具名）：`);
	for (const h of live) console.error(`    · [${h.rule}] ${h.rel}:${h.line}（${h.path}）\n        ${h.text}`);
	if (ex.length > 0) console.error(`  （另有待修豁免 ${ex.length} 条在册 —— 候 #1857）`);
	console.error('  ⇒ 处置口径＝**降级呈现**（改用玩家可读白话，✗ 删信息；开发者信号迁 `console`/结构化 code —— 见 `#1863`）');
	process.exit(1);
}

/* ---------------- 自检（刀：每条断到「红在哪一支」） ---------------- */
if (isMain && process.argv.includes('--selftest')) {
	const ITEM = 'src/dnd/dnd3/items/resources.js';
	const CORE = 'src/core/40-battle.js';
	const knives = [];
	const knife = (id, rel, src, wantRule) => {
		const hits = checkSource(rel, src);
		const ok = wantRule === null ? hits.length === 0 : hits.some((h) => h.rule === wantRule);
		knives.push({ id, ok, got: hits.map((h) => h.rule).join(',') || '(无)' });
	};
	/* 四条「该红」刀 —— 每条只含一形 ⇒ 必须红在**该形**上 */
	knife('K1 票号@perform', CORE, "\tthis.perform(`……（#1773 护栏）。`);", 'TICKET');
	knife('K2 英文动作名@items-throw', ITEM, "\tthrow new Error(`「${this.name}」请用采集动作（gather）`);", 'ENGLISH');
	knife('K3 源码路径@perform', 'stories/babel/src/world/encounters.js', "\treturn R.perform('【装配缺口】需要 `#1784`（`src/core/65-encounters.js`）的 `RPG.rollEncounter`。');", 'SRCPATH');
	knife('K4 系统话术@items-throw', ITEM, "\tthrow new Error(`「${this.name}」不能直接使用（请用于建造）`);", 'SYSTEM');
	knife('K5 动作标签@text', 'src/dnd/dnd3/scenes/span1-hub.js', "\t\t\ttext: '查看开垦的地（#1776 护栏）',", 'TICKET');
	/* 四/五条「不红」刀 —— 排除面与合法形 */
	knife('N1 注释行含票号', CORE, '\t/* ★`#1773` 死锁护栏：连续「本次无推进」的次数 */', null);
	knife('N2 console 通道含票号', 'stories/babel/src/world/encounters.js', "\tconsole.warn('[BABEL] 装配缺口：需要 `#1784`（`src/core/65-encounters.js`）。');", null);
	knife('N3 core 契约抛错含票号', 'src/core/18-stock.js', "\t\tthrow new Error(`…（#1759 §十.3）`);", null);
	knife('N4 测试面含票号', 'tests/unit/core/turn-economy.test.js', "\tassert.ok(/强制跳过/); // #1773", null);
	knife('N5 玩家白话（无内部用语）', CORE, '\tthis.perform(`连着几回合都没人动得了手——这一回合也就这么过去了。`);', null);
	knife('N6 玩家白话@items-throw', ITEM, "\tthrow new Error(`「${this.name}」是备料——不能就这么使，得拿去盖东西。`);", null);
	/* ★豁免语义两刀（`#1865` CI 实测教训：豁免键须抗无关插入、且文案改动即过期） */
	{
		const ex = [{ file: ITEM, rule: 'SYSTEM', contains: '不能直接使用（请用于建造）', ticket: '#1863' }];
		const hitAt = (ln) => checkSource(ITEM, Array(ln - 1).fill('').join('\n') + "\tthrow new Error(`「${this.name}」是建设物资，不能直接使用（请用于建造）`);").filter((h) => h.rule === 'SYSTEM');
		const shifted = hitAt(500);                       // 行号 500（无关插入后）
		const a = applyExemptions(shifted, ex);           // 内容相同 ⇒ 仍被豁免
		knives.push({ id: 'X1 豁免**抗无关插入**（行号移位不失效）', ok: a.live.length === 0 && a.stale.length === 0, got: `live=${a.live.length} stale=${a.stale.length}` });
		const changed = checkSource(ITEM, "\tthrow new Error(`「${this.name}」是备料——不能就这么使。`);").filter((h) => h.rule === 'SYSTEM');
		const b = applyExemptions(changed, ex);           // 文案已改 ⇒ 清单条目**过期**
		knives.push({ id: 'X2 文案一改 ⇒ 豁免**过期**（须删，✗ 留陈旧）', ok: b.stale.length === 1, got: `stale=${b.stale.length}` });
	}

	let bad = 0;
	for (const k of knives) {
		console.log(`  ${k.ok ? '✓' : '✗'} ${k.id}${k.ok ? '' : `（实得 ${k.got}）`}`);
		if (!k.ok) bad++;
	}
	console.log(`  ${bad === 0 ? '✓' : '✗'} 自检：${knives.length - bad}/${knives.length} 刀如期（门会红也会绿）`);
	process.exit(bad === 0 ? 0 : 1);
}
