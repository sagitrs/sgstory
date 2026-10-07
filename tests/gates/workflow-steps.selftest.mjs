/* `workflow-steps` 门的**可假刀自检** —— 证明它会红、也会绿（✗ 不是只会印绿）
 *
 * 每刀在**独立临时根**（只有 `.github/workflows/**` 的最小仓）上施加，互不污染；**原仓不动** ✓。
 *
 *   K0  洁净副本                                   ⇒ 期望**绿**（证明门不是恒红）
 *   K1  摘掉某步的 `run:`（只留 `name:`）           ⇒ 期望**红**（A：步须有 run/uses —— `#1994` 的真因）
 *   K2  在同一块里**复制一份 `run:`**               ⇒ 期望**红**（B：重复键 ⇒ last-wins 顶掉 ⇒ 步名撒谎）
 *   K3  删掉顶层 `name:`                            ⇒ 期望**红**（C：run 列表会退化成文件路径）
 *   K4  加一个**合法**新步（`- name:` ＋ `run:`）    ⇒ 期望**绿**（证明门不滥红 —— 防「一律报红」）
 *   K5  临时根里**没有** `.github/workflows/`        ⇒ 期望 **rc=2**（装置错：**证不出** ≠ 绿）
 *
 * 用法：node tests/gates/workflow-steps.selftest.mjs      （退出码：全如期 0；有偏差 1）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const 仓根 = path.resolve(import.meta.dirname, '..', '..');
const 门 = path.join(仓根, 'tests', 'gates', 'workflow-steps.mjs');
const 源目录 = path.join(仓根, '.github', 'workflows');
if (!fs.existsSync(门) || !fs.existsSync(源目录)) {
	console.error('✗ 装置错：找不到门或源 workflow 目录 ⇒ 自检**证不出**（✗ 不静默当绿）');
	process.exit(2);
}
const 源文件 = fs.readdirSync(源目录).filter((f) => /\.ya?ml$/.test(f));
if (源文件.length === 0) {
	console.error('✗ 装置错：源 workflow 目录里没有 .yml／.yaml ⇒ 自检**证不出**');
	process.exit(2);
}

const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-steps-selftest-'));
const 造根 = (名, 改动) => {
	const d = path.join(临时根, 名);
	fs.mkdirSync(path.join(d, '.github', 'workflows'), { recursive: true });
	for (const f of 源文件) {
		let 文 = fs.readFileSync(path.join(源目录, f), 'utf8');
		if (改动 && 改动.文件 === f) 文 = 改动.换(文);
		fs.writeFileSync(path.join(d, '.github', 'workflows', f), 文);
	}
	return d;
};
const 跑门 = (d) => spawnSync(process.execPath, [门, '--root', d], { encoding: 'utf8' });

const 靶 = 源文件[0];
const 原文 = fs.readFileSync(path.join(源目录, 靶), 'utf8');
const 行们 = 原文.split('\n');
const 首个run = 行们.findIndex((l) => /^\s+run:\s*\S/.test(l));
if (首个run < 0) { console.error(`✗ 装置错：源文件 ${靶} 里找不到 \`run:\` 行 ⇒ K1/K2 靶不在位（✗ 当作未通过）`); process.exit(2); }

const 刀们 = [
	{ 名: 'K0 洁净副本', 期望: 0, 根: () => 造根('k0', null) },
	{ 名: 'K1 摘掉一步的 run（只留 name）', 期望: 1, 根: () => 造根('k1', { 文件: 靶, 换: (文) => {
		const L = 文.split('\n'); const i = L.findIndex((l) => /^\s+run:\s*\S/.test(l));
		L.splice(i, 1); return L.join('\n');
	} }) },
	{ 名: 'K2 同一块里复制一份 run（重复键）', 期望: 1, 根: () => 造根('k2', { 文件: 靶, 换: (文) => {
		const L = 文.split('\n'); const i = L.findIndex((l) => /^\s+run:\s*\S/.test(l));
		L.splice(i + 1, 0, L[i]); return L.join('\n');
	} }) },
	{ 名: 'K3 删掉顶层 name', 期望: 1, 根: () => 造根('k3', { 文件: 靶, 换: (文) => 文.replace(/^name:\s*\S.*$/m, '') }) },
	{ 名: 'K4 加一个合法新步', 期望: 0, 根: () => 造根('k4', { 文件: 靶, 换: (文) => {
		const L = 文.split('\n'); const i = L.findIndex((l) => /^\s{6}-\s+name:/.test(l));
		if (i < 0) return 文;
		L.splice(i, 0, '      - name: 自检加的合法步', '        run: node --version');
		return L.join('\n');
	} }) },
	{ 名: 'K6 标量值带「: 」未加引号（★本仓实测：整文件不解析）', 期望: 1, 根: () => 造根('k6', { 文件: 靶, 换: (文) => {
		const L = 文.split('\n'); const i = L.findIndex((l) => /^\s{6}-\s+name:/.test(l));
		if (i < 0) return 文;
		L[i] = '      - name: 门（含 : 冒号）'; return L.join('\n');
	} }) },
	{ 名: 'K7 同值但**加引号** ⇒ 绿（证明本检不滥红）', 期望: 0, 根: () => 造根('k7', { 文件: 靶, 换: (文) => {
		const L = 文.split('\n'); const i = L.findIndex((l) => /^\s{6}-\s+name:/.test(l));
		if (i < 0) return 文;
		L[i] = '      - name: "门（含 : 冒号）"'; return L.join('\n');
	} }) },
	{ 名: 'K5 没有 workflows 目录（装置错）', 期望: 2, 根: () => { const d = path.join(临时根, 'k5'); fs.mkdirSync(d, { recursive: true }); return d; } },
];

let 不中 = 0;
console.log(`  门＝${path.relative(仓根, 门)}｜源 workflows ${源文件.length} 个｜临时根 ${临时根}`);
for (const k of 刀们) {
	const d = k.根();
	const r = 跑门(d);
	const 实得 = r.status;
	const 对 = 实得 === k.期望;
	if (!对) 不中 += 1;
	const 摘 = (r.stdout || r.stderr || '').split('\n').filter((l) => /门红|门绿|装置错|^\s+- /.test(l)).slice(0, 2).join(' ／ ');
	console.log(`  ${对 ? '✓' : '✗'} ${k.名} ⇒ 期望 rc=${k.期望}｜实得 rc=${实得}${摘 ? ' ｜ ' + 摘.slice(0, 110) : ''}`);
}
try { fs.rmSync(临时根, { recursive: true, force: true }); } catch { /* 清不掉不掩盖结论 */ }
if (不中 > 0) { console.error(`\n✗ 自检未过：${不中} 刀未如期`); process.exit(1); }
console.log('\n✓ 自检全过（K0/K4/K7 绿、K1/K2/K3/K6 红、K5 装置错 rc=2）');
process.exit(0);
