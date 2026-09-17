// 契约分类器（`#762` 车道 A 的执行体）：**把故事侧的 `Sg.story.*` 成员归类成声明式 kind**。
//
// 它要回答 P0 的那句验收：**"逃生舱清单为空"到底成不成立**。做法是逐成员看**源码形状**，
// 能归类的给出 kind，归不了类的**点名**（不是"静默跳过"——那才是这类工具最会骗人的地方）。
//
// 四个桶（**分桶口径写死在注释里，免得 C 变成"我不知道怎么表达"的垃圾桶**）：
//   A. **可直接表达**（现有 `KINDS` 能装）
//   B. **需要声明式扩展**（形状能看懂、只是现有 kind 缺字段/缺种类：如 `game-ref` 缺默认值 · `forward` 转发 ·
//      `template` 模板 · `lookup-field` 的 `required`/`via`）—— **凡是"可预见的声明式扩展"能覆盖的一律进 B**
//   D. **可下沉引擎（甲案）**（形状是"引擎能力 ＋ 故事数据"：如查表后用 `Sg.notes.has` 组装）
//      —— 标成一类，是为了让"要不要下沉"成为**显式决定**，而不是分类的副作用
//   C. **真逃生舱候选**（上面都装不下 ⇒ 才考虑 `kind:'js'`，且必须进 `escape-hatch.json` 写理由 ＋ 票号）
//
// 用法：node editor/classify-contract.mjs <slug> [--json]      # 默认只报告；`--json` 打印提案数据
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { scriptBodies, hasGeneratedMarker } from './lib/core/text.mjs';
export { hasGeneratedMarker };
import { engineScripts, readText, writeText, mkdirp, exists } from './lib/host/fs.mjs';
// `#794` P1①：故事包写入走 **core 的唯一写路**（`writeStoryPackage`）—— 壳里不再出现 `node:fs` 原语 ✗（K6 L1 在盯 ✓）。
import { packageFiles, writeStoryPackage } from './lib/core/story.mjs';
const NODE_IO = { readText, writeText, mkdirp, exists };
import { KINDS, GLOBAL_ROOTS } from './compile-story.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** **长度保持**的遮蔽器（注释 ＋ 字符串/模板）：把内容换成空格、**保留换行** ⇒ 下标与原文本一一对应。
 *  为什么自带一个而不是 import：① `report-selftest-validity.mjs` **没有主模块守卫** ⇒ `import` 它会执行它的 CLI
 *  （实测：跑我的分类器会先打一遍它的自检报告）；② 本仓 §9.7 的教训是"**单扫描器按词法一次遮蔽**"，
 *  所以这里是**一次词法扫描**，不是几条正则叠着剥。 */
// 纯文本/纯数据部分已搬到 `editor/lib/core/contract.mjs`（转出，老调用方不变 ✓）。
import { maskAll, contractSites, membersIn, contractMembers } from './lib/core/contract.mjs';
export { maskAll, contractSites, membersIn, contractMembers };
// 字面量求值是**宿主能力**（用 node:vm ⇒ 浏览器没有）⇒ 已搬到 `editor/lib/host/literals.mjs`（转出 ✓）。
import { literalValue } from './lib/host/literals.mjs';
export { literalValue };
// 分类器（`fbEnum` ＋ `classify`）已搬到 `editor/lib/core/classify.mjs`（**工厂**形状：能力由宿主注入 ✓）。
import { fbEnum, makeClassify } from './lib/core/classify.mjs';
const { classify } = makeClassify({ evalLiteral: literalValue });
export { fbEnum, classify };

// `#794`：`resolveLocalConst`（vm 沙箱内“取局部常量值” ✓）已搬到 `editor/lib/host/sandbox.mjs` ✓（与 `runStory` 同窝 ✓）。
import { resolveLocalConst } from './lib/host/sandbox.mjs';
export { resolveLocalConst };

