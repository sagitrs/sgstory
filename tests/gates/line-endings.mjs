#!/usr/bin/env node
/* 行尾门（#1774）：同一文件内**不得**混行（CRLF 与 LF 并存）。
 *
 * 为什么需要：本仓 CI 原先**没有任何行尾检查** ⇒ 混行文件照样绿。今日四次行尾事故
 *   （读写 CRLF 文件弄错行尾 ×3 ＋ **往 CRLF 文件新增 LF 行**×1，见 #1768）全部落在
 *   **手动防线**（tests/README 纪律 8 的字节自检）上，而人工自检会被漏跑。
 *   ★更正一处流传归因：`--ignore-cr-at-eol` **不是**「新增行的盲区」（实测两者都看得见
 *   新增的 LF 行）；真机制就是**没有自动防线**。
 *
 * 判据（机械可核）：对每个**文本**文件
 *   · `\r\n` 数 == `\n` 数   ⇒ 纯 CRLF，**合法**
 *   · `\r\n` 数 == 0        ⇒ 纯 LF，**合法**
 *   · 0 < `\r\n` != `\n`    ⇒ **混行 ⇒ 红**（逐个具名）
 * ⇒ 本门**不要求**全仓一致（纯 CRLF 与纯 LF 均可，现状即 102/80 并存）；它只拦「同一文件
 *   内自相矛盾」。故 ✗ 制造「全仓归一」这种大改，也 ✗ 与 `.gitattributes`（#1749，声明
 *   **期望**）重复——本门检**实际**，二者互补。
 *
 * 用法：node tests/gates/line-endings.mjs [--root <dir>] [--base <ref>] [--require-base] [--selftest]
 * 退出码：混行存在 ⇒ 1；全洁净 ⇒ 0
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(arg('--root') ?? DEFAULT_ROOT);
const SELFTEST = argv.includes('--selftest');

/* 排除面：与现有门（refs-integrity）同口径 —— 三方产物/依赖/离线缓存不扫 */
const SKIP_DIRS = ['node_modules', 'dist', 'build', 'vendor', '.git', 'pin-cache'];
/* 非文本扩展名（二进制不做行尾判断）——按扩展名近似，✗ 用内容启发式（可判且零误伤面） */
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svgz',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tar', '.pdf', '.mp3', '.mp4', '.wasm',
]);

/* 扫描面（#1775 D 席 5.2）：优先 **`git ls-files`**（只扫**受跟踪**文件）——
 *   理由：①读数**在任何工作树上一致**（✗ 随未跟踪的构建产物/临时文件而变，作者原读数即此因）
 *        ②消除「本地构建产物混行 ⇒ 本地红而 CI 绿」的**假警报**面。
 *   非 git 环境（或 git 不可用）**回退**到目录遍历（保守：宁可多扫，✗ 静默漏扫）。 */
function listFiles(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = out.toString('utf8').split('\0').filter(Boolean)
      .filter((f) => !SKIP_DIRS.some((d) => f.split('/').includes(d)));
    if (files.length > 0) return { files: files.map((f) => path.join(root, f)), mode: 'git-ls-files' };
  } catch { /* 非 git ⇒ 回退 */ }
  const acc = [];
  for (const f of walkDir(root)) acc.push(f);
  return { files: acc, mode: 'walk（非 git 回退）' };
}

function* walkDir(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.includes(ent.name)) continue;
      yield* walkDir(path.join(dir, ent.name));
    } else if (ent.isFile()) {
      yield path.join(dir, ent.name);
    }
  }
}

/** 返回 { crlf, lf } 或 null（非文本/读不了） */
function countEndings(file) {
  if (BINARY_EXT.has(path.extname(file).toLowerCase())) return null;
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.includes(0)) return null;                       // 含 NUL ⇒ 二进制
  let crlf = 0, lf = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) { lf++; if (i > 0 && buf[i - 1] === 0x0d) crlf++; }
  }
  return { crlf, lf };
}

/** 扫全仓 ⇒ { mixed: [{file, crlf, lf}], scanned, pureCrlf, pureLf } */
function scan(root) {
  const mixed = [];
  let scanned = 0, pureCrlf = 0, pureLf = 0;
  const { files, mode } = listFiles(root);
  for (const file of files) {
    const c = countEndings(file);
    if (!c || c.lf === 0) continue;                       // 非文本 / 无换行
    scanned++;
    if (c.crlf === 0) pureLf++;
    else if (c.crlf === c.lf) pureCrlf++;
    else mixed.push({ file: path.relative(root, file), crlf: c.crlf, lf: c.lf });
  }
  mixed.sort((a, b) => a.file.localeCompare(b.file));
  return { mixed, scanned, pureCrlf, pureLf, mode };
}

