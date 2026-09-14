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
import { allSourceFiles } from '../../module-order.mjs';
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

export const run = (ctx) => {
	const { arg, wantAll } = ctx;
	if (!(wantAll || arg('engine-story-free'))) return;
	console.log('\n══ ⓪ad 引擎门"无故事字面量"门（`#602`）——声明成引擎门就得真的与故事无关 ══');
	let bad = 0;

	// ── 自证（纯函数，正反例都跑同一份判据）──
	{
		const tokens = new Set(['某故事段', 'Game.StoryThing']);
		const cases = [
			['① 正例：干净的门源码 ⇒ 0 条', judgeStoryFree({ file: 'x.mjs', src: "if (arg('x')) console.log('ok')", tokens }).length === 0],
			['🔴 ① 反例：门里出现故事段落名 ⇒ 报', judgeStoryFree({ file: 'x.mjs', src: "const w = ['某故事段'];", tokens }).length === 1],
			['🔴 ① 反例：门里出现故事侧 `Game.<X>` ⇒ 报', judgeStoryFree({ file: 'x.mjs', src: 'return Game.StoryThing.items;', tokens }).length === 1],
			['② 正例：只在**注释**里提到 ⇒ 不算（本仓注释大量记述"当初错在哪"）', judgeStoryFree({ file: 'x.mjs', src: '// 历史：某故事段 曾写死在这里\nconsole.log(1)', tokens }).length === 0],
			['③ 正例：白名单（带理由＋票号）放行', judgeStoryFree({ file: 'x.mjs', src: "const a = '某故事段';", tokens, allow: { 'x.mjs::某故事段': '夹具沿用（#602）' } }).length === 0],
			['边界：无 token（故事都没声明）⇒ 0 条', judgeStoryFree({ file: 'x.mjs', src: '任何代码', tokens: new Set() }).length === 0],
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
	// 白名单**理由必须带票号**（空理由/无票号 ⇒ 红）
	for (const [k, why] of Object.entries(ALLOW)) if (!/#\d+/.test(String(why))) { console.log(`  ✗ 白名单「${k}」的理由缺票号（必须写明"为什么放行"并挂票）`); bad++; }
	// 白名单腐烂（声明了却不再命中）⇒ 报，逼你删
	const stale = Object.keys(ALLOW).filter((k) => {
		const [file, token] = k.split('::');
		const g = engineGates.find((x) => x.file === file);
		return !g || !g.src.includes(token);
	});
	for (const k of stale) { console.log(`  ✗ 白名单腐烂：「${k}」已不再命中——请删除（不留僵尸豁免）`); bad++; }
	console.log(`  · 故事 token ${tokens.size} 个（来自 ${storyFiles.length} 个故事文件）· 引擎门 ${engineGates.length} 个（${engineGates.map((g) => g.flags[0]).join(' ')}）· 命中 ${hitsAll} 处 · 白名单 ${Object.keys(ALLOW).length} 条`);

	if (bad) { console.error(`\n✗ 引擎门"无故事字面量"门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 引擎门"无故事字面量"门通过（故事数据住故事侧 · 注释不算 · 白名单带票号且不许腐烂）');
};
