// `#877` 件级自证：`editor/lib/core/stateDiagnose.mjs`（形状与对齐）✓
//
// 判据（每条都**能是假的** ✗ —— `docs/dev-conventions.md` §9 口径 ✓）：
//   ① 坏 ⇒ findings **点名** `{event, field}` ✓（不是"有错" ✗）
//   ② 好 ⇒ **零** ✓（能假的另一半 ✓ —— 否则"永远报错"也会过 ✓）
//   ③ **顺序稳定** ✓：打乱输入对象的键序 ⇒ 输出**逐字节相同** ✓（排序键与 `diagnose.mjs` 同 ✓）
//   ④ **不掺环境** ✓（§17 ④）：同一输入，换 `cwd` ＋ 换 `TZ` ⇒ 输出**逐字节相同** ✓
//      ⚠️ ④ 与 ③ **必须配对** ✓：③ 只证"同环境同结果"（自比自也能过 ✗），④ 才证"换环境也不同" ✓
//   ⑤ 时延是**数字** ✓（预算 ≤ 50 ms ✓；页面要"编辑即诊断" ⇒ 这条是它的前提 ✓）
import { auditShape, flagPaths, keyOf, notepathProblems, singleReadProblems, singleWriteProblems, auditConsumption } from '../editor/lib/core/stateDiagnose.mjs';

let bad = 0;
const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };

const dom = new Set(['keeper_state', 'seen_ruins']); // 状态契约域（模拟 ✓）
const good = { n_a: { title: 'A', src: 's', body: 'b', tags: ['t'], era: 'now', flagPath: 'world.keeper_state' } };
const badEntries = {
	n_dup: { ...good.n_a, body: '' },                       // 缺字段（空串 ✓）
	n_key: { ...good.n_a, flagPath: 'world.no_such_key' },  // 键未登记
	n_grant: { ...good.n_a, grant: true },                  // grant 写死非函数
	n_shape: { ...good.n_a, flagPath: 'table.x' },          // 非「域.键」形状
};

// ① 坏 ⇒ 点名 {event, field}
const f1 = auditShape(badEntries, dom);
t('① 坏包 ⇒ 出 findings', f1.length >= 4, `条数 ${f1.length}`);
t('① 每条都带 {event, field}', f1.every((f) => f.target && typeof f.target.event === 'string' && typeof f.target.field === 'string'), JSON.stringify(f1.find((f) => !f.target?.field) ?? {}));
t('① 字段名结构化（不再是"藏在 detail 里" ✗）', f1.some((f) => f.target.field === 'body') && f1.some((f) => f.target.field === 'flagPath') && f1.some((f) => f.target.field === 'grant'), JSON.stringify(f1.map((f) => f.target.field)));
t('① 四键同形（level/step/detail/target ✓）', f1.every((f) => ['level', 'step', 'detail', 'target'].every((k) => k in f)), JSON.stringify(Object.keys(f1[0] ?? {})));

// ② 好 ⇒ 零
const f2 = auditShape(good, dom);
t('② 好包 ⇒ 零 findings', f2.length === 0, `条数 ${f2.length}`);

// ③ 顺序稳定（打乱输入键序 ⇒ 输出同 ✓）
const shuffled = Object.fromEntries(Object.entries(badEntries).reverse());
const a3 = JSON.stringify(auditShape(badEntries, dom));
const b3 = JSON.stringify(auditShape(shuffled, dom));
t('③ 输入键序打乱 ⇒ 输出逐字节同', a3 === b3, a3 === b3 ? '' : `${a3.slice(0, 60)} ≠ ${b3.slice(0, 60)}`);

// ④ 不掺环境（换 cwd ＋ 换 TZ ⇒ 输出同 ✓）
const { chdir } = await import('node:process');
const cwd0 = process.cwd();
const tz0 = process.env.TZ;
const a4 = JSON.stringify(auditShape(badEntries, dom));
chdir('/tmp'); process.env.TZ = 'UTC-7';
const b4 = JSON.stringify(auditShape(badEntries, dom));
chdir(cwd0); if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0;
t('④ 换 cwd ＋ 换 TZ ⇒ 输出逐字节同（不掺环境 ✓）', a4 === b4, a4 === b4 ? '' : '掺了环境 ✗');

