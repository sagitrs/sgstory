// `#794` 内核抽取 · **core 层**：编译器的**发射面**（纯函数：助手层 ＋ 类型表 ＋ 三个 emit ＋ `compileStory`）。
// 为什么整块搬：`classify`（下一步）要用 `KINDS`／`GLOBAL_ROOTS`，而 `KINDS` 的发射器又依赖这一整套助手
//（实测：单搬 `KINDS` → `ReferenceError: assertChain is not defined`）→ 助手层与它同生共死。
// 本层无宿主依赖：不 import `node:fs`／`child_process`／`vm`（读写产物由**壳**做，K6 判据③在盯）。
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
/** 把一条链**逐段**加可选链：`Game.Checks.sites` → `Game?.Checks?.sites`。
 * 为什么必须逐段（实测）：只在**最后一段**加 `?.` 时，中间容器缺失会抛 `TypeError: Cannot read properties of undefined`，
 * 把契约的 fail-loud（"位点未登记"那句）**盖掉** → 报错信息变成框架噪音。逐段加既稳，也与故事 1 的手写形状一致。 */
export const guardChain = (chain) => chain.replace(/\?\./g, '.').split('.').map((seg, i) => {
	const call = seg.endsWith('()');
	const name = call ? seg.slice(0, -2) : seg;
	if (!i) return seg;
	// 方法段要写成 `?.name?.()`（**可选调用**）：只写 `?.name()` 时，name 缺失会得到 `undefined()`
	// → `TypeError: … is not a function`（实测：接缝方法缺失时把契约的 fail-loud 盖成框架噪音）
	return call ? `?.${name}?.()` : `?.${name}`;
}).join('');

/** 故事数据面能引用的**全局根**（封闭集）。为什么必须封闭：本仓实测 —— 故事文件里的**局部常量**（`const MECH = {…}`）
 * 被分类器当成可表达的 `lookup.from`（`MECH.kindLabels`）→ 编译补 `window.` → 生成物读 `window.MECH` → **静默 undefined**
 *（六个成员一起变成 `null`/`0`/`[]`，而静态比对与 L3 都看不出来）。局部常量应走 `fromMember` ＋ `path`（指向同产物里的成员）。 */
export const GLOBAL_ROOTS = ['Game', 'Sg', 'State', 'window', 'Engine', 'Config'];
const assertGlobalRoot = (chain, who = '（未知成员）') => {
	const first = String(chain).replace(/^window\./, '').split(/[.?]/)[0];
	if (String(chain).startsWith('window.') || GLOBAL_ROOTS.includes(first)) return chain;
	throw new Error(`成员「${who}」的路径根「${first}」不是全局（\`GLOBAL_ROOTS\` = ${GLOBAL_ROOTS.join('/')}）—— **局部常量不能当全局读**：本仓实测它会被补成 \`window.${first}\` ⇒ 产物静默 undefined。请改用 \`fromMember\`(＋\`path\`) 指向同产物里的声明式成员，或先把字面量内联进 data。`);
};

const access = (from, key, optional, who = '（未知成员）') => {
	// `from` 已经是全局根（`window.` / `Sg.`）时**原样用**——手写版两种写法都有（`window.Sg.story.mechanics()` 与 `Sg.story.mechanics()`），
	// schema 得能表达"哪个根"，否则生成物与手写版差一个前缀（L3 报差异时要人肉分辨，不值当）。
	assertChain(from, 'lookup.from');
	const rooted = /^(window\.|Sg\.)/.test(from) ? assertGlobalRoot(from, who) : `window.${assertGlobalRoot(from, who)}`;
	const base = optional ? guardChain(rooted) : rooted.replace(/\?\./g, '.');
	return optional ? `${base}?.[${key}]` : `${base}[${key}]`;
};

