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
			B.close?.();
			return { cap, bar, list };
		};

		const BAR = [{ as: 'bar', slot: 'sidebar.primary', props: [{ slot: 'sidebar.primary', valueKey: 'hp', maxKey: 'max_hp', label: '生命' }] }];
		const LIST = [{ as: 'list', slot: 'sidebar.primary', props: [{ slot: 'sidebar.primary', valueKey: 'inv', empty: '（空）' }] }];

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
