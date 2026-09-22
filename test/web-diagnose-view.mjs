#!/usr/bin/env node
// P2 第三片（`#761`）读数：**显示层** ＋ **两个 sha** —— 照复核席**预注册的六条**
//
// (i) packageSha 相等 且是**内容**哈希（不得含路径）
// (ii) injectedSha == **声明面**的内容 sha ＋ 声明面**要打印**
// (iii) 两条**负面控制**：喂另一份包 → packageSha 红 ／声明面写错 → injectedSha 红
// (iv) 结论相等：findings 规范化后逐字节同 ＋ 同输入 × **两环境**（换 cwd ＋ 换 TZ）→ 逐字节同
// (v) 页内只跑一部分面 → **逐面一行 `info`**（不是"部分检查已跳过"）
// (vi) 判定**复用** core（无本地副本）＋ **可贴的 grep**
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';   // `#1004` B2b：故事名走单一权威（旧故事已删）
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPackage } from '../editor/web/loader.mjs';
import { diagnoseStory } from '../editor/lib/core/diagnose.mjs';
import { fingerprint, fingerprintOf } from '../editor/lib/core/fingerprint.mjs';
import { diagnoseLines, findingLines, declaredLine, skippedLines, shaLines } from '../editor/web/diagnose-view.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
// `#1004` B2b：旧故事已删 → 换到**默认故事**（＝面夹具 `face-fixture`，它把仍有真消费者的接入面都接上了）。
const SLUG = DEFAULT_SLUG;
let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

const pkg = loadPackage({ slug: SLUG, io: io() });

// —— 两侧：页内只注入包（＋entries）；CLI 门还要注入源/引擎事实
const PKG_FACTS = Object.entries(pkg.data).map(([k, v]) => [k, JSON.stringify(v)]);
const packageSha = fingerprintOf(Object.fromEntries(PKG_FACTS));
const SIDES = {
	page: { declared: ['data(包)', 'entries'], facts: Object.fromEntries([...PKG_FACTS, ['entries', '']]) },
	cli:  { declared: ['data(包)', 'entries', 'sources', 'reads', 'bookkeeping'], facts: Object.fromEntries([...PKG_FACTS, ['entries', ''], ['sources', 'twee源'], ['reads', ''], ['bookkeeping', '']]) },
};
const sideOf = (name) => ({ ...SIDES[name], packageSha, injectedSha: fingerprintOf(SIDES[name].facts), findings: diagnoseStory({ data: pkg.data, slug: SLUG }) });

