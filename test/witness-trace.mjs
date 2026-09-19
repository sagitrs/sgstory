// 见证机器自证（`#215` 裁 (B) ✓）：`test/walker.mjs --witness` 产出的**轨迹**够不够当 P4 的"见证" ✗
//
// P4 条文 ✓：「起于 S₀ → 经 **≥K 个被 `≺` 授权的事件** → **终于 `ending`**」＋「**逐格可复跑**」。
//   ⇒ 本件量三件事 ✓：**① 能产出一条走到 `ending` 的轨迹** ✓（不是"走了一堆但没到终点"✗）、
//     **② 同一 `seed` ＋ 同一 key 序列 ⇒ 逐格复跑，屏序列逐字相同** ✓、
//     **③ 断言真的在守**（走不到 ending ⇒ 红并点名 ✓；事件数 < K ⇒ 红并点名 ✓）。
//   ⚠️ 本件**只读** `build/witness-trace.json`（gitignored ✓）＋ **不并进** audit（报告型 ✓ 同 scenarios 家的口径 ✓）。
//   📌 **已知输入（两句 ✓ —— 本仓今晚已踩过同族现象 ✗，先备好省一次误判 ✓）**：
//     ① **先 `node build.mjs`** ✗（本件读 `dist/` 与 `build/` ✓ —— `boot()` 有 dist 新鲜度守卫 ✓
//         ⇒ 不在构建相里跑 ⇒ 会红成"产物过期"✗，那不是功能红 ✓）；
//     ② **软链依赖** ✗：本件**要 jsdom** ✓ ⇒ **新开的 worktree 没有 `node_modules`** ✗ ⇒ 先
//        `ln -s <主仓>/node_modules node_modules` ✓，否则 `ERR_MODULE_NOT_FOUND` ✗（也不是功能红 ✓）。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
	// ⚠️ **主判据是引擎的 `$pc.ev.ending`** ✗（故事无关 ✓）—— 段落名前缀只兜底 ✓：
	//   只认前缀 ⇒ 换一个不把结局段叫「结局…」的故事 ⇒ **到得了结局却判不出** ✗（实测 `hollow-cave` ✓）
	if (!t.endingKey) bad.push('① 轨迹没记下**引擎登记的结局键** `endingKey` ✗ ⇒ 判据退回"段落名像结局"了（换故事会瞎 ✓）');
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
// ⚠️ `#1004` B2b：**扫描面按样本重钉** ✗ —— 默认故事换成面夹具后，`seed=1` 单跑会在 40 步上限里
//   一直游走（实测 `ending=(无)` ⇒ 报文落「没走到 ending」✗），那量的是**样本**不是 K 门槛 ✓；
//   扫 3 个种子（与 ① 同档 ✓）必有一个到得了结局 ⇒ 报文才落在「到过结局、但**都太短**」那一支 ✓。
const r4 = witness(['--scan=3', '--max-steps=40', '--min-events=99']);
if (r4.rc === 0) bad.push('③ 事件门槛 99 ⇒ **应当红** ✗（实际 rc=0 ⇒ K 门槛没在守 ✓）');
// ⚠️ 报文要点名**是哪一种不成立** ✓：`K=99` 时头一个种子**是到得了结局的** ✓ ⇒ 报文该说"**到过结局、但都太短**"✗，
//   而不是笼统一句"没走到 ending" ✗（那会把"轨迹太短"误读成"故事没有结局"✗ ⇒ 也是本条自证的一格 ✓）。
else if (!/K=99/.test(r4.out)) bad.push(`③ 红得对、但报文没点名事件数 < K=99 ✗\n${r4.out.slice(-300)}`);
// ⚠️ 另钉一格 ✗：**K 一变大、扫描不能"遇到第一个结局就收工"** ✓ —— 若那样，这条会报"没走到 ending"而不是"太短" ✓
else if (!/太短/.test(r4.out)) bad.push(`③ 报文没点出"到过结局但**太短**" ✗ ⇒ 扫描多半是"遇到第一个结局就收工"了 ✓\n${r4.out.slice(-300)}`);

