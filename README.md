# 迷雾森林 · Twine + SugarCube 脚手架

基于浏览器的文字冒险游戏模板：**Twee 纯文本源码 → 编译成单个 HTML 文件**。
剧情用 git 管理，构建走 CLI，也可随时导入 Twine 2 可视化编辑器双向编辑。

## 快速开始

**▶ 在线试玩：https://sagitrs.github.io/sgstory/**（push 到 main → 测试通过 → 自动发布）

```bash
npm install
npm run build   # 编译 → dist/index.html（单文件，浏览器直接打开即玩）
npm run serve   # 本地预览：http://localhost:8000
npm test        # 构建后全链（~45s）：L0 静态门（含表一致性）→ 规则/属性单测 → L1 全段渲染 → 冒烟 → 场景(并行) → 覆盖门
npm run soak    # 游走器加量长测（20+20 局，~2min）：发布前 / 状态机重改动时跑（#27 起移出默认链）
npm run audit   # 表驱动审计（#28/#34）：--truth/--choices/--systems/--echoes/--text 五维质量门 + 数值三件套
                 # （--check 模式已进 npm test：真相通路/选择臂数/机制发现性/世界回声/文本载荷）
npm run watch   # 修改 src/ 自动重新编译
```

### 纪律：词汇表与断言（#29）

- **内容只许用既定词汇**：机制动作走词汇宏（sitecheck/attackroll/econ/setflag/damage/erashift/setintent…）、状态读取用 `$pc.*` 展示；L0 对三类越界告警（不阻断）：
  - `W1` link/button 体内裸 `set/run/script`（点击态代码只有手写路线能测——O(内容) 负担源头；允许表：`Engine.restart` 导航 / `Chargen.*` 模块 API）
  - `W2` era **写**越界出塔层（读不禁）；`W3` 旗标只写不读/只读不写
  - 豁免：段落内 `/% vocab: exempt W1 理由 %/`，豁免会留痕打印——豁免清单即收编工单
- **数值单一源（#28）**：DC/定价/信物效果住 `src/15-game-tables.twee`（window.Game 三表），正文只传位点/事件键；L0 硬拦：引用键不存在 / 表孤儿项 / 正文硬编码 `$pc.gold` 或数字 DC 残留。改数值改表 + `npm run audit`，不动叙事文本。
- **路线断言降脆**（scenarios 约定）：只断终局账本（结局段、hp/gold/旗标终值）与关键里程碑；不断中间每步 hp/gold——中间值随叙事改动高频变脆。文案断言只锚稳定令牌（如「月光」），不锚整句。
```

## 目录结构

```
src/
  00-meta.twee    故事元数据：标题、IFID、起始段落
  10-init.twee    StoryInit（全局变量初始化）+ Widgets（词汇宏：sitecheck/econ/setflag/…）
  15-game-tables.twee ★ window.Game 三表（位点/经济/信物）——机制数值单一源（#28）
  20-story.twee   ★ 剧情正文（你主要写的地方）
  80-script.twee  StoryScript：自定义 JS 宏（血条 <<hpbar>> 等）
  90-style.twee   StoryStyleSheet：全局样式（暗色主题）
vendor/
  format.js       SugarCube 2.37.3 官方 story format（升级时替换此文件）
