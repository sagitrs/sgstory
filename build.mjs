import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { allSourceFiles } from './scripts/module-order.mjs';
import { genNeeds } from './scripts/lib/gen-needed.mjs';   // `#1192`：该不该重编这份故事的产物
import { execSync } from 'node:child_process';
import * as _crypto from 'node:crypto';   // 输入指纹（sha256）
import vm from 'node:vm';   // `#1176`：生成件脚本段的解析器（只解析不执行）
import { join, dirname, relative, isAbsolute } from 'node:path';
import { scopedFiles, checkRegistration, isStoryPassageMd } from './scripts/module-order.mjs';
import { valueRefExpand, renderLinksOf, parseFrontMatter, parseMdPassages, parseTweePassages, assemblePassages, FORBIDDEN_BUILTINS, duplicateProblems } from './editor/lib/core/passages.mjs';
import { scriptSyntaxProblems } from './editor/lib/core/segment-syntax.mjs';
import { generatedFamilyProblems, isGeneratedFamily } from './editor/lib/core/generated-family.mjs';   // `#1350`：指纹写入也要用   // `#1185` // `#1176`
import { valueTerms, engineLabels } from './editor/lib/core/vocab.mjs';
import {
	ROOT, storySlugs, readStory, storyHtml, shelfHtml, DEFAULT_SLUG,
	resolveStoryRel, absPath,   // `#1267` 符号名 → 真实路径
	DIST_DIR, STORIES_DIR,   // `#1267` 故事根口（产物随根 → 跑仓外故事不在引擎仓拉屎）
	audienceOf,
	FONT_PREFIX_FROM_ROOT, FONT_PREFIX_FROM_STORY,
} from './scripts/dist-paths.mjs';

const SRC = 'src';

// `#761` P1 六片A-2（复核席裁定的 (α1)）：**两个窄口** —— 每个只有一个消费者（A-2 的读数）。
// ① `--with-rules=<file>`：构建时用**指定的那份**规则文本代替该故事的 `17-rules.twee`
// → "改过的故事"由**构建脚本**产出（我不另写一份合并逻辑）。
// ② `--story-out=<path>`：把该故事页写到**指定路径** → **不覆盖真 `dist/`**
// —— 复核席指出的危险：`dist/` 虽被 gitignore 但**测试读它** → 覆盖它就是在"探针污染被测对象"（dist 版）。
// 默认（不带旗标）路径**逐字节不变**（纯增口）。
const flagOf = (name, dflt) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : dflt;
};
const WITH_RULES = flagOf('with-rules', null);
const STORY_OUT = flagOf('story-out', null);
if (STORY_OUT && !WITH_RULES) throw new Error('--story-out 只与 --with-rules 配用 ✓（本口只为"改过的故事"的探测存在 ✓）');

mkdirSync('build', { recursive: true });
mkdirSync(DIST_DIR, { recursive: true });   // `#1267` 随根
// `#1350` 后续笔：产出时写**输入指纹** `<DIST_DIR>/INPUTS.json`（件 → 内容 sha256）——
// 用途：新鲜度判据**比指纹**（✗ 不比 mtime）⇒ 免把"**checkout 刷新 mtime**"读成"源变新了" ✗
//（实测：本地 rebase/checkout 会把 `src/*.twee` 的 mtime 推后 ⇒ 靶产物恒"看起来旧" ✗）
const writeInputsFingerprint = (files) => {
	try {
		const { createHash } = _crypto;
		const out = {};
		for (const f of files) {
			try { out[f] = createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16); } catch { /* 读不到就不记 */ }
		}
		writeFileSync(join(DIST_DIR, 'INPUTS.json'), JSON.stringify(out, null, 1) + '\n');
	} catch { /* 指纹只是加固 ⇒ 写失败不该挡构建 */ }
};

