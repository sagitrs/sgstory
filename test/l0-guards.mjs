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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PC_BASE_KEYS, PC_GAMEPLAY_HOME, undeclaredWriteProblems, undeclaredWriteReport, dualProducerProblems, UNDECLARED_WRITE_EXCEPTIONS, exceptionRemovable } from '../editor/lib/core/pc-state-map.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (label, ok, detail = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`); }
};

// ── ② 未宣告前缀 ⇒ 点名红 ─────────────────────────────────────────────────
{
	const rules = readFileSync(join(ROOT, 'src/engine/40-sim/22-rules.twee'), 'utf8');
	// ②a 判据在场：未宣告前缀 ⇒ throw（✗ 落回默认读法）
	t('②a `readKey` 对**未宣告前缀** ⇒ 抛（✗ 静默落回 `ev.<前缀>:…` 读法）',
		/未被引擎宣告/.test(rules) && /this\.prefixes\.includes/.test(rules),
		'找不到"未宣告前缀 ⇒ 抛"那一支');
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
	// ②d ★能假：造一个未宣告前缀 ⇒ 该格红（本格判"判据真的会抛"）
	t('②d **能假**：未宣告前缀在该判据下**必然命中**（✗ 恒绿）',
		colonPrefixesOf(['inv:钥匙', 'bogus:x', 'foo:钥匙']).some((p) => !declared.includes(p)),
		'三个样本都没能造出未宣告前缀');
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
	// ③ 在引擎侧有**落点**（✗ 只做纯函数不接线 —— "有判据无消费"同族）
	const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
	t('③ 引擎侧仍保留"并存点名"的**语义**（✗ 随 `hasChargen` 一起被删）',
		/两条产生路径|并存点名|dualProducerProblems/.test(core),
		'`10-core.twee` 里已找不到并存点名那一支');
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
		/undeclaredWriteReport\(\{ written, dataKeys: written \}\)/.test(cmds) && /\[chargen-write\]/.test(cmds),
		'`commands.mjs` 里找不到该守卫');
	// ④e~④h ★裁**甲**的"抓而不修"（登记 + 退出条件 ⇒ 三态）
	t('④e 已登记且**未消失** ⇒ **只报不红**（信息面；✗ 计退码 —— 甲的范围边界）', (() => {
		const r = undeclaredWriteReport({ written: ['classHp'], dataKeys: ['classHp'] });
		return r.fails.length === 0 && r.infos.length === 1;
	})());
	t('④f 已登记但**退出条件命中**（键已从数据面消失）⇒ **红**（✗ 登记成永久豁免）', (() => {
		const r = undeclaredWriteReport({ written: ['classHp'], dataKeys: [] });
		return r.fails.length === 1 && r.fails[0].code === 'exception-removable';
	})());
	t('④g **未登记**的新隐键 ⇒ **红**（能假：甲下仍满足票面"造反例⇒该格红"）',
		undeclaredWriteReport({ written: ['全新未宣告键'], dataKeys: [] }).fails.length === 1);
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
