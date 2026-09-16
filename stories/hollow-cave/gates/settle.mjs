// ⓪ad 洞窟「副作用分支必须有落点文案」门（`#746`）——**故事门**
//
// 为什么需要它（操作者：「洞窟的**文字反馈**最重要」＋ guest 的逐击抓屏实测）：
//   留屏协议（`$pc.ev.settle` ＋ `<<caveNext>>` 把它搬到**落点**渲染）**已经存在且正确** ——
//   问题只是**覆盖不全**：成功/产出路径多半接了 `settle` ✓，**失败/惩罚路径普遍没接**
//   （把句子直接 `<<print>>` 进 `<<link>>` 体 ⇒ 随后的导航把它冲掉 ✗）⇒ 玩家"挨了打看不到自己挨了什么"。
//   原文级例：徒手开箱失败（`机制·chest`）与陷阱失败（`机制·trap`）⇒ 落点屏上**空白**。
//
// 判据（一条）：**只要一个 `<<link>>` 体里有副作用**（伤害／异常／给物／金币／耐久），
//   就必须同时有**落点文案**（`$pc.ev.settle` 或 `<<caveSay>>`／`<<sceneFeedback>>`）。
//
// 口径（避免假红）：
//   · **纯导航** link（无副作用）⇒ 不要求（走到哪算哪，没有"挨了什么"要讲）；
//   · 副作用宏清单住 `SIDE_EFFECT_RE` —— 新增副作用宏必须**显式登记**（否则门看不见它，
//     与 `test/fight-compat.mjs` 的"入口家族"同一个教训：家族不全 ⇒ 门假绿）；
//   · 只判**故事门作用域**（`stories/<slug>/**`）⇒ 对未启用该协议的故事零影响。
//
// 自证：`run` 里跑 5 条（正例 3 ＋ 反例 2）。

export const flag = 'settle';
export const flags = ['settle'];

/** 副作用宏／写点（新增一类要登记在这里——门看不见的宏＝假绿）。 */
export const SIDE_EFFECT_RE = /<<(damage|applyStatus|give|note)\b|\$pc\.gold\s*to\s*\$pc\.gold\s*\+|\$pc\.gearHp\s*=/;

/** 落点文案（＝"玩家能在落点屏上读到这次副作用"的证据）。 */
export const SETTLE_RE = /ev\.settle|ev\.last_result|caveSay|caveEffect|sceneFeedback/;

/** **会离开本段**吗？（`<<caveNext>>`／`<<goto "别的段">>`）——
 *  口径：留在原地的分支（`<<goto \`passage()\`>>`）它的 `<<print>>` 玩家**当场就读得到** ⇒ 不要求搬运；
 *  只有**会离开**的分支才需要把句子写进 `settle`（否则被导航冲掉 —— 这正是 `#746` 的实测形态）。 */
export const LEAVES_RE = /<<caveNext>>|<<goto\s+(?!`passage\(\)`)/;

/** 纯函数：切出 `<<link …>>…<</link>>` 体（按宏深度配对，支持嵌套）。 */
export const linkBodies = (src) => {
	const out = [];
	const re = /<<link\b[^>]*>>|<<\/link>>/g;
	let m, depth = 0, start = -1;
	while ((m = re.exec(src ?? ''))) {
		if (m[0].startsWith('<<link')) { if (depth === 0) start = m.index; depth += 1; continue; }
		depth -= 1;
		if (depth === 0 && start >= 0) { out.push({ text: src.slice(start, m.index + m[0].length), at: start }); start = -1; }
	}
	return out;
};

/** 纯函数：判定 —— 有副作用却没落点文案的 `<<link>>` 体 ⇒ 每条一报。 */
export const settleProblems = (src, site = '') => {
	const out = [];
	for (const b of linkBodies(src)) {
		if (!SIDE_EFFECT_RE.test(b.text)) continue;             // 纯导航：不管
		if (!LEAVES_RE.test(b.text)) continue;                  // 留在原地：打印当场可见 ⇒ 不要求搬运
		if (SETTLE_RE.test(b.text)) continue;                   // 有落点文案 ✓
		out.push({
			site,
			why: '这条分支有**副作用**（伤害／异常／给物／金币／耐久）却没有落点文案 ⇒ 玩家看不到自己挨了什么、拿到了什么',
			snippet: b.text.replace(/\s+/g, ' ').slice(0, 110),
		});
	}
	return out;
};

export const run = (ctx) => {
	const { arg, wantAll, passageSrc } = ctx;
	if (!(wantAll || arg('settle'))) return;
	console.log('\n══ ⓪ad 副作用分支必备落点文案门（`#746`）—— 挨了打必须看得见 ══');
	let bad = 0;

	// 自证（正例 3 ＋ 反例 2；正反例跑**同一份判据**）
	{
		const cases = [
			['正例：有副作用 ＋ 写了 `settle` ⇒ 不报', settleProblems('<<link "撬一下">><<damage 2>><<set $pc.ev.settle to "撬不动，手背破了。">><</link>>').length === 0],
			['正例：纯导航 link（无副作用）⇒ 不报', settleProblems('<<link "继续走">><<caveNext>><</link>>').length === 0],
			['正例：`<<caveSay>>` 也算落点文案 ⇒ 不报', settleProblems('<<link "捡">><<give "干粮">><<caveSay "你捡起干粮。">><</link>>').length === 0],
			['🔴 反例：有副作用 ＋ **会离开**（`caveNext`）却没落点文案 ⇒ **报**（`#746` 的实测形态）',
				settleProblems('<<link "徒手撬">><<damage 3>><<caveNext>><</link>>').length === 1],
			['🔴 反例：嵌套 link 里的副作用 ＋ 会离开 ⇒ 报',
				settleProblems('<<link "a">><<link "b">><<give "干粮">><<caveNext>><</link>><</link>>').length >= 1],
			['边界：有副作用但**留在原地**（`goto passage()`）⇒ 不报（那句当场可见）',
				settleProblems('<<link "买">><<give "干粮">><<goto `passage()`>><</link>>').length === 0],
		];
		for (const [label, ok] of cases) {
			if (ok) console.log(`      ✓ 自证·${label}`);
			else { bad += 1; console.error(`      ✗ 自证·${label}`); }
		}
	}

	// 真跑：扫本故事全部段落
	const entries = [...(passageSrc ?? new Map()).entries()];
	if (!entries.length) { bad += 1; console.error('  ✗ 取不到段落文本（`ctx.passageSrc` 为空）——不静默判过（#557 同族）'); }
	for (const [p, src] of entries) {
		for (const prob of settleProblems(src, p)) {
			bad += 1;
			console.error(`  ✗ ${p}：${prob.why}`);
			console.error(`      · 片段：${prob.snippet}`);
		}
	}

	if (bad) {
		console.error(`\n✗ 落点文案门未通过（${bad} 项）—— 有副作用的分支必须留下**玩家能读到**的那句话：`);
		console.error('  把句子写进 `$pc.ev.settle`（或 `<<caveSay "…">>`＝打印 ＋ 累进 settle），由 `<<caveNext>>` 搬到落点。');
		process.exit(1);
	}
	console.log('✔ 落点文案门通过（有副作用的分支都带落点文案）');
};
