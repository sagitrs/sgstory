// `#1093` P2-b：**① 层（静态下界）** —— 段的"**它读哪些文件**"的**下界** ✗。
//
// ## 为什么是"下界"而不是"真值"✗
// 静态只能看见**写死在源码里**的东西 ✓ ：
//   `readFileSync(join(ROOT, 'stories', slug, '00-story.json'))` ⇒ 能抽出 `stories/**` 这个**面** ✓；
//   `readFileSync(join(ROOT, p))`（`p` 是变量）⇒ **看不见** ✗ ⇒ 那部分是**动态的** ✓ ⇒ 由 **② 层（运行真值）** 兜 ✓。
// ⇒ 所以本层的产物**必然**是下界 ✓ ⇒ 判据只能是「**`下界 ⊄ 声明的 inputs` ⇒ 红**」✓（**不是**"下界 ≠ 真值"✗）。
//
// ## ⚠️ 两条**实测**教训（都改过本层设计 ✗）
// ① **朴素抽"文件里出现过的路径串"会假阳** ✗ —— 实测某段抽出 **9 条**，其中
//    一串是**自证格里的夹具示例**（`stories/x/a.twee`／`stories/x/__e2e.twee` … ✓ 那不是读取面 ✗）
//    ⇒ ⇒ 必须**锚在"真作为 fs 实参出现"的位置** ✓（本文件 `fsArgLiterals` ✓）；
//    ⚠️ `maskComments` **不够** ✗ —— 夹具住在**代码**里 ✓（不是注释 ✓）。
// ② **单层扫描看不见变量路径** ✓ —— 那是**设计**（下界 ✓），不是缺陷 ✓；但**必须**在"抓不到什么"里写清 ✓。
//
// ## 与 ② 层的关系（层间自洽断言 ✗）
// `①（下界） ⊆ ②（运行真值）` **必须成立** ✓ —— 否则说明**有一层错了** ✓（① 抽出了不存在的路径 ✗／② 漏记 ✗）。
// ⇒ `interLayerProblems` 是**可单测**的纯函数 ✓（喂"下界含真值没有的路径"⇒ **必报** ✓）。

/** fs 读 API 名（**只列读** ✗ —— 写 API 不参与"读取面" ✓）。 */
export const FS_READ_APIS = [
	'readFileSync', 'readdirSync', 'existsSync', 'statSync', 'accessSync', 'realpathSync', 'readlinkSync', 'openSync', 'createReadStream',
	'readFile', 'readdir', 'stat', 'access', 'realpath', 'open',
];

/** 只认这些前缀（都是**仓内被看护物** ✓ —— `.git/**` 之类不算 ✓）。 */
const FACES = ['src', 'stories', 'editor', 'scripts', 'dist', 'docs', 'test', 'build'];

/**
 * **锚到 fs 实参位**的字面量抽取（① 层的核心 ✓ —— 本文件头顶"教训①"就是它 ✗）。
 *
 * 认两种形态（实测覆盖本仓主流写法 ✓，**单层** ⇒ 下界 ✓）：
 *   · `fsFun('prefix/…')` ／ `fsFun(join(ROOT, 'prefix/…'))`
 *   · `join(ROOT, 'prefix/…')`（段常见：先算出路径再喂给 fs ✓）
 * @param {string} text 段源码
 * @returns {string[]} 去重排序的"面"（如 `stories/**` ⇒ 这里给出**去掉具体尾部**的前缀 ✗ 保留原样 ✓）
 */
