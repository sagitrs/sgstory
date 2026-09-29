// `#1572`（阶 4）：**循环事件** —— 自指链接 ＋ 起止条件 ＋ 计数（✗ 不需要栈）。
//
// ★三条本文件赖以成立的实测教训（★都踩过）：
//   ★① ★**判据要有辨别力**：`boot({random:0.5})` 下骰面恒定 ⇒ ✗ 不能拿"两次相同"当证据（`#1574` 那条）
//   ★② ★**同进程第二次 `boot()` 会读陈旧产物** ⇒ ★**一个进程只跑一个用例**（父进程 spawn 子进程 ✓）
//   ★③ ★**改夹具 ⇒ 必须清三层**（`build/` ＋ 夹具 `dist/` ＋ 故事侧生成的 `*.twee`）⇒ ✗ 否则读数陈旧 ✗
import { existsSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FX = join(ROOT, 'test/fixtures/m3-loop-fixture/stories');
const SLUG = 'loop-basic';
const CASE = process.env.LE_CASE ?? null;
if (!CASE) {
	const cases = ['walk', 'limit', 'revisit', 'cycle', 'seglmt', 'declchain', 'longgame', 'deadend', 'noedge', 'zero'];
	let rc = 0;
	for (const c of cases) {
		const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, LE_CASE: c }, encoding: 'utf8', cwd: ROOT });
		process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
		if (r.status !== 0) rc = 1;
	}
	process.exit(rc);
}
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };
const clearThree = () => {
	rmSync(join(ROOT, 'build'), { recursive: true, force: true });
	rmSync(join(ROOT, 'test/fixtures/m3-loop-fixture/dist'), { recursive: true, force: true });
	for (const g of ['00-meta.twee', '15-tables.twee', '17-rules.twee', '19-events.twee']) rmSync(join(FX, SLUG, g), { force: true });
};
const build = () => execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: FX }, stdio: 'pipe' });
const P = join(FX, SLUG, 'data/passages.json');
const E = join(FX, SLUG, 'data/events.json');
const ORIG = { p: readFileSync(P, 'utf8'), e: readFileSync(E, 'utf8') };
const restore = () => { writeFileSync(P, ORIG.p); writeFileSync(E, ORIG.e); };

const loop = async ({ injectVisits = null, clicks = 5 } = {}) => {
	process.env.SG_STORIES_DIR = FX;
	const { boot } = await import('./boot.mjs');
	const B = await boot({ story: SLUG, random: 0.5 });
	const w = B.w, S = w.SugarCube.State;
	S.variables.sgVisits = S.variables.sgVisits || {};
	// ★★计数形是 {name, n}（★**连续**计数 ✓）⇒ ★注入要与它同形 ✗ 否则推过上限推不动 ✓
		// ★★运行期形是 {ring:串, n, last, total}（★环存字符串 —— 数组会被 SugarCube 克隆拒 ✓）
		if (injectVisits != null) { S.variables.sgVisits = { ring: '', n: injectVisits, last: '战斗', total: 0 }; w.SugarCube.Engine.play('战斗'); await new Promise((r) => setTimeout(r, 300)); }
	const errs = []; w.console.error = (...a) => errs.push(String(a.join(' ')));
	const links = () => [...w.document.querySelectorAll('#passages a')].map((x) => x.textContent.trim());
	const click = async (l) => {
		const a = [...w.document.querySelectorAll('#passages a')].find((x) => x.textContent.includes(l));
		if (!a) throw new Error('无链接「' + l + '」｜现有: ' + links().join('／'));
		a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
		await new Promise((r) => setTimeout(r, 250));
	};
	const seen = [];
	for (let i = 0; i < clicks; i += 1) {
		const ls = links();
		seen.push(ls.filter((x) => /回合|结束战斗/.test(x)).join('／'));
		if (ls.some((x) => x.includes('下一回合'))) await click('下一回合');
		else if (ls.some((x) => x.includes('结束战斗'))) { await click('结束战斗'); seen.push('→收尾'); break; }
		else { seen.push('→无可见出边'); break; }
	}
	const out = { seen, errs, turn: S.variables.pc.ev?.turn, body: w.document.body.textContent, deadend: !!w.document.querySelector('[data-sg-deadend]'), limit: !!w.document.querySelector('[data-sg-visitlimit]') };
	await B.close?.();
	return out;
};

