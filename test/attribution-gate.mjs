// 去权威化口径门（`#752`，源自 `#748`）：注释／文档里**不许拿「谁定的」充当理由**。
//
// 为什么需要它（实测回潮，不是洁癖）：`#748` 一轮去权威化改了 **64 个文件**并合入（`e62d392`）；
//   **合入后 5 分钟内**主线就回潮 **4 处**（`af13b78` 带进的「（某人：『文字反馈最重要』）」这类写法）。
//   更要紧的是：这 4 处**连 `#748` 自己都没拦住** —— 那一轮的自查是**人工 `grep`**，作者只在自己
//   rebase **之前**跑过一次，没对新 base 引入的行重跑 ⇒ 靠人记、靠每轮人工 grep **必漏**。
//   本仓 `docs/dev-conventions.md` 头条规定「凡约定，必须配一条会咬人的门」，故落成这道门。
//
// 判据（**宁少勿多、零假阳性** —— §2 那 5 处假阳性换来的教训）：
//   文件命中下列 token（`TOKENS`）· 路径不在豁免面 · 行上没有 `deauth-exempt:` 标记 · 且未登记白名单 ⇒ 红。
//
// 故意**不咬**的边界（逐条都是实测过的假阳性源）：
//   · 裸 `席`：`一席`/`多席` 是**并发单元**（作业批次写法）；`宴席`/`入席`/`散席`/`席面` 是**故事正文**；
//   · 流程词 `复核`/`评审`/`走查`：是**活动名**不是归属（台账里的「最近复核」列必须保留）；
//   · 叙事学词 `作者层`/`作者覆盖`/`作者侧`：**叙述人称**术语，与「谁要求的」无关；
//   · 单独出现的 `原话`：故事正文有「她的原话你记下了」（`stories/mist-forest/30-ch1.twee`）。
//
// 豁免面（改它们＝篡改记录／日志）：`docs/archive/**`（已作废稿）· `docs/reviews/**`（流程记录）·
//   `docs/evidence/**`（冻结的取证日志，只能重生成不能改）。三者都在各自 README 里写明。
//   本门与白名单**自身**跳过（里面就是被匹配的字面量）—— 跳过路径**硬编码两条**并在输出里打印。
//   单行豁免 `deauth-exempt: <理由＋票号>`：给**文档里讲这条规矩本身**用的（例子必须写出坏写法），
//   **理由与票号少任一项都不算豁免**，且用到的每一行都在输出里留痕。
//
// 白名单 `test/attribution-allow.json`：键 `<路径>::<token id>`，每条必须 `reason` ＋ `ticket`；
//   **腐烂即红**（不再命中 ⇒ 报，逼你删）；起始**空** —— 这条口径不需要豁免。
//
// 自证：`node test/attribution-gate.mjs --selftest`
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../scripts/dist-paths.mjs';

/** 归属 token 词表：只收**明确的角色/席位归属**（宁少勿多）。
 *  为什么存**正则源**而不是 RegExp 对象：带 `g` 的 RegExp 有 `lastIndex` 状态，复用会**漏匹配**（静默）。 */
export const TOKENS = [
	{ id: '操作者', src: '操作者' },
	{ id: '复核者', src: '复核者' },
	{ id: '评审者', src: '评审者' },
	{ id: '本席', src: '本席' },
	{ id: '对抗席', src: '对抗席' },
	{ id: '验收席', src: '验收席' },
	// ⚠️ **左边界 `(?<![A-Za-z])`** ✗（`#962` ✓）：不加边界 ⇒ **英文词尾字母 ＋ 空格 ＋「席」** 会被当成席位号 ✓
	//   （实证：`… **锚当前 head 的 APPROVED 席数 = 2** …` ⇒ 命中「D 席」✗ —— `#961` 的 CI 就是这么红的 ✓）。
	//   边界**只挡「前面还是字母」**✗：`（T 席补的）`／`由 D 席投`／行首 `T 席` 这些**真命中必须仍然咬** ✓；
	//   `T　席`（全角空格 ✓）与 `T席`（无空格 ✓）也**必须仍咬** ✗（`?` 与字符类已覆盖 ✓）。
	{ id: 'ci-席', src: '(?<![A-Za-z])ci[ \\t\\u3000]?席', flags: 'i' },
	{ id: '席号', src: '(?<![A-Za-z])[TDCA][ \\t\\u3000]?席' },
	{ id: '伙伴会话', src: '伙伴会话' },
	{ id: 'guest-1', src: 'guest-1' },
	{ id: 'guest-归属', src: 'guest[ \\t\\u3000]?(?:的|在|实测|建议|说|问|抓到|抓到的)' },
	{ id: 'dev-归属', src: 'dev[ \\t\\u3000]?(?:裁定|复核|建议|实测|反例|指出)' },
	{ id: 'admin-归属', src: 'Admin[ \\t\\u3000]?(?:方向|指令|决断|定稿|要求|裁定)' },
];

