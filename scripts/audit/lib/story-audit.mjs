// 门侧的**故事判据数据**加载器（`#602`）——单一落点：`stories/<slug>/audit.json`
//
// 为什么要有它：原先若干"引擎门"（`--text` 的主题词/风格黑名单、`--reads` 的已知存量基线）把**故事 1 的判据数据**
// 硬编码在**门代码**里 → 换故事后① 主题词照打印故事 1 的词（全 0 照绿＝**空判**）② 风格门拿**别人的黑名单**判你（**假红**）。
// 数据必须住"它所属的那个故事"里。
//
// 为什么是 `audit.json` 而不是故事表（`15-tables.twee`）：**判据数据不该进产物**。
// `--canon` 有一档正当口径「**shipped 文本**不得含回流词」——把词表写进 `[script]` 表会被构建进 `dist`（`#576` 之后我们
// 才把注释从产物里剥掉，字符串仍然照发）→ 与那条口径正面冲突（实测：`信物` 一进 `Game Tables` 就让 `--canon` 判红）。
// 结论：**判据（怎么算/怎么判红）住引擎门，数据住故事目录、不进产物**。
//
// 纪律（与本仓既有口径一致）：
// · **文件缺失/畸形 → 报错**（结构缺失必须报错；空表是**合法数据集**——"本故事没有这份判据"要**显式**写出来，而不是继承别人的）；
// · 键名固定：`text.topicWords` / `text.styleBlacklist` / `readBaseline`（形状在这里校验，调用方不必各自判）。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STORIES_DIR } from '../../dist-paths.mjs';

/** 每个故事**必须**提供的两份数据（缺一即报错——它们决定两道门对该故事判不判、怎么判）。 */
export const REQUIRED_SHAPES = { topicWords: 'array', styleBlacklist: 'array', readBaseline: 'object' };

/** 纯函数：形状校验（正反例可自证；不做 IO）。 */
export const judgeStoryAudit = (data, { slug = '?' } = {}) => {
	const out = [];
	if (!data || typeof data !== 'object' || Array.isArray(data)) return [`故事「${slug}」的 audit.json 不是对象（拿到 ${data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data}）`];
	const t = data.text;
	if (!t || typeof t !== 'object' || Array.isArray(t)) out.push(`故事「${slug}」的 audit.json 缺 \`text\` 对象（主题词/风格黑名单的落点）`);
	else {
		if (!Array.isArray(t.topicWords)) out.push(`故事「${slug}」的 \`text.topicWords\` 必须是数组（空数组合法）`);
		if (!Array.isArray(t.styleBlacklist)) out.push(`故事「${slug}」的 \`text.styleBlacklist\` 必须是数组（空数组合法）`);
	}
	if (!data.readBaseline || typeof data.readBaseline !== 'object' || Array.isArray(data.readBaseline)) out.push(`故事「${slug}」的 \`readBaseline\` 必须是对象（键＝\`段落|键\`，值＝理由；空对象合法）`);
	for (const [k, v] of Object.entries(data.readBaseline ?? {})) if (typeof v !== 'string' || v.trim().length < 8) out.push(`故事「${slug}」的 \`readBaseline['${k}']\` 缺理由（每条都要写清为什么它还在基线里）`);
	return out;
};

/** 读 + 校验（IO；缺文件/畸形 → **抛错**，不静默当空表）。 */
// `#1267` 故事根口：默认根走 `STORIES_DIR`（受 `SG_STORIES_DIR` 控制）→ 与构建/其余门同根。
export const loadStoryAudit = (slug, { root = STORIES_DIR } = {}) => {
	const p = join(root, String(slug), 'audit.json');
	if (!existsSync(p)) throw new Error(`缺 \`stories/${slug}/audit.json\`：门侧的故事判据数据必须由**该故事自己**声明（空表也要显式写；#602）`);
	let data;
	try { data = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`stories/${slug}/audit.json 不是合法 JSON：${e.message}`); }
	const problems = judgeStoryAudit(data, { slug });
	if (problems.length) throw new Error(problems.join('；'));
	return { topicWords: data.text.topicWords, styleBlacklist: data.text.styleBlacklist, readBaseline: data.readBaseline };
};
