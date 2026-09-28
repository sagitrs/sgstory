// ★★ `#1606`：**docs 分类表的双向门** —— ★"表即工件"：★本件**读 `docs/CLASSIFICATION.md` 本身**，
//   并与**树实况**对差 ⇒ ★两向都要红（✗ 只查一向 ⇒ "动了没处置"没人看 ✓）。
//
// 判据（每条**能假**）：
//   ① ★**树 ∖ 表 ⇒ 未分类红**（新加一件 docs 件 ⇒ 必须登记）
//   ② ★**表 ∖ 树 ⇒ 幽灵行红**（件删了/改名了 ⇒ 表必须同步 —— ★同族：`#1601` 的"死引用" ✓）
//   ③ ★表内**重复路径** ⇒ 红（✗ 两行两说 ⇒ 处置面就歧义了 ✓）
//   ④ ★表**解析面为空**（✗ 表被改坏/删空 ⇒ "零问题"假绿）⇒ 红
//   ⑤ ★表里某行的**类**是空/未知 ⇒ 红（★"未分类"必须是**显式**的，✗ 留空 ✓）
//
// ★为什么要有本门（协调席五波输入的结论）：★本仓**7/13 件被引件删掉是静默的**（✗ 四门全绿）
//   ⇒ ★"动了它有没有处置"**没有门看得见** ⇒ ★把**表**做成工件、由门读它 ⇒ 那一类从"无门看"变成**机械红** ✓。
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DOC = join(ROOT, 'docs/CLASSIFICATION.md');

/** 解析表：`| \`docs/<路径>\` | <类> | …` ⇒ `[{ path, cls, raw }]`（★纯函数 ⇒ 自证可夹具驱动 ✓）。 */
export const parseTable = (md) => {
	const out = [];
	for (const line of String(md ?? '').split('\n')) {
		const m = line.match(/^\|\s*`(docs\/[^`]+)`\s*\|\s*([^|]*?)\s*\|/);
		if (!m) continue;
		out.push({ path: m[1], cls: m[2].replace(/\s+$/, ''), raw: line });
	}
	return out;
};

/** ★**双向**对差（★纯函数 ⇒ 五格自证全在这上面 ✓）。 */
export const classifyProblems = ({ tree = [], table = [] } = {}) => {
	const out = [];
	const inTable = new Map();
	for (const r of table) {
		if (inTable.has(r.path)) out.push({ code: 'dup-row', why: `表里**重复登记**了 \`${r.path}\`（✗ 两行两说 ⇒ 处置面有歧义）` });
		inTable.set(r.path, r);
	}
	if (!table.length) out.push({ code: 'empty-table', why: '分类表**解析面为空**（0 行）—— ✗ 空表 = "零问题"的假绿 ⇒ 表被改坏/删空必须红' });
	for (const r of table) {
		if (!String(r.cls ?? '').trim()) out.push({ code: 'no-class', why: `表里 \`${r.path}\` 的**类为空** —— ★"未分类"必须显式（✗ 留空 ⇒ 与"已分类"文本同形 ✓）` });
	}
	const inTree = new Set(tree);
	for (const p of tree) if (!inTable.has(p)) out.push({ code: 'unclassified', why: `树里有 \`${p}\`，但**分类表里没有** ⇒ ★加了 docs 件必须同笔登记（✗ 未分类件没有任何门看 ✓）` });
	for (const r of table) if (!inTree.has(r.path)) out.push({ code: 'ghost-row', why: `分类表里有 \`${r.path}\`，但**树里没有**（删了/改名了？）⇒ ★表必须与树同步（同族：\`#1601\` 的死引用 ✓）` });
	return out;
};

/** 树实况（★`git ls-files docs/**` ⇒ 与独立复核读数同一口径（`#1606` 评论 ✓） ✓）。 */
export const treeOf = () => execFileSync('git', ['ls-files', 'docs/**'], { cwd: ROOT, encoding: 'utf8' })
	.split('\n').map((s) => s.trim()).filter(Boolean);

let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

if (process.argv.includes('--selftest')) {
	// ★五格（★纯函数夹具驱动 ⇒ 不碰真文件 ✓）
	const T = ['docs/a.md', 'docs/b/c.md'];
	const mk = (rows) => rows.map(([p, c]) => ({ path: p, cls: c, raw: '' }));
	t('① 树有表无 ⇒ **未分类**红', classifyProblems({ tree: T, table: mk([['docs/a.md', '引擎架构']]) }).some((p) => p.code === 'unclassified'));
	t('② 表有树无 ⇒ **幽灵行**红', classifyProblems({ tree: ['docs/a.md'], table: mk([['docs/a.md', 'x'], ['docs/gone.md', 'x']]) }).some((p) => p.code === 'ghost-row'));
	t('③ 重复登记 ⇒ 红', classifyProblems({ tree: ['docs/a.md'], table: mk([['docs/a.md', 'x'], ['docs/a.md', 'y']]) }).some((p) => p.code === 'dup-row'));
	t('④ 表解析为空 ⇒ 红（✗ 空表假绿）', classifyProblems({ tree: T, table: [] }).some((p) => p.code === 'empty-table'));
	t('⑤ 类为空 ⇒ 红（★"未分类"要显式）', classifyProblems({ tree: ['docs/a.md'], table: mk([['docs/a.md', '  ']]) }).some((p) => p.code === 'no-class'));
	t('⑥ 正例（树表一致 ＋ 类齐全）⇒ **不红**', classifyProblems({ tree: T, table: mk([['docs/a.md', 'A'], ['docs/b/c.md', 'B']]) }).length === 0);
	t('⑦ 解析面：真表的行数 > 0 且路径都以 `docs/` 开头', (() => { const r = parseTable(readFileSync(DOC, 'utf8')); return r.length > 0 && r.every((x) => x.path.startsWith('docs/')); })());
	if (bad) { console.error(`\n✗ 分类表门自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 分类表门自证通过（两向对差 ＋ 重复/空表/空类 ＋ 正例）');
	process.exit(0);
}

if (!existsSync(DOC)) { console.error(`✗ 分类表不存在：${DOC}（★本门读它 ⇒ 它必须在 ✓）`); process.exit(1); }
const table = parseTable(readFileSync(DOC, 'utf8'));
const tree = treeOf();
const problems = classifyProblems({ tree, table });
for (const p of problems) console.error(`✗ [docs-class] ${p.why}`);
if (problems.length) { console.error(`\n✗ docs 分类表与树**不一致**（${problems.length} 处）—— ★表即工件：改树/改表必须同笔 ✓`); process.exit(1); }
console.log(`✔ docs 分类表门通过（树 ${tree.length} 件 ＝ 表 ${table.length} 行；两向对差 0 ✓）`);
