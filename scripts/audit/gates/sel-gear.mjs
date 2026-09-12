// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['sel', 'gear']。校验：npm run audit:golden。
export const flag = 'sel';
export const flags = ["sel", "gear"];

export const run = (ctx) => {
	const { Game, Rules, Pc, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪j 行囊门 + 经济门（A1/A2/A5）：花了钱、带在身上的，必须真的有用 ──
//    行囊＝职业装备（长剑 / 火把），不进口具表（canon §5.0 仍是 10 件），但必须进数值。
if (wantAll || arg('sel') || arg('gear')) {
	console.log('\n══ ⓪j 行囊门 + 经济门——钱花出去、东西带在身上，都要落到机制上 ══');
	let bad = 0;
	const srcAll = SRC_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
	const gearRows = Game.Gear?.defs ?? {};

	// ① 每件行囊：有来源、有说法、有效果、发得出来、优势位点真实
	for (const [k, d] of Object.entries(gearRows)) {
		const eff = (d.damage ?? 0) > 0 || (d.advSites ?? []).length > 0;
		if (!d.from || !d.note || !eff) { console.log(`  ✗ 行囊「${k}」缺来源/说法/效果`); bad++; }
		for (const s of d.advSites ?? []) {
			if (!Game.Checks.sites[s]) { console.log(`  ✗ 行囊「${k}」的优势位点在位点表里不存在：${s}`); bad++; }
		}
		const granted = new RegExp(`gear:\\s*\\[[^\\]]*['"]${k}['"]`).test(srcAll) || srcAll.includes(`gear.push('${k}')`);
		if (!granted) { console.log(`  ✗ 行囊「${k}」没有任何发放点（说了有、没人给）`); bad++; }
		console.log(`  · ${k}：${d.note}（${d.from}）`);
	}
	// ② 正文发的行囊必须在表里（不许有表外装备）
	for (const m of srcAll.matchAll(/gear\.push\(['"]([^'"]+)['"]\)/g)) {
		if (!gearRows[m[1]]) { console.log(`  ✗ 正文发了未登记的行囊：${m[1]}`); bad++; }
	}
	for (const m of srcAll.matchAll(/gear:\s*\[([^\]]*)\]/g)) {
		for (const raw of m[1].split(',')) {
			const k = raw.trim().replace(/['"]/g, '');
			if (k && !gearRows[k]) { console.log(`  ✗ 经济表发了未登记的行囊：${k}`); bad++; }
		}
	}

	// ③ 经济事件必须落地：给东西 / 落旗标 / 给道具，或写明"纯收入/纯代价"的理由
	const CLAIM = {
		torch_buy:    { kind: 'gives' },
		salve_buy:    { kind: 'gives' },
		rumor_buy:    { kind: 'flag', flag: 'rumor' },
		witch_hint:   { kind: 'flag', flag: 'witch_hint' },
		goblin_bribe: { kind: 'flag', flag: 'goblin_spared' },
		forged_scale: { kind: 'item', item: '龙鳞护臂' },
		drink_round:  { kind: 'flag', flag: 'ev.tav_tips' },
		goblin_kill:  { kind: 'income', reason: '打跑了才捡得到——纯收入那一侧' },
		study_errand: { kind: 'income', reason: '跑腿钱——纯收入那一侧' },
		dragon_hoard: { kind: 'income', reason: '巢边识货——纯收入那一侧' },
	};
	const rows = SRC_FILES.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line) => [f, line]));
	// 交涉筹码（B2）：levers[].econ 也是经济事件的使用点——落点不靠"同一行里有 setflag"，
	// 而是**真调一次 apply() 看旗标有没有落地**（比行匹配更硬）
	const leverUses = [];
	for (const a of Game.Social?.asks ?? []) for (const lv of a.levers ?? []) if (lv.econ) leverUses.push({ ask: a, lever: lv });
	const socialSettles = (flagTail, item) => {
		for (const u of leverUses) {
			const stub = ctx.Pc.defaults();
			stub.inv = {}; stub.ev = {}; stub.world = {}; stub.keeper = { met: false, trust: 0, state: 'post', key: false };
			try {
				for (const lv2 of u.ask.levers ?? []) if (typeof lv2.need !== 'function' || lv2.need(stub)) u.ask.apply(stub);
			} catch { /* 条件不满足就算了 */ }
			if (flagTail && (stub.ev?.[flagTail] === true || stub.world?.[flagTail] === true)) return true;
			if (item && stub.inv?.[item]) return true;
		}
		return false;
	};
	for (const [key, ev] of Object.entries(Game.Economy.events)) {
		const c = CLAIM[key];
		const uses = rows.filter(([, line]) => line.includes(`econ "${key}"`));
		const leverOk = leverUses.some((u) => u.lever.econ === key);
		if (!c) { console.log(`  ✗ 经济事件「${key}」没声明落点——要么给出东西，要么在 CLAIM 里写理由`); bad++; continue; }
		if (uses.length === 0 && !leverOk) { console.log(`  ✗ 经济事件「${key}」没有任何使用点（表里挂着、正文没花）；或去掉。）`); bad++; continue; }
		const text = uses.map(([f, line]) => line).join('\n');
		const fail = (why) => { console.log(`  ✗ 经济事件「${key}」${why}`); bad++; };
		if (c.kind === 'gives' && !ev.gives) fail('表里没写 gives');
		const flagTail = (c.flag ?? '').replace(/^ev\./, '');
		if (c.kind === 'flag' && !(text.includes(`setflag "${c.flag}"`) || text.includes(`${flagTail} to true`)) && !socialSettles(flagTail, null)) fail(`正文没落旗标 ${c.flag}（正文与交涉筹码都没落到）`);
		if (c.kind === 'item' && !text.includes(`give "${c.item}"`) && !socialSettles(null, c.item)) fail(`正文没给道具 ${c.item}`);
		if (c.kind === 'income' && !(ev.delta > 0)) fail('写成纯收入却是扣钱');
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 行囊门 + 经济门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 行囊门 + 经济门通过（装备有来源有效果 · 每笔钱都落到东西/旗标上）');
	}
}
};
