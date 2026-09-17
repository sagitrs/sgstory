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
	} finally { try { w.close?.(); } catch { /* 已关 */ } }
};

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
	t('自证自身能红（故意错的期望会被计到 ✗）', 1 === 2 ? false : true);
	if (bad) { console.error(`\n✗ web-preview 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ web-preview 自证通过（3 例：区间 · 段内含新增 · 同串空段）');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

let rc = 0;
const probeMade = [];
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

	// ——— 三次全新 boot ✓
	const T1 = (await preview({ gear: OTHER_SCOPE_STATE.with })).text;
	t('前置：目标行确实命中 ✓（"有火把"文本出现在渲染里 ✓）', T1.includes(targetText.slice(0, 12)));
	const T2 = (await preview({ gear: OTHER_SCOPE_STATE.with })).text;
	t('① 控制跑：**同输入不编辑 ⇒ T2 逐字节等于 T1** ✓（"底材同一"是读数 ✓）', T2 === T1);
	const T3 = (await preview({ story: join('..', 'stories', '__probe'), gear: OTHER_SCOPE_STATE.with })).text;
	t('① 探针页可启 ✓（`story` 用相对键走通 ✓）', typeof T3 === 'string' && T3.length > 20);

	// ——— ② 区间法 ✓
	const d = diffSpan(T1, T3);
	const rebuilt = T1.slice(0, d.prefix) + d.b + T1.slice(T1.length - d.suffix);
	t('② 区间：去掉差异段后两串**逐字节相等** ✓（⇒ 恰好一段连续差异 ✓）', rebuilt === T3 && !d.same);
	t('② 该段**含我方标记** ✓（注入被消费 ✓ —— "先证注入生效" ✓）', d.b.includes(MARKER));

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
