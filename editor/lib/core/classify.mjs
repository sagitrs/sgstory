// `#794` 内核抽取 · **core 层**：契约成员分类器（**浏览器安全**：本模块不 import 任何宿主能力）。
//
// **形状**：core 导出的是**工厂** `makeClassify({ evalLiteral})` —— 而不是直接导出 `classify`。
// 理由①（正确性）：`classify` 要判"字面量 → 值"（`() => ({a:1})` 这类），而求值在浏览器与 Node 里实现不同
//（CLI＝`node:vm` ／WebUI＝真浏览器）→ 能力只能**注入**，内核自己不许碰。
// 理由②（K6 ①）：若 core 直接导出 `classify`，壳里就得再写一个同名包装 → 会被"core 能力不许外再定义"判红；
// 工厂让壳拿到的只是**实例**（`makeClassify({ evalLiteral})` 的返回值）→ 不是第二份定义。
//
// **未注入时的方向**：不提供默认实现（不猜）。壳一律注入；若谁忘了注入 → 求值处会抛 `evalLiteral 未注入`，
// 属**可见**失败（不静默落 A/B）。
import { GLOBAL_ROOTS, KINDS } from './emit.mjs';

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

/** 纯函数：把一个成员的值表达式归类。返回 `{ bucket, kind, spec?, why?}`。 */

