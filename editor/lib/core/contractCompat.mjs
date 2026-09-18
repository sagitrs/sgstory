// 车道 G 前半 · 切片 1c（`#215` 报备 `18503697` ＋ 开工报备 `18503987`；形状经 `18503703` 批准 ✓）：
// **`N-1` 兼容层 —— 上限 ＋ 退出条件** ✓。
//
// ⚠️ **声明一（本片交的是什么 ✗ —— 最要紧的一条，先说不算什么 ✓）**：
//   本件**不交**"读 `N-1` 的字段映射" ✗ —— 因为**今天一个 `N-1` 的包都不存在** ✓
//   （`CURRENT ＝ 1` ⇒ `N-1 ＝ 0`，而 **0 号方言不存在** ✓）⇒ 写映射就是**编** ✗。
//   本件交的是**规则与哨兵** ✓：**今天就能假** ✓（合成夹具 ＋ 注入 `current` ✓，经 `18503703` 裁定 ✓），
//   而将来那次真的破坏性改方言时，**只需照表填一行** ✓。
//
// ⚠️ **声明二（三件哨兵的边界，如实写明 ✗ —— ㉑／㉕）**：
//   ① **上限**：只认 `CURRENT-1` ✓ ⇒ 更旧（`current-2`）**可机检** ✓（本件抛 ✗）；
//   ② **条目必填**：`reason`／`ticket`／`retireWhen` **可机检** ✓；
//   ③ **反向哨兵**：本件判的是「**仓内**已无旧消费者、而条目还在 ⇒ 该删」✓；
//      ⚠️ **仓外**的旧包（浏览器里存的、导出的文件 ✓）**不可机检** ✗ ⇒ 那一半**靠 `ticket`／`reason` 的人审锚** ✓；
//      ⚠️ 「**一个发布周期**」**判不了** ✗（经 `18503703` 明批 ✓）⇒ 落成 `reason ＋ ticket ＋ 删除计划` ✓，
//      **本件不假装能判它** ✗。
//
// ⚠️ **声明二附（`{ external: … }` 的来由 ✗ —— 量出来的，不是想出来的 ✓）**：
//   1b 要求「**每个故事的号必须 == `CURRENT`**」✗ ⇒ **改号那一刻“三故事已全在新面”立刻成立** ✓
//   ⇒ 一条**只为“仓外旧包”**登记的条目会被自己的退出条件**当场打红** ✗（＝**写不出一条能留的条目** ✗）
//   ⇒ 故本件补 `{ external: … }` 这一类 ✓（经 `18504264` 裁「**并进 notes 片**」✓）。
//
// ⚠️ **声明三（为什么是"镜像"而不是"新造" ✓ —— 单一权威 ✗）**：
//   三件式（**清单外出现 ⇒ 红** ／ **登记腐烂 ⇒ 红** ／ **条目带理由＋票号** ✓）取自
//   `editor/escape-hatch.json` ＋ `lib/core/k4criteria.mjs::escapeHatchProblems()` 的既有形状 ✓
//   ⇒ 本件**只镜像其形状** ✓，**不改**那套 ✗（它继续管它那个面 ✓）。
//   `retireWhen.storiesAtLeast` 的语义来源 ✓：`docs/superpowers/specs/editor-pivot.md` §2 的
//   **L1 结构等价／L2 门等价／L3 形式等价** ✓（`test-plan.mjs` 的 `editor-equiv-*` 四段在册可跑 ✓）
//   ⇒ 本件把它写成**机器可判的等价形式**（"三故事全部升到新面"✓，与门全绿同向 ✓）。
//
// **浏览器安全** ✓：零宿主 import ✓（`core/**` 老规矩 ✓）。**本件不 import `story.mjs`／`contractVersion.mjs`** ✓
//   （`current` 与 `DECLARED` 由调用点注入 ⇒ 保持叶子件 ＋ 无环 ✓）。

