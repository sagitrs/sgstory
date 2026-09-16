// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['social']。校验：npm run audit:golden。
export const flag = 'social';
export const flags = ["social"];

// ── 判据纯函数（#342 F2 自证：主跑与自证共用同一份代码，避免"自证另写一套"）──
// 态度阶梯：DMG 社交交互表压成的那根轴 = 友好 −5 / 冷淡 0 / 敌意 +5，且**恰好三档**
export const attAdjBogus = (adj) => Object.entries(adj ?? {}).filter(([, v]) => ![0, 5, -5].includes(v));
export const attAdjWrongTiers = (adj) => Object.keys(adj ?? {}).length !== 3;
// 筹码给法：只能 auto＝免检 或 adv＝优势
export const leverGivesBad = (gives) => !['auto', 'adv'].includes(gives);
// 失败代价三分类（"代价因手段而异"这条判据的核心）
export const failKindOf = (approach) => (approach?.onFail?.retry ? '重试代价' : (approach?.onFail?.att ? '态度代价' : '无代价'));

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪l 交涉门（B2 · D&D 2024 Influence）：意愿三档 · 手段换属性 · 代价因手段而异 ──
if (wantAll || arg('social')) {
	console.log('\n══ ⓪l 交涉门（B2）——同一句诉求换手段、态度定 DC、代价因手段而异 ══');
	let bad = 0;
	const S = Game.Social;
	if (!S?.asks?.length) { console.log('  ✗ 交涉表不存在'); bad++; }
	const apKeys = Object.keys(S?.approaches ?? {});
	const failKinds = new Set();
	// DC 阶梯：态度修正必须就是 DMG 社交交互表压成的那根轴（友好 −5 / 冷淡 0 / 敌意 +5）
	const bogus = attAdjBogus(S?.attAdj);
	if (bogus.length || attAdjWrongTiers(S?.attAdj)) {
		console.log(`  ✗ 态度修正不是 DMG 表里的 −5/0/+5 三档：${JSON.stringify(S?.attAdj)}`); bad++;
	} else console.log('  态度阶梯：友好 −5 · 冷淡 0 · 敌意 +5（DMG 社交交互表）');
	for (const a of S?.asks ?? []) {
		const opts = [];
		for (const site of a.sites ?? []) {
			const d = Game.Checks.sites[site];
			if (!d) { console.log(`  ✗ 诉求「${a.id}」的开口方式「${site}」不是位点`); bad++; continue; }
			if (d.abil && !S.approaches[d.abil]) { console.log(`  ✗ 位点「${site}」用 ${d.abil} 豁免，但手段表里没有 ${d.abil} 这一手`); bad++; continue; }
			const sk = d.abil ? d.abil : d.skill;
			if (!S.approaches[sk]) { console.log(`  ✗ 位点「${site}」的技能「${sk}」不在手段表里——面板发不出来`); bad++; continue; }
			opts.push(`${sk} DC${d.dc}`);
		}
		// 筹码：道具/行囊/情报必须真的存在
		for (const lv of a.levers ?? []) {
			if (lv.need) {
				const probe = ctx.Game.Pc.defaults();
				probe.inv = { 日记: true, 观星者的书: true, 时光护符: true, 完整星图: true };
				probe.world = { family_favor: true };
				let okReq = false;
				// `#785` 第 2 族：`need` 已从函数式谓词改成**声明式条件** ⇒ 判定走故事侧同一把尺
				//（`S.condHolds` ⇒ 引擎 `Sg.rules.matches`）。
				try { okReq = !!S.condHolds(lv.need, probe); } catch { okReq = false; }
				if (!okReq) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」条件在任何情况下都不成立`); bad++; }
			}
			if (lv.needRead && !(a.sites ?? []).some((s) => S.approaches[Game.Checks.sites[s]?.skill ?? Game.Checks.sites[s]?.abil]?.read)) {
				console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」要"读过这人"，但这个诉求没有读人的手`); bad++;
			}
			if (lv.econ && !Game.Economy.events[lv.econ]) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」用了不存在的经济事件「${lv.econ}」`); bad++; }
			if (leverGivesBad(lv.gives)) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」gives=${lv.gives}（只能 auto＝免检 或 adv＝优势）`); bad++; }
		}
		// 三档意愿：至少要有回绝（否则"掷骰无用"这一步没被演示过）
		if (a.unwilling && !a.why) { console.log(`  ✗ 诉求「${a.id}」有 unwilling 分支却没写 why——玩家看不到"为什么掷骰没用"`); bad++; }
		if (a.willing && !a.will) { console.log(`  ✗ 诉求「${a.id}」有 willing 分支却没写 will——免检的过场文案缺了`); bad++; }
		if ((a.sites ?? []).length) {
			if (!a.ok || !a.bad) { console.log(`  ✗ 诉求「${a.id}」有掷骰的路子，却没写成/败两档文案`); bad++; }
			if (!a.done) { console.log(`  ✗ 诉求「${a.id}」没写 done——面板会一直发同一手`); bad++; }
			if (!a.apply) { console.log(`  ✗ 诉求「${a.id}」没写 apply——成功之后拿不到任何东西`); bad++; }
			if ((a.levers ?? []).some((l) => l.gives === 'auto') && !a.auto) { console.log(`  ✗ 诉求「${a.id}」有免检筹码却没写 auto 过场文案`); bad++; }
			const fails = new Set((a.sites ?? []).map((s) => {
				const d = Game.Checks.sites[s];
				const ap = S.approaches[d.abil ? d.abil : d.skill] ?? {};
				return failKindOf(ap);
			}));
			for (const f of fails) failKinds.add(f);
		}
		console.log(`  ${a.sites?.length || a.levers?.length ? '✓' : '·'} ${a.id}（${a.sites?.length ?? 0} 种开口 · ${a.levers?.length ?? 0} 件筹码${a.willing ? ' · 有愿意' : ''}${a.unwilling ? ' · 有回绝' : ''}）${opts.length ? '：' + opts.join(' / ') : ''}`);
	}
	// 代价要因手段而异（2024：不同手段的失败代价不同）
	for (const k of ['重试代价', '态度代价', '无代价']) if (!failKinds.has(k)) { console.log(`  ✗ 没有任何一手是「${k}」——手段之间没有代价差异`); bad++; }
		const cases = [
			['态度阶梯正例：−5/0/+5 恰好三档 → 合规', attAdjBogus({ 友好: -5, 冷淡: 0, 敌意: 5 }).length === 0 && !attAdjWrongTiers({ 友好: -5, 冷淡: 0, 敌意: 5 })],
			['态度阶梯反例：出现 +10（不在 DMG 表里）→ 报红', attAdjBogus({ 友好: -5, 冷淡: 0, 敌意: 10 }).length === 1],
			['态度阶梯反例：只有两档（缺档）→ 报红', attAdjWrongTiers({ 友好: -5, 冷淡: 0 })],
			['态度阶梯边界：表缺失 → 报红', attAdjBogus(undefined).length === 0 && attAdjWrongTiers(undefined)],
			['筹码给法正例：auto / adv → 合规', !leverGivesBad('auto') && !leverGivesBad('adv')],
			['筹码给法反例：gives=free → 报红', leverGivesBad('free')],
			['失败代价：retry 优先于 att → 重试代价', failKindOf({ onFail: { retry: true, att: -1 } }) === '重试代价'],
			['失败代价：只有 att → 态度代价', failKindOf({ onFail: { att: -1 } }) === '态度代价'],
			['失败代价：无 onFail / 空 → 无代价（边界）', failKindOf(undefined) === '无代价' && failKindOf({}) === '无代价'],
		];
		for (const [label, pass] of cases) { console.log(`      ${pass ? '✓' : '✗'} 自证·${label}`); if (!pass) bad++; }
		console.log(`      自证·检出 ${cases.filter(([, p]) => p).length}（期望 ${cases.length}）`);

	console.log(`  代价差异：${[...failKinds].join(' · ')}（游说/历史＝越问越难 · 欺瞒/恐吓＝态度下降 · 表演/洞悉/察觉＝只丢这一句）`);
	// 至少一条常驻面板的「unwilling」示范（让玩家看见"掷骰无用"这一步存在）
	const stubborn = (S.asks ?? []).filter((a) => a.unwilling && !(a.willing));
	if (!stubborn.length) console.log('  ⚠ 没有任何"始终不肯"的诉求——意愿三档里的 unwilling 只是理论');
	else console.log(`  回绝示范：${stubborn.map((a) => a.id).join('、')}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪l 交涉门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪l 交涉门通过（手段换属性、态度定 DC、代价因手段而异、筹码真的存在）');
	}
}
};
