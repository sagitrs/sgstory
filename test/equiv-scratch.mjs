#!/usr/bin/env node
// `#976` 自证（**防御性**改动 —— **不是**修掉 `#973` 那次 CI 红；那次红的根因仍未定）：
// (1) `equiv` 的中间目录**本次运行唯一 ＋ 用完就清（含失败路径）**；
// (2) 幂等失败报文**点名"文件 ＋ 首个差异偏移 ＋ 两侧片段"**（照 `l3Line()` 已有形状）。
//
// 判据（每条都能假，且**都写临时区／只读仓**）：
// ① **纯函数两半**：造两个临时目录（其中一个文件差 1 字节）→ 报文**点名该文件 ＋ 偏移**；
// 全同 → `ok` 且报文**不带 ` `**（能假的另一半）；
// ② **不再产生旧形**：真跑一次 `equiv` → **旧形** `build/generated/<slug>` 与 `.idem-<slug>` **不存在**
//（本片改动前它们是**固定落点** → 这条断言在改前必红 —— 探针就下在这儿）；
// ③ **失败路径也不留旧形**：跑一次会在**编译之后**失败的命令 → rc≠0 ＋ 旧形仍**不存在**。
//
//注意：**我原先写的是"跑前跑后 `build/generated` 条目集合不变"** → **CI 上变异前就红**（` 变异前就红（rc=1）`
// —— 探针运行器如实报）：根因＝**本仓的跑器是并行的** → 别的 `equiv` 段会在我的两次列举之间**建成/删掉它的
// `.equiv-run-*`** → **全局列举式断言天生竞态**。→ 改成本件只断言**与本片因果相关**的那一格（旧形不存在），
// 并在下面只用**纯函数**做确定性自证 —— **这条自记本身就是 ㉔ 的一例**（读数要与它真能证明的东西对齐）。
//
//注意：**本件必须"单独跑、干净树也绿"**（㉖）：探针运行器**按条目单独跑**（`pre: []`）→ 那时**没有前序 equiv 段**
// 建过 `build/generated/` → 任何"读那个目录"的断言都会 **ENOENT**（`#981` CI 实测 `变异前就红（rc=1）`）。
// → 本件已改成**只断言与因果相关的那一格**（旧形是否存在，`existsSync` 不要求父目录在）。
//注意：同一次里还发现**产品侧**同族缺陷：`mkdtempSync` 在**编译之前**跑 → 父目录不在就 ENOENT → 已补 `mkdirp`。
//
//注意：注意：`#1004` B2b 第 21 步（**干净树修复**，`#1014` 的 CI `scripts-probe-gates-mjs-probe-fast` 实测红）：
// **我把同族的病又埋了一次** —— 上一段刚治完"旧断言靠巧合站着"，而我在 `3f14e0c` 引入的 `scratchLeft()`
// **无守卫** `readdirSync(GEN)` → `build/generated` 不在就 ENOENT → **变异之前就崩**（探针门判"变异前就红"）。
// **根因仍是巧合依赖**：那个目录从来**没有人 mkdir**（本仓 `grep` 确认）—— 它原先由**已删的测试件**顺带建出来；
// `test-plan` 那 19 段一删 → 没人建了 → 本件旧写法就不再能过。**本地看不到**（旧残留 `build/generated/` 还在），
// **干净 checkout 必崩** → 属"本地绿 ≠ 干净树绿"。
// → **修法＝补齐集合语义**（不是加前置）：本件要断言的是"**跑完之后本件新留下的草稿 ＝ 空**"；
// `build/generated` **不存在 ≡ 空集**（"多了什么"在目录不在时平凡为空 —— 这是**正确读数**，不是放宽）。
// →注意：**为什么不选"跑前 `mkdirSync(GEN)`"**（两条，都是本件自己的纪律）：
// ① 那是让测试**自己制造被测前置** —— 与本件上一段治掉的"为了跑自己，先删掉别人的编译产物"**同一族**（镜像版）；
// ② 它会把"**父目录不在**"这一**真实且已被证实有意义**的状态从被测面里抠掉 ——
// 本件上一段刚刚记录过产品侧同形缺陷（`mkdtempSync` 父目录不在 → ENOENT → 已补 `mkdirp`）；
// 预先 mkdir 等于替产品把那个坑填了。
// →注意：**判据没变软**（这是本步的关键自证，见 `listGen` 处注释）：
// 探针那一刀（掐掉 `finally` 清理）留下的 `.equiv-run-*` 在**目录存在／不存在两种树态下都照样咬红**。
// **自证姿势**：本件必须在**无 `build/`（且无 `dist/`）的干净树**里也绿 —— 复验命令（一次跑完删干净）：
// `git worktree add --detach <tmp> <head> && ln -s <repo>/node_modules <tmp>/ && (cd <tmp> && node test/equiv-scratch.mjs)`
// → **`git worktree remove --force <tmp>` ＋ `git worktree prune`**。

