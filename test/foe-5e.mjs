// 敌人实例 · 5e 核心门（`#705` 片二／`#702` a2）
//
// 为什么需要这道门：`#705` 片一把"敌人必须有属性"（hp/ac/attack）钉在了**声明面**，但**运行时**
// 一直没接线 —— 战斗仍是"二元命中 + 计数"（`waveRecord(pc, success)` ＋ `hits`），敌人**永远打不死**。
// 于是所有部位/耐久/异常机制（S1–S4）在洞窟里**根本没机会被触发**（操作者：「敌人太简单…无法测试到上面那些机制」）。
//
// 本门钉的就是那条接缝的四件事（缺一件，玩家侧的表现就会退回去）：
//   ① **实例化**：声明了 `enemies` 的波在开局时有真实实例 `{ id, hp }`（属性**不落实例**，只住声明面）；
//   ② **5e 攻击骰**：玩家 `d20 + 属性调整 + 熟练` vs `foe.ac`；敌人 `d20 + attack.bonus` vs **`pc.ac`**
//      （`pc.ac = 10 + dexMod + Σ 护具.ac`）；天然 20／1 的必中必失；
//   ③ **伤害落部位**：敌人伤害经 **`slotAbsorbAt`**（减成 → 护具耐久吸收 → 溢出落 HP）；
//   ④ **全灭通关**：当前波 `foes` 清空 ⇒ `advance`／末波 ⇒ `cleared`，**`hits` 不再参与**（`#702` 判据⑦）。
//
// 反例（"能红"的机械证据，PR 里逐条实测）：
//   · 把 `waveRecord` 的敌人分支删掉（退回 `hits` 计数）⇒ 判据④ 立刻红（`success=false` 时不该 cleared）；
//   · 把 `foeStrike` 的 `AC` 比较改成"恒命中"⇒ 判据② 红；把 `foeHit` 的 `slotAbsorbAt` 换成直落 HP ⇒ 判据③ 红；
//   · 敌人 `hp=999` ⇒ **必须打不完**（必然 `failed`）——防"门绿但敌人永远打不死"（`#557` 同族）。
//
// 用法：node test/foe-5e.mjs [--selftest]

import { boot } from './boot.mjs';

let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`  ✓ ${label}`);
	else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); }
};

/** 纯算术的**判定**部分（便于自证；真机路径仍走引擎）。 */
export const judgeAttack = ({ roll, mod, ac, natural }) => {
	if (natural === 20) return { hit: true, crit: true, fumble: false };
	if (natural === 1) return { hit: false, crit: false, fumble: true };
	return { hit: roll + mod >= ac, crit: false, fumble: false };
};

if (process.argv.includes('--selftest')) {
	// 自证只钉"判定算术"这一小块（真机行为由下面的真产物探针钉）
	const cases = [
		['天然 20 必中（哪怕总和不敌 AC）', judgeAttack({ roll: 20, mod: 0, ac: 30, natural: 20 }).hit === true],
		['天然 1 必失（哪怕总和远超 AC）', judgeAttack({ roll: 1, mod: 20, ac: 5, natural: 1 }).hit === false],
		['平手算中（5e：`>= AC`）', judgeAttack({ roll: 10, mod: 2, ac: 12, natural: 10 }).hit === true],
		['差 1 算不中', judgeAttack({ roll: 10, mod: 1, ac: 12, natural: 10 }).hit === false],
	];
	for (const [label, cond] of cases) { if (!cond) { bad++; console.error(`  ✗ 自证·${label}`); } else console.log(`  ✓ 自证·${label}`); }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（判定算术 4 条）');
	process.exit(0);
}

console.log('══ 敌人实例 · 5e 核心门（#705 片二／#702 a2）══');

// ── 故事 1：**未声明** enemies ⇒ 旧二元模式（逐字节；`fight-seq` 基线不变）──────────────
{
	const { w, close } = await boot({ story: 'mist-forest', random: 0.5 });
	const foes = w.eval('(() => { const p = Game.Combat.wavePlan ? Game.Combat.waveFoeIds("short", 0) : undefined; return p === undefined ? "undefined" : JSON.stringify(p); })()');
	ok('故事 1：`waveFoeIds` ⇒ null（未声明 ⇒ 旧二元模式，`hits` 口径）', foes === 'null', String(foes));
	close();
}

