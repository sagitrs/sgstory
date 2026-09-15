// ⓪w 笔记模型门（伞 #422；升级自 `test/notes-model.mjs`，`#436` 原范围 1＋2）：
//     ① **形状与对齐**：每条笔记字段齐全、`flagPath` 的键**登记在状态契约域**里、空状态下不为真；
//     ② **接入契约**（`#436-b`）：`Sg.notes` 只经故事注册的 `Sg.story.notes()` 取表，结构缺失／形状畸形 ⇒ 报错；
//     ③ **消费可数**（操作者已同意）：每条笔记**至少一个消费点**——把「加了线索没人用」变成红灯。
//        零消费者的笔记必须在 `Game.State.bookkeeping` 里**带理由**声明（复用既有单一权威，不另立清单）。
//
// 判据口径：
//   · 「消费」＝该笔记的 `flagPath` 键被**读**（`readKeys()`，与写点同一处权威）**或**笔记 id 被引用
//     （`note:n_x` / `Sg.notes.has('n_x')` —— 伞 #422 阶段 2/4 之后的主要形态，故现在就一起算，
//      这样门在阶段推进时**不需要改判据**）。
//   · **反沉默**：`bookkeeping` 里声明了零消费、实际却有消费点的笔记键 ⇒ 红（声明烂在那里）。
import { readFileSync, readdirSync } from 'node:fs';
import { readKeys, ruleRowKeys } from '../../../scripts/audit/lib/shared.mjs';
   // `#437` C-2c-3：单源读点基线（该故事的数据）

export const flag = 'notes';
export const flags = ['notes'];

const REQUIRED = ['title', 'src', 'body', 'tags', 'era', 'flagPath'];
// `flagPath` 可以是字符串或**字符串数组**（多源 OR，`#432-B8/B12`）
export const flagPaths = (e) => (Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath == null ? [] : [e?.flagPath]));
const keyOf = (p) => String(p ?? '').split('.').pop();

// ── 纯函数：形状与对齐（自证与真实运行**同一份代码**）────────────────────────
export const auditShape = (entries, domainKeys) => {
	const problems = [];
	for (const [id, e] of Object.entries(entries ?? {})) {
		for (const f of REQUIRED) {
			const v = e?.[f];
			const empty = v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
			if (empty) problems.push({ id, detail: `缺字段「${f}」` });
		}
		if (e?.grant != null && typeof e.grant !== 'function') problems.push({ id, detail: 'grant 必须是函数或省略（省略＝用 flagPath 求值）' });
		for (const p of flagPaths(e)) {
			const key = keyOf(p);
			// 「域.键」形状：域只能是 ev / world（笔记读的是知识与世界态；持有物不进笔记——#432-B11）
			if (!/^(ev|world)\.[a-z_]\w*$/.test(String(p ?? ''))) problems.push({ id, detail: `flagPath「${p}」不是「域.键」形状（应为 ev.<键> 或 world.<键>）` });
			else if (!domainKeys.has(key)) problems.push({ id, detail: `flagPath 的键「${key}」未登记在状态契约域（--state）里` });
		}
	}
	return problems;
};

// ── 纯函数：表行读点（`#435` 前置 0）──────────────────────────────────────
// 阶段 4 之后，**表行的 `req`/`any`/`exclude` 就是读点**（求值走 `Sg.notes`/`Sg.rules` 封装层）。
// 不收进来 ⇒ 把条件从段落搬进表之后，那些笔记会被判「**零消费**」（假红：搬家反而把笔记判死）。
// 限定键与域的对应关系走单一权威 `ruleRowKeys()`（它与 `--state` 的"有写有读"同一份）。
export const rowReads = (rows, entries) => {
	const M = new Map();
	for (const r of rows ?? []) for (const k of ruleRowKeys(r, entries)) {
		if (!M.has(k)) M.set(k, new Set());
		M.get(k).add(`表行:${r?.id ?? '?'}`);
	}
	return M;
};

