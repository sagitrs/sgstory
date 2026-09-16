// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['sel', 'gear']。校验：npm run audit:golden。
export const flag = 'sel';
export const flags = ["sel", "gear"];

import { noteWriteFlags } from '../../../scripts/../scripts/audit/lib/shared.mjs';
// ── 判据纯函数（#342 F2 自证：主跑与自证共用同一份代码）──────────────────────
/** 装备"有效果"：要么进伤害，要么给优势位点（canon §5.4） */
export const gearEffectOK = (d) => (d.damage ?? 0) > 0 || (d.advSites ?? []).length > 0;
/** 装备"发得出来"：表驱动 `gear: ['x']` 或运行时 `gear.push('x')` */
export const gearGranted = (k, srcAll) =>
	new RegExp(`gear:\\s*\\[[^\\]]*['"]${k}['"]`).test(srcAll) || srcAll.includes(`gear.push('${k}')`);
/** 经济事件落点声明的合法 kind —— 写错（如 'givs'）会让下面所有分支都不命中 ⇒ **静默不检**，故单列一条判据 */
export const CLAIM_KINDS = ['gives', 'flag', 'item', 'income'];
export const claimKindBad = (claim) => !CLAIM_KINDS.includes(claim?.kind);
/** 纯函数：经济事件"钱花出去有没有落地"（socialSettles 注入 ⇒ 可自证） */
export const econLandingVerdict = ({ claim, ev, text, socialSettles = () => false, noteFlags = new Set(), declFlags = new Set() }) => {
	if (!claim) return 'no-claim';
	if (claimKindBad(claim)) return 'bad-kind';
	const flagTail = (claim.flag ?? '').replace(/^ev\./, '');
	if (claim.kind === 'gives' && !ev.gives) return 'no-gives';
	// #434 阶段 3：落旗标的**第三种形状** —— `Sg.notes.add('n_x')`（写的是该笔记 flagPath 的键）。
	// 口径走单一权威 `noteWriteFlags()`（与 `--state`／D2 同一份），别在这里再写一套字面量。
	const byNote = noteFlags.has(flagTail);
	if (claim.kind === 'flag' && !(text.includes(`setflag "${claim.flag}"`) || text.includes(`${flagTail} to true`) || byNote || declFlags.has(flagTail)) && !socialSettles(flagTail, null)) return 'no-flag';
	if (claim.kind === 'item' && !text.includes(`give "${claim.item}"`) && !socialSettles(null, claim.item)) return 'no-item';
	if (claim.kind === 'income' && !(ev.delta > 0)) return 'income-negative';
	return null;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪j 行囊门 + 经济门（A1/A2/A5）：花了钱、带在身上的，必须真的有用 ──
//    行囊＝职业装备（长剑 / 火把），不进口具表（canon §5.0 仍是 10 件），但必须进数值。
if (wantAll || arg('sel') || arg('gear')) {
	console.log('\n══ ⓪j 行囊门 + 经济门——钱花出去、东西带在身上，都要落到机制上 ══');
	let bad = 0;
	const srcAll = SRC_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
	const gearRows = Game.Gear?.defs ?? {};

	// ① 每件行囊：有来源、有说法、有效果、发得出来、优势位点真实
	for (const [k, d] of Object.entries(gearRows)) {
		if (!d.from || !d.note || !gearEffectOK(d)) { console.log(`  ✗ 行囊「${k}」缺来源/说法/效果`); bad++; }
		for (const s of d.advSites ?? []) {
			if (!Game.Checks.sites[s]) { console.log(`  ✗ 行囊「${k}」的优势位点在位点表里不存在：${s}`); bad++; }
		}
		if (!gearGranted(k, srcAll)) { console.log(`  ✗ 行囊「${k}」没有任何发放点（说了有、没人给）`); bad++; }
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
			const stub = ctx.Game.Pc.defaults();
			stub.inv = {}; stub.ev = {}; stub.world = {}; stub.keeper = { met: false, trust: 0, state: 'post', key: false };
			try {
				// `#785`：效果有**三级优先**（契约钩子 ⇒ 函数 ⇒ 声明）⇒ 判定必须走**引擎那条路**；
				// 直调 `u.ask.apply` 在声明式数据下会**静默不落**（实测：门报「正文没落旗标」）。
				const applyEffect = ctx.Game?.Social?.applyAskEffect;
				for (const lv2 of u.ask.levers ?? []) if (typeof lv2.need !== 'function' || lv2.need(stub)) {
					if (typeof applyEffect === 'function') applyEffect(u.ask, stub); else u.ask.apply?.(stub);
				}
			} catch { /* 条件不满足就算了 */ }
			// `#733` 片 2-b：翻面后 `apply()` **不再写单源旗标** ⇒ 落点判据必须也能看**笔记存储**
			//（`Sg.notes.add(id, stub)` 会把 `stub.ev.notes[id]` 置真）；旗标那一支保留（多源笔记仍写旗标 ✓）。
			const flagHit = flagTail && (stub.ev?.[flagTail] === true || stub.world?.[flagTail] === true);
			const noteHit = flagTail && Object.entries(ctx.Game.Notes?.entries ?? {}).some(([id, e]) => {
				const fp = Array.isArray(e?.flagPath) ? e.flagPath : [e?.flagPath];
				return fp.some((x) => String(x).replace(/^(ev|world)\./, '') === flagTail) && stub.ev?.notes?.[id] === true;
			});
			if (flagHit || noteHit) return true;
			if (item && stub.inv?.[item]) return true;
		}
		return false;
	};
	// `#785` 机制片：状态旗标现在可以**由声明落地**（ask 的 `sets`）⇒ 落点判据的**证据集**要含它
	//（含义不变：旗标终究要落地；只是【落地】多了一种载体）。
	const declFlags = new Set();
	for (const a of Game.Social?.asks ?? []) {
		for (const k of [a.sets ?? []].flat()) declFlags.add(String(k).replace(/^(ev|world)\./, ''));
		// 声明式**笔记授予**（`yields: ['n_x']`）⇒ 该笔记的 `flagPath` 旗标也是落地证据 ✓（单一权威：`Notes.entries` ✓）
		for (const y of [a.yields ?? []].flat()) {
			const e = Game.Notes?.entries?.[String(y).replace(/^note:/, '')];
			for (const fp of [e?.flagPath ?? []].flat()) declFlags.add(String(fp).replace(/^(ev|world)\./, ''));
		}
	}
	for (const [key, ev] of Object.entries(Game.Economy.events)) {
		const c = CLAIM[key];
		const uses = rows.filter(([, line]) => line.includes(`econ "${key}"`));
		const leverOk = leverUses.some((u) => u.lever.econ === key);
		if (!c) { console.log(`  ✗ 经济事件「${key}」没声明落点——要么给出东西，要么在 CLAIM 里写理由`); bad++; continue; }
		if (uses.length === 0 && !leverOk) { console.log(`  ✗ 经济事件「${key}」没有任何使用点（表里挂着、正文没花）；或去掉。）`); bad++; continue; }
		const text = uses.map(([f, line]) => line).join('\n');
		const CLAIM_MSG = {
			'no-gives': '表里没写 gives',
			'bad-kind': `落点声明 kind=${JSON.stringify(c.kind)} 不合法（只能是 ${CLAIM_KINDS.join(' / ')}）——写错会让所有分支都不命中、静默不检`,
			'no-flag': `正文没落旗标 ${c.flag}（正文与交涉筹码都没落到）`,
			'no-item': `正文没给道具 ${c.item}`,
			'income-negative': '写成纯收入却是扣钱',
		};
		const v = econLandingVerdict({ claim: c, ev, text, socialSettles, noteFlags: new Set(noteWriteFlags(text, Game.Notes?.entries ?? {})), declFlags });
		if (v) { console.log(`  ✗ 经济事件「${key}」${CLAIM_MSG[v] ?? v}`); bad++; }
	}
	{
		const cases = [
			['行囊效果正例：有伤害 / 有优势位点 → 有效果', gearEffectOK({ damage: 3 }) && gearEffectOK({ advSites: ['书房'] })],
			['行囊效果反例：既无伤害也无优势位点 → 报红', !gearEffectOK({ note: '好看' })],
			['行囊效果边界：damage=0 且有优势位点 → 有效果（0 不算效果）', gearEffectOK({ damage: 0, advSites: ['甲'] })],
			['发放点正例：表驱动 gear: [\'长剑\'] → 发得出来', gearGranted('长剑', "gear: ['长剑', '火把']")],
			['发放点正例：运行时 gear.push(\'火把\') → 发得出来', gearGranted('火把', "pc.gear.push('火把')")],
			['发放点反例：只提名字、没有发放 → 报红', !gearGranted('长剑', '长剑很好看')],
			['落点反例①：没声明 → no-claim', econLandingVerdict({ claim: null, ev: {} }) === 'no-claim'],
			['落点反例②：kind 写错成 givs → bad-kind（**旧版会静默不检**）', econLandingVerdict({ claim: { kind: 'givs' }, ev: { gives: 1 } }) === 'bad-kind'],
			['落点正例①：flag 落 setflag → 通过', econLandingVerdict({ claim: { kind: 'flag', flag: 'rumor' }, ev: {}, text: 'setflag "rumor"' }) === null],
			// #434 阶段 3：落旗标的第三种形状（经 `Sg.notes.add`）
			['落点正例③：flag 经 `Sg.notes.add` 落（noteFlags 注入）→ 通过', econLandingVerdict({ claim: { kind: 'flag', flag: 'rumor' }, ev: {}, text: "Sg.notes.add('n_rumor')", noteFlags: new Set(['rumor']) }) === null],
			['落点反例③：文本里有 `Sg.notes.add` 但**没给 noteFlags** ⇒ 仍判 no-flag（防"看见了就放行"）', econLandingVerdict({ claim: { kind: 'flag', flag: 'rumor' }, ev: {}, text: "Sg.notes.add('n_rumor')" }) === 'no-flag'],
			['落点正例②：flag 走交涉筹码（socialSettles 注入）→ 通过', econLandingVerdict({ claim: { kind: 'flag', flag: 'ev.tav_tips' }, ev: {}, text: '', socialSettles: (f) => f === 'tav_tips' }) === null],
			['落点反例③：flag 哪都没落 → no-flag', econLandingVerdict({ claim: { kind: 'flag', flag: 'ev.tav_tips' }, ev: {}, text: '' }) === 'no-flag'],
			['落点正例③：item 落 give → 通过', econLandingVerdict({ claim: { kind: 'item', item: '龙鳞护臂' }, ev: {}, text: 'give "龙鳞护臂"' }) === null],
			['落点反例④：income 却是扣钱 → income-negative', econLandingVerdict({ claim: { kind: 'income' }, ev: { delta: -3 }, text: '' }) === 'income-negative'],
			['落点正例④：gives 声明且表里有 gives → 通过', econLandingVerdict({ claim: { kind: 'gives' }, ev: { gives: 2 }, text: '' }) === null],
			['落点反例⑤：gives 声明但表里没有 → no-gives', econLandingVerdict({ claim: { kind: 'gives' }, ev: {}, text: '' }) === 'no-gives'],
		];
		for (const [label, pass] of cases) { console.log(`      ${pass ? '✓' : '✗'} 自证·${label}`); if (!pass) bad++; }
		console.log(`      自证·检出 ${cases.filter(([, p]) => p).length}（期望 ${cases.length}）`);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 行囊门 + 经济门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 行囊门 + 经济门通过（装备有来源有效果 · 每笔钱都落到东西/旗标上）');
	}
}
};
