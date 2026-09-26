// `#1485` 自证：**装载层三源的合并器**（纯函数 ＋ 主读路的展开）—— 引擎侧 · fixture 驱动
//
// 判据（照票面）：① 被引件缺 ⇒ 出声 ② 覆盖 ⇒ **记 traces**（✗ 静默）③ ★**覆盖"规则级"键 ⇒ 红**（D5）
// ★"零源＝今天"：`sources` 缺省 ⇒ 数据**原样**（逐字节同）✓
import { mergeSources, ruleLevelOverrides, sourcesShapeProblems } from '../editor/lib/core/merge-sources.mjs';
import { expandSources } from '../editor/lib/core/story.mjs';
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

// ── ① 纯函数：逐容器逐键 ＋ 靠后者胜 ＋ 留痕 ──────────────────────────────
{
	const { json, traces } = mergeSources([
		{ from: 'shared/rules.json', json: { a: 1, nest: { x: 1, y: 2 }, deep: { k: { p: 1 } } } },
		{ from: 'shared/world.json', json: { b: 2, nest: { y: 9 }, deep: { k: { q: 2 } } } },
		{ from: 'stories/s/data/tables.json', json: { a: 7, nest: { z: 3 } } },
	]);
	t('★逐容器逐键：三层合并且**靠后者胜**', json.a === 7 && json.b === 2, JSON.stringify(json));
	t('★深合并（✗ 不整块替换）：`nest` 三层子键都在', json.nest.x === 1 && json.nest.y === 9 && json.nest.z === 3, JSON.stringify(json.nest));
	t('★深两层的子键也在', json.deep.k.p === 1 && json.deep.k.q === 2, JSON.stringify(json.deep));
	t('★**留痕**：覆盖各记一条（`a`／`nest.y`）', traces.length === 2 && traces.some((x) => x.path === 'a'), JSON.stringify(traces.map((x) => x.path)));
	t('★留痕含**来源对**（from ⇒ to）＋ 两层值', (() => {
		const a = traces.find((x) => x.path === 'a');
		return a && a.from === 'shared/rules.json' && a.to === 'stories/s/data/tables.json' && a.over === 1 && a.by === 7;
	})(), JSON.stringify(traces));
	t('★**数组整块替换**（✗ 不逐项合）', (() => {
		const r = mergeSources([{ from: 'x', json: { L: [1, 2] } }, { from: 'y', json: { L: [9] } }]);
		return JSON.stringify(r.json.L) === '[9]';
	})());
}

// ── ② ★覆盖"规则级"键 ⇒ 红（规则级＝列表**最前**那件）──────────────────────
{
	const srcs = [{ from: 'shared/rules.json', json: { a: 1 } }, { from: 'shared/world.json', json: { a: 2 } }];
	const { traces } = mergeSources(srcs);
	const ov = ruleLevelOverrides(srcs, traces);
	t('★覆盖规则级键 ⇒ **被判出**（`a` 来自 `shared/rules.json` 却被盖）', ov.length === 1 && ov[0].path === 'a', JSON.stringify(ov));
	t('★反向：世界级盖世界级 ⇒ **不算**覆盖规则级', (() => {
		const s2 = [{ from: 'shared/rules.json', json: { z: 1 } }, { from: 'shared/w1.json', json: { a: 1 } }, { from: 'shared/w2.json', json: { a: 2 } }];
		const r2 = mergeSources(s2);
		return ruleLevelOverrides(s2, r2.traces).length === 0;
	})());
}

