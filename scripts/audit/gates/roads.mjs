// ⓪aa 事件池与三选一门（S4／`#489`）：通用事件池 ＋ 线索三选一
//
// **引擎门**（判据来自声明表 `mechanics().roads[i] = { from, to, options:[{kind,hint,noCheck?}]}`）：
// ① **共用选择机制**：事件池与战斗池都走 `Game.Combat.pickN` —— stub 掉它，**两处都跟着变** → 证明不是两套随机
// ② 三选一行为：恰好 3 个、都来自该段 `options`、`exclude`（本段已出现的类型）生效
// ③ 判据 2/3 的机检入口：线索两两可区分（`roadHintCollisions`）／每段有「无判定选项」（`roadNoCheck`）／
// **不死档**（`roadDeadEnds`）——三者都取自 `story-shape.mjs` 的**单权威**，不另写一份
// ④ 频率口径：多种子下每类事件的**入选比例 ≈ 均匀**（`3/k`，3σ 容差）＋ 同种子两次**逐项一致**（可复算）
// ⑤ 兼容降级：`mechanics()` 为 `null` → `roadOffer` 返回 `null`（调用方不调 → 零行为变化）
//
// 用法：`node scripts/audit.mjs --roads`（`--check` 为判定态）
import { mulberry32, asSugarRandom } from '../lib/rng.mjs';
import { KIND_SET, roadHintCollisions, roadNoCheck, roadDeadEnds } from '../lib/story-shape.mjs';

export const flag = 'roads';
export const flags = ['roads'];

/** 合成声明表（**自证用**）：两段路，各 3 选项，含 `noCheck`，`to` 不死档。 */
const MECH = {
	hitLocations: ['衣服'],
	slots: { body: { protects: '衣服', label: '衣服' } },
	equipment: {},
	statuses: {},
	encounters: { short: { waves: [{ pool: 'p1', difficulty: 1 }] }, long: { waves: [{ pool: 'p1', difficulty: 1 }, { pool: 'p2', difficulty: 2, reinforce: true }] } },
	roads: [
		{ from: 0, to: 1, options: [{ kind: 'shortFight', hint: '碎石间有拖行的痕迹' }, { kind: 'chest', hint: '岩壁凹处反着一点金属光' }, { kind: 'trap', hint: '地面浮土比别处松', noCheck: true }] },
		{ from: 1, to: 2, options: [{ kind: 'longFight', hint: '地上有很多脚印，都朝着一个方向' }, { kind: 'cave', hint: '那边吹过来的风是热的' }, { kind: 'traveller', hint: '石缝里卡着一小块布', noCheck: true }] },
	],
};
/** 6 选项的一段（频率口径用：入选比例应为 3/6） */
const WIDE = { ...MECH, roads: [{ from: 0, to: 1, options: KIND_SET.map((k, i) => ({ kind: k, hint: `线索${i}`, noCheck: i === 0 })) }] };
/** 4 选项的一段（`exclude` 用例：排掉 1 个仍够 3 个） */
const FOUR = { ...MECH, roads: [{ from: 0, to: 1, options: [{ kind: 'shortFight', hint: 'a', noCheck: true }, { kind: 'chest', hint: 'b' }, { kind: 'trap', hint: 'c' }, { kind: 'cave', hint: 'd' }] }] };
const PC = { gear: [], inv: {}, ev: { fight: { pool: 'p1', round: 1 } } };