/** 整目录豁免：改它们＝篡改记录（三个目录的 README 都写明了） */
export const EXEMPT_DIRS = ['docs/archive/', 'docs/reviews/', 'docs/evidence/'];

/** 自身跳过：本门与白名单里就是被匹配的字面量。**硬编码两条**，且输出里打印（反沉默）。 */
export const SELF_SKIP = ['test/attribution-gate.mjs', 'test/attribution-allow.json'];

/** 扫描面：这些扩展名的**已跟踪**文件（`git ls-files`）—— 图片/字体天然不在内。 */
export const SCAN_EXT = ['.mjs', '.md', '.twee', '.json', '.yml', '.yaml', '.sh', '.py', '.js', '.txt'];

/** 单行豁免的标记（理由必填）。 */
export const EXEMPT_MARKER = 'deauth-exempt:';

export const ALLOW_PATH = 'test/attribution-allow.json';

export const isScanned = (path) => SCAN_EXT.some((e) => path.endsWith(e));

/** `#1028`：每个 token 的**替换建议**（报文直接给可复制的写法 ⇒ 省得每次被咬都要自己想 ✗）。
 *  今晚该门共咬 4 次（`操作者`×2／`本席`×2），每次都要人自己琢磨怎么改 ⇒ 报文应当**自解释**。 */
export const REPLACEMENT_HINTS = {
	'操作者': '「实测：…」「依据见下」「口径（含日期，不写谁定的）」',
	'本席': '「本片实测」「本轮读数」',
	'复核者': '「复核席」（**活动名**：活动名不咬、角色名词咬）',
	'评审者': '「评审」（同上：用活动名）',
	'对抗席': '写明**对抗面**本身（如「反例面」），不写席位',
	'验收席': '写明**验收面**本身，不写席位',
	'ci-席': '写明 **CI 面**本身，不写席位',
	'席号': '用**活动名**（评审／复核／验收）或直接写事实，不写 T/D/C/A 席号',
	'伙伴会话': '写明**该会话／来源**本身（可引票号或评论号）',
};
/** 取某 token 的替换建议（**没有专属建议时给通用建议**，不留空 ✗）。 */
export const hintFor = (id) => REPLACEMENT_HINTS[id] ?? '写**依据／理由**（或把席位换成活动名）—— 门要的是「为什么」，不是「谁定的」';
/** `#1028`：**未跟踪**但落在扫描面里的文件 —— 它们不在 `git ls-files` 里 ⇒ 本门**扫不到**。
 *  ⚠️ 不静默 ✗：主线会把这份清单**打印出来**（含「通过」那一次）⇒ 「没扫」不许表现为「通过」（`#1019` 同族）。 */
export const untrackedScanned = (paths = []) => paths.filter((x) => isScanned(x) && !isExempt(x));

export const isExempt = (path) => EXEMPT_DIRS.some((d) => String(path).startsWith(d)) || SELF_SKIP.includes(path);

/** 纯函数：一段文本里命中哪些 token（带行号与命中串）。 */
export const scanText = (text) => {
	const out = [];
	const t = String(text);
	for (const { id, src, flags = '' } of TOKENS) {
		for (const m of t.matchAll(new RegExp(src, `g${flags}`))) {
			out.push({ id, line: t.slice(0, m.index).split('\n').length, token: m[0] });
		}
	}
	return out;
};

