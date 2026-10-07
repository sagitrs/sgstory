/* 引擎单测**刀架**（`sgstory#1962`）—— 把「手工下刀 → 看红格 → 复原」这三步做成可复跑的东西。
 *
 * 出处：本席（`sagitrs-tester-4`）在 `#1947`／`#1958`／`#1959`／`#1960` 四笔里**各手工下过一次刀**，
 *   每次都靠人眼比对「红的格是不是我要的那几格」＋ 手工 `cp` 复原。这套东西能自动做这件事。
 *
 * 形照 `books` 侧 `tests/e2e/old-house/run-baseline.mjs --selftest`（本仓既有的三段式范本）：
 *   ①**刀**（可复现的字符串替换，`patch: [[找, 换], …]`）
 *   ②**期望红格**（`expect: [<用例名子串>, …]`，判「**恰好**等于」而不是「包含」）
 *   ③**复原自证**（跑完把文件按 **md5** 逐字还原；最后一并证明「复原后全绿」）
 *
 * ★两处与范本不同，都是**引擎单测这边的实情**：
 *   1. 靶分**两层**：`dist/bundle.js`（构建产物 ⇒ 会话层/核心层代码都在里面）
 *      与 `framework/harness.js`（**测试框架**，✗ 不在产物里 —— `#1958` 那次我照产物层找锚，找不到）。
 *      ⇒ 每把刀显式写 `target`，✗ 不靠猜。
 *   2. 刀响的方式有两类：**用例断言失败**（红格，正是 `expect` 判的）与**进程崩掉**（如
 *      `#1952` 那次「汇总后崩」）⇒ 后者**没有红格**，但必须算**失败** ⇒ 本壳把它单列一类
 *      `crash`，并要求刀显式声明 `expectCrash`（✗ 不静默当成「零红 = 通过」）。
 *
 * 用法：`node tests/unit/headless.mjs --selftest [--only <刀id>]`
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const unitDir = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(unitDir, '..', '..');
const BUNDLE = path.join(unitDir, 'dist/bundle.js');          // ★构建产物层
const HARNESS = path.join(unitDir, 'framework/harness.js');   // ★测试框架层（✗ 不在产物里）

/**
 * 刀表。每把刀＝一次「把某处改坏」＋ 一句「改坏后**应当**红哪几格」。
 * ★`why` 写的是「这把刀在证明什么」，✗ 不是「改了哪里」—— 后者 `patch` 里看得到。
 * ★`expect` 里放的是**用例名子串**（`test('<名>')` 里那串）；本档判「恰好」⇒ 多红少红都算失败。
 */
