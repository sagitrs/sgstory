// 车道 D 切片 3（`#215` 报备 `18502113`）：**键级图**的显示层 —— 只做"取输入 → 交给 DOM"，不含判定。
//
// 判定在 core（`lib/core/eventGraph.mjs` 的 `graphOf()` → 页内不重写）；本件负责：
// ① 容器缺失 → **讲人话地抛**（图不该静默不显示）；
// ② 包里 `rules.json`／`contract.json` 缺项 → **讲人话地抛**（**不许画一张空图** —— 空图会被读成"没有依赖"）；
// ③ 末行**自带适用范围**声明（㉑／㉕：把"部分"写进**读数**，不只写在票面）。
// **浏览器安全**：零宿主。

import { graphOf, formatGraph } from '../lib/core/eventGraph.mjs';

const PLACEHOLDER = '（键级图：未载入 ✓）';

/** **清空**那一格（`#946`：换包/载入失败时**旧图必须消失** —— 否则读的人会把**上一个包**的图当成这次的，
 * 与 **㉖**「陈旧残留给出假读数」同族）。 */
export const clearEventGraph = ({ doc, containerId = 'graph' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (el) el.textContent = PLACEHOLDER;
};

/** 把图渲染进 `#graph`；返回 `graphOf()` 的输出（**供读数断言** —— 显示与判定同源）。
 *注意：**入口先清**（`#946`）：任何一条守卫抛之前，那一格已经**清过** → 抛了也不留旧图。 */
export const renderEventGraph = ({ doc, pkg, containerId = 'graph' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (!el) throw new Error(`键级图：容器「#${containerId}」不存在 ✗（图不该静默不显示 ✓）`);
	clearEventGraph({ doc, containerId });   // `#946`：**清在守卫之前**
	const rows = pkg?.data?.['rules.json']?.rows;
	const members = pkg?.data?.['contract.json']?.members;
	if (!Array.isArray(rows) || !Array.isArray(members)) {
		throw new Error('键级图：包里的「rules.json」或「contract.json」缺项 ✗（缺数据必须报错 ✗ —— 空图会被读成"没有依赖"✓）');
	}
	const g = graphOf({ rows, members });
	el.textContent = [...formatGraph(g), '', '⚠️ 本图是**键级**图 ✗（不含位置边 ✗／不含散文写点 ✗ —— 见 `core/eventGraph.mjs` 件头 ✓）'].join('\n');
	return g;
};
