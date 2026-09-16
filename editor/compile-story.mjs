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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 标识符链白名单：`Sg.story.mechanics()?.pools` / `Game.Checks.sites` 这类**只由标识符、`.`、`?.`、`()` 组成**的串。
 *  为什么必须校验（实测的绕法）：这些字段是**原样拼进产物**的 —— 数据里写 `a;alert(1)//` 就能把任意 JS 注进去。
 *  ⇒ 不合格**当场抛错**（fail-loud），绝不放行。 */
const CHAIN_RE = /^[A-Za-z_$][\w$]*(\??\.[A-Za-z_$][\w$]*|\(\))*$/;
export const assertChain = (v, what = '路径') => {
	if (typeof v !== 'string' || !CHAIN_RE.test(v)) {
		throw new Error(`${what} 必须是标识符链（只允许 标识符 / . / ?. / ()），实得 ${JSON.stringify(v)}——schema 不许把任意 JS 拼进产物`);
	}
	return v;
};

/** 拼进**模板串**的文本必须转义（`` ` `` 与 `${`）——本仓因"模板串里未转义反引号＝语法错"踩过。 */
export const escTemplate = (s) => String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

/** 查表表达式的两种形状：普通取键 / 可选链取键（接缝路径如 `Sg.story.mechanics()` 用后者）。 */
/** 把一条链**逐段**加可选链：`Game.Checks.sites` ⇒ `Game?.Checks?.sites`。
 *  为什么必须逐段（实测）：只在**最后一段**加 `?.` 时，中间容器缺失会抛 `TypeError: Cannot read properties of undefined`，
 *  把契约的 fail-loud（"位点未登记"那句）**盖掉** ⇒ 报错信息变成框架噪音。逐段加既稳，也与故事 1 的手写形状一致。 */
export const guardChain = (chain) => chain.replace(/\?\./g, '.').split('.').map((seg, i) => {
	const call = seg.endsWith('()');
	const name = call ? seg.slice(0, -2) : seg;
	if (!i) return seg;
	// 方法段要写成 `?.name?.()`（**可选调用**）：只写 `?.name()` 时，name 缺失会得到 `undefined()`
	// ⇒ `TypeError: … is not a function`（实测：接缝方法缺失时把契约的 fail-loud 盖成框架噪音）
	return call ? `?.${name}?.()` : `?.${name}`;
}).join('');

const access = (from, key, optional) => {
	// `from` 已经是全局根（`window.` / `Sg.`）时**原样用**——手写版两种写法都有（`window.Sg.story.mechanics()` 与 `Sg.story.mechanics()`），
	// schema 得能表达"哪个根"，否则生成物与手写版差一个前缀（L3 报差异时要人肉分辨，不值当）。
	assertChain(from, 'lookup.from');
	const rooted = /^(window\.|Sg\.)/.test(from) ? from : `window.${from}`;
	const base = optional ? guardChain(rooted) : rooted.replace(/\?\./g, '.');
	return optional ? `${base}?.[${key}]` : `${base}[${key}]`;
};

/** 契约成员的 `kind` → JS 表达式（**封闭集合**；新增 kind 必须同时改这里、`--selftest` 与设计稿 §2.3）。
 *
 *  v0 六个 ＋ v1 四个（`#762` 车道 A 实测缺口：故事 1/2 的真实契约都用得上，且都**不需要** `kind:'js'` 逃生舱）：
 *   · `lookup`        ｜ `{ from, key, default, optional?, required?, error? }` —— 查表；`required` 表达契约的 fail-loud
 *   · `lookup-field`  ｜ 在 `lookup` 基础上取一个字段，并可给兜底表达式（如 `String(key)`）
 *   · `bool-exists`   ｜ `{ path }` ⇒ `!!window.<path>`（"这张故事表在不在"）
 *   · `state-ref`     ｜ `{ path, default, arg? }` ⇒ `<arg>?.<path> ?? <default>`（如 `foeState(pc)` 读 `pc.dragon`）
 */