/** 契约成员的 `kind` → JS 表达式（**封闭集合**；新增 kind 必须同时改这里、`--selftest` 与设计稿 §2.3）。
 *
 * v0 六个 ＋ v1 四个（`#762` 车道 A 实测缺口：故事 1/2 的真实契约都用得上，且都**不需要** `kind:'js'` 逃生舱）：
 * · `lookup` ｜ `{ from, key, default, optional?, required?, error?}` —— 查表；`required` 表达契约的 fail-loud
 * · `lookup-field` ｜ 在 `lookup` 基础上取一个字段，并可给兜底表达式（如 `String(key)`）
 * · `bool-exists` ｜ `{ path}` → `!!window.<path>`（"这张故事表在不在"）
 * · `state-ref` ｜ `{ path, default, arg?}` → `<arg>?.<path>?? <default>`（如 `foeState(pc)` 读 `pc.dragon`）
 */
/** **成员相对查表**（`fromMember` ＋ `path`）：指向**同产物里的另一个成员**的值 —— 局部常量的正解。
 * 为什么需要它（`#785`／`#787` 实测）：故事里 `const MECH = {…}` 是**局部**的，而 `mechanics: () => MECH` 把它放进了契约
 * → 其它成员该写 `MECH.kindLabels[k]` 的地方，必须能表达成"**从我自己的 mechanics 成员里取**" → `Sg.story.mechanics().kindLabels`
 *（`MECH` 在生成物里**不存在** → 走全局读会静默 undefined）。 */
const lookupFromMember = (m, k) => {
	const who = m.fromMember;
	if (!/^[A-Za-z_$][\w$]*$/.test(who)) throw new Error(`lookup.fromMember 只许是本故事的契约成员名（实得 ${JSON.stringify(who)}）`);
	const path = m.path ? assertChain(m.path, 'lookup.path') : '';
	const chain = `Sg.story.${who}()${path ? '.' + path : ''}`;
	const base = m.optional === false ? chain.replace(/\?\./g, '.') : guardChain(chain);
	const value = m.key === undefined ? base : `${base}?.[${k}]`;
	const field = m.field ? `?.${m.field}` : '';
	if (m.required) {
		const msg = escTemplate(m.error ?? `Sg.story.${m.name}：${k} 未登记（结构缺失必须报错，#441-E）`).replaceAll('{key}', '${' + k + '}');
		return `(${k}) => {\n\t\tconst v = ${value}${field};\n\t\tif (!v) throw new Error(\`${msg}\`);\n\t\treturn v;\n\t}`;
	}
	// 兜底形态随 kind 走（与各自的非成员路径一致）：`lookup` 用 `default`（字面量）／`lookup-field` 用 `fallback`（小 enum）。
	//注意：实测（探针语料扩面后当场抓到）：漏了这条 → `chestGold` 从 `?? 0` 变成 `?? null`（手写 0 / 生成 null）。
	const tail = m.fallback !== undefined
		? ` ?? ${fallbackExpr(m.fallback, k)}`
		: m.default !== undefined
			? ` ?? ${jsLiteral(m.default)}`
			: ' ?? null';
	return `(${k}) => ${value}${field}${tail}`;
};