// ⑥ **故事无关** ✗（我这片修掉的正是这里 ✓）：换一个**结局段名不带「结局」前缀**的故事 ⇒ 也必须判得出 ✓
//   为什么单列一格 ✗：这正是"段落名前缀当主判据"会**瞎**的那一格 ✓ ——
//   没有这一格，谁把主判据改回前缀 ⇒ 自证**照样全绿** ✗（= 判据没牙 ✓）。
// ⛔ **退役 ＋ 声明**（`#1004` B2b ✓）：本格原用**已删故事** `hollow-cave` ✓ —— 它的结局段是 `:: 地下村落`
//   ＋ `<<ending "地下村落" final>>` ✓ ⇒ **段名不带「结局」前缀** ✗ ⇒ 那一格量的正是「判据是不是只认段落名前缀」✓。
//   面已消失 ✗（实测：剩下三个样本的结局段**全**带「结局」前缀 ✓ —— `face-fixture` 3 条（`结局 平凡之路`／
//   `结局 送星归位`／`结局 死亡` ✓）· `night-ferry` 2 条（`结局 抵岸`／`结局 沉船` ✓）· `minimal-demo` **无结局** ✗）
//   ⇒ key 与「结局」前缀恒同时成立 ⇒ 这一格再也分不出「引擎键」与「前缀」✓。
//   ✓ 处置：**换样本**（`night-ferry` ✓ —— 其冻存见证 `stories/night-ferry/gates/witness-trace.json` 写明
//     `seed=1` ⇒ 6 步 ⇒ `结局 沉船` / `key=沉船` ✓）＋ **保留「另立结局键」这一格** ✓（`endingKey` 非空 ⇒
//     改回前缀-only 的实现会在这里红 ✓）。
//   ⚠️ **声明** ✗：**「段名不带「结局」前缀的结局样本」这一格自此无守护** ✓ ⇒ 日后要复钉它 ⇒ **先给某样本加一个
//   段名不带「结局」前缀、但由 `<<ending "…">>` 登记的结局** ✓（⚠️ **不为凑绿改样本** ✗ —— 与 `test/rules-claims.mjs`、
//   `ee67dcd` 那 4 件的退役同款 ✓；⚠️ 改名的路已实测堵死 ✗：`src/80-script.twee:305` 与 `src/10-core.twee:413`
//   都按「结局」前缀工作 ✓ ⇒ 改段名会连引擎语义一起改 ✓）。
{
	const rs = witness(['--story=night-ferry', '--seed=1', '--scan=1', '--max-steps=60', '--min-events=3']);
	if (rs.rc !== 0) bad.push(`⑥ 换故事（night-ferry）应 rc=0 ✗（实际 ${rs.rc}）\n${rs.out.slice(-300)}`);
	else if (existsSync(TRACE)) {
		const t6 = traceOf();
		if (!t6.endingKey) bad.push('⑥ 换故事后没记下 `endingKey` ✗ ⇒ 故事无关的引擎判据没生效 ✓（「只认段落名前缀」的实现会落在这里 ✓：前缀-only ⇒ `endingKey=null` ✓）');
	}
}

