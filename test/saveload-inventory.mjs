// #300 §5 静态门 → **#315 升级为禁止制**（测试基建，不含产品修复）
//
// 口径来源：`docs/dev-conventions.md`「渲染路径契约」——**就地反馈不得改状态**。
// 语法上两条路径长得几乎一样（都是 <<link>> + 结果文本），只靠人记必出错：
// #300 P1（存档丢道具/丢检定记录）就是这么来的。本门把口径变成机械约束。
//
// 三条断言：
//
//  ① **禁止就地改状态**（#315 新）：凡「<<link>> 体内含 <<replace>> 且改状态
//     （<<give>>／<<damage>>／<<set $…>>）」的站点，**一律红灯**——正确做法是
//     「结算 → 结果留屏 → <<goto>>」。确有必要时须写进 test/saveload-sites.json 的
//     `inPageMutationsAllowed` 白名单（每条：理由 ＋ 票号），否则不得通过。
//     （#300 票面要求的「不要只对门厅与洞穴打特判」由此升级：不是登记，是禁止。）
//
//  ② **检定 key 必须有归宿**：通用 goto 包装会先删掉 .check-result，假定落地段用
//     <<lastcheckFor>> 复显。因此每个 <<sitecheck "KEY">> 的 KEY 要么出现在某处
//     <<lastcheckFor>> 的参数里，要么在豁免表里写明理由（含票号）。空豁免＝红灯。
//
//  ③ **行为矩阵依赖的 widget 必须仍在**（间接站点：状态变更藏在 widget 体内，
//     扫描器看不见 link 体内的直接变更）。
//
// 自证：`node test/saveload-inventory.mjs --selftest` —— 用**合成源码**验证
//   「非法站点 → 红」「合规站点 → 绿」。没有这一步，禁止制就只是纸面承诺。
//
// 说明：本文件只做静态检查，因此它保证的是「**规则成立**」，不是「行为已正确」；
// 「行为正确」由 test/saveload.mjs（存读档保值矩阵）负责。

import { readFileSync, readdirSync } from 'node:fs';

const MANIFEST = JSON.parse(readFileSync(new URL('./saveload-sites.json', import.meta.url), 'utf8'));
const readSrc = () => {
	const dir = new URL('../src', import.meta.url);
	return readdirSync(dir).filter((f) => f.endsWith('.twee')).sort()
		.map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
};

// ── 扫描器（纯函数：给字符串，返回发现；自证靠它喂合成源码）────────────────
// 排除 <<set _x …>>（宏内临时变量，不进存档语义）
const MUTATORS = ['<<give', '<<damage', '<<set $'];
export const scanInPageMutations = (source) => {
	const out = [];
	const re = /<<link "([^"]+)"\s*>>([\s\S]*?)<<\/link>>/g;
	let m;
	while ((m = re.exec(source))) {
		const body = m[2];
		if (!body.includes('<<replace')) continue;
		if (!MUTATORS.some((k) => body.includes(k))) continue;
		const passage = (source.slice(0, m.index).match(/^:: (.+)$/gm) ?? [':: ?']).pop().replace(/^:: /, '').trim();
		out.push({ label: m[1], passage, mutators: MUTATORS.filter((k) => body.includes(k)) });
	}
	return out;
};

export const scanSitecheckKeys = (source) => {
	const keys = new Set();
	for (const m of source.matchAll(/<<sitecheck "([^"]+)"(?:\s+"([^"]+)")?/g)) {
		keys.add(m[1]);
		if (m[2]) keys.add(m[2]);
	}
	const redisplayed = new Set();
	for (const m of source.matchAll(/<<lastcheckFor ([^>]+)>>/g)) {
		for (const k of m[1].matchAll(/"([^"]+)"/g)) redisplayed.add(k[1]);
	}
	return { keys, redisplayed };
};

