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
 *                    用例名支的字段候选**同时含两代模型**（`str_mod` 与 `str`，见 #1734）：
 *                    标题载调整值或原始分均可，**不因门而少写值**。
 *
 * 第②级（消费缓存，仍**不需要网络**；射程按 T 席裁决 #1714 comment 5910204101）：
 *   A 组 源值比对  — 4 处引用的源行可机械抽取 HP/AC ⇒ 与仓内值**对源**比对（`hp:`/`ac:` 或用例名+断言）。
 *   C 组 映射校验  — `name-map.json` 的每条映射：所引源行须确为该条目名（`### <entry>`）；**不评数值**。
 *   B 组 列语义    — **整组豁免**（逐位置条目、禁 glob、独立计数 J1 与独立上限），不建模列位。
 *                    重访触发写在豁免条目 why 内（换 pin／新增第 4 个 3E 点／要求逐格精度）。
 *
 * 读数（**分母显式**）：声称口径 15（= 源行口径 9 + 其它 6）；源行口径 9 = A 4 + B 3 + C 2。
 * 退出码：K>0 ∨ pin 不符 ∨ 缓存缺失 ∨ 任一占比超限 ∨ 过期豁免 ∨ 豁免含 glob ∨ **覆盖面低于基线** ∨ **记账面超上限** ⇒ 1；全绿 ⇒ 0。
 *
 * 用法：node tests/gates/refs-integrity.mjs [--root <dir>] [--list] [--refresh] [--update-baseline]
 *        （--refresh 与 --update-baseline 均**仅人工**，CI 绝不调用）
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
const UPDATE_BASELINE = argv.includes('--update-baseline');   // 仅人工（同 --refresh 形态；#1720）
const VERBOSE = argv.includes('--verbose');                   // S3-④ 降级明细出声（#1744）

/* ---- 门内参数（可判读数；改这里即改门）---- */
const EXEMPTION_CAP_PCT = 20;              // 其它豁免（含 C 组映射说明行）占**声称口径**上限
const B_VALUE_EXEMPTION_CAP_PCT = 40;      // B 组（列语义）值豁免占**源行口径**上限（独立，不得借调大上面那个）
const CITATION_LOOKBACK = 3;
const SCAN_DIRS = ['src', 'tests', 'stories'];
const SCAN_EXT = ['.js', '.mjs', '.twee'];
const SCAN_SKIP_DIRS = ['node_modules', 'dist', 'build', 'vendor', '.git', 'gates'];
const BLOCK_WINDOW = 40;                        // 引用指向条目标题行时的向下扫窗上限（行）
const CACHE_DIR = path.join(ROOT, 'tests', 'gates', 'pin-cache');
const EXEMPTIONS_FILE = path.join(ROOT, 'tests', 'gates', 'claims-exemptions.json');
/* 覆盖面基线（#1720）：门对**错误** fail-loud，对**信息量下降**原为无感 —— 本文件给出下限/上限。 */
const BASELINE_FILE = path.join(ROOT, 'tests', 'gates', 'coverage-baseline.json');
const NAME_MAP_FILE = path.join(ROOT, 'tests', 'gates', 'name-map.json');
const README = path.join(ROOT, 'README.md');

/* ---- 引用形 ---- */
/* S3-⑦：`SRD d20M` 与 5E/3E 的 `SRD \d` **同权** —— 否则「只写引用不写对齐」的行整行跳过，
 *   d20m 的**纯引用面静默不核**（writer-2 实测：现门红的 4 项全来自「对齐 SRD d20M」支）。 */
