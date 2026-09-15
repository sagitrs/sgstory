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

/** 故事页**硬上界**（字节）——与 CI 的 `post-deploy-smoke` 同一口径（那边写的是同数字的字面量，由 P5 门钉住）。
 *  `#576` 实测过一条"窗带"：`test/size-gate.mjs` 的基线 ＋ 0.5% 容差 ≈ 1,002.9KB，而部署后 1,000,000B 硬红
 *  ⇒ **997,937–1,002,926B 之间 PR/soak 全绿、main 的部署后冒烟红**（本常量就是为消掉这条窗带而收进来的）。
 *
 *  **2026-09-14 由 `1_000_000` 抬到 `1_100_000`**（操作者裁定："可以抬上界"）。理由与边界：
 *   · 三个故事**共享同一份引擎内联**，内容仍在增量期（`#624` 的点击态写侧迁移还在往条件表里加行）；
 *     故事页顶到 1MB 时，判据会开始逼着内容"为了字节而压注释"——那是**判据在指挥内容**，方向反了；
 *   · **真正的防回胖护栏是 `test/size-gate.mjs` 的 ratchet**（基线 ＋ 0.5% 容差、"只许降不许升"）——
 *     它比本上界更紧，且改动要重签＋写理由 ⇒ 抬本上界**不等于放宽 ratchet**；
 *   · 本上界只当**"疑似回胖/内嵌资产"的警报线**（部署后冒烟那条硬判），所以留 10% 余量够用。
 *   · 哪天要再抬：先把 `size-gate` 的基线为什么涨说清楚，否则只是把警报线推后。 */
export const STORY_PAGE_MAX_BYTES = 1_100_000;
/** 书架页**硬上界**（字节）——与 CI 的 `post-deploy-smoke` 同一口径（那边写的是同数字的字面量，
 *  由 `test/multi-story.mjs` 的 P5 门钉住：两处不等就在 PR 里红）。`#576` 未决① 的处置：不搬钱，搬判据。 */
export const SHELF_PAGE_MAX_BYTES = 100_000;
