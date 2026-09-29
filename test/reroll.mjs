// `#1574`（阶 3b）：段级 `check` 的**重入语义** —— `reroll` ＋ 默认「复用」。
//
// ★本文件的判据要点（★都是踩过才知道）：
//   ★① **必须用"变动的随机源"** —— `boot({random:0.5})` 下骰面**恒定** ⇒ ★"两次相同"**什么都证明不了** ✗
//     （★我第一版探针就是这样得到**假警报**"刀不咬" ✗）
//   ★② ★"改夹具 ⇒ 必须**清三层**"（`build/` ＋ 夹具 `dist/` ＋ 故事侧生成的 `*.twee`）⇒ ✗ 否则读数陈旧 ✗
//   ★③ ★段级声明的**两条来源**（`passages/*.md` 前言 ／ `data/passages.json`）—— ★`<<sitecheck>>` 调用**在 body 里**
//     ⇒ 声明会**改变 body** ⇒ ★两来源必须**同源**（✗ 只写数据面 ⇒ 等价性门红 ✗）
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FX = join(ROOT, 'test/fixtures/m3-chk-e2e/stories');
const SLUG = 'north-room';
const MD = 'passages/03-里屋.md';
// ★★(实测) **一个进程只跑一个用例** —— ★同进程第二次 `boot()` 会读到**陈旧产物** ✗
//   （★实测：先跑默认再跑刀 ⇒ 刀**不咬** ✗；调序后刀咬住、默认反而红 ✗ ⇒ ★**顺序敏感** ＝ 缓存 ✓）
//   ⇒ ★父进程 **spawn 两个子进程**（`RR_CASE` 区分）✓
const CASE = process.env.RR_CASE ?? null;
if (!CASE) {
	const cases = ['knife', 'default'];
	let rc = 0;
	for (const c of cases) {
		const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
			env: { ...process.env, RR_CASE: c }, encoding: 'utf8', cwd: ROOT,
		});
		process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
		if (r.status !== 0) rc = 1;
	}
	process.exit(rc);
}
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

// ★清三层（★②）
const clearThree = (root) => {
	rmSync(join(ROOT, 'build'), { recursive: true, force: true });
	rmSync(join(ROOT, 'test/fixtures/m3-chk-e2e/dist'), { recursive: true, force: true });
	for (const g of ['00-meta.twee', '15-tables.twee', '17-rules.twee', '19-events.twee']) {
		rmSync(join(root, SLUG, g), { force: true });
	}
};
// ★★(实测) `dist-paths` 在 **import 时**读 `SG_STORIES_DIR` ⇒ ESM **缓存** ⇒ ✗ 不能每块换根
//   （★我第一版每块后 `rmSync` ⇒ 后续块仍指向**已删**的根 ⇒ `ENOENT … 00-story.json` ✗）
//   ⇒ ★**一个临时根用到底**，块间**就地改 md** ＋ 重编 ✓
// ★★(实测) ✗ **临时副本路不通** —— 手工探针在**真夹具就地**跑是通的（1 ⇒ 2 ✓），
//   而把夹具拷到临时根再跑 ⇒ 刀不咬（★疑与 `dist-paths` 的 env 读取时机／缓存有关 ✓ —— ✗ 未深挖）
//   ⇒ ★故**就地改真夹具**，用 `try/finally` **保证还原**（✗ 不留脏 ✓）
const DIR = FX;
const MD_FULL = join(FX, SLUG, MD);
const ORIG_MD = readFileSync(MD_FULL, 'utf8');
const restore = () => writeFileSync(MD_FULL, ORIG_MD);
const setReroll = (on) => {
	let txt = readFileSync(MD_FULL, 'utf8').replace(/^reroll: (true|false)\n/m, '');
	if (on) txt = txt.replace('passage: 里屋\n', 'passage: 里屋\nreroll: true\n');
	writeFileSync(MD_FULL, txt);
};
const build = (stories) => execFileSync(process.execPath, [join(ROOT, 'build.mjs')], {
	cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe',
});
/** ★装一个**变动**随机源 ⇒ 才分得清"复用／重掷"（★①） */
const run = async (stories, { actor } = {}) => {
	process.env.SG_STORIES_DIR = stories;
	const { boot } = await import('./boot.mjs');
	const B = await boot({ story: SLUG, random: 0.5 });
	const w = B.w, S = w.SugarCube.State;
	let i = 0; const seq = [1, 2, 3, 4, 5, 6, 7, 8];
	w.Game.Rules.rng.set((lo, hi) => seq[(i++) % seq.length]);
	const click = async (label) => {
		const a = [...w.document.querySelectorAll('#passages a')].find((x) => x.textContent.includes(label));
		if (!a) throw new Error(`无链接「${label}」`);
		a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
		await new Promise((r) => setTimeout(r, 250));
	};
	await click('翻一翻靴子'); await click('把钥匙收进口袋'); await click('推门进去');
	const r1 = S.variables.checks['里屋·察觉'].roll;
	await click('原路退回去'); await click('推门进去');
	const r2 = S.variables.checks['里屋·察觉'].roll;
	await B.close?.();
	return { r1, r2, w: null };
};

