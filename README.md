# 迷雾森林 · Twine + SugarCube 脚手架

基于浏览器的文字冒险游戏模板：**Twee 纯文本源码 → 编译成单个 HTML 文件**。
剧情用 git 管理，构建走 CLI，也可随时导入 Twine 2 可视化编辑器双向编辑。

## 快速开始

**▶ 在线试玩：https://sagitrs.github.io/sgstory/**（push 到 main → 测试通过 → 自动发布）

```bash
npm install
npm run build   # 编译 → dist/（index.html + fonts/ 外链子集字体，目录整体分发，浏览器直接打开即玩）
npm run serve   # 本地预览：http://localhost:8000
npm test        # 构建后全链（~2min）：L0 静态门（含表一致性）→ 十一道质量门（真相/canon/回声/选择/互动/**反 S/L**/**行囊+经济**/**战斗动作池**/**交涉**/系统/文本）→ 规则/属性单测 → L1 全段渲染 → 冒烟 → 场景(39 路线并行) → 覆盖门 → 旧存档×新界面 → 体积门
npm run soak    # 游走器加量长测（20+20 局，~1.5min）+ 真浏览器验收（24 项）：CI 独立 job（M1c 接回）；发布前 / 状态机重改动时也可本地跑
npm run browser # 真浏览器验收（#185 阶段五）：零依赖 CDP 直连 Chrome for Testing；缺浏览器/系统库时自动跳过（rc=0）
npm run browser:setup  # 容器缺系统库：免 root 就地解包到 ~/.cache/sgstory-chrome-deps（apt-get download + dpkg -x）
node scripts/ui-migration-diff.mjs  # 差异复核：工作区 vs 基线（默认 92f3d04）的玩家可见正文漂移 → docs/ui-migration-diff.md
npm run audit   # 表驱动审计（#28/#34）：每个门都能单独跑，加载打印数值报告
                 #   十一门 —— --truth --canon --echoes --choices --interact --nosl --gear --combat --social --systems --text
                 #   数值三件套 —— 检定成功率矩阵 / 经济时间线 / --dragon 龙战推演与道具伤害矩阵
                 # 加 --check 就是 CI 用的判定态（真相通路/设定回流/传说覆盖/道具消费/选择臂数/互动发起方/反 S/L/
                 # 行囊与钱/动作池三档/交涉代价/机制发现性/文本载荷/彩蛋率），npm test 全跑
npm run watch   # 修改 src/ 自动重新编译
```

### 纪律：词汇表与断言（#29）

- **内容只许用既定词汇**：机制动作走词汇宏（sitecheck/econ/give/setflag/flip/damage…）、状态读取用 `$pc.*` 展示；L0 对三类越界告警（不阻断）：
  - `W1` link/button 体内裸 `set/run/script`（点击态代码只有手写路线能测——O(内容) 负担源头；允许表：`Engine.restart` 导航 / `Chargen.*` 模块 API）
  - `W2` era **写**越界出翻转域（读不禁；翻转域＝挂了 `<<flip>>` 的段落所在文件，M1a-2 起动态发现）；`W3` 旗标只写不读/只读不写
  - 豁免：段落内 `/% vocab: exempt W1 理由 %/`，豁免会留痕打印——豁免清单即收编工单
