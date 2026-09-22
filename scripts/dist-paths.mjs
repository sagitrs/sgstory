// ── 产物路径的**单一权威**（#441 切片③）────────────────────────────────────
// 背景：#441 把构建从「一个故事」变成「多个故事 + 书架页」。此前 `dist/index.html`
// 这个字面量散落在 build.mjs / test/*.mjs / scripts/*.mjs 里（≈10 处）。
// 一旦散落，改路径就会漏改某处 → **假红/假绿**（测试跑的还是旧产物）。
// 所以：**所有消费者从这里取路径**，代码里不再出现 `dist/index.html` 字面量。
//
// 契约（β2 起）：
// `dist/index.html` = **书架页**（`shelfHtml()`）——进站先选故事；
// `dist/stories/<slug>/…` = 每个故事的产物（`storyHtml(slug)`）；
// **没有**"根路径下的游戏本体"这回事：要游戏就 `defaultStoryHtml()`，别再往 `index.html` 上想。
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STORIES_DIR = join(ROOT, 'stories');
export const DIST_DIR = join(ROOT, 'dist');

/** 默认故事：`dist/index.html` 在过渡期仍是它的产物（等价于 storyHtml(DEFAULT_SLUG)）。 */
//注意：`#1004` B2b：`DEFAULT_SLUG` 不是"首页默认"（首页＝书架 `shelfHtml()`），而是**工具链的默认判据故事**
//（`audit` 的默认作用域／`dist-fresh` 的产物面／`integrity` 的**故事作用域**／以及**约 15 件"启默认故事"的测试**）。
// → B 段把旧内容故事删掉后，这些消费者要的是"**仍有真消费者**的接入面都在" →
// 那正是 `stories/face-fixture`（面夹具，见 `#1004` B2b 片二）→ 默认**指过去**。
//注意：不选 `minimal-demo`：它是"最小声明面"冒烟故事 → 在那里跑内容面判据只会得到**空判**
//（实测：15 件"启默认"的件全红在"找不到链接「踏上旅途」"）；也不选 `night-ferry`（P4 内容故事、面不全）。
//注意：夹具 `00-story.json::subtitle` 已写明"**测试夹具（非内容故事）**" → 免得三个月后被读成"漏删的旧故事"。
export const DEFAULT_SLUG = 'face-fixture';

/** 在 stories/ 下发现的故事 slug（按目录名排序，稳定）。 */
export const storySlugs = () =>
	(existsSync(STORIES_DIR) ? readdirSync(STORIES_DIR) : [])
		.filter((d) => existsSync(join(STORIES_DIR, d, '00-story.json')))
		.sort();

/** 读一个故事的清单（`stories/<slug>/00-story.json`）。 */
export const readStory = (slug) => JSON.parse(readFileSync(join(STORIES_DIR, slug, '00-story.json'), 'utf8'));

/** 故事的"受众"（`#1035`）：`content`＝上架（用户面书架）／`internal`＝内部件（引擎自检/测试夹具）。
 *注意：**必须显式声明**：缺字段/取值非法 → **抛错**（fail-loud）——否则"忘记标记"会让内部件**静默上架**。
 * 为什么不用默认值：默认 `content` 会把内部件默认发布；默认 `internal` 又会让新故事神秘消失 → 两者都靠猜 → 一律显式。 */
export const AUDIENCES = ['content', 'internal'];
export const audienceOf = (story) => {
	const a = story && story.audience;
	if (!AUDIENCES.includes(a)) {
		throw new Error(`stories/${(story && story.slug) ?? '?'}/00-story.json 的 \`audience\` 必须是 ${AUDIENCES.join('|')}（实得 ${JSON.stringify(a)}）—— 显式声明，免得内部件被静默上架`);
	}
	return a;
};
/** 上架（用户面）的故事 slug。 */
export const contentSlugs = () => storySlugs().filter((s) => audienceOf(readStory(s)) === 'content');
/** 内部件 slug（构建仍要，但不列书架/不进用户面）。 */
export const internalSlugs = () => storySlugs().filter((s) => audienceOf(readStory(s)) === 'internal');

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
 * `#576` 实测过一条"窗带"：`test/size-gate.mjs` 的基线 ＋ 0.5% 容差 ≈ 1,002.9KB，而部署后 1,000,000B 硬红
 * → **997,937–1,002,926B 之间 PR/soak 全绿、main 的部署后冒烟红**（本常量就是为消掉这条窗带而收进来的）。
 *
 * **2026-09-14 由 `1_000_000` → `1_100_000` → `2_000_000`**（「抬到 2MB」）。理由与边界：
 * · 三个故事**共享同一份引擎内联**，内容仍在增量期（`#624` 的点击态写侧迁移还在往条件表里加行）；
 * 顶到上界时，判据会开始逼着内容"为了字节而压注释"——那是**判据在指挥内容**，方向反了；
 * · **真正的防回胖护栏是 `test/size-gate.mjs` 的 ratchet**（基线 ＋ 0.5% 容差、"只许降不许升"）——
 * 它比本上界更紧，且改动要重签＋写理由 → 抬本上界**不等于放宽 ratchet**；
 * · 本上界只当**"疑似回胖/内嵌资产"的警报线**（部署后冒烟那条硬判）→ 2MB 是**故意的余量**。
 * · 将来需要腾字节时，优先从**构建期**撤：`build.mjs` 目前只剥 `/% %/` twee 块注释，`[script]` 段的 **JS 行注释仍进产物**
 *（内容表里的解释性注释可省若干 KB）——别靠压内容来适配门。 */
export const STORY_PAGE_MAX_BYTES = 2_000_000;
/** 书架页**硬上界**（字节）——与 CI 的 `post-deploy-smoke` 同一口径（那边写的是同数字的字面量，
 * 由 `test/multi-story.mjs` 的 P5 门钉住：两处不等就在 PR 里红）。`#576` 未决① 的处置：不搬钱，搬判据。 */
export const SHELF_PAGE_MAX_BYTES = 100_000;