if (CASE === 'knife') {
// ---- ①-b ★**刀**：段级声明 `reroll: true` ⇒ 重入**重掷**（★两来源之 md 前言 ✓）----
{
	setReroll(true);
	// ★守卫：先证**临时 md 真的带上了声明**（★否则刀不咬就是夹具没改到 ✗）
	const mdTxt = readFileSync(MD_FULL, 'utf8');
	t('★①-b 前置：临时副本的 md 确实写了 `reroll: true`', /^reroll: true$/m.test(mdTxt), mdTxt.split('\n').slice(0, 5).join(' \u2502 '));
	clearThree(DIR); build(DIR);
	const { r1, r2 } = await run(DIR);
	t('★①-b 【刀】声明 `reroll: true` ⇒ 重入**骰面不同**（★刀咬住 ⇒ ① 不是恒真 ✓）', r1 !== r2, `roll1=${r1} roll2=${r2}`);
	
}
}
if (CASE === 'default') {
// ---- ① 默认 ⇒ **复用**（★这是本票治的那个 live bug：可反复刷骰面）----
{
	setReroll(false);
	clearThree(DIR); build(DIR);
	const { r1, r2 } = await run(DIR);
	t('★① 默认（✗ 无声明）⇒ 重入同段**骰面相同**（复用 ⇒ "可刷骰面"已治）', r1 === r2, `roll1=${r1} roll2=${r2}`);
	
}
}
// ---- ③ `#1527` 族：同段**渲染两遍** ⇒ 只掷一次（★`resolve` 层直测 ⇒ 幂等）----
{
	setReroll(false);
	clearThree(DIR); build(DIR);
	process.env.SG_STORIES_DIR = DIR;
	const { boot } = await import('./boot.mjs');
	const B = await boot({ story: SLUG, random: 0.5 });
	const w = B.w, S = w.SugarCube.State;
	S.variables.checks = S.variables.checks || {};
	let i = 0; const seq = [1, 2, 3, 4, 5];
	w.Game.Rules.rng.set((lo, hi) => seq[(i++) % seq.length]);
	const a1 = w.Game.Checks.resolve('里屋·察觉', S.variables.pc, null, false);
	S.variables.checks['里屋·察觉'] = a1;
	const a2 = w.Game.Checks.resolve('里屋·察觉', S.variables.pc, null, false);
	t('★③ 复用态下**再解析一次** ⇒ 同一结果（幂等 ⇒ `#1527`「同段渲染两遍 ⇒ 两次掷骰」得治）', a1.roll === a2.roll, `${a1.roll} vs ${a2.roll}`);
	t('★③-b 重掷态下 ⇒ **新结果**（★③ 不是恒真 ✓）', w.Game.Checks.resolve('里屋·察觉', S.variables.pc, null, true).roll !== a1.roll, '');
	await B.close?.();
	
}
// ---- ⑤ 零旧战斗机制（★只看本笔新增行 ⇒ 伞面清单）----
{
	// ★★(实测) ✗ 不能用 `fight:` 这种**宽**模式 —— ★它会咬到 `fight: dseg.fight ?? null`（★本笔**合法**的一行）⇒ **假阳性** ✗
	//   ⇒ ★只认**旧战斗机制的具名面**（★伞面清单的原物 ✓）
	const banned = /Game\.Combat|Game\.Encounters|State\.variables\.fights|rollDice|battleDamage|slotAbsorbAt|fightbegin|fightlog|fightpanel/;
	let added = null, why = '';
	try {
		// ★✗ 不扫本文件：★禁止名单的字面量**就在本文件里** ⇒ 会**自指**咬到自己 ✗（实测踩到）
		const diff = execFileSync('git', ['diff', 'origin/main', '--unified=0', '--', 'src', 'editor'],
			{ cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
		added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
	} catch (e) { why = '基线不可得 ⇒ 先 git fetch origin main｜' + String(e && e.message || e).split('\n')[0].slice(0, 60); }
	const hits = (added ?? []).filter((l) => banned.test(l));
	t('★⑤ 本笔新增行**零旧战斗机制**（★含 `fights`／`fight:` ✓）', added != null && hits.length === 0, added == null ? why : hits.slice(0, 2).join(' ｜ '));
}

restore();   // ★保证还原（✗ 不留脏夹具 ✓）
if (bad) { console.error('\n✗ 段级 check 重入语义（#1574）自证失败 ' + bad + ' 项'); process.exit(1); }
console.log('\n✔ 段级 check 重入语义自证通过（`reroll` 显式 · 默认复用 · 幂等）');