/** **成员分类（可单测的缝）** ✓：吃“数据面**原文** ＋ 逃生舱文本” ⇒ 出 `{ sites, stray, members, rows, locals, hatchMembers }` ✓。
 *  为什么抽出来 ✓：`fileText` 那条路径（`() => <局部常量>` ⇒ `resolveLocalConst(fileText, …)`）在三个故事**都已翻面**后
 *  **没有活样本** ✗ ⇒ 不抽成函数就**只能靠往仓里塞临时夹具**才能覆盖 ✗（会污染工作区 ✓）。
 *  抽成函数后：`fileText` 是**形参** ✓ ⇒ 原先那处“变量没定义 ⇒ `ReferenceError`”的形态**结构上不可能**再出现 ✓，
 *  且该路径可在**不需要任何夹具文件**的前提下被自证驱动 ✓。
 *  ⚠️ fixture 注意：本函数里 `resolveLocalConst` 会**跑**那段文本 ⇒ 文本自身要把沙箱依赖备好 ✓
 *  （如 `window.Sg = { story: {} };` ✓）—— 否则 `Object.assign((window.Sg.story ??= …))` 抛错 ⇒ 落 catch ⇒ 判 B ✓（**量不出真因** ✗）。 */
export const classifyContractText = ({ fileText = '', siteText = null, hatchTexts = [] } = {}) => {
	// ⚠️ **两个文本不能混**（我上一版混成一个 ⇒ 真回归 ✗，被 ④ 档读数当场抓到 ✓）：
	//   `siteText`＝**扫站点**用的文本（原来是 `tableSrc` ✓ —— 已翻面故事里它**是空串** ⇒ 只扫手写逃生舱 ✓）；
	//   `fileText`＝**求值**用的原文（`resolveLocalConst` 要能看到 `const MECH = …` ✓）。
	//   混用后：翻面故事会把**产物**当手写源扫 ⇒ 成员数 2 → 25 ✗（输出面变化 ⇒ 只有"旧 main vs 新 head"能看见 ✓）。
	const allText = [siteText ?? fileText, ...hatchTexts].join('\n');
	const { sites, stray } = contractSites(allText);
	const members = sites.flatMap((s2) => s2.members);
	// **局部常量 ⇒ 成员名**（`#787`）：`mechanics: () => MECH` 这类成员把局部常量放进了契约 ⇒ 其它成员引用它时才可表达。
	const locals = new Map();
	const hatchMembers = new Set(contractMembers(hatchTexts.join('\n')).map((m) => m.name));
	for (const m of members) {
		const ref = /^\(\) => ([A-Za-z_$][\w$]*)$/.exec(m.src.replace(/\s+/g, ' ').trim());
		if (ref) locals.set(ref[1], m.name);
	}
	const rows = members.map((m) => {
		const c = classify(m.src, { locals });
		if (c.bucket === 'B' && c.kind === 'const' && c.spec?.ref) {
			const value = resolveLocalConst(fileText, 'Game Tables', c.spec.ref);
			if (value !== undefined && value !== null) return { name: m.name, src: m.src, bucket: 'A', kind: 'const', spec: { value }, resolvedFrom: c.spec.ref };
		}
		return { name: m.name, src: m.src, ...c };
	});
	return { sites, stray, members, rows, locals, hatchMembers };
};