export const judgeRoads = (ctx) => {
	const { Game, arg, wantAll } = ctx;
	const Sg = ctx.window?.Sg;
	if (!wantAll && !arg('roads')) return;
	console.log('\n══ ⓪aa 事件池与三选一门（S4/#489）——共用选择机制 · 三选一 · 线索可区分 · 频率 ══');
	let bad = 0;
	// `#1151`：**自证格**的计数**单列**（与「判据发现」分开 —— 两者语义不同：格红＝本门失能，发现＝数据/内容问题）
	let selfBad = 0;
	const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };
	const saved = Sg.story.mechanics;

	try {
		// ── ⑤ 兼容降级 ──
		Sg.story.mechanics = () => null;
		t('⑤ 未启用 ⇒ `roadOffer` 返回 `null`（调用方跳过）', Game.Combat.roadOffer(1) === null);
		t('⑤ 未启用 ⇒ `roadsDecl` 也是 `null`（不静默当空表）', Game.Combat.roadsDecl() === null);

		Sg.story.mechanics = () => MECH;

		// ── ① 共用选择机制（stub `pickN` → 两处都变）──
		{
			const orig = Game.Combat.pickN;
			try {
				Game.Combat.pickN = () => ['SENTINEL-A', 'SENTINEL-B', 'SENTINEL-C'];
				const road = Game.Combat.roadOffer(1);
				const fight = Game.Combat.offer('p1', 1, PC, null);
				t('① **事件池与战斗池共用 `pickN`**：stub 掉它 ⇒ 两处结果同样变成哨兵值', road.join() === 'SENTINEL-A,SENTINEL-B,SENTINEL-C' && fight.join() === 'SENTINEL-A,SENTINEL-B,SENTINEL-C', JSON.stringify({ road, fight }));
			} finally { Game.Combat.pickN = orig; }
		}

		// ── ② 三选一行为 ──
		{
			Game.Rules.rng.set(asSugarRandom(mulberry32(20260914)));
			let three = null, again = null;
			try { three = Game.Combat.roadOffer(1); again = Game.Combat.roadOffer(1); } finally { Game.Rules.rng.reset(); }
			const kinds = MECH.roads[0].options.map((o) => o.kind);
			t('② 恰好 3 个、且都来自该段的 `options`', three.length === 3 && three.every((o) => kinds.includes(o.kind)), JSON.stringify(three.map((o) => o.kind)));
			t('② 三个选项互不重复（同段不出现同类事件两次）', new Set(three.map((o) => o.kind)).size === 3, JSON.stringify(three.map((o) => o.kind)));
			// exclude：把已出现的类型排掉 → 只从剩下的里选（用 4 选项那段：排掉 1 个仍够 3 个）
			Sg.story.mechanics = () => FOUR;
			Game.Rules.rng.set(asSugarRandom(mulberry32(7)));
			let ex = null;
			try { ex = Game.Combat.roadOffer(1, ['chest']); } finally { Game.Rules.rng.reset(); }
			Sg.story.mechanics = () => MECH;
			t('② `exclude` 生效（排掉已出现的类型后不再抽到它）', ex.length === 3 && !ex.some((o) => o.kind === 'chest'), JSON.stringify(ex.map((o) => o.kind)));
			// 回退口径（与战斗池一致）：选项不够 3 个时回退到"全部"，保证玩家仍能三选一
			Game.Rules.rng.set(asSugarRandom(mulberry32(7)));
			let fb = null;
			try { fb = Game.Combat.roadOffer(1, ['chest']); } finally { Game.Rules.rng.reset(); }
			t('② 选项不足 3 ⇒ 回退到全部（与战斗池同口径：尽量给满 3）', fb.length === 3 && fb.some((o) => o.kind === 'chest'), JSON.stringify(fb.map((o) => o.kind)));
			t('② 第 2 段能用（段号从 1 计）', (() => { Game.Rules.rng.set(asSugarRandom(mulberry32(3))); try { return Game.Combat.roadOffer(2).every((o) => MECH.roads[1].options.map((x) => x.kind).includes(o.kind)); } finally { Game.Rules.rng.reset(); } })());
			let msg = '';
			try { Game.Combat.roadOffer(9); } catch (e) { msg = String(e.message); }
			t('② 段号越界 ⇒ 大声报错（不静默给空）', msg.includes('没有第 9 段'), msg || '（没有报错）');
		}

		// ── ③ 判据 2/3 的机检入口（lib 单权威）──
		{
			t('③ 线索两两可区分：合规声明 0 处碰撞', roadHintCollisions(MECH.roads[0]).length === 0);
			t('③ 线索可区分判据**会红**：把两条线索写成同文 ⇒ 必须命中', roadHintCollisions({ options: [{ hint: '同样的线索' }, { hint: '同样的线索 ' }] }).length === 1);
			t('③ 「无判定选项」判据：合规段为真、全带判定的段为假', roadNoCheck(MECH.roads[0]) === true && roadNoCheck({ options: [{ kind: 'trap' }, { kind: 'chest' }] }) === false);
			t('③ 不死档判据：合规两段 0 处死档', roadDeadEnds(MECH.roads).length === 0);
			t('③ 不死档判据**会红**：抬高终点让一段悬空 ⇒ 必须命中', roadDeadEnds([{ from: 0, to: 4, options: [{}] }, { from: 1, to: 2, options: [{}] }]).length === 1);
		}

		// ── ④ 频率口径（多种子可复算）──
		{
			const N = 20000;
			const count = (seed) => {
				Sg.story.mechanics = () => WIDE;
				Game.Rules.rng.set(asSugarRandom(mulberry32(seed)));
				const c = new Map();
				try { for (let i = 0; i < N; i++) for (const o of Game.Combat.roadOffer(1)) c.set(o.kind, (c.get(o.kind) ?? 0) + 1); }
				finally { Game.Rules.rng.reset(); }
				Sg.story.mechanics = () => MECH;
				return c;
			};
			const c1 = count(20260914), c2 = count(20260914);
			const p = 3 / KIND_SET.length, sigma = Math.sqrt(N * p * (1 - p));
			const worst = Math.max(...KIND_SET.map((k) => Math.abs((c1.get(k) ?? 0) - N * p)));
			t(`④ 每类事件入选比例 ≈ 3/${KIND_SET.length}：最大偏差 ${worst} 次 ≤ 3σ（${(3 * sigma).toFixed(0)} 次）`, worst <= 3 * sigma);
			t('④ 同种子两次 ⇒ 逐类计数一致（可复算）', KIND_SET.every((k) => c1.get(k) === c2.get(k)));
			t('④ 每类都被抽到（没有"永远不出现"的事件）', KIND_SET.every((k) => (c1.get(k) ?? 0) > 0));
		}

		// ── 自证（3 类反例：合成"选择结果"必须被判出）──
		{
			const judge = (picked, road, n = 3) => {
				const out = [];
				if (picked.length !== n) out.push(`取到 ${picked.length} 个 ≠ ${n}`);
				const kinds = new Set((road.options ?? []).map((o) => o.kind));
				for (const o of picked) if (!kinds.has(o.kind)) out.push(`抽到该段没有的类型 ${o.kind}`);
				if (new Set(picked.map((o) => o.kind)).size !== picked.length) out.push('同一类型出现两次');
				return out;
			};
			const road = MECH.roads[0];
			const cases = [
				['正例：合规三选一不报', road.options.slice(0, 3), 0],
				['反例①：只取到 2 个', road.options.slice(0, 2), 1],
				['反例②：抽到本段没有的类型', [...road.options.slice(0, 2), { kind: 'cave', hint: 'x' }], 1],
				['反例③：同类型重复', [road.options[0], road.options[0], road.options[1]], 1],
			];
			for (const [label, picked, want] of cases) {
				const got = judge(picked, road);
				const okk = want === 0 ? got.length === 0 : got.length >= want;
				console.log(`      ${okk ? '✓' : '✗'} 自证·${label}：检出 ${got.length}（期望 ${want === 0 ? 0 : '≥' + want}）`);
				if (!okk) selfBad++;   // `#1151`：格红走 selfBad（不再混进 `bad`）
			}
		}
	} finally {
		Sg.story.mechanics = saved;
		Game.Rules.rng.reset();
	}

	bad += selfBad;
	// `#1151`（同 `#1149`／`#1150`）⭐ **自证格的红必须进退出码** —— 那是**格级属性**，**不依赖 `process.argv`**
	//注意：与「判据发现」**分开报**：本条语义是「**本门自身失能**」，不是「故事数据/内容有问题」
	if (selfBad) {
		console.error(`\n✗ ⓪aa 事件池与三选一门：**自证格**红 ${selfBad} 项 ⇒ **本门自身失能**（不是判据发现 ✗）—— 请修本门再跑 ✓（\`#1151\`）`);
		process.exit(1);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪aa 事件池与三选一门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 事件池与三选一门通过（共用选择机制 · 三选一 · 线索可区分/无判定/不死档 · 频率 · 兼容降级）');
	}
};

// `#1100` (甲)：**判据体提成具名导出** → 锚可指它（此前判据内联在 `run` 里 → 掏空 `run` 时
// 锚检照样绿）。`run` 只做委派 → **行为逐字保持**（提取提交不夹带接线或格）。
export const run = (ctx) => judgeRoads(ctx);
