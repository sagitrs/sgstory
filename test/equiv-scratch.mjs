#!/usr/bin/env node
// `#976` 自证（**防御性**改动 ✓ —— **不是**修掉 `#973` 那次 CI 红 ✗；那次红的根因仍未定 ✓）：
//   (1) `equiv` 的中间目录**本次运行唯一 ＋ 用完就清（含失败路径）** ✗；
//   (2) 幂等失败报文**点名"文件 ＋ 首个差异偏移 ＋ 两侧片段"** ✓（照 `l3Line()` 已有形状 ✓）。
//
// 判据（每条都能假 ✗，且**都写临时区／只读仓** ✓）：
//   ① **纯函数两半** ✓：造两个临时目录（其中一个文件差 1 字节 ✓）⇒ 报文**点名该文件 ＋ 偏移** ✓；
//      全同 ⇒ `ok` ✓ 且报文**不带 `✗`** ✓（能假的另一半 ✓）；
//   ② **不再产生旧形** ✓：真跑一次 `equiv` ⇒ **旧形** `build/generated/<slug>` 与 `.idem-<slug>` **不存在** ✓
//      （本片改动前它们是**固定落点** ✗ ⇒ 这条断言在改前必红 ✓ —— 探针就下在这儿 ✓）；
//   ③ **失败路径也不留旧形** ✓：跑一次会在**编译之后**失败的命令 ⇒ rc≠0 ✓ ＋ 旧形仍**不存在** ✓。
//
// ⚠️ **我原先写的是"跑前跑后 `build/generated` 条目集合不变"** ✗ ⇒ **CI 上变异前就红** ✓（`✗ 变异前就红（rc=1）`
//   —— 探针运行器如实报 ✓）：根因＝**本仓的跑器是并行的** ✗ ⇒ 别的 `equiv` 段会在我的两次列举之间**建成/删掉它的
//   `.equiv-run-*`** ✓ ⇒ **全局列举式断言天生竞态** ✗。⇒ 改成本件只断言**与本片因果相关**的那一格（旧形不存在 ✓）✓，
//   并在下面只用**纯函数**做确定性自证 ✓ —— **这条自记本身就是 ㉔ 的一例**（读数要与它真能证明的东西对齐 ✗）。
//
// ⚠️ **本件必须"单独跑、干净树也绿"** ✗（㉖ ✓）：探针运行器**按条目单独跑**（`pre: []` ✓）⇒ 那时**没有前序 equiv 段**
//   建过 `build/generated/` ⇒ 任何"读那个目录"的断言都会 **ENOENT** ✗（`#981` CI 实测 `变异前就红（rc=1）` ✓）。
//   ⇒ 本件已改成**只断言与因果相关的那一格**（旧形是否存在 ✓，`existsSync` 不要求父目录在 ✓）。
//   ⚠️ 同一次里还发现**产品侧**同族缺陷 ✗：`mkdtempSync` 在**编译之前**跑 ⇒ 父目录不在就 ENOENT ✓ ⇒ 已补 `mkdirp` ✓。

// ⚠️ **本件只写系统临时区 ＋ 仓内 `build/`（git-ignored ✓）** ✗：临时目录建在 `os.tmpdir()` ✓ 并在 `try/finally` 里删 ✓；
//   **不许往仓根／仓内别处写** ✗（`#959` 刚修过"`--out=` 空 ⇒ 写到仓根"✓）⇒ 跑完 `git status --porcelain` 应为**空** ✓
//   （本件不替全局断言它 ✗ —— 同树可能有别人的改动 ✓；本件断言的是**上面那三格**自己 ✓）。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { idemReport } from '../editor/lib/host/commands.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GEN = join(ROOT, 'build/generated');
// `#1004` B2 ✓：旧故事已删 ⇒ 换到**存活样本** ✓。
//   ⚠️ 同时把本件一条**押错对象**的旧断言换掉 ✗（与故事删除无关 ✓，是它本来就站不住 ✓）：
//     旧写法先**删掉** `build/generated/<slug>` ✓、再断言它"不存在"✓ —— 而那个目录**同时是**
//     `editor/compile-story.mjs` 的**默认 `--out`** ✓（`commands.mjs:88` ✓）⇒ 换成**存活样本**后，
//     这条自证就变成"**为了跑自己，先删掉别人的编译产物**"✗（并行段可能正在读它 ✗）；
//     而且"某个路径在不在"本来就不能证明"equiv 没留草稿"✗（那个目录可能根本不是 equiv 建的 ✓）。
//     它以前能过 ✓，只是因为 `mist-forest` 被删了、没人再编译它 ✓ —— 那是**靠巧合站着** ✗。
//   ⇒ 换成**真判据** ✓：不看"某个路径在不在"✗，看"**跑完之后多了/动了什么**"✓
//     （并排写下：不留 `.equiv-run-*`／`.idem-<slug>` 草稿 ✓ ＋ 不动别人的落点 ✓）。
const SLUG = 'night-ferry';
const IDEM_OLD = join(GEN, `.idem-${SLUG}`);            // `#976` 前的固定草稿名（旧形）✗
const genOf = join(GEN, SLUG);                            // 编译器的默认 `--out`（**别人的**落点 ✗，不是本件的草稿区 ✓）
const genSnap = () => (existsSync(genOf)
	? readdirSync(genOf).sort().map((n) => `${n}:${readFileSync(join(genOf, n), 'utf8').length}`).join('|')
	: null);