// #319：加载顺序**显式**声明在 scripts/module-order.mjs（不再靠文件名前缀隐含）。
// `#893` 守卫**分两层**：① **引擎件**（`src/**`）必须全在 `ORDER` 里（它们的先后是**全局**的）；
// ② **故事自己的件**（`stories/<slug>/**`）必须全在**该故事自己的清单**里 → 顺序由清单给
// → **新建故事不必改代码**（原来一律要求 ⊂ ORDER → 新故事必改代码）。
// 两层的**登记语义都没丢**：新件仍须**显式登记**，只是登记处换成**它自己的清单**。
const slugs = storySlugs();
const STORIES = STORIES_DIR;   // \`#1128\` 产物前置用（编译器 out 路径）
// `#1128`：**产物前置**——干净树上产物 twee 不存在（移出 git）→ 构建前先从源（data/*.json）编译
//（票面约束：`git clean` 后的干净树必须能重建全套产物 ——断点补在此；产物在=幂等跳过 已在=不重编 保持逐字节稳定）。
{
	const { execFileSync } = await import('node:child_process');
	for (const slug of slugs.filter((x) => !x.startsWith('__'))) {   // #1128：临时夹具（__ 前缀）不参与产物前置
		// `#1192`：判据从"固定五名清单"改成**按该故事清单声明的产物集**（manifest 驱动，缺哪件补哪件）。
		// 旧写法对只产子集的故事恒真，于是每次构建都全量重编；后果不只是浪费，更隐蔽的一层是**注入与陈旧会被
		// 静默覆盖**（守卫类判据在这些故事上试牙会得到假绿或读成"没牙"）。判据本体在 `scripts/lib/gen-needed.mjs`。
		const manifest = join(STORIES, slug, '00-story.json');
		let declared = [];
		try { declared = JSON.parse(readFileSync(manifest, 'utf8')).files ?? []; } catch { declared = []; }
		const dataDir = join(STORIES, slug, 'data');
		const dataFiles = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => f.endsWith('.json')) : [];
		const need = genNeeds({
			declared,
			family: (f) => isGeneratedFamily(f),
			exists: (f) => existsSync(resolveStoryRel(f)),   // `#1267`：清单 `files` 是**符号名**（`stories/…`）→ 判存在也过换算
			dataFiles,
		});
		if (need.needed.length) {
			execFileSync('node', ['editor/compile-story.mjs', slug, `--out=${join(STORIES, slug)}/`], { stdio: 'pipe' });
			console.log(`  #1128 产物重建：${slug}（${need.why}）`);
		}
	}
}
const files = allSourceFiles();   // #458 切片C：源文件发现走**单一权威**（`src/**` ＋ `stories/**`）；`#1128`：**在产物前置之后取**（前置会补出产物 twee → 清单/ORDER 检查须看补完后的面 ——领队裁定 5758307279）
if (files.length === 0) {
	console.error('src/ 下没有找到 .twee 文件');
	process.exit(1);
}
// `#1261` 大裁剪：**零故事是合法状态**（仓内不再带 demo 故事；故事内容随 `#1163` 在 books 仓落地）。
// 此时只构建**引擎产物**（`dist/engine.html`），并跳过一切故事面（书架/逐故事产物）。
const engineOnly = slugs.length === 0;
if (engineOnly) console.log('  #1261 零故事模式：只产出引擎产物（dist/engine.html），跳过故事面');
const stories = slugs.map((slug) => ({ slug, ...readStory(slug) }));
{
	// `#893` 第三步：两层的**登记判据**走**单一权威**（`checkRegistration()` —— 与 `test/layering.mjs`／
	// `scripts/move-precheck.mjs` **同一把尺**）。此前这里内联了一份 → 三处各写一遍必漂移
	//（本仓实测过这一族：同一个"顺序/登记"口径在两处各算一次 → 改一处、另一处静默失效）。
	// 判据逐条（安全网一条不撤）：**引擎件** ⊂ `ORDER` ／**故事件** ⊂ **它自己的清单** ／
	// `ORDER` 里的文件必须存在 ／清单列出的文件必须存在 ／`ORDER` 里的非引擎孤儿。
	const reg = checkRegistration({
		sources: Object.fromEntries(files.map((f) => [f, ''])),
		manifests: stories.map((s) => ({ slug: s.slug, files: s.files ?? [] })),
	});
	if (reg.length) {
		for (const p of reg) console.error(` [${p.code}] ${p.msg}`);
		console.error(' 登记不通过：**引擎件**必须进 ORDER／**故事件**必须进它自己的清单（两层的登记语义都没丢）');
		process.exit(1);
	}
}

