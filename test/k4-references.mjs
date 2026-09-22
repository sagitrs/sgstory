// `#1016`：**门面引用完整性**的自证 ✓（判据 ＝ `editor/lib/core/k4criteria.mjs` 的 `referenceIntegrityProblems` ✓）。
//
// ⚠️ **本件是「纯自证」** ✗（`#1052` 起照录实测留痕 ✓）：正文①～⑥ 的输入是**内部常量**＋**注入面**
//   （⑦ 节是本片新加的真表读数 ✓）⇒ **不得用「单跑本件 rc=0」证明该门在真场景生效** ✗。
//   能证明它的是：**`editor/lib/host/commands.mjs` ③d 的真调用**（`existsOf`／`trackedOf` 由**宿主**注入 ✓）
//   ＋ **探针**（实测：注入 `#1016` 原始缺陷形状 ⇒ 真门 `node editor/cli.mjs k4` rc=1 并点名 ✓；
//   `#1052` 把探针锚改到**判据循环头** ⇒ 「未入库」那一支也在射程内 ✓）。
//   ⇒ 合入记录／文档按此表述，免得后来者把本件误当「门本体」✗。
//
// 为什么要有这一件 ✗（`#1004` 审阅期实测 ✓，缺口**实复现**过）：
//   `editor/escape-hatch.json` 的 `hatches[]` 里留过 **2 条** `slug:"mist-forest"`（该故事已删 ✓），
//   而**逐个门**试过 —— `editor/k4.mjs` / `scripts/audit.mjs` / `editor/story-ci.mjs` / `test/multi-story.mjs` /
//   `scripts/report-gate-ledger.mjs` —— **一个都不咬** ✗（rc 与"未注入"同值 ✓ ⇒ 不是"别的门兜住了" ✓）。
//   根因：`escapeHatchProblems` 按**故事**过滤（`h.slug === slug` ✓）⇒ **已删故事的 slug 落不进任何一次扫描** ✗
//   ⇒ 它**结构性不可见** ⇒ "**声明了要做 X、实际没做**"能安静留在仓里 ✓。
//
// 判据（**只咬字段值 ✗ 不读散文** ✓）：
//   `hatches[].slug` ∈ 现存故事集合 ✓｜`hatchFiles[]`／`refusedFaces[].file` 存在于工作树 ✓。
//   ⚠️ 本仓**留痕优先** ✓ ⇒ `reason`／`why`／`paths` 里写"与 `mist-forest` 同形"**是应当允许的** ✓
//     —— 正例③ 就是钉这一格的（**它不是"顺带"** ✗：这一格错了，门就会去罚历史留痕 ⇒ 假红 ✓）。
//   ⚠️ `paths` **不是路径** ✗（是散文"三条路 (i)(ii)(iii)…"✓）⇒ 对它做存在性判定＝**判一件它不声称的事** ✗。
//   ⚠️ `proseFaces` 的存在性**不重复判** ✗：已由 `handwrittenClosureProblems` 覆盖 ✓（实测：注入不存在路径 ⇒ 该判据 rc=1 并点名 ✓）。
//
// 为什么**单独一件**（而不是只往 `editor/k4.mjs --selfcheck` 塞几行 ✓）：
//   ① 这一格要**探针**才能从"写了断言"升级为"**真会红**"✓（`#908` ① ✓），而探针的 `id` 必须**逐字**对上**台账行** ✗
//      ⇒ 台账行只从 `test/**`／`scripts/report-*.mjs`／audit 开关来 ✓ ⇒ **本件就是那个行** ✓；
//   ② 探针要"掐掉判据 ⇒ 本件必红"✓ ⇒ 本件的断言必须**真的经过**那个判据 ✓（不是靠 rc 的旁证 ✓）。
//
// 环境：**纯件** ✓（不碰 fs／不跑 build ✗：`slugSet` 与 `existsOf` 都是**注入**的 ✓ —— 与判据本身同一口径 ✓）。
//   ⚠️ `#1052` 起本件**也**走真表（⑦ 主跑判据）：`git ls-files` ＋ 真 `escape-hatch.json`（**仍只读** ✗ 不写 ✓）。
//
// `#1052`：登记表里的**文件类**引用要求「**已入库 ∩ 存在**」✗（只判 `existsSync` ⇒ 未 `git add` 的新文件让
//   登记"看起来有效" ✓ —— `#1019`「没扫不许表现为通过」／`#1028`「`git add` 前跑是假绿」同一族）✓。
//   ⚠️ 本节的两条打印件用**具名常量**：探针要能证明「未入库会报」↓ —— 掐掉收集那一路 ⇒ 这两行
//     **不再出现** ⇒ 命中它们的断言必红 ✓（而只声称不判的**注释**掐掉后照样绿 ✗ ⇒ 那不是能假的一半 ✓）。

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { referenceIntegrityProblems } from '../editor/lib/core/k4criteria.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELFTEST = process.argv.includes('--selftest');

