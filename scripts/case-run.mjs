// `#1267`（伞 `#1266`）M1 最后一件：**用例执行器**。
//
// 口径（形态提案已批，见票面）：
// · 入口：`node scripts/case-run.mjs [--cases=<dir>] [--slug=<slug>] [--case=<id>] [--json]`
//   **`--cases=` 显式**（默认 `<ROOT>/cases`）；**不吃 `SG_STORIES_DIR` 的故事根**（那是故事面），
//   但**驱动故事时**用 `STORIES_DIR`（受 `SG_STORIES_DIR` 控制 → 仓外故事自动跟随）。
// · 三态（**判定核心是纯函数 → 能喂假事实自证**）：
//     绿              → rc=0
//     红-有归因（票未关）→ **rc=0** 且**单列**「○ 预期缺口 #N」（已声明的缺口不阻塞，但可见）
//     红-无归因        → **rc≠0**
//     红-陈旧归因（票已关却仍红）→ **rc≠0** 并出声「复查并补 closed_by」
// · **净树**：只读；jsdom 在内存里跑 → **不写引擎仓任何产物**（用例根在仓外时也不往仓内写）。
// · **cases 根不存在** → **出声**（不静默 rc=0 —— 否则路径写错会被当"没用例"假绿）；
//   **存在但零用例** → rc=0 ＋ **明说**。
// · **汇总行每次都要打**（哪怕全绿 —— 否则 CI 里看不出有没有预期缺口）。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORIES_DIR } from './dist-paths.mjs';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));

// ── 纯函数面（可注入 → 自证）────────────────────────────────────────────

/** 解析命令行（纯函数）。 */
export const parseArgs = (argv = []) => {
	const val = (k, d = null) => {
		const hit = argv.find((a) => a.startsWith(`--${k}=`));
		return hit ? hit.slice(k.length + 3) : d;
	};
	return {
		cases: val('cases', null),
		slug: val('slug', null),
		id: val('case', null),
		json: argv.includes('--json'),
	};
};

/** cases 根的解析（**显式 `--cases=` 优先**；默认 `<ROOT>/cases`）。 */
export const resolveCasesDir = ({ cases = null, root = ROOT } = {}) =>
	cases ? (isAbsolute(cases) ? cases : resolve(root, cases)) : join(root, 'cases');

/** 发现用例：`<casesDir>/<slug>/<id>.json`（按 slug／id 过滤；排序稳定）。 */
export const discoverCases = (casesDir, { slug = null, id = null } = {}) => {
	const out = [];
	if (!existsSync(casesDir)) return out;
	for (const s of readdirSync(casesDir).sort()) {
		if (slug && s !== slug) continue;
		const dir = join(casesDir, s);
		// `#1267`（预审 ①）：**只把目录当 slug** —— 同笔在 `cases/` 下放了 `README.md`，
		// 原先无条件 `readdirSync(dir)` → `ENOTDIR` → 默认入口（无参）rc=2 崩，
		// 与 README 自述"存在但零用例 → rc=0＋明说"直接矛盾。
		try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
		for (const f of readdirSync(dir).sort()) {
			if (!f.endsWith('.json')) continue;
			// `#1267`（预审 ⑥）：**精确匹配**（`--case=c1` 不再连带 `c10`）。
			if (id && f.replace(/\.json$/, '') !== id) continue;
			out.push({ slug: s, id: f.replace(/\.json$/, ''), path: join(dir, f) });
		}
	}
	return out;
};

/**   判定核心（**纯函数**）：三态 ＋ 陈旧归因。`ticketState` ∈ `'open' | 'closed' | 'unknown' | null`。 */
export const classifyCase = ({ passed, ticket = null, ticketState = null } = {}) => {
	if (passed) return { verdict: 'green', exit: 0 };
	if (!ticket) return { verdict: 'unattributed', exit: 1 };
	// `#1287`（裁定）：归因票**不存在** → 归因无效（rc≠0）—— "指向空票＝归因不存在"。
	if (ticketState === 'missing') return { verdict: 'invalid-attribution', exit: 1 };
	if (ticketState === 'closed') return { verdict: 'stale-attribution', exit: 1 };
	return { verdict: 'expected-gap', exit: 0 };   // 有归因且票未关（含 'unknown'：离线降级 → 不据此判红）
};

