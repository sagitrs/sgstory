// `#1115` 件②：口径门的**自证格**（独立模块 → 宿主只加 import ＋ 一行调用）。
import { gearDefsCriteriaProblems, codeReadFields, docDeclaredFields } from './gear-defs-criteria.mjs';

/** 本组**格数**（与期望对齐 → 掐一格 → 数变 → 红）。 */
export const GEAR_DEFS_CELLS_EXPECTED = 5;

const ENGINE = 'const g = window.Sg.story.gearDef(k)?.damage ?? 0;\n';
const DOC = '### 1.2 装备声明\n\n| 字段 | 型 |\n|---|---|\n| `damage` | `number` |\n| `note` | `string` |\n\n### 1.3 下一节\n';

export const gearDefsCells = (t) => {
	let n = 0;
	const cell = (label, ok) => { n++; t(label, ok); };
	cell('🔴 Gear.defs 口径门·**完好态**：两面一致 ⇒ 0 问题（防"凡有差就报"✗）',
		gearDefsCriteriaProblems({ read: (f) => (f.includes('resolve') ? ENGINE : '### 1.2 x\n\n| `damage` | n |\n\n### 1.3 y\n') }).length === 0);
	cell('🔴 Gear.defs 口径门·抽取①：② 侧**锚实参位**（`gearDef(...)?.X` ⇒ 收字段；注释里的词不算 ✗）',
		(() => { const s = '// gearDef(k)?.ghost\nconst a = window.Sg.story.gearDef(k)?.damage ?? 0;\n';
			return codeReadFields(s).join(',') === 'damage'; })());
	cell('🔴 Gear.defs 口径门·抽取②：③ 侧只取 §1.2 那一段的表格首列（§1.3 的字段**不算** ✗）',
		(() => { const s = '### 1.2 甲\n\n| `a` | x |\n\n### 1.3 乙\n\n| `b` | y |\n';
			return docDeclaredFields(s).join(',') === 'a'; })());
	cell('🔴 Gear.defs 口径门·**能假①**：给文档**加一个代码不读的字段** ⇒ 必报（对称差「③独有」非空 ✓）',
		(() => { const p = gearDefsCriteriaProblems({ read: (f) => (f.includes('resolve') ? ENGINE : DOC.replace('### 1.3', '| `ghost` | `x` |\n\n### 1.3')) });
			return p.length === 1 && /口径不一致/.test(p[0]); })());
	cell('🔴 Gear.defs 口径门·**能假②**：从文档**删一个代码在读的字段** ⇒ 必报（对称差「②独有」非空 ✓）',
		(() => { const p = gearDefsCriteriaProblems({ read: (f) => (f.includes('resolve') ? ENGINE : DOC.replace('| `damage` | `number` |\n', '')) });
			return p.length === 1 && /damage/.test(p[0]); })());
	return n;
};
export default gearDefsCells;