- **数值单一源（#28）**：DC/定价/道具效果/命题/回声住 `src/15-tables.twee`（`window.Game`），正文只传位点/事件键；L0 硬拦：引用键不存在 / 表孤儿项 / 正文硬编码 `$pc.gold` 或数字 DC 残留。改数值改表 + `npm run audit`，不动叙事文本。
- **路线断言降脆**（scenarios 约定）：只断终局账本（结局段、hp/gold/旗标终值）与关键里程碑；不断中间每步 hp/gold——中间值随叙事改动高频变脆。文案断言只锚稳定令牌（如「月光」），不锚整句。
```

## 目录结构

```
src/
  00-meta.twee   故事元数据：标题、IFID、起始段落
  10-core.twee   Rules（d20 内核）+ StoryInit + Widgets（词汇宏）+ StoryCaption（侧栏）
  15-tables.twee ★ window.Game（位点/经济/道具/行囊/战斗/交涉/图鉴/命题/回声/选择/系统/翻转锚/星力/龙）
                   + Pc（状态形状与迁移）+ ChargenRounds——机制数值单一源（#28）
  20-chargen.twee ChargenRounds（3 轮）+ ChargenPresets + 车卡 / 角色卡
  30-ch1.twee    ★ 序章 + 一章（时间）正文
  40-ch2.twee    ★ 二章（手段）正文
  50-ch3.twee    ★ 三章（坐标）正文
  60-endings.twee ★ 结局（10 个出口）
  70-codex.twee  ★ 设定集（hub + 三律/守塔的人家/塔/道具/术语/结局/图鉴）
  80-script.twee StoryScript：存档钩子 + S/L 快捷键（读档要 .then(Engine.show) 才重画）+ 结局页收尾入口
                   + 图鉴跨周目持久化（localStorage）+ 段落起始的状态归一化
  90-style.twee  StoryStyleSheet：全局样式（暗色主题）
vendor/
  format.js       SugarCube 2.37.3 官方 story format（升级时替换此文件）
test/integrity.mjs  L0 静态完整性门：悬空引用/goto 裸词/未定义宏 + 词汇纪律 W1-W3 + 表一致性硬门（#28/#29）
                   + 序章白名单（开场不许提前提后文才到的地方）+ 回指门（"你想起某人说过的话"必须真听过 → 门槛控） + 楼层数字门（正文/提示里的"N楼"要与设定书楼层定案一致）+ 满血门（<<set $pc.hp to $pc.max_hp>> 必须落在 <<if>> 门控里）
test/render-all.mjs L1 全段落渲染冒烟：逐段落 play × $era 双变体，无异常/无 .error/非空 + 断链门（a.link-broken 必须为 0）+ 裸标记门（畸形闭合在屏上漏字）
test/saveui.mjs    旧存档 × 新界面兼容矩阵（#264）：6 fixture × 2 时代 × 6 代表段落（不凭空结果槽/不串反馈/不崩/首遇门控安全）
test/browser.mjs   真浏览器验收（#263）：零依赖 CDP，3 视口 × 4 场景 × 操作前后 = 24 项断言 + 截图存证
test/walker.mjs    L2 对抗席游走器：种子化随机游走（一章+塔）+ 状态不变量 + 位点双支清扫（npm run soak 加量）
test/coverage.mjs  L3 覆盖率 ratchet（六门）：基线不回退 / 新段落必配测 / 无交互盲区 / 时代双态 / 交互≥渲染 / **链接级覆盖**（render-all 的链接清单 × scenarios 的点击记录，未点过的须在 test/link-whitelist.json 里有理由）
test/render-all.mjs（门7 出口在最后·静态版）＋ test/walker.mjs（同款·真实状态版）：有可点元素的段落，**最后一个可点之后不许压着成块正文（≥30 字，按文本节点数、含收起 details 的最坏展开态）**——推进剧情的选项永远在最后（#179/#184）。豁免走 test/exits-whitelist.json（结局页 UI 脚注 / flip 过场）
                   ——基线更新：npm run update-coverage-baseline
test/smoke.mjs    无头冒烟测试（快速车卡 → 酒馆 → 森林 → 洞穴 + 侧栏/存档/物品栏）
test/boot.mjs      共享 JSDOM 启动（就绪轮询 + uncaught 监听 + `settle()` 等 Engine.isIdle 且 DOM 跟 State 同步
                   + 退出清理 + 可点选择器 CLICKABLE/CLICKABLE_SEL/LINKS）
                   ——渲染/冒烟/规则/属性/场景/游走全部走这里，不各自装配 JSDOM
