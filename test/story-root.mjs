// `#1267`（伞 `#1266`）**故事根口**（`SG_STORIES_DIR`）的判据。
//
// 守护的对象：**引擎能编译并跑仓外的故事根**（伞终点的前置能力），且：
//   · 仓内默认行为**不变**（向后兼容）；
//   · 指错根时 **fail-loud**（点名声明的实际值）—— 否则"指错了根"会被下游读成"没有故事"（静默假绿  ）；
//   · **产物随根**：跑仓外故事不在引擎仓里留东西（"不拉屎"）。
//
// 它在什么输入下会红：
//   ① 有人把 `STORIES_DIR` 改回硬编码 `join(ROOT,'stories')` → 第 1、2 格红；
//   ② 有人把校验的 fail-loud 改成静默返回默认 → 第 3、4 格红；
//   ③ 有人把 `resolveStoryRel`/`absPath` 的换算去掉 → 第 5 格红；
//   ④ 有人让产物写回仓内 → 第 6 格红。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let bad = 0, n = 0;
const t = (label, ok, extra = '') => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}${ok || !extra ? '' : ` —— ${extra}`}`); };

/** 用子进程取"设了 SG_STORIES_DIR 时的行为"（该口在模块加载期求值 → 必须换进程）。 */
const runNode = (code, env) => spawnSync('node', ['--input-type=module', '-e', code], {
	cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env },
});

// ── 夹具：一个最小的"仓外故事根"（清单 ＋ data ＋ 一个 md 段） ─────────────────
const mkStoryRoot = () => {
	const dir = mkdtempSync(join(tmpdir(), 'sg-root-'));
	mkdirSync(join(dir, 's1', 'data'), { recursive: true });
	mkdirSync(join(dir, 's1', 'passages'), { recursive: true });
	writeFileSync(join(dir, 's1', '00-story.json'), JSON.stringify({
		slug: 's1', title: '仓外夹具', audience: 'internal', entry: '开场', gates: [],
		files: ['stories/s1/00-meta.twee', 'stories/s1/15-tables.twee', 'stories/s1/17-rules.twee', 'stories/s1/passages/01-开场.md'],
	}));
	writeFileSync(join(dir, 's1', 'data', 'meta.json'), JSON.stringify({ slug: 's1', title: '仓外夹具', entry: '开场', ifid: '9E1B2C3D-4A5B-6C7D-8E9F-0A1B2C3D4E5F' }));
	writeFileSync(join(dir, 's1', 'data', 'tables.json'), JSON.stringify({ section: 'Game Tables', note: '夹具', containers: {}, merges: [] }));
	writeFileSync(join(dir, 's1', 'data', 'rules.json'), JSON.stringify({ section: 'StoryRules', note: '夹具', rows: [] }));
	writeFileSync(join(dir, 's1', 'data', 'contract.json'), JSON.stringify({ section: 'StoryBindings', note: '夹具', members: [] }));
	writeFileSync(join(dir, 's1', 'passages', '01-开场.md'), '---\npassage: 开场\n---\n\n开场文本。\n');
	return dir;
};

const outside = mkStoryRoot();
try {
	// ── ① 默认（不设 env）＝ 仓内 `stories/`，且行为与改前逐字符相同 ───────────────
	const d1 = runNode("import('./scripts/dist-paths.mjs').then(m=>console.log(JSON.stringify({dir:m.STORIES_DIR,rel:new URL('..',import.meta.url).pathname})))",
		{ SG_STORIES_DIR: '' });
	const r1 = JSON.parse(d1.stdout.trim().split('\n').pop());
	t('① 不设 `SG_STORIES_DIR` ⇒ 用仓内默认 `stories/`（向后兼容）', /\/stories$/.test(r1.dir), r1.dir);

    // ── ② 设了 → 用声明的根（绝对/相对都行） ────────────────────────────────────
	const d2 = runNode("import('./scripts/dist-paths.mjs').then(m=>console.log(m.STORIES_DIR))", { SG_STORIES_DIR: outside });
	t('② 设 `SG_STORIES_DIR` ⇒ 故事根＝声明的目录', d2.stdout.trim().endsWith(outside.split('/').pop()), d2.stdout.trim());

	// ── ③ 指向**不存在的目录** → 出声（且点名实际值） ─────────────────────────────
	const d3 = runNode("import('./scripts/dist-paths.mjs').catch(e=>console.log('ERR:'+e.message))", { SG_STORIES_DIR: '/nonexistent-root-xyz' });
	t('③ 指向不存在的目录 ⇒ **fail-loud**（不静默退回默认）', /ERR:/.test(d3.stdout) && /nonexistent-root-xyz/.test(d3.stdout), d3.stdout.trim().slice(0, 90));

	// ── ④ 指向**没有清单的目录** → 出声（否则下游读成"没有故事"＝静默假绿  ） ─────
	const empty = mkdtempSync(join(tmpdir(), 'sg-empty-'));
	const d4 = runNode("import('./scripts/dist-paths.mjs').catch(e=>console.log('ERR:'+e.message))", { SG_STORIES_DIR: empty });
	t('④ 指向无 `<slug>/00-story.json` 的目录 ⇒ **fail-loud**', /ERR:/.test(d4.stdout) && /00-story\.json/.test(d4.stdout), d4.stdout.trim().slice(0, 90));
	rmSync(empty, { recursive: true, force: true });

	// ── ⑤ 符号名换算：判据面保持 `stories/…`、落盘面指到真实根 ────────────────────
	const d5 = runNode(`import('./scripts/dist-paths.mjs').then(m=>console.log(JSON.stringify({
		sym: m.resolveStoryRel('stories/s1/00-meta.twee'),
		abs: m.absPath('stories/s1/00-meta.twee'),
		storyFiles: m.readStory('s1').files,
	})))`, { SG_STORIES_DIR: outside });
	const r5 = JSON.parse(d5.stdout.trim().split('\n').pop());
	t('⑤ 判据面保持**符号名**（`stories/s1/…`）', r5.storyFiles.every((f) => f.startsWith('stories/')), JSON.stringify(r5.storyFiles));
	t('⑤ 落盘面换算到**真实故事根**（绝对路径）', r5.abs === join(outside, 's1', '00-meta.twee'), r5.abs);

	// ── ⑥ 哨兵法／"不拉屎"：仓外故事根下**发现面**只见仓外的故事 ──────────────────
	const d6 = runNode("import('./scripts/module-order.mjs').then(m=>console.log(JSON.stringify(m.allSourceFiles().filter(f=>f.startsWith('stories/')))))",
		{ SG_STORIES_DIR: outside });
	const r6 = JSON.parse(d6.stdout.trim().split('\n').pop());
	t('⑥ 源发现只看**新根**（不含仓内 `stories/` 的任何件）', r6.length > 0 && r6.every((f) => f.startsWith('stories/s1/')), JSON.stringify(r6));

	// ── ⑦ 编译：仓外故事能构建，且**产物落仓外**（引擎仓不留东西） ────────────────
	const before = readdirSync(ROOT).sort().join(',');
	const d7 = spawnSync('node', ['build.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SG_STORIES_DIR: outside } });
	const after = readdirSync(ROOT).sort().join(',');
	t('⑦ 仓外故事**编译通过**（rc=0）', d7.status === 0, (d7.stderr || d7.stdout || '').trim().split('\n').slice(-2).join(' / ').slice(0, 120));
	// 产物目录＝**故事根的兄弟**（`<root>/../dist`）→ 仓外故事根 → 产物在 books 仓，不在引擎仓。
	const outDist = join(dirname(outside), 'dist', 'stories', 's1', 'index.html');
	t('⑦ 产物落**仓外**（`dist/` 是故事根的兄弟；不写引擎仓 `stories/`）',
		existsSync(outDist) && !existsSync(join(ROOT, 'stories', 's1')),
		`outside=${existsSync(outDist)} inrepo=${existsSync(join(ROOT, 'stories', 's1'))}`);
	t('⑦ 引擎仓**顶层目录集合不变**（不拉屎）', before === after, `${before} → ${after}`);
	rmSync(join(dirname(outside), 'dist'), { recursive: true, force: true });

	// ── ⑧ 反向格：仓内时换算**恒等**（`resolveStoryRel` 不改动任何字符串） ─────────
	const d8 = runNode("import('./scripts/dist-paths.mjs').then(m=>console.log(JSON.stringify(['stories/x/a.twee','src/10-core.twee'].map(m.resolveStoryRel))))",
		{ SG_STORIES_DIR: '' });
	const r8 = JSON.parse(d8.stdout.trim().split('\n').pop());
	t('⑧ 反向格：仓内时 `resolveStoryRel` **恒等**（引擎路径也不动）', r8[0] === 'stories/x/a.twee' && r8[1] === 'src/10-core.twee', JSON.stringify(r8));
} finally {
	rmSync(outside, { recursive: true, force: true });
}

console.log(bad ? `\n✗ story-root：${bad}/${n} 例失败` : `\n✔ story-root：${n} 例全部通过`);
process.exit(bad ? 1 : 0);