const { w, close } = await boot({ story: 'hollow-cave', random: 0.5 });
/** 在页面上下文里跑一段，返回 JSON（`pc` 由页面取）。 */
const E = (code) => JSON.parse(JSON.stringify(w.eval(`(() => { const pc = window.SugarCube.State.variables.pc; ${code} })()`) ?? null));
/** 固定 RNG：`hi` ＝ 恒最大（天然 20 ⇒ 必中）；`lo` ＝ 恒最小（天然 1 ⇒ 必失）。 */
const FIX_MAX = 'Game.Rules.rng.set((lo, hi) => hi);';
const FIX_MIN = 'Game.Rules.rng.set((lo, hi) => lo);';
const FREE = 'Game.Rules.rng.reset();';

// ── 前提：声明面已就位（片一）＋ 本波真的引用了敌人 ────────────────────────────────
ok('前提：`enemies` 声明 ≥2 种（片一）', E('return Object.keys(Sg.story.mechanics().enemies)').length >= 2);
ok('前提：`short` 波**声明了** enemies（本模式的唯一开关）', E('return Game.Combat.waveFoeIds("short", 0)') !== null);
ok('前提：`long` 两波都声明了 enemies', E('return [Game.Combat.waveFoeIds("long", 0), Game.Combat.waveFoeIds("long", 1)]').every((x) => x !== null));

// ── ① 实例化：开局就有真实实例；属性**只住声明面** ────────────────────────────────
{
	const o = E(`${FIX_MAX} Game.Combat.waveBegin(pc, "short"); Game.Combat.foeSpawn(pc, 0); return { foes: pc.ev.fight.wave.foes, declared: Sg.story.mechanics().enemies["洞窟鼠"].hp };`);
	ok('① 开局（`waveBegin` ＋ 显式 `foeSpawn`）按声明**实例化**（数量＝声明里的敌人个数）',
		Array.isArray(o.foes) && o.foes.length === E('return Game.Combat.waveFoeIds("short", 0).length'),
		JSON.stringify(o.foes));
	ok('① 实例只存**可变**状态 `{ id, hp }`（hp 取声明值；ac/骰式不落实例 —— 属性住声明面）',
		o.foes.every((f) => f.hp === o.declared) && o.foes.every((f) => Object.keys(f).sort().join(',') === 'hp,id'),
		JSON.stringify(o.foes));
	const o2 = E('Sg.story.mechanics().enemies["洞窟鼠"].hp = 7; pc.ev.fight = { wave: { encounter: "short", idx: 1, hits: 0, rounds: 0 } }; Game.Combat.foeSpawn(pc, 0); const r = pc.ev.fight.wave.foes; Sg.story.mechanics().enemies["洞窟鼠"].hp = 4; return r;');
	ok('① 改声明 `hp` ⇒ 实例跟着变（**单一权威**：数值只从声明面读）', o2.every((f) => f.hp === 7), JSON.stringify(o2));
}

// ── ② 玩家攻击：5e 攻击骰 vs `foe.ac`；命中 ⇒ 骰式伤害 ⇒ 归零 **退场** ──────────────
{
	const spawn = () => E(`${FIX_MAX} Game.Combat.waveBegin(pc, "short"); Game.Combat.foeSpawn(pc, 0); return pc.ev.fight.wave.foes.length;`);
	const n0 = spawn();
	const s = E(`const before = JSON.stringify(pc.ev.fight.wave.foes);
		const r = Game.Combat.foeStrike(pc, { ability: "str", dmg: "1d4+1" });
		const pure = JSON.stringify(pc.ev.fight.wave.foes) === before;      // **纯**：不自己写 pc
		pc.ev.fight.wave.foes = r.foes;                                    // 契约：调用方写回
		return { r, pure, left: pc.ev.fight.wave.foes.length };`);
	ok('② `foeStrike` 是**纯**函数（返回新列表；`pc` 由调用方写 —— 与 `slotAbsorbAt` 同口径）', s.pure === true);
	ok('② 天然 20 ⇒ 必中（`crit`）', s.r.hit === true && s.r.crit === true, JSON.stringify(s.r));
	ok('② 命中 ⇒ 骰式伤害（1d4+1 最大 5 ×2 ＝ 10）', s.r.dmg === 10, JSON.stringify({ dmg: s.r.dmg }));
	ok('② `ac` 取声明面（`foe.ac`，不是默认值）', s.r.ac === E('return Sg.story.mechanics().enemies["洞窟鼠"].ac'));
	ok('② HP 归零 ⇒ **退场**（实例数 −1）', s.r.down === true && s.left === n0 - 1, JSON.stringify({ down: s.r.down, left: s.left, n0 }));
	const miss = E(`${FIX_MIN} const r = Game.Combat.foeStrike(pc, { ability: "str", dmg: "1d4+1" }); return r;`);
	ok('② 天然 1 ⇒ 必失（不掉血）', miss.hit === false && miss.dmg === 0 && miss.down === false, JSON.stringify(miss));
}

