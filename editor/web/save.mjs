// WebUI（`#761` P1 第三片）：**写包** —— 把"改过的故事包"经**唯一写路**变成可下载的文件 ✓。
//
// 复核席裁定的硬判据（照做 ✓）：
//  ① **必须走 `writeStoryPackage`** ✓ —— **不得新增第二个写入者** ✗（这正是 K6 ②／L1「单一写路」盯的那条 ✓）；
//  ② 浏览器侧只把它映射成**同一个 io 接口**（`writeText`／`mkdirp` ✓）⇒ 本件**零宿主** ✓；
//  ③ 验收读数＝**同假 io 下与 `node editor/compile-story.mjs` 的产物逐字节同** ✓。
//
// ⚠️ 为什么浏览器侧的"写"不是 fs ✗：静态页**不能落盘** ✓ ⇒ 这里的"写"＝把文本**收集起来**，
//   由页面交给浏览器下载 ✓（`asDownloads` ✓）。⇒ 于是"写"这条腿在**验收里也是可测的** ✓：
//   把收集器 io 里的文本与**仓内 artifacts** 逐字节比 ✓（`test/web-save.mjs` ✓）。

import { writeStoryPackage, packageFiles, DATA_FILES } from '../lib/core/story.mjs';

/** **收集器 io**（浏览器/测试侧同一件 ✓）：把 `writeText` 的入参收起来 ⇒ 无 fs ✓、无 host ✓。
 *  只实现 `writeStoryPackage` 真正会用到的件 ✓（多实现反而是第二份语义 ✗）。 */
export const collectIo = () => {
	const files = new Map();
	const made = [];
	return {
		files,
		made,
		writeText: (path, text) => { files.set(path, String(text)); },
		mkdirp: (path) => { made.push(path); },
		// 读侧（`writeStoryPackage` 若问"在不在" ✓）：收集器里没有 ⇒ 一律"不在" ✓（不假装有 ✗）
		exists: () => false,
	};
};

/** 把（可能被改过的）故事包**经唯一写路**写成一组文件 ✓。
 *  `twee` 可选 ✓（给了就写生成物 ✓ —— 由 `compileInPage` 产 ✓，本件**不**自己编译 ✗，免得两份编译 ✓）。 */
export const savePackage = ({ slug, data = {}, twee = {} } = {}) => {
	const io = collectIo();
	const written = writeStoryPackage({ slug, data, twee, io });
	if (!written.length) throw new Error(`写包**一件都没写出** ✗（${slug}）—— 空产物不许当通过 ✗`);
	const rel = (p) => String(p).replace(/^.*\/stories\//, 'stories/');
	return {
		slug,
		written: written.map(rel),
		files: Object.fromEntries([...io.files].map(([p, t]) => [rel(p), t])),
		dirs: io.made.length,
	};
};

/** 供页面交给浏览器的下载清单（**纯** ✓ ⇒ 可单测 ✓）。文件名只取末段 ✓（下载不需要路径 ✓）。 */
export const asDownloads = (saved) =>
	Object.entries(saved.files).map(([path, text]) => ({ name: String(path).split('/').pop(), path, text }));

/** 供显示的一行摘要（**纯** ✓）。 */
export const saveSummary = (saved) => [
	`写出：${saved.written.length} 件`,
	...saved.written.map((p) => `  · ${p.split('/').pop()}（${saved.files[p].length} 字节）`),
];

/** 包编目（提示用 ✓ —— 从内核取 ✓ 不手抄 ✗）。 */
export const expectedDataFiles = (slug) => DATA_FILES.map((n) => packageFiles(slug).dataFile(n));
