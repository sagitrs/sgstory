// 契约分类器（`#762` 车道 A 的执行体）：**把故事侧的 `Sg.story.*` 成员归类成声明式 kind**。
//
// 它要回答 P0 的那句验收：**"逃生舱清单为空"到底成不成立**。做法是逐成员看**源码形状**，
// 能归类的给出 kind，归不了类的**点名**（不是"静默跳过"——那才是这类工具最会骗人的地方）。
//
// 三个桶：
//   A. **可直接表达**（现有 `KINDS` 能装）
//   B. **需要声明式扩展**（形状能看懂，但现有 kind 缺字段/缺种类，如 `game-ref` 需要默认值）
//   C. **逃生舱候选**（含任意逻辑 ⇒ 要么下沉引擎变数据，要么进 `escape-hatch.json` 并写理由）
//
// 用法：node editor/classify-contract.mjs <slug> [--json]      # 默认只报告；`--json` 打印提案数据
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** 纯函数：从 `[script]` 文本里取出 `Object.assign((window.Sg.story ??= {}), { … })` 的成员源码。 */
export const contractMembers = (text) => {
	const src = String(text);
	const at = src.indexOf('window.Sg.story ??= {}');
	if (at === -1) return null;
	const open = src.indexOf('{', src.indexOf(',', at));
	const masked = maskAll(src);                            // 注释与字符串/模板里的大括号先抹平 ⇒ 配对才准
	let depth = 0, end = -1;
	for (let i = open; i < masked.length; i++) {
		if (masked[i] === '{') depth++;
		else if (masked[i] === '}') { depth--; if (!depth) { end = i; break; } }
	}
	if (end === -1) return null;
	const body = src.slice(open + 1, end);
	const mbody = masked.slice(open + 1, end);
	const out = []; let start = 0, d = 0;
	for (let i = 0; i <= mbody.length; i++) {
		const c = mbody[i];
		if (c === '{' || c === '(' || c === '[') d++;
		else if (c === '}' || c === ')' || c === ']') d--;
		else if ((c === ',' && d === 0) || i === mbody.length) {
			let chunk = body.slice(start, i).trim(); start = i + 1;
			// 成员上方的文档注释属于**这个**成员 ⇒ 从名字里剔掉（否则注释里的 `：` 会被当成键分隔）
			chunk = chunk.replace(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*|\s*\n)*/g, '').trim();
			if (!chunk) continue;
			const ci = chunk.indexOf(':'); const cm = maskAll(chunk).indexOf(':');
			if (ci === -1 || cm === -1) continue;
			out.push({ name: chunk.slice(0, ci).trim(), src: chunk.slice(ci + 1).trim() });
		}
	}
	return out;
};

