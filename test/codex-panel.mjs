// `#1308`：图鉴**呈现面**格 —— 「声明了 `Codex.items` ⇒ 引擎要把它**呈现出来**」这一面。
//
// 为什么要有它：`#1308` 现场＝**声明被静默接受**（`build` rc=0、数据面已落地），但**呈现输出 0 条** ⇒
// "有数据、没面板"。判据**照契约** `docs/engine/json/tables.md` §11.1 写（✗ 不照实现里的 DOM 细节写）：
//   · 面板容器 id ＝ **`codex-panel`**（**恒在**）
//   · 空声明（未声明／为空）⇒ **面板仍在** ＋ 空态文案「图鉴还没有条目」（✗ 不是"不渲染面板"）
//     ⇒ 两种"零"（没声明 vs 没实现）**不可同形** —— 这条正是契约先行的收益。
//
// 输入＝引擎侧夹具 `test/fixtures/m3-codex-panel/`（**真格式的最小形状**；Operator：用户写的故事不是测试用例）
// ⇒ 零故事态可跑。产物操作**经 runner**？本夹具暂无 runner ⇒ 本格自清三层（夹具生成物／夹具 dist／**引擎中间件**）
// 并**先验前置**（构建 rc=0）再读 —— 照"清三层"与"前置格"的既有口径。
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = join(ROOT, 'test/fixtures/m3-codex-panel');
const TABLES = join(FX, 'stories/north-room/data/tables.json');
const WORK = '/tmp/sg-codex-panel-build';
const SLUG = 'north-room';
const LABEL = '钥匙柄上刻着「北」';                       // 夹具声明的 clue label（照夹具读，✗ 不照实现读）
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
	rmSync(join(ROOT, 'build'), { recursive: true, force: true });          // ③ 引擎中间件
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
	console.log('  ── 能假·空声明：临时把 `Codex.items` 声明清空 ──');
	copyFileSync(TABLES, BAK(TABLES));
	let neg = null;
	try {
		const d = JSON.parse(readFileSync(TABLES, 'utf8'));
		d.containers.Codex = { items: {} };                                  // 空声明（仍在 ⇒ 是"零"而不是"无面"）
		const fs = await import('node:fs');
		fs.writeFileSync(TABLES, JSON.stringify(d, null, 2) + '\n');
		clean();
		const b2 = build();
		t('③ 前置：空声明后仍能构建', b2.status === 0, String(b2.status));
		// ★ **输入层**断言 ＋ **来源/时间**（协调席加的判别维度）：先答"喂进构建的那份输入是不是我这次的"
		//   · `WORK` 的 `tables.json` 键集应为空（输入已生效）
		//   · 且它的 mtime 应 ≈ 本次（⇒ 是这次拷进来的）⇒ 若早于本次 ⇒ `clean()` 没清 WORK 的输入副本
		const inp = (() => {
			try {
				const f = join(WORK, 'stories', SLUG, 'data/tables.json');
				const j = JSON.parse(readFileSync(f, 'utf8'));
				const st = statSync(f);
				return { keys: Object.keys(j?.containers?.Codex?.items ?? {}), mtimeMs: st.mtimeMs };
			} catch (e) { return { err: String(e?.message ?? e).slice(0, 60) }; }
		})();
		const fresh = typeof inp?.mtimeMs === 'number' && (Date.now() - inp.mtimeMs) < 10 * 60 * 1000;
		console.log('      输入层读数：keys=%s｜mtime 距now=%ss｜判=%s', JSON.stringify(inp?.keys ?? inp),
			typeof inp?.mtimeMs === 'number' ? Math.round((Date.now() - inp.mtimeMs) / 1000) : '—',
			fresh ? '本次拷入（输入已生效）' : '早于本次（疑 clean 没清输入副本）');
		t('③ 前置：**输入**（WORK 副本）里 `Codex.items` 键集为空', Array.isArray(inp?.keys) && inp.keys.length === 0);
		// ★ 前置断言（与 `chk-source` 同规）：**先验产物里已无该条目** ⇒ 才算"负态真生效"，
		//   否则读数无效（分不清"负态没进构建"与"真行为"）。
		const prodHas = (() => {
			try { return readFileSync(join(WORK, 'dist/stories', SLUG, 'index.html'), 'utf8').includes(LABEL); }
			catch { return true; }
		})();
		t('③ 前置：产物里**已无**该标记（证明空声明真进了构建）', prodHas === false);
		// ★ 负态读数走**子进程**：同进程二次 `boot()` 会命中进程内缓存 ⇒ 第二次读数会悄悄变成第一次的 ✗
		//（`chk-source` 已实测过同型；本格 ③ 也正是被它咬的）
		const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--read-only'],
			{ cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SG_STORIES_DIR: join(WORK, 'stories') } });
		try { neg = JSON.parse(String(child.stdout ?? '').trim().split('\n').pop()); }
		catch { neg = { panel: false, text: 'parse-failed:' + String(child.stdout ?? '').slice(0, 80) }; }
	} finally {
		copyFileSync(BAK(TABLES), TABLES);                                    // ✗ 不用 git checkout；用 cp bak
		rmSync(BAK(TABLES), { force: true });
		clean();
		build();
	}
	console.log('      两源读数（负态）：%s', JSON.stringify(neg?.src ?? null));
	t('③ 空声明 ⇒ **面板仍在**（与"没实现"两态可分）', neg?.panel === true);
	t('③ 空声明 ⇒ 面板含空态文案', String(neg?.text ?? '').includes(EMPTY_TEXT), String(neg?.text ?? '').slice(0, 60));
	t('③ 且期望文本**不再**出现（真的换了态）', !String(neg?.text ?? '').includes(LABEL));
}

if (bad) { console.error(`✗ codex-panel：${bad} 格红`); process.exit(1); }
console.log(`✓ codex-panel：通过${SELF ? '（含空声明能假格）' : ''}`);