// ⑤ `--verify=<trace>` ✗（`#991` 批的**见证面**加法 ✓）：把**冻存轨迹当输入**核验 ✓
//   为什么单列 ✗：**同 `seed` ⇒ 同 key 序列**只让轨迹"成因可复现" ✓ ⇒ 冻存的 JSON 若没人核 ✗
//   ⇒ "逐格可复跑"就只是报告里的一句话 ✓（P4 要**可机判** ✗）。
// ⚠️ 注意 ✗：③ 的负例跑完会把 `build/witness-trace.json` 覆盖成"**没命中**"的那份（`seed: null` ✓、`steps: []` ✓）
//   ⇒ 所以这里**自己先产出一次** ✓，核验的才是"真轨迹"✓（否则验的是上一格的残留 ✓）。
const r5prod = witness(['--scan=3', '--max-steps=40', '--min-events=3']);
if (r5prod.rc !== 0) bad.push(`⑤ 产出真轨迹失败 ✗（rc=${r5prod.rc}）\n${r5prod.out.slice(-300)}`);
else if (r1.rc === 0 && existsSync(TRACE)) {
	// ⑤-1 正例 ✓：冻存轨迹**自身**核得过 ✓
	const rv = witness([`--verify=${TRACE}`]);
	if (rv.rc !== 0) bad.push(`⑤ --verify 正例应 rc=0 ✗（实际 ${rv.rc}）\n${rv.out.slice(-300)}`);
	else if (!/逐格一致/.test(rv.out)) bad.push(`⑤ --verify 通过了却没报"逐格一致" ✗\n${rv.out.slice(-200)}`);
	// ⑤-2 ⚠️ **轨迹刀** ✗：改掉某一步的 `choiceKey`（改成**不存在的 key** ✓）
	//    ⇒ `--verify` **必须红并点名第几步** ✗ ⇒ 否则"逐格可复跑"是口号不是判据 ✓
	const t = traceOf();
	const i = t.steps.findIndex((x) => x.choiceKey);
	if (i < 0) bad.push('⑤ 轨迹里没有一步带 `choiceKey` ✗ ⇒ 轨迹刀没处下 ✓（口径要求 key 优先 ✓）');
	else {
		t.steps[i].choiceKey = '这个-key-不存在';
		const knife = join(ROOT, 'build', 'witness-trace.tamper.json');
		writeFileSync(knife, JSON.stringify(t, null, 1));
		const rk = witness([`--verify=${knife}`]);
		if (rk.rc === 0) bad.push('⑤ **轨迹刀**：改掉一步的 key 竟仍 rc=0 ✗ ⇒ "逐格可复跑"没在守 ✓');
		else if (!new RegExp(`第 ${i + 1} 步不符`).test(rk.out)) bad.push(`⑤ 刀红了但**没点名第 ${i + 1} 步** ✗\n${rk.out.slice(-300)}`);
	}
	// ⑤-2b ⚠️ **向后兼容** ✗：早先冻存件**没有 `endingKey`**（本片之前产的 ✓）⇒ 必须**仍能核过** ✓
	//   （否则"老件没记新字段"会被读成"轨迹不可复跑" ✗ —— 而那正是内容面此刻冻着的那一份 ✓）
	{
		const t5 = traceOf();
		delete t5.endingKey;
		const legacy = join(ROOT, 'build', 'witness-trace.legacy.json');
		writeFileSync(legacy, JSON.stringify(t5, null, 1));
		const rl = witness([`--verify=${legacy}`]);
		if (rl.rc !== 0) bad.push(`⑤ 老件（无 \`endingKey\`）应仍 rc=0 ✗（实际 ${rl.rc}）⇒ 向后兼容没做 ✓\n${rl.out.slice(-300)}`);
		else if (!/没记/.test(rl.out)) bad.push('⑤ 老件核过了、但报文没**点明**它没记引擎键 ✗（那会让人以为"引擎键也比过了"✓）');
	}

	// ⑦ **故事从冻存件取** ✗（`#1000` 解析了却**没传给重跑** ✗ ⇒ 本片接上 ✓；这格就是它的**回归锁** ✓）：
	//   不带 `--story=` 时按**冻存件里记的 `story`** 核 ✓（否则会拿别的故事去默认故事上核 ⇒ 报"第 1 步不符"✗ —— **误导** ✓）。
	{
		const r7 = witness([`--verify=${TRACE}`]);
		if (r7.rc !== 0) bad.push(`⑦ 不带 \`--story=\` 核默认故事的轨迹应 rc=0 ✗（实际 ${r7.rc}）\n${r7.out.slice(-300)}`);
		// ⑦-b ✗：冻存件记的是**别的故事** ⇒ 必须去核**那个**故事（给个不存在的 ⇒ 必红并点名 ✓）——
		//   若它静默落回默认故事 ⇒ 这条会 rc=0 ⇒ **当场抓住** ✓（`#1000` 的第一版就是这样 ✓）
		const t7 = traceOf();
		t7.story = '不存在的故事-verify-probe';
		const bogus = join(ROOT, 'build', 'witness-trace.bogus-story.json');
		writeFileSync(bogus, JSON.stringify(t7, null, 1));
		const rb = witness([`--verify=${bogus}`]);
		if (rb.rc === 0) bad.push('⑦ 冻存件记了别的故事、却不带 `--story=` ⇒ 竟 rc=0 ✗ ⇒ 故事**没传给重跑**（静默落回默认故事 ✓）');
		else if (!/不存在的故事-verify-probe/.test(rb.out)) bad.push(`⑦ 红了但报文没点名那个故事 ✗\n${rb.out.slice(-300)}`);
		// ⑦-c ⚠️：冻存件**完全没有** `story` 键 ⇒ 按默认核 ✓ 但要**点名**"这份没记" ✗（不许静默 ✓）
		delete t7.story;
		const nostory = join(ROOT, 'build', 'witness-trace.no-story.json');
		writeFileSync(nostory, JSON.stringify(t7, null, 1));
		const rn2 = witness([`--verify=${nostory}`]);
		if (rn2.rc !== 0) bad.push(`⑦ 没记 \`story\` 的件（默认故事）应仍 rc=0 ✗（实际 ${rn2.rc}）`);
		else if (!/没记 `story`/.test(rn2.out)) bad.push('⑦ 没记 `story` 的件核过了、却没**点名**这一点 ✗（读者会以为"它记了"✓）');
	}

	// ⑤-3 边界 ✓：文件不存在 ⇒ 红并**点名该文件** ✓（不许静默 ✓）
	const rn = witness(['--verify=build/没有这个文件.json']);
	if (rn.rc === 0) bad.push('⑤ --verify 读不到文件却 rc=0 ✗');
	else if (!/读不了轨迹文件/.test(rn.out)) bad.push(`⑤ 读不到文件的报文没点名 ✗\n${rn.out.slice(-200)}`);
}

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
console.log('✔ 见证机器：轨迹到 ending ✓ 同 seed 逐格可复跑 ✓ **--verify 可机判（轨迹刀必红 ＋ 老件兼容 ＋ 故事按冻存件取）** ✓ 三条断言能假 ✓ 绝对路径不静默 ✓');