//注意：**本件只写系统临时区 ＋ 仓内 `build/`（git-ignored）**：临时目录建在 `os.tmpdir()` 并在 `try/finally` 里删；
// **不许往仓根／仓内别处写**（`#959` 刚修过"`--out=` 空 → 写到仓根"）→ 跑完 `git status --porcelain` 应为**空**
//（本件不替全局断言它 —— 同树可能有别人的改动；本件断言的是**上面那三格**自己）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { idemReport } from '../editor/lib/host/commands.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GEN = join(ROOT, 'build/generated');

// `#1105`（⛔ 前置）：⭐ **本件自拥有 scratch 根**（默认 self-hermetic；可注入 → 供自证）。
//
// ## 为什么必须自拥有（实测 4/4 假红）
// 旧写法把断言建在**共享的** `build/generated/` 上做集合差 → **并行段的活草稿**（`editor-equiv-*` 等
// 会在**同一父目录**建 `.equiv-run-*`）落在本件窗口内 → 被算成“**本件新留的草稿**”
// → 与调用方的 `needs` 无关（共享目录**无法归因**）→ 确定性复现：注入点 0.05/0.10/0.15/0.20s 四档
// **全部 rc=1**，未过项恰是 ② 与 ③。
//
// ##注意：默认也必须自密闭（组领队补正）
//“可注入”**不是**“只有测试时才安全” —— **不注入时（CI 常态）本件也用自己的 per-run 根**；
// 注入只是给自证留口（让它能把注入点**搬到被测的那个根上** —— 否则自证测的是**旧世界**，
// 这是 ㊴ 的变体：**自证落点必须跟着被测对象一起移动**）。
const OWNED_ROOT = process.env.SAGITRS_EQUIV_SCRATCH_ROOT || mkdtempSync(join(tmpdir(), 'equiv-scratch-root-'));
process.env.SAGITRS_EQUIV_SCRATCH_ROOT = OWNED_ROOT;   // ← 传给它 fork 出来的 `equiv` 子进程（同一根）
// `#1004` B2：旧故事已删 → 换到**存活样本**。
//注意：同时把本件一条**押错对象**的旧断言换掉（与故事删除无关，是它本来就站不住）：
// 旧写法先**删掉** `build/generated/<slug>`、再断言它"不存在" —— 而那个目录**同时是**
// `editor/compile-story.mjs` 的**默认 `--out`**（`commands.mjs:88`）→ 换成**存活样本**后，
// 这条自证就变成"**为了跑自己，先删掉别人的编译产物**"（并行段可能正在读它）；
// 而且"某个路径在不在"本来就不能证明"equiv 没留草稿"（那个目录可能根本不是 equiv 建的）。
// 它以前能过，只是因为 `mist-forest` 被删了、没人再编译它 —— 那是**靠巧合站着**。
// → 换成**真判据**：不看"某个路径在不在"，看"**跑完之后多了/动了什么**"
//（并排写下：不留 `.equiv-run-*`／`.idem-<slug>` 草稿 ＋ 不动别人的落点）。
// `#1267` 尾件②：故事名由**样本给出**（生效根下第一个），不再钉已删名。
const SLUG = storySlugs()[0] ?? null;
if (!SLUG) { console.log('  · 生效根下没有故事 ⇒ 本件未判（`#1267` 尾件②）'); process.exit(0); }
const IDEM_OLD = join(OWNED_ROOT, `.idem-${SLUG}`);   // `#976` 前的固定草稿名（旧形）（**本件自有的根**）
const genOf = join(GEN, SLUG);                            // 编译器的默认 `--out`（**别人的**落点，不是本件的草稿区）
const genSnap = () => (existsSync(genOf)
	? readdirSync(genOf).sort().map((n) => `${n}:${readFileSync(join(genOf, n), 'utf8').length}`).join('|')
	: null);
