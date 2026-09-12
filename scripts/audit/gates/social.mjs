// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['social']。校验：npm run audit:golden。
export const flag = 'social';
export const flags = ["social"];

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
	const bogus = Object.entries(S?.attAdj ?? {}).filter(([, v]) => ![0, 5, -5].includes(v));
	if (bogus.length || Object.keys(S?.attAdj ?? {}).length !== 3) {
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
				try { okReq = !!lv.need(probe); } catch { okReq = false; }
				if (!okReq) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」条件在任何情况下都不成立`); bad++; }
			}
			if (lv.needRead && !(a.sites ?? []).some((s) => S.approaches[Game.Checks.sites[s]?.skill ?? Game.Checks.sites[s]?.abil]?.read)) {
				console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」要"读过这人"，但这个诉求没有读人的手`); bad++;
			}
			if (lv.econ && !Game.Economy.events[lv.econ]) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」用了不存在的经济事件「${lv.econ}」`); bad++; }
			if (!['auto', 'adv'].includes(lv.gives)) { console.log(`  ✗ 诉求「${a.id}」的筹码「${lv.name}」gives=${lv.gives}（只能 auto＝免检 或 adv＝优势）`); bad++; }
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
				return ap.onFail?.retry ? '重试代价' : (ap.onFail?.att ? '态度代价' : '无代价');
			}));
			for (const f of fails) failKinds.add(f);
		}
		console.log(`  ${a.sites?.length || a.levers?.length ? '✓' : '·'} ${a.id}（${a.sites?.length ?? 0} 种开口 · ${a.levers?.length ?? 0} 件筹码${a.willing ? ' · 有愿意' : ''}${a.unwilling ? ' · 有回绝' : ''}）${opts.length ? '：' + opts.join(' / ') : ''}`);
	}
	// 代价要因手段而异（2024：不同手段的失败代价不同）
	for (const k of ['重试代价', '态度代价', '无代价']) if (!failKinds.has(k)) { console.log(`  ✗ 没有任何一手是「${k}」——手段之间没有代价差异`); bad++; }
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
