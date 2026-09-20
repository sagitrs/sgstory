// 条件键形门（`gsvector-process#239` 收口批 3 立项面 → `sgstory#1020`）：**故事数据里"条件位/授予位"的键形必须是引擎真能求值的那些**。
//
// 为什么需要它（`#1020` 实测）✗：夹具里 9 处键形写成 `note:n_*`，而**引擎的 `readKey` 不认该前缀** ⇒
//   那 5 处**条件**恒假（死条件：连着笔记已授予也不成立），4 处**授予位**若被执行还会**抛错**
//   （`Sg.notes.add('note:…')` ⇒ 「笔记「…」未登记（结构缺失必须报错,#434）」）⇒ 只因**无消费者**才没炸 ✗。
//
// 键形权威（**单一权威 ✓**）：`src/engine/40-sim/21-resolve.twee` 的 `readKey`（`#624` 片二）——
//   它能求值的键形只有这几类（逐条照它枚举，不另立一份"可读清单" ✗）：
//     · `n_*`                ⇒ `Sg.notes.has(k, pc)`
//     · `inv:` / `era:` / `gear:`（冒号后非空）⇒ 持有物／时代／行囊
//     · `pc.*`               ⇒ 从 pc 根走
//     · **不含冒号**的键（含点 ⇒ 走 `readPath`；不含点 ⇒ 读 `ev.<key>`）
//   ⇒ **凡带冒号而不属于 `inv:`/`era:`/`gear:` 的 ⇒ 引擎只会把它当裸键去读 `ev.<前缀>:<后缀>` ⇒ 恒假** ✗
//     （`note:n_x` 是其中最常见的一种：**它不是"还没支持的写法"，而是"结构性读不到"** ✓）。
//
// ⚠️⚠️ **本门刻意不复用审计层的规整逻辑** ✗（这是本片最要紧的一处避免自盲 ✓）：
//   `scripts/audit/lib/shared.mjs` 的 `declWriteKeys` **会把 `note:` 前缀剥掉**（`raw.slice(5)` ⇒ 当 `n_x` 用 ✓，
//   实测：`declWriteKeys([{yields:['note:n_x']}], {n_x:{flagPath:['ev.n_x']}})` ⇒ `["ev.n_x"]`，与 `n_x` **同值** ✓）
//   ⇒ ⇒ **审计门（`--state`／`--consequences`）结构性看不见这一格** ✗ —— 那正是这 9 处长期潜伏的原因 ✓
//   （"全链绿"在这里 **不等于** "没问题" ✗）。⇒ 本门**自带**键形判据（照 `readKey` 枚举 ✓），
//   且自证里**专门有一格**证明"若把坏形规整掉 ⇒ 本门仍必须报红"（否则本门会遗传同一盲区 ✗）。
//
// ⚠️ 与审计层的**口径差异是已知的、且不在本门处置** ✗：审计层宽容 `note:`（历史兼容），引擎不认 ⇒
//   本门**只以引擎为准**（票面口径 ✓）；"审计层要不要一并收紧"属**行为/口径取舍**，已记 `#1020` 待裁 ✓。
//
// 判据（**两支，都能假** ✓）：
//   ① **条件位**（`req`／`any`／`exclude`，含其嵌套处：`done/req`、`need/req`、`base/cases[]/req`、`willing/req`、`clues[]/req` …）
//      ⇒ 每个键形必须 ∈ 上面的 `readKey` 可求值集 ⇒ 否则**红并点名「文件 ＋ 结构路径 ＋ 键 ＋ 所在字段」** ✓；
//   ② **授予位**（`yields`／`yield`／`keyYields`）⇒ id **不得带 `note:` 前缀**（登记 id 形如 `n_*` ✓）；
//      —— 依 `#1020` 裁定：**前缀判据即足够机械**，不引入注册表全集 ✓（那会把门绑死在第二份真源上 ✗）。
//
// 用法：`node test/cond-keyform.mjs`（判真实故事数据）／`node test/cond-keyform.mjs --selftest`（量本件的判据不是空的 ✓）
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asListOf, condKeysOf } from '../editor/lib/core/audit-shared.mjs';
// `#1089`（裁定乙′）：**未跟踪扫描面 ⇒ 红** 的共用助手（一处定义、三门复用）。
import { untrackedScannedProblems, isUntrackedExemptLine } from '../scripts/lib/untracked-guard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

