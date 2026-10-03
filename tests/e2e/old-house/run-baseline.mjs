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
 *       ④两个会话状态/随机源/事件/输入相互独立 —— `GameSession` 落地后**已解锁**（交付 1 步 3）；
 *         桥在**装置侧**（`session-bridge.js`，内核只出 `ctx`＋泵）。
 *   待判：**无**。原 `⏳` 那行按 `母条二` **摘除**（✗ 转绿、✗ 静默跳过）：④ 的判据已在上。」
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
const SESSION_BRIDGE = path.join(HERE, 'session-bridge.js');   // 会话侧薄桥（装置侧，④ 格用）

/* 待判行（明账）：这一行**不是**「已过」，也不静默跳过 —— 打印 `⏳` 并计入 pending。
 * ★ 已清零：原 `[sessions] …待 GameSession` 一行在 `7e5dd41`（交付 1 步 3）落地后**摘除** ——
 *   摘除的凭据＝本档 ④ 格（四条面各带正控 ＋ 四把刀各恰红一面），✗ 不是「有实现了就算过」。 */
const PENDING = [];

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

	/* ── 会话侧（`session-bridge.js`）：四把刀各把**一面**接错会话 ⇒ 各**恰**红一条面 ──
	 *   形：把该面的 `单例.X ?? 本会话那份` 换成 `??=`（写回单例 ⇒ 两面共用）。
	 *   这四把刀演的是**装置接错线**这一族的现实事故（✗ 引擎内部共享 —— 那是 D 席单测的面）。 */
	{
		id: 'sess-share-rng',
		file: SESSION_BRIDGE,
		why: '随机源钉成共享 ⇒ 两面同一实例：身份那条与流量那条皆红（同在 `[sess-rng]` 一格）',
		patch: [[`单例.rng ?? 造计数流(id)`, `(单例.rng ??= 造计数流(id))`]],
		expect: ['sess-rng'],
	},
	{
		id: 'sess-cross-bus',
		file: SESSION_BRIDGE,
		why: '订户改订**第一个会话** ⇒ B 的订户会被 A 的 emit 叫到（串台）⇒ 只红事件那条面',
		patch: [[`单例.订到 ?? s`, `(单例.订到 ??= s)`]],
		expect: ['sess-bus'],
	},
	{
		id: 'sess-cross-input',
		file: SESSION_BRIDGE,
		why: '输入推进**第一个会话**的队列 ⇒ B 的推送进了 A ⇒ 只红输入那条面',
		patch: [[`单例.推到 ?? s`, `(单例.推到 ??= s)`]],
		expect: ['sess-input'],
	},
	{
		id: 'sess-cross-state',
		file: SESSION_BRIDGE,
		why: '写口钉到**第一个会话** ⇒ B 自己的动作写进 A ⇒ 红的是**正控**那条（「B 自己走一遍也开不出标记」）'
			+ '—— 正是正控要拦的那族（★没有正控时，本条会以「A 的常识」为真而漏过）',
		patch: [[`单例.写 ?? 注册表[ctx.session.id]`, `(单例.写 ??= 注册表[ctx.session.id])`]],
		expect: ['sess-state'],
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
const 刀文件 = knife?.file ?? CELLAR;
for (const [from, to] of (刀文件 === CELLAR ? knife?.patch ?? [] : [])) {
	if (!cellarSrc.includes(from)) {
		console.error(`✗ 刀 \`${knife.id}\` 的替换未命中：${from}\n  （被测件已变 ⇒ 刀失效 ⇒ 须同步改刀，✗ 当作「刀下了」）`);
		process.exit(2);
	}
	cellarSrc = cellarSrc.split(from).join(to);
}
eval(WRAP(cellarSrc));               // 与打包器同形装进同一环境

/* 会话侧薄桥（装置侧）：下刀时同样字符串替换；未命中**具名报错**（✗ 静默当「刀下了」）。
 * 它不裹别名（装置档，非故事面）⇒ 直接 `eval`；自己挂 `globalThis.__sess`。 */
let 桥Src = fs.readFileSync(SESSION_BRIDGE, 'utf8');
for (const [from, to] of (刀文件 === SESSION_BRIDGE ? knife?.patch ?? [] : [])) {
	if (!桥Src.includes(from)) {
		console.error(`✗ 刀 \`${knife.id}\` 的替换未命中（桥）：${from}\n  （桥已变 ⇒ 刀失效 ⇒ 须同步改刀）`);
		process.exit(2);
	}
	桥Src = 桥Src.split(from).join(to);
}
eval(桥Src);

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

/* ============================ 判据 ④：两个会话 · 状态／随机源／事件／输入互不串 ============================
 * ★四条面各用**自己的格名**（`[sess-*]`）：一个格名包四件事时，刀红在哪一条就分不出来了
 *   （本档 `--selftest` 认的是失败行里的格名）。每条面都配**正控**（「不变」类断言缺正控时，
 *   装置失明也一样真 —— 见前例 `act-refused-ammo.test.js` 头注）。
 * ★装置：`session-bridge.js`（会话侧薄桥）。✗ 拿全局 fixture 直接进会话 —— 它写 `State.variables`，
 *   会话 `facts()` 一动不动 ⇒ 这几条会在**空装置**上恒真）。 */
{
	const id = '[sessions]';
	cell(id);
	const S = globalThis.__sess;
	/* ★四条面**各造自己的会话对**（照 D 席单测的「每个测试各造自己的」）：跨面共用一对时，
	 *   一条面的正控会动到别面的读数（我第一版就栽在这：状态格的正控让 B 抽过一次 ⇒ rng 格
	 *   的「B 尚未跑」前提不成立、冤红），而且一把刀会牵连到别格 ⇒ 分不出是哪一面坏了。 */
	/** 逐面包一层「驱动抛错 ⇒ 该面具名红」：坏引擎下崩掉的格**看不出坏在哪一面**，
	 *  而自检只认具名失败行（崩溃不算红）⇒ 先把异常转成该面的具名红。 */
	const 试面 = (sub, fn) => { try { fn(); } catch (e) { ok(sub, false, `★驱动抛错（本面没跑完）：${e && e.message}`); } };

	const 一对 = (名) => {
		const a = S.建会话(`${名}-A`);
		const b = S.建会话(`${名}-B`);
		S.挂木箱格(a);
		S.挂木箱格(b);
		return { a, b };
	};

	/* ---- ① 状态：一面的写不进另一面的事实块 ---- */
	试面('[sess-state]', () => {
				const { a: A, b: B } = 一对('状态');
		A.enter('cellar-box');
		A.input.push({ id: 'open-box' });
		const 读A = A.run({ maxSteps: 10 });
		ok('[sess-state]', 读A.stopped === 'input-empty' && 读A.steps === 1,
			`前置：A 跑完一条动作（实得 ${JSON.stringify(读A)}）`);
		ok('[sess-state]', A.facts().开过 === true && A.facts().绷带 === 1,
			`A 的提交落进了 A 的事实块（实得 ${JSON.stringify({ 开过: A.facts().开过, 绷带: A.facts().绷带 })}）`);
		console.log(`  · 读数：A.facts()=${JSON.stringify(A.facts())}｜B.facts()=${JSON.stringify(B.facts())}`);
		ok('[sess-state]', B.facts().开过 === undefined && B.facts().绷带 === undefined,
			`★A 的提交**漏进了 B**（B.facts()=${JSON.stringify(B.facts())}）`);
		/* 正控：B 自己走一遍也开得出（✗ 上一条在「谁都开不出」的坏装置上也会真） */
		B.enter('cellar-box');
		B.input.push({ id: 'open-box' });
		B.run({ maxSteps: 10 });
		ok('[sess-state]', B.facts().开过 === true && B.facts().绷带 === 1,
			`★正控：B 自己走一遍应能开出标记（实得 ${JSON.stringify({ 开过: B.facts().开过, 绷带: B.facts().绷带 })}）`
			+ ' —— 这条红时，上一条「A 没漏进 B」就是**空装置**上的假绿');
	});

	/* ---- ② 随机源：身份一份 ＋ 流量不串 ---- */
	试面('[sess-rng]', () => {
				const { a: A, b: B } = 一对('随机');
		ok('[sess-rng]', A.rng !== B.rng && A.rng !== undefined && typeof A.rng.next === 'function',
			`★两会话的随机源不是**各自一份**（A.rng===B.rng? ${A.rng === B.rng}；typeof A.rng.next=${typeof A.rng?.next}）`);
		A.enter('cellar-box');
		A.input.push({ id: 'open-box' });
		A.run({ maxSteps: 10 });
		console.log(`  · 读数：A 抽 1 次后 A.rng.次=${A.rng.次}｜B.rng.次=${B.rng.次}（B 尚未跑）`);
		ok('[sess-rng]', A.rng.次 === 1 && B.rng.次 === 0,
			`★A 抽了一次随机数，B 的流**也被动了**（A.rng.次=${A.rng.次}、B.rng.次=${B.rng.次}）`);
		/* 正控：B 自己跑一遍确实会抽（✗ 上一条在「谁都不抽」的坏装置上也会真），且不动 A 的流 */
		B.enter('cellar-box');
		B.input.push({ id: 'open-box' });
		B.run({ maxSteps: 10 });
		ok('[sess-rng]', B.rng.次 === 1 && A.rng.次 === 1,
			`★正控：B 自己抽一次应只加在 B 的流上（B.rng.次=${B.rng.次}、A.rng.次=${A.rng.次}（应仍 1））`);
	});

	/* ---- ③ 事件：订户只在**它订的那个会话**收到 ---- */
	试面('[sess-bus]', () => {
				const { a: A, b: B } = 一对('事件');
		S.挂探针格(A);
		S.挂探针格(B);
		A.enter('probe');
		B.enter('probe');
		let A收 = 0, B收 = 0;
		S.订(A, 'action', () => { A收 += 1; });
		S.订(B, 'action', () => { B收 += 1; });
		/* ⚠ 驱动走**直调引擎**（✗ 走桥的 `推`）：桥的助手各属一条面，串用会让「输入接错线」
		 *   那把刀连带红到本面 ⇒ 一把刀红两格。 */
		A.input.push({ id: 'ping' });
		A.input.push({ id: 'ping' });
		A.run({ maxSteps: 10 });
		console.log(`  · 读数：A 跑两条后 A 侧订户收=${A收}｜B 侧订户收=${B收}`);
		ok('[sess-bus]', A收 === 2, `前置：A 侧订户应收 2 次（实得 ${A收}）`);
		ok('[sess-bus]', B收 === 0, `★B 的订户收到了 A 的事件（收 ${B收} 次）—— 事件总线串台`);
		/* 正控：B 自己的动作能叫到 B 的订户 */
		B.input.push({ id: 'ping' });
		B.run({ maxSteps: 10 });
		ok('[sess-bus]', B收 === 1, `★正控：B 侧订户应被 B 自己的动作叫到 1 次（实得 ${B收}）`);
	});

	/* ---- ④ 输入：一面的队列只推进一面 ---- */
	试面('[sess-input]', () => {
				const { a: A, b: B } = 一对('输入');
		S.挂探针格(A);
		S.挂探针格(B);
		A.enter('probe');
		B.enter('probe');
		const A步前 = A.steps(), B步前 = B.steps();
		/* ★先推 A（且两面的推送**都**走桥）：输入那把刀把「推到」钉在**第一个**用桥的会话上 ⇒
		 *   若本面第一次用桥就是 B，刀的效果与正常路径重合、红不出来（我第一版即如此，`[]` 零红）。 */
		S.推(A, { id: 'ping' });
		ok('[sess-input]', A.input.pending() === 1 && B.input.pending() === 0,
			`前置：A 推一条只落 A（A.pending=${A.input.pending()}、B.pending=${B.input.pending()}）`);
		S.推(B, { id: 'ping' });
		S.推(B, { id: 'ping' });
		ok('[sess-input]', B.input.pending() === 2 && A.input.pending() === 1,
			`★B 推了两条：B.pending=${B.input.pending()}（应 2）、A.pending=${A.input.pending()}（应仍是 1）`);
		B.run({ maxSteps: 10 });
		console.log(`  · 读数：B.run 后 B.pending=${B.input.pending()}｜A.pending=${A.input.pending()}`
			+ `｜步数 A ${A步前}→${A.steps()}、B ${B步前}→${B.steps()}`);
		ok('[sess-input]', B.steps() === B步前 + 2 && A.steps() === A步前,
			`★B 的两条只推进了 B（B ${B步前}→${B.steps()}、A ${A步前}→${A.steps()}）`);
		/* 正控：A 那条仍在 A 的队列里，A 跑得掉（✗ 上一条在「A 队列已坏／被搬空」时也会真） */
		A.run({ maxSteps: 10 });
		ok('[sess-input]', A.input.pending() === 0 && A.steps() === A步前 + 1,
			`★正控：A 跑完后队列清空且步数只加 1（A.steps=${A.steps()}、pending=${A.input.pending()}）`);
	});
}

/* ---------- ⑤ `sgstory#1924` 实体身份与旧档迁移（**tests-first**：基线锚现行为）----------
 * 照 `#1913` 形：**基线锚现行为**，D 码落即咬合。
 *   三条各写「**特性在位就断、缺席就记 pending ＋ 印现读数**」——
 *   ✗ 不用 `⏳` 盖住「还没实现」，也 ✗ 不拿绿假装「已经过」。
 *
 * 现行为（本席实测，源头 `src/core/30-inventory.js:375-383`）：
 *     const id = typeof itemRef === 'string' ? itemRef : itemRef?.id;
 *     const slot = list.find((s) => s.id === id);          // ★**传实例也按 id 取第一件**
 * 这正是 `#1905` 点名的「两件同类物品剩余次数 [2,9]，选第二件消耗的是第一件」，
 * 也是它写的「`act()` 按类型 ID 取第一件 ⇒ 两把不同耐久的镐会扣错」。
 *
 * ★①的现行为锚**不靠「扣谁」**（那要真消耗），而靠**同一性**：
 *   传第一件 与 传第二件 的返回**逐字相同** ⇒ 就证明解析只看 id（歧义）。
 *   这样锚得住，且 ✗ 依赖具体道具的消耗语义。
 * ⚠ 近战件要目标（传 `target=null` 会炸 `Cannot read properties of null (reading 'hp')`）
 *   ⇒ 本格一律给一个**桩靶**，并把这条写在这里免得后来人当成缺陷。
 */
cell('[identity]');
{
	const 有身份 = (x) => x != null && (typeof x.entityId === 'string' || typeof x.definitionId === 'string');
	const 桩靶 = () => ({ id: 'stub-target', name: '桩靶', hp: 9999, maxHp: 9999, isDown: false, items: [] });
	const 两件同类 = (id) => {
		State.variables.inventory = [];
		R().give(id); R().give(id);
		return State.variables.inventory.filter((x) => x.id === id);
	};

	/* ① 双实例互不串扰（＝`#1905` 的身份歧义） */
	{
		const 两 = 两件同类('club');
		if (两.length < 2) {
			PENDING.push('[identity] ① 双实例互不串扰：装置面拿不到两件同类实例（该件或可堆叠）');
			console.log('  ⏳ ① 双实例互不串扰：拿不到两个实例');
		} else if (!有身份(两[0])) {
			/* 现行为锚：传第一件 与 传第二件 ⇒ 结果逐字相同（＝解析只看 id） */
			const 看成 = (r) => JSON.stringify(r ?? null);
			const 甲 = 看成(R().act(setup.DND3.Player, 两[0], 桩靶(), 'use'));
			const 乙 = 看成(R().act(setup.DND3.Player, 两[1], 桩靶(), 'use'));
			PENDING.push('[identity] ① 双实例互不串扰：实体身份面**未在位**'
				+ `（两件的 ${JSON.stringify(两.map((x) => ({ slotId: x.slotId ?? null, entityId: x.entityId ?? null })))}）`
				+ `—— 候 D 码（sgstory#1924）；★现行为锚：传第一件与传第二件的返回**逐字相同**=${甲 === 乙}`
				+ `（${甲}）⇒ 解析只看 id`);
			console.log(`  ⏳ ① 双实例互不串扰：身份未在位｜两件 slotId=${JSON.stringify(两.map((x) => x.slotId ?? null))}`
				+ `｜传第一件与传第二件返回相同=${甲 === 乙}`);
		} else {
			State.variables.inventory[0].charges = 2;
			State.variables.inventory[1].charges = 9;
			R().act(setup.DND3.Player, 两[1], 桩靶(), 'use');
			const 后 = State.variables.inventory.filter((x) => x.id === 'club').map((x) => x.charges);
			ok('[identity]', 后[0] === 2 && 后[1] === 8,
				`★对**第二件**调用后，被扣的必须是第二件（实得 charges=${JSON.stringify(后)}，应 [2,8]）`);
		}
	}

	/* ② 读档后身份稳定 */
	{
		const 两 = 两件同类('club');
		const 在位 = 两.length >= 2 && 有身份(两[0]);
		if (!在位) {
			const 存 = (() => { try { return JSON.stringify(globalThis.Save?.slots?.get?.(1) ?? null).slice(0, 40); } catch { return '(取不出)'; } })();
			PENDING.push('[identity] ② 读档后身份稳定：实体身份面未在位 ⇒ 存档里也无从表达「哪一件」'
				+ `（现槽 1 快照形＝${存}）—— 候 D 码（sgstory#1924）`);
			console.log('  ⏳ ② 读档后身份稳定：身份未在位（存档里无从表达「哪一件」）');
		} else {
			const 前 = 两.map((x) => x.entityId ?? x.slotId);
			const 存 = R().ports?.persist ?? null;   // 端口在位则走端口，否则直接宿主存档
			存?.save?.({ 标识: 前 }, { slot: 'ident-test' });
			const 回 = 存?.load?.('ident-test');
			ok('[identity]', JSON.stringify(回?.标识 ?? null) === JSON.stringify(前),
				`★读档后身份须**逐字稳定**（写 ${JSON.stringify(前)} ⇒ 读 ${JSON.stringify(回?.标识 ?? null)}）`);
		}
	}

	/* ③ 旧档升级往返 */
	{
		const 两 = 两件同类('club');
		if (!(两.length >= 2 && 有身份(两[0]))) {
			const 迁移链 = (() => { try { return Object.keys(R().MIGRATIONS ?? {}); } catch { return null; } })();
			PENDING.push('[identity] ③ 旧档升级往返：旧档（无身份字段）载入后**无补发**'
				+ `（现迁移链＝${JSON.stringify(迁移链)}）—— 候 D 码（sgstory#1924）；`
				+ '★D 码落后应断：载入即补发（幂等）＋ 再存再读**逐字稳定**');
			console.log('  ⏳ ③ 旧档升级往返：旧档无补发（迁移链里没有身份版本）');
		} else {
			const 一 = 两[0].entityId ?? null, 二 = 两[1].entityId ?? null;
			ok('[identity]', typeof 一 === 'string' && typeof 二 === 'string' && 一 !== 二,
				`★两件同类须各自身份不同（实得 ${JSON.stringify([一, 二])}）`);
		}
	}
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
