// 契约分类器（`#762` 车道 A 的执行体）：**把故事侧的 `Sg.story.*` 成员归类成声明式 kind**。
//
// 它要回答 P0 的那句验收：**"逃生舱清单为空"到底成不成立**。做法是逐成员看**源码形状**，
// 能归类的给出 kind，归不了类的**点名**（不是"静默跳过"——那才是这类工具最会骗人的地方）。
//
// 四个桶（**分桶口径写死在注释里，免得 C 变成"我不知道怎么表达"的垃圾桶**）：
//   A. **可直接表达**（现有 `KINDS` 能装）
//   B. **需要声明式扩展**（形状能看懂、只是现有 kind 缺字段/缺种类：如 `game-ref` 缺默认值 · `forward` 转发 ·
//      `template` 模板 · `lookup-field` 的 `required`/`via`）—— **凡是"可预见的声明式扩展"能覆盖的一律进 B**
//   D. **可下沉引擎（甲案）**（形状是"引擎能力 ＋ 故事数据"：如查表后用 `Sg.notes.has` 组装）
//      —— 标成一类，是为了让"要不要下沉"成为**显式决定**，而不是分类的副作用
//   C. **真逃生舱候选**（上面都装不下 ⇒ 才考虑 `kind:'js'`，且必须进 `escape-hatch.json` 写理由 ＋ 票号）
//
// 用法：node editor/classify-contract.mjs <slug> [--json]      # 默认只报告；`--json` 打印提案数据
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { scriptBodies } from './lib/core/text.mjs';
import { engineScripts } from './lib/host/fs.mjs';
import { KINDS, GLOBAL_ROOTS } from './compile-story.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** **长度保持**的遮蔽器（注释 ＋ 字符串/模板）：把内容换成空格、**保留换行** ⇒ 下标与原文本一一对应。
 *  为什么自带一个而不是 import：① `report-selftest-validity.mjs` **没有主模块守卫** ⇒ `import` 它会执行它的 CLI
 *  （实测：跑我的分类器会先打一遍它的自检报告）；② 本仓 §9.7 的教训是"**单扫描器按词法一次遮蔽**"，
 *  所以这里是**一次词法扫描**，不是几条正则叠着剥。 */
export const maskAll = (src) => {
	const t = String(src); const out = t.split('');
	const blank = (a, b) => { for (let i = a; i < b; i++) if (t[i] !== '\n') out[i] = ' '; };
	let i = 0;
	while (i < t.length) {
		const c = t[i], n = t[i + 1];
		if (c === '/' && n === '/') { const e = t.indexOf('\n', i); const j = e === -1 ? t.length : e; blank(i, j); i = j; continue; }
		if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); const j = e === -1 ? t.length : e + 2; blank(i, j); i = j; continue; }
		if (c === "'" || c === '"' || c === '`') {
			let j = i + 1;
			while (j < t.length) { if (t[j] === '\\') { j += 2; continue; } if (t[j] === c) { j++; break; } j++; }
			blank(i, j); i = j; continue;
		}
		i++;
	}
	return out.join('');
};

/** 纯函数：从 `[script]` 文本里取出**全部** `Sg.story` 成员定义的源码（多站点合并）。
 *
 *  为什么要扫**多个站点**（实测的漏）：洞窟把契约拆成两处 —— `15-tables.twee` 的 `StoryBindings` 段
 *  （`Object.assign((window.Sg.story ??= {}), {…})`）＋ `Cave Declarations` 段末尾的
 *  `Object.assign(window.Sg.story, { mechanics: … })` ⇒ 只扫第一处会**静默漏掉 `mechanics`**（正是本故事最大的那张表）。
 *  所以：① 两种赋值形态都收；② 其余任何 `Sg.story` 出现（如 `Sg.story.X = …`）**点名报错**，绝不静默跳过。 */
