// `#1192`：构建期"该不该重编这份故事的产物"的判据（从 `build.mjs` 里抽出来成纯函数，便于钉住口径）。
//
// 原来的写法是一个**固定五名清单**（`15-tables.twee`、`17-rules.twee`、`16-notes-ch1.twee`、`18-chargen.twee`、
// `00-meta.twee`）配合 `.some((f) =>!existsSync(...))`。对**只产子集**的故事（例如 `minimal-demo` 只产
// `15-tables.twee`）这个判断**恒真**，于是每次构建都全量重编。它有两层后果：
// 一、浪费（每次构建都重编，但不危险）；
// 二、更隐蔽的一层：**注入与陈旧会被静默覆盖**。守卫类判据若在这些故事上试牙，会得到假绿，或者读成"这道门没牙"。
//
// 现在的口径：按**该故事清单里声明的产物集**判断（manifest 驱动），缺哪件补哪件。
// · 产物清单来自 `stories/<slug>/00-story.json` 的 `files`，家族判定复用 `editor/lib/core/generated-family.mjs`
// 的 `isGeneratedFamily`（单一权威，不再另抄一份"哪些文件是产物"）。
// · 清单尚未声明产物的情形（新建故事通常先编译再写清单）→ 只要 `data/` 下有源就交给编译器产出。
//
// 纯函数：`exists`、`family` 都由调用方注入，测试可以喂合成输入。

/** 该故事的产物集里，哪些需要重建。返回 `{ needed, why}`。 */
export const genNeeds = ({ declared = [], exists = () => false, family = () => false, dataFiles = [] } = {}) => {
	const products = declared.filter((f) => family(f));
	if (products.length) {
		const missing = products.filter((f) => !exists(f));
		return { needed: missing, why: missing.length ? `清单声明的产物缺 ${missing.length} 件` : '清单声明的产物齐备' };
	}
	if (dataFiles.length) return { needed: ['(整篇)'], why: `清单未声明产物而 data/ 有 ${dataFiles.length} 份源（新建故事）` };
	return { needed: [], why: '清单未声明产物且 data/ 无源' };
};
