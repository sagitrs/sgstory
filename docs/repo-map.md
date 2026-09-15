# 仓库地图（目录结构 · 层归属 · 权威落点）

> **用途**：回答「这个文件该住哪／谁能改／它的权威在哪」。
> 入口页 `README.md` 只留"是什么 ＋ 一键跑起来"，**文件级说明在本页**（来源 `#603` 片二：README 曾把整棵目录树塞在入口页，270 行/24KB）。
> **层与加载顺序的单一权威是代码**：`scripts/module-order.mjs` —— 本页与它冲突时以它为准。

## 一、目录总览

```
src/               引擎层（与具体故事无关；层归属与加载顺序的**单一权威**：scripts/module-order.mjs）
  engine/10-const.twee             引擎常量（#660 片二）：Game.Era / Game.Damage 的**唯一落点**（ORDER 排在 10-core 之前）
  engine/30-persist/05-store.twee   localStorage 键构造的唯一落点（引擎/故事两作用域 ＋ 幂等迁移，#462）
  engine/40-sim/21-resolve.twee     机制/选择器：Sg.rules（条件表选择器 ＋ sets/yields/gives 三个授予面）
  engine/50-present/11-scene.twee   呈现层共用件（场景/面板/折叠/结果槽）
  engine/50-present/90-style.twee   全局样式（暗色主题）
  10-core.twee   Rules（d20 内核）+ StoryInit + Widgets（词汇宏）+ StoryCaption（侧栏）
  80-script.twee StoryScript：存档钩子 + S/L 快捷键（读档要 .then(Engine.show) 才重画）+ 结局页收尾入口
                   + 图鉴跨周目持久化（localStorage）+ 段落起始的状态归一化
stories/           多故事：**每个故事一个目录**（接入契约 docs/engine-story-boundary.md；引擎只经 Sg.story.* 取数据）
  mist-forest/    故事 1「迷雾森林」（完整：3 章 + 10 结局 + 5 章节出口）
    00-meta.twee   故事元数据：标题、IFID、起始段落
    15-tables.twee ★ window.Game（位点/经济/道具/行囊/战斗/交涉/图鉴/命题/回声/选择/系统/翻转锚/星力/龙）
                    + Pc（状态形状与迁移）+ Game.Chargen（车卡三件套）——机制数值单一源（#28）
    16-notes-*.twee 笔记表（知识模型）增量文件：ch1/ch2/ch3/cross（#429–#431）
    17-rules.twee  条件表（#435 阶段 4）：行数组（req/any/exclude/prio/yields/gives/sets）——选择器在引擎侧
    20-chargen.twee Game.Chargen.rounds（3 轮）+ Game.Chargen.presets + 车卡 / 角色卡
    30-ch1.twee    ★ 序章 + 一章（时间）正文
    40-ch2.twee    ★ 二章（手段）正文
    50-ch3.twee    ★ 三章（坐标）正文
    60-endings.twee ★ 结局（10 个出口）
    70-codex.twee  ★ 设定集（hub + 三律/守塔的人家/塔/道具/术语/结局/图鉴）
  minimal-demo/   故事 2：最小示例（#460 接入契约的验证物）
  hollow-cave/    故事 3「无名洞窟」：雏形（#490 S5）
vendor/
  format.js       SugarCube 2.37.3 官方 story format（升级时替换此文件）
build.mjs         合并 src/*.twee → extwee 编译
dist/             编译产物（index.html + fonts/*.woff2，自包含可离线；字体外链：首访更小、复访走缓存）
test/             L0–L5 各层门（逐文件说明见下）
scripts/          构建/审计/报告脚本（audit 的十一门 ＋ 各种 report:*／ui-migration-diff）
docs/             文档（索引见 docs/README.md）

test/integrity.mjs  L0 静态完整性门：悬空引用/goto 裸词/未定义宏 + 词汇纪律 W1-W3 + 表一致性硬门（#28/#29）
                   + 序章白名单（开场不许提前提后文才到的地方）+ 回指门（"你想起某人说过的话"必须真听过 → 门槛控） + 楼层数字门（正文/提示里的"N楼"要与设定书楼层定案一致）+ 满血门（<<set $pc.hp to $pc.max_hp>> 必须落在 <<if>> 门控里）
test/render-all.mjs L1 全段落渲染冒烟：逐段落 play × $era 双变体，无异常/无 .error/非空 + 断链门（a.link-broken 必须为 0）+ 裸标记门（畸形闭合在屏上漏字）
                   （门7 出口在最后·静态版）：有可点元素的段落，**最后一个可点之后不许压着成块正文（≥30 字）**——推进剧情的选项永远在最后（#179/#184）
test/saveui.mjs    旧存档 × 新界面兼容矩阵（#264）＋**真实存读档往返**（#300 P1：原地取物→save→load，道具与「已翻找」态须回来）
test/browser.mjs   真浏览器验收（#263）：零依赖 CDP，3 视口 × 4 场景 × 操作前后 = 24 项断言 + 截图存证
test/walker.mjs    L2 对抗席游走器：种子化随机游走（一章+塔）+ 状态不变量 + 位点双支清扫（同款·真实状态版：出口在最后）
test/coverage.mjs  L3 覆盖率 ratchet（六门）：基线不回退 / 新段落必配测 / 无交互盲区 / 时代双态 / 交互≥渲染 / **链接级覆盖**
                   ——基线更新：npm run update-coverage-baseline
test/smoke.mjs     无头冒烟测试（快速车卡 → 酒馆 → 森林 → 洞穴 + 侧栏/存档/物品栏）
test/boot.mjs      共享 JSDOM 启动（就绪轮询 + uncaught 监听 + settle() 等 Engine.isIdle 且 DOM 跟 State 同步
                   + 退出清理 + 可点选择器 CLICKABLE/CLICKABLE_SEL/LINKS）——渲染/冒烟/规则/属性/场景/游走全部走这里
test/scenarios.mjs 分支场景测试（金路径 + 全部结局 + 设定集 + 图鉴 + 龙巢边 + 时代分叉 + 封印战 + 反 S/L + 星力软限
                   + 结局页收尾 + 女巫小屋只治一次 + 酒馆把桌子听遍 + 文本上下文 + **跨周目粘性**）
                   ——跨周目口径（#271）：图鉴账本（localStorage）跨周目保留；谜底门＝「**曾经**走到过终局」
test/rules.mjs     规则层单测 + 表契约（10 组）+ 存档兼容矩阵（test/fixtures/saves/ 每版历史形状一档；改 Game.Pc.defaults 必须同 PR 加 fixture）
test/properties.mjs L5 数值属性：判定边界全枚举/优势支配律/伤害界限/战斗伤害单调律/车卡形状律
scripts/audit.mjs   质量十一门（--truth --canon --echoes --choices --interact --nosl --gear --combat --social --systems --text）
                   ＋ 文字工艺门（--craft）＋ 数值三件套（--dragon 等）：判定口径与"每门检什么"见 docs/quality-dimensions.md
                   ——改叙事文本断锚即红，设定裁剪后正文回流亦红，失败档给收益即红
```

