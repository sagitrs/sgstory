// dist 新鲜度守卫（#319③）：**一处实现，测试与 audit 共用**。
//
// 背景：`test/*.mjs` 与 `audit` 的部分检查跑的是**构建产物** `dist/index.html`，不是 `src/*.twee`。
// 源码改了、忘了 build 时，断言会基于旧游戏 → 得到与源码不符的**假红/假绿**。
// 实测咬过一次：pull 了 G3（#302）后直接跑 scenarios，得到「门不可达」的假红，真因是 dist 落后 4 分钟。
//
// 纪律：**不自动 build**（那会掩盖问题）；过期或缺失 → **大声报错 + 给出修复命令**。
// 缺失为什么也要报错：此前 audit 的 a11y 门用 `existsSync` 兜住 → dist 不存在时该检查**静默跳过**，
// 那就是「假绿」的一种（没跑，却看起来通过）。
import { readdirSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync, utimesSync, appendFileSync, readFileSync } from 'node:fs';   // `#1152`：**读回断言用的名字此前漏了** → ReferenceError 被 catch 吞成假「落盘失败」
import { isTransientFixture } from './lib/untracked-guard.mjs';   // `#1130`：**并行段运行期自造的临时夹具不算真源**（`stories/__e2e`）
import { allSourceFiles } from './module-order.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';   // `#1130`：落盘要建父目录（`dirname` 先前漏 import → 被 catch 吞掉）
import { defaultStoryHtml } from './dist-paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// 单一权威（#441 切片 β1）：不要在这里再写一份 `dist/index.html`
export const DIST_PATH = defaultStoryHtml();
export const SRC_DIR = join(ROOT, 'src');

export const distState = ({ distPath = DIST_PATH, srcDir = SRC_DIR } = {}) => {
	if (!existsSync(distPath)) return { exists: false, fresh: false };
	// #458 切片B：默认走**单一权威** `allSourceFiles()`（搬家后同时看 `src/**` 与 `stories/**`，
	// 否则故事文件改动会被新鲜度守卫**静默漏掉**）；显式传 `srcDir`（自证的合成目录）时按它枚举。
	const files = srcDir === SRC_DIR
		? allSourceFiles(undefined, { withStoryData: true })
			.filter((p) => !/\/1[5678]-[^/]*\.twee$/.test(p))
			.filter((p) => !isTransientFixture(p))   // `#1130`：**临时夹具不算真源**（CI 实测：`stories/__e2e/data/*.json` 曾把 siteinfo 两段撞红）
			.map((p) => join(ROOT, p))   // `#1128`：产物不再是「源」（移出 git 后其 mtime 是运行时态——真源=data/*.json） ＋ `#1130`：**本门显式传 `withStoryData: true`**（只有本门要 data json 在内）
		: readdirSync(srcDir).filter((f) => f.endsWith('.twee')).map((f) => join(srcDir, f));
	const newestSrc = Math.max(...files.map((f) => statSync(f).mtimeMs));
	const distMtime = statSync(distPath).mtimeMs;
	// `#1130`：**点名**比 dist 新的源件（前 10，按新→旧）——本来只报"旧了"不说是谁 → CI 上没法查
	const newer = files.map((f) => ({ f, m: statSync(f).mtimeMs })).filter((x) => x.m > distMtime).sort((a, b) => b.m - a.m).slice(0, 10);
	return { exists: true, fresh: distMtime >= newestSrc, newestSrc, distMtime, newer };
};

export const assertFreshDist = ({ distPath = DIST_PATH, srcDir = SRC_DIR, who = '本脚本' } = {}) => {
	const st = distState({ distPath, srcDir });
	if (!st.exists) {
		throw new Error(`找不到 dist/index.html——先跑 \`npm run build\`（${who}要检查构建产物；缺产物时静默跳过＝假绿）`);
	}
	if (!st.fresh) {
		// `#1130`：**点名清单落盘**（durable）—— CI 上把它作为 artifact 上传 → 任何一次新鲜度红都能直接看名单
		//（不在 CI 时也无害：落在 gitignored 的 `build/`；写失败**不得掩盖**原本的报错）
		//注意：判据（协调席 `#1112`）：**报错时写诊断 → 写失败必须可见**（不许 `catch {}`）；
		// 且**副作用必须以"看到产物"收尾**（写完读回 ＋ 校验关键字段 —— "代码在" ≠ "生效了"）
		const payload = { who, when: new Date().toISOString(), distMtime: new Date(st.distMtime).toISOString(),
			newer: (st.newer ?? []).map((x) => ({ file: x.f, mtime: new Date(x.m).toISOString() })) };
		//注意：**追加式**（`#1130` 甲：覆盖写会被本门**自证**的合成记录盖掉 → 机制在关键时刻误导阅读者）
		const out = join(ROOT, 'build/freshness-failure.jsonl');
		let writeNote = '';
		try {
			mkdirSync(dirname(out), { recursive: true });   // 写前建父目录（仓内既有惯例）
			const line = JSON.stringify(payload);            // 一行一条（每行自带 who／when → 可按时间排序 ＋ 区分真凶/合成）
			appendFileSync(out, line + '\n');
			// "看到产物"判据**同样适用于追加**：读回断言**刚写的那行在文件里**（追加失败也要可见）
			if (!readFileSync(out, 'utf8').split('\n').includes(line)) throw new Error('追加后读回找不到该行');
		} catch (e) {
			writeNote = `\n  ⚠️ **点名清单落盘失败**（${e.message}）⇒ 名单已折进本报错，未丢 ✓（不静默 ✓）`;
		}
		throw new Error('dist/index.html 比 src/*.twee 旧——先跑 `npm run build`（否则断言基于旧游戏，结果是假红/假绿）' + (st.newer ?? []).map((x) => `\n    · ${x.f}（${new Date(x.m).toISOString()} > dist ${new Date(st.distMtime).toISOString()}）`).join('') + writeNote);
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