const scratchLeft = () => readdirSync(GEN).filter((n) => n.startsWith('.equiv-run-') || n.startsWith('.idem-'));

let rc = 0;
const sandbox = mkdtempSync(join(tmpdir(), 'equiv-scratch-'));
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

	// ── ① 纯函数两半（**临时区 ✓**，`try/finally` 删 ✓）──────────────────────
	{
		const A = join(sandbox, 'A'), B = join(sandbox, 'B');
		mkdirSync(A); mkdirSync(B);
		writeFileSync(join(A, 'x.txt'), 'hello world\n');
		writeFileSync(join(B, 'x.txt'), 'hello w0rld\n');      // 首个差异偏移 ＝ 7 ✓
		const r = idemReport({ genDir: A, idemDir: B, names: ['x.txt'] });
		t('① 不等 ⇒ `ok=false` ✓ 且**点名文件** ✓', r.ok === false && r.diffs.length === 1 && r.diffs[0].file === 'x.txt');
		t('① 不等 ⇒ **首个差异偏移**量对（@7 ✓）', r.diffs[0].at === 7);
		t('① 不等 ⇒ 读数行里**同时**出现文件名 ＋ 偏移 ＋ 两侧片段 ✓（后人能直接定位 ✗）',
			r.line.includes('x.txt') && r.line.includes('@7') && r.line.includes('hello w') && r.line.includes('生成') && r.line.includes('复编'));
		writeFileSync(join(B, 'x.txt'), 'hello world\n');      // 改成全同 ✓
		const r2 = idemReport({ genDir: A, idemDir: B, names: ['x.txt'] });
		t('① **能假的另一半** ✓：全同 ⇒ `ok=true` ✓ 且读数行**不带 `✗`** ✓', r2.ok === true && !r2.line.includes('✗'));
		t('① 边界：空清单 ⇒ `ok=false`（"没比到东西"不许当通过 ✗）', idemReport({ genDir: A, idemDir: B, names: [] }).ok === false);
	}

	// ── ② 不残留（真跑 ✓；看的是"跑完之后多了/动了什么" ✓）──────────────────
	const run = (args) => {
		try { execFileSync('node', ['editor/equiv.mjs', ...args], { cwd: ROOT, stdio: 'pipe' }); return 0; }
		catch (e) { return e?.status ?? 1; }
	};
	const beforeGen = genSnap();
	const beforeScratch = scratchLeft();
	const rcOk = run([SLUG, '--l3=report', `--hand=stories/${SLUG}/gates/equiv-baseline/15-tables.twee.txt`]);
	t('② 正常跑 ⇒ rc=0 ✓', rcOk === 0);
	t('② 跑完 ⇒ **不留草稿目录** ✓（`build/generated/.equiv-run-*`／`.idem-<slug>` 都不许剩下 —— `#976` 前的固定落点就是它们 ✗）',
		scratchLeft().length === 0 && !existsSync(IDEM_OLD));
	t('② 跑完 ⇒ **不动别人的落点** ✓（`build/generated/<slug>`（编译器默认 `--out`）跑前跑后逐字节同 ✓）',
		genSnap() === beforeGen);

	// ── ③ 失败路径也清（**编译之后**才失败 ✓）──────────────────────────────
	{
		const rcBad = run([SLUG, '--notes=16-notes-nonexistent-face.twee', '--l3=report', `--hand=stories/${SLUG}/gates/equiv-baseline/15-tables.twee.txt`]);
		t('③ 指定一个**不存在的产物名** ⇒ 在**编译之后**失败 ⇒ rc≠0 ✓', rcBad !== 0);
		t('③ **失败路径也不留草稿** ✓（`try/finally` 即便在抛错那一路也清 ✓）',
			scratchLeft().length === 0 && !existsSync(IDEM_OLD));
	}

	if (bad) { console.error(`\n✗ equiv-scratch 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ equiv-scratch 通过：**中间目录唯一 ＋ 用完就清（含失败路径）** ✓ ＋ **幂等失败点名"文件／偏移／两侧片段"** ✓（`#976` ✓；它是**防御性**改动 ✗，不宣称修掉 `#973` 那次红 ✓）');
} catch (e) {
	console.error('✗ equiv-scratch 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
} finally {
	rmSync(sandbox, { recursive: true, force: true });     // **临时区自己清** ✓（不许留垃圾 ✗）
}
process.exit(rc);