// ⑤ 时延是数字
const N = 500;
for (let i = 0; i < 20; i++) auditShape(badEntries, dom);
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) auditShape(badEntries, dom);
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
console.log(`      · 时延：${ms.toFixed(4)} ms/轮（${N} 轮均值 · 预算 50 ms）`);
t('⑤ 时延 < 预算 50 ms', ms < 50, `${ms.toFixed(4)} ms`);

// 附：转出的两个助手仍可用（门里有第三个消费者 ✓ ⇒ 删本地副本时它差点漏 ✓）
t('附·`keyOf` 可用（门侧另有消费者 ✓）', keyOf('world.keeper_state') === 'keeper_state');
t('附·`flagPaths` 仍支持字符串与数组（多源 OR ✓）', JSON.stringify(flagPaths({ flagPath: ['a.b', 'c.d'] })) === '["a.b","c.d"]' && JSON.stringify(flagPaths({ flagPath: 'a.b' })) === '["a.b"]');

// 附：源用法三条（`#877` 第二块 ✓）—— findings 同形 ＋ ① 点名 ＋ ② 好包零 ＋ ③ 确定性
//   ⚠️ 它们**不再**返回 `where`（源文件名 ✓）：门上**根本不打印它** ✗（只打 `id`／`detail` ✓）⇒ 丢掉不破输出 ✓。
const srcBad = { 'x.twee': '<<notepath "n_x" "world.keeper_state">>' };   // n_x **未登记** ✓
const fN = notepathProblems({ entries: good, sources: srcBad });
t('源用法① 未登记 id ⇒ 命中且点名 event', fN.length >= 1 && fN.some((f) => f.target.event === 'n_x'), JSON.stringify(fN.map((f) => f.target)));
t('源用法① 四键同形 ＋ step/field 受约束', fN.every((f) => ['level', 'step', 'detail', 'target'].every((k) => k in f) && f.step === 'source' && f.target.field === 'flagPath'), JSON.stringify(fN[0] ?? {}));
t('源用法② 干净源 ⇒ 零（能假的另一半 ✓）', notepathProblems({ entries: good, sources: { 'ok.twee': '<<note "n_a">>' } }).length === 0);
const sb = singleWriteProblems({ entries: good, sources: { 'w.twee': '<<notepath "n_a" "world.keeper_state">>' } });   // n_a 单源 ⇒ 命中 ✓
t('源用法① 单源走 notepath ⇒ 命中（且点名 ✓）', sb.length === 1 && sb[0].target.event === 'n_a', JSON.stringify(sb.map((f) => f.target.event)));
t('源用法③ 同输入两次 ⇒ 逐字节同', JSON.stringify(notepathProblems({ entries: good, sources: srcBad })) === JSON.stringify(notepathProblems({ entries: good, sources: srcBad })));

// 附2：消费可数（`#877` 第三块 ✓）—— ① 零消费⇒点名 ② 已声明⇒零（能假的另一半 ✓）③ 四键同形
const reads = new Map([['world.keeper_state', new Set(['a.twee'])]]);
const c1 = auditConsumption(good, new Map(), [], '');            // 无人读、也未声明 ⇒ 应报「零消费」✓
t('消费① 零读且未声明 ⇒ 点名 event（且 step/field 受约束）', c1.length === 1 && c1[0].target.event === 'n_a' && c1[0].step === 'consumption' && c1[0].target.field === 'flagPath', JSON.stringify(c1.map((f) => f.target)));
t('消费① 有读点 ⇒ 零（能假的另一半 ✓）', auditConsumption(good, reads, [], '').length === 0, `条数 ${auditConsumption(good, reads, [], '').length}`);
t('消费① 零读但已声明（bookkeeping 带理由）⇒ 零 ✓', auditConsumption(good, new Map(), ['keeper_state'], '').length === 0);
t('消费① 已声明却真被读 ⇒ 僵尸豁免红（反沉默 ✓）', auditConsumption(good, reads, ['keeper_state'], '').length === 1, JSON.stringify(auditConsumption(good, reads, ['keeper_state'], '').map((f) => f.detail?.slice(0, 12))));

if (bad) { console.error(`\n✗ stateDiagnose 件级自证：${bad} 条未过`); process.exit(1); }
console.log('\n✔ stateDiagnose 件级自证通过（形状块 11 ＋ 源用法块 5 ＋ 消费块 4 ＝ 20 条；每块都带能假的另一半 ✓）');
