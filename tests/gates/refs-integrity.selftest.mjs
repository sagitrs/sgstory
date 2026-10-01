/* 门的可假刀自检（#1714 判据 3 + tier-② 验收刀）——证明这道门**会红**，而不是只会印绿。
 *
 * 每刀在**独立临时副本**上施加，互不污染；原件不动。
 *   K0  洁净副本                                        ⇒ 期望绿（证明门不是恒红）
 *   K1  删一处引用（测试名上方的出处注整行）             ⇒ 期望红（引用形门）
 *   K2  抹掉引用里的版本号（`SRD 5.2.1 · …` → `SRD · …`）⇒ 期望红（README §三.2 必带版本）
 *   K3  改 pin 表 sha1 末位                              ⇒ 期望红（证明门真校验哈希）
 *   K4  改仓内一值（hp 7→8，注仍称 HP 7）                ⇒ 期望红（值自洽，第①级）
 *   K4b 改仓内一值 **且注释同步改**（hp 7→8 ∧ 注 HP 8）   ⇒ 期望红（**tier-② 验收刀**：一致地写错也要抓）
 *   K5  伪造来源声明行（形态对、pin 表无此 repo×版本×commit）⇒ 期望红（NIT-1 的第 6 刀）
 *   K6  引用行号越界（:7257 → :99999）                   ⇒ 期望红
 *   K7  3E 引用抹掉目录（跨面同名 equipment.md）          ⇒ 期望红（NIT-2）
 *   K8  改**缓存源值** + 同步改 pin 表 sha1（B 门先绿）    ⇒ 期望红，且**红来自 A 组值比对**（K8 修形法 (i)）
 *   K9  映射表写错条目名（Goblin Minion → Goblin Warrior）⇒ 期望红（C 组）
 *
 * 用法：node tests/gates/refs-integrity.selftest.mjs        （退出码：全如期 0；有偏差 1）
 *
 * ⚠️ **刀必须自带非空 `apply`**：`makeCopy()` 拷贝含 `tests/gates/**` ⇒ 沙箱内会连同
 *    「被回退/被改的门」一起跑。空 `apply` 的刀，其场景在沙箱里 **从不出现** ⇒ 恒绿、给出假验收信号
 *    （D 席 `developer-9` 在 `#1735` 的 NIT-1 实测：把 fields 回退为只认 `*_mod` 时 K12 仍绿）。
 * 刀数随 knives 数组自动增减（输出行取 knives.length）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const GATE = path.join(ROOT, 'tests', 'gates', 'refs-integrity.mjs');
const COPY = ['README.md', 'src', 'tests'];

function makeCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-gate-selftest-'));
  for (const item of COPY) {
    const src = path.join(ROOT, item);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dir, item), { recursive: true });
  }
  return dir;
}
/** ★`#1840`：**幂等清理**（✗ 裸 `rmSync` 一次了事）。
 *   病灶：`makeGitSandbox()` 里跑真 `git`（`init`／`commit`）—— git 可能留下**后台写手**
 *   （`gc --auto`／maintenance）在命令**返回之后**仍往 `.git` 里写 ⇒ 紧随其后的 `rmSync` 撞上
 *   `ENOTEMPTY: … rmdir '…/.git'` ⇒ **红在自检自身**（＝「红错支」的另一种形态：
 *   门报的不是被测物的缺陷，是**夹具的竞态**；实测 `#1838` 首跑红、rerun 绿）。
 *   ⇒ 两手：**①断因**（沙箱里关掉 git 的后台维护，见 `makeGitSandbox`）**②兜底重试**（本函数）。
 *   ⚠ `fs.rmSync` **没有** `maxRetries`（那是 `fs.rm` 的选项）⇒ 自己写有界重试。
 *   ⚠ **最终失败只出声、✗ 判红** —— 判红会把「夹具竞态」重新变成随机红，正是本票要消的那件事；
 *     故取向＝**重试到几乎不可能失败＋真失败时大声**（与「减少⇒绿但出声」同一取向）。 */