/** 条件位／授予位的字段名（**遍历定位用** ✓ —— 这两组是**位置**，键形判据在下面两支 ✓）。 */
export const COND_FIELDS = ['req', 'any', 'exclude'];
export const GRANT_FIELDS = ['yields', 'yield', 'keyYields'];

/** `readKey`（`21-resolve.twee:1205-1216`）**真能求值**的键形吗？—— **纯函数**，判据只此一处 ✓。
 *  ⚠️ 与审计层**故意不同**：这里**不剥任何前缀** ✗（剥了就看不见本缺陷 ✓）。 */
export const keyReadable = (key) => {
	const k = String(key ?? '').trim();
	if (!k) return false;
	if (k.startsWith('n_')) return true;                       // `Sg.notes.has(k, pc)` ✓
	if (/^(inv|era|gear):.+$/.test(k)) return true;            // 冒号后必须**非空** ✓
	if (k.startsWith('pc.')) return true;                      // 显式根 ⇒ 从 pc 走 ✓
	if (k.includes(':')) return false;                         // ⚠️ 其余带冒号的（`note:`／`flag:`／`keeper:`…）⇒ 引擎读不到 ⇒ **恒假** ✗
	return true;                                               // 不含冒号：有点 ⇒ readPath；无点 ⇒ `ev.<k>` ✓（两种都成立 ✓）
};

/** 遍历一份故事数据，收集**条件位**与**授予位**（纯 ✓，供自证注入合成数据 ✓）。 */
export const positionsOf = (data) => {
	const out = [];
	const walk = (node, path) => {
		if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
		if (!node || typeof node !== 'object') return;
		for (const [k, v] of Object.entries(node)) {
			const p = path ? `${path}/${k}` : k;
			if (COND_FIELDS.includes(k)) out.push({ kind: 'cond', field: k, path: p, value: v });
			else if (GRANT_FIELDS.includes(k)) out.push({ kind: 'grant', field: k, path: p, value: v });
			walk(v, p);
		}
	};
	walk(data, '');
	return out;
};

/** 判一份数据 ⇒ 问题清单（**纯函数** ✓）。`file` 只用于点名 ✓。 */
export const keyformProblems = ({ data, file = '(data)' }) => {
	const out = [];
	for (const pos of positionsOf(data)) {
		// ⚠️ 取键**必须逐项**调 `condKeysOf`（它对"数组里套对象"会退化成 `"[object Object]"` —— 实测 ✓）
		const keys = pos.kind === 'cond'
			? asListOf(pos.value).flatMap(condKeysOf)
			: asListOf(pos.value).map(String);
		for (const key of keys) {
			if (pos.kind === 'cond') {
				if (!keyReadable(key))
					out.push({ file, path: pos.path, field: pos.field, key,
						msg: `条件键形 \`${key}\` 引擎**求值不到**（\`readKey\` 只认 n_* / inv: / era: / gear: / pc.* / 无冒号键）⇒ 该条件**恒假** ✗` });
			} else {
				if (String(key).startsWith('note:'))
					out.push({ file, path: pos.path, field: pos.field, key,
						msg: `授予位 id \`${key}\` 带 \`note:\` 前缀 ✗ —— 登记 id 形如 \`n_*\`（带前缀会被 \`Sg.notes.add\` 判「未登记」而**抛错**）` });
			}
		}
	}
	return out;
};

