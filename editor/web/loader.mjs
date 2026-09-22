// WebUI（`#761` P1 第一片）：**故事包加载** —— 浏览器侧起手件。
//
// 口径依据（`docs/superpowers/specs/editor-pivot.md` §8 第 1 条，2026-09-17 **已裁**）：
// **静态优先** —— 打开 `editor/web/index.html` 即可用，**不经服务端**；唯一的判据是
//「**是否真有第二个消费者**」（现在没有 → 不建服务端；等发布期真有需求再谈）。
//
// 为什么这里**可以**是浏览器安全的：本文件**零宿主依赖**（无 `node:*`、无宿主全局），
// 而它要用的能力早就按**注入**形状建好了 —— `lib/core/story.mjs` 的 `readStoryPackage({slug, io})`
// 吃的就是"`io.readText(path)`"这一件 → 浏览器侧只要把**用户选的文件**映射成 `io` 即可。
// → 这正是「一个内核 · 三种宿主」里 *内核浏览器安全* 那条口径的**第一个真实用途**。

import { packageFiles, readStoryPackage, DATA_FILES } from '../lib/core/story.mjs';
import { paragraphsOf } from '../lib/core/text.mjs';   // 车道 E · A 片（`#215` 报备 `18504548`）：段落切分**复用 core**（页内不写第二份）

/** 浏览器文件条目（`{ name, webkitRelativePath?, text()}` → 只读）判据：包内**相对路径**的
 * 各种写法都要能对上 —— 目录选择器给的是 `minimal-demo/data/tables.json`（相对于选中目录的**上一级**），
 * 而 core 要的是 `stories/minimal-demo/data/tables.json` → 按**后缀**匹配最稳（也容忍只给裸名）。
 * 为什么不用 `path` 库：那是宿主能力（`node:path`）→ 浏览器侧自己按 `/` 切（包内路径是 POSIX 风格）。 */
