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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = join(ROOT, 'test/fixtures/m3-codex-panel');
const TABLES = join(FX, 'stories/north-room/data/tables.json');
const WORK = '/tmp/sg-codex-panel-build';
const SLUG = 'north-room';
const LABEL = '钥匙柄上刻着「北」';                       // 夹具声明的 clue label（照夹具读，✗ 不照实现读）
const EMPTY_TEXT = '图鉴还没有条目';                       // 契约 §11.1 的空态文案
const SELF = process.argv.includes('--selfcheck');
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
		productHasDecl = readFileSync(join(WORK, 'dist/stories', SLUG, 'index.html'), 'utf8').includes('黄铜钥匙');
	} catch { /* 读不到就是 false */ }
	try { w.close(); } catch { /* 已关 */ }
	return { panel: !!panel, inPassages, contained, text, productHasDecl };
};

if (!existsSync(FX)) {
	console.error(`  ○ 未判：夹具缺席（${FX}）⇒ 本格未判（对象不在 ⇒ 出声，✗ 不假装跑过）`);
	process.exit(0);
}

// ── 正态 ────────────────────────────────────────────────
clean();
const b = build();
t('前置：构建 rc=0（以夹具为故事根）', b.status === 0, String(b.status));
const pos = await read();
t('⓪ 数据面：产物里含声明（数据已落地）', pos.productHasDecl);
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
		neg = await read();
	} finally {
		copyFileSync(BAK(TABLES), TABLES);                                    // ✗ 不用 git checkout；用 cp bak
		rmSync(BAK(TABLES), { force: true });
		clean();
		build();
	}
	t('③ 空声明 ⇒ **面板仍在**（与"没实现"两态可分）', neg?.panel === true);
	t('③ 空声明 ⇒ 面板含空态文案', String(neg?.text ?? '').includes(EMPTY_TEXT), String(neg?.text ?? '').slice(0, 60));
	t('③ 且期望文本**不再**出现（真的换了态）', !String(neg?.text ?? '').includes(LABEL));
}

if (bad) { console.error(`✗ codex-panel：${bad} 格红`); process.exit(1); }
console.log(`✓ codex-panel：通过${SELF ? '（含空声明能假格）' : ''}`);
