// audit 跨门共享 helper（#316 第 2 步）：被 ≥2 个门使用的定义集中于此，由壳注入 ctx。
// 清单：build/_shared_list.json（收敛循环自动发现）。
export const makeShared = (ctx) => {
	const { Game, Rules, Pc, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll } = ctx;
	function classifyNarrativeState() {
		// 注释（/% … %/）里的示例不是代码——先剥离，免得把文档里的 <<firstTime "X">> 当成真写入
		const stripped = new Map([...passageSrc.entries()].map(([n, src]) => [n, src.replace(/\/%[\s\S]*?%\//g, ' ')]));
		const isEngine = (name) => !!passageTags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
		const isEnding = (name) => name.startsWith('结局');
		const hasIf = (src, flag) => new RegExp(`<<if[^>]*\\$pc\\.(?:world|ev)\\.${flag}\\b`).test(src);
		const written = new Set();
		for (const src of stripped.values()) {
			for (const m of src.matchAll(/<<setflag\s+"(\w+)"/g)) written.add(m[1]);
			for (const m of src.matchAll(/<<set\s+\$pc\.(?:world|ev)\.(\w+)\s*to/g)) written.add(m[1]);
			for (const m of src.matchAll(/pc\.(?:world|ev)\.(\w+)\s*=\s*true/g)) written.add(m[1]);
			for (const m of src.matchAll(/pc\.(?:world|ev)\[["'](\w+)["']\]\s*=\s*true/g)) written.add(m[1]);
			// #267：宏式写入（键是字面量参数）——<<firstTime "X">> 走 $pc.ev[X]，静态 set 正则看不见
			for (const m of src.matchAll(/<<firstTime\s+"(\w+)">>/g)) written.add(m[1]);
		}
		const E = Game.Echoes;
		const echoFlags = new Set([...E.list.flatMap((e) => [e.cause.flag, e.cause.token]), ...E.revisit.flatMap((r) => [r.flag, r.inv])].filter(Boolean));
		const tblSrc = passageSrc.get('Game Tables') ?? '';
		const codexFlags = new Set([...tblSrc.matchAll(/p\.(?:ev|world)\??\.(\w+)/g)].map((m) => m[1]));
		const decl = { ...(Game.Consequences?.provenance ?? {}), ...(Game.Consequences?.engine ?? {}) };
		const prop = { ...(Game.Consequences?.provenance ?? {}) };
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
		const mod = site.abil ? Rules.save_mod_for_audit ?? Rules.abilityMod(pc, site.abil) : Rules.skillMod(pc, site.skill);
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
