#!/usr/bin/env node
/* 老宅木箱支线 · **行为基线判据**（`sgstory#1912` 交付 1 的「行为保持」刀）
 *
 * ## 本档守什么
 *   线 A·阶段 1 交付 1 的判据是「**行为保持**」：把老宅地窖的木箱支线接入
 *   `GameSession` ＋ L0 宿主端口之后，**无头可跑、行为与 main 基线逐项一致**。
 *   本档即那条基线的**机械面**——先锚在 main 的现有行为上，重构支 rebase 于其上，
 *   一旦行为漂移，本档当场红。⇒ 票面点名的「刀」＝本档的 `--selftest`（见第四节）。
 *
 * ## 覆盖面（本档判哪几行、明账哪些没判）
 *   判：①重新呈现不重复领取奖励（木箱格）②同上一行（酒架格）③存档后推进再读档，标记与背包恢复一致
 *   待判：④两个会话状态/随机源/事件/输入相互独立 —— 需 `GameSession` 落地（属 `src/**`，D 面），
 *        本档**打印 `⏳` 明账**，✗ 不以绿代过（见 `PENDING` 常量）。
 *   （真 DOM 的 SugarCube 接缝行住 `run-seam.mjs`，以 jsdom 驱动构建产物。）
 *
 * ## 装置与边界（照 `母条二`：实际形优先）
 *   · 被测物＝`tests/unit/dist/bundle.js`（`python3 build.py` 产出，**与游戏同包装**）；
 *   · 宿主＝`tests/unit/framework/host.js`（故事变量含「导航即克隆」、存档往返含原型退化）；
 *   · 故事面＝`tests/e2e/old-house/src/story/cellar.js` 的**真源码**（✗ 手抄一份「同形」场景
 *     —— 手抄件与被测件的差别正是「假绿」的来源，本仓已有多例）。
 *   · 变量面按故事契约铺：`$inventory` 存纯数据快照 `[{id, charges, equipped}]`。
 *
 * ## 用法
 *   node tests/e2e/old-house/run-baseline.mjs                # 判据（CI 用）
 *   node tests/e2e/old-house/run-baseline.mjs --selftest     # 刀自检：每条刀须见红
 *   node tests/e2e/old-house/run-baseline.mjs --knife=<id>   # 内部：下刀后跑一次（自检用）
 *   退出码：0 全过 / 1 有红 / 2 用法错
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const HERE = import.meta.dirname;                       // tests/e2e/old-house
const REPO = path.resolve(HERE, '..', '..', '..');
const UNIT = path.join(REPO, 'tests', 'unit');
const CELLAR = path.join(HERE, 'src', 'story', 'cellar.js');

/* 待判行（明账）：这一行**不是**「已过」，也不静默跳过 —— 打印 `⏳` 并计入 pending。 */
const PENDING = ['[sessions] 两个会话状态/随机源/事件/输入相互独立 —— 待 GameSession（交付 2 的 src 侧）'];

/* ---------- 刀：每条必须是**可复现的字符串替换**（✗ 凭记忆重构一句） ---------- */
const KNIVES = [
	{
		id: 'box-no-guard',
		why: '撤掉木箱格 `when` 里的 `!boxOpened` 守卫 ⇒ 木箱格的两条幂等断言红，且**往返后守卫也不再活**（故两格皆红）',
		patch: [[`RPG.has('club') && !State.variables.boxOpened`, `RPG.has('club')`]],
		expect: ['idem-box', 'save-rt'],
	},
	{
		id: 'wine-no-guard',
		why: '撤掉酒架格 `when` 里的 `!wineTaken` 守卫 ⇒ 只有酒架格红',
		patch: [[`when: () => !State.variables.wineTaken,`, `when: () => true,`]],
		expect: ['idem-wine'],
	},
	{
		id: 'marker-lost-on-load',
		why: '**只**让读档丢掉标记（挂一个 `Save.onLoad` 把它从存档面抹掉）—— 进程内一切照旧、'
			+ '**只有**往返后那格红 ⇒ 这是「幂等」与「存读档」两条断的不是同一件事的**干净隔离证明**',
		patch: [[`State.variables.boxOpened = true;`,
			/* ⚠ 形按**本宿主**的契约：`framework/host.js` 的 `save.make()` 即 `{ state: <变量表深克隆> }`
			 *   （它自己的文件头写明「处理器可就地增补 `save`」）⇒ 抹的是 `o.state.boxOpened`。
			 *   ✗ 别照真 SugarCube 的 `state.history[i].variables` 写 —— 本档跑在宿主仿真上，不是真引擎。 */
			`State.variables.boxOpened = true; Save.onSave.add((o) => { if (o && o.state) delete o.state.boxOpened; });`]],
		expect: ['save-rt'],
	},
];