// 合并顺序由 ORDER 决定（清单只筛归属）；引擎文件在前（它们本身就在 ORDER 前部）
// #460：合并口径与门（`scripts/audit/context.mjs`）**共用同一权威** `scopedFiles()`
// `#576`：编译前剥掉 `/% %/` **twee 块注释**——它们是给作者的，SugarCube 渲染时本就不输出，
// 但会被原样写进 `dist/stories/<slug>/index.html`（实测默认故事页 ≈ +12KB）并进字体子集。
// 只剥 twee 块注释：`[script]` 段里的 JS 行注释（`//`）是**代码**，不能动。
const stripTweeComments = (text) => String(text).replace(/\/%[\s\S]*?%\//g, ' ');

// `#1114` 片 2b-2b-0：**散文层源接线** —— `passages/` 下的 md 由拼装层转成 twee。
// 接线点＝**构建链读源那一处**（`#1114` Q3 裁定：拼装是构建链的一步，不新增“门要读的产物树”）；
// 段序仍由 `files` 派生（Q1 裁定：唯一清单与唯一顺序权威）。
//注意：**fail-loud 面＝四类**（与实现一致 —— 不许“承诺了但不做”）：
// ① 禁则（`FORBIDDEN_BUILTINS`）② 悬空引用 ③ **重名段（跟源多重集）** ④ 取值 `{{}}` 未声明面。
// ③ 的理由（可复算）：`build` **单独跑**的地方不止一处（`ci.yml` 的 build 步／`viewport-smoke.yml`／本地），
// 且实测跟文件同名时 `build` 全静默、**产物静默丢掉后一份**（第二段的正文不在产物里）。
// 词汇门的 `D1` 虽覆盖**所有故事**的源（其注释明写"不受 audience 豁免"），但只在 **test 段**跑 →
// 构建自己必须说话，不能靠门兜。判据＝同一函数（`duplicateProblems`），门与 build 不可能漂。
const ENGINE_LABELS = engineLabels(allSourceFiles(['src']).map((f) => readFileSync(f, 'utf8')));
const termsOf = (slug) => {
	// `#1269` A 类（第 1 处）：原写**裸相对路径**（cwd＝引擎仓根）→ 零故事／外根下
	// `existsSync` 恒假 → 静默走 `{ members: [] }` → **词汇面判据静默变松**（不报错、也不说
	// "未判"，但一个契约成员都不判）—— 比崩更险：崩会拦人，静默空判让人以为判过了。
	// 三态分开：**读到 → 判** ／ **读不到 → 出声** ／ **确实为空 → 可空集**。
	const p = absPath(`stories/${slug}/data/contract.json`);
	if (!existsSync(p)) {
		throw new Error(`读不到契约件 ${p}（故事 ${slug}）⇒ 词汇面**未判**：请先跑 build 或检查故事根`
			+ `（原实现会静默退化为空契约 ⇒ 判据变松而无人知道；#1269）`);
	}
	const contract = JSON.parse(readFileSync(p, 'utf8'));
	return valueTerms({ contract, labels: ENGINE_LABELS });
};
const SEG_HEAD = /^::\s+(.+?)\s*(?:\[[^\]]*\])?\s*$/gm;
/** 该故事**合法段名全集**（twee 段名 ∪ md 段名）——md 段可以引用同故事的 twee 段（两源共存期）。 */
const knownNamesOf = (slug, files) => {
	const names = new Set();
	for (const f of files) {
		if (isStoryPassageMd(f)) { const n = String(parseFrontMatter(readFileSync(resolveStoryRel(f), 'utf8')).meta.passage ?? '').trim(); if (n) names.add(n); continue; }
		for (const m of readFileSync(resolveStoryRel(f), 'utf8').matchAll(SEG_HEAD)) names.add(m[1].trim());
	}
	return names;
};
// `#1350` 片 3：段落数据读取（**一处**；拼装层与本判据共用同一份 ⇒ ✗ 不各读一份）
const PDATA = new Map();
const pdataOf = (slug) => {
	if (PDATA.has(slug)) return PDATA.get(slug);
	let v = null;
	try { v = JSON.parse(readFileSync(absPath(`stories/${slug}/data/passages.json`), 'utf8')); } catch { v = null; }
	PDATA.set(slug, v);
	return v;
};