export const KINDS = {
	'empty-object': () => '() => ({})',
	'empty-array': () => '() => []',
	'null': () => '() => null',
	//注意：**对象/数组 `const` 要保住"同一性"**：手写版是 `() => MECH`（每次返回**同一个**对象 → 故事/测试**改声明面**时
	// 实例跟着变）。若就地内联成 `() => ({…})`，每次调用都是**新对象** → 改声明面不生效（实测：洞窟翻面后
	// `test/foe-5e.mjs` 的「改声明 hp → 实例跟着变」等 3 条断言倒了 这是探针**值比较**看不出来的那一类）。
	'const': (m) => {
		//注意：**缺 `value` 就抛**：字段名写错（分类器曾用 `raw`）→ 静默产出 `() => undefined`，
		// 而容器比对/L3 都看不出来（只有**行为**探针能抓）→ 这一族"静默 undefined"必须在编译期死掉。
		if (!Object.hasOwn(m, 'value')) throw new Error(`const 缺 \`value\`（实得字段：${Object.keys(m).join('、') || '无'}）⇒ 不许静默产出 undefined`);
		//注意：**对象字面量必须包括号**：`() => { …}` 会被当成**块体**（`pools: {` 于是成了带引号的标签 → SyntaxError）。
		// 这个坑是洞窟端到端（`mechanics` 那张大表）第一次编出来时**当场炸**的 —— 自证里没有对象 const 覆盖到它。
		const lit = jsLiteral(m.value);
		if (m.value !== null && typeof m.value === 'object') return `() => __const_${m.name}`;   // 顶部声明，见 emitContract
		return `() => ${lit.startsWith('{') ? `(${lit})` : lit}`;
	},
	'game-ref': (m) => {
		assertChain(m.path, 'game-ref.path');
		// 形态**都由数据表达**（手写版几种都有）：
		// ① 默认**不守卫**（`window.Game.Economy.events`）；② `optional: true` → `?.` 链（中间容器缺失走默认/undefined，不抛框架噪音）；
		// ③ `required: true` → **取不到就抛**（结构缺失必须报错）；配 `type` 则按 `typeof` 校验，`error` 是报文（会被转义）。
		// `required` → **自动**走 `?.` 守卫链：否则中间容器缺失会抛**框架 TypeError**，而不是我们的报文 —— `required` 的语义就不成立。
		const base = `window.${m.optional === true || m.required === true ? guardChain(m.path) : m.path.replace(/\?\./g, '.')}`;
		if (m.required === true) {
			const TYPES = ['number', 'string', 'boolean', 'object', 'function'];
			if (m.type !== undefined && !TYPES.includes(m.type)) throw new Error(`game-ref.type 只收 ${TYPES.join('/')}（实得 ${JSON.stringify(m.type)}）—— 不许把任意表达式拼进产物`);
			if (m.default !== undefined) throw new Error('game-ref：`required` 与 `default` 互斥（取不到就抛，不存在默认值）');
			//注意：`error` 必须校验：非字符串／函数／空串若放行 → 会产出 `throw new Error(undefined)`（静态比对看不出来）；
			// 与 `fallback`/`default` 的小 enum 硬化同一条口径 —— **数据里能塞任意值就是静默垃圾**。
			if (m.error !== undefined && (typeof m.error !== 'string' || m.error.trim() === '')) {
				throw new Error(`game-ref.error 必须是非空字符串（实得 ${typeof m.error === 'string' ? '空串' : typeof m.error}）—— 否则会产出 \`throw new Error(undefined)\``);
			}
			const cond = m.type ? `typeof v !== '${m.type}'` : 'v === undefined || v === null';
			// 缺 `error` 时用**命名默认报文**（与 `lookup.required` 对称）；绝不产出 `undefined`。
			const msg = escTemplate(typeof m.error === 'string' ? m.error : `window.${m.path}：结构缺失（该取值必须守卫）`);
			return `() => {\n\t\tconst v = ${base};\n\t\tif (${cond}) throw new Error(\`${msg}\`);\n\t\treturn v;\n\t}`;
		}
		return m.default === undefined ? `() => ${base}` : `() => ${base} ?? ${literal(m.default)}`;
	},
	'forward': (m) => {
		// 参数**转发**（形参序与表函数可以不同）：`params` 是接缝形参、`args` 是转给表函数的**形参名序列**
		// `to` 是 `window.` **之后**的路径 → 已带 `window.` 的会生成 `window.window.…`（实测踩到：行为探针比"两侧报错文案"时才暴露，字节面看不到）→ fail-loud。
		if (/^window\??\./.test(String(m.to ?? ''))) throw new Error(`forward.to 已是全链（${JSON.stringify(m.to)}）⇒ 这里只接受 \`window.\` **之后**的路径`);
		const params = (m.params ?? []).map((x) => assertChain(x, 'forward.params[]'));
		const args = (m.args ?? params).map((x) => assertChain(x, 'forward.args[]'));
		if (args.some((x) => !params.includes(x))) throw new Error(`forward.args 只许用 forward.params 里的形参名（实得 ${JSON.stringify(m.args)}）`);
		return `(${params.join(', ')}) => window.${assertChain(m.to, 'forward.to')}(${args.join(', ')})`;
	},
	'identity-string': () => '(id) => String(id)',
	'lookup': (m) => {
		const k = m.key ?? 'id';
		if (m.fromMember) return lookupFromMember(m, k);
		const value = access(m.from, k, m.optional !== false, m.name);
		if (!m.required) return `(${k}) => ${value} ?? ${jsLiteral(m.default ?? null)}`;
		const msg = escTemplate(m.error ?? `Sg.story.${m.name}：${k} 未登记（结构缺失必须报错，#441-E）`).replaceAll('{key}', '${' + k + '}');
		return `(${k}) => {\n\t\tconst v = ${value};\n\t\tif (!v) throw new Error(\`${msg}\`);\n\t\treturn v;\n\t}`;
	},
	'lookup-field': (m) => {
		const k = m.key ?? 'id';
		if (m.fromMember) return lookupFromMember(m, k);
		if (m.via) {
			// **经成员调用**取字段 ＋ 校验非空（`actionLabel` 的形状）：`via` 只许是本故事的契约成员名
			if (!/^[A-Za-z_$][\w$]*$/.test(m.via)) throw new Error(`lookup-field.via 只许是本故事的契约成员名（实得 ${JSON.stringify(m.via)}）`);
			const msg = escTemplate(m.error ?? `Sg.story.${m.name}：动作「{key}」缺 ${m.field}（结构缺失必须报错，#441-E）`).replaceAll('{key}', '${' + k + '}');
			return `(${k}) => {\n\t\tconst a = window.Sg.story.${m.via}(${k});\n\t\tif (!a || typeof a.${m.field} !== 'string' || !a.${m.field}) throw new Error(\`${msg}\`);\n\t\treturn a.${m.field};\n\t}`;
		}
		const value = access(m.from, k, m.optional !== false, m.name);
		const field = m.field ? `?.${m.field}` : '';
		return `(${k}) => ${value}${field} ?? ${fallbackExpr(m.fallback, k)}`;
	},
	'template': (m) => {
		//「按条件拼句」→ 声明式（`parts[].when/text` ＋ `join`/`prefix`/`suffix`/`map`）；**不写任意 JS**。
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
			return pt.map ? `(${literal(pt.map)})[${r}.${f}] ?? ${r}.${f}` : `${r}.${f}`;   // `map` 映射的是**值**（如 `钥匙 → 锈钥匙`）
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
 * 同属注入面、只差一个字段）。只接受：`{kind:'string-identity'}` → `String(<形参>)` ·
 * `{kind:'const', value}` → 字面量 · `{kind:'null'}` → `null`。其余**当场抛错**。 */
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

/** 纯函数：`data/chargen.json` 转成 `StoryChargen` 段（原样 JSON 内联，生成物，不带新增语义）。 */
export const emitChargen = (d) => [
	'Object.assign((window.Sg.story ??= {}), {',
		'chargen: () => (' + JSON.stringify({ rounds: d.rounds, presets: d.presets }) + '),',
	'});',
].join('\n');

/** 纯函数：`data/tables.json` → `Game Tables` 段（不含段头与生成标记）。 */
export const emitTables = (d) => {
	// `#1296`（甲案：**逐容器合并**）：原先这里是
	//   `window.Game = Object.assign(window.Game ?? {}, <全部容器>);`
	//，因此**顶层浅合并，因此同名容器被整块替换**：故事侧只要声明了与引擎同名的容器（如 `Game.Checks`），
	//   引擎 sim 面就**整体失效**（实测波及 8 个命名空间：`Checks`／`Items`／`Economy`／`Gear`／`Star`／
	//   `Social`／`Combat`／`Codex`，因此`Checks.resolve`／`Items.advAt`／`Economy.priceOf` 等**全 undefined**），
	//   而**仓内零故事**时（`#1265` 后）这条链永远跑不出病，因此**"故事跑得通、引擎面是死的"**，长期没被发现。
	//，因此改为**逐容器**：先保底建 `Game`，再对每个容器 `Object.assign` **合并进同名容器**（引擎成员保留）。
	// 非对象值（数组／标量）走**直接赋值**（合并语义对它们无意义；保持数据面原样）。
	const one = [
		'window.Game = window.Game ?? {};',
		...Object.entries(d.containers).map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)
			? `Object.assign((window.Game.${jsKey(k)} ??= {}), ${literal(v)});`
			: `window.Game.${jsKey(k)} = ${literal(v)};`)),
	].join('\n');
	const merges = (d.merges ?? []).map((m) => {
		//注意：值可能是**对象**（如 `Game.Consequences.provenance`）：早先这里走 `jsString(v)` → 对象被写成
		// `'[object Object]'`（实测：数据面多出一个字符串，行为门才看得见）→ 一律用 JSON 字面量 emitter。
		const segs = m.target.split('.');
		const leaf = segs.pop();
		const init = literal(m.default);
		const body = Object.entries(m.value).map(([k, v]) => `\t${jsKey(k)}: ${literal(v)},`).join('\n');
		return `Object.assign(((window.${segs.join('.')} ??= ${init}).${leaf}), {\n${body}\n});`;
	});
	return [one, ...merges].join('\n');
};

