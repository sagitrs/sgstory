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
	mkdirSync(join(dir, 'stories', 's1', 'data'), { recursive: true });
	mkdirSync(join(dir, 'stories', 's1', 'passages'), { recursive: true });
	writeFileSync(join(dir, 'stories', 's1', '00-story.json'), JSON.stringify({
		slug: 's1', title: '仓外夹具', audience: 'internal', entry: '开场', gates: [],
		files: ['stories/s1/00-meta.twee', 'stories/s1/15-tables.twee', 'stories/s1/17-rules.twee', 'stories/s1/passages/01-开场.md'],
	}));
	writeFileSync(join(dir, 'stories', 's1', 'data', 'meta.json'), JSON.stringify({ slug: 's1', title: '仓外夹具', entry: '开场', ifid: '9E1B2C3D-4A5B-6C7D-8E9F-0A1B2C3D4E5F' }));
	writeFileSync(join(dir, 'stories', 's1', 'data', 'tables.json'), JSON.stringify({ section: 'Game Tables', note: '夹具', containers: {}, merges: [] }));
	writeFileSync(join(dir, 'stories', 's1', 'data', 'rules.json'), JSON.stringify({ section: 'StoryRules', note: '夹具', rows: [] }));
	writeFileSync(join(dir, 'stories', 's1', 'data', 'contract.json'), JSON.stringify({ section: 'StoryBindings', note: '夹具', members: [] }));
	writeFileSync(join(dir, 'stories', 's1', 'passages', '01-开场.md'), '---\npassage: 开场\n---\n\n开场文本。\n');
	// `#1288`（复核真根因）：**故事根＝<dir>/stories** → `DIST_DIR = <dir>/dist`（**每跑独立**，不再落公共 <TMPDIR>/dist）。
	return join(dir, 'stories');
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
	// `#1289`（复核 ④，  本票偶发红的真因）：第 ⑦ 格「顶层目录集合不变」原先把 `build/`／`dist/`
	// 也算进去，而**子进程构建会正常创建它们** → 该格结果取决于『跑之前它们在不在』
	//（实测：删掉 `build` 再跑 → 必红；先建 → 11/11）—— **与病因（仓外故事根）无关**。
	// 修：**比较时排除构建产物目录**（它们本来就该被建；断言的本意是「不往仓里拉屎」= 故事面/源码面不被写）。
	//   不用 `mkdirSync(ROOT/build)`：那会给②层引入一个**静态 fs 字面量**（失败路径走不到 → ①②层门红）。
	const topLevelOf = () => readdirSync(ROOT).sort().filter((x) => x !== 'build' && x !== 'dist').join(',');
	const before = topLevelOf();
	const d7 = spawnSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SG_STORIES_DIR: outside } });
	const after = topLevelOf();
	// `#1288`（复核）：该格偶发红（零链 68/69，红段本格），而**失败时子进程的错行被截断**
	// → 只剩 " / Node.js v22.23.2" → **归因不可做**。修：失败时**把退出码 ＋ 子进程 stderr 全量打出来**
	//（诊断不是判据；判据仍是 rc=0）。
	const d7detail = (() => {
		if (d7.status === 0) return '';
		// `#1289`（复核）：**打全量** —— 诊断的可见性**不得依赖与病因无关的量**（例：stderr 长度）。
		// node 的错行常在前段、堆栈/字节转储在后段 → 取尾部会**恰好漏掉真错行**
		//（实测：stderr 总长 3012 时 `Error:` 行**不在**末 1200 字窗口里）。`t()` 的 extra **只在失败时输出**
		// → 正常路径零附加输出 → 全量是**免费**的。另补 `d7.error.message`（spawn 自身失败时 status=null、stderr 可能空）。
		const errFull = String(d7.stderr ?? '');
		const outFull = String(d7.stdout ?? '');
		const errLine = errFull.split('\n').find((l) => /Error|error:/.test(l)) ?? '(未在 stderr 里找到 Error 行)';
		const err = errFull || '(空 stderr)';
		const out = String(d7.stdout ?? '').trim();
		return `status=${d7.status} signal=${d7.signal ?? '-'} spawnError=${d7.error ? d7.error.message : '-'}`
			+ `\n--- 真错行（提到最前）---\n${errLine.trim()}`
			+ `\n--- 子进程 stderr（全量 ${errFull.length} 字）---\n${err.trim()}`
			+ `\n--- 子进程 stdout（全量 ${outFull.length} 字）---\n${outFull.trim()}`;
	})();
	// `#1289`（复核 ⑤）：失败时**另起一行原样打印**（别塞 `t(...)` 的 extra —— 便于 CI 日志直读）。
	if (d7.status !== 0) console.error(`[⑦ 诊断] 仓外构建失败：\n${d7detail}\n`);
	t('⑦ 仓外故事**编译通过**（rc=0）', d7.status === 0, d7detail);
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