/** 纯函数：把一个成员的值表达式归类。返回 `{ bucket, kind, spec?, why? }`。 */
export const classify = (srcIn) => {
	const s = String(srcIn).replace(/\s+/g, ' ').trim();
	const A = (kind, spec = {}) => ({ bucket: 'A', kind, spec });
	const B = (kind, spec, why) => ({ bucket: 'B', kind, spec, why });
	const C = (why) => ({ bucket: 'C', why });
	if (/^\(\) => null$/.test(s)) return A('null');
	if (/^\(\) => \(\{\}\)$/.test(s) || /^\(\) => \{\}$/.test(s)) return A('empty-object');
	if (/^\(\) => \[\]$/.test(s)) return A('empty-array');
	if (/^\(\) => !!window\./.test(s)) return A('bool-exists', { path: s.replace(/^\(\) => !!window\./, '').trim() });
	if (/^\((\w+)\) => String\(\1\)$/.test(s)) return A('identity-string');   // ⚠️ 捕获组要写 `\((\w+)\)`：`\(`/`\)` 是**字面括号**，不是分组
	if (/^\(\) => window\.[\w$.]+$/.test(s)) return A('game-ref', { path: s.replace(/^\(\) => window\./, '') });
	const gr = /^\(\) => ([\w$.()?]+) \?\? (.+)$/.exec(s);
	if (gr && /^(window\.|Sg\.)/.test(gr[1])) return B('game-ref', { path: gr[1].replace(/[?.]+$/, ''), default: gr[2] }, '`game-ref` 需要**默认值**字段（现在没有）');
	// `(k) => <来自……>?.[k] ?? <默认>` ／ `(k) => { const v = …; if (!v) throw …; return v; }`
	const lookup = /^\((\w+)\) => ([\w$.()?]+)\[(\1)\] \?\? (.+)$/.exec(s);
	if (lookup) return A('lookup', { from: lookup[2].replace(/[?.]+$/, ''), key: lookup[1], default: lookup[4] });
	const field = /^\((\w+)\) => ([\w$.()?]+)\[(\1)\]\??\.(\w+) \?\? (.+)$/.exec(s);
	if (field) return A('lookup-field', { from: field[2].replace(/[?.]+$/, ''), key: field[1], field: field[4], fallback: field[5] });   // ⚠️ 捕获组下标：m[3] 是回参照捕获（`(\1)` 也是组）⇒ 字段在 m[4]
	const guarded = /^\((\w+)\) => \{ const (\w+) = ([\w$.()?]+)\[(\1)\]; if \(!\2\) throw new Error\(.*\); return \2; \}$/.exec(s);
	if (guarded) return A('lookup', { from: guarded[3].replace(/[?.]+$/, ''), key: guarded[1], required: true });
	const state = /^\((\w+)\) => \1\?\.([\w$.]+) \?\? (.+)$/.exec(s);
	if (state) return A('state-ref', { path: state[2], default: state[3] });
	const paren = /^\(\) => \((.*)\)$/.exec(s);              // `() => ({…})` / `() => ([…])`
	if (paren && /^[{\[]/.test(paren[1].trim())) return A('const', { raw: paren[1].trim() });
	if (/^\(\) => (\{.*\}|\[.*\]|null|true|false|-?\d+(\.\d+)?|'[^']*'|`[^`]*`)$/.test(s)) return A('const', { raw: s.replace(/^\(\) => /, '') });
	// 参数**转发**（形参序与表函数不同）：声明式可表达，但需要 `kind:'forward'`
	const fwd = /^\(([\w, ]+)\) => ([\w$.()?]+)\(([^()]*)\)$/.exec(s);
	if (fwd) return B('forward', { to: fwd[2], args: fwd[3].split(',').map((x) => x.trim()).filter(Boolean) }, '参数转发 ⇒ 需要 `kind:\'forward\'`（含形参序映射）');
	return C('形状不在已知 kind 集合里（含任意逻辑或写法特异）');
};

const selftest = () => {
	let bad = 0;
	const t = (label, ok, got = '') => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}${ok ? '' : `\n    实得：${got}`}`); };
	const kindOf = (src) => classify(src).kind ?? classify(src).bucket;
	t('`() => null` ⇒ null', kindOf('() => null') === 'null');
	t('`() => ({}` / `[]` ⇒ empty-*', kindOf('() => ({})') === 'empty-object' && kindOf('() => []') === 'empty-array');
	t('`(id) => String(id)` ⇒ identity-string（**陷阱回归**：`\(` 是字面括号，捕获组必须写 `\((\w+)\)`）', kindOf('(id) => String(id)') === 'identity-string');
	t('`(k) => <链>[k] ?? <默认>` ⇒ lookup（含 `?.` 链）', (() => { const r = classify('(id) => window.Game?.Items?.defs?.[id] ?? null'); return r.kind === 'lookup' && r.spec.from === 'window.Game?.Items?.defs' && r.spec.default === 'null'; })());
	t('`(k) => <链>[k]?.<字段> ?? <兜底>` ⇒ lookup-field', (() => { const r = classify("(id) => window.Sg.story.mechanics()?.actions?.[id]?.label ?? String(id)"); return r.kind === 'lookup-field' && r.spec.field === 'label'; })());
	t('`{ const s = …; if (!s) throw …; return s; }` ⇒ lookup + required（变量名任意）', (() => { const r = classify('(name) => { const s = window.Game?.Checks?.sites?.[name]; if (!s) throw new Error(`x`); return s; }'); return r.kind === 'lookup' && r.spec.required === true; })());
	t('`(pc) => pc?.dragon ?? {}` ⇒ state-ref', (() => { const r = classify('(pc) => pc?.dragon ?? {}'); return r.kind === 'state-ref' && r.spec.path === 'dragon'; })());
	t('`() => ({ … })`（括号包裹的对象）⇒ const', kindOf('() => ({ star: { charge: 12 } })') === 'const');
	t('`() => window.X ?? <默认>` ⇒ **B**（game-ref 缺默认值字段）', classify('() => window.Game?.Notes?.entries ?? {}').bucket === 'B');
	t('参数转发 ⇒ **B**（需要 `forward`）', classify('(inv, round, defeats, poisoned) => window.Game.Items.battleDamage(round, inv, defeats, poisoned)').bucket === 'B');
	t('条件表达式 ⇒ **C**（逃生舱候选）', classify("(poolId, round, pc, picked) => (poolId === '封印' && round === 1 ? 'x' : null)").bucket === 'C');
	t('多语句逻辑 ⇒ **C**', classify('(r, base) => { const bits = []; if (r?.gold) bits.push(1); return bits.join(); }').bucket === 'C');
	t('`contractMembers`：能从段落文本里切出成员（注释不算成员）', (() => {
		const txt = ':: StoryBindings [script]\nObject.assign((window.Sg.story ??= {}), {\n\t// 文档注释：不属于上一个成员\n\ta: () => null,\n\tb: () => [],\n});';
		const ms = contractMembers(txt);
		return ms.length === 2 && ms[0].name === 'a' && ms[1].name === 'b';
	})());
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（13 例：8 个 kind 形状 ＋ B/C 分桶 ＋ 捕获组陷阱回归 ＋ 成员切分）');
};

const isMain0 = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain0 && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/classify-contract.mjs <slug> [--json]'); process.exit(2); }
	const file = join(ROOT, `stories/${slug}/15-tables.twee`);
	const members = contractMembers(readFileSync(file, 'utf8'));
	if (!members || !members.length) { console.error(`✗ ${file} 里找不到 Sg.story 成员（读不到输入不许当"没有故事逻辑"）`); process.exit(1); }
	const rows = members.map((m) => ({ name: m.name, src: m.src, ...classify(m.src) }));
	const bucket = (b) => rows.filter((r) => r.bucket === b);
	console.log(`══ 契约分类（${slug}）：${rows.length} 个成员 ══`);
	for (const r of rows) {
		const mark = { A: '✓', B: '~', C: '✗' }[r.bucket];
		console.log(`  ${mark} ${r.name.padEnd(18)} ${r.bucket === 'A' ? r.kind : r.bucket === 'B' ? `需要扩展 ${r.kind}（${r.why}）` : `逃生舱候选：${r.why}`}`);
		if (r.bucket !== 'A') console.log(`      源码：${r.src.replace(/\s+/g, ' ').slice(0, 150)}`);
	}
	console.log(`\n  汇总：可直接表达 ${bucket('A').length} · 需声明式扩展 ${bucket('B').length} · 逃生舱候选 ${bucket('C').length}`);
	if (process.argv.includes('--json')) console.log('\n' + JSON.stringify({ slug, members: rows }, null, '\t'));
	// 非 A 的全部**点名**（不是静默跳过）：B 是"schema 该补"，C 是"要么下沉引擎、要么进逃生舱清单"
	process.exit(bucket('C').length ? 1 : 0);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
