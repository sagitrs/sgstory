// 逐故事的「运行时契约」门（`#574`）——**接入契约的运行时那一半**。
//
// 为什么要有它：`#574` 的现场是「故事 2 的**内容**在调用 `Sg.notes.add(...)`，而它的**产物**里连
// `Sg.notes` 都没有」（`src/80-script.twee` 当时被登记成 `layer:'story'` ⇒ 不进第二/第三个故事的作用域）。
// 顺着这条线又挖出三处**同一族**的静默坏掉（都是"声明了/写了，但运行时根本不生效"，而门全绿）：
//   · `Checks.sites` 的 `skill: 'dex'` 写成了**属性键**（引擎要技能名）⇒ **每次判定都抛「未知技能」**
//     ⇒ 五步主线无伤害、无异常、无成败分支，事件变成走过场；
//   · `Game.Combat.applyStatus()` **返回**新状态对象，内容却丢了返回值 ⇒ 异常一条都不落；
//   · 血量上限写 `maxHp`（引擎字段是 `max_hp`）⇒ 侧栏血条分母 0。
// 共性是同一句话：**「内容声称做了什么」与「运行时真的发生了什么」从来没有人对过账**
// （同族：`#572` 的"选中没跑"、`#557` 的"退 0 不是证据"）。
//
// 判据（五条，逐故事）：
//   ① **面存在**：故事作用域（`scopedFiles()`）里引用的 `Sg.*` 面必须在产物里存在
//      （`Sg.story.*` 除外＝接入契约口子；`Sg.X?.y` 可选链＝作者显式声明"可能没有"）；
//   ② **位点能判**：`Game.Checks.sites` 里**每个**位点都要能真的判一次（`Game.Checks.resolve()` 不抛）；
//   ③ **笔记可用**：内容里 `Sg.notes.add("id")` 用到的每条笔记都必须已登记，且 `add` 真的跑通；
//   ④ **侧栏可用**：没有车卡的故事必须给最小侧栏（血量/物品）；有车卡的故事在车卡前不得多出它；
//   ⑤ **机制真落**：故事 2 的真机路（陷阱·失败支）点完 ⇒ hp 降 ＋ 异常真的落 ＋ 结果槽落了 ＋ 零未捕获报错。
//
// 用法：`node test/story-runtime.mjs`（自证：`--selftest`）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scopedFiles, engineFiles } from '../scripts/module-order.mjs';
import { storySlugs, readStory, ROOT } from '../scripts/dist-paths.mjs';
import { boot } from './boot.mjs';
import { qualifiedWriteKeys } from '../scripts/audit/lib/shared.mjs';
import { createContext } from '../scripts/audit/context.mjs';

/** 纯函数：从若干源码里收集引用的 `Sg.*` 面（`路径 → 来源文件`）。注释里的提及不算、可选链不算。 */
export const apiUses = (sources) => {
	const out = new Map();
	for (const [file, raw] of Object.entries(sources)) {
		const text = String(raw)
			.replace(/\/%[\s\S]*?%\//g, ' ')      // twee 块注释
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/^[ \t]*\/\/.*$/gm, ' ')      // JS 行注释（只在行首，避免吃掉 URL 里的 //）
			.replace(/'[^'\n]*'/g, ' ')             // 字符串字面量＝**数据**不是引用（如 `RESET_KEEPS: ['Sg.Codex']`）
			.replace(/"[^"\n]*"/g, ' ');
		for (const m of text.matchAll(/\bSg\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?(\?)?/g)) {
			if (m[1] === 'story') continue;        // 接入契约口子：另一套门（`#459`）
			if (m[3]) continue;                    // 可选链＝作者显式声明"这一面可能没有" ⇒ 本门不管
			const path = m[2] ? `Sg.${m[1]}.${m[2]}` : `Sg.${m[1]}`;
			// 正文里的**文档提及**不算引用：两侧都被反引号夹住（`` `Sg.Codex` ``）。
			// 只夹一侧的不算（twee 里反引号是宏参数的 JS 表达式分隔符，那是真代码）。
			if (text[m.index - 1] === '`' && text[m.index + m[0].length] === '`') continue;
			if (!out.has(path)) out.set(path, file);
		}
	}
	return out;
};

/** 纯函数：`apiUses()` 的产物 × 产物实况（`has(path)`）⇒ 缺失清单。 */
export const missingApis = (uses, has) =>
	[...uses].filter(([path]) => !has(path)).map(([path, file]) => ({ path, file }));

/** 纯函数：判据 ①。 */
export const judgeApiFace = (uses, has) => missingApis(uses, has).map((m) => ({
	code: 'api-missing',
	msg: `故事作用域里的 ${m.file} 引用了 \`${m.path}\`，但产物里不存在（运行时 TypeError；#574）`,
}));

