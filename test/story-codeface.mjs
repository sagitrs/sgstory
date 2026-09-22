// `#1132` 块 2 片 A：「**故事侧代码面**」门（判据先行 ⇒ 门先立、内容片随后收口）。
//
// 追定（Admin，逐字）：**所有故事零逃生舱** ✗ —— 故事侧不得自写任何引擎面
//   （script／widget／stylesheet 段一律不许 ✗），不要引擎与故事之间的中间层。
//
// 为什么两把尺一起量（**实测**得出，不是推测 ✓）：
//   · 实测：把 `widget`／`script` 补进 `FORBIDDEN_BUILTINS` 后 `npm run build` **rc=0 且零命中** ✗
//     ⇒ 因为故事侧的 `<<widget "flip">>` 住在**带 script 标签的段**里，而**机制标签段被豁免**于禁则扫描
//     ⇒ ∴ "补禁则名单"抓不到它 ✗ ⇒ **真正的缺口是"故事侧存在机制标签段"这件事本身** ✗
//   · twee 件数是**更强、更长期**的尺：迁移到位后故事侧应无 twee ✗（数据走 json ✓）
//
// 形态（协调席裁定）：**ratchet**（只许降 ✓ 附逐条点名清单 ✓）＋ **到零时收紧为硬判** ✓
//   ⚠️ 到零后不许停在 `≤ 0`（形同虚设 ✗）⇒ 改成 `=== 0` 硬判 ✓
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// ⚠️ 通配符**不要写进块注释** —— 其中的结束标记会提前终止注释 ✗（本文件第一版就栽在这 ✓）
const TWEE_GLOB = 'stories' + '/**/*' + '.twee';

/** 机制标签（**同义于** `editor/lib/core/text.mjs` 与 `scripts/audit/lib/shared.mjs` 各自那份 ✓）。
 *  ⚠️ 仓内**已明文记录**这两处是「已知重复」且**刻意不统一**（`text.mjs` 顶部注释：导出会撞 K6、统一属另一件事 ⇒ 不在该片 ✗）
 *  ⇒ ∴ 本门**不自作聪明去收敛** ✗（那会与既有决定冲突 ✓）；此处按同一口径**再声明一份**，并在测试里断言三者同义 ✓。 */
export const MECH_TAGS = ['script', 'widget', 'stylesheet'];

// ── 明写基线（**只许降** ✗；改动基线必须是有意识的 ✓）──────────────────────
/** twee 件数基线（故事目录下的全部 twee）。目标 0 ⇒ 到 0 后本门转硬判 ✓。 */
export const BASE_TWEE = 1;   // `#1132` B4：三故事元数据段改由编译期生成 ⇒ 故事侧只剩 `face-fixture/11-fixture-cards.twee`（B4 之后另有票收编它）
/** 机制标签段的**逐条点名清单**（顺序无关 ✓）。**只许缩** ✗ —— 加一条 ⇒ 红 ✓。 */
export const BASE_MECH = [];   // `#1132` B4：三故事元数据段改由编译期生成 ⇒ 最后三条机制标签段退场，到 0 转硬判
// ──────────────────────────────────────────────────────────────────────────

/** 从段落头行取 `:: 名 [tag …]`（只认行首 ✓；`:: ` 后到 `[` 前是段名 ✓）。 */
export const passageTagOf = (line) => {
	const m = /^::\s*([^[]+?)\s*(?:\[([^\]]*)\])?\s*$/.exec(line ?? '');
	if (!m) return null;
	return { name: m[1].trim(), tags: (m[2] ?? '').split(/\s+/).map((x) => x.trim()).filter(Boolean) };
};

/** 判一份输入 ⇒ 问题清单（**纯函数** ✓ 便于自证）。 */
export const codefaceProblems = ({ tweeFiles = [], mechSegments = [], baseTwee = BASE_TWEE, baseMech = BASE_MECH } = {}) => {
	const out = [];
	// (D-a) twee 件数：ratchet（≤ 基线）／基线到 0 ⇒ **硬判**
	const tweeOk = baseTwee === 0 ? tweeFiles.length === 0 : tweeFiles.length <= baseTwee;
	if (!tweeOk) {
		out.push({ code: 'A', msg: baseTwee === 0
			? `故事侧出现 twee ${tweeFiles.length} 件 ⇒ **基线已到 0，此项为硬判** ✗（故事侧不得再有 twee ✓）：${tweeFiles.join('、')}`
			: `故事侧 twee ${tweeFiles.length} 件 > 基线 ${baseTwee} ⇒ **只许降** ✗（迁移目标为 0 ✓）：${tweeFiles.join('、')}` });
	}
	// (D-b) 机制标签段：ratchet（≤ 基线）／基线到 0 ⇒ **硬判**（照 (D-a) 同款收口 ✓）
	const allow = new Set(baseMech);
	const extra = mechSegments.filter((s) => !allow.has(s));
	const mechOk = baseMech.length === 0
		? mechSegments.length === 0
		: (extra.length === 0 && mechSegments.length <= baseMech.length);
	if (!mechOk) {
		out.push({ code: 'B', msg: baseMech.length === 0
			? `故事侧出现机制标签段 ${mechSegments.length} 处 ⇒ **基线已到 0，此项为硬判** ✗（故事侧不得再有机制标签段）：${mechSegments.join('、')}`
			: `故事侧出现**基线之外**的机制标签段 ${extra.length} 处 ⇒ 追定「故事零逃生舱」✗（不得自写 script／widget／stylesheet 段 ✗）：${extra.join('、') || '(段数超出基线但无新增条目 —— 请核基线 ✓)'}` });
	}
	return out;
};

