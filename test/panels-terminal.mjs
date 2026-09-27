// `#1540`（表示面 P4）**终态确认** 的判据件 —— 规格在 spec `docs/superpowers/specs/display-face.md` §5 P4
// 与票 `#1540`。
//
// ★本件的**定位**（为什么 P4 是"确认"而不是"再删一遍"）：
//   `#1539`（P3）**当笔就删了** `<<hpbar>>` 与 `<<widget "inventory">>`（引擎侧清零与消费面接上**同一笔落**，
//   ✗ 分笔 —— 分笔的中间态是「故事声明了 ＋ 引擎不读」＋「旧内置块还在画」）。
//   ⇒ P4 的实体工作因此缩为**终态确认**：① 删净（✗ 复活）② 表示面**领域词归零**（全域，✗ 只一个块）
//     ③ "引擎 ✗ 画没被声明的东西"在**真故事**上也成立 ④ 引擎侧有读点且 `Sg.draw.*` 经它取值。
//
// 判据（每条对应一处失效方式）：
// ① **删净**：活代码面（✗ 注释、✗ 归档文档）里 `Macro.add('hpbar')`／`widget "inventory"`／
//    `<<hpbar>>`／`<<inventory>>` **零命中** —— ★注释与归档**允许**留痕（它们记述历史，✗ 是活件）。
// ② **表示面全域领域词归零**（结构面，spec §4①）：`Sg.panels` 实现块 ＋ `StoryCaption` 的
//    **渲染面**里，领域词（`hp`／`gold`／`inventory`／`gear`／`status`／`salves`／`max_hp`）**命中 0**。
//    ★主判取**结构**（黑名单必漏 —— 引擎里还有 `心情`／`钥匙` 等同族词），黑名单降为**例示**。
// ③ **"✗ 画没被声明的东西"在真故事上成立**：取一个**真**故事，撤掉它的 `panels` 声明 ⇒ 侧栏**不出现**该块。
// ④ **读点在场且被走**：`StoryCaption` 调 `Sg.panels.renderSlot`，而它走 `Game.Rules.panels()`（`#1551` 的读点）。
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { maskComments } from '../editor/lib/core/mask.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (label, ok, detail = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`); }
};

/** 表示面三件（P4 的"全域"）＋ `Sg.panels` 实现块所在的件。 */
const PRESENT_FILES = [
	'src/10-core.twee',
	'src/engine/50-present/13-draw.twee',
	'src/engine/50-present/90-style.twee',
];