export const fsArgLiterals = (text) => {
	const src = String(text ?? '');
	const fn = FS_READ_APIS.join('|');
	// ① `fsFun( [join(ROOT, ] '字面量'` —— 允许字面量里含 `${…}`（模板串 ⇒ 视为**模式** ✓）
	const re1 = new RegExp(`(?:${fn})\\s*\\(\\s*(?:join\\(\\s*[A-Za-z_$][\\w$.]*\\s*,\\s*)?['"\`]([^'"\`]*)['"\`]`, 'g');
	// ② 独立 `join(ROOT, '字面量')`（后面可能再拼变量 ⇒ 只取这一层 ✓）
	const re2 = /join\(\s*ROOT\s*,\s*['"`]([^'"`]*)['"`]/g;
	const out = new Set();
	for (const re of [re1, re2]) {
		for (const m of src.matchAll(re)) {
			const v = m[1].trim();
			if (!v) continue;
			const head = v.split('/')[0];
			if (!FACES.includes(head)) continue;          // 只收**仓内被看护物** ✓（`node:`／绝对路径／`build/…` 之外的不收 ✗）
			out.add(v);
		}
	}
	return [...out].sort();
};

/** **① 层的判据**：已声明 `inputs` 的段 ⇒ `下界 ⊄ inputs` ⇒ 红 ✓（**未声明 ⇒ 跳过本判据** ✗ —— 安全默认 ✓）。 */
export const inputsLowerProblems = ({ declared = [], lower = [] } = {}) => {
	if (!declared.length) return [];                       // 未声明 ⇒ 「全跑型」✓ ⇒ 本层不管它 ✓
	const problems = [];
	for (const l of lower) {
		const hit = declared.some((d) => {
			const s0 = String(d);
			if (s0.replace(/\*+$/, '') === '') return true;   // 全通配（`*`／`**`／`src/**` 除外 ⇒ 去掉 `*` 后为空）⇒ **恒命中** ✗
			return l === s0 || l.startsWith(s0.replace(/\*+$/, '')) || s0 === l.split('/')[0] + '/**';
		});
		if (!hit) problems.push(`**静态读到的面** \`${l}\` **不在声明的 \`inputs\` 里** ✗ ⇒ 该段真读它 ⇒ 声明漏了（\`#1093\` ①层）`);
	}
	return problems;
};

/** **层间自洽断言**：`①（下界） ⊆ ②（运行真值）` ✓ —— 不成立 ⇒ **有一层错了** ✗（可单测 ✓）。 */
export const interLayerProblems = ({ lower = [], truth = [] } = {}) => {
	const norm = (p) => String(p).replace(/^\.\//, '').replace(/\$\{[^}]*\}/g, '*');
	const t = truth.map(norm);
	const problems = [];
	for (const l of lower) {
		const ln = norm(l);
		// 下界是"面／模式" ⇒ 真值里**应有**与之同前缀的条目 ✓（真值通常更具体 ✓）
		const base = ln.replace(/\*+$/, '');
		if (!t.some((x) => x === ln || x.startsWith(base))) {
			problems.push(`**① 抽出的面** \`${ln}\` **在 ②（真值）里没有对应** ✗ ⇒ 两层至少一层错（① 抽到了不存在的路径 ／ ② 漏记）—— \`#1093\` 层间自洽`);
		}
	}
	return problems;
};
/** **② 层的判据**：`真值 ⊄ 声明的 inputs` ⇒ 红 ✓（**未声明 ⇒ 不管** ✗ ＝ 安全默认 ✓）。
 *  ⚠️ 与 ① 层的区别：① 是**下界**（只有字面量 ⇒ 必然 ⊆ 真值 ✓）；② 是**真值**（含变量路径 ✓）⇒ 覆盖面更广 ✓。 */
export const inputsTruthProblems = ({ declared = [], truth = [] } = {}) => {
	if (!declared.length) return [];
	const hit = (p) => declared.some((d) => {
		const s0 = String(d);
		if (s0.replace(/\*+$/, '') === '') return true;   // 全通配 ⇒ **恒命中** ✗（与 ①层 同义 ✓ —— 不许靠 `base && …` 巧合 ✗）
		const base = s0.replace(/\*+$/, '');
		return p === s0 || p.startsWith(base);
	});
	return truth.filter((p) => !hit(p)).map((p) =>
		`**运行期真读** \`${p}\` **不在声明的 \`inputs\` 里** ✗ ⇒ 该段真读它（静态层看不见的**动态路径**也算 ✓）⇒ 声明漏了（\`#1093\` ②层）`);
};

