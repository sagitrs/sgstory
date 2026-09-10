// L3 覆盖率 ratchet（#14 / M1c 收紧）：聚合 L1/L2 覆盖落盘，五门禁 + 盲区报告
//   门1（不回退）：基线格 ⊆ 实际格，缩水即 fail（防覆盖回归；有意缩水请先更新基线并说明）
//   门2（新内容必配测）：diff 新增段落必须被交互覆盖（scenarios/walker 踩到）或显式豁免（附理由）
//   门3（无交互盲区）：每个内容段落必须有可点击到达路径
//   门4（时代双态）：按 $era 分叉的段落，present/past 两态都要被交互踩到
//   门5（交互≥渲染）：交互格数不得少于渲染格数
// 用法：node test/coverage.mjs [--update-baseline]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const UPDATE = process.argv.includes('--update-baseline');
const BASELINE = 'test/coverage-baseline.json';
const EXEMPT = 'test/coverage-exempt.json';

// ── 聚合三路落盘 ─────────────────────────────────────────
const load = (f) => { try { return new Set(JSON.parse(readFileSync(f, 'utf8')).cells ?? []); } catch { return new Set(); } };
const renderCells = load('build/coverage-render.json');      // L1 渲染覆盖
const interactCells = new Set([...load('build/coverage-scenarios.json')]); // 交互覆盖口径 = scenarios（#27：walker 降级 soak，其落盘仅供 soak 审计参考，不入门禁）
if (!renderCells.size || !interactCells.size) {
	console.error('✗ 覆盖落盘缺失（build/coverage-*.json）——请先完整跑 npm test 前序步骤');
	process.exit(1);
}

// ── 段落清单（与 integrity.mjs 同源解析）──────────────────
const passages = new Map();
for (const f of readdirSync('src').filter((x) => x.endsWith('.twee')).sort()) {
	const lines = readFileSync(join('src', f), 'utf8').split('\n');
	const heads = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^::\s+(.+?)\s*(?:\[([^\]]*)\])?\s*(?:\{.*\})?\s*$/);
		if (m) heads.push({ i, name: m[1].trim(), tags: (m[2] ?? '').split(/\s+/).filter(Boolean) });
	}
	heads.forEach((h, k) => {
		const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
		passages.set(h.name, { file: f, tags: h.tags, body: lines.slice(h.i + 1, end).join('\n') });
	});
}
const isInfra = (name) => {
	const p = passages.get(name);
	return name.startsWith('Story') || name === '样式' || (p?.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t)) ?? false);
};
const contentNames = [...passages.keys()].filter((n) => !isInfra(n));

// ── 门1：基线不回退 ───────────────────────────────────────
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { render: [], interact: [] };
const lostRender = baseline.render.filter((c) => !renderCells.has(c));
const lostInteract = baseline.interact.filter((c) => !interactCells.has(c));
// 基线里指向已删除段落的格：也视为缩水（强制同步基线，留审计痕迹）
let gate1 = 0;
if (lostRender.length) { console.error(`✗ 渲染覆盖缩水 ${lostRender.length} 格：${lostRender.join('，')}`); gate1++; }
if (lostInteract.length) { console.error(`✗ 交互覆盖缩水 ${lostInteract.length} 格：${lostInteract.join('，')}`); gate1++; }

