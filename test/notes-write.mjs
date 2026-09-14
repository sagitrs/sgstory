// `Sg.notes.add()` 的行为门（`#434` 阶段 3）：幂等 · 双写 · 双读 · 多源护栏。
//
// 为什么需要它（`Discussion #513` 的 Q2 第 2 条）：`add()` 动的是**存档语义** ⇒
// 光有"跑通"不够，必须把三条不可退让的性质钉住，且**反例要能咬**：
//   ① **幂等**：连调两次结果不变（`add()` 第二次返回 `false`、状态逐字节相同）；
//   ② **双写**：写笔记的同时**仍置旗标**（票面「旗标降为兼容字段」）——否则既有旗标读点会瞎；
//   ③ **双读**：旧档只有旗标、没有 `pc.ev.notes` ⇒ `has()` 仍为真（这就是"旧档载入不崩"的实质）；
//   ④ **多源护栏**：`flagPath` 是数组而没声明 `setPath` ⇒ **报错**（fail-loud，绝不静默多写一个旗标）。
//
// 用法：node test/notes-write.mjs
import { createContext } from '../scripts/audit/context.mjs';

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

const { window: w, State } = createContext({ argv: [] });
const Sg = w.Sg;
const pc = State.variables.pc;
const snap = () => JSON.stringify({ ev: pc.ev, world: pc.world });

console.log('══ 笔记写入门（#434 阶段 3）══');

// 挑一个**单值 flagPath** 的已登记笔记（真实表，不造假）
const single = Sg.notes.ids().find((id) => {
	const e = Sg.notes.entry(id);
	return e && !Array.isArray(e.flagPath);
});
const multi = Sg.notes.ids().find((id) => {
	const e = Sg.notes.entry(id);
	return e && Array.isArray(e.flagPath);
});
if (!single) { bad++; console.error('      ✗ 找不到单值 flagPath 的笔记 —— 表结构变了？'); }

if (single) {
	const e = Sg.notes.entry(single);
	// 复位到"未授予"
	Sg.notes.writePath(pc, e.flagPath, false);
	if (pc.ev.notes) delete pc.ev.notes[single];
	const before = snap();

	// ① 首次授予：返回 true ＋ 真存储 ＋ 双写旗标
	const r1 = Sg.notes.add(single);
	case_(`首次 \`add('${single}')\` ⇒ 返回 true`, r1 === true);
	case_('  真存储：`pc.ev.notes` 记下该 id', pc.ev.notes?.[single] === true);
	case_(`  双写：旗标 \`${e.flagPath}\` 仍被置真（既有旗标读点不瞎）`, Sg.notes.readPath(pc, e.flagPath) === true);
	case_('  读侧 `has()` ⇒ 真', Sg.notes.has(single) === true);

	// ② 幂等：第二次返回 false ＋ 状态逐字节不变
	const afterFirst = snap();
	const r2 = Sg.notes.add(single);
	case_(`幂等：第二次 \`add('${single}')\` ⇒ 返回 false`, r2 === false);
	case_('幂等：状态逐字节不变（连跑两次＝一次）', snap() === afterFirst, `before=${before.length}B after=${snap().length}B`);

	// ③ 双读：模拟**旧档**（只有旗标、没有 `pc.ev.notes`）⇒ has() 仍真
	delete pc.ev.notes[single];
	case_('双读：旧档（只有旗标、无 `pc.ev.notes`）⇒ `has()` 仍为真（知识不丢）', Sg.notes.has(single) === true);
}

// ④ 多源护栏：数组 flagPath 且没 setPath ⇒ 必须报错（当前 hall/study 两族正是如此 ⇒ 本票有意不搬）
if (multi) {
	let threw = null;
	try { Sg.notes.add(multi); } catch (err) { threw = err; }
	case_(`多源护栏：\`add('${multi}')\`（flagPath 是数组、无 setPath）⇒ **报错**`, !!threw);
	case_('  报错信息点明"必须显式 setPath"', !!threw && /setPath/.test(threw.message), threw?.message);
} else {
	case_('多源护栏：当前表里没有多源笔记 ⇒ 本条不适用（跳过，不判失败）', true);
}

