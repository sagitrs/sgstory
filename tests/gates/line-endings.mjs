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
 * 用法：node tests/gates/line-endings.mjs [--root <dir>] [--selftest]
 * 退出码：混行存在 ⇒ 1；全洁净 ⇒ 0
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.includes(ent.name)) continue;
      yield* walk(path.join(dir, ent.name));
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
  for (const file of walk(root)) {
    const c = countEndings(file);
    if (!c || c.lf === 0) continue;                       // 非文本 / 无换行
    scanned++;
    if (c.crlf === 0) pureLf++;
    else if (c.crlf === c.lf) pureCrlf++;
    else mixed.push({ file: path.relative(root, file), crlf: c.crlf, lf: c.lf });
  }
  mixed.sort((a, b) => a.file.localeCompare(b.file));
  return { mixed, scanned, pureCrlf, pureLf };
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
    fs.writeFileSync(path.join(tmp, 'pure-crlf.txt'), 'a\r\nb\r\n');
    fs.writeFileSync(path.join(tmp, 'pure-lf.txt'), 'a\nb\n');
    check('洁净（纯 CRLF ＋ 纯 LF）⇒ 绿', 0, 0);
    fs.writeFileSync(path.join(tmp, 'mixed.txt'), 'a\r\nb\n');   // ★造混行
    check('造混行 ⇒ 红且具名', 1, 1);
    const r = scan(tmp);
    const named = r.mixed[0]?.file === 'mixed.txt';
    if (!named) bad++;
    console.log(`  ${named ? '✓' : '✗'} 混行文件被具名（实得 ${r.mixed[0]?.file}）`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad === 0 ? '✓ 自检全部如期（会红也会绿）' : `✗ ${bad} 项未如期`);
  process.exit(bad === 0 ? 0 : 1);
}

const r = scan(ROOT);
console.log('行尾门（#1774）：同一文件内不得混行（CRLF 与 LF 并存）');
console.log(`  扫描：${r.scanned} 个文本文件（排除 ${SKIP_DIRS.join('、')}）`);
console.log(`  分布：纯 CRLF ${r.pureCrlf} ｜ 纯 LF ${r.pureLf} ｜ **混行 ${r.mixed.length}**`);
if (r.mixed.length > 0) {
  console.log('  ✗ 门红：以下文件同一文件内混用行尾（须统一为该文件原有的那种）：');
  for (const m of r.mixed) console.log(`    · ${m.file} — CRLF=${m.crlf} LF=${m.lf}`);
}
console.log(r.mixed.length === 0 ? '  ✓ 门绿（无混行）' : '  ✗ 门红');
process.exit(r.mixed.length === 0 ? 0 : 1);