/** 纯函数：`data/contract.json` → `StoryBindings` 段（不含段头与生成标记）。 */
export const emitContract = (d) => {
	// 对象/数组 `const` 成员在**文件顶部**声明一次（`const X = {…};` 的赋值位无"块体 vs 对象"歧义），
	// 成员体只 `() => __const_X` → **每次调用同一个对象** → 与手写版 `() => MECH` 的同一性语义一致。
	// `fromMember` 前置（复核三条条件里的 ①③）：被引用者**必须**是本产物里的一个**声明式成员** ——
	// 否则引用链要么指向**不存在**的成员（静默 null），要么指进故事已有的函数（把任意逻辑藏进产品）。
	const names = new Set(d.members.map((m) => m.name));
	for (const m of d.members) {
		if (m.fromMember && !names.has(m.fromMember)) {
			throw new Error(`成员「${m.name}」的 \`fromMember\` 指向「${m.fromMember}」—— 但它**不在本契约的成员里**（引用必须指向同产物里的**声明式**成员）`);
		}
	}
	// ② 顺序无关：`__const_*` 提升到文件顶部 ＋ 成员引用在**调用时**求值（`Sg.story.X()`）→ 不依赖成员定义顺序。
	const hoists = d.members
		.filter((m) => m.kind === 'const' && m.value !== null && typeof m.value === 'object')
		.map((m) => `const __const_${m.name} = ${jsLiteral(m.value)};`);
	const rows = d.members.map((m) => {
		const fn = KINDS[m.kind];
		if (!fn) throw new Error(`未知的契约 kind：${m.kind}（成员 ${m.name}）——新增 kind 必须同时改 KINDS 与设计稿 §2.3`);
		return `\t${m.name}: ${fn(m)},`;
	});
	return ['window.Sg ??= {};', ...hoists, `Object.assign((window.Sg.story ??= {}), {\n${rows.join('\n')}\n});`].join('\n');
};

