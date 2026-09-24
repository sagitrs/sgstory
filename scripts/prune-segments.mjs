// 段摘除工具（`#1261`）：按 id 从 `test-plan.mjs` 摘段 —— **每个 id 一个事务**。
//
// 为什么需要它：`test-plan.mjs` 里一个 id 最多出现在 4 处异构位置
//（段定义〔单行/多行〕· `SUITE_MEMBERS` 分组项〔整行/行内〕· `FULL_REASONS` 理由块 · `needs` 引用）
// → 手写正则必误伤；本工具用**模块自身的校验器** `validateSuites()` / `validateLayers()` 验收：
// 删完若校验倒退或语法坏 → **整体回滚该 id**，并报告未处理。
//
// 用法：node scripts/prune-segments.mjs <seg-id>...
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = join(ROOT, 'scripts/test-plan.mjs');
const IDS = process.argv.slice(2);
if (!IDS.length) { console.error('用法：node scripts/prune-segments.mjs <seg-id>...'); process.exit(2); }

const check = () => {
	try {
		const out = execFileSync('node', ['-e',
			`import(${JSON.stringify(P)}).then(m=>console.log(JSON.stringify({s:m.validateSuites().length,l:m.validateLayers().length,n:m.SEGMENTS.length}))).catch(()=>console.log('SYNTAX'))`],
			{ encoding: 'utf8', timeout: 60000, cwd: ROOT });
		if (out.includes('SYNTAX')) return null;
		const m = out.match(/\{.*\}/);
		return m ? JSON.parse(m[0]) : null;
	} catch { return null; }
};

/** 删掉一个 id 的**全部**出现处；返回 [新源码, 删了几处]。 */
function removeAll(src, id) {
	let s = src, n = 0;

	// ① 段定义（字符串/注释感知的括号配平；支持单行与多行）
	for (;;) {
		const at = s.indexOf(`{ id: "${id}"`);
		if (at === -1) break;
		const lineStart = s.lastIndexOf('\n', at) + 1;
		let i = at, depth = 0, q = null;
		while (i < s.length) {
			const c = s[i];
			if (q) { if (c === '\\') { i += 2; continue; } if (c === q) q = null; i++; continue; }
			if (c === "'" || c === '"' || c === '`') { q = c; i++; continue; }
			if (c === '/' && s[i + 1] === '/') { const z = s.indexOf('\n', i); i = (z === -1) ? s.length : z; continue; }
			if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = (e === -1) ? s.length : e + 2; continue; }
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
			i++;
		}
		let e = i;
		while (s[e] === ' ' || s[e] === '\t') e++;
		if (s[e] === ',') e++;
		const nl = s.indexOf('\n', e);
		s = s.slice(0, lineStart) + s.slice(nl === -1 ? e : nl + 1);
		n++;
	}

	// ② `FULL_REASONS` 理由块：`\n\t'id': {` 起，字符级配平到对象收尾
	for (;;) {
		const key = `\n\t'${id}':`;
		const k = s.indexOf(key);
		if (k === -1) break;
		const brace = s.indexOf('{', k);
		if (brace === -1) break;
		let i = brace, depth = 0, q = null;
		while (i < s.length) {
			const c = s[i];
			if (q) { if (c === '\\') { i += 2; continue; } if (c === q) q = null; i++; continue; }
			if (c === "'" || c === '"' || c === '`') { q = c; i++; continue; }
			if (c === '/' && s[i + 1] === '/') { const z = s.indexOf('\n', i); i = (z === -1) ? s.length : z; continue; }
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
			i++;
		}
		let e = i;
		while (s[e] === ' ' || s[e] === '\t') e++;
		if (s[e] === ',') e++;
		const nl = s.indexOf('\n', e);
		s = s.slice(0, k) + s.slice(nl === -1 ? e : nl + 1);
		n++;
	}

	// ③ 独占整行的列表项（行内还有别的 id 则跳过，交给 ④ 逐项删）
	for (;;) {
		const m = s.match(new RegExp("\\n[ \\t]*'" + id + "',?[ \\t]*(//[^\\n]*)?"));
		if (!m || m[0].includes('{ id:')) break;
		const others = (m[0].match(/'[\w-]+'/g) || []).filter((x) => x !== `'${id}'`);
		if (others.length) break;
		s = s.replace(m[0], '');
		n++;
	}

	// ④ 行内列表项
	for (const pat of [`'${id}', `, `, '${id}'`, `'${id}',`]) {
		while (s.includes(pat)) { s = s.replace(pat, ''); n++; }
	}

	// ⑤ `needs: [...]` 里的引用（同 ④ 的形态，兜底）
	for (const pat of [`"${id}", `, `, "${id}"`, `"${id}",`]) {
		while (s.includes(pat)) { s = s.replace(pat, ''); n++; }
	}
	return [s, n];
}

const base = check();
if (!base) { console.error('基线已坏（先修 test-plan.mjs）'); process.exit(2); }
console.log('基线:', JSON.stringify(base));

let okIds = 0; const unhandled = [];
for (const id of IDS) {
	const original = fs.readFileSync(P, 'utf8');
	const [next, n] = removeAll(original, id);
	fs.writeFileSync(P, next);
	const after = check();
	if (after && after.s === 0 && after.l === 0 && after.n < base.n) {
		console.log(`  ${id}  <- 删除 ${n} 处（段数 ${base.n} → ${after.n}）`);
		okIds++;
	} else {
		fs.writeFileSync(P, original);   // 整体回滚
		unhandled.push(id);
	}
}
console.log('---');
console.log(`成功 ${okIds} 个 id；未处理：${unhandled.join(' ') || '无'}`);
console.log('最终:', JSON.stringify(check()));