// ── ④ 全灭通关：`success=false` 也必须 cleared（`hits` **不再参与** ⇒ 判据⑦）────────
{
	const o = E(`${FIX_MAX} Game.Combat.waveBegin(pc, "short"); Game.Combat.foeSpawn(pc, 0);
		let guard = 0;
		while (pc.ev.fight.wave.foes.length && guard++ < 20) pc.ev.fight.wave.foes = Game.Combat.foeStrike(pc, { ability: "str", dmg: "1d4+1" }).foes;
		const before = pc.ev.fight.wave.foes.length;
		const ph = Game.Combat.waveRecord(pc, false).phase;      // 故意传 false：旧口径会判 failed
		return { before, ph, hits: pc.ev.fight.wave.hits };`);
	ok('④ 敌人全灭 ⇒ `waveRecord(pc, false)` 仍判 **cleared**（`hits` 退场）', o.before === 0 && o.ph === 'cleared', JSON.stringify(o));
	ok('④ `hits` 在敌人模式下不再累积（恒 0 ⇒ 显示面不得再拿它当进度）', o.hits === 0, JSON.stringify(o));
}

// ── ⑤ 反例：敌人 `hp=999` ⇒ **必须打不完**（必然 failed，不许"照样过关"）──────────
{
	const o = E(`${FIX_MAX} Sg.story.mechanics().enemies["洞窟鼠"].hp = 999;
		Game.Combat.waveBegin(pc, "short"); Game.Combat.foeSpawn(pc, 0);
		const plan = Game.Combat.wavePlan("short");
		let ph = "continue";
		for (let i = 0; i < plan.rounds && ph === "continue"; i++) { pc.ev.fight.wave.foes = Game.Combat.foeStrike(pc, { ability: "str", dmg: "1d4+1" }).foes; ph = Game.Combat.waveRecord(pc, true).phase; }
		Sg.story.mechanics().enemies["洞窟鼠"].hp = 4;
		return { ph, alive: pc.ev.fight.wave.foes.length, rounds: plan.rounds };`);
	ok('⑤ 反例：`hp=999` ⇒ 回合用尽判 **failed**（不会静默通关）', o.ph === 'failed' && o.alive > 0, JSON.stringify(o));
}