/** 纯函数：某一行是否带**有用的**单行豁免：`deauth-exempt:` ＋ 非空理由 ＋ **可追溯的票号 `#NNN`**
 *  （与 `scripts/audit/engine-story-allow.json` 的「理由带票号」同口径）—— 少了任一项都不算豁免。 */
export const lineExempted = (line) => {
	const i = String(line).indexOf(EXEMPT_MARKER);
	if (i === -1) return false;
	const reason = String(line).slice(i + EXEMPT_MARKER.length);
	return reason.trim().length > 0 && /#\d+/.test(reason);
};

/** 纯函数：判定。`files` = `[{ path, text }]`（**已按扫描面/豁免面过滤** —— 便于自证与注入式判据）。
 *  返回 `{ findings, stale, exemptedLines, scanned }`：
 *    findings — 命中且未登记白名单（红）；stale — 白名单条目已不再命中（**腐烂**，也红）；
 *    exemptedLines — 用了单行豁免的行（**留痕**，反沉默）；scanned — 实际扫过的文件数
 *    （为 0 ⇒ 由调用方判红：`#557` 口径「读不到输入 ≠ 没命中」）。 */
export const judge = (files, allow = {}) => {
	const findings = []; const seen = new Set(); const exemptedLines = [];
	for (const f of files) {
		for (const h of scanText(f.text)) {
			const key = `${f.path}::${h.id}`;
			seen.add(key);
			if (key in allow) continue;
			const line = String(f.text).split('\n')[h.line - 1] ?? '';
			if (lineExempted(line)) { exemptedLines.push({ path: f.path, line: h.line, text: h.token }); continue; }
			findings.push({ key, path: f.path, line: h.line, token: h.token, id: h.id });
		}
	}
	const stale = Object.keys(allow).filter((k) => !seen.has(k)).map((k) => ({ key: k }));
	return { findings, stale, exemptedLines, scanned: files.length };
};

/** 扫描目标：已跟踪 ∩ 扫描面 − 豁免面（`git ls-files` 从结构上排除 gitignored 的 dist/build）。 */
export const scanTargets = () => {
	const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
	return tracked.filter((p) => isScanned(p) && !isExempt(p));
};