try {
	if (CASE === 'walk') {
		// ---- ① 多轮走通：3 轮 ⇒「下一回合」出现 3 次后消失 ⇒「结束战斗」出现 ⇒ 点击 ⇒ 收尾 ----
		clearThree(); build();
		const r = await loop();
		t('★① 多轮走通：「下一回合」出现 3 次（turn 0/1/2）', r.seen.slice(0, 3).every((s) => /下一回合/.test(s)), r.seen.join(' ｜ '));
		t('★①-b 到 turn=3 ⇒「下一回合」**消失**、「结束战斗」**出现** ⇒ 点击 ⇒ 收尾', r.seen[3] === '结束战斗' && r.seen.includes('→收尾'), r.seen.join(' ｜ '));
		t('★①-c 末态 pc.ev.turn = 3（★计数真的走了 ✓）', r.turn === 3, `turn=${r.turn}`);
		t('★①-d ★**正常循环不报兜底**（✗ 零误报 —— 否则"能假"无从谈起 ✓）', !r.deadend && !r.limit, JSON.stringify(r.errs).slice(0, 120));
	}
	if (CASE === 'revisit') {
		// ---- 丙：★**非循环回访 ⇒ 不误报**（★CR `#1653` 丙 ✓）—— ★一局里"总共进过 N 次"是正常的
		//      （★例：中枢段来回经过 ✗ 不是循环 ✗）⇒ ★进**别的段**即归零 ⇒ ✗ 不该点名 ✓
		clearThree(); build();
		process.env.SG_STORIES_DIR = FX;
		const { boot } = await import('./boot.mjs');
		const B = await boot({ story: SLUG, random: 0.5 });
		const w = B.w, S = w.SugarCube.State;
		const errs = []; w.console.error = (...a) => errs.push(String(a.join(' ')));
		// ★★ `#1667` 复现反馈后**重定范围**：★本格原先跑"交替 70 次"＝**140 次渲染 ＝ 70 个周期** ✗ ——
		//   ★而新门（★"紧致循环深度 > 2×LIMIT" ⇒ ★p=2 时 ≈ **64 个周期**）⇒ ★那已是**门附近** ✓
		//   ⇒ ★本格改回它**本来要钉的那件事**：★**浅**重复（★tester-4 说的 shallow ✓）⇒ 10 个周期 ⇒ **不报** ✓
		//   ★（★"长局里的浅重复 ⇒ 不报"另由 ⑩ 格钉住 —— ★两格分工：★④＝单轮浅、⑩＝长局多轮 ✓）
		for (let i = 0; i < 20; i += 1) { w.SugarCube.Engine.play('战斗'); await new Promise((r) => setTimeout(r, 3)); w.SugarCube.Engine.play('战果'); await new Promise((r) => setTimeout(r, 3)); }
		t('★④ 浅重复（★交替进两段共 20 次 ＝ 10 个周期）⇒ **不误报**（★远低于门 ✓）', !errs.some((e) => /visitlimit/.test(e)), JSON.stringify(errs).slice(0, 130));
		await B.close?.();
	}
	if (CASE === 'limit') {
		// ---- ② 能假·终止条件写坏（永不成立）⇒ 重入上限兜底点名 ----
		clearThree(); build();
		const r = await loop({ injectVisits: 64 });   // ★"条件永不成立"等价于"进段次数停不下来" ⇒ 推过上限
		// ★★(实测) DOM 标记会被**随后的跳段**冲掉 ⇒ ★判据以**点名报文**为准（★报文里带段名与次数 ✓）
		t('★② 能假·终止条件写坏 ⇒ **重入上限具名**（too many times (64) ＋ 段名 ＋ **连续**次数）', r.errs.some((e) => /sg-visitlimit/.test(e) && /too many times \(64\)/.test(e) && /战斗/.test(e)), JSON.stringify(r.errs).slice(0, 150));
	}
	if (CASE === 'cycle') {
		// ---- ★①（`#1657`）：**交替型卡死（A↔B 无界）⇒ 应报** —— ★旧"只数连续"的口径在这里**一声不响** ✗ ----
		clearThree(); build();
		process.env.SG_STORIES_DIR = FX;
		const { boot } = await import('./boot.mjs');
		const B = await boot({ story: SLUG, random: 0.5 });
		const w = B.w, S = w.SugarCube.State;
		const errs = []; w.console.error = (...a) => errs.push(String(a.join(' ')));
		S.variables.sgVisits = { ring: '', n: 0, last: '', total: 0 };
		for (let i = 0; i < 350; i += 1) { w.SugarCube.Engine.play(i % 2 ? '战果' : '战斗'); await new Promise((r) => setTimeout(r, 1)); }
		const hit = errs.find((e) => /sg-visitlimit/.test(e));
		t('★① 交替型卡死（A↔B 无界 350 次）⇒ **周期臂点名**（★旧口径在这里永不触发 ✗）', !!hit && /周期/.test(hit), (hit ?? '(无)').slice(0, 120));
		await B.close?.();
	}
	if (CASE === 'seglmt') {
		// ---- ★②（`#1657`）：**段级 `visitLimit`** ⇒ ★上限不再是全局魔数（★缺省 64 只作缺省值 ✓）----
		clearThree(); build();
		process.env.SG_STORIES_DIR = FX;
		const { boot } = await import('./boot.mjs');
		const B = await boot({ story: SLUG, random: 0.5 });
		const w = B.w, S = w.SugarCube.State;
		const errs = []; w.console.error = (...a) => errs.push(String(a.join(' ')));
		const sp = w.Sg.story.passageSpecs();
		sp['战斗'] = Object.assign({}, sp['战斗'], { visitLimit: 4 });
		// ★★(实测) ✗ 别用交替测段级上限 —— ★交替时**连续臂** n 恒为 1 ✗，而**周期臂**有 `total>300` 门 ✗
		//   ⇒ ★段级上限要测**连续**：★注入"已连续 5 次" ⇒ 下一次渲染 ⇒ n=6 > 4 ⇒ 报 (4) ✓
		S.variables.sgVisits = { ring: '', n: 5, last: '战斗', total: 0 };
		w.SugarCube.Engine.play('战斗');
		await new Promise((r) => setTimeout(r, 300));
		const hit = errs.find((e) => /sg-visitlimit/.test(e));
		t('★② 段级 `visitLimit: 4` ⇒ 上限按段生效（★第 5 次即报，✗ 不是 64 ✓）', !!hit && /\(4\)/.test(hit), (hit ?? '(无)').slice(0, 120));
		await B.close?.();
	}
	if (CASE === 'declchain') {
		// ---- ★④（领队审点）：**声明面 ⇒ 运行期读** 的**整条链**（★✗ 不绕开声明直接改 spec ✗）----
		//   ★链：★`data/passages.json` 的段级 `visitLimit` ⇒ ★`visitLimitDeclared` ⇒ ★`emit` 的 `specs` ⇒
		//     ★契约 `passageSpecs()` ⇒ ★运行期读 ⇒ ★报 `(4)` ✓
		//   ★★为什么必须单独立一格：★`seglmt` 那格是**直接改 spec**（★只验了"读得到" ✗）⇒ ★链的前半没验 ✓
		const d = JSON.parse(ORIG.p);
		d['战斗'].visitLimit = 4;                     // ★★写进**声明面**（✗ 不碰 spec ✓）
		writeFileSync(P, JSON.stringify(d, null, 1) + '\n');
		clearThree(); build();
		process.env.SG_STORIES_DIR = FX;
		const { boot } = await import('./boot.mjs');
		const B = await boot({ story: SLUG, random: 0.5 });
		const w = B.w, S = w.SugarCube.State;
		const specLmt = (w.Sg.story.passageSpecs()['战斗'] || {}).visitLimit;
		t('★④-a 声明面 `visitLimit: 4` ⇒ **契约 spec 里读到 4**（★链前半 ✓）', Number(specLmt) === 4, `spec.visitLimit=${JSON.stringify(specLmt)}`);
		const errs = []; w.console.error = (...a) => errs.push(String(a.join(' ')));
		S.variables.sgVisits = { ring: '', n: 5, last: '战斗', total: 0 };
		w.SugarCube.Engine.play('战斗');
		await new Promise((r) => setTimeout(r, 300));
		const hit = errs.find((e) => /sg-visitlimit/.test(e));
		t('★④-b 运行期据此报 `(4)`（★链后半 ✓ ⇒ 声明面到运行期**通** ✓）', !!hit && /\(4\)/.test(hit), (hit ?? '(无)').slice(0, 110));
		await B.close?.();
	}
	if (CASE === 'longgame') {
		// ---- ★⑩（`#1667` 复现反馈 要的格）：**长局 ＋ 正常循环 ⇒ 不报** ----
		//   ★形（他会复现的那个）：★玩家**反复"短循环一下再离开"**（商店↔背包 20 次 ⇒ 走开；再来一轮…）
		//     ⇒ ★生涯总访问自然过 300 ✓ ⇒ ★旧门（`total > 300`）会误报 ✗ ⇒ ★本格钉住"✗ 不许误报" ✓
		clearThree(); build();
		process.env.SG_STORIES_DIR = FX;
		const { boot } = await import('./boot.mjs');
		const B = await boot({ story: SLUG, random: 0.5 });
		const w = B.w, S = w.SugarCube.State;
		const errs = []; w.console.error = (...a) => errs.push(String(a.join(' ')));
		S.variables.sgVisits = { ring: '', n: 0, last: '', cyc: 0 };
		// ★★每轮：交替 20 次（＝10 个周期，✗ 远不到门 ✓）⇒ 再进别的段一次（★打断 ✓）⇒ 重复 30 轮
		for (let round = 0; round < 30; round += 1) {
			for (let i = 0; i < 20; i += 1) { w.SugarCube.Engine.play(i % 2 ? '战果' : '战斗'); await new Promise((r) => setTimeout(r, 1)); }
			w.SugarCube.Engine.play('战果'); await new Promise((r) => setTimeout(r, 1));
		}
		t('★⑩ 长局 ＋ 正常循环（★反复"短循环再离开"共 30 轮、总访问 > 300）⇒ **不误报**', !errs.some((e) => /sg-visitlimit/.test(e)), JSON.stringify(errs).slice(0, 130));
		await B.close?.();
	}
	if (CASE === 'deadend') {
		// ---- ③ 能假·兜底链接：撤掉「结束战斗」⇒ 无可见出边点名 ----
		const p = JSON.parse(ORIG.p);
		p['战斗'].links = p['战斗'].links.filter((l) => !String(l.id).includes('结束战斗'));
		writeFileSync(P, JSON.stringify(p, null, 1) + '\n');
		clearThree(); build();
		const r = await loop();
		t('★③ 能假·撤掉兜底链接 ⇒ **无可见出边具名**（`No selectable options` ＋ 段名 ✓）', r.deadend && r.errs.some((e) => /sg-deadend/.test(e) && /No selectable options/.test(e) && /战斗/.test(e)), JSON.stringify(r.errs).slice(0, 140));
	}
	if (CASE === 'noedge') {
		// ---- ⑤ 编译期判据能假：一个事件 ✗ 声明任何出边 ⇒ 编译期失败（点名）----
		const e = JSON.parse(ORIG.e);
		e.events['死声明'] = { label: '死声明', use: [{ when: { lt: ['ev.turn', 1] } }] };
		writeFileSync(E, JSON.stringify(e, null, 1) + '\n');
		clearThree();
		// ★★(实测) ✗ 不用 `execFileSync`（抛错时 stdout/stderr 会读不全 ⇒ 报文丢了 ✗）
		//   ⇒ ★用 `spawnSync`：★rc ＋ stdout ＋ stderr **都拿得到** ✓
		// ★★(实测) ✗ 别经 `build.mjs`：★它把子进程 stderr **吞进错误对象**（dump 成一堆数字 ✗）⇒ 报文丢了 ✗
		//   ⇒ ★直接调**编译器本体**（`editor/compile-story.mjs`）⇒ stdout/stderr 干净 ✓
		const r5 = spawnSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), SLUG, '--out=' + join(FX, SLUG, '/')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: FX }, encoding: 'utf8' });
		const out = String(r5.stdout ?? '') + String(r5.stderr ?? '');
		// ★★(实测) 断言要断**报文里真有的字样** —— ★`code`（`prose-event-no-edge`）**不在报文里** ✗（只打 `why` ✓）
		t('★⑤ 编译期判据能假：事件**零出边** ⇒ 编译**失败** ＋ 点名 `[prose-event]` ＋ 说清「一条出边都没有」', r5.status !== 0 && /\[prose-event\]/.test(out) && /出边都没有/.test(out), ('rc=' + r5.status + '｜' + out).replace(/\s+/g, ' ').slice(0, 170));
	}
	if (CASE === 'zero') {
		// ---- ⑥ 零旧战斗能力 ＋ ⑦ 非故事专用 ----
		let added = null, why = '';
		try {
			const diff = execFileSync('git', ['diff', 'origin/main', '--unified=0', '--', 'src', 'editor'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
			added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
		} catch (e) { why = '基线不可得 ⇒ 先 git fetch origin main｜' + String(e && e.message || e).split('\n')[0].slice(0, 60); }
		const banned = /Game\.Combat|Game\.Encounters|State\.variables\.fights|rollDice|battleDamage|slotAbsorbAt|fightbegin|fightlog|fightpanel/;
		const hits = (added ?? []).filter((l) => banned.test(l));
		t('★⑥ 本笔新增行**零旧战斗机制**（★含 `fights`／`fight*` ✓）', added != null && hits.length === 0, added == null ? why : hits.slice(0, 2).join(' ｜ '));
		t('★⑦ 非故事专用：★演示对象是**夹具**（`test/fixtures/…`），✗ 不是某个真故事', existsSync(join(FX, SLUG, '00-story.json')) && join(FX).includes('fixtures'), FX);
	}
} finally { restore(); }

if (bad) { console.error('\n✗ 循环事件（#1572）自证失败 ' + bad + ' 项'); process.exit(1); }
console.log('\n✔ 循环事件自证通过（自指 ＋ 起止条件 ＋ 计数 · 两条兜底具名 · 编译期出边）');
