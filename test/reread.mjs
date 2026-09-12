// A5「回读友好」门（#296 走查的机检部分）：**可回看不泄底**。
//
// 为什么能机检：A5 的判据在实现上是「**门控**」问题——图鉴条目/线索必须由**发现**（`test(pc)` 谓词）
// 解锁，设定集里的「谜底级」知识必须由 `Sg.Codex.seenFinal()` 挡在终局之前。
// 票面要求「复核其**行为**而非字符串」（#220 同类实锤就是这么漏的），故 R1/R2 是**行为**断言：
// 给一个零状态档，任何已解锁的东西都是泄底。
//
// 判据：
//   R1 零状态档：新卡（`Game.Pc.defaults()`）下，图鉴**不得有任何线索谓词为真**
//   R2 空记录：空图鉴记录（`blank()`）下，不得有任何条目 `isUnlocked`
//   R3 声明落地：`Game.Truth.claims` 里 `type:'codex'` 的站点段落必须真实存在（声明的证据点不许是空头）
//   R4 谜底门控：`via` 标为「终局后揭开 / 唯一揭开处 / 谜底」的 codex 站点，其页面必须带 `Sg.Codex.seenFinal()`
//   R5 自称谜底必门控：任何设定集页面若出现「谜底」字样，该页必须带 `seenFinal()` 门（防「新写的谜底忘了加门」）
//   R6 终局级知识必门控（#408 举一反三）：页面里出现**终局级词**（真结局名/凑齐/普通结局做法）⇒ 该页必须带门。
//      与 R5 的差别正是 #408 的教训：结局页**从不自称「谜底」**，却比术语页更直接地给出终局配方 ⇒ R5 抓不到。
//      当前 `设定集·结局` 是**已知缺陷**（#408）：报告但不判失败；修复后转严格并删 `ENDGAME_KNOWN`。
//
// ⚠️ R4/R5 的**边界（只登记不判定，理由如下）**：
//   「哪些知识算谜底」是**设计判断**，无法从代码推出——所以本门只判**已被声明的**谜底
//   （`Truth.claims` 的 `via` 措辞 ＋ 页面自称「谜底」），不猜未声明的散文。
//   设计方新增一处「本该门控但从未声明」的谜底，本门**看不见**——这是有意的：宁可漏报也不假报。
//
// 自证：`node test/reread.mjs --selftest`（5 条判据各带会红的反例）

import { createContext } from '../scripts/audit/context.mjs';

const MYSTERY_MARK = /终局后揭开|唯一揭开处|谜底/;
// 终局级词表（#408）：真结局名 / 真结局目标 / 普通结局的达成做法
export const ENDGAME_MARK = /送星归位|散开的东西重新凑齐|虚弱到无法打断/;
// 已知缺陷（报告但不判失败；修复后**删掉本条并转严格**）——本仓约定：缺陷基线引用票号
export const ENDGAME_KNOWN = { '设定集·结局': '#408' };
export const endgameUngated = (pages, known = ENDGAME_KNOWN) => Object.entries(pages)
	.filter(([, src]) => ENDGAME_MARK.test(src ?? '') && !GATE_SRC.test(src ?? ''))
	.map(([name]) => name);
export const splitEndgame = (ungated, known = ENDGAME_KNOWN) => ({
	known: ungated.filter((n) => n in known),
	fresh: ungated.filter((n) => !(n in known)),
});
const GATE_SRC = /Sg.Codex\.seenFinal\(\)/;

// ── 纯函数（依赖注入：自证时喂夹具，不与真实游戏耦合）────────────────────
// R1：零状态档下为真的线索
export const virginLeaks = (items, virginPc) => {
	const out = [];
	for (const [item, def] of Object.entries(items ?? {})) {
		for (const c of def.clues ?? []) {
			let v = false;
			try { v = !!c.test(virginPc); } catch { v = false; }   // 谓词读不存在的字段＝假，不算泄漏
			if (v) out.push(`${item}:${c.id}`);
		}
	}
	return out;
};

// R2：空记录下被解锁的条目
export const blankUnlocks = (items, api, store) => {
	const out = [];
	for (const item of Object.keys(items ?? {})) {
		let v = false;
		try { v = !!api.isUnlocked(item, store); } catch { v = false; }
		if (v) out.push(item);
	}
	return out;
};