/** 待判的数据文件（**只取 git 已跟踪的** ✗ —— 这是本片最要紧的一处**密闭性**设计 ✓）。
 *
 * ⚠️⚠️ 为什么不用 `readdirSync('stories')` 扫目录 ✗（**实测踩过**）：
 *   多个并行测试段会**临时往 `stories/` 放故事**（`test/web-preview.mjs` 建 `stories/__e2e` ✓、
 *   另有 `new-story-fixture` ✓）⇒ 扫目录会把**别人的半成品/临时件**一起判 ⇒
 *   ① 计数虚高（CI 实测 **18** vs 本地 **9** ✗ —— 多出的 9 条来自 `stories/__e2e`）；
 *   ② 更要命的是**判据不再密闭**：结果取决于**别的段跑到哪一步** ⇒ **时序相关 ⇒ 会随机红** ✗。
 *   ⚠️ 本仓**已有这教训**：`test/story-ci.mjs` 与 `editor/story-ci.mjs` 都写着「⊇ 而不是 ＝ …
 *   并行段会临时往 `stories/` 放故事（`__e2e` 等）⇒ **精确等值会随机红** ✗」（`#989` 根因 ✓）——
 *   本门第一版**又踩了一遍同一坑** ✓（我靠"CI 读数 vs 本地读数不一致"抓到的 ✓）。
 * ⇒ 改用**与 `test/repo-shape.mjs` 同款**的确定性口径：`git ls-files` 取**已入库**的数据文件 ✓；
 *   取不到 git 元数据 ⇒ **红并说明**，不做静默跳过 ✗（静默跳过＝假绿 ✓，同 `repo-shape` ✓）。 */