const assembleOne = (slug, f, known) => {
	//注意：`#1114` 2b-2b：tags **必须用 core 解析好的数组** —— 本处先前直接传 `meta.tags` 原串（`"[]"`）
	// → 拼装层 `p.tags? \` [${p.tags}]\`: ''` 把它当成真值 → 产物段头变 `:: 段名 [[]]`
	// → 段名不再等于 `passage` 值 → 第三格判「拼装产物缺段」（实测踩到）。
	// → 改用 core 的 `parseMdPassages`（**同一权威**）：name/tags/body 都已归位。
	const [p0] = parseMdPassages(readFileSync(resolveStoryRel(f), 'utf8'), f);
	const name = String(p0?.name ?? '').trim();
	if (!name) { console.error(`✗ ${f}：front-matter 缺 \`passage\`（段名权威在本字段 ✓）`); process.exit(1); }
	const { twee, problems } = assemblePassages({
		//注意：`#1114` 2b-2b：**twee 路径剥注释、md 路径也要剥** —— 否则 `/% … %/` 原样入 dist
		//（本函数上方的 `stripTweeComments` 注释就写着这条）→ 实测：PRE 0/34 → POST 23/34 且 body 变长。
		passages: [{ name, tags: p0.tags ?? [], body: stripTweeComments(p0.body), path: f }],
		known, forbidden: FORBIDDEN_BUILTINS, terms: termsOf(slug),
		// `#1350` 片 3：把**该故事**的段落数据交给拼装层（它按**段名**取本段 `params`/`slot`/`args`；
		// 片 2 已实现展开与点名）⇒ 这里只是"接通"。缺该文件 ⇒ `null`（旧形态逐字不变 ✓）。
		data: (() => { try { return JSON.parse(readFileSync(absPath(`stories/${slug}/data/passages.json`), 'utf8')); } catch { return null; } })(),
	});
	if (problems.length) { console.error(`✗ 拼装失败：\n  ${problems.join('\n  ')}`); process.exit(1); }
	return twee.trimEnd();
};
const mergedOf = (s) => {
	const scoped = scopedFiles(s);
	const known = knownNamesOf(s.slug, scoped);
	return scoped.map((f) => {
		// `--with-rules`：只替换**规则文件那一份**（窄 —— 不动别的件）
		if (isStoryPassageMd(f)) return assembleOne(s.slug, f, known);
		// `#1267`：清单里的路径是**符号名**（`stories/…`）→ 真读盘前必须过 `resolveStoryRel`
		//（仓内＝恒等  ；仓外 → 指到真实故事根）。
		const text = (WITH_RULES && /(^|\/)17-rules\.twee$/.test(f)) ? readFileSync(WITH_RULES, 'utf8') : readFileSync(resolveStoryRel(f), 'utf8');
		return stripTweeComments(text).trimEnd();
	}).join('\n\n') + '\n';
};
const merges = new Map(stories.map((s) => [s.slug, mergedOf(s)]));

