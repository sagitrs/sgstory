// `#881`：词法遮蔽器已**搬进 core**（`editor/lib/core/mask.mjs` ✓）——此处只留**转出** ✗（不是副本 ✓）。
//
// 为什么搬：`editor/lib/core/**` 不得 import `scripts/**` ✗（分层 ＋ 浏览器安全 ✓）⇒ 遮蔽器必须住 core ✓。
// 为什么留这个文件：`scripts/**` 侧还有三个调用方（`lib/story-atoms.mjs` ✓ · `lib/shared.mjs` ✓ ·
//   `gates/engine-story-free.mjs` ✓）⇒ 留 `export *` 转出 ⇒ 它们**一行不用改** ✓。
// 口径：`export *` **不算定义** ✓（K6 ① 的重导出口径 ✓）⇒ K6 ①b「core 能力不许在 core 之外再定义」仍然 0 副本 ✓。
export * from '../../../editor/lib/core/mask.mjs';