const RE_CLAIM = /对齐\s*SRD|SRD\s+(?:\d|d20M)|house\s*rule|数值(?:来自|对齐|取自)\s*SRD/i;
const RE_BACKTICK_REF = /`([^`]*\.md)\s*[:：]\s*([^`]+)`/g;
const RE_PLAIN_REF = /SRD\s+(\d+(?:\.\d+)*|d20M)\s*·\s*([^\s`:：]+\.md)\s*[:：]\s*([^\s`）)。,]+)/g;
const RE_PLACEHOLDER = /SRD\s+\d+(?:\.\d+)*\s*·\s*<[^>]+>\s*[:：]\s*<[^>]+>/g;
const RE_VERSION_REF = /SRD\s+(\d+(?:\.\d+)*|d20M)/g;
const RE_SAME_AS_ABOVE = /同上\s*[:：]\s*\d/;
const RE_DECLARATION = /SRD\s+(\d+(?:\.\d+)*)[^·]*·\s*`?([\w.-]+\/[\w.-]+)`?\s*@\s*`?([0-9a-f]{7,40})[….…]?/;
const RE_LINE_ENTRY = /^(\d+)(?:[-–](\d+))?(?:\/(\d+))*$/;

/* 源值抽取（多**形**并列，取首个命中）——`#1782` writer 报：原式只认 5E 形
 *   ⇒ 3E 怪物的 **HP/AC 从不进 A 组**（只有单测守声明面，门不守）。
 *   5E 形：`**HP** 11`／`**AC** 16`
 *   3E 形：`Hit Dice: 1d8+2 (6 hp)`／`Armor Class:           15 (+1 size, ...), touch 14, flat-footed 12`
 *   ★3E 的 AC 须**锚行首**且取**首个**数（✗ 捕 touch／flat-footed —— 那是 14／12，非 AC）。 */
const SRC_VAL_RES = {
  HP: [/\*\*HP\*\*\s+(\d+)/, /^[*\s]*Hit Dice:.*?\((\d+)\s*hp\)/m],
  AC: [/\*\*AC\*\*\s+(\d+)/, /^[*\s]*Armor Class:\s+(\d+)/m],
};

/* ---- A 组扩展：属性调整值（#1725）----
 *  5E 源：三连单元格 `<td><strong>DEX</strong></td> <td>15</td> <td>+2</td>` ⇒ 取**调整列**
 *  3E 源：单行 `| Abilities: | Str 11, Dex 13, ... |` ⇒ 取**原始分**并按统一公式换算
 *  两格式的「原始分 → 调整值」均须等于 floor((score−10)/2)（门内自检，防解析错） */
const ABIL_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ABIL_FIELD = { STR: 'str_mod', DEX: 'dex_mod', CON: 'con_mod', INT: 'int_mod', WIS: 'wis_mod', CHA: 'cha_mod' };
const abilMod = (score) => Math.floor((score - 10) / 2);
const RE_ABILITY_5E = /<td><strong>(STR|DEX|CON|INT|WIS|CHA)<\/strong><\/td>\s*<td>(-?\d+)<\/td>\s*<td>([+-]?\d+)<\/td>/g;
const RE_ABILITY_3E_LINE = /Abilities:\s*\|?\s*Str\s+\d/i;   // 兼容两种源格式：`| Abilities: | Str 11, …` 与 `Abilities:   Str 11, …`
const RE_ABILITY_3E_PAIR = /\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)/g;

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
    const m = line.match(/^\|\s*\*\*(5E|3E|d20m)\*\*\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim().replace(/`/g, ''));
    const [repo, version, pin, file, lines, sha1] = cells;
    if (!/^\d+$/.test(lines ?? '')) continue;
    /* S3-⑥（writer-2 实测）：`d20M` 这类**短 token 版本**会被「纯数字版本正则」截成 `20`
     *   ⇒ 引用侧 token `d20M` 在 facesByVersion 查不到 ⇒ d20m 引用全红。
     *   处置：**整格即标识符**（`[A-Za-z][A-Za-z0-9.]*`，本仓写 `d20M`）⇒ 取原文；
     *   否则取数字串（`SRD 5.2.1（2024）` ⇒ `5.2.1`；`D&D v3.5 SRD` ⇒ `3.5`）。
     * ★注意：`同上` 是 pin 表的**既有续行惯用**（同面后续行的 repo/版本/pin 列全写「同上」）——
     *   对它**必须**继承上一行版本；否则整表除每面首行外全部丢失（我首版即栽在此）。
     *   只有**既非「同上」、又取不出**的单元格才属异常。 */
    const tokenM = version.match(/^([A-Za-z][A-Za-z0-9.]*)$/);
    let ver = tokenM ? tokenM[1] : version.match(/\d+(?:\.\d+)*/)?.[0];
    if (!ver && /^同上$/.test(version)) ver = lastVersion; // 既有续行惯用 ⇒ 继承（合规，非静默洞）
    if (!ver) {
      /* :112 的静默继承须**出声**（S3-⑥）：非「同上」却取不出 ⇒ 面与版本错配而无声（与 #1714「✗ 静默」同族）。 */
      red(`pin 表版本单元格取不出：面=${m[1]} 原文=「${version}」⇒ 拒绝静默继承上一行（${lastVersion ?? '无'}）；请写明确版本（如 \`d20M\` 或 \`5.2.1\`）`);
      continue;
    }
    lastVersion = ver;
    rows.push({ face: m[1], repo, version: ver, versionRaw: version, pin, file, lines: Number(lines), sha1 });
  }
  return rows;
}
const cacheNameFor = (pinRow) => {
  const base = path.basename(pinRow.file).replace(/\.md$/, '');
  /* 面 → 缓存名后缀（S3-②：第三桶 d20m，照 3E 的 `-3e.md` 同款变换） */
  if (pinRow.face === '3E') return `${base}-3e.md`;
  if (pinRow.face === 'd20m') return `${base}-d20m.md`;
  return path.basename(pinRow.file);
};

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
/* 值自洽两支**分面计数**（承 `#1720` 覆盖面基线）：①注↔字段（HP/AC）②用例名↔断言。
 * 分开计的理由：#1734 的静默降格只发生在②（标题自由度）——若共用计数，①的增补会掩盖②的下降。 */
let selfCmpTotal = 0, selfCmpChecked = 0, titleTotal = 0, titleChecked = 0;
const uncovered = [];
let cmp5e = 0, cmp3e = 0, cmpD20M = 0;   // A 组比对按源格式分计（验收 4）；S3-⑤：d20m 单列，不并入 5E
const noValueCites = [];    // 引用解析成功但抽不到可比值（静默 0 覆盖 ⇒ 须可见）
const d20mResolved = [];    // S3-④：d20m 面解析成功的引用（tier-① 已核；值级显式降级 ⇒ 须打出声）
const uncoveredCand = [];   // 未覆盖**候选**（按行收集，输出前按「文件+键」聚合，见下）
/* 声称方位集：键＝`${rel}|${blockKey}`，**blockKey = 最近的「声称载体」起始行**
 *   （JS：含 `/*` 的注释块起始行 或 `test(` 行；找不到则 0）。
 *   粒度为何取「块」而非「文件」：本仓引用形约定是「**一处引用覆盖其下紧邻的一组同源数值**」
 *   （`README.md`「规则来源」§三 第 3 条「落在最近的声明点」）——故同一块声称过的键，
 *   不应对**别的块**登记未覆盖；取文件级会跨块抑制（`#1735` D 席 NIT-2 指出）。 */