/** **兼容上限**：只保 **1 代** ✓（`N-1` ✓；**不保 `N-2`** ✗）。 */
export const COMPAT_LIMIT = 1;

/** 本版允许读取的旧方言号 ✓ —— **只返回 `[current-1]`** ✓（`current <= 1` ⇒ 空 ✓：没有更旧的可读 ✓）。
 *  ⚠️ 这是"上限"那半的**唯一**出口 ✗ —— 想读更旧 ⇒ 走 `requireCompatVersion()` 的抛 ✓。 */
export const compatVersionsFor = (current) => {
	if (!Number.isInteger(current) || current < 1) throw new Error(`兼容层：current 必须是正整数 ✗（收到 ${JSON.stringify(current)}）`);
	return current - 1 >= 1 ? [current - 1] : [];
};

/** **要读一个具体旧号**：在允许集内 ⇒ 放行 ✓；否则 ⇒ **讲人话地抛** ✗（**不静默降级** ✗ —— 与 `loader.mjs`
 *  「缺文件不许当空内容」同款 ✓）。报文**点名「只保 1 代」** ✓（否则读的人得去翻常量 ✓）。 */
export const requireCompatVersion = (from, current) => {
	const allowed = compatVersionsFor(current);
	if (!allowed.includes(from)) {
		throw new Error(`兼容层：读不了方言号 ${JSON.stringify(from)} ✗ —— 当前 ${current} ✓，**只保 1 代**（可读 ${allowed.length ? allowed.join('／') : '（无）'}）✗`);
	}
	return from;
};

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** **本件认识的两类谓词** ✓（认得少但**认得准** ✗）：
 *  `{ storiesAtLeast: n }` ⇒ **可机检**（仓内已全升到新面 ✓）；
 *  `{ external: '<理由>' }` ⇒ **不可机检**（存留理由是**仓外**还有消费者 ✓）⇒ **永不自动退场** ✓，
 *  但仍必须带 `ticket`（`judgeCompatEntries` 已强制 ✓）⇒ 机器只拦“**没票号的仓外理由**” ✓。 */
export const predicateKindOf = (retireWhen) => {
	if (!isPlainObject(retireWhen)) return null;
	if (Number.isInteger(retireWhen.storiesAtLeast)) return 'storiesAtLeast';
	if (typeof retireWhen.external === 'string' && retireWhen.external) return 'external';
	return null;
};

/** **条目形式** ✓：三条必填（`reason`／`ticket`／`retireWhen` ✓）＋ `retireWhen` 必须是**本件认识的谓词** ✓。
 *  镜像 `escapeHatchProblems()` 的"登记条目自身必须带理由与票号"那一条 ✓。 */
export const judgeCompatEntries = (entries = []) => {
	const out = [];
	if (!Array.isArray(entries)) return [{ kind: 'shape', detail: '`entries` 不是数组 ✗' }];
	for (const [i, e] of entries.entries()) {
		const at = `entries[${i}]`;
		if (!isPlainObject(e)) { out.push({ kind: 'shape', at, detail: `${at} 不是对象 ✗` }); continue; }
		if (!Number.isInteger(e.from) || e.from < 1) out.push({ kind: 'from', at, detail: `${at} 的 \`from\` 必须是正整数 ✗（旧方言号 ✓）：${JSON.stringify(e.from)}` });
		for (const k of ['reason', 'ticket', 'retireWhen']) {
			if (e[k] === undefined || e[k] === null || e[k] === '') out.push({ kind: 'required', at, field: k, detail: `${at} 缺 \`${k}\` ✗（例外必须可追：理由 ＋ 票号 ＋ **退出条件** ✓）` });
		}
		if (e.retireWhen !== undefined && e.retireWhen !== null && !predicateKindOf(e.retireWhen)) {
			out.push({ kind: 'predicate', at, detail: `${at} 的 \`retireWhen\` 谓词本件不认识 ✗：${JSON.stringify(e.retireWhen)}（只认 \`{ "storiesAtLeast": n }\` 或 \`{ "external": "<理由>" }\` ✓）` });
		}
	}
	return out;
};

