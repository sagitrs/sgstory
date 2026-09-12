// #300 §5 静态门（测试基建，不含产品修复）：两件事必须永远成立
//
//  ① **就地行动站点不得漏登记**：正文里凡「<<link>> 体内含 <<replace>> 且改状态
//     （<<give>>／<<damage>>／<<set $…>>）」的站点，都必须在 test/saveload-sites.json 里
//     有对应条目——这样未来新增同类站点会被立刻抓住，不必等它变成第二个 #300。
//     （#300 票面明确要求「不要只对门厅与洞穴添加段落名特判」，本门就是那条要求的机械保证。）
//
//  ② **检定 key 必须有归宿**：通用 goto 包装会先删掉 .check-result，假定落地段用
//     <<lastcheckFor>> 复显。因此每个 <<sitecheck "KEY">> 的 KEY 要么出现在某处
//     <<lastcheckFor>> 的参数里，要么在豁免表里写明理由（含票号）。
//     空豁免＝红灯：不允许「反正没人看」的静默例外。
//
// 本文件只做静态检查，因此**在缺陷基线上也是绿的**（它保证的是「被登记」，不是「已修好」）；
// 「已修好」由 test/saveload.mjs（行为门）负责，那张门在 #300 修复前应当是红的。

import { readFileSync, readdirSync } from 'node:fs';

const MANIFEST = JSON.parse(readFileSync(new URL('./saveload-sites.json', import.meta.url), 'utf8'));
const files = readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.twee'));
const source = files.map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };
const label = (s) => s.replace(/（[^）]*）/g, '').replace(/\s+/g, '').slice(0, 14);

// ── ① 就地行动站点扫描 ────────────────────────────────────────────────
// 排除 <<set _x …>>（宏内临时变量，不进存档语义）
const MUTATORS = ['<<give', '<<damage', '<<set $'];
const found = [];
{
	const re = /<<link "([^"]+)"\s*>>([\s\S]*?)<<\/link>>/g;
	let m;
	while ((m = re.exec(source))) {
		const [full, name, body] = m;
		if (!body.includes('<<replace')) continue;
		if (!MUTATORS.some((k) => body.includes(k))) continue;
		const passage = (source.slice(0, m.index).match(/^:: (.+)$/gm) ?? [':: ?']).pop().replace(/^:: /, '').trim();
		found.push({ label: name, passage, mutators: MUTATORS.filter((k) => body.includes(k)) });
	}
}
const manifestLabels = new Set(MANIFEST.sites.map((s) => s.label));
const unregistered = found.filter((f) => !manifestLabels.has(f.label));
// 带 behavioralOnly 的条目＝**经 widget 间接改状态**的站点：扫描器看不见 link 体内的直接变更，
// 所以它们不参与「静态发现」对账（否则永远误报 stale），但必须校验那个 widget 还在。
const stale = MANIFEST.sites.filter((s) => !s.behavioralOnly && !found.some((f) => f.label === s.label));

check(found.length >= 0, `扫到「就地 replace ＋ 改状态」站点 ${found.length} 处（直接变更）`);
for (const f of found) console.log(`    · ${f.passage}｜「${label(f.label)}…」 ${f.mutators.join(' ')}`);
const indirect = MANIFEST.sites.filter((s) => s.behavioralOnly);
for (const s of indirect) {
	const okWidget = new RegExp(`<<widget "${s.behavioralOnly}"`).test(source);
	check(okWidget, `间接站点依赖的 widget 仍在：「${label(s.label)}…」 → <<widget "${s.behavioralOnly}">>${okWidget ? '' : '（widget 改名/删除了，登记项已失效）'}`);
}
check(unregistered.length === 0,
	unregistered.length === 0
		? '没有**未登记**的就地行动站点（新增同类站点不会静默漏测）'
		: `有 ${unregistered.length} 处就地行动站点**未登记**（补进 saveload-sites.json，并写清 nav/断言）：${unregistered.map((u) => `${u.passage}「${u.label}」`).join('、')}`);
// 清单条目「不再出现在静态扫描里」**不算失败**，只报告：
// 站点可能因为修复（例：#305 把门厅/花田改回 goto 渲染路径）而不再属「就地变更」类型，
// 但其行为要求（操作后立即 S/L 必须保值）仍然成立——由行为门继续盯。
// 本门的职责是「防新增未登记风险」，不是「阻止风险面的正当收缩」。
if (stale.length) {
	console.log('~ 以下登记项已不在静态扫描范围内（可能因修复换了渲染路径；仍由行为门盯）：');
	for (const s of stale) console.log(`    · ${s.where}｜「${s.label.replace(/（[^）]*）/g, '')}…」`);
}
for (const s of MANIFEST.sites) {
	check(!!s.nav && Array.isArray(s.assert) && s.assert.length > 0 && !!s.ticket,
		`登记项完整（nav/断言项/票号）：「${label(s.label)}…」 → nav=${s.nav} assert=${(s.assert ?? []).join('+')} ${s.ticket ?? '(缺票号)'}`);
}

// ── ② 检定 key 的归宿 ────────────────────────────────────────────────
// 注意口径：此处扫的是**全仓 key 的静态归宿**（复显 或 豁免），不判断运行时可见性；
// 运行时可见性由 test/saveload.mjs 的跨段用例与人工走查（#296）负责。
const siteKeys = new Set();
for (const m of source.matchAll(/<<sitecheck "([^"]+)"(?:\s+"([^"]+)")?/g)) {
	siteKeys.add(m[1]);
	if (m[2]) siteKeys.add(m[2]);
}
const redisplayed = new Set();
for (const m of source.matchAll(/<<lastcheckFor ([^>]+)>>/g)) {
	for (const k of m[1].matchAll(/"([^"]+)"/g)) redisplayed.add(k[1]);
}
const exempt = MANIFEST.sitecheckExemptions ?? {};
const orphan = [...siteKeys].filter((k) => !redisplayed.has(k) && !exempt[k]);
const staleExempt = Object.keys(exempt).filter((k) => !siteKeys.has(k));
const noReason = Object.entries(exempt).filter(([, v]) => !v || String(v).trim().length < 8 || !/#\d+/.test(String(v)));

check(siteKeys.size > 0, `扫到 <<sitecheck>> key ${siteKeys.size} 个（其中 ${redisplayed.size} 个有 <<lastcheckFor>> 复显，${Object.keys(exempt).length} 个登记豁免）`);
check(orphan.length === 0,
	orphan.length === 0
		? '每个检定 key 都有归宿（复显 或 豁免＋理由）——没有「静默丢检定框」的新增空间'
		: `${orphan.length} 个 key 既不复显也没豁免：${orphan.join('、')}（补 <<lastcheckFor>>，或进豁免表写明理由）`);
check(staleExempt.length === 0,
	staleExempt.length === 0 ? '豁免表没有失效条目' : `豁免表有失效条目（正文里已无此 key）：${staleExempt.join('、')}`);
check(noReason.length === 0,
	noReason.length === 0
		? '每条豁免都写了理由且引用了票号（不允许空豁免）'
		: `${noReason.length} 条豁免缺理由或缺票号：${noReason.map(([k]) => k).join('、')}`);

console.log(`\n${failures ? `✗ 静态门 ${failures} 项未通过` : '✔ 就地行动与检定 key 登记完整（静态门）'}`);
if (failures) process.exit(1);
