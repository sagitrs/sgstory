
import { defaultStoryHtml, ROOT } from '../scripts/dist-paths.mjs';
import { relative } from 'node:path';
// L0.5 产物体积 ratchet（`#187`）：首屏字节预算，只许降不许升。
// 超基线 → 红；低于基线 → 收紧。重签：node test/size-gate.mjs --update-size（PR 写明理由）。
//
// #362（P2）修复：此前**失败时也会写基线**，且写回的是「当前实际值」（含超预算项）→ 自愈放宽：
// 同一工作区第二次检查就变绿（实测：HTML 超 1B、字体缩小 1B → 首次退出 1 却已把 HTML 基线改大）。
// 现在：**失败不写**；成功只写**实际降低**的项（其余原值、容差表都保留）。
//
// 判定逻辑抽成纯函数 `judge()`，`--selftest` 用合成输入证明三条不变式（这也是本门的行为化自证）。
import { statSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
// `#1004` B2b：`--update-size` 的**归因梯**用 `execFileSync`（上面那段 `gitChanged`）—— 但这里**没 import 它**
// → 那一句在 try 里抛 `ReferenceError` → 被 `catch { return []}` 吃掉 → 归因**恒**打「工作区无 src/stories 改动 → 与本次改动无关」
//（实测：夹具改动在册的情况下仍这样报）。那正是 `#678` 注释里那句「**看不清账＝不能归因**」要防的东西 → 补上 import。
import { execFileSync } from 'node:child_process';

export const NOTE = '产物体积预算（字节）。只许降不许升——确需增大请 --update-size 重签并在 PR 写明理由。';

/** 跨环境构建噪声的**容差表**（`#211`）。
 *
 *注意：`#1017`：这张表原先**只住在** `test/size-baseline.json` 里 → 基线一旦被删（而本门自己的
 * 报错文案**就叫你删**：「删除该文件后跑 `--update-size` 重签」）或重签路径抽风，
 * **这条设定会跟着一起没**，而重签的人以为自己只是「把基线拉到现状」 →
 * 门从「容差吸收噪声」**静默退化**成 **0B 硬 ratchet**（任何体量抖动都红）。
 * → 按本仓「**设定住代码、数值住数据**」的口径（同族：`scripts/dist-paths.mjs` 的
 * `STORY_PAGE_MAX_BYTES`／`SHELF_PAGE_MAX_BYTES`），容差表搬进**代码单一权威**；
 * 基线文件里的同名字段**降级为覆盖口**（可省、可空 → 一律回落到本表，见 `resolveTol`）。
 * → 由此 `--update-size` **只动数值、动不了语义**（它写回的是 `resolveTol(...)` 的解析结果）。 */
export const TOLERANCE_PCT = { 'index.html': 0.5, fonts: 2 };

/** 解析生效的容差表：**代码默认为底**，基线里若显式给了就覆盖（向后兼容 ＋ 允许特例）。
 *注意：空对象／缺字段一律**回落**到 `TOLERANCE_PCT` —— 这正是 `#1017` 的缺陷形状：
 * 旧写法 `parsed.tolerancePct? \u2026: \u2026` 把**空 `{}` 当成"有设定"**（`{}` 为真值）
 * → 容差被写成空表 → 门静默变成 0B 硬 ratchet。 */
export const resolveTol = (parsed) => ({ ...TOLERANCE_PCT, ...((parsed && parsed.tolerancePct) || {}) });

// 纯函数：给 rows 与基线，返回 { failures, lines, shrunken}
export const judge = (rows, parsed) => {
	const base = parsed.rows ?? {};
	const tol = resolveTol(parsed);   // `#1017`：容差走**解析**（代码默认 ⊕ 基线覆盖），空/缺一律回落
	let failures = 0;
	const lines = [];
	const shrunken = {};
	for (const [k, v] of Object.entries(rows)) {
		const b = base[k];
		if (b == null) { lines.push(`✗ ${k}: 基线缺失（${v}B）——请 --update-size 重签`); failures++; continue; }
		const allow = Math.ceil(b * ((tol[k] ?? 0) / 100));
		if (v > b + allow) { lines.push(`✗ ${k}: ${v}B > 基线 ${b}B +容差 ${allow}B。确需增大：node test/size-gate.mjs --update-size 并在 PR 写明理由`); failures++; }
		else if (v > b) lines.push(`~ ${k}: ${v}B 在容差内（基线 ${b}B +${v - b} ≤ ${allow}B，构建噪声）`);
		else if (v < b) { lines.push(`✔ ${k}: ${v}B < 基线 ${b}B（-${b - v}）——收紧`); shrunken[k] = v; }
		else lines.push(`✓ ${k}: ${v}B = 基线`);
	}
	return { failures, lines, shrunken };
};

const selftest = () => {
	const P = { rows: { 'index.html': 1000, fonts: 2000 }, tolerancePct: { 'index.html': 0.5, fonts: 1 } };
	const cases = [
		['一超预算 + 一缩小 → 必须失败，且**只记录缩小项**、不得写任何超预算值',
			{ 'index.html': 1010, fonts: 1990 }, P,
			(r) => r.failures === 1 && r.shrunken.fonts === 1990 && r.shrunken['index.html'] === undefined],
		['全部在预算内 + 一项缩小 → 不失败，只收紧缩小项',
			{ 'index.html': 1000, fonts: 1900 }, P,
			(r) => r.failures === 0 && JSON.stringify(r.shrunken) === '{"fonts":1900}'],
		['全部等于基线 → 不失败也不收紧',
			{ 'index.html': 1000, fonts: 2000 }, P,
			(r) => r.failures === 0 && Object.keys(r.shrunken).length === 0],
		['容差内增长 → 不失败、不收紧（构建噪声）',
			{ 'index.html': 1004, fonts: 2000 }, P,
			(r) => r.failures === 0 && Object.keys(r.shrunken).length === 0],
		['超容差增长 → 失败',
			{ 'index.html': 1006, fonts: 2000 }, P,
			(r) => r.failures === 1 && Object.keys(r.shrunken).length === 0],
		//注意：`#1017` 的**缺陷形状**（能假的那两格）：容差表**缺席或为空**时，必须**回落到代码默认**，
		// 不得被当成「没有容差」→ 否则门静默变成 0B 硬 ratchet（任何抖动都红）。
		['⭐ `#1017` 反例：基线里**没有** `tolerancePct` ⇒ 仍按默认容差判（+4 在 0.5% 内 ⇒ 不失败）',
			{ 'index.html': 1004, fonts: 2000 }, { rows: P.rows },
			(r) => r.failures === 0 && Object.keys(r.shrunken).length === 0],
		['⭐ `#1017` 反例：基线里 `tolerancePct` 是**空对象** ⇒ 同样回落（+4 不失败；修前会失败 ✗）',
			{ 'index.html': 1004, fonts: 2000 }, { rows: P.rows, tolerancePct: {} },
			(r) => r.failures === 0 && Object.keys(r.shrunken).length === 0],
		['⭐ `#1017` 另一面（能假的另一半）：基线里**显式**的容差覆盖仍要生效（给 0 ⇒ +4 必失败）',
			{ 'index.html': 1004, fonts: 2000 }, { rows: P.rows, tolerancePct: { 'index.html': 0, fonts: 2 } },
			(r) => r.failures === 1],
		['⭐ `#1017` 解析式：`resolveTol` 空/缺 ⇒ 等于代码默认；显式值 ⇒ 覆盖',
			{}, {},
			() => JSON.stringify(resolveTol(undefined)) === JSON.stringify(TOLERANCE_PCT)
				&& JSON.stringify(resolveTol({ tolerancePct: {} })) === JSON.stringify(TOLERANCE_PCT)
				&& resolveTol({ tolerancePct: { fonts: 9 } }).fonts === 9
				&& resolveTol({ tolerancePct: { fonts: 9 } })['index.html'] === TOLERANCE_PCT['index.html']],
	];
	let bad = 0;
	for (const [label, rows, parsed, okFn] of cases) {
		const r = judge(rows, parsed);
		const ok = okFn(r);
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${label}（failures=${r.failures} shrunken=${JSON.stringify(r.shrunken)}）`);
	}
	if (bad) { console.error(`\n✗ 体积门自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 体积门自证通过：失败不写 / 只收紧实际降低项 / 容差内不动作 / 容差缺席与空表**回落默认**（`#1017`）');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const BASELINE = 'test/size-baseline.json';
const update = process.argv.includes('--update-size');
// 原子写：先写临时文件再 rename（同一文件系统内 rename 是原子的）——避免并发读者看到半写内容
const writeBaseline = (obj) => {
	const tmp = `${BASELINE}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(obj, null, '\t') + '\n', 'utf8');
	renameSync(tmp, BASELINE);
};

if (!existsSync(defaultStoryHtml())) { console.error(`✗ 缺 ${relative(ROOT, defaultStoryHtml())}，请先构建`); process.exit(1); }
const rows = { 'index.html': statSync(defaultStoryHtml()).size };
rows.fonts = readdirSync('dist/fonts').reduce((a, f) => a + statSync(`dist/fonts/${f}`).size, 0);

// #411 CI 实测：这条读曾在 CI 上 JSON.parse 崩（基线被写坏/半写）——改成**读重试 + 可诊断报错**，
// 并且写回时用**原子替换**（见下）→ 并行执行（`--jobs>1`）下不会再有"读到半个文件"。
const readBaseline = () => {
	// `#1017`：文件不在 → 返回**空对象**（不再伪造 `tolerancePct: {}` —— 那个空表是真值，
	// 会被重签路径当成"有设定"写回去 → 容差静默丢失）。
	if (!existsSync(BASELINE)) return {};
	for (let i = 0; i < 3; i++) {
		const raw = readFileSync(BASELINE, 'utf8');
		try { return JSON.parse(raw); }
		catch (e) {
			if (i === 2) {
				console.error(`✗ 体积基线 ${BASELINE} 不是合法 JSON（${e.message}）`);
				console.error(`  文件前 160 字：${JSON.stringify(raw.slice(0, 160))}`);
				console.error('  多半是被并发写坏或人工编辑出错——删除该文件后跑 `node test/size-gate.mjs --update-size` 重签');
				process.exit(1);
			}
			continue;   // 可能是半写：立刻重读一次
		}
	}
	return {};
};
const parsed = readBaseline();

if (update) {
	// `#678` 交叉验证的教训（dev 提）：重签时**必须打印每项 delta＋来源提示**——
	// 那次 `#678` 只改 5 个文件、却在重签里顺手把 **fonts 的存量漂移**（+1452B，靠 ±1% 容差一直绿着）也纠正了，
	// 而 PR 说明里没写 → 得重算一遍才知道那笔账不是本 PR 的。**看不清账＝不能归因。**
	// 两个来源提示都用**本地事实**（无网络）：① 基线里没有的新项；② 工作区相对 HEAD 改过的源文件（可能影响产物）。
	const gitChanged = (() => {
		try {
			return execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'src', 'stories', 'build.mjs', 'scripts/dist-paths.mjs'], { encoding: 'utf8' })
				.split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
		} catch { return []; }
	})();
	console.log('体积基线重签（逐项 delta）：');
	for (const [k, v] of Object.entries(rows)) {
		const b = parsed.rows?.[k];
		const d = b == null ? '（基线原无此项）' : `${v - b >= 0 ? '+' : ''}${v - b}B`;
		console.log(`  · ${k}: ${b ?? '—'} → ${v}B  (${d})`);
	}
	console.log(gitChanged.length
		? `  工作区改过的源（可影响产物，逐条自己认账）：${gitChanged.join(' · ')}`
		: '  工作区无 src/stories 改动 ⇒ **体积变化与本次改动无关**（存量漂移，请在 PR 里写明"顺手纠正"）');
	// 重签**只动数值**：容差表写回的是 `resolveTol` 的**解析结果**
	// → 即便基线被删／抽风，这条设定也**不会**跟着没（`#211` 的原意 ＋ `#1017` 的修法）。
	writeBaseline({ note: NOTE, rows, tolerancePct: resolveTol(parsed) });
	console.log('✔ 体积基线已重签');
	process.exit(0);
}

const { failures, lines, shrunken } = judge(rows, parsed);
for (const l of lines) (l.startsWith('✗') ? console.error : console.log)(l);

if (failures) {
	// #362：**失败绝不写基线**（此前会写回当前实际值 → 自愈放宽）
	console.error(`\n✗ 体积门未过（${failures} 项超预算）——基线未改动`);
	process.exit(1);
}
if (Object.keys(shrunken).length) {
	const cur = readBaseline();
	for (const [k, v] of Object.entries(shrunken)) cur.rows[k] = v;   // 只写**实际降低**的项
	writeBaseline(cur);
	console.log(`  （体积基线已收紧 ${Object.keys(shrunken).join('、')}——只紧不松；其余项与容差表保留）`);
}
console.log('✔ 体积 ratchet 通过（首屏字节在预算内）');
