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
const 包档 = path.join(REPO, 'tests', 'unit', 'dist', 'bundle.js');   // ★构建产物（会话层随包发布 ⇒ `#1925` 三刀的靶）

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

	/* ── ★`#1925` 命令提交（草稿 ⇒ 一次原子结算）：三把刀各**恰**红一格 ──
	 *   ★靶＝**构建产物**（会话层 `src/core/55-session.js` 随包发布）。本档直接改跑起来的那一份，
	 *     ✗ 不改 `src/**` 后**忘了重建** —— 那正是本席今日栽过的空刀（改源码不重建 ⇒ 刀没落在被测物上
	 *     ⇒ 零红被误读成「判据没牙」）。装载处会再核一次命中（替换不中 ⇒ 具名退出）。
	 *   ✗ 不改 `src/core/55-session.js` 的文件，故本档 ✗ 需要 `python3 build.py`（CI 的位次已在 build 之后）。 */
	{
		id: 'commit-merge-on-reject',
		file: 包档,
		why: '拒绝时**照样把草稿并进**活事实块（＝`#1752` 记的那族：报 rejected 而变化保留）'
			+ '⇒ 红四格：`[commit-atomic]` ＋ `[commit-rng]`／`[commit-render]`／`[commit-c4]` 的负臂'
			+ '（`#1933` 明账：那两格的「拒后不得落」与原子格**共用同一条引擎语义**，✗ 是判据错，是语义耦合）',
		/* ⚠ `#1933` C4/C3 后**锚随码同刷**（刀义不变：拒时仍并草稿）：被替换的那行现在带 `rngDraws`。 */
		patch: [["return { settled, reason, rolledBack: true, changed: [], rngDraws: 计.n };",
			"Object.assign(this._facts, 草稿);   /* 刀：拒绝也并草稿 */ return { settled, reason, rolledBack: true, changed: [], rngDraws: 计.n };"]],
		expect: ['commit-atomic', 'commit-rng', 'commit-render', 'commit-c4'],
	},
	{
		id: 'commit-swallow-throw',
		file: 包档,
		why: '普通异常**吞成 rejected**（＝把「崩了」伪装成「被拒绝」）⇒ 只红中断格',
		/* ⚠ `#1933` C4：该行现在带「丢半截呈现 ＋ 关计数槽」⇒ 锚随码同刷（刀义不变：把崩了伪装成被拒）。 */
		patch: [["else { this.ports.render.丢弃(); this._计 = null; throw e; }",
			"else { settled = 'rejected'; reason = 'internal-error'; }"]],
		expect: ['commit-interrupt'],
	},
	{
		id: 'commit-ctx-facts-live',
		file: 包档,
		why: '命令内的合并视图（`ctx.facts()`）**只看已提交**（✗ 不含草稿）⇒ 只红存档点格',
		patch: [["facts: () => 快照({ ...this._facts, ...草稿 }),", "facts: () => 快照({ ...this._facts }),"]],
		expect: ['commit-rt'],
	},
	/* ── ★`sgstory#1933` 四类格的刀 ──
	 * 四把：`guard-skip-render`／`oneshot-drop-refuse`／`rng-drop-draw`／`render-before-judge`，**各恰红自己那格**。
	 * ⚠ 另有既有刀 `commit-merge-on-reject`（拒后仍并草稿）按实情**红三格**（`[commit-atomic]` ＋ `[commit-rng]`／`[commit-render]` 的负臂）：
	 *   那两格的「拒后不得落」与原子格**共用同一条引擎语义** ⇒ ✗ 是判据错，是语义耦合（见那把刀的 `why`）。 */
	{
		id: 'guard-skip-render',
		file: 包档,
		why: '不适用（`when` 假）那一支**跳过渲染** ⇒ 屏上停在上一态 ⇒ 只红守卫格',
		patch: [['\t\t\t\tthis._scene.render?.(this.ctx);\n', '']],
		expect: ['commit-guard'],
	},
	{
		id: 'oneshot-drop-refuse',
		file: SESSION_BRIDGE,
		why: '一次性格**忘拒**（重复也能拿）⇒ 只红一次性格',
		patch: [["\t\t\t\tif (c.facts().拿过 === true) throw R().refuse('already-taken', '这一份已经拿过了。');\n", '\t\t\t\t/* 刀：忘拒（重复也能拿） */\n']],
		expect: ['commit-oneshot'],
	},
	{
		id: 'rng-drop-draw',
		file: SESSION_BRIDGE,
		why: '随机格**忘了把抽取值并入**（只落次数）⇒ 只红随机格的正例臂'
			+ '（★负例臂「拒后不得落」的刀在 `commit-merge-on-reject` 那把上 —— 两格共用「拒后丢草稿」那条语义，见其 why）',
		patch: [['\t\t\trun: 行为 ?? ((c) => { const v = c.rng.next(); c.commit({ 抽: v, 次: (c.facts().次 ?? 0) + 1 }); }),\n', '\t\t\trun: 行为 ?? ((c) => { const v = c.rng.next(); c.commit({ 次: (c.facts().次 ?? 0) + 1 }); }),\n']],
		expect: ['commit-rng'],
	},
	{
		id: 'render-before-judge',
		file: 包档,
		why: '把重渲挪到**判决点之前**（屏上按命令跑**之前**的事实画 ⇒ 结算后的新值反而看不到）⇒ 只红呈现格'
			+ '（★呈现格的负臂「被拒后不得印草稿」的牙来自共用刀 `commit-merge-on-reject`，见其 why）',
		patch: [['\t\t\tconst 解 = this.#执行命令(act);\n', '\t\t\tthis._scene.render?.(this.ctx);   /* 刀：重渲挪到判决点**之前** */\n\t\t\tconst 解 = this.#执行命令(act);\n'], ["\t\t\tthis._events.emit('action', { id, session: this.id, settled: 解.settled, ...(解.reason ? { reason: 解.reason } : {}) });\n\t\t\tthis._scene.render?.(this.ctx);\n", "\t\t\tthis._events.emit('action', { id, session: this.id, settled: 解.settled, ...(解.reason ? { reason: 解.reason } : {}) });\n"]],
		expect: ['commit-render'],
	},
	{
		id: 'c3-draws-not-counted',
		file: 包档,
		why: '抽取**不计数**（`计.n += 0`）⇒ `rngDraws` 恒 0 ⇒ 只红 C3 格',
		patch: [["\t\t\t视图[k] = (...args) => { const 计 = 槽(); if (计) 计.n += 1; return Reflect.apply(v, rng, args); };", "\t\t\t视图[k] = (...args) => { const 计 = 槽(); if (计) 计.n += 0;   /* 刀：抽取不计数 */ return Reflect.apply(v, rng, args); };"]],
		expect: ['commit-c3'],
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
/* ★刀靶＝**构建产物**时（`#1925` 三把）：先把刀打在产物**文本**上，再经同一条 `load` 装载 ——
 *   ✗ 不走「改源码 ＋ 另写一个装载形」：装载形一变，被测的就不是 CI 跑的那一份（本档别处已为此设过自证）。 */
if (knife?.file === 包档) {
	let 包Src = fs.readFileSync(bundle, 'utf8');
	for (const [from, to] of knife?.patch ?? []) {
		if (!包Src.includes(from)) {
			console.error(`✗ 刀 \`${knife.id}\` 的替换未命中（产物）：${from}\n  （产物已变 ⇒ 刀失效 ⇒ 须同步改刀）`);
			process.exit(2);
		}
		包Src = 包Src.split(from).join(to);
	}
	const 临时 = path.join(process.env.TMPDIR ?? '/tmp', `rb1932-knife-${knife.id}.js`);
	fs.writeFileSync(临时, 包Src);
	console.log(`  · 刀 \`${knife.id}\` 已打在**产物**上（${path.relative(REPO, bundle)} ⇒ ${临时}）`);
	load(临时);
} else {
	load(bundle);
}
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

/* ---------- ★`sgstory#1925`：**命令提交**（草稿 ⇒ 一次原子结算）----------
 * 装置＝`session-bridge.js` 的 `挂命令木箱格(A, 行为)`：开箱＝**一条命令**（一个场景动作），
 *   三笔效果（开箱／发奖／标记）**全写草稿**，由 `step()` **一次结算**；`行为` 注入口给三形负例。
 * ★与 `[sess-*]` 四格判**不同的面**：那四格走 `提交(c,…)`（直调**会话**的 `commit`，判「两会话互不串」）；
 *   本三格判**一条命令内部**的「写 ⇒ 结算 ⇒ 回滚」。
 * ★每条面都配**正控**（「不变」类断言缺正控时，装置失明也一样真 —— 见 `[sess-state]` 那条的注）。
 * 读数形（票面第三节）：`{ stepped, action, settled:'applied'|'rejected'|null, reason?, rolledBack, changed }`。 */
{
	const S = globalThis.__sess;
	const R = () => setup.RPG;
	const 试面 = (sub, fn) => { try { fn(); } catch (e) { ok(sub, false, `★驱动抛错（本面没跑完）：${e && e.message}`); } };
	/** 造一个「就绪」的会话：挂命令木箱格 ⇒ 进入 ⇒ 推一条开箱输入。**每格各造自己的。** */
	const 就绪 = (名, 行为 = null) => {
		const A = S.建会话(名);
		S.挂命令木箱格(A, 行为);
		A.enter('cellar-commit');
		A.input.push({ id: 'open-chest' });
		return A;
	};

	/* ---- ① 结算原子性（两向）：全成 ⇒ 三键一次落齐；拒 ⇒ **零残留** ---- */
	cell('[commit-atomic]');
	试面('[commit-atomic]', () => {
		const A = 就绪('原子-成');
		const 成 = A.step();
		console.log(`  · 读数：全成 ${JSON.stringify(成)}｜facts=${JSON.stringify(A.facts())}`);
		ok('[commit-atomic]', 成.settled === 'applied' && 成.rolledBack === false
			&& JSON.stringify(成.changed) === JSON.stringify(['chest', 'loot', 'marked']),
			`★全成：settled=applied／rolledBack=false／changed 三键齐（实得 ${JSON.stringify(成)}）`);
		ok('[commit-atomic]', A.facts().chest === 'open' && A.facts().marked === true
			&& JSON.stringify(A.facts().loot) === JSON.stringify(['绷带', '硬币']),
			`★全成：三值都落进事实块（实得 ${JSON.stringify(A.facts())}）`);
		/* 两形负例**各造自己的会话**（✗ 共用：一条的正控会动到另一条的读数） */
		for (const [名, 行, 期望理由] of [
			['return-false', (c) => { c.commit({ chest: 'open' }); c.commit({ loot: ['绷带'] }); return false; }, 'action-refused'],
			['structured', (c) => { c.commit({ chest: 'open' }); throw R().refuse('CHEST_JAMMED', '这把锁卡死了'); }, 'CHEST_JAMMED'],
		]) {
			const B = 就绪(`原子-拒-${名}`, 行);
			const 前 = JSON.stringify(B.facts());
			const 读 = B.step();
			console.log(`  · 读数：拒（${名}）${JSON.stringify(读)}`);
			ok('[commit-atomic]', 读.settled === 'rejected' && 读.reason === 期望理由
				&& 读.rolledBack === true && JSON.stringify(读.changed) === '[]',
				`★拒（${名}）：settled=rejected／reason=${期望理由}／rolledBack=true／changed=[]（实得 ${JSON.stringify(读)}）`);
			ok('[commit-atomic]', JSON.stringify(B.facts()) === 前,
				`★拒（${名}）**零残留**（前 ${前}｜后 ${JSON.stringify(B.facts())}）`
				+ ' —— 半态（开了箱没发奖）正是本条的靶；上面那一格「全成」是它的**正控**（同一装置确实会写）');
		}
	});

	/* ---- ② 中断恢复 ＋ 重放幂等 ---- */
	cell('[commit-interrupt]');
	试面('[commit-interrupt]', () => {
		/* (a) **普通异常**：须**上抛**（✗ 吞成 rejected —— 那会把「崩了」伪装成「被拒绝」）＋ **零残留** ＋ 会话**仍可用**。 */
		let 次 = 0;
		const A = S.建会话('中断-A');
		S.挂命令木箱格(A, (c) => {
			次 += 1;
			if (次 === 1) { c.commit({ chest: 'open' }); throw new Error('模拟中断：写到一半崩了'); }
			c.commit({ chest: 'open' }); c.commit({ loot: ['绷带', '硬币'] }); c.commit({ marked: true });
		});
		A.enter('cellar-commit');
		const 前 = JSON.stringify(A.facts());
		A.input.push({ id: 'open-chest' });
		let 抛 = null;
		try { A.step(); } catch (e) { 抛 = e; }
		ok('[commit-interrupt]', !!抛 && /模拟中断/.test(String(抛?.message ?? '')),
			`★(a) 普通异常须**上抛**（实得 ${抛 ? `抛了：${抛.message}` : '**没抛**（被吞成 rejected）'}）`);
		ok('[commit-interrupt]', JSON.stringify(A.facts()) === 前,
			`★(a) 中断后**零残留**（前 ${前}｜后 ${JSON.stringify(A.facts())}）`);
		/* 正控＋恢复：同会话再推一条 ⇒ 这次该成（✗ 上一条在「会话被写坏／不再吃输入」的坏装置上也会真） */
		A.input.push({ id: 'open-chest' });
		const 复 = A.step();
		ok('[commit-interrupt]', 复.settled === 'applied' && A.facts().marked === true,
			`★(a) 恢复：中断之后再走一条应成（实得 ${JSON.stringify(复)}｜facts=${JSON.stringify(A.facts())}）`);
		/* (b) **重放幂等**：同一条输入推两次 ⇒ 第二次 `when` 已假 ⇒ 不结算、不改事实（✗ 奖励翻倍）。 */
		const B = 就绪('中断-幂等');
		const 一 = B.step();
		B.input.push({ id: 'open-chest' });            // 重放**同一条**
		const 二 = B.step();
		console.log(`  · 读数：第一次 ${JSON.stringify(一)}｜重放 ${JSON.stringify(二)}｜facts=${JSON.stringify(B.facts())}`);
		ok('[commit-interrupt]', 二.settled === null && 二.reason === 'when-false'
			&& JSON.stringify(二.changed) === '[]' && 二.rolledBack === false,
			`★(b) 重放：第二次应 settled=null／reason=when-false／changed=[]／rolledBack=false（实得 ${JSON.stringify(二)}）`);
		ok('[commit-interrupt]', JSON.stringify(B.facts().loot) === JSON.stringify(['绷带', '硬币']) && B.facts().marked === true,
			`★(b) 重放✗不得翻倍／✗不得回退（实得 ${JSON.stringify(B.facts())}）`);
		ok('[commit-interrupt]', B.input.pending() === 0,
			`★(b) 不适用**也消耗**那次 input（实得 pending=${B.input.pending()}）—— 否则循环驱动会在同一条上打转到上限`);
	});

	/* ---- ③ 存档点：命令**跑的中途**，草稿✗混进「别处取到的那份事实」；结算后才一致 ---- */
	cell('[commit-rt]');
	试面('[commit-rt]', () => {
		/* ★本仓会话层**没有**存档 API（`55-session.js` 只给 `facts/commit/mount/enter/step/run`）⇒
		 *   「存档点」只能取**活事实块**这一面：`A.facts()` ＝ 别处（存档／另一读者）此刻会拿到的那一份。
		 *   本格判**草稿 ✗ 混进存档点** ⇒ 同一瞬间两读：会话侧看不到自己的写、命令内看得到。 */
		const 中 = {};
		const A = S.建会话('存档-A');
		S.挂命令木箱格(A, (c) => {
			c.commit({ chest: 'open' });
			中.会话侧 = JSON.stringify(A.facts());
			中.命令侧 = JSON.stringify(c.facts());
			c.commit({ loot: ['绷带', '硬币'] });
			c.commit({ marked: true });
			中.命令末 = JSON.stringify(c.facts());
		});
		A.enter('cellar-commit');
		const 前 = JSON.stringify(A.facts());
		A.input.push({ id: 'open-chest' });
		const 读 = A.step();
		console.log(`  · 读数：中途 会话侧=${中.会话侧}｜命令侧=${中.命令侧}｜结算后 facts=${JSON.stringify(A.facts())}`);
		ok('[commit-rt]', 中.会话侧 === 前,
			`★中途：草稿**✗ 得**混进存档面那一份（中途读到 ${中.会话侧}；存档点 ${前}）`);
		ok('[commit-rt]', /"chest":"open"/.test(String(中.命令侧)),
			`★中途：命令内 ctx.facts() 应**看得到自己的写**（实得 ${中.命令侧}）`);
		ok('[commit-rt]', 读.settled === 'applied' && JSON.stringify(A.facts()) === 中.命令末,
			`★结算后：存档点应**追平**命令末的合并视图（存档点前 ${前} ⇒ 后 ${JSON.stringify(A.facts())}；命令末 ${中.命令末}）`
			+ ' —— 这条是上面「中途看不到草稿」的**正控**（✗ 在「压根不写」的坏装置上，那条也会真）');
	});
}

/* ---------- ★`sgstory#1933`（A 轨·命令提交全面化）：**四类命令各自的边界** ----------
 * 装置＝`session-bridge.js` 的四个试点格（守卫／一次性／随机／自循环呈现）；每类**两向**。
 * ★读数面：`step()` 的 `{settled, reason, rolledBack, changed}` ＋ `facts()` ＋ 呈现门面的 `setCollector`。
 * ★三条**候选 D 接**的明账（C2／C3／C4）不在本块里判绿红，而是**跑出现读数**并计 `⏳ pending`（✗ 不用绿盖住）。 */
{
	const S = globalThis.__sess;
	const 试面 = (sub, fn) => { try { fn(); } catch (e) { ok(sub, false, `★驱动抛错（本面没跑完）：${e && e.message}`); } };

	/* ---- 守卫：真 ⇒ 写落；假 ⇒ 不结算（且**仍渲染**、输入**已消耗**） ---- */
	cell('[commit-guard]');
	试面('[commit-guard]', () => {
		const A = S.建会话('守卫-A');
		S.挂守卫格(A);
		const 收 = [];
		A.ports.render.setCollector((o) => 收.push(o));
		A.enter('cellar-guard');
		A.input.push({ id: 'open' });
		const 一 = A.step();
		ok('[commit-guard]', 一.settled === 'applied' && A.facts().门 === true && A.facts().走 === 1,
			`★(真) when 真 ⇒ 写落（实得 ${JSON.stringify(一)}｜facts=${JSON.stringify(A.facts())}）`);
		const 渲前 = 收.length;
		A.input.push({ id: 'open' });           // 此时 when 已假
		const 二 = A.step();
		ok('[commit-guard]', 二.settled === null && 二.reason === 'when-false'
			&& JSON.stringify(二.changed) === '[]' && 二.rolledBack === false,
			`★(假) when 假 ⇒ settled=null／when-false／changed=[]／rolledBack=false（实得 ${JSON.stringify(二)}）`);
		ok('[commit-guard]', A.facts().走 === 1 && A.input.pending() === 0,
			`★(假) 事实块不动（走=${A.facts().走}）且**那次 input 已消耗**（pending=${A.input.pending()}）`);
		ok('[commit-guard]', 收.length > 渲前,
			`★(假) 不适用时**仍须渲染**一次（收集器 ${渲前}⇒${收.length}）—— 不适用 ≠ 不画；屏上不能停在上一态`);
	});

	/* ---- 一次性：首次落；重复 ⇒ **拒**（✗ 不是静默不跑）＋ 事实块逐项相同 ---- */
	cell('[commit-oneshot]');
	试面('[commit-oneshot]', () => {
		const A = S.建会话('一次性-A');
		S.挂一次性格(A);
		A.enter('cellar-oneshot');
		A.input.push({ id: 'take' });
		const 一 = A.step();
		ok('[commit-oneshot]', 一.settled === 'applied' && A.facts().拿过 === true && A.facts().件数 === 1,
			`★首次 ⇒ 写落（实得 ${JSON.stringify(一)}｜facts=${JSON.stringify(A.facts())}）`);
		const 前 = JSON.stringify(A.facts());
		A.input.push({ id: 'take' });
		const 二 = A.step();
		ok('[commit-oneshot]', 二.settled === 'rejected' && 二.reason === 'already-taken'
			&& 二.rolledBack === true && JSON.stringify(二.changed) === '[]',
			`★重复 ⇒ **拒**且报得出理由（实得 ${JSON.stringify(二)}）—— ✗ 不许静默走 when-false（那样玩家点了没反馈）`);
		ok('[commit-oneshot]', JSON.stringify(A.facts()) === 前,
			`★重复 ⇒ 事实块**逐项相同**（前 ${前}｜后 ${JSON.stringify(A.facts())}）`);
	});

	/* ---- 随机：成功 ⇒ 抽取值随结算落；被拒 ⇒ 抽取值**不得落** ---- */
	cell('[commit-rng]');
	试面('[commit-rng]', () => {
		const A = S.建会话('随机-A');
		S.挂随机格(A);
		A.enter('cellar-rng');
		A.input.push({ id: 'roll' });
		const 一 = A.step();
		ok('[commit-rng]', 一.settled === 'applied' && typeof A.facts().抽 === 'string' && A.facts().次 === 1,
			`★成功 ⇒ 抽取值随结算落（实得 ${JSON.stringify(一)}｜抽=${JSON.stringify(A.facts().抽)}）`);
		const B = S.建会话('随机-B');
		S.挂随机格(B, (c) => { const v = c.rng.next(); c.commit({ 抽: v, 次: 1 }); throw R().refuse('ROLL-JAMMED', '骰子卡住了。'); });
		B.enter('cellar-rng');
		const 前 = JSON.stringify(B.facts());
		B.input.push({ id: 'roll' });
		const 二 = B.step();
		ok('[commit-rng]', 二.settled === 'rejected' && 二.reason === 'ROLL-JAMMED' && JSON.stringify(二.changed) === '[]',
			`★被拒 ⇒ rejected／理由／changed=[]（实得 ${JSON.stringify(二)}）`);
		ok('[commit-rng]', JSON.stringify(B.facts()) === 前,
			`★被拒 ⇒ 抽取值**不得落**（前 ${前}｜后 ${JSON.stringify(B.facts())}）`);
	});

	/* ---- 呈现：结算后重渲读新值（正控）---- */
	cell('[commit-render]');
	试面('[commit-render]', () => {
		const A = S.建会话('呈现-A');
		S.挂自循环呈现格(A);
		const 收 = [];
		A.ports.render.setCollector((o) => 收.push(o));
		A.enter('cellar-render');
		A.input.push({ id: '翻新' });
		const 读 = A.step();
		const 文本 = 收.map((o) => String(o.text)).join('｜');
		ok('[commit-render]', 读.settled === 'applied' && A.facts().值 === '新' && /呈现：新/.test(文本),
			`★结算后重渲读到**新值**（实得 ${JSON.stringify(读)}｜facts 值=${A.facts().值}｜屏上=${文本}）`);
		const B = S.建会话('呈现-B');
		S.挂自循环呈现格(B, (c) => { c.commit({ 值: '新' }); throw R().refuse('RENDER-STOP', '停下。'); });
		const 收B = [];
		B.ports.render.setCollector((o) => 收B.push(o));
		B.enter('cellar-render');
		const 前B = 收B.length;
		B.input.push({ id: '翻新' });
		const 读B = B.step();
		const 文本B = 收B.slice(前B).map((o) => String(o.text)).join('｜');
		ok('[commit-render]', 读B.settled === 'rejected' && B.facts().值 === '旧' && /呈现：旧/.test(文本B),
			`★被拒后重渲须读**回滚后**的值（✗ 不许把草稿印上屏）（实得 ${JSON.stringify(读B)}｜facts 值=${B.facts().值}｜屏上=${文本B}）`);
	});
}

/* ---------- ★`sgstory#1933` 的三条 **候选 D 接** 明账（✗ 不用绿盖住；每条都附**现读数**）----------
 * 依据＝票面「三条 pending 臂」（C2 引擎对象态／C3 随机流后态／C4 呈现半截）。 */
{
	const S = globalThis.__sess;
	/* C2：草稿只覆盖**会话事实块** ⇒ 命令体里改**引擎对象**（HP 等）拒后**仍改着**。 */
	{
		const A = S.建会话('C2-A');
		const P = setup.DND3.Player;
		const 前血 = P.hp;
		A.mount('c2', () => ({
			id: 'c2', enter: (c) => { c.commit({ 试: 1 }); }, render: () => {},
			actions: [{ id: '伤', run: (c) => { P.hp = 前血 - 3; c.commit({ 试: 2 }); throw R().refuse('C2', '拒绝'); } }],
		}));
		A.enter('c2');
		A.input.push({ id: '伤' });
		const 读 = A.step();
		const 后血 = P.hp;
		P.hp = 前血;                                  // ★还原：✗ 不污染别格
		PENDING.push('[commit-c2] 引擎对象态：草稿只覆盖会话事实块 ⇒ 命令体里改 HP／充能／位置，**拒后仍改着**'
			+ `（现读数：拒绝 ${读.settled}／${读.reason}｜HP ${前血} ⇒ **${后血}**（✗ 未还原）｜facts 已回滚 ✓`
			+ '｜候批 D 落「对象态回滚」；出处：`#1933` 票面 C2 ＋ `src/core/55-session.js:173-197`）');
		console.log(`  ⏳ C2 引擎对象态：拒后 HP ${前血}⇒${后血}（✗ 未还原）`);
	}
	/* C3：随机流**后态** —— `RPG.rng` 的 `index` **可读**且可写（★我第一版曾写「读不出位置」，见下行自陈）；本臂判不了的不是「读不出」，而是「拒后该退到哪」**没有契约**。 */
	{
		const r = R().rng;
		const 位置系 = ['位置', 'pos', 'index', 'state', 'snapshot', '快照'].filter((k) => typeof r?.[k] !== 'undefined');
		/* ★**我第一版把这条写错了**（自陈）：我原写「读不出位置」——实测 `index` **存在**（可读）⇒ 改成下面这句准确的：
		 *   可读 ≠ 可**回滚**：命令层拒后**没人去退**那个位置，★且「退到哪」这件事本身没有契约（`rngAfter` 只在 doc-3 §4）。 */
		let 可写 = null;
		try { const 原 = r.index; r.index = 原; 可写 = r.index === 原; } catch { 可写 = false; }
const A = S.建会话('C3-A');
		S.挂随机格(A);
		A.enter('cellar-rng');
		A.input.push({ id: 'roll' });
		const 读A = A.step();
		ok('[commit-c3]', 读A.settled === 'applied' && 读A.rngDraws === 1,
			`★成：一次抽取 ⇒ rngDraws 须报 1（实得 ${JSON.stringify(读A)}）`);
		/* 拒臂：抽一次再拒 ⇒ **抽取出去了**（读数报 1），而事实块回滚 ⇒ 「拒后流不回退」这一契约的**依据** */
		const B = S.建会话('C3-B');
		S.挂随机格(B, (c) => { c.rng.next(); throw R().refuse('ROLL-JAMMED', '骰子卡住了。'); });
		B.enter('cellar-rng');
		const 前B = JSON.stringify(B.facts());
		B.input.push({ id: 'roll' });
		const 读B = B.step();
		ok('[commit-c3]', 读B.settled === 'rejected' && 读B.rngDraws === 1,
			`★拒：抽取**已发生**（rngDraws=1 ⇒ 拒后流**未回退**，这就是契约的依据）（实得 ${JSON.stringify(读B)}）`);
		ok('[commit-c3]', JSON.stringify(B.facts()) === 前B, `★拒：事实块仍须回滚（前 ${前B}｜后 ${JSON.stringify(B.facts())}）`);
		/* 不适用臂：`when` 假那条路**不跑命令体** ⇒ rngDraws 须 0（✗ 不许拿「上一次的计数」充数） */
		const C = S.建会话('C3-C');
		S.挂守卫格(C);
		C.enter('cellar-guard');
		C.input.push({ id: 'open' });
		C.step();
		C.input.push({ id: 'open' });
		const 读C = C.step();
		ok('[commit-c3]', 读C.settled === null && 读C.rngDraws === 0,
			`★不适用：when 假那条路 rngDraws 须 0（实得 ${JSON.stringify(读C)}）`);
		console.log(`  · 读数：成 rngDraws=${读A.rngDraws}｜拒 rngDraws=${读B.rngDraws}（流未回退）｜不适用 rngDraws=${读C.rngDraws}`);
	}
	/* C4：命令体**自己印**的那一路（`c.ports.render.output`）在**判决点之前**就落 ⇒ 拒后屏上留半截。 */
	{
		const A = S.建会话('C4-A');
		const 收4 = [];
		A.ports.render.setCollector((o) => 收4.push(o));
		A.mount('c4', () => ({
			id: 'c4', enter: (c) => { c.commit({ 值: '旧' }); }, render: () => {},
			actions: [{ id: '翻', run: (c) => { c.commit({ 值: '新' }); c.ports.render.output('翻新中：值=新（半截）'); throw R().refuse('C4', '拒绝'); } }],
		}));
		A.enter('c4');
		A.input.push({ id: '翻' });
		const 读 = A.step();
		const 半截 = 收4.filter((o) => /翻新中/.test(String(o.text))).length;
ok('[commit-c4]', 读.settled === 'rejected' && 半截 === 0,
			`★拒臂：命令体内印的那一句**不得出门**（实得 ${JSON.stringify(读)}｜收集器收到「翻新中」**${半截}** 条（应 0））`);
		ok('[commit-c4]', A.facts().值 === '旧', `★拒臂：事实块须回滚（实得 值=${A.facts().值}）`);
		/* ★正控（✗ 缺它会假绿：一个「什么都丢」的实现也能过拒臂）：同样的命令体**不拒** ⇒ 那一句须**放行**（恰 1 条）。 */
		const B = S.建会话('C4-B');
		const 收B = [];
		B.ports.render.setCollector((o) => 收B.push(o));
		B.mount('c4b', () => ({
			id: 'c4b', enter: (c) => { c.commit({ 值: '旧' }); }, render: () => {},
			actions: [{ id: '翻', run: (c) => { c.commit({ 值: '新' }); c.ports.render.output('翻新中：值=新（应当放行）'); } }],
		}));
		B.enter('c4b');
		B.input.push({ id: '翻' });
		const 读B = B.step();
		const 放行 = 收B.filter((o) => /翻新中/.test(String(o.text))).length;
		ok('[commit-c4]', 读B.settled === 'applied' && 放行 === 1 && B.facts().值 === '新',
			`★正控：不拒时那一句须**放行**（实得 ${JSON.stringify(读B)}｜收集器 ${放行} 条（应 1）｜值=${B.facts().值}）`);
		console.log(`  · 读数：拒臂 半截=${半截}（应 0）｜正控 放行=${放行}（应 1）`);
	}
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

/* ============ `[identity-slots]` 装备槽域（`#1935` 轨 B·`#1924` 身份推广）============
 * ★与 `[identity]` 同形（tests-first）：**特性在位就断、缺席就记 pending ＋ 印现读数**。
 * 本域的要害：`equippedIn(slotName)` 用 `inv().find(...)` ⇒ 命中**第一件**；
 * 两件同类都在位时，「哪一件在装备」这个问句**没有身份可答**。 */
cell('[identity-slots]');
{
	const 有身份 = (x) => x != null && (typeof x.entityId === 'string' || typeof x.definitionId === 'string');
	const 两件同类 = (id) => {
		State.variables.inventory = [];
		R().give(id); R().give(id);
		return State.variables.inventory.filter((x) => x.id === id);
	};
	const 两 = 两件同类('mail');
	const 现形态 = JSON.stringify(两.map((x) => ({ slotId: x.slotId ?? null, entityId: x.entityId ?? null })));
	if (!(两.length >= 2 && 有身份(两[0]))) {
		PENDING.push('[identity-slots] ① 装备槽双实例互不串扰：装备槽的身份面**未在位**'
			+ `（两件 mail 的 ${现形态}）—— 候 D 码（sgstory#1935）；`
			+ '★现行为锚：`equippedIn(slotName)` 走 `find` ⇒ 两件同类时**回报第一件**'
			+ '（`30-inventory.js:189-190`）');
		console.log(`  ⏳ 槽①：槽身份未在位｜两件 mail 的 ${现形态}｜equippedIn 用 find ⇒ 恒首个`);
	} else {
		/* ★本域实测：`equippedIn` 过滤 `x.equipped` ⇒ 同槽两件同类时**回报在装备的那一件**
		 *   ⇒ 这条性质**现在就成立**（不是待判）—— 它守的是「将来改成按槽名回报首个」这类退化。 */
		两[0].equipped = true;
		const 甲 = R().equippedIn('body');
		const 记 = 甲?.entityId ?? null;
		两[0].equipped = false; 两[1].equipped = true;
		const 乙 = R().equippedIn('body');
		const 记2 = 乙?.entityId ?? null;
		if (记 == null) {
			PENDING.push('[identity-slots] ① 装备槽双实例互不串扰：`equippedIn` 未回报实体（装置面拿不到）');
			console.log('  ⏳ 槽①：equippedIn 未回报实体');
		} else {
			console.log(`  ✓ 槽①：装第一件 ⇒ 回报 ${记}；改装第二件 ⇒ 回报 ${记2}（须不同）`);
			ok('[identity-slots]', 记2 !== 记,
				`★换一件装备后 equippedIn 须回报**换的那一件**（实得 ${JSON.stringify([记, 记2])}）`);
		}
	}
}

/* ============ `[identity-enemies]` 敌人实例域（`#1935`）============
 * ★本域的**烟枪在源码注释里就有**（`40-battle.js:546`）：
 *   「② 值取稳定标识（✗ 名字）：现码 `value: c.name` ⇒ 两只同名单位**只能选中第一只**」。
 * ⇒ 锚形＝「传第一只」与「传第二只」**得到同一个值**（同名 ⇒ 不可分辨）。 */
cell('[identity-enemies]');
{
	const 复制 = (ref) => {
		const p = R().characters.get(ref);
		const c = R().Character.revive(JSON.parse(JSON.stringify(p.toJSON())));
		c.hp = c.maxHp; c.nonlethal = 0;
		return c;
	};
	let 两 = [];
	try { 两 = [复制('badger'), 复制('badger')]; } catch { 两 = []; }
	const 有身份 = (x) => x != null && typeof x.entityId === 'string';
	if (两.length < 2) {
		PENDING.push('[identity-enemies] ① 敌人实例互不串扰：引擎侧拿不到两只同源敌人（装置面）');
		console.log('  ⏳ 敌①：装置面拿不到两只同源敌人');
	} else if (!有身份(两[0])) {
		两[0].entityId = undefined; 两[1].entityId = undefined;
		const 值同 = 两[0].name === 两[1].name;
		PENDING.push('[identity-enemies] ① 敌人实例互不串扰：敌人身份面**未在位**'
			+ `（两只 badger 的 entityId＝${JSON.stringify(两.map((x) => x.entityId ?? null))}，name 皆「${两[0].name}」）`
			+ '—— 候 D 码（sgstory#1935）；★现行为锚：目标选项的 `value` 取 `c.name`'
			+ '（`40-battle.js:546`）⇒ 两只同名单位**只能选中第一只**；'
			+ `本探实测「两只名字相同」＝${值同} ⇒ 传第一只与传第二只在选项里**值逐字同**`);
		console.log(`  ⏳ 敌①：身份未在位｜两只 badger 名皆「${两[0].name}」｜`
			+ `entityId＝${JSON.stringify(两.map((x) => x.entityId ?? null))}｜名字相同=${值同} ⇒ 选项值不可分辨`);
	} else {
		const 一 = 两[0].entityId, 二 = 两[1].entityId;
		ok('[identity-enemies]', 一 !== 二,
			`★两只同源敌人须各自身份不同（实得 ${JSON.stringify([一, 二])}）`);
	}
}

/* ============ `[identity-scenes]` 场景容器域（`#1935`）============
 * ★容器类的身份歧义＝「两个同定义容器共用一个状态键」⇒ 开了一个看起来两个都开了。 */
cell('[identity-scenes]');
{
	const 容器面 = ['scenes', 'Chest', 'registerScene', 'Scene'].filter((k) => R()?.[k] != null);
	if (容器面.length === 0) {
		PENDING.push('[identity-scenes] ① 场景容器互不串扰：引擎侧**无**场景/容器面（装置面）');
		console.log('  ⏳ 场①：引擎无场景/容器面');
	} else {
		const 键形 = (() => {
			try { const c = new (R().Chest ?? Object)(); return c && typeof c === 'object' ? Object.keys(c) : null; }
			catch { return null; }
		})();
		PENDING.push('[identity-scenes] ① 场景容器互不串扰：容器身份面**未在位**'
			+ `（引擎侧有 ${JSON.stringify(容器面)}；容器对象键＝${JSON.stringify(键形)}）`
			+ '—— 候 D 码（sgstory#1935）；★现行为锚：同定义容器的状态**按定义（而非实例）**存'
			+ '⇒ 开其一则其二同态 ⇒ 「哪一只被开过」这个问句无身份可答');
		console.log(`  ⏳ 场①：容器身份未在位｜引擎侧有 ${JSON.stringify(容器面)}｜容器键＝${JSON.stringify(键形)}`);
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