// ⑤ 未登记 id ⇒ 报错（结构缺失 fail-loud）
{
	let threw = null;
	try { Sg.notes.add('n_not_registered_at_all'); } catch (err) { threw = err; }
	case_('未登记笔记 ⇒ **报错**（结构缺失 fail-loud，不静默）', !!threw && /未登记/.test(threw?.message ?? ''));
}

// ⑦ A 方案（Discussion #513 定稿）：`yields` 由调用侧在**渲染后**统一授予；幂等 ⇒ 连渲两次只落一次
{
	// 用一个**尚未授予**的单值笔记（前面的用例已经授予过 `single` ⇒ 直接复用它只会拿到空 ⟹ 看起来像失败 ✗）
	const fresh = Sg.notes.ids().find((id) => {
		const e = Sg.notes.entry(id);
		return e && !Array.isArray(e.flagPath) && id !== single;
	});
	if (fresh) { Sg.notes.writePath(pc, Sg.notes.entry(fresh).flagPath, false); delete pc.ev.notes?.[fresh]; }
	const row = { id: 'r1', scope: 'S', yields: [fresh] };
	const first = Sg.rules.applyYields(row);
	const second = Sg.rules.applyYields(row);   // 模拟"同一行被再渲染一次"（结果留屏重放/重渲染）
	case_('A 方案：首次渲染后授予 ⇒ 返回新授予的 id', Array.isArray(first) && first.length === 1 && first[0] === fresh, JSON.stringify(first) + ' fresh=' + fresh);
	case_('A 方案·幂等：同一行**再渲一次** ⇒ 返回空（不重复写）', Array.isArray(second) && second.length === 0, JSON.stringify(second));
	case_('A 方案·无 yields 的行 ⇒ 授予为空（`text` 只渲染的行不该写状态）', Sg.rules.applyYields({ id: 'r2', scope: 'S' }).length === 0);
	// 物品面（dev 口径：写点面分两类 —— 笔记 `yields`／物品 `gives`，执行恒在 `<<rules>>` 一处）
	{
		const g1 = Sg.rules.applyGrants({ id: 'g1', scope: 'S', gives: ['__测试道具_a'] });
		const g2 = Sg.rules.applyGrants({ id: 'g1', scope: 'S', gives: ['__测试道具_a'] });
		case_('物品面：首次渲染后授予 ⇒ 返回新落下的物品', g1.length === 1 && g1[0] === '__测试道具_a', JSON.stringify(g1));
		case_('物品面·幂等：同一行再渲一次 ⇒ 返回空（不重复记账）', g2.length === 0, JSON.stringify(g2));
		case_('物品面：无 `gives` 的行 ⇒ 不写任何东西', Sg.rules.applyGrants({ id: 'g2', scope: 'S' }).length === 0 && pc.inv['__测试道具_a'] === true);
	}
	case_('A 方案·未登记 id ⇒ `add` 报错（fail-loud，不静默）', (() => { try { Sg.rules.applyYields({ id: 'r3', scope: 'S', yields: ['n_nope'] }); return false; } catch { return true; } })());
}

// ⑧ 键形前缀（#435 口径②）：引擎宣告 `prefixes` ＋ `holds()` 真会求值 —— 否则"未宣告前缀 ⇒ 永假"那类静默失效
{
	const had = pc.inv?.['__测试道具_b'];
	pc.inv = pc.inv ?? {}; pc.inv['__测试道具_b'] = true;
	case_('前缀宣告：`Sg.rules.prefixes` 含 inv/era（与 `holds()` 的求值能力一一对应）',
		Array.isArray(Sg.rules.prefixes) && ['inv', 'era'].every((x) => Sg.rules.prefixes.includes(x)), JSON.stringify(Sg.rules.prefixes));
	case_('`inv:<道具>`：持有 ⇒ 真', Sg.rules.holds('inv:__测试道具_b', pc) === true);
	case_('`inv:<道具>`：不持有 ⇒ 假（不静默为真）', Sg.rules.holds('inv:__不存在的道具_z', pc) === false);
	const era0 = State.variables.era;
	State.variables.era = w.Game.Era.PRESENT;   // 启动时 era 是 undefined（由故事稍后设置）⇒ 用例自己摆好前提
	case_('`era:<时代>`：与当前时代相符 ⇒ 真', Sg.rules.holds('era:present', pc) === true);
	case_('`era:<时代>`：不相符 ⇒ 假（不静默为真）', Sg.rules.holds('era:past', pc) === false);
	State.variables.era = era0;
	if (had === undefined) delete pc.inv['__测试道具_b'];
}

