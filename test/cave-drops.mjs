// `#600`：**战斗钥匙掉落**的真机回归门 —— 声明面驱动（长战斗必掉 · 短战斗 30%）。
//
// 为什么需要它：已定 ③（`#489`）要求「钥匙：长战斗必掉、短战斗 30% ⇒ 降为 0」，但交付时**掉落那一半没落地**——
// 钥匙只有「矿洞」一条来源（随机 1/5 的洞窟 × 玩家是否走那条路）⇒ 宝箱的钥匙路**可达性靠运气**。
// 而"规则只活在散文里"是本仓反复踩的坑 ⇒ 本门同时钉住**声明面**（`encounters.*.reward.item`）与**行为**：
//   ① 长战斗清完 ⇒ `inv['钥匙']`（真机点完，不是看代码里写着"必掉"）；
//   ② 短战斗掉落频率 ≈ 30%（**多种子**复算，3σ 内）——同样不许拿"代码里有 30"当证据；
//   ③ 行为**由声明面驱动**：改声明 ⇒ 行为跟着变（把 `chance` 改成 1/100 立刻可验）；
//   ④ 幂等／与矿洞来源不冲突：同一局重复得钥匙不异常、金币照加。
import { boot } from './boot.mjs';

let bad = 0;
const ok = (cond, msg, extra = '') => {
	if (cond) console.log(`      ✓ ${msg}`);
	else { bad++; console.error(`      ✗ ${msg}${extra ? '：' + extra : ''}`); }
};

/** 纯函数：观测频率是否与声明概率在 `k` 个标准差内（**自证**用：喂已知命中数）。 */
export const rateWithin = (hits, n, p, k = 3) => {
	if (!(n > 0)) return false;
	const sigma = Math.sqrt((p * (1 - p)) / n);
	return Math.abs(hits / n - p) <= k * sigma;
};

console.log('══ 战斗钥匙掉落门（#600）══');

// ── 自证（纯函数）：正例在 3σ 内、反例（明显偏）必须判红 ──
{
	const N = 8000;
	ok(rateWithin(Math.round(0.30 * N), N, 0.30), '自证·正例：命中率 = 声明值 ⇒ 在 3σ 内');
	ok(!rateWithin(Math.round(0.50 * N), N, 0.30), '🔴 自证·反例：命中率 0.50 vs 声明 0.30 ⇒ 判红（门有牙）');
	ok(!rateWithin(0, 0, 0.30), '自证·边界：样本为 0 ⇒ 判红（不是"通过"）');
}

const { w, sleep } = await boot({ story: 'hollow-cave', random: 0.99 });
const S = w.SugarCube.State.variables;
const mech = () => w.eval('JSON.stringify(SugarCube.State.variables.Sg?.story?.mechanics?.() ?? null)') && w.Sg.story.mechanics();

// ── ① 声明面归一化：`{ id, chance }` 与 `'道具'`（＝必掉）两种形状 ──
{
	const short = w.Game.Combat.encounterReward('short');
	const long = w.Game.Combat.encounterReward('long');
	ok(short.item?.id === '钥匙' && short.item?.chance === 30, '短战斗声明：钥匙 30%（`{ id, chance }` 形）', JSON.stringify(short));
	ok(long.item?.id === '钥匙' && long.item?.chance === 100, '长战斗声明：钥匙必掉（字符串形归一化为 chance=100）', JSON.stringify(long));
	ok(short.gold > 0 && long.gold > 0, '金币仍在同一声明面（`reward.gold` 未被改动）', JSON.stringify({ short: short.gold, long: long.gold }));
}

// ── ② 真机：长战斗清完 ⇒ 拿到钥匙（点完整个过程，不是看代码）──
{
	S.pc.hp = S.pc.max_hp ?? 12;
	delete S.pc.inv['钥匙'];
	w.SugarCube.Engine.play('机制·longFight');
	await sleep(200);
	for (let i = 0; i < 12; i++) {
		const a = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.includes('逼它退到石壁边'));
		if (!a) break;
		a.click();
		await sleep(250);
	}
	const inv = w.eval('JSON.stringify(SugarCube.State.variables.pc.inv)');
	ok(/"钥匙":true/.test(inv), `真机：长战斗离开（${w.SugarCube.State.passage}）后 \`inv['钥匙']\` 为真`, inv);
	ok(w.SugarCube.State.passage !== '机制·longFight', '真机：确实离开了长战斗（否则上面那条没意义）', w.SugarCube.State.passage);
}

