// 选项定位键门（#317②）：派生 `data-choice` 的**歧义**必须静态可查。
//
// 派生规则见 `src/80-script.twee` 末尾的 `:passageend.sgChoiceKey`：`data-choice` ＝ 目标段落名
//（或最近的 `[data-key]` 容器声明）。测试用 `clickByKey(key)` 定位，不再依赖中文文案。
//
// 为什么需要这道门：同一个渲染态里若出现 **≥2 条相同 key**，两条链接的**目标相同、但副作用未必相同**
//（各自的 setter 在各自的处理器里，比如「摘哨子」与「把墙上那支哨子摘下来」可能一件多给一样东西）。
// 此时 `clickByKey` 会**静默点到第一条** —— 测试以为自己点对了，其实点的是另一条。
// 把「歧义」从运行期偶发变成静态可查：
// · 同一渲染态里重复 key（且未在白名单）→ 红，要求给该链接加作者覆盖（`data-key` 容器）；
// · 白名单条目若**不再有对应重复** → 也红（防白名单腐烂，与 `test/globals.mjs` 的 A2 同款）。
//
// 白名单里的每一条都必须写清「为什么这两条等价」。
//
// 自证：`node test/choice-keys.mjs --selftest`

import { newGame } from './harness.mjs';   // `#1353` 批 2（接夹具）：车卡引导**不再手写**（✗ 不写死某故事的段名）

// 已人工确认**等价**（点到哪条都一样）的重复：`段落|时代 → key`
export const ALLOW = {
	// `#1353` 批 2（接夹具）：**合法汇流**样本 —— 夹具 `m3-nav-fixture` 的「起点」有**三条**链接、
	//   其中两条文案不同（「绕远路」／「翻窗出去」）但**目标同为「终点」**。
	//   ★这是**设计上允许**的形（两条路通往同一段）⇒ 登记理由：它们**副作用相同**（都是纯导航、无 setter），
	//     语义上确实等价 ⇒ 派生 key 相同**不是**歧义（✗ 歧义的定义是看着是两件事、实际同段且副作用不同）。
	'起点|now → 终点': '三条入口都只做同一件事（纯导航到「终点」，无 setter）⇒ 合法汇流，不是歧义',
};

// 判定（纯函数，便于自证）：findings = 新增歧义；stale = 白名单腐烂
export const judge = (seen, allow = ALLOW) => {
	const dups = new Map();                       // '段落|时代 → key' → 次数
	for (const { where, key, n } of seen) if (n >= 2) dups.set(`${where} → ${key}`, n);
	const findings = [...dups.keys()].filter((k) => !(k in allow)).map((k) => ({ code: 'ambiguous-key', id: k, msg: `${k}（同一渲染态出现 ${dups.get(k)} 条）——clickByKey 会点到第一条，请给链接加 data-key 覆盖或写进白名单并说明为何等价` }));
	const stale = Object.keys(allow).filter((k) => !dups.has(k)).map((k) => ({ code: 'stale-allow', id: k, msg: `白名单里的 ${k} 已不再重复（改文案/删分支了？）——请删除该条` }));
	return { findings, stale, dupCount: dups.size };
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const seen = [{ where: '门厅|now', key: '门厅·摘', n: 2 }, { where: '门厅|now', key: '塔门', n: 1 }];
	const allow = {};
	t('反例①：重复 key 未在白名单 → 判歧义', judge(seen, allow).findings.length === 1);
	t('正例①：重复 key 在白名单 → 不判', judge(seen, { '门厅|now → 门厅·摘': '两条都只做同一件事' }).findings.length === 0);
	t('正例②：无重复 → 无 findings', judge([{ where: 'A|now', key: 'B', n: 1 }], {}).findings.length === 0);
	t('反例②：白名单腐烂 → 判红', judge([{ where: 'A|now', key: 'B', n: 1 }], { 'A|now → 不存在': 'x' }).stale.length === 1);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：歧义红 / 白名单内绿 / 无重复绿 / 白名单腐烂红');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ── 真实运行：逐段落（$era 段双时代）× 渲染态收集派生 key ──────────────
// `#1353` 批 2（接夹具）：车卡引导改走公共 `harness.newGame`（✗ 不手写旧故事三标签）。
//   本件同样**不传** `chargen`：无车卡的故事跳过该链（有车卡却没给标签 ⇒ `newGame` 当场点名报错 ✓）。
const session = await newGame({ random: 0.5 });
const { w, uncaught, sleep } = session;

const snapshot = JSON.stringify(w.SugarCube.State.variables);
const restore = (era) => {
	w.eval(`(function(){const v=SugarCube.State.variables;for(const k of Object.keys(v))delete v[k];Object.assign(v,${snapshot});${era ? `v.era=${JSON.stringify(era)};` : ''}})()`);
};
const all = [...w.document.querySelectorAll('tw-passagedata')].map((el) => ({ name: el.getAttribute('name'), tags: (el.getAttribute('tags') ?? '').trim().split(/\s+/).filter(Boolean), src: el.textContent }));
const isInfra = (p) => p.name.startsWith('Story') || p.tags.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
const content = all.filter((p) => !isInfra(p) && p.name);

const seen = [];
let checked = 0, missing = 0;
for (const p of content) {
	for (const era of (p.src.includes('$era') ? [null, 'past'] : [null])) {
		restore(era);
		const before = uncaught.length;
		w.SugarCube.Engine.play(p.name);
		await sleep(25);
		if (uncaught.length > before) continue;            // 渲染异常交给 render-all
		const root = w.document.querySelector('#passages');
		const links = [...root.querySelectorAll('a.link-internal[data-passage]')];
		if (links.length && links.some((a) => !a.dataset.choice)) missing++;   // 派生 pass 没跑（回归信号）
		const count = new Map();
		for (const a of root.querySelectorAll('a.link-internal[data-choice]')) count.set(a.dataset.choice, (count.get(a.dataset.choice) ?? 0) + 1);
		checked++;
		for (const [key, n] of count) seen.push({ where: `${p.name}|${era ?? 'now'}`, key, n });
	}
}

const { findings, stale, dupCount } = judge(seen);
console.log(`══ 选项定位键（#317②）══  检查 ${checked} 个「段落×时代」渲染态`);
console.log(`  有链接的渲染态 ${checked - missing}/${checked} 已带上派生 key${missing ? `（**${missing} 个未带**——派生 pass 没跑？）` : ''}`);
console.log(`  重复 key 的渲染态：${dupCount} 处｜白名单：${Object.keys(ALLOW).length} 条`);
for (const f of findings) console.error(`   ✗ [${f.code}] ${f.msg}`);
for (const f of stale) console.error(`   ✗ [${f.code}] ${f.msg}`);
if (missing) { console.error(`   ✗ [key-missing] ${missing} 个渲染态里的内部链接没有 data-choice——派生 pass 失效`); }
if (findings.length || stale.length || missing) { console.error('\n✗ 选项定位键门未通过'); process.exit(1); }
console.log('✔ 选项定位键门通过：链接都带派生 key，且没有未登记的歧义');
