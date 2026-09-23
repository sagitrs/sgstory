// `#1115` 件②：**`Gear.defs` 口径唯一** —— 口径门（**能假**）。
//
// ## 病灶（一手勘察）
// ```
// 同一概念（引擎战斗路径用的装备字段）存在**三处**说法，且**没有共同字段集**：
// ① 表驱动 `Gear.defs`（`face-fixture`）＝ `{from,damage,advSites,note}`（`docs/engine/json/tables.md:55`）
// ② **代码实际读的**（引擎）＝ `{damage, advSites}`（`src/engine/40-sim/10-gear.twee` 的 `gearDef`（`#1187` 第二块后；**不写行号** —— 行号会随拆分腐烂））
// ③ **文档声明的**（接入契约）＝ `{kind,protects,maxHp,reduce,note}`（`docs/story2-contracts.md` §1.2）
// ＋ 一手证据：`stories/face-fixture/15-tables.twee:939` 的 provider 逐字
// `gearDef: (name) => window?.Game?.Gear?.defs?.[name]?? null`
// → **`Sg.story.gearDef` 就是 `Game.Gear.defs` 的直通** → ∴ ① 与 ③ 是**同一概念的两套口径**（不是同名两概念）
// → 病灶＝**③ 陈旧**：作者照 ③ 写 → 引擎在 `:456` 读 `e.advSites` → **读不到**（"按文档写 → 引擎不认"）
// ```
// ## 比对（评审席裁定）
// ```
// **主比对 ＝ ②（代码实际读的）↔ ③（文档声明的）** —— 那正是上面那条路径
// ①（表驱动那份）**不参与比对**（它是同一概念的**实现侧** → 参与会重复报；其与 ③ 的关系由文档写明）
// `note` 等**共有字段不特判**：报**对称差**两列（②独有／③独有）→ 共有自然不进
// ```
// ## 口径（本仓通则）
// ```
// · ② 侧：**锚在实参位**抽（`gearDef(<…>)?.<字段>` —— 与 `#1093` 的 `fsArgLiterals` 同手法
// 不是"文件里出现过 `damage`" —— 那样注释/字符串里的词也算）
// · ③ 侧：从文档**表格首列**抽（`` | `字段` | ``）
// · 一处定义 ＋ 一格进跑器自证（同 `#1100` 形态 不新造）
// ```
import { readFileSync } from 'node:fs';
import { maskComments } from '../audit/lib/mask.mjs';
import { allSourceFiles } from '../module-order.mjs';   // `#1187`：引擎件清单（派生用） // `#1115`：**单一权威**遮蔽器（剥注释 —— 否则注释里的 `gearDef(...)?.X` 也算读）

// `#1187`：引擎侧文件**自动派生**（原先硬编 `21-resolve.twee` → 拆模块时该门当场腐烂）。
// 口径：锚 `gearDef(...)?.<字段>` 落在哪个引擎件，就取那件。**惰性求值**（定义在 realRead 之后才可用；
// 即时求值会因 TDZ 报错而被吞成静默兜底 —— 那正是"静默降级"）。找不到 → 返回 null，由判据出声。
export const engineFilesOf = () => allSourceFiles(['src'])
	.filter((f) => f.endsWith('.twee'))
	.filter((f) => hasGearDefRead(realRead(f)));
// 兼容既有引用点（值形状不变）：求值推迟到首次访问；多件时逐件点名。
export const ENGINE_FILE = {
	toString: () => { const fs = engineFilesOf(); return fs.length ? fs.join(' ＋ ') : '(未派生)'; },
	valueOf: () => engineFilesOf(),
};
export const CONTRACT_DOC = 'docs/story2-contracts.md';

const realRead = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

// ── 锚：**一处定义**（原先:36 与:47 各写一份 → 必腐；`#1216` B 半给 `gearDef` 读点加了守卫后
// 形态变为 `gearDef?.(k)?.<字段>`，两份副本同时失配 → 门报"派生不到锚"。）
// 一并用 **RegExp(…source)** 复制（避免 `g` 标志共享 lastIndex 的经典坑）。
const GEARDEF_READ_RE = /gearDef\??\.?\([^)]*\)\??\.([A-Za-z_$][\w$]*)/;
const hasGearDefRead = (src) => GEARDEF_READ_RE.test(maskComments(String(src)));

/** ② 侧：**代码实际读的**字段集（锚 `gearDef(...)?.<字段>`）。 */
export const codeReadFields = (src) => [...new Set([...maskComments(String(src)).matchAll(new RegExp(GEARDEF_READ_RE.source, 'g'))].map((m) => m[1]))].sort();

/** ③ 侧：**文档声明的**字段集（锚文档**表格首列**；只取 §1.2 那一段）。 */
export const docDeclaredFields = (doc) => {
	const t = String(doc);
	const at = t.indexOf('### 1.2');
	if (at < 0) return [];
	const rest = t.slice(at);
	const end = rest.indexOf('\n### 1.3');
	const seg = end < 0 ? rest : rest.slice(0, end);
	return [...new Set([...seg.matchAll(/^\|\s*`([A-Za-z_$][\w$]*)`/gm)].map((m) => m[1]))].sort();
};

/** 口径门（**纯函数 ＋ 注入** → 自证能喂假事实）。 */
export const gearDefsCriteriaProblems = ({ read = realRead, engine = null, doc = CONTRACT_DOC } = {}) => {
	const problems = [];
	// `#1187`：引擎件按锚**派生全集**（不再硬编单文件；若拆分后多个件都读该面，只取首件会漏字段）。
	// 派生不到 → 出声，不静默比空。
	const enginePaths = engine ? (Array.isArray(engine) ? engine : [engine]) : engineFilesOf();
	if (!enginePaths.length) return [`✗ **读数不成立**：引擎件里**派生不到**锚 \`gearDef(...)?.<字段>\` ✗（口径门比不了；请核锚是否被改名或挪出 \`src/**\`）`];
	const enginePath = enginePaths.join(' ＋ ');
	const src = enginePaths.map((f) => read(f)).join('\n');
	const txt = read(doc);
	if (!src) problems.push(` **读数不成立**：引擎件 \`${enginePath}\` **读不到** （口径门比不了 ）`);
	if (!txt) problems.push(` **读数不成立**：契约文档 \`${doc}\` **读不到** （口径门比不了 ）`);
	if (problems.length) return problems;
	const code = codeReadFields(src);
	const declared = docDeclaredFields(txt);
	if (!code.length) problems.push(` **读数不成立**：\`${enginePath}\` 里**抽不到** \`gearDef(...)?.<字段>\` （锚没命中  空转 ）`);
	if (!declared.length) problems.push(` **读数不成立**：\`${doc}\` §1.2 里**抽不到**表格首列字段 （空转 ）`);
	if (problems.length) return problems;
	const onlyCode = code.filter((f) => !declared.includes(f));
	const onlyDoc = declared.filter((f) => !code.includes(f));
	if (onlyCode.length || onlyDoc.length) {
		problems.push(' **`Gear.defs` 口径不一致**（**对称差** ）：\n'
			+ `    · **②代码实际读的独有**：${onlyCode.join('、') || '（无）'}\n`
			+ `    · **③文档声明的独有**：${onlyDoc.join('、') || '（无）'}\n`
			+ `    · 共有：${code.filter((f) => declared.includes(f)).join('、') || '（无）'}\n`
			+ `   作者照 ③ 写  引擎在 \`${enginePath}\` **读不到** （"按文档写  引擎不认"）`);
	}
	return problems;
};
