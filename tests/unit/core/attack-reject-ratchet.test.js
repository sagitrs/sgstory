/* `#1813` **跨包棘轮**（笔 2 末笔）：三包「拒绝点／失手点／转发件」集合须与**具名清单**一致。
 *
 * 为何要这道棘轮：本票的契约是**跨包的**——
 *   ① 攻击层在「**打不出去**」（腾不出手／没弹药）时须 `return false`；
 *   ② 攻击层在「**失手**」（攻击**已发生**、只是没中）时须**保持裸 `return;`**（`undefined` ⇒ `applied`）；
 *   ③ 各武器件的 「used()」 须**转发**攻击层的返回值（✗ 转发 ⇒ 返回值被丢弃 ⇒ ①②在 「used()」 层失效）。
 *   ⇒ 任何**新包／新武器**若只做一半，**行为面没有红灯**（返回值被丢弃，静默回到 `applied`）——
 *     所以把「三处的**集合**」本身钉住：**凡改动即须显式登记**（✗ 靠人记得同步）。
 *
 * ★判据为何按「**锚文本**」而非行号：行号随任何插删漂移；**锚是代码自己的一部分**（`perform` 文案／
 *   `ctx.hit = false` 这类语句）⇒ 漂移免疫。
 * ★为何**先剥注释**再核：注释里写 `return;`／`return false;` 是**说明**（本票自己就写了多处），
 *   ✗ 是代码 ⇒ 不剥会把说明当代码（本席落码时**真栽过一次**：刀的锚被自己的注释文本遮住，取到了注释里的位置）。
 * ★为何**两向**差集：只核「具名清单里的都在」会漏掉「**多出来的**」（新加一处裸 `return;` 而没人登记）
 *   —— `merge.md:147`「枚举 vs 实际集合」要的正是**两向都核**。
 */
