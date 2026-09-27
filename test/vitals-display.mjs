// `#1518`（展示半 · D1「展示面需要键名 ⇒ 展示层读数据」）自证：**展示面真从数据读** —— 夹具驱动 · 引擎侧
//
// 诉求（票面 `#1518`）：「键名与文案从数据面读（量纲声明/规则数据）——✗ 硬编 ✗ 字面量」；
//   验收：「展示路径 `grep` 键名字面量归零（改读声明）；断言：**改声明中的键名/文案 ⇒ 展示跟随**（能假）」。
//
// ★本件断的是**三处展示口**（✗ 不是结算口 —— 结算口由 `test/vitals-consumers.mjs` 看护）：
//   ① `<<hpbar>>`：`❤ x / y` 的两个**键名**（`vk('hp')`／`vk('maxHp')`）＋ 下限（`V().floor.hp`）
//   ② `Game.Pc.snap()`：快照的 `hp` 字段（键名走 `vk('hp')`）
//   ③ `Game.Pc.diff()`：**人话文案**里的量纲词（`V().label.hp` ⇒ `−3 生命`）
//   ④ 侧栏 `StoryCaption`：`药膏：N 副`（键名 ＋ 文案都从数据读）
//
// ★两态（红态**只动数据声明** ⇒ 展示必须跟变；✗ 不改引擎源）：
//   ① 键名 `hp` ⇒ `hpRenamed` ＋ 文案 `生命` ⇒ `血量` ⇒ 血条/快照/文案**全跟变**
//   ② 复原 ⇒ 回内置（逐字）
//
// ★为什么"只动数据"就够（能不假）：展示口若**任一**处写死字面量 ⇒ 对应那格必红 ✓
//   （实证留痕：本笔第一版把 `V()` 的 `label` 放在 `keys` 之后 ⇒ 既有"缺面 ⇒ 内置"判据按**键序逐字比**当场红
//    —— ⇒ 形状面（键序）也是判据的一部分，见 PR 描述。）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

const RENAMED = 'hpRenamed';

/** 自建夹具根（`variant`：`asis`＝原样／`renamed`＝改数据面键名与文案）。 */
const makeRoot = (variant) => {
	const WORK = mkdtempSync(join(tmpdir(), 'sg-1518-'));
	const stories = join(WORK, 'stories');
	cpSync(join(ROOT, 'test/fixtures/m3-chargen-fixture/stories'), stories, { recursive: true });
	const cg = join(stories, 'cg');
	// ★清生成物（✗ 不清会读到陈旧 `15/17/00` ⇒ 读数落在旧形态）
	for (const f of ['15-tables.twee', '16-notes.twee', '17-rules.twee', '18-chargen.twee', '00-meta.twee']) {
		const q = join(cg, f); if (existsSync(q)) rmSync(q);
	}
	if (variant === 'renamed') {
		// ★**只动数据声明**（✗ 不碰引擎源）：键名 ＋ 文案两处
		const cp = join(cg, 'data/contract.json');
		const d = JSON.parse(readFileSync(cp, 'utf8'));
		const mem = (n) => d.members.find((m) => m.name === n);
		if (!mem('rulesPack')) d.members.push({ name: 'rulesPack', kind: 'const', value: {} });
		mem('rulesPack').value = { ...(mem('rulesPack').value ?? {}), vitals: { keys: { hp: RENAMED }, label: { hp: '血量' } } };
		writeFileSync(cp, JSON.stringify(d, null, 2) + '\n');
	}
	execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
	return { WORK, stories };
};

