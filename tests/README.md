# tests/ —— 测试指南

两层测试：**unit**（无 SugarCube 环境的单元测试）与 **e2e**
（消费插件全部能力的完整故事）。

```
tests/
├─ unit/                       单元测试（目录镜像 src/ 结构）
│  ├─ unit.html                入口页：按序加载 framework → dist → 用例
│  ├─ core/<单元>.test.js      core 引擎的用例（与 src/core 文件一一对应）
│  ├─ dnd3/<单元>.test.js      dnd3 规则包的用例（stats/characters/chest/items）
│  ├─ framework/               测试基础设施（手写）
│  │  ├─ shims.js              SugarCube 环境桩（setup/State/SugarCube/jQuery）
│  │  └─ harness.js            迷你测试框架（test/assert/__runTests）
│  └─ dist/                    构建产物（build.py 生成，勿手改）
│     ├─ bundle.js             被测物：插件构建，与游戏**完全相同**的包装
│     └─ manifest.js           用例清单（递归扫描 *.test.js 自动发现）
└─ e2e/old-house/ 「老宅与银怀表」：完整故事（src/ 源码 + game.html 产物）
```

> 澄清一个容易误会的点：`dist/bundle.js` 不是测试框架，而是**被测物**——
> 插件源码按与游戏构建相同的包装编译出的产物（“测的就是发布的”）。
> 测试框架是 `framework/harness.js`；环境桩是 `framework/shims.js`。

**用例目录与被测单元一一对应**：`tests/unit/core/x.test.js ↔ src/core/x.js`，
`tests/unit/dnd3/y.test.js ↔ src/dnd3` 的对应单元。加新规则包时建
`tests/unit/<包名>/` 同构目录。

**一个单元一个测试文件**（与 `src/` 源文件对应）：

| 用例文件 | 被测单元 |
|---|---|
| core/namespace.test.js | src/core/00-namespace（注册表、事件总线 on/off/emit/异常隔离） |
| core/dice.test.js | src/core/05-dice |
| core/io.test.js | src/core/01-perform + 02-choice（IO 契约） |
| core/item.test.js | src/core/10-item（基类/defItem/注册表/快照） |
| core/event.test.js | src/core/15-event（抽象基类与 execute 接口） |
| core/effect.test.js | src/core/17-effect（Effect/Debuff/death） |
| core/character.test.js | src/core/20-character |
| core/inventory.test.js | src/core/30-inventory（give/装备竞争/充能/战利品） |
| core/battle.test.js | src/core/40-battle |
| core/chest.test.js | src/core/41-chest（机制，无判定） |
| dnd3/stats.test.js | src/dnd3/00-init（STAT_BLOCK/stats 工厂） |
| dnd3/characters.test.js | src/dnd3/characters（数值块对称性） |
| dnd3/chest.test.js | src/dnd3/core/chest（3E 撬锁检定） |
| dnd3/combat.test.js | src/dnd3/core/combat（acOf/近战数学/击倒/炸弹灵巧投掷） |
| dnd3/items.test.js | src/dnd3/items（3E 判定数学） |

## 如何运行与判定

```bash
python build.py        # 同时产出 tests/unit/bundle.js 与 e2e 的 game.html
```

- **单元测试**：浏览器打开 `tests/unit/unit.html`
  - 判定：页面标题显示 `PASS <n>`（失败为 `FAIL x/n`）；
    结果对象在 `window.__unitResult = { total, pass, fail }`；
    页面逐条渲染 ✓/✗。
- **e2e**：浏览器打开 `tests/e2e/old-house/game.html`，
  按下方“e2e 验证要点”人工走查（或用浏览器自动化驱动，历史会话即此做法）。

## 如何写单元用例

**新建 `tests/unit/<包>/<单元名>.test.js`**（目录与 `src/` 镜像；整体用
IIFE 包裹避免跨文件顶层重名），然后 `python build.py`——manifest 递归
扫描 `*.test.js` 自动发现，无需改 unit.html：

```js
/* core/30-inventory 的单元测试 */
(() => {
	const R = () => setup.RPG;

	test('inventory：loot 只转移未装备的道具', () => {
		const victim = new (R().Character)({
			name: '戊', items: [{ id: 'club', equipped: true }, { id: 'coin' }],
		});
		R().loot(victim);
		assert.ok(R().has('coin'), '掉落硬币');
		assert.ok(!R().has('club'), '装备不掉落');
	});
})();
```