export const KINDS = {
	'empty-object': () => '() => ({})',
	'empty-array': () => '() => []',
	'null': () => '() => null',
	'const': (m) => `() => ${jsLiteral(m.value)}`,
	'game-ref': (m) => {
		assertChain(m.path, 'game-ref.path');
		// 两种形态**都由数据表达**（手写版两种都有）：默认**不守卫**（`window.Game.Economy.events`）；
		// 要守卫就写 `optional: true`（⇒ `window.Game?.Notes?.entries`，中间容器缺失时走默认值而不是抛框架噪音）。
		const base = `window.${m.optional === true ? guardChain(m.path) : m.path.replace(/\?\./g, '.')}`;
		return m.default === undefined ? `() => ${base}` : `() => ${base} ?? ${literal(m.default)}`;
	},
	'forward': (m) => {
		// 参数**转发**（形参序与表函数可以不同）：`params` 是接缝形参、`args` 是转给表函数的**形参名序列**
		const params = (m.params ?? []).map((x) => assertChain(x, 'forward.params[]'));
		const args = (m.args ?? params).map((x) => assertChain(x, 'forward.args[]'));
		if (args.some((x) => !params.includes(x))) throw new Error(`forward.args 只许用 forward.params 里的形参名（实得 ${JSON.stringify(m.args)}）`);
		return `(${params.join(', ')}) => window.${assertChain(m.to, 'forward.to')}(${args.join(', ')})`;
	},
	'identity-string': () => '(id) => String(id)',
	'lookup': (m) => {
		const k = m.key ?? 'id';
		const value = access(m.from, k, m.optional !== false);
		if (!m.required) return `(${k}) => ${value} ?? ${jsLiteral(m.default ?? null)}`;
		const msg = escTemplate(m.error ?? `Sg.story.${m.name}：${k} 未登记（结构缺失必须报错，#441-E）`).replaceAll('{key}', '${' + k + '}');
		return `(${k}) => {\n\t\tconst v = ${value};\n\t\tif (!v) throw new Error(\`${msg}\`);\n\t\treturn v;\n\t}`;
	},
	'lookup-field': (m) => {
		const k = m.key ?? 'id';
		if (m.via) {
			// **经成员调用**取字段 ＋ 校验非空（`actionLabel` 的形状）：`via` 只许是本故事的契约成员名
			if (!/^[A-Za-z_$][\w$]*$/.test(m.via)) throw new Error(`lookup-field.via 只许是本故事的契约成员名（实得 ${JSON.stringify(m.via)}）`);
			const msg = escTemplate(m.error ?? `Sg.story.${m.name}：动作「{key}」缺 ${m.field}（结构缺失必须报错，#441-E）`).replaceAll('{key}', '${' + k + '}');
			return `(${k}) => {\n\t\tconst a = window.Sg.story.${m.via}(${k});\n\t\tif (!a || typeof a.${m.field} !== 'string' || !a.${m.field}) throw new Error(\`${msg}\`);\n\t\treturn a.${m.field};\n\t}`;
		}
		const value = access(m.from, k, m.optional !== false);
		const field = m.field ? `?.${m.field}` : '';
		return `(${k}) => ${value}${field} ?? ${fallbackExpr(m.fallback, k)}`;
	},
	'template': (m) => {
		// 「按条件拼句」⇒ 声明式（`parts[].when/text` ＋ `join`/`prefix`/`suffix`/`map`）；**不写任意 JS**。
		// 覆盖的真实形状：洞窟 `lootText`（`#736`：战利品句按实际掉落生成）。
		const r = assertChain(m.param ?? 'r', 'template.param');
		const base = m.baseParam ? assertChain(m.baseParam, 'template.baseParam') : null;
		const when = (w) => {
			if (w && typeof w === 'object' && Array.isArray(w.gt)) { const [f, n] = w.gt; assertChain(f, 'template.parts[].when.gt'); return `${r}?.${f} > ${literal(n)}`; }
			if (w && typeof w === 'object' && typeof w.truthy === 'string') { assertChain(w.truthy, 'template.parts[].when.truthy'); return `${r}?.${w.truthy}`; }
			throw new Error(`template.parts[].when 只接受 {gt:[字段,数]} 或 {truthy:字段}（实得 ${JSON.stringify(w)}）`);
		};
		const hole = (f, pt) => {
			assertChain(f, 'template.parts[].text 里的字段');
			return pt.map ? `(${literal(pt.map)})[${r}.${f}] ?? ${r}.${f}` : `${r}.${f}`;   // `map` 映射的是**值**（如 `钥匙 ⇒ 锈钥匙`）
		};
		const body = (m.parts ?? []).map((pt) => {
			const text = escTemplate(String(pt.text ?? '')).replace(/\{(\w+)\}/g, (_, f) => '${' + hole(f, pt) + '}');
			return `\t\tif (${when(pt.when)}) bits.push(\`${text}\`);`;
		}).join('\n');
		const baseExpr = base ? '${' + base + " ?? ''}" : '';
		const joinExpr = '${bits.join(' + jsString(m.join ?? '') + ')}';
		const tail = m.trim === false ? '' : '.trim()';
		return `(${[r, base].filter(Boolean).join(', ')}) => {\n\t\tconst bits = [];\n${body}\n\t\tif (!bits.length) return ${jsString(m.empty ?? '')};\n\t\treturn \`${baseExpr}${jsStringInner(m.prefix ?? '')}${joinExpr}${jsStringInner(m.suffix ?? '')}\`${tail};\n\t}`;
	},
	'bool-exists': (m) => `() => !!window.${assertChain(m.path, 'bool-exists.path')}`,
	'state-ref': (m) => {
		const a = m.arg ?? 'pc';
		return `(${a}) => ${a}?.${guardChain(assertChain(m.path, 'state-ref.path'))} ?? ${jsLiteral(m.default ?? {})}`;
	},
};

