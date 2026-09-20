// `#1078`：**读路径门**——`docs/README.md`「按任务读」手维护、零门 ⇒ 指向消失/作废文档不报 ✗。
//   既有 `md-format.mjs` 的 F4 只管**反引号里仓内路径的存在性**（全 docs 面），**不管「必读面」与「权威性」** ✓。
//
// 三组判据（**全部确定性** ✗ 不跑并发 ✗ 纯读 `docs/README.md` ⇒ 无前置 ✓）：
//   ① **死链**：「按任务读」表引用的文档必须存在（不存在 ⇒ 红并**点名行号**）；
//   ② **权威性**：对象故事已删的文档（`DELETED_STORY_DOCS` 显式对照表 ✓ `#1004`）出现在
//      「按任务读」或「权威表」⇒ 红，提示「降级或加作废横幅」（回流即红 ⇒ archive 口径有牙 ✓）；
//   ③ **体量 ratchet**：「按任务读」**先读列**（除 `dev-conventions.md`——单列见 `#1080`）引用总字节
//      ≤ 150KB（口径与数字＝`#1077` 验收② 领队裁定，不自立）；超限 ⇒ 红并打印当前值。
//   行内 `<!-- path-exempt: ... -->` 沿用 `md-format.mjs` F4 惯例（留痕跳过 ✓）。
//
// 自证三格（`--selftest`，`#1031` 成对登记形状 ✓；全部**合成夹具驱动纯函数** ✗ 不碰真文件 ✗）：
//   ① 死链夹具 ⇒ 必红；② 权威位指向作废 ⇒ 必红；③ 正例 ⇒ 不红（＋字节超限夹具 ⇒ 必红）。
// 复跑：`node test/docs-read-path.mjs`（无前置）· 自证：`node test/docs-read-path.mjs --selftest`
// 探针：`scripts/probes.mjs` 的 `test/docs-read-path.mjs` 条（刀＝往真表插一行死链 ⇒ 门必红点名 ✓）。

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const README = join(ROOT, 'docs/README.md');

/** 对象故事已删的文档（`#1004` 删故事 1；basename 对照——含 archive 在内的任何位置回流进必读面都算）。 */
export const DELETED_STORY_DOCS = new Set(['lore-canon.md', 'game-outline.md', 'impl-map.md']);

/** ratchet 上限（KB）与单列件：口径＝`#1077` 验收② 领队裁定（先读列除 dev-conventions ≤150KB；`dev-conventions` 瘦身另列 `#1080`）。 */
export const BUDGET_KB = 150;
export const BUDGET_EXEMPT = 'docs/dev-conventions.md';

const PATH_IN_BACKTICKS = /`((?:docs|stories)\/[A-Za-z0-9_./-]+?\.md)`/g;
const EXEMPT_MARK = /<!--\s*path-exempt:/;

/** 取「按任务读」节（§一）的表格行（含行号）。 */
export const taskTableRows = (text) => {
	const sec = String(text).split('## 一、按任务读')[1]?.split('## 二、')[0] ?? '';
	return sec.split('\n').map((line, i) => ({ line, no: i + 1 })).filter((r) => r.line.startsWith('|'))
		.filter((r) => !/^\|\s*---/.test(r.line) && !/^\|\s*我要/.test(r.line));
};

/** 取「权威表」（§二）的表格行。 */
export const authorityRows = (text) => {
	const sec = String(text).split('## 二、权威表')[1]?.split('## 三、')[0] ?? '';
	return sec.split('\n').filter((l) => l.startsWith('|'))
		.filter((l) => !/^\|\s*---/.test(l) && !/^\|\s*面\s*\|/.test(l));
};

/** ⓪ 扫描面非空断言（`#557` 口径：**读不到输入不许当「没命中」** ✗）——节被删/改名/清空 ⇒ 三判据对空集恒真=假绿 ⇒ 必红 ✓。 */
export const emptyScanProblems = (text) => {
	const out = [];
	if (taskTableRows(text).length === 0)
		out.push('扫描面为空 —— 「## 一、按任务读」节缺失/改名或无表行（#557 口径：读不到输入不许当「没命中」；表被删比留坏链更容易过 ✗）');
	if (authorityRows(text).length === 0)
		out.push('扫描面为空 —— 「## 二、权威表」节缺失/改名或无表行（#557 口径：读不到输入不许当「没命中」）');
	return out;
};

