// `#1114` 片 1：**散文层拼装主判据件**——悬空红点名/禁则红/具名放行/取值展开/逐字保留/自证成对。
//注意：**本片不含接线 → 无消费者**（`#1114` 复核要求写明）：11 格全部**注入式驱动纯函数**（合成段落对象手喂），
// **没有任何一格读真 `passages/*.md`**、也没有拼装 CLI 入口（§二「拼装 CLI 入口」属后续片）
// → 本件证的是「**函数产出的 twee 文本**的判据面」 ——**不是**「拼装链已通」（后人勿误读）。
//
// 复跑：`node test/passages-assemble.mjs`（无前置 ——纯函数注入 不碰真文件 ㊱）
// 自证：`node test/passages-assemble.mjs --selftest`
//注意：自证结尾 `if (bad) … exit(1)`（#1100 形态硬化 ——格红必进退出码）

import { parseFrontMatter, forbiddenProblems, danglingProblems, valueRefExpand, assemblePassages, FORBIDDEN_BUILTINS } from '../editor/lib/core/passages.mjs';
import { valueTerms, VALUE_KINDS } from '../editor/lib/core/vocab.mjs';

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad++; console.error(`  ✗ ${label}`); } };

const selftest = () => {
	const F = new Set(['set', 'if', 'else', 'elseif', 'for', 'run', 'capture', '=']);
	const T = new Set(['hasChargen', 'classLabel']);

	// ① 正例：合法段（链接+具名动作+已声明取值）→ 0 问题、twee 含展开占位
	const ok = assemblePassages({
		passages: [
			{ name: '渡口', body: '你到了。[[上船|船头]] 职业 {{classLabel}}。' },
			{ name: '船头', body: '你上了船。<<setflag "ev.x">>' },
		], forbidden: F, terms: T });
	t('正例：合法段（含具名动作宏）⇒ 0 问题', ok.problems.length === 0);
	t('正例：twee 含两段+展开占位', ok.twee.includes(':: 渡口') && ok.twee.includes(':: 船头') && !ok.twee.includes('{{classLabel}}'));

	// ② 禁则红（能假）
	const fb = assemblePassages({ passages: [{ name: 'x', body: '<<set $a to 1>>' }], forbidden: F, terms: T });
	t('🔴 禁则 <<set>> ⇒ 红且点名段名', fb.problems.length === 1 && fb.problems[0].includes('x') && fb.problems[0].includes('set'));

	// ③ 具名动作放行（能假的另一半）
	t('具名动作宏 <<setflag>> ⇒ 不红（允许且不判 ✓）', ok.problems.length === 0 && ok.twee.includes('<<setflag'));

	// ④ 悬空引用红点名（能假）
	const dg = assemblePassages({ passages: [{ name: 'a', body: '[[去|不存在]]' }, { name: 'b', body: 'x' }], forbidden: F, terms: T });
	t('🔴 悬空 [[去|不存在]] ⇒ 红且点名「a」与目标「不存在」', dg.problems.length === 1 && dg.problems[0].includes('a') && dg.problems[0].includes('不存在'));

	// ⑤ 取值未声明红（能假）＋已声明展开（正例）
	const vr = valueRefExpand({ name: 'n', body: '{{foo}}', terms: T });
	t('🔴 {{foo}} 未声明 ⇒ 红', vr.problems.length === 1 && vr.problems[0].includes('foo'));
	t('{{classLabel}} 已声明 ⇒ 展开非原样', valueRefExpand({ name: 'n', body: '{{classLabel}}', terms: T }).body !== '{{classLabel}}');

	// ⑥ 逐字保留（散文字符不改）
	const lit = assemblePassages({ passages: [{ name: 'p', body: '逐字保留的散文！？——标点… intact ✓' }], forbidden: F, terms: T });
	t('散文文本逐字保留（无 {{}}/[[ ]] 不变 ✗）', lit.twee.includes('逐字保留的散文！？——标点… intact ✓'));

	// ⑦ front-matter 解析（结构不变量 ——不写死今日快照）
	const fm = parseFrontMatter('---\npassage: 渡口\ntags: prose\n---\n正文');
	t('front-matter：meta 三键+body 剥离', fm.meta.passage === '渡口' && fm.meta.tags === 'prose' && fm.body === '正文');
	t('front-matter：无围栏 ⇒ meta 空+body 原样', parseFrontMatter('正文').meta.passage === undefined);

	// ⑧ valueTerms 单一权威（本件 import core 不另算）
	const vt = valueTerms({ contract: { members: [{ name: 'a', kind: 'const' }, { name: 'b', kind: 'empty-object' }] }, labels: ['classLabel'] });
	t('valueTerms 并集（core ✓ 本件消费不另算）', vt.has('a') && vt.has('classLabel') && !vt.has('b'));

	// ⑨ `#1114` 片 2b-2b-0：`known` ＝ **合法目标全集**（md 段引用 twee 段 → 不得误报悬空）
	// 反例对：真悬空（两边都没有）→ **必须报**（证明不是把所有目标都放过）
	const knownSet = new Set(['船头', '新段']);
	t('构建接线·正例：md 段引用**同故事 twee 段** ⇒ 0 问题（`known` 给出全集 ✓）',
		assemblePassages({ passages: [{ name: '新段', body: '[[上船|船头]]' }], known: knownSet, forbidden: F, terms: T }).problems.length === 0);
	t('构建接线·反例（能假的另一半）：真悬空（不在 `known` 且不在本批）⇒ **报且点名**',
		(() => { const ps = assemblePassages({ passages: [{ name: '新段', body: '[[去哪|不存在段]]' }], known: knownSet, forbidden: F, terms: T }).problems; return ps.some((m) => m.includes('不存在段')); })());
	t('构建接线·缺省向后兼容：不传 `known` ⇒ 仍按本批段名校验（片1 口径不变 ✓）',
		assemblePassages({ passages: [{ name: 'a', body: '[[去|b]]' }, { name: 'b', body: 'x' }], forbidden: F, terms: T }).problems.length === 0);

	// ⑩ `#1114` 片 2b-2b-0：**禁则真源走 core**（本件不得复述清单 ——两处清单正是本片要根除的）
	t('禁则真源：`FORBIDDEN_BUILTINS` 由 core 提供且与拼装层**同一份** ✓',
		FORBIDDEN_BUILTINS.has('set') && FORBIDDEN_BUILTINS.has('if') && FORBIDDEN_BUILTINS.size >= 8);

	// ⑪ `#1350` 片 2：`{{名}}` **三段展开**（本段入参 / 落位 / 世界态取值）＋ 两条**换维**报错。
	// 口径：入参与落位**共用 `{{}}` 命名空间** ⇒ 撞名要换维点名（与"缺值"不同形）；只认**本段** params。
	const P = { p: { type: 'string', required: true } };
	t('片2·① 本段入参（已声明且已传）⇒ 展开为入参占位、不报',
		(() => { const r = valueRefExpand({ name: 'A', body: '你好 {{p}}', terms: T, params: P, args: { p: 'x' } });
			return r.problems.length === 0 && r.body.includes('print_PARAM p'); })());
	t('片2·② 落位（`slot` 命中）⇒ 展开为落位占位、不报',
		(() => { const r = valueRefExpand({ name: 'A', body: '口：{{slotA}}', terms: T, slot: 'slotA' });
			return r.problems.length === 0 && r.body.includes('print_SLOT slotA'); })());
	t('片2·③ 世界态取值（既有口径）⇒ 仍走具名占位、不报',
		(() => { const r = valueRefExpand({ name: 'A', body: '值 {{classLabel}}', terms: T });
			return r.problems.length === 0 && r.body.includes('print_V classLabel'); })());
	t('片2·④ 撞名（`slot` 与入参同名）⇒ **换维**点名（不是"缺值"那一形）',
		(() => { const r = valueRefExpand({ name: 'A', body: '{{n}}', terms: T, params: { n: {} }, slot: 'n' });
			return r.problems.length === 1 && /撞名/.test(r.problems[0]); })());
	t('片2·⑤ 三者都不是（未声明）⇒ 点名（列本段 params 便于自助）',
		(() => { const r = valueRefExpand({ name: 'A', body: '{{未知}}', terms: T });
			return r.problems.length === 1 && /不是本段入参/.test(r.problems[0]); })());
	t('片2·⑥ 必填但调用处未传、也无 `default` ⇒ 点名',
		(() => { const r = valueRefExpand({ name: 'A', body: '{{p}}', terms: T, params: P });
			return r.problems.length === 1 && /必填但没给值/.test(r.problems[0]); })());
	t('片2·⑥反例的另一半：带了 `default` ⇒ **不报**（否则"可选带默认"会被误杀）',
		(() => { const r = valueRefExpand({ name: 'A', body: '{{p}}', terms: T, params: { p: { required: true, default: 'x' } } });
			return r.problems.length === 0; })());

	if (bad) { console.error(`\n✗ 拼装层自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 拼装层自证通过（正例+禁则红+具名放行+悬空点名+取值展开+逐字保留+front-matter+单一权威）');
	process.exit(0);
};

selftest();