/** 两条打印件（**分开报** ✓ —— 未入库⇒`git add`、不存在⇒改登记，修法不同 ✓）。 */
const UNTRACKED_HINT = '未入库';
const MISSING_HINT = '不存在的文件';

let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

// 注入口：三个**都存在**的对象 ＋ 一份"什么都现存"的 existsOf ✓
const SLUGS = ['night-ferry', 'minimal-demo', 'face-fixture'];
const TRACKED = new Set([
	'stories/face-fixture/12-hooks.twee',
	'stories/minimal-demo/00-meta.twee',
	'stories/night-ferry/00-meta.twee',
]);
const existsOf = (rel) => TRACKED.has(rel);
/** 注入口（`#1052`）：同一份 `TRACKED` 兼作**已入库**集合 ✓（两轴各有一格能假的下半 —— 见 ⑤/⑦）。 */
const trackedOf = (rel) => TRACKED.has(rel);
const problemsOf = (registry) => referenceIntegrityProblems({ registry, slugSet: SLUGS, existsOf, trackedOf });

// ── ① `hatches[].slug` ────────────────────────────────────────────────────
t('正例①：`hatches[].slug` 指向**现存**故事 ⇒ 不报',
	problemsOf({ hatches: [{ member: 'overBudget', slug: 'face-fixture', reason: 'r', ticket: '#1004' }] }).length === 0);

{
	const p = problemsOf({ hatches: [{ member: 'overBudget', slug: 'mist-forest', reason: 'r', ticket: '#1004' }] });
	t('🔴 反例①：`hatches[].slug` 指向**已删故事** ⇒ 报（这就是 `#1004` 实测的那个缺口 ✓）',
		p.length === 1 && p[0].at === 'hatches[0].slug' && p[0].value === 'mist-forest' && /不存在的故事/.test(p[0].why),
		`点数 ${p.length}`);
}

// ── ② `hatchFiles[]` ──────────────────────────────────────────────────────
t('正例②：`hatchFiles[]` 指向**现存文件** ⇒ 不报',
	problemsOf({ hatchFiles: ['stories/face-fixture/12-hooks.twee'] }).length === 0);

{
	const p = problemsOf({ hatchFiles: ['stories/__gone__/12-hooks.twee'] });
	t('🔴 反例②：`hatchFiles[]` 指向**不存在的文件** ⇒ 报（该文件搬走／改名后登记腐烂 ✓）',
		p.length === 1 && p[0].at === 'hatchFiles[0]' && /不存在的文件/.test(p[0].why),
		`点数 ${p.length}`);
}

// ── ③ `refusedFaces[].file` ───────────────────────────────────────────────
t('正例③：`refusedFaces[].file` 指向**现存文件** ⇒ 不报',
	problemsOf({ refusedFaces: [{ file: 'stories/night-ferry/00-meta.twee', why: 'w', ticket: '#991', paths: 'p' }] }).length === 0);

{
	const p = problemsOf({ refusedFaces: [{ file: 'stories/__gone__/00-meta.twee', why: 'w', ticket: '#991', paths: 'p' }] });
	t('🔴 反例③：`refusedFaces[].file` 指向**不存在的文件** ⇒ 报',
		p.length === 1 && p[0].at === 'refusedFaces[0].file' && /不存在的文件/.test(p[0].why),
		`点数 ${p.length}`);
}

// ── ④ **留痕不罚**（本仓口径的承重格 ✓：判据只咬字段值 ✗ 不读散文 ✓）────────────
{
	// 散文面**到处**提到已删的 `mist-forest`（`reason`／`why`／`paths` 三处 ✓）—— 而**字段值全都在** ✓
	const p = problemsOf({
		hatches: [{ member: 'overBudget', slug: 'face-fixture', reason: '与 `mist-forest` 的那条**同形**（应当撤回 ✓）', ticket: '#1004' }],
		hatchFiles: ['stories/face-fixture/12-hooks.twee'],
		refusedFaces: [{ file: 'stories/night-ferry/00-meta.twee', why: '照 `mist-forest/20-chargen.twee` 的先例', ticket: '#1004', paths: '三条路：照 `mist-forest` 的写法…' }],
	});
	t('正例④：散文字段（`reason`／`why`／`paths`）里**提到已删故事** ⇒ 不报（**留痕优先** ✓ —— 罚了它就是假红 ✗）',
		p.length === 0, `点数 ${p.length}`);
}

