// 用户故事 CI 自证门（`#984`）。
//
// 判据（`docs/dev-conventions.md` §9 口径：正例放过 ＋ 反例抓住，失败计入退出码）：
//   ① **正例**：真根上 `--list` ＝ 恰好仓内三故事 ✓
//   ② **能假**（`#984` 加固 (d) ✗）：临时根里放**夹具故事** ⇒ `--list` **必须含它** ✓
//      （⇒ "新故事自动被覆盖"不是空话 ✓）；无 `00-story.json` 的目录**不算故事** ✓（发现口径 ✓）
//   ③ **反例**：坏故事（坏 `data/tables.json` ✓）⇒ `story-ci --story=<目录>` **必红** ✓
//   ④ **编排不漏** ✓：发现到的每个故事都必须出现在编排里（静默漏掉 ⇒ 点名 ✗）
//   ⑤ 接口口径 ✓：全局面**每轮一次**（与故事数无关 ✓）· 重面只在 `--full` ✓
// ⚠️ 夹具一律在 **`os.tmpdir()`** ✗ —— ⛔ **不往 `stories/` 塞**（并发段会看见 ⇒ 与 `#976` 同类事故 ✓）。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};
const cli = (args) => spawnSync('node', ['editor/story-ci.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
const probe = mkdtempSync(join(tmpdir(), 'story-ci-'));

try {
	// ① 正例：真根
	{
		const r = cli(['--list']);
		const got = (r.stdout || '').trim().split('\n').filter(Boolean);
		// ⚠️ **⊇ 而不是 ＝** ✗（`#989` 的根因 ✓）：并行段会临时往 `stories/` 放故事（`__e2e` 等 ✓）⇒ 精确等值会**随机红** ✗。
		t('正例·真根 `--list` ⊇ 仓内三故事（不赌「恰好三个」✗）',
			r.status === 0 && ['hollow-cave', 'minimal-demo', 'mist-forest'].every((s) => got.includes(s)), `got=${got.join(',')}`);
	}

	// ② 能假：夹具故事必须被发现；无 `00-story.json` 的目录不算
	{
		mkdirSync(join(probe, 'fixture-story'));
		writeFileSync(join(probe, 'fixture-story', '00-story.json'), JSON.stringify({ slug: 'fixture-story', files: ['10-x.twee'] }));
		mkdirSync(join(probe, 'not-a-story'));
		const r = cli(['--list', `--stories-dir=${probe}`]);
		const got = (r.stdout || '').trim().split('\n').filter(Boolean);
		t('🔴 能假·夹具故事**必须**出现在 `--list` 里', r.status === 0 && got.includes('fixture-story'), `got=${got.join(',')}`);
		t('发现口径·无 `00-story.json` ⇒ 不算故事（不抛 ✗）', !got.includes('not-a-story'), `got=${got.join(',')}`);
	}

	// ③ 反例：坏故事 ⇒ 红（`--story=<目录>` 走**仓外故事包**那条路 ✓）
	{
		const b = join(probe, 'broken');
		mkdirSync(join(b, 'data'), { recursive: true });
		writeFileSync(join(b, '00-story.json'), JSON.stringify({ slug: 'broken', files: ['10-x.twee'] }));
		writeFileSync(join(b, 'data', 'tables.json'), '{ oops');
		writeFileSync(join(b, 'data', 'contract.json'), '{}');
		const r = cli([`--story=${b}`]);
		const out = `${r.stdout || ''}${r.stderr || ''}`;
		t('🔴 反例·坏故事 ⇒ rc=1 且点名（不静默 ✗）', r.status === 1 && /不可解析/.test(out), `status=${r.status}`);
	}

	// ③′ **取不到输入不许判过** ✗（洞是对**本 PR**（`#988`）提的 ✓ —— 谁提的不写 ✗，写**在哪张票里提的** ✓）：
	//    发现到 0 个故事 ⇒ 必红并点名
	//    （不然逐故事面整批消失，末行照写「通过」✗ ⇒ 改名／路径写错／工作目录变都会让 CI 照绿 ✗）
	{
		const empty = join(probe, 'empty-root');
		mkdirSync(empty);
		const r = cli(['--stories-dir=' + empty]);
		const out = `${r.stdout || ''}${r.stderr || ''}`;
		t('🔴 反例·空根目录 ⇒ rc=1 且点名「发现到 0 个故事」', r.status === 1 && /发现到 0 个故事/.test(out), `status=${r.status}`);
		t('反例·空根目录时**全局面照跑**（诊断完整，不整批跳过 ✓）', /\[K2\]|\[K5\]|\[K6\]/.test(out), '全局面没跑');
		const r2 = cli(['--stories-dir=' + join(probe, 'no-such-dir')]);
		const out2 = `${r2.stdout || ''}${r2.stderr || ''}`;
		t('🔴 反例·目录不存在 ⇒ 同形（rc=1 ＋ 点名「不存在」）', r2.status === 1 && /不存在/.test(out2), `status=${r2.status}`);
	}

	// ③″ **末行不许反向说谎** ✗：`✔/✗` ＋ `x/y` ＋ 清单 ＋ **rc** 必须四处一致 ✓
	//    口径＝在**三种调用**上都核一遍（不变量 ✓，与相的顺序无关 ✓）
	{
		const lastLine = (out) => (out.trim().split('\n').filter((l) => /用户故事 CI：/.test(l)).pop() ?? '');
		const cases = [
			['空根目录（0 故事 ⇒ 必红）', cli(['--stories-dir=' + join(probe, 'empty-root-2')])],
			['坏故事（逐故事面红）', cli([`--story=${join(probe, 'broken')}`])],
			['默认档（面上应为绿）', cli([])],
		];
		for (const [label, r] of cases) {
			const out = `${r.stdout || ''}${r.stderr || ''}`;
			const last = lastLine(out);
			t(`🔴 末行 ✗ ⟺ rc≠0（${label}）`, (r.status !== 0) === last.startsWith('✗'), `rc=${r.status} last=${last.slice(0, 40)}`);
		}
		// 0 故事时**分母要把它算进去** ✗（否则末行又会说成 4/4 ✓）
		const out0 = `${cases[0][1].stdout || ''}${cases[0][1].stderr || ''}`;
		const m = /：([0-9]+)\/([0-9]+) 通过/.exec(lastLine(out0));
		t('🔴 0 故事 ⇒ `x/y` 里 x<y（"该做没做"计入分母 ✓）', !!m && Number(m[1]) < Number(m[2]), `line=${lastLine(out0).slice(0, 40)}`);
	}

	// ④ 编排不漏 ＋ ⑤ 接口口径（纯函数面，与 CLI 同一份代码 ✓）
	{
		const m = await import('../editor/lib/core/storyCi.mjs');
		const stories = ['a', 'b'];
		const plan = m.buildPlan({ stories });
		t('编排不漏·发现到的每个故事都在编排里', m.missingFromPlan({ stories, plan }).length === 0);
		t('🔴 能假·发现了却没进编排 ⇒ 点名（不是静默漏掉 ✗）', m.missingFromPlan({ stories: ['a', 'b'], plan: [{ cmd: ['x', 'a'] }] }).length === 1);
		t('接口口径·全局面**每轮一次**（与故事数无关 ✓）',
			m.buildPlan({ stories }).filter((p) => p.scope === 'global').length === m.buildPlan({ stories: ['a', 'b', 'c'] }).filter((p) => p.scope === 'global').length);
		t('接口口径·重面只在 `--full`（默认不把重门乘故事数 ✗）',
			!m.buildPlan({ stories }).some((p) => p.tier === 'heavy') && m.buildPlan({ stories, full: true }).some((p) => p.tier === 'heavy'));
		t('表·每条 K 都指向**既有命令**且带出处（可核 ✓）', m.K_FACES.every((f) => Array.isArray(f.cmd('s')) && f.evidence.length > 0));
		t('汇总·任一 rc≠0 ⇒ ok=false ＋ 失败清单', (() => { const s = m.summarizeRuns([{ cmd: ['x'], rc: 0 }, { cmd: ['y'], rc: 1 }]); return !s.ok && s.total === 2 && s.failed[0].cmd === 'y'; })());
	}
} finally { rmSync(probe, { recursive: true, force: true }); }

// 壳级自证也必须过（同一份判据的壳面 ✓）
{
	const r = cli(['--selftest']);
	t('壳级自证通过（`--selftest` rc=0 ✓）', r.status === 0, `status=${r.status}`);
}

console.log(bad ? `✗ story-ci 自证门：${bad} 条不合格` : '✔ story-ci 自证门通过');
process.exit(bad ? 1 : 0);