// `#1114` 片 2b-2b-0：**跟源同名段（多重集）** —— 构建路径自己算（不靠词汇门 `D1`）。
// 为什么必须在这里算：① `assembleOne` 是**逐文件**调用（每次只嗂一个 `{name}`）→ 跟文件同名它看不见；
// ② 第三格的 `got` 是 **`Set`**（去重）→ 两名段同名时 `missing=[]` → 绿；
// ③ 产物级断言查的是 front-matter **残留** → 同名两段的产物里没有那个串 → 绿。
// → 三条同时漏 → 产物里出现两个 `:: X`（一份构建里同名段只会活一个 → 后一个默默盖掉前一个）。
// 口径：**同一函数、同一措辞**（`core/passages.mjs` 的 `duplicateProblems` → 与词汇门 `D1` 一致）。
for (const s of stories) {
	// 口径：段名直接从**源文件**取（不从产物反推）→ 点名能到**具体文件**（“哪两份源”）。
	const segs = [];
	for (const f of scopedFiles(s)) {
		if (isStoryPassageMd(f)) {
			const n = String(parseFrontMatter(readFileSync(resolveStoryRel(f), 'utf8')).meta.passage ?? '').trim();
			if (n) segs.push({ name: n, path: f });
			continue;
		}
		for (const m of readFileSync(resolveStoryRel(f), 'utf8').matchAll(/^::\s+(.+?)\s*(?:\[[^\]]*\])?\s*$/gm)) segs.push({ name: m[1].trim(), path: f });
	}
	const dup = duplicateProblems({ passages: segs });
	if (dup.length) { console.error(`✗ 构建期重名（跟源同名段）✗：\n  ${dup.join('\n  ')}`); process.exit(1); }
}
// `#1114` 片 2b-2b-0 第三格：**`files` 里 md 的段名集合 ≡ 拼装产物段名集合**（防“有的段被静默吞掉”）。
// 为什么需要：拼接是“逐件 map＋join” → 任一环把 md 丢掉（返回空串/未进 scoped）都不会报错，
// 而产物里就少一段——那正是“绿≠覆盖”那一族 → 用**集合相等**把它变成 fail-loud。
for (const s of stories) {
	const scoped = scopedFiles(s);
	const mdNames = scoped.filter(isStoryPassageMd).map((f) => String(parseFrontMatter(readFileSync(resolveStoryRel(f), 'utf8')).meta.passage ?? '').trim()).filter(Boolean);
	if (!mdNames.length) continue;
	const got = new Set([...(merges.get(s.slug) ?? '').matchAll(/^::\s+(.+?)\s*(?:\[[^\]]*\])?\s*$/gm)].map((m) => m[1].trim()));
	const missing = mdNames.filter((n) => !got.has(n));
	if (missing.length) { console.error(`✗ 拼装产物缺段：${missing.join('、')}（\`files\` 登记了但产物里没有 ⇒ 静默吞段 ✗）`); process.exit(1); }
}


