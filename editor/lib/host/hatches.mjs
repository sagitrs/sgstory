// `#794` 内核抽取 · **host 层**：读 `editor/escape-hatch.json` 的**手写逃生舱文件**登记。
//
// 为什么住 host：它读仓内文件（`node:fs` 经 `fs.mjs`）→ core 不许碰。
// 为什么值得单开一个模块：**它有两个真实消费者** —— 分类器（把"完整契约"看全）与 `equiv`（产物侧要算上逃生舱）；
// 而且在搬进这里之前，`equiv.mjs` 里**有一份内联的复制实现**（它的注释还写着"单一真源＝…（这里只读它，不另立清单）"
// —— 那份注释是对的，只是**实现**当时是第二份）→ 本模块把两处收成**一处定义**。
//
// 形状（与既有 `hatchFiles` **语义同**：实现换成 `readText`／`exists`、return 折三行 → **不是逐字同**，以**行为**为准核 —— 两个消费者已用**在役注入**核过）：`hatchFiles(slug)` → **绝对路径数组**（调用方直接读）；
// `slug` 为空 → 不过滤（全部）；登记表缺 `hatchFiles` 键或文件不存在 → 空数组（"没用逃生舱"是合法状态）。
import { join } from 'node:path';
import { ROOT, readText, exists } from './fs.mjs';

export const hatchFiles = (slug) => {
	const p = join(ROOT, 'editor', 'escape-hatch.json');
	if (!exists(p)) return [];
	return (JSON.parse(readText(p)).hatchFiles ?? [])
		.filter((f) => !slug || f.includes(`stories/${slug}/`))
		.map((f) => join(ROOT, f));
};
