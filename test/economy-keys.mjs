// ★ `#1530`（`#1487`/`#1518` 同族）：**economy 键名声明面** —— `gold` 的结算＋展示同笔去硬编。
//
// 判据（照 `test/vitals-migrate-chargen.mjs` 的形 —— ★**改声明 ⇒ 结算＋展示同时跟变**）：
//   ① ★**零声明 ＝ 今天逐位同**（`ek('gold')='gold'`／`el('gold')='金币'` ⇒ 既有行为零变化）
//   ② ★**改声明** ⇒ ① `ek()` 跟变 ② `snap().gold` 读到**改名后的键**（✗ 不是旧 `pc.gold`）
//                       ③ `diff()` 文案跟变（★声明 `label` 生效）
//   ③ ★**结算点跟变**：`Economy.apply` 落账到**声明给的键**
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { maskComments } from '../editor/lib/core/mask.mjs';   // ★ `#1530` CR：★剥注释走**仓内唯一掩蔽器** ✓

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

// ★自建夹具根。用 `m3-chk-e2e`：它同时有 `econEvents`（⇒ 结算口可真跑）与可注入的 `rulesPack` ✓
const WORK = mkdtempSync(join(tmpdir(), 'sg-ek-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-chk-e2e/stories'), stories, { recursive: true });
const NR = join(stories, 'north-room');
const cp = join(NR, 'data/contract.json');
const d0 = JSON.parse(readFileSync(cp, 'utf8'));

/** 写入 `rulesPack` 声明 ⇒ 重编 ⇒ 重建（★三件齐了才会发射，照 `vitals-migrate` 形） */
const setPack = (val) => {
	const d = JSON.parse(JSON.stringify(d0));
	const mem = (n) => d.members.find((m) => m.name === n);
	if (!mem('rulesPack')) d.members.push({ name: 'rulesPack', kind: 'const', value: {} });
	mem('rulesPack').value = val;
	writeFileSync(cp, JSON.stringify(d, null, '\t') + '\n');
	for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) { const q = join(NR, f); if (existsSync(q)) rmSync(q); }
	execFileSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), 'north-room', `--out=${NR}/`], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
	execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
};
process.env.SG_STORIES_DIR = stories;

/** ★每次 boot 前重新 import：`dist-paths` 在 import 时把 DIST_DIR 算死（同 `#1488` 那个坑）⇒ cache-busting ✓ */
const freshBoot = async () => {
	const { boot } = await import('./boot.mjs?t=' + Date.now());
	return boot({ story: 'north-room', random: 0.5 });
};

console.log('══ economy 键名声明面（#1530）══');

// ── ① 零声明 ＝ 今天逐位同 ──
setPack({});
{
	const w = (await freshBoot()).w;
	t('① 零声明：`ek(\'gold\')` = `gold`（★今天逐位同）', w.eval("window.Game.Rules.ek('gold')") === 'gold');
	t('① 零声明：`el(\'gold\')` = `金币`（★今天逐位同）', w.eval("window.Game.Rules.el('gold')") === '金币');
	t('① 键序同族：`E()` ＝ `keys,label`（★✗ 不掺别的 ✓）',
		w.eval("Object.keys(window.Game.Rules.E()).join(',')") === 'keys,label');
}

