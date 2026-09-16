// 战斗状态**字段使用面**门（`#707`）—— 每个 `$pc.ev.fight.<字段>` 都必须**有人用**，否则点名
//
// 症状（`#707` 票面）：面板与状态不同步 —— `flee` 等字段"存在但没有撤退入口"，
//   玩家侧无从触发／无从预期 ⇒ 票面给两个方向：实现撤退，或**删掉字段** ＋ 加一条自证
//   （"每个字段都必须被渲染面或结算面至少引用一次"）。
//
// ⚠️ 本门上线时**先证伪了票面的一半**：`flee` 并非死字段 —— 它有一条完整的链：
//   动作声明 `flee: true`（`stories/mist-forest/15-tables.twee`）→ 引擎 `if (eff.flee) fight.flee = true`
//   （`src/engine/40-sim/21-resolve.twee`）→ 故事分支 `<<if $pc.ev.fight.flee>>`（`stories/mist-forest/50-ch3.twee`）。
//   ⇒ 所以"删字段"不是正确动作；正确动作是**把"谁没用"变成机检**（本门），并据此决定
//   "洞窟要不要给撤退入口"（那是**玩法**决定 ⇒ 另开票，不该混进死字段清理）。
//
// 判据：
//   ① **每个字段都要有使用点**（定义行本身不算）——没人用 ⇒ 报（点名）；
//   ② 使用点必须落在**渲染面／结算面／机制面**（`stories/**` 或 `src/**` 的 twee）；
//   ③ `$pc.ev.fight` 的**形状**与本文档同步（形状定义只有一处：`src/10-core.twee`）；
//   ④ 内部中间量可**显式登记**（`$pc.ev.fight` 的 `INTERNAL_OK` 表，理由必填）⇒ 登记也腐烂即红。
//
// 用法：node test/fight-fields.mjs [--selftest]

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`  ✓ ${label}`);
	else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); }
};

/** 纯函数：从 `<<set $pc.ev.fight to { … }>>` 那一行里取字段名（**形状的单一权威**）。 */
export const fightFields = (src) => {
	const line = String(src).split('\n').find((l) => /\$pc\.ev\.fight to \{/.test(l)) ?? '';
	const body = line.slice(line.indexOf('{') + 1);
	return [...body.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
};

/** 纯函数：某字段的**使用点**（排除形状定义那一行本身）。返回 [{ file, line }]。 */
export const usages = (field, files) => {
	const out = [];
	const re = new RegExp(`(?:fight\\??\\.${field}\\b|\\bfight\\.${field}\\b)`);
	for (const f of files) {
		const lines = String(f.text).split('\n');
		for (let i = 0; i < lines.length; i++) {
			if (/\$pc\.ev\.fight to \{/.test(lines[i])) continue;      // 定义行不算使用
			if (re.test(lines[i])) out.push({ file: f.path, line: i + 1 });
		}
	}
	return out;
};

/** **内部中间量**白名单（理由必填）：玩家侧看不到、但机制面要用 —— 登记后仍然要求"有使用点"。 */
export const INTERNAL_OK = {
	// 目前**为空**：`pool` 曾被我误登记为"内部"，其实它被引擎与故事面引用（门当场抓出"登记腐烂"✗）⇒ 删。
	// 将来真有"只服务机制、玩家侧完全不可见"的字段，在这里登记**理由**（登记后仍要求有使用点）。
};

if (process.argv.includes('--selftest')) {
	const shape = "<<set $pc.ev.fight to { pool: $args[0], round: 1, offer: [] }>>";
	const cases = [
		['正例：从形状行取到字段名', fightFields(shape).join(',') === 'pool,round,offer'],
		['正例：使用点能定位（排除定义行）', usages('offer', [{ path: 'a.twee', text: `${shape}\n<<set _x to $pc.ev.fight.offer>>` }]).length === 1],
		['🔴 反例：只在定义行出现 ⇒ 无使用点（＝死字段）', usages('offer', [{ path: 'a.twee', text: shape }]).length === 0],
		['边界：可选链写法也算使用点', usages('round', [{ path: 'a.twee', text: '<<if $pc.ev.fight?.round gt 1>>' }]).length === 1],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（4 条：形状解析 ＋ 使用点定位的正/反例/边界）');
	process.exit(0);
}

console.log('══ 战斗状态字段使用面门（`#707`）—— 每个字段都必须有人用 ══');
{
	// 只认**产品面**：`src/**`（引擎）＋ `stories/**`（故事）—— 测试里引用**不算**"有人用"
	// （否则一个只在测试里自说自话的字段会被判成活的；实测 `last` 就是这种）
	const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
		.filter((p) => /\.(twee|mjs)$/.test(p) && !p.startsWith('docs/') && !p.startsWith('test/') && !p.startsWith('scripts/'));
	const files = tracked.map((p) => ({ path: p, text: readFileSync(join(ROOT, p), 'utf8') }));
	const core = files.find((f) => f.path === 'src/10-core.twee');
	const fields = fightFields(core?.text ?? '');
	ok('取到 `$pc.ev.fight` 的形状字段（形状单一权威＝`src/10-core.twee`）', fields.length > 0, fields.join(','));
	if (!fields.length) { console.error('  ✗ 形状行取不到字段 —— 不静默判过'); process.exit(1); }

	const dead = [], internals = [];
	for (const f of fields) {
		const u = usages(f, files);
		const kind = INTERNAL_OK[f] ? '内部' : '可见';
		if (kind === '内部') internals.push(f);
		console.log(`  · ${f}（${kind}）：使用点 ${u.length}${u.length ? `（首个：${u[0].file}:${u[0].line}）` : ''}`);
		if (!u.length) dead.push(f);
	}
	ok('①/② 每个字段都有使用点（渲染/结算/机制面）', dead.length === 0, `没人用：${dead.join('、')}`);
	// ③ 白名单腐烂即红：登记为"内部"的字段若其实有可见面使用 ⇒ 让作者复核（避免长期挂着借口）
	const stale = internals.filter((f) => usages(f, files).some((u) => u.file.startsWith('stories/')));
	ok('④ 内部登记不腐烂（登记为内部的字段若被故事面引用 ⇒ 请复核理由）', stale.length === 0, `待复核：${stale.join('、')}`);
}

if (bad) {
	console.error(`\n✗ 战斗字段门未通过（${bad} 项）—— 状态字段没人用＝面板与状态不同步（\`#707\`）。`);
	process.exit(1);
}
console.log('\n✔ 战斗字段门通过（字段全部有使用点；内部量已登记）');
