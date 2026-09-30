/* 引用形与 pin 完整性门（#1714 第①级 · 判据见 sagitrs/sgstory#1714 评论 5909893697）
 *
 * 射程（level ①，**不解析源内容**）：
 *   A 引用形门     — 扫描面内每处「对齐 SRD」声称须可解析到 `SRD <版本> · <文件>:<条目/行号>`；
 *                    出处文件须在 README「规则来源」§一 pin 表内，且**版本与该行一致**；
 *                    「同上 :N」须在本文件内有前置完整引用；测试名可由**上方 ≤3 行**的引用点覆盖
 *                    （README §三.3「落在最近的声明点」）。
 *   B pin 完整性门 — pin 表每行的「行数＋sha1 前 16」须与**仓内离线缓存**逐项相符；
 *                    缓存缺失 ⇒ **显式红**（不静默跳过）。
 *   C 值自洽子检查 — 注/用例名中**已写出**的数值（HP/AC/属性调整）须与同行（或同用例断言）一致。
 *                    覆盖率有限，**不替代** level ②（源解析逐值比对）。
 *
 * 输出读数：抽取 N / 已核 M / 不符 K / 豁免 J（占比 p%）/ pin 校验结果。
 * 退出码：K>0 ∨ pin 不符 ∨ 缓存缺失 ∨ 豁免超上限 ∨ 有过期豁免 ⇒ 1；全绿 ⇒ 0。
 *
 * 用法：
 *   node tests/gates/refs-integrity.mjs                 # 校验（CI 用；**离线**）
 *   node tests/gates/refs-integrity.mjs --root <dir>    # 对另一份检出校验（自检用）
 *   node tests/gates/refs-integrity.mjs --refresh       # 联网重取缓存（**仅人工**，CI 绝不用）
 *   node tests/gates/refs-integrity.mjs --list          # 打印扫描面与逐条抽取集
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(arg('--root') ?? DEFAULT_ROOT);
const REFRESH = argv.includes('--refresh');
const LIST = argv.includes('--list');

/* ---- 门内参数（可判读数；改这里即改门）---- */
const EXEMPTION_CAP_PCT = 20;                       // 豁免占比上限（判据 5）
const CITATION_LOOKBACK = 3;                        // 测试名可被上方 N 行内的引用覆盖（README §三.3）
const SCAN_DIRS = ['src', 'tests', 'stories'];
const SCAN_EXT = ['.js', '.mjs', '.twee'];
const SCAN_SKIP_DIRS = ['node_modules', 'dist', 'build', 'vendor', '.git', 'gates']; // gates=本门自身，非声称载体
const CACHE_DIR = path.join(ROOT, 'tests', 'gates', 'pin-cache');
const EXEMPTIONS_FILE = path.join(ROOT, 'tests', 'gates', 'claims-exemptions.json');
const README = path.join(ROOT, 'README.md');

/* ---- 引用形（README §三.1/§三.2）---- */
const RE_CLAIM = /对齐\s*SRD|SRD\s+\d|house\s*rule|数值(?:来自|对齐|取自)\s*SRD/i;
const RE_BACKTICK_REF = /`([^`]*\.md)\s*[:：]\s*([^`]+)`/g;   // `path/to/file.md:123-130`
const RE_PLAIN_REF = /SRD\s+(\d+(?:\.\d+)*)\s*·\s*([^\s`:：]+\.md)\s*[:：]\s*([^\s`）)。,]+)/g;
const RE_PLACEHOLDER = /SRD\s+\d+(?:\.\d+)*\s*·\s*<[^>]+>\s*[:：]\s*<[^>]+>/g;   // `SRD 5.2.1 · <文件>:<行>` 约定占位
const RE_VERSION_REF = /SRD\s+(\d+(?:\.\d+)*)/g;
const RE_SAME_AS_ABOVE = /同上\s*[:：]\s*\d/;
const RE_DECLARATION = /SRD\s+(\d+(?:\.\d+)*)[^·]*·\s*`?([\w.-]+\/[\w.-]+)`?\s*@\s*`?([0-9a-f]{7,40})[….…]?/;
const RE_LINE_ENTRY = /^(\d+)(?:[-–](\d+))?(?:\/(\d+))*$/;   // 7252 / 7256-7287 / 7279/7283/7287

const problems = [];
const red = (m) => problems.push(m);

/* ---------- 工具 ---------- */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_SKIP_DIRS.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}
const sha1_16 = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const norm = (s) => s.replace(/\u2212/g, '-');       // U+2212 → ASCII '-'

/* ---------- README §一 pin 表 ---------- */
function parsePinTable() {
  const md = fs.readFileSync(README, 'utf8');
  const rows = [];
  let lastVersion = null;
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*\*\*(5E|3E)\*\*\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim().replace(/`/g, ''));
    const [repo, version, pin, file, lines, sha1] = cells;
    if (!/^\d+$/.test(lines ?? '')) continue;
    let ver = version.match(/\d+(?:\.\d+)*/)?.[0];
    if (!ver) ver = lastVersion;                      // 「同上」继承上一行版本
    lastVersion = ver;
    rows.push({ face: m[1], repo, version: ver, pin, file, lines: Number(lines), sha1 });
  }
  return rows;
}