test/scenarios.mjs 分支场景测试（39 条路线：金路径 + 全部结局 + 设定集 + 图鉴 + 龙巢边 + 时代分叉 + 封印战 + 反 S/L + 星力软限 + 结局页收尾 + 女巫小屋只治一次 + 酒馆把桌子听遍 + 文本上下文 + **跨周目粘性**）
                   ——跨周目口径（#271）：图鉴账本（localStorage）跨周目保留；谜底门＝「**曾经**走到过终局」，
                   因此走到过终局的档在新周目开局即可在设定集·术语读到谜底；`sgRestartRun()` 只重置本局状态，不动账本。
test/rules.mjs    规则层单测 + 表契约（10 组）+ 存档兼容矩阵（test/fixtures/saves/ 每版历史形状一档；改 Pc.defaults 必须同 PR 加 fixture）
test/properties.mjs L5 数值属性：判定边界全枚举/优势支配律/伤害界限/战斗伤害单调律/车卡形状律
scripts/audit.mjs   质量十一门 + **文字工艺门（--craft）**：真相可达性/**canon 门**（设定书 §10 黑名单回流 + §9 双读断言扫描 + §3.9 传说覆盖 + §5.0 道具消费）/
                    选择意义感/系统可玩性/世界活性/语言经济/**互动门**/**反 S/L 门**/**行囊门 + 经济门**/**战斗动作池门**/**交涉门**/
                    图鉴门 + 数值三件套（检定成功率矩阵 / 经济时间线 / 龙战推演与道具伤害矩阵）
                    文字工艺门：跨段落重复句 / 正文半角标点 / '' 奇偶 / 破折号·像·括号密度 ratchet（test/density-baseline.json）/ 道具名与 Items.defs 一致
                    ——改叙事文本断锚即红，设定裁剪后正文回流亦红，失败档给收益即红
docs/
  lore-canon.md     ★ 设定书（唯一权威正史「送它回家」；正文与它冲突＝P1 缺陷）
  game-outline.md   ★ 游戏大纲（依据设定书扩展的机制/内容蓝本；不具设定权威）
  impl-map.md       实施图（M1 骨架落地：段落图/状态模型/测试策略）
  archive/          已作废稿（禁止回流；对照表见 docs/archive/README.md）
  design-review.md  D6 可用性走查存档（呈现层改动时复审）
  quality-selfaudit-ch123.md  1–3 章八维自检存档（流程记录，非设定稿）