// ── 纯函数：消费可数（#436 原范围 2）────────────────────────────────────────
// `reads`：限定键（`ev.x`/`world.x`）→ 读点集合；`refText`：整份源码文本（找 `note:<id>` 引用）
export const auditConsumption = (entries, reads, bookkeeping, refText) => {
	const problems = [];
	const bk = new Set(bookkeeping ?? []);
	const refs = String(refText ?? '');
	for (const [id, e] of Object.entries(entries ?? {})) {
		const paths = flagPaths(e);
		const keys = paths.map(keyOf);
		// 读点表按**限定键**（`ev.tav_fog`）建 ⇒ 用 flagPath 原样查（`world.x` 与 `ev.x` 是两个域，不可混——#365）
		let consumers = 0;
		for (const p of paths) consumers += (reads.get(p)?.size ?? 0);
		// 阶段 2/4 形态：笔记 id 被条件/表引用（`note:n_x` 或 `Sg.notes.has('n_x')`）
		const byId = new RegExp(`(?:note:${id}\\b|Sg\\.notes\\.(?:has|entry)\\(\\s*['"]${id}['"])`).test(refs) ? 1 : 0;
		const declaredZero = keys.some((k) => bk.has(k));
		if (consumers === 0 && !byId && !declaredZero) {
			problems.push({ id, detail: `**零消费**：没有任何读点消费它（键 ${keys.map((k) => '`' + k + '`').join('/')}）—— 加了线索没人用；若确属「仅记账」请登记进 \`Game.State.bookkeeping\`（带理由）` });
		}
		if ((consumers > 0 || byId) && declaredZero) {
			problems.push({ id, detail: `**僵尸豁免**：\`Game.State.bookkeeping\` 把它声明成"零消费"，但实际已有了消费点 ⇒ 请删掉那条声明` });
		}
	}
	return problems;
};

/** **`<<notepath "id" "path">>` 的两条判据**（`#437` 批三 C-2b′，与引擎 `addPath` 的护栏**同判据**）：
 *  ① **path 必须属于该笔记的 `flagPath`** —— 写进去读不出来的 path 是**静默丢数据**（引擎侧也会抛，这里提前静态报）；
 *  ② **多源笔记（`flagPath` 是数组）必须用 `<<notepath>>` 显式声明写哪一条**（或声明 `setPath`）——
 *     否则 `<<note>>`／`Sg.notes.add()` 会被引擎的护栏拒绝（`add()` 对多源无 `setPath` ⇒ 抛错）。
 *  为什么静态也要报（而不是只靠引擎运行时抛）：运行时抛是"点了才知道"，静态报是"改完就红"。 */
/** **单源读点的过渡基线**（`#437` C-2c-3）：键 `<文件>::<限定键>`，值＝**移除计划**（C-2c-3 把读点改成 `has(id)` 后逐条删）。
 *  为什么基线住**门文件**而不是 `stories/<slug>/audit.json`：① 本文件**就是该故事的门**（`stories/mist-forest/gates/**`
 *  按定义只服务这个故事 ⇒ 不是 `#602` 要禁的"引擎门里硬编码故事 1 的数据"）；
 *  ② 那份 `audit.json` 由引擎侧的 `loadStoryAudit()` **按键白名单**取（`topicWords`/`styleBlacklist`/`readBaseline`），
 *  新增键取不到（实测：加了 `singleReadBaseline` 但门拿不到 ⇒ 9 条全报）。**若将来要收编进 `audit.json`，需先扩那个加载器**
 *  （那是 `scripts/audit/**`＝dev 的文件面，我不动）。
 *  **纪律**：基线逐条带移除计划，且**腐烂即红**（改好不删 ⇒ 门报"基线腐烂"）。 */
