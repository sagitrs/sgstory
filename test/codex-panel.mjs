// `#1308`：图鉴**呈现面**格 —— 「声明了 `Codex.items` ⇒ 引擎要把它**呈现出来**」这一面。
//
// 为什么要有它：`#1308` 现场＝**声明被静默接受**（`build` rc=0、数据面已落地），但**呈现输出 0 条** ⇒
// "有数据、没面板"。判据**照契约** `docs/engine/json/tables.md` §11.1 写（✗ 不照实现里的 DOM 细节写）：
//   · 面板容器 id ＝ **`codex-panel`**（**恒在**）
//   · 空声明（未声明／为空）⇒ **面板仍在** ＋ 空态文案「图鉴还没有条目」（✗ 不是"不渲染面板"）
//     ⇒ 两种"零"（没声明 vs 没实现）**不可同形** —— 这条正是契约先行的收益。
//
// ★ `#1347`（甲·换负态构造）：**③ 的负态只动"呈现侧"一条腿** —— 声明（`Codex.items` 的键集／`clues`／`req`）
//   与条件**一字不动**，只改那条 clue 的 **`label`** ⇒ 于是三条断言**可分**：
//     ㈠ 面板仍在（✗ 与本次改动无关）㈡ **空态文案不该出现**（声明非空 ⇒ 有条目）
//     ㈢ 渲染文本＝新 label（呈现面真跟着输入变）㈣ 旧 label 不再出现
//   ✗ 原构造（**把 `Codex.items` 清空**）同时喂两条腿 ⇒ "面板／空态文案"与"条目文本在不在"**同向变动**
//     ⇒ 分不开"渲染面"与"声明面" ✗（与 `#1341` 的 ③ 同型："一个改动动了两条腿"）。
//   ★ 可复查的对照读数：把负态**改回清空声明** ⇒ ㈡「空态文案不该出现」与"另一条腿不受影响"两格**当场红** ✓
//     （本格注释此读数，✗ 不把它做成常驻开关 —— 一次性的对照，免得留死代码）
//
// 输入＝引擎侧夹具 `test/fixtures/m3-codex-panel/`（**真格式的最小形状**；Operator：用户写的故事不是测试用例）
// ⇒ 零故事态可跑。产物操作**经 runner**？本夹具暂无 runner ⇒ 本格自清三层（夹具生成物／夹具 dist／**引擎中间件**）
// 并**先验前置**（构建 rc=0）再读 —— 照"清三层"与"前置格"的既有口径。
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = join(ROOT, 'test/fixtures/m3-codex-panel');
const TABLES = join(FX, 'stories/north-room/data/tables.json');
const WORK = process.env.SG_CODEX_WORK || mkdtempSync(join(tmpdir(), 'sg-cp-'));   // `#1362`：**每跑唯一**（原先写死 `/tmp/sg-codex-panel-build` ⇒ 并发互踩 ✗）；★ 父/子进程必须同一 WORK（负态读数走子进程；子进程自 mkdtemp 会建空目录 ⇒ 假红 ✗）⇒ 靠 env 继承
// 同机两次/两格并发跑会互踩 ✗ —— 与"同进程读两次"同族，这次是"**同机两个段 ⇒ 同一个工作目录**"）
const SLUG = 'north-room';
const LABEL = '钥匙柄上刻着「北」';                       // 夹具声明的 clue label（照夹具读，✗ 不照实现读）
const ITEM = '黄铜钥匙';                        // 夹具里的条目名（照夹具读，✗ 不另立）
const NEG_LABEL = '钥匙柄上刻着「南」';                  // `#1347` 甲：负态**只改呈现侧**这一个串（✗ 不动声明结构）
// ★ 声明标记必须**唯一**：先前用道具名「黄铜钥匙」当标记 ⇒ 那是**故事正文里本来就有的词** ⇒
//   清空声明后它照样出现（实测 6 次）⇒ 得出"声明没生效"的**假读数** ✗ ⇒ 改用它下面这条 clue label（唯一）。
const EMPTY_TEXT = '图鉴还没有条目';                       // 契约 §11.1 的空态文案
const SELF = process.argv.includes('--selfcheck');
const READ_ONLY = process.argv.includes('--read-only');   // `#1308`：父进程用**子进程**读负态（免同进程 boot 缓存）
const BAK = (p) => p + '.bak-codexpanel';

let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
};