//注意：**为什么 `listGen` 的"不存在 → 空集"不是放水**（本步的关键自证）：
// 本条断言的**对象**是「**本件这一次跑**新留下的草稿」 —— 它是个**集合差**（后 ∖ 前）；
// 目录不存在时两边都是空集 → 差也为空 → **结论正确**（"什么也没多出来"本来就成立）。
// **判别力（能假）逐条不变**：
// · 探针那一刀（掐掉 `finally` 清理）→ 跑完会**新留** `.equiv-run-*` → `newScratch` 非空 → **红**；
// 这一刀在**目录存在／不存在两种树态下都成立**（不是只在旧树态能咬）。
// · `rcOk === 0` 那格**独立**成立 → "跑没跑过"不由本条兜底（不会"目录不在 → 全空 → 假绿"）。
//注意：**只列举本件自拥有的根**（不再看共享的 `build/generated/` —— 那正是竞态来源）。
const listGen = () => (existsSync(OWNED_ROOT) ? readdirSync(OWNED_ROOT) : []);
const scratchLeft = () => listGen().filter((n) => n.startsWith('.equiv-run-') || n.startsWith('.idem-'));

//注意：`#1004` B2b：判据从「**全局**没有草稿」改成「**本件跑完**没有**新**草稿」 —— 前者是全局列举式断言，
// 别人的残留（并行段／上一次变异跑的残留）会把它顶红（本件:15 的注释早写过这条竞态，
// 而 `beforeScratch` 本来就取了却没用）→ 旧形下探针「掐掉 `finally` 清理」那刀**只能靠残留污染**才红。
// 新形：`newScratch(base)` 只看**新出现的** → ① 不被别人的残留顶红 ② 那一刀**确定性地**红（`#908` 探针面）。
const newScratch = (base) => scratchLeft().filter((n) => !base.includes(n));

