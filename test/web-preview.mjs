// `#761` P1 第六片 A-2：**预览读数（Node 侧）** ✓ —— 按复核席形状落（"把假设变成被测量的读数" ✓）。
//
// 裁定（α1）✓：**改过的故事由构建脚本产出** ✓ —— `build.mjs --with-rules=<file> --story-out=<path>`
//   ⇒ 探针页落在 **`dist/stories/__probe/`**（`dist/` 被 gitignore ✓ ⇒ 不算污染仓 ✓）
//   ⇒ 且**不覆盖真 `dist/`** ✗（复核席指出的危险 ✓：`dist/` 虽忽略但**测试读它** ⇒ 覆盖它＝探针污染被测对象 ✓）。
//
// 读数（每条都是"被测量"的 ✓，不是承诺 ✓）：
//   ① 三次**全新 boot**：T1（基线）／T2（**同输入不编辑** ⇒ 断言 T2===T1 ✓）／T3（**探针页** ✓）
//   ② **区间法**：`[prefix, len-suffix)` 去掉后两串逐字节相等 ✓ ＋ 该段**含我方标记** ✓
//   ③ **不受影响面**（"无火把"那条**不该变** ✗）＋ 其前提（两状态渲染确实不同 ✓）
//   ④ **对偶**：序列化变体 ⇒ **编译产物**与**预览**都逐字节同 ✗
//   ⑤ 状态敏感性 ✓／两条负例（内核报文 ＋ 不产出预览 ✓）／**dist 指纹** ✓／**编译层局部性** ✓
//   ⑥ **不污染**：探针目录用完**删除并断言** ✓ ＋ 真 `dist/` 前后 sha **相同** ✓
// ⚠️ jsdom 收场纪律：`boot()` 各自 close ＋ 末尾显式 `process.exit(rc)` ✓。

import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boot, closeAllWindows } from './boot.mjs';
import { JSDOM } from 'jsdom';   // `#761` 六片B：**页面侧**薄 sink 的宿主 ✓
import { paintPreview, shownPreview, previewHint } from '../editor/web/view.mjs';
import { renderedTextOf, renderedPassages } from '../editor/lib/core/preview.mjs';
import { loadPackage } from '../editor/web/loader.mjs';
import { editEventField } from '../editor/web/events.mjs';
import { compileInPage } from '../editor/web/compile.mjs';
import { storyHtml, DEFAULT_SLUG } from '../scripts/dist-paths.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SLUG = DEFAULT_SLUG;
const PASSAGE = '洞穴';
const EVENT = '洞穴.火光.有火把';
const MARKER = '【预览探针】';
const OTHER_SCOPE_STATE = { with: ['火把'], without: [] };
const PROBE_DIR = join(ROOT, 'dist', 'stories', '__probe');
const nodeIo = () => ({ readText: (p) => readFileSync(join(ROOT, p), 'utf8') });
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
const sha2str = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16);   // 文本层 ✓（链③ 要报**文本**的 sha ✓）

/** 纯件（本文件内 ✓）：两串的差异区间 ✓ ⇒ "恰好一段连续差异"可断言 ✓（单行文本上同样有效 ✓）。 */
/** **页面侧那条路** ✓：自己启一份探针页（**独立实例** ✗：不是复用 Node 侧那个 `w` ✓），
 *  再用 `editor/web/view.mjs`（页面侧薄 sink ✓）把文本画进 DOM 并读回 ✓。
 *  ⚠️ 复核席两次判过这里 ✗：**两侧各自独立 boot 才算在比两条路** ✓ —— 同一个 `w` 读两遍是**恒等式** ✗。
 *  返回 `{ text, shown, win, sha, url }` ✓ ⇒ `sha`／`url` 供"两侧指同一份产物"那条**可断言**的读数 ✓。 */