const firstCell = (row) => {
	const cells = row.split('|').map((c) => c.trim());
	return cells[2] ?? '';   // | 我要… | 先读 | … ⇒ cells[0]='' cells[1]=任务 cells[2]=先读
};

/** ① 死链（纯函数：注入 exists）。点名行号 ✓。 */
export const deadLinkProblems = (text, { exists = (p) => existsSync(join(ROOT, p)) } = {}) => {
	const out = [];
	for (const r of taskTableRows(text)) {
		if (EXEMPT_MARK.test(r.line)) continue;
		for (const m of r.line.matchAll(PATH_IN_BACKTICKS)) {
			if (!exists(m[1])) out.push(`按任务读 第 ${r.no} 行：引用的文档不存在 \`${m[1]}\`（死链 ⇒ 移除或改指现存文档）`);
		}
	}
	return out;
};

/** ② 权威性：已删故事对象文档回流必读面/权威表 ⇒ 红（提示降级或作废横幅）。 */
export const staleAuthorityProblems = (text) => {
	const out = [];
	const scan = (rows, where) => {
		for (const r of rows) {
			if (EXEMPT_MARK.test(r.line)) continue;
			for (const m of r.line.matchAll(PATH_IN_BACKTICKS)) {
				const base = m[1].split('/').pop();
				if (DELETED_STORY_DOCS.has(base))
					out.push(`${where} 第 ${r.no} 行：\`${m[1]}\` 的对象故事已删（\`#1004\`）⇒ 不得再进必读面/权威表——降级标注或移入 docs/archive/（对照表见 docs/archive/README.md）`);
			}
		}
	};
	scan(taskTableRows(text), '按任务读');
	scan(authorityRows(text).map((line, i) => ({ line, no: i + 1 })), '权威表');
	return out;
};

/** ③ 体量 ratchet（纯函数：注入 sizeOf）——先读列（除 BUDGET_EXEMPT）存在文档的字节和 ≤ BUDGET_KB。 */
export const budgetProblems = (text, { sizeOf = (p) => statSync(join(ROOT, p)).size, exists = (p) => existsSync(join(ROOT, p)) } = {}) => {
	const paths = new Set();
	for (const r of taskTableRows(text)) {
		for (const m of firstCell(r.line).matchAll(PATH_IN_BACKTICKS)) paths.add(m[1]);
	}
	let total = 0;
	const parts = [];
	for (const p of [...paths].sort()) {
		if (p === BUDGET_EXEMPT) continue;
		if (!exists(p)) continue;   // 死链由判据①管，这里不重复报
		const b = sizeOf(p);
		total += b; parts.push(`${(b / 1024).toFixed(1)}KB ${p}`);
	}
	const kb = total / 1024;
	if (paths.size === 0)
		return [`先读列可计路径为 0 —— 疑似「按任务读」被删/引用被清空（#557 口径：读不到输入不许当「没命中」；「0KB ≤ 150KB」不是通过 ✗）`];
	if (kb > BUDGET_KB) return [`先读列（除 \`${BUDGET_EXEMPT}\`，单列见 #1080）引用总字节 ${kb.toFixed(1)}KB > 上限 ${BUDGET_KB}KB（#1077 验收②口径）——新增先读文档须给出替代/合并了哪份：\n  ${parts.join('\n  ')}`];
	return [];
};

/** 通过时也打印当前值（读数应当可见，不是只在红时才出现——与台账「本轮覆盖到哪一档」同族）。 */
export const budgetReading = (text, { sizeOf = (p) => statSync(join(ROOT, p)).size, exists = (p) => existsSync(join(ROOT, p)) } = {}) => {
	const paths = new Set();
	for (const r of taskTableRows(text)) {
		for (const m of firstCell(r.line).matchAll(PATH_IN_BACKTICKS)) paths.add(m[1]);
	}
	let total = 0;
	for (const p of paths) {
		if (p === BUDGET_EXEMPT || !exists(p)) continue;
		total += sizeOf(p);
	}
	return `${(total / 1024).toFixed(1)}KB`;
};

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