export const makeClassify = ({ evalLiteral } = {}) => {
	const literalValue = (...a) => { if (typeof evalLiteral !== 'function') throw new Error('classify：`evalLiteral` 未注入（字面量求值是宿主能力；CLI 用 node:vm、WebUI 用真浏览器）'); return evalLiteral(...a); };

	const classify = (srcIn, ctx = {}) => {
		const s = String(srcIn).replace(/\s+/g, ' ').trim();
		const A = (kind, spec = {}) => {
			// **单一权威**：A 桶＝"编译器真能装下"。KINDS 里没有 → 分类器自己的口径腐烂了 → 当场抛错。
			if (!(kind in KINDS)) throw new Error(`分类器把 kind「${kind}」当 A 桶，但编译器 KINDS 里没有 ⇒ 两边口径已漂移`);
			return { bucket: 'A', kind, spec };
		};
		const B = (kind, spec, why) => ({ bucket: 'B', kind, spec, why });
		const C = (why) => ({ bucket: 'C', why });
		if (/^\(\) => null$/.test(s)) return A('null');
		if (/^\(\) => \(\{\}\)$/.test(s) || /^\(\) => \{\}$/.test(s)) return A('empty-object');
		if (/^\(\) => \[\]$/.test(s)) return A('empty-array');
		if (/^\(\) => !!window\./.test(s)) return A('bool-exists', { path: s.replace(/^\(\) => !!window\./, '').trim() });
		if (/^\((\w+)\) => String\(\1\)$/.test(s)) return A('identity-string');   //注意：捕获组要写 `\((\w+)\)`：`\(`/`\)` 是**字面括号**，不是分组
		if (/^\(\) => window\.[\w$.]+$/.test(s)) return A('game-ref', { path: s.replace(/^\(\) => window\./, '') });
		const gr = /^\(\) => ([\w$.()?]+) \?\? (.+)$/.exec(s);
		if (gr && /^(window\.|Sg\.)/.test(gr[1])) {
			// 两个同族坑（都在此行实测踩过，产生物才看得见）：
			// ① `path` 同样是 **`window.` 之后**的路径（生成器写 `window.${path}`）→ 不剥就成 `window.window.…`；
			// ② 默认值必须存**值**而不是源码文本（`{}` 存成字符串 `'{}'` → `Sg.story.notes()` 返回 **string**，
			// 下游一堆门（canon/state/rules/notes-write）被带红）。
			const p = gr[1].replace(/^(window\??\.)/, '').replace(/[?.]+$/, '');
			const d = literalValue(gr[2]);
			if (d === undefined && String(gr[2]).trim() !== 'undefined') return B('game-ref', { path: p }, `默认值 \`${gr[2]}\` 不是字面量 ⇒ 需人工`);
			return A('game-ref', { path: p, default: d, optional: /\?\./.test(gr[1]) });
		}
		// 守卫取数（路径形态）：`() => { const v = window.Game?.Dragon?.hp; if (typeof v!== 'number') throw new Error('…'); return v;}`
		// → `game-ref` ＋ `required`（＋ `type`）。报文**必须是字面量**（否则落 B：不许把表达式拼进产物）。
		const guardedRef = /^\(\) => \{ const (\w+) = ((?:window|Sg)\.[\w$.?\[\]'"]+); if \((!\1|typeof \1 !== '(\w+)')\) throw new Error\((.+)\); return \1; \}$/.exec(s);
		if (guardedRef) {
			const err = literalValue(guardedRef[5]);
			if (typeof err !== 'string' || err.trim() === '') return B('game-ref', { path: guardedRef[2].replace(/^window\./, '') }, '守卫的报错报文不是**非空字符串字面量** ⇒ 需人工');
			return A('game-ref', { path: guardedRef[2].replace(/^window\./, ''), optional: /\?\./.test(guardedRef[2]), required: true, ...(guardedRef[4] ? { type: guardedRef[4] } : {}), error: err });
		}
		// `(k) => <来自……>?.[k]?? <默认>` ／ `(k) => { const v = …; if (!v) throw …; return v;}`
		// 根判定（`#787` 实测）：`window.`／`Sg.` 前缀 ＝ 全局；否则首段要么在**全局白名单**、要么是本文件的**局部常量**
		// → 后者映射成 `fromMember`（局部常量在产物里**不存在** → 走全局读会静默 undefined，六个成员一起变 null）。
		// 认不出的根 → 返回 null（调用方落 B，**不许**假装 A）。
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
			//注意：同族坑（今天第 3 次）：spec 里放的必须是**值**，不是**源码文本** ——
			// 曾把 `?? null` 的兜底存成字符串 `"null"` → 产物成了 `?? "null"`（返回字符串！），容器比对与 L3 都看不出来。
			const d = literalValue(lookup[4]);
			const r1 = rooted(lookup[2]);
			if (!r1) return B('lookup', { from: lookup[2].replace(/[?.]+$/, ''), key: lookup[1] }, `根不是全局也不是本文件的成员常量 ⇒ 需人工（局部常量不能当全局读）`);
			if (d === undefined && lookup[4].trim() !== 'undefined') return B('lookup', { ...r1, key: lookup[1] }, `兜底 \`${lookup[4]}\` 不是字面量 ⇒ 需人工`);
			return A('lookup', { ...r1, key: lookup[1], default: d });
		}
		const field = /^\((\w+)\) => ([\w$.()?]+)\[(\1)\]\??\.(\w+) \?\? (.+)$/.exec(s);
		if (field) {
			//注意：捕获组下标：m[3] 是回参照捕获（`(\1)` 也是组）→ 字段在 m[4]
			// 兜底必须是**小 enum**（编译器硬化后不再收裸表达式）→ 这里把常见三形态翻成 enum，认不出的落 B。
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
			//注意：用**独立**一条宽容正则从成员源里抓（不在那个大模式里加组：实测会**掉最后一个字**）。
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
		// `#785`：体里**含函数字面量** → 那是**任意逻辑** → 声明式**不可预见** → 按四桶定义应落 **C**（"上面都装不下"）
		// 而不是 **B**（B ＝"形状能看懂、只缺字段/种类，**可预见**"）。实测形态：`() => ({ 'a': { apply: (pc)=>…}})`
		//（per-field hooks ＋ 读游戏状态的闭包）。→ 未含函数字面量者（值引不进来／插值）**仍判 B**（那是可预见缺口）。
		if (paren && /^[{\[]/.test(paren[1].trim())) {
			const v = literalValue(paren[1]);
			if (v !== undefined) return A('const', { value: v });
			if (/=>|\bfunction\b/.test(paren[1])) return C('per-field hooks / 闭包体（含函数字面量）⇒ 任意逻辑，声明式不可预见 ⇒ 真逃生舱候选');
			return B('const', { src: s }, '字面量解析不出 ⇒ 需人工');
		}
		if (/^\(\) => (\{.*\}|\[.*\]|null|true|false|-?\d+(\.\d+)?|'[^']*'|`[^`]*`)$/.test(s)) {
			const v = literalValue(s.replace(/^\(\) => /, ''));
			return v === undefined ? B('const', { src: s }, '字面量解析不出 ⇒ 需人工') : A('const', { value: v });
		}
		const D = (why, sink) => ({ bucket: 'D', why, sink });
		// 选牌策略（内容政策）→ 可下沉为"前置选牌规则表"（引擎解释规则、故事只给数据）
		if (/=> \(.*\bpoolId\b.*\?.*:.*null\)$/.test(s) || /=> \([\s\S]*includes\(/.test(s)) return D('选牌/前置决策：形状＝「一组条件 ⇒ 选哪个」⇒ 可下沉为**规则表**（引擎解释、故事给数据）', '前置选牌规则表');
		// 查表后用 Sg.notes.* 组装返回值 → 知识映射：引擎能力，故事只给映射数据
		if (/Sg\.notes\./.test(s)) return D('知识映射：查表 ＋ 用 `Sg.notes` 组装 ⇒ 属**引擎能力**，故事只需给映射数据', '知识映射（引擎组装 {flag, why, held}）');
		// `() => <标识符>`：**引用本段的局部常量**（如 `mechanics: () => MECH`）→ 值本身是数据，
		// 只是不在这一行 → 归 B（迁移时把 `const MECH = {…}` 的字面量搬进 `data/`，不是写代码）。
		const localRef = /^\(\) => ([A-Za-z_$][\w$]*)$/.exec(s);
		if (localRef) return B('const', { ref: localRef[1] }, `引用局部常量 \`${localRef[1]}\` ⇒ 迁迁移时把它的**字面量**搬进 data（值仍是数据，不是逻辑）`);
		// 模板拼句：`const bits = []; … bits.push(…)` → 可声明为 `template` kind
		if (/const (\w+) = \[\];[\s\S]*\1\.push\(/.test(s)) return B('template', { raw: s }, '按条件拼句 ⇒ 可用 **`template` kind** 表达（parts.cond/text ＋ join/suffix）');
		// 派生字段：`const a = <链>(key); … typeof a.<字段>!== 'string' …` → `lookup-field` ＋ `via`/`required`
		const derived = /^\((\w+)\) => \{ const (\w+) = ([\w$.()]+)\(\1\); if \(typeof \2\.(\w+) !== 'string' \|\| !\2\.\4\) throw new Error\(.*\); return \2\.\4; \}$/.exec(s);
		if (derived) {
			// `via` 在**契约 JSON** 里存的是**成员名**（生成器的 schema：`window.Sg.story.${via}(k)` → 只许本故事成员的裸名），
			// 而源里写的是全链（`window.Sg.story.combatAction`）→ 这里剥前缀；剥完不像成员名 → 落 B（不许写出编译器读不了的提案）。
			const via = derived[3].replace(/^(window\.)?Sg\.story\./, '');
			if (!/^[A-Za-z_$][\w$]*$/.test(via)) return B('lookup-field', { via: derived[3], key: derived[1], field: derived[4] }, `派生字段的链 \`${derived[3]}\` 不是本故事成员名（生成器只认成员名）⇒ 需人工`);
			return A('lookup-field', { via, key: derived[1], field: derived[4], required: true });   // `#775` 起 `lookup-field` 支持 `via`/`required`
		}
		// 参数**转发**（形参序与表函数不同）：声明式可表达，但需要 `kind:'forward'`
		const fwd = /^\(([\w, ]+)\) => ([\w$.()?]+)\(([^()]*)\)$/.exec(s);
		if (fwd) {
			// `forward.to` 是**`window.` 之后的路径**（生成器写 `window.${to}(…)`）→ 源里常写成全链 → 剥前缀；
			// 不剥会生成 `window.window.…`（实测：行为探针抓到"两侧报错文案不同"才暴露）。
			const to = fwd[2].replace(/^window\??\./, '');
			return A('forward', { to, params: fwd[1].split(',').map((x) => x.trim()).filter(Boolean), args: fwd[3].split(',').map((x) => x.trim()).filter(Boolean) });   // `#775` 起有 `forward`
		}
		return C('形状不在已知 kind 集合里（含任意逻辑或写法特异）');
	};

	return { classify, fbEnum };
};