const argOf = (name, dflt = null) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : (process.argv.includes(`--${name}`) ? true : dflt);
};

/* ============================ 自检（刀） ============================ */
if (argOf('selftest')) {
	let bad = 0;
	const run = (extra) => spawnSync(process.execPath, [import.meta.filename, ...extra], {
		encoding: 'utf8', env: { ...process.env },
	});
	const clean = run([]);
	const cleanOut = `${clean.stdout}${clean.stderr}`;
	const cleanOK = clean.status === 0 && /判据全绿/.test(cleanOut);
	console.log(`  ${cleanOK ? '✓' : '✗'} 未下刀 ⇒ 基线应全绿：rc=${clean.status}`);
	if (!cleanOK) { console.error(cleanOut); bad++; }

	/* ★判据须**直接**（`dev-10` 的阻断二）：只认**失败行**（形如 `✗ [格名] …`）里出现的格名，
	 *   ✗ 不认「格名在输出里出现过」—— 格头、刀义说明、附注都会让后者恒真 ⇒ 认不出「红错格」。
	 *   且每条刀声明**完整预期红集**：多红一格与少红一格**都算未达标**。
	 *   ⚠ 崩溃（`throw`）**不算红**：崩只说明「这条路走不通」，说明不了「某条断言判出了这件事」。
	 *     ⇒ 声明了某格而实得是崩（该格无具名失败行）时，此处同样判未达标。 */
	const redCells = (out) => [...new Set([...out.matchAll(/✗ \[([^\]]+)\]/g)].map((m) => m[1]))].sort();
	for (const k of KNIVES) {
		const r = run([`--knife=${k.id}`]);
		const out = `${r.stdout}${r.stderr}`;
		const got = redCells(out);
		const want = [...k.expect].sort();
		const same = got.length === want.length && got.every((x, i) => x === want[i]);
		const red = r.status === 1 && same;
		console.log(`  ${red ? '✓' : '✗'} 刀 \`${k.id}\` ⇒ 须**恰好**红在 ${JSON.stringify(want)}；实得 ${JSON.stringify(got)}（rc=${r.status}）`);
		if (!red) { console.error(`    （刀义：${k.why}）\n${out.slice(-1500)}`); bad++; }
	}

	if (bad) { console.error(`\n刀的判别力自证失败 ${bad} 条 —— 判据红不了，等于没有判据`); process.exit(1); }
	console.log(`\n✓ 刀的判别力自证通过（${KNIVES.length} 刀 ＋ 1 个未下刀对照）`);
	process.exit(0);
}

const knifeId = argOf('knife');
const knife = knifeId ? KNIVES.find((k) => k.id === knifeId) : null;
if (knifeId && !knife) { console.error(`✗ 未知的刀：${knifeId}`); process.exit(2); }

