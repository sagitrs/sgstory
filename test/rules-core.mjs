// 规则层单元测试（M1a-2 换骨后）：mod/skillMod/check/save · 车卡 3 轮 · Pc 形状迁移 · 表契约
//
//注意：`#1004` B2b（**换样本**）：本文原先钉着**旧故事**的条目/事件名（图鉴 `坏哨,日记,月光花` ＋ 四条线索
// `own/warned/fed/venom` ＋ 经济事件 `dragon_hoard` —— 后两者随故事被代码级删除）→ 现按**面夹具**重钉：
// · 图鉴块：期望改成**夹具自己的 `Items.defs` ⇔ `Codex.items`**（一一对应，夹具侧已补：`时光护符` 进
// `Items.defs`、图鉴四页与四个道具对齐），半齐/齐了解锁与 `progress` 计数用夹具 `月光花` 的**四条线索**；
// · 经济事件：`dragon_hoard` → 夹具事件 `torch_buy`（并把它改回**夹具声明的 delta**）。
// **判据本身不动**（表驱动 · 线索不白送 · 解锁＝集齐 · 事件金额表驱动）。
import { readFileSync, readdirSync } from 'node:fs';
import { boot } from './boot.mjs';
let failures = 0;
const eq = (actual, expected, msg) => {
	const okk = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${okk ? '✓' : '✗'} ${msg}${okk ? '' : `（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`}`);
	if (!okk) failures++;
};
const ok = (cond, msg) => {
	console.log(`${cond ? '✓' : '✗'} ${msg}`);
	if (!cond) failures++;
};

// 白盒 A9/A10：共享 boot ×3 实例（pollUntil + uncaught；random 参数化替代手写 JSDOM）
const { w, sleep } = await boot({ random: 0.5 }); // d20 恒为 11
const R = w.Game.Rules;
// ── 调整值 ──
eq(R.mod(10), 0, 'mod(10) = 0');
eq(R.mod(14), 2, 'mod(14) = +2');
eq(R.mod(8), -1, 'mod(8) = -1');
eq(R.mod(16), 3, 'mod(16) = +3');
eq(R.fmod(17), '+3', 'fmod(17) 带符号');
eq(R.fmod(8), '-1', 'fmod(8) 负号');
eq(R.fmod(10), '+0', 'fmod(10) 零');

// ── 技能加值 ──
const pc = { abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 15, cha: 13 }, skills: ['察觉'], flags: {} };
eq(R.skillMod(pc, '察觉'), 4, '熟练察觉：感(15)+2熟练 = +4');
eq(R.skillMod(pc, '运动'), -1, '未熟练运动：力(8) = -1');
eq(R.skillMod({ ...pc, skills: [...pc.skills, '运动'] }, '运动'), 1, '熟练运动：-1+2 = +1');
eq(R.skillMod(pc, '游说'), 1, '未熟练游说：魅(13) = +1');
ok((() => { try { R.skillMod(pc, '不存在的技能'); return false; } catch { return true; } })(), '未知技能抛错（表外技能不可静默通过）');

// ── d20 检定（random 恒定 0.5 → d20=11）──
const mid = R.check(pc, '游说', 11);
eq(mid.roll, 11, '常规骰 d20=11');
ok(mid.success, '11+1=12 ≥ DC11 → 成功');
ok(!R.check(pc, '游说', 13).success, '11+1=12 < DC13 → 失败');
eq(R.d20(1), 11, '优势取高');
eq(R.d20(-1), 11, '劣势取低');
const lucky = R.check({ ...pc, flags: { luck: true } }, '游说', 13);
ok(lucky.success && lucky.mod === 2, '机运烙印：+1 加值（12+1=13 ≥ 13）');
const bonused = R.check(pc, '游说', 20, { bonus: 6 });
ok(bonused.mod === 7, '情境加值并入修正（+1+6）');

// ── 自然 20 / 自然 1（SRD 5.2）──
const dom20 = await boot({ random: 0.999 });
const nat20 = dom20.w.Game.Rules.check(pc, '运动', 30);
ok(nat20.roll === 20 && nat20.success, '自然 20 → 无视 DC 必然成功');
ok(dom20.w.Game.Rules.save(pc, 'str', 25).success, '豁免同样适用自然 20 规则');
const dom1 = await boot({ random: 0.0001 });
const nat1 = dom1.w.Game.Rules.check(pc, '察觉', 1);
ok(nat1.roll === 1 && !nat1.success, '自然 1 → 无视加值必然失败');

// ── `#1438` **规则参数包**：参数归包（缺省＝内置 ⇒ 未声明包的故事逐字不变）─────────────────────
// 背景（T 的 dnd 扫描）：引擎里**六处**把 dnd 规则书内容写死 —— 技能名表／属性公式 `(score-10)/2`／熟练加值 `2`／
//   骰面 `20`／档位名 `crit/ok/bad`／血量缺省与公式。**机制已通用、参数未外置** ⇒ 本段守前半（参数面）。
// 三态：① **缺面 ⇒ 内置**（＝今天常量 ⇒ 零变化）② **给覆盖 ⇒ 生效**（键级合并）③ **能假**（改包 ⇒ 读数跟着变）。
{
	// ① 缺面 ⇒ 内置（★这一条是"零行为变化"的判据本身）
	eq(R.pack(), R.BUILTIN, '① 缺 `rulesPack` 面 ⇒ `pack()` 回**内置**（逐字同 ⇒ 未声明包的故事不变 ✓）');
	eq(R.prof(), 2, '① 缺面 ⇒ `prof()` = 2（内置值；✗ 不许因缺面变 `undefined`）');
	eq(R.mod(14), 2, '① 缺面 ⇒ `mod(14)` = 2（`(14-10)/2`；公式参数走内置 ✓）');
	eq(R.SKILLS['运动'], 'str', '① 缺面 ⇒ `SKILLS` 读得到（getter 走内置 ✓）');

	// ② 给覆盖 ⇒ 生效 ＋ 键级合并（★关键语义：只改一项 ⇒ ✗ 不该逼作者照抄整张表）
	const keep = w.Sg.story.rulesPack;
	w.Sg.story.rulesPack = () => ({ prof: 5, abilityMod: { base: 8, divisor: 4 } });
	eq(R.prof(), 5, '② 给了 `prof` ⇒ `prof()` 跟着变 ✓（包生效）');
	eq(R.mod(12), 1, '② 给了公式参数 ⇒ `mod(12)` = (12-8)/4 = 1 ✓（公式**参数**归包）');
	eq(R.SKILLS['运动'], 'str', '② **键级合并**：只给了 prof／abilityMod ⇒ `skills` 仍走内置 ✓（✗ 没被整份替换）');
	w.Sg.story.rulesPack = keep;

	// ③ 能假：把 `abilityMod.divisor` 改掉 ⇒ 上面第②组的读数**必红**（★否则判据只是装饰）
	w.Sg.story.rulesPack = () => ({ abilityMod: { base: 8, divisor: 2 } });
	eq(R.mod(12), 2, '③ 能假：`divisor` 8→2 ⇒ `mod(12)` = (12-8)/2 = 2（读数**跟着包走** ⇒ 判据不是摆设 ✓）');
	w.Sg.story.rulesPack = keep;
	eq(R.mod(14), 2, '③ 复位 ⇒ 回内置语义（`(14-10)/2`）✓');
}

// ── `#568` 条件项的**对象算子形**（`gte`／`lte`／`oneOf`）：引擎兑现 ＋ 结构畸形 fail-loud ──
// 背景：门侧（`#560`）早已能**解析**对象形条件项，而引擎只会按字符串键做真值判断
// → `{ gte: ['star.spent', 3]}` 会被当成"某个键"取真值 → **静默为假**（行为错，且没有任何门看得见）。
// 这一段就是那个缺口的回归门：正例／反例／边界（缺键、类型不可比）／fail-loud 四类。
{
	const Sg = w.Sg;
	const OPS = (await import('../scripts/audit/lib/shared.mjs')).OPS;
	eq(Sg.rules.ops, OPS, '`Sg.rules.ops` 与门侧 `OPS` 是**同一词表**（两侧漂移会被 `--rules` 抓住）');
	// 车道 D 切片 1（`#215` `18500772`）：**四轴**都要钉在页内可读的镜像上 ——
	// 只钉 `ops` 会让另三轴"改了引擎不改镜像" **静默通过**（本仓"只钉一半"那族）。
	{
		const { VOCAB, VOCAB_AXES } = await import('../editor/lib/core/vocab.mjs');
		eq(VOCAB_AXES.slice().sort(), ['effects', 'ops', 'prefixes', 'terms'], '镜像声明**四轴齐** ✓（少一轴 ⇒ 页内就有整面选不到 ✗）');
		for (const axis of VOCAB_AXES) {
			eq(Sg.rules[axis], VOCAB[axis], `词表轴 \`${axis}\`：**引擎 ↔ 页内镜像逐字同** ✓（只改一边 ⇒ 当场红 ✗ —— 要加一项先改引擎 ✓）`);
		}
	}
	// `#966`：**领域表也要钉**（照四轴同形）—— 引擎**按名查**这两张表，查不到 → `mod(undefined) → 0` → **静默 +0**
	//（写错一个字母 → 检定明明在跑、却按 0 修正）。两表**带中文标签** → 钉的是**逐字相等**（不是“键集合相同”）。
	{
		const { DOMAIN_TABLES, unknownDomainWords } = await import('../editor/lib/core/vocab.mjs');
		//注意：两张表挂在 **`Game.Rules`** 上（不是 `Sg.rules` —— 四轴才在 `Sg.rules`；本行就是量出来的）。
		eq(R.ABILITIES, DOMAIN_TABLES.abilities, '`ABILITIES`：引擎 ↔ 页内镜像**逐字同** ✓（改引擎表不改镜像 ⇒ 当场红 ✗）');
		eq(R.SKILLS, DOMAIN_TABLES.skills, '`SKILLS`：同上 ✓');
		// 牙的两半
		const sitesOf = (sites) => ({ 'tables.json': { containers: { Checks: { sites } } } });
		eq(unknownDomainWords(sitesOf({ A: { abil: 'str', dc: 12 }, B: { skill: '运动', dc: 10 } })).length, 0, '牙·反例：表内词 ⇒ **不报** ✓');
		const bad = unknownDomainWords(sitesOf({ C: { abil: 'strr' }, D: { skill: '走' } }));
		eq(bad.length, 2, '牙·正例：表外词 ⇒ **逐条报** ✓（不再静默 +0 ✗）');
		eq(bad.map((x) => `${x.site}.${x.field}=${x.value}`).join(','), 'C.abil=strr,D.skill=走', '牙：**点名到站点 ＋ 字段 ＋ 值** ✓（后人能直接定位 ✗）');
		eq(unknownDomainWords({}).length, 0, '牙·边界：无数据 ⇒ 空 ✓（**不抛** ✗）');
		eq(unknownDomainWords(sitesOf({ E: { abil: 'str' } })).length, 0, '牙·边界：只给 `abil` 不给 `skill` ⇒ 不报 ✓');
	}
	const p = { ev: { seen: true, n: 7 }, world: { done: false }, inv: { 钥匙: true }, star: { spent: 3 }, keeper: { state: 'seal' } };
	const M = (row) => Sg.rules.matches(row, p, new Set());
	// 正例 / 反例（gte · lte）
	ok(M({ req: [{ gte: ['star.spent', 3] }] }), 'gte：`star.spent`=3 ≥ 3 ⇒ 匹配（第三命名空间读得到）');
	ok(!M({ req: [{ gte: ['star.spent', 4] }] }), 'gte：3 ≥ 4 不成立 ⇒ 不匹配');
	ok(M({ req: [{ lte: ['star.spent', 3] }] }), 'lte：3 ≤ 3 ⇒ 匹配（边界取等）');
	ok(!M({ req: [{ lte: ['star.spent', 2] }] }), 'lte：3 ≤ 2 不成立 ⇒ 不匹配');
	// oneOf：两种写法都认（嵌套数组 / 平铺）
	ok(M({ any: [{ oneOf: ['keeper.state', ['seal', 'open']] }] }), 'oneOf（嵌套数组）：seal ∈ 集合 ⇒ 匹配');
	ok(M({ any: [{ oneOf: ['keeper.state', 'seal', 'open'] }] }), 'oneOf（平铺）：同上 ⇒ 匹配');
	ok(!M({ any: [{ oneOf: ['keeper.state', ['open']] }] }), 'oneOf：seal ∉ [open] ⇒ 不匹配');
	// 边界：缺键 → 不匹配且不抛（"还没发生"是合法状态，不是结构缺陷）
	ok(!M({ req: [{ gte: ['star.nope', 1] }] }), '边界：键缺失 ⇒ 不匹配且**不抛错**');
	ok(!M({ req: [{ oneOf: ['ev.nope', [true]] }] }), '边界：`oneOf` 遇缺键 ⇒ 不匹配');
	ok(!M({ req: [{ gte: ['keeper.state', 1] }] }), '边界：数值算子遇非数值 ⇒ 不匹配（不抛错、不做字符串比）');
	// 与字符串键混用；exclude / 前缀键也走同一条判据
	ok(M({ req: [{ gte: ['star.spent', 1] }, 'ev.seen'] }), '混合：对象形 ＋ 字符串键 ⇒ 都中才匹配');
	ok(!M({ req: [{ gte: ['star.spent', 1] }, 'ev.nope'] }), '混合：字符串键不中 ⇒ 不匹配');
	ok(!M({ exclude: [{ oneOf: ['keeper.state', ['seal']] }] }), 'exclude 认对象形：命中即排除');
	ok(M({ req: [{ oneOf: ['inv:钥匙', [true]] }] }), '前缀键：`inv:钥匙` 在对象形里照样求值 ⇒ 匹配');
	// 结构畸形 → fail-loud（静默为假正是本票要根除的那类）
	const throws = (row) => { try { M(row); return false; } catch { return true; } };
	// ★ `#1433` 连带（`#1447` rebase 时改，★实测撞到）：本格原用 `gt` 当「未宣告算子」的样本 ——
	//   而 `#1433` 已把 `gt`/`lt` **补进 `Sg.rules.ops`** ⇒ 再用它**测不出「未宣告」** ✗（它会**真求值**）；
	//   ★实测：rebase 后本格**变红**（`✗ 未宣告算子「gt」⇒ 抛错`）—— 因为 `gt` 现在**是**宣告过的 ✓。
	//   ⇒ 换成**确实不在词表里**的算子（`approx`）⇒ **判据意图不变**（未宣告 ⇒ fail-loud ✓）。
	//   ★而「`gt` 已宣告且语义正确」另有正面格看护（同段 `gt：3 > 2 ⇒ 匹配` ＋ 两条**取等边界** ✓）。
	ok(throws({ req: [{ approx: ['star.spent', 1] }] }), '未宣告算子「approx」⇒ **抛错**（不静默为假）');
	ok(throws({ req: [{ gte: ['star.spent', 1], lte: ['star.spent', 9] }] }), '一个对象里两个算子 ⇒ 抛错（结构畸形）');
	ok(throws({ req: [{ gte: ['star.spent'] }] }), '算子参数只有键、没有值 ⇒ 抛错');
	ok(throws({ req: [{ gte: 'star.spent' }] }), '算子参数不是数组 ⇒ 抛错');
}


console.log(failures ? `\n${failures} 项失败` : '\n规则核层测试全部通过');
process.exit(failures ? 1 : 0);