/** 汇总（纯函数）：给分组计数与总退出码。 */
export const summarize = (resultList = []) => {
	const by = (v) => resultList.filter((r) => r.verdict === v).length;
	return {
		total: resultList.length,
		green: by('green'),
		expectedGap: by('expected-gap'),
		unattributed: by('unattributed'),
		invalidAttribution: by('invalid-attribution'),
		stale: by('stale-attribution'),
		exit: resultList.some((r) => (r.exit ?? 0) !== 0) ? 1 : 0,
	};
};

/** 逐条判据（纯函数）：返回**未满足项**的可读清单（`expect` 的四个面）。 */
export const expectViolations = ({ expect = {}, seen = {} } = {}) => {
	const out = [];
	const text = String(seen.text ?? '');
	// `#1267`（预审 ②）：真用例的 `expect.edges` 是**对象**（`{from,label,to}`）→ **按 label 比**，
	// 否则字符串比较恒 false → 边全对也红、且报文打印 `[object Object]`（读不出）。
	const labelOf = (e) => (typeof e === 'string' ? e : String(e?.label ?? e?.to ?? JSON.stringify(e)));
	const labels = new Set((seen.edges ?? []).map(labelOf));
	for (const s of expect.visible ?? []) if (!text.includes(s)) out.push({ kind: 'visible', want: s });
	for (const s of expect.absent ?? []) if (text.includes(s)) out.push({ kind: 'absent', want: s });
	for (const s of expect.edges ?? []) { const w = labelOf(s); if (!labels.has(w)) out.push({ kind: 'edges', want: w }); }
	for (const [path, want] of Object.entries(expect.state ?? {})) {
		const got = seen.state?.[path];
		if (JSON.stringify(got) !== JSON.stringify(want)) out.push({ kind: 'state', want: `${path}=${JSON.stringify(want)}`, got: JSON.stringify(got) });
	}
	return out;
};

/** `#1267`（预审 ⑤）：**页面未捕获异常 → 该例的判据问题**（纯函数 → 能假）。
 * 为什么单列：`uncaught` 是「页面坏了」的唯一信号；收集了却无人消费 → 页面抛错仍可能判绿（假绿）。 */
/** `#1287`（复核）：**五态的人读标签（呈现位之一）**。导出成常量 → 自证可守呈现层
 *（"判定对" ≠ "呈现对"：新增状态若漏了这里，行首会打出 `undefined`，而 JSON 里却是对的）。 */
export const VERDICT_LABELS = {
	green: '✔',
	'expected-gap': '○ 预期缺口',
	unattributed: '✗ 未归因',
	'invalid-attribution': '✗ 归因无效',
	'stale-attribution': '✗ 陈旧归因',
};

/** `#1287`（复核）：**人读汇总行的渲染（纯函数 → 可自证"各桶之和 ＝ total"与"五态都在"）。 */
export const summaryLine = (sum, unverified = 0, tickets = '') =>
	`用例 ${sum.total} 条：绿 ${sum.green} ｜ 预期缺口 ${sum.expectedGap}（${tickets || '—'}）`
	+ ` ｜ 未归因 ${sum.unattributed} ｜ 归因无效 ${sum.invalidAttribution ?? 0} ｜ 陈旧归因 ${sum.stale}`
	+ ` ｜ 未核实 ${unverified} ⇒ rc=${sum.exit}`;

export const runtimeProblems = (seen) => (seen?.uncaught ?? []).map((u) => ({ kind: 'uncaught', want: String(u).slice(0, 200) }));

// ── 驱动面（jsdom；只在真跑时用 → 动态 import，缺依赖时给明说而不是崩）──────

const drive = async (c) => {
	let boot, makeSession;
	try {
		({ boot } = await import('../test/boot.mjs'));
		({ makeSession } = await import('../test/harness.mjs'));
	} catch (e) {
		throw new Error(`用例执行器需要 jsdom 驱动面（test/boot.mjs／test/harness.mjs）：${e.message}`);
	}
	const { w, settle, sleep } = await boot({ story: c.story, random: c.drive?.seed ?? 0.5 });
	const s = makeSession(w, { settle, sleep });
	for (const click of c.drive?.clicks ?? []) await s.clickByLabel(click);
	const pc = w.SugarCube?.State?.variables?.pc;
	const state = {};
	for (const p of Object.keys(c.expect?.state ?? {})) {
		state[p] = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), pc);
	}
	const edges = [...w.document.querySelectorAll('a.link-internal, a.soc-opt')].map((e) => e.textContent.trim());
	return { text: s.text(), edges, state, uncaught: w.__uncaught ?? [] };
};