export const dataFiles = ({ cwd = ROOT } = {}) => {
	let out;
	try {
		out = execFileSync('git', ['ls-files', '--', 'stories/*/data/tables.json'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	} catch (e) {
		return { error: String(e?.message ?? e).slice(0, 200) };
	}
	return { files: [...new Set(out.split('\n').map((l) => l.trim()).filter(Boolean))].sort() };
};

/** `#1028` 一族 ✓：本门**只扫已跟踪**的数据文件（`git ls-files` ✓）⇒ **未跟踪**的新数据文件会被**静默漏扫** ✗
 *  —— 那就是"`git add` 之前跑门 ＝ **假绿**" ✓（本仓已把该形态标准化：见 `test/attribution-gate.mjs` 的运行时提醒 ✓）。
 *  ⇒ 本门**同样打印提醒**（缺它 ⇒ 新增故事的数据可能"没被扫过"而门照绿 ✗）。判据（**纯函数** ✓ 供自证）：
 *   只收「落在**本门扫描面**里（`stories/<slug>/data/*.json` ✓）且**未跟踪**」的那些 ✓。 */
export const scannedSurface = (rel) => /^stories\/[^/]+\/data\/[^/]+\.json$/.test(String(rel ?? ''));
export const unscannedUntracked = ({ others = [] } = {}) => others.filter((rel) => scannedSurface(rel));

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) bad += 1; };
	// 造数据：`S` 是容器（本门按**字段名**在任意深度定位条件位/授予位 ✓），逐层显式建，避免深嵌套写错括号 ✗
	const condData = (field, value) => ({ section: 's', containers: { S: { [field]: value } } });
	const askData = (ask) => ({ section: 's', containers: { S: { asks: [ask] } } });

	// ① 正例：可求值键形 ⇒ 不报
	t('① 正例：`n_*`／`inv:`／`era:`／`gear:`／`pc.*`／无冒号键 ⇒ 全过',
		keyformProblems({ data: condData('req', ['n_a', 'inv:日记', 'era:past', 'gear:杖', 'pc.gold', 'world.x', 'bare']) }).length === 0);

	// ① 反例：`note:` 在条件位 ⇒ 必报且点名（文件＋结构路径＋键 ＋ 所在字段）
	{
		const p = keyformProblems({ data: askData({ done: { req: ['note:n_a'] } }), file: 'f.json' });
		t('🔴 ① 反例：条件位 `note:n_a` ⇒ 报 1 条并点名（文件＋路径＋键＋字段）',
			p.length === 1 && p[0].key === 'note:n_a' && p[0].file === 'f.json' && p[0].path.includes('done/req') && p[0].field === 'req');
	}
	// ① 反例：别的未知前缀同样读不到 ⇒ 也要报（判据＝**可求值性**，不是"黑名单 note:" ✓）
	t('🔴 ① 反例：`flag:x`（其他未支持前缀）同样报（判据是可求值性 ✓）',
		keyformProblems({ data: condData('req', ['flag:x']) }).length === 1);
	// ① 边界：`inv:`（冒号后空）⇒ 非法（照 `readKey` 正则 `.+' ✓）
	t('🔴 ① 边界：`inv:`（冒号后空）⇒ 报（照 `readKey` 的 `.+` ✓）',
		keyformProblems({ data: condData('req', ['inv:']) }).length === 1);
	// ① 算子形：`{gte:[键,n]}`／`{oneOf:[键,[…值]]}` ⇒ 只取**键**、不把值当键（否则假红 ✗）
	t('① 算子形：`{gte:["world.x",3]}`／`{oneOf:["keeper.state",["seal"]]}` ⇒ 不假红',
		keyformProblems({ data: condData('req', [{ gte: ['world.x', 3] }, { oneOf: ['keeper.state', ['seal']] }]) }).length === 0);
	// ① 边界：`any`／`exclude` 与 `req` 同判（三个字段同一支 ✓）
	t('🔴 ① 边界：`any`／`exclude` 同样判（不只 `req`）',
		keyformProblems({ data: condData('any', ['note:n_a']) }).length === 1
		&& keyformProblems({ data: condData('exclude', ['note:n_a']) }).length === 1);

	// ② 反例：授予位带 `note:` ⇒ 必报（`yield` 单数与 `keyYields` 各一条 ⇒ 2 条）
	{
		const p = keyformProblems({ data: askData({ yield: 'note:n_a', yields: ['n_b'], keyYields: ['note:n_c'] }) });
		t('🔴 ② 反例：授予位 `yield`／`keyYields` 带 `note:` ⇒ 报 2 条（复数 `yields` 正确形 ⇒ 不报 ✓）',
			p.length === 2 && p.every((x) => x.field !== 'yields'));
	}
	// ② 正例：不带 `note:`（含物品名／`flag:` 等）⇒ 不报（裁定：**前缀判据即足够** ✓，不引入注册表 ✓）
	t('② 正例：授予位 `n_*`／`日记`／`flag:x` ⇒ 不报（前缀判据口径 ✓）',
		keyformProblems({ data: askData({ yields: ['n_a', '日记', 'flag:x'] }) }).length === 0);

	// ⭐ `#1028` 一族：扫描面判据（未跟踪提醒的依据）—— 正反例都要
	t('⭐ 扫描面：`stories/x/data/tables.json` ⇒ 算扫描面内 ✓', scannedSurface('stories/x/data/tables.json'));
	t('⭐ 扫描面：`stories/x/data/rules.json` ⇒ 也算（数据面同族 ✓）', scannedSurface('stories/x/data/rules.json'));
	t('⭐ 扫描面：`stories/x/10-x.twee` ⇒ **不算**（不是本门的判据对象 ✓）', !scannedSurface('stories/x/10-x.twee'));
	t('⭐ 未跟踪面：只收「扫描面 ∩ 未跟踪」（混入的其它路径被剔 ✓）',
		unscannedUntracked({ others: ['stories/a/data/tables.json', 'docs/x.md', 'stories/a/10-a.twee'] }).join(',') === 'stories/a/data/tables.json');

	// ⭐ 承重格：**"把坏形规整掉"必须不能让本门静默** —— 若实现复用审计层宽容逻辑（`note:` 剥成 `n_` ✗）就会放过
	{
		const data = condData('req', ['note:n_a']);
		const tolerantKeys = positionsOf(data).flatMap((p) => asListOf(p.value).flatMap(condKeysOf)).map((k) => String(k).replace(/^note:/, ''));
		t('⭐ 承重格 A：**若把 `note:` 规整掉 ⇒ 判据静默放过**（证明"不规整"是本门的承重设计 ✓）',
			tolerantKeys.filter((k) => !keyReadable(k)).length === 0);
		t('⭐ 承重格 B：而**本门实际实现**对该数据必然报红（对照 A ⇒ 本门没走宽容路 ✓）',
			keyformProblems({ data }).length === 1);
	}

	// ⭐ 密闭性格：**只判已入库** ⇒ 并行段的临时故事（`stories/__e2e` 等）不被判
	{
		const r = dataFiles();
		const transient = (r.files ?? []).filter((f) => /stories\/__|new-story-fixture/.test(f));
		t('⭐ 密闭性格：待判清单里**不含**并行段的临时故事（`stories/__e2e` 等 ✓）', transient.length === 0);
		t('⭐ 密闭性格：清单**非空**（不是"因为扫不到所以没问题" ✗）', (r.files ?? []).length > 0);
	}

	console.log(bad === 0
		? '\n✔ 自证通过：条件位/授予位两支 ＋ 算子形 ＋ 空冒号边界 ＋ 三字段同判 ＋ 「不规整」承重格（判据不是空的 ✓）'
		: `\n✗ 自证失败 ${bad} 项`);
	process.exit(bad === 0 ? 0 : 1);
};

