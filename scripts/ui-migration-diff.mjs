import { pathToFileURL } from 'node:url';
// #264（#185 阶段六）差异复核：迁移前后「玩家可见正文」零漂移对照。
//
// 做法：把基线提交的 src/*.twee 与工作区对比，逐段落抽出**玩家可见文本**
// （去掉宏 <<…>>、twee 注释 /% … %/、链接语法只留显示名），归一空白后比对。
// 输出：变更段落清单＋每段的字符增减＋是否已在 `docs/ui-inventory.md` 登记
//（未登记即提示——漂移必须要么为 0，要么有登记理由）。
//
//   node scripts/ui-migration-diff.mjs [基线提交]                  # 位置参数（旧用法，仍支持）
//   node scripts/ui-migration-diff.mjs --baseline=<ref>            # 显式基线（推荐：CI 用可达的引用）
//   node scripts/ui-migration-diff.mjs --check                     # 判定态：有未登记漂移 ⇒ 退 1
//   node scripts/ui-migration-diff.mjs --out=<path>                # 报告落点（默认 docs/ui-migration-diff.md）
//   node scripts/ui-migration-diff.mjs --zero                      # **逐段 0 漂移**（`#422-D`／阶段 2 纯转发的判据）
//   node scripts/ui-migration-diff.mjs --selftest                  # 判据自证（合成正反例，不碰 git）
//   node scripts/ui-migration-diff.mjs --story=<slug> --out=<path>  # **指定故事**（`#619`）；非默认故事必须显式给 `--out=`
//
// 退出码：未登记漂移 ⇒ 1；`--check` 下**基线不可达** ⇒ 1（见下）；纯报告 ⇒ 0。
//
// ⚠ **`#619` 第四条防线：`--story` 曾是被静默忽略的参数** —— 脚本全文没解析它，恒按 `DEFAULT_SLUG`（`mist-forest`）取文件集，
//   于是 `--story=hollow-cave` 这类调用**看着生效、实际只比故事 1**：给故事 2 加一句可见正文，它照样报"变更 0 段"（空门）。
//   现在：① 显式解析 `--story=`（取该故事的文件集）；② **未知参数一律报错**（静默按默认值跑＝"参数没生效却在给绿"）；
//   ③ 非默认故事必须显式 `--out=`（默认落点是故事 1 的报告，不许被覆盖）。
//
// ⚠ 三条「假绿」防线（`#436` 原范围 3 补，`#557` 又补一条；都有自证钉住）：
//   ① **基线不可达必须红**：旧版 `git show <base>:<file>` 的失败被 `catch` 吃掉 ⇒ 浅克隆里
//      （CI 默认 `fetch-depth: 1`）基线取不到时，**所有段落都会被当成「新增段」**，而旧段落名
//      在 `docs/ui-inventory.md` 里本来就在 ⇒ 「未登记」计数为 0 ⇒ **退 0（假绿）**。
//      现在先 `git rev-parse --verify` 验基线可达，不可达就明确报错（附修复命令）。
//   ② **任一侧解析为空都必须红**（`#557` 修）：本门原先只挡「基线 0 段而工作区 >0 段」，
//      **两边都空时落空** ⇒ 文件清单指向不存在的路径（故事文件搬家后 `FILES` 仍写 `src/*.twee`）时，
//      输出「变更 0 段」并**退 0** —— 实测：改一行真实正文也照样报零漂移（假绿）。
//      现在 `inputProblems()` 把「工作区 0 段」「基线 0 段」都判红，且**与 `--check` 无关**（读不出输入就该响）。
//   ③ **文件清单与单一权威同源**（`#557` 修）：清单不再写死路径，而是取 `scripts/module-order.mjs`
//      的 `MODULES`（工作区侧）∪ 基线树里的 `*.twee`（基线侧）—— `[script]`／样式段落由 `parsePassages`
//      跳过，所以「全量清单」不会凭空多出假段落；下次搬家/改目录时**不会再漂出第二次**。
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MODULES, scopedFiles, isStoryPassageMd } from './module-order.mjs';
import { passagesOf } from '../editor/lib/core/passages.mjs';
import { DEFAULT_SLUG, readStory, storySlugs } from './dist-paths.mjs';
import { storyText } from './audit/lib/shared.mjs';