// `#1114` 片 2b-2b-0 产物级断言：**拼装产物不得含该段的 front-matter 精确串**。
// 为什么必须有（评审指出：段名集合格**抓不到**这个）：若有人把“照收原样拼”改回来，
// md 原文被当正文拼入 → **段名仍在**（`:: 段名` 是拼接前的行首？——不：原文里是 `passage: 段名`）
// → 段名集合照样相等 → 静默通过 → 刚修好的病无声回归（“绿 ≠ 覆盖”）。
//注意：判据必须**带具体值**：用 `'passage:'`／`^---$` 这种通用串会命中别的东西（引擎 API／分隔线）
// → 恒真、假读数（本片自纠过那一次）→ 这里用 `passage: <该段名>`（逐个 md 段）。
for (const s of stories) {
	const out = merges.get(s.slug) ?? '';
	for (const f of scopedFiles(s).filter(isStoryPassageMd)) {
		const { meta } = parseFrontMatter(readFileSync(resolveStoryRel(f), 'utf8'));
		const needles = [`passage: ${String(meta.passage ?? '').trim()}`];
		if (String(meta.tags ?? '').trim()) needles.push(`tags: ${String(meta.tags).trim()}`);
		const hit = needles.filter((n) => out.includes(n));
		if (hit.length) {
			console.error(`✗ ${f} 的 **front-matter 原文进了拼装产物**（命中：${hit.map((h) => `\`${h}\``).join('、')}）⇒ md 没经过拼装层（被当正文原样拼）✗ —— 这正是本片要根除的“build 绿、产物坏” ✓`);
			process.exit(1);
		}
	}
}

// `#1114` 2b-2b：**产物段 body ≡ 源 md 剥注释后的 body** （防「md 路径漏剥」回归 ）。
//    **不能写成“产物里不含 `/%`”** —— 那是**恒真格**（拼装输出已剥 → 永不含）：
// 实测（评审要的能假那一半）：往 md 里喂一个 `/% 探针注释 %/`  若只查“不含 /%”  `build rc=0` **不报** 。
//   改为**比对两个量**（产物段 body ↔ 源剥后的 body） 漏剥时两者不等  必红 。
for (const s of stories) {
	const out = merges.get(s.slug) ?? '';
	const got = new Map(parseTweePassages(out).map((p) => [p.name, p.body]));
	for (const f of scopedFiles(s).filter(isStoryPassageMd)) {
		const [p0] = parseMdPassages(readFileSync(resolveStoryRel(f), 'utf8'), f);
		const stripped = stripTweeComments(p0.body);
		// ★ `#1350` 裁定（乙）：期望面**不是"源逐字"** —— 拼装层**声明过的变换**（`{{名}}` 展开成取值宏）是要发生的。
		//   ⇒ 口径「**除声明的变换外**，散文逐字保留」；期望值 = 源经**同一套**变换（✗ 不各写一份替换）
		let want = stripped.trimEnd();
		try {
			const dseg = (pdataOf(s.slug) ?? {})[p0.name] ?? {};
			const linkSlots = (Array.isArray(dseg.links) ? dseg.links : []).map((l) => l && l.slot).filter(Boolean);
			const inbound = (() => {
				const all = pdataOf(s.slug) ?? {}; const acc = {};
				for (const seg of Object.values(all)) for (const l of (Array.isArray(seg?.links) ? seg.links : [])) {
					if (String(l?.to ?? '') !== String(p0.name)) continue;
					if (l?.args && typeof l.args === 'object') Object.assign(acc, l.args);
				}
				return Object.keys(acc).length ? acc : null;
			})();
			const r = valueRefExpand({ name: p0.name, body: stripped, terms: termsOf(s.slug),
				params: dseg.params ?? {}, slot: null, slots: [dseg.slot, ...linkSlots].filter(Boolean),
				args: (dseg.args && typeof dseg.args === 'object') ? dseg.args : inbound });
			// `#1350` 片 4：**链接渲染也是声明的变换** ⇒ 期望面要用**同一函数**再算一次
			//（✗ 不在本判据里另写一份替换 —— 那样两处必漂移）
			let body2 = String(r.body);
			const rl2 = renderLinksOf({ name: p0.name, links: dseg.links ?? [], present: dseg.present ?? null });
			for (const { slot: sl, text } of rl2.inline) {
				// ★ 双花括号；正则源＝`\{\{名\}\}`（✗ 别多一层转义 —— 与拼装层同一形态、同一病：我两处都犯过 ✗）
				const re2 = new RegExp('\\{\\{' + sl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}', 'g');
				body2 = body2.replace(re2, `\n\n${text}\n\n`);
			}
			if (rl2.tailBlock) body2 = `${body2.replace(/\s+$/, '')}\n\n${rl2.tailBlock}\n`;
			want = String(body2).trimEnd();
		} catch { /* 无段落数据 ⇒ 退回"逐字"口径（旧行为逐字不变 ✓） */ }
		if ((got.get(p0.name) ?? '').trimEnd() !== want) {
			console.error(`✗ ${f}（段「${p0.name}」）的**产物 body 与「源经受制裁变换后的 body」不等** ✗ ⇒ md 路径没剥注释（stripTweeComments 漏接 ✓）`);
			process.exit(1);
		}
	}
}

// `#1176`：生成件的脚本段必须能解析。编译命令里已在写出前拦一次；此处覆盖**树上已存在的**生成件，
//   使 `npm run build` 单独跑也拦得住（坏段会让引擎不启动，且症状隐蔽）。
{
	// `#1185`：家族谓词取单一权威（含 `00-meta.twee` —— 它有 `StoryIdentity [script]` 段，同样该被查）
	const genFiles = files.filter((f) => isGeneratedFamily(f));
	const gsrc = Object.fromEntries(genFiles.map((f) => [f, readFileSync(resolveStoryRel(f), 'utf8')]));
	const syntax = scriptSyntaxProblems({ files: gsrc, parse: (code) => { new vm.Script(code); } });
	if (syntax.length) {
		for (const p of syntax) console.error(`✗ [segment-syntax] ${p.file} 段「${p.passage}」：${p.why}`);
		console.error('✗ 生成件里有脚本段语法错误 —— 引擎会因此不启动，故构建失败');
		process.exit(1);
	}
}

// `#1185`：生成物家族的"产物必有源"守卫 —— 源删而产物残留  大声报并点名两侧。
//   为什么放在构建期：残留产物会被继续打进包，读者以为源还在；构建是唯一每个故事都必经的关口。
{
	const famSrc = Object.fromEntries(
		files.filter((f) => isGeneratedFamily(f)).map((f) => [f, readFileSync(resolveStoryRel(f), 'utf8')]));
	// `#1267`：标记载明的源是**符号名**（`stories/…`）⇒ 判存在也过换算（仓内恒等 ✓）。
	const famProblems = generatedFamilyProblems({ files: famSrc, exists: (rel) => existsSync(absPath(rel)) });
	if (famProblems.length) {
		for (const p of famProblems) console.error(`✗ [generated-family] ${p.path}：${p.why}`);
		console.error('✗ 生成物家族有"产物在而源不在"的成员 —— 请一并删产物或恢复源');
		process.exit(1);
	}
}

// `#1350` 后续笔：落输入指纹（在产物写完之后 ⇒ 它代表"本次产出对应的输入" ✓）
writeInputsFingerprint(allSourceFiles(undefined, { withStoryData: true }).filter((p) => !isGeneratedFamily(p)).map((p) => absPath(p)));

// ── 字体子集化（霞鹜文楷 → dist/fonts 外链 + preload）────────────────
// 收集**所有故事**的文本字符 + ASCII + 常用符号，子集化为 woff2 外链文件：
// HTML 首访更小（去 base64 膨胀），复访字体走缓存；dist 目录自包含可离线。
// 字体目录是**共享根路径** `dist/fonts/`（故事页用 `../../fonts/` 指过去）。
// 缺字体文件或 fonttools 时优雅跳过（系统字体回退）。
let fontCss = '';
const fontOK = existsSync('vendor/fonts/LXGWWenKai-Regular.ttf');
if (fontOK && existsSync('vendor/fonts/LXGWWenKai-Medium.ttf')) {
	const EXTRA = [
		String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 33 + i)), // ASCII 可见字符
		'，。、；：？！“”‘’（）《》〈〉【】〔〕—…·％＋－×÷＝℃°′″❤✔✘🎯✦☠☆★♦',
		'零一二三四五六七八九十百千万亿上中下左右前后',
	];
	const chars = new Set([...merges.values()].join('') + EXTRA.join(''));
	writeFileSync('build/font-chars.txt', [...chars].join(''), 'utf8');
	try {
		console.log('🔤 生成字体子集（LXGW WenKai → dist/fonts）…');
		// `#1267` 尾件⑤：字体产物落点必须**随根**（原来硬编仓内相对 `dist/fonts`
		// ⇒ 外根下把字体写进**引擎仓**、而故事页却在 `<外根>/dist/stories/…` 引 `../../fonts/`
		// ⇒ `test/multi-story` 的 P2 报"引用的字体文件不在 dist/fonts 里" ✗）。
		const fontOutDir = join(DIST_DIR, 'fonts');
		mkdirSync(fontOutDir, { recursive: true });
		execSync(`python3 scripts/subset_font.py build/font-chars.txt build/fontface.css ${JSON.stringify(fontOutDir)}`, { stdio: 'inherit' });
		fontCss = readFileSync('build/fontface.css', 'utf8');
	} catch (e) {
		console.warn('⚠️  字体子集化失败（缺 fonttools/brotli?），使用系统字体回退：' + e.message.split('\n')[0]);
	}
} else {
	console.warn('⚠️  vendor/fonts 缺少字体文件，使用系统字体回退');
}