/* ---------- pin → 缓存文件（按面消歧：3E 面文件名带 -3e 后缀）---------- */
function cacheNameFor(pinRow) {
  const base = path.basename(pinRow.file);
  return pinRow.face === '3E' ? `${base.replace(/\.md$/, '')}-3e.md` : base;
}

/* ---------- --refresh（仅人工）---------- */
function refresh(rows) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const r of rows) {
    const target = cacheNameFor(r);
    const api = `repos/${r.repo}/contents/${encodeURIComponent(r.file)}?ref=${r.pin}`;
    try {
      const buf = execFileSync('gh', ['api', api, '-H', 'Accept: application/vnd.github.raw'], { maxBuffer: 64 * 1024 * 1024 });
      fs.writeFileSync(path.join(CACHE_DIR, target), buf);
      console.log(`  ✓ ${target} 行数=${buf.toString('utf8').split('\n').length - 1} sha1=${sha1_16(buf)}`);
    } catch (e) { console.log(`  ✗ 取源失败：${r.file} — ${String(e.message).slice(0, 140)}`); }
  }
}

/* ---------- 主流程 ---------- */
const pins = parsePinTable();
if (pins.length === 0) red('README「规则来源」§一 pin 表解析为 0 行（表头/格式被改坏？）');
if (REFRESH) { refresh(pins); console.log('（--refresh 只写缓存，不做判定）'); process.exit(0); }

/* B. pin 完整性（含缓存缺失 ⇒ 显式红）*/
const pinResults = [];
for (const r of pins) {
  const p = path.join(CACHE_DIR, cacheNameFor(r));
  if (!fs.existsSync(p)) {
    pinResults.push({ ...r, ok: false });
    red(`pin 缓存缺失：${cacheNameFor(r)}（离线缓存须入库；缺失**显式红**，不静默跳过）⇒ 人工补：node tests/gates/refs-integrity.mjs --refresh`);
    continue;
  }
  const buf = fs.readFileSync(p);
  const lines = buf.toString('utf8').split('\n').length - 1;
  const sha1 = sha1_16(buf);
  const ok = lines === r.lines && sha1 === r.sha1;
  pinResults.push({ ...r, ok, got: { lines, sha1 } });
  if (!ok) red(`pin 不符：${cacheNameFor(r)} — 表 ${r.lines}行/${r.sha1} 实 ${lines}行/${sha1}（源被改写/换版，或表被改）`);
}
// 文件名（含路径）与版本 → 面：同名文件跨面时靠面消歧（NIT-2）
const rowsByFaceBase = new Set(pins.map((r) => `${r.face}|${path.basename(r.file)}`));
const facesByVersion = new Map();
for (const r of pins) {
  if (!facesByVersion.has(r.version)) facesByVersion.set(r.version, new Set());
  facesByVersion.get(r.version).add(r.face);
}
const pinRowByFaceBase = new Map(pins.map((r) => [`${r.face}|${path.basename(r.file)}`, r]));