/* ============================ 装载（镜像 tests/unit/headless.mjs）============================ */
const load = (f) => eval(fs.readFileSync(f, 'utf8'));
const stubEl = () => ({ insertAdjacentHTML() {}, innerHTML: '' });
globalThis.document = { title: '', getElementById: () => stubEl() };
globalThis.window = globalThis;
globalThis.location = { href: '' };
const chain = new Proxy(function () {}, {
	get(_t, prop) {
		if (prop === 'length') return 0;
		if (prop === Symbol.toPrimitive) return () => '';
		if (prop === 'then') return undefined;
		return () => chain;
	},
	apply() { return chain; },
});
globalThis.jQuery = chain;
globalThis.$ = chain;

const bundle = path.join(UNIT, 'dist', 'bundle.js');
if (!fs.existsSync(bundle)) {
	console.error(`✗ 缺被测物 ${path.relative(REPO, bundle)} —— 先 \`python3 build.py\`（CI 的位次已在 build 之后）`);
	process.exit(2);
}
load(path.join(UNIT, 'framework', 'host.js'));
load(path.join(UNIT, 'framework', 'shims.js'));
load(bundle);
globalThis.__host.install();          // 接住 perform 的输出（须在被测物之后）

/* 故事面：读**真源码**；下刀时只做字符串替换（替换不中 ⇒ 具名报错，✗ 静默当「刀下了」） */
/* ★装载形须与**打包器**逐字同形（`build.py:wrap_js`：故事侧 = `(function (RPG, $) {...})(setup.RPG, jQuery)`）
 *   —— 若我用自己发明的加载形（如直接把 `RPG`/`$` 塞成全局），被测的就不是发布的那一份包装；
 *   故此处按同一形包裹，并**核对打包器里那行模板仍在**（装置面自证：包装形变了 ⇒ 本档须同步）。 */
const WRAP = (src) => `(function (RPG, $) {\n${src}\n})(setup.RPG, jQuery);`;
{
	const buildSrc = fs.readFileSync(path.join(REPO, 'build.py'), 'utf8');
	const 形 = /alias\s*if\s*else|args, vals = "\(RPG, \$\)", "\(setup\.RPG, jQuery\)"/;
	if (!形.test(buildSrc) && !buildSrc.includes('(setup.RPG, jQuery)')) {
		console.error('✗ 打包器 `build.py` 里找不到故事侧的别名注入形 `(setup.RPG, jQuery)` —— 本档的装载形须同步（✗ 静默按旧形装）');
		process.exit(2);
	}
}
let cellarSrc = fs.readFileSync(CELLAR, 'utf8');
for (const [from, to] of knife?.patch ?? []) {
	if (!cellarSrc.includes(from)) {
		console.error(`✗ 刀 \`${knife.id}\` 的替换未命中：${from}\n  （被测件已变 ⇒ 刀失效 ⇒ 须同步改刀，✗ 当作「刀下了」）`);
		process.exit(2);
	}
	cellarSrc = cellarSrc.split(from).join(to);
}
eval(WRAP(cellarSrc));               // 与打包器同形装进同一环境

const R = () => setup.RPG;
const H = globalThis.__host;
const V = () => State.variables;

/* ---------- 断言面 ---------- */
let failures = 0, passes = 0;
const CELLS = new Set();
const cell = (id) => { CELLS.add(id); console.log(`\n─ ${id}`); };
const reds = new Set();
const ok = (id, cond, msg) => {
	if (cond) { passes++; console.log(`  ✓ ${msg}`); }
	else { failures++; reds.add(id.slice(1, -1)); console.error(`  ✗ [${id.slice(1, -1)}] ${msg}`); }
};