// ⚠️ **这 9 处（8 键）卡在同一件事**（`#437` C-2c-3 实测）：`--consequences` 的分类器
// （`scripts/audit/lib/shared.mjs`，dev 面）目前只认两种读形状（`p.ev.X`／`Sg.notes.readPath(p,'ev.X')`）
// ⇒ 改成 `Sg.notes.has(id, pc)` 会让该旗标**丢桶**（实测：转图鉴 5 处 ⇒ `codex×3 → codex×2 · engine?×1`；
// 再转 NPC 3 处 ⇒ `--echoes` 分级问题 5 → 6）。口径同 `docs/notes-model.md` §4.1：**先让门认新形状，再改内容**。
export const SINGLE_READ_BASELINE = {
	'stories/mist-forest/15-tables.twee::ev.failure_cause': 'C-2c-3 待搬：图鉴谓词读单源笔记的 path ⇒ 改 `Sg.notes.has(\'n_failure_cause\')`（行为等价）',
	'stories/mist-forest/15-tables.twee::ev.observation_lock': 'C-2c-3 待搬：图鉴谓词两处（`n_observation_lock` 单源）',
	'stories/mist-forest/15-tables.twee::world.flower_warned': 'C-2c-3 待搬：图鉴谓词（`n_flower_warned` 单源）',
	'stories/mist-forest/15-tables.twee::ev.keeper_why': 'C-2c-3 待搬：图鉴谓词（`n_keeper_why` 单源）',
	'stories/mist-forest/15-tables.twee::ev.letter_seen': 'C-2c-3 待搬：图鉴谓词（`n_letter_seen` 单源）',
	'stories/mist-forest/15-tables.twee::ev.tav_tips': 'C-2c-3 待搬：NPC `done:` 谓词（`n_tav_tips` 单源）',
	'stories/mist-forest/15-tables.twee::ev.keeper_told': 'C-2c-3 待搬：NPC `done:` 谓词（`n_keeper_told` 单源）',
	'stories/mist-forest/15-tables.twee::ev.witch_grip': 'C-2c-3 待搬：NPC `done:` 谓词（`n_witch_grip` 单源）',
};

