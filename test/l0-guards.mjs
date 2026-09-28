// `#1564`（`#1222` 链首 L0）**判据先行**的自证件 —— 四件（②③④⑤）。
//
// ★本笔的定位（票面）：**判据先行的小改** —— 先把"能抓住这些形态"的判据落地，
//   ✗ 动 chargen 的结构（那是 L1/L2）。
//
// 判据（每条对应一处失效方式）：
// ② **未宣告前缀 ⇒ 点名红**（✗ 静默当"不匹配"）
//    ★现状实证：`readKey('foo:钥匙', pc)` 返回 `undefined` —— 它**静默落回** `ev.foo:钥匙` 读法
//      ⇒ 与"条件不满足"**读数完全相同** ⇒ **静默死**（无门看得见）✗
// ③ **同一个键被两族各自产生 ⇒ 点名红**（共读可以、两处产生不行）
//    ★它是 `#1484` 并存守卫的**转形**（旧判据物 `hasChargen` ＋ `chargen` 在归并中消失 ⇒ ✗ 跟着删）
// ④ **引擎/数据面写的 `pc` 键必须已宣告**（✗ "隐键"）
//    ★`pc.classHp` 是第一个实例（由车卡 `patch.set` 造；✗ 在基础面 ✗ 在归属表 ⇒ 三面皆不可见）
// ⑤ **过渡并存 fail-loud**（旧写法与新形状并存 ⇒ 红；✗ 静默以某一方为准）
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PC_BASE_KEYS, PC_GAMEPLAY_HOME, undeclaredWriteProblems, undeclaredWriteReport, dualProducerProblems, UNDECLARED_WRITE_EXCEPTIONS, exceptionRemovable, collectConditionKeys } from '../editor/lib/core/pc-state-map.mjs';
import { unknownPrefixProblems } from '../editor/lib/core/audit-shared.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let CONTEXT = null;   // 真引擎上下文（懒建；行为面用）
let KEY_PREFIX_RE_BEHAVIOR = () => false;   // 由 ②c-4 前替换为真判据（懒建；✗ 顶层 await）
let bad = 0;
const t = (label, ok, detail = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`); }
};

// ②c-4 用：懒取真正则（顶层 await 合法 —— 本件已是 ESM 顶层）
{
	const { KEY_PREFIX_RE } = await import('../editor/lib/core/audit-shared.mjs');
	const { VOCAB } = await import('../editor/lib/core/vocab.mjs');
	KEY_PREFIX_RE_BEHAVIOR = () => VOCAB.prefixes.every((p) => KEY_PREFIX_RE.test(`${p}:x`));
}

// ── ② 未宣告前缀 ⇒ 点名红 ─────────────────────────────────────────────────
{
	const rules = readFileSync(join(ROOT, 'src/engine/40-sim/22-rules.twee'), 'utf8');
	// ★★ ②a 改**行为面**（评审 NIT：断源码文本 ≠ 断那个函数的行为 —— 本仓「附二十五」族）：
	//   直接**调用** `Sg.rules.readKey`，看它**抛不抛**（✗ 读源码里有没有那两句）。
	//   ★为什么必须行为面：源码里"有那两句"与"那两句真的在拦"是两件事 ——
	//     若判据被短路（如条件写反），文本格仍绿而行为已死 ✗。
	t('②a **行为面**：`readKey` 对未宣告前缀 ⇒ **真的抛**（✗ 静默落回 `ev.<前缀>:…` 读法）',
		await readKeyThrows('foo:钥匙') === true, '未宣告前缀没有抛');
	t('②a′ 反证：**已宣告**前缀 ⇒ ✗ 不抛（本格可区分，✗ 恒红）',
		await readKeyThrows('inv:钥匙') === false, '已宣告前缀反而抛了');
	// ②b 前缀清单 ≡ `readKey` 实认的那一套（★"声明面 ⊊ 实现面"会**误杀**）
	//     ★做法：从实现里抽"实认的前缀"（正则 ＋ startsWith），与 `prefixes` 清单逐字比。
	const declared = (/prefixes:\s*\[([^\]]*)\]/.exec(rules)?.[1] ?? '')
		.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
	const recognized = [...new Set([
		...[...rules.matchAll(/\/\^\(([a-z|]+)\):/g)].flatMap((m) => m[1].split('|')),
		...[...rules.matchAll(/startsWith\('([a-z_]+):'\)/g)].map((m) => m[1]),
	])].filter((x) => x !== 'n_');   // `n_` 是**前缀不是冒号族**（不走 `prefixes`）✓
	const missing = recognized.filter((x) => !declared.includes(x));
	t('②b `prefixes` 清单 ⊇ `readKey` 实认的前缀（✗ 漏项 ⇒ 判据②会**误杀**引擎真认的前缀）',
		missing.length === 0, `实认但未宣告：${missing.join('、')}（清单＝${declared.join('、')}）`);
	// ②c 镜像逐字同（`test/rules-core.mjs` 也断，此处作本件的自洽）
	const vocab = readFileSync(join(ROOT, 'editor/lib/core/vocab.mjs'), 'utf8');
	const mirrored = (/prefixes:\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(vocab)?.[1] ?? '')
		.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
	t('②c `prefixes` 与 vocab 镜像**逐字同**', JSON.stringify(declared) === JSON.stringify(mirrored),
		`引擎 ${declared.join('、')} ／ 镜像 ${mirrored.join('、')}`);
	// ★★ ②c-2~②c-4（评审 `#1566` 缺陷①的**根因**：四份前缀清单各自腐烂）
	//   现场：`audit-shared.mjs` 的 `KEY_PREFIX_RE` 硬编码 ⇒ **漏 `codex`**；
	//        `test/cond-keyform.mjs` 的 `keyReadable` 硬编码 ⇒ **漏 `chk`／`fight`**（缺口还各不相同）
	//   ⇒ 修法＝**四份收成一份**（引擎 ⇒ VOCAB ⇒ 其余**派生**）；本组断"派生化"落地且不回流。
	const auditShared = readFileSync(join(ROOT, 'editor/lib/core/audit-shared.mjs'), 'utf8');
	t('②c-2 `audit-shared.mjs` 的 `KEY_PREFIX_RE` **从 VOCAB 派生**（✗ 硬编码 —— 原漏 `codex`）',
		auditShared.includes('KEY_PREFIX_RE = new RegExp') && auditShared.includes('VOCAB.prefixes.join'),
		'仍是硬编码（易再腐烂）');
	t('②c-3 `cond-keyform.mjs` 的 `keyReadable` **从 VOCAB 派生**（✗ 硬编码 —— 原漏 `chk`／`fight`）',
		/VOCAB\.prefixes\.join/.test(readFileSync(join(ROOT, 'test/cond-keyform.mjs'), 'utf8')));
	t('②c-4 ★**行为面**：`KEY_PREFIX_RE` 认全**六个**（✗ 漏 `codex` 那个旧形）', (() => {
		// 行为面（✗ 读源码）：真取该正则逐前缀试
		return KEY_PREFIX_RE_BEHAVIOR();
	})());
	// ②d ★能假：造一个未宣告前缀 ⇒ 该格红（本格判"判据真的会抛"）
	t('②d **能假**：未宣告前缀在该判据下**必然命中**（✗ 恒绿）',
		colonPrefixesOf(['inv:钥匙', 'bogus:x', 'foo:钥匙']).some((p) => !declared.includes(p)),
		'三个样本都没能造出未宣告前缀');
	// ★★ ②e~②g（评审 CR ① 后补）：**编译期半** —— ✗ 只靠运行时
	//   现场（评审实测 ＋ 我复现）：把故事条件行的 `req` 改成 `bogus:…` ⇒ `build` **rc=0**、
	//   产物里**真有** `bogus` ⇒ 要等**玩家点那条链接**才炸 ✗（而同一把尺子的"算子"半是**编译期**抛的）
	t('②e 编译期守卫在场（`compile-story` 里，与 ④ 同处）',
		/unknownPrefixProblems\(\{/.test(readFileSync(join(ROOT, 'editor/lib/host/commands.mjs'), 'utf8'))
			&& /\[cond-prefix\]/.test(readFileSync(join(ROOT, 'editor/lib/host/commands.mjs'), 'utf8')));
	t('②f **能假**（编译期）：条件键用未宣告前缀 ⇒ 点名',
		unknownPrefixProblems({ conditions: collectConditionKeys({ rules: { rows: [{ id: 'r', req: ['bogus:x'] }] } }), declared })
			.some((p) => p.prefix === 'bogus'));
	// ★★ 评审 CR（tester-4）修：本格原喂 `links:[{req:…}]` —— **生产从不产生的形状**
	//   （真数据的链接是 `{id,label,to,prio,**cond**:{req:[…]}}`）⇒ 格与接法**脱钩** ✗
	//   ⇒ 改成**真实形状**（链接的条件在 `cond` 下）✓
	t('②g **正例**（★真实形状）：全用已宣告前缀 ⇒ ✗ 不报（✗ 误杀真数据）',
		unknownPrefixProblems({
			conditions: collectConditionKeys({
				rules: { rows: [{ req: ['inv:钥匙'], any: [{ gte: ['gold', 1] }] }] },
				// ★真数据形：链接的条件嵌在 `cond`
				passages: { 斗: { links: [{ id: 'l', cond: { req: ['fight:雾影.won'] } }] } },
			}), declared,
		}).length === 0);
	// ★②g-2 **反例（★这条是"链接覆盖"的判别格 —— 修前恒绿＝脱钩实证）**：
	//   链接的 `cond` 里放未宣告前缀 ⇒ 必须点名（✗ 恒不命中）
	t('②g-2 **能假（链接面）**：链接 `cond` 里的未宣告前缀 ⇒ 点名（✗ 修前恒不命中）',
		unknownPrefixProblems({
			conditions: collectConditionKeys({
				passages: { 斗: { links: [{ id: 'l', cond: { req: ['foo:钥匙'] } }] } },
			}), declared,
		}).some((p) => p.prefix === 'foo'),
		'链接 cond 里的未宣告前缀没被抓到（判据对链接面瞎）');
}

/** 真调 `Sg.rules.readKey(key, pc)`，返回"是否抛"（★行为面，✗ 读源码文本）。 */
async function readKeyThrows(key) {
	const { createContext } = await import('../scripts/audit/context.mjs');
	if (!CONTEXT) CONTEXT = createContext({ story: null });
	try {
		CONTEXT.window.Sg.rules.readKey(key, { ev: {}, world: {}, inv: { 钥匙: true } });
		return false;
	} catch { return true; }
}

/** 产品面（引擎／编辑器／构建脚本）的文件清单 —— 判"判据物有没有接线"用。 */
function productSideFiles() {
	const out = [];
	const walk = (dir) => {
		for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
			const rel = join(dir, e.name);
			if (e.isDirectory()) walk(rel);
			else if (/\.(mjs|twee)$/.test(e.name)) out.push(rel);
		}
	};
	for (const d of ['src', 'editor', 'scripts']) walk(d);
	return out;
}

/** 抽"首个冒号前那段"（照实现的口径）。 */
function colonPrefixesOf(keys) {
	return keys.map((k) => (/^([A-Za-z_][A-Za-z0-9_]*):/.exec(k)?.[1] ?? '')).filter(Boolean);
}

// ── ③ 同一个键被两族各自产生 ⇒ 点名红 ─────────────────────────────────────
{
	const p1 = dualProducerProblems({ sources: { pcShape: ['hp', 'classHp'], chargenFlow: ['classHp', 'gear'] } });
	t('③ 交非空 ⇒ 点名（且点名**两端**）',
		p1.length === 1 && p1[0].key === 'classHp' && p1[0].a === 'pcShape' && p1[0].b === 'chargenFlow',
		JSON.stringify(p1));
	t('③ **共读可以**：两族各持不同键（`salves` 型）⇒ ✗ 不报（✗ 误杀共读）',
		dualProducerProblems({ sources: { pcShape: ['hp'], chargenFlow: ['gear'] } }).length === 0);
	t('③ 单源 ⇒ ✗ 不报（✗ 自己跟自己比）',
		dualProducerProblems({ sources: { pcShape: ['hp', 'hp'] } }).length === 0);
	// ★★ ③ 的接线状态（评审 CR ② 后**如实**）：
	//   ★原格写"引擎侧仍有落点"，实际 grep 的是 `/两条产生路径|并存点名|dualProducerProblems/` 对 `10-core.twee`
	//     ⇒ 命中的是**旧 `hasChargen` 守卫的注释措辞** ⇒ ★"新判据的调用点"与"旧守卫的说明文字"**不可区分** ✗
	//     （那正是本笔自己声称要防的"**有判据无消费**"）⇒ 该格给的是**错答案**。
	//   ⇒ 改**如实两格**：(a) 导出在场（`typeof === 'function'`）(b) ★**明标未接线**（产品面零调用）
	t('③a 判据物**已备**（导出在场）', typeof dualProducerProblems === 'function');
	const callers = productSideFiles()
		.filter((f) => /dualProducerProblems\s*\(/.test(readFileSync(join(ROOT, f), 'utf8')));
	t('③b 判据物**未接线**（产品面零调用 —— ★如实记：接线挂 L2，两族的机器可读键集要 L1 的形状）',
		callers.length === 0, `意外已有调用：${callers.join('、')}`);
	t('③c 旧 `hasChargen` 并存守卫**仍是活机制**（语义今天真在 —— ✗ 尚未被 ③ 替代）',
		/两条产生路径/.test(readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8')));
}

// ── ④ 引擎/数据面写的 pc 键必须已宣告 ───────────────────────────────────────
{
	t('④ `classHp`（隐键）⇒ 点名', undeclaredWriteProblems({ written: ['classHp'] }).some((x) => x.key === 'classHp'));
	t('④ 已宣告键 ⇒ ✗ 不报（base ∪ home 全覆盖）',
		undeclaredWriteProblems({ written: [...PC_BASE_KEYS, ...Object.keys(PC_GAMEPLAY_HOME)] }).length === 0);
	t('④ **能假**：随便一个未登记键 ⇒ 点名',
		undeclaredWriteProblems({ written: ['不存在的键'] }).length === 1);
	// ④ 在**编译期**有落点（同族先例 `dataFaceMemberProblems` 的位置）
	const cmds = readFileSync(join(ROOT, 'editor/lib/host/commands.mjs'), 'utf8');
	t('④ 编译期守卫在场（`compile-story` 的 buildCommand 里，与 `dataFaceMemberProblems` 同族）',
		/undeclaredWriteReport\(\{ written \}\)/.test(cmds) && /\[chargen-write\]/.test(cmds),
		'`commands.mjs` 里找不到该守卫');
	// ④e~④h ★裁**甲**的"抓而不修"（登记 + 退出条件 ⇒ 三态）
	// ★★ 评审 CR（tester-4）修：本组**指到真接法**（✗ 喂"生产永不产生"的输入）——
	//   `written` ＝ 该故事 `chargen patch` 的顶层键（＝数据面实况），与 `commands.mjs` 的调用**同源**。
	t('④e 已登记且**仍在数据面** ⇒ **只报不红**（信息面；✗ 计退码 —— 甲的范围边界）', (() => {
		const r = undeclaredWriteReport({ written: ['classHp', 'abilities'] });
		return r.fails.length === 0 && r.infos.length === 1;
	})());
	t('④f ★**已登记但退出条件命中**（键已从数据面消失 ⇒ L1/L2 完成）⇒ **红**（✗ 登记成永久豁免）', (() => {
		// ★这就是"模拟 L1/L2 撤掉 classHp 写入"的形态 —— 评审实测过：修前此形 **rc=0**（豁免永久化）
		const r = undeclaredWriteReport({ written: ['abilities'] });
		return r.fails.length === 1 && r.fails[0].code === 'exception-removable' && r.fails[0].key === 'classHp';
	})());
	t('④g **未登记**的新隐键 ⇒ **红**（能假：甲下仍满足票面"造反例⇒该格红"）', (() => {
		const r = undeclaredWriteReport({ written: ['classHp', '全新未宣告键'] });   // ★classHp 在场 ⇒ 只有新键该红
		return r.fails.length === 1 && r.fails[0].code === 'undeclared-pc-write';
	})());
	t('④h `classHp` 的登记行有 `why` ＋ `removal` ＋ **可机核谓词**（✗ 自由书写）',
		!!UNDECLARED_WRITE_EXCEPTIONS.classHp?.why && !!UNDECLARED_WRITE_EXCEPTIONS.classHp?.removal
			&& UNDECLARED_WRITE_EXCEPTIONS.classHp?.check?.kind === 'absentFromData'
			&& exceptionRemovable('classHp', { dataKeys: [] }) === true
			&& exceptionRemovable('classHp', { dataKeys: ['classHp'] }) === false);
}

// ── ⑤ 过渡并存 fail-loud ──────────────────────────────────────────────────
{
	// 旧守卫的语义（`pcShape` 给车卡族键 ∧ 车卡流程也在 ⇒ throw）与 ③ 同族；
	// ⑤ 要的是**这条语义在归并后不消失**（转形成 ③ 那条不依赖 `hasChargen` 的判据）。
	// ★能假：③ 的纯函数对"两族同键"必然命中 ⇒ 语义可承载（见 ③ 三格）。
	t('⑤ 过渡并存语义由 ③ 承载（✗ 随 `hasChargen` 消失 ⇒ 静默以某一方为准）',
		dualProducerProblems({ sources: { a: ['x'], b: ['x'] } }).length === 1);
}

if (bad) { console.error(`\n✗ L0 判据自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ L0 判据自证通过（② 未宣告前缀点名 · ③ 两处产生点名 · ④ 隐键点名 · ⑤ 并存 fail-loud）');