/** 纯函数：命令行判据（`#619`）。**静默接受但忽略参数**是本仓"假绿"家族的常客 ⇒ 这里把三条都钉住：
 *  未知参数报错 · `--story` 必须存在 · 非默认故事必须显式给 `--out=`。 */
/** **覆盖自报**（`#619` 片二）：本门只对**默认故事**做判定；其他故事「只登记、不判定」。
 *  为什么必须打印而不是只写手册：读者得能从**输出**看出这份绿是哪一份绿（避免"以为三故事都判过"）。 */
export const coverageLine = ({ known = [], baselineSlug = DEFAULT_SLUG } = {}) => {
	const others = known.filter((s) => s !== baselineSlug);
	const judged = `\`${baselineSlug}\`（有基线：判定）`;
	return others.length ? `覆盖：${judged}｜${others.map((s) => `\`${s}\`：仅登记（**不判定**）`).join('｜')}` : `覆盖：${judged}`;
};

export const cliProblems = ({ argv = [], known = [], defaultSlug = DEFAULT_SLUG } = {}) => {
	const out = [];
	const KNOWN = ['baseline', 'out', 'check', 'zero', 'selftest', 'story'];
	for (const a of argv) {
		if (a.startsWith('--') && !KNOWN.some((k) => a === `--${k}` || a.startsWith(`--${k}=`))) {
			out.push(`未知参数「${a}」（只认 ${KNOWN.map((k) => '--' + k).join(' / ')}）—— 未知参数一律报错：静默按默认值跑＝"参数没生效却在给绿"`);
		}
	}
	const slug = (argv.find((a) => a.startsWith('--story=')) ?? '').slice('--story='.length) || defaultSlug;
	if (known.length && !known.includes(slug)) out.push(`--story=${slug} 不存在（可用：${known.join(' / ')}）`);
	if (slug !== defaultSlug && !argv.some((a) => a.startsWith('--out='))) out.push(`非默认故事（${slug}）必须显式给 --out=（默认落点 docs/ui-migration-diff.md 是故事 1 的报告，别覆盖它）`);
	if (argv.filter((a) => !a.startsWith('--')).length > 1) out.push('位置参数最多一个（旧用法：唯一位置参数＝基线提交）');
	return out;
};

// ── 纯函数：判据（自证与真实运行**同一份代码**）─────────────────────────────
// `base`／`cur`：段落名 → 正文；`invText`：docs/ui-inventory.md 全文
export const judge = (base, cur, invText) => {
	const rows = [];
	let unregistered = 0;
	for (const [name, body] of cur) {
		const before = base.get(name);
		const nowText = fingerprint(body);
		const beforeText = before === undefined ? null : fingerprint(before);
		if (beforeText !== null && beforeText === nowText) continue;
		const registered = invText.includes(name);
		if (!registered) unregistered++;
		rows.push({
			name,
			kind: beforeText === null ? '新增段' : '文本变更',
			delta: beforeText === null ? nowText.length : nowText.length - beforeText.length,
			registered,
		});
	}
	rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
	const removed = [...base.keys()].filter((k) => !cur.has(k));
	return { rows, unregistered, removed };
};

const EDGE = /^[（）。，、；：！？…“”‘’《》〈〉·—\s]+|[（）。，、；：！？…“”‘’《》〈〉·—\s]+$/g;
/** 与 `visible()` 同口径，但**保留空白/换行**（本门的片段切分靠它们划界）。 */
export const visibleKeepWs = (body) => body
	.replace(/\/%[\s\S]*?%\//g, '')            // twee 注释
	.replace(/<%[\s\S]*?%>/g, '')              // 原始 HTML 块
	.replace(/<<[^>]*>>/g, '')                 // 宏
	.replace(/\[\[([^\]|]+)\|?[^\]]*\]\]/g, '$1') // 链接：留显示名
	.replace(/<[^>]+>/g, '')                   // `#595`：**标签不是玩家可见正文**
	.replace(/''/g, '').replace(/\/\//g, '');

export const visible = (body) => visibleKeepWs(body).replace(/\s+/g, '');

/** `#595`：判定口径从“拼起来逐字节相同”改成“**可见片段多重集相同**”。
 *  为什么要改：`#435` 之后文本可以搬进条件表的行（`scope` 归属），**位置必变**（从段落中部搬到段落尾部），
 *  而玩家读到的**内容**没变。用拼接串比就会把每一次“搬表”都抵成漂移（`#593` 实测 `门厅 -55`／`书房 -49`）。
 *  切分/归一化三步（都只为消除“位置/边界”差异，**不改内容**）：
 *    ① 剥 HTML 标签——标记不是玩家可见正文；② 按**句末标点与换行**切片段（行文本由 `storyText` 换行追加 ⇒ 天然分界）；
 *    ③ 片段**边缘标点**归一（同一句邻接不同标点时归到同一片段）；片段内空白归一。
 *  代价（如实记）：**纯重排序**与“**只改边缘标点**”不再算漂移（那是迁移/排版的正常形态）；
 *  **改字/增删句子仍然会红**（多重集变了）。 */
export const fragments = (body) => visibleKeepWs(body)
	.split(/(?<=[。！？；…])|\n+/)
	.map((s) => s.replace(/\s+/g, '').replace(EDGE, '').trim())
	.filter(Boolean)
	.sort();
export const fingerprint = (body) => fragments(body).join('\n');

// ── 输入健全性（`#557` 防线②）：空的一侧就是**判据不可信**，而不是"没问题" ──
// 纯函数（与自证同一份代码）：只要返回非空，本门就必须响（且不再分是不是 `--check`）。
export const inputProblems = ({ curSize = 0, baseSize = 0, unreadable = 0, total = 0, baseline = '' } = {}) => {
	const out = [];
	if (!curSize) out.push(`工作区侧一个段落都没解析出来（清单 ${total} 个文件）——判据不可信：任何基线段落都会被当成"已删除"，表里的"变更 0 段"是假绿。`);
	if (!baseSize) out.push(`基线 \`${baseline}\` 侧一个段落都没解析出来（${unreadable}/${total} 个文件读失败）——判据不可信：会让"全部段落"变成"新增段"而假绿。`);
	return out;
};

// ── 清单同源（防线③）：工作区侧取 `MODULES`，基线侧取**基线树里实际存在的** `*.twee` ──
// 两侧取并集，是为了“本 PR 删了一个正文文件”这类情形也能被看见（只取工作区清单会把基线侧一起漏掉）。
export const sourceFiles = (baseFiles = [], modules = {}) =>
	[...new Set([...Object.keys(modules), ...baseFiles])]
		// `#1141`：**面必须认 md 故事段落** ✗ —— 原来只留 `.twee` ⇒ 故事转 md 后**整段对本面不可见**
		//   （静默漏 ✗）。谓词走 `module-order.mjs` 的 `isStoryPassageMd`（**单一权威** ✓ 不自写第二份口径 ✗）。
		.filter((f) => f.endsWith('.twee') || isStoryPassageMd(f))
		.sort();
/** `#460` **故事作用域**（与本仓其它故事门同一条口径）：本门是**迁移取证**门 ——
 *  它证明"纯转发没改可见文本"，判的是**默认故事**的正文面。把新故事（第二/第三个）的正文也算进来
 *  ⇒ 任何"新增内容"的 PR 都会被判成"未登记漂移"（实测：新增 `路·*` 76 段 ⇒ 红），而那不是本门要防的东西。
 *  ⇒ 工作区侧＝**默认故事作用域**；基线侧仍取基线树里存在的同名文件（"删了正文文件"照样看得见）。 */
export const defaultStoryFiles = () => scopedFiles(readStory(DEFAULT_SLUG));

/** 从一段源文里取“条件表行”（`#595`）：把每个 `[script]` 段在沙箱里跑一遍，收 `Sg.story.rules()`。
 *  为什么不禁表文件路径：迁移会把常量/表搬家（`#441`／`#448`），写死路径 = 下次搬家再静默失效（`#559` 的教训）。
 *  失败（引用缺失/语法错）⇒ **返回空并由调用方报**，绝不静默当“没有表”。 */
export const rowsFromSources = (sources) => {
	const rows = [];
	const failed = [];
	// 表的脚本依赖 `window.Sg.story` 这类容器（由引擎先建）；本门不启动引擎 ⇒
	// 用一个**自生成嵌套**的 Proxy 当 `window`（只取数据、不跑机制）：`window.Sg.story ??= {}` 这类写法照常成立。
	const makeStub = () => new Proxy({}, {
		get: (o, k) => (k in o ? o[k] : (o[k] = makeStub())),
		set: (o, k, v) => { o[k] = v; return true; },
	});
	for (const [name, text] of sources) {
		for (const m of String(text).matchAll(/::\s*[^\n[\]]+\[script\]([\s\S]*?)(?=\n::|$)/g)) {
			const body = m[1];
			// 只跑"**注册**条件表"的脚本（形如 `rules: () => […]`）；引擎里只"读"表的脚本不参与
			if (!/rules\s*:/.test(body)) continue;
			const w = makeStub();
			try {
				vm.runInNewContext(body, { window: w, Object, JSON, Math, String, Array, console }, { filename: name });
				const r = w.Sg?.story?.rules?.();
				if (Array.isArray(r)) rows.push(...r);
			} catch (e) { failed.push(`${name}：${e.message}`); }
		}
	}
	return { rows, failed };
};

/** 把条件表的行 `text` 按 **`scope` 归属**并入段落（`#595`）—— 与其它门**同一份权威**（`storyText()`）。
 *  这就是本票的修法：“文本搬进表”在玩家眼里**没变**，所以不能算漂移。 */
export const mergeRowTexts = (passageMap, rows) => storyText({ passageSrc: passageMap, passageTags: new Map(), rows }).text;

// `#1141`：**走单一分派点**（`editor/lib/core/passages.mjs` 的 `passagesOf` ✓ —— `.twee` ⇒ twee 解析、
//   `passages/*.md` ⇒ md 解析）。原来这里**自写一份切段方言**（`twee.split(/^:: …/)` ✗）⇒ md 段落看不见 ✗。
//   跳过口径原样保留（`script`／`stylesheet` 标签段 ＋ `Story*` 元段 ⇒ 不进正文面 ✓；md 段无标签 ⇒ 全进 ✓）。
export const parsePassages = (text, path = '') => {
	const out = new Map();
	for (const p of passagesOf(text, path)) {
		const tags = Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags ?? '');
		if (/\bscript\b|\bstylesheet\b/.test(tags) || String(p.name).startsWith('Story')) continue;
		out.set(p.name, p.body);
	}
	return out;
};