// ── 门2：新增段落必须被交互覆盖或豁免 ─────────────────────
const exempt = existsSync(EXEMPT) ? JSON.parse(readFileSync(EXEMPT, 'utf8')) : {};
let newPassages = [];
let hasBase = true;
try {
	execSync('git rev-parse --verify origin/main 2>/dev/null', { encoding: 'utf8', stdio: 'pipe' });
	const diff = execSync('git diff origin/main -- src/ 2>/dev/null', { encoding: 'utf8' }); // 含未提交变更（工作树感知）
	newPassages = [...diff.matchAll(/^\+::\s+(.+?)\s*(?:\[|\{|$)/gm)].map((m) => m[1].trim());
} catch { hasBase = false; }
// 未跟踪的新 twee 文件（本地新增尚未 git add）
try {
	const untracked = execSync('git ls-files --others --exclude-standard src/', { encoding: 'utf8' }).trim().split('\n').filter((f) => f?.endsWith('.twee'));
	for (const f of untracked) {
		for (const m of readFileSync(f, 'utf8').matchAll(/^::\s+(.+?)\s*(?:\[|\{|$)/gm)) newPassages.push(m[1].trim());
	}
} catch { /* 无 untracked */ }
let gate2 = 0;
const uncoveredNew = newPassages.filter((n) => {
	const cells = [...interactCells].some((c) => c.startsWith(`${n}|`));
	return !cells && !(n in exempt) && !isInfra(n);
});
if (!hasBase) {
	console.log('ℹ 无 origin/main 基线引用，门2（新内容必配测）跳过——本地完整生效');
}
if (uncoveredNew.length) {
	console.error(`✗ 新增段落未被任何交互测试踩到（gate#9 等效）：${uncoveredNew.join('，')}`);
	console.error('  → 为其补 scenarios 路线或 walker 注入，或在 test/coverage-exempt.json 豁免并写理由');
	gate2++;
}
for (const n of Object.keys(exempt)) if (!passages.has(n)) console.log(`⚠ 豁免清单中段落「${n}」已不存在，可移除`);

// ── 盲区报告 + 门3/4/5（M1c 收紧）────────────────────────
const interactBlind = contentNames.filter((n) => ![...interactCells].some((c) => c.startsWith(`${n}|`)));
const renderBlind = contentNames.filter((n) => ![...renderCells].some((c) => c.startsWith(`${n}|`)));
console.log(`内容段落 ${contentNames.length} · 渲染覆盖 ${contentNames.length - renderBlind.length} · 交互覆盖 ${contentNames.length - interactBlind.length}（格：渲染 ${renderCells.size} / 交互 ${interactCells.size}）`);
if (interactBlind.length) console.log(`交互盲区段落：${interactBlind.join('，')}`);
if (renderBlind.length) console.log(`渲染盲区段落：${renderBlind.join('，')}`);

// 门3：交互盲区必须为空（内容段落一律有可点击到达路径——不再只是信息性报告）
let gate3 = 0;
if (interactBlind.length) {
	console.error(`✗ 门3 交互盲区 ${interactBlind.length} 段：${interactBlind.join('，')}（补 scenarios 路线或 walker 注入）`);
	gate3++;
}
// 门4：按 $era 分叉的段落，交互必须覆盖 present/past 两态（渲染已双跑；交互不许只踩一边）
const eraPassages = contentNames.filter((n) => (passages.get(n)?.body ?? '').includes('$era'));
const eraMissing = [];
for (const n of eraPassages) {
	for (const era of ['present', 'past']) {
		if (!interactCells.has(`${n}|${era}`)) eraMissing.push(`${n}|${era}`);
	}
}
let gate4 = 0;
if (eraMissing.length) {
	console.error(`✗ 门4 时代分叉交互缺态 ${eraMissing.length} 格：${eraMissing.join('，')}`);
	gate4++;
} else {
	console.log(`时代分叉段落 ${eraPassages.length} 段 · present/past 双态交互覆盖齐`);
}
// 门5：交互覆盖格数不得少于渲染覆盖格数（交互是更强的口径）
let gate5 = 0;
if (interactCells.size < renderCells.size) {
	console.error(`✗ 门5 交互格 ${interactCells.size} < 渲染格 ${renderCells.size}（交互口径必须 ≥ 渲染）`);
	gate5++;
}

// ── 门6（#168 机检⑩）：链接级覆盖——渲染出来的每一个可点元素，必须真被某条路线点过 ──
// 老口径按「段落|时代」记格：同一段里有一条链接从没被点过，照样是绿的。P1-1 的断链与 P1-29
// 的"抄书人跑腿"就是这样漏掉的。这里把 render-all 收集的链接清单与 scenarios 的点击记录对账，
// 未点过的必须命中 test/link-whitelist.json 里一条带理由的规则。
const LINKS_RENDER = 'build/coverage-links.json';
const LINKS_CLICK = 'build/coverage-links-scenarios.json';
const LINKS_WL = 'test/link-whitelist.json';
let gate6 = 0;
if (!existsSync(LINKS_RENDER) || !existsSync(LINKS_CLICK)) {
	console.error(`✗ 门6 链接级覆盖：缺 ${LINKS_RENDER} / ${LINKS_CLICK}——请先完整跑 render-all 与 scenarios`);
	gate6++;
} else {
	const renderLinks = JSON.parse(readFileSync(LINKS_RENDER, 'utf8')).links ?? {};
	const clickLinks = JSON.parse(readFileSync(LINKS_CLICK, 'utf8')).links ?? {};
	const rules = (JSON.parse(readFileSync(LINKS_WL, 'utf8')).rules ?? []).map((r) => ({ key: new RegExp(r.key), label: new RegExp(r.label), why: r.why }));
	const uncovered = [];
	for (const [key, labels] of Object.entries(renderLinks)) {
		const clicked = new Set(clickLinks[key] ?? []);
		for (const label of labels) {
			if (clicked.has(label)) continue;
			if (rules.some((r) => r.key.test(key) && r.label.test(label))) continue;
			uncovered.push(`${key}::${label}`);
		}
	}
	if (uncovered.length) {
		console.error(`✗ 门6 链接级覆盖缺口 ${uncovered.length} 条（渲染出来却没有任何路线点过）：`);
		for (const u of uncovered.slice(0, 20)) console.error(`   ${u}`);
		if (uncovered.length > 20) console.error(`   …还有 ${uncovered.length - 20} 条`);
		console.error(`  → 给其中至少一条补上 scenarios 路线 / walker 注入，或在 ${LINKS_WL} 里补一条带理由的规则`);
		gate6++;
	} else {
		console.log(`链接级覆盖：${Object.keys(renderLinks).length} 格全部对账通过（点过的 + 白名单规则内）`);
	}
}

// ── 基线更新/判定 ───────────────────────────────────────
if (UPDATE) {
	writeFileSync(BASELINE, JSON.stringify({ render: [...renderCells].sort(), interact: [...interactCells].sort() }, null, '\t') + '\n');
	console.log(`✔ 基线已更新：渲染 ${renderCells.size} 格 / 交互 ${interactCells.size} 格（${BASELINE}，请人工审后提交）`);
	process.exit(0);
}
const gates = gate1 + gate2 + gate3 + gate4 + gate5 + gate6;
if (gates > 0) {
	if (!existsSync(BASELINE)) console.error('ℹ 首次生成基线：node test/coverage.mjs --update-baseline');
	process.exit(1);
}
console.log('✔ 覆盖率 ratchet 通过（门1 无缩水 · 门2 新段落配测 · 门3 无交互盲区 · 门4 时代双态 · 门5 交互≥渲染 · 门6 链接级覆盖）');
