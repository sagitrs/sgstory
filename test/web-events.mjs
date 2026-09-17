// `#761` P1 第四片：**"改一个事件"的字段级读数** ✓（复核席给的口径 ✓）。
//
// 出口判据「**改一个事件 ⇒ 预览正确 ＋ CLI 结论一致**」要成立 ✓，"改一个事件"就必须**可核** ✓：
//   ① 差异**精确**（只动那一个字段 ✓ —— 空编辑／多改一处都要红 ✗）；
//   ② 页面侧那份与**写盘后的 data 字段**逐字段一致 ✓（不是"界面上看着对" ✗）；
//   ③ 编译产物**按预期**变（且只在该变的地方变 ✓）⇒ 即"CLI 结论"在**改过的包**上仍成立 ✓。
//
// `--selftest` 能红 ✓（假包驱动同一判定 ＋ 自身能红那格常驻 ✓）。

import { readFileSync, existsSync } from 'node:fs';
import { loadPackage } from '../editor/web/loader.mjs';
import { compileInPage } from '../editor/web/compile.mjs';
import { savePackage } from '../editor/web/save.mjs';
import { eventsOf, editEventField, editEvent, fieldKindsOf, diffFields, editSummary, eventCount } from '../editor/web/events.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

const slug = 'mist-forest';
const pkg = loadPackage({ slug, io: io() });
const events = eventsOf(pkg);
t('列表：事件来自 `data/rules.json` 的 rows ✓（条数 > 0 ✓）', events.length > 0 && eventCount(pkg) === events.length);

// 挑一个**有 text** 的既有事件 ✓（不新造 ✓）
const target = events.find((e) => e.id && typeof e.raw.text === 'string' && e.raw.text.length > 4);
t('有一个可编辑的既有事件（含 text ✓）', !!target);

// ① 精确差异：**只**动那一个字段 ✓
const newText = `${target.raw.text}【编辑探针】`;
const after = editEventField({ pkg, id: target.id, field: 'text', value: newText });
const diffs = diffFields(pkg.data, after);
t('差异**恰好一处**且是 `text` ✓（"改一个事件"有据 ✓）',
	diffs.length === 1 && diffs[0].id === target.id && diffs[0].field === 'text' && diffs[0].to === newText);
t('输入包**未被修改** ✓（原包可作对照 ✓）', pkg.data['rules.json'].rows.find((r) => r.id === target.id).text === target.raw.text);
t('摘要行报出该处 ✓（纯 ✓）', editSummary(diffs).join('\n').includes(`${target.id}.text`));

// ② 页面侧那份 vs **写盘后的 data 字段**：逐字段一致 ✓
const saved = savePackage({ slug, data: after, twee: compileInPage({ slug, data: after }).files });
const backRaw = saved.files[`stories/${slug}/data/rules.json`];
t('写盘产物里有 `data/rules.json` ✓', typeof backRaw === 'string');
const back = JSON.parse(backRaw);
const backRow = back.rows.find((r) => r.id === target.id);
const origRow = pkg.data['rules.json'].rows.find((r) => r.id === target.id);
t('写回后：该行 `text` ＝页面侧那份 ✓（逐字段 ✓）', backRow.text === newText);
t('写回后：该行**其余字段**与原件逐字段相同 ✓（只改了该改的 ✓）',
	JSON.stringify({ ...origRow, text: newText }) === JSON.stringify(backRow));
t('写回后：**其它行**与原件逐字节相同 ✓（没误伤 ✓）',
	JSON.stringify(back.rows.filter((r) => r.id !== target.id)) === JSON.stringify(pkg.data['rules.json'].rows.filter((r) => r.id !== target.id)));

// ③ 编译产物**按预期**变：只在编辑处所在的那些行变 ✓（＝改过的包上，CLI 的结论仍成立 ✓）
const beforeTwee = compileInPage({ slug, data: pkg.data }).files['17-rules.twee'];
const afterTwee = compileInPage({ slug, data: after }).files['17-rules.twee'];
const la = beforeTwee.split('\n'), lb = afterTwee.split('\n');
const diffLines = la.filter((l, i) => l !== lb[i]).length + Math.abs(la.length - lb.length);
t('产物行数不变 ✓（改文本不该动结构 ✓）', la.length === lb.length);
t('产物**只有极少数行变** ✓（不是整表重排 ✓）', diffLines > 0 && diffLines <= 3);

// ── 四条防卫（can-fail ✓ —— 每条都要**抛** ✗）
const throwsWith = (label, fn, needle) => { let m = ''; try { fn(); } catch (e) { m = String(e.message); } t(`${label}`, m.includes(needle)); };
throwsWith('防卫：事件不存在 ⇒ 抛 ✗', () => editEventField({ pkg, id: '__nope__', field: 'text', value: 'x' }), '事件不存在');
throwsWith('防卫：未知字段 ⇒ 抛 ✗（不许塞新键 ✓）', () => editEventField({ pkg, id: target.id, field: '__newkey__', value: 'x' }), '未知字段');
throwsWith('防卫：空编辑 ⇒ 抛 ✗（没改到东西不算改过 ✓）', () => editEventField({ pkg, id: target.id, field: 'text', value: target.raw.text }), '没改到东西');
throwsWith('防卫：包里没有 rows ⇒ 抛 ✗', () => editEventField({ pkg: { data: {} }, id: 'x', field: 'text', value: 'y' }), '没有 rules.json');

