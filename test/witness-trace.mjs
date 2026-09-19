// 见证机器自证（`#215` 裁 (B) ✓）：`test/walker.mjs --witness` 产出的**轨迹**够不够当 P4 的"见证" ✗
//
// P4 条文 ✓：「起于 S₀ → 经 **≥K 个被 `≺` 授权的事件** → **终于 `ending`**」＋「**逐格可复跑**」。
//   ⇒ 本件量三件事 ✓：**① 能产出一条走到 `ending` 的轨迹** ✓（不是"走了一堆但没到终点"✗）、
//     **② 同一 `seed` ＋ 同一 key 序列 ⇒ 逐格复跑，屏序列逐字相同** ✓、
//     **③ 断言真的在守**（走不到 ending ⇒ 红并点名 ✓；事件数 < K ⇒ 红并点名 ✓）。
//   ⚠️ 本件**只读** `build/witness-trace.json`（gitignored ✓）＋ **不并进** audit（报告型 ✓ 同 scenarios 家的口径 ✓）。
//   📌 **已知输入** ✗（发起者踩过 ✓）：本件**要 jsdom** ✓ ⇒ **新开的 worktree 没有 `node_modules`** ✗
//     ⇒ 先 `ln -s <主仓>/node_modules node_modules` ✓，否则会 `ERR_MODULE_NOT_FOUND` ✗
//     （**那不是功能红** ✗ —— 别把它当本片的缺陷 ✓）。
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TRACE = join(ROOT, 'build', 'witness-trace.json');
const bad = [];

