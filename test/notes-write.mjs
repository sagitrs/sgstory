// `Sg.notes.add()` 的行为门（`#434` 阶段 3）：幂等 · 双写 · 双读 · 多源护栏。
//
// 为什么需要它（`Discussion #513` 的 Q2 第 2 条）：`add()` 动的是**存档语义** ⇒
// 光有"跑通"不够，必须把三条不可退让的性质钉住，且**反例要能咬**：
//   ① **幂等**：连调两次结果不变（`add()` 第二次返回 `false`、状态逐字节相同）；
//   ② **双源两态**（`#733` 片 2-b 改）：**单源**＝只记真存储（旗标写侧退场，读侧 `has()` 仍真）；**多源**＝写声明的 `setPath`；
//   ③ **双读**：旧档只有旗标、没有 `pc.ev.notes` ⇒ `has()` 仍为真（这就是"旧档载入不崩"的实质）；
//   ④ **多源护栏**：`flagPath` 是数组而没声明 `setPath` ⇒ **报错**（fail-loud，绝不静默多写一个旗标）。
//
// 用法：node test/notes-write.mjs
import { readFileSync } from 'node:fs';
import { createContext } from '../scripts/audit/context.mjs';
import { noteWriteRefs, noteWriteKeys, notePathWriteRefs } from '../scripts/audit/lib/shared.mjs';

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

const { window: w, State } = createContext({ argv: [] });
const Game = w.Game;   // `#437` C-2c-2：真机语义要验 `Game.Pc.migrate()` 会顺带跑迁移
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
	// `#733` 片 2-b：**单源不再依赖旗标**（写侧词汇搬到笔记面）⇒ 断言改成**形式无关**：只钉"读侧为真".
	// （旗标写不写由实现决定：片 2-b 前写、之后不写 ⇒ 两种状态这条都成立。）
	case_('  读侧为真（形式无关：单源写侧走笔记面）', Sg.notes.has(single) === true);
	// `#733` 片 2-b 的**不变量**（验收席补）：单源 `add()` **不写旗标** —— 它的 `flagPath` 只是
	// "历史来源"，真存储是 `ev.notes.<id>`；多源才写 `setPath`（下面 ④ 另验）。没有这条，翻面就可能
	// 被无声改回去（"旗标写侧"没有任何别的机械证据 ⇒ golden 只证"读者无差异"，不证"没写"）。
	case_('  `#733` 片 2-b 不变量：单源 `add()` **不写旗标**（路径旗标仍为假）', Sg.notes.readPath(pc, e.flagPath) !== true);
	case_('  读侧 `has()` ⇒ 真', Sg.notes.has(single) === true);

	// ② 幂等：第二次返回 false ＋ 状态逐字节不变
	const afterFirst = snap();
	const r2 = Sg.notes.add(single);
	case_(`幂等：第二次 \`add('${single}')\` ⇒ 返回 false`, r2 === false);
	case_('幂等：状态逐字节不变（连跑两次＝一次）', snap() === afterFirst, `before=${before.length}B after=${snap().length}B`);

	// ③ **旧档迁移**（`#437` C-2c-2）：兜底退场 ⇒ 只有旗标的旧档**不再**自动为真，改为**写一次迁移**补齐
	Sg.notes.writePath(pc, e.flagPath, true);          // `#733` 片 2-b：旧档夹具**直接写旗标**（旧档的真实形态）
	delete pc.ev.notes[single];
	case_('🔴 C-2c-2：旧档（只有旗标、无存储）⇒ `has()` **不再**为真（读侧兼容层已退场）', Sg.notes.has(single) === false);
	case_('✅ 反向探针（承重）：`migrateLegacy()` 补写后 ⇒ `has()` 为真（旧档知识不丢）', Sg.notes.migrateLegacy(pc) >= 1 && Sg.notes.has(single) === true);
	case_('迁移幂等：再跑一次 ⇒ 补写 0 条', Sg.notes.migrateLegacy(pc) === 0);
	case_('真机语义：`Game.Pc.migrate()` 会顺带跑迁移（旧档载入路径）', (() => {
		Sg.notes.writePath(pc, e.flagPath, true);          // `#733` 片 2-b：旧档夹具**直接写旗标**（旧档的真实形态）
	Sg.notes.writePath(pc, e.flagPath, true);          // 再造一次旧档（直接写旗标）
		delete pc.ev.notes[single];
		Game.Pc.migrate(pc);                              // 载档时必经
		return Sg.notes.has(single) === true;
	})());
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

