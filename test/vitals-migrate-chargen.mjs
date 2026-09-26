// `#1487` ⑤ 前收尾自证：**`migrate()` 兜底 与 车卡 `finalize` 都按名取值** —— 引擎侧 · fixture 驱动
//
// ★两处都要"能假"（T 的口径：★改回写死 ⇒ 必红 ✓）：
//   ① `migrate()` 兜底（`80-script`）：键名走 `vk()` ⇒ ★改 `vitals.keys.hp` ⇒ 兜底写到**新键名** ✓
//   ② 车卡 `finalize` 公式：参数走 `chargen` 面 ⇒ ★改 `chargen` 的参数 ⇒ `max_hp` **跟变** ✓
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-vmc-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-chargen-fixture/stories'), stories, { recursive: true });
const CG = join(stories, 'cg');
const cp = join(CG, 'data/contract.json');
const d = JSON.parse(readFileSync(cp, 'utf8'));
// ★改造：① `vitals.keys.hp` 改名 ⇒ ② `chargen` 面加参数（`hpBase`／`hpPerCon`）
const mem = (n) => d.members.find((m) => m.name === n);
if (!mem('rulesPack')) d.members.push({ name: 'rulesPack', kind: 'const', value: {} });
mem('rulesPack').value = { ...(mem('rulesPack').value ?? {}), vitals: { keys: { hp: 'hpRenamed' } } };
// ★★ 注意：`chargen` 是 **`forward`**（转发到 `Sg.story.chargen` ⇒ 数据在 `data/chargen.json`）
//   ⇒ ★**契约里塞 `value` 无效**（我第一版就这么写 ⇒ 格红 —— ★而它**红得对**：说明参数确实没走契约 ✓）
const cjp = join(CG, 'data/chargen.json');
const cj = JSON.parse(readFileSync(cjp, 'utf8'));
cj.hpBase = 30; cj.hpPerCon = 3;
writeFileSync(cjp, JSON.stringify(cj, null, '\t') + '\n');
writeFileSync(cp, JSON.stringify(d, null, '\t') + '\n');
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) { const q = join(CG, f); if (existsSync(q)) rmSync(q); }
execFileSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), 'cg', `--out=${CG}/`], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'cg', random: 0.5 });
const w = B.w;
let bad = 0;
const t = (l, ok, d2 = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d2 ? ' —— ' + d2 : ''}`); } };

t('① 前提：`vitals.keys.hp` 已改名（`hpRenamed`）＋ `chargen` 参数在位（✗ 否则本件没对象 ✓）',
	w.eval('Game.Rules.vk("hp")') === 'hpRenamed' && !!w.eval('Sg.story.chargen && Sg.story.chargen()'),
	`vk=${w.eval('Game.Rules.vk("hp")')}`);

// ★② `migrate()` 兜底写到**新键名**（✗ 不是写死 `hp`）
{
	// ★★ 驱动方式（我第一版错）：★兜底**不在 `migrate()` 里面** —— 它在 **`:passagestart` 钩子**里
	//   （`Game.Pc.migrate(pc)` 之后：`if (pc.abilities) { …兜底… }` ⇒ 见 `80-script` 的钩子体 ✓）
	//   ⇒ ★故必须**驱动真钩子**（✗ 不能直调 `migrate` —— 那样永远测不到兜底 ✓）
	const got = w.eval(`(function(){
		const R = Game.Rules, k = R.vk('hp'), km = R.vk('maxHp');
		const real = SugarCube.State.variables.pc;
		const fake = { name:'x', abilities: { con: 10 }, skills: [], picked: [], round: 0, ev: {},
			[km]: NaN, [k]: NaN };
		SugarCube.State.variables.pc = fake;
		try { jQuery(document).trigger(':passagestart'); } finally { SugarCube.State.variables.pc = real; }
		return JSON.stringify({ hp: fake[k], maxHp: fake[km] });
	})()`);
	const o = JSON.parse(String(got));
	t('★★② `migrate()` 兜底写到 **`vk(\'hp\')` 给的键名**（✗ 不是写死 `hp` —— 能假：改名后写死会落错键 ✓）',
		Number.isFinite(o.hp) && Number.isFinite(o.maxHp) && o.hp > 0, got);
}
// ★③ 车卡 `finalize`：参数读 `chargen` 面（`hpBase=30`／`hpPerCon=3`）
{
	const got = w.eval(`(function(){
		const pc = { name:'x', abilities:{ con: 12 }, skills:[], picked:[], round: 0, classHp: undefined };
		Game.Chargen.finalize(pc);
		const R = Game.Rules;
		return JSON.stringify({ maxHp: pc[R.vk('maxHp')], hp: pc[R.vk('hp')] });
	})()`);
	const o = JSON.parse(String(got));
	// con=12 ⇒ mod = (12-10)/2 = 1 ⇒ maxHp = 30 + 1*3 = 33（★若写死 8/2 ⇒ 8 + 1*2 = 10 ⇒ 本格必红 ✓）
	t('★★③ 车卡 `finalize` 的**参数读 `chargen` 面**（`hpBase=30`／`hpPerCon=3` ⇒ `maxHp` 应为 **33** ✓）',
		o.maxHp === 33, `实得 maxHp=${o.maxHp}（写死 8/2 会是 10）`);
	t('★③附：`hp` 与 `maxHp` 同步（同一量纲族的两个键都走 `vk()` ✓）', o.hp === o.maxHp, JSON.stringify(o));
}
if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ vitals 收尾自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ vitals 收尾通过（migrate 兜底与车卡公式都按名/按数据取值）');