const selftest = () => {
	let bad = 0;
	let n = 0;
	const t = (label, ok, got = '') => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}${ok ? '' : `\n    实得：${got}`}`); };
	const kindOf = (src) => classify(src).kind ?? classify(src).bucket;
	t('`forward` 的 `to` 存 **window. 之后的路径**（生成器写 `window.${to}` ⇒ 存全链会生成 `window.window.…`：实测只在**行为探针的报错文案**上暴露）', (() => { const r = classify('(a) => window.Game.Items.f(a)'); return r.bucket === 'A' && r.spec.to === 'Game.Items.f'; })());
	t('反例：注释里提到 `Object.assign((window.Sg.story ??= {}), …)` ⇒ **不算站点**（否则成员被数两遍）', contractSites("// 合并语义：`Object.assign((window.Sg.story ??= {}), …)` 与生成物同形\nObject.assign((window.Sg.story ??= {}), { a: () => null });").sites.length === 1);
	t("`game-ref` 的 `path` 存 `window.` 之后的路径、默认值存**值**（`?? {}` ⇒ 对象，不是字符串）", (() => { const r = classify('() => window.Game?.Notes?.entries ?? {}'); return r.bucket === 'A' && r.spec.path === 'Game?.Notes?.entries' && typeof r.spec.default === 'object' && r.spec.default !== null; })());
	t('`() => null` ⇒ null', kindOf('() => null') === 'null');
	t('`() => ({}` / `[]` ⇒ empty-*', kindOf('() => ({})') === 'empty-object' && kindOf('() => []') === 'empty-array');
	t('`(id) => String(id)` ⇒ identity-string（**陷阱回归**：`\(` 是字面括号，捕获组必须写 `\((\w+)\)`）', kindOf('(id) => String(id)') === 'identity-string');
	t('`(k) => <链>[k] ?? <默认>` ⇒ lookup（含 `?.` 链）', (() => { const r = classify('(id) => window.Game?.Items?.defs?.[id] ?? null'); return r.kind === 'lookup' && r.spec.from === 'window.Game?.Items?.defs' && r.spec.default === null; })());
	t('`const` 的 spec 用 **`value`（值）而不是 `raw`（源码）** —— 编译器只认 `value`，写 `raw` 会静默产出 `() => undefined`', (() => {
		const r = classify('() => false');
		return r.bucket === 'A' && r.spec.value === false && !('raw' in r.spec);
	})());
	t('守卫取数（路径）⇒ `game-ref` ＋ `required`/`type`，**报文取字面量**', (() => {
		const r = classify("() => { const v = window.Game?.Dragon?.hp; if (typeof v !== 'number') throw new Error('Sg.story.dragonMaxHp：结构缺失必须报错'); return v; }");
		return r.bucket === 'A' && r.kind === 'game-ref' && r.spec.required === true && r.spec.type === 'number' && r.spec.optional === true && r.spec.error.includes('结构缺失');
	})());
	t('守卫取数（`if (!v)` 形态）⇒ `game-ref` ＋ `required`（无 `type`）', (() => {
		const r = classify("() => { const v = window.Game.Items.poisonReduce; if (!v) throw new Error('缺'); return v; }");
		return r.bucket === 'A' && r.spec.required === true && !('type' in r.spec);
	})());
	t('守卫取数的报文是**空串** ⇒ 落 B（空报文等于"报什么错没人知道"）', (() => {
		const r = classify("() => { const v = window.Game.X.y; if (!v) throw new Error(''); return v; }");
		return r.bucket === 'B';
	})());
	t('守卫取数的报文**不是字面量** ⇒ 落 B（不许把表达式拼进产物）', (() => {
		const r = classify("() => { const v = window.Game.X.y; if (!v) throw new Error(`坏 ${v} 的 X`); return v; }");
		return r.bucket === 'B';
	})());
	t('值里含**函数** ⇒ 不当字面量（否则会被静默丢掉 ⇒ 假 A ✗）', literalValue("({ a: 1, f: () => 1 })") === undefined);
	t('字面量解析：对象/数组字面量 ⇒ 真值（`({a:1})` ⇒ `{a:1}`）', (() => {
		const r = classify('() => ({ a: 1, b: [2] })');
		return r.bucket === 'A' && r.spec.value.a === 1 && r.spec.value.b[0] === 2;
	})());
	t('`(k) => <链>[k]?.<字段> ?? <兜底>` ⇒ lookup-field，且兜底翻成**小 enum**（`String(k)` ⇒ string-identity）', (() => { const r = classify("(id) => window.Sg.story.mechanics()?.actions?.[id]?.label ?? String(id)"); return r.kind === 'lookup-field' && r.spec.field === 'label' && r.spec.fallback.kind === 'string-identity'; })());
	t('兜底是**裸表达式** ⇒ 该成员落 B（编译器已不收，分类器不许假装 A）', classify("(id) => window.Game.Items.defs?.[id]?.x ?? (id + '!')").bucket === 'B');
	t('`{ const s = …; if (!s) throw …; return s; }` ⇒ lookup + required（变量名任意）', (() => { const r = classify('(name) => { const s = window.Game?.Checks?.sites?.[name]; if (!s) throw new Error(`x`); return s; }'); return r.kind === 'lookup' && r.spec.required === true; })());
	t('`(pc) => pc?.dragon ?? {}` ⇒ state-ref', (() => { const r = classify('(pc) => pc?.dragon ?? {}'); return r.kind === 'state-ref' && r.spec.path === 'dragon'; })());
	t('`() => ({ … })`（括号包裹的对象）⇒ const', kindOf('() => ({ star: { charge: 12 } })') === 'const');
	t('`() => window.X ?? <默认>` ⇒ **A**（`#775` 起 `game-ref` 支持默认值 ＋ `optional`）', (() => { const r = classify('() => window.Game?.Notes?.entries ?? {}'); return r.bucket === 'A' && r.spec.optional === true; })());
	t('参数转发 ⇒ **A**（`#775` 起有 `forward`，含形参序）', (() => { const r = classify('(inv, round, defeats, poisoned) => window.Game.Items.battleDamage(round, inv, defeats, poisoned)'); return r.bucket === 'A' && r.spec.args[0] === 'round'; })());
	t('选牌策略 ⇒ **D**（可下沉为规则表）', classify("(poolId, round, pc, picked) => (poolId === '封印' && (picked ?? []).includes('x') ? 'y' : null)").bucket === 'D');
	t('查表后用 `Sg.notes.*` 组装 ⇒ **D**（引擎能力）', classify('(name, pc) => { const f = window.Game.Checks.knowledge[name]; if (!f) return null; return { flag: f, held: Sg.notes.has(f, pc) }; }').bucket === 'D');
	t('模板拼句 ⇒ **B**（`template` kind）', (() => { const r = classify('(r, base) => { const bits = []; if (r?.gold > 0) bits.push(base); return bits.join(); }'); return r.bucket === 'B' && r.kind === 'template'; })());
	t('陷阱回归②：`\\(\\1\\)` 若是**捕获组**会让后面的 `\\2`/`\\4` 整体错位 ⇒ 必须写非捕获 `\\(?:\\1\\)`', (() => {
		const r = classify("(id) => { const a = window.Sg.story.combatAction(id); if (typeof a.label !== 'string' || !a.label) throw new Error(`x`); return a.label; }");
		return r.bucket === 'A' && r.spec.field === 'label';   // 本例要证的是**捕获组下标**（字段取到 label），分桶随 KINDS 变
	})());
	t('派生字段（经成员调用）⇒ **A**（`#775` 起 `lookup-field` 有 `via`/`required`；`via` 存**成员裸名**，因为生成器写 `window.Sg.story.${via}(k)`）', (() => { const r = classify("(id) => { const a = window.Sg.story.combatAction(id); if (typeof a.label !== 'string' || !a.label) throw new Error(`x`); return a.label; }"); return r.bucket === 'A' && r.spec.via === 'combatAction'; })());
	t('反例：派生字段的链不是成员名 ⇒ **B**（不许提案出生成器读不了的 JSON）', (() => { const r = classify("(id) => { const a = window.Game.Combat.actions[id]; if (typeof a.label !== 'string' || !a.label) throw new Error(`x`); return a.label; }"); return r.bucket !== 'A'; })());
	t('选牌条件表达式 ⇒ **D**（不是 C：它能下沉成规则表）', classify("(poolId, round, pc, picked) => (poolId === '封印' && round === 1 ? 'x' : null)").bucket === 'D');
	t('真表达不了的形状 ⇒ **C**', classify('(x) => { const y = [...x].reverse().map((v) => v * 2); return y; }').bucket === 'C');
	t('`contractMembers`：能从段落文本里切出成员（注释不算成员）', (() => {
		const txt = ':: StoryBindings [script]\nObject.assign((window.Sg.story ??= {}), {\n\t// 文档注释：不属于上一个成员\n\ta: () => null,\n\tb: () => [],\n});';
		const ms = contractMembers(txt);
		return ms.length === 2 && ms[0].name === 'a' && ms[1].name === 'b';
	})());
	// `#787` 回归覆盖（截 2026-09-17）：`main` 里 `resolveLocalConst(fileText, …)` 的 `fileText`
	// 一度在搬 core 时被切掉 ✗ ⇒ 该路径走到即 `ReferenceError` ✓。本组**覆盖了辅助函数那一半** ✓：
	// 夹具故意**不含** `Object.assign(window.Sg…)`（那种夹具会因缺 `window.Sg` 落 catch ⇒ 判 B ✓，量不出真因 ✗）。
	// ⚠️ **仍未被覆盖的一半** ✗：`main` 里 `fileText` 的**作用域**本身（要跑到它得有一份
	//   "手写契约 ＋ `() => 局部常量`" 的夹具 ⇒ 三个故事翻面后没有活样本 ✓）⇒ 记为待补 ✓，
	//   此处**明说不假装覆盖** ✓（与复核席"引号未闭合 ⇒ 明记边界"同形 ✓）。
	t('`resolveLocalConst`：`const MECH = {…}` ⇒ 取出值（`#787` 回归的辅助函数那一半 ✓）', (() => {
		const v = resolveLocalConst(":: Game Tables [script]\nconst MECH = { a: 1, b: [2] };\n", 'Game Tables', 'MECH');
		return v && v.a === 1 && Array.isArray(v.b) && v.b[0] === 2;
	})());
	// `#794` 第 32 例（复核席 `#819` 记的验收项 (b) ✓）：**驱动那条缝** ⇒ 覆盖 `fileText` 那条路径。
	// 为什么只能这样做：三个故事都翻面后，"手写契约 ＋ `() => 局部常量`"**没有活样本** ✗ ⇒
	// 靠"往仓里塞夹具文件"会污染工作区 ✗ ⇒ 只有把分类体抽成函数（`fileText` 是**形参** ✓）才能无文件覆盖 ✓。
	// ⚠️ 夹具**自带** `window.Sg = { story: {} };` ✓ —— 否则 `resolveLocalConst` 跑它时 `Object.assign` 抛错 ⇒ 落 catch ⇒ 判 B ✗（**量不出真因** ✗，我踩过 ✓）。
	t('缝 `classifyContractText`：`mechanics: () => MECH` ⇒ 经 `fileText` 解析后**落 A**（值也取到 ✓）', (() => {
		const src = [":: Game Tables [script]", "window.Sg = { story: {} };", "const MECH = { a: 1, b: [2] };", "Object.assign(window.Sg.story, { mechanics: () => MECH });", ""].join('\n');
		const { rows } = classifyContractText({ fileText: src });
		const r = rows.find((x) => x.name === 'mechanics');
		return !!r && r.bucket === 'A' && r.spec?.value?.a === 1 && Array.isArray(r.spec.value.b) && r.spec.value.b[0] === 2;
	})());
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log(`\n✔ 自证通过（${n} 例：8 个 kind 形状 ＋ A/B/C/D 四桶分界 ＋ 两条捕获组陷阱回归 ＋ 成员切分）`);
};

const isMain0 = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain0 && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

import { hatchFiles } from './lib/host/hatches.mjs';
export { hatchFiles };

/** **行首**的生成标记才算（与 K4 的 `hasMarker` 同口径：注释里提到该词的文件不是产物）。 */

const main = () => {
	const argOf = (name, dflt) => { const h = process.argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(name.length + 3) : dflt; };
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/classify-contract.mjs <slug> [--json]'); process.exit(2); }
	const file = join(ROOT, argOf('from', `stories/${slug}/15-tables.twee`));
	// `#794`：**输入缺失 ⇒ 单独一条** ✗ —— 实测：不存在的路径原先被报成"里面**找不到 Sg.story 成员**" ✓，
	// 方向对（不静默 ✓）但**归因错** ✗（读的人会去查契约 ✗，而真因是**文件不在** ✓）⇒ 与 `extract-story` 同口径 ✓。
	if (!existsSync(file)) { console.error(`✗ 读不到输入：${file}（文件不存在）—— "读不到输入"不许当"没有故事逻辑"`); process.exit(1); }
	// 契约源＝**手写的**数据面文件（`15-tables.twee`）＋ 登记过的手写逃生舱文件。
	// ⚠️ 已翻面的故事里 `15-tables.twee` 是**产物**（带生成标记）⇒ **不能**分类它：发射后的代码形状会得到
	// "假欠账"（实测：`template` 那种被判 B）⇒ 那种情况下只剩逃生舱文件是手写源（与 K4 同一口径）。
	const fileText = existsSync(file) ? readFileSync(file, 'utf8') : '';   // 数据面文件的**原文** ✓
	// ⚠️ **重新钉住**（实测回归 ✗）：下面 `resolveLocalConst(fileText, …)` 用它 ✓ —— 我在搬 core 时
	//   把这行切掉了 ✗ ⇒ 那条路径一旦走到就是 `ReferenceError` ✓；而**没有任何测试走那条路径** ✗
	//   （只有"手写契约里出现 `() => 局部常量`"才触发 ✓，三个故事都翻面后就没有活样本了 ✓）
	//   ⇒ 所以它是**静默回归** ✓：靠人量出来 ✓，靠 CI 量不出来 ✗。
	const tableSrc = existsSync(file) && !hasGeneratedMarker(fileText) ? fileText : '';
	if (!tableSrc) console.log(`  · ${slug}：\`15-tables.twee\` 已是**产物**（带生成标记）⇒ 契约面已由 \`data/\` 承载；本次只判**手写逃生舱文件** ✓`);
	const hatchFilesOf = hatchFiles(slug);
	const hatchTexts = hatchFilesOf.map((f) => readFileSync(f, 'utf8'));
	// `#794`：分类体已抽成**可单测的缝** ✓ `classifyContractText({ fileText, hatchTexts })`（见文件中部 ✓）。
	const { sites, stray, members, rows, hatchMembers } = classifyContractText({ fileText, siteText: tableSrc, hatchTexts });
	if (!members.length) { console.error(`✗ ${file} 里找不到 Sg.story 成员（读不到输入不许当"没有故事逻辑"）`); process.exit(1); }
	if (stray.length) { console.error(`✗ ${file} 里还有**未被识别的** Sg.story 写法（${stray.join(' · ')}）—— 多站点合并只认 Object.assign 形态，其余必须点名而不是静默漏掉`); process.exit(1); }
	console.log(`（站点 ${sites.length} 处：${sites.map((s2) => s2.members.length + ' 名成员').join(' ＋ ')}${hatchTexts.length ? ` · 含手写逃生舱文件 ${hatchFiles(slug).map((f) => f.split('/').pop()).join('、')}` : ''}）`);
	// **局部常量 ⇒ 成员名**（`#787`）：`mechanics: () => MECH` 这类成员把局部常量放进了契约 ⇒ 其它成员引用它时才可表达。
	// （此段已归入上面那条**可单测的缝** `classifyContractText` ✓ —— 见文件中部 ✓）
	const bucket = (b) => rows.filter((r) => r.bucket === b);
	console.log(`══ 契约分类（${slug}）：${rows.length} 个成员 ══`);
	for (const r of rows) {
		const mark = { A: '✓', B: '~', D: '↓', C: '✗' }[r.bucket];
		const tail = r.bucket === 'A' ? r.kind
			: r.bucket === 'B' ? `需要扩展 ${r.kind}（${r.why}）`
			: r.bucket === 'D' ? `可下沉：${r.sink}`
			: `逃生舱候选：${r.why}`;
		console.log(`  ${mark} ${r.name.padEnd(18)} ${tail}`);
		if (r.bucket !== 'A') console.log(`      源码：${r.src.replace(/\s+/g, ' ').slice(0, 150)}`);
	}
	console.log(`\n  汇总：可直接表达 ${bucket('A').length} · 需声明式扩展 ${bucket('B').length} · 可下沉引擎 ${bucket('D').length} · **真逃生舱候选 ${bucket('C').length}**`);
	if (bucket('B').length || bucket('D').length) console.log(`  （B＝待补的声明式 kind；D＝待下沉的引擎能力 ⇒ 都**不是**逃生舱）`);
	if (process.argv.includes('--json')) console.log('\n' + JSON.stringify({ slug, members: rows }, null, '\t'));
	// `--propose[=<path>]`：把**全部可数据化的成员**写成故事包的 `data/contract.json`（生成物 ⇒ 单一真源）。
	// 只要还有非 A 成员就 **fail-loud**（点名）—— 提案必须完整，不许悄悄少写一半（那会让产物静默缺成员）。
	const proposeArg = process.argv.find((a) => a === '--propose' || a.startsWith('--propose='));
	if (proposeArg && !tableSrc) { console.error(`✗ ${slug} 的 \`15-tables.twee\` 已是**产物** ⇒ 没有什么可提案的（数据面已由 \`data/contract.json\` 承载）`); process.exit(1); }
	if (proposeArg) {
		const aRows = rows.filter((r) => !hatchMembers.has(r.name));   // 逃生舱成员不进提案（它们住手写件）
		const bad = aRows.filter((r) => r.bucket !== 'A');
		if (bad.length) {
			console.error(`✗ 无法提案：${bad.length} 个成员不是 A 桶、且**没住进**登记过的手写逃生舱文件 ⇒ ${bad.map((r) => `${r.name}(${r.bucket})`).join(' · ')}`);
			console.error('  生成物只装得下 A 桶 ⇒ 非 A 成员必须移到手写件并在 `editor/escape-hatch.json` 的 `hatchFiles` 登记（否则翻面就是**静默丢成员**）。');
			process.exit(1);
		}
		const out = proposeArg.includes('=') ? proposeArg.split('=')[1] : null;      // 显式路径 ⇒ 包外/自定义（不属"故事文件" ✓）
		const payload = {
			section: 'StoryBindings',
			note: '分类器自动提案（`--propose`）：本文件是**生成物**，请勿手改；要改成员形状改故事源或 classifier 的 kind 集合。',
			members: aRows.map((r) => ({ name: r.name, kind: r.kind, ...(r.spec ?? {}) })),
		};
		if (out) {
			mkdirp(dirname(out));
			writeText(out, JSON.stringify(payload, null, '\t') + '\n');
			console.log(`✔ 提案已写出：${out}（成员 ${aRows.length} 个 ⇒ 全部 A 桶）`);
		} else {
			const [wrote] = writeStoryPackage({ slug, data: { 'contract.json': payload }, io: NODE_IO });
			console.log(`✔ 提案已写出：${wrote}（成员 ${aRows.length} 个 ⇒ 全部 A 桶）`);
		}
		process.exit(0);
	}
	// 非 A 的全部**点名**（不是静默跳过）：B 是"schema 该补"，C 是"要么下沉引擎、要么进逃生舱清单"
	process.exit(bucket('C').length ? 1 : 0);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
