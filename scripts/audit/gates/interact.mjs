// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['interact']。校验：npm run audit:golden。
export const flag = 'interact';
export const flags = ["interact"];

// ── 纯函数（自证与真实运行**同一份代码**）──
const stripLinksOf = (src) => String(src).replace(/<<link\b[\s\S]*?<\/link>>/g, '（link）');
// ① 引用了不存在的位点
export const missingSites = (src, sites) => [...String(src).matchAll(/<<sitecheck\s+"([^"]+)"/g)]
	.map((m) => m[1]).filter((k) => !sites[k]);
// ② 顶层（不在 <<link>> 体内）的 sitecheck ⇒ 自动检定：位点必须标 auto＋理由
export const topLevelAutoChecks = (src, sites) => [...stripLinksOf(src).matchAll(/<<sitecheck\s+"([^"]+)"/g)]
	.map((m) => m[1]).filter((k) => sites[k] && !sites[k].auto);
// ③ 顶层读 $last_check 却没有本轮检定（会读到上一段的陈旧结果）
export const staleLastCheck = (src) => {
	const outer = stripLinksOf(src);
	return outer.includes('$last_check') && !/<<sitecheck\s+"/.test(outer);
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪h 互动门（M9）：信息靠动作与交涉换来，不靠自动检定 ──
if (wantAll || arg('interact')) {
	console.log('\n══ ⓪h 互动门（M9）——信息必须由玩家动作发起 ══');
	let bad = 0;
	// ── 自证（先证会红，再判真实数据）──
	{
		const S = { 有: { skill: '察觉', dc: 10 }, 自动: { skill: '察觉', dc: 10, auto: '进场即动手' } };
		const cases = [
			['正例：位点都存在于表里', missingSites('<<sitecheck "有">>', S).length, 0],
			['反例①：引用了不存在的位点', missingSites('<<sitecheck "没有">>', S).length, 1],
			['正例：顶层检定但位点已标 auto', topLevelAutoChecks('<<sitecheck "自动">>', S).length, 0],
			['反例②：顶层检定且位点未标 auto', topLevelAutoChecks('<<sitecheck "有">>', S).length, 1],
			['正例：检定在 <<link>> 体内（玩家发起）', topLevelAutoChecks('<<link "点">><<sitecheck "有">><</link>>', S).length, 0],
			['反例③：顶层读 $last_check 却没有本轮检定', staleLastCheck('<<if $last_check.success>>甲<</if>>') ? 1 : 0, 1],
			['正例：顶层读 $last_check 且同段有检定', staleLastCheck('<<sitecheck "有">><<if $last_check.success>>甲<</if>>') ? 1 : 0, 0],
		];
		for (const [label, got, want] of cases) {
			const ok = got === want;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：得 ${got}（期望 ${want}）`);
			if (!ok) bad++;
		}
	}
	const stripLinks = (src) => src.replace(/<<link\b[\s\S]*?<\/link>>/g, '（link）');
	const sites = Game.Checks.sites;
	const usedSites = new Set();
	// 战斗动作池（B1）：池里的位点由玩家从面板上选——等同「玩家发起」；
	// 对手位点由 <<fightresolve "位点">> 驱动——等同「进场即动手」（须标 auto）。
	const poolSites = new Set(Object.values(Game.Combat?.actions ?? {}).map((a) => a.site));
	let autoTop = 0, inLink = 0;
	for (const [name, srcRaw] of passageSrc) {
		const tags0 = passageTags.get(name) ?? [];
		if (tags0.includes('script') || tags0.includes('stylesheet') || tags0.includes('widget')) continue; // 只扫正文
		const src = srcRaw.replace(/\/%[\s\S]*?%\//g, '');
		const outer = stripLinks(src);
		for (const m of src.matchAll(/<<sitecheck\s+"([^"]+)"/g)) usedSites.add(m[1]);
		for (const k of missingSites(src, sites)) { console.log(`  ✗ 段落「${name}」引用了不存在的位点「${k}」`); bad++; }
		// 战斗结算：<<fightpanel "对手位点" …>>／（旧名）<<fightresolve …>> 每一轮都掷——必须存在且标 auto。
		// #350：结算从渲染期搬到点击时刻后，对手位点由**面板**接收（段落里只剩 <<fightlog>> 只读回放），
		// 故采集点从 fightresolve 改为 fightpanel（保留旧名以兼容）。
		for (const m of outer.matchAll(/<<(?:fightpanel|fightresolve)\s+"([^"]+)"/g)) {
			usedSites.add(m[1]);
			autoTop++;
			if (!sites[m[1]]) { console.log(`  ✗ 段落「${name}」的战斗对手位点「${m[1]}」不存在`); bad++; continue; }
			if (!sites[m[1]].auto) { console.log(`  ✗ 段落「${name}」的战斗对手位点「${m[1]}」未标 auto 理由`); bad++; }
		}
		// ① 顶层（非 link 内）的检定＝自动检定：只有"进场即动手"的战斗位点可以
		for (const _m of outer.matchAll(/<<sitecheck\s+"([^"]+)"/g)) autoTop++;
		for (const k of topLevelAutoChecks(src, sites)) { console.log(`  ✗ 段落「${name}」自动检定「${k}」——信息类检定必须由玩家动作发起（移进 <<link>>，或给位点标 auto 并写明理由）`); bad++; }
		// ② 渲染期读 $last_check ⇒ 同段落顶层必须有检定（否则会读到上一段落的陈旧结果）
		if (staleLastCheck(src)) {
			console.log(`  ✗ 段落「${name}」顶层读 $last_check 却没有本轮检定——判定结果必须落旗标后再渲染`); bad++;
		}
		inLink += (src.match(/<<sitecheck/g) ?? []).length - (outer.match(/<<sitecheck/g) ?? []).length;
	}
	// ②b 战斗动作池：池里的位点必须在表里（孤儿门的另一半）
	for (const s of poolSites) {
		if (!sites[s]) { console.log(`  ✗ 战斗动作池引用了不存在的位点「${s}」`); bad++; continue; }
		usedSites.add(s);
	}
	// ②c 交涉诉求（B2）：由 <<socpanel "诉求">> 发牌，位点写在诉求的 sites 里——也算「玩家发起」
	const socSites = new Set();
	for (const a of Game.Social?.asks ?? []) for (const s of a.sites ?? []) {
		if (!sites[s]) { console.log(`  ✗ 交涉诉求「${a.id}」引用了不存在的位点「${s}」`); bad++; continue; }
		socSites.add(s); usedSites.add(s);
	}
	// ③ 位点无孤儿（表里有、正文没人用）
	for (const s of Object.keys(sites)) if (!usedSites.has(s)) { console.log(`  ✗ 位点「${s}」在表里但正文没人用`); bad++; }
	// ④ 选择密度（报告项）：内容段落的 字/臂
	const dens = [];
	for (const [name, srcRaw] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet') || name.startsWith('Story')) continue;
		if (name.startsWith('结局') || name.includes('设定集') || name === '样式') continue;
		const src = srcRaw.replace(/\/%[\s\S]*?%\//g, '');
		const chars = src.replace(/\s/g, '').length;
		const arms = (src.match(/<<link\b/g) ?? []).length + (src.match(/\[\[/g) ?? []).length;
		if (arms) dens.push({ name, chars, arms, r: chars / arms });
	}
	dens.sort((x, y) => y.r - x.r);
	console.log(`  检定：${autoTop + inLink + poolSites.size + socSites.size} 处（玩家发起 ${inLink + socSites.size}（交涉 ${socSites.size}）· 进场即动手 ${autoTop} · 战斗动作池 ${poolSites.size}）`);
	console.log(`  最"薄"的五个段落（字/臂）：${dens.slice(0, 5).map((d) => `${d.name} ${d.r.toFixed(0)}`).join(' · ')}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 互动门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 互动门通过（信息类检定全部由玩家动作发起）');
	}
}
};