/* A + C. 引用形门 + 值自洽子检查 */
function loadExemptions() {
  if (!fs.existsSync(EXEMPTIONS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(EXEMPTIONS_FILE, 'utf8')).exemptions ?? []; }
  catch (e) { red(`豁免清单解析失败：${EXEMPTIONS_FILE} — ${e.message}`); return []; }
}
const exemptions = loadExemptions();
const exHit = new Set();

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();
let claims = 0, verified = 0, exemptCount = 0, valueChecked = 0, valueSites = 0, placeholders = 0;

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let lastCitationIdx = -Infinity;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const text = norm(raw);
    if (!RE_CLAIM.test(text)) continue;
    claims++;
    const at = `${rel}:${i + 1}`;

    /* 引用点提取：先取反引号形态（路径可带空格），再取裸形态 */
    const cites = [];
    for (const m of text.matchAll(RE_BACKTICK_REF)) cites.push({ ver: null, file: m[1], entry: m[2] });
    for (const m of text.matchAll(RE_PLAIN_REF)) cites.push({ ver: m[1], file: m[2], entry: m[3] });
    for (const _ of text.matchAll(RE_PLACEHOLDER)) cites.push({ ver: null, file: '<文件>', entry: '<行>' });
    const versions = [...text.matchAll(RE_VERSION_REF)].map((m) => m[1]);
    for (const c of cites) if (!c.ver) c.ver = versions[0] ?? null;
    if (new Set(versions).size > 1) red(`一行混引多版本（NIT-5）：${at} → 出现 ${[...new Set(versions)].join('、')}，请拆成多行或显式标注每条所属版本`);
    if (cites.length > 0 && !versions[0]) { red(`引用缺版本（README §三.2 必带版本）：${at}`); }

    if (cites.length > 0) {
      let allOk = true;
      for (const c of cites) {
        if (/^<.+>$/.test(c.file)) {                  // 约定占位（如 `SRD 5.2.1 · <文件>:<行>`）
          if (/约定|格式|出处/.test(text)) { placeholders++; verified++; }
          else { red(`引用为占位形态但无「约定/格式」语境：${at} → ${c.file}`); allOk = false; }
          continue;
        }
        const base = path.basename(c.file);
        const faces = c.ver ? facesByVersion.get(c.ver) : null;
        if (!faces) { red(`引用版本不在 pin 表内（先登记源）：${at} → SRD ${c.ver ?? '(缺)'} · ${c.file}`); allOk = false; continue; }
        const matchedFace = [...faces].find((fa) => rowsByFaceBase.has(`${fa}|${base}`));
        if (!matchedFace) { red(`引用版本与 pin 表不符（按面判）：${at} → SRD ${c.ver} · ${c.file}（该版本面上无此文件）`); allOk = false; continue; }
        // NIT-2：pin 行带目录时引用必须给全路径（否则 5E/3E 同名文件可互换版本徽号）
        const row = pinRowByFaceBase.get(`${matchedFace}|${base}`);
        if (row.file.includes('/') && c.file !== row.file && !c.file.endsWith(row.file)) {
          red(`引用路径不完整（跨面歧义）：${at} → 须写 pin 表内的完整路径「${row.file}」`); allOk = false; continue;
        }
        // 行号范围须落在该 pin 文件的行数内
        const lm = RE_LINE_ENTRY.exec(c.entry ?? '');
        if (lm) {
          const nums = c.entry.split(/[-–/]/).map(Number).filter((n) => Number.isFinite(n));
          const max = Math.max(...nums);
          if (max < 1 || max > row.lines) { red(`引用行号越界：${at} → ${c.file}:${c.entry}（该 pin 文件 ${row.lines} 行）`); allOk = false; continue; }
        }
        if (!c.entry || c.entry.length < 2) { red(`引用条目为空：${at}`); allOk = false; continue; }
      }
      if (allOk) { lastCitationIdx = i; verified++; }
    } else if (RE_DECLARATION.test(text)) {
      // NIT-1：来源声明行不只比形态——须与 pin 表交叉核对（repo + commit 前缀 + 版本）
      const d = RE_DECLARATION.exec(text);
      const [, dver, drepo, dsha] = d;
      const hit = pins.find((r) => r.repo === drepo && r.version === dver && r.pin.startsWith(dsha));
      if (hit) { verified++; lastCitationIdx = i; }
      else red(`来源声明行与 pin 表不符（伪造/过期）：${at} → SRD ${dver} · ${drepo}@${dsha}（pin 表内无此 repo×版本×commit 前缀组合）`);
    } else if (RE_SAME_AS_ABOVE.test(text)) {
      if (Number.isFinite(lastCitationIdx)) verified++;
      else red(`「同上」无前置完整引用：${at}`);
    } else if (/\bhouse\s*rule\b/i.test(text)) {
      verified++;                                     // README §三.5：自定值显式标 house rule
    } else if (/test\(\s*'/.test(text) && i - lastCitationIdx <= CITATION_LOOKBACK) {
      verified++;                                     // 测试名由上方引用点覆盖（README §三.3）
    } else {
      const hit = exemptions.findIndex((e) => rel.endsWith(e.file) && raw.includes(e.match));
      if (hit >= 0) { exHit.add(hit); exemptCount++; }
      else red(`声称未带可解析引用（且不在豁免清单）：${at} → ${raw.trim().slice(0, 110)}`);
    }

    /* C. 值自洽子检查（注中已写出的值 ↔ 同行代码值）*/
    const cmp = (label, claimed, field) => {
      const m = text.match(new RegExp(`${field}\\s*:\\s*(-?\\d+)`));
      if (!m) return;
      valueSites++;
      if (Number(m[1]) !== Number(claimed)) red(`值自洽不符：${at} 注称 ${label}=${claimed}，同行 ${field}: ${m[1]}`);
      else valueChecked++;
    };
    for (const m of text.matchAll(/HP\s+(\d+)/g)) cmp('HP', m[1], 'hp');
    for (const m of text.matchAll(/AC\s+(\d+)/g)) cmp('AC', m[1], 'ac');
    for (const m of text.matchAll(/(STR|DEX|CON)\s+\d+\((-?\d+)\)/g)) cmp(m[1], m[2], { STR: 'str_mod', DEX: 'dex_mod', CON: 'con_mod' }[m[1]]);

    /* C'. 用例名内数值 ↔ 紧随断言 */
    const tm = text.match(/test\(\s*'[^']*对齐\s*SRD[^']*（([^）]*)）/);
    if (tm) {
      const body = lines.slice(i + 1, i + 12).join('\n');
      for (const [, key, val] of tm[1].matchAll(/(AC|HP|STR|DEX|CON)\s+(-?\d+)/g)) {
        const fields = { AC: ['ac'], HP: ['maxHp', 'hp'], STR: ['str_mod'], DEX: ['dex_mod'], CON: ['con_mod'] }[key];
        valueSites++;
        if (fields.some((fl) => new RegExp(`assert\\.eq\\([^,]*\\.${fl}\\s*,\\s*${val}\\b`).test(body))) valueChecked++;
        else red(`用例名数值无对应断言：${at} 声称 ${key} ${val}，其后 12 行内无 assert.eq(…${fields.join('|')}…, ${val})`);
      }
    }
  }
}

/* 5. 豁免占比与过期豁免 */
const pct = claims > 0 ? (exemptCount / claims) * 100 : 0;
const unused = exemptions.filter((_, i) => !exHit.has(i));
if (unused.length > 0) red(`豁免清单有未命中条目（过期豁免，须删）：${unused.map((e) => e.file).join(', ')}`);
if (pct > EXEMPTION_CAP_PCT) red(`豁免占比 ${pct.toFixed(1)}% 超上限 ${EXEMPTION_CAP_PCT}%（豁免正在吃掉门）`);

/* 7. 读数输出 */
const pinOk = pinResults.filter((r) => r.ok).length;
console.log('引用形与 pin 完整性门（#1714 第①级）');
console.log(`  扫描面：${files.length} 文件（${SCAN_DIRS.join('、')}；排除 ${SCAN_SKIP_DIRS.join('、')}）`);
console.log(`  pin 校验：${pinOk}/${pinResults.length} 相符${pinOk === pinResults.length ? ' ✓' : ' ✗'}`);
for (const r of pinResults) console.log(`    ${r.ok ? '✓' : '✗'} ${cacheNameFor(r).padEnd(26)} 表=${r.lines}行/${r.sha1}${r.ok ? '' : ` 实=${r.got?.lines ?? '-'}行/${r.got?.sha1 ?? '-'}`}`);
console.log(`  抽取 ${claims} 处声称 / 已核 ${verified}（含约定占位 ${placeholders}）/ 豁免 ${exemptCount}（占比 ${pct.toFixed(1)}%，上限 ${EXEMPTION_CAP_PCT}%）/ 不符 ${problems.length}`);
console.log(`  值自洽：已核 ${valueChecked}/${valueSites} 处（射程：注与用例名中已写出的 HP·AC·属性调整；**不替代** level ②）`);
if (LIST) {
  console.log('  逐条抽取集：');
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (RE_CLAIM.test(norm(l))) console.log(`    ${path.relative(ROOT, f)}:${i + 1}  ${l.trim().slice(0, 100)}`);
    });
  }
}
if (problems.length > 0) {
  console.log('\n✗ 门红：');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\n✓ 门绿');
process.exit(0);
