// 故事编译器（`#762` P0 · 伞 `#761` 的 D2）：**故事 JSON 包 ⇒ twee**
//
// 谁是源、谁是产物：
//   `stories/<slug>/data/*.json` 是**源**；生成的 twee 是**产物**（带 `@generated` 标记 ⇒ K4 判据）。
// 本文件是 P0 的最小实现：只生成**声明面**（`Game Tables`）与**接入契约**（`StoryBindings`）两段；
//   条件表（`17-rules.twee`）与散文段落留到下一步（设计稿 §3 的边界：结构进 JSON、文本留文本）。
//
// 用法：
//   node editor/compile-story.mjs <slug> [--out=<dir>]     # 默认写到 build/generated/<slug>/
//   幂等：同一份 data/ 连跑两次，产物逐字节相同（P0 验收判据之一）。
//
// 为什么先做这件事：UI 不是难点，**schema 立不立得住**才是。本编译器就是那个证伪点——
//   它若能把手写版**逐 token 复现**（`editor/equiv.mjs` 的 L1/L3），数据化这条路就走得通。
// `#794` P1①：产物写进**故事包内**时走 core 的唯一写路（`writeStoryPackage` 的 twee 口 ✓）；
// 写到包外（`build/generated/` ✓、`/tmp/…` ✓）则走宿主 helper ✓ —— 壳里两种都**不出现 `node:fs` 原语** ✓。
import { readText, writeText, mkdirp, exists } from './lib/host/fs.mjs';
import { writeStoryPackage } from './lib/core/story.mjs';
const NODE_IO = { readText, writeText, mkdirp, exists };
import { join, dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 标识符链白名单：`Sg.story.mechanics()?.pools` / `Game.Checks.sites` 这类**只由标识符、`.`、`?.`、`()` 组成**的串。
 *  为什么必须校验（实测的绕法）：这些字段是**原样拼进产物**的 —— 数据里写 `a;alert(1)//` 就能把任意 JS 注进去。
 *  ⇒ 不合格**当场抛错**（fail-loud），绝不放行。 */
// 发射面（助手层 ＋ 类型表 ＋ emit×3 ＋ `compileStory`）已搬到 `editor/lib/core/emit.mjs` ✓（纯函数、无宿主依赖）。
import { assertChain, escTemplate, guardChain, GLOBAL_ROOTS, KINDS, jsStringInner, fallbackExpr, jsString, jsKey, literal, inlineLiteral, emitRules, emitTables, emitContract, compileStory } from './lib/core/emit.mjs';
export { assertChain, escTemplate, guardChain, GLOBAL_ROOTS, KINDS, jsStringInner, fallbackExpr, jsString, jsKey, literal, inlineLiteral, emitRules, emitTables, emitContract, compileStory };

const selftest = () => {
	let bad = 0;
	const t = (label, ok, got = '') => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}${ok ? '' : `\n    实得：${got}`}`); };
	/** emit ⇒ 丢进 vm ⇒ **断言行为**。
	 *  为什么不能只断言"产物文本包含某串"（审查实测的绕法）：把 `if (!v) throw …` 改成 `if (false) throw …`
	 *  —— 语义废掉、文本仍在 ⇒ 文本式自证照旧全绿 ＝ **摆设**。所以这里一律**跑起来看行为**。 */
	const build = (members, { game = {}, pre = '' } = {}) => {
		const src = emitContract({ members: members.map((m, i) => ({ name: m.name ?? `f${i}`, ...m })) });
		// 沙箱要**像浏览器**：`window` 就是全局对象 ⇒ `window.Sg = {}` 之后裸 `Sg` 也能解析
		//（生成物里两种根都合法：`window.Sg.story.mechanics()` 与 `Sg.story.mechanics()`）
		const sandbox = { Game: game };
		sandbox.window = sandbox;
		vm.createContext(sandbox);
		vm.runInContext(`window.Sg ??= {};\n${src}\n${pre}`, sandbox);
		return sandbox.window.Sg.story;
	};
	const call = (fn, ...args) => { try { return { ok: JSON.stringify(fn(...args)) }; } catch (e) { return { threw: String(e?.message ?? e) }; } };

	// ── `lookup`：命中回值 / 缺键回默认 / `required` 缺键**必抛** ──
	const game = { Checks: { sites: { 门厅: { dc: 10 } } } };
	const L = build([{ name: 'checkSite', kind: 'lookup', from: 'Game.Checks.sites', key: 'name', default: null }], { game });
	t('lookup：键在 ⇒ 回值', call(L.checkSite, '门厅').ok === '{"dc":10}', JSON.stringify(call(L.checkSite, '门厅')));
	t('lookup：键不在 ⇒ 回 default', call(L.checkSite, '无').ok === 'null', JSON.stringify(call(L.checkSite, '无')));
	const R = build([{ name: 'checkSite', kind: 'lookup', from: 'Game.Checks.sites', key: 'name', required: true, error: 'Sg.story.checkSite：位点「{key}」未登记（结构缺失必须报错，#441-E）' }], { game });
	t('lookup＋required：键在 ⇒ 回值', call(R.checkSite, '门厅').ok === '{"dc":10}', JSON.stringify(call(R.checkSite, '门厅')));
	t('lookup＋required：键不在 ⇒ **抛错**且报文含键名', (call(R.checkSite, '无').threw ?? '').includes('「无」'), JSON.stringify(call(R.checkSite, '无')));
	t('lookup：`Sg.` 根原样保留 ＋ 接缝路径可取到', (() => {
		const S = build([{ name: 'pool', kind: 'lookup', from: 'Sg.story.mechanics()?.pools', key: 'id', default: [] }], { pre: 'window.Sg.story.mechanics = () => ({ pools: { w1: ["a"] } });' });
		return call(S.pool, 'w1').ok === '["a"]' && call(S.pool, '无').ok === '[]';
	})());

	// ── `lookup-field`：有面有字段 ⇒ 取字段；缺面/缺字段 ⇒ 兜底 ──
	const A = build([{ name: 'actionLabel', kind: 'lookup-field', from: 'Sg.story.mechanics()?.actions', key: 'id', field: 'label', fallback: { kind: 'string-identity' } }], { pre: 'window.Sg.story.mechanics = () => ({ actions: { 挥剑: { label: "劈过去", dmg: "1d6" } } });' });
	t('lookup-field：有面有字段 ⇒ 取字段', call(A.actionLabel, '挥剑').ok === '"劈过去"', JSON.stringify(call(A.actionLabel, '挥剑')));
	t('lookup-field：有面但缺字段 ⇒ 兜底', call(A.actionLabel, '别动').ok === '"别动"', JSON.stringify(call(A.actionLabel, '别动')));
	t('lookup-field：**接缝方法本身缺失** ⇒ 兜底（可选调用，不许 `is not a function`）', (() => {
		const X = build([{ name: 'label', kind: 'lookup-field', from: 'Sg.story.mechanics()?.actions', key: 'id', field: 'label', fallback: { kind: 'string-identity' } }], {});
		return call(X.label, 'z').ok === '"z"';
	})());
	t('lookup-field：整块面缺 ⇒ 兜底（不许崩）', call(build([{ name: 'label', kind: 'lookup-field', from: 'Sg.story.mechanics()?.actions', key: 'id', field: 'label', fallback: { kind: 'string-identity' } }], {}).label, 'z').ok === '"z"');

	// ── `bool-exists` ──
	const B1 = build([{ name: 'hasChargen', kind: 'bool-exists', path: 'Game.Chargen' }], { game: { Chargen: {} } });
	const B2 = build([{ name: 'hasChargen', kind: 'bool-exists', path: 'Game.Chargen' }], { game: {} });
	t('bool-exists：表在 ⇒ true', call(B1.hasChargen).ok === 'true', JSON.stringify(call(B1.hasChargen)));
	t('bool-exists：表不在 ⇒ false', call(B2.hasChargen).ok === 'false', JSON.stringify(call(B2.hasChargen)));

	// ── `state-ref` ──
	const S1 = build([{ name: 'foeState', kind: 'state-ref', path: 'dragon', default: {} }]);
	t('state-ref：有该子域 ⇒ 回它', call(S1.foeState, { dragon: { hp: 3 } }).ok === '{"hp":3}', JSON.stringify(call(S1.foeState, { dragon: { hp: 3 } })));
	t('state-ref：没有 ⇒ 回 default（不许崩）', call(S1.foeState, {}).ok === '{}', JSON.stringify(call(S1.foeState, {})));

	// ── 卫生（审查必修 2）：非法链不许进产物；模板串必须转义 ──
	const badPath = (m) => { try { build([{ name: 'x', ...m }]); return false; } catch { return true; } };
	t('`game-ref` ＋ `required`：取到就回值；取不到（类型不对）⇒ **抛**且报文原样', (() => {
		const C = build([{ name: 'dragonMaxHp', kind: 'game-ref', path: 'Game?.Dragon?.hp', optional: true, required: true, type: 'number', error: 'Sg.story.dragonMaxHp：故事未提供（结构缺失必须报错）' }], { game: { Dragon: { hp: 30 } }, Sg: {} });
		const bad = build([{ name: 'dragonMaxHp', kind: 'game-ref', path: 'Game?.Dragon?.hp', optional: true, required: true, type: 'number', error: 'Sg.story.dragonMaxHp：故事未提供（结构缺失必须报错）' }], { game: {}, Sg: {} });
		return call(C.dragonMaxHp).ok === '30' && (call(bad.dragonMaxHp).threw ?? '').includes('结构缺失必须报错');
	})());
	t('`game-ref`：`required` 与 `default` 互斥 ⇒ emit 抛错（取不到就抛，不存在默认值）', (() => {
		try { build([{ name: 'x', kind: 'game-ref', path: 'Game.X', required: true, default: 1 }], { game: {} }); return false; }
		catch (e) { return /互斥/.test(String(e.message)); }
	})());
	t('`game-ref.error` 非字符串／函数／空串 ⇒ emit 抛错（否则产 `throw new Error(undefined)`）', (() => {
		const bad = (e) => { try { build([{ name: 'x', kind: 'game-ref', path: 'Game.X', required: true, error: e }], { game: {} }); return false; } catch { return true; } };
		return bad(42) && bad(() => 'x') && bad('') && bad(null);
	})());
	t('`game-ref`（`required`）缺 `error` ⇒ 用**命名默认报文**（非空，不含 undefined）', (() => {
		const C = build([{ name: 'dragonMaxHp', kind: 'game-ref', path: 'Game.Dragon.hp', required: true, type: 'number' }], { game: {} });
		const t = call(C.dragonMaxHp).threw ?? '';
		return t.includes('结构缺失') && !t.includes('undefined');
	})());
	t('`game-ref.type` 只收封闭集（不许把任意表达式拼进产物）', (() => {
		try { build([{ name: 'x', kind: 'game-ref', path: 'Game.X', required: true, type: "number'); alert(1); ('" }], { game: {} }); return false; }
		catch (e) { return /只收/.test(String(e.message)); }
	})());
	t('卫生：`game-ref.path` 里注入 JS ⇒ emit 抛错', badPath({ kind: 'game-ref', path: 'Game.X;alert(1)//' }));
	t('卫生：`bool-exists.path` 非法 ⇒ emit 抛错', badPath({ kind: 'bool-exists', path: 'Game.X + 1' }));
	t('卫生：`state-ref.path` 非法 ⇒ emit 抛错', badPath({ kind: 'state-ref', path: 'a[b]' }));
	t('卫生：`lookup.from` 非法 ⇒ emit 抛错', badPath({ kind: 'lookup', from: 'Game.X`);alert(1);(`', key: 'id' }));
	t('卫生：`error` 里的反引号与 `${` 被转义（产物仍能解析，报文原样）', (() => {
		const E = build([{ name: 'checkSite', kind: 'lookup', from: 'Game.Checks.sites', key: 'name', required: true, error: '坏 ${x} 与 ` 反引号 {key}' }], { game: {} });
		const r = call(E.checkSite, 'k');
		return (r.threw ?? '').includes('${x}') && (r.threw ?? '').includes('`') && (r.threw ?? '').includes('k');
	})());
	// ── v1.1 新增/硬化（`#762` 车道 A 后半）：每条都**跑起来看行为** ──
	t('`game-ref`：**默认不守卫**（`optional` 由数据决定 —— 手写版两种都有，schema 必须都能表达）', (() => {
		const U = build([{ name: 'econEvents', kind: 'game-ref', path: 'Game.Economy.events' }], { game: { Economy: { events: [] } } });
		return call(U.econEvents).ok === '[]';
	})());
	t('`game-ref`＋`optional:true`＋默认值：面在 ⇒ 回它；面缺 ⇒ 回 default（不许崩）', (() => {
		const G = build([{ name: 'notes', kind: 'game-ref', path: 'Game.Notes.entries', default: {}, optional: true }], { game: { Notes: { entries: { a: 1 } } } });
		const G2 = build([{ name: 'notes', kind: 'game-ref', path: 'Game.Notes.entries', default: {}, optional: true }], { game: {} });
		return call(G.notes).ok === '{"a":1}' && call(G2.notes).ok === '{}';
	})());
	t('`forward`：**形参序与表函数不同**也能转发（参数顺序真的换过来了）', (() => {
		const game = { Items: { battleDamage: (...a) => JSON.stringify(a) } };
		const F = build([{ name: 'battleDamage', kind: 'forward', to: 'Game.Items.battleDamage', params: ['inv', 'round', 'defeats', 'poisoned'], args: ['round', 'inv', 'defeats', 'poisoned'] }], { game });
		return call(F.battleDamage, 'INV', 3, 1, false).ok === JSON.stringify('[3,"INV",1,false]');   // `call` 会再编码一次
	})());
	t('`forward`：`args` 用了 `params` 之外的标识符 ⇒ emit 抛错（不许把任意表达式转发出去）', (() => {
		try { build([{ name: 'x', kind: 'forward', to: 'Game.Items.battleDamage', params: ['a'], args: ['a;alert(1)'] }]); return false; } catch { return true; }
	})());
	t('`lookup-field.via`：经成员调用取字段 ⇒ 有则回、缺/非串则**抛**', (() => {
		const B = build([
			{ name: 'combatAction', kind: 'lookup', from: 'Game.Combat.actions', key: 'id', default: null },
			{ name: 'actionLabel', kind: 'lookup-field', via: 'combatAction', key: 'id', field: 'label', required: true, error: 'Sg.story.actionLabel：动作「{key}」缺 label' },
		], { game: { Combat: { actions: { 挥剑: { label: '劈过去' }, 空手: { label: '' } } } } });
		return call(B.actionLabel, '挥剑').ok === '"劈过去"' && (call(B.actionLabel, '空手').threw ?? '').includes('空手') && (call(B.actionLabel, '无').threw ?? '').includes('无');
	})());
	t('`lookup-field.via`：`via` 不是标识符 ⇒ emit 抛错', (() => {
		try { build([{ name: 'x', kind: 'lookup-field', via: 'a.b', key: 'id', field: 'label' }]); return false; } catch { return true; }
	})());
	// `template`（审查要求的三态：两件都掉 / 只掉钱 / 只掉物 ＋ 都不掉 ⇒ 空串）
	const TPL = { name: 'lootText', kind: 'template', param: 'r', baseParam: 'base', prefix: '他退开的地方散着', suffix: '。', join: '，还有', trim: true, empty: '',
		parts: [{ when: { gt: ['gold', 0] }, text: '旧币 {gold} 枚' }, { when: { truthy: 'item' }, text: '一把{item}', map: { 钥匙: '锈钥匙' } }] };
	const T = build([TPL]);
	t('`template`：两件都掉 ⇒ 两句都出、用 join 连', call(T.lootText, { gold: 3, item: '钥匙' }, '').ok === JSON.stringify('他退开的地方散着旧币 3 枚，还有一把锈钥匙。'));
	t('`template`：**只掉钱**', call(T.lootText, { gold: 5, item: null }, '').ok === JSON.stringify('他退开的地方散着旧币 5 枚。'));
	t('`template`：**只掉物**（且走 `map` 改名）', call(T.lootText, { gold: 0, item: '干粮' }, '').ok === JSON.stringify('他退开的地方散着一把干粮。'));
	t('`template`：**都不掉 ⇒ 空串**（不拼半句）', call(T.lootText, {}, '').ok === '""');
	t('`template`：`baseParam` 前置（base 为空值时用空串兜）', call(T.lootText, { gold: 1 }, '它倒了。').ok === JSON.stringify('它倒了。他退开的地方散着旧币 1 枚。'));
	t('`template`：`when` 形状不认识 ⇒ emit 抛错（不许猜）', (() => {
		try { build([{ name: 'x', kind: 'template', param: 'r', parts: [{ when: { weird: 1 }, text: 'a' }] }]); return false; } catch { return true; }
	})());
	t('兜底硬化：`fallback: "String(id)"`（裸表达式）⇒ emit 抛错', (() => {
		try { build([{ name: 'x', kind: 'lookup-field', from: 'Game.Items.defs', key: 'id', field: 'label', fallback: 'String(id)' }]); return false; } catch { return true; }
	})());
	t('`const` 的值是**对象字面量** ⇒ 加括号（否则 `() => {…}` 被当块体 ⇒ 产物语法错）', (() => {
		const C = build([{ name: 'mechanics', kind: 'const', value: { pools: { w1: ['a'] }, deep: { x: { y: 1 } } } }]);
		return call(C.mechanics).ok === '{"pools":{"w1":["a"]},"deep":{"x":{"y":1}}}';
	})());
	t('`fromMember` 指向**不存在的成员** ⇒ emit 抛错（不许静默 null ✗）', (() => {
		try { emitContract({ members: [{ name: 'a', kind: 'lookup', fromMember: '不存在', path: 'x', key: 'k' }] }); return false; }
		catch (e) { return /不在本契约的成员里/.test(String(e.message)); }
	})());
	t('局部常量根的报文**点名成员**（免得下一个人 bisect）', (() => {
		try { emitContract({ members: [{ name: 'eventKindLabel', kind: 'lookup', from: 'MECH.kindLabels', key: 'k' }] }); return false; }
		catch (e) { return /成员「eventKindLabel」/.test(String(e.message)) && /MECH/.test(String(e.message)); }
	})());
	t('对象 `const`：**每次调用返回同一对象**（手写版 `() => MECH` 的语义；值比较看不出来 ⇒ 必须单独钉）', (() => {
		const C = build([{ name: 'mechanics', kind: 'const', value: { enemies: { 鼠: { hp: 4 } } } }]);
		const a = C.mechanics(), b = C.mechanics();
		a.enemies.鼠.hp = 7;
		return a === b && C.mechanics().enemies.鼠.hp === 7;
	})());
	t('`fromMember` ＋ `path`：从**同产物里的成员**取表（局部常量的正解）—— 行为断言', (() => {
		const C = build([{ name: 'mechanics', kind: 'const', value: { kindLabels: { shortFight: '短战斗' } } },
		                 { name: 'eventKindLabel', kind: 'lookup', fromMember: 'mechanics', path: 'kindLabels', key: 'k', default: null }]);
		return call(C.eventKindLabel, 'shortFight').ok === '"短战斗"' && call(C.eventKindLabel, 'x').ok === 'null';
	})());
	t('`fromMember`：兜底随 kind 走 —— `lookup.default`（如 `?? 0`）与 `lookup-field.fallback` 都不能丢', (() => {
		const C = build([{ name: 'mechanics', kind: 'const', value: { chest: { gold: { 普通: 5 } } } },
		                 { name: 'chestGold', kind: 'lookup', fromMember: 'mechanics', path: 'chest.gold', key: 'rarity', default: 0 }]);
		return call(C.chestGold, '普通').ok === '5' && call(C.chestGold, '无').ok === '0';
	})());
	t('**局部常量根**（`MECH.kindLabels`）⇒ emit 抛错（不许补成 `window.MECH` ⇒ 产物静默 undefined ✗）', (() => {
		try { build([{ name: 'eventKindLabel', kind: 'lookup', from: 'MECH.kindLabels', key: 'k', default: null }]); return false; }
		catch (e) { return /不是全局/.test(String(e.message)); }
	})());
	t('契约/表**缺 `section`** ⇒ emit 抛错（否则产物出现 `:: undefined [script]` —— 无名段落会让按段名解析的门集体失准）', (() => {
		try { compileStory({ slug: 'x', tables: { section: undefined, containers: {} } }); return false; } catch (e) { return /section 缺失/.test(String(e.message)); }
	})());
	t('`const` 缺 `value`（字段名写错）⇒ emit 抛错，不许产出 `() => undefined`', (() => {
		try { build([{ name: 'x', kind: 'const', raw: 'false' }]); return false; }
		catch (e) { return /缺 `value`/.test(String(e.message)); }
	})());
	t('未知 kind ⇒ emit 抛错（不许静默产出半个函数）', badPath({ kind: 'nope' }));

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（45 例：lookup 5 · lookup-field 6 · bool-exists 2 · state-ref 2 · game-ref 7 · 成员相对查表 3 · forward 2 · **template 6（含三态）** · 卫生/硬化 7——**全部按行为断言**）');
};