// ── ⑤ 边界：不属本条的形态（**不越界判** ✓）─────────────────────────────────
t('边界⑤：条目**没有 `slug`**（全局条目 ✓）⇒ 不报（`escapeHatchProblems` 允许无 slug 的登记 ✓）',
	problemsOf({ hatches: [{ member: 'lootText', reason: 'r', ticket: '#736' }] }).length === 0);

t('边界⑤：字段**缺失／空串／非字符串** ⇒ 本判据不报（**形式约束**由各自判据点名 ✗ —— 如 `refusedFaceProblems` 的四字段 ✓）',
	problemsOf({ hatches: [{ member: 'm', slug: '', reason: 'r', ticket: '#1' }], refusedFaces: [{ why: 'w' }] }).length === 0);

t('边界⑤：`paths`（**散文** ✗ 不是路径 ✓）里的字符串**不做存在性判定**（判它就是"过门 ≠ 达意" ✗）',
	problemsOf({ refusedFaces: [{ file: 'stories/night-ferry/00-meta.twee', why: 'w', ticket: '#1', paths: '(i) 不存在的/路 (ii) 也不存在' }] }).length === 0);

t('边界⑤：空表／空 registry ⇒ 不报（"一条引用都没有"是合法状态 ✓）',
	problemsOf({}).length === 0 && problemsOf({ hatches: [], hatchFiles: [], refusedFaces: [] }).length === 0);

t('边界⑤：`slugSet` 传**数组**也认（与传 Set 同判 ✓ —— 注入面两种形态不许分叉 ✗）',
	referenceIntegrityProblems({ registry: { hatches: [{ member: 'm', slug: 'face-fixture', reason: 'r', ticket: '#1' }] }, slugSet: SLUGS, existsOf }).length === 0);

// ── ⑥ 多条同报（不早退 ✗：逐条点名，便于一次改完 ✓）────────────────────────
{
	const p = problemsOf({
		hatches: [{ member: 'a', slug: 'mist-forest', reason: 'r', ticket: '#1' }, { member: 'b', slug: 'hollow-cave', reason: 'r', ticket: '#1' }],
		hatchFiles: ['stories/__gone__/h.twee'],
	});
	t('正例⑥：三处坏引用 ⇒ **三条**（逐条点名 ✓，不早退 ✓）',
		p.length === 3 && p.map((x) => x.at).join(',') === 'hatches[0].slug,hatches[1].slug,hatchFiles[0]',
		`点数 ${p.length} · 位置 ${p.map((x) => x.at).join(',')}`);
}

