// ── 写点识别：**单一权威**（#476 复核建议）──────────────────────────────────
// 此前 `shared.mjs`（D2 分类器）与 `gates/state.mjs` 各写一份字面量 ⇒ **漂移过一次**：
// shared 只认 `= true`、state 认任意赋值 ⇒ D2 门看不见 `= null`／对象写点（#476 修的正是这个洞）。
// ⇒ 形态只此一处，两处消费方都从这里取。
// **隐含约束**：旗标键必须匹配 `[a-z_]\w*`（大写/数字开头会被静默漏检）——用 `keyCharsetViolations` 兜住。
export const KEY_CHARSET = /^[a-z_]\w*$/;
export const WRITE_PATTERNS = [
	{ re: /<<setflag\s+"([a-z_]\w*)"/g, kind: 'world' },                 // 宏式写 world 域
	{ re: /<<set\s+\$pc\.(ev|world)\.([a-z_]\w*)\s+to\b/g, kind: 'scoped' },
	{ re: /\bpc\.(ev|world)\.([a-z_]\w*)\s*=[^=]/g, kind: 'scoped' },     // 赋值式（含 `= null`／对象／字符串）
	{ re: /\bpc\.(ev|world)\[["']([a-z_]\w*)["']\]\s*=[^=]/g, kind: 'scoped' },
	{ re: /<<firstTime\s+"([a-z_]\w*)"\s*>>/g, kind: 'ev' },            // 宏式写 ev 域（读一次再写）
];
/** 裸键集合（D2 分类器用）。 */
export const writeKeys = (text) => {
	const out = new Set();
	for (const { re } of WRITE_PATTERNS) for (const m of String(text).matchAll(re)) out.add(m[2] ?? m[1]);
	return out;
};
/** 限定键（`ev.x` / `world.x`；--state 用）。 */
export const qualifiedWriteKeys = (text) => {
	const out = [];
	for (const { re, kind } of WRITE_PATTERNS) for (const m of String(text).matchAll(re)) out.push(kind === 'scoped' ? `${m[1]}.${m[2]}` : `${kind}.${m[1]}`);
	return out;
};
/** 键形态违规：`pc.ev.Bad` 这类键会被上面的正则**静默漏检** ⇒ 单独兜住。 */
// ── 读点形态（与写点同一处权威；`#436` 原范围 1）────────────────────────────
// 三种写法：`$pc.ev.x`（正文/宏）、`pc.ev.x`（裸 JS，如表内函数体）、`p.ev?.x`（表内谓词）。
// **读点必须排除写行**（同一行里出现 `.ev.x =` / `.ev.x to`）——否则"写了没人读"会被算成读过
//（本仓 #365 那类误判的根源；`analyze()` 里的行为逐字保留）。
export const READ_PATTERNS = [
	/\$pc\.(ev|world)\.([a-z_]\w*)/g,
	/\bpc\.(ev|world)\.([a-z_]\w*)/g,
	/\bp\.(ev|world)\??\.([a-z_]\w*)/g,
];
// 单行 → 去重后的**限定键**（`ev.x` / `world.x`）
export const readKeys = (text) => {
	const line = String(text ?? '');
	const out = new Set();
	for (const re of READ_PATTERNS) {
		for (const m of line.matchAll(new RegExp(re.source, 'g'))) {
			const k = `${m[1]}.${m[2]}`;
			if (new RegExp(`\\.${k}\\s*(=|to)\\b`).test(line)) continue;   // 写行不算读
			out.add(k);
		}
	}
	return [...out];
};

export const keyCharsetViolations = (text) =>
	[...String(text).matchAll(/\bpc\.(?:ev|world)\.([A-Za-z_$][\w$]*)/g)].filter((m) => !KEY_CHARSET.test(m[1])).map((m) => m[1]);

// audit 跨门共享 helper（#316 第 2 步）：被 ≥2 个门使用的定义集中于此，由壳注入 ctx。
// 清单：build/_shared_list.json（收敛循环自动发现）。
// ── 笔记引用（`#433` 阶段 2 的读点形状）：`Sg.notes.has('n_x')`／`Sg.notes.entry('n_x')`／`note:n_x` ──
// 为什么放在这里（与写点/读点并列）：阶段 2 把段落条件从 `<<if $pc.ev.X>>` 改成 `Sg.notes.has('n_X')`，
// 于是「谁读了旗标 X」这件事**换了写法但不该消失**——依赖它的门（`--state` 的有写有读、D2 的桶分类）
// 必须跟着认这个形状。否则转发的第一步就会把一堆键判成"只有写"⇒ 门红而代码其实等价（假红）。
// 这就是设计稿那条纪律：**先让门认新形状，再改内容**。
export const NOTE_REF_RE = /Sg\.notes\.(?:has|entry)\(\s*['"](n_[a-z0-9_]+)['"]|(?:^|[^\w:])note:(n_[a-z0-9_]+)/g;
// 文本里引用的笔记 id
export const noteRefs = (text) => {
	const out = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_REF_RE)) out.add(m[1] ?? m[2]);
	return [...out];
};
// 笔记表 → id → flagPath（限定键数组）
export const notePaths = (entries) => {
	const M = new Map();
	for (const [id, e] of Object.entries(entries ?? {})) {
		const fp = Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath ? [e.flagPath] : []);
		M.set(id, fp.map(String));
	}
	return M;
};
// 文本里**经笔记**读到的限定键（`ev.x`/`world.x`）
export const noteReadKeys = (text, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const id of noteRefs(text)) for (const p of (paths.get(id) ?? [])) out.add(p);
	return [...out];
};
// 文本里**经笔记**读到的裸键（D2 按裸键判）
// 旗标（裸键）→ 引用它的笔记 id 数组（`#433`：门按旗标判"谁读了它"时要用）
export const noteIdsForFlag = (entries) => {
	const M = new Map();
	for (const [id, ps] of notePaths(entries)) {
		for (const p of ps) {
			const f = p.replace(/^(ev|world)\./, '');
			if (!M.has(f)) M.set(f, []);
			M.get(f).push(id);
		}
	}
	return M;
};
// **条件文本是否消费了旗标 `flag`**（两种形状，单一权威）：
//   ① 直接读：`$pc.ev.flag` / `$pc.world['flag']`
//   ② 经笔记：`Sg.notes.has('n_flag')`（该笔记的 flagPath 含此旗标）
// `noteIds`：该旗标对应的笔记 id 数组（`noteIdsForFlag()` 的结果，缺省＝只认形状①）
export const conditionReadsFlag = (text, flag, noteIds = []) => {
	if (new RegExp(`(?:world|ev)\\s*(?:\\.|\\[)?["']?${flag}\\b`).test(String(text ?? ''))) return true;
	return noteIds.some((id) => new RegExp(`Sg\\.notes\\.(?:has|entry)\\(\\s*['"]${id}['"]`).test(String(text ?? '')));
};
export const noteReadFlags = (text, entries) => new Set(noteReadKeys(text, entries).map((k) => k.replace(/^(ev|world)\./, '')));

export const makeShared = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll } = ctx;
	// #342 F2：可**注入输入**（默认取闭包里的真实来源 ⇒ 向后兼容）。没有这一层，
	// 依赖本分类器的门（如 ⓪q 选择后果门）只能用真产物自证——那等于"用被测对象证明被测对象"。
	function classifyNarrativeState(input = {}) {
		const sources = input.passageSrc ?? passageSrc;
		const tags = input.passageTags ?? passageTags;
		const Echoes = input.Echoes ?? Game.Echoes;
		const Consequences = input.Consequences ?? Game.Consequences;
		// 注释（/% … %/）里的示例不是代码——先剥离，免得把文档里的 <<firstTime "X">> 当成真写入
		const stripped = new Map([...sources.entries()].map(([n, src]) => [n, src.replace(/\/%[\s\S]*?%\//g, ' ')]));
		const isEngine = (name) => !!tags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
		const isEnding = (name) => name.startsWith('结局');
		// `hasIf`：这一段的**正文条件**是否消费了该旗标。两种形状都认（#433 阶段 2）：
		//   ① 直接读 `<<if … $pc.ev.flag>>`；② 经笔记读 `<<if Sg.notes.has('n_flag')>>`（该笔记的 flagPath 含此旗标）
		const noteEntries = input.notes ?? Game.Notes?.entries ?? {};
		const notePathsById = notePaths(noteEntries);
		const flagsByNote = new Map();
		for (const [id, ps] of notePathsById) for (const p of ps) {
			const f = p.replace(/^(ev|world)\./, '');
			if (!flagsByNote.has(f)) flagsByNote.set(f, []);
			flagsByNote.get(f).push(id);
		}
		const refsByPassage = new Map([...stripped.entries()].map(([n, src]) => [n, new Set(noteRefs(src))]));
		// `(段落名, 源码, 旗标)`：两种形状任一命中即算「这一段消费了该旗标」
		const hasIf = (name, src, flag) => {
			if (new RegExp(`<<if[^>]*\\$pc\\.(?:world|ev)\\.${flag}\\b`).test(src)) return true;
			return (flagsByNote.get(flag) ?? []).some((id) => refsByPassage.get(name)?.has(id));
		};
		const written = new Set();
		for (const src of stripped.values()) {
			// 写点形态来自**单一权威** `WRITE_PATTERNS`（#476 复核建议：两处字面量曾漂移过一次）
			for (const k of writeKeys(src)) written.add(k);
		}
		const E = Echoes;
		const echoFlags = new Set([...E.list.flatMap((e) => [e.cause.flag, e.cause.token]), ...E.revisit.flatMap((r) => [r.flag, r.inv])].filter(Boolean));
		const tblSrc = sources.get('Game Tables') ?? '';
		const codexFlags = new Set([...tblSrc.matchAll(/p\.(?:ev|world)\??\.(\w+)/g)].map((m) => m[1]));
		const decl = { ...(Consequences?.provenance ?? {}), ...(Consequences?.engine ?? {}) };
		const prop = { ...(Consequences?.provenance ?? {}) };
		const buckets = new Map();
		const problems = [];
		for (const flag of written) {
			// 先算派生桶（echo 优先——回声表本身就是登记表），再校验声明是否与实况一致
			const narrHit = [...stripped.entries()].some(([n, src]) => !isEngine(n) && !isEnding(n) && hasIf(n, src, flag));
			const endHit = [...stripped.entries()].some(([n, src]) => isEnding(n) && hasIf(n, src, flag));
			const engHit = [...stripped.entries()].some(([n, src]) => isEngine(n) && hasIf(n, src, flag));
			let derived = null;
			if (echoFlags.has(flag)) derived = 'echo';
			else if (narrHit) derived = 'mechanic';
			else if (endHit) derived = 'ending';
			else if (codexFlags.has(flag)) derived = 'codex';
			else if (engHit) derived = 'engine?';
			if (flag in decl) {
				const claimed = flag in prop ? 'provenance' : 'engine';
				if (derived && derived !== 'engine?') problems.push(`「${flag}」声明为 ${claimed}，但实际属于 ${derived}——错标（声明与实况不一致）`);
				else if (!String(decl[flag] ?? '').trim()) problems.push(`「${flag}」声明缺理由（why）`);
				buckets.set(flag, claimed);
				continue;
			}
			if (derived === 'engine?') { buckets.set(flag, 'engine?'); problems.push(`「${flag}」只在引擎段落被读——请登记为 engine（带理由）或补叙事消费`); continue; }
			if (derived) { buckets.set(flag, derived); continue; }
			buckets.set(flag, 'none');
			problems.push(`「${flag}」无任何桶——无正文消费也无登记（假选择嫌疑）`);
		}
		return { written, buckets, problems };
	}
	function successRate(pc, site, adv) {
		const mod = site.abil ? Game.Rules.save_mod_for_audit ?? Game.Rules.abilityMod(pc, site.abil) : Game.Rules.skillMod(pc, site.skill);
		const single = (r) => (r === 20 ? true : r === 1 ? false : r + mod >= site.dc);
		let win = 0, total = 0;
		for (let a = 1; a <= 20; a++) {
			if (!adv) { total++; if (single(a)) win++; }
			else for (let b = 1; b <= 20; b++) { total++; if (single(Math.max(a, b))) win++; }
		}
		return win / total;
	}

	return { classifyNarrativeState, successRate };
};
