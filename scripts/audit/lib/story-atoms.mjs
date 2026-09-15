// 故事**条件原子**的纯函数（`#628` 的抽取/计数/渲染；`#640` 的矩阵门也用它）——**无副作用、可导入**。
//
// 为什么要单独成文件：原先这些纯函数长在 `scripts/report-polarity-gap.mjs` 里，而那是**带 CLI 的脚本**
// ⇒ `import` 它会**顺带执行 CLI**（实测踩到：跑 `test/itemmatrix.mjs --selftest` 打出的是极性报告的自证）。
// 纪律：**带顶层 CLI 的文件不许被当库导入**——纯逻辑抽到这里，脚本只留 IO 与 CLI。
import { mask } from './mask.mjs';

// ── 纯函数：① 站点抽取 ────────────────────────────────────────────────
/** 从 `{相对路径: 源码}` 抽站点。注释一律遮蔽（历史记述不是站点）；`tags` 记段落标签（widget/script 要单独看）。 */
export const extractSites = (sources) => {
	const sites = [];
	let passage = '?', tags = '';
	for (const file of Object.keys(sources).sort()) {
		const text = mask(String(sources[file] ?? ''), { twee: true }).text;
		text.split('\n').forEach((line, i) => {
			if (/^::\s/.test(line)) {
				const m = line.slice(2).match(/^\s*([^\[]+?)\s*(?:\[(.*)\])?$/);
				passage = (m?.[1] ?? '?').trim();
				tags = m?.[2] ?? '';
				return;
			}
			if (!/<<(if|elseif)\b/.test(line)) return;
			const hit = (atom) => sites.push({ file, passage, tags, line: i + 1, atom });
			for (const m of line.matchAll(/\$pc\.inv\["([^"]+)"\]/g)) hit(`inv:${m[1]}`);
			for (const m of line.matchAll(/\$pc\.keeper\.(\w+)/g)) hit(`keeper:${m[1]}`);
			for (const m of line.matchAll(/Sg\.notes\.has\('([^']+)'\)/g)) hit(`note:${m[1]}`);
			if (/\$era\b/.test(line)) hit('era');
		});
	}
	return sites;
};

export const siteKey = (s) => `${s.passage}#${s.line}@${s.atom}`;
export const isRuleSite = (s) => /widget|script/.test(s.tags ?? '');

// ── 纯函数：② 极性计数 ────────────────────────────────────────────────
/** `obs`：siteKey → `{ t, f }`（真/假观测次数）。返回三档分类（顺序稳定：按段名、行号、原子）。 */
export const tallyPolarity = (sites, obs = new Map()) => {
	const uniq = [...new Map(sites.map((s) => [siteKey(s), s])).values()]
		.sort((a, b) => a.passage.localeCompare(b.passage, 'zh') || a.line - b.line || a.atom.localeCompare(b.atom));
	const both = [], one = [], none = [];
	for (const s of uniq) {
		const o = obs.get(siteKey(s)) ?? { t: 0, f: 0 };
		if (o.t && o.f) both.push({ ...s, obs: o });
		else if (o.t || o.f) one.push({ ...s, obs: o });
		else none.push({ ...s, obs: o });
	}
	return { uniq, both, one, none };
};

/** `era` 的极性是两态名（present/past），其它原子是真假 ⇒ 统一成"两侧计数"。 */
export const polarityBucket = (atom, value) => {
	if (atom === 'era') return value === 'past' ? 'f' : value === 'present' ? 't' : null;
	return value === true ? 't' : value === false ? 'f' : null;
};

// ── 纯函数：③ 报告渲染 ───────────────────────────────────────────────
export const renderReport = ({ sites, obs, runs, failedRuns = 0, visitedPassages = new Set(), scVisited = new Set(), scCells = new Set(), walkerCells = new Set(), promised = [] }) => {
	const { uniq, both, one, none } = tallyPolarity(sites, obs);
	const atoms = [...new Set(uniq.map((s) => s.atom))].sort();
	const promisedSet = new Set(promised);   // **门承诺**的原子（`#640` 的 `matrix.json`）——与「抽样可见性」是两个口径，这里并排给读者
	const rule = uniq.filter(isRuleSite);
	const erasOf = (p) => [...new Set([...scCells, ...walkerCells].filter((c) => String(c).startsWith(`${p}|`)).map((c) => String(c).split('|')[1]))];
	const byAtom = atoms.map((a) => {
		const ss = uniq.filter((s) => s.atom === a);
		const b = ss.filter((s) => obs.get(siteKey(s))?.t && obs.get(siteKey(s))?.f).length;
		const n = ss.filter((s) => !obs.has(siteKey(s))).length;
		const sc = [...new Set(ss.map((s) => s.passage))].filter((p) => scVisited.has(p)).length;
		return { atom: a, sites: ss.length, both: b, never: n, scPassages: sc, passages: new Set(ss.map((s) => s.passage)).size };
	}).sort((x, y) => (y.never + (y.sites - y.both)) - (x.never + (x.sites - x.both)) || x.atom.localeCompare(y.atom));
	const L = [];
	L.push('# 条件原子 × 极性：覆盖缺口报告（**report-only**，`#628`）\n');
	L.push('> 抽样观测，**未观测 ≠ 断言不存在**；口径见 `scripts/report-polarity-gap.mjs` 头部注释。\n');
	L.push('## 总览\n');
	L.push('| 项 | 数 |');
	L.push('|---|---|');
	L.push(`| 站点（原子×行，去重） | ${uniq.length}（场景段 ${uniq.length - rule.length} · 规则/widget 段 ${rule.length}） |`);
	L.push(`| 条件原子 | ${atoms.length} |`);
	L.push(`| 涉及段 | ${new Set(uniq.map((s) => s.passage)).size} |`);
	L.push(`| 游走观测 | ${runs} 局（失败/中断 ${failedRuns} 局）· 访问段 ${visitedPassages.size} |`);
	L.push(`| **已被门承诺的原子** | ${promisedSet.size}／${atoms.length}（\`matrix.json\` 的 \`promised\`；门只管承诺，本报告只管**抽样可见性**） |`);
	L.push(`| scenarios 落盘 | 访问段 ${scVisited.size}（era 格 ${scCells.size}）｜walker 落盘格 ${walkerCells.size} |`);
	L.push('');
	L.push('| 站点状态 | 数 | 含义（**抽样**） |');
	L.push('|---|---|---|');
	L.push(`| 两态都到过 | ${both.length} | 该段该原子真/假都有观测 ⇒ 两侧分支都有影子 |`);
	L.push(`| 只到过一态 | ${one.length} | 另一侧**零观测** ⇒ 待验 |`);
	L.push(`| 完全没观测到 | ${none.length} | 该段该原子一次都没求值过 |`);
	L.push('\n## 按原子（缺口排序，缺口大者在前）\n');
	L.push('| 原子 | 站点 | 两态 | 未观测 | 门已承诺 | scenarios 到过的段 | 涉及段 |');
	L.push('|---|---|---|---|---|---|---|');
	for (const r of byAtom) L.push(`| \`${r.atom}\` | ${r.sites} | ${r.both} | ${r.never} | ${promisedSet.has(r.atom) ? '✅' : '—'} | ${r.scPassages} | ${r.passages} |`);
	L.push('\n## 单态 / 未观测 站点清单\n');
	L.push('| 段 | 行 | 原子 | 观测(真/假) | scenarios 到过段 | era 格 | tag |');
	L.push('|---|---|---|---|---|---|---|');
	for (const s of [...one, ...none]) L.push(`| ${s.passage} | ${s.line} | \`${s.atom}\` | ${s.obs.t}/${s.obs.f} | ${scVisited.has(s.passage) ? '✅' : '—'} | ${erasOf(s.passage).join('/') || '—'} | ${s.tags || '—'} |`);
	return L.join('\n') + '\n';
};

