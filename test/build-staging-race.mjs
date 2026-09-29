#!/usr/bin/env node
// ★★ `#1643`：**`build.mjs` 的中间件（暂存）不许落在共享固定路径** —— 并发段互踩的回归判据。
//
// 为什么要有它（实证，✗ 推演）：
//   · `build.mjs` 原先把 `build/game.twee`（写 → `npx extwee` 读）与 `build/font-chars.txt`／`build/fontface.css`
//     （写 → `python3 subset_font.py` 读）都放在**固定相对路径**上；
//   · 而 `scripts/run-tests.mjs` 最多 **8 段并发** ⇒ ★"写 → 外部命令读"之间是**共享暂存** ✗；
//   · 窗口（`npx extwee` 启动慢）内另一段覆盖 ⇒ ★产物**装错故事** ⇒ `test-case-run-mjs` 的 ㉔「种着」那一半
//     **本应绿却在 CI 上红**（`#1643` 现象：同一格三处三结果）。
//   · ★修前现场复现（我实跑 ✓，✗ 未加人为 sleep）：两个夹具并发 ⇒ ★其中一个产物里**出现了另一个故事的内容** ✗。
//
// 本格三条判据（都可复跑）：
//   ① 并发（**异夹具**）构建：两边都 rc=0 ＋ **互装 0 处**（各自产物只含自己的 slug ✓）；
//   ② **并发产物 ≡ 串行产物**（逐字节 ✓）——"没有互踩"的最强形式 ✓；
//   ③ ★**共享暂存件未被本构建创建/改动**（`build/game.twee`／`font-chars.txt`／`fontface.css`）——
//      结构面判据：即使将来窗口收窄到"撞不上"，共享位也不许再出现 ✓。
//
// ★自证（能假）：喂一对**合成产物**（其中一个含另一个的 slug）⇒ 互装检测器**必须**报 ✓（否则本格是空判 ✗）。
//
// 用法：`node test/build-staging-race.mjs`

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHARED = ['build/game.twee', 'build/font-chars.txt', 'build/fontface.css'];

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
	if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra ? ` —— ${extra}` : ''}`); }
};

/** **纯函数**：产物里出现了"非自己"的 slug ⇒ 报（可被自证喂合成样本 ✓）。 */
export const crossContamination = (products, ownSlugOf, read = (p) => readFileSync(p, 'utf8')) => {
	const bad = [];
	const slugs = [...new Set(products.map(ownSlugOf))];
	for (const p of products) {
		const own = ownSlugOf(p), text = read(p);
		for (const other of slugs) if (other !== own && text.includes(other)) bad.push(`${p}（${own}）里含 ${other}`);
	}
	return bad;
};

/** 共享暂存位的**指纹**（存在性 ＋ size ＋ mtime ⇒ 判"本构建有没有碰它" ✓）。 */
const sharedSnapshot = () => SHARED.map((rel) => {
	const p = join(ROOT, rel);
	if (!existsSync(p)) return `${rel}:absent`;
	const s = statSync(p);
	return `${rel}:${s.size}:${s.mtimeMs}`;
});

/** ★真并发：用 `spawn`（`execFileSync` 会**阻塞事件循环** ⇒ 假并发 ✗ —— 我第一版就踩了 ✓）。 */
const buildAsync = (storiesDir) => new Promise((res) => {
	const c = spawn(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: storiesDir }, stdio: 'ignore' });
	c.on('exit', (code) => res(code ?? 1));
});
const buildSync = (storiesDir) => {
	const c = spawn(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: storiesDir }, stdio: 'ignore' });
	return c;   // 调用方 await 其 exit（保持与 buildAsync 同一实现 ⇒ ✗ 两套并行机制 ✓）
};
const waitExit = (c) => new Promise((res) => c.on('exit', (code) => res(code ?? 1)));

const W = mkdtempSync(join(tmpdir(), 'sg-race-'));
const FIX = [
	{ key: 'r1', src: 'test/fixtures/m3-actor-fixture/stories' },
	{ key: 'r2', src: 'test/fixtures/m3-any-fixture/stories' },
];
const prep = (base) => {
	const roots = {};
	for (const f of FIX) {
		roots[f.key] = join(base, f.key);
		mkdirSync(roots[f.key], { recursive: true });
		cpSync(join(ROOT, f.src), join(roots[f.key], 'stories'), { recursive: true });
	}
	return roots;
};
const productsOf = (roots) => {
	const out = [];
	for (const f of FIX) {
		const d = join(roots[f.key], 'dist', 'stories');
		if (!existsSync(d)) continue;
		for (const slug of readdirSync(d)) {
			const p = join(d, slug, 'index.html');
			if (existsSync(p)) out.push({ path: p, slug, key: f.key });
		}
	}
	return out;
};

try {
	// ── 自证：检测器能假
	{
		const a = join(W, 'synth-a.html'), b = join(W, 'synth-b.html');
		writeFileSync(a, '<html>alpha story body</html>', 'utf8');
		writeFileSync(b, '<html>beta story body</html>', 'utf8');
		const own = (p) => (p === a ? 'alpha' : 'beta');
		const clean = crossContamination([a, b], own);                        // 各自只含自己 ⇒ 0 ✓
		writeFileSync(a, '<html>alpha body ＋ beta body</html>', 'utf8');     // ★把 a 弄成"含别人 slug" ⇒ 必报 1 ✓
		const dirty = crossContamination([a, b], own);
		t('自证：互装检测器**能假**（干净 ⇒ 0 ｜ 合成互装 ⇒ 必报 1 ✓）', clean.length === 0 && dirty.length === 1, `clean=${clean.length} dirty=${dirty.length}`);
	}

	// ── ① ＋ ③
	const before = sharedSnapshot();
	const rootsConc = prep(join(W, 'conc'));
	const rcs = await Promise.all(FIX.map((f) => buildAsync(join(rootsConc[f.key], 'stories'))));
	t('① 并发（**异夹具**）构建：两边都 rc=0', rcs.every((r) => r === 0), `rc=${rcs.join(',')}`);

	const conc = productsOf(rootsConc);
	t('① 并发产物齐（两个夹具各 ≥1 份）', conc.length >= 2 && new Set(conc.map((x) => x.key)).size === 2, `产物=${conc.map((x) => x.key + '/' + x.slug).join(',')}`);
	const bad = crossContamination(conc.map((x) => x.path), (p) => (conc.find((x) => x.path === p) ?? {}).slug);
	t('① 互装 **0 处**（各自产物只含自己的 slug）', bad.length === 0, bad.join('；'));
	const after = sharedSnapshot();
	t('③ 共享暂存位**未被本构建创建/改动**（`build/game.twee`／`font-chars.txt`／`fontface.css`）',
		JSON.stringify(before) === JSON.stringify(after), `before=${before.join(',')} ｜ after=${after.join(',')}`);

	// ── ② 并发 ≡ 串行（逐字节）
	const rootsSeq = prep(join(W, 'seq'));
	let same = true, why = '';
	for (const f of FIX) {
		const rc = await waitExit(buildSync(join(rootsSeq[f.key], 'stories')));
		if (rc !== 0) { same = false; why = `串行 ${f.key} rc=${rc}`; break; }
	}
	if (same) {
		for (const x of conc) {
			const q = join(rootsSeq[x.key], 'dist', 'stories', x.slug, 'index.html');
			if (!existsSync(q)) { same = false; why = `串行缺 ${x.key}/${x.slug}`; break; }
			if (readFileSync(x.path, 'utf8') !== readFileSync(q, 'utf8')) { same = false; why = `不一致 ${x.key}/${x.slug}`; break; }
		}
	}
	t('② 并发产物 ≡ 串行产物（**逐字节**）', same, why);

	console.log(`\n${fail ? '✗' : '✔'} build-staging-race：${pass} 通过 / ${fail} 失败`);
	process.exitCode = fail ? 1 : 0;
} finally {
	rmSync(W, { recursive: true, force: true });
}