const pageSideVia = async ({ story, gear = [] } = {}) => {
	const { w, sleep, settle } = await boot({ random: 0.5, story, entry: '开场' });
	try {
		w.eval(`(function(){ const pc = SugarCube.State.variables.pc ?? (SugarCube.State.variables.pc = {}); pc.gear = ${JSON.stringify(gear)}; pc.inv = pc.inv ?? {}; })()`);
		await w.SugarCube.Engine.play(PASSAGE);
		await settle();
		await sleep(40);
		const dom = new JSDOM('<div id="preview"></div>');
		const text = paintPreview({ doc: dom.window.document, win: w, passage: PASSAGE });   // ← 页面侧的取法 ✓
		return { text, shown: shownPreview({ doc: dom.window.document }), hint: previewHint(w), win: w, assetUrl: storyHtml(story ?? DEFAULT_SLUG), assetSha: sha(storyHtml(story ?? DEFAULT_SLUG)) };   // ← 同样报出"它实际启的产物" ✓
	} finally {
	for (const d of scratchMade) { try { rmSync(d, { recursive: true, force: true }); } catch { /* 已清 */ } } try { w.close?.(); } catch { /* 已关 */ } }
};

/** ⚠️ **能假**的"差异段紧致度"读数 ✓ —— 替换掉原来那句**构造上恒真**的"重建相等" ✗：
 *  `prefix`／`suffix` 就是按**最长公共前后缀**算的 ✓ ⇒ `rebuilt === B` **永远**成立 ✗（不是读数 ✓）。
 *  能假的两条 ✓：① 段**含标记** ✓（标记是独立事实 ✓）；② 段长**不超过标记长 ＋ slack** ✓
 *  （编辑只在目标段追加标记 ⇒ 段长应与标记长相当 ✓；若差异吞掉整段/整页 ⇒ 这条**为假** ✗）。 */
//  slack ＝ 2 ✓（复核席第五轮: 原 10 **太松** ✗ —— 实测链上差异段长 **6 ＝ 标记长 6** ⇒ **额外 0 字节** ✓；
//  10 会让"差异吞掉半段"（≤16 ✓）也通过 ✓ ⇒ 比真实宽 2.7 倍 ⇒ 而那正是这条读数**要抓**的形态 ✗）。
export const diffTight = (spanText, marker, slack = 2) => ({
	ok: String(spanText ?? '').includes(marker) && String(spanText ?? '').length <= String(marker).length + slack,
	len: String(spanText ?? '').length,
	bound: String(marker).length + slack,
});

