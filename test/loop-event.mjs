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
	const cases = ['walk', 'limit', 'deadend', 'noedge', 'zero'];
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
	if (injectVisits != null) { S.variables.sgVisits['战斗'] = injectVisits; w.SugarCube.Engine.play('战斗'); await new Promise((r) => setTimeout(r, 300)); }
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
	if (CASE === 'limit') {
		// ---- ② 能假·终止条件写坏（永不成立）⇒ 重入上限兜底点名 ----
		clearThree(); build();
		const r = await loop({ injectVisits: 64 });   // ★"条件永不成立"等价于"进段次数停不下来" ⇒ 推过上限
		// ★★(实测) DOM 标记会被**随后的跳段**冲掉 ⇒ ★判据以**点名报文**为准（★报文里带段名与次数 ✓）
		t('★② 能假·终止条件写坏 ⇒ **重入上限具名**（too many times (64) ＋ 段名 ＋ 次数）', r.errs.some((e) => /sg-visitlimit/.test(e) && /too many times \(64\)/.test(e) && /战斗/.test(e)), JSON.stringify(r.errs).slice(0, 150));
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
