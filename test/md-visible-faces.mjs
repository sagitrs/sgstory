// `#1141`：**md 故事段落对这两处面必须可见**（否则故事转 md 后该面**静默漏** —— 空集让潜伏不可见）。
// 两处同型面（都不许自写切段方言，都走 `editor/lib/core/passages.mjs` 的 `passagesOf` 单一分派）：
// ① `scripts/ui-migration-diff.mjs` 的 `parsePassages`（＋ 其输入面 `sourceFiles` 的过滤）
// ② `scripts/audit/gates/engine-story-free.mjs` 的 `scriptBodies`
// 成对（能假）：**传 path → 看得见** **不传 path → 看不见**（＝修法之前的旧行为 → 这就是"修法有效"的证明）。
import { readFileSync } from 'node:fs';
import { parsePassages, sourceFiles } from '../scripts/ui-migration-diff.mjs';
import { scriptBodies } from '../scripts/audit/gates/engine-story-free.mjs';

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

const MD = 'stories/face-fixture/passages/01-开场.md';
const mdText = readFileSync(MD, 'utf8');
const PROBE = '---\npassage: 探针段1141\ntags: [script]\n---\nwindow.Game.Probe1141 = Object.assign({}, {});\n';

// ── ① ui-migration-diff 的 parsePassages ─────────────────────────
const seen = parsePassages(mdText, MD);
t(`① 散文 md 段**看得见**（${MD} ⇒ ${seen.size} 段：${[...seen.keys()].slice(0, 2).join('、')}…）`, seen.size >= 1);
t('① **成对能假**：**不传 path** ⇒ 回到旧行为（看不见 ⇒ 0 段）✗（证明上面那格不是恒真 ✓）',
	parsePassages(mdText, '').size === 0);
t('① 跳过口径原样：`[script]` 标签的 md 段**不进正文面** ✓（与 twee 侧同口径 ✓）',
	parsePassages(PROBE, 'stories/face-fixture/passages/zz.md').size === 0);
// 输入面：sourceFiles 必须**认 md**（否则解析器改了也进不了循环）
t('① 输入面 `sourceFiles` **认 md**（否则 md 段进不了循环 ⇒ 解析器白改 ✗）',
	sourceFiles(['stories/face-fixture/passages/01-开场.md', 'stories/face-fixture/10-fixture.twee']).includes(MD));

// ── ② engine-story-free 的 scriptBodies ─────────────────────────
t('② md 源里声明 `[script]` 的段**看得见**（⇒ 由该门照常判内容 ✓ 不许静默跳过 ✗）',
	scriptBodies(PROBE, 'stories/face-fixture/passages/zz.md').length === 1);
t('② **成对能假**：**不传 path** ⇒ 0 块（旧行为 ⇒ 静默跳过 ✗）',
	scriptBodies(PROBE).length === 0);
t('② 拿到的确是**该段正文**（不是空串 ⇒ 门有东西可判 ✓）',
	/Probe1141/.test(scriptBodies(PROBE, 'stories/face-fixture/passages/zz.md').join('')));
t('② 向后兼容：**twee 源不传 path** 仍然照常切块 ✓（`editor/lib/host/**` 的调用点靠这条 ✗）',
	scriptBodies(':: A [script]\nWIDGET = 1;\n:: B\nnarr\n').length === 1);

if (bad) { console.error(`\n✗ md 可见面：${bad} 格失败 ✗`); process.exit(1); }
console.log('\n✔ md 可见面通过 ✓（两处面都走单一分派；传 path 看得见 · 不传看不见 ⇒ 成对 ✓）');
