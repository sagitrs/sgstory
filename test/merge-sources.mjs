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
	// ★ `#1519`：规则级由**顶层字段指认**（✗ 不再是 `sources[0]` 位置捷径）
	// ★★ `#1519` 阻断①的**验收格**（T 给的形）：★**嵌套真形**（`tables.json` 的真形就是嵌套 ✓）
	//   ★原实现「递归只登记容器」⇒ ★叶子 `from` 恒 `null` ⇒ ★覆盖判据**永不命中**（主靶 ✓）
	{
		const nested = [
			{ from: 'A', json: { containers: { Checks: { sites: { s1: { abil: 'str', dc: 10 } } } } } },
			{ from: 'B', json: { containers: { Checks: { sites: { s1: { dc: 99 } } } } } },
		];
		const rN = mergeSources(nested);
		t('★★**嵌套真形**：留痕的 `from` **有值**（＝A，✗ 不是 null —— 阻断①主靶 ✓）',
			rN.traces.length === 1 && rN.traces[0].from === 'A' && rN.traces[0].path === 'containers.Checks.sites.s1.dc',
			JSON.stringify(rN.traces));
		t('★★嵌套真形 ＋ 指认后 ⇒ 覆盖判据**命中**（主靶修复的验收面 ✓）',
			ruleLevelOverrides(nested, rN.traces, 'A').length === 1);
		// ★判据自纠（T 的）：「颠倒顺序结果一致」是**错的**（顺序＝优先级 ⇒ 结果本该变）
		//   ⇒ ★正确判别＝★**同数组只改指认 ⇒ 结果跟指认变** ✓
		t('★顺序语义（自纠）：**同数组、改指认** ⇒ 结果**跟指认变**',
			ruleLevelOverrides(nested, rN.traces, 'A').length === 1 && ruleLevelOverrides(nested, rN.traces, 'B').length === 0);
	}
	t('★**未指认** ⇒ **不判**（无规则级可言 ⇒ 故事覆盖共享件本就该允许 ⇒ 零破坏 ✓）',
		ruleLevelOverrides(srcs, traces).length === 0, JSON.stringify(ruleLevelOverrides(srcs, traces)));
	const ov = ruleLevelOverrides(srcs, traces, 'shared/rules.json');
	t('★**指认后**：覆盖规则级键 ⇒ **被判出**（`a` 来自 `shared/rules.json` 却被盖）', ov.length === 1 && ov[0].path === 'a', JSON.stringify(ov));
	// ★★ 阻断②（T 复现到根）：**指认拼错 ⇒ 点名红**（✗ 不许静默当"未指认" ✓）
	//   ★与"**未指认**"（合法：零破坏）**必须分开** ⇒ 下面两格正是那条界线 ✓
	t('★**拼错报文的可选项只列 `sources`**（✗ 不含 `<story:…>` —— 报文与"作者能写的东西"同界 ✓）',
		(() => { const m = (() => { try { ruleLevelOverrides(srcs, traces, 'x'); return ''; } catch (e) { return e.message; } })();
			return !/<story:/.test(m) && /shared\/rules\.json/.test(m); })(), '报文含 <story:> 或没列可选项');
	t('★★**指认拼错（不在 `sources` 里）⇒ 抛出点名**（✗ 静默失去保护 ✓）',
		(() => { try { ruleLevelOverrides(srcs, traces, 'shared/nope.json'); return ''; } catch (e) { return e.message; } })().includes('不在'),
		'未抛出');
	// ★**误报形**（`#1517` 照亮那一形）的正解：★指认**列表里真有的另一件**（如 `world`）⇒
	//   ★"故事覆盖**非规则级**的共享件" ⇒ **判据不命中**（✗ 不再假红 ✓）
	t('★**误报形正解**：指认**列表里真有的另一件**（`shared/world.json`）⇒ 覆盖**非规则级**的共享件 ⇒ **不命中**（✗ 不假红 ✓）',
		ruleLevelOverrides(srcs, traces, 'shared/world.json').length === 0);
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
	// ★ `#1486`（③ 开笔现形）：**故事级必须作为最后一层入合并** —— `sources` 只列「更不具体的层」✓
	//   实测（本会话）：漏掉它 ⇒ ★故事自己的 `tables.json` **整份丢**（`section` 变 undefined ⇒ 编译期报缺段名 ✗）
	const withSrc = expandSources({ slug: 's', data: { 'tables.json': { section: 'Game Tables', containers: { A: 1 }, sources: ['shared/x.json'] } },
		io: mkIo({ 'shared/x.json': JSON.stringify({ containers: { B: 2 }, extra: 'shared' }) }), repoRoot: '' });
	t('★故事级是**最后一层**（具体者胜）：故事自己的 `section`／`containers.A` **都在**（✗ 不被合并吞掉 ✓）',
		withSrc.data['tables.json'].section === 'Game Tables' && withSrc.data['tables.json'].containers.A === 1,
		JSON.stringify(withSrc.data['tables.json']));
	t('★共享层同时并入（`containers.B` ＋ `extra` ✓）', withSrc.data['tables.json'].containers.B === 2 && withSrc.data['tables.json'].extra === 'shared');
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
		const files2 = { 'shared/rules.json': JSON.stringify({ a: 1 }), 'shared/world.json': JSON.stringify({ a: 2 }) };
		// ★`expandSources` 签名是**单对象**（`{slug, data, io, repoRoot}`）⇒ 我把 `io`/`repoRoot` 写在**同一对象内** ✓
		const mkT = (tables) => (() => { try { expandSources({ slug: 's', data: { 'tables.json': tables }, io: mkIo(files2), repoRoot: '' }); return ''; } catch (e) { return e.message; } })();
		const ovr = mkT({ sources: ['shared/rules.json', 'shared/world.json'], ruleSource: 'shared/rules.json' });
		t('★**指认后**：覆盖规则级键 ⇒ **出声**（D5 判据③）且点名路径', /规则级/.test(ovr) && /\ba\b/.test(ovr), ovr.slice(0, 100));
		t('★**未指认** ⇒ 同一输入**不出声**（✗ 不假红 ✓）', mkT({ sources: ['shared/rules.json', 'shared/world.json'] }) === '');
		t('★★**指认拼错 ⇒ 出声**（端到端：✗ 无声明期保护就静默 ✓）', /不在/.test(mkT({ sources: ['shared/rules.json'], ruleSource: 'shared/typo.json' })));
	// 形状不符 ⇒ 出声
	const sh = (() => { try { expandSources({ slug: 's', data: { 'tables.json': { sources: ['stories/x/data/tables.json'] } }, io: mkIo({}), repoRoot: '' }); return ''; } catch (e) { return e.message; } })();
	t('★形状不符（`from` 指进故事目录）⇒ **出声**', /not-repo-level/.test(sh), sh.slice(0, 90));
}

if (bad) { console.error(`\n✗ 三源合并自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 三源合并自证通过（逐容器逐键 · 靠后者胜 · 留痕 · 覆盖规则级⇒红 · 零源=今天）');