**规则**：

1. **断言只看状态与异常**（hp、注册表、标志位、throw/reject）。
   单元环境的 perform 是 no-op——**不断言消息文本**，那属于 e2e。
2. 每个用例运行前 runner 会重置 `State.variables = {}`（`resetState`），
   用例之间互不污染；`setup.RPG` / `setup.DND3` 是全局长存的（注册表跨用例累积，
   因此用例内临时道具请用唯一 id，如 `unit-xxx`）。
3. 异步直接 `await`（用例函数可以是 async）；Promise 拒绝用
   `await assert.rejects(promise)`。
4. **消除随机性**：判定的成败要构造必成/必败条件，三条正解（优先用前两条）：

   1. **注入固定 RNG（推荐）**：临时固定 `Math.random`，掷骰即确定；必须 `try/finally` 复原，否则污染后续用例：
      ```js
      const orig = Math.random;
      Math.random = () => 0.5;      // d20 = (0.5*20|0)+1 = 11；1d6 = 4
      try { /* 断言 */ } finally { Math.random = orig; }
      ```
   2. **必中/必不中构造**：给目标加 `noDodge: true`（同时免「天然 1 必失」与「天然 20 重击确认」两条路径），再配 `stats: { ac: -999 }`；也可用临时道具 `bab: 99` 提高命中面。
      ⚠️ **只写 `ac: -999` 不构成必中**：`die === 1` 仍必失，`die === 20` 会触发重击确认使伤害翻倍、越出预期区间。实测（PR #1687 检视）：未加 `noDodge` 的「必中靶」用例 2000 轮翻转 **20.6%**、宿主 20 轮 3 红。
   3. **统计型断言（最后手段）**：循环 N 次比较计数时须留重试余量（如 `while (hp > 0 && n < 10)`），并接受其为概率性断言；**能固定 RNG 就不要用统计法**（掷数放大只降方差不消随机，实测仍有 0.1–0.2% 长尾）。

   ⚠️ **优势/劣势不可用「结果」判定**：固定 RNG 下 `d20adv`/`d20dis` 两掷同值 ⇒ 命中结果与普通 `d20` 无法区分。锁「优势/劣势生效」须走**调用面**（探针包 `d20adv`/`d20dis` 计次）或**异值轮转桩**（如 `[0.1, 0.9]` 交替）。

**断言 API**：`assert.ok(cond, msg)` / `assert.eq(a, b, msg)` /
`assert.throws(fn, msg)` / `await assert.rejects(promise, msg)`。

**shim 说明**（framework/shims.js，改动需谨慎）：
`setup`、`State = { variables }`、`SugarCube.Engine` 导航桩、
可链式调用的 no-op jQuery 桩。插件里新增的引擎依赖（新全局、新 DOM 结构）
需要同步扩展 shim，否则 bundle 加载即失败。

## 如何写 e2e 用例

`tests/e2e/old-house/` 是完整参考。新增一个 e2e 故事：

1. 新建目录 `tests/e2e/<你的故事>/src/`：
   - `storydata.twee`（含 `title`、`start`、`ifid`）
   - 剧情 twee（`[widget]`、`StoryInit`、`PassageFooter` 等）
   - 故事侧 js（可声明 `const DND3 = setup.DND3;` 局部别名）
2. `python build.py tests/e2e/<你的故事>` → 产物在该目录 `game.html`。

**e2e 验证要点**（提交前走查）：

- 框架加载：`setup.RPG` / 规则包命名空间存在，注册表齐全
- 关键交互路径：拾取/装备/使用/战斗/离开各走一遍
- 消息文本正确（这是文本断言的归属地）
- 状态栏与历史回退按预期刷新
- `Engine.restart()` 后世界状态正确重置

## 为什么 bundle 与游戏构建相同

`build.py` 用同一套包装逻辑（按包注入 IIFE 与别名）生成
`tests/unit/bundle.js` 和游戏内嵌脚本——单元测试跑的就是发布形态的代码，
不会出现“单测过了、游戏里包装坏了”的假阴性。
