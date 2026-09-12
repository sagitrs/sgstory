// dist 新鲜度守卫（#319③）：**一处实现，测试与 audit 共用**。
//
// 背景：`test/*.mjs` 与 `audit` 的部分检查跑的是**构建产物** `dist/index.html`，不是 `src/*.twee`。
// 源码改了、忘了 build 时，断言会基于旧游戏 → 得到与源码不符的**假红/假绿**。
// 实测咬过一次：pull 了 G3（#302）后直接跑 scenarios，得到「门不可达」的假红，真因是 dist 落后 4 分钟。
//
// 纪律：**不自动 build**（那会掩盖问题）；过期或缺失 → **大声报错 + 给出修复命令**。
// 缺失为什么也要报错：此前 audit 的 a11y 门用 `existsSync` 兜住 → dist 不存在时该检查**静默跳过**，
// 那就是「假绿」的一种（没跑，却看起来通过）。
import { readdirSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DIST_PATH = join(ROOT, 'dist/index.html');
export const SRC_DIR = join(ROOT, 'src');

export const distState = ({ distPath = DIST_PATH, srcDir = SRC_DIR } = {}) => {
	if (!existsSync(distPath)) return { exists: false, fresh: false };
	const newestSrc = Math.max(...readdirSync(srcDir).filter((f) => f.endsWith('.twee')).map((f) => statSync(join(srcDir, f)).mtimeMs));
	const distMtime = statSync(distPath).mtimeMs;
	return { exists: true, fresh: distMtime >= newestSrc, newestSrc, distMtime };
};

export const assertFreshDist = ({ distPath = DIST_PATH, srcDir = SRC_DIR, who = '本脚本' } = {}) => {
	const st = distState({ distPath, srcDir });
	if (!st.exists) {
		throw new Error(`找不到 dist/index.html——先跑 \`npm run build\`（${who}要检查构建产物；缺产物时静默跳过＝假绿）`);
	}
	if (!st.fresh) {
		throw new Error('dist/index.html 比 src/*.twee 旧——先跑 `npm run build`（否则断言基于旧游戏，结果是假红/假绿）');
	}
	return st;
};

// 自证（由 test/layering.mjs 调用，进 npm test）：合成目录验证「新鲜绿 / 过期红 / 缺失红」
export const selftest = () => {
	const base = join(ROOT, 'build/_fresh');
	const distPath = join(base, 'dist/index.html');
	const srcDir = join(base, 'src');
	const mk = (distAgeSec, srcAgeSec) => {
		rmSync(base, { recursive: true, force: true });
		mkdirSync(srcDir, { recursive: true });
		mkdirSync(join(base, 'dist'), { recursive: true });
		writeFileSync(join(srcDir, 'a.twee'), 'x');
		writeFileSync(distPath, 'y');
		const now = Date.now() / 1000;
		utimesSync(join(srcDir, 'a.twee'), now - srcAgeSec, now - srcAgeSec);
		utimesSync(distPath, now - distAgeSec, now - distAgeSec);
	};
	const cases = [];
	mk(1, 60);
	cases.push(['dist 比 src 新 → 放行', (() => { try { assertFreshDist({ distPath, srcDir }); return true; } catch { return false; } })()]);
	mk(60, 1);
	cases.push(['src 比 dist 新 → 报错并给修复命令', (() => { try { assertFreshDist({ distPath, srcDir }); return false; } catch (e) { return /先跑 .npm run build./.test(e.message); } })()]);
	rmSync(base, { recursive: true, force: true });
	cases.push(['dist 缺失 → 报错（不静默跳过）', (() => { try { assertFreshDist({ distPath, srcDir }); return false; } catch (e) { return /找不到 dist\/index\.html/.test(e.message); } })()]);
	rmSync(base, { recursive: true, force: true });
	let bad = 0;
	for (const [name, ok] of cases) { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}`); }
	if (bad) { console.error(`\n✗ dist 新鲜度守卫自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ dist 新鲜度守卫自证通过（新鲜绿 / 过期红 / 缺失红）');
};