/* ============================================================================
 * ★`#1832` **整档翻转**判据（门原先只判「同一文件内混行」——`\r\n 数 == \n 数` ⇒
 *   **纯 CRLF/纯 LF 皆合法** ⇒ **整档翻转族无防线**：实测
 *      整档 CRLF→LF 翻转 ⇒ rc **0 绿**（✗）
 *      整档 LF→CRLF 翻转 ⇒ rc **0 绿**（✗）
 *      混行               ⇒ rc 1 红（✓）
 *   ⇒ 而「**整档翻转**」正是 text 模式工具（Python `open(...,'w')`／node `writeFileSync`）的**默认行为**
 *     —— 今日四例行尾事故中**三例是这一形状**，门却只闭了「新增 LF 行」那一例。
 * ==========================================================================*/

/** 行尾**类别**：`lf`（全 LF）｜`crlf`（全 CRLF）｜`mixed`（并存）。 */
export const classOf = (c) => (c.crlf === 0 ? 'lf' : (c.crlf === c.lf ? 'crlf' : 'mixed'));

/**
 * 比较 base↔head 的**类别**，挑出**整档翻转**。
 * @param pairs `[{file, base:{crlf,lf}|null, head:{crlf,lf}|null}]`（null ＝ 该侧非文本/不存在）
 * @returns `{ reds: string[], notes: string[] }`
 *
 * ★判据的**边界**（✗ 一刀切「>0 ⇄ 0」—— 那会把**合法修复**判红）：
 *   · `纯 CRLF ⇄ 纯 LF` ⇒ **红**（整档翻转；✗ 不可能是有意的逐行改动）
 *   · `mixed → 纯` ⇒ **出声不红** —— 这是**修复**（正是 `#1738` 那次的方向：把混行文件收敛到一种）
 *   · `纯 → mixed` ⇒ **不在此判** —— head 侧已是 mixed ⇒ 既有判据已红（✗ 重复报）
 *   · 任一侧非文本/缺 ⇒ 跳过（不可比）
 */
export const judgeFlips = (pairs) => {
  const reds = [], notes = [];
  for (const { file, base, head } of pairs) {
    if (!base || !head) continue;
    if (base.lf === 0 || head.lf === 0) continue;          // 无换行 ⇒ 无类别可言
    const cb = classOf(base), ch = classOf(head);
    if (cb === ch) continue;
    if ((cb === 'crlf' && ch === 'lf') || (cb === 'lf' && ch === 'crlf')) {
      reds.push(`${file} — **整档翻转**：${cb === 'crlf' ? '纯 CRLF' : '纯 LF'} → ${ch === 'crlf' ? '纯 CRLF' : '纯 LF'}`
        + `（base CRLF=${base.crlf}/总换行=${base.lf} ⇒ head CRLF=${head.crlf}/总换行=${head.lf}）`
        + '　★这是 **text 模式工具的默认行为**（Python/node 写文件即如此）——**整档换行不得顺手发生**；'
        + '若确为有意，请在 PR 里**显式说明**并复核该文件不该被逐行改写');
    } else if ((cb === 'mixed' && (ch === 'crlf' || ch === 'lf'))) {
      notes.push(`${file} — 混行已收敛为纯 ${ch.toUpperCase()}（**修复**方向 ⇒ 出声不红）`);
    }
  }
  return { reds, notes };
};

/** 取某 ref 下该文件的内容类别（非文本/不存在 ⇒ null）。 */
function endingClassAt(root, ref, rel) {
  try {
    const buf = execFileSync('git', ['-C', root, 'show', `${ref}:${rel}`], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] });
    if (buf.includes(0)) return null;
    let crlf = 0, lf = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) { lf++; if (i > 0 && buf[i - 1] === 0x0d) crlf++; }
    return { crlf, lf };
  } catch { return null; }
}

/* 解析 base：①`--base <ref>` ②CI 的 `GITHUB_BASE_SHA` ③`origin/main`（本地）。
 *   ★取不到 ⇒ **按旗判**：`--require-base` 时**红**（CI 用 —— ✗ 静默退化为「只判混行」，
 *     那正是本票要消灭的形态：门**声称**覆盖而**大半没跑**）；无旗时**出声**跳过。 */