const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	const F = (path, text) => [{ path, text }];
	// ── 反例：三类归属各一条（真会红） ──
	t('反例①：括号式裁定 ⇒ 命中', judge(F('a.md', '（操作者裁定：X）'), {}).findings.length === 1);
	// `#1028`：报文必须**自带替换建议**（否则每次被咬都要人自己想怎么改 ✗）
	t('`#1028` 反例：**解释性引用**（转述原句）同样命中 ⇒ 不许当豁免', judge(F('a.md', '这段按操作者的原话说：…'), {}).findings.length === 1);
	t('`#1028` 报文：每类 token 都给**可复制的替换建议**', hintFor('操作者').includes('实测') && hintFor('本席').includes('本片') && hintFor('席号').includes('活动名') && hintFor('未知x').length > 0);
	t('`#1028` 未跟踪清单：只收「扫描面 ∩ 非豁免」', untrackedScanned(['a.md', 'b.png', 'docs/archive/c.md', 'test/attribution-gate.mjs', 'd.mjs']).join(',') === 'a.md,d.mjs');
	t('反例②：`dev` ＋ 归属动词 ⇒ 命中', judge(F('a.md', '// 判据（dev 复核后定稿）'), {}).findings.length === 1);
	t('反例③：`guest` ＋ 的／实测 ⇒ 命中', judge(F('a.mjs', '// 外加 guest 的逐击抓屏实测'), {}).findings.length === 1);
	t('反例④：Admin ＋ 方向／指令 ⇒ 命中', judge(F('a.md', '> Admin 方向（2026-09-08）：…'), {}).findings.length === 1);
	t('反例⑤：行号指向**命中那一行**（不是文件头）', judge(F('a.md', 'x\ny\n操作者\n'), {}).findings[0].line === 3);
	t('反例⑥：`T 席`／`D 席` 席号形态 ⇒ 命中', judge(F('a.md', '// 纪律（T 席在 #441 上补的）'), {}).findings.length === 1);
	t('反例⑦：角色**名词形** `复核者` ⇒ 命中（活动名不咬、角色名词咬）', judge(F('a.mjs', '// 复核者的坑'), {}).findings.length === 1);
	t('反例⑧：角色**名词形** `评审者` ⇒ 命中', judge(F('a.md', '由评审者定稿'), {}).findings.length === 1);
	// ── 正例/边界：故意不咬的四类（假阳性源） ──
	t('正例①：流程词 `复核`／`评审` 不咬', judge(F('a.md', '#432 复核：14/14 confirm｜评审实践｜最近复核'), {}).findings.length === 0);
	t('正例②：`一席`／`多席` 并发单元不咬', judge(F('a.md', '多席并行落表零冲突（同时间一席）'), {}).findings.length === 0);
	t('正例③：故事正文 `宴席`／`入席`／`席面` 不咬', judge(F('a.twee', '那顿饭没人撤／没散的席面／送星宴已开席'), {}).findings.length === 0);
	t('正例④：叙事学词 `作者层`／`作者覆盖` 不咬', judge(F('a.md', '作者层解密；作者覆盖优先'), {}).findings.length === 0);
	t('正例⑤：单独 `原话` 不咬（故事正文有它）', judge(F('a.twee', '她的原话你记下了'), {}).findings.length === 0);
	// `#962`：**席位号的左边界** ✗ —— 三条正例（真命中不许松）＋ 两条反例（假阳要收）＋ 三条「别误伤」✓
	t('正例⑥：`（T 席补的）` 括号紧邻 ⇒ **仍咬** ✗（真命中不许松）', judge(F('a.md', '// 纪律（T 席在 #441 上补的）'), {}).findings.length === 1);
	t('正例⑦：`由 D 席投` 句中 ⇒ **仍咬** ✗', judge(F('a.md', '// 由 D 席投的票'), {}).findings.length === 1);
	t('正例⑧：**行首** `T 席…` ⇒ **仍咬** ✗', judge(F('a.md', 'T 席：这条我来'), {}).findings.length === 1);
	t('正例⑨：全角空格 `T　席` ⇒ **仍咬** ✗（别被左边界误伤）', judge(F('a.md', '（T　席补的）'), {}).findings.length === 1);
	t('正例⑩：无空格 `T席` ⇒ **仍咬** ✗', judge(F('a.md', '（T席补的）'), {}).findings.length === 1);
	t('正例⑪：英文词尾 ＋ 空格 ＋「席」`APPROVED 席数` ⇒ **不咬** ✗（`#961` 的真实形态 ✓）', judge(F('a.mjs', '⇒ 锚当前 head 的 APPROVED 席数 = 2'), {}).findings.length === 0);
	t('正例⑫：`DRAFT 席` ⇒ **不咬** ✗', judge(F('a.md', '草稿（DRAFT 席）'), {}).findings.length === 0);
	t('正例⑬：同族 `sci席`（`ci` 前还是字母）⇒ **不咬** ✗', judge(F('a.md', '英文 sci席 结尾'), {}).findings.length === 0);
	t('正例⑭：同族 `ci 席`（前面不是字母）⇒ **仍咬** ✗', judge(F('a.md', '一个 ci 席 单字'), {}).findings.length === 1);
	// ── 豁免面 ──
	t('边界①：三个豁免目录整目录不扫', ['docs/archive/x.md', 'docs/reviews/y.md', 'docs/evidence/z.log'].every(isExempt));
	t('边界②：本门与白名单自身跳过', isExempt('test/attribution-gate.mjs') && isExempt('test/attribution-allow.json'));
	t('边界③：扫描面只收文本扩展名（图片/字体不在内）', isScanned('a.twee') && !isScanned('a.png') && !isScanned('a.ttf'));
	t('边界④：`deauth-exempt:` 带理由＋票号 ⇒ 该行放行且**留痕**', (() => { const r = judge(F('a.md', '坏写法：操作者裁定 deauth-exempt: 讲解用 #1'), {}); return r.findings.length === 0 && r.exemptedLines.length === 1; })());
	t('边界⑤：`deauth-exempt:` **没理由** ⇒ 不放行（不许无声豁免）', judge(F('a.md', '操作者裁定 deauth-exempt:'), {}).findings.length === 1);
	t('边界⑥：`deauth-exempt:` 有理由但**无票号** ⇒ 不放行（豁免必须可追溯）', judge(F('a.md', '操作者裁定 deauth-exempt: 讲规矩用'), {}).findings.length === 1);
	// ── 白名单 ──
	t('白名单①：登记后不报', judge(F('a.md', '（操作者裁定）'), { 'a.md::操作者': { reason: 'r', ticket: '#1' } }).findings.length === 0);
	t('白名单②：不再命中 ⇒ 判腐烂（也红）', judge(F('a.md', '干净'), { 'a.md::操作者': { reason: 'r', ticket: '#1' } }).stale.length === 1);
	t('白名单③：同文件不同 token **不互相放行**', judge(F('a.md', '操作者与 dev 复核'), { 'a.md::操作者': { reason: 'r', ticket: '#1' } }).findings.length === 1);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：8 反例（归属红·行号准·角色名词形）＋ 5 正例（流程词·并发席·故事正文·叙事学词·原话 不咬）'
		+ '＋ 6 边界（豁免目录·自身·扩展名·标记留痕·空理由不放行·无票号不放行）＋ 3 白名单（生效·腐烂红·不互相放行）');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ── 真实运行 ──────────────────────────────────────────────────────────