// ── 判定（纯函数：给源码 + 清单，返回失败列表）────────────────────────────
export const evaluate = (source, manifest = MANIFEST) => {
	const failures = [];
	const found = scanInPageMutations(source);
	const allowed = manifest.inPageMutationsAllowed ?? {};
	// ① 禁止制：未登记白名单的就地改状态站点＝红
	for (const f of found) {
		if (!allowed[f.label]) {
			failures.push({ code: 'in-page-mutation', msg: `${f.passage}｜「${f.label}」（${f.mutators.join(' ')}）就地改状态且未登记白名单——改为「结算 → 结果留屏 → <<goto>>」，或写明理由＋票号进 inPageMutationsAllowed` });
		}
	}
	// ①b 白名单不得有失效条目（改了名/删了站点却留着豁免）
	const foundLabels = new Set(found.map((f) => f.label));
	const staleAllowed = Object.keys(allowed).filter((k) => !foundLabels.has(k));
	for (const k of staleAllowed) failures.push({ code: 'stale-allowance', msg: `白名单条目「${k}」在正文里已找不到就地改状态站点（改新名或删除）` });

	// ③ 间接站点依赖的 widget 必须仍在
	const behaviorOnly = (manifest.sites ?? []).filter((s) => s.behavioralOnly);
	const staleWidget = behaviorOnly.filter((s) => !new RegExp(`<<widget "${s.behavioralOnly}"`).test(source));
	for (const s of staleWidget) failures.push({ code: 'missing-widget', msg: `行为矩阵依赖的 widget <<${s.behavioralOnly}>> 不存在了（「${s.label}」的登记项已失效）` });

	// ② 检定 key 归宿
	const { keys, redisplayed } = scanSitecheckKeys(source);
	const exempt = manifest.sitecheckExemptions ?? {};
	const orphan = [...keys].filter((k) => !redisplayed.has(k) && !exempt[k]);
	for (const k of orphan) failures.push({ code: 'orphan-key', msg: `<<sitecheck "${k}">> 既不复显（<<lastcheckFor>>）也无豁免：跨段后检定框会静默丢失` });
	const noReason = Object.entries(exempt).filter(([, v]) => !v || String(v).trim().length < 8 || !/#\d+/.test(String(v)));
	for (const [k] of noReason) failures.push({ code: 'exemption-without-reason', msg: `豁免「${k}」缺理由或缺票号（不允许空豁免）` });

	return { failures, found, keys, redisplayed, allowed, staleAllowed };
};

// ── 自证：禁止制必须咬得住 ─────────────────────────────────────────────
const SELFTEST = () => {
	const legal = `:: 好站点\n<<link "取走那支哨子">>\n\t<<give "坏哨">><<goto "门厅">>\n<</link>>\n`;
	const illegal = `:: 坏站点\n<<link "就地取走那支哨子">>\n\t<<replace "#act">><p>你取下了它。<<give "坏哨">></p><</replace>>\n<</link>>\n`;
	const tempOnly = `:: 纯界面态\n<<link "展开细节">>\n\t<<set _t to 1>><<replace "#act">>点开了<</replace>>\n<</link>>\n`;
	const cases = [
		['合规（结算 → goto）→ 不得报红', legal, 0],
		['非法（就地 replace + give）→ 必须报红', illegal, 1],
		['纯界面态（只改临时变量）→ 不得报红', tempOnly, 0],
	];
	let bad = 0;
	for (const [name, src, want] of cases) {
		const { failures } = evaluate(src, { inPageMutationsAllowed: {}, sitecheckExemptions: {} });
		const hit = failures.filter((f) => f.code === 'in-page-mutation').length;
		const ok = hit === want;
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${name}（命中 ${hit}，期望 ${want}）`);
	}
	// 白名单失效也必须报红
	const staleSrc = `:: 好站点\n<<link "取走那支哨子">>\n\t<<give "坏哨">><<goto "门厅">>\n<</link>>\n`;
	const { failures: f2 } = evaluate(staleSrc, { inPageMutationsAllowed: { '早已删掉的老站点': '理由 #300' }, sitecheckExemptions: {} });
	const staleHit = f2.some((f) => f.code === 'stale-allowance');
	console.log(`${staleHit ? '✓' : '✗'} 白名单失效条目 → 必须报红`);
	if (!staleHit) bad++;
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——禁止制没有咬合力（纸面承诺）`); process.exit(1); }
	console.log('\n✔ 自证通过：合法绿 / 非法红 / 纯界面态绿 / 白名单失效红');
};

if (process.argv.includes('--selftest')) { SELFTEST(); process.exit(0); }

// ── 真实源码检查 ───────────────────────────────────────────────────────
const source = readSrc();
const { failures, found, keys, redisplayed, allowed } = evaluate(source);

let failuresCount = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failuresCount++; };
const label = (s) => s.replace(/（[^）]*）/g, '').replace(/\s+/g, '').slice(0, 14);

console.log(`扫描源文件：${readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.twee')).length} 个 twee`);
check(found.length === 0,
	found.length === 0
		? '就地行动**零站点**（口径：就地反馈不得改状态；正确做法＝结算 → 结果留屏 → goto）'
		: `有 ${found.length} 处就地改状态站点（白名单 ${Object.keys(allowed).length} 条）`);
for (const f of found) console.log(`    · ${f.passage}｜「${label(f.label)}…」 ${f.mutators.join(' ')}${allowed[f.label] ? '（白名单）' : ''}`);
check(keys.size > 0, `扫到 <<sitecheck>> key ${keys.size} 个（${redisplayed.size} 个有复显 / ${Object.keys(MANIFEST.sitecheckExemptions ?? {}).length} 个登记豁免）`);
for (const s of (MANIFEST.sites ?? []).filter((x) => x.behavioralOnly)) {
	check(!failures.some((f) => f.code === 'missing-widget' && f.msg.includes(s.behavioralOnly)), `间接站点依赖的 widget 仍在：<<${s.behavioralOnly}>>`);
}

for (const f of failures) check(false, `[${f.code}] ${f.msg}`);

console.log(`\n${failuresCount ? `✗ 静态门 ${failuresCount} 项未通过` : '✔ 渲染路径契约成立（禁止就地改状态）＋ 检定 key 归宿完整（静态门）'}`);
if (failuresCount) process.exit(1);