const KNIVES = [
	{
		id: 'rng-reset-off',
		why: '摘掉「每格复位随机源」那一步（`harness.js` 的 `rng.reset()`）⇒ '
			+ '★实测红集**比单格宽**：`rng 复位守②` ＋ 另外 4 格（`dice rng：前置挂点清除注入（U3）`、'
			+ '`★identity：act() 按实体身份取那一件`、`identity：传没有身份的对象`、`#1783 ⑧：真件 dagger`）'
			+ '—— 即「每格复位随机源」是**多处承重**（✗ 只有本席那条守它）。'
			+ '★它也是框架层的刀：靶不在产物里，✗ 照产物层找锚会找不到。',
		target: HARNESS,
		patch: [['if (window.setup?.RPG?.rng?.reset) window.setup.RPG.rng.reset();', '/* 刀：复位已摘 */']],
		expect: ['rng 复位守②', 'dice rng：前置挂点清除注入（U3）', '按实体身份取那一件', '传**没有身份**的对象', '#1783 ⑧'],
	},
	{
		id: 'rng-code-off',
		why: '摘掉抽尽错误的**码值**（`RNG_EXHAUSTED`）⇒ 断这枚码的格红（`#1957` 那枚码的承重判据）。'
			+ '★`sgstory#2031` 的 ⑥ 也钉这枚码（「受控路径 ✗ 吃旧序列」那一格的下半句）⇒ 已入 expect。'
			+ '★`sgstory#2043` ①（`RPG.makeRng` 的**实例**抽尽）是**第三载体** ⇒ 已入 expect。',
		target: BUNDLE,
		patch: [[", { code: 'RNG_EXHAUSTED' }", '']],
		expect: ['抽尽码①', '抽尽码②', 'reject ②', '抽尽须仍抛具名码', '★#2043 ①'],
	},
	{
		id: 'guard-round-off',
		why: '把防御的减伤从「半伤·向下取整」改成「固定 −2」⇒ **分辨臂**（5 伤 ⇒ 2）那一族红。'
			+ '★这把刀证的是「分辨臂挣到了它的位置」：只写 §16 的「3⇒1」是挡不住它的（三读同值）。',
		target: BUNDLE,
		patch: [['Math.floor(Number(dmg ?? 0) / 2)', 'Math.max(0, Number(dmg ?? 0) - 2)']],
		expect: ['combat-guard-window', '防御④', '防御⑦'],
	},
	{
		id: 'silent-first-host',
		why: '把「多候选未选 ⇒ **具名抛**」改成「取登记表第一个」（`已定宿主` 的自动规则从「恰好一个」放宽成「至少一个」）⇒ '
			+'`宿主②` 那一格应当红：它钉的正是「内核不替调用方猜」（✗ 静默取第一个 —— 那会让「哪个宿主在跑」取决于加载序）。'
			+'★恰好只红这一格：单宿主下的自动定（宿主①）、零宿主那一种抛法（宿主③）、显式选择（宿主④）都不受影响'
			+'——这正是三种形互不混淆的机械证据。',
		target: BUNDLE,
		patch: [['return ids.length === 1 ? RPG.hosts[ids[0]] : null;', 'return ids.length ? RPG.hosts[ids[0]] : null;']],
		expect: ['宿主②'],
	},
];

const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

/** 跑一次引擎单测（**子进程** ⇒ 崩掉也只会反映成本次读数，✗ 不会把刀架自己带走）。 */
const 跑一次 = () => {
	const r = spawnSync(process.execPath, [path.join(unitDir, 'headless.mjs')], {
		cwd: REPO, encoding: 'utf8', timeout: 20 * 60 * 1000,
	});
	const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
	/* 红格＝报告里逐条打印的 `  ✗ <用例名>`（`headless.mjs` 的失败清单形）；崩溃＝汇总后还有异常。 */
	const reds = [...out.matchAll(/^\s*✗\s+(.+?)\s*$/gm)].map((m) => m[1].trim());
	const crash = /^\s*(Error|TypeError|ReferenceError):|Node\.js v\d/m.test(out) && r.status !== 0 && reds.length === 0;
	return { rc: r.status, reds, crash, out };
};

