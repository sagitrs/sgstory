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
	} catch { return 'unknown'; }
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
	if ((seen.uncaught ?? []).length) {
		return { ...c, problems: (seen.uncaught ?? []).map((u) => ({ kind: 'uncaught', want: String(u).slice(0, 200) })),
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
	//   两条硬要求：① 打印解析出的 cases 根（实际值）；② "根不存在"与"存在但零用例"**必须分开**
	console.log(`用例根（解析值）：${casesDir}`);
	console.log(`故事根（生效值）：${STORIES_DIR}`);
	if (!existsSync(casesDir)) {
		console.error(`✗ 用例根不存在：${casesDir}（**出声**，不静默 rc=0 —— 否则路径写错会被当"没用例"假绿）`);
		process.exit(1);
	}
	const found = discoverCases(casesDir, args);
	if (!found.length) {
		console.log('○ 零用例：该用例根下没有匹配的用例 ⇒ 本次未跑（rc=0，已明说）');
		if (args.json) console.log(JSON.stringify({ casesDir, storiesDir: STORIES_DIR, summary: { total: 0, green: 0, expectedGap: 0, unattributed: 0, stale: 0, exit: 0 }, results: [] }));
		process.exit(0);
	}
	const results = [];
	for (const f of found) {
		const c = JSON.parse(readFileSync(f.path, 'utf8'));
		const r = await runCase(c);
		results.push(r);
		const tag = { green: '✔', 'expected-gap': '○ 预期缺口', unattributed: '✗ 未归因', 'stale-attribution': '✗ 陈旧归因' }[r.verdict];
		console.log(`${tag} ${r.id}${r.ticket ? ` ${r.ticket}` : ''}${r.verdict === 'stale-attribution' ? '（归因票已关但用例仍红 ⇒ 复查并补 closed_by）' : ''}`);
		for (const p of r.problems) console.log(`    ✗ ${p.kind}: ${p.want}${p.got !== undefined ? `（实得 ${p.got}）` : ''}`);
	}
	const sum = summarize(results);
	// **汇总行每次都要打**（哪怕全绿）
	console.log(`用例 ${sum.total} 条：绿 ${sum.green} ｜ 预期缺口 ${sum.expectedGap}（${results.filter((r) => r.verdict === 'expected-gap').map((r) => r.ticket).join(',') || '—'}）｜ 未归因 ${sum.unattributed} ｜ 陈旧归因 ${sum.stale} ⇒ rc=${sum.exit}`);
	if (results.some((r) => r.ticketState === 'unknown')) console.log('  · 提示：有归因票的**状态未能核实**（无 GH_TOKEN 或查询失败）⇒ 按"未关"处理，不据此判红');
	// `#1267`（预审 ④）：`--json` **实现**（CI／接续器要用；不许 usage 有而实现无）。
	if (args.json) {
		console.log(JSON.stringify({
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