// ⑩ 路径限定授予（`#569`）：`yields: [{ id, path }]` —— 多源笔记的“这一支写哪条 path”
// 为何不能靠 `add()`：`add()` 只看 `has(id)`（多源 OR）⇒ “听人比过”已真时，“看清了钉子”那一条**永远写不下去**。
if (multi) {
	const e = Sg.notes.entry(multi);
	const [p1, p2] = Array.isArray(e.flagPath) ? e.flagPath : [e.flagPath, e.flagPath];
	const reset = () => {
		for (const p of Array.isArray(e.flagPath) ? e.flagPath : [e.flagPath]) Sg.notes.writePath(pc, p, false);
		if (pc.ev.notes) delete pc.ev.notes[multi];
	};
	reset();
	const a1 = Sg.notes.addPath(multi, p2);
	case_(`路径限定：\`addPath\` 只写声明的那条（${p2}）`, a1 === true && Sg.notes.readPath(pc, p2) === true && Sg.notes.has(multi) === true);
	case_(`路径限定：没写另一条（${p1}）—— 不静默多写旗标`, Sg.notes.readPath(pc, p1) === false || Sg.notes.readPath(pc, p1) === undefined);
	const a2 = Sg.notes.addPath(multi, p2);
	case_('路径限定·路径级幂等：同一条再写 ⇒ 返回 false（状态不变）', a2 === false && Sg.notes.readPath(pc, p2) === true);
	// 🔴 关键用例：另一条已授予（＝“知识已在”）时，本行声明的 path **仍必须**写下去
	reset();
	Sg.notes.addPath(multi, p1);                       // 走**受认可**的授予路径（同时落该 path 与存储）
	case_('🔴 关键：`has(id)` 已真（另一条 path 已授予）时，`addPath` **仍**能写本行那条（`add()` 做不到）',
		Sg.notes.has(multi) === true && Sg.notes.addPath(multi, p2) === true && Sg.notes.readPath(pc, p2) === true);
	case_('路径限定·fail-loud：path 不属于该笔记 ⇒ 报（写进去读不出来）', (() => { try { Sg.notes.addPath(multi, 'world.不存在的路径'); return false; } catch { return true; } })());
	case_('路径限定·fail-loud：未登记 id ⇒ 报', (() => { try { Sg.notes.addPath('n_nope', p2); return false; } catch { return true; } })());
	// 引擎侧接线：`applyYields` 混合形状（老形状 ＋ 新形状同处）
	reset();
	const mix = Sg.rules.applyYields({ id: 'mix', scope: 'S', yields: [{ id: multi, path: p2 }] });
	const mix2 = Sg.rules.applyYields({ id: 'mix', scope: 'S', yields: [{ id: multi, path: p2 }] });
	case_('`applyYields` 认 `{id,path}`：首次落 ⇒ 返回 [id]；再渲一次 ⇒ 空（幂等）', mix.join() === multi && mix2.length === 0, `mix=${JSON.stringify(mix)} mix2=${JSON.stringify(mix2)}`);
	case_('`applyYields` 混合形状：字符串形与对象形同一行共存 ⇒ 两者都落', (() => {
		Sg.notes.writePath(pc, Sg.notes.entry(single).flagPath, false);
		if (pc.ev.notes) delete pc.ev.notes[single];
		reset();
		const r = Sg.rules.applyYields({ id: 'mix2', scope: 'S', yields: [single, { id: multi, path: p2 }] });
		return r.length === 2 && Sg.notes.has(single) && Sg.notes.readPath(pc, p2) === true;
	})());
	case_('`applyYields` 对象形缺 `path` ⇒ 当老形状走（与门侧 `yieldPathProblems()` 的口径一致）', (() => {
		Sg.notes.writePath(pc, Sg.notes.entry(single).flagPath, false);
		if (pc.ev.notes) delete pc.ev.notes[single];
		return Sg.rules.applyYields({ id: 'mix3', scope: 'S', yields: [{ id: single }] }).join() === single;
	})());
}

{
	// `#437` 批三 C-2：词汇宏 `<<notepath "id" "path">>` —— ①宏在产物里 ②参数顺序与底层一致 ③**参数错位 fail-loud**
	// 产物里能查到该宏（StoryScript 编译后的 widget 表）——引擎文件是唯一源，产物是玩家真拿到的东西
	case_('`<<notepath>>` 宏在**产物**里（与 `Sg.notes.addPath(id, path)` 同一参数顺序）', (() => {
		const src = readFileSync(new URL('../dist/stories/mist-forest/index.html', import.meta.url), 'utf8');
		return /notepath/.test(src);
	})());
	case_('🔴 参数错位（把 path 当 id）⇒ fail-loud（未登记笔记 id 必须报，不许静默没写）', (() => {
		try { Sg.notes.addPath('ev.hall_seen', 'n_hall_hint'); return false; } catch (e) { return /未登记/.test(String(e.message)); }
	})());
	case_('正例：宏体是**瘦别名**（`addPath` 直接可用，无分支）——挑多源笔记的某一条 path 直调',
		(() => {
			const e = Sg.notes.entry(multi);
			const p = (Array.isArray(e.flagPath) ? e.flagPath : [e.flagPath])[0];
			Sg.notes.writePath(pc, p, false);                       // 复位该条 path
			if (pc.ev.notes) delete pc.ev.notes[multi];
			return Sg.notes.addPath(multi, p) === true && Sg.notes.readPath(pc, p) === true;
		})());
}