/** 纯函数：JS 字符串字面量 —— 一律**单引号**（与仓内既有代码同风格；L3 要剥空白后逐字节相同）。 */
/** 纯函数：**字符串内容**（不带引号）—— 模板串的字面部分用；转义反引号与 `${`。 */
export const jsStringInner = (v) => String(v).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

/** **兜底表达式的小 enum**（硬化：审查指出：`fallback`/`default` 从前是**原样拼进 JS** 的，与 `path`/`from`
 *  同属注入面、只差一个字段）。只接受：`{kind:'string-identity'}` ⇒ `String(<形参>)` ·
 *  `{kind:'const', value}` ⇒ 字面量 · `{kind:'null'}` ⇒ `null`。其余**当场抛错**。 */
export const fallbackExpr = (fb, key) => {
	if (fb == null || fb === 'null') return 'null';
	if (typeof fb === 'object' && fb.kind === 'string-identity') return `String(${key})`;
	if (typeof fb === 'object' && fb.kind === 'const') return literal(fb.value);
	if (typeof fb === 'object' && fb.kind === 'null') return 'null';
	throw new Error(`兜底只接受 {kind:'string-identity'|'const'|'null'}，实得 ${JSON.stringify(fb)}——不许把任意 JS 拼进产物`);
};

export const jsString = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const jsLiteral = (v) => literal(v, 0);

/** 纯函数：对象键 —— 合法标识符用裸键，其余用单引号串。 */
export const jsKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : jsString(k));

/** 纯函数：JSON 值 → 带 tab 缩进的 JS 字面量（空表/空对象写成一行，便于人读）。 */
export const literal = (v, ind = 0) => {
	const pad = '\t'.repeat(ind);
	if (Array.isArray(v)) {
		if (!v.length) return '[]';
		return `[\n${v.map((x) => `${pad}\t${literal(x, ind + 1)}`).join(',\n')}\n${pad}]`;
	}
	if (v && typeof v === 'object') {
		const keys = Object.keys(v);
		if (!keys.length) return '{}';
		return `{\n${keys.map((k) => `${pad}\t${jsKey(k)}: ${literal(v[k], ind + 1)}`).join(',\n')}\n${pad}}`;
	}
	return typeof v === 'string' ? jsString(v) : String(v);
};

/** 纯函数：**单行**字面量（条件表的行用：一行一行写，diff 才看得懂）。 */
export const inlineLiteral = (v) => {
	if (Array.isArray(v)) return `[${v.map(inlineLiteral).join(', ')}]`;
	if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${jsKey(k)}: ${inlineLiteral(x)}`).join(', ')} }`;
	if (typeof v === 'string') return jsString(v);
	return String(v);
};

