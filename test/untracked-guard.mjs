// `#1089`：**未跟踪扫描面 → 红** 的**守护件** —— 判据是纯函数（`scripts/lib/untracked-guard.mjs`），
// 本件把它的**每一格**都钉住（含**成对**的反例／正例）。
//
// ## 为什么单独一件
// 与 `test/plan-needs.mjs`（`#1057` 守护门）**同形**：**接线在门里、判据在纯函数里** →
// 纯函数能被单测，但**"门有没有真的调它"**单测看不出来（那由**探针**刀在门上守）。
// → 本件管"**判据本身对**"；门级接线由 `scripts/probes.mjs` 的刀管。
//
// ## 三格（领队裁定要求）
// ① **未跟踪 → 红**（本仓既有纪律：「`git add` 之前跑 ＝ 假绿」→ 红是对的）
// ② **`git add` 后 → 不红**（同一件、同一扫描面 → 只因"未跟踪"而红）
// ③ **带豁免（理由 ＋ 票号）→ 不红，但必须留痕**（**缺任一项 → 豁免不生效** —— 也要能假）
//
//注意：**边界（本件只测纯函数）**：它**不**证明三个门真的接了（那是探针的活）——
// 本仓老账：**"自证测纯函数、不测接线"** → 删掉接入点自证仍全绿（`#1089` 领队转达的那格）。

import { untrackedScannedProblems, isUntrackedExemptLine, UNTRACKED_EXEMPT_MARKER } from '../scripts/lib/untracked-guard.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

// 扫描面谓词（夹具用：只看 `*.md` —— 与 `md-format` 同形）
const isMd = (p) => String(p ?? '').endsWith('.md');

// ── ① 未跟踪 → 红（核心格）────────────────────────────────────────────
{
	const r = untrackedScannedProblems({ untracked: ['docs/a.md'], isScanned: isMd, exempted: [] });
	case_('未跟踪且落在扫描面 ⇒ 报（真缺陷：本门没扫过它 ✗）', r.problems.length === 1 && r.unscanned.join() === 'docs/a.md');
}
// ── ② 不在扫描面 / 已跟踪 → 不报（防过宽）──────────────────────────────
{
	const r = untrackedScannedProblems({ untracked: ['a.png', 'b.mjs'], isScanned: isMd, exempted: [] });
	case_('未跟踪但**不在**扫描面（`a.png`/`b.mjs`）⇒ 不报（本门本就不判它们 ✓）', r.problems.length === 0);
}
{
	const r = untrackedScannedProblems({ untracked: [], isScanned: isMd, exempted: [] });
	case_('没有未跟踪件（＝都已 `git add`）⇒ 不报（**这一格就是"add 后不红"** ✓）', r.problems.length === 0);
}
// ── ③ 豁免：有效 → 不报（但要留痕，由调用方打印 `unscanned`／`exempted`）────
{
	const r = untrackedScannedProblems({ untracked: ['docs/a.md'], isScanned: isMd, exempted: ['docs/a.md'] });
	case_('带有效豁免 ⇒ 不报（`unscanned` 也为空 ⇒ 调用方不会误留痕 ✓）', r.problems.length === 0 && r.unscanned.length === 0);
}
// ── 豁免**语法的能假**（理由与票号缺任一项 → 不生效）────────────────────
case_(`豁免标记：\`${UNTRACKED_EXEMPT_MARKER} 理由 #1089\` ⇒ **有效**`, isUntrackedExemptLine(`x <!-- ${UNTRACKED_EXEMPT_MARKER} 本片施工中的新件 #1089 -->`));
case_('🔴 豁免标记：**只有理由、没有票号** ⇒ **无效**（缺任一项不生效 ✗）', !isUntrackedExemptLine(`x <!-- ${UNTRACKED_EXEMPT_MARKER} 我觉得可以 -->`));
case_('🔴 豁免标记：**只有票号、没有理由** ⇒ **无效**', !isUntrackedExemptLine(`x <!-- ${UNTRACKED_EXEMPT_MARKER} #1089 -->`));
case_('豁免标记：**完全没有该标记** ⇒ 无效', !isUntrackedExemptLine('普通一行注释'));