/** **求值 `retireWhen`** ✓（只对**可机检**那一类求值 ✗）：
 *  `{ storiesAtLeast: n }` ⇒ **所有故事的 `contractVersion` 都 ≥ n** ✓（读不出号的故事 ⇒ 视为**未达** ✓，不静默算过 ✗）；
 *  `{ external: … }` ⇒ **恒 `false`** ✓（**仓外不可机检 ⇒ 永不自动退场** ✓ —— 那一半靠 `ticket` 的人审锚 ✓）。 */
export const retireWhenMet = (retireWhen, storyVersions = []) => {
	if (predicateKindOf(retireWhen) !== 'storiesAtLeast') return false;
	if (!storyVersions.length) return false;
	return storyVersions.every((v) => Number.isInteger(v) && v >= retireWhen.storiesAtLeast);
};

/** **反向哨兵** ✓（＝ `escapeHatchProblems` 的"**登记腐烂 ⇒ 红**"同构 ✓）：
 *  一条登记的**存活理由**是"还有人要读旧号"✓ ⇒ **当 `retireWhen` 已成立**（＝仓内已全升到新面 ✓）
 *  而条目**还在** ⇒ **该删了** ✗ ⇒ 红 ✓。
 *  ⚠️ **只判仓内那一半** ✗（仓外的旧包不可机检 ✓ —— 见件头声明二③ ✓）；`ticket` 是人审锚 ✓。 */
export const retireProblems = ({ entries = [], storyVersions = [], current } = {}) => {
	const out = [];
	for (const [i, e] of (Array.isArray(entries) ? entries : []).entries()) {
		if (retireWhenMet(e?.retireWhen, storyVersions)) {
			out.push({ kind: 'retired', at: `entries[${i}]`, detail: `兼容条目 \`from: ${JSON.stringify(e?.from)}\` 的退出条件（\`storiesAtLeast: ${e?.retireWhen?.storiesAtLeast}\`）**已成立** ✗ 而条目还在 ✓ ⇒ **该删了**（仓内已无旧消费者；仓外那半请按 \`ticket\` 的人审锚判 ✓）` });
		}
		if (Number.isInteger(current) && Number.isInteger(e?.from) && !compatVersionsFor(current).includes(e.from)) {
			const allowed = compatVersionsFor(current);
			const allowedMsg = allowed.length ? allowed.map(String).join('／') : '（无）';   // `#952` 票内的复核 MINOR：写死的「（无）」在 current ≥ 2 时会**指错对象** ⇒ 改成**算出来的**
			out.push({ kind: 'out-of-range', at: `entries[${i}]`, detail: `兼容条目 \`from: ${e.from}\` 越出上限 ✗（当前 ${current} ⇒ 可读 ${allowedMsg}；**只保 1 代** ✓）—— 要么删条目，要么那是一次真的改号（须走 G-1b 的显式改号流程 ✓）` });
		}
	}
	return out;
};

/** 读数行 ✓（逐条列 ✗ —— 不是只报个数 ✓）。 */
export const formatCompat = ({ entries = [], current } = {}) => {
	const L = [];
	const allowed = Number.isInteger(current) ? compatVersionsFor(current) : [];
	L.push(`兼容层：上限 **${COMPAT_LIMIT} 代** ✓（当前 ${current} ⇒ 可读 ${allowed.length ? allowed.join('／') : '（无 —— 没有更旧的方言 ✓）'}）`);
	L.push(`登记条目：${Array.isArray(entries) ? entries.length : 0} 条 ✓（**今天为空** ⇒ 规则与哨兵先行 ✓）`);
	for (const [i, e] of (Array.isArray(entries) ? entries : []).entries()) L.push(`  · entries[${i}]：from ${JSON.stringify(e?.from)} ⇒ ticket ${JSON.stringify(e?.ticket)} ｜ retireWhen ${JSON.stringify(e?.retireWhen)}`);
	return L;
};
