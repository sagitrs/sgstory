// `#1114` 片 1：**散文层拼装主判据件**——悬空红点名/禁则红/具名放行/取值展开/逐字保留/自证成对。
//注意：**本片不含接线 → 无消费者**（`#1114` 复核要求写明）：11 格全部**注入式驱动纯函数**（合成段落对象手喂），
// **没有任何一格读真 `passages/*.md`**、也没有拼装 CLI 入口（§二「拼装 CLI 入口」属后续片）
// → 本件证的是「**函数产出的 twee 文本**的判据面」 ——**不是**「拼装链已通」（后人勿误读）。
//
// 复跑：`node test/passages-assemble.mjs`（无前置 ——纯函数注入 不碰真文件 ㊱）
// 自证：`node test/passages-assemble.mjs --selftest`
//注意：自证结尾 `if (bad) … exit(1)`（#1100 形态硬化 ——格红必进退出码）

import { parseFrontMatter, forbiddenProblems, danglingProblems, valueRefExpand, assemblePassages, endingProblems, doubleRenderProblems, FORBIDDEN_BUILTINS } from '../editor/lib/core/passages.mjs';
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
			// `#1350` §11.2：入参编译成**引擎侧宏** `<<printparam "名">>`（运行期取值 ⇒ ✗ 不烘值）
			return r.problems.length === 0 && r.body.includes('<<printparam "p">>'); })());
	t('片2·② 落位（`slot` 命中）⇒ 展开为**占位**、不报（片 4 在拼装期把它换成链接行）',
		(() => { const r = valueRefExpand({ name: 'A', body: '口：{{slotA}}', terms: T, slot: 'slotA' });
			// `#1350` §11.2：`slot` 的**落位**由片 4 的 `renderLinksOf` 在拼装期换成链接行
			// ⇒ 本函数（`valueRefExpand`）只负责"认它是合法占位"（✗ 不报）⇒ 断言＝三支都不是时**才**报
			return r.problems.length === 0; })());
	t('片2·③ 世界态取值（既有口径）⇒ 仍走具名占位、不报',
		(() => { const r = valueRefExpand({ name: 'A', body: '值 {{classLabel}}', terms: T });
			// `#1350` §11.2：世界态取值走**既有形态** `$pc.<名>`（✗ 不另造宏名）
			return r.problems.length === 0 && r.body.includes('$pc.classLabel'); })());
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

	// ── `#1350`／`#1368`：**"不许烘值"**（占位符展开的真牙 ①）──────────────────────
	// 背景（靶暴露）：`门厅.推门` 与 `侧厅.左门` **都传** `提醒:"别进屋"` ⇒ **同值** ⇒
	//   "**编译期烘值**"与"**运行期取值**"产出**一模一样** ✗ ⇒ 当时**不可分辨**。
	// ⇒ 本格把"值不许在编译期烘进产物"变成可判：**产物 body 里不得出现该值字面** ✓
	//   （配套的另一半＝**渲染文本里必须出现该值**，由 `② 渲染面` 承担 ⇒ 两条各自能咬、✗ 互不替代 ✓）
	{
		const data = { 里屋: { params: { 提醒: { type: 'string', required: true } }, links: [] } };
		const passages = [{ name: '里屋', tags: [], body: '纸上写着：{{提醒}}。' }];
		const r = assemblePassages({ passages, known: new Set(), data });
		t('① 占位符**不烘值**：产物 body 里是 `<<printparam "提醒">>`（占位，✗ 不含值 ✓）',
			/<<printparam "提醒">>/.test(r.twee));
		// ★ 口径修正（`#1373` 实跑暴露，我上一版**写错了**）：
		//   "不含值字面"**不能**判"整份产物"——`args` 是**编译后的数据面**（供运行期取值用 ✓），
		//   它**本来就该**带着值出现在规则表数据里（`args: { '提醒': '别进屋' }`）。
		//   ⇒ 正确的面是「**段落 body**」：值**不许写进正文**（正文里应是 `<<printparam "提醒">>`）✓
		//   （实证：靶产物里 2 处 `别进屋` 都在规则表数据行上，段落 `tw-passagedata` 里是占位 ✓）
		const bodies = (twee) => [...String(twee).matchAll(/:{2}\s*([^\[\n]+?)\s*\[[^\]]*\]\n([\s\S]*?)(?=\n::|$)/g)]
			.map((m) => ({ name: m[1].trim(), body: m[2] }));
		const bl = bodies(r.twee);
		t('① 占位符**不烘值**：**段落 body** 里不含 `args` 值字面（`别进屋` ✗）',
			bl.length > 0 && bl.every((b) => !b.body.includes('别进屋')));

		// **能假**：注入一个"把值烘进 body"的实现（模拟编译期取值）⇒ 上述断言**必红** ✓
		const bake = (name, body) => body.replace(/\{\{提醒\}\}/g, '别进屋');
		const baked = { twee: `:: ${'里屋'} []\n` + bake('里屋', passages[0].body) };
		const bakedBodies = bodies(baked.twee);
		t('① 能假：若把值烘进 **段落 body** ⇒ 那格**当场红** ✓',
			(bakedBodies.length > 0) && !bakedBodies.every((b) => !b.body.includes('别进屋')));
	}
	// ── `#1350`／`#1368`：**渲染面**（② 取值链没断）———————————————
	// 形态：走**真入口**（`passages/*.md` → 拼装 → build → 渲染）才判得了 ⇒ 现网**还没有**那条链路
	//   （`build.mjs` 调 `assemblePassages` 时**没传 `data`** ⇒ 新形态故事 build 不过 ⇒ 渲染无从谈起）
	// ⇒ 按"零故事态／外根"同规：**前提不成立 ⇒ 出声"未判"**（✗ 不许静默绿 ✗ 也不许假红 ✓）
	{
		const chainReady = process.env.SG_NEW_FORM_BUILD === '1';
		if (!chainReady) {
			console.log('  ○ 未判：**渲染面**（② 值由 `args` 传入 ⇒ 渲染文本含该值）需要"新形态 build ＋ 渲染"链路，'
				+ '现网未通（`build.mjs` 未传 `data` ⇒ 新形态 build 不过）⇒ 本格未判（✗ 不静默绿）');
		} else {
			t('② 渲染面：渲染文本里**必须出现**该值（取值链没断）', false);   // 链路通后由真跑替换
		}
	}
	// ── `#1399`：**结局声明面**（唯一活声明＝`ending` 字段；`tags: [ending]` 是死声明 ⇒ 点名）─────
	{
		const P = (name, tags) => ({ name, tags, body: '正文。' });
		t('结局① 正例：段数据写了 `ending:{key,kind}` ⇒ **不报**（唯一活声明 ✓）',
			endingProblems({ passages: [P('入林', [])], data: { 入林: { ending: { key: '入林', kind: 'chapter' } } } }).length === 0);
		t('结局② ★**病灶形态**：只有 `tags: [ending]`（无 `ending` 字段）⇒ 点名"死声明"并给修法',
			(() => { const q = endingProblems({ passages: [P('结间 入林', ['ending'])], data: { '结间 入林': {} } });
				return q.length === 1 && /死声明/.test(q[0]) && /ending: \{key,kind\}/.test(q[0]); })());
		t('结局②反例·**旧形态**：正文手写 `<<ending \"x\" chapter>>` ＋ tags ⇒ **不报**（正文宏＝活声明 ✓）',
			endingProblems({ passages: [{ name: '入林', tags: ['ending'], body: '正文。\n<<ending "x" chapter>>' }], data: { 入林: {} } }).length === 0);
		t('结局③ tags ＋ 字段 ⇒ **不报**（tags 只是人读标记；活声明仍唯一 ✓）',
			endingProblems({ passages: [P('入林', ['ending'])], data: { 入林: { ending: { key: '入林', kind: 'final' } } } }).length === 0);
		t('结局③乙 ★**并存 ⇒ 红**（`ending` 字段 ＋ 正文手写宏 ⇒ 产物**两张出口卡** ✗ —— 协调席裁）',
			(() => { const q = endingProblems({ passages: [{ name: '入林', tags: [], body: '正文。\n<<ending "入林" chapter>>' }],
				data: { 入林: { ending: { key: '入林', kind: 'chapter' } } } });
				return q.length === 1 && /两张出口卡/.test(q[0]); })());
		t('结局③甲 ★**面外不判**（无段数据／段不在 data 里 ⇒ ✗ 不报 —— 义务不可追溯，与 P1–P4 同尺）',
			endingProblems({ passages: [P('结局 收好', ['ending'])], data: null }).length === 0
			&& endingProblems({ passages: [P('结局 收好', ['ending'])], data: { 别的段: {} } }).length === 0);
		t('结局④ `ending.key` 空 ⇒ 点名（出口卡与图鉴拿不到键）',
			endingProblems({ passages: [P('入林', [])], data: { 入林: { ending: { key: '  ', kind: 'final' } } } }).some((x) => /key.*为空/.test(x)));
		t('结局⑤ `ending.kind` 非法 ⇒ 点名（只许 chapter／final）',
			endingProblems({ passages: [P('入林', [])], data: { 入林: { ending: { key: 'x', kind: 'epilogue' } } } }).some((x) => /只许/.test(x)));
		t('结局⑥ ★注入面：带 `ending` 的段 ⇒ 产物里**恰有一处** `<<ending "key" kind>>`（编译期唯一注入 ✓）',
			(() => { const r = assemblePassages({ passages: [P('入林', [])], known: new Set(),
				data: { 入林: { ending: { key: '入林', kind: 'chapter' } } } });
				const n = (r.twee.match(/<<ending "入林" chapter>>/g) ?? []).length; return n === 1 && r.problems.length === 0; })());
		t('结局⑦ 负向：**没有** `ending` 的普通段 ⇒ 产物里**不得**出现 `<<ending`',
			(() => { const r = assemblePassages({ passages: [P('门厅', [])], known: new Set(), data: { 门厅: {} } });
				return !/<<ending/.test(r.twee); })());
	}
	// ★ `#1505`（本票）：段级字段 **`check`** —— 「本段入口跑一次位点检定」（原散文 `<<sitecheck "站点">><<snapshot>>`）。
	//   ★判据的靶 ＝ **告成的核心是"编译期注入"**（照上面 `结局⑥/⑦` 的形 ✓）：
	//   ① 声明了 ⇒ 产物里**恰有一对** `<<sitecheck "站点">><<snapshot>>`（且**在段首**）；
	//   ② ★**配对不拆**（`snapshot` 与 `sitecheck` 永远同生 —— 少一个 ⇒ 骰面丢了 ⇒ `<<lastcheck>>` 恒不显 ✗）；
	//   ③ 未声明 ⇒ **不得**出现（零破坏 ✓）；④ ★**站点名含引号 ⇒ 转义**（✗ 不许把段炸开 ✓）。
	{
		const P = (name, body, tags = []) => ({ name, tags, body });
		const seg = (body, check) => assemblePassages({ passages: [P('里屋', body)], known: new Set(), data: { 里屋: check == null ? {} : { check } } }).twee;
		t('段级 check① 声明了 ⇒ 产物**恰有一对** `<<sitecheck "…">><<snapshot>>`，且在**段首**',
			(() => { const t2 = seg('正文。', '里屋·察觉');
				return (t2.match(/<<sitecheck "里屋·察觉">><<snapshot>>/g) ?? []).length === 1
					&& t2.split('\n').find((l) => l.includes('sitecheck')).indexOf('<<sitecheck') === 0; })());
		t('段级 check② ★**配对不拆**：产物里 `sitecheck` 与 `snapshot` 的出现次数**相等**（✗ 少一个 ⇒ 骰面丢）',
			(() => { const t2 = seg('正文。', '里屋·察觉');
				const a2 = (t2.match(/<<sitecheck\b/g) ?? []).length, b2 = (t2.match(/<<snapshot>>/g) ?? []).length;
				return a2 === 1 && b2 === 1; })());
		t('段级 check③ 负向：**未声明** `check` ⇒ 产物里**不得**出现（零破坏 ✓）',
			(() => !/<<sitecheck|<<snapshot/.test(seg('正文。', null)) && !/<<sitecheck|<<snapshot/.test(seg('正文。', undefined)))());
		t('段级 check④ 站点名**含双引号** ⇒ 转义（✗ 不许把宏/段炸开 ✓）',
			(() => { const t2 = seg('正文。', '站点"引号');
				return t2.includes('\\"') && !/<<sitecheck "站点"引号"/.test(t2); })());
		// ★ `#1527` CR（同族“判据不能假”）：★旧格用 `t2.includes('\\\\')` ⇒
		//   ★**输入自带反斜杠** ⇒ ★该子串**恒命中** ✗（★判据被输入本身满足）
		//   ★修：★**期望串逐字相等**（★`inject` 行与实得行**逐字**比 —— ✗ 不问子串✓）
		//   ★输入 `'站点\\"'`（JS 字面 ⇒ 实值 站点+\+" 三字符）
		//     ⇒ ★期望产物行：`<<sitecheck "站点\\\"">><<snapshot>>`（★反斜杠**被转成**双反斜杠 ＋ 引号前一个反斜杠）
		t('段级 check⑤ ★**转义加固（逐字比）**：★`\\` ⇒ `\\\\`，`"` ⇒ `\\"`（✗ 它会把后面的 `"` 吃掉 ⇒ 宏串提前闭合 ✓）',
			(() => { const t2 = seg('正文。', '站点\\"');
				const wantLine = '<<sitecheck "站点\\\\\\"">><<snapshot>>';
				const gotLine = t2.split('\n').find((l) => l.includes('sitecheck')) ?? '';
				return gotLine === wantLine; })());
		t('段级 check⑥ ★**换行降级**：站点名含换行 ⇒ 换成空格（✗ 否则宏被拆成两半 ⇒ 后半段泄漏给玩家 ✓）',
			(() => { const t2 = seg('正文。', '站点\n引号');
				return /<<sitecheck "站点 引号">>/.test(t2) && (t2.match(/<<sitecheck/g) ?? []).length === 1; })());
		t('★段级 check⑦ **双注 ⇒ 点名**（`check` 字段 ＋ 散文手写 `<<sitecheck>>` ⇒ ★检定**跑两遍**—— 两次掷骰 ✗）',
			(() => { const q = doubleRenderProblems({ passages: [P('里屋', '正文。\n<<sitecheck "里屋·察觉">><<snapshot>>')],
					data: { 里屋: { check: '里屋·察觉' } } });
				return q.length === 1 && /两遍|掷骰/.test(q[0]); })());
		t('★段级 check⑧ 负向：**只有**段级 `check`（散文无手写宏）⇒ ✗ 不报（新形态 ✓）',
			doubleRenderProblems({ passages: [P('里屋', '正文。')], data: { 里屋: { check: '里屋·察觉' } } }).length === 0);
	}
	// ★ `#1506`（本票）：段级字段 **`fight`** —— 「这一段入口是一场战斗」（原散文三行：
	//   `<<fightbegin "池">>` ／ `<<fightlog>>` ／ `<<fightpanel "池" N 结果 去向>>`）。
	//   ★靶同样＝**编译期注入**（照上面 `段级 check` 的形 ✓）：
	//   ① 声明 ⇒ 产物里**三个宏各恰一个**，且**在段首**（挂载点顺序＝数据字段顺序）；
	//   ② ★**可选位按位置传参**：`result` 给了而 `turns` 没给 ⇒ 补空槽（`<<fightpanel "池" null won>>`），
	//      ✗ 不许把它悄悄挪成 `<<fightpanel "池" won>>`（那是"打满 won 回合"—— 语法/语义双错 ✗）；
	//   ③ 未声明 ⇒ **不得**出现（零破坏 ✓）；④ `pool` 缺/空 ⇒ **点名**（✗ 不注入半个宏串 ✓）；
	//   ⑤ `turns` 非数 ⇒ 点名（它是回合数这个**机械事实** ✗ 不是文案 ✓）；⑥ 转义＋换行降级（与 `check` 同一套 ✓）。
	{
		const P = (name, body, tags = []) => ({ name, tags, body });
		const segF = (body, fight) => assemblePassages({ passages: [P('斗', body)], known: new Set(),
			data: { 斗: fight == null ? {} : { fight } } });
		const tweeF = (body, fight) => segF(body, fight).twee;
		t('段级 fight① 声明了 ⇒ 产物**三个宏各恰一个**，且**在段首**（顺序＝begin／log／panel ✓）',
			(() => { const t2 = tweeF('雾在门口。', { pool: '雾影', turns: 3, result: 'won', dest: '战后' });
				// ★ 段首＝**段体首行**（`twee` 的第 0 行是 `:: 段名 []` 段头 ⇒ 注入落在第 1 行 ✓）
				const L = t2.split('\n');
				return (t2.match(/<<fightbegin "雾影">>/g) ?? []).length === 1
					&& (t2.match(/<<fightlog>>/g) ?? []).length === 1
					&& (t2.match(/<<fightpanel "雾影" 3 won "战后">>/g) ?? []).length === 1
					&& L[1] === '<<fightbegin "雾影">><<fightlog>><<fightpanel "雾影" 3 won "战后">>'
					&& String(L[2]).startsWith('雾在门口'); })());
		t('段级 fight② 只给 `pool` ⇒ **两参形**（与今天手写常见形同：`<<fightpanel "雾影">>`）',
			(() => { const t2 = tweeF('雾在门口。', { pool: '雾影' });
				return t2.includes('<<fightbegin "雾影">><<fightlog>><<fightpanel "雾影">>'); })());
		t('段级 fight③ ★**可选位按位置传参**：`result` 给了而 `turns` 没给 ⇒ 补空槽（✗ 不许挪成"打满 won 回合"）',
			tweeF('雾在门口。', { pool: '雾影', result: 'won' }).includes('<<fightpanel "雾影" null won>>'));
		t('段级 fight④ 负向：**未声明** ⇒ 产物里**不得**出现战斗三宏（零破坏 ✓）',
			(() => !/<<fightbegin|<<fightlog|<<fightpanel/.test(tweeF('雾在门口。', null))
				&& !/<<fightbegin|<<fightlog|<<fightpanel/.test(tweeF('雾在门口。', undefined)))());
		t('段级 fight⑤ `pool` 缺/空 ⇒ **点名**（✗ 不许静默注入半个宏串 ⇒ 产物里也没有那三个宏 ✓）',
			(() => { const a = segF('雾在门口。', { turns: 3 }), b = segF('雾在门口。', { pool: '   ' });
				return a.problems.length === 1 && /pool/.test(a.problems[0]) && !/<<fightbegin/.test(a.twee)
					&& b.problems.length === 1 && /pool/.test(b.problems[0]); })());
		t('段级 fight⑥ `turns` 非数 ⇒ **点名**（它是回合数这个机械事实 ✗ 不是文案）',
			(() => { const q = segF('雾在门口。', { pool: '雾影', turns: '三' });
				return q.problems.length === 1 && /有限数/.test(q.problems[0]); })());
		t('段级 fight⑦ ★**转义＋换行降级**（与 `check` 同一套：`"`⇒`\\"`，换行⇒空格）',
			(() => { const t2 = tweeF('雾在门口。', { pool: '池"名\n换行' });
				return t2.includes('<<fightbegin "池\\"名 换行">>') && (t2.match(/<<fightbegin/g) ?? []).length === 1; })());
		t('★段级 fight⑧ **双注 ⇒ 点名**（`fight` 字段 ＋ 散文手写三宏 ⇒ 同一场**渲两遍** ✗）',
			(() => { const q = doubleRenderProblems({ passages: [P('斗', '正文。\n<<fightbegin "雾影">>\n<<fightlog>>\n<<fightpanel "雾影" 3 won>>')],
					data: { 斗: { fight: { pool: '雾影' } } } });
				return q.length === 1 && /两遍/.test(q[0]); })());
		t('★段级 fight⑨ **单行手写也点名**（作者只删了两行、留了 `<<fightpanel>>` 一行 ⇒ 同样要红 ✓）',
			doubleRenderProblems({ passages: [P('斗', '正文。\n<<fightpanel "雾影">>')],
				data: { 斗: { fight: { pool: '雾影' } } } }).length === 1);
		t('★段级 fight⑩ 负向：**只有**段级 `fight`（散文无手写宏）⇒ ✗ 不报（新形态 ✓）',
			doubleRenderProblems({ passages: [P('斗', '雾在门口。')], data: { 斗: { fight: { pool: '雾影' } } } }).length === 0);
	}
	// ★ 双渲染宏（`#1412`）：**面内段**同时有散文手写渲染宏（`<<rules>>`／`<<rulelist>>`）与 `links[]`（非空 ⇒ 注入段尾块）
	//   ⇒ **点名红**（修法：删手写宏 或 移内联 `slot`）—— 与 `#1399`「并存 ⇒ 红」同族（"看起来能跑、其实重复渲染"✗）
	{
		const P = (name, body, tags = []) => ({ name, tags, body });
		t('双渲染① 正例：**手写宏 ＋ 无 links** ⇒ 不报（旧形态：链接写在正文里，宏是唯一渲染口 ✓）',
			doubleRenderProblems({ passages: [P('门厅', '正文。\n<<rulelist "门厅">>')], data: { 门厅: { links: [] } } }).length === 0);
		t('双渲染② 正例：**有 links ＋ 无手写宏** ⇒ 不报（新形态：块由编译期注入 ✓）',
			doubleRenderProblems({ passages: [P('门厅', '正文。')], data: { 门厅: { links: [{ label: 'x', to: 'y' }] } } }).length === 0);
		t('双渲染③ ★**病灶形态**：手写 `<<rulelist>>` ＋ `links[]` 非空 ⇒ 点名（产物会**渲染两遍** ✗）',
			(() => { const q = doubleRenderProblems({ passages: [P('门厅', '正文。\n<<rulelist "门厅">>')], data: { 门厅: { links: [{ label: 'x', to: 'y' }] } } });
				return q.length === 1 && /两遍|重复渲染/.test(q[0]); })());
		t('双渲染④ `<<rules>>` 形态同样点名 ✓',
			doubleRenderProblems({ passages: [P('门厅', '正文。\n<<rules "门厅">>')], data: { 门厅: { links: [{ label: 'x', to: 'y' }] } } }).length === 1);
		t('双渲染⑤ ★**面外不判**（无段数据／段不在 data 里 ⇒ ✗ 不报 —— 义务不可追溯，与 `endingProblems` 同尺）',
			doubleRenderProblems({ passages: [P('门厅', '正文。\n<<rulelist "门厅">>')], data: null }).length === 0
			&& doubleRenderProblems({ passages: [P('门厅', '正文。\n<<rulelist "门厅">>')], data: { 别的段: {} } }).length === 0);
		t('双渲染⑥ 带 `slot` 的 links（**内联** ⇒ 不注入段尾块）＋ 手写宏 ⇒ ✗ 不报（互斥落位 ✓）',
			doubleRenderProblems({ passages: [P('门厅', '正文。\n<<rulelist "门厅">>')], data: { 门厅: { links: [{ label: 'x', to: 'y', slot: '口' }] } } }).length === 0);
	}
	if (bad) { console.error(`\n✗ 拼装层自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 拼装层自证通过（正例+禁则红+具名放行+悬空点名+取值展开+逐字保留+front-matter+单一权威+段级字段注入）');
	process.exit(0);
};

selftest();
