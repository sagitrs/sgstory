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
import { allSourceFiles, sourcePath } from '../scripts/module-order.mjs';
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

// 纯函数（供自证）：**跨故事隔离**（`#491` 判据 6：存档／图鉴／键命名空间）——
// 三条各自可红：① 故事键（按 slug 前缀）不得相同；② 知识面（笔记 id）不得重叠；
// ③ 产物 IFID 不得相同（SugarCube 以 IFID 作存档键 ⇒ 同源 localStorage 下 IFID 相同就会互相覆盖存档）。
export const judgeIsolation = ({ keyA, keyB, idsA, idsB, ifidA, ifidB }) => {
	const out = [];
	if (!keyA || !keyB) out.push('故事键取不到（`Sg.store.key` 或 slug 缺失）');
	else if (keyA === keyB) out.push(`两个故事的故事键相同：${keyA} ⇒ 键命名空间没隔离`);
	const overlap = [...(idsA ?? [])].filter((k) => (idsB ?? new Set()).has(k));
	if (overlap.length) out.push(`两个故事共享了笔记 id：${overlap.slice(0, 3).join(' / ')}（知识面串了）`);
	if (!ifidA || !ifidB) out.push('产物缺 IFID ⇒ 存档隔离不可判定');
	else if (ifidA === ifidB) out.push('两个故事 IFID 相同 ⇒ 同源 localStorage 下存档会互相覆盖');
	return out;
};

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
	// #491 判据 6：跨故事隔离判据的正反例
	{
		const ok = { keyA: 'sgstory.a.codex.v1', keyB: 'sgstory.b.codex.v1', idsA: new Set(['n_a']), idsB: new Set(['n_b']), ifidA: 'I1', ifidB: 'I2' };
		const cases = [
			['正例：键不同 ＋ 知识不重叠 ＋ IFID 不同 ⇒ 0 条', judgeIsolation(ok).length === 0],
			['🔴 反例：两故事故事键相同 ⇒ 报', judgeIsolation({ ...ok, keyB: ok.keyA }).length === 1],
			['🔴 反例：笔记 id 重叠 ⇒ 报', judgeIsolation({ ...ok, idsB: new Set(['n_a', 'n_b']) }).some((s) => s.includes('笔记 id'))],
			['🔴 反例：IFID 相同 ⇒ 报（存档会互相覆盖）', judgeIsolation({ ...ok, ifidB: 'I1' }).some((s) => s.includes('IFID'))],
		];
		for (const [label, cond] of cases) { if (!cond) bad++; console.log(`      ${cond ? '✓' : '✗'} 自证·${label}`); }
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
	const files = allSourceFiles();   // #458 切片B：单一权威（今天与 readdirSync('src') 同集合）
	const sources = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
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

// ⑦ 跟故事隔离（`#491` 判据 6）：用**两个真实 slug** 实测（不是合成的 `other-story`）
// `#1004` B2 ✓：两个 slug 换成仓内**现存**的（`minimal-demo` ＋ `night-ferry` ✓）——
//   本格量的是「两作用域／两 slug 互不污染」✓、**与内容面无关** ✗（`notes` 为空是**合法空集** ✓）⇒ 换样本即可 ✓。
{
	const { storyHtml } = await import('../scripts/dist-paths.mjs');
	const readIfid = (slug) => (readFileSync(storyHtml(slug), 'utf8').match(/ifid="([^"]+)"/) ?? [])[1] ?? null;
	const A = createContext({ story: 'minimal-demo' }), B = createContext({ story: 'night-ferry' });
	const obs = {
		keyA: A.window?.Sg?.store?.key?.('story', 'codex.v1') ?? null,
		keyB: B.window?.Sg?.store?.key?.('story', 'codex.v1') ?? null,
		idsA: new Set(Object.keys(A.window?.Sg?.story?.notes?.() ?? {})),
		idsB: new Set(Object.keys(B.window?.Sg?.story?.notes?.() ?? {})),
		ifidA: readIfid('minimal-demo'), ifidB: readIfid('night-ferry'),
	};
	const problems = judgeIsolation(obs);
	for (const p of problems) { bad++; console.error(`  ✗ ⑦ ${p}`); }
	console.log(`  ${problems.length ? '✗' : '✓'} ⑦ 跨故事隔离：故事键 ${obs.keyA} ≠ ${obs.keyB} ｜ 笔记 id ${obs.idsA.size} vs ${obs.idsB.size}（重叠 ${[...obs.idsA].filter((k) => obs.idsB.has(k)).length}）｜ IFID ${String(obs.ifidA).slice(0, 8)}… ≠ ${String(obs.ifidB).slice(0, 8)}…`);
}

// ⑦ 引擎侧消费点不再持有键字面量（`Sg.UI` engine）
{
	const core = readFileSync(sourcePath('10-core.twee'), 'utf8');
	t("⑦ `Sg.UI` 走 `Sg.store.key('engine','ui.v1')` 且不再持有键字面量", /Sg\.store\.key\('engine', 'ui\.v1'\)/.test(stripComments(core)) && !/["'`]sgstory\./.test(stripComments(core)));
	// ── ⛔ **退役 ＋ 声明**（`#1004` B2 ✓）：`Sg.Codex` 那一格
	//   原判据 ✓：`stories/<slug>/72-codex-ui.twee`（《574》从 `src/80-script.twee` 搬回**故事面**的那份）里键字面量已清零 ✓。
	//   ⛔ **它唯一的存在地随 `mist-forest` 一起被删** ✗（全仓 `find -name '*codex*'` 只剩 `test/codex-gating.mjs` ✓）；
	//   两存活样本的 `twee`／表里都**没有图鉴面** ✓（`minimal-demo/10-demo.twee` 写的是"本故事没有 · 它确实缺失"✓）。
	//   ⚠️ **声明** ✗：**故事侧图鉴 UI（`Sg.Codex` 的键字面量）自此无守护** ✓ —— 日后要动它 ⇒
	//   **先补一个带图鉴面的样本** ✗（**不为凑绿加样本** ✓；本轮**也不**把这一格改写成别的判据 ✗ —— 换判据是另一件事 ✓，归发起者裁 ✓）。
}

console.log(bad ? `\n✗ 存储缝门：${bad} 项` : '\n✔ 存储缝门通过（作用域 · 隔离 · fail-loud · 幂等迁移 · 单一落点 · 身份一致）');
process.exit(bad ? 1 : 0);