// ── ③ 频率：多种子 × 8000 次「短战斗奖励结算」⇒ ≈30%（3σ）──
{
	const N = 8000;
	const p = w.Game.Combat.encounterReward('short').item.chance / 100;
	const rates = [];
	for (const seed of [1, 7, 42]) {
		// 线性同余：可复现的"假 rng"（接口与 `Game.Rules.rng.d` 一致：`(1, 100) → 1..100`）
		let x = seed * 2654435761 % 2147483647;
		const rng = () => { x = (x * 48271) % 2147483647; return 1 + (x % 100); };
		let hits = 0;
		for (let i = 0; i < N; i++) {
			const pc = { gold: 0, inv: {} };
			const r = w.Game.Combat.grantReward(pc, 'short', { rng });
			if (r.item === '钥匙') hits++;
		}
		rates.push(hits / N);
		ok(rateWithin(hits, N, p), `种子 ${seed}：掉落率 ${(hits / N * 100).toFixed(2)}% 与声明 ${(p * 100).toFixed(0)}% 在 3σ 内`, `hits=${hits}/${N}`);
	}
}

// ── ④ 行为由**声明面**驱动：改声明 ⇒ 行为跟着变（证明 30 不是硬编码）──
{
	const keep = w.Sg.story.mechanics;
	const patch = (chance) => {
		w.Sg.story.mechanics = () => {
			const m = keep.call(w.Sg.story);
			return { ...m, encounters: { ...m.encounters, short: { ...m.encounters.short, reward: { gold: 3, item: { id: '钥匙', chance } } } } };
		};
	};
	patch(100);
	const pc1 = { gold: 0, inv: {} };
	ok(w.Game.Combat.grantReward(pc1, 'short', { rng: () => 100 }).item === '钥匙', '把声明改成 chance=100 ⇒ 掷 100 也必中（行为读声明）');
	patch(30);
	const pc2 = { gold: 0, inv: {} };
	ok(w.Game.Combat.grantReward(pc2, 'short', { rng: () => 31 }).item === null, 'chance=30 时掷 31 ⇒ 不掉（边界外）');
	const pc3 = { gold: 0, inv: {} };
	ok(w.Game.Combat.grantReward(pc3, 'short', { rng: () => 30 }).item === '钥匙', 'chance=30 时掷 30 ⇒ 掉（边界取等，`roll <= chance`）');
	// 结构畸形 ⇒ fail-loud（静默当"不掉"正是本票要根除的那类）
	const throws = (chance) => { patch(chance); try { w.Game.Combat.encounterReward('short'); return false; } catch { return true; } };
	ok(throws(0), 'chance=0 ⇒ **抛错**（0 无意义，形状畸形必须报错）');
	ok(throws(101), 'chance=101 ⇒ 抛错（越界）');
	w.Sg.story.mechanics = keep;
}

// ── ⑤ 幂等 / 与矿洞来源不冲突（同一局多次得钥匙不得异常）──
{
	const pc = { gold: 0, inv: { 钥匙: true } };            // 已经靠"矿洞"拿到过
	const r1 = w.Game.Combat.grantReward(pc, 'long');
	const r2 = w.Game.Combat.grantReward(pc, 'long');
	ok(r1.item === '钥匙' && r2.item === '钥匙' && pc.inv['钥匙'] === true, '已有钥匙时再掉落：不抛、`inv` 保持真（幂等）', JSON.stringify({ r1, r2 }));
	ok(pc.gold === (w.Game.Combat.encounterReward('long').gold) * 2, '金币按次累加（与旧行为一致）', String(pc.gold));
}

if (bad) {
	console.error(`\n✗ 钥匙掉落门未通过（${bad} 项）—— 声明面与行为必须一致（#600）`);
	process.exit(1);
}
console.log('\n✔ 钥匙掉落门通过（长战斗必掉 · 短战斗 30% 多种子复算 · 行为由声明面驱动 · 幂等）');