function blockKeyOf(lines, idx) {
  for (let j = idx; j >= 0; j--) {
    if (/^\s*\/\*/.test(lines[j]) || /^\s*test\(\s*'/.test(lines[j])) return j + 1;
  }
  return 0;
}
const claimedKeysByBlock = new Map();
let cGroupChecked = 0;                  // **受检**条数（分母；✗ 不含显式跳过者）
const cGroupSkipped = [];               // 显式跳过者（`cCheck:false`）——须**可见**，✗ 静默从分母消失
const mappingHit = new Set();

function sourceValues(cachePath, entry) {
  const out = {};
  const ls = fs.readFileSync(cachePath, 'utf8').split('\n');
  const nums = String(entry ?? '').split(/[-–/]/).map(Number).filter(Number.isFinite);
  if (nums.length === 0) return out;
  const lo = Math.max(1, Math.min(...nums));
  let hi = Math.min(Math.max(...nums), ls.length);
  /* 引用指向**条目标题行**时（如 `## Goblin`，值在下方「Abilities:」行）：向下**限量**延伸扫窗，
   * 上限 BLOCK_WINDOW 行且遇下一标题行即止。
   * 必要性：否则该引用**静默抽不到任何值**（0 次比对、连「未覆盖」也不产生）。
   * 限量而非「扫到块尾」：3E 源为整本 dump，块尾可能远在数百行外 ⇒ 会吃到别的条目（实测：无限扫窗
   * 使未覆盖从 1 项涨到 120 项并误红）。 */
  if (/^#{1,6}\s/.test(ls[lo - 1] ?? '')) {
    /* 只对**条目标题行**引用延伸扫窗（上限 BLOCK_WINDOW、遇下一标题行即止）。
     * 必要性：`## Goblin` 这类引用若只扫本行，会**静默抽不到值**（0 比对且无记账）。
     * 为何不推广到「单行引用一律延伸」：实测在合入 #1724 的树上会**误红**（41/42，35 项未覆盖）
     * —— 40 行扫窗会吃到相邻条目的值；宁可让这类引用进入「引用无可抽取值」**记账可见**。 */
    const cap = Math.min(lo + BLOCK_WINDOW, ls.length);
    for (let i = hi + 1; i <= cap; i++) {
      if (/^#{1,6}\s/.test(ls[i - 1])) break;
      hi = i;
    }
  }
  for (let i = lo; i <= hi; i++) {
    for (const [k, res] of Object.entries(SRC_VAL_RES)) {
      if (out[k] !== undefined) continue;
      for (const re of res) {                       // 多形并列：5E 形优先，其次 3E 形
        const m = re.exec(ls[i - 1]);
        if (m) { out[k] = { v: Number(m[1]), line: i }; break; }
      }
    }
  }
  /* 5E：属性三连单元格（可跨行）—— 取调整列，并自检 floor((score−10)/2) */
  const slice = norm(ls.slice(lo - 1, hi).join('\n'));
  for (const m of slice.matchAll(RE_ABILITY_5E)) {
    const key = m[1]; const score = Number(m[2]); const mod = Number(m[3]);
    const line = lo + slice.slice(0, m.index).split('\n').length - 1;
    if (abilMod(score) !== mod) {
      red(`门内自检：源属性调整列与公式不符（${path.basename(cachePath)}:${line} ${key} 原始 ${score} ⇒ 公式 ${abilMod(score)}，源列 ${mod}）—— 源格式或本门解析需复核`);
      continue;
    }
    if (out[key] === undefined) out[key] = { v: mod, line, score };
  }
  /* 3E：单行 `| Abilities: | Str 11, ... |` —— 取原始分并按同一公式换算 */
  for (let i = lo; i <= hi; i++) {
    if (!RE_ABILITY_3E_LINE.test(ls[i - 1])) continue;
    for (const m of norm(ls[i - 1]).matchAll(RE_ABILITY_3E_PAIR)) {
      const key = m[1].toUpperCase();
      if (out[key] === undefined) out[key] = { v: abilMod(Number(m[2])), line: i, score: Number(m[2]) };
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
    /* `同上 :N` 行本身不含「SRD/对齐」字样，但它是**值声称的延续** ⇒ 也须入门（#1725：
     *  否则该行的属性/AC 值只靠用例名偶然覆盖，改动它门不红 —— writer NIT-2 的根因）。 */
    if (!RE_CLAIM.test(text) && !RE_SAME_AS_ABOVE.test(text)) continue;
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
        const rec = { ...c, at, face, row, cachePath: path.join(CACHE_DIR, cacheNameFor(row)) };
        resolved.push(rec);
        if (face === 'd20m') d20mResolved.push(rec);
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
      selfCheck++; selfCmpTotal++;
      if (Number(m[1]) !== Number(claimed)) red(`值自洽不符：${at} 注称 ${label}=${claimed}，同行 ${field}: ${m[1]}`);
      else { selfChecked++; selfCmpChecked++; }
    };
    for (const m of text.matchAll(/HP\s+(\d+)/g)) selfCmp('HP', m[1], 'hp');
    for (const m of text.matchAll(/AC\s+(\d+)/g)) selfCmp('AC', m[1], 'ac');

    /* C'. 用例名内数值 ↔ 紧随断言 */
    const tm = text.match(/test\(\s*'[^']*对齐\s*SRD[^']*（([^）]*)）/);
    const titlePairs = {};
    if (tm) {
      const body = lines.slice(i + 1, i + 12).join('\n');
      for (const [, key, val] of tm[1].matchAll(/(AC|HP|STR|DEX|CON|INT|WIS|CHA)\s+(-?\d+)/g)) {
        /* 字段映射**同时容纳两代模型**（#1734 甲案）：调整值（`str_mod`，`#1724` 前）与
         * 原始分（`str`，`#1724` 起）。此前只认 `*_mod` ⇒ 标题若载**原始分**（`STR 8`）必红，
         * 作者只能把值从标题删掉 ⇒ 该支校验面**静默缩小**（值自洽 9→8）——门推动信息减少。
         * 两列同查的误配风险：需存在 `assert.eq(…str_mod, 8)` 这类**跨域断言**才会误绿，
         * 而 `*_mod` 在 1..20 原始分域内不会取到 8 ⇒ 实际不可达（下方另有读数分列可查）。 */
        const fields = {
          AC: ['ac'], HP: ['maxHp', 'hp'],
          STR: ['str_mod', 'str'], DEX: ['dex_mod', 'dex'], CON: ['con_mod', 'con'],
          INT: ['int_mod', 'int'], WIS: ['wis_mod', 'wis'], CHA: ['cha_mod', 'cha'],
        }[key];
        titlePairs[key] = Number(val);
        selfCheck++; titleTotal++;
        if (fields.some((fl) => new RegExp(`assert\\.eq\\([^,]*\\.${fl}\\s*,\\s*${val}\\b`).test(body))) { selfChecked++; titleChecked++; }
        else red(`用例名数值无对应断言：${at} 声称 ${key} ${val}，其后 12 行内无 assert.eq(…${fields.join('|')}…, ${val})`);
      }
    }

    /* ---------- tier-②：A 组 源值比对 + C 组 映射校验 ---------- */
    /* 「同上 :N」（#1722 writer NIT-2）：本行只有行号、无完整引用 ⇒ 沿用最近一次完整引用的**出处文件**，
     *  但**行号取本行自己写的**（`同上 :7279/7283/7287`）——否则属性值会抽错区间而静默漏比。 */
    const sameAsAbove = resolved.length === 0 && RE_SAME_AS_ABOVE.test(text) && lastResolved.length > 0;
    let effResolved = resolved.length > 0
      ? resolved
      : (sameAsAbove
        ? lastResolved
        : (i - lastCitationIdx <= CITATION_LOOKBACK && /test\(\s*'/.test(text) ? lastResolved : []));
    if (sameAsAbove) {
      const nM = text.match(/同上\s*[:：]\s*([0-9][0-9/\-–]*)/);
      if (nM) effResolved = lastResolved.map((r) => ({ ...r, entry: nM[1] }));
    }
    if (effResolved.length > 0) {
      // C 组：本条是否为映射表声明的引用点？
      const mapHit = nameMap.find((e) => `${e.claim}` === at);
      /* ②（#1766 领队裁定甲）：**显式跳过**者（`cCheck:false`）不进分母 —— 否则「已核 N/M」里的 M
       *   会把「根本没受检」的条目算作已覆盖（跳过前提下照样印 3/3 ⇒ 该计数**高估**覆盖）。
       *   跳过**不是**豁免：条目名与理由仍须登记在 `name-map.json`，且此处**出声**留痕。 */
      if (mapHit?.cCheck === false) {
        cGroupSkipped.push(`${mapHit.source?.entry ?? '?'}（${mapHit.source?.file ?? '?'}）`);
        mapHit.skip = true;
      }
      if (mapHit && !mapHit.skip && effResolved.length > 1) red(`映射校验歧义：${at} 同时解析到 ${effResolved.length} 条引用，C 组无法判定应对哪一条（请拆行）`);
      if (mapHit && !mapHit.skip) {
        /* ①（#1766 领队裁定甲）：条目**前缀放宽为 `#{2,6}`** —— 各源文件的条目标题层级不统一：
         *   5E `rules-glossary.md` 用 h4（`#### Blinded [Condition]`）、`monsters-A-Z.md` 用 h3（`### Goblin`），
         *   而 3E `Monsters - Animals.md` 用 **h2**（`## Lizard, Monitor`）⇒ 原硬编码 `### ` 对 3E 面**必假红**。
         *   放宽只影响**前缀层级**，✗ 不放宽条目名本身 ⇒ 仍精确要求「所引源行确为该条目名」。 */
        const wantExact = mapHit.source.entry;
        const r0 = resolved[0];
        const nums = String(r0.entry).split(/[-–/]/).map(Number).filter(Number.isFinite);
        const ls = fs.readFileSync(r0.cachePath, 'utf8').split('\n');
        const hit = nums.some((n) => new RegExp(`^#{2,6}\\s+${wantExact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
          .test((ls[n - 1] ?? '').trim()));
        cGroupChecked++;
        if (hit) mappingHit.add(mapHit.source.entry);
        else red(`映射校验不符（C 组）：${at} 声明源条目「${mapHit.source.entry}」，但所引源行未见 \`#{2,6} ${mapHit.source.entry}\``);
      }
      // A 组：源值 vs 仓内值
      if (findEx(rel, raw, 'value') >= 0) {
        exemptValue++;                                  // B 组整组豁免（逐位置）
      } else {
        /* ---- 声称侧枚举（#1725）----
         *  「分母」由**声称侧**决定：本行注释／用例名／用例体内**确实写出**的值才算一项。
         *  这封住 #1722 writer 的 MAJOR：旧实现「仓内该行没给字段 ⇒ continue」会让分母静默缩小
         *  （探针：删掉注释行的 `hp: 7,` 而保留「HP 7」 ⇒ 6/6 变 5/5、门仍绿）。
         *  现在「仓内字段缺、但声称写了值」仍与源比对（取声称值）；**源有值而本行未声称**者
         *  进入「未覆盖」记账并在读数行打印（甲）。 */
        const claimed = {};      // 调整值口径
        const claimedRaw = {};   // 原始分口径
        /* 大小写不敏感（/i）：3E 源的 Abilities 惯用 Title case（`Str 11, Dex 13`），
         * 而 5E HTML 表用大写（`STR`）—— 两者都是同一事实的写法。此前只认大写 ⇒
         * **同一行写了值却不被当作声称**：既漏核，又给「未覆盖」添噪声（#1724 复核实测）。 */
        for (const m of text.matchAll(/\b(STR|DEX|CON|INT|WIS|CHA)\b\s+(\d+)\s*[（(](-?\d+)[）)]/gi)) {
          const k = m[1].toUpperCase();
          claimedRaw[k] = Number(m[2]); claimed[k] = Number(m[3]);
        }
        /* 纯原始分写法 `Str 11`：**只排除「紧接带数字的括号」**（那是调整值写法 `STR 8（−1）`，已由上一式处理）；
         * 原先排除了**任何** `（`，于是 `CON 12（其余三项 +0）` 这类注释被漏认 ⇒ 该键既不核也比不出未覆盖（静默）。 */
        for (const m of text.matchAll(/\b(STR|DEX|CON|INT|WIS|CHA)\b\s+(\d+)(?!\s*[（(]\s*-?\d)/gi)) {
          const k = m[1].toUpperCase();
          if (claimedRaw[k] === undefined) claimedRaw[k] = Number(m[2]);
        }
        for (const m of text.matchAll(/\b(HP|AC)\s+(\d+)/g)) claimed[m[1]] = Number(m[2]);
        const bKey = `${rel}|${blockKeyOf(lines, i)}`;
        const blockClaims = claimedKeysByBlock.get(bKey) ?? new Set();
        for (const k of [...Object.keys(claimed), ...Object.keys(claimedRaw), ...Object.keys(titlePairs)]) blockClaims.add(k);
        claimedKeysByBlock.set(bKey, blockClaims);
        for (const k of ABIL_KEYS) if (titlePairs[k] !== undefined) claimed[k] = titlePairs[k];
        if (titlePairs.HP !== undefined) claimed.HP = titlePairs.HP;
        if (titlePairs.AC !== undefined) claimed.AC = titlePairs.AC;
        /* 用例体内的直接断言也是「声称」；窗口**不得跨用例**（遇下一处 `test(` 即截断），
         * 否则会吃进后续用例的断言 ⇒ 声称被高估、未覆盖被误判为已覆盖（#1724 复核实测）。 */
        const bodyLines = [];
        for (let j = i + 1; j < lines.length && bodyLines.length < 12; j++) {
          if (/^\s*test\(\s*'/.test(lines[j])) break;
          bodyLines.push(lines[j]);
        }
        const body = bodyLines.join('\n');
        for (const k of ABIL_KEYS) {
          const am = body.match(new RegExp(`assert\\.eq\\([^,]*\\.${ABIL_FIELD[k]}\\s*,\\s*(-?\\d+)`));
          if (am) claimed[k] = Number(am[1]);
          const ar = body.match(new RegExp(`assert\\.eq\\([^,]*\\.${k.toLowerCase()}\\s*,\\s*(-?\\d+)`));   // 原始分断言（#1724）
          if (ar) claimedRaw[k] = Number(ar[1]);
        }
        for (const [k, fl] of [['HP', '(?:maxHp|hp)'], ['AC', 'ac']]) {
          const am = body.match(new RegExp(`assert\\.eq\\([^,]*\\.${fl}\\s*,\\s*(\\d+)`));
          if (am) claimed[k] = Number(am[1]);
        }
        for (const r of effResolved) {
          const src = sourceValues(r.cachePath, r.entry);
          const hasClaims = Object.keys(claimed).length > 0 || Object.keys(claimedRaw).length > 0
            || Object.keys(titlePairs).length > 0;
          /* d20m 面**不入** noValueCites（S3-④ 显式降级：该面无值解析器 ⇒「抽不到值」是**预期**
           *   而非缺口，计入会污染 5E/3E 的记账面并超 ceiling）。该面 0 次值比对已由降级行出声。 */
          if (r.face === 'd20m') continue;
          if (hasClaims && Object.keys(src).length === 0) noValueCites.push(`${at} → ${path.basename(r.cachePath)}:${r.entry}`);
          const repoVals = {};
          const hpm = text.match(/hp\s*:\s*(\d+)/); if (hpm) repoVals.HP = Number(hpm[1]);
          const acm = text.match(/ac\s*:\s*(\d+)/); if (acm) repoVals.AC = Number(acm[1]);
          const repoRaw = {}, repoMod = {};
          for (const k of ABIL_KEYS) {
            const mm = text.match(new RegExp(`${ABIL_FIELD[k]}\\s*:\\s*(-?\\d+)`));      // 旧形态 `str_mod:`
            if (mm) repoMod[k] = Number(mm[1]);
            const rm = text.match(new RegExp(`\\b${k.toLowerCase()}\\s*:\\s*(-?\\d+)`)); // 新形态 `str:`（#1724 原始分）
            if (rm) repoRaw[k] = Number(rm[1]);
          }
          for (const k of Object.keys(src)) {
            const isAbil = ABIL_KEYS.includes(k);
            let rv, sv, unit;
            /* 优先级（关键）：**仓内侧证据优先于声称侧**，且按各自形态对源比 ——
             *   ① 仓内有原始分 ⇒ 与源的原始分比；② 否则仓内有调整值 ⇒ 与源的调整值比；
             *   ③ 都没有（纯注释行）⇒ 才用声称值。
             * 不能让「声称里的原始分」越过「仓内的调整值」：否则改 `dex_mod` 而注释仍写 `DEX 15`
             * 时，会拿声称的 15 去比源的 15 ⇒ **漏检**（K10 实测：曾因此由红转绿）。 */
            if (isAbil && src[k].score !== undefined && repoRaw[k] !== undefined) {
              rv = repoRaw[k]; sv = src[k].score; unit = '原始分';
            } else if (isAbil && repoMod[k] !== undefined) {
              rv = repoMod[k]; sv = src[k].v; unit = '调整值';
            } else if (isAbil && src[k].score !== undefined && claimedRaw[k] !== undefined) {
              rv = claimedRaw[k]; sv = src[k].score; unit = '原始分（声称）';
            } else if (isAbil && claimed[k] !== undefined) {
              rv = claimed[k]; sv = src[k].v; unit = '调整值（声称）';
            } else if (!isAbil) {
              /* HP/AC：仓内字段（或用例名 titlePairs 已并入 claimed）优先，缺则用声称值 */
              if (repoVals[k] !== undefined) { rv = repoVals[k]; sv = src[k].v; unit = ''; }
              else if (claimed[k] !== undefined) { rv = claimed[k]; sv = src[k].v; unit = '（声称）'; }
            }
            if (rv === undefined) {
              /* 纯引用行（未声称任何值）不记账 —— 其值由**同块的相邻行**承载（如 `stats:` 行）；
               * 只有「本行声称了一部分、源还有其余」才是真缺口（作者枚举不全）。 */
              const hasClaims = Object.keys(claimed).length > 0 || Object.keys(claimedRaw).length > 0
                || Object.keys(titlePairs).length > 0;
              /* 该块若有**权威的 house rule 声明** ⇒ 属「已声明偏离」，不登记未覆盖
               *   （`README.md`「规则来源」§三 第 5 条：无源条目须当 house rule 并写明）。
               *   只认权威短语 `house rule`（`RE_CLAIM` 已含），**不扩同义词**——否则又造第二入口（领队裁 ③）。 */
              let bStart = blockKeyOf(lines, i) - 1;
              /* 若块以 `test(` 开头，**向上并入紧邻的注释块**：`house rule` 声明惯写在其上
               *   （实测 `stats.test.js:37-38` 是注释、`:39` 才是 `test(`）⇒ 不并入会漏声明。 */
              while (/^\s*test\(\s*'/.test(lines[bStart] ?? '') && bStart > 0
                     && /^\s*(\*|\/\*|\*\/)/.test(lines[bStart - 1])) {
                bStart--;
              }
              /* 块文本取到**块的末尾**而非「声称行」为止：多行注释块里，`house rule` 声明常写在
               * 声称行**之后**的一行（实测 `stats.test.js:37` 声称、`:38` 声明）⇒ 只取到声称行会漏。 */
              let bEnd = i;
              if (/^\s*\/\*/.test(lines[bStart] ?? '')) {
                for (let k = i; k < lines.length; k++) { bEnd = k; if (/\*\//.test(lines[k])) break; }
              } else {
                for (let k = i; k < lines.length; k++) {
                  bEnd = k;
                  if (/^\s*\}\);?\s*$/.test(lines[k])) break;
                  if (k > i && /^\s*test\(\s*'/.test(lines[k])) { bEnd = k - 1; break; }
                }
              }
              const blockText = lines.slice(Math.max(0, bStart), bEnd + 1).join('\n');
              const declared = /house\s*rule/i.test(blockText);
              if (hasClaims && !declared) uncoveredCand.push({ file: rel, key: k, at, src: src[k], cache: path.basename(r.cachePath), block: `${rel}|${blockKeyOf(lines, i)}` });
              continue;
            }
            valueCompared++;
            /* S3-⑤：d20m 面单列（✗ 并入 5E —— 否则 d20m 的比对量会污染 5E 读数桶） */
            if (r.face === '3E') cmp3e++; else if (r.face === 'd20m') cmpD20M++; else cmp5e++;
            if (sv === rv) valueChecked++;
            else red(`源值比对不符（A 组）：${at} ${k} ${unit} 仓内/声称=${rv} 源=${sv}（${path.basename(r.cachePath)}:${src[k].line}）`);
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
/* ② 口径：「已核 N/受检 M」——M **不含**显式跳过者（`cCheck:false`），且跳过者单列出声。
 *   （原式为 `/${nameMap.length}`：把跳过者也计入分母 ⇒ 覆盖数被**高估**。） */
console.log(`  tier-②：A 组源值比对 已核 ${valueChecked}/${valueCompared}（分母=**声称侧**可比对项）`
  + `｜C 组映射 已核 ${mappingHit.size}/受检 ${cGroupChecked}`
  + (cGroupSkipped.length > 0 ? `（跳过 ${cGroupSkipped.length}：${cGroupSkipped.join('、')}——条目与理由仍在映射表，✗ 非豁免）` : '')
  + `（命中条目 ${[...mappingHit].join('、') || '-'}）`);
console.log(`            按源格式：5E 调整列 ${cmp5e} 次 ＋ 3E 原始分换算 ${cmp3e} 次 ＋ d20M ${cmpD20M} 次（tier-① 显式降级，见下）`);
/* S3-④（领队裁定：降级）：d20m 源无值级解析器 ⇒ **显式**声明，✗ 静默不核。
 *   理由：MSRD 属性值主要内嵌 markdown 表格行（`|Colossal|44|32d10|120|47|6|—|…`），
 *   单元格用 `—` 表「不适用」且有 `Str*`/`Str**` 变体 ⇒ 落解析器须发现表头行语义、
 *   与既有 5E/3E 两套并立第三套，成本/风险不成比例（门按**拦截价值**取舍）。
 *   仍在防的：pin 行 sha1/行数（第①级）＋ 该面引用可解析性。可逆：30–49 内容真落码需值核时再议。 */
/* d20m 值解析器未落 ⇒ 该面 A 组比对恒 0；此处**显式打出声**（✗ 静默不核）。
 *   领队裁定三理由：①门禁时长约束＋「门按拦截价值取舍」②tier-① 的 pin sha1/行数校验仍在，
 *   防的是假绿窗口（已闭合）而非值级 ③30–49 真落码需值核时（M3+）再议 —— 降级可逆。 */
const d20mRefs = d20mResolved;
console.log(`  tier-② 显式降级：d20m 面**值级对源未覆盖**（tier-① 引用形＋pin 完整性仍在核）｜`
  + `d20m 引用 ${d20mRefs.length} 处均已按 tier-① 核 ｜ A 组比对 0 次（MSRD 值解析器未落：源为表格行＋破折号占位，三套解析器并立不成比例）`
  + `｜${VERBOSE ? 'verbose=on' : '--verbose 可见明细'}`);
/* verbose 明细：**可抽验面** —— 「${d20mRefs.length} 处已核」必须打得出来是**哪 22 处**（tester-4 判别性验证）。
 * ★计数口径（**实测，非推断**；writer-2 复核后订正——我首版两条因果在实仓均不成立）：
 *   门报的 ${d20mRefs.length} = **引用形**（`SRD d20M · <文件>.md:<行>`）**解析成功条数**。
 *   仓内 `grep -rn 'SRD d20M' src/dnd/d20m tests/unit/d20m` ⇒ **28 行／28 次**（＝无一行含两处）。
 *   差额 6 处 = **测试名里的散文提及**（形如 `test('…对齐 SRD d20M，加值再高也不命中')`）——
 *   **非引用形**；其引用由**上方注行继承**（`lastCitationIdx`，lookback 3）⇒ **计入 claim、不计入引用**。
 *   该 6 处 = chargen:15／combat:47,80,94／items:10／stats:34。
 *   ★其中 `tests/unit/d20m/stats.test.js:34` 是**诱饵**：`…对齐 SRD d20M · Armature(Small)…` ——
 *   **形似引用形却不是 `.md` 引用**（这也是「23 行含 `SRD d20M ·` 但只有 22 处被核」的原因）。 */

if (VERBOSE) for (const c of d20mRefs) console.log(`    · ${c.at} → SRD d20M · ${c.file}:${c.entry}（tier-① 已核）`);
if (noValueCites.length > 0) {
  console.log(`  第①级/A 组：**引用无可抽取值** ${noValueCites.length} 处（引用区间/块内未解析出 HP/AC/属性 ⇒ 静默 0 覆盖，记账可见）：`);
  for (const c of noValueCites) console.log(`    · ${c}`);
}
/* 聚合（README §三.3 的粒度＝块）：同一文件内**任一**行声称过该键 ⇒ 不算未覆盖；
 * 并按「文件+键」去重。理由：本仓引用形是「一条引用覆盖其下同源一组值」，
 * 若按行计，逐条断言的用例会机械放大（实测 3E 六维 × 6 条断言 = 30 项噪声）。 */
const seenUc = new Set();
for (const c of uncoveredCand) {
  /* 去重键用 **`${file}|${key}`**，判定用**块**（`claimedKeysByBlock`）——
   * 两者职责不同（D 席 `developer-9` 在 `#1738` 的 NIT-A）：
   *   判定取块：同一文件内**别的块**声称过该键，不抑制本块的登记；
   *   去重取文件+键：同一键在同文件内可能因「注释块起始行 ≠ test 行」落到两个 blockKey
   *   （实测 `stats.test.js` 的 `:37` 注释块与 `:39` test 行），若按块去重会把**同一事实登记两次**
   *   ⇒ 记账被虚高、ceiling 被锁在虚高值上，**后续真实增长反而被掩盖**（恰是本票要防问题的镜像）。 */
  /* 判定用**块**、去重用 **`${file}|${key}`**（D 席 `#1738` NIT-A 指定）：
   *   · 判定取块：别的块声称过该键，不抑制本块的登记；
   *   · 去重取文件+键：拦掉「同文件内同键落到两个 blockKey」的重复
   *     （实测 `stats.test.js` 的 `:37` 注释块与 `:39` test 行正是此形 ⇒ 曾虚高登记两次）。
   *   注：「源有值而仓内不声称」在**源值面**的真信号数是 2（Guard 的 AC 16／HP 11）；
   *   本条按**仓内位置**去重 ⇒ 同一源值被**两个文件**引用时各记一次（详见 PR 评论的实测）。 */
  const tag = `${c.file}|${c.key}`;
  if (seenUc.has(tag)) continue;
  if (claimedKeysByBlock.get(c.block)?.has(c.key)) continue;
  seenUc.add(tag);
  const where = c.block.endsWith('|0') ? '该文件（无块归属）' : '该块';
  uncovered.push(`${c.at} ${c.file}｜${c.key}（源=${c.src.v}@${c.cache}:${c.src.line}，${where}未声称该键）`);
}
if (uncovered.length > 0) {
  console.log(`  tier-②：A 组**未覆盖** ${uncovered.length} 项（源有值、本行/用例未声称 ⇒ 记账不红，防分母静默缩小）：`);
  for (const u of uncovered) console.log(`    · ${u}`);
} else {
  console.log('  tier-②：A 组未覆盖 0 项（源有值者皆已被声称并比对）');
}
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
/* ---------- 覆盖面基线（#1720）：下限（覆盖面）+ 上限（记账面） ---------- */
const faces = {
  claims, sourceLineClaims,
  aGroupCompared: valueCompared, aGroupChecked: valueChecked, cGroupChecked,
  selfCmpChecked,        // 值自洽①注↔字段
  titleChecked,          // 值自洽②用例名↔断言（#1734 的面）
  sourceFormats5e: cmp5e, sourceFormats3e: cmp3e,
};
const ceilings = { uncovered: uncovered.length, noValueCites: noValueCites.length };

if (UPDATE_BASELINE) {
  /* `seededAt` 的**口径**（#1789）：＝「本次校准所对的**主干** sha」，✗ 不是跑时 HEAD。
   *   ① `--seeded-at <sha>` 显式指定（优先）；
   *   ② 否则取 **`merge-base origin/main HEAD`**（在分支上跑也得到主干 sha —— 原实现取 HEAD
   *      会把**分支头**写进去，靠人工回退对齐，属「口径靠人不靠工具」）；
   *   ③ 取不到（非 git／无 origin/main）⇒ `unknown` 并**出声**警告（✗ 静默写坏值）。 */
  let sha = arg('--seeded-at');
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', '--short=8', execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: ROOT }).toString().trim()], { cwd: ROOT }).toString().trim();
    } catch {
      sha = 'unknown';
      console.warn('  ⚠ 无法取主干 merge-base（非 git 仓或未取 origin/main）⇒ seededAt 落 `unknown`；请用 `--seeded-at <主干sha>` 显式指定');
    }
  }
  /* 注：默认路径用 **`--short=8`**（✗ 裸 `--short`）—— 后者位数由 git 按**仓库规模**动态决定
   *   （小仓给 7 位），与仓内 `seededAt` 的历史值（**8 位**：`163c749c`／`4f1ea4c2`）**不同口径** ⇒
   *   每次重播都会产生「`163c749c` → `163c749`」这种**无意义 diff**（#1790 tester-4 的 ②，本席采其倾向）。
   *   `--seeded-at` 传入者仍**逐字生效**（K19 守）。 */
  /* ★保留既有的**人工说明**（#1789 dev-9 的 B 面）：写入构造原先只含 `$note/seededAt/faces/ceilings`
   *   ⇒ **抹掉 `seededReason` 且不报错、全绿**（门不读该键）。而 `$note` 自己写着「合入者须解释
   *   『为什么少了这一项』」——`seededReason` 正是承载该解释的字段 ⇒ 工具每次运行都吃掉机制要求的证据。
   *   ⇒ ① 保留旧 `$note`（若有人改过文案，✗ 被硬编码覆盖）②**保留旧 `seededReason` 原样**
   *     （工具**无法**判断「本笔是否该收缩」⇒ 只保留并**提示**人工复核，✗ 自行清空或改写）。 */
  const prev = (() => { try { return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); } catch { return {}; } })();
  const DEFAULT_NOTE = '覆盖面基线（#1720）：faces＝**下限**（低于即红），ceilings＝**上限**（高于即红）。'
    + '**更新方式（#1789 口径校正）**：`--update-baseline`（仅人工，CI 绝不调用）重播计数面；'
    + '`--seeded-at <主干sha>` 显式指定校准所对的主干（缺省取 `merge-base origin/main HEAD`）；'
    + '`seededReason` **由人工撰写**（工具只**保留**、✗ 不生成也不清除）。'
    + '基线变更会出现在 PR diff 里，合入者须解释「为什么少了这一项」。';
  const out = { $note: prev.$note ?? DEFAULT_NOTE, seededAt: sha };
  if (prev.seededReason !== undefined) {
    out.seededReason = prev.seededReason;
    console.log(`  ⓘ 已保留既有 seededReason（${String(prev.seededReason).length} 字符）——请人工复核其是否仍准确（若本笔为**收缩**，须一并更新该说明）`);
  }
  out.faces = faces; out.ceilings = ceilings;
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`已播种覆盖面基线：${path.relative(ROOT, BASELINE_FILE)}（seededAt=${sha}）`);
  for (const [k, v] of Object.entries(faces)) console.log(`  faces.${k} = ${v}`);
  for (const [k, v] of Object.entries(ceilings)) console.log(`  ceilings.${k} = ${v}`);
  process.exit(0);
}

let baseOk = true;
if (!fs.existsSync(BASELINE_FILE)) {
  red(`覆盖面基线缺失：${path.relative(ROOT, BASELINE_FILE)}（须入库；缺失**显式红**，不静默跳过）⇒ 人工播种：node tests/gates/refs-integrity.mjs --update-baseline`);
  baseOk = false;
} else {
  let base = null;
  try { base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); }
  catch (e) { red(`覆盖面基线解析失败：${e.message}`); baseOk = false; }
  if (base) {
    const drops = [], overs = [];
    for (const [k, want] of Object.entries(base.faces ?? {})) {
      const got = faces[k];
      if (got === undefined) { red(`基线含未知面「${k}」（门已改名？请 --update-baseline 重播）`); baseOk = false; continue; }
      if (got < want) { drops.push(`${k} ${want}→${got}（-${want - got}）`); baseOk = false; }
    }
    for (const [k, cap] of Object.entries(base.ceilings ?? {})) {
      const got = ceilings[k];
      if (got !== undefined && got > cap) { overs.push(`${k} ${cap}→${got}（+${got - cap}）`); baseOk = false; }
    }
    if (drops.length > 0) red(`覆盖面下降（低于基线 ⇒ 门推动信息减少）：${drops.join('；')} ⇒ 若为有意收缩，须人工 --update-baseline 并在 PR 里说明理由`);
    if (overs.length > 0) red(`记账面增长超上限（「源有值而仓内不声称」的面在扩大）：${overs.join('；')}`);
    console.log(`  覆盖面基线对账（seededAt=${base.seededAt ?? '?'}）：${baseOk ? '✓ 逐面无下降、无超限' : '✗ 见下'}`);
    /* ★「绿但钝」巡检（#1782 writer 报的机制盲区；本席实测复现）：
     *   下限是**棘轮**——真实值远高于基线时，门**照旧绿**，但**下探类判据已丧失去判别力**
     *   （#1782 实证：titleChecked 基线 8、真实 28 ⇒ K16 删一值只降到 27（≥8）⇒ **门绿而自检红**）。
     *   ⇒ 故此处**主动打出声**：凡真实值**显著高于**基线的面（>1.25× 且差额 ≥5）即列出，
     *     提示「本笔新增了大量声称 ⇒ 请 `--update-baseline` 重播并复跑自检」。
     *   ✗ 不 red（那是**自检**的职责：`refs-integrity.selftest.mjs` 的 K16 会红）；此处只让它**可见**，
     *     因为「钝化」是**读数**而非错误——把它做成红会误伤「本笔确实是大幅新增」的正当情形。 */
    const slack = [];
    for (const [k, want] of Object.entries(base.faces ?? {})) {
      const got = faces[k];
      if (want > 0 && got > want * 1.25 && got - want >= 5) slack.push(`${k} 真实 ${got} / 基线 ${want}（+${got - want}，>1.25×）`);
    }
    if (slack.length > 0) {
      console.log(`  ⚠ 「绿但钝」巡检：${slack.length} 个面**真实值远高于基线下限** ⇒ 下探类判据可能已丧失去判别力：`);
      for (const s of slack) console.log(`    · ${s}`);
      console.log('    ⇒ 请 `node tests/gates/refs-integrity.mjs --update-baseline` 重播基线，并**复跑自检**（`refs-integrity.selftest.mjs`）确认刀仍如期。');
    }
    console.log(`    faces：${Object.entries(faces).map(([k, v]) => `${k} ${v}/${base.faces?.[k] ?? '-'}`).join('｜')}`);
    console.log(`    ceilings：${Object.entries(ceilings).map(([k, v]) => `${k} ${v}/${base.ceilings?.[k] ?? '-'}`).join('｜')}`);
  }
}

if (problems.length > 0) {
  console.log('\n✗ 门红：');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\n✓ 门绿');
process.exit(0);