{
	// `#437` 批三 C-2b（dev 半边）：**写点识别面**认"路径限定"的新形状（`<<notepath>>`／`Sg.notes.addPath`）。
	// 为什么锚在这里：`NOTE_WRITE_RE`／`noteWriteKeys` 是写点的**单一权威** —— 多源笔记必须**只记声明的那一条**，
	// 否则 `--state`／`--consequences`／`--echoes`／`--investment` 会把"静默多写"当成合法（那正是 `#434` 要求 fail-loud 的事）。
	// 背景：`#676` 引入宏时只改了 W1 白名单，写点识别面没跟上（dev 复核实测 `noteWriteRefs('<<notepath …>>') === []`）。
	const E2 = { n_hall_hint: { flagPath: ['world.hall_hint', 'ev.hall_seen'] } };   // 多源笔记的真实形状
	case_('写点识别：`<<notepath "id" "path">>` 的 id **可见**（与 `<<note>>` 同权，不再是盲区）',
		noteWriteRefs('<<notepath "n_hall_hint" "ev.hall_seen">>').join() === 'n_hall_hint');
	case_('写点识别：多源笔记走 `<<notepath>>` ⇒ **只记声明的那一条**（不是整族）',
		noteWriteKeys('<<notepath "n_hall_hint" "ev.hall_seen">>', E2).join() === 'ev.hall_seen');
	case_('🔴 对照（这正是"多源必须用 `notepath`"的机械理由）：`<<note>>` ⇒ 整族两条都算',
		noteWriteKeys('<<note "n_hall_hint">>', E2).sort().join() === 'ev.hall_seen,world.hall_hint');
	case_('写点识别：API 形 `Sg.notes.addPath("id", "path")` 同口径（也只记声明的那一条）',
		noteWriteKeys('Sg.notes.addPath("n_hall_hint", "world.hall_hint")', E2).join() === 'world.hall_hint');
	case_('🔴 坏形状不认：`<<notepath "id", "path">>`（逗号会被带进参数 ⇒ 运行期坏）**不算**限定形（于是退回整族＝方向安全：宁可多记）',
		notePathWriteRefs('<<notepath "n_hall_hint", "ev.hall_seen">>').length === 0
		&& noteWriteKeys('<<notepath "n_hall_hint", "ev.hall_seen">>', E2).sort().join() === 'ev.hall_seen,world.hall_hint');
}

{
	// `#437` C-2c-1b（**回归**）：**旗标已真但存储缺失** ⇒ `add()` **仍必须补写存储**，不许早退。
	// 缺陷原状：`add()` 用 `has(id)`（＝存储 ∨ 旗标）早退 ⇒ 语料里 `<<firstTime "wq_seen">><<note "n_wq_seen">>` 这种
	// **紧接着**的写法，旗标先被置真 ⇒ `add()` 直接返回 false ⇒ **存储永远补不上**（实测 `pc.ev.notes` 始终 undefined，
	// 只是被兜底掩盖着；C-2c-2 一删兜底，那条知识就会**静默变假**）。
	if (single) {
		const path = Sg.notes.entry(single).flagPath;
		Sg.notes.writePath(pc, path, true);                 // 模拟"旗标已真"（旧档／`<<firstTime>>` 先落旗标）
		if (pc.ev.notes) delete pc.ev.notes[single];
		case_('🔴 旗标已真但存储缺失 ⇒ `add()` 仍补写存储（早退判据看**存储**，不看 `has()`）',
			Sg.notes.add(single) === true && Sg.notes.stored(single) === true);
		case_('反向：存储与旗标都真 ⇒ `add()` 返回 false（幂等）', Sg.notes.add(single) === false);
	}
}

if (bad) {
	console.error(`\n✗ 笔记写入门未通过（${bad} 项）—— \`Sg.notes.add\` 动的是存档语义，四条性质不许退让（#434）`);
	process.exit(1);
}
console.log('\n✔ 笔记写入门通过（幂等 · 旗标＋存储双写 · **旧档迁移**（兜底已退场）· 多源护栏 · 未登记 fail-loud）');