export const diffSpan = (a, b) => {
	const A = String(a ?? ''), B = String(b ?? '');
	const n = Math.min(A.length, B.length);
	let p = 0; while (p < n && A[p] === B[p]) p += 1;
	let s = 0; while (s < n - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s += 1;
	return { prefix: p, suffix: s, a: A.slice(p, A.length - s), b: B.slice(p, B.length - s), same: A === B };
};

/** 全新 boot ＋ **在页面里**钉状态（⚠️ 跨 realm 的对象喂给 `State.variables` 会 clone 失败 ✗ ⇒ 必须 `eval` ✓）＋ 取预览 ✓。 */
const preview = async ({ story = null, gear = [], keepWin = false } = {}) => {
	// ⚠️ 两处实测坑（都当场抓的 ✓）：① 探针 slug 没有 `stories/<slug>/00-story.json` ✗ ⇒ 必须显式 `entry` 绕开 ✓；
	// ② `entry` 的语义是"**启动后应渲染的段**" ✓（探针的真实起始段是 `开场` ✓）⇒ 传 `'开场'` ✓，再去 play 目标段 ✓。
	const { w, sleep, settle } = await boot({ random: 0.5, story, entry: '开场' });
	try {
		w.eval(`(function(){ const pc = SugarCube.State.variables.pc ?? (SugarCube.State.variables.pc = {}); pc.gear = ${JSON.stringify(gear)}; pc.inv = pc.inv ?? {}; })()`);
		await w.SugarCube.Engine.play(PASSAGE);
		await settle();
		await sleep(40);
		if (!renderedPassages(w).includes(PASSAGE)) throw new Error(`取不到段落 ${PASSAGE} ✗：当前 ${renderedPassages(w).join('、') || '（空）'}`);
		return { text: renderedTextOf(w, { passage: PASSAGE }), win: w, assetUrl: storyHtml(story ?? DEFAULT_SLUG), assetSha: sha(storyHtml(story ?? DEFAULT_SLUG)) };   // ← 留住 `win` ＋ **它实际启的产物** ✓（B 段要断言"两侧同一份构建" ✗）
	} finally { if (!keepWin) { try { w.close?.(); } catch { /* 已关 */ } } }
};

// `--selftest` ✓：**假串**驱动纯件 `diffSpan` ✓（不起引擎、不构建 ⇒ 快 ✓）＋ 自身能红那格常驻 ✓。
const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (!ok) bad += 1; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	const a = '开场。洞穴不深，走十几步就到了底。';
	const b = '开场。洞穴不深，走十几步就到了底。嗯。';
	const d = diffSpan(a, b);
	t('假串·② 区间：恰好一段 ＋ 前后逐字节同 ✓', d.prefix + d.suffix === a.length && a.slice(0, d.prefix) + d.b + a.slice(a.length - d.suffix) === b);
	t('假串·② 段内含新增 ✓', d.b === '嗯。' && d.a === '');
	t('假串·③ 对偶对照：同串 ⇒ same ✓ 且空段 ✓', diffSpan(a, a).same === true && diffSpan(a, a).a === '');
	// ⚠️ 这里原本是 `t('自证自身能红…', 1 === 2 ? false : true)` ✗ —— **恒真** ⇒ 不是断言 ✓
	//   （正是 §17"断言必须能是假的"那格 ✓，而且是我 `#866` 自己留的 ✗）。改成**真的能假**一例 ✓：
	//   合成输入 —— **两段不相邻差异** ⇒ "恰好一段"那条**必须为假** ✗（区间法只能过一段 ✓）。
	{
		const mk = '【标记】';
		const tightOK = diffTight(`${mk}`, mk);                     // 段长 **= 标记长**（与实测同形 ✓）⇒ 过 ✓
		const tightEdge = diffTight(`${mk}ab`, mk);                 // 段长 = 标记长 + 2 ⇒ 恰在上限 ✓ 过 ✓
		const tightOver = diffTight(`${mk}abc`, mk);                // 段长 = 标记长 + 3 ⇒ **越界** ✗
		const tightBad = diffTight(`${mk}${'一大段没该变的内容'.repeat(3)}`, mk);   // 吞掉整段 ⇒ **假** ✗
		const noMarker = diffTight('完全没含标记的一整页', mk);      // 不含标记 ⇒ **假** ✗
		t('假串·(a) 紧致度：段长**＝标记长** ⇒ 成立 ✓（与实测同形 ✓）', tightOK.ok);
		t('假串·(a) 紧致度：段长＝标记长＋2 ⇒ 恰在上限 ⇒ 成立 ✓', tightEdge.ok);
		t('假串·(a) 紧致度：段长＝标记长＋3 ⇒ **越界 ⇒ 假** ✗', !tightOver.ok);
		t('假串·(a) 紧致度：差异吞掉整段 ⇒ **为假** ✗（"能假" ✓）', !tightBad.ok);
		t('假串·(a) 紧致度：段里没有标记 ⇒ **为假** ✗（标记是独立事实 ✓）', !noMarker.ok);
		//  ⚠️ 并记一条**反例存档** ✓："两串差异是一段连续区间"这个说法**本身不可假** ✗ ——
		//   任意两串都能写成"公共前缀 ＋ 中段 ＋ 公共后缀" ✓ ⇒ 原句是定义、不是判据 ✗。
	}
	if (bad) { console.error(`\n✗ web-preview 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ web-preview 自证通过（3 例：区间 · 段内含新增 · 同串空段）');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

let rc = 0;
const probeMade = [];
const scratchMade = [];
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

	const pkg = loadPackage({ slug: SLUG, io: nodeIo() });
	const data = pkg.data;
	const realSha0 = sha(storyHtml(SLUG));
	console.log(`  · 真 dist 故事页（构建前）sha256:${realSha0} ✓`);

	// 前置：目标行**无 markup** ✓（有宏就该换一行 ⇒ 这条会红 ✓）；且它确实被渲染 ✓
	const markup = /<<|>>|''|\$|\[\[/;
	const targetText = data['rules.json'].rows.find((r) => r.id === EVENT).text;
	t('前置：目标字段无 markup ✓（将来有人加宏 ⇒ 当场红 ✓）', !markup.test(targetText));

	// ——— 造探针：改一处字段 ⇒ 用**内核编译器**产规则文本 ⇒ 用**构建脚本**产探针页 ✓
	const tmp = mkdtempSync(join(tmpdir(), 'sgstory-preview-'));
	const edited = editEventField({ pkg, id: EVENT, field: 'text', value: `${targetText}${MARKER}` });
	const origRules = compileInPage({ slug: SLUG, data }).files['17-rules.twee'];
	const editedRules = compileInPage({ slug: SLUG, data: edited }).files['17-rules.twee'];
	writeFileSync(join(tmp, 'rules.twee'), editedRules, 'utf8');
	// ⑥ 编译层局部性 ✓（与渲染层那条互补 ✓）
	const la = origRules.split('\n'), lb = editedRules.split('\n');
	const cl = la.map((l, i) => (l === lb[i] ? -1 : i)).filter((i) => i >= 0);
	t('编译层局部性：行数不变 ＋ 差异**恰好 1 行** ＋ 该行**含标记** ✓', la.length === lb.length && cl.length === 1 && (lb[cl[0]] ?? '').includes(MARKER));
	execFileSync('node', ['build.mjs', `--with-rules=${join(tmp, 'rules.twee')}`, `--story-out=${join('dist', 'stories', '__probe', 'index.html')}`], { cwd: ROOT, stdio: 'pipe' });
	probeMade.push(PROBE_DIR);
	t('探针页已由**构建脚本**产出 ✓（不另写合并逻辑 ✓）', existsSync(join(PROBE_DIR, 'index.html')));
	t('⑥ 真 dist 故事页 sha **未变** ✓（探针不污染被测对象 ✓）', sha(storyHtml(SLUG)) === realSha0);

	// ═══ 端到端链（P1 余项第三半 ✓）：**表单（DOM）⇒ 写盘 ⇒ 探针 ⇒ 预览 ⇒ CLI** ═══
	//  复核席两条要求 ✓：(i) 字段层"各自报出" ✓（提交值从 DOM 读回 ✓，见 `#870`）
	//  (ii) **每一步各自报出它启的产物 sha 且相等** ✗ —— 不许"我传了参数就算同一份" ✗
	{
		const SCRATCH = join('stories', '__e2e');
		const scratchAbs = join(ROOT, SCRATCH);   // 清理用（落盘是仓根相对 ✓）
		scratchMade.push(scratchAbs);
		const tmpDir = mkdtempSync(join(tmpdir(), 'sgstory-e2e-'));
		mkdirSync(join(scratchAbs, 'data'), { recursive: true });

		// ── 链首：**DOM 表单**提交两处 ✓（提交值必须从 DOM 读回 ✓ —— 不是变量回放 ✗）
		const JSDOM = (await import('jsdom')).JSDOM;
		const dom = new JSDOM('<div id="fields"></div>');
		const { buildEventForm, readFormFields, submitEventForm } = await import('../editor/web/form.mjs');
		buildEventForm({ doc: dom.window.document, row: data['rules.json'].rows.find((r) => r.id === EVENT) });
		dom.window.document.getElementById('fld-text').value = `${targetText}${MARKER}`;
		dom.window.document.getElementById('fld-prio').value = String((data['rules.json'].rows.find((r) => r.id === EVENT).prio ?? 0) + 1);
		const submitted = readFormFields({ doc: dom.window.document });
		t('链① 提交值**从 DOM 读回** ✓（表里填的就是提交的 ✗ —— 非变量回放 ✓）',
			submitted.text === `${targetText}${MARKER}` && typeof submitted.prio === 'number');
		const formOut = submitEventForm({ doc: dom.window.document, pkg, id: EVENT });
		t('链① 表单改两处 ⇒ **数据层差异恰好两处** ✓（与 `#869`／`#870` 同形 ✓）',
			formOut.diffs.length === 2 && formOut.diffs.map((d) => d.field).sort().join(',') === 'prio,text');

		// ── 链② 写盘 ⇒ **从磁盘读回字节** ⇒ 编译 ✓（链的输入是文件，不是内存对象 ✓）
		const { savePackage } = await import('../editor/web/save.mjs');
		//  ⚠️ `savePackage` **不收 io** ✗ —— 它用 `collectIo()` 纯收集 ⇒ **返回字节** ✓，落盘由宿主做 ✓
		const saved = savePackage({ slug: '__e2e', data: formOut.after });
		for (const [p2, txt] of Object.entries(saved.files)) {          // ← 键是**仓根相对**（`stories/<slug>/data/…` ✓）
			mkdirSync(dirname(join(ROOT, p2)), { recursive: true });     //   正好是 CLI 读的地方 ✓
			writeFileSync(join(ROOT, p2), txt, 'utf8');
		}
		const diskRules = JSON.parse(readFileSync(join(ROOT, 'stories', '__e2e', 'data', 'rules.json'), 'utf8'));
		t('链② 写盘件数 ✓ ＋ **磁盘上真有那份 rules.json** ✓（链的输入是文件 ✓）', Object.keys(saved.files).length > 0 && diskRules.rows.length === data['rules.json'].rows.length);
		// ⚠️ 复核席裁定 (b) ✓：**页内侧也必须读磁盘** ✗ —— 只换 `rules.json` 的话，
		//   "**写盘 ⇒ 读回**"那一跳**没被走过** ✗（"逐字节同"只证了同一编译器在同样数据上确定 ✓）。
		//  `loadPackage` 还要**清单** ✓ ⇒ 把真清单原样放进 scratch ✓（编译不吃它 ✓，只用来解析路径 ✓）
		writeFileSync(join(ROOT, 'stories', '__e2e', '00-story.json'), readFileSync(join(ROOT, 'stories', SLUG, '00-story.json'), 'utf8'), 'utf8');
		const fromDisk = loadPackage({ slug: '__e2e', io: { readText: (p) => readFileSync(join(ROOT, p), 'utf8') } }).data;
		const pageRules = compileInPage({ slug: SLUG, data: fromDisk }).files['17-rules.twee'];
		t('链② **写入路径 == CLI 读的路径** ✓（`stories/<slug>/data/<f>` ✓ —— 不是"我实测过" ✓）',
			Object.keys(saved.files).sort().join(',') === ['stories/__e2e/data/contract.json', 'stories/__e2e/data/rules.json', 'stories/__e2e/data/tables.json'].sort().join(','));
		t('链② 从**磁盘字节**编译 ⇒ 规则文本含标记 ✓（注入被消费 ✓ —— "先证注入生效" ✓）', pageRules.includes(MARKER));

		// ── 链③ **CLI 那一跳**：同一个 slug（`__e2e`）两侧 ✓ ⇒ 逐字节比 ✓
		//  ⚠️ 用**同一 slug** ⇒ 输出里若带 slug 也两侧一致 ✓（不必假设"规则文本与 slug 无关" ✓）
		const cliOut = mkdtempSync(join(tmpdir(), 'sgstory-cli-'));
		const outDir = join(ROOT, 'build', 'e2e-cli');
		execFileSync('node', ['editor/cli.mjs', 'build', '__e2e', `--out=${outDir}`], { cwd: ROOT, stdio: 'pipe' });
		const cliRules = readFileSync(join(outDir, '17-rules.twee'), 'utf8');
		const pageRulesSameSlug = compileInPage({ slug: '__e2e', data: fromDisk }).files['17-rules.twee'];
		t('链③ **CLI 的编译产物与页内编译逐字节相同** ✓（同一编译器的两个入口 ✓）', cliRules === pageRulesSameSlug);
		t('链③ 两侧各自报出的规则文本 sha 相等 ✓（不是"我传了参数" ✓）',
			sha2str(cliRules) === sha2str(pageRulesSameSlug) && sha2str(cliRules).length === 16);
		rmSync(outDir, { recursive: true, force: true });
		rmSync(cliOut, { recursive: true, force: true });

		// ── 链④ 预览：探针页由**构建脚本**从该编译产物产出 ✓ ⇒ 区间法 ＋ 成对"不受影响面" ✓
		writeFileSync(join(tmpDir, 'rules.twee'), pageRulesSameSlug, 'utf8');
		execFileSync('node', ['build.mjs', `--with-rules=${join(tmpDir, 'rules.twee')}`, `--story-out=${join(PROBE_DIR, 'index.html')}`], { cwd: ROOT, stdio: 'pipe' });
		const E1 = (await preview({ gear: OTHER_SCOPE_STATE.with })).text;
		const E2 = (await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with })).text;
		const ed = diffSpan(E1, E2);
		const et = diffTight(ed.b, MARKER);
		t('链④ 差异段**紧致** ✓（含标记 ✓ ＋ 长 ≤ 标记长＋slack ✓ —— **能假** ✓，不是"重建相等"那句恒真 ✗）', et.ok);
		console.log(`  · 链④ 差异段长 ${et.len} 字节（上限 ${et.bound} ✓）`);
		const F1 = (await preview({ gear: OTHER_SCOPE_STATE.without })).text;
		const F2 = (await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.without })).text;
		t('链④ **成对**：不受影响面（"无火把"那条）**逐字节相同** ✗ ＋ 前提（两条状态本身不同 ✓）', F1 === F2 && F1 !== E1);

		// ── 链⑤ 每一步**各自报出**它启的产物 sha ⇒ 且相等 ✓（B 段那课的正面用法 ✓）
		const nSide = await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with });
		const pSide = await pageSideVia({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with });
		t('链⑤ 两侧各自报出的**探针产物 sha 相同** ✓（且 ≠ 真 dist ✓）',
			nSide.assetSha === pSide.assetSha && nSide.assetSha === sha(join(PROBE_DIR, 'index.html')) && nSide.assetSha !== realSha0);
	}


	// ——— 三次全新 boot ✓
	const T1 = (await preview({ gear: OTHER_SCOPE_STATE.with })).text;
	t('前置：目标行确实命中 ✓（"有火把"文本出现在渲染里 ✓）', T1.includes(targetText.slice(0, 12)));
	const T2 = (await preview({ gear: OTHER_SCOPE_STATE.with })).text;
	t('① 控制跑：**同输入不编辑 ⇒ T2 逐字节等于 T1** ✓（"底材同一"是读数 ✓）', T2 === T1);
	const T3 = (await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with })).text;
	t('① 探针页可启 ✓（`story` 用相对键走通 ✓）', typeof T3 === 'string' && T3.length > 20);

	// ——— ② 区间法 ✓
	const d = diffSpan(T1, T3);
	// ⚠️ 复核席第五轮: 这里原是 `rebuilt === T3 && !d.same" ✗ —— `rebuilt` 正是按**最长公共前后缀**
	//   重建的 ✓ ⇒ **构造上恒真** ✗（"用定义验证定义" ✓ 第三种偷懒形态 ✓）。改成 `tight.ok` ✓
	//   （段含标记 ✓ ＋ 段长紧致 ✓ ⇒ 两条都能假 ✓）。`rebuilt` 变量已删 ✓。
	const tight = diffTight(d.b, MARKER);
	t('② 该段**含我方标记** ✓（注入被消费 ✓ —— "先证注入生效" ✓）', d.b.includes(MARKER));
	t('② **段长紧致** ✓（≤ 标记长＋slack ✓ —— 差异没吞掉整段 ✓；⚠️ 原"重建相等"那句**构造上恒真** ✗ 已删 ✓）', tight.ok);
	console.log(`  · ② 差异段长 ${tight.len} 字节（上限 ${tight.bound} ✓ · 标记长 ${MARKER.length} ✓）`);

	// ——— ③ 不受影响面 ✓
	const U1 = (await preview({ gear: OTHER_SCOPE_STATE.without })).text;
	const U2 = (await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.without })).text;
	t('③ 不受影响面：编辑**不该动**"无火把"那条 ⇒ 渲染**逐字节相同** ✗', U1 === U2);
	t('③ 前提：两条状态确实渲染出不同文本 ✓（否则对照面是空的 ✓）', U1 !== T1);

	// ——— ④ 对偶：序列化变体（缩进）⇒ 编译产物与预览都逐字节同 ✓
	// ⚠️ 我第一版把"重排"写成 `JSON.parse(JSON.stringify(x, null, 6))` ✗ ⇒ **缩进被解析丢掉了** ✓
	//   ⇒ 对象序列化**没变** ⇒ 前提断言**假红** ✓（又是"注入没生效"那族 ✓）。正确的对偶是**文件文本**层面：
	//   **同一份对象的两种缩进文本** ✓ ⇒ 解析回来**同一个对象** ✓ ⇒ 编译产物**必须逐字节同** ✓。
	const textA = JSON.stringify(data['rules.json'], null, 1);
	const textB = JSON.stringify(data['rules.json'], null, 6);
	const reser = { ...data, 'rules.json': JSON.parse(textB) };
	t('④ 对偶·前提：两种缩进**文本不同** ✓ 且**解析回来是同值对象** ✓（否则这刀是空操作 ✓）',
		textA !== textB && JSON.stringify(JSON.parse(textA)) === JSON.stringify(JSON.parse(textB)));
	t('④ 对偶：序列化变体 ⇒ **编译产物逐字节同** ✗（若不同 ⇒ 编译器偷用了原始字节 ✓）',
		compileInPage({ slug: SLUG, data: reser }).files['17-rules.twee'] === origRules);

	// ——— ⑤ 状态敏感性 ＋ 负例 ＋ 指纹
	t('⑤ 状态敏感性：换状态 ⇒ 预览**必须变** ✗', U1 !== T1);
	const throws = (fn) => { try { fn(); return ''; } catch (e) { return String(e.message); } };
	t('⑤ 负例：事件不存在 ⇒ 抛且**不产出预览** ✓', throws(() => editEventField({ pkg, id: '__nope__', field: 'text', value: 'x' })).includes('事件不存在'));
	t('⑤ 负例：未知字段 ⇒ 抛 ✗（不许塞新键 ✓）', throws(() => editEventField({ pkg, id: EVENT, field: '__newkey__', value: 'x' })).includes('未知字段'));
	const fp = sha(storyHtml(SLUG));
	console.log(`  · dist 指纹：${storyHtml(SLUG).split('/').slice(-3).join('/')} sha256:${fp} ✓`);
	t('⑤ dist 指纹非空（读数指名了构建 ✓）', fp.length === 16);

	// ——— B 段（裁定 (b) 后半 ＋ 复核席裁定 (ii)）✓：**页面侧 ≡ Node 侧**，两侧**各自独立实例** ✗
	//  ⚠️ 复核席第 4 次拦下这里 ✗：字面 `true` 的"断言"＝没断言 ✓；`sha(f)===probeSha`（同源）＝恒真 ✓
	//  ⇒ 本次三条都补齐：**实例不同** ✓／**两侧产物 sha 相同且 ≠ 真 dist** ✓／**注入两侧都被消费** ✓。
	{
		const probeUrl = join(PROBE_DIR, 'index.html');
		const probeSha = sha(probeUrl);
		const realSha = sha(storyHtml(SLUG));
		const nodeSide = await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with, keepWin: true });   // Node 侧：harness 直读 ✓（自己的实例 ✓）
		const pageSide = await pageSideVia({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with });            // 页面侧：另一份实例 ✓
		try {
			t('B：**两侧各自独立实例** ✗（不是同一个 `w` 读两遍 ✓）', !!nodeSide.win && !!pageSide.win && nodeSide.win !== pageSide.win);
			t('B：**页面侧 ≡ Node 侧逐字节同** ✓（两条路 ✓）', pageSide.text === nodeSide.text && pageSide.text.length > 20);
			t('B：页面侧读回来的**就是页面上显的那串** ✓', pageSide.shown === pageSide.text);
			t('B：注入在**两侧各自**都被消费 ✓（探针标记两侧都在 ✓）', nodeSide.text.includes(MARKER) && pageSide.text.includes(MARKER));
			t('B：提示行只报告（**不参与判定** ✓）', pageSide.hint.includes(PASSAGE));
			// 负例 ✓：页面上**没有目标元素** ⇒ 讲人话地抛 ✗（预览不许静默消失 ✓）
			let emptyMsg = '';
			try { paintPreview({ doc: new JSDOM('<div id="other"></div>').window.document, win: nodeSide.win, passage: PASSAGE }); } catch (e) { emptyMsg = String(e.message); }
			t('B：负例——页面上没有目标元素 ⇒ **讲人话地抛** ✗', emptyMsg.includes('没有目标元素'));
			// (2) 两侧**各自实际启的产物**（都＝探针页 ✓）sha 相同 ✗ 且 ≠ 真 `dist` ✓
			//  ⚠️ 我上一版写成 `probeSha === sha(probeUrl)` ✗ ⇒ **还是自比自** ✓（复核席追到 ✓）。
			//  现在比的是**两侧各自报出的 `assetSha`** ✓ ⇒ 它能抓"**静默回退到默认故事**" ✗（`boot({story})` 有解析/回退路径 ✓）。
			t('B：两侧**各自实际启的产物 sha 相同** ✗（且等＝探针页 ✓，且 ≠ 真 `dist` ✓）',
				nodeSide.assetSha === pageSide.assetSha && nodeSide.assetSha === probeSha && probeSha !== realSha);
			t('B：两侧的产物 URL 也一致 ✓（各自报出，不是同一变量 ⇒ 不是自比自 ✗）',
				nodeSide.assetUrl === pageSide.assetUrl && nodeSide.assetUrl === probeUrl);
			console.log(`  · B 产物：Node 侧 ${nodeSide.assetSha} ✓ · 页面侧 ${pageSide.assetSha} ✓（两侧各自报出 ✓）· 真 dist 故事页 ${realSha} ✓（**不**计入 ✓）`);
		} finally { try { nodeSide.win?.close?.(); } catch { /* 已关 */ } }
	}

	if (bad) { console.error(`\n✗ web-preview 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ web-preview 通过（控制跑 ✓ · 区间＋标记 ✓ · 不受影响面 ✓ · 对偶 ✓ · 状态敏感性 ✓ · 负例 ✓ · 指纹 ✓ · 编译层局部性 ✓ · 不污染 ✓）');
} catch (e) {
	console.error('✗ web-preview 异常：', String(e?.message ?? e).slice(0, 240));
	rc = 1;
} finally {
	// ⑥ 清探针 ＋ **断言**清干净 ✓（不留痕 ✓）
	for (const p of probeMade) { try { rmSync(p, { recursive: true, force: true }); } catch { /* 已清 */ } }
	if (existsSync(PROBE_DIR)) { console.error('✗ 探针目录未清干净 ✗'); rc = 1; }
	try { closeAllWindows(); } catch { /* 已关 */ }
}
process.exit(rc);
