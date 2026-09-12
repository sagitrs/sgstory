// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['text']。校验：npm run audit:golden。
export const flag = 'text';
export const flags = ["text"];

// ── 纯函数（供自证喂合成数据；判据与真实运行**同一份代码**）──
// ① 载荷标注：内容段落（非 infra）必须有 `payload:` 标注
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
	let narrative = '';
	for (const src of passageSrc.values()) narrative += src.replace(/\/%[\s\S]*?%\//g, '').replace(/<<[^>]*>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[\s''/]/g, '');
	const words = ['雾','星','塔','月光','森林','守林人','信物','三百'];
	console.log(`  主题词密度：${words.map((w) => `${w}×${narrative.split(w).length - 1}`).join(' ')}（总字 ${narrative.length}）`);
	// 套路句式门：白名单外命中即红（改写后划掉）
	const CLICHE = ['如潮水', '毛骨悚然', '倒吸一口', '心中一紧', '你感到一阵', '不由得'];
	// ── D5.6 风格门（#72 西式统一）：违和词黑名单——命名回潮/佛教词/中式餐具与体例
	for (const f of judgeBlacklist(SRC_FILES, ['青梧', '星官', '星落林', '坠星志', '月光倾城', '平凡之光', '执念', '动筷', '汤盅', '温了又温', '一坛', '爬回了天上', '森林的根里'], (k) => readFileSync(k, 'utf8'))) {
		console.log(`  ✗ 风格违和词「${f.word}」@ ${f.file.split('/').pop()}:${f.line}（#72 黑名单——替换表 docs/archive/westward-unification.md）`);
		bad++;
	}
	console.log('  风格门：黑名单 13 词扫描完成');
		const hits = judgeCliche(narrative, CLICHE);
	if (hits.length) { console.log(`  ✗ 套路句式命中：${hits.join('、')}`); bad += hits.length; }
	else console.log('  套路句式门：零命中');
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D5 文本门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D5 文本门通过');
	}
}
};
