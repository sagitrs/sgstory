// ── 产物路径的**单一权威**（#441 切片③）────────────────────────────────────
// 背景：#441 把构建从「一个故事」变成「多个故事 + 书架页」。此前 `dist/index.html`
// 这个字面量散落在 build.mjs / test/*.mjs / scripts/*.mjs 里（≈10 处）。
// 一旦散落，改路径就会漏改某处 ⇒ **假红/假绿**（测试跑的还是旧产物）。
// 所以：**所有消费者从这里取路径**，代码里不再出现 `dist/index.html` 字面量。
//
// 契约（β2 起）：
//   `dist/index.html`        = **书架页**（`shelfHtml()`）——进站先选故事；
//   `dist/stories/<slug>/…`  = 每个故事的产物（`storyHtml(slug)`）；
//   **没有**"根路径下的游戏本体"这回事：要游戏就 `defaultStoryHtml()`，别再往 `index.html` 上想。
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STORIES_DIR = join(ROOT, 'stories');
export const DIST_DIR = join(ROOT, 'dist');

/** 默认故事：`dist/index.html` 在过渡期仍是它的产物（等价于 storyHtml(DEFAULT_SLUG)）。 */
export const DEFAULT_SLUG = 'mist-forest';

/** 在 stories/ 下发现的故事 slug（按目录名排序，稳定）。 */
export const storySlugs = () =>
	(existsSync(STORIES_DIR) ? readdirSync(STORIES_DIR) : [])
		.filter((d) => existsSync(join(STORIES_DIR, d, '00-story.json')))
		.sort();

/** 读一个故事的清单（`stories/<slug>/00-story.json`）。 */
export const readStory = (slug) => JSON.parse(readFileSync(join(STORIES_DIR, slug, '00-story.json'), 'utf8'));

/** 故事产物：`dist/stories/<slug>/index.html`（**相对 fonts/ 的深度是 2 层**）。 */
export const storyHtml = (slug = DEFAULT_SLUG) => join(DIST_DIR, 'stories', slug, 'index.html');

/** 书架页：**`dist/index.html`**（β2 起首页＝书架；这是"多故事"对外的门面）。 */
export const shelfHtml = () => join(DIST_DIR, 'index.html');

/** 默认故事的产物（消费者要"游戏本体"时用它；**不是** `dist/index.html`——那是书架页）。 */
export const defaultStoryHtml = () => storyHtml(DEFAULT_SLUG);

/** 故事产物**相对 dist 根**的路径（服务器/URL 用；#363 的验收服务器与 ci 的线上冒烟都按这个形状取）。 */
export const storyRelPath = (slug = DEFAULT_SLUG) => `stories/${slug}/index.html`;

/** 字体目录是**共享根路径**（`dist/fonts/`）：故事页用 `../../fonts/`，根页用 `fonts/`。 */
export const FONT_PREFIX_FROM_ROOT = 'fonts/';
export const FONT_PREFIX_FROM_STORY = '../../fonts/';