test/integrity.mjs  L0 静态完整性门：悬空引用/goto 裸词/未定义宏 + 词汇纪律 W1-W3 + 表一致性硬门（#28/#29）
scripts/audit.mjs   表驱动审计报表（检定成功率/经济时间线/化身战数值），伞 #21/#22 数据源
test/render-all.mjs L1 全段落渲染冒烟：逐段落 play × $era 双变体，无异常/无 .error/非空
test/walker.mjs    L2 对抗席游走器：种子化随机游走（一章+塔）+ 状态不变量 + 检定位点双支清扫（npm run soak 加量）
test/coverage.mjs  L3 覆盖率 ratchet：基线不回退 + 新增段落必须配测（gate#9 等效）——基线更新：npm run update-coverage-baseline
test/smoke.mjs    无头冒烟测试（章节主线路径）
test/scenarios.mjs 分支场景测试（8 条路线 + uncaught 异常守卫）
test/rules.mjs    规则层单测 + 存档兼容矩阵（test/fixtures/saves/ 每版历史形状一档；改 Pc.defaults 必须同 PR 加 fixture）
test/properties.mjs L5 数值属性：判定边界全枚举/优势支配律/伤害界限/车卡预算守恒
scripts/audit.mjs   质量五维门（主伞 #34，Sky-Blind Spire / Old City 设计论据）：真相可达性/选择意义感/
                    系统可玩性/世界活性/语言经济——改叙事文本断锚即红
docs/design-review.md D6 可用性走查存档（呈现层改动时复审）
build.mjs         合并 src/*.twee → extwee 编译
dist/index.html   编译产物（单文件游戏）
```

## Twee 语法速查

```
:: 段落名              定义段落（一个"场景/节点"）
[[显示文字|段落名]]     链接跳转（也可写成 [[段落名->显示文字]]）
$hp                   变量（$ 开头，可直接写在正文里插值）
<<set $gold -= 10>>    赋值
<<if $gold gte 10>>…<<else>>…<</if>>   条件（gte/lte/eq/is/not）
<<textbox "$name" "默认值">>           文本输入
<<damage 20>>          本模板自定义 Widget：扣血 + 死亡跳转
<<hpbar>>              本模板自定义宏：渲染血条
<<include "段落名">>    在当前段落中嵌入另一个段落
''粗体''  //斜体//      基础排版
/% 注释 %/             注释不会输出
```

## 内置的数值系统（D&D SRD 5.2 检定制）

- **六属性 + 调整值**：力量/敏捷/体质/智力/感知/魅力，mod = (score-10)/2 向下取整
- **18 技能**：技能→属性映射，熟练 = 调整值 + 熟练加值(+2)
- **d20 检定**：`<<check "察觉" 10 "adv">>` / 豁免 `<<save "con" 15>>`，
  支持优势/劣势（双骰取高/低）与自然 20/1 必成/必败（2024 版规则）
- **8 轮三选一车卡**：标准数组 → 背景(+2/+1) → 物种 → 职业(生命骰) →
  技艺 → 行囊 → 起源专长 → 命运烙印，3⁸ = 6561 种组合

## 内置的演示机制

| 机制 | 位置 | 说明 |
|---|---|---|
| 车卡流程 | `车卡/角色卡` | 8 轮三选一，数据驱动 |
| 检定驱动剧情 | `洞穴/吊桥/战斗` | 察觉/体操/运动检定代替裸随机 |
| 资源经济 | `酒馆/宝箱` | 金币、火把、装备效果 |
| 情报=优势 | `听传闻→吊桥` | 听过提示给检定优势 |
| 道德分支 | `贿赂哥布林` | 不杀哥布林 → 独立结局 |
| 多结局 | `结局 *` × 5 | 胜利/和平/空手/死亡/**星落（三章真结局）** |
| 双时代探索 | `塔底·*`（三章） | 共鸣锚位置门控：过去的机关改变现在的地形（[设计](docs/archive/chapter3-design.md)/[地图](docs/archive/chapter3-map.md)，存档稿；设定以 [lore-canon](docs/lore-canon.md) 为准）|
| lair 决战 | `塔底·龙战`（三章） | 地形=时代（石柱掩体/废墟俯击），战斗中切换即战术 |
| 实时状态栏 | `StoryCaption` | 名字/职业/血条/金币/背包 |
| 存档元数据 | `StoryScript` | 存档名带职业与生命 |

存档/读档/回退/重开都在**左侧边栏菜单**（SugarCube 内置，自动持久化到浏览器 localStorage）。

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