(() => {
	const R = () => setup.RPG;

	/** 剥掉 `/* *​/` 块注释与 `//` 行注释（**字符串内的 `//` 不算**）。 */
	function stripComments(src) {
		let out = '', i = 0, state = 'code';   // code | line | block | sq | dq | tpl
		while (i < src.length) {
			const c = src[i], d = src[i + 1];
			if (state === 'code') {
				if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
				if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
				if (c === "'") state = 'sq';
				else if (c === '"') state = 'dq';
				else if (c === '`') state = 'tpl';
				out += c; i++; continue;
			}
			if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i++; continue; }
			if (state === 'block') { if (c === '*' && d === '/') { state = 'code'; i += 2; } else i++; continue; }
			/* 字符串态：原样保留（含其中的 `//`／`/*`）；`\` 转义跳过下一字符 */
			if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
			if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code';
			out += c; i++;
		}
		return out;
	}

	const 攻击层 = {
		'dnd3': 'src/dnd/dnd3/core/combat.js',
		'dnd-5e': 'src/dnd/dnd-5e/core/combat.js',
		'd20m': 'src/dnd/d20m/core/combat.js',
	};
	/* ★**独立具名清单**（✗ 从被测量对象自身派生 —— 那样删掉一条也照样绿）。 */
	const 拒绝点 = [
		{ 包: 'dnd-5e', 锚: '没有可用的', 说明: '没弹药（**攻击层兜底**；`act` 前置另有 `no-ammo`）' },
		{ 包: 'dnd-5e', 锚: '你得先腾出手', 说明: '腾不出手' },
		{ 包: 'dnd3', 锚: '你得先腾出手', 说明: '腾不出手' },
		/* ★`sgstory#2027`：擒抱中的**目标限制**（SRD 3.5 · `Basic Rules and Legal/combat-ii-movement-modifiers-and-special-actions.md:786`：
		 *   擒抱中只能打你擒抱的那名对手）⇒ 其余目标在此**拒绝**（与「腾不出手」同形）。 */
		{ 包: 'dnd3', 锚: '扭在一起', 说明: '擒抱中只能打那名对手（`#2027`）' },
		{ 包: 'd20m', 锚: '你得先腾出手', 说明: '腾不出手（★本包**当前不可达**，见 `d20m` 档的可达性棘轮）' },
	];
	const 失手点 = [
		{ 包: 'dnd-5e', 锚: 'ctx.hit = false', 说明: '★在**管线阶段**内（见下「结构不对称」）' },
		{ 包: 'dnd3', 锚: '挥空了', 说明: '函数体内早退' },
		{ 包: 'd20m', 锚: '没有击中', 说明: '函数体内早退' },
	];
	/* ★13 件转发（按包切；`dnd-5e` 与 `dnd3` 同名遮蔽：`sword`／`club`／`bomb` 在 `RPG.items` 里解析到 **dnd3**，
	 *   故这些件**在行为上**由 `dnd3` 那侧覆盖 —— 但**文件面**两包都要改，否则本表与实际集合不符）。 */
	const 转发件 = {
		/* ★`#1855`：`natural-attacks.js` 是**生成器档**（一件档产出 9 只天然攻击件）——
		 *   本棘轮按**档**核集合，故登记**档名**（✗ 9 个件 id）。它与其余件**同形转发** ⇒ 属同一契约面。 */
		'dnd3': ['bone-dagger', 'club', 'iron-lineage', 'natural-attacks', 'short-bow', 'sword', 'wood-spear'],
		'dnd-5e': ['bomb', 'club', 'dagger', 'musket', 'pistol', 'sword'],
		'd20m': ['beretta-92f'],
	};
	const 攻击函数 = { 'dnd3': 'DND3.meleeAttack', 'dnd-5e': 'DND5E.attack', 'd20m': 'D20M.attack' };

	test('★#1813 ⑧【跨包棘轮·拒绝点】三包「打不出去」处须 `return false`（两向差集）', () => {
		for (const [包, file] of Object.entries(攻击层)) {
			const src = stripComments(fs.readFileSync(file, 'utf8'));
			const named = 拒绝点.filter((e) => e.包 === 包);
			/* ① 具名清单逐个：**锚之后的第一条 `return` 语句**须是 `return false;` */
			for (const e of named) {
				const at = src.indexOf(e.锚);
				assert.ok(at >= 0, `${file}：锚「${e.锚}」缺失（拒绝点被删/改文案 ⇒ 须同步登记）`);
				const m = src.slice(at).match(/return(?:\s+false)?\s*;/);
				assert.ok(m, `${file}：锚「${e.锚}」之后找不 return 语句`);
				assert.eq(m[0].trim(), 'return false;',
					`${file}「${e.说明}」：拒绝须 \`return false\`（✗ \`${m[0].trim()}\` —— 那会被算作 applied）`);
			}
			/* ② **反向**：该档里所有 `return false;` 都必须被具名清单**认领**（✗ 多出来而无人登记） */
			const all = [...src.matchAll(/return\s+false\s*;/g)].length;
			assert.eq(all, named.length,
				`${file}：实际 \`return false;\` **${all}** 处 ≠ 具名清单 **${named.length}** 处`
				+ '（新加/删除须显式登记 —— 枚举 vs 实际集合两向都要核）');
		}
	});

	test('★#1813 ⑨【跨包棘轮·失手点】三包「失手」处须**保持裸 `return;`**（✗ 与拒绝同改）', () => {
		/* ★本格是**判别格**：把任一处失手改成 `return false` ⇒ 红。
		 *   ⚠ **但三包的结构不对称**（本席实测，见票面「结构不对称」）：
		 *     · `dnd3`／`d20m`：失手是**攻击函数体内**的早退 ⇒ 改成 `false` **真的**会把失手变成拒绝（危险）；
		 *     · `dnd-5e`：失手在**管线阶段**内，而 `runPipeline` **丢弃阶段返回值**（`st.run(ctx)` 无接收）
		 *       ⇒ 改那一行**不传播**（阶段返回被丢）；能把它变成拒绝的是「在 `DND5E.attack` **函数体**里
		 *       按 `ctx.hit` 返 `false`」——故 `dnd-5e` 侧还需行为格（`tests/unit/dnd-5e/` 的对照格）兜。
		 *   ⇒ 本格对三包都**核文本**（契约层），行为层另由各包档的对照格覆盖。 */
		for (const [包, file] of Object.entries(攻击层)) {
			const src = stripComments(fs.readFileSync(file, 'utf8'));
			const named = 失手点.filter((e) => e.包 === 包);
			for (const e of named) {
				const at = src.indexOf(e.锚);
				assert.ok(at >= 0, `${file}：失手锚「${e.锚}」缺失`);
				const m = src.slice(at).match(/return(?:\s+false)?\s*;/);
				assert.ok(m, `${file}：失手锚「${e.锚}」之后找不 return 语句`);
				assert.eq(m[0].trim(), 'return;',
					`${file}「${e.说明}」：失手须保持**裸** \`return;\`（⇒ undefined ⇒ applied）；`
					+ `\`${m[0].trim()}\` 会把「没中」判成拒绝 ⇒ 三连护栏误触发`);
			}
			/* 反向：裸 `return;` 的处数须与具名清单一致 */
			const all = [...src.matchAll(/return\s*;/g)].length;
			assert.eq(all, named.length,
				`${file}：实际裸 \`return;\` **${all}** 处 ≠ 具名清单 **${named.length}** 处（新加须登记）`);
		}
	});

	test('★#1813 ⑩【跨包棘轮·转发件】各武器件 「used()」 须**转发**攻击层返回值（两向差集）', () => {
		for (const [包, ids] of Object.entries(转发件)) {
			const dir = `src/dnd/${包}/items`;
			/* ① 具名清单逐个：该件的 「used()」 须 `return <pkg>.attack|meleeAttack(...)` */
			for (const id of ids) {
				const f = `${dir}/${id}.js`;
				assert.ok(fs.existsSync(f), `转发件缺失：${f}（清单与实际集合不符）`);
				const src = stripComments(fs.readFileSync(f, 'utf8'));
				const fn = 攻击函数[包];
				/* `sword`／`club`／`bomb` 那几件在 `dnd-5e` 里调的是 `DND5E.attack`（文件面按包写） */
				const m = src.match(new RegExp(`used\\(that, from\\)\\s*\\{\\s*(return\\s+)?${fn}\\(this, that, from\\);`));
				assert.ok(m, `${f}：「used()」未按形转发 \`${fn}\``);
				assert.ok(m[1], `★${f}：「used()」**未转发**返回值（\`${fn}(…)\` 前缺 \`return\`）`
					+ ' ⇒ 攻击层的 `false` 被丢弃 ⇒ 本票在 「used()」 层失效');
			}
			/* ② 反向：该包 items 下**所有**调用攻击函数的件都须在清单里 */
			const 实到 = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
				.filter((f) => new RegExp(`\\b${攻击函数[包]}\\(this`).test(fs.readFileSync(`${dir}/${f}`, 'utf8')))
				.map((f) => f.replace(/\.js$/, '')).sort();
			assert.eq(JSON.stringify(实到), JSON.stringify([...ids].sort()),
				`${dir}：实际转发件集合 ≠ 具名清单（新增/删除须显式登记）：${JSON.stringify(实到)}`);
		}
		/* ★**总量守卫**（`#1855`：13 → **14**）：`total` 由上方清单**推导**（✗ 另一处硬编），
		 *   而末尾断言把它**钉在 14** —— 这是**有意**的：本格的用途是「清单形状**变更须显式**」，
		 *   故新增/删除转发件时**必须在同一处改两样**（清单 ＋ 这个数）⇒ 改了一处忘另一处会当场红。
		 *   ⚠ 旧注释只写「总量自记（✗ 硬编）：13」，与下一行的 `assert.eq(total, 13)` **自相矛盾**
		 *     （`tester-3` 指出；本笔据实改写，✗ 留歧义）。 */
		const total = Object.values(转发件).reduce((n, a) => n + a.length, 0);
		assert.eq(total, 14, `清单总量须为 **14**（原 13 ＋ #1855 新增的 natural-attacks 档）：${total}`);
	});

	test('★#1813 ⑪【可达性】`dnd-5e` 侧「腾不出手」须**可达**（须存在非 ranged 的 weapon 件）', () => {
		/* 与 `d20m` 档那条互为镜像：`d20m` 因**没有**近战武器而不可达（已由该档钉住）；
		 *   `dnd-5e` 若哪天把唯一的近战件（`dagger`）改成 ranged ⇒ 该拒绝支**变为不可达**
		 *   ⇒ ③ 那格会开始「测不到东西却仍绿」⇒ 此处先把它钉住。 */
		const dir = 'src/dnd/dnd-5e/items';
		const 非远程 = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).filter((f) => {
			const s = fs.readFileSync(`${dir}/${f}`, 'utf8');
			return /slot:\s*'weapon'/.test(s) && !/ranged:\s*true/.test(s);
		});
		assert.ok(非远程.length > 0,
			'★dnd-5e 已无**非远程**武器 ⇒ 「腾不出手」拒绝支不可达 ⇒ 正例格③形同虚设（须补/改格）');
		/* 且清单里那两个「腾不出手」行为格用的件须仍在（`musket` 握着 + `dagger` 未装备） */
		assert.ok(R().items.has('dagger') && R().items.has('musket'),
			'行为格③用的 `dagger`／`musket` 须仍在注册表（✗ 被改名/删）');
	});
})();