/* ---------- 驱动面（无头：不落 DOM，只走场景的**判定与副作用**） ---------- */
const scene = (id) => R().scenes.get(id);
/** 进入一个场景：跑 `onEnter`（若有）并读回可判定面（文本 ＋ 可用选项） */
const enter = (id) => {
	const s = scene(id);
	if (!s) throw new Error(`未注册的场景：${id}（故事面装载失败？）`);
	if (s.onEnter) s.onEnter(s);
	const text = typeof s.text === 'function' ? s.text() : s.text;
	return { id, text, choices: s.availableChoices.map((c) => (typeof c.text === 'function' ? c.text() : c.text)) };
};
/** 按**选项文本**选中（文本取自 `enter()` 的同一读法 ⇒ 不会「按另一个字串选」） */
const pick = (id, text) => {
	const s = scene(id);
	const c = s.availableChoices.find((x) => (typeof x.text === 'function' ? x.text() : x.text) === text);
	if (!c) throw new Error(`场景「${id}」当前没有选项「${text}」（现有：${s.availableChoices.map((x) => (typeof x.text === 'function' ? x.text() : x.text)).join('｜')}）`);
	if (typeof c.action === 'function') c.action(s);
	return c;
};
/** 背包件数（堆叠按 charges，非堆叠每槽 1 —— 与 `RPG.take` 的口径同） */
const countOf = (id) => (V().inventory ?? []).reduce((n, s) => n + (s.id === id ? (s.charges ?? 1) : 0), 0);
/** 道具的**表值**件数（`RPG.createItem` 取默认定义）—— 判据钉表位置，平衡只改表（✗ 硬编码数字） */
const DEF = (id) => (R().createItem(id).charges ?? 1);
const lines = () => H.host.outputs.flatMap((b) => b.lines).map(String);
const reset = () => { H.reset(); V().inventory = []; };

/* ============================ 判据 ①：木箱格 · 奖励与进入副作用幂等 ============================ */
reset();
{
	const id = '[idem-box]';
	cell(id);
	V().inventory = [];
	R().give('club');
	const before = countOf('coin') + countOf('iron-key');

	/* 两向臂（⑤ 对照档）：条件选项**按前置开合** —— 没木棒时该选项不该在 */
	{
		const held = (V().inventory ?? []).slice();
		V().inventory = [];
		const 无棒 = enter('cellar-box').choices.includes('用木棒撬开木箱');
		ok(id, 无棒 === false, `无木棒 ⇒ 不显示开箱项（实得 ${无棒}）—— 条件选项的前置臂`);
		V().inventory = held;
	}
	const 有棒 = enter('cellar-box').choices.includes('用木棒撬开木箱');
	ok(id, 有棒 === true, `持木棒且未开箱 ⇒ 显示开箱项（实得 ${有棒}）`);

	/* 撬开：一次性奖励 ＋ 故事标记 */
	pick('cellar-box', '用木棒撬开木箱');
	ok(id, V().boxOpened === true, `撬开后标记置位（实得 ${JSON.stringify(V().boxOpened)}）`);
	ok(id, countOf('coin') === 1 && countOf('iron-key') === 1,
		`首开恰好各得 1 件（实得 coin=${countOf('coin')}、iron-key=${countOf('iron-key')}）`);
	ok(id, lines().some((l) => l.includes('长钉呻吟着松开')), '首开有出声（玩家看得到）');

	/* ★本行正题：**重新呈现不重复领取奖励、不重复执行进入副作用** */
	const 重进 = enter('cellar-box');
	ok(id, 重进.choices.includes('用木棒撬开木箱') === false,
		`重进后**不再**显示开箱项（实得显示=${重进.choices.includes('用木棒撬开木箱')}）—— 重复进入的进入副作用须已封闭`);
	ok(id, countOf('coin') === before + 1 && countOf('iron-key') === 1,
		`重进后奖励未重复（coin=${countOf('coin')}、iron-key=${countOf('iron-key')}，重进前基线 coin=${before}）`);
	ok(id, countOf('coin') + countOf('iron-key') === 2,
		`木箱格总计仍恰 2 件（实得 ${countOf('coin') + countOf('iron-key')}）`);
}

