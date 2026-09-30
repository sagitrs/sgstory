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
function runGate(dir) {
  try {
    const out = execFileSync('node', [GATE, '--root', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
];

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
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
console.log(bad === 0 ? `✓ ${knives.length} 刀全部如期（门会红也会绿）` : `✗ ${bad}/${knives.length} 刀未如期`);
process.exit(bad === 0 ? 0 : 1);
