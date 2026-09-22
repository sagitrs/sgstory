// `#899` ②：**新故事夹具场景注册进 CI** —— 三条场景（CLI 捡得起来 ＋ 两条安全网）从此**可复跑**。
//
// 为什么注册成 `phase: 'build'` 的段：本件要在**仓的 `stories/`** 下临时建一个夹具故事
//（`allSourceFiles()` 只看磁盘 → 建了就"看得见"），而 build 相位的段**先跑且独占**
// → 不会与其他段（读 `dist/`、读 `stories/`）打架（这正是 §17 ⑰／⑱ 那两族事故的防线）。
//
// 三条场景（票面，期望值逐条写死 → 能假）：
// ①**数据面完整的新故事**在场（照抄起手模板 ＋ 换 slug／IFID／清单路径 **不改代码**）
// → `build.mjs` **rc=0** ∧ 产物存在 ∧ **产物含哨兵**；`test/layering.mjs` **rc=0**
//注意：`#1002` 起：**未在 `ORDER` 登记** → `scripts/move-precheck.mjs` **rc=1 并点名**（新故事要加的是**表里一行**，不是故事代码）
// ②**引擎件**未登记 `ORDER` → **三门全 rc=1**（安全网不撤）
// ③**故事件**无人认领 → **三门全 rc=1**
//
//注意：**清场要覆盖三处落点**（§17 ⑱）：`stories/<slug>` · `dist/stories/<slug>` · `build/generated/<slug>`
// → 用 `finally` 逐处删，并且**结束时重跑一次 `build.mjs`** ＋ 与开场快照**比 dist 聚合 sha**
// → "本件没污染别人的基线" 是**读数**，不是承诺（这条能假：漏清一处 → sha 变 → 红）。
//
//注意：**为什么本件自归一（自己跑一次 `build.mjs`），而不像 `scripts/dist-fresh.mjs` 那样"只断不建"**
//（**复核留的非阻塞**，理由照 ⑲ 写在此处 —— 去权威化口径：写**理由**，不写「谁定的」）：
// ① 本件本来就在 **`phase:'build'`** —— 那一段是**专门用来构建**的；
// ② 本件的判据是「**基线 vs 结束态**同 sha」 → 基线必须是**规范构建态**，否则"上一次的残留／旧态"会被算进基线 → **假红**（§17 ⑰ 同族）；
// ③ `dist-fresh.mjs` 的"不自动 build"是给**判据类门**定的（别在门里偷偷重建）—— 本件不是判据门，是**夹具场景的自证** → 两口径**不冲突**。
// 用法（**自含归一** —— ⑲：前置写进命令）：`node test/new-story-fixture.mjs`
//（它会**先 `node build.mjs` 归一 `dist`** 再取基线 → 不依赖"调用者刚跑过 build"；在 `npm test` 链里是 `phase: 'build'`）

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { starterPackage, manifestFor, writeStoryPackage } from '../editor/lib/core/story.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SLUG = '__newci';
const SENTINEL = 'SentinelNewCI';
const TMP_ENGINE = 'src/zz-newci-engine.twee';
const TMP_ORPHAN = 'stories/zz-newci-orphan.twee';
let bad = 0;
const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };

/** 跑一条命令 → `{ rc, out}`（**不抛** —— 期望 rc≠0 的场景要能拿到码）。 */
const run = (args) => {
	try { return { rc: 0, out: String(execFileSync(args[0], args.slice(1), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) }; }
	catch (e) { return { rc: e.status ?? -1, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
};
const THREE = [
	['build.mjs', () => run(['node', 'build.mjs'])],
	['layering', () => run(['node', 'test/layering.mjs'])],
	['move-precheck', () => run(['node', 'scripts/move-precheck.mjs'])],
];
/** `dist/**` 的**聚合 sha**（同一把尺 —— 与两门/复核用的口径同形）。 */
const distSha = () => {
	const files = [];
	const walk = (rel) => {
		const abs = join(ROOT, rel);
		if (!existsSync(abs)) return;
		for (const e of readdirSync(abs, { withFileTypes: true })) {
			const r = `${rel}/${e.name}`;
			if (e.isDirectory()) walk(r); else files.push(r);
		}
	};
	walk('dist');
	const h = createHash('sha256');
	for (const f of files.sort()) h.update(`${f}\n`).update(readFileSync(join(ROOT, f)));
	return h.digest('hex').slice(0, 16);
};

const cleanup = () => {
	for (const p of [`stories/${SLUG}`, `dist/stories/${SLUG}`, `build/generated/${SLUG}`, TMP_ENGINE, TMP_ORPHAN]) {
		try { rmSync(join(ROOT, p), { recursive: true, force: true }); } catch { /* 清场失败 → 下面的"三处都不存在"会红 */ }
	}
};

//注意：**开场快照必须在开场 cleanup() 之后取**（复核席实测）：否则上一次**被中断**留下的残留（同 slug）
// 会被算进基线 → 结束时已清 → sha 不等 → **假红一次**（紧接着重跑又自愈 —— 正是 §17 ⑰／⑲ 那族）。
cleanup();
// `#917` ／复核席两条：**基线要先归一到"干净构建态"** —— 上一次被中断留下的残留（同 slug）**或**任何旧态的 dist
// 都会被算进基线 → 结束时是新建的 → sha 不等 → **假红**（实测：旧态 dist 时复现过）。
const warm = run(['node', 'build.mjs']);   // 归一（CI 里 `build-mjs` 刚跑过 → 这里是幂等的）
t('前置：`dist` 归一到干净构建态（`node build.mjs` rc=0 ✓ —— ⑲：前置写进命令 ✓）', warm.rc === 0, `rc=${warm.rc}`);
const before = distSha();
try {
	// ── 夹具：**起手四件**（core 的既有口 → 与页面路同源）＋ **哨兵**（让 ① 的产物断言有牙）
	const st = starterPackage({ slug: SLUG, title: '__newci 夹具（#899 ② 注册场景）', ifid: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f' });   // **小写** → 走归一化
	st.data['tables.json'].containers = { [SENTINEL]: { sites: { 哨兵位点: { abil: 'str', dc: 10 } } } };
	const io = { writeText: (rel, text) => { mkdirSync(dirname(join(ROOT, rel)), { recursive: true }); writeFileSync(join(ROOT, rel), text); } };
	writeStoryPackage({ slug: SLUG, data: st.data, twee: st.twee, io });
	const comp = run(['node', 'editor/compile-story.mjs', SLUG, `--out=stories/${SLUG}`]);
	t('夹具：编译进包内 rc=0（`--out=stories/<slug>` ✓）', comp.rc === 0, comp.out.slice(-120));
	const twee = Object.fromEntries(readdirSync(join(ROOT, 'stories', SLUG)).filter((f) => f.endsWith('.twee')).map((f) => [f, readFileSync(join(ROOT, 'stories', SLUG, f), 'utf8')]));
	// `#1035`：这个临时夹具是**内部件** → 显式标 `internal`（别走默认 `content` 而上架）
	writeStoryPackage({ slug: SLUG, manifest: manifestFor({ slug: SLUG, title: '__newci 夹具', entry: '开场', twee, audience: 'internal' }), io });

	// ── ① 数据面完整的新故事 → 三门全绿 ＋ 产物含哨兵
	const a = THREE.map(([name, r]) => [name, r()]);
	t('① `build.mjs` rc=0 ∧ 产物存在 ∧ **含哨兵** ✓', a[0][1].rc === 0 && existsSync(join(ROOT, 'dist/stories', SLUG, 'index.html')) && readFileSync(join(ROOT, 'dist/stories', SLUG, 'index.html'), 'utf8').includes(SENTINEL),
		`rc=${a[0][1].rc}`);
	// `#1002` 起口径更准：**新故事不必改「故事代码」**，但**必须在模块序表（`ORDER`）里登记一行** ——
	// 那是**表**（构建图），不是故事代码（`#991` 的 `(c2)` 也是这么归的）。
	// → 未登记的真实后果（`#998` 实测）：故事表排在 `21-resolve` **之后**跑 → 它 `Object.assign` 到 `window.Game` 上时
	// **替换掉**引擎挂的方法 → 门里 `Game.Combat.slotAbsorb(...)` TypeError → **门崩、后面的故事面全没跑**。
	// → 所以本格**反过来钉**：未登记 → `move-precheck` **必红并点名**（`layering` 仍 rc=0 —— 它管的是分层，不管这一格）。
	t('① `layering` rc=0 ✓ ∧ 未登记 `ORDER` ⇒ `move-precheck` **rc=1 且点名** `tables-not-in-order` ✗（`#998`／`#1002`）',
		a[1][1].rc === 0 && a[2][1].rc === 1 && /tables-not-in-order/.test(String(a[2][1].out ?? '')),
		`rc=${a[1][1].rc}/${a[2][1].rc}`);

	// ── ② 引擎件未登记 ORDER → 三门全红（安全网不撤）
	writeFileSync(join(ROOT, TMP_ENGINE), ':: zz [script]\n');
	const b = THREE.map(([name, r]) => [name, r()]);
	t('② 引擎件未登记 ⇒ **三门全 rc=1** ∧ 点名该文件 ✓', b.every(([, x]) => x.rc !== 0) && b.every(([, x]) => x.out.includes('zz-newci-engine')), b.map(([n, x]) => `${n}=${x.rc}`).join(' '));
	rmSync(join(ROOT, TMP_ENGINE), { force: true });

	// ── ③ 故事件无人认领 → 三门全红
	writeFileSync(join(ROOT, TMP_ORPHAN), ':: 孤儿\n');
	const c = THREE.map(([name, r]) => [name, r()]);
	t('③ 故事件无人认领 ⇒ **三门全 rc=1** ✓', c.every(([, x]) => x.rc !== 0), c.map(([n, x]) => `${n}=${x.rc}`).join(' '));
	rmSync(join(ROOT, TMP_ORPHAN), { force: true });
} finally {
	// ── 清场（三处落点 ＋ 两个临时件）＋ **恢复 dist**（重跑 build → 与开场快照比 sha）
	cleanup();
	const rebuilt = run(['node', 'build.mjs']);
	const after = distSha();
	t('清场：三处落点都不存在 ✓', !existsSync(join(ROOT, 'stories', SLUG)) && !existsSync(join(ROOT, 'dist/stories', SLUG)) && !existsSync(join(ROOT, 'build/generated', SLUG)));
	t('清场：**dist 聚合 sha 与开场相同** ✓（本件没污染别人的基线 ✓ —— 这条能假 ✗：漏清一处即红 ✓）', rebuilt.rc === 0 && after === before, `${before} → ${after}`);
}

console.log('✔ 新故事夹具场景通过（① `build`／哨兵绿 ＋ **未登记 ORDER ⇒ `move-precheck` 红并点名** ✓ ／ ②③两条安全网全红 ✓ ／ 清场三处＋dist 复原 ✓）');
process.exit(bad ? 1 : 0);