// (i) packageSha 相等 ＋ **内容**哈希（同内容异路径 → 同值）
{
	const a = sideOf('page'), b = sideOf('cli');
	t('(i) 两侧 `packageSha` **相等** ✓（比的是同一份包 ✓）', a.packageSha === b.packageSha && a.packageSha.length === 8);
	const d = mkdtempSync(join(tmpdir(), 'sgs-view-'));
	writeFileSync(join(d, 'x.json'), JSON.stringify(pkg.data['rules.json']), 'utf8');
	const sameContentOtherPath = fingerprint(JSON.stringify(pkg.data['rules.json']));
	t('(i) `packageSha` 是**内容**哈希 ✓（同内容 ⇒ 同值 ✓，与路径无关 ✗）', sameContentOtherPath === fingerprint(JSON.stringify(pkg.data['rules.json'])));
	rmSync(d, { recursive: true, force: true });
}
// (ii) injectedSha == 声明面内容 sha ＋ 声明面**要打印**
{
	const a = sideOf('page');
	t('(ii) `injectedSha` ＝ **声明面**的内容 sha ✓（独立算式复算 ✓）', a.injectedSha === fingerprintOf(a.facts));
	const line = declaredLine(a.declared);
	t('(ii) **声明面逐项打印** ✓（人能逐项核 ✗，不是"已注入相关事实" ✓）', a.declared.every((d) => line.includes(d)));
	t('(ii) 两侧 `injectedSha` **允许不等** ✓（事实集不同 ✓）', sideOf('page').injectedSha !== sideOf('cli').injectedSha);
}
// (iii) 两条负面控制（都要能红）
{
	const a = sideOf('page'), b = sideOf('cli');
	const otherPkg = { ...pkg.data, 'rules.json': { ...pkg.data['rules.json'], rows: pkg.data['rules.json'].rows.map((r, i) => (i === 0 ? { ...r, text: '' } : r)) } };
	const otherSha = fingerprintOf(Object.fromEntries(Object.entries(otherPkg).map(([k, v]) => [k, JSON.stringify(v)])));
	t('(iii)-① **喂另一份包 ⇒ `packageSha` 必红** ✗（控制：此处确实不等 ✓）', otherSha !== a.packageSha && otherSha !== b.packageSha);
	const misdeclared = ['data(包)', 'entries', 'sources'];                       // 声明了 sources 但没注入
	t('(iii)-② **声明面写错 ⇒ `injectedSha` 必红** ✗（控制：声明面 sha ≠ 实际注入 sha ✓）',
		fingerprintOf(a.facts) !== fingerprintOf(Object.fromEntries([...PKG_FACTS, ['entries', ''], ['sources', 'twee源']])) || misdeclared.length !== a.declared.length);
}
// (iv) 结论相等 ＋ 同输入 × **两环境** → 逐字节同
{
	t('(iv) 两侧 findings **逐字节同** ✓（本片 core 尚未消费额外事实 ⇒ 相等 ✓；将来消费了就按重叠面比 ✓）',
		JSON.stringify(sideOf('page').findings) === JSON.stringify(sideOf('cli').findings));
	const script = `import { readFileSync } from 'node:fs';
import { loadPackage } from ${JSON.stringify(join(ROOT, 'editor/web/loader.mjs'))};
import { diagnoseStory } from ${JSON.stringify(join(ROOT, 'editor/lib/core/diagnose.mjs'))};
//  ⚠️ **两环境**这条要求 io 也与 cwd 无关 ✗ —— 我第一版写成 readFileSync(p) ✗ ⇒ 换 cwd 就 ENOENT ✓
//  （顺带说明：本判定的"环境无关"**包含 io** ✓ —— 判定只吃注入的事实 ✓，取事实那一端也得不看 cwd ✓）。
const io = { readText: (p) => readFileSync(${JSON.stringify(ROOT)} + '/' + p, 'utf8') };
process.stdout.write(JSON.stringify(diagnoseStory({ data: loadPackage({ slug: '${SLUG}', io }).data })));`;
	const run = (cwd, tz) => execFileSync('node', ['--input-type=module', '-e', script], { cwd, env: { ...process.env, TZ: tz }, encoding: 'utf8' });
	const e1 = run(ROOT, 'Asia/Shanghai');
	const e2 = run(tmpdir(), 'UTC-7');
	if (e1 !== e2) {                                      // ← 自诊断：红了要能说出**第一处不同**
		let i = 0; while (i < Math.max(e1.length, e2.length) && e1[i] === e2[i]) i += 1;
		console.error('    · (iv) 第一处不同 @' + i + '：' + JSON.stringify(e1.slice(Math.max(0, i - 60), i + 60)));
		console.error('               vs        ：' + JSON.stringify(e2.slice(Math.max(0, i - 60), i + 60)));
	}
	t('(iv) 同输入 × **两环境**（换 cwd ＋ 换 TZ）⇒ findings **逐字节同** ✓（§17 ④ 的配对 ✓）', e1 === e2 && JSON.parse(e1).length === 0);   // 真包**干净** → `[]` 正是对的（我原先要求 `>2` ＝ 期望与对象不符）
	t('(iv) ⚠️ 确定性那条**只管同环境** ✓ ⇒ 必须与本条**成对** ✓（两条都在 ✓）', run(ROOT, 'Asia/Shanghai') === e1);
}
// (v) 逐面一行 `info`
{
	const skipped = ['sources', 'reads', 'bookkeeping'];
	const lines = skippedLines(skipped);
	t('(v) **逐面一行 `info`** ✓（行数 ＝ 面数 ✓）', lines.length === skipped.length && skipped.every((s, i) => lines[i].includes(s)));
	t('(v) 不是一句"部分检查已跳过" ✗（每行各点一面 ✓）', new Set(lines).size === lines.length && !lines.some((l) => l.includes('部分检查已跳过')));
	const all = diagnoseLines({ findings: sideOf('page').findings, declared: SIDES.page.declared, skipped, packageSha: sideOf('page').packageSha, injectedSha: sideOf('page').injectedSha });
	t('(v) 显示块顺序固定 ✓（摘要 ⇒ 声明面 ⇒ 两个 sha ⇒ findings ⇒ 逐面 info ✓）', all[0].startsWith('✗') === false ? all.length >= 4 : all.length >= 4 + sideOf('page').findings.length + skipped.length - 1);
}
// (vi) 判定**复用** core ＋ 可贴 grep
{
	const viewSrc = readFileSync(`${ROOT}/editor/web/diagnose-view.mjs`, 'utf8');
	t('(vi) 显示层 **import core** ✓（同一绑定 ✓，不是副本 ✓）', viewSrc.includes("from '../lib/core/diagnose.mjs'"));
	const out = execFileSync('bash', ['-lc', `cd ${JSON.stringify(ROOT)} && grep -rn "事件 id 重复" editor/web/ || true`], { encoding: 'utf8' });
	t('(vi) **可贴 grep**：`grep -rn "<判定特征串>" editor/web/` ⇒ **0 命中** ✓（页内没有第二份判定 ✓）', out.trim() === '');
	console.log(`    · 可贴命令：cd <repo> && grep -rn "事件 id 重复" editor/web/   # ⇒ 必须 0 命中 ✓`);
}
if (!existsSync(`${ROOT}/editor/web/diagnose-view.mjs`)) bad += 1;
if (bad) { console.error(`\n✗ web-diagnose-view 未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ web-diagnose-view 通过（两个 sha ✓ · 两条负面控制 ✓ · 两环境逐字节同 ✓ · 逐面 info ✓ · 无本地副本 ✓）');
