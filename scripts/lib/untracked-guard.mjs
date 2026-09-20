// `#1089`：**未跟踪扫描面 ⇒ 红**（「假绿」缺口）的**共用小助手** —— 一处定义、三门复用。
//
// ## 缺口是什么（一手实证 ✓）
// 本仓若干门扫的是 **`git ls-files`（只扫已跟踪件）** ⇒ **未跟踪的新文件不在扫面里** ⇒
//   门「没扫」它，却**照旧退 0** ⇒ 那是**假绿**（与 `#1019`「没扫不许表现为通过」／`#1028`「`git add`
//   之前跑＝假绿」同族 ✓）。
// **实测（同一文件、同一门、两状态两结果）**：
//   ```bash
//   printf '<<<<<<< HEAD\n' > docs/__x.md && node scripts/md-format.mjs; echo $?   # 未跟踪 ⇒ rc=0 ✗
//   git add docs/__x.md && node scripts/md-format.mjs; echo $?                    # 已跟踪 ⇒ rc=1 ✓
//   ```
// ⇒ 三门同根（`attribution-gate` · `cond-keyform` · `md-format`＋F6）：**未跟踪只进 `console.log`，
//  从不进 `fail[]`／退出码** ✗（`#1089` 票面 §二 已把根因精确定位到源码行 ✓）。
//
// ## 为什么是"红"而不是"只提醒"（裁定：乙′ ✓）
// 本仓既有纪律就是「**`git add` 之前跑 ＝ 假绿**」⇒ **红是对的**（那正是它要教的 ✓）。
// 正写新文件时会被咬一次 ⇒ **修法就是 `git add`**（一行）✓ ⇒ 不影响开发流。
// ⚠️ **不采用"新增 `--check` 档"**（票面 §三 甲）：三门都是"**裸跑即判定**"形态（`npm test` 里裸调）
//   ⇒ 甲在三门上的实际含义＝**新增档位** ⇒ 那要**改 CI 调用面**（`test-plan` 段 ＋ 约定）⇒
//   **另一个自变量**（本票只修"未跟踪假绿"这一格 ✓）。
//
// ## 形态（与 `#1052` 的 `trackedOf` 注入**同形** ✓）
// **判定抽纯 ＋ 扫描面由宿主注入**：三门扫的面不同（`*.md`／`stories/*/data/*.json`／按扩展名）
//   ⇒ 助手**不写死扫描面** ✗，只做**"未跟踪 ∩ 扫描面 ∩ ¬豁免"**这件小事 ✓。
//
// ## 豁免（裁定要求：**带理由 ＋ 留痕**，不许静默绕过 ✓）
// 行首标记 `untracked-exempt: <理由 ＋ 票号>`（照 `deauth-exempt` 形态 ✓）：理由与票号**缺任一项 ⇒ 不生效** ✗
//   ⇒ 且**每一处用到的豁免都必须在输出里留痕** ✓。

/** **临时夹具**（并行段在运行期自己造的）—— 它们是**运行中产物**，不是"忘了 `git add`" ✗。
 *
 * ⚠️ **为什么必须有这一格**（本片实测踩到 ✓）：本判定读的是 `git ls-files --others`（**工作树实况**）
 *   ⇒ 而**并行段**（如 `test/web-preview.mjs` 建 `stories/__e2e`）在跑的时候，那些文件**也是未跟踪**的 ✗
 *   ⇒ 不做区分就会把"**别人正在写的临时夹具**"读成"**你忘了 add**" ⇒ 并发假红 ✗
 *   （第一次全量 `--tier=full` 实测：`test-cond-keyform-mjs` 报 `stories/__e2e/data/*.json` 四件 ✗）。
 *
 * **口径照仓内既有惯例，不另立** ✗：`__` 前缀（`__e2e`／`__probe*`／`__newkey__`…）与 `new-story-fixture`
 *   —— 与 `test/cond-keyform.mjs` 自证里那条「**密闭性格：待判清单里不含并行段的临时故事**」（`#989` 教训 ✓）
 *   用的是**同一套模式** ✓（那一条当年就是因为"并行段往 `stories/` 放故事"而栽过 ✗）。
 * ⚠️ **边界（不夸大）**：本谓词只挡"**仓内已知的临时夹具命名**" ✗ —— 若将来有段用别的名字造临时件，
 *   它仍会被读成"忘了 add"（那是**保守的错**：多报一次，代价是提醒作者 `git add` ✓）。 */
