// `#1132` B4：元数据段（`StoryTitle` ／ `StoryData` ／ `StoryIdentity`）的装载期两向判据。
//
// 背景：本片把这三段由故事侧手写件（`00-meta.twee`）改为编译期生成，因此要防三种坏形态：
// ① **多源**：产物里同段出现两次（手写件未删而生成链已接 → 引擎取哪一个不确定）；
// ② **读不到**：产物里缺段（生成链没接或数据缺失 → 引擎静默退化）；
// ③ **中间窗口**：既删了手写件、又没接生成链的那一段空档（产物里干脆没有该段）。
//
// 判据按**区间**取，而不是"某处出现过"：对每个故事，取它的合并串，要求三段各**恰好一段**。
// 来历分两层，别读混：
// · 真实经历：本片落地过程中确实出现过"手写件与生成件并存"的中间态，当时实测三段各 2 处
//（`face-fixture`／`minimal-demo`／`night-ferry` 三故事同形）——这说明该窗口在真树上会发生；
// · 本格夹具：下面那一格**不是**当时真产物的快照，而是当场拼出的合成串（形状同上，供回归使用）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scopedFiles } from '../scripts/module-order.mjs';

// 回填时抄错的防线：这一组值是**旧手写件**里的作品标识（删除前取自 git 历史），钉死在此。
// 改了它 = Twine 侧等于换作品，且产物会跟着变（只查"清单与产物一致"抓不到抄错）→ 必须在此报。
export const LEGACY_IFIDS = {
	'face-fixture': '9A61C4D0-1F2E-4B77-9C33-6E5A0D2B7F41',
	'minimal-demo': '284F964F-E08D-420A-BF62-47B61E66959C',
	'night-ferry': '4FDB2374-A7A6-4181-AFDD-C2E53D79AAE9',
};
const SEGS = ['StoryTitle', 'StoryData', 'StoryIdentity'];
const SLUGS = ['face-fixture', 'minimal-demo', 'night-ferry'];
const ROOT = process.cwd();   // 测试从仓根跑（与其它 test/*.mjs 同口径）

let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`      ✓ ${label}`);
	else { bad++; console.log(`      ✗ ${label}${extra ? ' ⇒ ' + extra : ''}`); }
};

/** 纯函数：数一份文本里各元数据段出现几次（段头口径：行首 `:: 名`，后跟可选标签）。 */
export const segCounts = (text) => {
	const out = {};
	for (const s of SEGS) out[s] = (String(text).match(new RegExp(`^::\\s*${s}\\s*(?:\\[[^\\]]*\\])?\\s*$`, 'gm')) ?? []).length;
	return out;
};

const readStory = (slug) => JSON.parse(readFileSync(join(ROOT, 'stories', slug, '00-story.json'), 'utf8'));
const readMeta = (slug) => JSON.parse(readFileSync(join(ROOT, 'stories', slug, 'data', 'meta.json'), 'utf8'));
const mergedOf = (slug) => scopedFiles(readStory(slug)).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');

console.log('  两向判据：元数据源恰一 ／ 读不到大声报 ／ 中间无窗口');

// ── ① 恰一：每个故事的三段各恰好一段（多源与缺段都在此报） ──
for (const slug of SLUGS) {
	const c = segCounts(mergedOf(slug));
	ok(`${slug}：三段各恰好一段`, SEGS.every((s) => c[s] === 1), JSON.stringify(c));
}

// ── ② 真源在场：`StoryTitle` 的正文与 `StoryData` 的入口／ifid 必须与清单一致 ──
for (const slug of SLUGS) {
	const story = readStory(slug);
	const merged = mergedOf(slug);
	const title = new RegExp(`^::\\s*StoryTitle\\s*\\n(.+)$`, 'm').exec(merged)?.[1]?.trim();
	ok(`${slug}：标题与数据面一致（${readMeta(slug).title}）`, title === readMeta(slug).title, `成品 ${JSON.stringify(title)}`);
	ok(`${slug}：ifid 与旧手写件逐字相同（防回填抄错）`, readMeta(slug).ifid === LEGACY_IFIDS[slug], `数据面 ${readMeta(slug).ifid} ／ 旧值 ${LEGACY_IFIDS[slug]}`);
	const sd = /^::\s*StoryData\s*\n(\{[\s\S]*?\n\})/m.exec(merged)?.[1];
	let parsed = null;
	try { parsed = JSON.parse(sd ?? ''); } catch { parsed = null; }
	ok(`${slug}：StoryData 可解析且 ifid 与数据面一致`, parsed?.ifid === readMeta(slug).ifid, `成品 ${parsed?.ifid}`);
	ok(`${slug}：StoryData 的 start 与数据面 entry 一致（${readMeta(slug).entry}）`, parsed?.start === readMeta(slug).entry, `成品 ${parsed?.start}`);
}

// ── ③ 读不到大声报：缺段与多源两种坏形态都能被本判据抓住（合成输入） ──
{
	const good = mergedOf('night-ferry');
	const noSeg = segCounts(good.replace(/^::\s*StoryData[\s\S]*?\n\}\n/m, ''));
	ok('缺 StoryData ⇒ 计数为 0（本判据据此报缺段）', noSeg.StoryData === 0, JSON.stringify(noSeg));
	const dup = segCounts(good + '\n:: StoryData\n{}\n');
	ok('多一份 StoryData ⇒ 计数为 2（本判据据此报多源）', dup.StoryData === 2, JSON.stringify(dup));
	const allGood = segCounts(good);
	ok('真实产物 ⇒ 三段计数皆为 1', SEGS.every((s) => allGood[s] === 1), JSON.stringify(allGood));
}

// ── ④ 中间窗口的能假性：本片落地时曾真出现过「两处同段」的中间态 ──
{
	// 该中间态的形态：手写件（保留）+ 生成件（另名）并存 → 三段各两处。
	// 这里用合成复现其形状，并断言判据在两处时必报（故当时那一步若跑了本门，会当场红）。
	const dupAll = SEGS.map((s) => `:: ${s}${s === 'StoryData' ? '\n{}' : s === 'StoryIdentity' ? ' [script]' : ''}`).join('\n');
	const c = segCounts(mergedOf('minimal-demo') + '\n' + dupAll + '\n');
	ok('窗口态（手写与生成并存，三段各两处）⇒ 判据报多源', SEGS.every((s) => c[s] === 2), JSON.stringify(c));
}

console.log(bad ? `\n✗ 元数据源判据未通过（${bad} 项）` : '\n✔ 元数据源判据通过（三段恰一 ／ 正文与清单一致 ／ 缺段与多源都能报）');
process.exit(bad ? 1 : 0);