const allow = JSON.parse(readFileSync(join(ROOT, ALLOW_PATH), 'utf8')).entries ?? {};
const missingMeta = Object.entries(allow).filter(([, v]) => !v?.reason || !v?.ticket).map(([k]) => k);
const targets = scanTargets();
const files = targets.map((p) => ({ path: p, text: readFileSync(join(ROOT, p), 'utf8') }));
const { findings, stale, exemptedLines, scanned } = judge(files, allow);

const untracked = untrackedScanned(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
console.log(`══ 去权威化口径门（#752／#748）══  扫描 ${scanned} 个已跟踪文件（${SCAN_EXT.join(' ')}）`);
// `#1028`：本门**只扫已跟踪文件** ⇒ 未跟踪的新件是「扫不到的」✗ ⇒ **必须显式打印**（否则 `git add` 之前跑＝假绿）
if (untracked.length) console.log(`  ⚠️ 本次未扫（未跟踪 ${untracked.length} 件）⇒ 先 \`git add\` 再跑本门，否则是**假绿**：${untracked.slice(0, 8).join('、')}${untracked.length > 8 ? ' …' : ''}`);
console.log(`  豁免面：${EXEMPT_DIRS.join(' · ')}｜自身跳过：${SELF_SKIP.join(' · ')}`);
console.log(`  白名单：${Object.keys(allow).length} 条｜单行豁免：${exemptedLines.length} 行`);
for (const e of exemptedLines) console.log(`  · 留痕：${e.path}:${e.line}「${e.text}」（带 deauth-exempt 标记）`);

const fail = [];
if (scanned === 0) fail.push('✗ 扫描面为空 —— `git ls-files` 读不到输入（#557 口径：读不到输入不许当「没命中」）');
for (const k of missingMeta) fail.push(`✗ 白名单 ${k} 缺 reason 或 ticket —— 豁免必须写明理由与票号`);
for (const f of findings) fail.push(`✗ ${f.path}:${f.line}「${f.token}」（token=${f.id}）—— 去权威化口径：写**理由**，别写「谁定的」（**解释性引用也一样** —— 引原句、写「谁定的」都要改写或行内标 deauth-exempt ✗）`
	+ `\n       ⇒ 试改成：${hintFor(f.id)}`);
for (const s of stale) fail.push(`✗ 白名单腐烂：${s.key} 已不再命中 —— 删掉该条`);
if (fail.length) { for (const l of fail) console.error(l); console.error('\n✗ 去权威化口径门未通过'); process.exit(1); }
console.log('✔ 去权威化口径门通过（无角色归属措辞 · 白名单无腐烂）');