export const notepathProblems = ({ entries = {}, sources = {} } = {}) => {
	const problems = [];
	const ids = new Set(Object.keys(entries));
	const NP = /<<\s*notepath\s+['"](n_[a-z0-9_]+)['"]\s+['"]((?:ev|world)\.[a-z0-9_]+)['"]/g;
	const NOTE = /(?:<<\s*note\s+['"](n_[a-z0-9_]+)['"]|Sg\.notes\.add\(\s*['"](n_[a-z0-9_]+)['"])/g;
	for (const [f, src] of Object.entries(sources)) {
		const text = String(src ?? '').replace(/\/%[\s\S]*?%\//g, '');   // 注释里的示例不是代码
		for (const m of text.matchAll(NP)) {
			const [, id, path] = m;
			if (!ids.has(id)) { problems.push({ id, where: f, detail: `\`<<notepath>>\` 的笔记 id「${id}」**未登记**（写进去读不出来）` }); continue; }
			if (!flagPaths(entries[id]).includes(path)) {
				problems.push({ id, where: f, detail: `\`<<notepath>>\` 的 path「${path}」**不属于**该笔记的 \`flagPath\`（${flagPaths(entries[id]).join('／')}）——写进去读不出来` });
			}
		}
		for (const m of text.matchAll(NOTE)) {
			const id = m[1] ?? m[2];
			const e = entries[id];
			if (!e || flagPaths(e).length <= 1 || e.setPath) continue;   // 未登记/单源/已声明 setPath ⇒ 不归本判据管
			problems.push({ id, where: f, detail: `多源笔记用了 \`<<note>>\`／\`Sg.notes.add()\`——必须用 \`<<notepath "id" "path">>\` 声明**写哪一条**（或声明 \`setPath\`）` });
		}
	}
	return problems;
};

/** **单源笔记不得用 `readPath` 读**（`#437` C-2c-3 的判据面）：
 *  单源笔记的 path 就是它的唯一来源 ⇒ `readPath(pc, path)` ≡ `has(id)`，**后者才是模型里的写法**
 *  （也让"旗标"从读侧彻底退场 ⇒ 之后才能停写单源旗标）。**多源笔记**（`flagPath` 是数组）相反：
 *  那里 `readPath` 表达的是"**哪一条路径**拿到了"（例：`ev.hall_seen`"看准了" vs `world.hall_hint`"听人比过"）
 *  ⇒ 必须保留，不许一刀切。
 *  基线（`stories/<slug>/audit.json` 的 `singleReadBaseline`）逐条带**移除计划**；修好即从基线删（**腐烂即红**）。 */
export const singleReadProblems = ({ entries = {}, sources = {}, baseline = {} } = {}) => {
	const problems = [];
	const pathInfo = new Map();   // 'ev.x' → { id, multi }
	for (const [id, e] of Object.entries(entries)) {
		const ps = Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath == null ? [] : [e.flagPath]);
		for (const p of ps) if (p) pathInfo.set(String(p), { id, multi: Array.isArray(e.flagPath) });
	}
	const seen = new Set();
	for (const [f, src] of Object.entries(sources)) {
		const text = String(src ?? '').replace(/\/%[\s\S]*?%\//g, '');
		for (const m of text.matchAll(/Sg\.notes\.readPath\(\s*[^,()]+,\s*['"]((?:ev|world)\.[a-z_]+)['"]/g)) {
			const info = pathInfo.get(m[1]);
			if (!info || info.multi) continue;                    // 未登记/多源 ⇒ 不归本判据管
			const key = `${f}::${m[1]}`;
			seen.add(key);
			if (!baseline[key]) problems.push({ id: info.id, where: `${f}｜${m[1]}`, detail: `单源笔记用 \`readPath\` 读 ⇒ 应为 \`Sg.notes.has('${info.id}')\`（path 即唯一来源，两者等价；改用 has 后旗标才能从读侧退场）` });
		}
	}
	// 腐烂：基线里登记了、但**现在已不再命中**（修好了）⇒ 报，逼你删（本仓既有纪律）
	for (const [key, why] of Object.entries(baseline ?? {})) {
		if (seen.has(key)) continue;
		problems.push({ id: key, where: key.split('::')[0], detail: `基线腐烂：「${key.split('::')[1]}」已不再以 \`readPath\` 形式出现（修好了就删基线）——登记理由：${why}` });
	}
	return problems;
};

export const run = (ctx) => {
	console.log('\n══ ⓪w 笔记模型门（伞 #422）——形状/对齐 · 接入契约 · 消费可数 ══');
	const domains = ctx.Game.State?.domains ?? [];
	const entries = ctx.Game.Notes?.entries ?? {};
	const SRC_FILES = ctx.SRC_FILES ?? [];
	const sources = {};
	for (const f of SRC_FILES) sources[f] = readFileSync(f, 'utf8');
	const allText = Object.values(sources).join('\n');

	// 状态契约域的全部键（权威表）：`d.keys` ∪ 前缀匹配（前缀匹配需对**现有条目**求值，与既有实现一致）
	const domainKeys = new Set();
	for (const d of domains) {
		for (const k of d.keys ?? []) domainKeys.add(k);
		for (const pre of d.prefix ?? []) {
			for (const id of Object.keys(entries)) for (const p of flagPaths(entries[id])) { const k = keyOf(p); if (k?.startsWith(pre)) domainKeys.add(k); }
		}
	}
	// 读点集合（键 → 读点）：用**单一权威** `readKeys()`；`#435` 前置 0：再加上**表行的读点**
	// （`req`/`any`/`exclude` ⇒ `ruleRowKeys()`）——否则条件搬进表后笔记会被判「零消费」
	const reads = rowReads(ctx.window?.Sg?.story?.rules?.() ?? [], entries);
	for (const [f, src] of Object.entries(sources)) {
		for (const line of src.replace(/\/%[\s\S]*?%\//g, '').split('\n')) {
			for (const k of readKeys(line)) {
				if (!reads.has(k)) reads.set(k, new Set());
				reads.get(k).add(f.split('/').pop());
			}
		}
	}

	let bad = 0;
	// ── 自证（先证会红，再判真实数据；失败**计入退出码**且**不崩**——dev-conventions §9①②）──
	{
		const dom = new Set(['tav_tips', 'flower_warned', 'hall_hint', 'hall_seen']);
		const good = { n_a: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
		const cases = [
			['形状·正例（字段齐全＋旗标已登记）', auditShape(good, dom).length, 0],
			['形状·缺字段 body → 红', auditShape({ n_a: { ...good.n_a, body: '' } }, dom).length, 1],
			['形状·键未登记 → 红', auditShape({ n_a: { ...good.n_a, flagPath: 'ev.no_such_key' } }, dom).length, 1],
			['形状·grant 写死非函数 → 红', auditShape({ n_a: { ...good.n_a, grant: true } }, dom).length, 1],
			['形状·多源 OR 两条路径都查 → 红（其一未登记）', auditShape({ n_a: { ...good.n_a, flagPath: ['world.hall_hint', 'ev.no_such_key'] } }, dom).length, 1],
			['形状·flagPath 非「域.键」形状 → 红', auditShape({ n_a: { ...good.n_a, flagPath: 'tav_tips' } }, dom).length, 1],
		];
		for (const [label, got, want] of cases) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		// 消费可数：四种形态各一例（有读／零读⇒红／零读已声明⇒通过／声明却已读⇒僵尸）
		const R = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]));
		const cse = [
			['消费·正例：**限定键**有读点（`ev.tav_tips`）→ 通过', auditConsumption(good, R({ 'ev.tav_tips': ['a.twee'] }), [], '').length, 0],
			['消费·零读且未声明 → 红', auditConsumption(good, R({}), [], '').length, 1],
			['消费·零读但已声明（bookkeeping 带理由）→ 通过', auditConsumption(good, R({}), ['tav_tips'], '').length, 0],
			['消费·已声明却真的被读了 → 僵尸豁免红', auditConsumption(good, R({ 'ev.tav_tips': ['a.twee'] }), ['tav_tips'], '').length, 1],
			['消费·域写错（只有 `world.tav_tips` 的读点）⇒ 仍算零消费（#365 口径）', auditConsumption(good, R({ 'world.tav_tips': ['a.twee'] }), [], '').length, 1],
			['消费·笔记 id 被条件引用（`note:n_a`）也算消费', auditConsumption(good, R({}), [], "req: ['note:n_a']").length, 0],
			// #435 前置 0：表行读点（`ruleRowKeys`）也算消费——否则搬家后笔记会被判"零消费"
			['消费·表行 `req` 里的 note id 算消费（经 `ruleRowKeys` 展开到 flagPath）', auditConsumption(good, rowReads([{ id: 'R', req: ['n_a'] }], good), [], '').length, 0],
			['消费·表行**没有**指向它的读点 ⇒ 仍算零消费（反沉默）', auditConsumption(good, rowReads([{ id: 'R', req: ['n_other'] }], good), [], '').length, 1],
		];
		// `#437` 批三 C-2b′：`<<notepath>>` 判据（path 合法性 · 多源必须显式声明）
		const multi = { n_hall: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: ['world.hall_hint', 'ev.hall_seen'] } };
		const single = { n_one: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
		const npc = [
			['notepath·正例：path 属于该笔记 ==> 0 项', notepathProblems({ entries: multi, sources: { 'a.twee': '<<notepath "n_hall" "ev.hall_seen">>' } }).length, 0],
			['notepath·🔴 path 不属于该笔记（typo）⇒ 报', notepathProblems({ entries: multi, sources: { 'a.twee': '<<notepath "n_hall" "ev.typo">>' } }).length, 1],
			['notepath·🔴 笔记 id 未登记 ⇒ 报', notepathProblems({ entries: single, sources: { 'a.twee': '<<notepath "n_nope" "ev.tav_tips">>' } }).length, 1],
			['notepath·🔴 多源笔记用 `<<note>>` ⇒ 报（必须声明写哪一条）', notepathProblems({ entries: { ...multi, ...single }, sources: { 'a.twee': '<<note "n_hall">>' } }).length, 1],
			['notepath·正例：单源笔记用 `<<note>>` ⇒ 不报', notepathProblems({ entries: single, sources: { 'a.twee': '<<note "n_one">>' } }).length, 0],
			['notepath·边界：多源**声明了 setPath** ⇒ `<<note>>` 合法（不搞一刀切）', notepathProblems({ entries: { n_hall: { ...multi.n_hall, setPath: 'ev.hall_seen' } }, sources: { 'a.twee': '<<note "n_hall">>' } }).length, 0],
			['notepath·边界：注释里的 `<<notepath>>` 示例不算（遮注释）', notepathProblems({ entries: single, sources: { 'a.twee': '/% 例：<<notepath "n_one" "ev.wrong">> %/' } }).length, 0],
		];
		// `#437` C-2c-3：单源笔记不得用 `readPath` 读（多源保留）
		const ent = {
			n_one: { flagPath: 'ev.one' },
			n_multi: { flagPath: ['world.m1', 'ev.m2'] },
		};
		const srp = [
			['单源读点·正例：`has(id)` ⇒ 不报', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.has('n_one')" } }).length, 0],
			['单源读点·🔴 单源笔记用 `readPath` ⇒ 报（基线外）', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.readPath(pc, 'ev.one')" } }).length, 1],
			['单源读点·✅ 基线内 ⇒ 不报（带移除计划，允许过渡）', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.readPath(pc, 'ev.one')" }, baseline: { 'a.twee::ev.one': 'C-2c-3 待搬' } }).length, 0],
			['单源读点·🔴 基线腐烂（已修好还留着基线）⇒ 报', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.has('n_one')" }, baseline: { 'a.twee::ev.one': 'C-2c-3 待搬' } }).length, 1],
			['单源读点·边界：**多源**笔记用 `readPath` ⇒ **不报**（那是"哪一条路径"的语义，必须保留）', singleReadProblems({ entries: ent, sources: { 'a.twee': "Sg.notes.readPath(pc, 'ev.m2')" } }).length, 0],
		];
		for (const [label, got, want] of srp) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		for (const [label, got, want] of npc) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
		for (const [label, got, want] of cases.length === 0 ? [] : cse) {
			const ok = got === want;
			if (!ok) bad++;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
		}
	}

	// ── 真实数据 ──
	const bk = ctx.Game.State?.bookkeeping ?? [];
	const shape = auditShape(entries, domainKeys);
	const cons = auditConsumption(entries, reads, bk, allText);
	const nps = notepathProblems({ entries, sources });   // `#437` C-2b′：`<<notepath>>` 的 path/多源判据
	const srps = singleReadProblems({ entries, sources, baseline: SINGLE_READ_BASELINE });   // `#437` C-2c-3
	// 空状态下不得"已知"（笔记不该一开局就成立）——按 flagPath 求值验证（多源 OR：每条路径都不得为真）
	const emptyProblems = [];
	{
		const empty = { ev: {}, world: {}, inv: {} };
		for (const [id, e] of Object.entries(entries)) {
			for (const p of flagPaths(e)) {
				let cur = empty;
				for (const seg of String(p).split('.')) { cur = cur == null ? undefined : cur[seg]; }
				if (cur) emptyProblems.push({ id, detail: `flagPath「${p}」在空状态下为真（写死？）` });
			}
		}
	}
	// 接入契约（#436-b）：`Sg.notes` 必须经故事注册的提供者取表；结构缺失／形状畸形 ⇒ 报错（行为化验证）
	const contract = [];
	{
		const Sg = ctx.Sg;
		const story = Sg?.story;
		const realNotes = story?.notes;
		if (typeof realNotes !== 'function') contract.push({ id: 'Sg.story.notes', detail: '故事未注册 `Sg.story.notes()`（接入契约 #436-b/#441-E）' });
		else {
			try {
				const probe = { n_probe: { title: 't', src: 's', body: 'b', tags: ['x'], era: 'present', flagPath: 'ev.tav_tips' } };
				story.notes = () => probe;
				const viaContract = Sg.notes.ids().join() === 'n_probe';   // 换提供者 ⇒ 立刻跟着变＝确实经契约
				story.notes = () => null;
				let threwNull = '';
				try { Sg.notes.ids(); } catch (e) { threwNull = String(e.message); }
				story.notes = () => [];
				let threwArr = '';
				try { Sg.notes.ids(); } catch (e) { threwArr = String(e.message); }
				story.notes = () => ({});
				let emptyOk = false;
				try { emptyOk = Sg.notes.ids().length === 0; } catch { /* 不该抛 */ }
				story.notes = () => { throw new Error('提供者内部炸'); };
				let threwFn = '';
				try { Sg.notes.ids(); } catch (e) { threwFn = String(e.message); }
				story.notes = realNotes;   // **复原**（后面还要用真表）
				if (!viaContract) contract.push({ id: 'Sg.notes', detail: '`Sg.notes` 未经 `Sg.story.notes()` 取表（换提供者后结果没变）' });
				if (!threwNull.includes('结构畸形')) contract.push({ id: 'Sg.notes', detail: '提供者返回 `null` 未报错（形状不对 ≠ 空表）' });
				if (!threwArr.includes('结构畸形')) contract.push({ id: 'Sg.notes', detail: '提供者返回数组未报错' });
				if (!emptyOk) contract.push({ id: 'Sg.notes', detail: '提供者返回 `{}` 应视为合法空表' });
				if (!threwFn) contract.push({ id: 'Sg.notes', detail: '提供者内部抛错应向上传播（不许静默吞）' });
			} catch (e) { contract.push({ id: 'Sg.notes', detail: `接入契约检查自身异常（${String(e.message).slice(0, 60)}）` }); }
			finally { story.notes = realNotes; }
		}
		if (!Array.isArray(ctx.Sg?.story?.rules?.())) contract.push({ id: 'Sg.story.rules', detail: '`Sg.story.rules()` 应返回数组（阶段 4／#435 的占位契约）' });
	}

	const printed = [...shape, ...emptyProblems, ...contract, ...cons, ...nps, ...srps];
	console.log(`  笔记 ${Object.keys(entries).length} 条｜状态契约域键 ${domainKeys.size} 个｜零消费豁免 ${bk.filter((k) => Object.values(entries).some((e) => flagPaths(e).map(keyOf).includes(k))).length} 条`);
	if (!printed.length) console.log('  ✓ 形状齐全 · flagPath 与域表对齐 · 空状态不为真 · 接入契约成立 · 每条笔记都有消费点 · `<<notepath>>` 的 path 合法且多源已显式声明');
	for (const p of printed.slice(0, 12)) { console.log(`  ✗ ${p.id}：${p.detail}`); bad++; }
	if (printed.length > 12) { console.log(`  …另有 ${printed.length - 12} 项`); bad += printed.length - 12; }

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 笔记模型门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 笔记模型门通过（形状/对齐 + 接入契约 + 消费可数 + `notepath` path/多源 + 自证）');
	}
};