if (process.argv.includes('--selftest')) selftest();

// ── 主跑：判**真实故事数据** ───────────────────────────────────────────────
let untrackedProblems = [];   // `#1089`：由下面 try 填（取不到 git 时保持空 ⇒ 由 dataFiles() 报）
// `#1028` 一族：**未跟踪**但落在扫描面里的数据文件 —— 本门扫不到 ⇒ **必须显式打印**（否则 `git add` 前跑＝假绿 ✗）
try {
	const others = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
	const miss = unscannedUntracked({ others });
	// `#1089`（裁定乙′）：**未跟踪且落在扫描面 ⇒ 红**（此前只提醒 ⇒ 退出码上不存在 ⇒ 假绿）。
	//   豁免：件内任意一行写 `untracked-exempt: <理由 ＋ 票号>`（缺任一项不生效）＋ **必须留痕**。
	const exempted = miss.filter((q) => {
		try { return readFileSync(join(ROOT, q), 'utf8').split('\n').some(isUntrackedExemptLine); } catch { return false; }
	});
	if (exempted.length) console.log(`  · 留痕：未跟踪但**已豁免** ${exempted.length} 件（带 \`untracked-exempt:\` 标记）：${exempted.join('、')}`);
	untrackedProblems = untrackedScannedProblems({ untracked: miss, isScanned: scannedSurface, exempted }).problems;
	if (miss.length) console.log(`  ⚠️ 本次未扫（未跟踪 ${miss.length} 件）⇒ 先 \`git add\` 再跑本门，否则是**假绿**：${miss.slice(0, 8).join('、')}${miss.length > 8 ? ' …' : ''}`);
} catch { /* 取不到 git（非工作树）⇒ 上面 dataFiles() 已会红并说明 ✓ */ }

const discovered = dataFiles();
if (discovered.error) {
	console.error('✗ 取不到 git 元数据（`git ls-files` 失败）—— 本门要求在工作树里跑；不做静默跳过 ✗');
	console.error(`    ${discovered.error}`);
	process.exit(1);
}
const files = discovered.files;
if (!files.length) { console.error('✗ 找不到任何已入库的 `stories/<slug>/data/tables.json` —— 本门要判真实数据，不做静默跳过 ✗'); process.exit(1); }
let problems = [];
// `#1089`：未跟踪 ⇒ 红（**先报**：它是「本门没扫全」的前置问题，优先于内容判据）。
for (const m of untrackedProblems) console.error(m);
if (untrackedProblems.length) { console.error('  复跑：node test/cond-keyform.mjs（先 git add 或加豁免标记）'); process.exit(1); }
for (const rel of files) {
	let data;
	try { data = JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); }
	catch (e) { console.error(`✗ ${rel} 不是合法 JSON：${e.message}`); process.exit(1); }
	problems = problems.concat(keyformProblems({ data, file: rel }));
}
if (problems.length) {
	console.error(`✗ 条件键形门未通过 ${problems.length} 项（判据权威＝\`src/engine/40-sim/21-resolve.twee\` 的 \`readKey\`）：`);
	for (const p of problems) console.error(`    [${p.kind ?? ''}${p.field}] ${p.file} ⇒ ${p.path}\n        · ${p.key}：${p.msg}`);
	console.error('  复跑：node test/cond-keyform.mjs');
	process.exit(1);
}
console.log(`✔ 条件键形门通过：${files.length} 份故事数据（${files.join('、')}）的条件位/授予位键形全部可求值 ✓`);