/* ============================ 判据 ②：酒架格 · 同上 ============================ */
reset();
{
	const id = '[idem-wine]';
	cell(id);
	const 未取 = enter('cellar-wine');
	ok(id, 未取.choices.includes('收起油纸包') === true, '未取过 ⇒ 显示收取项');
	pick('cellar-wine', '收起油纸包');
	ok(id, V().wineTaken === true, `收好后标记置位（实得 ${JSON.stringify(V().wineTaken)}）`);
	ok(id, countOf('bandage') === DEF('bandage'),
		`首取恰得表值件数（实得 ${countOf('bandage')}，表=${DEF('bandage')}）`);
	const 重进 = enter('cellar-wine');
	ok(id, 重进.choices.includes('收起油纸包') === false,
		`重进后**不再**显示收取项（实得显示=${重进.choices.includes('收起油纸包')}）`);
	ok(id, countOf('bandage') === DEF('bandage'), `重进后未重复领取（绷带实得 ${countOf('bandage')}）`);
	ok(id, 重进.text.includes('只剩一层灰'), '重进的场景文本随标记翻面（自循环重绘的语义）');
}

/* ============================ 判据 ③：存档后推进再读档，标记与背包恢复一致 ============================ */
reset();
{
	const id = '[save-rt]';
	cell(id);
	V().inventory = [];
	R().give('club');
	pick('cellar-box', '用木棒撬开木箱');          // 存档点：已开箱
	const 存档 = H.save.make();                    // 走宿主真实存流程（含 onSave 处理器）

	pick('cellar-wine', '收起油纸包');             // 存档**之后**推进：再拿一卷绷带
	ok(id, countOf('bandage') === DEF('bandage') && V().wineTaken === true,
		`前置：推进确已发生（绷带=${countOf('bandage')}／表=${DEF('bandage')}，wineTaken=${JSON.stringify(V().wineTaken)}）`);

	H.save.load(存档);                             // 走宿主真实读流程（含 onLoad 裁决 → 还原）
	ok(id, V().boxOpened === true, `读档后开箱标记仍在（实得 ${JSON.stringify(V().boxOpened)}）`);
	ok(id, countOf('coin') === 1 && countOf('iron-key') === 1,
		`读档后木箱奖励仍在（coin=${countOf('coin')}、iron-key=${countOf('iron-key')}）`);
	ok(id, countOf('bandage') === 0 && V().wineTaken !== true,
		`读档后**回退**到存档点（绷带=${countOf('bandage')}、wineTaken=${JSON.stringify(V().wineTaken)}）—— 标记与背包一致`);

	/* ★增量（本行与①断的不是同一件事）：**往返之后守卫仍咬得住** ——
	 *   「值往返相等 ≠ 语义存活」：标记在了，`when` 闭包是否仍能读到它（读的是新的绑定） */
	const 往返后 = enter('cellar-box');
	ok(id, 往返后.choices.includes('用木棒撬开木箱') === false,
		'读档后木箱格仍不显示开箱项（守卫在往返后仍活）');
	ok(id, countOf('coin') + countOf('iron-key') === 2,
		`读档后木箱奖励总数仍为 2（实得 ${countOf('coin') + countOf('iron-key')}）`);
	const 酒架回 = enter('cellar-wine');
	ok(id, 酒架回.choices.includes('收起油纸包') === true, '读档后酒架收取项**回来**了（反向臂：标记确已回退）');
}

/* ============================ 汇总 ============================ */
console.log('');
for (const p of PENDING) console.log(`  ⏳ ${p}`);
console.log(`老宅基线判据：cell=${CELLS.size} pass=${passes} fail=${failures} pending=${PENDING.length}`
	+ (failures ? ` 红格＝${JSON.stringify([...reds].sort())}` : ''));
if (failures) {
	console.error('行为基线未保持 —— 重构支须先折平这些红，✗ 以「故事还能跑」代替读数');
	process.exit(1);
}
console.log('✓ 判据全绿（待判行见上 ⏳，不入绿、也不静默跳过）');
