/* 引用形与 pin 完整性门（#1714 第①级）＋ 值比对/映射校验（第②级 A、C 组）
 *
 * 第①级（不解析源内容）：
 *   A 引用形门     — 扫描面内每处「对齐 SRD」声称须可解析到 `SRD <版本> · <文件>:<条目/行号>`；
 *                    出处文件须在 README「规则来源」§一 pin 表内，且**版本与面一致**（版本→面→文件）；
 *                    带目录的 pin 行须写全路径；行号须落在该 pin 文件行数内；
 *                    「同上 :N」须有前置完整引用；测试名可由**上方 ≤3 行**引用点覆盖（README §三.3）。
 *   B pin 完整性门 — pin 表每行「行数＋sha1 前 16」须与**仓内离线缓存**逐项相符；
 *                    缓存缺失 ⇒ **显式红**（不静默跳过）。
 *   C 值自洽子检查 — 注/用例名中已写出的值 ↔ 同行代码值（自洽，非对源）。
 *
 * 第②级（消费缓存，仍**不需要网络**；射程按 T 席裁决 #1714 comment 5910204101）：
 *   A 组 源值比对  — 4 处引用的源行可机械抽取 HP/AC ⇒ 与仓内值**对源**比对（`hp:`/`ac:` 或用例名+断言）。
 *   C 组 映射校验  — `name-map.json` 的每条映射：所引源行须确为该条目名（`### <entry>`）；**不评数值**。
 *   B 组 列语义    — **整组豁免**（逐位置条目、禁 glob、独立计数 J1 与独立上限），不建模列位。
 *                    重访触发写在豁免条目 why 内（换 pin／新增第 4 个 3E 点／要求逐格精度）。
 *
 * 读数（**分母显式**）：声称口径 15（= 源行口径 9 + 其它 6）；源行口径 9 = A 4 + B 3 + C 2。
 * 退出码：K>0 ∨ pin 不符 ∨ 缓存缺失 ∨ 任一占比超限 ∨ 过期豁免 ∨ 豁免含 glob ⇒ 1；全绿 ⇒ 0。
 *
 * 用法：node tests/gates/refs-integrity.mjs [--root <dir>] [--list] [--refresh]（--refresh 仅人工）
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
const EXEMPTION_CAP_PCT = 20;              // 其它豁免（含 C 组映射说明行）占**声称口径**上限
const B_VALUE_EXEMPTION_CAP_PCT = 40;      // B 组（列语义）值豁免占**源行口径**上限（独立，不得借调大上面那个）
const CITATION_LOOKBACK = 3;
const SCAN_DIRS = ['src', 'tests', 'stories'];
const SCAN_EXT = ['.js', '.mjs', '.twee'];
const SCAN_SKIP_DIRS = ['node_modules', 'dist', 'build', 'vendor', '.git', 'gates'];
const CACHE_DIR = path.join(ROOT, 'tests', 'gates', 'pin-cache');
const EXEMPTIONS_FILE = path.join(ROOT, 'tests', 'gates', 'claims-exemptions.json');
const NAME_MAP_FILE = path.join(ROOT, 'tests', 'gates', 'name-map.json');
const README = path.join(ROOT, 'README.md');

/* ---- 引用形 ---- */
const RE_CLAIM = /对齐\s*SRD|SRD\s+\d|house\s*rule|数值(?:来自|对齐|取自)\s*SRD/i;
const RE_BACKTICK_REF = /`([^`]*\.md)\s*[:：]\s*([^`]+)`/g;
const RE_PLAIN_REF = /SRD\s+(\d+(?:\.\d+)*)\s*·\s*([^\s`:：]+\.md)\s*[:：]\s*([^\s`）)。,]+)/g;
const RE_PLACEHOLDER = /SRD\s+\d+(?:\.\d+)*\s*·\s*<[^>]+>\s*[:：]\s*<[^>]+>/g;
const RE_VERSION_REF = /SRD\s+(\d+(?:\.\d+)*)/g;
const RE_SAME_AS_ABOVE = /同上\s*[:：]\s*\d/;
const RE_DECLARATION = /SRD\s+(\d+(?:\.\d+)*)[^·]*·\s*`?([\w.-]+\/[\w.-]+)`?\s*@\s*`?([0-9a-f]{7,40})[….…]?/;
const RE_LINE_ENTRY = /^(\d+)(?:[-–](\d+))?(?:\/(\d+))*$/;

const SRC_VAL_RES = { HP: /\*\*HP\*\*\s+(\d+)/, AC: /\*\*AC\*\*\s+(\d+)/ };

const problems = [];
const red = (m) => problems.push(m);

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
const norm = (s) => s.replace(/\u2212/g, '-');
/* 条目规范化：数值条目取前缀（`7256-7287（「Goblin Minion」` → `7256-7287`）；命名条目原样 */
const normEntry = (e) => {
  const m = /^(\d+(?:[-–/]\d+)*)/.exec(e ?? '');
  return m ? m[1] : e;
};
const loadJson = (p, fallback) => {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { red(`JSON 解析失败：${path.relative(ROOT, p)} — ${e.message}`); return fallback; }
};

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
    if (!ver) ver = lastVersion;
    lastVersion = ver;
    rows.push({ face: m[1], repo, version: ver, pin, file, lines: Number(lines), sha1 });
  }
  return rows;
}
const cacheNameFor = (pinRow) => (pinRow.face === '3E'
  ? `${path.basename(pinRow.file).replace(/\.md$/, '')}-3e.md`
  : path.basename(pinRow.file));

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

/* B. pin 完整性 */
const pinResults = [];
for (const r of pins) {
  const cname = cacheNameFor(r);
  const p = path.join(CACHE_DIR, cname);
  if (!fs.existsSync(p)) {
    pinResults.push({ ...r, ok: false });
    red(`pin 缓存缺失：${cname}（离线缓存须入库；缺失**显式红**，不静默跳过）⇒ 人工补：node tests/gates/refs-integrity.mjs --refresh`);
    continue;
  }
  const buf = fs.readFileSync(p);
  const lines = buf.toString('utf8').split('\n').length - 1;
  const sha1 = sha1_16(buf);
  const ok = lines === r.lines && sha1 === r.sha1;
  pinResults.push({ ...r, ok, got: { lines, sha1 } });
  if (!ok) red(`pin 不符：${cname} — 表 ${r.lines}行/${r.sha1} 实 ${lines}行/${sha1}（源被改写/换版，或表被改）`);
}
const rowsByFaceBase = new Set(pins.map((r) => `${r.face}|${path.basename(r.file)}`));
const pinRowByFaceBase = new Map(pins.map((r) => [`${r.face}|${path.basename(r.file)}`, r]));
const facesByVersion = new Map();
for (const r of pins) {
  if (!facesByVersion.has(r.version)) facesByVersion.set(r.version, new Set());
  facesByVersion.get(r.version).add(r.face);
}

/* 豁免清单（scope: citation|value；禁 glob）*/
const exemptions = loadJson(EXEMPTIONS_FILE, { exemptions: [] }).exemptions ?? [];
for (const e of exemptions) {
  if (/[*?]/.test(e.match ?? '')) red(`豁免条目含 glob 通配（禁）：${e.file} → ${e.match}（须逐位置条目，防组级通配吞掉新增位置）`);
  if (!['citation', 'value'].includes(e.scope)) red(`豁免条目 scope 非法（须 citation|value）：${e.file} → ${e.scope}`);
  if (!e.why || !e.basis) red(`豁免条目缺 why/basis：${e.file}`);
}
const exHit = new Set();
const findEx = (rel, raw, scope) => exemptions.findIndex((e, i) => {
  const hit = rel.endsWith(e.file) && raw.includes(e.match) && e.scope === scope;
  if (hit) exHit.add(i);
  return hit;
});

/* C 组映射表 */
const nameMap = loadJson(NAME_MAP_FILE, { entries: [] }).entries ?? [];
if (nameMap.length === 0) red(`映射表为空或缺失：${path.relative(ROOT, NAME_MAP_FILE)}`);

/* A + tier-② */
const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();
let claims = 0, verified = 0, exemptCitation = 0, exemptValue = 0, placeholders = 0;
let sourceLineClaims = 0, valueChecked = 0, valueCompared = 0, selfCheck = 0, selfChecked = 0;
let cGroupChecked = 0;
const mappingHit = new Set();

function sourceValues(cachePath, entry) {
  const out = {};
  const ls = fs.readFileSync(cachePath, 'utf8').split('\n');
  const nums = String(entry ?? '').split(/[-–/]/).map(Number).filter(Number.isFinite);
  if (nums.length === 0) return out;
  const lo = Math.max(1, Math.min(...nums));
  const hi = Math.min(Math.max(...nums), ls.length);
  for (let i = lo; i <= hi; i++) {
    for (const [k, re] of Object.entries(SRC_VAL_RES)) {
      const m = re.exec(ls[i - 1]);
      if (m && out[k] === undefined) out[k] = { v: Number(m[1]), line: i };
    }
  }
  return out;
}

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let lastCitationIdx = -Infinity;
  let lastResolved = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const text = norm(raw);
    if (!RE_CLAIM.test(text)) continue;
    claims++;
    const at = `${rel}:${i + 1}`;

    const cites = [];
    for (const m of text.matchAll(RE_BACKTICK_REF)) cites.push({ ver: null, file: m[1], entry: normEntry(m[2]) });
    for (const m of text.matchAll(RE_PLAIN_REF)) cites.push({ ver: m[1], file: m[2], entry: normEntry(m[3]) });
    for (const _ of text.matchAll(RE_PLACEHOLDER)) cites.push({ ver: null, file: '<文件>', entry: '<行>' });
    const versions = [...text.matchAll(RE_VERSION_REF)].map((m) => m[1]);
    for (const c of cites) if (!c.ver) c.ver = versions[0] ?? null;
    if (new Set(versions).size > 1) red(`一行混引多版本：${at} → 出现 ${[...new Set(versions)].join('、')}，请拆行或显式标注每条所属版本`);

    const resolved = [];
    if (cites.length > 0) {
      let allOk = true;
      for (const c of cites) {
        if (/^<.+>$/.test(c.file)) {
          if (/约定|格式|出处/.test(text)) { placeholders++; verified++; }
          else { red(`引用为占位形态但无「约定/格式」语境：${at} → ${c.file}`); allOk = false; }
          continue;
        }
        const base = path.basename(c.file);
        if (!c.ver) { red(`引用缺版本（README §三.2 必带版本）：${at} → ${c.file}`); allOk = false; continue; }
        const faces = facesByVersion.get(c.ver);
        if (!faces) { red(`引用版本不在 pin 表内（先登记源）：${at} → SRD ${c.ver ?? '(缺)'} · ${c.file}`); allOk = false; continue; }
        const face = [...faces].find((fa) => rowsByFaceBase.has(`${fa}|${base}`));
        if (!face) { red(`引用版本与 pin 表不符（按面判）：${at} → SRD ${c.ver} · ${c.file}`); allOk = false; continue; }
        const row = pinRowByFaceBase.get(`${face}|${base}`);
        if (row.file.includes('/') && c.file !== row.file && !c.file.endsWith(row.file)) {
          red(`引用路径不完整（跨面歧义）：${at} → 须写 pin 表内的完整路径「${row.file}」`); allOk = false; continue;
        }
        const lm = RE_LINE_ENTRY.exec(c.entry ?? '');
        if (lm) {
          const nums = c.entry.split(/[-–/]/).map(Number).filter(Number.isFinite);
          const max = Math.max(...nums);
          if (max < 1 || max > row.lines) { red(`引用行号越界：${at} → ${c.file}:${c.entry}（该 pin 文件 ${row.lines} 行）`); allOk = false; continue; }
        }
        if (!c.entry || c.entry.length < 2) { red(`引用条目为空：${at}`); allOk = false; continue; }
        resolved.push({ ...c, face, row, cachePath: path.join(CACHE_DIR, cacheNameFor(row)) });
      }
      if (allOk && resolved.length > 0) { lastCitationIdx = i; lastResolved = resolved; verified++; sourceLineClaims++; }
    } else if (RE_DECLARATION.test(text)) {
      const d = RE_DECLARATION.exec(text);
      const [, dver, drepo, dsha] = d;
      if (pins.find((r) => r.repo === drepo && r.version === dver && r.pin.startsWith(dsha))) { verified++; lastCitationIdx = i; }
      else red(`来源声明行与 pin 表不符（伪造/过期）：${at} → SRD ${dver} · ${drepo}@${dsha}`);
    } else if (RE_SAME_AS_ABOVE.test(text)) {
      if (Number.isFinite(lastCitationIdx)) verified++;
      else red(`「同上」无前置完整引用：${at}`);
    } else if (/\bhouse\s*rule\b/i.test(text)) {
      verified++;
    } else if (/test\(\s*'/.test(text) && i - lastCitationIdx <= CITATION_LOOKBACK) {
      verified++;
    } else if (findEx(rel, raw, 'citation') >= 0) {
      exemptCitation++;
    } else {
      red(`声称未带可解析引用（且不在豁免清单）：${at} → ${raw.trim().slice(0, 110)}`);
    }

    /* C 值自洽子检查（注中已写出的值 ↔ 同行代码值）*/
    const selfCmp = (label, claimed, field) => {
      const m = text.match(new RegExp(`${field}\\s*:\\s*(-?\\d+)`));
      if (!m) return;
      selfCheck++;
      if (Number(m[1]) !== Number(claimed)) red(`值自洽不符：${at} 注称 ${label}=${claimed}，同行 ${field}: ${m[1]}`);
      else selfChecked++;
    };
    for (const m of text.matchAll(/HP\s+(\d+)/g)) selfCmp('HP', m[1], 'hp');
    for (const m of text.matchAll(/AC\s+(\d+)/g)) selfCmp('AC', m[1], 'ac');

    /* C'. 用例名内数值 ↔ 紧随断言 */
    const tm = text.match(/test\(\s*'[^']*对齐\s*SRD[^']*（([^）]*)）/);
    const titlePairs = {};
    if (tm) {
      const body = lines.slice(i + 1, i + 12).join('\n');
      for (const [, key, val] of tm[1].matchAll(/(AC|HP|STR|DEX|CON)\s+(-?\d+)/g)) {
        const fields = { AC: ['ac'], HP: ['maxHp', 'hp'], STR: ['str_mod'], DEX: ['dex_mod'], CON: ['con_mod'] }[key];
        titlePairs[key] = Number(val);
        selfCheck++;
        if (fields.some((fl) => new RegExp(`assert\\.eq\\([^,]*\\.${fl}\\s*,\\s*${val}\\b`).test(body))) selfChecked++;
        else red(`用例名数值无对应断言：${at} 声称 ${key} ${val}，其后 12 行内无 assert.eq(…${fields.join('|')}…, ${val})`);
      }
    }

    /* ---------- tier-②：A 组 源值比对 + C 组 映射校验 ---------- */
    const effResolved = resolved.length > 0
      ? resolved
      : (i - lastCitationIdx <= CITATION_LOOKBACK && /test\(\s*'/.test(text) ? lastResolved : []);
    if (effResolved.length > 0) {
      // C 组：本条是否为映射表声明的引用点？
      const mapHit = nameMap.find((e) => `${e.claim}` === at);
      if (mapHit) {
        const want = `### ${mapHit.source.entry}`;
        const r0 = resolved[0];
        const nums = String(r0.entry).split(/[-–/]/).map(Number).filter(Number.isFinite);
        const ls = fs.readFileSync(r0.cachePath, 'utf8').split('\n');
        const hit = nums.some((n) => (ls[n - 1] ?? '').trim().startsWith(want));
        cGroupChecked++;
        if (hit) mappingHit.add(mapHit.source.entry);
        else red(`映射校验不符（C 组）：${at} 声明源条目「${mapHit.source.entry}」，但所引源行未见 \`${want}\``);
      }
      // A 组：源值 vs 仓内值
      if (findEx(rel, raw, 'value') >= 0) {
        exemptValue++;                                  // B 组整组豁免（逐位置）
      } else {
        for (const r of effResolved) {
          const src = sourceValues(r.cachePath, r.entry);
          const repoVals = {};
          const hpm = text.match(/hp\s*:\s*(\d+)/); if (hpm) repoVals.HP = Number(hpm[1]);
          const acm = text.match(/ac\s*:\s*(\d+)/); if (acm) repoVals.AC = Number(acm[1]);
          if (titlePairs.HP !== undefined && repoVals.HP === undefined) repoVals.HP = titlePairs.HP;
          if (titlePairs.AC !== undefined && repoVals.AC === undefined) repoVals.AC = titlePairs.AC;
          for (const k of Object.keys(src)) {
            if (repoVals[k] === undefined) continue;
            valueCompared++;
            if (src[k].v === repoVals[k]) valueChecked++;
            else red(`源值比对不符（A 组）：${at} ${k} 仓内=${repoVals[k]} 源=${src[k].v}（${path.basename(r.cachePath)}:${src[k].line}）`);
          }
        }
      }
    }
  }
}

