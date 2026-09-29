// ★★ `#1573`（阶 2b · 候选甲·修订形）：**玩家＝实体表里的一条** —— 绑定面 ＋ **payload 级**存档面（★强制验收格 ✓）。
//
// 判据（每条**能假** —— ✗ "改了就算" ✓）：
//   ★① **别名＝同一对象**（✗ 拷贝 ⇒ 不是则**静默分叉** ✗）
//   ★② **非枚举**（`Object.keys` 看不见 ⇒ ★由 ③ 的 JSON 面**实证其因** ✓）
//   ★③ ★**JSON／存档漏斗里没有 `pc` 快照**（★强制验收格的**核心**：★枚举 getter 会被物化成**值快照** ✗
//        ⇒ ★存档里会多一份**死拷贝** ✓ ⇒ "零存档影响"**不成立** ✗）
//   ★④ ★**真 `Save.serialize()` ⇒ `deserialize()` 往返**：★载后 getter **没了**（如预期 ✓）、
//        ★而**没有**遗留那份快照（键级 ✓）、★且 `player()` 的**自愈**能把绑定**恢复** ✓
//   ★★ `#1573` 批4（裁定 **丙**）**边界**（★成文于判据旁 ✓）：`actors.pc` 是**非枚举访问器** ⇒
//        ★表的**迭代**与**序列化**（含存档）**都不含** `pc` ✓ ⇒ ★"玩家**不**作为一行被枚举" ✓；
//        ★若将来确需"枚举时把玩家算一行" ⇒ ★**重开乙** ✓（数据与守卫设计见 `#1573`；★✗ 不许只加 `enumerable:true`）
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
	// ★★ `#1573` 批4（裁定：**丙**）：`actors.pc` 别名**补 setter** ⇒ 双向 ✓ ＋ **边界**成文 ✓。三格＋一格：
	{
		const before = S.pc, sentinel = { name: '哨兵' };
		S.actors.pc = sentinel;                       // ★⑧ 写**别名** ⇒ 必须落**真身** `$pc` ✓
		t('⑧ 写别名 `actors.pc` ⇒ 落真身 `$pc`（同一对象 ✓）', S.pc === sentinel, `pc===${S.pc === sentinel}`);
		delete S.actors.pc;                           // ★⑨ delete ⇒ **不许**动真身（裁定：no-op ✓）
		t('⑨ `delete actors.pc` ⇒ **真身不动** ✓（且随后读口**自愈**重装 ✓）',
			S.pc === sentinel && A.player() === sentinel
			&& !!Object.getOwnPropertyDescriptor(S.actors, 'pc')?.get, `pc===${S.pc === sentinel}`);
		S.actors.pc = before;                         // 还原
		// ★★ ⑩ **子键写**（裁定："setter 三格" 的第三格 ✓ —— ★"别名双向"**最常用**的形就是"改玩家某字段" ✓）：
		//   ★判据：★`actors.pc.<key> = n` ⇒ ★真身 `$pc.<key>` **当场可见** ✓ ⇒ ★**同一对象**（✗ 不是拷贝 ✓）
		//   ⇒ ★能假：★把 getter 改成**返回拷贝**（`({...pc})`）⇒ ★本格必红 ✓（★拷贝上写 ⇒ 真身看不见 ✓）
		const SUB = '__probe_sub', had = Object.prototype.hasOwnProperty.call(S.pc, SUB), prevSub = S.pc[SUB];
		S.actors.pc[SUB] = 7;
		t('⑩ **子键写**：`actors.pc.<key> = n` ⇒ 落**真身**（★同一对象 ⇒ ✗ 不是拷贝 ✓）',
			S.pc[SUB] === 7, `pc[SUB]=${S.pc[SUB]}`);
		if (had) S.pc[SUB] = prevSub; else delete S.pc[SUB];
	}
	// ★★ ⑪ 裁定②③的**消解留痕**（★成格，✗ 不只在正文）：★丙 ⇒ **无格式变** ⇒ ★真 payload 键面**一字不动** ✓
	try {
		const o = JSON.parse(w.LZString.decompressFromBase64(SC.Save.serialize()));
		const V = o.state.delta[0]?.variables ?? {};
		t('⑪ **真 payload** 键面 ⇒ 仍 `["era","player_name","pc","actors"]`（★丙 ＝ 无格式变 ⇒ 裁点2/3 消解 ✓）',
			JSON.stringify(Object.keys(V).sort()) === JSON.stringify(['actors', 'era', 'pc', 'player_name']),
			JSON.stringify(Object.keys(V)));
	} catch (e) { t('⑪ 真 payload 解压/取键', false, String(e.message).slice(0, 60)); }

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
console.log('\n✔ 玩家实体化自证通过（甲·修订形；★批4 裁定＝**丙** ⇒ 不翻转存储 ✓ · 同一对象 · 非枚举 · 无快照 · 载后自愈 · 别名双向）');