// ── ① 删净（活代码面）─────────────────────────────────────────────────────
{
	const live = PRESENT_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
	// ★"活代码"＝ 剥掉注释后的面（`%%` twee 块注释 ＋ `//` 行注释 ＋ `/* */`）——
	//   ★注释里**允许**留痕（本仓惯例：注释记述历史与先例，如 `#1227` 删 `dragonbar` 那行）
	const code = maskComments(live, { twee: true });
	const hits = [
		["Macro.add('hpbar'", /Macro\.add\(\s*'hpbar'/.test(code)],
		['widget "inventory"', /widget\s+"inventory"/.test(code)],
		['<<hpbar>>', /<<hpbar>>/.test(code)],
		['<<inventory>>', /<<inventory>>/.test(code)],
	].filter(([, hit]) => hit).map(([n]) => n);
	t('① 活代码面：`hpbar`／`inventory` **删净**（✗ 复活）', hits.length === 0,
		`仍在：${hits.join('、')}`);
	t('① 说明面留痕**允许**（注释里写着"已删"是历史，✗ 不是活件）',
		/latex|已删/.test(live) || /已删/.test(live));
}

// ── ② 表示面全域：领域词归零（结构主判）────────────────────────────────────
const DOMAIN = ['hp', 'gold', 'inventory', 'gear', 'status', 'salves', 'max_hp'];
{
	const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
	// ②a `Sg.panels` 实现块（它产 DOM ⇒ 它就是"表示面"的引擎侧本体）
	const i = core.indexOf('window.Sg.panels = {');
	const j = core.indexOf('\n};', i) + 3;
	const impl = maskComments(core.slice(i, j), { twee: true });
	const implHits = DOMAIN.filter((w) => new RegExp(`\\b${w}\\b`).test(impl));
	t('②a `Sg.panels` 实现块：领域词命中 **0**（结构主判 —— 黑名单只是例示）', implHits.length === 0,
		`命中：${implHits.join('、')}`);
	t('②a 且它**真调原语**（`Sg.draw.*` ≥ 1 —— ✗ 自己拼 DOM）', /Sg\.draw\./.test(impl));
	// ②b `StoryCaption` 的**渲染面**：**已迁面**领域词归零；**未迁块**必须**显式登记**（✗ 静默留着）。
	//   ★为什么不做"全域归零"的断言（实读后的口径，`#1540` 票面③④ 的原意）：
	//     车卡支里仍有**四块硬编** —— `gear-hp`／`status-list`（★全对象 `statuses`／`gearDef` **皆空**
	//     ⇒ 一个都不渲染，与票面"五故事全空"一致）＋ `行囊`（`$pc.gear`）／`药膏行`（`salves`，
	//     车卡族键，有 `hasChargen=true` 的故事在用）。
	//     ⇒ 它们的迁移**不在 P4 的"终态确认"范围**（票面③④ 明写"**并入 P4 的意义上登记为未启用**"）。
	//   ⇒ 本格判**两件**：(a) 已迁面（`renderSlot` 那一支）领域词归零；
	//     (b) 未迁块**逐块登记**在案（`UNMIGRATED` 表里）—— ✗ 新出现的领域词块 ⇒ 红（防静默回涨）。
	// ★`#1540` 裁定＝**丙**：`gear-hp`／`status-list` **删**（全对象数据为空 ⇒ 永不渲染，
	//   照 `#1227` 删 `dragonbar` 的先例）；`行囊`／`药膏` **登记未迁**（`hasChargen` 家族在用）。
	const DELETED = [
		{ id: 'gear-hp', why: '装备耐久块 —— 全对象 `statuses`／`gearDef` 皆空 ⇒ 永不渲染；P4 按 `#1227` 先例**删**' },
		{ id: 'status-list', why: '部位异常块 —— 同上' },
	];
	const UNMIGRATED = [
		{ id: '行囊', why: '`$pc.gear` 行 —— 车卡族键，有 `hasChargen=true` 的故事在用' },
		{ id: '药膏行', why: '`salves` 行 —— 车卡族键，有故事在用；★已走 `vl()`／`vk()` **取值口**（半迁，票面注明）' },
	];
	const cap = core.slice(core.indexOf(':: StoryCaption'));
	const capCode = maskComments(cap, { twee: true });
	// (a) **已迁面**：`renderSlot` 那一支（✗ 含四块未迁件）。做法＝按"行"剥掉四块所在行再判。
	const GEAR_HP_RE = /<<set _gh to Game\.Gear\.gearDurability[\s\S]*?<\/div>\n/;
	const STATUS_RE = /<<set _st to Game\.StatusFx\.statusEntries[\s\S]*?<\/div>\n/;
	const GEAR_LINE_RE = /<<if \$pc\.gear\.length>>[^\n]*<\/if>>/;
	const SALVES_LINE_RE = /<<print Game\.Rules\.vl\('salves'\)>>[^\n]*/;
	const migrated = capCode
		.replace(GEAR_HP_RE, '').replace(STATUS_RE, '')
		.replace(GEAR_LINE_RE, '').replace(SALVES_LINE_RE, '')
		// `ek('gold')`／`el('gold')` 是 `#1530` 的**键名取值口**（那正是"读数据"，✗ 硬编）⇒ 一并剥
		.replace(/Game\.Rules\.e[lk]\('gold'\)/g, '');
	const migratedHits = DOMAIN.filter((w) => new RegExp(`\\b${w}\\b`).test(migrated));
	t('②b(a) **已迁面**（`renderSlot` 那一支）领域词命中 **0**', migratedHits.length === 0,
		`命中：${migratedHits.join('、')}`);
	// (b) **未迁块登记**：每一块都必须在 `UNMIGRATED` 里 且**真的还在**（✗ 登记了却已删 ⇒ 表腐烂）
	const present = UNMIGRATED.filter((u) => {
		if (u.id === 'gear-hp') return GEAR_HP_RE.test(capCode);
		if (u.id === 'status-list') return STATUS_RE.test(capCode);
		if (u.id === '行囊') return GEAR_LINE_RE.test(capCode);
		if (u.id === '药膏行') return SALVES_LINE_RE.test(capCode);
		return false;
	});
	t('②b(b) **未迁块逐块登记**（✗ 静默留着 —— 含"真有故事在用"的两块）',
		present.length === UNMIGRATED.length,
		`登记 ${UNMIGRATED.length} 块，实存 ${present.length} 块（缺：${UNMIGRATED.filter((u) => !present.includes(u)).map((u) => u.id).join('、') || '无'}）`);
	// (c) **已删面**必须真删（✗ 复活）—— 裁丙的"删"那一半
	const revived = DELETED.filter((d) => (d.id === 'gear-hp' ? /gear-hp/.test(capCode) : /status-list/.test(capCode)));
	t('②b(c) **已删面（`gear-hp`／`status-list`）真删**（✗ 复活 —— 它们永不渲染）', revived.length === 0,
		`仍在：${revived.map((d) => d.id).join('、')}`);
	// (d) `#703` 的门**同笔改判**（"渲染面存在" ✗ 字面串）—— ✗ 只改代码不改门（那会留一个守死代码的门）
	const gate = readFileSync(join(ROOT, 'scripts/audit/gates/status.mjs'), 'utf8');
	t('②b(d) `#703` 门改判"**渲染面存在**"（`Sg.panels.renderSlot(`）✗ 字面串',
		/Sg\\?\.panels\\?\.renderSlot/.test(gate) && !/if \(!\/Game\\?\.Gear\\?\.gearDurability/.test(gate),
		'门里仍按字面串判');
}

// ── ④ 读点在场且被走 ──────────────────────────────────────────────────────
{
	const core = readFileSync(join(ROOT, 'src/10-core.twee'), 'utf8');
	const cap = core.slice(core.indexOf(':: StoryCaption'));
	t('④ `StoryCaption` 调 `Sg.panels.renderSlot`（消费面接上 —— ✗ 直接拼 `<div>`）',
		/Sg\.panels\.renderSlot\(/.test(cap));
	t('④ 且渲染件走**读点** `Game.Rules.panels()`（`#1551` —— ✗ 自读 `Sg.story`）',
		/declared\(\)\s*\{[\s\S]{0,200}?Game\?\.Rules\?\.panels\?\.\(\)/.test(core));
}

// ── ③ "✗ 画没被声明的东西"在**真故事**上成立 ────────────────────────────────
const BOOKS = process.env.SG_BOOKS_STORIES ?? null;
if (!BOOKS || !existsSync(BOOKS)) {
	console.log('  ○ 未判：未给 `SG_BOOKS_STORIES`（真故事根）⇒ ③ 的"真故事两态"未判。'
		+ '\n    ★本轮（P4）的 ③ 已在 P3 由 `test/panels-render.mjs` 的 ⑥ 在**夹具**（`nocar-basic`）上判过；'
		+ '\n    真故事面留待 books 侧声明落地后由该仓/同窗确认（✗ 本件不假装判过）。');
} else {
	const WORK = mkdtempSync(join(tmpdir(), 'sg-1540-'));
	try {
		const slug = 'fruit-demo';
		const withPanels = async (keep) => {
			const root = join(WORK, keep ? 'a' : 'b', 'stories');
			cpSync(BOOKS, root, { recursive: true });
			for (const d of ['fruit-demo']) {
				for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
					const q = join(root, d, f); if (existsSync(q)) rmSync(q);
				}
			}
			if (!keep) {
				const cp = join(root, slug, 'data/contract.json');
				const dn = JSON.parse(readFileSync(cp, 'utf8'));
				dn.members = dn.members.filter((m) => m.name !== 'panels');
				writeFileSync(cp, JSON.stringify(dn, null, 2) + '\n');
			}
			execFileSync(process.execPath, [join(ROOT, 'build.mjs')],
				{ cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: root }, stdio: 'pipe' });
			process.env.SG_STORIES_DIR = root;
			const { boot } = await import('./boot.mjs');
			const B = await boot({ story: join(WORK, keep ? 'a' : 'b', 'dist/stories', slug, 'index.html'), entry: '房间', random: 0.5 });
			const w = B.w;
			w.SugarCube.Engine.play('StoryCaption');
			await B.settle(); await new Promise((r) => setTimeout(r, 200)); await B.settle();
			const scope = w.document.querySelector('#story-caption') || w.document;
			const has = [...scope.querySelectorAll('*')].some((el) => /%/.test(el.style?.width || ''));
			B.close?.();
			return has;
		};
		t('③ 真故事（`fruit-demo`）**有声明 ⇒ 那一条画**', await withPanels(true));
		t('③ 撤声明 ⇒ **那一条✗画**（✗ 退回内置画法 —— 终态）', !(await withPanels(false)));
	} finally { rmSync(WORK, { recursive: true, force: true }); }
}

if (bad) { console.error(`\n✗ P4 终态确认失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ P4 终态确认通过（删净 · 表示面领域词归零 · 读点在场且被走'
	+ (BOOKS ? ' · 真故事两态' : ' · 真故事两态**未判**（需 `SG_BOOKS_STORIES`）') + '）');
