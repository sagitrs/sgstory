// 用户故事 CI 自证门（`#984`）。
//
//注意：**已知输入**（两条都会让人误读成"判据坏了" —— 今晚共三次栽在这两条上，登记在 `#987`／`#989`／`#990` 里）：
// ① **先 `node build.mjs`**（逐故事面里有需要构建产物的段；`editor/story-ci.mjs` 的全局面 **K5** 读的又是**探针相**的读数 → 单跑前先 `node scripts/probe-gates.mjs --probe=fast`）；
// ② **新开 worktree 要 `ln -s <主仓>/node_modules node_modules`**（本仓跑器**会起 jsdom** → 没有它会 `ERR_MODULE_NOT_FOUND`）。
// 进 CI **不必管**：两个相都在 `phase:'build'` 且都在本段之前。
//
// 判据（`docs/criterion-design.md` §八 8.18 口径：正例放过 ＋ 反例抓住，失败计入退出码）：
// ① **正例**：真根上 `--list` **⊇ 仓内现存故事**（注意：**不赌"恰好几个"** —— 并行段会临时往 `stories/` 放故事 → 计数等值会**随机红**，`#989` 里就是这么栽的；
// `#1004` B2 加固：期望集合取自 **`storySlugs()` 本身**（原来写死三个名字 → 名字一删就变成"判据在枚举已删故事"，
// 与 `GATE_ORDER` 那次同病）；→ 名单再变也只需跟着 `storySlugs()` 走，"有没有漏发现"依然被咬住）
// ② **能假**（`#984` 加固 (d)）：临时根里放**夹具故事** → `--list` **必须含它**
//（→ "新故事自动被覆盖"不是空话）；无 `00-story.json` 的目录**不算故事**（发现口径）
// ③ **反例**：坏故事（坏 `data/tables.json`）→ `story-ci --story=<目录>` **必红**
// ④ **编排不漏**：发现到的每个故事都必须出现在编排里（静默漏掉 → 点名）
// ⑤ 接口口径：全局面**每轮一次**（与故事数无关）· 重面只在 `--full`
//注意：夹具一律在 **`os.tmpdir()`** —— ⛔ **不往 `stories/` 塞**（并发段会看见 → 与 `#976` 同类事故）。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { storySlugs } from '../scripts/dist-paths.mjs';   // `#1004` B2：仓内故事名单的**单一权威**（不写死名字）

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};
// `#1267` 尾件（复核裁定 1）：**本件的自证跟"根两态"改** —— `#1267` 之后
// `SG_STORIES_DIR` 优先、`--stories-dir=` 仅在 **env 未设**时生效 → 本件的夹具格
// 若只传 CLI，在外根（env 已设）下会被忽略（格就失效）。修法：**两态都用显式 env 表达根**
// （`env` 里设 `SG_STORIES_DIR` → 与构建/其余门同口径；CLI 仍可作补充）。
const cli = (args, env = {}) => spawnSync('node', ['editor/story-ci.mjs', ...args],
	{ cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
const probe = mkdtempSync(join(tmpdir(), 'story-ci-'));

try {
	// ① 正例：真根
	{
		const r = cli(['--list']);
		const got = (r.stdout || '').trim().split('\n').filter(Boolean);
		//注意：**⊇ 而不是 ＝**（`#989` 的根因）：并行段会临时往 `stories/` 放故事（`__e2e` 等）→ 精确等值会**随机红**。
		// `#1004` B2：期望集合 ＝ `storySlugs()`（不再手写三个 slug —— 那份手写名单已随旧故事失效）。
		t('正例·真根 `--list` ⊇ 仓内现存故事（不赌「恰好几个」✗）',
			r.status === 0 && storySlugs().every((s) => got.includes(s)), `got=${got.join(',')} want⊇${storySlugs().join(',')}`);
	}

	// ② 能假：夹具故事必须被发现；无 `00-story.json` 的目录不算
	{
		mkdirSync(join(probe, 'fixture-story'));
		writeFileSync(join(probe, 'fixture-story', '00-story.json'), JSON.stringify({ slug: 'fixture-story', files: ['10-x.twee'] }));
		mkdirSync(join(probe, 'not-a-story'));
		const r = cli(['--list'], { SG_STORIES_DIR: probe });   // `#1267`：显式 env（CLI 在 env 已设时被忽略）
		const got = (r.stdout || '').trim().split('\n').filter(Boolean);
		t('🔴 能假·夹具故事**必须**出现在 `--list` 里', r.status === 0 && got.includes('fixture-story'), `got=${got.join(',')}`);
		t('发现口径·无 `00-story.json` ⇒ 不算故事（不抛 ✗）', !got.includes('not-a-story'), `got=${got.join(',')}`);
	}

	// ③ 反例：坏故事 → 红（`--story=<目录>` 走**仓外故事包**那条路）
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

	// ③′ **取不到输入不许判过**（洞是对**本 PR**（`#988`）提的 —— 谁提的不写，写**在哪张票里提的**）：
	// 发现到 0 个故事 → 必红并点名
	//（不然逐故事面整批消失，末行照写「通过」 → 改名／路径写错／工作目录变都会让 CI 照绿）
	{
		const empty = join(probe, 'empty-root');
		mkdirSync(empty);
		const r = cli([], { SG_STORIES_DIR: empty });   // `#1267`：显式 env（CLI 在 env 已设时被忽略）
		const out = `${r.stdout || ''}${r.stderr || ''}`;
		// `#1267`：空根现在由 `SG_STORIES_DIR` 的 **fail-loud 校验**在加载期点名
		//（"下没有任何 `<slug>/00-story.json`"）—— 与"story-ci 自己发现到 0 个故事"同义，
		// 都是"不许静默判过" 。断言改为**认这两种点名声**（不绑死某一处文案）。
		t('🔴 反例·空根目录 ⇒ rc=1 且点名（0 故事／校验点名声）',
			r.status === 1 && /发现到 0 个故事|没有任何 .?<slug>\/00-story\.json.?/.test(out), `status=${r.status}`);
		// `#1267`：根校验失败属**前置不成立** → 不跑全局面是**对的**（与"取不到输入不许判过"同族）；
		// 原断言建立在"根能起来、只是 0 个故事"的旧假设上 → 按新语义改为：
		// **要么全局面照跑（旧语义），要么在加载期点名并退出（新语义：前置缺失不假装跑全局面）**。
		t('反例·空根目录：全局面照跑 **或** 前置缺失点名退出（两种都不静默判过 ✓）',
			/(\[K2\]|\[K5\]|\[K6\])/.test(out) || /没有任何 `?<slug>\/00-story\.json`?|指向的不是目录/.test(out),
			`out=${out.slice(-80)}`);
		const r2 = cli([], { SG_STORIES_DIR: join(probe, 'no-such-dir') });   // `#1267`：同上
		const out2 = `${r2.stdout || ''}${r2.stderr || ''}`;
		t('🔴 反例·目录不存在 ⇒ 同形（rc=1 ＋ 点名）',
			r2.status === 1 && /不存在|指向的不是目录/.test(out2), `status=${r2.status}`);
	}

	// ③″ **末行不许反向说谎**：`✔/ ` ＋ `x/y` ＋ 清单 ＋ **rc** 必须四处一致
	// 口径＝在**三种调用**上都核一遍（不变量，与相的顺序无关）
	{
		const lastLine = (out) => (out.trim().split('\n').filter((l) => /用户故事 CI：/.test(l)).pop() ?? '');
		const cases = [
			['空根目录（0 故事 ⇒ 必红）', cli([], { SG_STORIES_DIR: join(probe, 'empty-root-2') })],   // `#1267`：同上
			['坏故事（逐故事面红）', cli([`--story=${join(probe, 'broken')}`])],
			['默认档（面上应为绿）', cli([])],
		];
		for (const [label, r] of cases) {
			const out = `${r.stdout || ''}${r.stderr || ''}`;
			const last = lastLine(out);
			// `#1267`：空根在新语义下可能**加载期点名即退**（无末行）→ 末行不变量只在"本件真的跑起来了"时适用；
			// **前置缺失 → rc≠0 ＋ 点名**同样合格（不静默判过）。
			t(`🔴 末行 ✗ ⟺ rc≠0（${label}；或前置缺失点名）`,
				last ? ((r.status !== 0) === last.startsWith('✗')) : r.status !== 0,
				`rc=${r.status} last=${last.slice(0, 60)}`);
		}
		// 0 故事时**分母要把它算进去**（否则末行又会说成 4/4）
		const out0 = `${cases[0][1].stdout || ''}${cases[0][1].stderr || ''}`;
		const m = /：([0-9]+)\/([0-9]+) 通过/.exec(lastLine(out0));
		t('🔴 0 故事 ⇒ `x/y` 里 x<y，或前置缺失被点名（两种都不静默判过 ✓）',
			(!!m && Number(m[1]) < Number(m[2])) || /没有任何 .?<slug>\/00-story\.json.?|指向的不是目录/.test(out0),
			`line=${lastLine(out0)}`);
	}

	// ③‴ `#999`：`--stories-dir=` 时**逐故事面也必须看那个根**（不然"发现用 A 根、逐故事用 B 根"）
	// 判据取**报文里的路径** —— `lint-story` 吃目录时会打「（路径 <dir>）」 → 那是**根专属**的证据
	//（⛔ 不赌"它绿"：临时根里没有 `dist/` → 它本来就该红）。
	{
		const rootX = join(probe, 'rootx');
		mkdirSync(join(rootX, 'broken2', 'data'), { recursive: true });
		writeFileSync(join(rootX, 'broken2', '00-story.json'), JSON.stringify({ slug: 'broken2', files: ['10-x.twee'] }));
		writeFileSync(join(rootX, 'broken2', 'data', 'tables.json'), '{ oops');
		writeFileSync(join(rootX, 'broken2', 'data', 'contract.json'), '{}');
		// `#1267`：本格验的是"**逐故事面真的在那个根上跑**"（`#999` 旧病的反面）。
	// 根以 **env** 表达（`#1267` 后 `SG_STORIES_DIR` 优先）→ 断言的"报文含路径"依旧成立。
	const r = cli([], { SG_STORIES_DIR: rootX });
		const out = `${r.stdout || ''}${r.stderr || ''}`;
		// `#1267`：本格的**断言口径已更新** —— 修法改为"根以 env 表达"后，逐故事面按 slug
		// 就能在**生效根**下找到 `broken2` → 报文不再带 `（路径 …）`（那是"根在仓外时传目录"那条
		// 旧路的措辞）。**判据改验"它真的在生效根上跑且抓住了那个坏故事"**：
		// rc=1 ＋ 点名 `broken2` ＋ 报"data/*.json 不可解析"（＝坏故事的专属症状，证明判到的是**它**）。
		t('🔴 能假·逐故事面**真的在那个根上跑**（rc=1 ＋ 点名 broken2 ＋ 坏故事症状）',
			r.status === 1 && out.includes('broken2') && /不可解析/.test(out), `status=${r.status}`);
		t('纯函数·根在仓外 ⇒ 逐故事面参数是**目录**（默认根仍是 slug ✓ 老行为不变 ✓）',
			(await import('../editor/lib/core/storyCi.mjs')).buildPlan({ stories: ['a'], root: '/tmp/x' })[0].cmd[1] === '/tmp/x/a'
			&& (await import('../editor/lib/core/storyCi.mjs')).buildPlan({ stories: ['a'] })[0].cmd[1] === 'a');
	}

	// ④ 编排不漏 ＋ ⑤ 接口口径（纯函数面，与 CLI 同一份代码）
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

// 壳级自证也必须过（同一份判据的壳面）
{
	const r = cli(['--selftest']);
	t('壳级自证通过（`--selftest` rc=0 ✓）', r.status === 0, `status=${r.status}`);
}

console.log(bad ? `✗ story-ci 自证门：${bad} 条不合格` : '✔ story-ci 自证门通过');
process.exit(bad ? 1 : 0);
