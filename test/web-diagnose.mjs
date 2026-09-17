#!/usr/bin/env node
// P2（`#761`）第一片读数：**实时诊断纯件** ✓
//
// 适用面（**写清** ✗ —— 与"实时"这个理由一致 ✓）：页内**只**跑本件这类**包内一致性**判定 ✓（纯、毫秒级 ✓）；
// **不**跑 compile／equiv／story-shape 那类要构建或要起引擎的检查 ✓（那些留 CLI ✓，页内不冒充 ✓）。
//
// 四条读数（都**能假** ✗）：
//   ① 坏事件 ⇒ 诊断**结构化**且**点名** `{ event, field }` ✓（不是"有错" ✗）；
//   ② **真包 ⇒ 零诊断** ✗（能假的另一半 ✓ —— 否则"永远报错"也会过 ✓）；
//   ③ 确定性 ✓（同输入两次逐字节同 ✓）；
//   ④ **时延预算**：三故事全量判定 ≤ **50 ms** ✓（写死数字 ✓ 并实测 ✓）＋ 声明它测的是什么机器形态（纯函数、无 io ✓）。
import { readFileSync } from 'node:fs';
import { loadPackage } from '../editor/web/loader.mjs';
import { diagnoseStory, formatFinding, summarize } from '../editor/lib/core/diagnose.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
const SLUGS = ['mist-forest', 'hollow-cave', 'minimal-demo'];
const clone = (x) => JSON.parse(JSON.stringify(x));

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
const pkg = loadPackage({ slug: 'mist-forest', io: io() });

// ① 坏事件 ⇒ **点名** ✓（**合成包** ✓：结构显式、与判定同源 ✓）
{
	const mk = (row) => ({ 'rules.json': { rows: [{ id: 'ev.好', scope: 's', prio: 1, text: '正常一行 ✓' }, row] } });
	const good = mk({ id: 'ev.二', scope: 's', prio: 2, text: '也正常 ✓' });
	const cases = {
		'重复 id':     { ...good, 'rules.json': { rows: [good['rules.json'].rows[0], { ...good['rules.json'].rows[1], id: 'ev.好' }] } },
		'空 text':     mk({ id: 'ev.二', scope: 's', prio: 2, text: '   ' }),
		'prio 非数':   mk({ id: 'ev.二', scope: 's', prio: '2', text: '正常 ✓' }),
		'req 非数组':  mk({ id: 'ev.二', scope: 's', prio: 2, text: '正常 ✓', req: '火把' }),
	};
	const want = { '重复 id': ['ev.好', 'id'], '空 text': ['ev.二', 'text'], 'prio 非数': ['ev.二', 'prio'], 'req 非数组': ['ev.二', 'req'] };
	t('① 对照：合成**好**包 ⇒ 零诊断 ✗（先证"规则不是永远开火" ✓）', diagnoseStory({ data: good }).length === 0);
	for (const [name, data] of Object.entries(cases)) {
		const f = diagnoseStory({ data });
		const hit = f.find((x) => x.target.field === want[name][1] && x.target.event === want[name][0]);
		t(`① ${name} ⇒ 点名 \`{event: ${want[name][0]}, field: ${want[name][1]}}\` ✓`, Boolean(hit));
		t(`① ${name} ⇒ **结构化** ✓（level/step/detail/target{event,field} 齐 ✓）`,
			Boolean(hit) && ['level', 'step', 'detail', 'target'].every((k) => k in hit) && 'event' in hit.target && 'field' in hit.target);
	}
	t('① 缺 rules.json ⇒ 报**不适用**（info ✓，不是 error ✗）',
		diagnoseStory({ data: {} }).every((f) => f.level === 'info'));
}

// ② **真包 ⇒ 零诊断** ✗（能假的另一半 ✓）
{
	for (const slug of SLUGS) {
		const f = diagnoseStory({ data: loadPackage({ slug, io: io() }).data });
		const problems = f.filter((x) => x.level !== 'info');
		t(`② 真包 \`${slug}\` ⇒ **零 error/warn** ✗（否则"永远报错"也会过 ✓；info＝不适用 ✓）`, problems.length === 0);
	}
	t('② 摘要与报文 ✓（零诊断 ⇒ 说"没有发现问题" ✓）', summarize([]).includes('没有发现问题'));
	const one = diagnoseStory({ data: { 'rules.json': { rows: [{ id: 'ev.二', scope: 's', prio: 1, text: '' }] } } });
	t('② 有诊断 ⇒ 摘要含**数字** ✓（不是笼统一句 ✓）', summarize(one).includes('1') && formatFinding(one[0]).includes('ev.二'));
}

// ③ 确定性 ✓（同输入两次逐字节同 ✓）
{
	const d = { 'rules.json': { rows: [{ id: 'ev.二', scope: 's', prio: 1, text: '' }] } };
	t('③ 确定性：同输入两次 ⇒ 逐字节同 ✓', JSON.stringify(diagnoseStory({ data: d })) === JSON.stringify(diagnoseStory({ data: d })));
}

// ④ **时延预算**：写死 ≤ 50 ms ✓（实测打印 ✓）
{
	const pkgs = SLUGS.map((slug) => loadPackage({ slug, io: io() }).data);
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < 20; i += 1) for (const d of pkgs) diagnoseStory({ data: clone(d) });
	const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
	console.log(`  · ④ 时延：三故事全量判定 **${ms.toFixed(2)} ms/轮**（预算 ≤ 50 ms ✓ · 纯函数＋无 io ✓ ⇒ 页内可用 ✓）`);
	t('④ 时延在预算内 ✓（≤ 50 ms ⇒ "实时"是个数字 ✓ 不是形容词 ✓）', ms <= 50);
}

if (bad) { console.error(`\n✗ web-diagnose 未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ web-diagnose 通过（点名 ✓ · 真包零诊断 ✓ · 确定性 ✓ · 时延预算 ✓）');
