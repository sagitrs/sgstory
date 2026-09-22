// `#761` 车道 A：**「必须逃生舱」清单**的判据（纯函数 → 无 I/O，输入全部由调用方注入）
//
// 为什么要有这一层：故事**全部由 `data/` 产出**之后，K4 分类器**没有手写输入** →
// 它打出的是 `A0/B0/C0/D0` ＝「**没判**」 —— 而读的人很容易把它读成「判过了、没问题」
//（实测：`hollow-cave` 曾经就是这种**结构性空判**）。空判不许空过 → 用**普查表**
//（`editor/escape-hatch-census.json`：翻面前手写契约的**逐成员去向**）把它补成**能假的**面。
//
// 判据（每条都能被一次真实改动打红）：
// ① **普查非空**：成员清单为空 → 空判空过（不许当通过）
// ② **逐条交代**：每个普查成员要么在**数据面**（`data/contract.json` 的成员），
// 要么记在**下沉引擎**（并给出票号 ＋ 锚点）—— 两边都没有 → 是**漏搬**（静默丢成员）
// ③ **下沉真在场**：记了下沉的，锚点（文件里的符号）必须在**树里读到** ——
// 只在表里写"已下沉"而引擎里没有这个符号 → 表比事实漂亮
// ④ **C 桶双向 ⟺ 登记表**：普查里 C 桶的成员，要么在 `escape-hatch.json` 里登记、
// 要么交代了下沉（两样都没有 → 真逃生舱**没登记**）；反过来，
// 登记表里属于本故事的条目必须是普查里的 C 桶成员（否则＝**登记腐烂**，清单只许收缩）
export const censusOfStory = (census, slug) => census?.stories?.[slug] ?? null;

export const censusSummarize = (story) => {
	const members = story?.members ?? [];
	const counts = members.reduce((acc, m) => { acc[m.bucket] = (acc[m.bucket] ?? 0) + 1; return acc; }, {});
	return {
		members: members.length,
		counts,
		sinks: (story?.engineSinks ?? []).length,
		hatches: (story?.escapeHatches ?? []).length,
	};
};

export const censusProblems = ({ census, slug, dataMembers = [], engineSymbols = {}, registry = null } = {}) => {
	const bad = [];
	const story = censusOfStory(census, slug);
	if (!story) return bad;                       // 未普查的故事：由调用方**留痕打印**（不假装判过），这里不报
	const members = story.members ?? [];
	if (!members.length) {
		bad.push({ code: 'census-empty', why: '普查表**没有成员** ⇒ 空判空过（空表不许当"没有逃生舱" ✗）' });
		return bad;
	}
	const data = new Set(dataMembers);
	const sinks = new Map((story.engineSinks ?? []).map((s) => [s.member, s]));
	const cSet = new Set(members.filter((m) => m.bucket === 'C').map((m) => m.name));
	const entries = ((registry?.hatches ?? [])).filter((h) => (h.slug ?? slug) === slug);
	// ②③ 逐条交代 ＋ 下沉真在场
	for (const m of members) {
		if (data.has(m.name)) continue;
		const sink = sinks.get(m.name);
		if (!sink) {
			// C 桶且没登记 → 下面 ④ 会以**更贴的理由**报一条 → 这里不重复报（同一件事报两遍会让人以为有两处）
			if (cSet.has(m.name) && !entries.some((h) => h.member === m.name)) continue;
			bad.push({ code: 'member-unaccounted', member: m.name, why: `普查成员 \`${m.name}\` **既不在数据面、也没有下沉交代** ⇒ 要么漏搬、要么丢了（两边都不是"没问题" ✗）` });
			continue;
		}
		for (const a of sink.anchors ?? []) {
			if (engineSymbols[a.symbol] !== a.file) {
				bad.push({ code: 'sink-absent', member: m.name, why: `\`${m.name}\` 记的是「已由 \`${sink.ticket}\` 下沉引擎」，但锚点 \`${a.symbol}\` **不在** \`${a.file}\` 里读到 ⇒ 表比事实漂亮 ✗` });
			}
		}
	}
	// ④ C 桶 ⟺ 登记表（双向）
	for (const name of cSet) {
		if (entries.some((h) => h.member === name)) continue;
		if (sinks.has(name)) continue;            // C 桶候选被下沉引擎消化掉 → 不必登记
		bad.push({ code: 'hatch-unregistered', member: name, why: `普查判它是 **C 桶**（含任意逻辑 ✗）却**没登记**在 \`escape-hatch.json\`、也没交代下沉 ⇒ 真逃生舱必须可枚举 ✗` });
	}
	for (const h of entries) {
		if (!cSet.has(h.member)) {
			bad.push({ code: 'registry-rot', member: h.member, why: `\`escape-hatch.json\` 登记了本故事的 \`${h.member}\`，但普查里它**不是** C 桶（甚至不在普查里）⇒ 登记腐烂（清单只许收缩 ⇒ 该删就删 ✓）` });
		}
	}
	return bad;
};