export const pathCandidates = (rel, { slug } = {}) => {
	const p = String(rel ?? '').replace(/\\/g, '/').replace(/^\.?\//, '');
	const base = p.split('/').pop() ?? '';
	const out = new Set([p, base]);
	if (slug) {
		// 三种真实形态都要能对上：
		// ① `stories/<slug>/data/x.json`（core 的形状）→ 去前缀 → `data/x.json`
		// ② `<slug>/data/x.json`（**选中故事目录**时，目录选择器给的就是这个）→ 去 `<slug>/` → `data/x.json`
		// ③ `data/x.json`（选中 `data/` 之下）
		const a = `stories/${slug}/`;
		const b = `${slug}/`;
		if (p.startsWith(a)) out.add(p.slice(a.length));
		if (p.startsWith(b)) out.add(p.slice(b.length));
		out.add(`${slug}/${p}`);
		out.add(`stories/${p}`);
	}
	return [...out].filter(Boolean);
};

/** 把"用户选的文件列表"映射成 core 要的 **io**（只有读，符合 `need(io, 'readText')`）。
 *注意：映射必须**可核**：命中不上的路径 → **响亮报错**（不是返回空串 → 那会让"缺文件"伪装成"空内容"，
 * 而那正是本仓最贵的一类缺陷）。 */
export const filesToIo = (files = [], { slug } = {}) => {
	const byPath = new Map();
	for (const f of files) {
		for (const k of pathCandidates(f?.webkitRelativePath ?? f?.name, { slug })) if (!byPath.has(k)) byPath.set(k, f);
	}
	const misses = [];
	const readText = (path) => {
		for (const k of pathCandidates(path, { slug })) {
			const f = byPath.get(k);
			if (f) return typeof f.text === 'function' ? f.text() : String(f.text ?? '');
		}
		misses.push(path);
		throw new Error(`包的某件不在所选文件里 ✗：\`${path}\`（缺文件不许当空内容 ✗）`);
	};
	return { readText, misses, paths: [...byPath.keys()] };
};

/** **包内 twee 源**（车道 E · A 片 —— `{ sources, passages}`）：**只取用户已选中的**，
 * 路径**规范成包内形**（`stories/<slug>/…` ——注意：必须是这个前缀，否则 `faceOf()` 会把故事段判成机制面）。
 * · `sources` ＝ `[{ file, text}]`（**raw 原文** —— 顺序＝**按 file 排**再看文件内出现序，可复现；**同名/跨文件不吞不并**）；
 * · `passages` ＝ `[{ name, text, file}]`（`text` ＝ **去注释源文**，与 `scripts/audit/context.mjs` 的
 * `passageSrc` **同口径** —— `--settle` 那类判据吃它；**文件粒度不够** → 由 core 的 `paragraphsOf()` 给段落粒度）。
 *注意：**只读**（不写盘）；**没选到的文件就当没选到**（不静默补空）。 */
export const sourcesOf = ({ files = [], slug } = {}) => {
	const pick = new Map();
	for (const f of files ?? []) {
		const rel = f?.webkitRelativePath ?? f?.name ?? '';
		const canon = pathCandidates(rel, { slug }).find((k) => k.startsWith(`stories/${slug}/`) && k.endsWith('.twee'));
		if (canon && !pick.has(canon)) pick.set(canon, f);
	}
	const sources = [...pick.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([file, f]) => ({ file, text: typeof f?.text === 'function' ? f.text() : String(f?.text ?? '') }));
	const passages = sources.flatMap(({ file, text }) => paragraphsOf({ file, text }).map((s) => ({ name: s.passage, text: s.body, file })));
	return { sources, passages };
};

/** **一片可核**的加载：用户选的文件 → 故事包摘要（**纯** —— 不碰 DOM，所以单测不需要 jsdom）。
 * 返回面只给"编辑器要先看见的东西"：包内文件名、数据面各文件、契约成员名与 kind（**不**在此判桶 →
 * 分类是内核的事，本件只搬数据）。 */
export const loadPackage = ({ slug, files, io } = {}) => {
	const theIo = io ?? filesToIo(files, { slug });
	const pkg = readStoryPackage({ slug, io: theIo });
	const data = pkg.data ?? {};
	const src = sourcesOf({ files, slug });
	const members = (data['contract.json']?.members ?? []).map((m) => ({
		name: m.name,
		kind: m.kind,
		docs: m.docs ?? '',
	}));
	return {
		slug,
		meta: pkg.meta ?? null,   // core 返回的是 `{ slug, meta, data}`（不是 `manifest` —— 写错会被测例当场点名）
		//注意：`null` 与"有数据"**不是一回事**：core 对"文件中没有/坏 JSON"一律记 `null`（"空表/null 是合法数据集"）
		// → 显示层要分开两列（`dataFiles`＝真带了数据；`emptyFiles`＝给了名但没有内容）—— 否则会报"3 个文件都在"。
		dataFiles: DATA_FILES.filter((n) => data[n] !== undefined && data[n] !== null),
		emptyFiles: DATA_FILES.filter((n) => data[n] === null),
		tables: data['tables.json'] ?? null,
		rules: data['rules.json'] ?? null,
		members,
		//注意：**原样带上 `data`**：页内编译（`compile.mjs`）要的就是它 —— 只给"摘要"会让下游
		// 自己去猜文件（那就会长成第二份读法）。
		data,
		// 车道 E · A 片（`#215` 报备 `18504548`）：**段落源取件面**（两个消费者＝页内读侧 ② 读数 ＋ 发起者的 `--settle`）。
		//注意：只有**给了 files** 这一路取得到（调用方直接喂 `io` → 没有文件对象 → 如实回空 ＋ `sourcesAvailable:false`，不假装）。
		sources: src.sources,
		passages: src.passages,
		sourcesAvailable: Boolean(files?.length),
		missing: theIo.misses ?? [],
	};
};

/** 供 DOM 侧显示的一行摘要（**纯** → 可单测；DOM 只负责把它塞进元素）。 */
export const summaryLines = (summary) => [
	`故事包：${summary.slug}`,
	`数据面文件：${summary.dataFiles.join('、') || '（无）'}`,
	`契约成员：${summary.members.length} 个`,
	...summary.members.slice(0, 20).map((m) => `  · ${m.name}（${m.kind}）`),
	...(summary.members.length > 20 ? [`  …共 ${summary.members.length} 个`] : []),
];

/** 包编目（供 UI 提示"该选哪些文件" —— 提示**从内核取**，不手抄）。 */
export const wantedPaths = (slug) => {
	const p = packageFiles(slug);
	return [p.manifest, ...DATA_FILES.map((n) => p.dataFile(n))];
};