/** 纯函数：`data/notes.json` 的 **一块** → 该块的 `Object.assign(…)` 主体（不含段头与生成标记）。
 *
 * 形状照**手写期的铁律**（写在 `stories/mist-forest/16-notes-*.twee` 件头）：
 * `Object.assign((window.Game.Notes??= { entries: {}}).entries, {…})` —— **只这一句**（不定义别的全局）。
 *
 *注意：`era` 是**唯一不按字面发射**的字段：它写成**声明式枚举**（`"present"`／`"past"`），
 * 由块所属的 `notes.json` 的 `eraMap` 展开成引擎引用（`window.Game.Era.PRESENT`）。
 * **值不在 `eraMap` 里 → 编译期抛开名该项** —— 与 `KINDS.const` 的“缺 `value` 就抛”**同一条口径**
 *（实测过的形状：静默产出 `undefined` 时，容器比对与 L3 **都看不出来**，只有行为探针能抓）。
 * **其余字段一律走既有字面发射器**（`inlineLiteral`／`jsKey` → 不另写第二份字面引擎）。 */
export const emitNotes = (block, { eraMap = {} } = {}) => {
	const entries = block?.entries ?? {};
	const rows = Object.entries(entries).map(([k, e]) => {
		const eraKey = e?.era;
		const eraExpr = eraMap[eraKey];
		if (typeof eraExpr !== 'string' || !eraExpr) throw new Error(`emitNotes：条目 \`${k}\` 的 era「${JSON.stringify(eraKey)}」不在 \`eraMap\` 里 ⇒ 不许静默产出 undefined（可选项：${Object.keys(eraMap).join('、') || '（表为空）'}）`);
		const fields = Object.entries(e).map(([f, v]) => `${jsKey(f)}: ${f === 'era' ? eraExpr : inlineLiteral(v)}`);
		return `\t${jsKey(k)}: { ${fields.join(', ')} },`;
	});
	return ['Object.assign((window.Game.Notes ??= { entries: {} }).entries, {', ...rows, '});'].join('\n');
};

