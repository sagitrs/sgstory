// 存储缝门（#462 / 伞 #441-B）：`localStorage` 的**键构造只有一处**，且「引擎键不隔离、故事键按 slug 隔离」。
//
// 为什么需要它：多故事下「少加一次前缀」＝两个故事互相污染存档/图鉴——而这类错**不会报错**，
// 只会让玩家在某天发现进度串了。所以把口径钉成门：
//   ① 作用域语义：engine ⇒ 不加前缀（键名与旧档一致，无需迁移）；story ⇒ `sgstory.<slug>.<name>`
//   ② **隔离**：同一 name 在两个 slug 下必须是**不同键**（正例）＋ 换 slug 后读不到对方的键（反例保护）
//   ③ 缺身份 **fail-loud**：没有 `Sg.storyId.slug` 却索要 story 键 ⇒ 明确报错（不许静默退化成裸键）
//   ④ 老键**幂等迁移**：`sgstory.codex.v1` → 新键；跑第二次不变；新键已在场 ⇒ 不覆盖旧值
//   ⑤ **单一落点**：`src/**` 里 `sgstory.` 字面量只允许出现在 `05-store.twee`
//   ⑥ **身份一致性**：`Sg.storyId.slug` 必须与 `stories/<slug>/00-story.json` 的 slug 一致（防两处漂移）
//
// 用法：node test/store-keys.mjs [--selftest]（**无 jsdom**：直接给 vm 上下文挂一个 localStorage stub）
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createContext } from '../scripts/audit/context.mjs';

const SELFTEST = process.argv.includes('--selftest');
const STORE_FILE = '05-store.twee';

// 纯函数（供自证）：剥注释（`/% … %/` 块 ＋ 行内 `//`（`://` 不算））——注释里**提到**键名不算字面量
// （本仓已有同款口径：`literals.mjs` 的 `blankComments`）
export const stripComments = (s) =>
	String(s).replace(/\/%[\s\S]*?%\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(?<!:)\/\/[^\n]*/g, '');
