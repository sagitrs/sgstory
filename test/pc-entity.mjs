// ★★ `#1573`（阶 2b · 候选甲·修订形）：**玩家＝实体表里的一条** —— 绑定面 ＋ **payload 级**存档面（★强制验收格 ✓）。
//
// 判据（每条**能假** —— ✗ "改了就算" ✓）：
//   ★① **别名＝同一对象**（✗ 拷贝 ⇒ 不是则**静默分叉** ✗）
//   ★② **非枚举**（`Object.keys` 看不见 ⇒ ★由 ③ 的 JSON 面**实证其因** ✓）
//   ★③ ★**JSON／存档漏斗里没有 `pc` 快照**（★强制验收格的**核心**：★枚举 getter 会被物化成**值快照** ✗
//        ⇒ ★存档里会多一份**死拷贝** ✓ ⇒ "零存档影响"**不成立** ✗）
//   ★④ ★**真 `Save.serialize()` ⇒ `deserialize()` 往返**：★载后 getter **没了**（如预期 ✓）、
//        ★而**没有**遗留那份快照（键级 ✓）、★且 `player()` 的**自愈**能把绑定**恢复** ✓
//   ★⑤ 两个口**语义分列**：`player()`（玩家 ✓）≠ "当前作用实体"的**将来**语义（本笔 `current()` 暂＝`player()` ✓ ——
//        ★战斗轮改由循环设 ⇒ 那一步**另笔** ✓；此处只钉"两口**都在**且**都可读**" ✓）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const GEN = ['00-meta.twee', '15-tables.twee', '17-rules.twee', '19-events.twee'];
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

const W = mkdtempSync(join(tmpdir(), 'sg-pcentity-'));
try {
	const stories = join(W, 'stories');
	cpSync(join(ROOT, 'test/fixtures/m3-actor-fixture/stories'), stories, { recursive: true });
	for (const slug of readdirSync(stories)) for (const f of GEN) { const q = join(stories, slug, f); if (existsSync(q)) rmSync(q); }
	execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
	process.env.SG_STORIES_DIR = stories;   // ★`boot()` 靠它定位产物（★本仓既有夹具测试同法 ✓ —— 我第一版漏了 ⇒ `ENOENT` ✗ 自纠 ✓）
	const { boot } = await import('./boot.mjs');
	const { w } = await boot({ story: 'actor-basic', random: 0.5 });
	const SC = w.SugarCube, S = SC.State.variables, A = w.Sg?.actors ?? w.window?.Sg?.actors;
	t('① 别名＝**同一对象**（✗ 拷贝 ⇒ 静默分叉）', A.player() === S.pc, `player()===${A.player() === S.pc}`);
	t('② 非枚举：`Object.keys(actors)` **看不见** `pc`（★由 ③ 实证其必要性 ✓）', !Object.keys(S.actors).includes('pc'));
	t('③ ★**JSON 漏斗无快照**（★强制验收格核心：枚举 getter 会被物化 ✗）', !JSON.stringify(S.actors).includes('"pc"'));
	t('⑤ 两口都在且都可读（`player()`／`current()` ✓；★语义分列见件头 ✓）', A.current() === S.pc && A.player() === S.pc);
	// ★★ `#1664` 复核 RC（第二条阻塞）：★**`resolve(…, 'pc')` 那支也要自愈** —— ★它是"载档后"唯一会 **fail-loud 抛**
	//   的路（✗ `player()` 已被 ④-c 钉过 ✓）⇒ ★本格钉它：★摘掉 getter ⇒ `resolve` 仍须**回同一对象**（✗ 抛 ✓）
	{
		const d0 = Object.getOwnPropertyDescriptor(S.actors, 'pc');
		try {
			delete S.actors.pc;                                  // ★模拟"载档后"（getter 不在 ✓）
			t('⑦ ★载档态：`resolve(pc, \'pc\')` **自愈** ⇒ 回同一对象（✗ fail-loud 抛 ✓）', A.resolve(S.pc, 'pc') === S.pc);
		} finally { if (!Object.getOwnPropertyDescriptor(S.actors, 'pc')?.get) A.bind(); }
	}

	// ★★ 回退极早路径（★协调席非阻塞建议）：★表未就绪（`StoryInit` 之前／异常态）⇒ `player()` **回退 `$pc`**（✗ 抛 ✓）
	{
		const saved = S.actors;
		try {
			delete S.actors;                                  // ★把表摘掉（模拟"极早"）
			t('⑥-a 表缺 ⇒ `player()` **回退 `$pc`**（✗ 抛、✗ undefined ✓）', A.player() === S.pc);
			t('⑥-b 表缺时 `bind()` ⇒ **false**（✗ 抛 ✓ —— 它只负责"能绑就绑" ✓）', A.bind() === false);
			S.actors = saved;                                 // ★表回来
			t('⑥-c 表回 ⇒ **自愈重绑**（`player()` 恢复同一对象 ✓）', A.player() === S.pc
				&& !!Object.getOwnPropertyDescriptor(S.actors, 'pc')?.get);
		} finally { S.actors = saved; }
	}
	// ④ payload 级往返
	const payload = SC.Save.serialize();
	SC.Save.deserialize(payload);
	const S2 = SC.State.variables, A2 = w.Sg?.actors;
	t('④-a 真 serialize/deserialize 后：getter **没了**（如预期 ✓）', !Object.getOwnPropertyDescriptor(S2.actors, 'pc')?.get);
	t('④-b ★而**没有遗留快照**（键级 —— ★"零存档影响"的实证 ✓）', !Object.prototype.hasOwnProperty.call(S2.actors, 'pc'));
	t('④-c ★`player()` **自愈重绑** ⇒ 载后仍是**同一对象** ✓', A2.player() === S2.pc);
} catch (e) {
	bad++; console.error(`  ✗ 运行期面失败：${String(e.message).slice(0, 160)}`);
} finally { rmSync(W, { recursive: true, force: true }); }

if (bad) { console.error(`\n✗ 玩家实体化（甲）自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 玩家实体化（甲）自证通过（同一对象 · 非枚举 · 无快照 · 载后自愈）');