/* 5. 豁免占比（分母显式）与过期豁免 */
const pctOther = claims > 0 ? (exemptCitation / claims) * 100 : 0;
const pctB = sourceLineClaims > 0 ? (exemptValue / sourceLineClaims) * 100 : 0;
const unused = exemptions.filter((_, i) => !exHit.has(i));
if (unused.length > 0) red(`豁免清单有未命中条目（过期豁免，须删）：${unused.map((e) => `${e.file}[${e.scope}]`).join(', ')}`);
if (pctOther > EXEMPTION_CAP_PCT) red(`其它豁免占比 ${pctOther.toFixed(1)}% 超上限 ${EXEMPTION_CAP_PCT}%（豁免正在吃掉门）`);
if (pctB > B_VALUE_EXEMPTION_CAP_PCT) red(`B 组值豁免占比 ${pctB.toFixed(1)}%（分母=源行口径 ${sourceLineClaims}）超独立上限 ${B_VALUE_EXEMPTION_CAP_PCT}%`);

/* 7. 读数输出 */
const pinOk = pinResults.filter((r) => r.ok).length;
const aGroup = sourceLineClaims - exemptValue - cGroupChecked;
console.log('引用形与 pin 完整性门（#1714 第①级；值比对 A/C 组 = tier-②）');
console.log(`  扫描面：${files.length} 文件（${SCAN_DIRS.join('、')}；排除 ${SCAN_SKIP_DIRS.join('、')}）`);
console.log(`  pin 校验：${pinOk}/${pinResults.length} 相符${pinOk === pinResults.length ? ' ✓' : ' ✗'}`);
for (const r of pinResults) console.log(`    ${r.ok ? '✓' : '✗'} ${cacheNameFor(r).padEnd(26)} 表=${r.lines}行/${r.sha1}${r.ok ? '' : ` 实=${r.got?.lines ?? '-'}行/${r.got?.sha1 ?? '-'}`}`);
console.log(`  口径：声称 ${claims}（= 源行 ${sourceLineClaims} + 其它 ${claims - sourceLineClaims}）；源行 ${sourceLineClaims} = A ${aGroup} + B ${exemptValue} + C ${cGroupChecked}`);
console.log(`  第①级：已核 ${verified}（含约定占位 ${placeholders}）/ 不符 ${problems.length}；其它豁免 ${exemptCitation}（${pctOther.toFixed(1)}%，分母=${claims}，上限 ${EXEMPTION_CAP_PCT}%）`);
console.log(`  tier-②：A 组源值比对 已核 ${valueChecked}/${valueCompared}（分母=可比对项）｜C 组映射 已核 ${cGroupChecked}/${nameMap.length}（命中条目 ${[...mappingHit].join('、') || '-'}）`);
console.log(`          B 组列语义豁免 ${exemptValue}（${pctB.toFixed(1)}%，分母=${sourceLineClaims}，独立上限 ${B_VALUE_EXEMPTION_CAP_PCT}%）`);
console.log(`  值自洽（注↔代码，第①级）：已核 ${selfChecked}/${selfCheck}`);
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