// ── CLI（只在**直接运行**时执行：`export` 出去的是纯函数，被 import 时不得有副作用）──
const main = () => {
	const argv = process.argv.slice(2);
	const flagVal = (k, d) => {
		const hit = argv.find((a) => a.startsWith(`--${k}=`));
		return hit ? hit.slice(k.length + 3) : d;
	};
	const positional = argv.filter((a) => !a.startsWith('--'))[0];

	// ── `#619` 命令行判据（未知参数 / 故事存在性 / 非默认故事的落点）──
	{
		const cliBad = cliProblems({ argv, known: storySlugs(), defaultSlug: DEFAULT_SLUG });
		if (cliBad.length) {
			for (const m of cliBad) console.error(`✗ ${m}`);
			console.error('  用法：node scripts/ui-migration-diff.mjs [--baseline=<ref>] [--out=<path>] [--story=<slug>] [--check] [--zero] [--selftest]');
			process.exit(1);
		}
	}

	if (argv.includes('--selftest')) {
		console.log('══ UI 差异复核 · 自证 ══');
		const M = (o) => new Map(Object.entries(o));
		// `#1004` B2b ✓：下面 `#619` 那批用例的"故事名单／默认故事"一律**取真值**（单一权威 ✓）——
		//   不再写死 `mist-forest`／`hollow-cave`（名字一删，用例就退化成"在枚举已删故事"✗，本仓已栽过多次 ✓）。
		const KNOWN = storySlugs();
		const OTHER = KNOWN.find((s) => s !== DEFAULT_SLUG) ?? 'nope';
		const cases = [
			['正例：正文一致 ⇒ 不算变更', judge(M({ P: "你好''世界''" }), M({ P: '你好世界' }), ''), (r) => r.rows.length === 0 && r.unregistered === 0],
			['正例：宏/注释变化 ⇒ 不算正文漂移', judge(M({ P: '<<if $x>>你好<</if>' }), M({ P: '/% 注 %/<<if $y>>你好<</if>' }), ''), (r) => r.rows.length === 0],
			['反例：正文变了且未登记 ⇒ 未登记 1', judge(M({ P: '你好' }), M({ P: '你好啊' }), ''), (r) => r.unregistered === 1],
			['正例：正文变了但已登记 ⇒ 未登记 0（不红）', judge(M({ P: '你好' }), M({ P: '你好啊' }), '# 清单\nP\n'), (r) => r.unregistered === 0 && r.rows[0].registered === true],
			['正例：新增段未登记 ⇒ 未登记 1 且 kind=新增段', judge(M({}), M({ P: '你好' }), ''), (r) => r.unregistered === 1 && r.rows[0].kind === '新增段'],
			['反例：**基线侧 0 段**（解析全失败/基线错）⇒ 必须能被上层判为不可信', judge(M({}), M({ P: '你好' }), 'P'), (r) => r.rows.length === 1 && r.rows[0].kind === '新增段'],
			// `#557` 防线②：**两边都空**（文件清单指向不存在的路径）——旧版在这里落空 ⇒ 退 0
			['🔴 反例：**两侧都 0 段**（清单全错）⇒ 必须报（旧版落空 ⇒ 静默退 0）', inputProblems({ curSize: 0, baseSize: 0, total: 7, baseline: 'origin/main' }), (r) => r.length === 2],
			['🔴 反例：工作区 0 段／基线非空 ⇒ 报（否则任何段落都看成"已删除"）', inputProblems({ curSize: 0, baseSize: 66, total: 7 }), (r) => r.length === 1],
			['🔴 反例：基线 0 段／工作区非空 ⇒ 报（旧版只盖这一种）', inputProblems({ curSize: 66, baseSize: 0, total: 7, baseline: 'x' }), (r) => r.length === 1],
			['正例：两侧都有段落 ⇒ 不报（正常路径不受影响）', inputProblems({ curSize: 73, baseSize: 73, total: 25, baseline: 'origin/main' }), (r) => r.length === 0],
			// `#595`：文本从段落**搬进条件表行**（`scope` 指向该段）⇒ 玩家可见正文没变 ⇒ **不算漂移**
			['正例（#595）：文本从段落搬进行（`scope` 指向该段）⇒ 不算漂移', judge(M({ P: '你好' }), mergeRowTexts(M({ P: '' }), [{ id: 'r', scope: 'P#位点', text: '你好' }]), ''), (r) => r.rows.length === 0],
			['正例（#595）：同一段内**位置变了**（片段多重集同）⇒ 不算漂移', judge(M({ P: '甲。乙。' }), M({ P: '乙。甲。' }), ''), (r) => r.rows.length === 0],
			['🔴 反例（#595 的口径边界）：**改字**仍然红（多重集变了）', judge(M({ P: '甲。乙。' }), M({ P: '甲。丙。' }), ''), (r) => r.rows.length === 1],
			['🔴 反例（#595 的反面）：行 `scope` 指向**不存在的段落** ⇒ 不归属（本门不吞；由 `--rules` 报）', mergeRowTexts(M({ P: '' }), [{ id: 'r', scope: '不存在', text: 'x' }]).has('不存在') === false, (x) => x === true],
			// `#619`：`--story` 曾被静默忽略（空门）⇒ 三条命令行判据都要有牙
			// ⚠️ `#1004` B2b ✓：这批用例原来**写死旧故事名**（`mist-forest`／`hollow-cave` ✗）⇒ `DEFAULT_SLUG` 换成面夹具后：
			//   ① `coverageLine({known:['mist-forest']})` 会把**旧默认**当成"其他故事" ⇒ "只有一个故事"那一格当场红 ✓；
			//   ② 实现侧的 `cliProblems` 也写死了 `defaultSlug='mist-forest'`（同族 ✗）⇒ 默认故事一换，"正例 ⇒ 不报"反而报 ✓。
			//   ⇒ 两边一起改取**真名单**（与 `test/story-ci.mjs` 的 ①、`editor/story-ci.mjs` 的壳级自证同一套口径 ✓）：
			//   名单 ＝ `storySlugs()` ✓、默认 ＝ `DEFAULT_SLUG` ✓ ⇒ 换故事/改默认都只跟着走 ✓，
			//   而"未知参数／不存在的故事／非默认缺 `--out=`／位置参数过多"四条牙**一处不少** ✓。
			['正例（#619）：默认故事、无参数 ⇒ 不报', cliProblems({ argv: [], known: KNOWN }), (r) => r.length === 0],
			['覆盖自报（#619）：默认故事写「判定」、其他故事写「仅登记（不判定）」', coverageLine({ known: KNOWN }), (r) => r.includes(DEFAULT_SLUG) && r.includes('判定') && r.includes(OTHER) && r.includes('仅登记') && r.includes('不判定')],
			['覆盖自报（#619）：只有一个故事 ⇒ 不写多余的"其他故事"段', coverageLine({ known: [DEFAULT_SLUG] }), (r) => !r.includes('仅登记')],
			['正例（#619）：`--story=<非默认> --out=…` ⇒ 不报', cliProblems({ argv: [`--story=${OTHER}`, '--out=build/x.md'], known: KNOWN }), (r) => r.length === 0],
			['🔴 反例（#619）：未知参数（打错一个字母）⇒ 报', cliProblems({ argv: ['--stonry=hollow-cave'], known: KNOWN }), (r) => r.length === 1],
			['🔴 反例（#619）：`--story=不存在` ⇒ 报', cliProblems({ argv: ['--story=nope', '--out=x.md'], known: KNOWN }), (r) => r.length === 1],
			['🔴 反例（#619）：非默认故事未给 `--out=` ⇒ 报（别覆盖故事 1 的报告）', cliProblems({ argv: [`--story=${OTHER}`], known: KNOWN }), (r) => r.length === 1],
			['🔴 反例（#619）：两个位置参数 ⇒ 报', cliProblems({ argv: ['a', 'b'], known: KNOWN }), (r) => r.length === 1],
		];
		let bad = 0;
		for (const [label, got, ok] of cases) {
			const pass = ok(got);
			if (!pass) bad++;
			console.log(`  ${pass ? '✓' : '✗'} ${label}`);
		}
		if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
		console.log('✔ 自证通过（可见文本口径 · 登记豁免 · 新增段识别）');
		process.exit(0);
	}

	const BASE = flagVal('baseline', positional ?? '92f3d04');
	const OUT = flagVal('out', 'docs/ui-migration-diff.md');
	const CHECK = argv.includes('--check');
	const ZERO = argv.includes('--zero');   // 逐段 0 漂移（阶段 2 纯转发用：登记豁免在这里**不适用**）



	// ── ① 基线可达性（假绿防线之一）：不可达 ⇒ 明确报错，绝不把"读不到"当成"没变化" ──
	{
		let ok = true;
		try { execSync(`git rev-parse --verify --quiet ${BASE}^{commit}`, { stdio: 'ignore' }); } catch { ok = false; }
		if (!ok) {
			console.error(`✗ 基线 \`${BASE}\` 不可达（浅克隆？）——**不判漂移**，避免把"读不到基线"当成"没有变化"（假绿）。`);
			console.error(`  修：\`git fetch --depth=1 origin ${BASE}\`，或改用可达引用：\`--baseline=origin/main\`。`);
			process.exit(CHECK ? 1 : 0);
		}
	}

	let baseFiles = [];
	try { baseFiles = execSync(`git ls-tree -r --name-only ${BASE}`, { encoding: 'utf8' }).split('\n'); } catch { baseFiles = []; }
	// 工作区侧：**默认故事作用域**（引擎 ∪ 默认故事清单）；基线侧：基线树里的 `*.twee`（与工作区交集之外的交给 `inputProblems` 报）
	const SLUG = (flagVal('story', DEFAULT_SLUG) || DEFAULT_SLUG);
	const scopeNames = new Set(scopedFiles(readStory(SLUG)));      // `#619`：按指定故事取文件集（不再是恒取默认故事）
	const SRC = sourceFiles(baseFiles.filter((f) => !f.includes('stories/') || scopeNames.has(f)), Object.fromEntries(Object.entries(MODULES).filter(([k]) => scopeNames.has(k))));

	const curRaw = new Map();
	const curSrc = new Map();
	for (const f of SRC) {
		let t = '';
		try { t = readFileSync(f, 'utf8'); } catch { continue; }
		curSrc.set(f, t);
		for (const [k, v] of parsePassages(t, f)) curRaw.set(k, v);
	}
	const curRows = rowsFromSources(curSrc);
	// `#595`：把表行 `text` 按 `scope` 归属并入段落（与 `--text`／`--echoes` 等同权威）——“搬进表”不算漂移。
	const cur = mergeRowTexts(curRaw, curRows.rows);

	const baseRaw = new Map();
	const baseSrc = new Map();
	let baseUnreadable = 0;
	for (const f of SRC) {
		try {
			const t = execSync(`git show ${BASE}:${f}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
			baseSrc.set(f, t);
			for (const [k, v] of parsePassages(t, f)) baseRaw.set(k, v);
		} catch { baseUnreadable++; /* 基线上没有这个文件（新增文件）或工作区已删——见防线② */ }
	}
	const baseRows = rowsFromSources(baseSrc);
	const base = mergeRowTexts(baseRaw, baseRows.rows);
	// 表读不出来（沙箱抛错）⇒ **响亮报**（不静默当“没有表”：那会把“搬进表的文本”当成凭空消失）
	for (const f of [...curRows.failed, ...baseRows.failed]) console.error(`⚠ 条件表行读取失败（本门的表面退化）：${f}`);

	// ── ② 输入健全性（`#557`）：任一侧 0 段 ⇒ 判据不可信，**读不出输入就该响**（不再分 `--check`）──
	{
		const problems = inputProblems({ curSize: cur.size, baseSize: base.size, unreadable: baseUnreadable, total: SRC.length, baseline: BASE });
		if (problems.length) {
			for (const p of problems) console.error(`✗ ${p}`);
			console.error(`  请检查基线/工作区的源树，或 \`scripts/module-order.mjs\` 的 MODULES 是否漏登新文件。`);
			process.exit(1);
		}
	}

	const inv = readFileSync('docs/ui-inventory.md', 'utf8');
	const { rows, unregistered, removed } = judge(base, cur, inv);

	// 基线的**自描述**（不写死"阶段三之前"这种措辞——基线换了，说明要跟着换）
	let baseDesc = '';
	try { baseDesc = execSync(`git log -1 --format=%s ${BASE}`, { encoding: 'utf8' }).trim().slice(0, 60); } catch { /* 取不到就不写 */ }

	const pad = (s, n) => String(s).padEnd(n, ' ');
	let md = [
		`# UI 迁移差异复核（#185 阶段六 / #264）`,
		'',
		`> 基线 \`${BASE}\`${baseDesc ? `（${baseDesc}）` : ''} → 工作区。比对口径：**玩家可见正文**（去宏、去 twee 注释、链接只留显示名、空白归一）。`,
		'> 逐段登记的适配与新增见 `docs/ui-inventory.md`；本表只列**正文有变化**的段落。',
		'',
		`- 变更段落：**${rows.length}**（未登记：**${unregistered}**）`,
		`- 删除段落：${removed.length ? removed.join('、') : '无'}`,
		'',
		'| 段落 | 类型 | 可见文本字符增减 | 已登记 |',
		'|---|---|---|---|',
		...rows.map((r) => `| ${r.name} | ${r.kind} | ${r.delta > 0 ? '+' : ''}${r.delta} | ${r.registered ? '✓' : '**未登记**'} |`),
		'',
		'## 口径说明',
		'',
		'- 「文本变更」为可见文本差异（宏/注释/链接目标不计）；**0 差异的段落不列出**——迁移以展示层为主，正文按设计保持原样。',
		'- 与剧情基线（#182+、#219 批次、#227–#252 各票）相关的正文变化已随各自 PR 记录；本表用于**复核迁移本身没有顺带改字**。',
		'- 有未登记漂移 ⇒ 退出码 1（可作门用，`--check` 语义相同）；**基线不可达或读不出段落也退 1**（防"读不到"被当成"没变化"）。',
		'',
	].join('\n');

	md = md.replace('# UI 迁移差异复核（#185 阶段六 / #264）', `# UI 迁移差异复核（#185 阶段六 / #264）\n\n> ${coverageLine({ known: storySlugs() })}`);
	writeFileSync(OUT, md);
	console.log(`✔ 差异复核（基线 ${BASE}）：变更 ${rows.length} 段（未登记 ${unregistered}）· 删除 ${removed.length} 段 → ${OUT}`);
	console.log(`  · ${coverageLine({ known: storySlugs() })}`);
	if (ZERO && rows.length) {
		// 阶段 2（纯转发）要的是**逐段 0 漂移**：这里**不接受**"已登记"豁免——任何可见正文变化都算漂移。
		console.error(`✗ --zero：基线 \`${BASE}\` 下有 ${rows.length} 段可见正文漂移（要求逐段 0）：`);
		for (const r of rows.slice(0, 8)) console.error(`    · ${r.name}（${r.delta > 0 ? '+' : ''}${r.delta}）`);
		if (rows.length > 8) console.error(`    …另有 ${rows.length - 8} 段`);
		process.exit(1);
	}
	if (unregistered) {
		console.log('  ⚠ 未登记但正文有变化（登记进 docs/ui-inventory.md，或把漂移改回 0）：');
		for (const r of rows.filter((x) => !x.registered)) console.log(`    · ${r.name}（${r.delta > 0 ? '+' : ''}${r.delta}）`);
	}
	process.exit(unregistered ? 1 : 0);
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
