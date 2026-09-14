// `#607` P0 门：**门的发现与归属**（`scripts/audit/discovery.mjs` 的门）。
//
// 背景：`#602` 方案 1 把**判据数据**按故事落了；本片（P0）立"门代码"的归属机制且**一门都不搬**
// ⇒ 出口判据是「**零行为变化**」：`audit:golden` 零漂移（它是机械证据）＋ 这里的结构断言与反例。
//
// 判据（本文件）：
//   A1 真实仓库的发现面自检为空（清单/越界/未声明文件/重名/顺序表全覆盖）；
//   A2 **无孤儿门**：registry 里每道门都被至少一个故事的选中面覆盖（不会出现"没人跑的门"）；
//   A3 **顺序稳定**：任何故事的选中面（含 `engineGates()`）都是 `GATE_ORDER` 的**子序列**——搬家不改输出次序；
//   A4 已声明的门**只被它所属的故事**选中（P0 尚无声明 ⇒ 平凡真；P1 起这是"归属"的机检）；
//   A5 引擎门被**所有**故事选中（`--engine-only` 的地基）；
//   A6 纯函数反例：清单缺键／越界／路径不存在／文件存在但未声明／重复声明／跨故事重名／故事门偷用引擎 flag／
//      顺序表未登记／僵尸顺序键 ⇒ 逐条**必须报**（`--selftest` 之外的"反例"字样也让台账认出自证形态）。
import { execFileSync } from 'node:child_process';
import { judgeManifestGates, judgeGateSet, judgeOrderCoverage, judgeFlagOwnership, gateKey, GATE_ORDER,
	engineGates, pendingGates, declaredGates, declaredGatesAll, gatesForStory, validateDiscovery } from '../scripts/audit/discovery.mjs';
import { GATES } from '../scripts/audit/registry.mjs';
import { storySlugs } from '../scripts/dist-paths.mjs';

