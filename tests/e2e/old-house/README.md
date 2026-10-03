# 老宅与银怀表 —— e2e 参考故事

这是 SC RPG 插件的**端到端测试用例**，同时也是一个完整的示范故事。
开发自己的故事时，建议以此为模板。

## 目录结构（按职责分层）

```
src/
├── meta/                  故事配置（改这里 → 调整元数据与初始状态）
│   ├── storydata.twee       IFID / 格式版本 / 标题 / 起始段落
│   └── init.twee            StoryInit（初始变量、玩家数值块）
├── world/                 世界定义（改这里 → 加位置/出口/交互）
│   └── map.js               WorldMap + Locations + Exits + MapScene
├── story/                 剧情内容（改这里 → 写战斗/支线/结局）
│   ├── bridges.twee         桥接段：twee ↔ Scene 系统出入口
│   ├── battles.twee         战斗段落（地图 action 跳转来做全屏渲染）
│   ├── goblin.twee          哥布林互动（治疗/回报等非战斗交互）
│   ├── chest.twee           铁箱遭遇（陷阱宝箱的完整交互）
│   ├── ending.twee          结局
│   ├── cellar.js            地窖支线（Scene Event 的完整示例）
│   └── hooks.js             事件钩子（统计/调试日志）
└── ui/                    界面定制（改这里 → 调外观和宏）
    ├── start.twee           开场段（名字输入 → 进入探索地图）
    ├── ui.twee              底部状态栏 + 深色主题 CSS
    └── widgets.twee         桥接宏（<<rpg_use>> / <<rpg_equip>>）
```

## 开发新故事的最短路径