/** 机制标签的**漂移检测**（承诺见上方注释 ✓）：三处声明**同义** ⇒ 任一处漂移即红 ✗。
 *  实现：从另两件的**源文**里抽出含 `script` 的标签数组字面量 ✓（它们不导出该常量 ✗、且仓内明文
 *  决定"刻意不统一"✗ ⇒ 本门用**文本漂移检测**代替收敛 ✓，既不冲突又能挡住走偏 ✓）。 */
export const mechTagDrift = () => {
	const out = [];
	const files = ['editor/lib/core/text.mjs', 'scripts/audit/lib/shared.mjs'];
	const want = [...MECH_TAGS].sort().join('|');
	for (const f of files) {
		const src = readFileSync(join(ROOT, f), 'utf8');
		// ⚠️ **必须扫全部出现处** ✗ —— 只取第一处会漏：`shared.mjs` 里既有 `:134` 内联数组、
		//   又有 `:264` 的 `export const MECH_TAGS = […]` ⇒ 只锁前者＝**半个守卫** ✗（实测咬到过 ✓）
		const all = [...src.matchAll(/\[([^\]]*'script'[^\]]*)\]/g)].map((m) =>
			m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort().join('|'));
		if (all.length === 0) out.push({ code: 'DRIFT', msg: `${f} 里**找不到**机制标签数组 ⇒ 检测面失效（不许静默 ✓）` });
		for (const [i, got] of all.entries()) {
			if (got !== want) out.push({ code: 'DRIFT', msg: `${f} 第 ${i + 1} 处机制标签集合与本站不同义 ⇒ 漂移 ✗：${got.replace(/\|/g, '、')} ≠ ${want.replace(/\|/g, '、')}` });
		}
	}
	return out;
};

/** 真树扫描：故事目录下的 twee 清单 ＋ 机制标签段点名（`<slug>/<file>::<段名>` ✓）。 */
export const scanTree = () => {
	const tweeFiles = execFileSync('git', ['ls-files', TWEE_GLOB], { cwd: ROOT, encoding: 'utf8' })
		.split('\n').filter(Boolean);
	const mechSegments = [];
	for (const f of tweeFiles) {
		const src = readFileSync(join(ROOT, f), 'utf8');
		const stem = f.replace(/^stories\//, '');
		for (const line of src.split('\n')) {
			const p = passageTagOf(line);
			if (p && p.tags.some((t) => MECH_TAGS.includes(t))) mechSegments.push(`${stem}::${p.name}`);
		}
	}
	return { tweeFiles, mechSegments };
};

// ── 自证（合成输入 ✓ 正反例都走同一份判据 ✓）──────────────────────────────
if (process.argv.includes('--selftest')) {
	const cases = [
		['正例：等于基线不报', { tweeFiles: new Array(BASE_TWEE).fill('x.twee'), mechSegments: [...BASE_MECH] }, 0],
		['反例①：twee 超基线一枚', { tweeFiles: new Array(BASE_TWEE + 1).fill('x.twee'), mechSegments: [...BASE_MECH] }, 1],
		['反例②：多一枚机制标签段', { tweeFiles: new Array(BASE_TWEE).fill('x.twee'), mechSegments: [...BASE_MECH, 'face-fixture/99.twee::Foo'] }, 1],
		['反例③：基线到 0 时非空 ⇒ 硬判', { tweeFiles: ['a.twee'], mechSegments: [], baseTwee: 0 }, 1],
		['正例：全删光 ＋ 基线 0 ⇒ 不报', { tweeFiles: [], mechSegments: [], baseTwee: 0, baseMech: [] }, 0],
	];
	let bad = 0;
	for (const [label, input, want] of cases) {
		const got = codefaceProblems(input).length;
		const ok = want === 0 ? got === 0 : got >= want;
		console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：报 ${got}（期望 ${want === 0 ? 0 : '≥' + want}）`);
		if (!ok) bad++;
	}
	process.exit(bad ? 1 : 0);
}

const { tweeFiles, mechSegments } = scanTree();
const problems = codefaceProblems({ tweeFiles, mechSegments });
const drift = mechTagDrift();   // 三处声明同义 ✓（文本漂移检测）
console.log(`故事侧代码面：twee ${tweeFiles.length} 件（基线 ${BASE_TWEE}，目标 0）｜机制标签段 ${mechSegments.length} 段（基线 ${BASE_MECH.length} 段，只许缩）`);
problems.push(...drift);
if (problems.length) {
	console.error(`✗ 故事侧代码面门未通过 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	process.exit(1);
}
console.log('✔ 故事侧代码面门通过（零逃生舱方向 ✓：twee 与机制标签段均未超出只许降的基线 ✓）');
