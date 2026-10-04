/* L0 宿主适配 · **叙事节奏（B8 最小形）**（`sgstory#1977` · 0.0.2 rider）
 *
 * 契约/先例：本包是全仓**唯一允许出现宿主符号**的层（`00-init.js` 头注 · 架构档 L0）。
 * 本档只做票面的**最小形**：三个宏 ＋ 档位 ＋ 一处自动切档；✗ 不动既有行为（`babel` 未引用 ⇒ 零风险）。
 *
 * ## 宿主真面（按码读到的，✗ 凭记忆）
 *   · 事件面：`RPG.events.emit(名, 载荷)` ／ `RPG.events.on(名, 处理器)`（`40-battle.js:44` 等在用）。
 *   · 战斗事件**只有四个**：`battle:turnStart`／`turnEnd`／`turn`／`end`（`40-battle.js:44/52/72/438`）
 *     —— **没有** `battle:start` ⇒ 「进战斗自动切 combat 档」按领队**裁（甲）**：**订阅既有的
 *     `battle:turnStart`**（首回合即战斗起点），✗ 不新增 emit、✗ 不动 `40-battle.js`。
 *   · 本档装宏时不直写 `#passages`，输出一律经 `RPG.perform`（内核既有缓冲路，`20-render.js` 同旨）。
 *
 * ## 最小形**明说的边界**（✗ 免得读者当漏）
 *   · 档位**只进不出**：战斗结束**不回退**到进战前的档（全量的分档/回退留**后续版本**）。
 *   · `<<wait>>` 与 `<<type>>`/`<<fade>>` 的**时序**只到「发事件 ＋ 给出名义毫秒」这一步；
 *     真正把延迟落进宿主显示队列属于**后续版本**的全量（本档不假装已做）。
 */
(() => {
	const 档表 = Object.freeze({ walk: 1, run: 0.5, combat: 0.25 });   // 延迟系数（越小越快）
	const 基准毫秒 = 400;
	let 当前档 = 'walk';

	const 合法档 = (名) => Object.prototype.hasOwnProperty.call(档表, 名);
	const 发档事件 = (名, 来源) => {
		当前档 = 名;
		RPG.events?.emit?.('pace:set', { 档: 名, 系数: 档表[名], 来源 });
		return 名;
	};
	/** 按当前档折算名义延迟（毫秒）。 */
	const 名义毫秒 = (基准 = 基准毫秒) => Math.round(基准 * 档表[当前档]);

	/** 装宏（✗ 无宿主 ⇒ 静默跳过，同 `install` 族；返回是否装上）。 */
	const 装 = () => {
		const M = globalThis.Macro;
		if (M?.add == null) return false;
		/* `<<pace walk|run|combat>>` —— 设档 ＋ 发档位事件；非法档**具名拒绝**（✗ 静默）。 */
		M.add('pace', {
			handler() {
				const 名 = String(this.args[0] ?? '').trim();
				if (!合法档(名)) {
					throw new Error(`[pace] 未知档位「${名}」—— 合法档：${Object.keys(档表).join('／')}`);
				}
				发档事件(名, 'macro');
			},
		});
		/* `<<wait>>` ／ `<<wait 500>>` —— 按当前档给名义毫秒并报出来（✗ 本档不排宿主队列）。 */
		M.add('wait', {
			handler() {
				const 给 = Number(this.args[0]);
				const ms = Number.isFinite(给) && 给 >= 0 ? Math.round(给) : 名义毫秒();
				RPG.events?.emit?.('pace:wait', { 档: 当前档, ms });
			},
		});
		/* `<<type "…">>` —— 逐字登场：最小形给**每字名义毫秒**（✗ 不排队列）。 */
		M.add('type', {
			handler() {
				const 文 = this.args.full ?? this.args.join(' ');
				RPG.events?.emit?.('pace:type', { 档: 当前档, 每字ms: Math.round(名义毫秒() / 20), 文本: String(文) });
				RPG.perform?.(String(文));
			},
		});
		/* `<<fade "…">>` —— 淡入：最小形给名义时长（✗ 不排队列）。 */
		M.add('fade', {
			handler() {
				const 文 = this.args.full ?? this.args.join(' ');
				RPG.events?.emit?.('pace:fade', { 档: 当前档, ms: 名义毫秒() });
				RPG.perform?.(String(文));
			},
		});
		return true;
	};

	/* 自动切档：**订阅既有事件**（裁甲），战斗首回合 ⇒ combat（✗ 不回退，见头注）。 */
	RPG.events?.on?.('battle:turnStart', () => {
		if (当前档 !== 'combat') 发档事件('combat', 'battle');
	});

	/* ★暴露面用**普通导出**，✗ 注册成端口：`RPG.defPort`／`portOf` 只认契约表里已有的键
	 *   （`persist`／`render`／`lifecycle`，见 `src/core/ports/index.js`），未定义的键会**抛**
	 *   ⇒ 本档是宿主层的**附加能力**，不是内核认的契约端口（判据直取它，见 `tests/unit/host/pace.test.js`）。 */
	RPG.pace = Object.freeze({
		装了: 装,
		当前档: () => 当前档,
		名义毫秒,
		设档: (名) => (合法档(名) ? 发档事件(名, 'api') : null),
		合法档,
	});
	装();                                   // 无宿主时静默跳过
})();