/** 纯函数：内容里 `Sg.notes.add("id")` 用到的 note id（去重，带来源文件）。 */
export const noteIdsUsed = (sources) => {
	const out = new Map();
	for (const [file, raw] of Object.entries(sources)) {
		const text = String(raw).replace(/\/%[\s\S]*?%\//g, ' ');
		for (const m of text.matchAll(/Sg\.notes\.add\(\s*["']([A-Za-z_$][\w$]*)["']/g)) if (!out.has(m[1])) out.set(m[1], file);
	}
	return out;
};

/** 纯函数：判据 ③ —— 用到的笔记必须都登记了。 */
export const judgeNotes = (used, declared) =>
	[...used].filter(([id]) => !declared.includes(id)).map(([id, file]) => ({
		code: 'note-undeclared',
		msg: `${file} 调用 \`Sg.notes.add("${id}")\`，但该笔记未登记（\`Sg.notes.add\` fail-loud ⇒ 运行时抛错；#574）`,
	}));

/** 纯函数：判据 ④ —— 侧栏该不该给"最小面"。 */
export const judgeCaption = ({ slug, hasLabel, hasChargen, hpbar, invBlock }) => {
	const out = [];
	if (hasLabel) return out;                                  // 车卡后：车卡卡面（原行为）——本判据不管
	if (hasChargen) {                                          // 有车卡但还没车卡：**不得**多出最小面（故事 1 零变化）
		if (hpbar || invBlock) out.push({ code: 'caption-extra', msg: `故事「${slug}」有车卡、尚未车卡，侧栏却多出最小面（血量/物品）——故事 1 的初始形态被改了` });
		return out;
	}
	if (!hpbar) out.push({ code: 'caption-no-hp', msg: `故事「${slug}」没有车卡 ⇒ 侧栏必须给最小面（血量），实际没有任何血条（#574）` });
	if (!invBlock) out.push({ code: 'caption-no-inv', msg: `故事「${slug}」没有车卡 ⇒ 侧栏必须给物品栏，实际没有（#574）` });
	return out;
};

/** 纯函数：判据 ⑤ —— 真机路的状态断言。给「点击前后」的观测，返回失败列表。 */
export const judgeRealPath = ({ slug, hpBefore, hpAfter, statuses, lastCheck, uncaught }) => {
	const out = [];
	if (!(hpAfter < hpBefore)) out.push({ code: 'no-damage', msg: `故事「${slug}」陷阱失败支没有落伤害（hp ${hpBefore}→${hpAfter}）——判定没生效？` });
	if (!statuses || !Object.keys(statuses).length) out.push({ code: 'no-status', msg: `故事「${slug}」陷阱失败支没有落异常（\`applyStatus\` 的返回值必须被接住；#574）` });
	if (!lastCheck || typeof lastCheck.success !== 'boolean') out.push({ code: 'no-check', msg: `故事「${slug}」判定结果没进结果槽 \`$last_check\`（跨段后骰面/结果会丢）` });
	if (uncaught?.length) out.push({ code: 'uncaught', msg: `故事「${slug}」真机路有未捕获报错：${String(uncaught[0]).split('\n')[0].slice(0, 120)}` });
	return out;
};

/** 纯函数：判据 ⑧ —— 失败重置的观测（`landing` 观测重置落地时的状态；`born` 观测回到出生点后的状态）。 */
export const judgeReset = ({ landing, obs, born }) => {
	const out = [];
	if (obs.landing !== '倒下') out.push({ code: 'reset-landing', msg: `全灭没有走重置落地页（落在「${obs.landing}」）——应经 \`resetRun\` 回出生点` });
	if (obs.inv.length) out.push({ code: 'reset-inv', msg: `道具没清零（还剩 ${obs.inv.join('/')}）` });
	if (obs.gearHp) out.push({ code: 'reset-gear', msg: `耐久表没清（剩 ${obs.gearHp} 件）` });
	if (obs.statuses) out.push({ code: 'reset-status', msg: `异常没清（剩 ${obs.statuses} 处）` });
	if (obs.hp !== landing) out.push({ code: 'reset-hp', msg: `hp 没回满（${obs.hp} ≠ max_hp ${landing}）` });
	if (!obs.note) out.push({ code: 'reset-note', msg: '**笔记/线索被清了**（已定 ⑧ 明确要求保留；`RESET_KEEPS`）' });
	if (obs.at !== '醒来') out.push({ code: 'reset-born', msg: `重置后没回出生点（落在「${obs.at}」）` });
	{
		const kit = new Set(born ?? []);
		const want = ['旧剑', '火把'];
		if (born?.length && (kit.size !== want.length || !want.every((k) => kit.has(k)))) out.push({ code: 'reset-kit', msg: `出生点起始装备不对（${born.join('/')}）——应只发剑与火把` });
	}
	if (obs.bornStep !== 0) out.push({ code: 'reset-step', msg: `步数没归零（${obs.bornStep}）` });
	return out;
};

/** 纯函数：判据 ⑨ —— 宝箱某一条路径的观测。`before/after` 为点击前后的 `State.variables` 快照（只取需要的字段）。 */
export const judgeChestPath = ({ path, before, after, landed }) => {
	const out = [];
	const got = !!after.inv['干粮'];
	if (landed !== '岔口' && landed !== '地下村落') out.push({ code: 'chest-dead-end', msg: `路径「${path}」没有出口（落在「${landed}」）——宝箱不得产生死档` });
	if (path === '判定' || path === '道具') {
		if (!got) out.push({ code: 'chest-no-loot', msg: `路径「${path}」成功后没拿到奖励` });
		if (after.check?.dc !== after.expectDc) out.push({ code: 'chest-dc', msg: `路径「${path}」用的 DC 不是 ${after.expectDc}（实际 ${after.check?.dc}）` });
	}
	if (path === '钥匙') {
		if (!got) out.push({ code: 'chest-no-loot', msg: '钥匙路径没拿到奖励（降为 0 只是"不掷骰"，不是"没奖品"）' });
		if (JSON.stringify(before.check) !== JSON.stringify(after.check)) out.push({ code: 'chest-checked', msg: '钥匙路径**起了判定**（已定 ③：钥匙把难度降为 0 ⇒ 不该掷骰）' });
	}
	if (path === '跳过') {
		if (got) out.push({ code: 'chest-skip-loot', msg: '径直通过却拿到了奖励（已定 ③：跳过 = 无判定、**无奖励**）' });
		if (after.hp !== before.hp) out.push({ code: 'chest-skip-hurt', msg: `径直通过掉了血（${before.hp}→${after.hp}）——已定 ③：跳过无惩罚` });
		if (JSON.stringify(before.check) !== JSON.stringify(after.check)) out.push({ code: 'chest-checked', msg: '径直通过**起了判定**（已定 ③：不掷骰）' });
	}
	return out;
};

const main = async () => {
	const problems = [];
	const selftest = process.argv.includes('--selftest');

	// ── 自证（纯函数：正例放过 / 反例必须报；失败计入退出码）──
	if (selftest) {
		let bad = 0;
		const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ 自证·${label}`); else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); } };
		const uses = apiUses({
			'a.twee': '<<run Sg.notes.add("x")>> Sg.save.quick()',
			'b.twee': '// Sg.ghost.nope() 只是注释\n/% Sg.alsoGhost() 块注释 %/',
			'c.twee': 'Sg.story.notes() 与 Sg.story.checkSite("x")',
			'd.twee': 'window.Sg.Codex?.sync?.()',
			'e.twee': '正文里提到 `Sg.Codex` 只是文档提及，而 `Sg.notes.add("x")` 是真引用',
			'f.twee': "const RESET_KEEPS = ['Sg.notes', 'Sg.store'];",   // 字符串字面量＝数据
		});
		t('① 正例：收集到 `Sg.notes.add` 与 `Sg.save.quick`（**最长的点号链**）', uses.has('Sg.notes.add') && uses.has('Sg.save.quick'), [...uses.keys()].join());
		t('① 正例：`Sg.story.*`（接入契约口子）不计入本门', ![...uses.keys()].some((k) => k.startsWith('Sg.story')));
		t('① 反例：注释里的提及不算引用（行注释/块注释）', !uses.has('Sg.ghost.nope') && !uses.has('Sg.alsoGhost'), [...uses.keys()].join());
		t('① 正例：可选链（`Sg.Codex?.sync?.()`）＝显式可选面 ⇒ 不计入必需面', ![...uses.keys()].some((k) => k.startsWith('Sg.Codex')), [...uses.keys()].join());
		t('① 正例：正文里被反引号夹住的文档提及（`` `Sg.Codex` ``）不算引用', ![...uses.keys()].some((k) => k === 'Sg.Codex'), [...uses.keys()].join());
		t('① 正例：字符串字面量里的名字是**数据**不是引用（`RESET_KEEPS`）', !uses.has('Sg.store') && !uses.has('Sg.notes'), [...uses.keys()].join());
		const has = (p) => ['Sg.save', 'Sg.notes.add'].includes(p);
		t('① 正例：面都在 ⇒ 0 条', judgeApiFace(new Map([['Sg.save', 'x']]), has).length === 0);
		const missing = judgeApiFace(new Map([['Sg.save', 'x'], ['Sg.Codex', 'stories/a/1.twee']]), has);
		t('① 反例：产物缺一面 ⇒ 报一条且带来源文件', missing.length === 1 && missing[0].msg.includes('stories/a/1.twee'), JSON.stringify(missing));

		const used = noteIdsUsed({ 'a.twee': '<<run Sg.notes.add("n_a")>> <<run Sg.notes.add(\'n_b\')>>', 'b.twee': '/% Sg.notes.add("n_ignored") %/' });
		t('③ 正例：收集两条 note id（块注释里的不算）', used.size === 2 && used.has('n_a') && used.has('n_b'), [...used.keys()].join());
		t('③ 反例：用而未登记 ⇒ 报一条', judgeNotes(new Map([['n_a', 'a.twee']]), ['n_b']).length === 1);
		t('③ 正例：都登记了 ⇒ 0 条', judgeNotes(new Map([['n_a', 'a.twee']]), ['n_a']).length === 0);

		t('④ 正例：无车卡的故事给了血量＋物品 ⇒ 0 条', judgeCaption({ slug: 'hollow-cave', hasLabel: false, hasChargen: false, hpbar: true, invBlock: true }).length === 0);
		t('④ 反例：无车卡的故事没有血量 ⇒ 报', judgeCaption({ slug: 'hollow-cave', hasLabel: false, hasChargen: false, hpbar: false, invBlock: false }).length === 2);
		t('④ 反例：有车卡、未车卡却出现最小面 ⇒ 报（故事 1 被改）', judgeCaption({ slug: 'mist-forest', hasLabel: false, hasChargen: true, hpbar: true, invBlock: true }).length === 1);
		t('④ 正例：有车卡、未车卡且没有最小面 ⇒ 0 条（现状不变）', judgeCaption({ slug: 'mist-forest', hasLabel: false, hasChargen: true, hpbar: false, invBlock: false }).length === 0);

		const good = { slug: 'x', hpBefore: 20, hpAfter: 18, statuses: { 躯干: { bleed: 5 } }, lastCheck: { success: false }, uncaught: [] };
		t('⑤ 正例：伤害＋异常＋结果槽都落了、无报错 ⇒ 0 条', judgeRealPath(good).length === 0);
		t('⑤ 反例：没落伤害 ⇒ 报', judgeRealPath({ ...good, hpAfter: 20 }).some((p) => p.code === 'no-damage'));
		t('⑤ 反例：异常没落（返回值被丢）⇒ 报', judgeRealPath({ ...good, statuses: {} }).some((p) => p.code === 'no-status'));
		t('⑤ 反例：结果槽没落 ⇒ 报', judgeRealPath({ ...good, lastCheck: undefined }).some((p) => p.code === 'no-check'));
		t('⑤ 反例：有未捕获报错 ⇒ 报', judgeRealPath({ ...good, uncaught: ['Uncaught: boom'] }).some((p) => p.code === 'uncaught'));

		const cbase = { inv: {}, check: null, hp: 20 };
		const okPath = (path, over = {}) => judgeChestPath({ path, before: cbase, after: { ...cbase, dc: 12, ...over, expectDc: 12, check: { dc: 12 }, inv: { 干粮: true } }, landed: '岔口' });
		t('⑨ 正例：判定路径 DC＝12 且拿到奖励、有出口 ⇒ 0 条', okPath('判定').length === 0);
		t('⑨ 反例：判定路径 DC 不对（用 9 当普通）⇒ 报', judgeChestPath({ path: '判定', before: cbase, after: { ...cbase, hp: 20, inv: { 干粮: true }, expectDc: 12, check: { dc: 9 } }, landed: '岔口' }).some((p) => p.code === 'chest-dc'));
		t('⑨ 反例：钥匙路径起了判定 ⇒ 报（已定 ③：降为 0）', judgeChestPath({ path: '钥匙', before: cbase, after: { ...cbase, hp: 20, inv: { 干粮: true }, check: { dc: 12 }, expectDc: 12 }, landed: '岔口' }).some((p) => p.code === 'chest-checked'));
		t('⑨ 反例：跳过却拿到奖励 ⇒ 报', judgeChestPath({ path: '跳过', before: cbase, after: { ...cbase, hp: 20, inv: { 干粮: true }, check: null, expectDc: 0 }, landed: '岔口' }).some((p) => p.code === 'chest-skip-loot'));
		t('⑨ 反例：跳过掉了血 ⇒ 报（无惩罚）', judgeChestPath({ path: '跳过', before: cbase, after: { ...cbase, hp: 18, inv: {}, check: null, expectDc: 0 }, landed: '岔口' }).some((p) => p.code === 'chest-skip-hurt'));
		t('⑨ 反例：路径没有出口（死档）⇒ 报', judgeChestPath({ path: '跳过', before: cbase, after: { ...cbase, hp: 20, inv: {}, check: null, expectDc: 0 }, landed: '机制·chest' }).some((p) => p.code === 'chest-dead-end'));

		const okReset = { landing: 20, obs: { landing: '倒下', inv: [], gearHp: 0, statuses: 0, hp: 20, note: true, at: '醒来', bornStep: 0 }, born: ['旧剑', '火把'] };
		t('⑧ 正例：全灭 ⇒ 回出生点＋道具清零＋笔记保留 ⇒ 0 条', judgeReset(okReset).length === 0);
		t('⑧ 反例：笔记被清 ⇒ 报（已定 ⑧ 明确要求保留）', judgeReset({ ...okReset, obs: { ...okReset.obs, note: false } }).some((p) => p.code === 'reset-note'));
		t('⑧ 反例：道具没清零 ⇒ 报', judgeReset({ ...okReset, obs: { ...okReset.obs, inv: ['干粮'] } }).some((p) => p.code === 'reset-inv'));
		t('⑧ 反例：没回出生点（落到别处）⇒ 报', judgeReset({ ...okReset, obs: { ...okReset.obs, at: '岔口' } }).some((p) => p.code === 'reset-born'));
		t('⑧ 反例：hp 没回满 ⇒ 报', judgeReset({ ...okReset, obs: { ...okReset.obs, hp: 3 } }).some((p) => p.code === 'reset-hp'));

		if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
		console.log('\n✔ 自证通过（面收集 × 缺失判定 × 笔记登记 × 侧栏判据 × 真机路判据 正反例）');
		process.exit(0);
	}

	// ── [域表纪律] 域表的**归属**是可机检的（`#660` 片三-4）──────────────────────────────
	// 纪律：**域表是故事数据**（`Game.State.domains` 住 `stories/<slug>/`）——引擎**不声明域**，
	// 但它写的每个键必须能在**每个故事**的域表里找到归属（否则 `--state` 会红：`未落入任何域`）。
	// 这条之所以成立，靠的是**作用域构造**：`scopedFiles(story)` ＝ 引擎文件 ∪ 本故事文件 ⇒ 域表判定天然覆盖引擎写点。
	// 本段把这个**机制**钉住（只判结果的话，`scopedFiles` 哪天漏了引擎文件，门会静默变成"只查故事写点"）。
	{
		const eng = engineFiles();
		const engWrites = new Set();
		for (const f of eng) for (const k of qualifiedWriteKeys(readFileSync(join(ROOT, f), 'utf8'))) engWrites.add(k);
		let bad2 = 0;
		for (const slug of storySlugs()) {
			const files = scopedFiles(readStory(slug));
			const inScope = files.filter((f) => eng.includes(f)).length;
			const okScope = inScope > 0 && files.some((f) => f.startsWith(`stories/${slug}/`));
			console.log(`${okScope ? '✓' : '✗'} [域表纪律] 故事作用域 ⊇ 引擎文件（${slug}：引擎 ${inScope} 个 ＋ 本故事 ${files.length - inScope} 个）⇒ 域表判定覆盖引擎写点`);
			if (!okScope) bad2++;
			// 引擎写点必须在**本故事**域表里有归属（空判守卫：引擎写点集必须非空）
			const domains = createContext({ story: slug, argv: [] }).Game?.State?.domains ?? [];
			const uncovered = [...engWrites].filter((k) => {
				const bare = String(k).split('.').pop();   // `ev.last_result` ⇒ `last_result`（域表按**裸键名**匹配）
				return !domains.some((d) => (d.keys ?? []).includes(bare) || (d.prefix ?? []).some((p) => bare.startsWith(p)));
			});
			const okDom = engWrites.size > 0 && uncovered.length === 0;
			console.log(`${okDom ? '✓' : '✗'} [域表纪律] 引擎写点（${engWrites.size} 个键）在「${slug}」域表里**全有归属**${okDom ? '' : '——未归属：' + uncovered.join('、')}`);
			if (!okDom) bad2++;
		}
		if (bad2) { console.error(`\n✗ 域表归属纪律 ${bad2} 项失败`); process.exit(1); }
	}

	// ── 逐故事：① 面存在 · ② 位点能判 · ③ 笔记可用 · ④ 侧栏 ──
	for (const slug of storySlugs()) {
		const files = scopedFiles(readStory(slug));
		const sources = Object.fromEntries(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
		const uses = apiUses(sources);
		const { w, close, uncaught, sleep } = await boot({ story: slug });
		try {
			// ① 面存在
			const has = (path) => {
				let cur = w;
				for (const seg of path.split('.')) { if (cur == null) return false; cur = cur[seg]; }
				return cur !== undefined;
			};
			const found = judgeApiFace(uses, has);
			problems.push(...found.map((f) => ({ ...f, slug })));
			console.log(`  ${found.length ? '✗' : '✓'} ${slug} ①：引用了 ${uses.size} 个 \`Sg.*\` 面，产物里缺失 ${found.length} 个`);
			for (const f of found) console.log(`      ✗ ${f.msg}`);

			// ② 位点能判（注入 rng ⇒ 逐个 resolve；**这一条抓的是 "skill 写成了属性键" 那类**）
			w.Game.Rules.rng.set((lo, hi) => Math.ceil(hi / 2));
			const sites = Object.keys(w.Game?.Checks?.sites ?? {});
			const siteBad = [];
			for (const k of sites) {
				try {
					const r = w.Game.Checks.resolve(k, w.SugarCube.State.variables.pc);
					if (!r || typeof r.success !== 'boolean') siteBad.push([k, '返回值不是判定结果']);
				} catch (e) { siteBad.push([k, e.message.slice(0, 90)]); }
			}
			problems.push(...siteBad.map(([k, m]) => ({ code: 'site', slug, msg: `故事「${slug}」的位点「${k}」判不了：${m}` })));
			console.log(`  ${siteBad.length ? '✗' : '✓'} ${slug} ②：声明的位点 ${sites.length} 个，判不了的 ${siteBad.length} 个`);
			for (const [k, m] of siteBad) console.log(`      ✗ ${k}：${m}`);

			// ③ 笔记可用：内容用到的每条笔记都必须登记，且 add 真的跑通
			const used = noteIdsUsed(sources);
			const declared = w.Sg.notes.ids();
			const noteFound = judgeNotes(used, declared);
			problems.push(...noteFound.map((f) => ({ ...f, slug })));
			let noteBroken = 0;
			for (const [id] of used) {
				if (noteFound.some((f) => f.msg.includes(`"${id}"`))) continue;   // 未登记的交给上面那条报
				try { w.Sg.notes.add(id); if (!w.Sg.notes.has(id)) { noteBroken++; console.log(`      ✗ ${id}：add 之后 has() 仍为假`); } }
				catch (e) { noteBroken++; console.log(`      ✗ ${id}：add 抛错 ${e.message.slice(0, 90)}`); }
			}
			if (noteBroken) problems.push({ code: 'note-add', slug, msg: `故事「${slug}」有 ${noteBroken} 条笔记登记了但 add 跑不通` });
			console.log(`  ${noteFound.length || noteBroken ? '✗' : '✓'} ${slug} ③：内容用到笔记 ${used.size} 条（登记 ${declared.length} 条），未登记 ${noteFound.length} · add 跑不通 ${noteBroken}`);
			for (const f of noteFound) console.log(`      ✗ ${f.msg}`);

			// ④ 侧栏（渲染 StoryCaption 后数元素）
			w.SugarCube.Engine.play('StoryCaption');
			await sleep(200);
			const cap = w.document.querySelector('#passages');
			const pcv = w.SugarCube.State.variables.pc ?? {};
			const capProblems = judgeCaption({
				slug, hasLabel: !!pcv.classLabel, hasChargen: !!w.Game.Chargen,
				hpbar: !!cap?.querySelector('.hpbar'), invBlock: !!cap?.querySelector('.inv-block'),
			});
			problems.push(...capProblems.map((c) => ({ ...c, slug })));
			console.log(`  ${capProblems.length ? '✗' : '✓'} ${slug} ④：侧栏（车卡=${!!pcv.classLabel} · 故事有车卡=${!!w.Game.Chargen}）血量=${!!cap?.querySelector('.hpbar')} 物品栏=${!!cap?.querySelector('.inv-block')}`);
			for (const c of capProblems) console.log(`      ✗ ${c.msg}`);
		} catch (e) {
			problems.push({ code: 'boot', msg: `故事「${slug}」判据跑不完：${e.message}` });
		} finally { close(); }
	}

	// ── 判据 ⑤：故事 2 的真机路（陷阱·失败支）──
	{
		const slug = 'hollow-cave';
		const { w, close, sleep, settle, uncaught } = await boot({ story: slug, random: 0.9 });
		try {
			w.Game.Rules.rng.set(() => 3);                 // 一律低骰 ⇒ 陷阱判定失败
			w.SugarCube.Engine.play('路·1c');
			await settle(); await sleep(250);
			const hpBefore = w.SugarCube.State.variables.pc.hp;
			const link = [...w.document.querySelectorAll('#passages a.link-internal')].find((a) => a.textContent.includes('侧身'));
			if (!link) {
				problems.push({ code: 'path', msg: `故事「${slug}」的陷阱实例没有「侧身扑过去」这条链接（可选：${[...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent).join(' / ')}）` });
			} else {
				link.click();
				await settle(); await sleep(300);
				const vars = w.SugarCube.State.variables;
				const found = judgeRealPath({ slug, hpBefore, hpAfter: vars.pc.hp, statuses: vars.pc.statuses, lastCheck: vars.last_check, uncaught: [...uncaught] });
				problems.push(...found.map((f) => ({ ...f, slug })));
				console.log(`  ${found.length ? '✗' : '✓'} ${slug} ⑤ 真机路（陷阱·失败支）：hp ${hpBefore}→${vars.pc.hp} · 异常 ${JSON.stringify(vars.pc.statuses)} · 结果槽 ${vars.last_check ? '✓' : '✗'} · 未捕获 ${uncaught.length}`);
				for (const f of found) console.log(`      ✗ ${f.msg}`);
			}
		} catch (e) {
			problems.push({ code: 'path-crash', msg: `故事「${slug}」真机路跑不完：${e.message}` });
		} finally { close(); }
	}

	// ── 判据 ⑥：故事 2 的旅人面（`#490` 已定 ⑥）──
	{
		const slug = 'hollow-cave';
		const runCase = async ({ name, rng, gold = 0, click, judge }) => {
			const { w, close, sleep, settle } = await boot({ story: slug, random: 0.9 });
			try {
				w.Game.Rules.rng.set((lo, hi) => rng[hi] ?? 1);
				if (gold) w.eval(`SugarCube.State.variables.pc.gold = ${gold}`);
				w.SugarCube.Engine.play('路·2c');                 // 旅人实例段落（第 2 段）
				await settle(); await sleep(220);
				const anchors = [...w.document.querySelectorAll('#passages a.link-internal')];
				const labels = anchors.map((a) => a.textContent.replace(/\s+/g, ''));
				const before = JSON.parse(JSON.stringify(w.SugarCube.State.variables.pc));
				const expect = {
					price: w.Game.Economy.prices['干粮'],
					reward: w.Sg.story.mechanics().encounters.short.reward.gold,
				};
				const target = anchors.find((a) => a.textContent.replace(/\s+/g, '').includes(click));
				if (!target) {
					problems.push({ code: 'traveller', slug, msg: `${name}：找不到链接「${click}」（可选：${labels.join(' / ')}）` });
					return;
				}
				target.click();
				await settle(); await sleep(260);
				const pc = w.SugarCube.State.variables.pc;
				const fails = judge({ pc, before, labels, expect });
				problems.push(...fails.map((msg) => ({ code: 'traveller', slug, msg: `${name}：${msg}` })));
				console.log(`  ${fails.length ? '✗' : '✓'} ${slug} ⑥ ${name}`);
				for (const m of fails) console.log(`      ✗ ${m}`);
			} catch (e) {
				problems.push({ code: 'traveller', slug, msg: `${name} 跑不完：${e.message}` });
			} finally { close(); }
		};

		await runCase({
			name: '中立＋交涉失败 ⇒ 转敌对走短战斗（且没钱不显示交易路）',
			rng: { 100: 80, 20: 3 }, click: '开口求他匀一点吃的',
			judge: ({ pc, labels }) => [
				...(pc.ev.cave_att === 'foe' ? [] : [`交涉失败应转敌对（cave_att=${JSON.stringify(pc.ev.cave_att)}）`]),
				...(pc.ev.fight?.wave?.encounter === 'short' ? [] : ['交涉失败应进短战斗（ev.fight.wave.encounter ≠ short）']),
				...(labels.some((l) => l.includes('掏出')) ? ['身上没钱却出现了交易路（一口价：没钱不卖）'] : []),
			],
		});
		await runCase({
			name: '钱够 ⇒ 一口价交易按**表价**扣钱并给干粮',
			rng: { 100: 80, 20: 19 }, gold: 5, click: '掏出',
			judge: ({ pc, before, expect }) => [
				...(pc.gold === before.gold - expect.price ? [] : [`交易没按表价扣钱（${before.gold}→${pc.gold}，表价 ${expect.price}）`]),
				...(pc.inv['干粮'] ? [] : ['交易后没拿到干粮']),
			],
		});
		await runCase({
			name: '敌对＋短战斗胜利 ⇒ 掉金币（金本位的来源）',
			rng: { 100: 20, 20: 19 }, click: '迎面劈过去',
			judge: ({ pc, before, expect }) => [
				...(pc.gold === before.gold + expect.reward ? [] : [`短战斗胜利没掉金币（${before.gold}→${pc.gold}，声明 ${expect.reward}）`]),
				...(pc.ev.cave_battered ? ['胜利却落了「挨打」笔记'] : []),
			],
		});
	}

	// ── 判据 ⑦：五种洞窟效果（`#491` 判据 8／已定 ⑦）──
	{
		const slug = 'hollow-cave';
		const snap = (w) => {
			const pc = w.SugarCube.State.variables.pc;
			return {
				hp: pc.hp, torch: pc.ev.cave_torch ?? 0, key: !!pc.inv['钥匙'],
				note: pc.ev.cave_echo === true, statuses: Object.keys(pc.statuses ?? {}).length,
				sword: pc.gearHp?.['旧剑'] ?? 2,                       // 缺项＝满耐久（声明 maxHp 2）
			};
		};
		const runCave = async ({ kind, d5, click, before = () => {}, judge }) => {
			const { w, close, sleep, settle } = await boot({ story: slug, random: 0.9 });
			try {
				// `机制·cave` 用 `rng.d(5)` 抽洞穴种类；其余骰面固定给 3（判定失败 ⇒ 走失败支）
				// d(5) 抽种类；d(20) 给 3（判定失败 ⇒ 走失败支）；其余（如 gearWear 的 d(2)）给 1
				w.Game.Rules.rng.set((lo, hi) => (hi === 5 ? d5 : hi === 20 ? 3 : 1));
				before(w);
				// ⚠ 快照必须在**进入段落之前**取：`机制·cave` 的四种效果（钥匙/回血/线索/火把）在**渲染期**就落地，
				//    只有地下湖的伤害与耐久扣减在 link 体内（点击时）。取早了会看不出效果、取晚了会漏掉效果。
				const was = snap(w);
				w.SugarCube.Engine.play('路·2b');                       // 特殊洞窟实例（第 2 段）
				await settle(); await sleep(220);
				const anchors = [...w.document.querySelectorAll('#passages a.link-internal')];
				const target = anchors.find((a) => a.textContent.replace(/\s+/g, '').includes(click));
				if (!target) {
					problems.push({ code: 'cave', slug, msg: `${kind}：找不到链接「${click}」（可选：${anchors.map((a) => a.textContent.replace(/\s+/g, '')).join(' / ')}）` });
					return;
				}
				target.click();
				await settle(); await sleep(260);
				const now = snap(w);
				const fails = judge({ was, now });
				problems.push(...fails.map((msg) => ({ code: 'cave', slug, msg: `${kind}：${msg}` })));
				console.log(`  ${fails.length ? '✗' : '✓'} ${slug} ⑦ ${kind}：hp ${was.hp}→${now.hp} · 钥匙 ${now.key} · 线索 ${now.note} · 火把 ${was.torch}→${now.torch} · 剑耐久 ${was.sword}→${now.sword} · 异常 ${was.statuses}→${now.statuses}`);
				for (const m of fails) console.log(`      ✗ ${m}`);
			} catch (e) {
				problems.push({ code: 'cave', slug, msg: `${kind} 跑不完：${e.message}` });
			} finally { close(); }
		};

		// ① 矿洞 ⇒ 得钥匙（反例：不得搭上线索/火把/耐久）
		await runCave({ kind: '矿洞⇒得钥匙', d5: 1, click: '收好，继续走',
			judge: ({ was, now }) => [
				...(now.key ? [] : ['矿洞没给钥匙（已定 ⑦：矿洞＝得钥匙×1）']),
				...(now.torch === was.torch ? [] : ['矿洞不该动火把续航']),
				...(now.note === was.note ? [] : ['矿洞不该给线索']),
			] });
		// ② 温泉 ⇒ 回 HP ＋ 清异常 ＋ **修耐久**（v1 唯一修复点）
		await runCave({ kind: '温泉⇒回HP＋清异常＋修耐久', d5: 2, click: '起来，继续走',
			before: (w) => w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.hp=10;pc.statuses={腿:{bleed:2}};pc.gear=["旧剑","火把"];pc.gearHp={旧剑:1};})()'),
			judge: ({ was, now }) => [
				...(now.hp > was.hp ? [] : [`温泉没回 HP（${was.hp}→${now.hp}）`]),
				...(now.statuses === 0 ? [] : [`温泉没清异常（剩 ${now.statuses} 处）`]),
				...(now.sword > was.sword ? [] : [`温泉没修耐久（剑 ${was.sword}→${now.sword}；S1 已定 ④：v1 唯一修复点）`]),
				...(now.torch === was.torch ? [] : ['温泉不该动火把续航']),
			] });
		// ③ 空洞 ⇒ 落线索（反例：不得给钥匙/动耐久）
		await runCave({ kind: '空洞⇒落线索', d5: 3, click: '记住回音，继续走',
			judge: ({ was, now }) => [
				...(now.note ? [] : ['空洞没落线索（已定 ⑦：空洞＝给线索）']),
				...(now.key ? ['空洞不该给钥匙'] : []),
				...(now.sword === was.sword ? [] : ['空洞不该动耐久']),
			] });
		// ④ 地下湖（失败支）⇒ 扣耐久（反例：不得给钥匙/动火把）
		await runCave({ kind: '地下湖⇒失败扣耐久', d5: 4, click: '举着火把，踩着露出水面的石头过去',
			before: (w) => w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.ev.cave_torch=1;pc.gear=["旧剑","火把"];})()'),
			judge: ({ was, now }) => [
				...(now.sword < was.sword ? [] : [`地下湖失败没扣耐久（剑 ${was.sword}→${now.sword}；已定 ⑦：失败 −1 耐久）`]),
				...(now.torch === was.torch ? [] : ['地下湖不该动火把续航']),
				...(now.key ? ['地下湖不该给钥匙'] : []),
			] });
		// ⑤ 蘑菇洞 ⇒ 火把续航 +1（反例：不得给钥匙/动耐久）
		await runCave({ kind: '蘑菇洞⇒火把续航+1', d5: 5, click: '让火把在这里换一口气，继续走',
			judge: ({ was, now }) => [
				...(now.torch === was.torch + 1 ? [] : [`蘑菇洞没给火把续航 +1（${was.torch}→${now.torch}）`]),
				...(now.key ? ['蘑菇洞不该给钥匙'] : []),
				...(now.sword === was.sword ? [] : ['蘑菇洞不该动耐久']),
			] });
	}

	// ── 判据 ⑧：失败重置（`#491` 判据 4／已定 ⑧）——"仅全灭触发" 与 "单步失败不终止" 两条互为反例 ──
	{
		const slug = 'hollow-cave';
		const trapClick = async (w, { settle, sleep }) => {
			w.SugarCube.Engine.play('路·1c');                       // 陷阱实例
			await settle(); await sleep(220);
			const a = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.includes('侧身'));
			if (!a) return null;
			a.click(); await settle(); await sleep(260);
			return w.SugarCube.State.passage;
		};
		// ⑧-1 全灭 ⇒ 重置
		{
			const { w, close, sleep, settle, uncaught } = await boot({ story: slug, random: 0.9 });
			try {
				w.Game.Rules.rng.set((lo, hi) => (hi === 20 ? 3 : 1));   // 判定失败；`gearWear` 的 d(2)→1
				w.eval(`(function(){const pc=SugarCube.State.variables.pc;
					pc.hp=1; pc.max_hp=20; pc.inv["干粮"]=true; pc.inv["钥匙"]=true; pc.gearHp={旧剑:1};
					pc.ev.cave_step=3; pc.ev.cave_echo=true; pc.gear=["旧剑","火把"];})()`);
				const landing = await trapClick(w, { settle, sleep });
				const pc = w.SugarCube.State.variables.pc;
				const obs = {
					landing,
					hp: pc.hp,
					inv: Object.keys(pc.inv ?? {}),
					gearHp: Object.keys(pc.gearHp ?? {}).length,
					statuses: Object.keys(pc.statuses ?? {}).length,
					note: pc.ev.cave_echo === true,
					at: null, bornStep: null,
				};
				const wake = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.includes('睁眼'));
				let born = null;
				if (wake) { wake.click(); await settle(); await sleep(220); obs.at = w.SugarCube.State.passage; born = Object.keys(w.SugarCube.State.variables.pc.inv ?? {}); obs.bornStep = w.SugarCube.State.variables.pc.ev.cave_step; }
				const fails = judgeReset({ landing: 20, obs, born }).concat(uncaught.length ? [{ code: 'reset-uncaught', msg: `未捕获报错：${String(uncaught[0]).split('\n')[0].slice(0, 100)}` }] : []);
				problems.push(...fails.map((f) => ({ ...f, slug })));
				console.log(`  ${fails.length ? '✗' : '✓'} ${slug} ⑧ 全灭⇒重置：落地「${obs.landing}」· hp ${obs.hp} · inv ${obs.inv.length} 件 · 耐久表 ${obs.gearHp} · 异常 ${obs.statuses} · 线索保留 ${obs.note} · 回「${obs.at}」· 步数 ${obs.bornStep}`);
				for (const f of fails) console.log(`      ✗ ${f.msg}`);
			} catch (e) { problems.push({ code: 'reset', slug, msg: `全灭重置跑不完：${e.message}` }); } finally { close(); }
		}
		// ⑧-2 单步失败（未全灭）⇒ **不终止**：带伤继续到下一段
		{
			const { w, close, sleep, settle } = await boot({ story: slug, random: 0.9 });
			try {
				w.Game.Rules.rng.set((lo, hi) => (hi === 20 ? 3 : 1));
				w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.hp=20;pc.max_hp=20;pc.gear=["旧剑","火把"];})()');
				const landing = await trapClick(w, { settle, sleep });
				const pc = w.SugarCube.State.variables.pc;
				const ok = landing === '岔口' && pc.hp < 20 && pc.hp > 0;
				problems.push(...(ok ? [] : [{ code: 'reset-step-fail', slug, msg: `单步失败应当**带伤继续**（落在「${landing}」，hp ${pc.hp}）——已定 ⑧：仅全灭才回出生点` }]));
				console.log(`  ${ok ? '✓' : '✗'} ${slug} ⑧ 单步失败不终止：落地「${landing}」· hp 20→${pc.hp}`);
			} catch (e) { problems.push({ code: 'reset', slug, msg: `单步失败路跑不完：${e.message}` }); } finally { close(); }
		}
	}

	// ── 判据 ⑨：宝箱四路径（`#491` 判据 3／已定 ③）——判定 · 道具降难（−3）· 钥匙（不起判定）· 径直通过（无惩罚） ──
	{
		const slug = 'hollow-cave';
		const runChest = async ({ label, preset = () => {}, rng = {}, click, expectDc, path }) => {
			const { w, close, sleep, settle } = await boot({ story: slug, random: 0.9 });
			try {
				// `机制·chest`：`d(3)` 选机关（1⇒锁扣）· `d(2)` 定稀有度（2⇒普通 DC12）· `d(20)` 判定骰
				w.Game.Rules.rng.set((lo, hi) => rng[hi] ?? 1);
				preset(w);
				w.SugarCube.Engine.play('路·1b');                 // 宝箱实例（第 1 段）
				await settle(); await sleep(220);
				const before = (() => { const v = w.SugarCube.State.variables; return { inv: Object.keys(v.pc.inv ?? {}).length ? { ...v.pc.inv } : {}, check: v.last_check ?? null, hp: v.pc.hp }; })();
				const anchors = [...w.document.querySelectorAll('#passages a.link-internal')];
				const target = anchors.find((a) => a.textContent.replace(/\s+/g, '').includes(click));
				if (!target) {
					problems.push({ code: 'chest', slug, msg: `${label}：找不到链接「${click}」（可选：${anchors.map((a) => a.textContent.replace(/\s+/g, '')).join(' / ')}）` });
					return;
				}
				target.click();
				await settle(); await sleep(260);
				const vars = w.SugarCube.State.variables;
				const after = { inv: { ...vars.pc.inv }, check: vars.last_check ?? null, hp: vars.pc.hp, expectDc };
				const landed = w.SugarCube.State.passage;
				const fails = judgeChestPath({ path, before, after, landed });
				problems.push(...fails.map((f) => ({ ...f, slug })));
				console.log(`  ${fails.length ? '✗' : '✓'} ${slug} ⑨ ${label}：落地「${landed}」· 干粮 ${!!after.inv['干粮']} · DC ${after.check?.dc ?? '—'}${expectDc != null ? `(期望 ${expectDc})` : ''} · hp ${before.hp}→${after.hp}`);
				for (const f of fails) console.log(`      ✗ ${f.msg}`);
			} catch (e) { problems.push({ code: 'chest', slug, msg: `${label} 跑不完：${e.message}` }); } finally { close(); }
		};

		await runChest({ label: '① 判定路径（徒手·普通 DC12）', path: '判定', rng: { 3: 1, 2: 2, 20: 19 }, click: '徒手解它', expectDc: 12 });
		await runChest({ label: '② 通用道具降难（撬棍·DC9＝12−3）', path: '道具', rng: { 3: 1, 2: 2, 20: 19 }, click: '撬它', expectDc: 9,
			preset: (w) => w.eval('SugarCube.State.variables.pc.inv["撬棍"]=true') });
		await runChest({ label: '③ 判定路径（徒手·珍贵 DC15）', path: '判定', rng: { 3: 1, 2: 1, 20: 19 }, click: '徒手解它', expectDc: 15 });
		await runChest({ label: '④ 通用道具降难（珍贵×撬棍·DC12＝15−3）', path: '道具', rng: { 3: 1, 2: 1, 20: 19 }, click: '撬它', expectDc: 12,
			preset: (w) => w.eval('SugarCube.State.variables.pc.inv["撬棍"]=true') });
		await runChest({ label: '⑤ 钥匙降为 0（不起判定）', path: '钥匙', rng: { 3: 1, 2: 2, 20: 19 }, click: '锈钥匙',
			preset: (w) => w.eval('SugarCube.State.variables.pc.inv["钥匙"]=true') });
		await runChest({ label: '⑥ 径直通过（无判定·无惩罚）', path: '跳过', rng: { 3: 1, 2: 2, 20: 19 }, click: '径直走过去' });
	}

	// ── 判据 ⑩：调试开关（`#491` 判据 10／已定 ⑩）——只 URL 参数 · 默认零影响 · **不进玩家 UI** ──
	{
		const slug = 'hollow-cave';
		const playOnce = async (url, { pool = false } = {}) => {
			const { w, close, sleep, settle } = await boot({ story: slug, random: 0.9, url });
			try {
				w.SugarCube.Engine.play('路·1b');                 // 宝箱实例（骰面与机关都由 rng 决定）
				await settle(); await sleep(200);
				const text = w.document.querySelector('#passages').textContent.replace(/\s+/g, ' ');
				const ui = (w.document.querySelector('#ui-bar')?.textContent ?? '').replace(/\s+/g, ' ');
				const a = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.replace(/\s+/g, '').includes('徒手'));
				a?.click(); await settle(); await sleep(220);
				return { text, ui, check: w.SugarCube.State.variables.last_check ?? null, links: [...w.document.querySelectorAll('#passages a.link-internal')].map((x) => x.textContent.replace(/\s+/g, '')) };
			} finally { close(); }
		};
		// ⑩-1 同 seed 两次 ⇒ 渲染文本与骰面**逐字节一致**（复算口径）
		{
			const a = await playOnce('http://localhost/?seed=1234');
			const b = await playOnce('http://localhost/?seed=1234');
			const same = a.text === b.text && JSON.stringify(a.check) === JSON.stringify(b.check);
			console.log(`  ${same ? '✓' : '✗'} ${slug} ⑩ ?seed=1234 两次：正文与骰面逐字节一致（roll=${a.check?.roll ?? '—'}）`);
			if (!same) problems.push({ code: 'debug-seed', slug, msg: `?seed=1234 两次结果不同（正文或骰面）——调试开关没有真的固定随机源` });
		}
		// ⑩-2 不同 seed ⇒ 至少一处不同（防"种子没接上"）
		{
			const r = [];
			for (const s of [1, 2, 3, 4, 5, 6]) r.push((await playOnce(`http://localhost/?seed=${s}`)).check?.roll ?? null);
			const distinct = new Set(r.filter((x) => x != null)).size;
			const ok = r.every((x) => x != null) && distinct >= 2;
			console.log(`  ${ok ? '✓' : '✗'} ${slug} ⑩ 不同 seed ⇒ 骰面有差异（6 个种子得到 ${distinct} 种骰面：${r.join('/')}）`);
			if (!ok) problems.push({ code: 'debug-seed-b', slug, msg: `不同 seed 得到相同骰面（${r.join('/')}）——种子没接到 rng 上` });
		}
		// ⑩-3 `?pool=` 只出指定类型（放宽"三选一"是有意的：调试开关的意图就是"只让我要的那类出现"）
		{
			const { w, close, sleep, settle } = await boot({ story: slug, random: 0.9, url: 'http://localhost/?seed=7&pool=traveller' });
			try {
				// 第 1 段的三个选项里**没有**旅人 ⇒ 先推到第 2 段（2a/2b/2c，其中 2c＝旅人）再验过滤
				w.eval('SugarCube.State.variables.pc.ev.cave_step = 1');
				w.SugarCube.Engine.play('岔口');                  // 三选一那一屏
				await settle(); await sleep(200);
				const links = [...w.document.querySelectorAll('#passages a.link-internal')].map((x) => x.textContent.replace(/\s+/g, ''));
				const hints = { traveller: ['石缝里卡着一小块布', '前面有火光，在动'] };
				const onlyWanted = links.length >= 1 && links.every((l) => hints.traveller.some((h) => l.includes(h)));
				console.log(`  ${onlyWanted ? '✓' : '✗'} ${slug} ⑩ ?pool=traveller：岔口只出旅人路（${links.join(' / ') || '（无）'}）`);
				if (!onlyWanted) problems.push({ code: 'debug-pool', slug, msg: `?pool=traveller 时岔口出现了非旅人路：${links.join(' / ')}` });
			} finally { close(); }
		}
		// ⑩-4 **不进玩家 UI**：带参数 vs 不带参数，玩家可见文本（正文 ＋ 侧栏）一致
		{
			const plain = await playOnce('http://localhost/');
			const withDbg = await playOnce('http://localhost/?seed=1234&pool=chest,shortFight,trap,cave,longFight');
			const sameText = plain.ui === withDbg.ui;
			console.log(`  ${sameText ? '✓' : '✗'} ${slug} ⑩ 开关不进玩家 UI（侧栏文本带/不带参数一致）`);
			if (!sameText) problems.push({ code: 'debug-ui', slug, msg: '调试开关改变了侧栏（玩家可见）文本 ⇒ 它进了玩家 UI' });
		}
	}

	if (problems.length) {
		console.error(`\n✗ 逐故事运行时契约门未通过 ${problems.length} 项：`);
		for (const p of problems) console.error(`  ✗ ${p.msg}`);
		process.exit(1);
	}
	console.log('\n✔ 逐故事运行时契约门通过（面存在 · 位点能判 · 笔记可用 · 侧栏可用 · 机制真落 · 旅人面闭环 · 五种洞窟效果 · 失败重置 · 宝箱四路径 · 调试开关）');
	process.exit(0);   // jsdom 的视口轮询会把事件循环吊住（boot.mjs 的注释）⇒ 自己收场
};

await main();
