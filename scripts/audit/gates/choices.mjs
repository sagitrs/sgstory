// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['choices']。校验：npm run audit:golden。
export const flag = 'choices';
export const flags = ["choices"];

// ── 纯函数（自证与真实运行**同一份代码**）──
// 可点臂数：每个 `<<link>>` 与 `[[ ]]` 各记一臂（同目标的两个选择肢也算两臂）
export const outEdges = (src) => (String(src).match(/<<link\b/g) ?? []).length + (String(src).match(/\[\[/g) ?? []).length;
// 车卡臂数：声明 arms 必须等于该轮实际选项数
export const judgeChargenArms = (rounds, sites) => sites
	.filter((c) => c.kind === 'chargen')
	.map((c) => ({ id: c.id, got: rounds[c.round]?.options.length, want: c.arms }))
	.filter((x) => x.got !== x.want);
// 注入技能抽取（从 apply 源码里读 `skills.push(...)`）
export const injectedFrom = (applySrc) => {
	const out = new Set();
	for (const m of String(applySrc).matchAll(/skills\.push\(([^)]*)\)/g)) for (const sk of m[1].matchAll(/'([^']+)'/g)) out.add(sk[1]);
	return out;
};
// 幽灵技能：注入 − （位点技能 ∪ 特殊消费 ∪ 豁免）
export const ghostSkills = (injected, siteSkills, consumed, exempt) => [...injected].filter((sk) => !siteSkills.has(sk) && !consumed.has(sk) && !exempt.has(sk));

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪c D2 选择意义感（#36）：选择表机检 + 幽灵技能门 + 过程差异占比 ──
if (wantAll || arg('choices')) {
	console.log('\n══ ⓪c 选择意义感（D2/#36）——非任意·非二元·后果可见 ══');
	let bad = 0;
	// ── 自证（先证会红，再判真实数据）──
	{
		const cases = [
			['正例：臂数 = link + wikilink', outEdges('<<link "甲">>x<</link>>\n[[乙|B]]'), 2],
			['正例：车卡臂数与声明相符', judgeChargenArms([{ options: [1, 2, 3] }], [{ kind: 'chargen', id: 'r0', round: 0, arms: 3 }]).length, 0],
			['反例①：车卡臂数与声明不符', judgeChargenArms([{ options: [1, 2] }], [{ kind: 'chargen', id: 'r0', round: 0, arms: 3 }]).length, 1],
			['正例：从 apply 源码抽出注入技能', [...injectedFrom("pc.skills.push('运动', '恐吓')")].join(), '运动,恐吓'],
			['反例②：注入技能无消费且未豁免 → 幽灵技能', ghostSkills(new Set(['幽灵技']), new Set(['察觉']), new Set(), new Set()).length, 1],
			['正例：注入技能有消费或豁免 → 不是幽灵', ghostSkills(new Set(['运动', '洞悉']), new Set(['运动']), new Set(['洞悉']), new Set()).length, 0],
		];
		for (const [label, got, want] of cases) {
			const ok = got === want;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：得 ${got}（期望 ${want}）`);
			if (!ok) bad++;
		}
	}
	// 可点臂数（下界）：每个 <<link>> 与 [[ ]] 记一臂——同目标的两个选择肢也算两臂
	const edgesOf = (name) => outEdges(passageSrc.get(name) ?? '');
	// 交涉面板（B2）也发臂：<<socpanel "诉求">> 的每条开口方式与筹码都是可点的一项
	const socArms = (name) => {
		let n = 0;
		for (const m of (passageSrc.get(name) ?? '').matchAll(/<<socpanel\s+"([^"]+)"/g)) {
			const a = Game.Social?.ask?.(m[1]);
			if (!a) continue;
			n += (a.sites ?? []).length + (a.levers ?? []).length + (a.willing ? 1 : 0);
		}
		return n;
	};
	let nonEnding = 0;
	for (const c of Game.Choices.sites) {
		let okArm = true;
		if (c.kind === 'chargen') {
			const n = ctx.Game.Chargen.rounds[c.round]?.options.length;
			okArm = !judgeChargenArms(ctx.Game.Chargen.rounds, [c]).length;
			if (!okArm) { console.log(`  ✗ ${c.id}：Game.Chargen.rounds[${c.round}] 臂数 ${n} ≠ 表 ${c.arms}`); bad++; }
		} else {
			const src = passageSrc.get(c.p);
			if (src === undefined) { console.log(`  ✗ ${c.id}：段落「${c.p}」不存在`); bad++; okArm = false; }
			else {
				const e = edgesOf(c.p) + socArms(c.p);
				okArm = e >= c.arms;
				if (!okArm) { console.log(`  ✗ ${c.id}：「${c.p}」可点臂 ${e} < 表臂 ${c.arms}（臂数虚标？）`); bad++; }
			}
		}
		if (c.landing !== 'ending') nonEnding++;
		if (okArm) console.log(`  ✓ ${c.id}（${c.arms} 臂 → ${c.landing}）`);
	}
	const ratio = nonEnding / Game.Choices.sites.length;
	console.log(`  过程差异（landing≠ending）占比 ${(ratio * 100).toFixed(0)}%（验收 ≥50%）`);
	if (ratio < 0.5) { console.log('  ✗ 过程差异占比不足 50%'); bad++; }
	// 幽灵技能门：车卡注入技能 ⊆ 位点技能 ∪ 特殊消费 ∪ 豁免
	const siteSkills = new Set(Object.values(Game.Checks.sites).map((x) => x.skill).filter(Boolean));
	// 特殊消费从表派生（防门与表脱节）：经济 skillDiscount + 文本消费声明
	const consumed = new Set([...Object.values(Game.Economy.events).map((e) => e.skillDiscount?.skill).filter(Boolean), '洞悉']);
	const exempt = new Set(Object.keys(Game.Choices.exemptSkills));
	const injected = new Set();
	for (const round of ctx.Game.Chargen.rounds) for (const opt of round.options) for (const sk of injectedFrom(opt.apply)) injected.add(sk);
	const ghosts = ghostSkills(injected, siteSkills, consumed, exempt);
	if (ghosts.length) { console.log(`  ✗ 幽灵技能（注入无消费未豁免）：${ghosts.join('、')}`); bad += ghosts.length; }
	else console.log(`  幽灵技能门：注入 ${injected.size} 技能全部有消费或豁免`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D2 选择门：${bad} 项`); process.exit(1); }
		console.log('\n✔ D2 选择门通过');
	}
}
};