export const isTransientFixture = (rel) => {
	const p = String(rel ?? '');
	// ① 故事目录下的 `__` 前缀夹具（`stories/__e2e/data/tables.json` ✓）
	if (/^stories\/__/.test(p)) return true;
	// ② 仓根／任意层级的 `__` 前缀件（`docs/__probe-untracked.md` 这类探针靶 ✓）
	if (/(^|\/)__[A-Za-z0-9_-]/.test(p)) return true;
	// ③ 既有夹具目录（`test/new-story-fixture.mjs` 用的那个名字 ✓）
	return /new-story-fixture/.test(p);
};

/** 未跟踪豁免的行首标记。⚠️ 理由与票号**少任一项 ⇒ 不生效**（与 `deauth-exempt` 同口径 ✓）。 */
export const UNTRACKED_EXEMPT_MARKER = 'untracked-exempt:';

/**
 * **判定（纯函数 ✓）**：给定「未跟踪文件清单（仓根相对）」与「扫描面谓词」，返回应报的问题。
 *
 * @param {{untracked?: string[], isScanned?: (rel:string)=>boolean, exempted?: string[], isTransient?: (rel:string)=>boolean}} o
 *   · `untracked`  —— 宿主从 `git ls-files --others --exclude-standard` 取（**按仓根相对路径**）
 *   · `isScanned`  —— **该门的扫描面谓词**（注入 ✓：三门各不同，不写死 ✗）
 *   · `exempted`   —— 已按 `UNTRACKED_EXEMPT_MARKER` 判为豁免的文件（宿主读文件判定 ✓，纯函数不碰 fs ✗）
 *   · `isTransient`—— **临时夹具谓词**（缺省用仓内惯例 `isTransientFixture` ✓）：并行段运行期自造的件
 *     **不算"忘了 add"** ✗（否则会把别人正在写的夹具读成你的错 ⇒ 并发假红 ✓）
 * @returns {{unscanned: string[], problems: string[]}}
 *   `unscanned` ＝ 落在扫描面且未豁免、**且不是临时夹具**的未跟踪件（**调用方必须打印它** —— 不静默 ✓）
 */
export const untrackedScannedProblems = ({ untracked = [], isScanned = () => false, exempted = [], isTransient = isTransientFixture } = {}) => {
	const ex = new Set(exempted);
	const unscanned = [...new Set(untracked)].filter((p) => p && isScanned(p) && !ex.has(p) && !isTransient(p)).sort();
	const problems = [];
	if (unscanned.length) {
		problems.push(
			`✗ 本次**未扫**（未跟踪 ${unscanned.length} 件落在本门扫描面内）⇒ 本门只扫**已入库**件，`
			+ `**未跟踪 ⇒ 没扫** ✗ ⇒ 那是**假绿**（\`#1019\`／\`#1028\` 同族）—— 先 \`git add\` 再跑本门：`
			+ `${unscanned.slice(0, 8).join('、')}${unscanned.length > 8 ? ' …' : ''}`
			+ `（确实需要豁免该件 ⇒ 在其内加一行 \`${UNTRACKED_EXEMPT_MARKER} <理由 ＋ 票号>\` ✓，理由与票号缺任一项不生效 ✗）`,
		);
	}
	return { unscanned, problems };
};

/** 判定一行文本是否**有效**的未跟踪豁免（**理由与票号缺任一项 ⇒ 无效** ✓ —— 与 `deauth-exempt` 同口径）。
 *
 * ⚠️ 「有理由」的判据是「**除票号外还有实质文字**」✗ —— 不是"长度≥N"（本件自证实测：
 *   `untracked-exempt: #1089`（只有票号）曾被"长度≥4"误判为**有效** ✗）。 */
export const isUntrackedExemptLine = (line) => {
	const i = String(line ?? '').indexOf(UNTRACKED_EXEMPT_MARKER);
	if (i === -1) return false;
	const rest = String(line).slice(i + UNTRACKED_EXEMPT_MARKER.length).trim();
	if (!/#\d+/.test(rest)) return false;                       // ① 票号（`#NNN`）
	// ② 理由：**去掉票号后仍有实质文字**（中英文／数字均可，但不得只剩标点空白 ✓）
	const prose = rest.replace(/#\d+/g, '').replace(/[\s\u3000·，,。.、；;：:（）()\[\]【】<>「」"'`-]/g, '');
	return prose.length > 0;
};