export const 跑自检 = (argv = process.argv) => {
	const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
	const 刀表 = only ? KNIVES.filter((k) => k.id === only) : KNIVES;
	if (!刀表.length) { console.error(`✗ 没有匹配的刀：${only}`); return 2; }

	console.log('\n=== 引擎单测 · 刀架自检（三段式：刀 ⇒ 期望红格 ⇒ 复原自证）===');
	/* 前置：产物与框架档都得在（✗ 缺产物就跑不自检 —— 那是环境错，不是判据红）。 */
	for (const f of [BUNDLE, HARNESS]) {
		if (!fs.existsSync(f)) {
			console.error(`✗ 环境错：缺 ${path.relative(REPO, f)} —— 先 \`python3 build.py\``);
			return 2;
		}
	}

	/* 基线：✗ 刀未下时应当**全绿**；不绿 ⇒ 刀架读出的红分不清「刀红的」还是「本来就红的」。 */
	const 基线 = 跑一次();
	if (基线.rc !== 0 || 基线.reds.length > 0) {
		console.error(`✗ 基线不绿（rc=${基线.rc}，红 ${基线.reds.length} 格）⇒ 先修基线，否则刀架的读数不可信`);
		for (const n of 基线.reds.slice(0, 5)) console.error(`    ✗ ${n}`);
		return 1;
	}
	console.log(`  基线：rc=0、全绿（✗ 未下刀时不许有红 —— 否则刀红的与本来就红的混在一起，读不出来）`);

	let 坏 = 0;
	for (const k of 刀表) {
		const target = k.target ?? BUNDLE;
		const 原 = fs.readFileSync(target);
		const 原md5 = md5(target);
		let 读数;
		try {
			const src = 原.toString('utf8');
			let 打后 = src;
			for (const [找, 换] of k.patch) {
				if (!打后.includes(找)) {
					console.error(`  ✗ 刀 \`${k.id}\` 的替换**未命中**：${JSON.stringify(找.slice(0, 60))}…`);
					console.error(`      （靶＝${path.relative(REPO, target)} —— 若换过层／改过形，先核锚再下刀）`);
					坏 += 1;
					打后 = null;
					break;
				}
				打后 = 打后.replace(找, 换);
			}
			if (打后 === null) continue;
			fs.writeFileSync(target, 打后, 'utf8');
			读数 = 跑一次();
			const crashExpect = k.expectCrash === true;
			const 红集 = 读数.reds;
			/* 「恰好」判定：期望里的每条**都**命中，且**没有**期望之外的红。 */
			const 漏 = k.expect.filter((e) => !红集.some((r) => r.includes(e)));
			const 越界 = 红集.filter((r) => !k.expect.some((e) => r.includes(e)));
			const 崩对 = crashExpect ? 读数.crash : !读数.crash;
			const 恰好 = 漏.length === 0 && 越界.length === 0 && 崩对 && (crashExpect ? true : 读数.rc !== 0);
			console.log(`  ${恰好 ? '✓' : '✗'} 刀 \`${k.id}\` ⇒ 须恰红 ${JSON.stringify(k.expect)}`
				+ `；实得红 ${红集.length} 条${读数.crash ? '（★进程崩了）' : ''}`
				+ `（本面 ${红集.length - 越界.length}／越界 ${越界.length}／漏 ${漏.length}）`);
			if (!恰好) {
				console.error(`      （刀义：${k.why}）`);
				for (const m of 漏) console.error(`      漏：${m}`);
				for (const m of 越界) console.error(`      越界：${m}`);
				if (!崩对) console.error(`      崩溃位不对（expectCrash=${crashExpect}，实得 crash=${读数.crash}）`);
				坏 += 1;
			}
		} finally {
			/* ③**复原自证**：按字节写回 ＋ md5 逐字核（✗ 不靠「我记得改回来了」）。 */
			fs.writeFileSync(target, 原);
			const 后md5 = md5(target);
			if (后md5 !== 原md5) {
				console.error(`  ✗ 刀 \`${k.id}\` 复原**失败**：${path.relative(REPO, target)} md5 ${原md5} ⇒ ${后md5}`);
				坏 += 1;
			}
		}
	}

	/* ③的收尾：全部复原之后再跑一次 ⇒ 必须回到基线（全绿）。 */
	const 收尾 = 跑一次();
	const 复原干净 = 收尾.rc === 0 && 收尾.reds.length === 0;
	console.log(`  ${复原干净 ? '✓' : '✗'} 复原自证：全部刀复原后重跑 ⇒ rc=${收尾.rc}、红 ${收尾.reds.length} 格`
		+ `${复原干净 ? '（回到基线）' : '（✗ 未回到基线 ⇒ 有刀没还原干净）'}`);
	if (!复原干净) 坏 += 1;

	if (坏) { console.error(`\n✗ 刀架自检失败 ${坏} 条 —— 判据红不了，等于没有判据`); return 1; }
	console.log(`\n✓ 刀架自检通过（${刀表.length} 把，各恰红自己那几格；复原后回到基线）`);
	return 0;
};
