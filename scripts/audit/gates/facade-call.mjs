// ⓪ag 门面调用面约束门（`#1445`）——**引擎门**（判它的是"代码结构"这一维，✗ 与故事内容无关）
//
// 为什么要有它（★实测来源，✗ 不是纸面推演）：做 `#1437`／`#1444` 的"D 块分家"时，
//   我逐行盘点"哪些读点会因摘出而改"，得到两条**成对**的事实：
//   · ★**几乎所有读点都经一个局部量**（`const mech = this.slotsDecl();` ⇒ 之后全用 `mech.xxx`）
//     ⇒ 这解释了为什么"**摘出声明的宿主**（`Game.Combat.slotsDecl` ⇒ `Game.StoryDecl.decl`）能**零行为变化**"
//       —— 读点与宿主之间**隔着门面** ✓
//   · ★**但有一处例外**：`foeHit` 里 `this.slotsDecl()?.hitLocations`（**绕过门面直调**）
//     ⇒ 它是分家时**唯一必须改的读点** ✓（我据此估工：B 块 0 处／C 块 1 处）
// ⇒ 即：**"有没有绕过门面的直调"决定了摘出时要不要动读点** ⇒ 它值得一条**机械判据**。
//
// 为什么"光靠这次搬干净"不够（与 `#602` 同族）：
//   · 下一块（B/C/E/A）还会有同类形态 ✗ 不能每块都手工核一遍；
//   · 且它的**危害是延迟的**：直调**当下**行为正确（同一张表）⇒ 只有**摘出那一刻**才暴露 ✗。
//
// 判据（对**声明取用方法**＝读 `Sg.story.<面>()` 的那些方法）：
//   ✅ **允许**：① **定义处**（`slotsDecl() { … }`）
//               ② **转调处**（`roadsDecl() { return this.slotsDecl()?.roads ?? null; }` —— 旧名 ⇒ 新名／派生）
//               ③ **先赋给局部量**（`const mech = this.slotsDecl();` ⇒ 后续用 `mech`）
//   ✗ **点名**：其它任何形态（`.slotsDecl()?.x` 直接接成员取值／`Game.Combat.slotsDecl()` 直调 之类）
//
// ★**名单从代码推出**（✗ 不在门里写死方法名 —— 照 `#602` 教训：名单要能从代码推出，否则换名即静默失效）：
//   口径＝**返回"故事声明表"的那些方法** ⇒ 认识它们的形态：
//     · 直接读 `Sg.story.<面>()`（如 `slotsDecl() { return window.Sg.story.mechanics?.() ?? null; }`）
//     · **经同类方法派生**（如 `roadsDecl() { return this.slotsDecl()?.roads ?? null; }`）
//   ⇒ 本门**先推名单**，再按名单扫"越面调用"。
//
// ★**白名单**（`scripts/audit/facade-call-allow.json`）：键 `<文件>::<行特征>` → `理由（#票号）`；
//   声明了却**不再命中** ⇒ 报（逼你删，✗ 不留僵尸豁免）。
//
// 用法：`node scripts/audit.mjs --facade-call`（`--check` 为判定态）
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, absPath } from '../../dist-paths.mjs';   // `#1267` tail item 1
import { allSourceFiles } from '../../module-order.mjs';
import { maskComments } from '../lib/mask.mjs';

export const flag = 'facade-call';
export const flags = ['facade-call'];