const clean = () => {
	// `#1350`：**不再清引擎中间件** `ROOT/build` —— 当初加它是为了验一个假设（已否 ✗），
	// 而它同时是**跨段共享面**（`chk-source` 也清同一个 `ROOT/build`）⇒ 并发下会互踩、读到别人的中间态 ✗。
	// 口径：本格**只清自己的**（`WORK/dist` 与夹具侧生成物）；确需清引擎中间件 ⇒ 应在**同一把锁**里做。
	rmSync(WORK, { recursive: true, force: true });
	mkdirSync(WORK, { recursive: true });
	cpSync(join(FX, 'stories'), join(WORK, 'stories'), { recursive: true });
	const dir = join(WORK, 'stories', SLUG);
	for (const f of readdirSync(dir)) {                                     // ① 夹具侧生成物
		if (/^1[5678]-.*\.twee$/.test(f) || f === '00-meta.twee') rmSync(join(dir, f), { force: true });
	}
};

const build = () => spawnSync(process.execPath, ['build.mjs'], {
	cwd: ROOT, encoding: 'utf8', timeout: 900000, env: { ...process.env, SG_STORIES_DIR: join(WORK, 'stories') },
});

/** 读两个面：产物里有没有（数据面）＋ 渲染后 DOM 里有没有（呈现面）。 */
const read = async () => {
	process.env.SG_STORIES_DIR = join(WORK, 'stories');
	const { boot } = await import('../test/boot.mjs');
	const { makeSession } = await import('../test/harness.mjs');
	const { w, settle, sleep } = await boot({ story: SLUG, random: 0.5 });
	const s = makeSession(w, { settle, sleep });
	await settle();
	const panel = w.document?.querySelector('#codex-panel');
	const inPassages = panel ? !!panel.closest('#passages') : null;
	const contained = panel ? !!w.document.body.contains(panel) : null;
	const text = panel ? String(panel.textContent ?? '') : '';
	let productHasDecl = false;
	try {
		productHasDecl = readFileSync(join(WORK, 'dist/stories', SLUG, 'index.html'), 'utf8').includes(LABEL);
	} catch { /* 读不到就是 false */ }
	// `#1308`：**两个源**的读数（判 `items()` 里 `?? Game.Codex.items` 那支是不是历史残留）
	const src = (() => {
		try {
			const f = w.Sg?.story?.codexItems;
			const viaStory = typeof f === 'function' ? f() : null;
			const viaGame = w.Game?.Codex?.items ?? null;
			return {
				hasStoryFn: typeof f === 'function',
				storyNames: viaStory ? Object.keys(viaStory) : null,
				gameNames: viaGame ? Object.keys(viaGame) : null,
			};
		} catch (e) { return { err: String(e?.message ?? e).slice(0, 60) }; }
	})();
	try { w.close(); } catch { /* 已关 */ }
	return { panel: !!panel, inPassages, contained, text, productHasDecl, src };
};

if (READ_ONLY) {
	const r = await read();
	console.log(JSON.stringify({ panel: r.panel, inPassages: r.inPassages, contained: r.contained, text: r.text,
		productHasDecl: r.productHasDecl, src: r.src }));
	process.exit(0);
}

if (!existsSync(FX)) {
	console.error(`  ○ 未判：夹具缺席（${FX}）⇒ 本格未判（对象不在 ⇒ 出声，✗ 不假装跑过）`);
	process.exit(0);
}

// ── 正态 ────────────────────────────────────────────────
clean();
const b = build();
t('前置：构建 rc=0（以夹具为故事根）', b.status === 0, String(b.status));
const pos = await read();
t('⓪ 数据面：产物里含声明（用**唯一标记**＝clue label 判定）', pos.productHasDecl);
t('① 呈现面：`#codex-panel` **在**（契约 §11.1：面板恒在）', pos.panel);
t('① 面板挂在 `#passages` **之外**（段落重渲染不会冲掉它）', pos.panel && pos.inPassages === false && pos.contained === true,
	`inPassages=${pos.inPassages} contained=${pos.contained}`);
t('② 面板含期望文本（夹具声明的 clue label）', pos.text.includes(LABEL), pos.text.slice(0, 60));

