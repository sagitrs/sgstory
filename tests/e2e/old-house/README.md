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