/** 纯函数：`data/rules.json` → `StoryRules` 段（条件表；一行一条）。 */
export const emitRules = (rows) => [
	'Object.assign((window.Sg.story ??= {}), {',
	'\trules: () => [',
	...rows.map((r) => `\t\t${inlineLiteral(r)},`),
	'\t],',
	'});',
].join('\n');

/** 纯函数：`data/tables.json` → `Game Tables` 段（不含段头与生成标记）。 */
export const emitTables = (d) => {
	const one = 'window.Game = Object.assign(window.Game ?? {}, ' + literal(d.containers) + ');';
	const merges = (d.merges ?? []).map((m) => {
		const segs = m.target.split('.');
		const leaf = segs.pop();
		const init = literal(m.default);
		const body = Object.entries(m.value).map(([k, v]) => `\t${jsKey(k)}: ${jsString(v)},`).join('\n');
		return `Object.assign(((window.${segs.join('.')} ??= ${init}).${leaf}), {\n${body}\n});`;
	});
	return [one, ...merges].join('\n');
};

/** 纯函数：`data/contract.json` → `StoryBindings` 段（不含段头与生成标记）。 */
export const emitContract = (d) => {
	const rows = d.members.map((m) => {
		const fn = KINDS[m.kind];
		if (!fn) throw new Error(`未知的契约 kind：${m.kind}（成员 ${m.name}）——新增 kind 必须同时改 KINDS 与设计稿 §2.3`);
		return `\t${m.name}: ${fn(m)},`;
	});
	return ['window.Sg ??= {};', `Object.assign((window.Sg.story ??= {}), {\n${rows.join('\n')}\n});`].join('\n');
};

const GENERATED = (src) => `// @generated by editor/compile-story.mjs（源：${src}）——**手改会在下次编译被覆盖**（#762 / K4）`;

/** 纯函数：把各段拼成**产物文件表**（文件名 → 文本）——一个故事可以有多份产物。 */
export const compileStory = ({ tables, contract, rules, slug }) => {
	const files = {};
	const notes = (name) => GENERATED(`stories/${slug}/data/${name}`);
	if (tables || contract) {
		const parts = [];
		if (tables) {
			parts.push(`:: ${tables.section} [script]`, notes('tables.json'));
			if (tables.note) parts.push(`// ${tables.note}`);
			parts.push(emitTables(tables), '');
		}
		if (contract) {
			parts.push(`:: ${contract.section} [script]`, notes('contract.json'));
			if (contract.note) parts.push(`// ${contract.note}`);
			parts.push(emitContract(contract), '');
		}
		files['15-tables.twee'] = parts.join('\n');
	}
	if (rules) {
		files['17-rules.twee'] = [`:: ${rules.section} [script]`, notes('rules.json'), emitRules(rules.rows), ''].join('\n');
	}
	return files;
};

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
	t('未知 kind ⇒ emit 抛错（不许静默产出半个函数）', badPath({ kind: 'nope' }));

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（31 例：lookup 5 · lookup-field 6 · bool-exists 2 · state-ref 2 · game-ref 2 · forward 2 · **template 6（含三态）** · 卫生/硬化 7——**全部按行为断言**）');
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
	const readIf = (f) => { try { return JSON.parse(readFileSync(join(ROOT, 'stories', slug, 'data', f), 'utf8')); } catch { return null; } };
	const tables = readIf('tables.json');
	const contract = readIf('contract.json');
	const rules = readIf('rules.json');
	if (!tables && !contract && !rules) { console.error(`✗ stories/${slug}/data/ 下没有任何产物源（tables/contract/rules.json 都没有）`); process.exit(1); }
	const files = compileStory({ tables, contract, rules, slug });
	mkdirSync(OUT, { recursive: true });
	for (const [name, text] of Object.entries(files)) {
		writeFileSync(join(OUT, name), text, 'utf8');
		console.log(`✔ ${slug}：${Object.keys(files).length} 份产物 · ${name} ← data/（${text.length} 字节，${text.split('\n').length - 1} 行）`);
	}
};

if (isMain) main();
