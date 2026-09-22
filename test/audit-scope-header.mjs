// `#1157`：**audit 报文自带作用域**（对象头）—— 修的是"漏传 `--story` → 读数静默张冠李戴"这个坑。
// 背景（一手）：`scripts/audit.mjs` 的默认故事作用域＝`face-fixture`（`scripts/dist-paths.mjs` 的 `DEFAULT_SLUG`）
// → 无参与有参的报文**首行都不带对象** → 读数**不可分辨**（实测：我加参数前读到的"载荷 27／状态键 24"
// 全是**别人的数**，而报文没有任何提示）。
// 修法（领队裁）：对象头由**驱动器**打（`scripts/audit/lib/shared.mjs` 的 `runSelectedGates` 一处改、五面全覆盖），
// 有参写 `--story 显式`、**无参必须明写"默认值注意："** → 张冠李戴**当场可见**。
// 三格：① 两态头（显式／默认）② **能假**：抹掉头 → 本格红 ③ **反向能假**：剥头规则若吃掉门输出 → 另一格红。
import { execFileSync } from 'node:child_process';
import { stripScopeHeader } from '../scripts/audit/lib/shared.mjs';

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
const runAudit = (args) => { try { return execFileSync('node', ['scripts/audit.mjs', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return `${e.stdout ?? ''}${e.stderr ?? ''}`; } };
const firstLine = (text) => text.split('\n')[0];

// ── 格 ① 两态头 ────────────────────────────────────────────────
const explicit = firstLine(runAudit(['--state', '--story', 'night-ferry']));
t(`① 有参 ⇒ 首行带对象且标"显式"（实际：${explicit}）`,
	/^story=night-ferry（--story 显式）$/.test(explicit));
const dflt = firstLine(runAudit(['--state']));
t(`① 无参 ⇒ 首行带**默认对象**且标"默认值 ⚠"（实际：${dflt}）`,
	/^story=face-fixture（默认值 ⚠[^）]*）$/.test(dflt));
t('① 两态**可分辨** ✓（有参/无参的首行不同 ⇒ 不再静默张冠李戴 ✓）', explicit !== dflt);

// ── 格 ② 能假：**头真的存在**（否则本格红 → 证明格 ① 不是恒真）──────────
// 形态：`stripScopeHeader(报文)` **必须改变**报文（＝确实剥掉了头）；若驱动器**没**打头 → 它无从剥 →
// 返回值与原文**相等** → **本格红**（这正是"能假"：把头去掉 → 判据必红）。
t('② **能假**：驱动器**真打了头**（`stripScopeHeader` 对报文有作用 ⇒ 若不打头则本格红 ✗）',
	stripScopeHeader(explicit) !== explicit);
t('② 且剥掉的恰是**首行**（剥后首行＝门名行，不再是 `story=` ✓）',
	/^story=/.test(firstLine(explicit)) && !/^story=/.test(firstLine(stripScopeHeader(explicit))));

// ── 格 ③ 反向能假：剥头规则不许吃掉门输出 ────────────────────────
const gateLine = '══ ⓪u 状态契约门（#318）——pc.ev / pc.world 的键必须有域归属，且有写有读 ══';
t('③ **反向能假**：`stripScopeHeader` 对**门首行**不动 ✗（若它把门输出也剥了 ⇒ 本格红 ⇒ 防"剥离把真差异吃掉" ✗）',
	stripScopeHeader(gateLine) === gateLine);
t('③ 对"含 story= 但形状不对"的行也不剥 ✗（只认**整行严格形状** ✓）',
	stripScopeHeader('note: story=x 不是头\n') === 'note: story=x 不是头\n');
t('③ 但对**真头**必剥 ✓（剥后与旧基线一致 ⇒ 基线零改动 ✓）',
	stripScopeHeader(`${explicit}\nbody\n`) === 'body\n');

if (bad) { console.error(`\n✗ 报文作用域门：${bad} 格失败 ✗`); process.exit(1); }
console.log('\n✔ 报文作用域门通过 ✓（两态可分辨；抹头即红；剥离不吃门输出 ✓）');