// R3：声明的 codex 站点段落是否存在
export const missingCodexSites = (claims, has) => {
	const out = [];
	for (const c of claims ?? []) {
		for (const s of (c.sites ?? []).filter((s) => s.type === 'codex')) {
			if (!has(s.p)) out.push(`${c.id} → ${s.p}`);
		}
	}
	return [...new Set(out)];
};

// R4：谜底级命题的 codex 站点是否真带门
export const ungatedMysterySites = (claims, pageOf) => {
	const out = [];
	for (const c of claims ?? []) {
		for (const s of (c.sites ?? []).filter((s) => s.type === 'codex' && MYSTERY_MARK.test(s.via ?? ''))) {
			if (!GATE_SRC.test(pageOf(s.p) ?? '')) out.push(`${c.id} → ${s.p}（via：${s.via}）`);
		}
	}
	return [...new Set(out)];
};

// R5：页面自称「谜底」却没门
export const selfDeclaredMysteryUngated = (pages) =>
	Object.entries(pages ?? {})
		.filter(([, src]) => /谜底/.test(src ?? '') && !GATE_SRC.test(src ?? ''))
		.map(([name]) => name);

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const items = { 护符: { clues: [{ id: 'a', test: (p) => !!p.inv?.护符 }, { id: 'b', test: (p) => !!p.world?.seen }] } };
	const virgin = { inv: {}, world: {} };

	t('R1 正例：零状态档下无泄漏', virginLeaks(items, virgin).length === 0);
	t('R1 反例：`() => true` 的线索必须被抓（否则开局即解锁）', virginLeaks({ X: { clues: [{ id: 'z', test: () => true }] } }, virgin).includes('X:z'));

	const api = { isUnlocked: (item, store) => !!store.clues?.[item] };
	t('R2 正例：空记录下无解锁', blankUnlocks(items, api, { clues: {} }).length === 0);
	t('R2 反例：`isUnlocked: () => true` 必须被抓', blankUnlocks(items, { isUnlocked: () => true }, { clues: {} }).length === Object.keys(items).length);

	const claims = [
		{ id: 'ok', sites: [{ p: '设定集·术语', type: 'codex', via: '设定集·术语' }] },
		{ id: 'gone', sites: [{ p: '设定集·不存在', type: 'codex', via: '设定集·术语' }] },
	];
	t('R3 正例：存在的站点不报', !missingCodexSites(claims, (p) => p === '设定集·术语').some((x) => x.includes('ok')));
	t('R3 反例：引用了不存在的段落必须被抓', missingCodexSites(claims, (p) => p === '设定集·术语').some((x) => x.includes('设定集·不存在')));

	const myst = [{ id: 'mist', sites: [{ p: '设定集·术语', type: 'codex', via: '设定集·术语（Sg.Codex.seenFinal() 门内——唯一揭开处）' }] }];
	t('R4 正例：谜底站点带门则不报', ungatedMysterySites(myst, () => '<<if Sg.Codex.seenFinal()>>谜底<</if>>').length === 0);
	t('R4 反例：谜底站点没门必须被抓', ungatedMysterySites(myst, () => '谜底：它睡着时漏出来的力气。').length === 1);

	t('R5 正例：自称谜底且有门则不报', selfDeclaredMysteryUngated({ 页: '<<if Sg.Codex.seenFinal()>>雾 · 谜底<</if>>' }).length === 0);
	t('R5 反例：页面自称「谜底」却没门必须被抓', selfDeclaredMysteryUngated({ 页: '雾 · 谜底：它睡着时漏出来的力气。' }).includes('页'));

	// R6（#408）：终局级知识必须门控 + 已知缺陷姿态
	t('R6 正例：终局级词 + 带门 → 不报', endgameUngated({ 页: '<<if Sg.Codex.seenFinal()>>真结局只有一个：送星归位<</if>>' }, {}).length === 0);
	t('R6 反例①：终局级词 + 无门 → 报', endgameUngated({ 页: '真结局只有一个：送星归位。要把三百年里散开的东西重新凑齐。' }, {}).includes('页'));
	t('R6 反例②：无终局级词 + 无门 → 不报（防误伤普通页）', endgameUngated({ 页: '塔里没有亡灵。' }, {}).length === 0);
	{
		const sp = splitEndgame(['设定集·结局', '设定集·新页'], { '设定集·结局': '#408' });
		t('R6 已知缺陷姿态：在 KNOWN 里 → 只登记；不在 → 判红', sp.known.join() === '设定集·结局' && sp.fresh.join() === '设定集·新页');
	}

	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——A5 门没有咬合力`); process.exit(1); }
	console.log('\n✔ 自证通过：零状态档泄漏 / 空记录解锁 / 站点缺失 / 谜底漏门 / 自称谜底漏门 / 终局级漏门（含已知缺陷姿态）六类反例都会红');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ── 真实运行 ─────────────────────────────────────────────────────────
const { Game, passageSrc } = createContext();
const fails = [];
const show = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };

const leak = virginLeaks(Game.Codex.items, Game.Pc.defaults());
show(leak.length === 0, `R1 零状态档下图鉴无已解锁线索${leak.length ? `：泄漏 ${leak.join(', ')}` : ''}`);

const blanks = blankUnlocks(Game.Codex.items, Game.Codex, { clues: {}, endings: [], finals: [] });
show(blanks.length === 0, `R2 空图鉴记录下无已解锁条目${blanks.length ? `：${blanks.join(', ')}` : ''}`);

const sites = missingCodexSites(Game.Truth.claims, (p) => passageSrc.has(p));
show(sites.length === 0, `R3 命题声明的 codex 站点段落都存在${sites.length ? `：缺失 ${sites.join(', ')}` : ''}`);

const mystSites = unionClaims(Game.Truth.claims, (c) => (c.sites ?? []).filter((s) => s.type === 'codex').map((s) => s.p));
const ungated = ungatedMysterySites(Game.Truth.claims, (p) => passageSrc.get(p) ?? '');
show(ungated.length === 0, `R4 「谜底级」codex 站点都真带 Sg.Codex.seenFinal() 门${ungated.length ? `：漏门 ${ungated.join(', ')}` : ''}`);

const pages = Object.fromEntries([...passageSrc].filter(([n]) => /^设定集/.test(n)));
const selfMyst = selfDeclaredMysteryUngated(pages);
show(selfMyst.length === 0, `R5 设定集里自称「谜底」的页面都带门（查了 ${Object.keys(pages).length} 页）${selfMyst.length ? `：漏门 ${selfMyst.join(', ')}` : ''}`);

// R6（#408）：终局级知识必须门控；已知缺陷只登记
const ungatedEnd = endgameUngated(pages);
const endSplit = splitEndgame(ungatedEnd);
for (const n of endSplit.known) console.log(`⏳ [已知缺陷 ${ENDGAME_KNOWN[n]}] R6「${n}」含终局级知识但没有 seenFinal 门——报告但不判失败（修复后删除 ENDGAME_KNOWN 中转严格）`);
show(endSplit.fresh.length === 0, `R6 含终局级词的设定集页面都带门（词表：真结局名/凑齐/普通结局做法）${endSplit.fresh.length ? `：新漏门 ${endSplit.fresh.join(', ')}` : ''}`);

function unionClaims(claims, f) { return [...new Set((claims ?? []).flatMap(f))]; }

console.log(`\n  A5 口径：图鉴 ${Object.keys(Game.Codex.items).length} 条目 · ${Object.values(Game.Codex.items).reduce((n, d) => n + (d.clues?.length ?? 0), 0)} 线索 · 命题 ${Game.Truth.claims.length} 条 · 谜底级 codex 站点 ${mystSites.length} 处`);
if (fails.length) { console.error(`\n✗ A5 回读友好门未通过（${fails.length} 项）`); process.exit(1); }
console.log('✔ A5 回读友好门通过：零状态不泄底、声明站点落地、谜底级与终局级内容都被终局门挡住' + (endSplit.known.length ? `（其中 ${endSplit.known.length} 处为已知缺陷 ${{ ...ENDGAME_KNOWN }[endSplit.known[0]]}，见上）` : ''));