function cleanup(dir, tries = 6, delayMs = 40) {
  for (let i = 1; i <= tries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });   // ★此处**必须是 rmSync**
      if (!fs.existsSync(dir)) return true;
    } catch (e) {
      if (!/^(ENOTEMPTY|EBUSY|ENOENT|EPERM)$/.test(e.code ?? '')) throw e;   // ✗ 吞掉真错（如权限/路径错）
      if (i === tries) {
        console.log(`  ⚠ 夹具清理未净（${e.code}；已重试 ${tries} 次）：${dir} —— **出声不判红**（判红＝把夹具竞态变回随机红，见 #1840）`);
        return false;
      }
    }
    /* 同步小睡（本脚本是同步流程，✗ 用 await）：给后台写手一点收尾时间 */
    try { execFileSync('sleep', [String(delayMs / 1000)], { stdio: 'ignore' }); } catch { /* 无 sleep(1) 的环境：忽略 */ }
  }
  return !fs.existsSync(dir);
}

function runGate(dir) {
  try {
    const out = execFileSync('node', [GATE, '--root', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** 带额外 argv 跑门（#1789 K-3 用：须跑 `--update-baseline` 再断言文件未被破坏） */
function runGateArgs(dir, args) {
  try {
    const out = execFileSync('node', [GATE, '--root', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
function dropLines(dir, rel, substr) {          // 按子串整行删除（避免全角/缩进逐字对齐）
  const p = path.join(dir, rel);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const kept = lines.filter((l) => !l.includes(substr));
  if (kept.length === lines.length) throw new Error(`假刀失配：${rel} 内找不到含「${substr}」的行`);
  fs.writeFileSync(p, kept.join('\n'));
}
function edit(dir, rel, from, to) {
  const p = path.join(dir, rel);
  const s = fs.readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`假刀失配：${rel} 内找不到待改文本：${from.slice(0, 60)}`);
  fs.writeFileSync(p, s.replace(from, to));
}
/* 形态无关改写：属性值在 `_mod`（旧）与原始分（#1724 起）两种形态下各有锚点；
 * 逐个尝试，全部失配即显式失败（不得静默无操作 —— 见 #1715）。 */
function editAny(dir, rel, variants) {
  const p = path.join(dir, rel);
  let s = fs.readFileSync(p, 'utf8');
  for (const pairs of variants) {                      // 每个 variant = 一组 [from,to]（可多次替换，保证形态内自洽）
    if (pairs.every(([from]) => s.includes(from))) {
      for (const [from, to] of pairs) s = s.replace(from, to);
      fs.writeFileSync(p, s); return;
    }
  }
  throw new Error(`假刀失配（形态无关）：${rel} 内各形态锚点均未命中`);
}

const knives = [
  { id: 'K0', name: '洁净副本 ⇒ 绿', expect: 0, mark: '✓ 门绿', apply: () => {} },
  {
    id: 'K1', name: '删一处引用（测试名上方出处注）⇒ 红', expect: 1, mark: '声称未带可解析引用',
    apply: (d) => dropLines(d, 'tests/unit/dnd-5e/stats.test.js', '出处：SRD 5.2.1 · monsters-A-Z.md:7256-7287'),
  },
  {
    id: 'K2', name: '抹掉引用版本号 ⇒ 红', expect: 1, mark: '缺版本',
    apply: (d) => edit(d, 'src/dnd/dnd-5e/monsters/goblin-boss.js',
      '/* DND5E 怪物 —— 哥布林首领（数值来自 SRD 5.2.1 · `monsters-A-Z.md:7404`',
      '/* DND5E 怪物 —— 哥布林首领（数值来自 SRD · `monsters-A-Z.md:7404`'),
  },
  {
    id: 'K3', name: '改 pin 表 sha1 末位 ⇒ 红', expect: 1, mark: 'pin 不符',
    apply: (d) => edit(d, 'README.md', '| `6ef9e2499230a560` |', '| `6ef9e2499230a561` |'),
  },
  {
    id: 'K4', name: '改仓内一值（注未改）⇒ 红', expect: 1, mark: '值自洽不符',
    apply: (d) => edit(d, 'src/dnd/dnd-5e/monsters/goblin.js', '	hp: 7, maxHp: 7,', '	hp: 8, maxHp: 8,'),
  },
  {
    id: 'K4b', name: '改仓内一值**且注释同步改**（一致地写错）⇒ 红【tier-② 验收刀】', expect: 1, mark: '源值比对不符（A 组）',
    apply: (d) => edit(d, 'src/dnd/dnd-5e/monsters/goblin.js',
      'hp: 7, maxHp: 7, // SRD 5.2.1 · monsters-A-Z.md:7257 —— HP 7 (2d6)',
      'hp: 8, maxHp: 8, // SRD 5.2.1 · monsters-A-Z.md:7257 —— HP 8 (2d6)'),
  },
  {
    id: 'K5', name: '伪造来源声明行（形态对、pin 表无此 repo×版本×commit）⇒ 红', expect: 1, mark: '来源声明行与 pin 表不符',
    apply: (d) => edit(d, 'src/dnd/dnd-5e/00-init.js',
      '· `downfallx/dnd-5e-srd-markdown` @ `1b4b99d…`', '· `evil/fake-repo` @ `deadbee…`'),
  },
  {
    id: 'K6', name: '引用行号越界（:7257 → :99999）⇒ 红', expect: 1, mark: '行号越界',
    apply: (d) => edit(d, 'src/dnd/dnd-5e/monsters/goblin.js', 'monsters-A-Z.md:7257', 'monsters-A-Z.md:99999'),
  },
  {
    id: 'K7', name: '跨面同名（3E 引用抹目录）⇒ 红', expect: 1, mark: '引用路径不完整',
    apply: (d) => edit(d, 'src/dnd/dnd3/items/club.js',
      '`Basic Rules and Legal/equipment.md:427-434`', '`equipment.md:427-434`'),
  },
  {
    // K8 修形法 (i)（T 席要求）：同时改缓存 sha1 入 pin 表 ⇒ B 门（pin 校验）**绿**，
    // 于是这一刀的红**只能**来自 A 组值比对（否则会「砍中旁边的柱子报中靶」）。
    id: 'K8', name: '改缓存源值 + 同步 pin 表 sha1（B 门先绿）⇒ 红须来自 A 组值比对', expect: 1, mark: '源值比对不符（A 组）',
    apply: (d) => {
      const cacheP = path.join(d, 'tests/gates/pin-cache/monsters-A-Z.md');
      const ls = fs.readFileSync(cacheP, 'utf8').split('\n');
      if (!ls[7408].includes('**HP** 21')) throw new Error('K8 假刀失配：缓存 :7409 未见 `**HP** 21`');
      ls[7408] = ls[7408].replace('**HP** 21', '**HP** 99');
      fs.writeFileSync(cacheP, ls.join('\n'));
      const newSha = crypto.createHash('sha1').update(fs.readFileSync(cacheP)).digest('hex').slice(0, 16);
      const rd = path.join(d, 'README.md');
      const md = fs.readFileSync(rd, 'utf8');
      if (!md.includes('6ef9e2499230a560')) throw new Error('K8 假刀失配：README pin 表未见 monsters-A-Z 的 sha1');
      fs.writeFileSync(rd, md.replace('6ef9e2499230a560', newSha));   // B 门随之一致 ⇒ 绿
    },
  },
  {
    id: 'K9', name: '映射表写错条目名 ⇒ 红（C 组）', expect: 1, mark: '映射校验不符（C 组）',
    apply: (d) => edit(d, 'tests/gates/name-map.json', '"entry": "Goblin Minion"', '"entry": "Goblin Warrior"'),
  },
  {
    id: 'K10', name: '改仓内属性值（注释不同步）⇒ 红【#1725 A 组属性面】', expect: 1, mark: '源值比对不符（A 组）',
    apply: (d) => editAny(d, 'src/dnd/dnd-5e/monsters/goblin.js', [
      [['str_mod: -1, dex_mod: 2, con_mod: 0,', 'str_mod: -1, dex_mod: 3, con_mod: 0,']],          // 旧形态（*_mod）
      [['str: 8, dex: 15, con: 10,', 'str: 8, dex: 16, con: 10,']],                                // 原始分形态（#1724）
    ]),
  },
  {
    id: 'K10b', name: '改属性值**且注释同步改**（一致地错）⇒ 红【#1725 验收刀】', expect: 1, mark: '源值比对不符（A 组）',
    apply: (d) => editAny(d, 'src/dnd/dnd-5e/monsters/goblin.js', [
      [['dex_mod: 2, con_mod: 0, // 同上 :7279/7283/7287 —— STR 8(−1) DEX 15(+2) CON 10(+0)',
        'dex_mod: 3, con_mod: 0, // 同上 :7279/7283/7287 —— STR 8(−1) DEX 15(+3) CON 10(+0)']],
      [['str: 8, dex: 15, con: 10, // 同上 :7279/7283/7287 —— STR 8(−1) DEX 15(+2) CON 10(+0)',
        'str: 8, dex: 16, con: 10, // 同上 :7279/7283/7287 —— STR 8(−1) DEX 16(+3) CON 10(+0)']],  // 值 ∧ 注释**同步**改（一致地错）
    ]),
  },
  {
    id: 'K11', name: '删掉行内字段但保留声称值（#1722 writer 的 MAJOR：旧码静默缩分母）⇒ 红', expect: 1, mark: '源值比对不符（A 组）',
    apply: (d) => edit(d, 'src/dnd/dnd-5e/monsters/goblin.js',
      '	hp: 7, maxHp: 7, // SRD 5.2.1 · monsters-A-Z.md:7257 —— HP 7 (2d6)',
      '	maxHp: 7, // SRD 5.2.1 · monsters-A-Z.md:7257 —— HP 9 (2d6)'),
  },
  {
    /* NIT-1（D 席 `developer-9`）：**刀必须自带非空 `apply`** ——
     * 自检的 COPY 含 `tests/gates/**`，故「回退门本身」时沙箱里跑的是被回退的门；
     * 若刀为空，其「场景」在沙箱里从未出现 ⇒ 恒绿空刀、给出**假的验收信号**。
     * 本刀构造「标题载**原始分**（#1724 模型）＋ 断言为原始分字段」的真场景 ⇒ 旧门必红、新门须绿。 */
    id: 'K12', name: '标题载**原始分**（#1724 模型）⇒ 不红【#1734 验收刀】', expect: 0, mark: '✓ 门绿',
    apply: (d) => editAny(d, 'tests/unit/dnd-5e/stats.test.js', [
      [['（AC 12, HP 7，六维原始分见下）', '（AC 12, HP 7, STR 8, DEX 15）']],   // 断言侧在 #1724 后已是原始分
    ]),
  },
  {
    id: 'K12b', name: '标题载原始分 **且** 断言为原始分字段 ⇒ 绿（两代兼容的正面用例）', expect: 0, mark: '✓ 门绿',
    apply: (d) => {
      const p = path.join(d, 'tests/unit/dnd-5e/stats.test.js');
      let s = fs.readFileSync(p, 'utf8');
      // 把标题值改为原始分，并把紧随断言改为原始分字段（模拟 #1724 形态）
      s = s.replace('（AC 12, HP 7, STR -1, DEX +2）', '（AC 12, HP 7, STR 8, DEX 15）');
      s = s.replace('assert.eq(D().Goblin.stats.str_mod, -1);', 'assert.eq(D().Goblin.stats.str, 8);');
      s = s.replace('assert.eq(D().Goblin.stats.dex_mod, 2);', 'assert.eq(D().Goblin.stats.dex, 15);');
      fs.writeFileSync(p, s);
    },
  },
  {
    id: 'K13', name: '覆盖面下降（删整行声称 ⇒ claims 51→50）⇒ 红【#1720 判据 1】', expect: 1, mark: '覆盖面下降',
    apply: (d) => dropLines(d, 'src/dnd/dnd-5e/monsters/goblin.js', 'maxHp: 7, // SRD 5.2.1 · monsters-A-Z.md:7257'),
  },
  {
    id: 'K14', name: '基线缺失 ⇒ 红（不静默跳过）【#1720 判据 4】', expect: 1, mark: '覆盖面基线缺失',
    apply: (d) => fs.rmSync(path.join(d, 'tests/gates/coverage-baseline.json'), { force: true }),
  },
  {
    id: 'K15', name: '记账面超上限（ceilings 压到 0 下限之下）⇒ 红【#1720 判据 3】', expect: 1, mark: '记账面增长超上限',
    apply: (d) => {
      const p = path.join(d, 'tests/gates/coverage-baseline.json');
      const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
      /* 构造：把上限压到 −1（低于任何实际值，含真 0）⇒ 必红。
       *   不用「压到 3」：那在真值 0 的树上是**空刀**（0 ≤ 3 恒真）——值随基线收敛后原构造失效。 */
      doc.ceilings.uncovered = -1;
      fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
    },
  },
  {
    id: 'K16', name: '标题删值（用例名↔断言，`#1734` 面）⇒ 红【#1720 判据 2】', expect: 1, mark: '覆盖面下降',
    apply: (d) => edit(d, 'tests/unit/dnd-5e/stats.test.js', '（AC 12, HP 7，六维原始分见下）', '（六维原始分见下）'),
  },


  /* ---------- S3-⑧（#1744）：d20m 面「会红」的刀 —— 门对第三面真有判别力 ---------- */
  {
    id: 'K13d', name: '改 d20m pin 行 sha1 一位 ⇒ 红（d20m 的 pin 校验真在核，✗ 恒 9/15）', expect: 1, mark: 'pin 不符',
    apply: (d) => {
      const p = path.join(d, 'README.md');
      let s = fs.readFileSync(p, 'utf8');
      // 27msrdcombat战斗.md 的 d20m pin：1079 行 / 919704002031c35e ⇒ 末位 +1
      assert2(s.includes('919704002031c35e'), 'd20m pin 行靶不在（接口面变了须同步改刀）');
      s = s.replace('919704002031c35e', '919704002031c35f');
      fs.writeFileSync(p, s);
    },
  },
  {
    id: 'K14d', name: '删 d20m 用例的引用注行 ⇒ 红（d20m 面的「纯引用」也在核）', expect: 1, mark: '声称未带可解析引用',
    apply: (d) => {
      const p = path.join(d, 'tests/unit/d20m/stats.test.js');
      let s = fs.readFileSync(p, 'utf8');
      const victim = s.split('\n').findIndex((l) => l.includes('SRD d20M · source/4Future未来/9FutureRobots.md:140'));
      assert2(victim >= 0, 'd20m 引用注行靶不在');
      s = s.split('\n').filter((_, i) => i !== victim).join('\n');
      fs.writeFileSync(p, s);
    },
  },
];

/* ---------- 真 git 沙箱（#1789 K20 用） ----------
 * 为什么需要：默认 `makeCopy()` 是 `os.tmpdir()` 的**纯目录拷贝（非 git 仓）**
 *   ⇒ `merge-base origin/main HEAD` 与 `rev-parse --short HEAD` **都失败、都落 unknown**
 *   ⇒ 该沙箱**分不出「默认取 merge-base」与「取 HEAD」两臂**（判别力为零）。
 *   ★这正是本席在 K-1 踩过的「两臂同值时判别力为零」换了地方（dev-9 复核指出）。
 * ⇒ 故 K20 需要**真 git**：建一个仓、造 `origin/main` 与一条分叉的分支，
 *   使 `merge-base ≠ HEAD`，从而能判「默认落前者还是后者」。 */
function makeGitSandbox() {
  const dir = makeCopy();
  const git = (args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  git(['init', '-q']);
  /* ★`#1840` **断因**：关掉 git 的后台维护 —— 否则 `gc --auto`／maintenance 可能在本函数返回后
   *   仍往 `.git` 写，令紧随的清理撞 `ENOTEMPTY`（清理侧另有兜底重试，二者**原因＋兜底**并行）。 */
  git(['config', 'gc.auto', '0']);
  git(['config', 'maintenance.auto', 'false']);
  git(['config', 'user.email', 'selftest@local']);
  git(['config', 'user.name', 'selftest']);
  git(['add', '-A']);
  git(['commit', '-qm', 'base']);
  /* ★与门同口径：**`--short=8`**（✗ 裸 `--short` —— 小仓里它给 7 位，会被本刀读成「取错臂」而假红）。 */
  const baseSha = git(['rev-parse', '--short=8', 'HEAD']).trim();
  /* 造一个「origin/main」引用指向 base（用 update-ref，✗ 需真 remote） */
  git(['update-ref', 'refs/remotes/origin/main', baseSha]);
  /* 再提交一笔 ⇒ HEAD 前进 ⇒ HEAD ≠ merge-base(origin/main, HEAD) */
  fs.writeFileSync(path.join(dir, '.selftest-advance'), 'x\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'advance']);
  const headSha = git(['rev-parse', '--short=8', 'HEAD']).trim();
  return { dir, baseSha, headSha };
}

/* ---------- 非「红/绿」形刀：直接驱动 `--update-baseline` 后**读文件**（#1789） ---------- */
const fileKnives = [
  {
    /* ★K-3（dev-9 的 B 面守卫）：跑一次 `--update-baseline` 后 `seededReason` **须原样保留**。
     *   为什么要它：工具原先**静默抹掉**该键（写入构造不含它、门也不读它 ⇒ 不报错全绿）
     *   —— 即「机制要求的核心证据被工具吃掉」。没有这条刀，本修法下次会被「顺手简化」掉（此坑有先例）。 */
    id: 'K17', name: '`--update-baseline` 后 `seededReason` 原样保留（✗ 静默抹掉）【#1789 B 面】',
    run: (dir) => {
      const p = path.join(dir, 'tests/gates/coverage-baseline.json');
      const before = JSON.parse(fs.readFileSync(p, 'utf8'));
      before.seededReason = 'K17 探针：' + '说明'.repeat(50);
      fs.writeFileSync(p, JSON.stringify(before, null, 2) + '\n');
      runGateArgs(dir, ['--update-baseline']);
      const after = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (after.seededReason !== before.seededReason) {
        return { ok: false, detail: `seededReason 被改动：前 ${String(before.seededReason).length} 字符 ⇒ 后 ${String(after.seededReason).length} 字符` };
      }
      return { ok: true };
    },
  },
  {
    /* K-1：分支上无参跑 ⇒ `seededAt` 须落**主干 merge-base**（✗ 跑时 HEAD）。
     *   本沙箱的副本是 git 仓外（makeCopy 复制目录）⇒ 取 merge-base 会失败并落 `unknown`
     *   且**出声警告** ⇒ 此处断言的是「✗ 不得写成沙箱里不存在的 HEAD 值」这一半。 */
    id: 'K18', name: '`--update-baseline` 无参且非 git ⇒ `seededAt=unknown` ＋ 出声警告（✗ 静默写坏值）【#1789 A 面】',
    run: (dir) => {
      const r = runGateArgs(dir, ['--update-baseline']);
      if (!/⚠ .*merge-base|seededAt 落 `unknown`|unknown/.test(r.out)) {
        return { ok: false, detail: '未出声警告（非 git 时应提示用 --seeded-at）' };
      }
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'tests/gates/coverage-baseline.json'), 'utf8'));
      if (after.seededAt !== 'unknown') return { ok: false, detail: `seededAt=${after.seededAt}（期望 unknown）` };
      return { ok: true };
    },
  },
  {
    id: 'K19', name: '`--seeded-at <sha>` 逐字生效【#1789 A 面】',
    run: (dir) => {
      runGateArgs(dir, ['--update-baseline', '--seeded-at', 'cafebabe']);
      const after = JSON.parse(fs.readFileSync(path.join(dir, 'tests/gates/coverage-baseline.json'), 'utf8'));
      return after.seededAt === 'cafebabe' ? { ok: true } : { ok: false, detail: `seededAt=${after.seededAt}（期望 cafebabe）` };
    },
  },
  {
    /* ★K20（dev-9 复核指出：K18 与「默认路径」是**同一刀的两臂**，拆开＝守一半）：
     *   K18 只测「**非 git** ⇒ unknown ＋ 出声」；而**默认取 merge-base** 这一臂在 K18 的沙箱里
     *   与「取 HEAD」**同落 unknown** ⇒ 分不出 ⇒ 退回 `rev-parse` 自检仍全绿（实证过）。
     * ⇒ 本刀在**真 git 沙箱**里造出 `merge-base ≠ HEAD`，断言默认落 **merge-base**。 */
    id: 'K20', name: '默认路径取 `merge-base origin/main HEAD`（✗ 跑时 HEAD）【#1789 A 面·另一臂】',
    run: () => {
      const sb = makeGitSandbox();
      try {
        if (sb.baseSha === sb.headSha) return { ok: false, detail: '沙箱构造失败：两臂同值（此刀判别力为零）' };
        runGateArgs(sb.dir, ['--update-baseline']);
        const after = JSON.parse(fs.readFileSync(path.join(sb.dir, 'tests/gates/coverage-baseline.json'), 'utf8'));
        /* ★**直接比字符串**（✗ 归一）：门与沙箱**现同为 `--short=8`** ⇒ 不再有 7 位 ⇒
         *   原先的 `norm = slice(0,8)` **理由已消失**。**留着反而危险**（dev-9 复核指出）：
         *   `norm('84b2e7a5') === norm('84b2e7a5ffff')` ⇒ **掩盖「前 8 位相同但长度不同」**——
         *   而「长度不同」正是本笔（#1789 ②）要消灭的那类差异 ⇒ 兜底会变成**掩盖源**。 */
        if (after.seededAt !== sb.baseSha) {
          return { ok: false, detail: `seededAt=${after.seededAt}（期望 merge-base ${sb.baseSha}；跑时 HEAD 为 ${sb.headSha}）` };
        }
        /* ★此处原有一道 `if (sb.baseSha === sb.headSha)` 的「两臂同值」检查 ——
         *   它与**函数开头那道**（见上）**表达式完全相同**，而开头那道在**更早**位置 ⇒ 本处**永不可达** ⇒
         *   去归一（#1793）后被 dev-9 核出为**死检查**（「看起来是第二道防线」）。**已删**。
         *   ⇒ 教训（与「过期兜底」同族）：**同一断言写两遍时，后一遍是死的**——
         *     它在阅读上给出「有双重保护」的错觉，而**实际只在第一处生效**。 */
        return { ok: true };
      } finally {
        cleanup(sb.dir);
      }
    },
  },
];

function assert2(cond, msg) { if (!cond) throw new Error(msg); }

let bad = 0;
console.log('门自检（refs-integrity.selftest.mjs）');
for (const k of knives) {
  const dir = makeCopy();
  try {
    k.apply(dir);
    const r = runGate(dir);
    const ok = r.code === k.expect && r.out.includes(k.mark);
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${k.id} ${k.name} — 实得 exit=${r.code}（期望 ${k.expect}）${ok ? '' : `；输出未见标记「${k.mark}」`}`);
    if (!ok) console.log(`      输出尾部：${r.out.trim().split('\n').slice(-3).join(' / ').slice(0, 260)}`);
  } catch (e) {
    bad++; console.log(`  ✗ ${k.id} ${k.name} — 自检自身出错：${e.message}`);
  } finally {
    cleanup(dir);
  }
}
for (const k of fileKnives) {
  const dir = makeCopy();
  try {
    const r = k.run(dir);
    if (!r.ok) bad++;
    console.log(`  ${r.ok ? '✓' : '✗'} ${k.id} ${k.name}${r.ok ? '' : ` — ${r.detail}`}`);
  } catch (e) {
    bad++; console.log(`  ✗ ${k.id} ${k.name} — 自检自身出错：${e.message}`);
  } finally {
    cleanup(dir);
  }
}
/* ★K21（`#1840`）：**清理 fixture 自证** —— 幂等 ＋ 深层树可清。
 *   ★本刀的价值在**调用本身**：若 helper 被写坏（如**自己调自己** —— 本席落码时真犯过：
 *     批量替换把自己的 `fs.rmSync` 也换成了 `cleanup(dir)` ⇒ **无限递归 ⇒ OOM 崩**），
 *     本刀**当场崩**（✗ 静默绿）。⇒ 「清理件也要有刀」不是形式：它是**夹具自身的**回归防线。 */
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-gate-selftest-knife-'));
  fs.mkdirSync(path.join(d, '.git', 'objects', 'ab'), { recursive: true });
  fs.writeFileSync(path.join(d, '.git', 'objects', 'ab', 'x'), 'x');
  fs.writeFileSync(path.join(d, '.git', 'index.lock'), '');
  const a = cleanup(d);
  const b = cleanup(d);                       // ★幂等：对**已不存在**的目录再清一次不得抛
  const ok = a === true && b === true && !fs.existsSync(d);
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} K21 清理件：深层树（含 .git 形）可清 ＋ **幂等**（再清不抛）`);
}

/* ★总数**自记**（✗ 硬编 —— 加刀忘改数会印出「26 刀全部如期」而实际 27 把：
 *   本席在 `#1819` 的 d20 门刚栽过同型「13/11 刀如期」）。 */
const total = knives.length + fileKnives.length + 1;   // ＋1 ＝ K21（清理件自证）
console.log(bad === 0 ? `✓ ${total} 刀全部如期（门会红也会绿）` : `✗ ${bad}/${total} 刀未如期`);
process.exit(bad === 0 ? 0 : 1);