/** 跑一次见证器 ✓（返回 { rc, out }，不抛 ⇒ 负例也好读 ✓） */
function witness(args) {
	try {
		const out = execFileSync('node', ['test/walker.mjs', '--witness', ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		return { rc: 0, out };
	} catch (e) {
		return { rc: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
}
const traceOf = () => JSON.parse(readFileSync(TRACE, 'utf8'));
const passagesOf = (t) => t.steps.map((s) => s.passage).join(' → ');

// ① **能产出见证** ✓：跑到 `ending`（默认故事 ✓，seed 扫描 ✓）；**逐步都带定位键** ✓（key 优先／label 兜底须标出 ✗）
const r1 = witness(['--scan=3', '--max-steps=40', '--min-events=3']);
if (r1.rc !== 0) bad.push(`① 见证器应 rc=0 ✗（实际 ${r1.rc}）\n${r1.out.slice(-500)}`);
else if (!existsSync(TRACE)) bad.push('① 没产出 build/witness-trace.json ✗');
else {
	const t = traceOf();
	if (!t.ending) bad.push('① 轨迹没有 `ending` ✗（没走到终点的不算见证 ✓）');
	if (!t.steps.length) bad.push('① 轨迹 `steps` 为空 ✗');
	if (!Number.isInteger(t.seed)) bad.push('① 轨迹没落 `seed` ✗ ⇒ 复跑没有起点 ✓');
	if (!/--seed=\d+/.test(t.replay ?? '')) bad.push('① 轨迹没印出可直接粘的复跑命令 ✗');
	// 每一步要么有**派生 key** ✓、要么是**兜底**且**显式标出** ✗（不许兜底悄悄冒充 key ✓）
	const unmarked = t.steps.filter((s) => !s.choiceKey && !(s.choiceLabel && s.fallback === true));
	if (unmarked.length) bad.push(`① 有 ${unmarked.length} 步既无 choiceKey、也不是标出来的兜底 ✗（⇒"按 key 可复跑"被悄悄破掉 ✓）`);
	if (!t.steps.some((s) => s.choiceKey)) bad.push('① 全轨迹没有一步是**按 key** 走的 ✗（口径要求 key 优先 ✓）');
	// ② **逐格可复跑** ✗：同 seed ⇒ 屏序列逐字相同 ✓（＋ ending 相同 ✓）
	const r2 = witness([`--seed=${t.seed}`, '--scan=1', '--max-steps=40']);
	if (r2.rc !== 0) bad.push(`② 复跑应 rc=0 ✗（实际 ${r2.rc}）`);
	else {
		const t2 = traceOf();
		if (passagesOf(t2) !== passagesOf(t)) bad.push(`② 同 seed 复跑**屏序列不一致** ✗ ⇒ 逐格不可复跑\n  原：${passagesOf(t)}\n  复：${passagesOf(t2)}`);
		if ((t2.ending ?? null) !== (t.ending ?? null)) bad.push(`② 复跑的 ending 与原轨迹不同 ✗：${t.ending} vs ${t2.ending}`);
	}
}

// ③ **能假** ✓（两条断言各自点红 ✓）
const r3 = witness(['--scan=1', '--max-steps=1']);
if (r3.rc === 0) bad.push('③ 步数上限 1 ⇒ **应当走不到 ending 而红** ✗（实际 rc=0 ⇒ "必须终于 ending"这条没在守 ✓）');
else if (!/走到 ending/.test(r3.out)) bad.push(`③ 红得对、但报文没点名"没走到 ending" ✗\n${r3.out.slice(-300)}`);
const r4 = witness(['--scan=1', '--max-steps=40', '--min-events=99']);
if (r4.rc === 0) bad.push('③ 事件门槛 99 ⇒ **应当红** ✗（实际 rc=0 ⇒ K 门槛没在守 ✓）');
// ⚠️ 报文要点名**是哪一种不成立** ✓：`K=99` 时头一个种子**是到得了结局的** ✓ ⇒ 报文该说"**到过结局、但都太短**"✗，
//   而不是笼统一句"没走到 ending" ✗（那会把"轨迹太短"误读成"故事没有结局"✗ ⇒ 也是本条自证的一格 ✓）。
else if (!/K=99/.test(r4.out)) bad.push(`③ 红得对、但报文没点名事件数 < K=99 ✗\n${r4.out.slice(-300)}`);
// ⚠️ 另钉一格 ✗：**K 一变大、扫描不能"遇到第一个结局就收工"** ✓ —— 若那样，这条会报"没走到 ending"而不是"太短" ✓
else if (!/太短/.test(r4.out)) bad.push(`③ 报文没点出"到过结局但**太短**" ✗ ⇒ 扫描多半是"遇到第一个结局就收工"了 ✓\n${r4.out.slice(-300)}`);

// ④ ⚠️ **绝对路径 ⇒ 不许静默降级** ✗（本件实测口径 ✓，**不是**宣称它能跑通 ✓）
//   实测 ✓：`--story=<绝对页面路径>` 走到 `boot()` 的**清单读取**那一步会断（`readStory(<绝对路径>)` 被当 slug ✓
//   ⇒ 拼成 `stories/<绝对路径>/00-story.json` ✗）。⇒ 本件只钉**一条**：**必须红** ✓ 且**报文里看得见那个路径** ✓
//   —— 免得“找错了料”被当成“故事里没结局” ✓（那会是个**假红** ✗，也是本件自己踩过的那坑 ✓）
if (r1.rc === 0) {
	const abs = join(ROOT, 'dist', 'stories', 'minimal-demo', 'index.html');
	const r5 = witness([`--story=${abs}`, '--scan=1', '--max-steps=2']);
	if (r5.rc === 0) bad.push('④ 绝对路径竟然 rc=0 ✗ ⇒ 要么真修好了（那得改这条注释和报备 ✓），要么它**静默读了别的故事** ✗');
	else if (!r5.out.includes(abs)) bad.push(`④ 红了，但报文里看不见那个路径 ✗ ⇒ 定位不了是“料错了”还是“故事里没结局”\n${r5.out.slice(-300)}`);
}

if (bad.length) {
	console.error(`\n✗ 见证机器自证未通过（${bad.length} 项）：`);
	bad.forEach((m) => console.error(`  - ${m}`));
	process.exit(1);
}
console.log('✔ 见证机器：轨迹到 ending ✓ 同 seed 逐格可复跑 ✓ 两条断言能假 ✓ 绝对路径不静默 ✓');