/** 声明表读取的**形态**：`window.Sg?.story?.<面>?.()`（可带 `?.`）。 */
// ★实测坑：可选调用是 `?.`（问号**加点**）—— 只写 `\??` 会漏掉这个点 ⇒ 名单**推不出来**（本门自证当场红 ✓）
const DECL_READ_RE = /window\.Sg\??\.\s*story\??\.\s*[A-Za-z_$][\w$]*\s*\??\.?\s*\(/;

/** 白名单**数据**（`scripts/audit/facade-call-allow.json`）：键 `<文件>:<行号>` → `理由（#票号）`。
 * 为什么放 JSON 不写在本文件：本门**自己也在被扫的文件集里** —— 把特征写进代码会被自己命中。
 * 纪律：理由**必须带票号**；声明了却不再命中 → 报（逼你删）。 */
export const loadAllow = ({ root = ROOT } = {}) => {
	const p = join(root, 'scripts/audit/facade-call-allow.json');
	if (!existsSync(p)) throw new Error('缺 scripts/audit/facade-call-allow.json（白名单是数据，必须显式存在；空对象也可）');
	const raw = JSON.parse(readFileSync(p, 'utf8'));
	for (const [k, v] of Object.entries(raw)) {
		if (typeof v !== 'string' || !/#\d+/.test(v)) throw new Error(`白名单项 ${k} 的理由必须带票号（#NNN）`);
	}
	return raw;
};

/**
 * **纯函数**：从源码文本推"声明取用方法"名单 ⇒ 能假（自证喂合成源码）。
 * @param {{path:string, text:string}[]} files
 * @returns {Set<string>} 方法名集合
 */
export const facadeMethods = (files = []) => {
	const out = new Set();
	for (const f of files) {
		const text = maskComments(String(f?.text ?? ''));
		for (const line of text.split('\n')) {
			// 形态 A：方法体**直接**读声明表 ⇒ 它是**基准**读取口
			const mDef = line.match(/^\s*([A-Za-z_$][\w$]*)\s*\(\s*[^)]*\)\s*\{/);
			if (mDef && DECL_READ_RE.test(line)) { out.add(mDef[1]); continue; }
		}
		// 形态 B：**经同类方法派生** —— 只认"**方法体开头就是 `return this.<已命名>(…`**"这一形
		//   ★✗ 不能只看"行里出现过 `this.<名>(`"：那会把**消费方**（`ok(pc) { const mech = this.slotsDecl(); … }`）
		//   误收进名单 ⇒ 名单越滚越大 ⇒ 门自己走形 ✗（本门自证当场抓到 ✓）
		//   ★也✗ 不要求"调用后没有成员取值"：那会**漏掉真派生**（`roadsDecl() { return this.slotsDecl()?.roads ?? null; }`
		//   是**真派生**（它派生的是 `.roads` 那一支），而 `bad() { return this.slotsDecl()?.hitLocations; }` 是**消费**
		//   ⇒ 两者在"这一行"上**同形** ⇒ ✗ 靠行内形态分不开 ⇒ ★改由**名单语义**分：
		//     派生 = 方法名以 `Decl` 结尾（本仓约定：这类方法只做"取声明表／取它的某一支"）
		let grew = true;
		while (grew) {
			grew = false;
			for (const f of files) {
				const text = maskComments(String(f?.text ?? ''));
				for (const line of text.split('\n')) {
					const mDef = line.match(/^\s*([A-Za-z_$][\w$]*)\s*\(\s*[^)]*\)\s*\{\s*return\s+this\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/);
					if (!mDef) continue;
					const self = mDef[1], called = mDef[2];
					if (out.has(self) || !out.has(called)) continue;
					if (!/Decl$/.test(self)) continue;      // ★约定：派生口以 `Decl` 结尾（✗ 不是任何 return 行都算）
					out.add(self); grew = true;
				}
			}
		}
	}
	return out;
};

/**
 * **纯函数**：找出"绕过门面的直调" ⇒ 违反项（`{file, line, why}`）。
 * 允许的三形：定义处／转调处（该行**只**做 `return this.<名单方法>(…)` 或派生）／先赋局部量（`const x = this.<名单方法>();`）。
 * @param {{files:{path:string,text:string}[], methods:Set<string>, allow?:object}} o
 */
export const facadeCallProblems = ({ files = [], methods = new Set(), allow = {} } = {}) => {
	const out = [];
	const hitAllow = new Set();
	const names = [...methods];
	if (!names.length) return out;   // 名单推不出 ⇒ 不判（✗ 不假红）
	const esc = (x) => x.replace(/\$/g, '\\$');
	for (const f of files) {
		const text = maskComments(String(f?.text ?? ''));
		text.split('\n').forEach((line, i2) => {
			const key = `${f.path}:${i2 + 1}`;
			for (const name of names) {
				const callRe = new RegExp('(?:this|Game\\s*\\.\\s*Combat)\\s*\\.?\\s*' + esc(name) + '\\s*\\(');
				if (!callRe.test(line)) continue;
				// ✅ ① 定义处：本行形如 `name(...) { …`（含 `async`／缩进）
				if (new RegExp('^\\s*(?:async\\s+)?' + esc(name) + '\\s*\\(\\s*[^)]*\\)\\s*\\{').test(line)) continue;
				// ✅ ② **派生处**：本行形如 `<另一个名单方法>(...) { return this.<name>(…` —— 转调／派生
				if (names.some((n2) => new RegExp('^\\s*' + esc(n2) + '\\s*\\(\\s*[^)]*\\)\\s*\\{\\s*return\\s+this\\s*\\.\\s*' + esc(name) + '\\s*\\(').test(line))) continue;
				// ✅ ③' **默认参数**（`f(x, mech = this.slotsDecl())`）—— 语义上就是"先赋局部量" ✓
				//   ★实测：`statusPenaltyFor(pc, part, mech = this.slotsDecl())` ⇒ 第一版把它误报 ✗（本门自证之外的真扫抓到 ✓）
				// ★ `#1448`（T 阻断的二层）：本豁免**必须限定在参数列表内** ——
				//   ✗ 第一版用 `\\(.*=`（`.*` 会**跨过 `)` 一直吃到方法体里的 `=`**）⇒ 把
				//   `bad2(pc) { const def = this.slotsDecl()?.enemies?.[id]; … }` 误判成「默认参数」⇒ **漏报** ✗（实测 ✓）
				//   ⇒ 判据：`=` 必须出现在**第一个 `)` 之前**（`[^)]*=`）✓
				if (new RegExp('^\\s*[A-Za-z_$][\\w$]*\\s*\\([^)]*=\\s*(?:this|Game\\s*\\.\\s*Combat)\\s*\\.?\\s*' + esc(name) + '\\s*\\(').test(line)) continue;
				// ✅ ③ **先赋局部量**：`const/let/var x = this.name(…)`
				// ★ `#1448`（T 阻断）：**只有「取整张表」才算「先赋局部量」** —— 若调用后**还接成员/下标**
				//   （`const def = this.slotsDecl()?.enemies?.[id];`）⇒ ★那仍是**绕门面直调** ✗
				//   （她的实锤：自证样本只有 `return` 形 ⇒ 声明形缺口**不被看护** ✗ ⇒ 门自己漏判 ✓）
				//   ⇒ 判据：**调用之后到行尾**只许 `);`／`),`／`)`（✗ 不许 `?.x`／`[i]` 之类）
				//   ★判据（`#1448` 二层修正）：**看调用之后紧跟的是什么** ——
				//     · 其后**不许**是 `?.` ／ `.` ／ `[`（那是「取字段／下标」⇒ 绕门面 ✗）
				//     · ✗ 不能写成「必须行尾结束」：`const mech = this.slotsDecl(); return mech?.x;` **是合法的**
				//       （先取整张表、再用局部量）⇒ 那样写会把**合法形**误报 ✗（本门自证当场抓到 ✓）
				if (new RegExp('(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(?:this|Game\\s*\\.\\s*Combat)\\s*\\.?\\s*' + esc(name) + '\\s*\\(\\)\\s*(?!\\s*(?:\\?\\.|\\.|\\[))').test(line)) continue;
				// ✅ ④ 白名单（带票号）
				if (allow[key]) { hitAllow.add(key); continue; }
				out.push({ file: f.path, line: i2 + 1, why: `绕过门面直调 \`${name}()\`（取声明表请先赋局部量：\`const x = this.${name}()\`）—— 摘出声明宿主时，直调是**唯一会咬人**的读点` });
			}
		});
	}
	for (const k of Object.keys(allow)) if (!hitAllow.has(k)) out.push({ file: k.split(':')[0], line: Number(k.split(':')[1]), why: `白名单项已**不再命中** ⇒ 请删（✗ 不留僵尸豁免）｜理由：${allow[k]}` });
	return out;
};

/** 读引擎侧源码（引擎件，.twee）为 `{path,text}`。 */
export const engineSources = ({ root = ROOT } = {}) =>
	allSourceFiles().filter((p) => String(p).startsWith('src/'))
		.map((p) => ({ path: String(p), text: readFileSync(absPath(p), 'utf8') }));

export const run = (ctx = {}) => {
	const { root = ROOT, arg = () => false, wantAll = false } = ctx;
	// `#572`：flag 守卫与选择器**同源**（✗ 否则"选中 ≠ 跑过" ⇒ 假绿）
	if (!wantAll && !arg(flag)) return;
	console.log('\n══ ⓪ag 门面调用面约束门（`#1445`）——"绕过门面直调声明取用方法" ⇒ 点名 ══');
	const files = engineSources({ root });
	const methods = facadeMethods(files);
	const allow = loadAllow({ root });
	const problems = facadeCallProblems({ files, methods, allow });

	// **自证（合成源码 ⇒ 能假）**：四态齐 —— 定义处 ✓／赋局部量 ✓／转调 ✓／★直调 ⇒ **必红**
	// ★实测坑：**必须是一个文件里的四行**（✗ 不能拆成四个单行文件 —— 那样"行号"全是 1 ⇒
	//   自证里按行号断言会**永不成立**（本门第一版就这么错、自证当场红 ✓）
	const synth = [{
		path: 'synth/a.twee',
		// ★ `#1448`（T 阻断）：自证必须**覆盖判据声称 ✗ 的每一种形** —— 之前只有 `return` 形，
		//   ⇒ **声明形**（`const x = this.<名>()?.成员`）缺口**不被看护** ✗（她实锤：门自己漏判 ✓）
		//   ⇒ 本件补**第 5 态**（声明形 ⇒ 必红）✓
		// ★注意：这几行**必须是 `text` 的数组元素本身**（✗ 不能在里面塞 JS 注释 —— 那会变成"被扫的文本"⇒ 行号错位 ✗ 实测踩过）
		text: [
			'slotsDecl() { return window.Sg.story.mechanics?.() ?? null; }',
			'roadsDecl() { return this.slotsDecl()?.roads ?? null; }',
			'ok(pc) { const mech = this.slotsDecl(); return mech?.x; }',
			'bad(pc) { return this.slotsDecl()?.hitLocations ?? []; }',
			'bad2(pc) { const def = this.slotsDecl()?.enemies?.[id]; return def; }',
		].join('\n'),
	}];
	const sm = facadeMethods(synth);
	const sp = facadeCallProblems({ files: synth, methods: sm });
	const named = (t) => sp.some((x) => x.file === 'synth/a.twee' && x.line === t);
	const selfOk = sm.has('slotsDecl') && sm.has('roadsDecl') && !named(1) && !named(2) && !named(3) && named(4) && named(5);
	if (!selfOk) {
		console.error('  ✗ 自证未过：允许的三形或"直调必红"其中一条不成立');
		console.error(`    推得的名单：${[...sm].join(', ') || '（空）'}｜合成检出：${JSON.stringify(sp)}`);
		console.error('\n✗ ⓪ag 门面调用面约束门：**自证格**红 ⇒ **本门自身失能**（不是判据发现 ✗）');
		process.exit(1);
	}
	console.log(`      ✓ 自证：定义处 ✓／赋局部量 ✓／转调 ✓／★直调 ⇒ 必红 ✓（名单：${[...methods].join(', ') || '（空）'}）`);
	if (!problems.length) console.log('      ✓ 真扫：引擎侧**无**绕门面直调 ✓');
	for (const p of problems) console.error(`  ✗ [${p.file}:${p.line}] ${p.why}`);
	if (process.argv.includes('--check')) {
		if (problems.length) { console.error(`\n✗ ⓪ag 门面调用面约束门：${problems.length} 项`); process.exit(1); }
		console.log('\n✔ 门面调用面约束门通过（自证四态 ＋ 真扫无绕门面直调）');
	}
	return {
		flag,
		ok: problems.length === 0,
		problems: problems.map((p) => `[${p.file}:${p.line}] ${p.why}`),
		detail: { methods: [...methods], selfOk },
	};
};
