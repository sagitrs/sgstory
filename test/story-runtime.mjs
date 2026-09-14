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
import { scopedFiles } from '../scripts/module-order.mjs';
import { storySlugs, readStory, ROOT } from '../scripts/dist-paths.mjs';
import { boot } from './boot.mjs';

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

		if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
		console.log('\n✔ 自证通过（面收集 × 缺失判定 × 笔记登记 × 侧栏判据 × 真机路判据 正反例）');
		process.exit(0);
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

	if (problems.length) {
		console.error(`\n✗ 逐故事运行时契约门未通过 ${problems.length} 项：`);
		for (const p of problems) console.error(`  ✗ ${p.msg}`);
		process.exit(1);
	}
	console.log('\n✔ 逐故事运行时契约门通过（面存在 · 位点能判 · 笔记可用 · 侧栏可用 · 机制真落 · 旅人面闭环）');
	process.exit(0);   // jsdom 的视口轮询会把事件循环吊住（boot.mjs 的注释）⇒ 自己收场
};

await main();
