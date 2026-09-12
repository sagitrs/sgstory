// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['text']。校验：npm run audit:golden。
export const flag = 'text';
export const flags = ["text"];

export const run = (ctx) => {
	const { Game, Rules, Pc, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪e D5 语言经济（#39）：载荷标注门 + 词频报告 + 套路句式门 ──
if (wantAll || arg('text')) {
	console.log('\n══ ⓪e 语言经济（D5/#39）——每段有载荷，无陈词滥调 ══');
	let bad = 0;
	// 载荷门：内容段落须有 payload 标注（信息/张力/选择 ≥1）
	const payloads = new Map();
	for (const [name, src] of passageRaw) {
		if (name === 'StoryInit' || name.startsWith('Story')) continue;
		if (passageTags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t))) continue;
		const m = src.match(/payload:\s*(信息|张力|选择)(?:[|｜](?:信息|张力|选择))*/);
		if (!m) { console.log(`  ✗ 段落「${name}」缺 payload 标注`); bad++; }
		else payloads.set(name, m[0].split(':')[1]);
	}
	console.log(`  载荷标注：${payloads.size}（信息 ${[...payloads.values()].filter((v) => v.includes('信息')).length} · 张力 ${[...payloads.values()].filter((v) => v.includes('张力')).length} · 选择 ${[...payloads.values()].filter((v) => v.includes('选择')).length}）`);
	// 词频报告（主题词健康度）
	let narrative = '';
	for (const src of passageSrc.values()) narrative += src.replace(/\/%[\s\S]*?%\//g, '').replace(/<<[^>]*>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[\s''/]/g, '');
	const words = ['雾','星','塔','月光','森林','守林人','信物','三百'];
	console.log(`  主题词密度：${words.map((w) => `${w}×${narrative.split(w).length - 1}`).join(' ')}（总字 ${narrative.length}）`);
	// 套路句式门：白名单外命中即红（改写后划掉）
	const CLICHE = ['如潮水', '毛骨悚然', '倒吸一口', '心中一紧', '你感到一阵', '不由得'];
	// ── D5.6 风格门（#72 西式统一）：违和词黑名单——命名回潮/佛教词/中式餐具与体例
	for (const f of SRC_FILES) {
		const raw = readFileSync(f, 'utf8');
		for (const w of ['青梧', '星官', '星落林', '坠星志', '月光倾城', '平凡之光', '执念', '动筷', '汤盅', '温了又温', '一坛', '爬回了天上', '森林的根里']) {
			const i2 = raw.indexOf(w);
			if (i2 >= 0) {
				const line = raw.slice(0, i2).split('\n').length;
				console.log(`  ✗ 风格违和词「${w}」@ ${f.split('/').pop()}:${line}（#72 黑名单——替换表 docs/archive/westward-unification.md）`);
				bad++;
			}
		}
	}
	console.log('  风格门：黑名单 13 词扫描完成');
		const hits = CLICHE.filter((c) => narrative.includes(c));
	if (hits.length) { console.log(`  ✗ 套路句式命中：${hits.join('、')}`); bad += hits.length; }
	else console.log('  套路句式门：零命中');
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D5 文本门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D5 文本门通过');
	}
}
};