// ── ③b 临时夹具谓词（**本片实测踩到的并发假红**）────────────────────────
case_('🔴 临时夹具：`stories/__e2e/data/tables.json` ⇒ 算临时（并行段的夹具，不算"忘了 add" ✓）',
	untrackedScannedProblems({ untracked: ['stories/__e2e/data/tables.json'], isScanned: () => true }).problems.length === 0);
case_('🔴 临时夹具：`new-story-fixture/…` ⇒ 算临时（同族惯例 ✓）',
	untrackedScannedProblems({ untracked: ['stories/new-story-fixture/00-story.json'], isScanned: () => true }).problems.length === 0);
case_('🔴 **不误伤**：普通新件（`docs/real-new.md`）⇒ **不算**临时 ⇒ 仍报（防把真缺口一起放过 ✗）',
	untrackedScannedProblems({ untracked: ['docs/real-new.md'], isScanned: isMd }).problems.length === 1);

// ── ④ 端到端（**真 git 三态**，本件自建夹具 → 不依赖仓内既有未跟踪件）─────
//注意：用**临时文件名**（本件自己保证清理）；断言"未跟踪 → 会被判、add 后 → 不会"。
//注意：夹具名**不得用 `__` 前缀** —— 那是仓内「临时夹具」惯例 → 会被 `isTransientFixture` 放过
//（本件自证实测踩过：用 `__untracked-guard-selftest-*.md` → 端到端那格量不出）。
// `#1261` 复核：夹具位置**移出 `docs/`** —— 旧位置与扫 `docs/**/*.md` 的 lint-human-face **撞车**
//（实测 4 次 1 红 3 绿 = flap）；改到 `scripts/` 下的 `.md`：仍在"未跟踪扫描面"内（可被本件判），
// 但**不被** lint 的文档面扫（它只扫 `docs/**/*.md`）。
const FIXTURE = `scripts/untracked-guard-selftest-${process.pid}.md`;
const abs = join(ROOT, FIXTURE);
const othersOf = () => execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
try {
	if (existsSync(abs)) unlinkSync(abs);
	writeFileSync(abs, '# 夹具\n');
	// 未跟踪态 → 必须在 `git ls-files --others` 里，且被判
	const miss1 = untrackedScannedProblems({ untracked: othersOf(), isScanned: isMd, exempted: [] });
	case_('端到端·未跟踪：夹具出现在"未跟踪 ⇒ 会被判"清单里（**真 git 读数** ✓）', miss1.unscanned.includes(FIXTURE));
	// add 后 → 从 `--others` 消失 → 不再被判（＝"add 后不红"）
	execFileSync('git', ['add', FIXTURE], { cwd: ROOT });
	const miss2 = untrackedScannedProblems({ untracked: othersOf(), isScanned: isMd, exempted: [] });
	case_('端到端·`git add` 后：夹具**离开**未跟踪清单 ⇒ 不再被判（两状态两结果 ✓）', !miss2.unscanned.includes(FIXTURE));
	execFileSync('git', ['reset', '-q', FIXTURE], { cwd: ROOT });
} finally {
	try { execFileSync('git', ['reset', '-q', FIXTURE], { cwd: ROOT }); } catch { /* 未 add 过 */ }
	try { if (existsSync(abs)) unlinkSync(abs); } catch { /* 已清 */ }
}
// 清场自证：夹具不得残留（否则本件自己会污染工作树）
case_('端到端·清场：夹具已删且不再出现在未跟踪清单里', !existsSync(abs) && !othersOf().includes(FIXTURE));

console.log(bad === 0
	? '✔ untracked-guard：未跟踪 ⇒ 红 · 已跟踪 ⇒ 不红 · 豁免（理由＋票号）⇒ 不红但留痕 —— 三格成对 ✓'
	: `✗ untracked-guard：${bad} 条未过（见上）`);
process.exit(bad === 0 ? 0 : 1);
