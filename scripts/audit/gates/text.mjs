// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { stripJsComments, storyText } from '../lib/shared.mjs';
// flags=['text']。校验：npm run audit:golden。
import { ROOT } from '../../dist-paths.mjs';
import { loadStoryAudit } from '../lib/story-audit.mjs';
export const flag = 'text';
export const flags = ["text"];

// ── 纯函数（供自证喂合成数据；判据与真实运行**同一份代码**）──
// ① 载荷标注：内容段落（非 infra）必须有 `payload:` 标注
/** 纯函数：把段落源码拼成「正文语料」——**跳过 infra 段**（`[script]`／widget／stylesheet 是代码，不是玩家读到的字）
 *  并先剥 JS 注释。为什么两件事都要（`#527` 的两个实测）：
 *  · 只剥注释不够：`[script]` 段的 **JS 代码本体**也会被当正文（S1 机制片实测 +1776 字）；
 *  · 注释更不是正文（`#519` +92 · `#486` +2572 —— 改一行说明就逼重签 golden）。
 *  口径与 `judgePayloads` 的 `isInfra` **同源**（同一份判定，别两处各写一套）。 */
export const buildNarrative = (entries, isInfra) => {
	let out = '';
	for (const [name, src] of entries) {
		if (isInfra(name)) continue;
		out += stripJsComments(src).replace(/\/%[\s\S]*?%\//g, '').replace(/<<[^>]*>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[\s''/]/g, '');
	}
	return out;
};

export const judgePayloads = (entries, isInfra) => {
	const out = [];
	for (const [name, src] of entries) {
		if (isInfra(name)) continue;
		const m = String(src).match(/payload:\s*(信息|张力|选择)(?:[|｜](?:信息|张力|选择))*/);
		if (!m) out.push({ name, why: '缺 payload 标注' });
	}
	return out;
};
// ② 套路句式：白名单外命中即算
export const judgeCliche = (narrative, list) => list.filter((c) => narrative.includes(c));
// ③ 风格违和词黑名单：跨文件扫描（返回 词/文件/行号）
export const judgeBlacklist = (files, words, readOf) => {
	const out = [];
	for (const f of files) {
		const raw = readOf(f);
		for (const w of words) {
			const i = raw.indexOf(w);
			if (i >= 0) out.push({ word: w, file: f, line: raw.slice(0, i).split('\n').length });
		}
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪e D5 语言经济（#39）：载荷标注门 + 词频报告 + 套路句式门 ──
if (wantAll || arg('text')) {
	console.log('\n══ ⓪e 语言经济（D5/#39）——每段有载荷，无陈词滥调 ══');
	let bad = 0;
	// ── 自证（先证会红，再判真实数据；合成夹具 → 期望检出数）──
	{
		const infra = (n) => n === 'StoryInit' || n.startsWith('Story') || n === '脚本段';
		const tagOf = (n) => (n === '脚本段' ? ['script'] : []);
		const isInfra = (n) => infra(n) || (tagOf(n) ?? []).some((t) => ['script', 'widget', 'stylesheet'].includes(t));
		const fakeFiles = { 'a.twee': '第一行\n这里有青梧两个字' };
		const readOf = (f) => fakeFiles[f] ?? '';
		const cases = [
			['正例：内容段有 payload', judgePayloads([['P', '/% payload: 信息 %/正文']], isInfra), 0],
			['反例①：内容段缺 payload', judgePayloads([['P', '正文没有标注']], isInfra), 1],
			['正例：infra 段不要求 payload', judgePayloads([['StoryInit', 'window.x=1'], ['脚本段', 'x']], isInfra), 0],
			['正例：干净正文无套路句式', judgeCliche('他走进林子', ['如潮水', '不由得']), 0],
			['反例②：命中套路句式', judgeCliche('心跳如潮水', ['如潮水', '不由得']), 1],
			['正例：黑名单外不算', judgeBlacklist(['a.twee'], ['星官'], readOf), 0],
			['反例③：风格违和词（含行号）', judgeBlacklist(['a.twee'], ['青梧'], readOf), 1],
			['正例：`//` 与 `/* */` 注释不成正文（#486）', stripJsComments('正文// 注释\n/* 块\n注释 */更多').replace(/[\s''/]/g, '').length, '正文更多'.length],
			['正例：`//` 与 `/* */` 注释不成正文（#486）', stripJsComments('正文// 注释\n/* 块\n注释 */更多').replace(/[\s''/]/g, '').length, '正文更多'.length],
			['正例：infra 段（`[script]`）整段不成正文（#527）', buildNarrative([['X', 'const a = 1'], ['P', '正文']], (n) => n === 'X').length, '正文'.length],
			['反例：内容段仍要计数（防"把正文一起漏掉"）', buildNarrative([['P', '正文']], () => false).length, '正文'.length],
			// #435 前置 0：故事文本源（内容段落 ∪ 归属到它的表行 `text`）——本门「总字」的口径
			['正例：表行 `text` 按 `scope` 归属进段落（总字含表）', buildNarrative(storyText({ passageSrc: new Map([['P', '甲']]), passageTags: new Map(), rows: [{ id: 'R', scope: 'P#一', text: '乙' }] }).text, () => false).length, '甲乙'.length],
			['正例：多行按**表序**追加（顺序稳定 ⇒ 基线可复算）', buildNarrative(storyText({ passageSrc: new Map([['P', '']]), rows: [{ id: 'A', scope: 'P#一', text: '一' }, { id: 'B', scope: 'P#二', text: '二' }] }).text, () => false).length, '一二'.length],
			['边界：`scope` 段落不存在 ⇒ **不归属**（进 `orphans`，由 `--rules` 判红）', storyText({ passageSrc: new Map([['P', '甲']]), rows: [{ id: 'R', scope: '无此段', text: '乙' }] }).orphans.length, 1],
			['边界：行 `text` 为空 ⇒ 不产生归属（不会凭空多一个空行）', (storyText({ passageSrc: new Map([['P', '甲']]), rows: [{ id: 'R', scope: 'P#一', text: '' }] }).text.get('P') ?? '').length, '甲'.length],
			['边界：`段落#位点` 只取 `#` 前归属（位点名不进段落名）', storyText({ passageSrc: new Map([['P', '']]), rows: [{ id: 'R', scope: 'P#位点', text: '乙' }] }).rowIds.get('P').join(), 'R'],
		];
		for (const [label, got, want] of cases) {
			const n = Array.isArray(got) ? got.length : got;
			const ok = n === want;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${n}（期望 ${want}）`);
			if (!ok) bad++;
		}
	}
	// 载荷门：内容段落须有 payload 标注（信息/张力/选择 ≥1）
	const payloads = new Map();
	const isInfra = (name) => name === 'StoryInit' || name.startsWith('Story') || (passageTags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t)) ?? false);
	for (const [name, src] of passageRaw) if (!isInfra(name)) { const m = String(src).match(/payload:\s*(信息|张力|选择)(?:[|｜](?:信息|张力|选择))*/); if (m) payloads.set(name, m[0].split(':')[1]); }
	for (const f of judgePayloads(passageRaw, isInfra)) { console.log(`  ✗ 段落「${f.name}」缺 payload 标注`); bad++; }
	console.log(`  载荷标注：${payloads.size}（信息 ${[...payloads.values()].filter((v) => v.includes('信息')).length} · 张力 ${[...payloads.values()].filter((v) => v.includes('张力')).length} · 选择 ${[...payloads.values()].filter((v) => v.includes('选择')).length}）`);
	// 词频报告（主题词健康度）
	// #435 前置 0：【故事文本源】单一权威 —— 内容段落 ∪ 归属到它的表行 `text`。
	// 为什么必须收进来：表里的 `text` 也是玩家读到的正文；不收 ⇒ 阶段 4 之后「总字」**系统性偏低**
	//（实测 25998→25967 而 `--zero` 退 0：可见文本没变，只是搬进了表）
	const st = storyText({ passageSrc, passageTags, rows: ctx.window?.Sg?.story?.rules?.() ?? [] });
	let narrative = '';
	narrative = buildNarrative(st.text, isInfra);   // #527：跳过 infra 段 ＋ 剥 JS 注释（两件都要）
	// `#602`：**主题词表属该故事的数据**（经 `Sg.story.text()` 取）——原先硬编码在本门里 ⇒
	// 换故事后本行还在打印**故事 1 的词**（全 0 照绿＝空判，实测 `--story hollow-cave` 输出 `雾×0 星×0 …`）。
	// 数据住**该故事目录**（`stories/<slug>/audit.json`，不进产物）；缺文件/畸形 ⇒ 抛错（`loadStoryAudit` 负责）
	const auditData = loadStoryAudit(ctx.storySlug, { root: ROOT });
	const words = auditData.topicWords;
	if (!words.length) console.log('  主题词密度：**本故事未声明主题词**（`stories/<slug>/audit.json` 的 `text.topicWords` 为空）——本判据对该故事不适用，不再借用其它故事的词表（#602）');
	else console.log(`  主题词密度：${words.map((w) => `${w}×${narrative.split(w).length - 1}`).join(' ')}（总字 ${narrative.length}）`);
	console.log(`  故事文本源：内容段落 ＋ 表行 \`text\`（归属到 ${[...st.rowIds.keys()].length} 个段落、${[...st.rowIds.values()].flat().length} 行）${st.orphans.length ? ` · ⚠ ${st.orphans.length} 行归属段落不存在（见 --rules）` : ''}`);
	// 套路句式门：白名单外命中即红（改写后划掉）
	const CLICHE = ['如潮水', '毛骨悚然', '倒吸一口', '心中一紧', '你感到一阵', '不由得'];
	// ── D5.6 风格门（#72 西式统一）：违和词黑名单——命名回潮/佛教词/中式餐具与体例
	// `#602`：**风格违和词黑名单也属该故事的数据**（原先写死在本门 ⇒ 故事 2/3 会被故事 1 的黑名单判红）。
	const blacklist = auditData.styleBlacklist;
	if (!blacklist.length) console.log('  风格门：**本故事未声明违和词**（`stories/<slug>/audit.json` 的 `text.styleBlacklist` 为空；空表是合法数据集）——跳过扫描（#602）');
	else {
		// 只扫**正文段**：`[script]`/`[widget]`/`[stylesheet]` 是数据/机制（**黑名单本身就声明在那里**，
		// 扫它们等于让词表命中自己），而风格门本来只管散文（`#602`）。
		const proseOf = (f) => readFileSync(f, 'utf8').split(/^::\s*/m).slice(1)
			.filter((part) => !/\[(script|widget|stylesheet)\b/.test(part.slice(0, part.indexOf('\n'))))
			.map((part) => part.slice(part.indexOf('\n') + 1)).join('\n');
		for (const f of judgeBlacklist(SRC_FILES, blacklist, proseOf)) {
			console.log(`  ✗ 风格违和词「${f.word}」@ ${f.file.split('/').pop()}:${f.line}（本故事声明的黑名单——替换表 docs/archive/westward-unification.md）`);
			bad++;
		}
		console.log(`  风格门：黑名单 ${blacklist.length} 词扫描完成`);
	}
		const hits = judgeCliche(narrative, CLICHE);
	if (hits.length) { console.log(`  ✗ 套路句式命中：${hits.join('、')}`); bad += hits.length; }
	else console.log('  套路句式门：零命中');
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D5 文本门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D5 文本门通过');
	}
}
};