// ── ②③ 改声明 ⇒ 三处同时跟变 ──
setPack({ economy: { keys: { gold: 'goldRenamed' }, label: { gold: '银币' } } });
{
	const w = (await freshBoot()).w;
	t('② 改声明：`ek(\'gold\')` ⇒ `goldRenamed`（★键名从数据读）', w.eval("window.Game.Rules.ek('gold')") === 'goldRenamed');
	t('② 改声明：`el(\'gold\')` ⇒ `银币`（★文案从数据读）', w.eval("window.Game.Rules.el('gold')") === '银币');
	// ★展示面：snap 读改名后的键（★故意把旧键设成别的值 ⇒ 读错即露）
	const snap = w.eval(`(function(){ const pc=window.SugarCube.State.variables.pc;
		pc[window.Game.Rules.ek('gold')] = 42; pc.gold = 999;
		return window.Game.Pc.snap(pc).gold; })()`);
	t('② 展示：`snap().gold` **读到改名后的键**（✗ 不是旧 `pc.gold`=999）', snap === 42, '实得 ' + snap);
	const diff = w.eval(`(function(){ const pc=window.SugarCube.State.variables.pc;
		const K = window.Game.Rules.ek('gold'); pc[K] = 42;
		return window.Game.Pc.diff({ [K]: 40 }, pc).join('｜'); })()`);
	t('② 展示：`diff()` 文案用**声明的**（`银币` ✗ 不是 `金币`）', String(diff).includes('银币'), String(diff));
	// ★③ 结算：Economy.apply 落账到声明给的键
	const r = w.eval(`(function(){ const pc=window.SugarCube.State.variables.pc;
		const K = window.Game.Rules.ek('gold');
		pc[K] = 0; pc.gold = 0;
		const E = window.Game.Economy;
		const ids = Object.keys(E.econEvents?.() ?? {});
		if (!ids.length) return 'no-econ';
		const before = pc[K];
		E.apply(pc, ids[0]);
		return JSON.stringify({ K, before, atK: pc[K], atOld: pc.gold, id: ids[0] });
	})()`);
	// ★★判据要**真判**（✗ 不许 `no-econ` 兜底放过 —— ★那会让本格恒真 ✗）：
	//   ★夹具已声明 `Economy.events`（一件）⇒ ★`apply` 必落账 ⇒ ★断**旧键仍为 0**（★读错键会非 0 ✓）
	t('③ 结算：`Economy.apply` 落账到**声明给的键**（✗ 不写旧 `pc.gold`）',
		(() => { const o = JSON.parse(String(r)); return o.atK !== 0 && o.atOld === 0; })(), String(r));
}

// ── ④ ★★**全仓无硬编**（★把“我自扫”变成**判据** —— ✗ 靠眼力 ✗）──
//   ★★为什么非要有这一格：★我第一版只用 `grep -rn 'pc.gold'` 自扫
//     ⇒ ★★**漏了 `pc?.gold`**（★可选链）＋ 漏了 **文案字面“金币”**（★共 **5 处**）✗
//   ★正解：★把**模式写全**（`pc?.gold` 也算）+ **必须剥注释**（★✗ 然后对每处判“语义面→键名 / 展示面→文案 / 声明面→该留”）✓
{
	const { execFileSync } = await import('node:child_process');
	const files = execFileSync('git', ['ls-files', 'src/'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
	// ★★ `#1530` CR（developer-10）：★旧写法只剥**整行** `// …`（`^\s*\/\/`）
	//   ⇒ ★**行尾** `code; // 说明` 的部分**剥不掉** ⇒ ★它里面的 `pc.gold`／`金币` 被当**代码**
	//   ⇒ ★★**本格恒红**（★实测：9 命中**全是注释** ✗）—— ★而它看起来像“真发现了 9 处硬编” ✗
	//   ★正解：★**复用仓内唯一的掩蔽器 `maskComments`**（★✗ 自写逐行正则
	//     —— ★“**逐行正则剥注释＝假信号**”本仓已有记账 ✗）✓
	const CODE = (raw, file) => maskComments(raw, { file, twee: true });
	const hits = [];
	for (const f of files) {
		const code = CODE(readFileSync(join(ROOT, f), 'utf8'), f);
		code.split('\n').forEach((l, i) => {
			// ★键名面：★`pc.gold`／`pc?.gold`／`pc['gold']` 等硬编
			if (/pc\??\.gold|pc\[\s*['"]gold['"]\s*\]/.test(l)) hits.push([f, i + 1, '键名', l.trim()]);
			// ★文案面：★字面 `金币`（★**声明面那一行除外** —— 它**就是**缺省值 ✓）
			if (/金币/.test(l) && !/label:\s*\{\s*gold:/.test(l)) hits.push([f, i + 1, '文案', l.trim()]);
		});
	}
	t('④ ★**全仓无硬编**（键名面 `pc?.gold` 也算；文案面 `金币` 字面；★声明面那行除外）',
		hits.length === 0, hits.slice(0, 4).map((h) => `${h[0]}:${h[1]}(${h[2]})${h[3].slice(0, 60)}`).join(' ｜ '));
}

if (bad) { console.error(`\n✗ economy 键名面自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ economy 键名面自证通过（零声明逐位同／改声明 ⇒ 结算＋展示同时跟变）');
rmSync(WORK, { recursive: true, force: true });