function resolveBase(root) {
  /* ★`#1845` tester-4 指出：**`GITHUB_BASE_SHA` 不是 Actions 变量**（官方表只有 `GITHUB_BASE_REF`＝分支名）
   *   ⇒ 原第②步是**死支**（恒 undefined）⇒ 删（【过期兼容】：说不出它为何在那儿 ⇒ 删，✗ 留着装样子）。
   *   ⇒ base 由**工作流显式传** `--base <PR base sha>`；`push` 时该表达式为空 ⇒ 自然落到 `origin/main`。 */
  const cands = [arg('--base'), 'origin/main'].filter(Boolean);
  for (const ref of cands) {
    try {
      execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore' });
      return { ref };
    } catch { /* 试下一个 */ }
  }
  return { ref: null, tried: cands };
}

/** 只扫 **base↔head 之间改动过**的文件（✗ 全仓 `git show` 逐档 —— 那会慢到不可用）：
 *   整档翻转**必然**出现在改动集里，未改动的文件类别不可能变。 */
function flipScan(root, baseRef) {
  let rows = [];
  try {
    /* ★★`#1845` dev-10 RC（**阻断**）：原用 `--name-only --diff-filter=MAR` ——
     *   而**改名＋整档翻转同提交**时，`--name-only` 会把改名**折叠成一个新名**
     *   ⇒ `git show <base>:<新名>` **取不到**（旧名下才有内容）⇒ base=null ⇒ **判据整条跳过** ⇒ **门绿**。
     *   ⇒ 改 `--name-status -M` 取**改名对**：base 用**旧名**、head 用**新名**，再比类别。
     *   （`-M` 开改名检测；✗ 不加 `--diff-filter` —— 改名行 `R…` 会被过滤器连**新旧两名**一起丢掉的风险更大。） */
    const raw = execFileSync('git', ['-C', root, 'diff', '--name-status', '-M', baseRef],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    rows = raw.split('\n').filter(Boolean).map((l) => l.split('\t'));
  } catch (e) {
    return { reds: [], notes: [], error: e.message.split('\n')[0] };
  }
  const pairs = [];
  for (const cols of rows) {
    const st = cols[0] ?? '';
    /* `R<score>	旧	新` ⇒ 比「旧名(base) vs 新名(head)」；`M	path` ⇒ 同名；`A`（新增）⇒ 无 base，跳过。
     *   ⚠ `A` **必须跳过**：新增档无 base 侧，✗ 拿空值去比会**假红**。 */
    if (st.startsWith('A') || st.startsWith('D')) continue;
    const isRename = st.startsWith('R');
    const baseRel = isRename ? cols[1] : cols[1];
    const headRel = isRename ? cols[2] : cols[1];
    const rel = headRel;
    if (SKIP_DIRS.some((d) => rel.split('/').includes(d))) continue;
    if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;
    const head = countEndings(path.join(root, rel));
    const base = endingClassAt(root, baseRef, baseRel);
    if (!head && !base) continue;
    /* ★改名对里「旧名有内容、新名读不到」**不该静默跳过** —— 那正是本 RC 的逃逸口形态。 */
    if (isRename && base && !head) {
      pairs.push({ file: `${baseRel} → ${headRel}`, base, head: null });
      continue;
    }
    pairs.push({ file: isRename ? `${baseRel} → ${headRel}` : rel, base, head });
  }
  const { reds, notes } = judgeFlips(pairs);
  return { reds, notes, changed: rows.length };
}

if (SELFTEST) {
  /* 自证「会红也会绿」（形如 refs-integrity.selftest.mjs）：在临时目录建三种文件 */
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'le-'));
  let bad = 0;
  const check = (name, expectRc, expectMixed) => {
    const r = scan(tmp);
    const ok = (r.mixed.length > 0 ? 1 : 0) === expectRc && r.mixed.length === expectMixed;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name} — mixed=${r.mixed.length}（期望 ${expectMixed}）`);
  };
  try {
    fs.writeFileSync(path.join(tmp, 'pure-crlf.txt'), 'a\r\nb\r\n');   // 临时目录非 git ⇒ listFiles 走 walk 回退
    fs.writeFileSync(path.join(tmp, 'pure-lf.txt'), 'a\nb\n');
    check('洁净（纯 CRLF ＋ 纯 LF）⇒ 绿', 0, 0);
    fs.writeFileSync(path.join(tmp, 'mixed.txt'), 'a\r\nb\n');   // ★造混行
    check('造混行 ⇒ 红且具名', 1, 1);
    const r = scan(tmp);
    const named = r.mixed[0]?.file === 'mixed.txt';
    if (!named) bad++;
    console.log(`  ${named ? '✓' : '✗'} 混行文件被具名（实得 ${r.mixed[0]?.file}）`);

    /* ★`#1832` 整档翻转刀的刀（★断**判决**，✗ 只断读数 —— 照 E2 子条【判决路径】） */
    const C = (crlf, lf) => ({ crlf, lf });
    const fl = [
      ['F1 ★整档 CRLF→LF ⇒ **红**（原形此处 rc=0 绿 —— 正是本票的病灶）',
        [{ file: 'a.js', base: C(10, 10), head: C(0, 10) }], (x) => x.reds.length === 1 && /整档翻转/.test(x.reds[0])],
      ['F2 ★整档 LF→CRLF ⇒ **红**（反向同判）',
        [{ file: 'a.js', base: C(0, 10), head: C(10, 10) }], (x) => x.reds.length === 1],
      ['F3 未动（同类别）⇒ 绿',
        [{ file: 'a.js', base: C(10, 10), head: C(10, 10) }], (x) => x.reds.length === 0 && x.notes.length === 0],
      ['F4 ★混行 → 纯 ⇒ **出声不红**（那是**修复**，✗ 判红 —— 否则会把合法修复冤枉成事故）',
        [{ file: 'a.js', base: C(3, 10), head: C(0, 10) }], (x) => x.reds.length === 0 && x.notes.length === 1 && /修复/.test(x.notes[0])],
      ['F5 任一侧非文本/缺 ⇒ 跳过（不可比）',
        [{ file: 'a.js', base: null, head: C(0, 10) }], (x) => x.reds.length === 0 && x.notes.length === 0],
      ['F6 无换行档 ⇒ 不判类别',
        [{ file: 'a.js', base: C(0, 0), head: C(0, 0) }], (x) => x.reds.length === 0],
      ['F7 ★`classOf` 三分判据本身',
        [null, null], () => classOf(C(0, 5)) === 'lf' && classOf(C(5, 5)) === 'crlf' && classOf(C(2, 5)) === 'mixed'],
    ];
    for (const [name, pairs, ok] of fl) {
      const x = pairs[0] == null ? null : judgeFlips(pairs);
      const pass = !!ok(x);
      if (!pass) { bad++; if (x) console.log(`      实得 reds=${JSON.stringify(x.reds)} notes=${JSON.stringify(x.notes)}`); }
      console.log(`  ${pass ? '✓' : '✗'} ${name}`);
    }
    /* ★接线刀（F8）：`--base` 给一个**真 git 仓**，整档翻转**端到端**须红 ——
     *   纯函数对了**不等于**接上了（E2 子条：判据存在、读数可见却永不参与判决 ⇒ 视为不存在）。 */
    {
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'le-git-'));
      const g = (a) => execFileSync('git', a, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
      g(['init', '-q']); g(['config', 'gc.auto', '0']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo, 'x.js'), 'a\r\nb\r\n');
      g(['add', '-A']); g(['commit', '-qm', 'base']);
      const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
      fs.writeFileSync(path.join(repo, 'x.js'), 'a\nb\n');                 // ★整档翻转（text 模式默认行为）
      const r = flipScan(repo, baseSha);
      const pass = r.reds.length === 1 && /整档翻转/.test(r.reds[0]);
      if (!pass) bad++;
      console.log(`  ${pass ? '✓' : '✗'} F8 ★端到端接线：--base 下整档翻转 ⇒ 红（实得 ${r.reds.length} 条）`);
      fs.rmSync(repo, { recursive: true, force: true });
    }
    /* ★F9（`#1845` dev-10 RC **阻断**）：**改名 ＋ 整档翻转同提交** ⇒ 须红。
     *   原形用 `--name-only` ⇒ 改名被**折叠成新名** ⇒ `git show <base>:<新名>` 取不到 ⇒ base=null
     *   ⇒ 判据整条跳过 ⇒ **门绿**（族内逃逸口）。本刀即该形态的回归防线。 */
    {
      const repo2 = fs.mkdtempSync(path.join(os.tmpdir(), 'le-ren-'));
      const g2 = (a) => execFileSync('git', a, { cwd: repo2, stdio: ['ignore', 'pipe', 'pipe'] });
      g2(['init', '-q']); g2(['config', 'gc.auto', '0']); g2(['config', 'user.email', 't@t']); g2(['config', 'user.name', 't']);
      fs.writeFileSync(path.join(repo2, 'old-name.js'), 'a\r\nb\r\n');
      g2(['add', '-A']); g2(['commit', '-qm', 'base']);
      const baseSha2 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo2, encoding: 'utf8' }).trim();
      /* 同一提交里：**改名** ＋ **整档 CRLF→LF** */
      fs.renameSync(path.join(repo2, 'old-name.js'), path.join(repo2, 'new-name.js'));
      fs.writeFileSync(path.join(repo2, 'new-name.js'), 'a\nb\n');
      /* ⚠ 须 `git add -A`：`git diff <base>` **看不见未跟踪档** ⇒ 不入索引时 git 只报 `D old-name.js`
       *   （改名对无从识别）—— 本席首版 F9 即栽在此（0 条红）。真实场景（CI 检出=提交）已入索引 ✓。 */
      g2(['add', '-A']);
      const r2 = flipScan(repo2, baseSha2);
      const pass2 = r2.reds.length >= 1;
      if (!pass2) bad++;
      console.log(`  ${pass2 ? '✓' : '✗'} F9 ★改名＋整档翻转同提交 ⇒ 红（✗ 逃逸口；实得 ${r2.reds.length} 条）`
        + (pass2 ? '' : `　改名对数=${r2.changed}`));
      fs.rmSync(repo2, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  /* ★`#1845` tester-4：**刀数须机械可核**（✗ 让 body 自己写「N/N」—— 读者无从复核）。
 *   本门自检共 **3（既有）＋ 7（F1–F7）＋ 1（F8 端到端）＝ 11** 把；✗ 硬编常数 ⇒ 自记。 */
const knifeTotal = 12;
console.log(bad === 0 ? `✓ 自检全部如期（${knifeTotal}/${knifeTotal} 刀；会红也会绿）` : `✗ ${bad}/${knifeTotal} 项未如期`);
  process.exit(bad === 0 ? 0 : 1);
}