const GENERATED = (src) => `// @generated by editor/compile-story.mjs（源：${src}）——**手改会在下次编译被覆盖**（#762 / K4）`;

/** 纯函数：把各段拼成**产物文件表**（文件名 → 文本）——一个故事可以有多份产物。 */
export const compileStory = ({ tables, contract, rules, notesFace, slug, chargen, story, meta, metaTwee, passages = null }) => {
	const files = {};
	// `#1350` 片 5：把段落**声明面**（params／slot／present ／ links 的非值字段）注入契约（**只声明面** ⇒ ✗ 不含 args 值）
	if (passages && contract && Array.isArray(contract.members)) {
		const specs = {};
		for (const [seg, v] of Object.entries(passages)) {
			if (!v || typeof v !== 'object') continue;
			const l = (Array.isArray(v.links) ? v.links : []).map((x) => {
				const o = {};
				for (const k of ['label', 'to', 'cond', 'prio', 'prereq', 'slot', 'id']) if (x?.[k] !== undefined) o[k] = x[k];
				return o;   // ★ `args` **不进**（运行期数据 ⇒ ✗ 不许烘进产物）
			});
			specs[seg] = { params: v.params ?? {}, present: v.present ?? null, links: l };
		}
		for (const m of contract.members) {
			if (m && m.name === 'passageSpecs') { m.kind = 'const'; m.value = specs; delete m.to; }
		}
	}

	// `#1132` B4：元数据段（`StoryTitle` ／ `StoryData` ／ `StoryIdentity`）由编译期产出。
	// 生成件名沿用 `00-meta.twee`（于是清单／序表／依赖表的路径都不必动；手写件删去后由本函数接管）。形状走 `metaTwee`（**单一权威** 不另写一份；由宿主注入 → core 零依赖保持）；四项数据来自
	// `00-story.json`（`title`／`entry`／`ifid`／`slug`）。格式参数三常量留在 `metaTwee` 里（不因故事而异）。
	// 缺 `ifid` → 大声报（它是 Twine 侧的作品标识；静默补默认值等于换作品）。
	if (meta) {
		// `#1132` B4：元数据段的源是 `data/meta.json`（与其它数据同族 → 生成标记的源在本故事 `data/` 下，
		// 满足 K4 与 literals 两条判据的口径）。缺 `ifid` 即大声报（作品标识不给默认值）。
		if (!meta.ifid) throw new Error(`stories/${slug}/data/meta.json 缺 ifid（元数据段的作品标识，必填且不给默认值）`);
		if (typeof metaTwee !== 'function') throw new Error('compileStory：缺 metaTwee（元数据段的形状单一权威由宿主注入）');
		files['00-meta.twee'] = GENERATED(`stories/${slug}/data/meta.json`) + '\n'
			+ metaTwee({ slug, title: meta.title ?? story?.title, entry: meta.entry ?? story?.entry, ifid: meta.ifid });
	}
	//注意：**段名是必填**：缺失会静默产出 `:: undefined [script]`（无名段落会被载入，而门按段名解析 → 后续判据集体失准；
	// 实测：洞窟翻面时被 `--story2-engine`／`--cave-hollow` 抓到）。定义放最前（`const` 不提升 → 首个使用在 tables 那行）。
	const sec = (x, who) => {
		if (typeof x !== 'string' || !x.trim()) throw new Error(`${who}.section 缺失或非字符串（实得 ${JSON.stringify(x)}）—— 段名是必填，不许产出 \`:: undefined [script]\``);
		return x;
	};
	// `#1350` 片 3：`17-rules.twee` 的来源**可能不止一个**（`rules.json` 与 `passages.json` 的 `links` 合成）
	// ⇒ 标记里**按真实存在的源列全**（✗ 不许写死一个不存在的 ⇒ `generatedFamilyProblems` 会报"源不在磁盘上"✗）
	const notes = (...names) => GENERATED(names.map((n) => `stories/${slug}/data/${n}`).join(' ＋ '));
	if (tables || contract) {
		const parts = [];
		if (tables) {
			parts.push(`:: ${sec(tables.section, 'data/tables.json')} [script]`, notes('tables.json'));
			if (tables.note) parts.push(`// ${tables.note}`);
			parts.push(emitTables(tables), '');
		}
		if (contract) {
			parts.push(`:: ${sec(contract.section, 'data/contract.json')} [script]`, notes('contract.json'));
			if (contract.note) parts.push(`// ${contract.note}`);
			parts.push(emitContract(contract), '');
		}
		files['15-tables.twee'] = parts.join('\n');
	}
	if (chargen) {
		files['18-chargen.twee'] = [`:: ${sec(chargen.section, 'data/chargen.json')} [script]`, notes('chargen.json'), emitChargen(chargen), ''].join('\n');
	}
	if (rules) {
		// 来源＝实际两处（`rules.json` 恒在；`passages.json` 仅当它真带 `links` 时算作第二来源）
		const hasLinks = !!(passages && typeof passages === 'object' && Object.values(passages).some((v) => Array.isArray(v?.links) && v.links.length));
		const ruleSrcs = hasLinks ? ['rules.json', 'passages.json'] : ['rules.json'];
		// ★ `sec()` 的第二个参数只是**报错时的上下文**（段名缺失才能看到）⇒ 用两处来源名合写 ✓
		files['17-rules.twee'] = [`:: ${sec(rules.section, ruleSrcs.map((n) => `data/${n}`).join(' ＋ '))} [script]`, notes(...ruleSrcs), emitRules(rules.rows), ''].join('\n');
	}
	// 车道 B · notes 面（`#215` 报备 `18504282`）：**一个数据文件 → 多份产物**（照“面”的既有形状）。
	//注意：参数名用 `notesFace` —— 本函数里已有一个局部 `notes`（生成标记助手）→ 同名会**直接语法错**。
	if (notesFace) {
		for (const b of notesFace.blocks ?? []) {
			const name = typeof b?.file === 'string' && b.file.trim() ? b.file.trim() : '';
			if (!name) throw new Error('data/notes.json 的块缺 `file`（非空字符串）—— 块名是必填，不许产出无名产物 ✗');
			files[name] = [`:: ${sec(b.section, `data/notes.json 的块 \`${name}\``)} [script]`, notes('notes.json'), emitNotes(b, notesFace), ''].join('\n');
}
}
	return files;
};
