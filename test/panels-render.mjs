// `#1539`（表示面 P3）**声明驱动渲染**的判据件 —— 规格在 spec `docs/superpowers/specs/display-face.md`
// §2.1／§2.2／§3.1／§4④ 与票 `#1539`。
//
// ★本件与 `test/panels.mjs`（P2 的**声明维**）**不同断**：
//   · `test/panels.mjs` 判「**声明面**能不能被登记与编译」（缺省规格／非必给／逐字发射／同一性）；
//   · 本件判「**消费面**真按声明画什么」（读点被真正调用／逐块切换／零声明干净空／类型 fail-loud）。
//   ⇒ 两者是同一性质在**生产侧**与**消费侧**各一次（✗ 同一件事断两遍）。
//
// 判据（每条对应一处失效方式）：
// ① **读点被真正调用**：`StoryCaption` **✗ 再调** `<<hpbar>>` ／ `<<inventory>>`
//    —— 引擎侧清零（spec §5 P3）**与**"读点被真正调用"须同一次落地，否则「故事声明了 ＋ 引擎不读」。
// ② **逐块切换**（spec §3.1）：真机——**有声明 ⇒ 按声明画**；**撤声明 ⇒ 那一块 ✗ 画**（✗ 旧内置块补位）。
//    ★能假：若旧内置块在无声明时**仍画** ⇒ 本格红（那正是「两块并存 ⇒ 生效的那一份不可判」）。
// ③ **零声明 ⇒ 干净的空**（spec §4④）：✗ 印 `（空）`／✗ 印 `$pc.x`／✗ 印 `[undefined]`。
// ④ **未知 `as` ⇒ fail-loud**（同族：`#1543` 的 `fight` 类型错／`#1551` 的 `panels` 非数组）。
// ⑤ **取值口径＝乙**（spec §2.2 定形）：`valueKey` 装 **`pc` 键名** ⇒ `pc[valueKey]`（✗ 经 `vk()`）。
//    ★能假：若改回 `vk(valueKey)` ⇒ ④ 的 `max_hp`／`inv` 那些键取到 `undefined` ⇒ ② 的读数变空 ⇒ 红。
//
// ★零故事态：本件读 `StoryCaption` **源文**（不依赖故事）⇒ ① ⑤ 仍判；② ③ 的真机面需夹具 ⇒
//   无夹具/无故事时**明说未判**（✗ 不静默绿）。
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (label, ok, detail = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`); }
};

// ── ① 引擎侧清零：`StoryCaption` ✗ 再调旧件；读点已接上 ──────────────────────
{
	const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
	const capStart = core.indexOf(':: StoryCaption');
	t('① `StoryCaption` 段存在（本判据要读它才能判）', capStart > 0);
	const cap = capStart > 0 ? core.slice(capStart) : '';
	t('① `StoryCaption` **✗ 再调** `<<hpbar>>`（P3 引擎侧清零 —— 该宏已删）', !/<<hpbar>>/.test(cap),
		'段里仍有 `<<hpbar>>` 调用');
	t('① `StoryCaption` **✗ 再调** `<<inventory>>`（同族清零）', !/<<inventory>>/.test(cap),
		'段里仍有 `<<inventory>>` 调用');
	t('① `StoryCaption` **真调**声明渲染件（`Sg.panels.renderSlot`）—— "读点被真正调用"',
		/Sg\.panels\.renderSlot\(/.test(cap), '段里找不到 renderSlot 调用');
	// 旧件本体也不该在（`Macro.add('hpbar'` ／ `widget "inventory"`）
	t('① 旧件**本体**已删（`Macro.add(\'hpbar\'`／`widget "inventory"` 全仓零命中）',
		!readAllTwee().includes("Macro.add('hpbar'") && !readAllTwee().includes('widget "inventory"'));
}

// ── ⑤ 取值口径（乙）：`pc[valueKey]`，✗ 经 `vk()` ─────────────────────────────
{
	const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
	t('⑤ 取值口径＝**乙**：`valueOf` 直接 `pc?.[k]`（✗ `vk(k)` —— 后者的入参是**量纲名**）',
		/pc\?\.\[k\]/.test(core) && !/vk\(k\)/.test(core),
		'取值口看起来走了 `vk()`');
}

// ── ②③④ 真机面（需夹具 ⇒ 无故事时明说未判）────────────────────────────────
const FIX_FROM = 'test/fixtures/m3-chargen-fixture/stories';
if (!existsSync(join(ROOT, FIX_FROM))) {
	console.log('  ○ 未判：夹具缺席 ⇒ ②（逐块切换）③（零声明干净空）④（未知 as fail-loud）的真机面未判；'
		+ '① ⑤ 与规格面判据仍跑（它们不依赖故事）。');
} else {
	const WORK = mkdtempSync(join(tmpdir(), 'sg-1539-'));
	try {
		const stories = join(WORK, 'stories');
		cpSync(join(ROOT, FIX_FROM), stories, { recursive: true });
		const cg = join(stories, 'cg');
		for (const f of ['15-tables.twee', '16-notes.twee', '17-rules.twee', '18-chargen.twee', '00-meta.twee']) {
			const q = join(cg, f); if (existsSync(q)) rmSync(q);
		}
		const cp = join(cg, 'data/contract.json');
		const d = JSON.parse(readFileSync(cp, 'utf8'));
		const mem = (n) => d.members.find((m) => m.name === n);
		if (!mem('panels')) d.members.push({ name: 'panels', kind: 'const', value: [] });

		// ★每次观测用**新的故事根** ⇒ 产物落**新路径**（`boot()` 的 `HTML_OF` 按**路径**缓存 ⇒
		//   同一路径改内容读不到新页 —— 实测过：不加这一条则后三次观测读到第一次的页）。
		let round = 0;
		const build = (blocks) => {
			round += 1;
			const root = join(WORK, `r${round}`, 'stories');
			cpSync(stories, root, { recursive: true });
			// 清生成物（✗ 否则复制来的旧 `15-tables` 会掩盖新声明）
			for (const f of ['15-tables.twee', '16-notes.twee', '17-rules.twee', '18-chargen.twee', '00-meta.twee']) {
				const q = join(root, 'cg', f); if (existsSync(q)) rmSync(q);
			}
			const cpn = join(root, 'cg', 'data/contract.json');
			const dn = JSON.parse(readFileSync(cpn, 'utf8'));
			if (!dn.members.find((m) => m.name === 'panels')) dn.members.push({ name: 'panels', kind: 'const', value: [] });
			dn.members.find((m) => m.name === 'panels').value = blocks;
			writeFileSync(cpn, JSON.stringify(dn, null, 2) + '\n');
			execFileSync(process.execPath, [join(ROOT, 'build.mjs')],
				{ cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: root }, stdio: 'pipe' });
			return { page: join(WORK, `r${round}`, 'dist/stories/cg/index.html'), root };
		};

		/** 观测：设好 pc 后渲染 StoryCaption，取侧栏文本与血条文本。 */
		const observe = async (blocks) => {
			const { page, root } = build(blocks);
			process.env.SG_STORIES_DIR = root;
			const { boot } = await import('./boot.mjs');
			// ★页面走**绝对路径**（`boot` 的契约：绝对按绝对处理）；`entry` 显式给（清单解析只认 `stories/<slug>/`）
			const B = await boot({ story: page, entry: '开场', random: 0.5 });
			const w = B.w;
			w.eval(`(function(){ const S = SugarCube.State.variables; S.pc = S.pc ?? {};
				S.pc.hp = 7; S.pc.max_hp = 20; S.pc.classLabel = '测'; S.pc.speciesLabel = '测族'; S.pc.name = '测';
				S.pc.inv = { '钥匙': true }; return 1; })()`);
			w.SugarCube.Engine.play('StoryCaption');
			await B.settle(); await new Promise((r) => setTimeout(r, 200)); await B.settle();
			const cap = String(w.document.querySelector('#passages')?.textContent ?? w.document.body.textContent ?? '');
			const bar = String(w.document.querySelector('.sg-bar-text')?.textContent ?? '').trim();
			const list = w.document.querySelectorAll('.sg-list-item').length;
			// ★`#1560`：`list` 的**块标题**（`.sg-list-text` —— 由声明的 `label` 给）
			const listLabel = String(w.document.querySelector('.sg-list-text')?.textContent ?? '').trim();
			B.close?.();
			return { cap, bar, list, listLabel };
		};


		/** 观测 `nocar-basic`：`withPanels=false` ⇒ 撤掉该夹具的 `panels` 声明（看逐块切换）。 */
		const observeNocar = async (NOCAR, withPanels) => {
			round += 1;
			const root = join(WORK, `n${round}`, 'stories');
			cpSync(join(ROOT, NOCAR), root, { recursive: true });
			for (const f of ['15-tables.twee', '16-notes.twee', '17-rules.twee', '18-chargen.twee', '00-meta.twee']) {
				const q = join(root, 'nocar-basic', f); if (existsSync(q)) rmSync(q);
			}
			const cpn = join(root, 'nocar-basic', 'data/contract.json');
			const dn = JSON.parse(readFileSync(cpn, 'utf8'));
			if (!withPanels) dn.members = dn.members.filter((m) => m.name !== 'panels');
			writeFileSync(cpn, JSON.stringify(dn, null, 2) + '\n');
			execFileSync(process.execPath, [join(ROOT, 'build.mjs')],
				{ cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: root }, stdio: 'pipe' });
			process.env.SG_STORIES_DIR = root;
			const { boot } = await import('./boot.mjs');
			const B = await boot({ story: join(WORK, `n${round}`, 'dist/stories/nocar-basic/index.html'), entry: '开场', random: 0.5 });
			const w = B.w;
			w.SugarCube.Engine.play('StoryCaption');
			await B.settle(); await new Promise((r) => setTimeout(r, 200)); await B.settle();
			const scope = w.document.querySelector('#story-caption') || w.document;
			// ★PR 档（jsdom）**量不到几何**（`getBoundingClientRect()` 恒 0）⇒ 本件判**结构存在**
			//   ＋ ★**样式表里有对应规则**（".sg-bar 等有样式" —— 那一面正是"画了但看不见"的根因）。
			//   ★几何判据由**真机档**（`test/browser.mjs`，评审 ⑤ 已改判 `rect.height > 0`）承担。
			const bar = [...scope.querySelectorAll('*')].some((el) => /%/.test(el.style?.width || ''));
			const list = scope.querySelectorAll('.sg-list-item, .inv-item').length > 0;
			const text = String(scope.textContent || '').replace(/\s+/g, ' ').slice(0, 80);
			B.close?.();
			return { bar, list, text };
		};

		const BAR = [{ as: 'bar', slot: 'sidebar.primary', props: [{ slot: 'sidebar.primary', valueKey: 'hp', maxKey: 'max_hp', label: '生命' }] }];
		const LIST = [{ as: 'list', slot: 'sidebar.primary', props: [{ slot: 'sidebar.primary', valueKey: 'inv', empty: '（空）' }] }];
		// ★`#1560`：同形 ＋ `label`（块标题 —— 与 `bar` 的 `label` 对称）
		const LIST_LABEL = [{ as: 'list', slot: 'sidebar.primary', props: [{ valueKey: 'inv', label: '物品栏', empty: '（空）' }] }];

		// ② 逐块切换：有声明 ⇒ 按声明画
		{
			const o = await observe(BAR);
			t('② 有 `bar` 声明 ⇒ **按声明画**（`生命 7 / 20` —— 键名/文案全来自声明）',
				/7\s*\/\s*20/.test(o.bar) && /生命/.test(o.bar), JSON.stringify(o.bar));
		}
		// ② 逐块切换：撤声明 ⇒ 那一块 ✗ 画（✗ 旧内置块补位）
		{
			const o = await observe([]);
			t('② **零声明 ⇒ 血条✗画**（✗ 旧内置块补位 —— 那会让"生效的那一份不可判"）',
				!o.bar && !/7\s*\/\s*20/.test(o.cap), `bar=${JSON.stringify(o.bar)}`);
			t('③ 零声明 ⇒ **干净的空**：✗ 印 `（空）`／✗ 印 `$pc.` ／✗ 印 `[undefined]`',
				!/（空）/.test(o.cap) && !/\$pc\./.test(o.cap) && !/\[undefined\]/.test(o.cap),
				o.cap.slice(-140));
		}
		// ② list 块同理（逐块 ⇒ 块之间互不影响）
		{
			const o = await observe(LIST);
			t('② 有 `list` 声明 ⇒ **按声明画**（物品栏逐项出现）', o.list >= 1, `sg-list-item=${o.list}`);
			const o2 = await observe([]);
			t('② 撤 `list` 声明 ⇒ 物品栏✗画（逐块粒度：✗ 全故事一次切）', o2.list === 0, `sg-list-item=${o2.list}`);
		}
		// ② ★★`#1560`：`list` 的**块标题**两态（真机面 —— ✗ 只判原语纯函数：
		//   标题最终是"**侧栏里真出现**"才算数 ⇒ 这一格走 `StoryCaption` 真渲染 ✓）
		{
			const o = await observe(LIST_LABEL);
			t('② `list` 给了 `label` ⇒ **侧栏真出现该标题**（`#1560` —— 键名/文案全来自声明）',
				o.listLabel === '物品栏', JSON.stringify(o.listLabel));
			const o2 = await observe(LIST);
			t('② ✗ 不给 `label` ⇒ **标题位不产字节**（✗ 引擎不自造名字 ✓）',
				o2.listLabel === '', JSON.stringify(o2.listLabel));
		}
		// ④ 未知 `as` ⇒ fail-loud —— ★**在渲染件层断**（✗ 经 `Engine.play`：SugarCube 会把宏体抛的
		//   异常吞进它自己的错误面 ⇒ 从 `play()` 那一侧看不见「抛了没」，本格会变成**恒绿** ✗ —— 实测过）。
		//   ★这里断的是**契约本身**：未知 `as` ⇒ `renderBlock` 抛（`✗ 静默不画`）。
		//   ★真机面为什么不断：`StoryCaption` 是 SugarCube 宏环境，它的错误面由引擎统一收集
		//     ⇒ 那是"引擎整体报错"的既有机制，✗ 与本件要断的"声明写错必须看得见"不是同一件事。
		{
			process.env.SG_STORIES_DIR = stories;
			const { createContext } = await import('../scripts/audit/context.mjs');
			const ctx = createContext({ story: null }).window;
			const cases = [
				['未知 as', [{ as: 'bogus', props: [] }]],
				['as 缺失', [{ props: [] }]],
			];
			const results = cases.map(([label, blocks]) => {
				ctx.Sg.story.panels = () => blocks;
				try { ctx.Sg.panels.renderSlot({}, 'sidebar.primary'); return `${label}：✗ 未抛`; }
				catch (e) { return /未知的/.test(String(e?.message)) ? null : `${label}：抛的报文不对（${String(e?.message).slice(0, 50)}）`; }
			}).filter(Boolean);
			t('④ 未知／缺失 `as` ⇒ **fail-loud**（✗ 静默不画 —— 同族：`#1543` 的 `fight` 类型错／`#1551` 的非数组）',
				results.length === 0, results.join(' ／ '));
			// ④b 反证：合法 `as` ⇒ ✗ 不抛（本格不是恒红格）
			ctx.Sg.story.panels = () => [{ as: 'bar', props: [{ valueKey: 'hp', maxKey: 'max_hp' }] }];
			let ok4b = true;
			try { ctx.Sg.panels.renderSlot({ hp: 1, max_hp: 2 }, 'sidebar.primary'); } catch { ok4b = false; }
			t('④b 反证：合法 `as` ⇒ ✗ 不抛（本格可区分，✗ 恒红）', ok4b);
		}
		// ⑥ ★★（评审要求）**产品面：无车卡故事的"最小面"两态**（✗ 只由真机档承担 ——
		//   "链上全绿、真机面红"正是本笔的教训）。对象＝**真夹具** `m3-nocar-fixture/nocar-basic`
		//   （就是 `test/browser.mjs` 断言的那个故事）⇒ 本格与真机档**同对象**（✗ 另造一个像的）。
		{
			const NOCAR = 'test/fixtures/m3-nocar-fixture/stories';
			if (!existsSync(join(ROOT, NOCAR))) {
				console.log('  ○ 未判：`m3-nocar-fixture` 缺席 ⇒ ⑥（产品最小面两态）未判；'
					+ '★注意：本面若无人判 ⇒ 正是"链上全绿、真机面红"那个洞（见 `#1556` CR）。');
			} else {
				const o = await observeNocar(NOCAR, /* withPanels */ true);
				t('⑥ `nocar-basic`（无车卡）**有声明 ⇒ 最小面两块都在**（血量条 ＋ 物品栏）',
					o.bar && o.list, JSON.stringify(o));
				t('⑥ 且**画的是真数据**（✗ 不是引擎替它猜的 `❤ 0 / 1` 假值 —— spec §4④ 点名的那型）',
					/12\s*\/\s*12/.test(o.text), o.text);
				const o2 = await observeNocar(NOCAR, /* withPanels */ false);
				t('⑥ **撤声明 ⇒ 两块皆✗画**（逐块切换；✗ 旧内置块补位）',
					!o2.bar && !o2.list, JSON.stringify(o2));
			}
		}
		// ⑧ ★★（评审 ⑥⑦）**"静默无效键"** —— spec 的示例形必须与**实现消费的键**一致。
		//   ★为什么单列一组（✗ 靠文档自觉）：**spec 就是"怎么抄"的来源** ——
		//     照 §2.2 抄的第三个作者会写两个**静默无效**的键（`prop.slot` 落回缺省、
		//     `style:"hp"` 无样式），而两处都**不报错**（实测：后者与"不传 style"逐字相同）。
		//     ⇒ 实测证据：本笔的 books 半就是照 §2.2 抄的，踩到后回头查实现才改。
		{
			const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
			const draw = readFileSync(join(ROOT, 'src/engine/50-present/13-draw.twee'), 'utf8');
			const spec = readFileSync(join(ROOT, 'docs/superpowers/specs/display-face.md'), 'utf8');
			// ⑧a 实现**只读 block 的 slot**（✗ prop 的）
			t('⑧a 实现只读 **block** 的 `slot`（✗ `prop.slot`）',
				/b\?\.slot|block\?\.slot/.test(core) && !/prop\?\.slot/.test(core));
			// ⑧b spec 示例**不再**把 slot 写在 prop 上（与 ⑧a 一致）
			const example = spec.slice(spec.indexOf('```jsonc'), spec.indexOf('```', spec.indexOf('```jsonc') + 8));
			t('⑧b spec §2.2 示例的 `slot` 写在 **block** 上（✗ prop —— 那是静默无效键）',
				/"as":\s*"bar",\s*"slot"/.test(example) && !/props":\s*\[\s*\{\s*"slot"/.test(example),
				example.slice(0, 120));
			// ⑧c spec 示例的 `style` 是**对象**形（✗ 字符串 `"hp"` —— 那是静默无效值）
			t('⑧c spec §2.2 示例的 `style` 是**对象**（✗ 字符串 `"hp"`：与不传 style 逐字相同）',
				/"style":\s*\{/.test(example) && !/"style":\s*"(?!\{)/.test(example), example.slice(0, 160));
			// ⑧d 实现**只认对象** style（✗ 字符串）—— 与 ⑧c 同断的另一面
			t('⑧d 实现 `Sg.draw.bar` 的 `style` 只认对象（读 `style.fill`／`style.track`）',
				/style\.fill/.test(draw) && /style\.track/.test(draw));
			// ⑧e spec 写了「被消费的键」清单（把"声明面 ≡ 实现面"钉住）
			t('⑧e spec §2.2 有**被消费的键**清单（✗ 只给示例 ⇒ 后人照抄静默无效键）',
				/被消费的键/.test(spec) && /prop 上的 `slot` ✗ 不读/.test(spec));
		}
		// ⑦ ★★（评审 ② MAJOR）**"画了但看不见"** —— 新渲染件产的类**必须有样式**。
		//   ★为什么单列一格：`13-draw.twee` 只产**结构**（DOM 串），**形**在 `90-style.twee` ⇒
		//     少了样式则"节点在、`style.width` 也在，而高度 0 ⇒ 玩家看不见" ⇒
		//     所有**结构面**判据全绿而**对象不在**（同族：`#1541` 的"死件"／`#1551` 的"缺省规格 ≠ 进产物"）。
		//   ★几何的最终判据在真机档（jsdom 量不到 rect）—— 本格判"**样式规则在场**"这一必要条件。
		{
			const css = readFileSync(join(ROOT, 'src/engine/50-present/90-style.twee'), 'utf8');
			t('⑦ 新渲染件的类**有样式**：`.sg-bar`（✗ 缺 ⇒ 高度 0 ⇒ 玩家看不见）', /\.sg-bar\s*\{/.test(css));
			t('⑦ `.sg-bar-fill` 有样式（宽度百分比要能看见）', /\.sg-bar-fill\s*\{/.test(css));
			t('⑦ `.sg-list`／`.sg-list-item` 有样式', /\.sg-list\s*\{/.test(css) && /\.sg-list-item\s*\{/.test(css));
			// ★`#1560`：块标题也要有样式 —— ★且必须**独占一行**（`flex-basis: 100%`）：
			//   标题与首个条目挤在同一行 ⇒ 那就不是标题（★样式缺/不生效＝同族"看得见"的那面）。
			t('⑦ `.sg-list-text`（块标题）有样式**且能独占一行**（`flex-basis: 100%`）',
				/\.sg-list-text\s*\{[^}]*flex-basis:\s*100%/.test(css),
				(css.match(/\.sg-list-text\s*\{[^}]*\}/) ?? ['（无该规则）'])[0].replace(/\s+/g, ' ').slice(0, 100));
			t('⑦ 旧类**死码已清**（`.hpbar`／`.inv-item` 在样式表里零命中 —— 壳已删）',
				!/\.hpbar\s*\{/.test(css) && !/\.inv-item\s*\{/.test(css), '样式表里仍有已删件的规则');
		}
	} finally { rmSync(WORK, { recursive: true, force: true }); }
}

if (bad) { console.error(`\n✗ 声明驱动渲染判据失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 声明驱动渲染通过（读点被调用 · 逐块切换 · 零声明干净空 · 未知 as fail-loud · 取值口径乙）');

/** 全仓 twee 源（判"旧件本体已删"用）。 */
function readAllTwee() {
	const out = [];
	for (const f of ['src/10-core.twee', 'src/engine/50-present/13-draw.twee', 'src/engine/50-present/11-scene.twee', 'src/engine/50-present/12-shortfight.twee', 'src/engine/50-present/90-style.twee']) {
		try { out.push(readFileSync(join(ROOT, f), 'utf8')); } catch { /* 缺件跳过 */ }
	}
	return out.join('\n');
}