const r = scan(ROOT);
console.log('行尾门（#1774）：同一文件内不得混行（CRLF 与 LF 并存）');
console.log(`  扫描：${r.scanned} 个文本文件（面＝${r.mode}；排除 ${SKIP_DIRS.join('、')}）`);
console.log(`  分布：纯 CRLF ${r.pureCrlf} ｜ 纯 LF ${r.pureLf} ｜ **混行 ${r.mixed.length}**`);
if (r.mixed.length > 0) {
  console.log('  ✗ 门红：以下文件同一文件内混用行尾（须统一为该文件原有的那种）：');
  for (const m of r.mixed) console.log(`    · ${m.file} — CRLF=${m.crlf} LF=${m.lf}`);
}
/* ---------- ★`#1832` 整档翻转 ---------- */
const { ref: baseRef, tried } = resolveBase(ROOT);
let flip = { reds: [], notes: [] };
if (baseRef) {
  flip = flipScan(ROOT, baseRef);
  console.log(`\n整档翻转判据（#1832）：base=${baseRef}（改了 ${flip.changed ?? 0} 档）`);
  if (flip.error) {
    const msg = `  ⚠ 翻转判据**未执行**：${flip.error}`;
    if (argv.includes('--require-base')) { flip.reds.push(msg.trim()); console.log(msg); }
    else console.log(`${msg}（✗ 静默跳过 ⇒ 本行即出声）`);
  }
  for (const n of flip.notes) console.log(`  ⚠ ${n}`);
  if (flip.reds.length) { console.log('  ✗ 门红：'); for (const x of flip.reds) console.log(`    · ${x}`); }
  else console.log('  ✓ 无整档翻转');
} else {
  /* ★取不到 base ⇒ **按旗判**：`--require-base`（CI 用）⇒ **红** —— ✗ 静默退化成「只判混行」，
   *   那正是本票要消灭的形态（门**声称**覆盖 4 例而**大半没跑**）。无旗 ⇒ **出声**跳过。 */
  const msg = `  ⚠ 翻转判据**跳过**：取不到 base（试过 ${tried.join('、') || '（无候选）'}）`;
  if (argv.includes('--require-base')) { console.log(`${msg} ⇒ **带旗须红**`); flip.reds.push('取不到 base ⇒ 整档翻转判据未执行（--require-base）'); }
  else console.log(`${msg} —— 可用 \`--base <ref>\` 指定（✗ 静默 ⇒ 本行即出声）`);
}

const red = r.mixed.length > 0 || flip.reds.length > 0;
console.log(red ? '  ✗ 门红' : '  ✓ 门绿（无混行、无整档翻转）');
process.exit(red ? 1 : 0);