**门与文档的对应**（哪条判据在哪：`docs/quality-dimensions.md`；门的登记/接线台账：`docs/gate-ledger.md`）。

## 二、层归属（写新内容/新门之前先分清）

| 面 | 在哪 | 谁读它 |
|---|---|---|
| **引擎机制** | `Sg.notes`（求值/写入/幂等）· `Sg.rules`（条件表选择器 ＋ `yields`/`gives`/`sets` 三面） | 与具体故事**无关**：故事 2／3 复用同一套 |
| **故事数据** | `stories/<slug>/15-tables.twee`（`Game.*`）· `16-notes-*.twee`（笔记表）· `17-rules.twee`（条件表行） | 只在**本故事**内生效 |

两条机检纪律：**读侧一律经封装层**（条件表里不出现字面状态读，`--reads`）· **写侧一律在 `<<rules>>` 一处落地**（`--rules` 的 `text` 纯渲染＋三个授予面）。

## 三、权威落点速查

| 想知道 | 权威 |
|---|---|
| 设定/正史（正文与它冲突＝P1） | `docs/lore-canon.md` |
| 知识模型（笔记/世界态/运行时） | `docs/notes-model.md` |
| 质量维度与每门判据 | `docs/quality-dimensions.md` |
| 代码级约定（渲染路径/构建顺序/命名/条件表形状） | `docs/dev-conventions.md` |
| 引擎与故事的边界、故事接入契约 | `docs/engine-story-boundary.md` |
| 模块顺序与层归属 | `scripts/module-order.mjs` |
| 门的登记/接线 | `docs/gate-ledger.md`（`npm run report:gates`，**不要手改**） |
