// `#794` 内核抽取 · **core 层**：契约文本的纯函数（浏览器安全 —— 本目录禁 node:fs／node:vm／child_process）。
// 为什么搬：`maskAll`／`contractSites`／`membersIn`／`contractMembers`／`fbEnum` 全是**纯文本/纯数据**变换 ⇒
// 与宿主无关；留在 `editor/classify-contract.mjs` 里会让"内核"和"壳"混在一个文件（K6 也盯这一点 ✓）。
// ⚠️ `literalValue`（用 node:vm 求值字面量）**不在这里** ✗ —— 它属"要注入的宿主能力"，留待下一步（票面第 2 条）。
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

