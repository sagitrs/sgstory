// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['sitedisc']。校验：npm run audit:golden。
export const flag = 'sitedisc';
export const flags = ["sitedisc"];

// 纯函数（自证与真实运行**同一份代码**）：给一段源码，返回「带伤失败档却没有结果」的位点
export const judgeFailBranches = (src) => {
	const re = /<<sitecheck\s+"([^"]+)"[^>]*>>[\s\S]{0,1200}?<<if\s+\$last_check\.success>>([\s\S]*?)<<else>>([\s\S]*?)<<\/if>>/g;
	const out = [];
	for (const m of String(src).matchAll(re)) {
		const site = m[1], badBranch = m[3];
		if (!badBranch.includes('<<damage')) continue;          // 只管**带伤**的失败档（无伤的失败不在本门范围）
		if (!/<<give\s|<<set\s+\$pc\.|<<goto\s/.test(badBranch)) out.push({ site });
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪p 位点失败纪律门（#199/#195）：带伤失败必须有解，无解决不许带伤 ──
if (wantAll || arg('sitedisc')) {
	console.log('\n══ ⓪p 位点失败纪律（#199）——伤＝代价，不是空手；无解决不许带伤 ══');
	let bad = 0;
	let seen = 0;
	// ── 自证（先证会红，再判真实数据）──
	{
		const wrap = (badBranch) => `<<sitecheck "P·位点">><<snapshot>><<if $last_check.success>>成了<</if>>`.replace('成了', `成了<<else>>${badBranch}<</if>>`);
		const cases = [
			['正例：带伤失败 + 置旗标', wrap('你磕了一下。<<damage 1>><<set $pc.ev.x to true>>'), 0],
			['正例：带伤失败 + 给东西', wrap('擦破皮。<<damage 2>><<give "药膏">>'), 0],
			['正例：带伤失败 + 退场', wrap('被推下去。<<damage 3>><<goto "门厅">>'), 0],
			['反例①：带伤失败却不给结果（可无限磨伤）', wrap('疼。<<damage 1>>'), 1],
			['正例：无伤的空手失败**不在本门范围**', wrap('没成，但你没受伤。'), 0],
			['正例：没有 sitecheck 结构', '普通段落，没有检定。', 0],
		];
		for (const [label, src, want] of cases) {
			const got = judgeFailBranches(src).length;
			const ok = got === want;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
			if (!ok) bad++;
		}
	}
	for (const [name, src] of passageSrc) {
		const re = /<<sitecheck\s+"([^"]+)"[^>]*>>[\s\S]{0,1200}?<<if\s+\$last_check\.success>>([\s\S]*?)<<else>>([\s\S]*?)<<\/if>>/g;
		for (const m of src.matchAll(re)) if (m[3].includes('<<damage')) seen++;   // 统计口径不变
		for (const f of judgeFailBranches(src)) {
			console.log(`  ✗ ${name} · ${f.site}：失败档带 <<damage>> 却不给结果（可无限磨伤）`);
			bad++;
		}
	}
	console.log(`  带伤失败档 ${seen} 处，全部落结果（给东西/置旗标/退场）`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪p 位点失败纪律门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪p 位点失败纪律门通过（带伤失败必有解，无磨伤死角）');
	}
}
};