// 字体外链注入：preload（与解析并行）+ @font-face（swap）；不再占 HTML 体积。
const injectFonts = (html, prefix) => {
	const preload = ['Regular', 'Medium']
		.map((w) => `<link rel="preload" href="${prefix}LXGWWenKai-${w}.woff2" as="font" type="font/woff2" crossorigin>`)
		.join('\n');
	// 注意：CSS 里的形式是 `url('fonts/…')`（引号在**前**）——按 `fonts/'` 切是错的（曾漏改 → 故事页深两层 404）
	const css = fontCss.replace(/url\('fonts\//g, `url('${prefix}`);
	return html.replace('</head>', `${preload}\n<style id="font-face" media="all">\n${css}</style>\n</head>`);
};

// #272：读屏语言——SugarCube 模板不带 lang；构建期无条件注入 <html lang="zh-CN">
const injectLang = (p) => {
	const html = readFileSync(p, 'utf8');
	if (!/<html[^>]*\slang=/.test(html)) writeFileSync(p, html.replace(/<html(?=[\s>])/, '<html lang="zh-CN"'));
};

// ── 清 `dist/stories/`（`#1015`／`#1035`）：**不 prune 会让已删故事的旧产物留在本地**
// → 本地验证面 ≠ 线上发布面（线上是干净 checkout）→ 本步让两者一致。
//注意：只清 `stories/`：`dist/fonts/` 是共享根路径，由字体步骤负责。
if (!STORY_OUT) rmSync(join(DIST_DIR, 'stories'), { recursive: true, force: true });   // `#1267`：随根（仓内＝ROOT/dist 恒等）   //注意：窄口模式（`--story-out`）只写一份 → 不清，免得把别人的产物删了
// ── 编译每个故事 → dist/stories/<slug>/index.html ─────────────────────
for (const s of stories) {
	if (STORY_OUT && s.slug !== DEFAULT_SLUG) continue;   // 窄口：只写目标那一份（其余故事不碰）
	writeFileSync('build/game.twee', merges.get(s.slug), 'utf8');
	//注意：**工具契约**（复核席对 `#874` 的裁定 (a)）：`--story-out` **绝对路径按绝对处理** ——
	// 原先一律 `join(ROOT, …)` → `path.join('/repo','/repo/dist/x')` ＝ `/repo/repo/dist/x`
	//（`join` **不**在绝对段重置 —— 那是 `resolve`）→ 构建落**荒处**、目标文件仍是**旧那份**
	// → 调用方以为写了、其实没写。修在**工具侧**（只修调用点 → 下一个调用者再踩）。
	const out = STORY_OUT ? (isAbsolute(STORY_OUT) ? STORY_OUT : join(ROOT, STORY_OUT)) : storyHtml(s.slug);
	mkdirSync(dirname(out), { recursive: true });
	// 用 extwee 编译：Twee + SugarCube 格式 → 单文件 HTML
	execSync(`npx extwee -c -i build/game.twee -o ${relative(ROOT, out)} -s vendor/format.js`, { stdio: 'inherit' });
	if (fontCss) writeFileSync(out, injectFonts(readFileSync(out, 'utf8'), FONT_PREFIX_FROM_STORY));
	injectLang(out);
}

console.log(`\n✔ 编译完成：${stories.length} 个故事（${stories.map((s) => s.slug).join('、')}）→ dist/stories/<slug>/index.html${fontCss ? ' ＋ 字体外链' : ''}`);
console.log('  浏览器直接打开即可游玩；也可用 Twine 2 编辑器导入继续可视化编辑。');

// ── 书架页（#441 切片④）：**读目录**生成 → 加故事只需加目录，不手写清单 ──────
// β2 起它就是 `dist/index.html`（进站门面）。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
{
	const rows = stories.filter((s) => audienceOf(s) === 'content')   // `#1035`：书架只列**内容故事**（内部件仍构建）
		.map((s) => `\t\t<li><a href="stories/${s.slug}/index.html">${esc(s.title ?? s.slug)}</a></li>`)
		.join('\n');
	const shelf = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>书架</title>
<style>
	:root { color-scheme: dark light; }
	body { margin: 0; padding: 2rem 1rem; font: 16px/1.7 system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; }
	main { max-width: 34rem; margin: 0 auto; }
	h1 { font-size: 1.4rem; font-weight: 600; margin: 0 0 1rem; }
	ul { list-style: none; margin: 0; padding: 0; }
	li { margin: 0 0 .75rem; }
	a { display: block; padding: .9rem 1.1rem; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: .6rem; text-decoration: none; color: inherit; }
	a:hover, a:focus-visible { border-color: currentColor; }
	a span { display: block; opacity: .7; font-size: .9rem; }
	p { opacity: .6; font-size: .85rem; }
</style>
</head>
<body>
<main>
<h1>书架</h1>
<ul>
${rows}
</ul>
<p>共 ${stories.length} 个故事。</p>
</main>
</body>
</html>
`;
	writeFileSync(shelfHtml(), shelf, 'utf8');
	console.log(`✔ 书架页：${relative(ROOT, shelfHtml())}（**上架** ${stories.filter((x) => audienceOf(x) === 'content').map((x) => x.slug).join('、') || '无'}；内部件不上架 ${stories.filter((x) => audienceOf(x) === 'internal').map((x) => x.slug).join('、') || '无'}）`);
}
