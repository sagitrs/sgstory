// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['craft']。校验：npm run audit:golden。
export const flag = 'craft';
export const flags = ["craft"];

// ── 纯函数（供自证；判据与真实运行**同一份代码**）──
const stripMarkup = (s) => s.replace(/<<[\s\S]*?>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/''/g, '').replace(/<[^>]*>/g, '');
export const densityOf = (src) => {
	const t = stripMarkup(src);
	const n = t.length || 1;
	return { dash: (t.split('——').length - 1) / n * 1000, like: (t.split('像').length - 1) / n * 1000, paren: (t.split('（').length - 1) / n * 1000, chars: t.length };
};
// ⑤ 跨段落重复句：≥10 字、且只留汉字后完全相同的句子（结构性白名单除外）
export const judgeRepeats = (passages, ok = []) => {
	const seen = new Map();
	for (const n of Object.keys(passages)) {
		for (const x of stripMarkup(passages[n]).split(/[。！？!?\n]/)) {
			const t = x.replace(/[\s「」"'‘’“”：:，,、—－-]/g, '');
			if (t.length < 10 || !/^[\u4e00-\u9fff]+$/.test(t)) continue;
			if (!seen.has(t)) seen.set(t, []);
			if (!seen.get(t).includes(n)) seen.get(t).push(n);
		}
	}
	return [...seen].filter(([t, ps]) => ps.length > 1 && !ok.some((r) => r.test(t))).map(([t, ps]) => ({ text: t, passages: ps }));
};
// ⑥ 标点/斜体：半角标点混在汉字边 + `''` 奇数个（斜体会吃到段尾）
export const judgePunctuation = (passages) => {
	const halfRx = /[\u4e00-\u9fff][,;!?()]|[,;!?()][\u4e00-\u9fff]/g;
	const half = [], odd = [];
	for (const n of Object.keys(passages)) {
		const hits = [...stripMarkup(passages[n]).matchAll(halfRx)].map((m) => m[0]);
		if (hits.length) half.push({ name: n, hits });
		const q = (passages[n].match(/''/g) ?? []).length;
		if (q % 2) odd.push({ name: n, count: q });
	}
	return { half, odd };
};
// ⑦ 措辞密度 ratchet：与基线比只许降不许升（容差 tol）；新段不得超 cap
export const judgeDensity = (now, baseRows = {}, { tol = 0.05, cap = 20 } = {}) => {
	const out = [];
	for (const [n, v] of Object.entries(now)) {
		const b = baseRows[n];
		if (!b) { const m = Math.max(v.dash, v.like, v.paren); if (m > cap) out.push({ name: n, why: `新段最密项 ${m.toFixed(1)}‰ > ${cap}‰` }); continue; }
		for (const k of ['dash', 'like', 'paren']) if (v[k] > b[k] + tol) out.push({ name: n, why: `${k} 从 ${b[k]}‰ 涨到 ${v[k].toFixed(1)}‰（只许降不许升）` });
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪m 文字工艺门（#168 批次四 · 机检 ⑤–⑧）：重复台词 / 标点与斜体 / 措辞密度 / 道具名主张 ──
// 这四道落在"读起来"这一层：机器能替人盯住的只有形态——同一句重复、半角标点、斜体标记不成对、
// 某一段突然变密、正文里的道具写成了表里没有的名字。判不出好坏，但能把"改坏了"当场抓住。
if (wantAll || arg('craft')) {
	console.log('\n══ ⓪m 文字工艺门（#168 机检 ⑤–⑧）══');
	let bad = 0;
	// ── 自证（先证会红，再判真实数据）──
	{
		const LONG = '他沿着林间那条小路一直走到天快黑的时候';   // ≥10 汉字
		const cases = [
			['正例：句子各段唯一', judgeRepeats({ A: LONG + '。', B: '另一句完全不同的话也够长的一句子' }).length, 0],
			['反例①：同一句出现在两段', judgeRepeats({ A: LONG + '。', B: '开头。' + LONG + '。' }).length, 1],
			['正例：短句不算（<10 汉字）', judgeRepeats({ A: '走吧。', B: '走吧。' }).length, 0],
			['正例：结构性命中白名单', judgeRepeats({ A: LONG + '。', B: LONG + '。' }, [/^他沿着林间/]).length, 0],
			['反例②：半角标点混用', judgePunctuation({ A: '他说,走吧。' }).half.length, 1],
			['反例③：斜体标记奇数', judgePunctuation({ A: "''话没说完。" }).odd.length, 1],
			['正例：干净段落', judgePunctuation({ A: '他说，走吧。' }).half.length + judgePunctuation({ A: "''对''" }).odd.length, 0],
			['反例④：密度涨过容差', judgeDensity({ A: { dash: 1.2, like: 0, paren: 0 } }, { A: { dash: 1.0, like: 0, paren: 0 } }).length, 1],
			['正例：密度持平/下降', judgeDensity({ A: { dash: 0.9, like: 0, paren: 0 } }, { A: { dash: 1.0, like: 0, paren: 0 } }).length, 0],
			['反例⑤：新段超上限', judgeDensity({ NEW: { dash: 25, like: 0, paren: 0 } }, {}).length, 1],
			['正例：新段在上限内', judgeDensity({ NEW: { dash: 12, like: 0, paren: 0 } }, {}).length, 0],
		];
		for (const [label, got, want] of cases) {
			const ok = got === want;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
			if (!ok) bad++;
		}
	}
	const craftNames = [...passageSrc.keys()].filter((n) => !/^Story/.test(n) && !(passageTags.get(n) ?? []).some((t) => ['script', 'widget', 'stylesheet'].includes(t)));
	const strip = (s) => s.replace(/<<[\s\S]*?>>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/''/g, '').replace(/<[^>]*>/g, '');

	// ⑤ 重复台词门：同一句出现在两段以上（≥10 汉字、只留汉字后比对）——结局层与 NPC 台词重复最伤
	//    白名单只放"结构性重复"（同一句回指在多个段落各出现一次，由 CALLBACKS 门保证它真说过）。
	const REPEAT_OK = [/^（守林人说过从大门走$/];
	const seen = new Map();
	for (const n of craftNames) {
		for (const x of strip(passageSrc.get(n)).split(/[。！？!?\n]/)) {
			const t = x.replace(/[\s「」"'‘’“”：:，,、—－-]/g, '');
			if (t.length < 10 || !/^[\u4e00-\u9fff]+$/.test(t)) continue;
			if (!seen.has(t)) seen.set(t, []);
			if (!seen.get(t).includes(n)) seen.get(t).push(n);
		}
	}
	const dups = [...seen].filter(([t, ps]) => ps.length > 1 && !REPEAT_OK.some((r) => r.test(t)));
	for (const [t, ps] of dups) { console.log(`  ✗ [重复] 同一句出现在 ${ps.length} 段：${ps.join(' / ')}\n        「${t}」`); bad++; }
	console.log(`  ⑤ 重复台词门：跨段落重复句 ${dups.length} 处（结构性白名单 ${REPEAT_OK.length} 条）`);

	// ⑥ 标点与斜体门：正文里不许混半角标点（`''` 是 Twee 的斜体标记，左侧半角括号/逗号最常混进来）；
	//    `''` 出现奇数次 → 斜体从那里一直吃到段尾，屏上是肉眼可见的错。
	const halfRx = /[\u4e00-\u9fff][,;!?()]|[,;!?()][\u4e00-\u9fff]/g;
	let half = 0, italBad = 0;
	for (const n of craftNames) {
		const hits = [...strip(passageSrc.get(n)).matchAll(halfRx)].map((m) => m[0]);
		if (hits.length) { console.log(`  ✗ [标点] 「${n}」混了半角标点：${hits.join(' ')}`); bad++; half += hits.length; }
		const q = (passageSrc.get(n).match(/''/g) ?? []).length;
		if (q % 2) { console.log(`  ✗ [斜体] 「${n}」的 '' 标记是奇数（${q}）——斜体会一直吃到段尾`); bad++; italBad++; }
	}
	console.log(`  ⑥ 标点与斜体门：半角混用 ${half} 处 · 斜体不成对 ${italBad} 段`);

	// ⑦ 措辞密度门（ratchet）：破折号 / 像 / 括号 三种"容易成瘾"的写法，按段落记密度，
	//    与 test/density-baseline.json 比——只许降不许升。改写确实需要变密时，跑 --update-density 重签基线并在 PR 里说明。
	const DENSITY = 'test/density-baseline.json';
	const densityOf = (src) => {
		const t = strip(src);
		const n = t.length || 1;
		return { dash: (t.split('——').length - 1) / n * 1000, like: (t.split('像').length - 1) / n * 1000, paren: (t.split('（').length - 1) / n * 1000, chars: t.length };
	};
	const now = {};
	for (const n of craftNames) now[n] = densityOf(passageSrc.get(n));
	if (process.argv.includes('--update-density')) {
		const rows = Object.fromEntries(Object.entries(now).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, { dash: +v.dash.toFixed(1), like: +v.like.toFixed(1), paren: +v.paren.toFixed(1), chars: v.chars }]));
		writeFileSync(DENSITY, JSON.stringify({ note: '#168 机检⑦ 措辞密度 ratchet：破折号/像/括号 每千字次数。只许降不许升——改写后确实要变密，请 --update-density 重签并在 PR 里写明理由。', rows }, null, '\t') + '\n');
		console.log(`  ⑦ 密度基线已重签：${Object.keys(rows).length} 段（${DENSITY}）`);
	} else {
		let base = { rows: {} };
		try { base = JSON.parse(readFileSync(DENSITY, 'utf8')); } catch { console.log('  ℹ 缺密度基线，先跑 node scripts/audit.mjs --craft --update-density'); }
		let over = 0;
		for (const [n, v] of Object.entries(now)) {
			const b = base.rows[n];
			if (!b) { if (Math.max(v.dash, v.like, v.paren) > 20) { console.log(`  ✗ [密度] 新段「${n}」最密项 ${Math.max(v.dash, v.like, v.paren).toFixed(1)}‰ > 20‰——先改写，或重签基线`); bad++; over++; } continue; }
			for (const k of ['dash', 'like', 'paren']) {
				if (v[k] > b[k] + 0.05) { console.log(`  ✗ [密度] 「${n}」${k} 从 ${b[k]}‰ 涨到 ${v[k].toFixed(1)}‰（只许降不许升）`); bad++; over++; }
			}
		}
		const top = Object.entries(now).sort((a, b) => Math.max(b[1].dash, b[1].like, b[1].paren) - Math.max(a[1].dash, a[1].like, a[1].paren)).slice(0, 3);
		console.log(`  ⑦ 措辞密度门：超基线 ${over} 项 · 当前最密 ${top.map(([n, v]) => `${n} ${Math.max(v.dash, v.like, v.paren).toFixed(1)}‰`).join(' / ')}`);
	}

	// ⑧ 道具名主张门：正文与表里提到的道具名，必须就是 Items.defs 的键（别名回流＝又一个"四个叫法"）；
	//    `$pc.inv["…"]` 里写的键也必须真的存在（写错一个字，那件道具永远不会被认出来）。
	const itemKeys = Object.keys(Game.Items.defs);
	const ALIAS_BAN = ['法杖', '星铁之杖', '龙穴', '女巫的门道'];
	let aliasHit = 0, keyBad = 0;
	for (const f of SRC_FILES) {
		const raw = readFileSync(f, 'utf8');
		for (const w of ALIAS_BAN) {
			const i = raw.indexOf(w);
			if (i >= 0) { console.log(`  ✗ [道具名] 别名「${w}」回流 @ ${f.split('/').pop()}:${raw.slice(0, i).split('\n').length}（Items.defs 只用：${itemKeys.join(' / ')}）`); bad++; aliasHit++; }
		}
	}
	for (const [n, src] of passageSrc) {
		for (const m of src.matchAll(/\$pc\.inv\[['"]([^'"]+)['"]\]/g)) {
			if (!itemKeys.includes(m[1])) { console.log(`  ✗ [道具名] 「${n}」引用了道具表里没有的键「${m[1]}」`); bad++; keyBad++; }
		}
	}
	for (const k of itemKeys) {
		const d = Game.Items.defs[k];
		if (!d.from || !d.note) { console.log(`  ✗ [道具名] 「${k}」缺 from/note（每件都要有来处与用途）`); bad++; }
	}
	console.log(`  ⑧ 道具名主张门：别名回流 ${aliasHit} 处 · 引用错键 ${keyBad} 处 · 表 ${itemKeys.length} 件`);

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 文字工艺门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 文字工艺门通过（重复 0 · 标点/斜体 0 · 密度未升 · 道具名与表一致）');
	}
}
};