// 纯函数（供自证）：`{文件: 源码}` → 除 store 外还写着 `sgstory.` 键字面量的文件
export const findKeyLiterals = (sources, allow = STORE_FILE) =>
	Object.entries(sources)
		.filter(([f]) => !f.endsWith(allow))
		.filter(([, src]) => /["'`]sgstory\./.test(stripComments(src)))
		.map(([f]) => f);

// 纯函数（供自证）：内存 localStorage stub（node 侧无浏览器）
export const fakeLS = (init = {}) => {
	const m = new Map(Object.entries(init));
	return {
		getItem: (k) => (m.has(k) ? m.get(k) : null),
		setItem: (k, v) => { m.set(k, String(v)); },
		removeItem: (k) => { m.delete(k); },
		keys: () => [...m.keys()].sort(),
		dump: () => Object.fromEntries(m),
	};
};

if (SELFTEST) {
	console.log('══ 存储缝门 · 自证 ══');
	const cases = [
		['正例：只有 store 文件写字面量', { '05-store.twee': "key() { return 'sgstory.x' }", '10-core.twee': 'x' }, 0],
		['反例：别的 src 文件写 `sgstory.` 字面量 → 必须检出', { '05-store.twee': "'sgstory.x'", '80-script.twee': "const K = 'sgstory.codex.v1'" }, 1],
		['正例：注释里的提及不算（剥 `/% %/` 后判）', { '05-store.twee': "'sgstory.x'", '80-script.twee': '/% 上游是 sgstory.codex.v1 %/' }, 0],
	];
	let bad = 0;
	for (const [label, src, want] of cases) {
		const got = findKeyLiterals(src).length;
		const ok = got === want;
		console.log(`  ${ok ? '✓' : '✗'} ${label}：检出 ${got}（期望 ${want}）`);
		if (!ok) bad++;
	}
	// stub 自证：map 语义与 localStorage 一致（缺失键返回 null、remove 后不残留）
	{
		const ls = fakeLS({ a: '1' });
		ls.removeItem('a');
		const ok = ls.getItem('a') === null && ls.getItem('zzz') === null && ls.keys().length === 0;
		console.log(`  ${ok ? '✓' : '✗'} 自证·fakeLS 与 localStorage 同语义（缺失 ⇒ null；remove 不残留）`);
		if (!ok) bad++;
	}
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（字面量单一落点识别 ＋ stub 语义）');
}

const ctx = createContext();
const { Sg } = ctx;
const ls = fakeLS();
ctx.window.localStorage = ls;   // 注入 stub（node 侧没有浏览器存储）
let bad = 0;
const t = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}`); else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); } };

console.log('\n══ 存储缝门（#462：键构造单一落点 · 两作用域 · 幂等迁移）══');
t('`Sg.store` 已在 node 里可调用', !!Sg?.store && typeof Sg.store.key === 'function');

// ① 作用域语义
const slug = Sg.storyId?.slug ?? null;
t('① 故事身份已注入（`Sg.storyId.slug`）', !!slug, String(slug));
t('① engine 键**不加前缀**（`sgstory.ui.v1`，与旧档同名 ⇒ 无需迁移）', Sg.store.key('engine', 'ui.v1') === 'sgstory.ui.v1', Sg.store.key('engine', 'ui'));
t('① story 键按 slug 加前缀', Sg.store.key('story', 'codex.v1') === `sgstory.${slug}.codex.v1`, Sg.store.key('story', 'codex.v1'));
t('① 未知 scope ⇒ 报错（不许静默当 engine 处理）', (() => { try { Sg.store.key('ui', 'x'); return false; } catch { return true; } })());

// ② 隔离（正例 ＋ 反例保护）
{
	const a = Sg.store.key('story', 'codex.v1');
	const saved = Sg.storyId.slug;
	Sg.storyId.slug = 'other-story';
	const b = Sg.store.key('story', 'codex.v1');
	Sg.storyId.slug = saved;
	t('② 同一 name 在两个 slug 下是**不同键**（隔离成立）', a !== b, `${a} vs ${b}`);
	Sg.store.write('story', 'codex.v1', { clues: { 日记: true } });
	const rawA = ls.getItem(a);
	Sg.storyId.slug = 'other-story';
	const otherRaw = Sg.store.read('story', 'codex.v1');
	Sg.storyId.slug = saved;
	t('② 换 slug 后读不到对方的值（互不污染）', rawA != null && otherRaw === null, JSON.stringify({ rawA: rawA?.slice(0, 20), otherRaw }));
	ls.removeItem(a);
}

// ③ 缺身份 fail-loud
{
	const saved = Sg.storyId.slug;
	Sg.storyId.slug = null;
	let threw = '';
	try { Sg.store.key('story', 'codex.v1'); } catch (e) { threw = String(e.message); }
	Sg.storyId.slug = saved;
	t('③ 缺 slug 却索要 story 键 ⇒ **明确报错**（不静默退化成裸键）', threw.includes('故事身份未注入'), threw || '（没有报错）');
}

// ④ 老键幂等迁移
{
	const oldKey = Sg.store.LEGACY['codex.v1'];
	const newKey = Sg.store.key('story', 'codex.v1');
	ls.removeItem(newKey);
	ls.setItem(oldKey, JSON.stringify({ clues: {}, endings: ['送星归位'], finals: ['送星归位'] }));
	Sg.store._migratedFor = null;
	const r1 = Sg.store.migrate({ force: true });
	t('④ 首次迁移：旧键 → 新键 ＋ 删旧键', r1.moved.includes('codex.v1') && ls.getItem(newKey) != null && ls.getItem(oldKey) === null,
		JSON.stringify({ moved: r1.moved, old: ls.getItem(oldKey), neo: !!ls.getItem(newKey) }));
	const snapshot = JSON.stringify(ls.dump());
	const r2 = Sg.store.migrate({ force: true });
	t('④ **幂等**：跑第二次不改任何键（结果也报 skipped）', r2.moved.length === 0 && JSON.stringify(ls.dump()) === snapshot, JSON.stringify(r2));
	// 新键已在场 ⇒ 不许被旧值覆盖
	ls.setItem(oldKey, JSON.stringify({ clues: { 旧: true }, endings: [], finals: [] }));
	const r3 = Sg.store.migrate({ force: true });
	const kept = JSON.parse(ls.getItem(newKey));
	t('④ 新键已在场 ⇒ **不覆盖**（旧值留在旧键、报 skipped）', r3.moved.length === 0 && r3.skipped.includes('codex.v1') && !kept.clues?.旧, JSON.stringify({ r3, kept }));
	ls.removeItem(oldKey);
	// 兜底读：迁移尚未发生 + 外部刚种入旧键 ⇒ `rawWithLegacy` 能读到（`test/scenarios.mjs` 就是这种用法）
	ls.removeItem(newKey);
	ls.setItem(oldKey, JSON.stringify({ clues: {}, endings: ['X'], finals: ['X'] }));
	t('④ `rawWithLegacy` 先迁移再兜底读（老档不丢）', Sg.store.rawWithLegacy('codex.v1') != null && ls.getItem(newKey) != null,
		JSON.stringify({ raw: !!Sg.store.rawWithLegacy('codex.v1'), newKey: !!ls.getItem(newKey) }));
	ls.removeItem(oldKey); ls.removeItem(newKey);
}

// ⑤ 单一落点（`src/**` 里 `sgstory.` 只允许出现在 store）
{
	const files = readdirSync('src').filter((f) => f.endsWith('.twee'));
	const sources = Object.fromEntries(files.map((f) => [f, readFileSync('src/' + f, 'utf8')]));
	const offenders = findKeyLiterals(sources);
	t('⑤ `src/**` 的 `sgstory.` 键字面量只出现在 `05-store.twee`', offenders.length === 0, offenders.join(' '));
}

// ⑥ 身份一致性（`Sg.storyId.slug` ↔ 故事清单）
{
	const dir = `stories/${slug}`;
	const manifest = `${dir}/00-story.json`;
	const ok = existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).slug === slug;
	t('⑥ `Sg.storyId.slug` 与 `stories/<slug>/00-story.json` 一致（防两处漂移）', ok, manifest);
}

// ⑦ 两个消费点都不再持有键字面量（`Sg.UI` engine ／ `Sg.Codex` story）
{
	const core = readFileSync('src/10-core.twee', 'utf8');
	const script = readFileSync('src/80-script.twee', 'utf8');
	t("⑦ `Sg.UI` 走 `Sg.store.key('engine','ui.v1')` 且不再持有键字面量", /Sg\.store\.key\('engine', 'ui\.v1'\)/.test(stripComments(core)) && !/["'`]sgstory\./.test(stripComments(core)));
	t('⑦ `Sg.Codex` 走 `Sg.store`（键字面量已清零、老键名只在 store 里）', /Sg\.store\.(key|rawWithLegacy)/.test(stripComments(script)) && !/["'`]sgstory\./.test(stripComments(script)));
}

console.log(bad ? `\n✗ 存储缝门：${bad} 项` : '\n✔ 存储缝门通过（作用域 · 隔离 · fail-loud · 幂等迁移 · 单一落点 · 身份一致）');
process.exit(bad ? 1 : 0);