1. **复制本目录** → `tests/e2e/你的故事/`（或任意位置）
2. **改 meta/** → storydata.twee 的标题与 IFID；init.twee 的初始变量
3. **改 world/map.js** → 定义你的位置、出口、交互
4. **改 story/** → 写战斗/剧情段落（或删掉用不到的）
5. **改 ui/** → 调样式、开场白
6. `python build.py tests/e2e/你的故事` → 产物在 `你的故事/game.html`

## 架构模式速览

| 模式 | 用在哪 | 说明 |
|---|---|---|
| **地图驱动导航** | world/map.js | WorldMap 有向图 → MapScene choice 渲染 |
| **位置交互** | Location.actions | 在当前位置可做的事（拾取/换装/使用道具） |
| **条件门禁** | Exit.when | `when: () => hasKey` 控制出口可见性 |
| **战斗桥接** | battles.twee | 地图 action → `Engine.play` → 战斗段落 → 回「探索」 |
| **Scene 支线** | cellar.js | 独立于地图的分支剧情（Scene + choice 驱动） |
| **陷阱宝箱** | chest.twee | RPG.Chest 的钥匙/撬锁/砸开/炸开全交互 |
| **事件钩子** | hooks.js | 订阅 item:used / battle:turn 做统计 |

## 测试要点（提交前走查）

- [ ] `python build.py` 成功，tests/unit/unit.html 标题 PASS
- [ ] 游戏可完整通关：开场 → 探索 → 战斗 → 结局
- [ ] 状态栏随导航正确刷新（体力/背包/装备标记）
- [ ] Engine.restart() 后世界正确重置
- [ ] 地图 validate() 无孤立点/悬空边/不可达

## 行为基线判据（`sgstory#1912` 交付 1）

`run-baseline.mjs` 是这条支线的**「行为保持」机械面**：把「接入 `GameSession` ＋ L0 宿主端口」**前后**的
行为钉住。基线锚在 main 的现有行为上，重构支 rebase 于其上 —— 行为一漂移，本档即红。

| 格 | 判什么 | 面 |
|---|---|---|
| `idem-box` | 木箱格：条件选项按**木棒前置**开合；撬开恰得各 1 件；**重进不重复显示、不重复发放** | 无头 |
| `idem-wine` | 酒架格：同上（一次性收取 ＋ 标记翻面后的文案） | 无头 |
| `save-rt` | 存档后推进再读档：标记与背包一致；★**往返后守卫仍咬得住**（值相等 ≠ 语义存活） | 无头 |
| `sessions` | 两个会话状态/随机源/事件/输入相互独立（四条面**各带正控**；装置＝会话侧薄桥 `session-bridge.js`） | 无头 |

```bash
node tests/e2e/old-house/run-baseline.mjs             # 判据（CI 位次：build 之后）
node tests/e2e/old-house/run-baseline.mjs --selftest  # 7 把刀各须**恰**红在指定那一格
```

**刀**（`--selftest` 逐条跑，未下刀须全绿）：撤木箱格 `when` 守卫 ⇒ `[idem-box]` 红；
撤酒架格守卫 ⇒ `[idem-wine]` 红；把 `boxOpened` 标记挪出**存档面** ⇒ 幂等格保持绿而 `[save-rt]` 红
（两条断的不是同一件事，这一刀正为此而设）。
会话侧四把刀各把**一面**接错会话（随机源钉成共享／订户订到别面／输入推进别面／写口钉到别面）
⇒ 各恰好红在 `[sess-rng]`／`[sess-bus]`／`[sess-input]`／`[sess-state]`。
★四条面用**各自的格名**（✗ 一格包四件事）：一个格名时，刀红在哪一面就分不出来了。

## 真 DOM 接缝判据（`sgstory#1912` 交付 1 的 `§7` 那行）

`run-seam.mjs` 把**构建产物** `game.html` 装进 jsdom，按玩家的路点进去点，判 `§7` 那行逐字的四件事：

| 格 | 判什么 | 读数（实测形） |
|---|---|---|
| `[nav]` | 导航：`开始 →探索`（段落换）／`上二楼`·`进储物间`（**地图内移动不换段落**，故断地图位置 `mapCurrent_old-house`）／`查看地窖` ⇒ 场景舞台 ⇒ 木箱格 | 地图位置读 `State.variables['mapCurrent_old-house']` |
| `[back]` | 回退：`Engine.backward()` 换屏（场景舞台是**一段多屏** ⇒ 断 `sceneId` 与末屏文本，✗ 只断段落名） | `cellar-box → cellar-entry` |
| `[save-passage]` | 当前段落存档：存档面带得住当前段落（`marshalForSave()` 的 `history[index].title`）＋ 推进再读回后段落与标记一起回来 | `{index, history:[{title, variables}]}` |
| `[out-timing]` | 输出时机：出句落在**动作那一刻的那一屏**、新屏不重复、动作的**可见结果**（背包）在重绘后仍可读 | 见下「一处明账」 |

```bash
python3 build.py                       # 产物：game.html（＋ tests/unit/dist/bundle.js）
npm i jsdom --no-save --no-package-lock # 窗口式跑时装（✗ 进本仓依赖）
node tests/e2e/old-house/run-seam.mjs
node tests/e2e/old-house/run-seam.mjs --selftest
```

**刀**（`--selftest`）：把门厅「上二楼」的路径改指书房 ⇒ `[nav]` 红；把奖赏文案塞进木箱格的**静态文本**
（动作之前就出现）⇒ `[out-timing]` 红。

**一处明账（实测，✗ 不当绿）**：场景**自循环重绘**（`scene: 'cellar-box'`）会换掉动作那一屏的 DOM 元素
⇒ 动作产生的出句落在**被移除的旧屏**上，重绘后的新屏**不含**它，玩家可见的结果走**面板**（背包含旧硬币、铁钥匙）。
当前行为如此；交付 1 判的是**保持**它（✗ 顺手改掉）—— 记录在此，供交付 2／3 的 `RenderPort` 设计参考。

**装置**（每条都是实测踩出来的）：boot ＝ `runUserInit()` ＋ `start()` ＋ `play(start)`，且 `play` 后须
**让出一个宏任务**再点击（同 tick 的导航会被 boot 的导航静默盖回）；点击须用 `el.click()`；
判据跑完**必须显式退进程**（jsdom 在事件循环里留句柄 ⇒ 不退 ⇒ CI 挂死）。