build.mjs         合并 src/*.twee → extwee 编译
dist/             编译产物（index.html + fonts/*.woff2，自包含可离线；字体外链：首访更小、复访走缓存）
```

## Twee 语法速查

```
:: 段落名              定义段落（一个"场景/节点"）
[[显示文字|段落名]]     链接跳转（也可写成 [[段落名->显示文字]]）
$hp                   变量（$ 开头，可直接写在正文里插值）
<<set $gold -= 10>>    赋值
<<if $gold gte 10>>…<<else>>…<</if>>   条件（gte/lte/eq/is/not）
<<textbox "$name" "默认值">>           文本输入
<<damage 20>>          本模板自定义 Widget：扣血（药膏自动生效）+ 死亡跳转
<<sitecheck "位点">>    词汇宏：按表查 DC 走技能检定 / 豁免（<<check>> / <<save>>）
<<fightbegin/fightresolve/fightpanel>>  B1 战斗动作池：每轮随机 3 选 1，每手一次属性化检定，成/败/大成功各有后果
<<socresolve/socpanel "诉求">>  B2 交涉：同一句诉求换手段＝换属性/换代价；筹码（给/亮/读）＝免检
<<econ "事件">>         词汇宏：按表收支金币（含折扣与 gives 入账）
<<give "道具">>         词汇宏：入物品栏；<<setflag "旗标">> 置世界旗标
<<flip>>               词汇宏：时代翻转（原地生效、耗隐藏星力、回现在雾淡）
<<hpbar>>              本模板自定义宏：渲染血条
<<snapshot>>           存下本条检定的骰面；<<lastcheck>> 复显它、<<lastcheckFor "位点">> 只在指定段落复显
<<ending "键" final>>  结局登记（本档 + 图鉴永久账）并追加收尾卡（退回上一步 / 读档 / 从头再来）
<<dragonbar>>          龙血条；<<inventory>> 侧栏物品栏（由 $pc.inv 派生）
<<include "段落名">>    在当前段落中嵌入另一个段落
''粗体''  //斜体//      基础排版
/% 注释 %/             注释不会输出
```

## 内置的数值系统（D&D SRD 5.2 检定制）

- **六属性 + 调整值**：力量/敏捷/体质/智力/感知/魅力，mod = (score-10)/2 向下取整
- **18 技能**：技能→属性映射，熟练 = 调整值 + 熟练加值(+2)
- **d20 检定**：`<<check "察觉" 10 "adv">>` / 豁免 `<<save "con" 15>>`，
  支持优势/劣势（双骰取高/低）与自然 20/1 必成/必败（2024 版规则）
- **3 轮三选一车卡**（15–30 分钟单周目，v16）：职业（属性/技能/行囊/生命骰）→ 背景（技能/金币/烙印）→ 种族（**只改数值**），
  另有 3 套一键预设；3³ = 27 种细调组合

## 内置的演示机制

| 机制 | 位置 | 说明 |
|---|---|---|
| 车卡流程 | `车卡/角色卡` | 3 轮三选一（+3 预设），数据驱动 |
| 检定驱动剧情 | `酒馆/森林边缘/洞穴/雾之魔物/书房/工坊/天文台/观星者/当时的女巫/寻杖/老巫女/塔外花田` | 技能检定/豁免代替裸随机（`<<sitecheck>>`）；**塔外花田**＝体质豁免 DC16，失败＝**死亡结局**（有情报免判定） |
| 资源经济 | `酒馆/女巫小屋/洞穴/书房/工坊/天文台/龙·巢边` | 金币买信息与准备；学识烙印与技能折扣 |
| 情报=优势 | `酒馆→洞穴`、`守林人` | 传闻给检定优势；带证物分层解锁守林人回答 |
| 道德分支 | `洞穴` | 买路 / 动武 / 绕开 → 一章回响（**塔外花田**：放生的哥布林会告诉你花的危险） |
| **交涉（B2 手段×筹码）** | `酒馆` / `守林人` / `观星者` / `当时的女巫` / `洞穴` / `老巫女` | **同一句诉求换手段＝换属性判定**（游说/欺瞒/恐吓/表演/洞悉/察觉/历史）；**态度定 DC**（友好 −5 / 冷淡 0 / 敌意 +5，DMG 表）；**代价因手段而异**（游说失败＝这一手更难，欺瞒/恐吓＝态度降级，表演/洞悉＝只丢这一句）；**筹码＝免检**（给钱/亮护符/把日记摊开）；`老巫女` 与 `女巫·换哨` 演示 **willing/unwilling**（他本来就要说 / 掷骰也没用）——`audit --social` |
| **战斗（B1 动作池）** | `雾之魔物·战` / `封印·并肩` / `龙·战` | **每轮随机 3 选 1**：每手是一次**属性化检定**（面板写明属性与 DC），**成 / 败 / 骰面 20 大成功**三档各有后果；上一轮打过的不再发；**失败档不给收益**（`audit --combat`） |
| 双时代探索 | `<<flip>>` × 7 个锚点 | **翻转在原地生效，位置决定年代**（v16 §3.3）；从过去回来雾淡一些；**第 5 次起星力见底** → 真结局降级「再度沉睡」 |
| 星力隐藏计数 | `$pc.star` | 玩家不可见，无数字/进度条；唯一反馈＝雾淡（v16 §3.5） |
| 物品栏 | `StoryCaption` + `<<give>>` | 每件各有用途，**不集齐开锁**（v16 §5.0） |
| 常驻存档 | `StoryCaption` + `StoryScript` | 侧栏固定块：快速存档/快速读档/存档菜单；快捷键 `S`/`L` |
| 多结局 | `结局 *` × 10 | 真（送星归位）/ 降级（再度沉睡·自愿的长眠）/ 非真（击杀·虚空·劣化封印·**星落·坠星之死（彩蛋：天然 20 + 劣势 ≈0.25%）**·讨伐·死亡（含**花田长眠**））/ 章节（平凡之路·银月之赐·半途·新任守林人·焚塔者） |
| 结局页收尾 | 每个 `结局 *` 段落末尾（`<<ending>>` 统一发牌） | **退回上一步** / **读档** / **从头再来**；「从头再来」只清本档，**图鉴的永久解锁跨周目留着** |

存档/读档既有**侧栏常驻入口**（快速存档/快速读档/存档菜单，快捷键 `S`/`L`），也有**左侧边栏菜单**里的完整存档界面（SugarCube 内置，自动持久化到浏览器 localStorage）。

## 与 Twine 2 编辑器配合

Twine 2（桌面版）可以**导入编译产物继续可视化编辑**：

1. 打开 Twine 2 → Library → Import → 选 `dist/index.html`
2. 节点图里编辑后导出 HTML
3. `npx extwee -d -i 导出的.html -o 反编译.twee` 可回到 Twee 源码

建议：日常写作用 Twee + git；给策划看结构时用 Twine 2。

## 升级 SugarCube

1. 到 https://github.com/tmedwards/sugarcube-2/releases 下载新版 zip
2. 用其中的 `format.js` 替换 `vendor/format.js`
3. 更新 `src/00-meta.twee` 里的 `format-version`

## 参考

- SugarCube 文档（必读）：https://www.motoslave.net/sugarcube/2/docs/
- Twee 3 规范：https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
- extwee（编译器）：https://github.com/videlais/extwee
- Twine 官网/下载：https://twinery.org
- VS Code 语法高亮：扩展商店搜 **twee3-language-tools**
- 踩坑实录与引擎评估：[TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## 许可

| 部分 | 许可证 | 文件 |
|---|---|---|
| 代码（构建脚本、自定义宏、样式） | MIT | [LICENSE](LICENSE) |
| 剧情文本与游戏内容（叙事、角色、结局） | CC BY 4.0 | [LICENSE-CONTENT.md](LICENSE-CONTENT.md) |
| SugarCube 2（引擎，vendor 并嵌入产物） | BSD-2-Clause（© Thomas Michael Edwards） | [NOTICE](NOTICE) |
| 霞鹜文楷 LXGW WenKai（正文字体，子集内嵌） | SIL OFL 1.1（© lxgw） | [NOTICE](NOTICE) |
| D&D SRD 5.2（规则数值来源） | CC BY 4.0（© Wizards of the Coast） | [NOTICE](NOTICE) |
| extwee / jsdom（仅开发期） | MIT | [NOTICE](NOTICE) |

## 鸣谢

本项目实现时参考了以下开源项目（未直接包含其代码）：

- [Another-RPG-Engine](https://github.com/AnotherRPGEnthusiast/Another-RPG-Engine)（MIT）— SugarCube 原生 RPG 引擎，数值修饰栈模式
- [foundryvtt/dnd5e](https://github.com/foundryvtt/dnd5e)（MIT）— 5e 规则的权威 JS 实现，检定公式组织
- [rpg-dice-roller](https://github.com/dice-roller/rpg-dice-roller)（MIT）— 骰子表达式解析思路
- [5e-bits/5e-srd-api](https://github.com/5e-bits/5e-srd-api)（MIT）— SRD 数据组织
- [Ascend Nousta's Tower](https://jaclynlewis.itch.io/ascend-noustas-tower)（CC BY-SA 4.0, © Jaclyn Lewis）— 第二章「守林人之塔」的单页地城结构灵感（未复制内容）

发布流程：push 到 main → CI 跑测试 → 构建并自动发布到 GitHub Pages。
