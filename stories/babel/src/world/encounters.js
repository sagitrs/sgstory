/* 巴别之井 · 试玩版 —— 装配桥（遭遇 / 采集 / 单向门）
 *
 * 本文件是**故事侧的薄桥**：只做「谁调用谁」与**读数记账**，判定数学一律在被调方（`src/**`）。
 *   · 遭遇与掉落：`#1784`（B2）的 `RPG.rollEncounter` / `RPG.rollLoot`（层表驱动，抽 1 组）
 *   · 战斗：`RPG.Battle`（core）—— 战败者的随身物由 `Battle.execute()` 内**自动** `RPG.loot`
 *   · 死亡回起点：`RPG.respawn`（core，#1772）—— 掉落 ＋ **清档（含 persistent 创伤）** ＋ 回起点层
 *   · 采集：`RPG.gather`（core，#1776）｜建造/收获：包内的 `RPG.act(…, 'build')` / `RPG.harvest`
 *
 * ⚠ **依赖声明（软依赖）**：遭遇/掉落面来自 `#1784`（`src/core/65-encounters.js`）。
 *   该面未接线时本文件**显式报出**并拒绝玩下去（✗ 静默降级 —— 静默降级会让「遭遇永不发生」
 *   看起来像「这一层本来就没怪」，与 `#1766` 的「静默不触发」同族）。
 */

const DND3 = setup.DND3;
const R = setup.RPG;

const run = () => (State.variables.babelRun ??= { deaths: 0, kills: 0, gathered: 0, harvests: 0, traumasSeen: [], deepest: 'L1' });

/**
 * 取一个**新鲜的**怪物实例。
 *
 * 注册面（`RPG.characters`）里的是**单例**（`defCharacter` 的返回值），它的 `hp` 会被战斗改写 ⇒
 *   直接拿单例打第二场，会得到「已经死了的怪」（旧宅 e2e 保留了这个形）。
 * 副本走 `Character.revive(JSON.parse(JSON.stringify(proto.toJSON())))` —— 与**存档往返同一条通路**，
 *   ✗ 手搓字段（手搓会漏字段，且与 `#1758` 的 revive 钩子面脱钩）。
 *
 * `elite`（遭遇表的既有标记，`#1748` 称「只标不消费」）在本试玩版的消费方式是**可见命名**
 *   （「精英·獾」）：**house rule（非 SRD）** —— 不给它加数值，理由：① SRD 3.5 无「精英动物」模板
 *   （`Monsters/Monsters - Animals.md` 的 Badger 条目无此形），② 无源的数值强化会污染段内定标
 *   （`SPAN1_SCALING` 的 crBand 是按 CR 算的），③ 遵 `#1706` ⇒ ✗ 用随机强化冒充。
 */
const fresh = (ref, elite) => {
	const proto = R.characters.get(ref);
	if (!proto) throw new Error(`[babel] 遭遇表引用了未注册的角色 id「${ref}」`);
	const copy = R.Character.revive(JSON.parse(JSON.stringify(proto.toJSON())));
	if (elite) copy.name = `精英·${copy.name}`;
	return copy;
};

/**
 * 当前所在地点所属的层 id（`L10-camp` ⇒ `L10`；判不出 ⇒ null）。
 *
 * 权威读法是 `#1784` 的 `RPG.layerOfLocation`（**最长前缀匹配**，因为整备区的地点 id 形如 `L10-camp`）。
 * 该面缺席时用**本图的命名约定**兜底：L1–L9 的地点 id **就是**层 id（`/^L\d+$/`）。
 * ⚠ 兜底**不覆盖**整备区（`L10-camp` 判不出 ⇒ 采集/遭遇在 L10 自然不发生，与语义一致）——
 *   故两种读法在「哪些地点有遭遇」上**同结论**，不引入第二套层语义。
 */
setup.BABEL.layerOf = () => {
	const id = setup.BABEL.map.current;
	if (!id) return null;
	if (typeof R.layerOfLocation === 'function') return R.layerOfLocation(id)?.id ?? null;
	return /^L\d+$/.test(id) ? id : null;
};
/** 该层的采集点 id */
setup.BABEL.gatherOf = (layerId) => setup.BABEL.gatherPoints?.[layerId] ?? null;

/* ---------- 采集（#1776）----------
 * 入口只有一条：`RPG.gather(pointId)`（缺省取玩家背包语义）。本桥只记读数。
 */
setup.BABEL.gather = () => {
	const point = setup.BABEL.gatherOf(setup.BABEL.layerOf());
	if (!point) return R.perform('这里没有可采的东西。');
	const res = R.gather(point);
	if (res && res.status === 'applied') run().gathered += 1;
	return res;
};

/* ---------- 遭遇 + 战斗（#1784 + core）----------
 * 一战一抽：抽 1 组遭遇（`count: 1`）⇒ 副本实例 ⇒ 交互战（8 回合上限）⇒
 *   胜 ⇒ 掉落表抽一次并进背包｜败 ⇒ `RPG.respawn`（回 L1、掉落、清创伤）并跳「死亡回溯」段落。
 */
/**
 * @param opts.interactive `true`（缺省）= 玩家亲自操作（`Battle` 的交互通路，回合内等玩家选动作）；
 *   `false` = 全自动通路。**自动通路是给无头自检用的**（交互通路要等 UI 选择 ⇒ 无头环境会挂起，
 *   见 `stories/babel/verify.mjs` 的用法）；玩家路径一律用缺省值。
 */
