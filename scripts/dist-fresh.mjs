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
import { isTransientFixture } from './lib/untracked-guard.mjs';
import { isGeneratedFamily } from '../editor/lib/core/generated-family.mjs';   // `#1185`：家族谓词单一权威 // `#1130`：**并行段运行期自造的临时夹具不算真源**（`stories/__e2e`）
import { allSourceFiles } from './module-order.mjs';
import { absPath } from './dist-paths.mjs';   // `#1267`：符号名 → 真实落盘路径
import { fileURLToPath } from 'node:url';
import * as _crypto from 'node:crypto';
import { join, dirname } from 'node:path';   // `#1130`：落盘要建父目录（`dirname` 先前漏 import → 被 catch 吞掉）
import { defaultStoryHtml } from './dist-paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// 单一权威（#441 切片 β1）：不要在这里再写一份 `dist/index.html`
// `#1261` 零故事模式：仓内无故事时没有逐故事产物 → DIST_PATH 为 null，
// 依赖它的消费者（拿产物做断言的件）必须自行跳过；这里不再自动抛错（那是导入期副作用）。
export const DIST_PATH = (() => { try { return defaultStoryHtml(); } catch { return null; } })();
export const SRC_DIR = join(ROOT, 'src');

/** `#1350` 后续笔：读产物旁的**输入指纹**（`<dist>/INPUTS.json`；无 ⇒ `null`）。 */
export const readInputsFingerprint = (distPath = DIST_PATH) => {
	try {
		if (!distPath) return null;
		// ★  ＝  ⇒ 指纹在 **dist 根**（上两级），✗ 不是同级
		const f = join(dirname(dirname(dirname(distPath))), 'INPUTS.json');
		if (!existsSync(f)) return null;
		const d = JSON.parse(readFileSync(f, 'utf8'));
		return d && typeof d === 'object' ? d : null;
	} catch { return null; }
};

/** `#1350` 后续笔：**内容指纹**（sha256 前 16）—— 与 build 侧写入口径同一份。 */
export const inputShaOf = (file) => {
	try { return _crypto.createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16); }
	catch { return null; }
};

export const distState = ({ distPath = DIST_PATH, srcDir = SRC_DIR } = {}) => {
	if (!distPath) return { exists: false, fresh: false, noStory: true };   // `#1261` 零故事：无逐故事产物
	if (!existsSync(distPath)) return { exists: false, fresh: false };
	// #458 切片B：默认走**单一权威** `allSourceFiles()`（搬家后同时看 `src/**` 与 `stories/**`，
	// 否则故事文件改动会被新鲜度守卫**静默漏掉**）；显式传 `srcDir`（自证的合成目录）时按它枚举。
	const files = srcDir === SRC_DIR
		? allSourceFiles(undefined, { withStoryData: true })
			.filter((p) => !isGeneratedFamily(p))   // `#1185`：生成物家族谓词取**单一权威**（15/16/17/18 ＋ 00-meta）
			.filter((p) => !isTransientFixture(p))   // `#1130`：**临时夹具不算真源**（CI 实测：`stories/__e2e/data/*.json` 曾把 siteinfo 两段撞红）
			// `#1267`（M1 尾件 ①）：**源件也必须过 `absPath`** —— 清单给的是符号名（`stories/…`），
			// 故事根在仓外时 `join(ROOT, p)` 会指到**仓内**的同一相对名 → ENOENT（实测：21 段
			// 「走仓内根」的红都源于此）。仓内时 `absPath` 恒等 → 行为逐字符不变。
			.map((p) => absPath(p))
		: readdirSync(srcDir).filter((f) => f.endsWith('.twee')).map((f) => join(srcDir, f));
	// `#1350` 后续笔：**先看指纹**（有 ⇒ 比内容；✗ 不比 mtime ⇒ 免把"checkout 刷新 mtime"读成"源变新" ✗）
	const fp = readInputsFingerprint(distPath);
	if (fp) {
		const changed = files.filter((f) => {
			const was = fp[f];
			if (typeof was !== 'string') return true;              // 指纹里没有该件 ⇒ 视为新输入（该重编）
			return inputShaOf(f) !== was;                          // 内容不同 ⇒ 真变
		});
		const distMtimeFp = statSync(distPath).mtimeMs;
		return { exists: true, fresh: changed.length === 0, byFingerprint: true,
			newestSrc: Math.max(...files.map((f) => statSync(f).mtimeMs)), distMtime: distMtimeFp,
			newer: changed.map((f) => ({ f, m: statSync(f).mtimeMs })), changedFiles: changed };
	}
	// 无指纹 ⇒ **出声**退回 mtime 口径（✗ 不静默、✗ 不判红）
	console.error('  ○ 无输入指纹（`<dist>/INPUTS.json`）⇒ 新鲜度按 **mtime** 口径判（口径较弱：checkout 刷新 mtime 会误报）');
	const newestSrc = Math.max(...files.map((f) => statSync(f).mtimeMs));
	const distMtime = statSync(distPath).mtimeMs;
	// `#1130`：**点名**比 dist 新的源件（前 10，按新→旧）——本来只报"旧了"不说是谁 → CI 上没法查
	const newer = files.map((f) => ({ f, m: statSync(f).mtimeMs })).filter((x) => x.m > distMtime).sort((a, b) => b.m - a.m).slice(0, 10);
	return { exists: true, fresh: distMtime >= newestSrc, newestSrc, distMtime, newer };
};