// ── ③ 敌人攻击：`d20 + attack.bonus` vs `pc.ac`；伤害经 `slotAbsorbAt` 落**部位** ───
{
	const ac = E('return Game.Combat.pcAC(pc)');
	ok('③ `pc.ac = 10 + dexMod + Σ 护具.ac`（护具 AC 住声明面）', typeof ac === 'number' && ac >= 10, String(ac));
	const h = E(`${FIX_MAX} const r = Game.Combat.foeHit(pc, "洞窟鼠"); return r;`);
	ok('③ 敌人攻击用**同一个** `pc.ac`（不是另行硬编码）', h.ac === ac, JSON.stringify({ ac: h.ac, pcAC: ac }));
	ok('③ 命中 ⇒ 部位 ∈ 声明的 `attack.parts`', h.hit === true && E('return Sg.story.mechanics().enemies["洞窟鼠"].attack.parts').includes(h.part), JSON.stringify({ part: h.part }));
	ok('③ 伤害经 **`slotAbsorbAt`**（返回减成/吸收/落 HP 三段，不是直落 HP）',
		h.absorb && typeof h.absorb.toHp === 'number' && typeof h.absorb.absorbed === 'number' && 'gear' in h.absorb && 'gearHp' in h.absorb,
		JSON.stringify(h.absorb));
	// 判据③的强形态：**指定部位**有护具 ⇒ 减成生效 ＋ 护具耐久真被磨
	const wear = E(`${FIX_MAX}
		Sg.story.mechanics().enemies["洞窟鼠"].attack.parts = ["躯干"];
		Sg.story.mechanics().equipment["破布衣"].ac = 1;
		pc.gear = ["破布衣"];
		pc.gearHp = { 破布衣: 3 };
		const r = Game.Combat.foeHit(pc, "洞窟鼠");
		Sg.story.mechanics().enemies["洞窟鼠"].attack.parts = ["腿", "手臂"];
		return { r, maxHp: Sg.story.mechanics().equipment["破布衣"].maxHp };`);
	ok('③ 有护具的部位：`reduce` 生效（flat 减成）', wear.r.absorb.reduce === 1, JSON.stringify(wear.r.absorb));
	ok('③ 余量由护具**耐久**吸收（`gearHp` 真被磨）', wear.r.absorb.absorbed > 0 && wear.r.absorb.gearHp === 3 - wear.r.absorb.absorbed, JSON.stringify(wear.r.absorb));
	ok('③ 护具 AC 也参与 `pcAC`（10 + dex + 声明 ac —— 与**起始配装**无关地成立）',
		E('return Game.Combat.pcAC(pc)') === E('return 10 + Game.Rules.abilityMod(pc, "dex") + 1'),
		`现在=${E('return Game.Combat.pcAC(pc)')}（起始 ac=${ac}）`);
	// 结构畸形必须报错（不是静默算 0）
	const threwAc = E('Sg.story.mechanics().equipment["破布衣"].ac = "x"; let t = false; try { Game.Combat.pcAC(pc); } catch (e) { t = true; } Sg.story.mechanics().equipment["破布衣"].ac = 1; return t;');
	ok('③ 护具 `ac` 非数字 ⇒ **报错**（结构畸形不许静默当 0）', threwAc === true);
	E('pc.gear = []; pc.gearHp = {};');
}

// ── 形状 fail-loud：未声明的敌人／缺字段 ⇒ 点名报错 ──────────────────────────────
{
	const bad1 = E('let t = ""; try { Game.Combat.enemyDef("幽灵"); } catch (e) { t = e.message; } return t;');
	ok('形状：引用**未声明**的敌人 ⇒ 报错并点名', /幽灵/.test(bad1), bad1);
	const bad2 = E('const d = Sg.story.mechanics().enemies["洞窟鼠"]; const save = d.hp; d.hp = 0; let t = ""; try { Game.Combat.foeSpawn(pc, 0); } catch (e) { t = e.message; } d.hp = save; return t;');
	ok('形状：`hp` 非正数 ⇒ 报错（不是"永不死"或"一碰就死"）', /hp/.test(bad2), bad2);
	const bad3 = E('let t = ""; try { Game.Combat.foeStrike({ ev: { fight: { wave: { encounter: "short", idx: 1, hits: 0, rounds: 0 } } } }, {}); } catch (e) { t = e.message; } return t;');
	ok('形状：没有实例就 `foeStrike` ⇒ 报错（调用方必须先 `foeSpawn`）', /敌人实例/.test(bad3), bad3);
}

E(FREE);
close();

if (bad) {
	console.error(`\n✗ 敌人实例 · 5e 门未通过（${bad} 项）—— 敌人必须**真的会掉血/会死**，攻击必须走攻击骰与 AC，`);
	console.error('  伤害必须落部位（否则部位/耐久/异常三套机制在洞窟里永远触发不到：`#705`／`#702`）。');
	process.exit(1);
}
console.log('\n✔ 敌人实例 · 5e 门通过（实例化／攻击骰 vs AC／伤害落部位／全灭通关／形状 fail-loud）');
process.exit(0);