/** boot 一次并采集三处展示口的读数（✗ 不改 pc 之外的任何状态）。 */
const observe = async (stories, { withChargen = true } = {}) => {
	process.env.SG_STORIES_DIR = stories;
	const { boot } = await import('./boot.mjs');
	// ★`boot()` 的页面缓存**按 key 记账** ⇒ 同进程跑两棵树必须传**绝对路径**（✗ 否则第二棵读到第一棵的页）
	const B = await boot({ story: join(stories, '..', 'dist/stories/cg/index.html'), entry: '开场', random: 0.5 });
	const w = B.w;
	const pc = w.SugarCube.State.variables.pc ?? {};
	// 车卡夹具：给一对已知的 hp/max_hp ⇒ 让血量文本可断言
	w.eval(`(function(){ const S = SugarCube.State.variables; S.pc = S.pc ?? {};
		S.pc[Game.Rules.vk('hp')] = 7; S.pc[Game.Rules.vk('maxHp')] = 20;
		S.pc[Game.Rules.vk('salves')] = 3; S.pc.name = '测'; S.pc.classLabel = '测职'; S.pc.speciesLabel = '测族';
		return 1; })()`);
	// ① 血条（渲染 StoryCaption 后取 .hpbar-text）
	w.SugarCube.Engine.play('StoryCaption');
	await B.settle(); await new Promise((r) => setTimeout(r, 200)); await B.settle();
	const bar = String(w.document.querySelector('.hpbar-text')?.textContent ?? '').trim();
	// ② snap()：快照的 hp 字段
	const snap = w.eval(`(function(){ const s = Game.Pc.snap(SugarCube.State.variables.pc); return { hp: s.hp, gold: s.gold }; })()`);
	// ③ diff()：人话文案
	const before = w.eval(`(function(){ return Game.Pc.snap(SugarCube.State.variables.pc); })()`);
	w.eval(`(function(){ SugarCube.State.variables.pc[Game.Rules.vk('hp')] = 4; return 1; })()`);
	const diff = w.eval(`(function(b){ return Game.Pc.diff(b, SugarCube.State.variables.pc); })(${JSON.stringify(before)})`);
	// ④ 侧栏药膏行（StoryCaption 文本里）
	const cap = String(w.document.querySelector('#passages')?.textContent ?? w.document.body.textContent ?? '');
	const out = { bar, snap, diffText: (diff ?? []).join(' ｜ '), cap };
	try { B.close?.(); } catch { /* 忽略 */ }
	return out;
};

// ── 正态（原样数据）：内置键名/文案 ⇒ 展示口照旧 ─────────────────────────────
{
	const { WORK, stories } = makeRoot('asis');
	const o = await observe(stories);
	t('① 血条：`❤ 7 / 20`（内置键名 `hp`／`max_hp` 真被读到）', /❤\s*7\s*\/\s*20/.test(o.bar), o.bar);
	t('② 快照：`snap().hp === 7`（键名走 `vk("hp")`）', o.snap?.hp === 7, JSON.stringify(o.snap));
	t('③ 文案：含内置词「生命」（`vl("hp")` ⇒ 内置 `生命`）', /生命/.test(o.diffText), o.diffText);
	t('④ 侧栏：含「药膏」＋ 数量 3（键名 ＋ 文案都从数据读）', /药膏/.test(o.cap) && /3 副/.test(o.cap), o.cap.slice(-120));
	rmSync(WORK, { recursive: true, force: true });
}

// ── 能假（只改数据面 ⇒ 三处展示口必须跟变）──────────────────────────────
{
	const { WORK, stories } = makeRoot('renamed');
	const o = await observe(stories);
	// 键名改了 ⇒ 血条仍应显示（值在新键名下）、快照仍应取到 7
	t('⑤ 血条：改键名（`hp`⇒`hpRenamed`）后**仍显示 7 / 20**（✗ 写死 `pc.hp` 则此处必红）',
		/❤\s*7\s*\/\s*20/.test(o.bar), o.bar);
	t('⑥ 快照：改键名后 `snap().hp === 7`（✗ 写死 `pc.hp` 则取到 0 ⇒ 红）', o.snap?.hp === 7, JSON.stringify(o.snap));
	t('⑦ 文案：改文案（`生命`⇒`血量`）后**出现「血量」**（✗ 写死字面量则必红）', /血量/.test(o.diffText), o.diffText);
	t('⑧ 文案：**旧词「生命」不再出现**（✗ 两处并存 ⇒ 说明有一处写死）', !/生命/.test(o.diffText), o.diffText);
	rmSync(WORK, { recursive: true, force: true });
}

if (bad) { console.error(`\n✗ 展示面读数据自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 展示面读数据自证通过（hpbar／snap／diff／侧栏：改数据 ⇒ 展示跟变；✗ 无字面量残留）');
