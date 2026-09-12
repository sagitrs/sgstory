// D9④「场合」面门（#407）：NPC 让渡行为登记簿必须声明**在哪发生**（venue）与**他的岗位/身份**（role）。
//
// 为什么：登记簿现有 `motive`（为什么做）却没有「场合/岗位」两维 ⇒ 「观星者在宴席上算星」（#405）这一类
// 「动机对、场合错」的问题**无处登记、无处检查**。#405 是已确认实例；#407 ④面的首轮清单在 docs/baselines.md。
//
// 判据（当前为**登记模式**：字段还没补，报告但不判失败——本仓既有约定）：
//   ① 每条登记必须同时有 `venue` 与 `role`；
//   ② `venue` 必须在下面声明的场所枚举 `VENUES` 里（防自由词漂移）；
// 补列工作完成后跑 `--strict`（或删掉 KNOWN 开关）即转严格；这也是那批补列工作的**红靶**。
//
// 自证：`node test/npc-venue.mjs --selftest`

import { createContext } from '../scripts/audit/context.mjs';

// 场所枚举（可增补；增补即代表"这个场所被承认"）——取自现有段落名的主要场所
export const VENUES = ['女巫小屋', '酒馆', '塔外花田', '塔门', '门厅', '书房', '工坊', '天文台', '顶楼', '地下宴会厅', '宴会·过去', '林间小径', '洞穴', '雾·路径'];
// 登记模式开关（补列完成后删除本行即转严格，或直接跑 --strict）
export const KNOWN_PENDING = '#407 ④（venue/role 两列尚未补）';

export const judgeVenue = (entries, venues = VENUES) => {
	const out = [];
	for (const [id, e] of Object.entries(entries ?? {})) {
		if (!e?.venue) out.push({ id, why: '缺 venue（行为发生在哪）' });
		else if (!venues.includes(e.venue)) out.push({ id, why: `venue「${e.venue}」不在场所枚举里` });
		if (!e?.role) out.push({ id, why: '缺 role（岗位/身份）' });
	}
	return out;
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	t('正例：两列齐且 venue 合法 → 不报', judgeVenue({ a: { venue: '酒馆', role: '老板娘' } }).length === 0);
	t('反例①：缺 venue → 报', judgeVenue({ a: { role: '老板娘' } }).some((x) => x.why.includes('缺 venue')));
	t('反例②：缺 role → 报', judgeVenue({ a: { venue: '酒馆' } }).some((x) => x.why.includes('缺 role')));
	t('反例③：venue 不在枚举里（自由词漂移）→ 报', judgeVenue({ a: { venue: '某个我没声明的地方', role: 'x' } }).some((x) => x.why.includes('不在场所枚举')));
	t('正例：空登记簿 → 不报（登记制，不凭空造问题）', judgeVenue({}).length === 0);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：两列齐绿 / 缺 venue 红 / 缺 role 红 / venue 漂移红 / 空簿绿');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const ctx = createContext();
const entries = ctx.Game.NPC?.entries ?? {};
const total = Object.keys(entries).length;
const findings = judgeVenue(entries);
const strict = process.argv.includes('--strict');

console.log(`══ D9④ 场合面门（#407）══  NPC 让渡行为登记 ${total} 条｜缺 venue/role 的 ${findings.length} 项`);
for (const f of findings.slice(0, 5)) console.log(`  · ${f.id}：${f.why}`);
if (findings.length > 5) console.log(`  · …另有 ${findings.length - 5} 项`);

if (!findings.length) { console.log('✔ 场合面门通过：每条登记都声明了「在哪」与「岗位/身份」'); process.exit(0); }
if (strict) { console.error(`\n✗ 场合面门未通过（--strict：${findings.length} 项缺列）`); process.exit(1); }
console.log(`\n⏳ [已知缺陷 ${KNOWN_PENDING}] 报告但不判失败——补列完成后跑 --strict 转严格（这也是那批补列的红靶）`);