// ── ⑦ **主跑判据**（`#1052`）：真登记表里的文件类引用必须「**已入库 ∩ 存在**」✓ ─────────────────
//   ⚠️ 本节**不是**合成例：真 `escape-hatch.json` ＋ 真 `git ls-files` ＋ 真 `existsSync`（宿主注入 ✓）。
//   ⚠️ 它**在 `--selftest` 下也跑** ✓（探针跑的就是 `--selftest` ⇒ 不跑则探针不咬 ✗ —— 见顶注 ✓）。
if (SELFTEST) {
	const real = JSON.parse(readFileSync(join(ROOT, 'editor/escape-hatch.json'), 'utf8'));
	const slugsOnDisk = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
	const trackedReal = new Set(slugsOnDisk);
	const realStories = [...new Set([...trackedReal].filter((f) => /^stories\/[^/]+\//.test(f)).map((f) => f.split('/')[1]))];
	/** 主门口径的原样封装：真存在性 ＋ 真入库（`trackedOf` 可**局部**替换以驱动那一格 ✓）。 */
	const P = (registry, { trackedOver = (r) => trackedReal.has(r), existsOver = (rel) => existsSync(join(ROOT, rel)) } = {}) =>
		referenceIntegrityProblems({ registry, slugSet: new Set(realStories), existsOf: existsOver, trackedOf: trackedOver });

	t('真表·干净：真 slugSet ＋ 真 existsOf ＋ 真 trackedOf ⇒ 0 条（**基线绿** ✓ —— 探针要求"变异前绿" ✓）',
		P(real).length === 0, `点数 ${P(real).length} · ${P(real).map((p) => p.at).join(',')}`);

	{   // 能假格①：**真表 ＋ 真存在性**，只把 `trackedOf` 对这一条说成「未入库」⇒ 必须报且**注明未入库** ✓
		// `#1132` B3：真表 `hatchFiles` 已清空（最后的逃生舱件移入引擎）⇒ 本格夹具改为**合成登记**，
		//   取一件**真实存在且已入库**的路径，既保住"能假"性质，也不依赖真表里有条目。
		const reg2 = { ...real, hatchFiles: ['stories/face-fixture/11-fixture-cards.twee'], refusedFaces: [], hatches: [] };
		const f = reg2.hatchFiles[0];
		const p = P(reg2, { trackedOver: (r) => r !== f });
		t(`未入库必报（\`hatchFiles[]\`）：真表 ＋ \`trackedOf(\`${f}\`)===false\` ⇒ 报 1 条且含「${UNTRACKED_HINT}」（\`git add\` 之前跑＝**假绿** ✓）`,
			p.length === 1 && p[0]?.untracked === true && p[0]?.at === 'hatchFiles[0]' && p[0]?.why.includes(UNTRACKED_HINT),
			`点数 ${p.length}${p[0] ? ' · why=' + p[0].why.slice(0, 40) : ''}`);
	}

	{   // 能假格②：同上但**面是 `refusedFaces[].file`**（两条路径都要能假 ✓，不能只测一条 ✓）
		const f = (real.refusedFaces ?? [])[0]?.file;
		const p = f ? P(real, { trackedOver: (r) => r !== f }) : [];
		t(`未入库必报（\`refusedFaces[].file\`）：真表 ＋ \`trackedOf(\`${f}\`)===false\` ⇒ 报 1 条且含「${UNTRACKED_HINT}」`,
			p.length === 1 && p[0]?.untracked === true && p[0]?.at === 'refusedFaces[0].file' && p[0]?.why.includes(UNTRACKED_HINT),
			`点数 ${p.length}`);
	}

	{   // 能假格③：**不在磁盘** ⇒ 报「不存在」且**不得**标 `untracked`（两条**分开** ✓：修法不同 ✓）
		const reg3 = { ...real, hatchFiles: ['stories/face-fixture/11-fixture-cards.twee'], refusedFaces: [], hatches: [] };   // 同上：真表已空
		const f = reg3.hatchFiles[0];
		const p = P(reg3, { existsOver: (r) => r !== f });
		t(`不存在必报且**不**标未入库：真表 ＋ \`existsOf(\`${f}\`)===false\` ⇒ 报 1 条、含「${MISSING_HINT}」、\`untracked\` 不置位 ✓`,
			p.length === 1 && p[0]?.untracked !== true && p[0]?.why.includes(MISSING_HINT),
			`点数 ${p.length}`);
	}

	t('🔴 顺序不可反：文件**既不在磁盘也不入库** ⇒ 报「不存在」（磁盘口径是真因 ✓），**不是**「未入库」（那会说错修法 ✗）',
		(() => {
			const p = referenceIntegrityProblems({
				registry: { hatchFiles: ['stories/__gone__/h.twee'], refusedFaces: [{ file: 'stories/__gone__/00-meta.twee', why: 'w', ticket: '#1', paths: 'p' }] },
				slugSet: SLUGS, existsOf: () => false, trackedOf: () => false,
			});
			return p.length === 2 && p.every((x) => x.untracked !== true && x.why.includes(MISSING_HINT));
		})());

	t('边界：**不注入** `trackedOf` ⇒ 行为与 `#1052` 之前逐字相同（不误报已存在文件 ✓ —— 向后兼容 ✓）',
		referenceIntegrityProblems({ registry: { hatchFiles: ['stories/face-fixture/12-hooks.twee'] }, slugSet: SLUGS, existsOf }).length === 0);

	t('边界：一条坏引用**只报一次** ✗（不重复报"不存在＋未入库"两条 ✓）',
		referenceIntegrityProblems({ registry: { hatchFiles: ['stories/__gone__/h.twee'] }, slugSet: SLUGS, existsOf: () => false, trackedOf: () => false }).length === 1);
}

if (bad) {
	console.error(`\n✗ 门面引用完整性自证：${bad} 条未过（本件是 #1016／#1052 的**能假**那一半 ✗ —— 它红了说明判据被改坏或被摘掉 ✓）`);
	process.exit(1);
}
console.log('\n✔ 门面引用完整性自证通过（`#1016`＋`#1052`：hatches[].slug ＋ hatchFiles[] ＋ refusedFaces[].file 三类引用 · 正反例成对 ＋ 留痕不罚 ＋ 不越界判 ＋ 文件类引用要求「已入库 ∩ 存在」）');