let rc = 0;
const sandbox = mkdtempSync(join(tmpdir(), 'equiv-scratch-'));
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

	// ── ① 纯函数两半（**临时区 **，`try/finally` 删）──────────────────────
	{
		const A = join(sandbox, 'A'), B = join(sandbox, 'B');
		mkdirSync(A); mkdirSync(B);
		writeFileSync(join(A, 'x.txt'), 'hello world\n');
		writeFileSync(join(B, 'x.txt'), 'hello w0rld\n');      // 首个差异偏移 ＝ 7
		const r = idemReport({ genDir: A, idemDir: B, names: ['x.txt'] });
		t('① 不等 ⇒ `ok=false` ✓ 且**点名文件** ✓', r.ok === false && r.diffs.length === 1 && r.diffs[0].file === 'x.txt');
		t('① 不等 ⇒ **首个差异偏移**量对（@7 ✓）', r.diffs[0].at === 7);
		t('① 不等 ⇒ 读数行里**同时**出现文件名 ＋ 偏移 ＋ 两侧片段 ✓（后人能直接定位 ✗）',
			r.line.includes('x.txt') && r.line.includes('@7') && r.line.includes('hello w') && r.line.includes('生成') && r.line.includes('复编'));
		writeFileSync(join(B, 'x.txt'), 'hello world\n');      // 改成全同
		const r2 = idemReport({ genDir: A, idemDir: B, names: ['x.txt'] });
		t('① **能假的另一半** ✓：全同 ⇒ `ok=true` ✓ 且读数行**不带 `✗`** ✓', r2.ok === true && !r2.line.includes('✗'));
		t('① 边界：空清单 ⇒ `ok=false`（"没比到东西"不许当通过 ✗）', idemReport({ genDir: A, idemDir: B, names: [] }).ok === false);
	}

	// ── ② 不残留（真跑；看的是"跑完之后多了/动了什么"）──────────────────
	const run = (args) => {
		try { execFileSync('node', ['editor/equiv.mjs', ...args], { cwd: ROOT, stdio: 'pipe' }); return 0; }
		catch (e) { return e?.status ?? 1; }
	};
	const beforeGen = genSnap();
	const beforeScratch = scratchLeft();
	const rcOk = run([SLUG, '--l3=report', `--hand=stories/${SLUG}/gates/equiv-baseline/15-tables.twee.txt`]);
	t('② 正常跑 ⇒ rc=0 ✓', rcOk === 0);
	//注意：复核（`#1105`）修正了两处**标签与实况不符**：
	// ① 落点已改读**本件自拥有的根** → 标签不再写共享的 `build/generated/…`；
	// ② `.idem-<slug>` 是 `#976` **前**的固定草稿名（**产品里已无创建者** —— 现走 `join(runDir,'idem')`）
	// → 该半格是**旧形哨兵**（改前改后都空转），留着只为防「旧形回流」（不是「产品还在写它」）。
	//注意：**报文里必须保留「不留草稿目录」这几个字** —— 探针那一刀靠它点名（改掉 → 探针「红了但没点名」，实测踩过）。
	t('② 跑完 ⇒ **不留草稿目录** ✓（落点＝**本件自拥有的根** ✓ `<自有的根>/.equiv-run-*` 不许**新**剩下；`.idem-<slug>` 为 `#976` **前**旧形哨兵 ✓ 产品已无创建者 ✗ 同样不许出现）',
		newScratch(beforeScratch).length === 0 && !existsSync(IDEM_OLD));
	t('② 跑完 ⇒ **不动别人的落点** ✓（`build/generated/<slug>`（编译器默认 `--out`）跑前跑后逐字节同 ✓）',
		genSnap() === beforeGen);

	// ── ③ 失败路径也清（**编译之后**才失败）──────────────────────────────
	{
		const beforeScratch3 = scratchLeft();
		const rcBad = run([SLUG, '--notes=16-notes-nonexistent-face.twee', '--l3=report', `--hand=stories/${SLUG}/gates/equiv-baseline/15-tables.twee.txt`]);
		t('③ 指定一个**不存在的产物名** ⇒ 在**编译之后**失败 ⇒ rc≠0 ✓', rcBad !== 0);
		t('③ **失败路径也不留草稿** ✓（`try/finally` 即便在抛错那一路也清 ✓）',
			newScratch(beforeScratch3).length === 0 && !existsSync(IDEM_OLD));
	}

	// ── ④ `#1105` 自证：**注入点跟着被测对象一起移动**（㊴ 的变体）──────────────
	//注意：为什么必须成对：修完后判据只读「**本件自拥有的根**」 → 单看 ④a（往共享目录造草稿 → 不报）
	// 会**平凡通过**（它测的是旧世界）→ 必须有 ④b 证明"**判据读的确实是我们传的那个根**"。
	//
	//注意：注意：**这两格锁的是「判据的读向」，不是「产品的行为」**（复核实测 —— 别读大）：
	// 把产品里的 `process.env…||` 去掉（＝**不认注入根**）→ **本件 rc=0 假绿**
	//（因本件**无条件自设** `SAGITRS_EQUIV_SCRATCH_ROOT` → 产品仍写进同一个自有根 → 看不见该回归）。
	// → **「产品真把草稿写进那个根」由 `scripts/probes.mjs` 那一刀证明**
	//（掐 `rmSync(runDir)` → 新留草稿 → ② 必红，已实跑过）—— 运行格 + 探针刀**分工**，别合并宣称。
	{
		// ④a **旧世界**：往**共享** `build/generated/` 里造"并行段的活草稿" → **必须不报**
		//（这一格在**旧写法**下会红 —— 即它能把"退回共享目录"这个回归咬住）
		const baseA = scratchLeft();
		const foreign = join(GEN, '.equiv-run-FOREIGN');
		mkdirSync(GEN, { recursive: true });
		mkdirSync(foreign, { recursive: true });
		t('🔴 ④a **共享父目录**里出现"并行段的活草稿" ⇒ **必须不报** ✓（判据已不依赖共享目录 ✓；旧写法下此格必红 ✓）',
			newScratch(baseA).length === 0);
		rmSync(foreign, { recursive: true, force: true });

		// ④b **新世界**：往**本件自拥有的根**里造草稿 → **必须报**
		//（证明"注入点跟着被测对象走了" —— 否则 ④a 平凡通过、而真回归无人咬）
		const baseB = scratchLeft();
		const leak = join(OWNED_ROOT, '.equiv-run-LEAK');
		mkdirSync(leak, { recursive: true });
		t('🔴 ④b **本件自拥有的根**里出现草稿 ⇒ **必须报** ✓（证明判据读的就是传进去的那个根 ✓）',
			newScratch(baseB).length === 1);
		rmSync(leak, { recursive: true, force: true });
	}

	if (bad) { console.error(`\n✗ equiv-scratch 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ equiv-scratch 通过：**中间目录唯一 ＋ 用完就清（含失败路径）** ✓ ＋ **幂等失败点名"文件／偏移／两侧片段"** ✓（`#976` ✓；它是**防御性**改动 ✗，不宣称修掉 `#973` 那次红 ✓）');
} catch (e) {
	console.error('✗ equiv-scratch 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
} finally {
	rmSync(sandbox, { recursive: true, force: true });     // **临时区自己清**（不许留垃圾）
	rmSync(OWNED_ROOT, { recursive: true, force: true });   // `#1105`：**自拥有的 scratch 根也自己清**（默认建在 tmpdir）
}
process.exit(rc);