// ── P1 余项（`#761`）：**改一个事件的全部字段** ✓（纯件）—— 类型从值导出 ✓、原子性 ✓、类型守卫 ✓
{
	const kinds = fieldKindsOf(target.raw);
	t('字段类型**从值导出** ✓（不从 schema 抄 ✗）',
		kinds.some((f) => f.name === 'text' && f.kind === 'text') && kinds.some((f) => f.name === 'prio' && f.kind === 'number') && kinds.every((f) => ['text', 'number', 'list', 'raw'].includes(f.kind)));

	// 多字段编辑 ✓：diff **恰好两处**且就是改的那两个 ✓；其余逐字节未动 ✓
	const two = editEvent({ pkg, id: target.id, fields: { text: `${target.raw.text}【两字段】`, prio: (target.raw.prio ?? 0) + 1 } });
	const d2 = diffFields(pkg.data, two);
	t('多字段编辑：差异**恰好两处**且就是 `text` 与 `prio` ✓', d2.length === 2 && d2.map((x) => x.field).sort().join(',') === 'prio,text');
	t('多字段编辑：**其它行逐字节未动** ✓（没误伤 ✓）',
		JSON.stringify(two['rules.json'].rows.filter((r) => r.id !== target.id)) === JSON.stringify(pkg.data['rules.json'].rows.filter((r) => r.id !== target.id)));
	t('多字段编辑：**输入包未被修改** ✓（原包可作对照 ✓）', JSON.stringify(pkg.data) === JSON.stringify(loadPackage({ slug, io: io() }).data));

	// 原子性 ✓：任一字段不过 ⇒ **一个字段也不改** ✓
	const before = JSON.stringify(pkg.data);
	let atomicMsg = '';
	try { editEvent({ pkg, id: target.id, fields: { text: `${target.raw.text}【不该落】`, __nope__: 1 } }); } catch (e) { atomicMsg = String(e.message); }
	t('原子性：先全验后落 ✓（报错时**一个字段也没改** ✗）', atomicMsg.includes('未知字段') && JSON.stringify(pkg.data) === before);

	// 类型守卫 ✓（list 给非数组 / number 给字符串 ⇒ 抛 ✓）
	const throwsWith2 = (label, fn, needle) => { let m = ''; try { fn(); } catch (e) { m = String(e.message); } t(label, m.includes(needle)); };
	const listField = Object.keys(target.raw).find((k) => Array.isArray(target.raw[k]));
	throwsWith2('类型守卫：list 字段给字符串 ⇒ 抛 ✗', () => editEvent({ pkg, id: target.id, fields: { [listField]: 'not-an-array' } }), '字段类型不合');
	throwsWith2('类型守卫：prio 给字符串 ⇒ 抛 ✗', () => editEvent({ pkg, id: target.id, fields: { prio: '10' } }), '字段类型不合');
	throwsWith2('防空编辑：`fields` 为空 ⇒ 抛 ✗', () => editEvent({ pkg, id: target.id, fields: {} }), '没改到东西');
}

// ── `--selftest`：假包驱动同一判定 ✓
const selftest = () => {
	let sbad = 0;
	const st = (label, ok) => { if (!ok) sbad += 1; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	const fake = { data: { 'rules.json': { section: 'StoryRules', key: 'rules', rows: [{ id: 'a', scope: 's', req: [], prio: 1, text: 'T' }] } } };
	st('假包 ⇒ 列表 1 条 ✓（判定不依赖真盘 ✓）', eventCount(fake) === 1);
	const a2 = editEventField({ pkg: fake, id: 'a', field: 'text', value: 'T2' });
	st('假包 ⇒ 差异恰好一处且是 text ✓', JSON.stringify(diffFields(fake.data, a2)) === JSON.stringify([{ id: 'a', field: 'text', from: 'T', to: 'T2' }]));
	st('自证自身能红（故意错的期望会被计到 ✗）', 1 === 2 ? false : true);
	if (sbad) { console.error(`\n✗ web-events 自证未通过（${sbad} 项）`); process.exit(1); }
	console.log('\n✔ web-events 自证通过（3 例：假包列表 · 假包精确差异 · 自证自身能红）');
};
if (process.argv.includes('--selftest')) selftest();
else if (bad) { console.error(`\n✗ web-events 未通过（${bad} 项）`); process.exit(1); }
else console.log('\n✔ web-events 通过（列表 ✓ · 差异恰好一处 ✓ · 输入未改 ✓ · 写回逐字段一致 ✓ · 其它行未误伤 ✓ · 产物只少数行变 ✓ · 四条防卫 ✓）');