// ── ③ 形状：`from` 必须**仓级**（✗ 不许指进故事目录）──────────────────────
{
	t('★形状：`from` 指进 `stories/` ⇒ **点名**', sourcesShapeProblems(['stories/s/data/tables.json']).some((x) => x.code === 'not-repo-level'));
	t('★形状（定名后）：**非字符串项** ⇒ 点名（✗ 不认 `{from}` 对象形 —— 两形并存 ✗）',
		sourcesShapeProblems([42]).some((x) => x.code === 'bad-entry') && sourcesShapeProblems([{ from: 'shared/x.json' }]).some((x) => x.code === 'bad-entry'));
	t('★形状：**空数组** ⇒ 点名（✗ 静默当"零源" ✓）', sourcesShapeProblems([]).some((x) => x.code === 'empty-array'));
	t('★形状：**仓级字符串** ⇒ 绿（正例）', sourcesShapeProblems(['shared/a.json', 'shared/b.json']).length === 0);
	t('形状：非数组 ⇒ 点名', sourcesShapeProblems({}).some((x) => x.code === 'not-array'));
	t('★形状：缺省（`null`/`undefined`）⇒ **绿**（零源＝今天 ✓）', sourcesShapeProblems(null).length === 0 && sourcesShapeProblems(undefined).length === 0);
}

// ── ④ 主读路的展开：零源 ⇒ **原样** ＋ 被引件缺 ⇒ 出声 ＋ 覆盖规则级 ⇒ 出声 ──
{
	const mkIo = (files) => ({ readText: (p) => { if (!(p in files)) throw new Error('ENOENT: ' + p); return files[p]; }, exists: (p) => p in files });
	const base = { 'tables.json': { containers: {}, merges: [] }, 'rules.json': { rows: [] } };
	// ★零源 ⇒ 今天（原样返回同一对象）
	const zero = expandSources({ slug: 's', data: base, io: mkIo({}), repoRoot: '' });
	t('★零源 ⇒ **数据原样**（✗ 不合并、✗ 不报错 —— "零源＝今天" ✓）', zero.data === base && zero.traces.length === 0);
	// 被引件缺 ⇒ 出声
	const miss = (() => { try { expandSources({ slug: 's', data: { 'tables.json': { sources: ['shared/nope.json'] } }, io: mkIo({}), repoRoot: '' }); return ''; } catch (e) { return e.message; } })();
	t('★被引件缺 ⇒ **出声**（句里点名 `from`）', /read不到|读不到/.test(miss) && /shared\/nope\.json/.test(miss), miss.slice(0, 90));
	// 正常合并 ＋ 覆盖规则级 ⇒ 出声
	const files = { 'shared/rules.json': JSON.stringify({ a: 1, keep: 'r' }), 'shared/world.json': JSON.stringify({ b: 2 }) };
	const rulesObj = { rows: [] };
	const input = { 'tables.json': { sources: ['shared/rules.json', 'shared/world.json'] }, 'rules.json': rulesObj };
	const ok = expandSources({ slug: 's', data: input, io: mkIo(files), repoRoot: '' });
	t('★正常三源 ⇒ 合并入 `tables.json`（★其余数据面**同一对象** ⇒ 不动 ✓）', ok.data['tables.json'].a === 1 && ok.data['tables.json'].b === 2 && ok.data['rules.json'] === rulesObj && ok.data !== input, JSON.stringify(ok.data['tables.json']));
	const ovr = (() => { try { expandSources({ slug: 's', data: { 'tables.json': { sources: ['shared/rules.json', 'shared/world.json'] } }, io: mkIo({ 'shared/rules.json': JSON.stringify({ a: 1 }), 'shared/world.json': JSON.stringify({ a: 2 }) }), repoRoot: '' }); return ''; } catch (e) { return e.message; } })();
	t('★**覆盖规则级键 ⇒ 出声**（D5 判据③）且点名路径', /规则级/.test(ovr) && /\ba\b/.test(ovr), ovr.slice(0, 100));
	// 形状不符 ⇒ 出声
	const sh = (() => { try { expandSources({ slug: 's', data: { 'tables.json': { sources: ['stories/x/data/tables.json'] } }, io: mkIo({}), repoRoot: '' }); return ''; } catch (e) { return e.message; } })();
	t('★形状不符（`from` 指进故事目录）⇒ **出声**', /not-repo-level/.test(sh), sh.slice(0, 90));
}

if (bad) { console.error(`\n✗ 三源合并自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 三源合并自证通过（逐容器逐键 · 靠后者胜 · 留痕 · 覆盖规则级⇒红 · 零源=今天）');