// ⑨ 授予家族第三类 `sets`（`#435` Q1 拍板）：引擎面宣告 ＋ 只置真 ＋ 幂等 ＋ 裸键默认 `ev.` ＋ 与 `yields`/`gives` **同处**执行
// 为什么要有这一面：`world.flower_taken`／`flower_sleep`／`ev.forge_thanks` 这类旗标**没有笔记** ⇒ 进不了 `yields`；
// 它们也不是物品 ⇒ 进不了 `gives`。没有第三面时，这些位点只能永远留在段落里（就是 D3／D4／D8 卡住的原因）。
{
	case_('授予面宣告：`Sg.rules.effects` 含 yields/gives/sets（与 `--rules` 的 `undeclaredSets` 反沉默判据同轴）',
		Array.isArray(Sg.rules.effects) && ['yields', 'gives', 'sets'].every((x) => Sg.rules.effects.includes(x)), JSON.stringify(Sg.rules.effects));

	const s1 = Sg.rules.applySets({ id: 's1', scope: 'S', sets: ['__测试旗标_a', 'world.__测试旗标_w'] });
	case_('`sets`：裸键默认 `ev.`（与 `holds()` 同口径）＋ `world.` 限定写真域 ⇒ 返回本次新落下的键',
		s1.join() === '__测试旗标_a,world.__测试旗标_w' && pc.ev.__测试旗标_a === true && pc.world.__测试旗标_w === true, JSON.stringify(s1));
	const s2 = Sg.rules.applySets({ id: 's1', scope: 'S', sets: ['__测试旗标_a', 'world.__测试旗标_w'] });
	case_('`sets`·幂等：同一行**再渲一次** ⇒ 返回空（不重复记账）', Array.isArray(s2) && s2.length === 0, JSON.stringify(s2));
	case_('`sets`：无 `sets` 的行 ⇒ 不写任何东西（`text` 只渲染的行不该写状态）', Sg.rules.applySets({ id: 's2', scope: 'S' }).length === 0);
	case_('`sets`·只置真：已为真的键不重复计入（只置真语义，不写数值/枚举）', Sg.rules.applySets({ id: 's3', scope: 'S', sets: ['__测试旗标_a'] }).length === 0);
	case_('`sets`：裸键与 `world.` 限定写的是**不同域**（裸键默认 `ev.`，别把世界态写成 `ev.`）', pc.ev.__测试旗标_a === true && pc.ev.__测试旗标_w === undefined, `ev.${pc.ev.__测试旗标_w} world.${pc.world.__测试旗标_w}`);

	delete pc.ev.__测试旗标_a; delete pc.world.__测试旗标_w;   // 不留测试键
}

// ⑥ 语义钉死：`has()` 的定义就是 `stored ∨ 旗标`（Discussion #513 的 Q2 第 1 条）
case_('读取语义写死：`has(id) = stored(id) ∨ any(readPath(flagPath))`（本文件 ③ 与 ① 两条合起来就是它）', true);

if (bad) {
	console.error(`\n✗ 笔记写入门未通过（${bad} 项）—— \`Sg.notes.add\` 动的是存档语义，四条性质不许退让（#434）`);
	process.exit(1);
}
console.log('\n✔ 笔记写入门通过（幂等 · 双写 · 双读 · 多源护栏 · 未登记 fail-loud）');
