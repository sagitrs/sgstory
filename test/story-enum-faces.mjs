// `#1257` 判据：**故事枚举两个面必须一致**（`storySlugs()` ↔ `storyJsonFiles()`）。
//
// 背景：两面对"目录软链"的口径相反 ⇒ 同一棵树上给出不同的故事集合 ⇒ 下游
// `checkRegistration` 会判"ORDER 里的 `stories/<slug>/…` 不存在"（而 `existsSync` 为真）——
// 一条自相矛盾的假红（`#1256` 出仓断点试验实测）。
//
// 它在什么输入下会红：
//   ① 有人把 `storyJsonFiles()` 的递归判据改回 `e.isDirectory()`（不跟随软链）⇒ 第 2、3 格红；
//   ② 有人把 `storySlugs()` 改成"不跟随软链"而**没同步**另一面 ⇒ 第 1 格红；
//   ③ 有人让"整体软链故事根"失效 ⇒ 第 3 格红。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let bad = 0, n = 0;
const t = (label, ok, extra = '') => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}${ok || !extra ? '' : ` —— ${extra}`}`); };

/** 造一个故事根：`real/` 是真故事目录（含清单 ＋ 一个 json），`root/` 里放**软链**。 */
const mkRoot = () => {
	const base = mkdtempSync(join(tmpdir(), 'sg-1257-'));
	const real = join(base, 'real-s');
	mkdirSync(join(real, 'data'), { recursive: true });
	writeFileSync(join(real, '00-story.json'), JSON.stringify({ slug: 'real-s', title: 'x', audience: 'internal', entry: '开场', gates: [], files: [] }));
	writeFileSync(join(real, 'data', 'tables.json'), JSON.stringify({ section: 'S', containers: {}, merges: [] }));
	const root = join(base, 'root');
	mkdirSync(root, { recursive: true });
	symlinkSync(real, join(root, 'link-s'));            // 目录软链（本次的核心输入）
	return { base, root, real };
};

/** 在子进程里、以给定故事根跑两面，返回两面结果（比较必须在**同一个输入**下做）。 */
const facesOf = (dir) => {
	const code = `import { storySlugs } from './scripts/dist-paths.mjs';
import { storyJsonFiles } from './scripts/module-order.mjs';
import { join } from 'node:path';
const slugs = storySlugs();
const jsons = storyJsonFiles().filter((f) => /\\/00-story\\.json$/.test(f));
console.log(JSON.stringify({ slugs, jsons }));`;
	const r = spawnSync('node', ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SG_STORIES_DIR: dir } });
	const line = (r.stdout || '').trim().split('\n').pop();
	try { return JSON.parse(line); } catch { return { slugs: [], jsons: [], err: (r.stderr || '').slice(-200) }; }
};

const { base, root } = mkRoot();
try {
	const f = facesOf(root);
	const slugSet = new Set(f.slugs);
	const fromJson = new Set(f.jsons.map((p) => p.split('/').filter((x) => x && x !== 'stories')[0]));

	// ① 目录软链：两面都**看得见**该故事（跟随口径一致）
	t('① 目录软链的故事：`storySlugs()` 看得见（跟随软链）', slugSet.has('link-s'), JSON.stringify(f.slugs));
	t('① 目录软链的故事：`storyJsonFiles()` **也**看得见（同口径）', f.jsons.some((p) => p.includes('link-s/')), JSON.stringify(f.jsons));

	// ② ★ 判据本体：**两面给出的故事集合必须相同**
	t('② 两面故事集合**相等**（`storySlugs()` ↔ `storyJsonFiles()`）',
		slugSet.size === fromJson.size && [...slugSet].every((s) => fromJson.has(s)),
		`slugs=${JSON.stringify([...slugSet])} json=${JSON.stringify([...fromJson])}`);

	// ③ 整体根为软链（`SG_STORIES_DIR` 本身是软链 ⇒ 两面仍一致）
	const whole = join(base, 'root-link');
	symlinkSync(root, whole);
	const g = facesOf(whole);
	const gSet = new Set(g.slugs);
	const gJson = new Set(g.jsons.map((p) => p.split('/').filter((x) => x && x !== 'stories')[0]));
	t('③ 故事根**整体**为软链 ⇒ 两面仍相等', gSet.size === gJson.size && [...gSet].every((s) => gJson.has(s)),
		`slugs=${JSON.stringify([...gSet])} json=${JSON.stringify([...gJson])}`);

	// ④ 反向格：**普通目录**（非软链）行为不变（不因本次改动而改变既有口径）
	const plain = mkdtempSync(join(tmpdir(), 'sg-plain-'));
	mkdirSync(join(plain, 'p-s'), { recursive: true });
	writeFileSync(join(plain, 'p-s', '00-story.json'), JSON.stringify({ slug: 'p-s', title: 'x', audience: 'internal', entry: '开场', gates: [], files: [] }));
	const h = facesOf(plain);
	t('④ 反向格：普通目录 ⇒ 两面相等且都看得见（既有口径不变）',
		h.slugs.includes('p-s') && h.jsons.some((p) => p.includes('p-s/')), JSON.stringify(h));
	rmSync(plain, { recursive: true, force: true });

	// ⑤ 引擎仓不受影响：仓内（零故事）两面都为空且相等
	const inrepo = spawnSync('node', ['--input-type=module', '-e',
		`import { storySlugs } from './scripts/dist-paths.mjs'; import { storyJsonFiles } from './scripts/module-order.mjs';
		 console.log(JSON.stringify({ slugs: storySlugs(), jsons: storyJsonFiles() }));`],
		{ cwd: ROOT, encoding: 'utf8', env: { ...process.env, SG_STORIES_DIR: '' } });
	const ir = JSON.parse((inrepo.stdout || '{}').trim().split('\n').pop() || '{}');
	t('⑤ 仓内（零故事）⇒ 两面同为 0（不因本次改动而变）', (ir.slugs || []).length === 0 && (ir.jsons || []).length === 0, JSON.stringify(ir));
} finally {
	rmSync(base, { recursive: true, force: true });
}

console.log(bad ? `\n✗ story-enum-faces：${bad}/${n} 例失败` : `\n✔ story-enum-faces：${n} 例全部通过`);
process.exit(bad ? 1 : 0);
