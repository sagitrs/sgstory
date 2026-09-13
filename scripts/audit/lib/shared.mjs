// audit 跨门共享 helper（#316 第 2 步）：被 ≥2 个门使用的定义集中于此，由壳注入 ctx。
// 清单：build/_shared_list.json（收敛循环自动发现）。
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
		const hasIf = (src, flag) => new RegExp(`<<if[^>]*\\$pc\\.(?:world|ev)\\.${flag}\\b`).test(src);
		const written = new Set();
		for (const src of stripped.values()) {
			for (const m of src.matchAll(/<<setflag\s+"(\w+)"/g)) written.add(m[1]);
			for (const m of src.matchAll(/<<set\s+\$pc\.(?:world|ev)\.(\w+)\s*to/g)) written.add(m[1]);
			// 赋值式写入：#441-A 把位点/结算的写点从宏式（`<<set $pc.ev.X to …>>`）改成 JS 赋值后
			// 才发现原判据只认 `= true` ⇒ `= null`／对象／字符串的写点**看不见**（D2 覆盖面静默缩小）。
			// 放宽为「任意赋值」（不含 `==`），与 `state.mjs` 的口径一致。
			for (const m of src.matchAll(/pc\.(?:world|ev)\.([a-z_]\w*)\s*=[^=]/g)) written.add(m[1]);
			for (const m of src.matchAll(/pc\.(?:world|ev)\[["']([a-z_]\w*)["']\]\s*=[^=]/g)) written.add(m[1]);
			// #267：宏式写入（键是字面量参数）——<<firstTime "X">> 走 $pc.ev[X]，静态 set 正则看不见
			for (const m of src.matchAll(/<<firstTime\s+"(\w+)">>/g)) written.add(m[1]);
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
			const narrHit = [...stripped.entries()].some(([n, src]) => !isEngine(n) && !isEnding(n) && hasIf(src, flag));
			const endHit = [...stripped.entries()].some(([n, src]) => isEnding(n) && hasIf(src, flag));
			const engHit = [...stripped.entries()].some(([n, src]) => isEngine(n) && hasIf(src, flag));
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