// ── ③ 能假·空声明态（去掉声明 ⇒ 面板仍在 ＋ 空态文案）──────
if (SELF) {
	console.log('  ── 能假·呈现侧：**声明一字不动**，只改「呈现侧 label」 ──');
	// ★ `#1347`（甲·换负态构造）：原构造是**把 `Codex.items` 清空** ⇒ 那个输入**同时喂两条腿**
	//   （"面板仍在/空态文案" 与 "条目文本在不在"）⇒ 两格**同向变动** ⇒ 分不开"渲染面"与"声明面" ✗
	//   （与 `#1341` 的 ③ 同型；那边也是"一个改动动了两条腿"）
	// ⇒ 现在：**声明保持为真**（`items`／`clues`／`req` 全不动），只改**呈现侧那串 label**
	//   ⇒ 可分别断言：㈠ 面板仍在 ✓（✗ 与本次改动无关）㈡ 空态文案**不该**出现（声明非空 ⇒ 有条目）
	//     ㈢ 渲染文本＝**新 label**（呈现面真跟着输入变）㈣ 旧 label 不再出现
	copyFileSync(TABLES, BAK(TABLES));
	let neg = null;
	try {
		const d = JSON.parse(readFileSync(TABLES, 'utf8'));
		// ★ 只动**呈现侧**：clue 的 `label`（声明结构／键集／`req` 一律不动 ⇒ 另一条腿不受影响）
		const it = d?.containers?.Codex?.items?.[ITEM];
		if (!it || !Array.isArray(it.clues) || !it.clues[0]) throw new Error('夹具形状变了：找不到 Codex.items[' + ITEM + '].clues[0]');
		it.clues[0].label = NEG_LABEL;
		const fs = await import('node:fs');
		fs.writeFileSync(TABLES, JSON.stringify(d, null, 2) + '\n');
		clean();
		const b2 = build();
		t('③ 前置：改 label 后仍能构建', b2.status === 0, String(b2.status));
		// ★ **输入层**断言（＋来源/时间）：先答"喂进构建的那份输入是不是我这次改的"
		const inp = (() => {
			try {
				const f = join(WORK, 'stories', SLUG, 'data/tables.json');
				const j = JSON.parse(readFileSync(f, 'utf8'));
				const st = statSync(f);
				const lab = j?.containers?.Codex?.items?.[ITEM]?.clues?.[0]?.label;
				return { label: lab, keys: Object.keys(j?.containers?.Codex?.items ?? {}), mtimeMs: st.mtimeMs };
			} catch (e) { return { err: String(e?.message ?? e).slice(0, 60) }; }
		})();
		const fresh = typeof inp?.mtimeMs === 'number' && (Date.now() - inp.mtimeMs) < 10 * 60 * 1000;
		console.log('      输入层读数：label=%s｜keys=%s｜mtime 距now=%ss｜判=%s', JSON.stringify(inp?.label ?? inp),
			JSON.stringify(inp?.keys ?? null),
			typeof inp?.mtimeMs === 'number' ? Math.round((Date.now() - inp.mtimeMs) / 1000) : '—',
			fresh ? '本次拷入（输入已生效）' : '早于本次（疑 clean 没清输入副本）');
		t('③ 前置：**输入**（WORK 副本）里 label 已是新串', inp?.label === NEG_LABEL);
		t('③ 前置·★ 另一条腿不受影响：**声明键集仍非空**（`items` 未被动过）',
			Array.isArray(inp?.keys) && inp.keys.length === 1, JSON.stringify(inp?.keys ?? inp));
		// ★ 前置断言（与 `chk-source` 同规）：**先验产物里呈现侧已换** ⇒ 才算"负态真生效"
		const prodNew = (() => {
			try { return readFileSync(join(WORK, 'dist/stories', SLUG, 'index.html'), 'utf8').includes(NEG_LABEL); }
			catch { return true; }
		})();
		t('③ 前置：产物里呈现侧**已是新串**（证明这次改动真进了构建）', prodNew === true);
		// ★ 负态读数走**子进程**：同进程二次 `boot()` 会命中进程内缓存 ⇒ 第二次读数会悄悄变成第一次的 ✗
		//（`chk-source` 已实测过同型；本格 ③ 也正是被它咬的）
		const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--read-only'],
			{ cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SG_STORIES_DIR: join(WORK, 'stories'), SG_CODEX_WORK: WORK } });
		try { neg = JSON.parse(String(child.stdout ?? '').trim().split('\n').pop()); }
		catch { neg = { panel: false, text: 'parse-failed:' + String(child.stdout ?? '').slice(0, 80) }; }
	} finally {
		copyFileSync(BAK(TABLES), TABLES);                                    // ✗ 不用 git checkout；用 cp bak
		rmSync(BAK(TABLES), { force: true });
		clean();
		build();
	}
	console.log('      两源读数（负态）：%s', JSON.stringify(neg?.src ?? null));
	t('③ 呈现侧：**面板仍在**（与本次改动无关 ⇒ 另一条腿 ✓）', neg?.panel === true);
	t('③ 呈现侧：**空态文案不该出现**（声明非空 ⇒ 有条目 ✓ —— 这正是原来分不开的那一格）',
		!String(neg?.text ?? '').includes(EMPTY_TEXT), String(neg?.text ?? '').slice(0, 60));
	t('③ 呈现侧：渲染文本＝**新 label**（呈现面真跟着输入变 ✓）', String(neg?.text ?? '').includes(NEG_LABEL));
	t('③ 呈现侧：**旧 label 不再出现**', !String(neg?.text ?? '').includes(LABEL));
}

if (bad) { console.error(`✗ codex-panel：${bad} 格红`); process.exit(1); }
console.log(`✓ codex-panel：通过${SELF ? '（含空声明能假格）' : ''}`);