setup.BABEL.fight = async ({ interactive = true } = {}) => {
	/* ★**早退出口**（`#1877` P1-6）：本段原靠一条静态链 `[[打完，继续探索|探索]]` 兜底，
	 *   而静态链在**段落渲染时**即出现（战斗根本还没打）⇒ 玩家以为已打完了。
	 *   现改为：**早退发生时**才把出口落页底（与主出口共用下面同一个 `choice` 通道 —— `#1856`）。
	 *   ⚠ `RPG.perform` 返回 `this`（**非 thenable**）⇒ 不能用 `.then()` 链，得用 `bail()` 包一层。
	 *   ⚠ 仍必须门控 `interactive`（无头自检里没人可点，`await choice` 会**永久挂起**）。 */
	const exit = () => {
		if (!interactive) return undefined;
		return DND3.Player.choice([{ text: '继续探索', value: '探索' }]).then((v) => SugarCube.Engine.play(v));
	};
	const bail = (msg) => { R.perform(msg); return exit(); };
	const layer = setup.BABEL.layerOf();
	if (!layer) return bail('这里没有可遭遇的东西。');
	if (typeof R.rollEncounter !== 'function' || typeof R.rollLoot !== 'function') {
		/* ★`#1863` 两层拆：**开发者信号走 console**（票号＋源码路径＋API 名 —— 那是写给接线者的）。
		 *   玩家层**仍出声**（✗ 静默 —— 静默会让「遭遇永不发生」被读成「这层本来就没怪」，见文件头 `#1784` 惯例）；
		 *   白话保留「**本该有东西、可这里没有**」的异常感，✗ 删该信息。 */
		console.warn('[BABEL] 装配缺口：遭遇面未接线 —— 需要 `#1784`（`src/core/65-encounters.js`）的 `RPG.rollEncounter`／`RPG.rollLoot`。');
		return bail('这一层静得出奇——按理该有东西挡路的。');
	}
	const rolled = R.rollEncounter(layer, { count: 1 });
	if (rolled.length === 0) return bail('这一层今天什么都没有挡路。');
	const foes = rolled.map((e) => fresh(e.ref, e.elite));
	R.perform(`挡在前面的是：${foes.map((f) => f.name).join('、')}。`);

	await new R.Battle(8, [DND3.Player], foes, interactive).execute();

	if (foes.every((f) => f.isDown)) {
		run().kills += foes.length;
		const loot = R.rollLoot(layer);
		for (const l of loot) R.give(l.id, l.n);
		if (loot.length > 0) {
			R.perform(`战利品：${loot.map((l) => `${R.items.has(l.id) ? R.createItem(l.id).name : l.id}×${l.n}`).join('、')}。`);
		}
	}

	if (DND3.Player.isDown) {
		/* 死亡回起点层：掉落 ＋ 清档（**含 persistent 创伤** —— `#1760` 裁定⑤）＋ `moveTo(起点层)`。
		 * `respawn` 的起点层来自**层表注册面**（`LAYER_META_SPAN1` 里 `start: true` 的 L1）。 */
		const res = R.respawn(DND3.Player, { map: setup.BABEL.map });
		run().deaths += 1;
		/* `#1798` B4：阵亡是**结论行** ⇒ 走 `death` 通道（`key`），「仅关键」档下仍进正文。 */
		R.perform(`你死在了第 ${layer.replace('L', '')} 层。清点损失：掉落 ${res.dropped} 件、清除 ${res.cleared} 项效果。`, { channel: 'death' });
		SugarCube.Engine.play('死亡回溯');
		return;
	}

	/* ── 出口：**必须落在页底**（`#1856` 复现；`#1877` P1-6 把「静态兜底」也收归此处）──────────
	 * ★症状（操作者实测）：僵持收场后「没有任何按钮」⇒ 以为软锁，只能刷新。
	 * ★根因（本席 jsdom 实测，✗ 推断）：本仓的约定是「**输出落页底**」——
	 *   `perform` 与 `choice` 都把内容插在 `.statusbar` **之前**（`01-perform.js:23`／`02-choice.js:36`），
	 *   而段落里的静态链接渲染在**段落顶部**。战斗中玩家被**页底的按钮与日志**钉住
	 *   （每回合都要点页底按钮，且每回合又往页底追加 4–6 行）⇒ 战斗一结束按钮消失，
	 *   唯一的出口在**上方 30–58 个元素之外** ⇒ 玩家看不到。
	 *   ★实测读数：僵持 ⇒ 出口在子元素 index 3/62（其后 58 个）；胜 ⇒ 3/34（其后 30 个）；
	 *     SugarCube 仅在**段落显示时** `window.scroll(0,0)`，战斗中**再无**滚动 ⇒ 视点不回顶部。
	 * ★修法：让出口走**与其它输出同一条**通道（`choice` 自动落页底）⇒ 出口出现在玩家正在看的地方。
	 * ⚠ 仅**交互**通路给出口：无头自检（`verify.mjs` 的 `{ interactive: false }`）里没人可点，
	 *   `await choice(...)` 会**永久挂起** ⇒ 必须门控（本席按此实现，✗ 无条件 await）。 */
	if (interactive) {
		const v = await DND3.Player.choice([{ text: '继续探索', value: '探索' }]);
		SugarCube.Engine.play(v);
	}
};

/**
 * 读数：把玩家**当前持有**的创伤记进「本局见过」的集合。
 *
 * 为什么要这个：创伤没有「被施加」事件（施加是 `c.add(id)` 的通用路径）⇒ 从**持有态**反推
 *   是本仓可用的最省做法。代价：若某条创伤在两次调用之间被施加又解除，会计不到 —— 试玩版的
 *   读数不需要那个精度（已在 README 的「已知面」里写明）。
 */
setup.BABEL.noteTraumas = () => {
	const seen = run().traumasSeen;
	for (const id of Object.keys(DND3.Traumas)) {
		if (DND3.Player.contains(id) && !seen.includes(id)) seen.push(id);
	}
	return seen;
};
