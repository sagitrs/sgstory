// 注释遮蔽：**单扫描器按词法一次遮蔽**（`docs/dev-conventions.md` §9.7 的正解形状）。
//
// 为什么单独一处（`#580`）：静态面（写点/读点/旗标/键）都是"拿源码跑正则"。**注释不是代码**，
// 但只要有一处忘了遮，注释里的示例就会变成"真的写了/真的读了"——
// 实测：`src/engine/40-sim/21-resolve.twee` 的 JS 注释里写着 `<<setflag "flower_taken">>`（举例用），
// 于是 `--consequences` 把 `flower_taken` 当成**每个故事都写了**的旗标 ⇒ 凡不声明它的故事**假红**。
//
// 为什么必须是"一次词法扫描"而不是几个正则顺序剥（§9.7 的教训）：先剥 `/% %/` 会被字符串里的
// 反引号吃掉、先剥模板又会被正则里的反引号吃掉——任一层都能与另一层跨行贪婪错配，最后整段代码被抹成空白。
//
// 口径：
//   · 遮蔽＝把注释字符换成**空格**（换行原样保留）⇒ 长度/行号/列号稳定，按行处理的调用方不受影响；
//   · **字符串/模板/正则内部不遮**——`<<setflag "a">>` 的键就在引号里，遮了就等于漏检；
//   · 未闭合的注释/字符串：**保守剥到行尾**（模板例外，见下）并登记一条诊断（宁可报可疑，不可静默错下去）。
export const COMMENT_KINDS = ['/% %/', '<!-- -->', '//', '/* */'];

/** 前一个"有意义的字符"（跳过空白），用于判断 `/` 是正则还是除法。 */
const prevMeaningful = (s, i) => {
	for (let j = i - 1; j >= 0; j--) if (!/\s/.test(s[j])) return s[j];
	return '';
};
/** 前一字符能否作为"正则字面量"的左边界。 */
const REGEX_PREFIX = '([{=,:;!&|?+-*%<>~^';

/**
 * 纯函数：遮蔽注释。返回 `{ text, unclosed }`——`text` 与输入**等长**（注释换成空格、换行保留），
 * `unclosed` 是未闭合构造的清单（`{ kind, at, toEol }`）。
 */
export const mask = (src, { file = '', twee = true } = {}) => {
	const s = String(src ?? '');
	const out = s.split('');
	const unclosed = [];
	const n = s.length;
	const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
	let i = 0;
	while (i < n) {
		const c = s[i];
		// twee 块注释 /% … %/（`twee:false` 时交给调用方自己处理——如 `--text` 另有"按字符计数"的口径）
		if (twee && c === '/' && s[i + 1] === '%') {
			const end = s.indexOf('%/', i + 2);
			if (end < 0) { unclosed.push({ file, kind: '/% %/', at: i, toEol: false }); blank(i, n); break; }
			blank(i, end + 2); i = end + 2; continue;
		}
		// HTML 注释 <!-- … -->
		if (c === '<' && s.startsWith('<!--', i)) {
			const end = s.indexOf('-->', i + 4);
			if (end < 0) { unclosed.push({ file, kind: '<!-- -->', at: i, toEol: false }); blank(i, n); break; }
			blank(i, end + 3); i = end + 3; continue;
		}
		// 行注释 //
		if (c === '/' && s[i + 1] === '/') {
			const end = s.indexOf('\n', i);
			const stop = end < 0 ? n : end;
			blank(i, stop); i = stop; continue;
		}
		// 块注释 /* … */
		if (c === '/' && s[i + 1] === '*') {
			const end = s.indexOf('*/', i + 2);
			if (end < 0) { unclosed.push({ file, kind: '/* */', at: i, toEol: false }); blank(i, n); break; }
			blank(i, end + 2); i = end + 2; continue;
		}
		// 字符串 / 模板字面量（**不遮**：键名就在引号里）
		if (c === '"' || c === "'" || c === '`') {
			const q = c;
			let j = i + 1;
			while (j < n) {
				if (s[j] === '\\') { j += 2; continue; }
				if (s[j] === q) break;
				if (s[j] === '\n' && q !== '`') break;              // 单/双引号不跨行 ⇒ 未闭合
				j++;
			}
			if (j >= n || (s[j] !== q && q !== '`')) {
				// 未闭合（单/双引号到行尾、模板到文件尾）：保守剥到行尾/文件尾
				const stop = q === '`' ? n : (s.indexOf('\n', i) < 0 ? n : s.indexOf('\n', i));
				unclosed.push({ file, kind: q === '`' ? '` 模板' : `${q} 字符串`, at: i, toEol: true });
				blank(i, stop); i = stop; continue;
			}
			i = j + 1; continue;
		}
		// 正则字面量（启发式：`/` 紧跟在运算符/括号后 ⇒ 当正则；否则当除法）
		if (c === '/' && (i === 0 || REGEX_PREFIX.includes(prevMeaningful(s, i)))) {
			let j = i + 1, inClass = false, closed = false;
			while (j < n) {
				const d = s[j];
				if (d === '\\') { j += 2; continue; }
				if (d === '\n') break;
				if (d === '[') inClass = true;
				else if (d === ']') inClass = false;
				else if (d === '/' && !inClass) { closed = true; break; }
				j++;
			}
			if (closed) { i = j + 1; continue; }                    // 正则体里**不遮**（它可能含 `/`、`*`）
		}
		i++;
	}
	return { text: out.join(''), unclosed };
};

/** 便利入口：只要遮蔽后的文本。 */
export const maskComments = (src, opts) => mask(src, opts).text;