export const assertFreshDist = ({ distPath = DIST_PATH, srcDir = SRC_DIR, who = '本脚本' } = {}) => {
	const st = distState({ distPath, srcDir });
	// `#1261` zero-story: no per-story product exists at all -> this assertion has no subject.
	// Return an explicit marker instead of throwing 'run build' (which would be misleading).
	if (st.noStory) return { skipped: true, reason: 'zero-story mode (#1261)' };
	if (!st.exists) {
		// `#1315`：**报文必须自带对象** —— 原先只报“找不到”，✗ 不报“**找的是哪个**” ⇒ 事后无法定案
		// （实测撞过一次：栈指到这里，但报文没打 `distPath`，于是“查的是仓内还是外根”判不出来 ✗）。
		// 判据：“**报错要能自解释**” —— 缺“对象”那一维的读数，不能作为定案依据。
		throw new Error(`找不到产物 ${distPath ?? '(null：零故事态无逐故事产物)'}——先跑 \`npm run build\`（${who}要检查构建产物；缺产物时静默跳过＝假绿）`
			+ `\n  读数（对象）：distPath=${distPath ?? 'null'}｜srcDir=${srcDir}｜cwd=${process.cwd()}`);
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
		// `#1476`：★**报文必须自带对象** —— 与「找不到」分支（`#1315`）**同形**补齐。
		// 原状：只列 `newer[]`（**src 件**路径）⇒ ★"**哪个 dist 旧了**"读不出来 ✗
		// 实测（2026-09-26）：`SG_STORIES_DIR` 指夹具/外根 ⇒ `DIST_DIR = dirname(STORIES_DIR)/dist`
		//   ⇒ 被查的 dist **不是** `ROOT/dist` ⇒ ★缺对象读数时，读者会把"我读错对象"误判成"判据错了" ✓
		throw new Error('dist/index.html 比 src/*.twee 旧——先跑 `npm run build`（否则断言基于旧游戏，结果是假红/假绿）'
			+ `\n  读数（对象）：distPath=${distPath}｜srcDir=${srcDir}｜cwd=${process.cwd()}` + (st.newer ?? []).map((x) => `\n    · ${x.f}（${new Date(x.m).toISOString()} > dist ${new Date(st.distMtime).toISOString()}）`).join('') + writeNote);
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
	// `#1476`：与本文件的「找不到」格（`#1315`）**同形** —— 判旧报错也必须是**语义 ＋ 对象**两断言：
	// ① 说明"旧了 ＋ 给修复命令" ② ★**报文里必须出现被查的那个 `distPath`**（✗ 不只列 src 件 ✓）
	cases.push(['src 比 dist 新 → 报错并给修复命令 ＋报文自带路径（#1476）', (() => {
		try { assertFreshDist({ distPath, srcDir }); return false; } catch (e) {
			const m = String(e.message);
			return /先跑 .npm run build./.test(m) && m.includes(distPath);
		}
	})()]);
	rmSync(base, { recursive: true, force: true });
	// `#1315`：自证这格原先只match旧报文**字面**（`/找不到 dist\/index\.html/`）⇒ 报文一改就红 ✗
	// ⇒ 升级为**语义 ＋ 对象**两断言：① 报文说明“找不到产物” ② **报文里必须出现被找的那个路径**
	// （即“报错要能自解释”：缺“对象”那一维的报文不算合格 ✓）
	cases.push(['dist 缺失 → 报错（不静默跳过）＋报文自带路径', (() => {
		try { assertFreshDist({ distPath, srcDir }); return false; } catch (e) {
			const m = String(e.message);
			return /找不到产物/.test(m) && m.includes(distPath);
		}
	})()]);
	rmSync(base, { recursive: true, force: true });
	let bad = 0;
	for (const [name, ok] of cases) { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}`); }
	if (bad) { console.error(`\n✗ dist 新鲜度守卫自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ dist 新鲜度守卫自证通过（新鲜绿 / 过期红 / 缺失红）');
};