let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ ${label}`);
	else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); }
};

console.log('══ 门发现与归属门（#607 P0）══');

// ── A6 纯函数反例（先跑：不依赖仓库现状）──────────────────────────────
{
	const files = ['stories/s/gates/a.mjs', 'stories/s/gates/b.mjs'];
	const shape = (manifest) => judgeManifestGates({ slug: 's', manifest, existingFiles: files, exists: (p) => p !== 'stories/s/gates/gone.mjs' });
	t('反例①：清单缺 `gates` 键 ⇒ 报（"没有门也要写 []"）', shape({ slug: 's', files: [] }).some((p) => /缺 `gates` 键/.test(p)));
	t('反例②：路径越界（别处/非 .mjs）⇒ 报', shape({ gates: ['stories/other/gates/a.mjs'] }).some((p) => /越界或形状不对/.test(p)));
	t('反例③：声明了不存在的文件 ⇒ 报', shape({ gates: ['stories/s/gates/gone.mjs'] }).some((p) => /不存在/.test(p)));
	t('反例④：`gates/` 下有文件但未声明 ⇒ 报（放了门却没人跑）', shape({ gates: ['stories/s/gates/a.mjs'] }).some((p) => /未被声明/.test(p)));
	t('反例⑤：重复声明同一文件 ⇒ 报', shape({ gates: ['stories/s/gates/a.mjs', 'stories/s/gates/a.mjs'] }).some((p) => /重复声明/.test(p)));
	t('正例：两条都声明齐 ⇒ 0 条', shape({ gates: files }).length === 0);
	t('正例：`gates/` 下没有文件时，空数组是**合法**声明 ⇒ 0 条', judgeManifestGates({ slug: 's', manifest: { gates: [] }, existingFiles: [] }).length === 0);

	const g = (flags, file) => ({ flags, file });
	t('反例⑥：跨故事重名（同一 key 两处声明）⇒ 报', judgeGateSet({ gates: [g(['truth'], 'stories/a/gates/truth.mjs'), g(['truth'], 'stories/b/gates/truth.mjs')] }).some((p) => /key 冲突/.test(p)));
	t('反例⑦：故事门偷用引擎 flag ⇒ 报', judgeGateSet({ gates: [g(['waves'], 'stories/a/gates/w.mjs')] }).some((p) => /引擎层/.test(p)));
	t('反例⑧：未登记执行顺序 ⇒ 报', judgeGateSet({ gates: [g(['brand-new'], 'stories/a/gates/n.mjs')] }).some((p) => /未在 `GATE_ORDER`/.test(p)));
	t('反例⑨：僵尸顺序键 ⇒ 报', judgeOrderCoverage({ keys: ['truth'] }).some((p) => /已无对应门/.test(p)));
	t('正例：`sel`/`nosl`/`gear` 这类别名组合不误报（key 排序拼接）', judgeGateSet({ gates: [g(['sel', 'nosl'], 'x'), g(['sel', 'gear'], 'y')] }).length === 0 && gateKey({ flags: ['sel', 'nosl'] }) === 'nosl+sel');
}

// ── A7 归属守卫（纯函数；P0 尚无已声明的门 ⇒ 用合成数据证明它咬得住）──────────
{
	const declared = [{ owner: 'a', file: 'stories/a/gates/p.mjs', flags: ['probe'] }];
	t('反例⑩：点名别的故事的门 ⇒ 报（并指明该用哪个 --story）',
		judgeFlagOwnership({ flags: ['probe'], slug: 'b', declared }).some((p) => /属于故事「a」/.test(p) && /--story a/.test(p)));
	t('正例：点名自己故事的门 ⇒ 0 条', judgeFlagOwnership({ flags: ['probe'], slug: 'a', declared }).length === 0);
	t('正例：未迁移的门（不在 `declared` 里）⇒ 不拦（P0 零行为变化的边界）', judgeFlagOwnership({ flags: ['truth'], slug: 'b', declared }).length === 0);
}

// ── A1–A5 真实仓库 ───────────────────────────────────────────────────
const slugs = storySlugs();
const problems = await validateDiscovery();
t('A1 真实仓库的发现面自检为空', problems.length === 0, problems.join('；'));
t('A1b `GATE_ORDER` 覆盖**全部门**（工具层 registry ∪ 故事侧已声明；无未登记、无僵尸）',
		judgeOrderCoverage({ keys: [...new Set([...GATES.map(gateKey), ...(await declaredGatesAll()).map(gateKey)])] }).length === 0);

const perStory = {};
for (const slug of slugs) perStory[slug] = await gatesForStory(slug);

// A2 无孤儿门
{
	const selectedKeys = new Set(Object.values(perStory).flat().map(gateKey));
	const orphans = GATES.map(gateKey).filter((k) => !selectedKeys.has(k));
	t('A2 无孤儿门（registry 每道门都被至少一个故事选中）', orphans.length === 0, orphans.join('、'));
}
// A3 顺序稳定：选中面的 key 序列必须是 GATE_ORDER 的子序列
{
	const isSubsequence = (keys) => { let i = -1; for (const k of keys) { i = GATE_ORDER.indexOf(k, i + 1); if (i < 0) return false; } return true; };
	const bads = slugs.filter((s) => !isSubsequence(perStory[s].map(gateKey)));
	t('A3 每个故事的选中面都是 `GATE_ORDER` 的子序列（搬家不改输出次序）', bads.length === 0, bads.join('、'));
	t('A3b `engineGates()` 也是子序列（`--engine-only` 的次序与今天一致）', isSubsequence(engineGates().map(gateKey)));
}
// A4 已声明的门只属于它自己的故事
{
	const declared = await declaredGatesAll();
	const violations = [];
	for (const m of declared) {
		for (const [slug, gates] of Object.entries(perStory)) {
			const inIt = gates.some((g) => (g.file ?? '') === m.file);
			if (slug !== m.owner && inIt) violations.push(`${m.file} 被故事「${slug}」选中（它属于「${m.owner}」）`);
		}
		if (!perStory[m.owner].some((g) => (g.file ?? '') === m.file)) violations.push(`${m.file} 没被它所属的故事「${m.owner}」选中`);
	}
	t('A4 已声明的门**只被它所属的故事**选中（且必须被其所属故事选中）', violations.length === 0, violations.join('；'));
}
// A5 引擎门被所有故事选中
{
	const engKeys = engineGates().map(gateKey);
	const missing = slugs.filter((s) => { const ks = perStory[s].map(gateKey); return !engKeys.every((k) => ks.includes(k)); });
	t('A5 引擎门被每个故事选中', missing.length === 0, missing.join('、'));
}
// 待迁移清单与 registry 的划分是完备的（并集＝全集、交集为空）
{
	const eng = new Set(engineGates().map(gateKey)), pend = new Set(pendingGates().map(gateKey));
	const union = new Set([...eng, ...pend]);
	t('A5b `engineGates() ∪ pendingGates()` 恰好等于 registry（无门被落下、无门同时属两层）', union.size === GATES.length && [...eng].every((k) => !pend.has(k)));
}

// ── A8 CLI 作用域（`#607` P2-B）：`--story <slug>` 单独给 ⇒ **本故事作用域全跑** ────────────
// 为什么要有这条：他故事的门只被**它所属的故事**选中，而"他故事的全跑"此前**无路可走**
// （`--story X` 单独给 ⇒ "没有选中任何门"退 2）⇒ golden 的 `not-in-full-run` 交叉核对无法按归属比。
// 与 `--engine-only`（`#572`）同源：选择已由 `selected` 定，修饰符不该被当成"必须再点一个门"。
{
	const run = (args) => {
		try { return { code: 0, out: execFileSync('node', ['scripts/audit.mjs', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
		catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
	};
	const hollow = run(['--story', 'hollow-cave']);
	t('`--story hollow-cave` 单独给 ⇒ rc=0（本故事作用域全跑）', hollow.code === 0, `rc=${hollow.code}`);
	t('…且该跑确实含**故事 3 自己的门**（洞窟声明面／战斗分布）', /洞窟声明面|战斗分布口径门/.test(hollow.out));
	t('…且**不含**故事 1 的门（作用域没串）', !/文字工艺门|canon 门/.test(hollow.out));
	t('`--check` 单独给（既没点故事也没点门）⇒ rc=2（防假绿守卫不变）', run(['--check']).code === 2);
}

// ── P0 等价证据（第一道门搬进故事侧后，本块自动停止断言）────────────
{
	const declaredAll = await declaredGatesAll();
	if (!declaredAll.length) {
		const today = GATES.map(gateKey).join(' ');
		const same = slugs.every((s) => perStory[s].map(gateKey).join(' ') === today);
		t('P0 等价：尚无门声明在故事侧 ⇒ 每个故事的选中面**逐字等于** registry 全集与次序', same);
	} else {
		console.log(`      · 已有 ${declaredAll.length} 道门住故事侧 ⇒ P0 等价断言退役（改由 A3/A4/A5 与 golden 看守）`);
	}
}

if (bad) {
	console.error(`\n✗ 门发现与归属门未通过（${bad} 项）—— 归属必须显式、结构缺失必须报错（#607）`);
	process.exit(1);
}
console.log('\n✔ 门发现与归属门通过（无孤儿门 · 顺序稳定 · 声明只属本故事 · 十条反例都咬得住 · 作用域全跑四条）');