// ── 主流程 ────────────────────────────────────────────────────────────

const ticketStateOf = async (ticket) => {
	if (!ticket) return null;
	if (!process.env.GH_TOKEN) return 'unknown';       // 离线降级：**不据此判红**，但汇总里提示
	try {
		const { execFileSync } = await import('node:child_process');
		const n = String(ticket).replace(/^#/, '');
		const st = execFileSync('gh', ['issue', 'view', n, '--json', 'state', '--jq', '.state'], { encoding: 'utf8', timeout: 20000 }).trim();
		return st === 'CLOSED' ? 'closed' : 'open';
	} catch (e) {
		// `#1287`（裁定）：**在线但票号不存在 → 不许落 unknown**（`unknown` 只留给"离线／真核不到"）。
		// 归因指向空票 → **归因不存在**（与 `#1279` 的「`until` 票号必须可解析」同款）。
		const msg = String(e?.stderr ?? e?.message ?? '');
		if (/Could not resolve|not found|no such issue/i.test(msg)) return 'missing';
		return 'unknown';
	}
};

export const runCase = async (c) => {
	// `#1267`（预审 ③）：**逐例 try/catch** —— 单例异常不再让整跑崩且不点名；
	// 归「红-无归因（异常）」并**点名 case id**（其余用例照常汇总）。
	let seen;
	try {
		seen = await drive(c);
	} catch (e) {
		return { ...c, problems: [{ kind: 'error', want: String(e?.message ?? e).slice(0, 200) }],
			ticket: c.ticket ?? null, ticketState: await ticketStateOf(c.ticket ?? null),
			verdict: 'unattributed', exit: 1 };
	}
	// `#1267`（预审 ⑤）：**页面未捕获异常 → 该例判红并点名**（  不得删掉收集 —— 它是"页面坏了"的唯一信号）。
	if (runtimeProblems(seen).length) {
		return { ...c, problems: runtimeProblems(seen),
			ticket: c.ticket ?? null, ticketState: await ticketStateOf(c.ticket ?? null),
			verdict: 'unattributed', exit: 1 };
	}
	const problems = expectViolations({ expect: c.expect ?? {}, seen });
	const ticket = c.ticket ?? null;
	const ticketState = await ticketStateOf(ticket);
	const verdict = classifyCase({ passed: problems.length === 0, ticket, ticketState });
	return { ...c, problems, ticket, ticketState, ...verdict };
};

const main = async () => {
	const args = parseArgs(process.argv.slice(2));
	const casesDir = resolveCasesDir(args);
	// `#1267`（预审 ④）：**`--json` 时人读行改走 stderr，stdout 只出 JSON**
	//（否则 14 行人读文本 ＋ 末行 JSON → 消费方 `--json | jq .` 直接失败、与"CI 用"不符）。
	const say = (...a) => (args.json ? console.error : console.log)(...a);
	//   两条硬要求：① 打印解析出的 cases 根（实际值）；② "根不存在"与"存在但零用例"**必须分开**
	say(`用例根（解析值）：${casesDir}`);
	say(`故事根（生效值）：${STORIES_DIR}`);
	// `#1287`（复核）：**打印生效过滤器** —— 否则 CI 里拼错会静默绿、人无法反推"我到底跑了什么"。
	say(`过滤器（生效值）：slug=${args.slug ?? '（未给）'} ／ case=${args.id ?? '（未给）'}`);
	if (!existsSync(casesDir)) {
		console.error(`✗ 用例根不存在：${casesDir}（**出声**，不静默 rc=0 —— 否则路径写错会被当"没用例"假绿）`);
		process.exit(1);
	}
	const found = discoverCases(casesDir, args);
	// `#1287`（裁定）：**"过滤器没命中"与"根里本就没用例"必须分开** ——
	// 前者是**可能拼错**（与"根不存在 → 出声"同一原则）→ 出声 ＋ 报"根里有 N 条"。
	if (!found.length && (args.slug || args.id)) {
		const total = discoverCases(casesDir).length;
		if (total > 0) {
			const avail = discoverCases(casesDir).map((x) => `${x.slug}/${x.id}`).sort();
			say(`✗ 过滤器未命中：--slug=${args.slug ?? '（未给）'} --case=${args.id ?? '（未给）'} 在根内 ${total} 条用例里一条都没选中`);
			say(`  可用用例（slug/id）：${avail.join('、')}`);
			say('  （与"根内本就没有用例"是两种状态：那种是合法 rc=0；这种是**过滤器拼错** ⇒ 出声）');
			if (args.json) console.log(JSON.stringify({ casesDir, storiesDir: STORIES_DIR, summary: { total: 0, green: 0, expectedGap: 0, unattributed: 0, invalidAttribution: 0, stale: 0, exit: 1 }, results: [] }));
			process.exit(1);
		}
	}
	if (!found.length) {
		say('○ 零用例：该用例根下没有匹配的用例 ⇒ 本次未跑（rc=0，已明说）');
		if (args.json) console.log(JSON.stringify({ casesDir, storiesDir: STORIES_DIR, summary: { total: 0, green: 0, expectedGap: 0, unattributed: 0, stale: 0, exit: 0 }, results: [] }));
		process.exit(0);
	}
	const results = [];
	for (const f of found) {
		// `#1287`（复核阻断）：**读 ＋ 解析也进逐例 try** —— 坏用例文件原先让整跑 rc=2 停住
		// （`drive()` 已兜，但这里漏一格，且更坏：其余用例根本不跑）。
		let c;
		try {
			c = JSON.parse(readFileSync(f.path, 'utf8'));
		} catch (e) {
			const r = { id: f.id, slug: f.slug, verdict: 'unattributed', exit: 1, ticket: null, ticketState: null,
				problems: [{ kind: 'bad-case-file', want: `该用例文件不是合法 JSON：${f.path}（${String(e.message).slice(0, 120)}）` }] };
			results.push(r);
			say(`✗ 未归因 ${r.id}`);
			for (const pp of r.problems) say(`    ✗ ${pp.kind}: ${pp.want}`);
			continue;                                  // 其余用例**照跑**
		}
		const r = await runCase(c);
		results.push(r);
		const tag = VERDICT_LABELS[r.verdict] ?? `（未知态 ${r.verdict}）`;   // `#1287`：新增状态必须接全"呈现位"
		say(`${tag} ${r.id}${r.ticket ? ` ${r.ticket}` : ''}`
			+ (r.verdict === 'stale-attribution' ? '（归因票已关但用例仍红 ⇒ 复查并补 closed_by）' : '')
			+ (r.verdict === 'invalid-attribution' ? '（票号不存在 ⇒ 归因指向空票 ⇒ 归因无效）' : ''));
		for (const p of r.problems) say(`    ✗ ${p.kind}: ${p.want}${p.got !== undefined ? `（实得 ${p.got}）` : ''}`);
	}
	const sum = summarize(results);
	// **汇总行每次都要打**（哪怕全绿）
	// `#1287`（复核 ⑥）：token 缺失时**单列"未核实 N 条"**（定义须在汇总行之前 → 否则 TDZ）。
	const unverified = results.filter((r) => r.ticketState === 'unknown').length;
	say(summaryLine(sum, unverified, results.filter((r) => r.verdict === 'expected-gap').map((r) => r.ticket).join(',')));   // `#1287`：与 JSON 同口径 → 闭合
	// `#1287`（复核 ⑥）：**token 缺失不许无声** —— 无 token 时"归因票已关"会被降级成"未关" → rc=0
	// （真问题被吞）。三态语义不变（离线降级 rc=0 是对的），**只是把"降级"打出来 ＋ 单列计数**。
	if (unverified) {
		say(`⚠ 归因票状态**未核实** ${unverified} 条（无 GH_TOKEN 或查询失败）⇒ 「陈旧归因」这道保护**本次未生效**；`);
		say('  CI 跑本工具**必须带 token**（否则"票已关却仍红"会被当成"未关" ⇒ 静默 rc=0）。');
	}
	// `#1267`（预审 ④）：`--json` **实现**（CI／接续器要用；不许 usage 有而实现无）。
	if (args.json) {
		console.log(JSON.stringify({ unverified,
			casesDir, storiesDir: STORIES_DIR, summary: sum,
			results: results.map((r) => ({
				id: r.id, slug: r.slug, verdict: r.verdict, exit: r.exit, ticket: r.ticket, ticketState: r.ticketState,
				problems: r.problems.map((p2) => ({ kind: p2.kind, want: p2.want, got: p2.got ?? null })),
			})),
		}));
	}
	process.exit(sum.exit);
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	main().catch((e) => { console.error(`✗ 用例执行器异常：${e.message}`); process.exit(2); });
}