export const contractSites = (text) => {
	const src = String(text);
	const masked = maskAll(src);
	const out = []; const consumed = [];
	const re = /Object\.assign\(\s*\(?\s*window\.Sg\.story|Object\.assign\(\s*window\.Sg\.story/g;
	for (const m of src.matchAll(/Object\.assign\(/g)) {
		const at = m.index;
		// **落在注释/字符串里**的同形文本不是站点（注意：头 200 字符的 `Sg.story` 检查会因**越过注释**而误命中
		//  ⇒ 实测：手写件注释里提一句 `Object.assign((window.Sg.story ??= {}), …)` ⇒ 成员被**数两遍**）。
		if (masked[at] !== 'O') continue;
		// 参数表前缀里必须出现 `Sg.story`，且第二个实参是对象字面量
		const head = masked.slice(at, Math.min(at + 200, masked.length));
		if (!/Sg\.story/.test(head)) continue;
		// ⚠️ 第一个 `{` 可能是**初始化器** `??= {}` ⇒ 必须跳过它，从"第二个实参"的那个 `{` 开始配对
		const skip = /window\.Sg\.story\s*\?\?=\s*\{\s*\}\s*\)|window\.Sg\.story\s*,/.exec(head);
		const from = skip ? at + skip.index + skip[0].length : at;
		const open = masked.indexOf('{', from);
		if (open === -1) continue;
		let depth = 0, end = -1;
		for (let i = open; i < masked.length; i++) {
			if (masked[i] === '{') depth++;
			else if (masked[i] === '}') { depth--; if (!depth) { end = i; break; } }
		}
		if (end === -1) continue;
		consumed.push([at, end]);
		out.push({ at, members: membersIn(src.slice(open + 1, end), masked.slice(open + 1, end)) });
	}
	void re;
	// 反沉默：还有没有被认领的 `Sg.story` 出现？
	const stray = [];
	for (const m of src.matchAll(/Sg\.story\s*\.\s*[A-Za-z_$][\w$]*\s*=(?!=)|Sg\.story\s*=/g)) {
		if (!consumed.some(([a, b]) => m.index >= a && m.index <= b)) stray.push(m[0].trim());
	}
	return { sites: out, stray };
};

/** 纯函数：块体内的成员切分（按深度 0 逗号；成员上方的文档注释剔掉）。 */
export const membersIn = (body, maskedBody) => {
	const out = []; let start = 0, d = 0;
	for (let i = 0; i <= maskedBody.length; i++) {
		const c = maskedBody[i];
		if (c === '{' || c === '(' || c === '[') d++;
		else if (c === '}' || c === ')' || c === ']') d--;
		else if ((c === ',' && d === 0) || i === maskedBody.length) {
			let chunk = body.slice(start, i).trim(); start = i + 1;
			chunk = chunk.replace(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*|\s*\n)*/g, '').trim();
			if (!chunk) continue;
			const ci = chunk.indexOf(':');
			if (ci === -1) continue;
			out.push({ name: chunk.slice(0, ci).trim(), src: chunk.slice(ci + 1).trim() });
		}
	}
	return out;
};

/** 兼容入口：单站点形态（旧调用方）——多站点请用 `contractSites()`。 */
export const contractMembers = (text) => {
	const { sites } = contractSites(text);
	return sites.flatMap((s2) => s2.members);
};

/** 纯函数：把**字面量源码**解析成值（`'false'` ⇒ `false`、`'({a:1})'` ⇒ `{a:1}`）。
 *  解析不出（含变量／模板串插值等）⇒ `undefined`（调用方落 B，不假装 A）。
 *  ⚠️ 分类器曾把字面量按 `raw: 源码` 放进 spec，而编译器只认 `value:` ⇒ 静默产出 `() => undefined`（容器比对与 L3 都看不出来，只有**行为**探针抓到）⇒ 现在统一到 `value`，编译器另加 fail-loud。 */
export const literalValue = (src) => {
	try {
		const v = vm.runInContext(`(${String(src)})`, vm.createContext({ console: { log() {} } }), { timeout: 1000 });
		// ⚠️ **值里含函数 ⇒ 一律不当字面量** ✗：`JSON.parse(JSON.stringify(...))` 会把函数**静默丢掉** ⇒
		// 判成 `const` 后一旦数据化 ⇒ 函数消失、行为静默改变 ✗（实测：`socialHooks` 这类"字面量＋函数"的成员
		// 曾被判 A ✓ —— 那是**假 A**）。⇒ 深查一层，含函数就返回 undefined（调用方落 B，诚实 ✓）。
		const hasFn = (x, d = 0) => {
			if (typeof x === 'function') return true;
			if (d > 6 || !x || typeof x !== 'object') return false;
			return Object.values(x).some((y) => hasFn(y, d + 1));
		};
		if (hasFn(v)) return undefined;
		return JSON.parse(JSON.stringify(v));
	} catch { return undefined; }
};
/** 纯函数：兜底表达式 → 小 enum（与编译器 `fallbackExpr` 的封闭集一致；认不出返回 null）。 */
export const fbEnum = (expr, key) => {
	const e = String(expr).trim();
	if (e === 'null') return { kind: 'null' };
	if (e === `String(${key})`) return { kind: 'string-identity' };
	if (/^-?\d+(\.\d+)?$/.test(e) || /^(true|false)$/.test(e) || /^'[^']*'$/.test(e)) {
		try { return { kind: 'const', value: JSON.parse(e.replace(/^'([^']*)'$/, '"$1"')) }; } catch { return null; }
	}
	return null;
};

/** 纯函数：把一个成员的值表达式归类。返回 `{ bucket, kind, spec?, why? }`。 */
export const classify = (srcIn, ctx = {}) => {
	const s = String(srcIn).replace(/\s+/g, ' ').trim();
	const A = (kind, spec = {}) => {
		// **单一权威**：A 桶＝"编译器真能装下"。KINDS 里没有 ⇒ 分类器自己的口径腐烂了 ⇒ 当场抛错。
		if (!(kind in KINDS)) throw new Error(`分类器把 kind「${kind}」当 A 桶，但编译器 KINDS 里没有 ⇒ 两边口径已漂移`);
		return { bucket: 'A', kind, spec };
	};
	const B = (kind, spec, why) => ({ bucket: 'B', kind, spec, why });
	const C = (why) => ({ bucket: 'C', why });
	if (/^\(\) => null$/.test(s)) return A('null');
	if (/^\(\) => \(\{\}\)$/.test(s) || /^\(\) => \{\}$/.test(s)) return A('empty-object');
	if (/^\(\) => \[\]$/.test(s)) return A('empty-array');
	if (/^\(\) => !!window\./.test(s)) return A('bool-exists', { path: s.replace(/^\(\) => !!window\./, '').trim() });
	if (/^\((\w+)\) => String\(\1\)$/.test(s)) return A('identity-string');   // ⚠️ 捕获组要写 `\((\w+)\)`：`\(`/`\)` 是**字面括号**，不是分组
	if (/^\(\) => window\.[\w$.]+$/.test(s)) return A('game-ref', { path: s.replace(/^\(\) => window\./, '') });
	const gr = /^\(\) => ([\w$.()?]+) \?\? (.+)$/.exec(s);
	if (gr && /^(window\.|Sg\.)/.test(gr[1])) {
		// 两个同族坑（都在此行实测踩过，产生物才看得见）：
		// ① `path` 同样是 **`window.` 之后**的路径（生成器写 `window.${path}`）⇒ 不剥就成 `window.window.…`；
		// ② 默认值必须存**值**而不是源码文本（`{}` 存成字符串 `'{}'` ⇒ `Sg.story.notes()` 返回 **string** ✗，
		//    下游一堆门（canon/state/rules/notes-write）被带红）。
		const p = gr[1].replace(/^(window\??\.)/, '').replace(/[?.]+$/, '');
		const d = literalValue(gr[2]);
		if (d === undefined && String(gr[2]).trim() !== 'undefined') return B('game-ref', { path: p }, `默认值 \`${gr[2]}\` 不是字面量 ⇒ 需人工`);
		return A('game-ref', { path: p, default: d, optional: /\?\./.test(gr[1]) });
	}
	// 守卫取数（路径形态）：`() => { const v = window.Game?.Dragon?.hp; if (typeof v !== 'number') throw new Error('…'); return v; }`
	// ⇒ `game-ref` ＋ `required`（＋ `type`）。报文**必须是字面量**（否则落 B：不许把表达式拼进产物）。
	const guardedRef = /^\(\) => \{ const (\w+) = ((?:window|Sg)\.[\w$.?\[\]'"]+); if \((!\1|typeof \1 !== '(\w+)')\) throw new Error\((.+)\); return \1; \}$/.exec(s);
	if (guardedRef) {
		const err = literalValue(guardedRef[5]);
		if (typeof err !== 'string' || err.trim() === '') return B('game-ref', { path: guardedRef[2].replace(/^window\./, '') }, '守卫的报错报文不是**非空字符串字面量** ⇒ 需人工');
		return A('game-ref', { path: guardedRef[2].replace(/^window\./, ''), optional: /\?\./.test(guardedRef[2]), required: true, ...(guardedRef[4] ? { type: guardedRef[4] } : {}), error: err });
	}
	// `(k) => <来自……>?.[k] ?? <默认>` ／ `(k) => { const v = …; if (!v) throw …; return v; }`
	// 根判定（`#787` 实测）：`window.`／`Sg.` 前缀 ＝ 全局；否则首段要么在**全局白名单**、要么是本文件的**局部常量**
	// ⇒ 后者映射成 `fromMember`（局部常量在产物里**不存在** ⇒ 走全局读会静默 undefined ✗，六个成员一起变 null）。
	// 认不出的根 ⇒ 返回 null（调用方落 B，**不许**假装 A ✗）。
	const rooted = (chain) => {
		const c = String(chain).replace(/[?.]+$/, '');
		if (/^(window\.|Sg\.)/.test(c)) return { from: c };
		const root = c.split(/[.?]/)[0];
		if (GLOBAL_ROOTS.includes(root)) return { from: c };
		const member = ctx.locals?.get(root);
		if (member) {
			const rest = c.split('.').slice(1).join('.');
			return { fromMember: member, ...(rest ? { path: rest } : {}) };
		}
		return null;
	};
	const lookup = /^\((\w+)\) => ([\w$.()?]+)\[(\1)\] \?\? (.+)$/.exec(s);
	if (lookup) {
		// ⚠️ 同族坑（今天第 3 次）：spec 里放的必须是**值**，不是**源码文本** ——
		// 曾把 `?? null` 的兜底存成字符串 `"null"` ⇒ 产物成了 `?? "null"`（返回字符串！），容器比对与 L3 都看不出来。
		const d = literalValue(lookup[4]);
		const r1 = rooted(lookup[2]);
		if (!r1) return B('lookup', { from: lookup[2].replace(/[?.]+$/, ''), key: lookup[1] }, `根不是全局也不是本文件的成员常量 ⇒ 需人工（局部常量不能当全局读）`);
		if (d === undefined && lookup[4].trim() !== 'undefined') return B('lookup', { ...r1, key: lookup[1] }, `兜底 \`${lookup[4]}\` 不是字面量 ⇒ 需人工`);
		return A('lookup', { ...r1, key: lookup[1], default: d });
	}
	const field = /^\((\w+)\) => ([\w$.()?]+)\[(\1)\]\??\.(\w+) \?\? (.+)$/.exec(s);
	if (field) {
		// ⚠️ 捕获组下标：m[3] 是回参照捕获（`(\1)` 也是组）⇒ 字段在 m[4]
		// 兜底必须是**小 enum**（编译器硬化后不再收裸表达式）⇒ 这里把常见三形态翻成 enum，认不出的落 B。
		const fb = fbEnum(field[5], field[1]);
		const r2 = rooted(field[2]);
		if (!r2) return B('lookup-field', { from: field[2].replace(/[?.]+$/, ''), key: field[1], field: field[4] }, `根不是全局也不是本文件的成员常量 ⇒ 需人工`);
		if (!fb) return B('lookup-field', { ...r2, key: field[1], field: field[4] }, `兜底 \`${field[5]}\` 不是小 enum 里的形态（需要新 kind 或人工）`);
		return A('lookup-field', { ...r2, key: field[1], field: field[4], fallback: fb });
	}
	const guarded = /^\((\w+)\) => \{ const (\w+) = ([\w$.()?]+)\[\1\]; if \(!\2\) throw new Error\((`[^`]*)`\); return \2; \}$/.exec(s);
	if (guarded) {
		const r3 = rooted(guarded[3]);
		if (!r3) return B('lookup', { from: guarded[3].replace(/[?.]+$/, ''), key: guarded[1] }, '根不是全局也不是本文件的成员常量 ⇒ 需人工');
		// 报错文案要**照源搬**（不是让它走编译器的默认泛化句）：实测行为门比"两侧抛错文案"时暴露过差异。
		// ⚠️ 用**独立**一条宽容正则从成员源里抓（不在那个大模式里加组：实测会**掉最后一个字**）。
		const em = /throw new Error\(`([\s\S]*?)`\)/.exec(s);
		const errTpl = em ? em[1].replaceAll('${' + guarded[1] + '}', '{key}') : null;
		return A('lookup', { ...r3, key: guarded[1], required: true, ...(errTpl ? { error: errTpl } : {}) });
	}
	const state = /^\((\w+)\) => \1\?\.([\w$.]+) \?\? (.+)$/.exec(s);
	if (state) {   // 同族坑：兜底也必须是**值**（源码文本会让产物返回字符串）
		const d = literalValue(state[3]);
		if (d === undefined && state[3].trim() !== 'undefined') return B('state-ref', { path: state[2] }, `兜底 \`${state[3]}\` 不是字面量 ⇒ 需人工`);
		return A('state-ref', { path: state[2], default: d });
	}
	const paren = /^\(\) => \((.*)\)$/.exec(s);              // `() => ({…})` / `() => ([…])`
	if (paren && /^[{\[]/.test(paren[1].trim())) { const v = literalValue(paren[1]); return v === undefined ? B('const', { src: paren[1].trim() }, '字面量解析不出（含变量/插值？）⇒ 需人工') : A('const', { value: v }); }
	if (/^\(\) => (\{.*\}|\[.*\]|null|true|false|-?\d+(\.\d+)?|'[^']*'|`[^`]*`)$/.test(s)) {
		const v = literalValue(s.replace(/^\(\) => /, ''));
		return v === undefined ? B('const', { src: s }, '字面量解析不出 ⇒ 需人工') : A('const', { value: v });
	}
	const D = (why, sink) => ({ bucket: 'D', why, sink });
	// 选牌策略（内容政策）⇒ 可下沉为"前置选牌规则表"（引擎解释规则、故事只给数据）
	if (/=> \(.*\bpoolId\b.*\?.*:.*null\)$/.test(s) || /=> \([\s\S]*includes\(/.test(s)) return D('选牌/前置决策：形状＝「一组条件 ⇒ 选哪个」⇒ 可下沉为**规则表**（引擎解释、故事给数据）', '前置选牌规则表');
	// 查表后用 Sg.notes.* 组装返回值 ⇒ 知识映射：引擎能力，故事只给映射数据
	if (/Sg\.notes\./.test(s)) return D('知识映射：查表 ＋ 用 `Sg.notes` 组装 ⇒ 属**引擎能力**，故事只需给映射数据', '知识映射（引擎组装 {flag, why, held}）');
	// `() => <标识符>`：**引用本段的局部常量**（如 `mechanics: () => MECH`）⇒ 值本身是数据，
	// 只是不在这一行 ⇒ 归 B（迁移时把 `const MECH = {…}` 的字面量搬进 `data/`，不是写代码）。
	const localRef = /^\(\) => ([A-Za-z_$][\w$]*)$/.exec(s);
	if (localRef) return B('const', { ref: localRef[1] }, `引用局部常量 \`${localRef[1]}\` ⇒ 迁迁移时把它的**字面量**搬进 data（值仍是数据，不是逻辑）`);
	// 模板拼句：`const bits = []; … bits.push(…)` ⇒ 可声明为 `template` kind
	if (/const (\w+) = \[\];[\s\S]*\1\.push\(/.test(s)) return B('template', { raw: s }, '按条件拼句 ⇒ 可用 **`template` kind** 表达（parts.when/text ＋ join/suffix）');
	// 派生字段：`const a = <链>(key); … typeof a.<字段> !== 'string' …` ⇒ `lookup-field` ＋ `via`/`required`
	const derived = /^\((\w+)\) => \{ const (\w+) = ([\w$.()]+)\(\1\); if \(typeof \2\.(\w+) !== 'string' \|\| !\2\.\4\) throw new Error\(.*\); return \2\.\4; \}$/.exec(s);
	if (derived) {
		// `via` 在**契约 JSON** 里存的是**成员名**（生成器的 schema：`window.Sg.story.${via}(k)` ⇒ 只许本故事成员的裸名），
		// 而源里写的是全链（`window.Sg.story.combatAction`）⇒ 这里剥前缀；剥完不像成员名 ⇒ 落 B（不许写出编译器读不了的提案）。
		const via = derived[3].replace(/^(window\.)?Sg\.story\./, '');
		if (!/^[A-Za-z_$][\w$]*$/.test(via)) return B('lookup-field', { via: derived[3], key: derived[1], field: derived[4] }, `派生字段的链 \`${derived[3]}\` 不是本故事成员名（生成器只认成员名）⇒ 需人工`);
		return A('lookup-field', { via, key: derived[1], field: derived[4], required: true });   // `#775` 起 `lookup-field` 支持 `via`/`required`
	}
	// 参数**转发**（形参序与表函数不同）：声明式可表达，但需要 `kind:'forward'`
	const fwd = /^\(([\w, ]+)\) => ([\w$.()?]+)\(([^()]*)\)$/.exec(s);
	if (fwd) {
		// `forward.to` 是**`window.` 之后的路径**（生成器写 `window.${to}(…)`）⇒ 源里常写成全链 ⇒ 剥前缀；
		// 不剥会生成 `window.window.…`（实测：行为探针抓到"两侧报错文案不同"才暴露）。
		const to = fwd[2].replace(/^window\??\./, '');
		return A('forward', { to, params: fwd[1].split(',').map((x) => x.trim()).filter(Boolean), args: fwd[3].split(',').map((x) => x.trim()).filter(Boolean) });   // `#775` 起有 `forward`
	}
	return C('形状不在已知 kind 集合里（含任意逻辑或写法特异）');
};

const selftest = () => {
	let bad = 0;
	let n = 0;
	const t = (label, ok, got = '') => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}${ok ? '' : `\n    实得：${got}`}`); };
	const kindOf = (src) => classify(src).kind ?? classify(src).bucket;
	t('`forward` 的 `to` 存 **window. 之后的路径**（生成器写 `window.${to}` ⇒ 存全链会生成 `window.window.…`：实测只在**行为探针的报错文案**上暴露）', (() => { const r = classify('(a) => window.Game.Items.f(a)'); return r.bucket === 'A' && r.spec.to === 'Game.Items.f'; })());
	t('反例：注释里提到 `Object.assign((window.Sg.story ??= {}), …)` ⇒ **不算站点**（否则成员被数两遍）', contractSites("// 合并语义：`Object.assign((window.Sg.story ??= {}), …)` 与生成物同形\nObject.assign((window.Sg.story ??= {}), { a: () => null });").sites.length === 1);
	t("`game-ref` 的 `path` 存 `window.` 之后的路径、默认值存**值**（`?? {}` ⇒ 对象，不是字符串）", (() => { const r = classify('() => window.Game?.Notes?.entries ?? {}'); return r.bucket === 'A' && r.spec.path === 'Game?.Notes?.entries' && typeof r.spec.default === 'object' && r.spec.default !== null; })());
	t('`() => null` ⇒ null', kindOf('() => null') === 'null');
	t('`() => ({}` / `[]` ⇒ empty-*', kindOf('() => ({})') === 'empty-object' && kindOf('() => []') === 'empty-array');
	t('`(id) => String(id)` ⇒ identity-string（**陷阱回归**：`\(` 是字面括号，捕获组必须写 `\((\w+)\)`）', kindOf('(id) => String(id)') === 'identity-string');
	t('`(k) => <链>[k] ?? <默认>` ⇒ lookup（含 `?.` 链）', (() => { const r = classify('(id) => window.Game?.Items?.defs?.[id] ?? null'); return r.kind === 'lookup' && r.spec.from === 'window.Game?.Items?.defs' && r.spec.default === null; })());
	t('`const` 的 spec 用 **`value`（值）而不是 `raw`（源码）** —— 编译器只认 `value`，写 `raw` 会静默产出 `() => undefined`', (() => {
		const r = classify('() => false');
		return r.bucket === 'A' && r.spec.value === false && !('raw' in r.spec);
	})());
	t('守卫取数（路径）⇒ `game-ref` ＋ `required`/`type`，**报文取字面量**', (() => {
		const r = classify("() => { const v = window.Game?.Dragon?.hp; if (typeof v !== 'number') throw new Error('Sg.story.dragonMaxHp：结构缺失必须报错'); return v; }");
		return r.bucket === 'A' && r.kind === 'game-ref' && r.spec.required === true && r.spec.type === 'number' && r.spec.optional === true && r.spec.error.includes('结构缺失');
	})());
	t('守卫取数（`if (!v)` 形态）⇒ `game-ref` ＋ `required`（无 `type`）', (() => {
		const r = classify("() => { const v = window.Game.Items.poisonReduce; if (!v) throw new Error('缺'); return v; }");
		return r.bucket === 'A' && r.spec.required === true && !('type' in r.spec);
	})());
	t('守卫取数的报文是**空串** ⇒ 落 B（空报文等于"报什么错没人知道"）', (() => {
		const r = classify("() => { const v = window.Game.X.y; if (!v) throw new Error(''); return v; }");
		return r.bucket === 'B';
	})());
	t('守卫取数的报文**不是字面量** ⇒ 落 B（不许把表达式拼进产物）', (() => {
		const r = classify("() => { const v = window.Game.X.y; if (!v) throw new Error(`坏 ${v} 的 X`); return v; }");
		return r.bucket === 'B';
	})());
	t('值里含**函数** ⇒ 不当字面量（否则会被静默丢掉 ⇒ 假 A ✗）', literalValue("({ a: 1, f: () => 1 })") === undefined);
	t('字面量解析：对象/数组字面量 ⇒ 真值（`({a:1})` ⇒ `{a:1}`）', (() => {
		const r = classify('() => ({ a: 1, b: [2] })');
		return r.bucket === 'A' && r.spec.value.a === 1 && r.spec.value.b[0] === 2;
	})());
	t('`(k) => <链>[k]?.<字段> ?? <兜底>` ⇒ lookup-field，且兜底翻成**小 enum**（`String(k)` ⇒ string-identity）', (() => { const r = classify("(id) => window.Sg.story.mechanics()?.actions?.[id]?.label ?? String(id)"); return r.kind === 'lookup-field' && r.spec.field === 'label' && r.spec.fallback.kind === 'string-identity'; })());
	t('兜底是**裸表达式** ⇒ 该成员落 B（编译器已不收，分类器不许假装 A）', classify("(id) => window.Game.Items.defs?.[id]?.x ?? (id + '!')").bucket === 'B');
	t('`{ const s = …; if (!s) throw …; return s; }` ⇒ lookup + required（变量名任意）', (() => { const r = classify('(name) => { const s = window.Game?.Checks?.sites?.[name]; if (!s) throw new Error(`x`); return s; }'); return r.kind === 'lookup' && r.spec.required === true; })());
	t('`(pc) => pc?.dragon ?? {}` ⇒ state-ref', (() => { const r = classify('(pc) => pc?.dragon ?? {}'); return r.kind === 'state-ref' && r.spec.path === 'dragon'; })());
	t('`() => ({ … })`（括号包裹的对象）⇒ const', kindOf('() => ({ star: { charge: 12 } })') === 'const');
	t('`() => window.X ?? <默认>` ⇒ **A**（`#775` 起 `game-ref` 支持默认值 ＋ `optional`）', (() => { const r = classify('() => window.Game?.Notes?.entries ?? {}'); return r.bucket === 'A' && r.spec.optional === true; })());
	t('参数转发 ⇒ **A**（`#775` 起有 `forward`，含形参序）', (() => { const r = classify('(inv, round, defeats, poisoned) => window.Game.Items.battleDamage(round, inv, defeats, poisoned)'); return r.bucket === 'A' && r.spec.args[0] === 'round'; })());
	t('选牌策略 ⇒ **D**（可下沉为规则表）', classify("(poolId, round, pc, picked) => (poolId === '封印' && (picked ?? []).includes('x') ? 'y' : null)").bucket === 'D');
	t('查表后用 `Sg.notes.*` 组装 ⇒ **D**（引擎能力）', classify('(name, pc) => { const f = window.Game.Checks.knowledge[name]; if (!f) return null; return { flag: f, held: Sg.notes.has(f, pc) }; }').bucket === 'D');
	t('模板拼句 ⇒ **B**（`template` kind）', (() => { const r = classify('(r, base) => { const bits = []; if (r?.gold > 0) bits.push(base); return bits.join(); }'); return r.bucket === 'B' && r.kind === 'template'; })());
	t('陷阱回归②：`\\(\\1\\)` 若是**捕获组**会让后面的 `\\2`/`\\4` 整体错位 ⇒ 必须写非捕获 `\\(?:\\1\\)`', (() => {
		const r = classify("(id) => { const a = window.Sg.story.combatAction(id); if (typeof a.label !== 'string' || !a.label) throw new Error(`x`); return a.label; }");
		return r.bucket === 'A' && r.spec.field === 'label';   // 本例要证的是**捕获组下标**（字段取到 label），分桶随 KINDS 变
	})());
	t('派生字段（经成员调用）⇒ **A**（`#775` 起 `lookup-field` 有 `via`/`required`；`via` 存**成员裸名**，因为生成器写 `window.Sg.story.${via}(k)`）', (() => { const r = classify("(id) => { const a = window.Sg.story.combatAction(id); if (typeof a.label !== 'string' || !a.label) throw new Error(`x`); return a.label; }"); return r.bucket === 'A' && r.spec.via === 'combatAction'; })());
	t('反例：派生字段的链不是成员名 ⇒ **B**（不许提案出生成器读不了的 JSON）', (() => { const r = classify("(id) => { const a = window.Game.Combat.actions[id]; if (typeof a.label !== 'string' || !a.label) throw new Error(`x`); return a.label; }"); return r.bucket !== 'A'; })());
	t('选牌条件表达式 ⇒ **D**（不是 C：它能下沉成规则表）', classify("(poolId, round, pc, picked) => (poolId === '封印' && round === 1 ? 'x' : null)").bucket === 'D');
	t('真表达不了的形状 ⇒ **C**', classify('(x) => { const y = [...x].reverse().map((v) => v * 2); return y; }').bucket === 'C');
	t('`contractMembers`：能从段落文本里切出成员（注释不算成员）', (() => {
		const txt = ':: StoryBindings [script]\nObject.assign((window.Sg.story ??= {}), {\n\t// 文档注释：不属于上一个成员\n\ta: () => null,\n\tb: () => [],\n});';
		const ms = contractMembers(txt);
		return ms.length === 2 && ms[0].name === 'a' && ms[1].name === 'b';
	})());
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log(`\n✔ 自证通过（${n} 例：8 个 kind 形状 ＋ A/B/C/D 四桶分界 ＋ 两条捕获组陷阱回归 ＋ 成员切分）`);
};

const isMain0 = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain0 && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

/** 纯函数：把 `() => <局部常量>` 解析成它的**值**（不手抄）。
 *  做法：在浏览器语义沙箱里跑该文件的 `[script]` 段 ＋ 追加一行 `window.__probe = <标识符>;` ⇒ 读出来。
 *  取不到（未定义/非 JSON 化）⇒ 返回 null（调用方保持 B 桶，不假装成功）。 */
export const resolveLocalConst = (fileText, sectionName, ident) => {
	const bodies = scriptBodies(fileText);
	const box = { console: { log() {}, error() {} } };
	box.window = box;
	vm.createContext(box);
	try {
		vm.runInContext(engineScripts() + '\n' + bodies.join('\n') + `\n;window.__probe = (typeof ${ident} === 'function' ? undefined : ${ident});`, box, { timeout: 5000 });
	} catch { return null; }
	const v = box.__probe;
	if (v === undefined) return null;
	try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
};

/** 手写逃生舱文件（`#787` 翻面）：生成物**装不进**非 A 桶成员 ⇒ 它们住**手写**文件，
 *  登记在 `editor/escape-hatch.json` 的 `hatchFiles`（仓内相对路径）。
 *  分类器与门据此把**完整契约**看全：否则"成员搬出手写文件"会被读成"登记腐烂"的**假红** ✗。
 *  返回值：过滤到该 slug 的绝对路径数组。 */
export const hatchFiles = (slug) => {
	const p = join(ROOT, 'editor', 'escape-hatch.json');
	if (!existsSync(p)) return [];
	return (JSON.parse(readFileSync(p, 'utf8')).hatchFiles ?? []).filter((f) => !slug || f.includes(`stories/${slug}/`)).map((f) => join(ROOT, f));
};

/** **行首**的生成标记才算（与 K4 的 `hasMarker` 同口径：注释里提到该词的文件不是产物）。 */
export const hasGeneratedMarker = (text) => /^\s*\/\/\s*@generated\b/m.test(String(text ?? ''));

const main = () => {
	const argOf = (name, dflt) => { const h = process.argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(name.length + 3) : dflt; };
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/classify-contract.mjs <slug> [--json]'); process.exit(2); }
	const file = join(ROOT, argOf('from', `stories/${slug}/15-tables.twee`));
	// 契约源＝**手写的**数据面文件（`15-tables.twee`）＋ 登记过的手写逃生舱文件。
	// ⚠️ 已翻面的故事里 `15-tables.twee` 是**产物**（带生成标记）⇒ **不能**分类它：发射后的代码形状会得到
	// "假欠账"（实测：`template` 那种被判 B）⇒ 那种情况下只剩逃生舱文件是手写源（与 K4 同一口径）。
	const tableSrc = existsSync(file) && !hasGeneratedMarker(readFileSync(file, 'utf8')) ? readFileSync(file, 'utf8') : '';
	if (!tableSrc) console.log(`  · ${slug}：\`15-tables.twee\` 已是**产物**（带生成标记）⇒ 契约面已由 \`data/\` 承载；本次只判**手写逃生舱文件** ✓`);
	const hatchFilesOf = hatchFiles(slug);
	const hatchTexts = hatchFilesOf.map((f) => readFileSync(f, 'utf8'));
	const allText = [tableSrc, ...hatchTexts].join('\n');
	const { sites, stray } = contractSites(allText);
	const members = sites.flatMap((s2) => s2.members);
	if (!members.length) { console.error(`✗ ${file} 里找不到 Sg.story 成员（读不到输入不许当"没有故事逻辑"）`); process.exit(1); }
	if (stray.length) { console.error(`✗ ${file} 里还有**未被识别的** Sg.story 写法（${stray.join(' · ')}）—— 多站点合并只认 Object.assign 形态，其余必须点名而不是静默漏掉`); process.exit(1); }
	console.log(`（站点 ${sites.length} 处：${sites.map((s2) => s2.members.length + ' 名成员').join(' ＋ ')}${hatchTexts.length ? ` · 含手写逃生舱文件 ${hatchFiles(slug).map((f) => f.split('/').pop()).join('、')}` : ''}）`);
	// **局部常量 ⇒ 成员名**（`#787`）：`mechanics: () => MECH` 这类成员把局部常量放进了契约 ⇒ 其它成员引用它时才可表达。
	const locals = new Map();
	const hatchMembers = new Set(contractMembers(hatchTexts.join('\n')).map((m) => m.name));
	for (const m of members) {
		const ref = /^\(\) => ([A-Za-z_$][\w$]*)$/.exec(m.src.replace(/\s+/g, ' ').trim());
		if (ref) locals.set(ref[1], m.name);
	}
	const rows = members.map((m) => {
		const c = classify(m.src, { locals });
		if (c.bucket === 'B' && c.kind === 'const' && c.spec?.ref) {
			const value = resolveLocalConst(fileText, 'Game Tables', c.spec.ref);
			if (value !== undefined && value !== null) return { name: m.name, src: m.src, bucket: 'A', kind: 'const', spec: { value }, resolvedFrom: c.spec.ref };
		}
		return { name: m.name, src: m.src, ...c };
	});
	const bucket = (b) => rows.filter((r) => r.bucket === b);
	console.log(`══ 契约分类（${slug}）：${rows.length} 个成员 ══`);
	for (const r of rows) {
		const mark = { A: '✓', B: '~', D: '↓', C: '✗' }[r.bucket];
		const tail = r.bucket === 'A' ? r.kind
			: r.bucket === 'B' ? `需要扩展 ${r.kind}（${r.why}）`
			: r.bucket === 'D' ? `可下沉：${r.sink}`
			: `逃生舱候选：${r.why}`;
		console.log(`  ${mark} ${r.name.padEnd(18)} ${tail}`);
		if (r.bucket !== 'A') console.log(`      源码：${r.src.replace(/\s+/g, ' ').slice(0, 150)}`);
	}
	console.log(`\n  汇总：可直接表达 ${bucket('A').length} · 需声明式扩展 ${bucket('B').length} · 可下沉引擎 ${bucket('D').length} · **真逃生舱候选 ${bucket('C').length}**`);
	if (bucket('B').length || bucket('D').length) console.log(`  （B＝待补的声明式 kind；D＝待下沉的引擎能力 ⇒ 都**不是**逃生舱）`);
	if (process.argv.includes('--json')) console.log('\n' + JSON.stringify({ slug, members: rows }, null, '\t'));
	// `--propose[=<path>]`：把**全部可数据化的成员**写成故事包的 `data/contract.json`（生成物 ⇒ 单一真源）。
	// 只要还有非 A 成员就 **fail-loud**（点名）—— 提案必须完整，不许悄悄少写一半（那会让产物静默缺成员）。
	const proposeArg = process.argv.find((a) => a === '--propose' || a.startsWith('--propose='));
	if (proposeArg && !tableSrc) { console.error(`✗ ${slug} 的 \`15-tables.twee\` 已是**产物** ⇒ 没有什么可提案的（数据面已由 \`data/contract.json\` 承载）`); process.exit(1); }
	if (proposeArg) {
		const aRows = rows.filter((r) => !hatchMembers.has(r.name));   // 逃生舱成员不进提案（它们住手写件）
		const bad = aRows.filter((r) => r.bucket !== 'A');
		if (bad.length) {
			console.error(`✗ 无法提案：${bad.length} 个成员不是 A 桶、且**没住进**登记过的手写逃生舱文件 ⇒ ${bad.map((r) => `${r.name}(${r.bucket})`).join(' · ')}`);
			console.error('  生成物只装得下 A 桶 ⇒ 非 A 成员必须移到手写件并在 `editor/escape-hatch.json` 的 `hatchFiles` 登记（否则翻面就是**静默丢成员**）。');
			process.exit(1);
		}
		const out = proposeArg.includes('=') ? proposeArg.split('=')[1] : join(ROOT, `stories/${slug}/data/contract.json`);
		const payload = {
			section: 'StoryBindings',
			note: '分类器自动提案（`--propose`）：本文件是**生成物**，请勿手改；要改成员形状改故事源或 classifier 的 kind 集合。',
			members: aRows.map((r) => ({ name: r.name, kind: r.kind, ...(r.spec ?? {}) })),
		};
		writeFileSync(out, JSON.stringify(payload, null, '\t') + '\n');
		console.log(`✔ 提案已写出：${out}（成员 ${aRows.length} 个 ⇒ 全部 A 桶）`);
		process.exit(0);
	}
	// 非 A 的全部**点名**（不是静默跳过）：B 是"schema 该补"，C 是"要么下沉引擎、要么进逃生舱清单"
	process.exit(bucket('C').length ? 1 : 0);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