// ⚠️ **主模块守卫**（实测踩到）：这些脚本**同时是库**（`equiv` 被 `extract` 导入、`compile` 被 `equiv` 起子进程）。
// 没有守卫时，`import` 它们会**执行对端的 CLI**（实测：`node editor/extract-story.mjs --selftest` 打出的是
// `equiv` 的自证然后退出 ⇒ 自己的自证根本没跑）。守卫＝「只在被当脚本执行时才跑 CLI」。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/compile-story.mjs <slug> [--out=<dir>]'); process.exit(2); }
	const outArg = process.argv.find((a) => a.startsWith('--out='));
	const OUT = outArg ? outArg.slice('--out='.length) : join(ROOT, 'build/generated', slug);
	const readIf = (f) => { try { return JSON.parse(readText(join(ROOT, 'stories', slug, 'data', f))); } catch { return null; } };
	const tables = readIf('tables.json');
	const contract = readIf('contract.json');
	const rules = readIf('rules.json');
	if (!tables && !contract && !rules) { console.error(`✗ stories/${slug}/data/ 下没有任何产物源（tables/contract/rules.json 都没有）`); process.exit(1); }
	const files = compileStory({ tables, contract, rules, slug });
	// ⚠️ 比**解析后**的路径（`--out=stories/<slug>` 是相对的 ✓ —— 直接拿字符串比会静默走错分支 ✗，而**两个分支写出的是同一份字节** ⇒ 行为对、分支错 = 最难发现的那种 ✓）。
	if (resolve(OUT) === join(ROOT, 'stories', slug)) {
		const wrote = writeStoryPackage({ slug, twee: files, io: NODE_IO });
		for (const p of wrote) console.log(`✔ ${slug}：产物 → ${p.replace(ROOT, '')}（${(files[p.split('/').pop()] ?? '').length} 字节，${(files[p.split('/').pop()] ?? '').split('\n').length - 1} 行）`);
	} else {
		mkdirp(OUT);
		for (const [name, text] of Object.entries(files)) {
			writeText(join(OUT, name), text);
			console.log(`✔ ${slug}：${Object.keys(files).length} 份产物 · ${name} ← data/（${text.length} 字节，${text.split('\n').length - 1} 行）`);
		}
	}
};

if (isMain) main();