const selftest = () => {
	const exists = (p) => !p.includes('no-such');
	const sizeOf = (p) => (p.includes('huge') ? 160 * 1024 : 1024);
	const okTable = '| 改引擎 / 机制 | `docs/dev-conventions.md` | `docs/repo-map.md` |\n| 写剧情 | `docs/twee-cheatsheet.md` | — |';
	const SEC = '## 一、按任务读\n';
	// ① 死链夹具 ⇒ 必红并点名
	const dead = deadLinkProblems(SEC + '| 写剧情 | `docs/no-such-doc.md` | — |', { exists });
	case_('死链夹具必红并点名', dead.length === 1 && dead[0].includes('no-such-doc.md') && dead[0].includes('不存在'));
	// ② 权威位指向作废 ⇒ 必红（按任务读行 + 权威表行两种位置）
	const stale = staleAuthorityProblems('## 一、按任务读\n| 查设定 | `docs/lore-canon.md` | — |\n## 二、权威表\n| 设定 | `docs/game-outline.md` | 手写 |');
	case_('权威位指向作废必红', stale.length === 2 && stale.every((s) => s.includes('#1004')));
	// ③ 正例 ⇒ 不红（三判据全过）
	const clean = `## 一、按任务读\n${okTable}\n## 二、权威表\n| 面 | 唯一权威 | 形态 |\n|---|---|---|\n| 知识模型 | \`docs/notes-model.md\` | 手写 |`;
	case_('正例不红', deadLinkProblems(clean, { exists }).length === 0 && staleAuthorityProblems(clean).length === 0 && budgetProblems(clean, { sizeOf, exists }).length === 0);
	// ③′ 字节超限夹具 ⇒ 必红（ratchet 有牙）
	const huge = SEC + '| 大文档 | `docs/huge.md` | — |';
	const bp = budgetProblems(huge, { sizeOf, exists });
	case_('字节超限夹具必红', bp.length === 1 && bp[0].includes('160.0KB') && bp[0].includes('150'));
	// 边界：path-exempt 行跳过（留痕惯例沿用）
	const ex = deadLinkProblems(SEC + '| 历史 | `docs/no-such-doc.md` <!-- path-exempt: 历史叙述 --> | — |', { exists });
	case_('path-exempt 行跳过', ex.length === 0);
	// ⓪ 扫描面非空三格（阻断项（评审指出）：节被删/清空 ⇒ 必红，不许对空集恒真）
	case_('反例·「按任务读」整节被删 ⇒ 必红（#557）', emptyScanProblems('## 二、权威表\n| 面 | 唯一权威 |\n|---|---|\n| A | `docs/x.md` |').some((p) => p.includes('按任务读')));
	case_('反例·有节头但表行清空 ⇒ 必红（#557）', emptyScanProblems('## 一、按任务读\n\n（无表格）\n## 二、权威表\n| 面 | 唯一权威 |\n|---|---|\n| A | `docs/x.md` |').some((p) => p.includes('按任务读')));
	case_('反例·「权威表」节被删 ⇒ 必红（#557）', emptyScanProblems(SEC + '| 任务 | `docs/a.md` | — |').some((p) => p.includes('权威表')));
	// ③″ ratchet 输入空 ⇒ 必红（先读列零可计路径）
	case_('反例·先读列可计路径为 0 ⇒ 必红（#557）', budgetProblems(SEC + '| 任务 | 无路径 | — |', { sizeOf, exists }).length === 1);
	// 正例控制：两节都在且有行 ⇒ ⓪ 不报
	case_('正例·两节齐全 ⇒ ⓪ 不报', emptyScanProblems('## 一、按任务读\n| 任务 | `docs/a.md` | — |\n## 二、权威表\n| 面 | 唯一权威 |\n|---|---|\n| A | `docs/x.md` |').length === 0);
};

const main = () => {
	const text = readFileSync(README, 'utf8');
	const problems = [...emptyScanProblems(text), ...deadLinkProblems(text), ...staleAuthorityProblems(text), ...budgetProblems(text)];
	for (const p of problems) { bad++; console.error(`✗ ${p}`); }
	case_('docs/README.md 必读面四判据全过（含扫描面非空）', problems.length === 0, problems.join('；'));
	if (problems.length === 0) console.log(`      ○ 先读列（除 \`${BUDGET_EXEMPT}\`，单列见 #1080）合计 ${budgetReading(text)} ／ 上限 ${BUDGET_KB}KB —— 读数可见，不是只在红时才出现`);
};

if (process.argv.includes('--selftest')) selftest();
else main();

console.log(bad === 0 ? '✔ docs-read-path：读路径门通过（扫描面非空 · 死链 · 权威性 · 体量 ratchet）' : `✗ docs-read-path：${bad} 条问题（见上）`);
process.exit(bad === 0 ? 0 : 1);
