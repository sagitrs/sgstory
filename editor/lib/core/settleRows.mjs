// 洞窟「副作用分支必须有落点文案」判据的**纯那一半** ✓（`#746` 的故事门 ＋ 编辑器页内**同判** ⇒ 只许一处定义 ✗）
//
// 为什么上移（`#215` 报备 `18504699` ✓）：故事门与页内**必须用同一份判定** ✗ ——
//   门侧证据 ＝ `stories/hollow-cave/gates/settle.mjs`（`settleProblems(src, site)` ✓）；
//   页内输入 ＝ `pkg.passages`（车道 E · A 片 ✓ `{name, text, file}` ✓，`text` ＝ **去注释源文** ✓，
//   与 `scripts/audit/context.mjs` 的 `passageSrc` **同口径** ✓）。
//   ⇒ 上移后**两个消费者**（门 ✓ ＋ 页内 ✓）用同一份 ⇒ 不是投机件 ✓（`#794` 只许"真有第二个消费者时才建" ✗）。
//
// ⚠️ **io 那一半留在门里** ✗（与 `#877` 同款 ✓，同 `core/text.mjs` 的分段搬迁 ✓）：
//   门里 `run(ctx)` 拿 `ctx.passageSrc`（宿主编译期索引 ✓）；本件**零 import** ✓、**浏览器安全** ✓（不碰 fs／进程／时钟 ✗）。
//
// 判据（一条 ✓）：**只要一个 `<<link>>` 体里有副作用**（伤害／异常／给物／金币／耐久 ✓），
//   就必须同时有**落点文案**（`$pc.ev.settle` 或 `<<caveSay>>`／`<<sceneFeedback>>` ✓）。
//
// 口径（避免假红 ✓）：
//   · **纯导航** link（无副作用）⇒ 不要求（走到哪算哪，没有"挨了什么"要讲 ✓）；
//   · 副作用宏清单住 `SIDE_EFFECT_RE` ✓ —— 新增副作用宏必须**显式登记** ✗
//     （否则门看不见它，与 `test/fight-compat.mjs` 的"入口家族"同一个教训：家族不全 ⇒ 门假绿 ✗）；
//   · 只判**故事门作用域**（`stories/<slug>/**` ✓）⇒ 对未启用该协议的故事零影响 ✓。

/** 副作用宏／写点（新增一类要登记在这里——门看不见的宏＝假绿）。 */
export const SIDE_EFFECT_RE = /<<(damage|applyStatus|give|note)\b|\$pc\.gold\s*to\s*\$pc\.gold\s*\+|\$pc\.gearHp\s*=/;

/** 落点文案（＝"玩家能在落点屏上读到这次副作用"的证据）。 */
export const SETTLE_RE = /ev\.settle|ev\.last_result|caveSay|caveEffect|sceneFeedback/;

/** **会离开本段**吗？（`<<caveNext>>`／`<<goto "别的段">>` ✓）——
 *  口径：留在原地的分支（`<<goto \`passage()\`>>` ✓）它的 `<<print>>` 玩家**当场就读得到** ⇒ 不要求搬运 ✓；
 *  只有**会离开**的分支才需要把句子写进 `settle` ✓（否则被导航冲掉 —— 这正是 `#746` 的实测形态 ✓）。 */
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
