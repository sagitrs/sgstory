# TROUBLESHOOTING — Twine + SugarCube 踩坑实录

> 来源：本项目开发实录（2026-09），每条都附**现场、根因、解法、预防**。
> 对应测试文件是活文档：改引擎行为前先跑 `npm test`。
>
> 分级：**S1** 静默失败，难排查 · **S2** 语义反直觉，设计受限 · **S3** 环境噪音，有解

---

## 坑 1 · `setup` 对象在 `[script]` 段落执行时不存在 〔S1〕

**现场**：`window.setup.pc = () => ...` 抛 `Cannot set properties of undefined`，且**同段落后续所有代码静默不执行**（`<<check>>`/`<<save>>` 宏未注册，游戏照常启动，只在浏览器 console 有一条错误）。

**根因**：SugarCube 的 `setup` 全局在完整启动链中才创建；`[script]` 段落的求值时点早于它（jsdom 环境必现，真实浏览器时序更宽松但不可依赖）。

**解法**：不用 `setup`，用自有全局命名空间（`window.Rules` / `window.Chargen` / `window.ChargenPresets`）。

**预防**：script 段落里避免一切对引擎注入全局的早期依赖；见坑 6 的分片原则。

## 坑 2 · 每次导航深拷贝变量对象，跨回合引用变陈旧 〔S2 · 最重要〕

**现场**：JS 层持有 `const pc = State.variables.pc`，之后段落里 `<<set $pc.gold ...>>` 全部"没生效"——其实写进了**新克隆**的对象，旧引用读到的是快照。`pc === State.variables.pc` → `false`。

**根因**：SugarCube 为支持**回退（Back）/存档（Save）**，每创建一个历史 moment 就把故事变量结构化克隆。这是特性不是 bug——没有它就没有可靠的 undo。

**解法**：两条纪律——
1. JS/宏代码访问玩家状态一律**现取**：`State.variables.pc` 或 `pcNow()`，禁止缓存引用跨 `<<goto>>`/链接跳转；
2. 单次渲染内（两次导航之间）引用是安全的，可以短持。

**影响设计**：任何"JS 对象挂住游戏状态"的架构（战斗管理器、长生命周期实体）都会踩这坑。状态必须以纯数据存在 `$variables` 里，行为层无状态。

## 坑 3 · wikitext 只插值 `$var`/`_temp`，裸全局名不插值 〔S2〕

**现场**：段落里写 `ChargenPresets[_i].name` 原样显示字符串；而 `_round.options[_i].name` 正常。

**根因**：SugarCube 的裸文本插值只识别 `$`（故事变量）和 `_`（临时变量）前缀；任意 JS 表达式必须走 `<<print expr>>`。

**预防**：全局数据在 wikitext 里渲染一律 `<<print ...>>`；或先把全局数据拷进 `_temp` 再插值。

## 坑 4 · jsdom 无法完成 SugarCube 完整启动链 〔S3 · 测试环境〕

**现场**：jsdom 加载编译产物后停在 "Loading…"；侧边栏 `#story-caption` 永远为空。

**根因**：SugarCube 的 boot 挂在真实浏览器才触发的 load/ready 链上，jsdom 部分模拟不齐。

**解法**（已固化在测试里）：
```js
// 手动补齐启动链：StoryInit（Wikifier 执行）+ 引擎启动
new w.SugarCube.Wikifier(null, initPassageText);
w.SugarCube.Engine.start();
```
**已知不可测**：侧边栏/存档菜单 UI（`#story-caption`、Save 对话框）只能真浏览器手测。
**确定性骰子**：劫持 `beforeParse(window){ window.Math.random = () => 0.99 }` → d20 恒 20（自然 20），全分支可回归。

## 坑 5 · extwee CLI 只吃单输入文件 〔S3〕

**现场**：`extwee -c -i a.twee b.twee -o out.html` 报错。

**解法**：`build.mjs` 先把 `src/*.twee`（按文件名序）合并成 `build/game.twee` 再喂给 extwee。副产品：文件名数字前缀（00/10/20/30/…）即段落编译顺序，**`[script]` 段落的执行顺序也由此控制**。

## 坑 6 · script 段落一处抛错，全段静默中断 〔S1〕

**现场**：同坑 1——一个 TypeError 让同段落后面几十行宏注册全部消失，游戏无感知地残缺运行。

**根因**：`[script]` 段落是整段 JS，异常即中止；没有段落级错误边界。

**预防**：
- script 段落**小而专**（本项目：规则/车卡数据/配置各一段），单段炸不连坐；
- 关键宏注册后立即 smoke：`npm test` 的第一道断言就是"宏存在"。

## 坑 7 · CJK 字体的现实 〔S3 · 已解决〕

**现场**：`'Noto Serif SC', 'SimSun'` 栈在 Windows 落到中易宋体——深底细笔画，毛刺感。

**解法**：霞鹜文楷（OFL）按**游戏实际用字**子集化（pyftsubset，~230KB/字重）+ base64 内嵌，保住单文件与离线；构建时自动重算，新剧情文字自动进子集。生僻字（如玩家名）回退系统楷体。
**勿走弯路**：Google Fonts 国内不稳；CDN 外链破坏单文件性。

## 坑 9 · wiki 链接文字不支持反引号表达式 〔S2〕

**现场**：`[[`"门厅" + cond ? " ✓" : ""`|门厅]]` 原样输出整串表达式文字。

**根因**：`[[文字|目标]]` 的链接文字只接受静态 wikitext（可含变量插值 `$var`），不接受反引号表达式。

**解法**：动态链接一律用容器链接：`<<link \`表达式\`>><<goto "目标">><</link>>`（`<<link>>` 的参数支持反引号表达式）。

## 坑 10 · 状态结构演进 vs 旧存档（线上实锤）〔S1〕

**现场**：玩家读旧档进入新章节，`$pc.tokens.length` 抛 `Cannot read properties of undefined`——新章节新增的字段在旧存档里不存在。

**根因**：SugarCube 读档**整体还原**存档时的变量结构。上线迭代新增任何 `$pc` 字段，旧档一律缺失；消费点（`.length`/`.includes`/遍历）随即崩。测试全绿也拦不住——**所有测试都从新 StoryInit 起步，"旧存档形状"是独立的输入类**。

**解法（三层）**：
1. 默认形状单一源：`Pc.defaults()`（StoryInit 与迁移共用，字段数有断言守恒 18）
2. 入口归一化：章节入口 `<<run Pc.migrate($pc)>>`（幂等，补缺/修型/不覆盖）
3. 全局安全网：`:passagestart` 钩子每段归一化

**测试覆盖模式**：
- 单测：旧形状输入 → 字段补齐/保留/修型/幂等（`test/rules.mjs`）
- 集成：**读档模拟**——整体替换 `$pc` 为旧形状后走完整章节（`test/scenarios.mjs` 路线H）
  - ⚠️ 替换必须用 `w.eval(\`SugarCube.State.variables.pc = ${JSON.stringify(旧档)}\`)` 在**页面域内**构造：
    SugarCube 建历史快照用 `instanceof Array` 判型，Node 侧构造的数组跨 realm，
    会误抛 "attempted to clone unsupported type: Array"（真实浏览器读档不受影响——坑10测试注）
- 纪律：**新增状态字段 → 必须同 PR 更新 Pc.defaults + 跑路线H**

## 坑 8 · `<<textbox>>` 与成员变量路径 〔S3 · 预防性规避〕

`<<textbox "$pc.name">>`（点路径）在部分版本上行为存疑（未验证）。本项目用平铺 `$player_name` 接输入、车卡完成时拷入 `$pc.name`。若要用成员路径，先在目标 SugarCube 版本上验证。

## 工具链纪律（非引擎坑，但同样排雷）

- **管道吞退出码**：`npm test | tail` 的退出码是 `tail` 的——曾让坏 package.json 一路绿灯合入 main。用 `set -o pipefail` 或先落日志再看。
- **JSON 改动即校验**：`python3 -c "json.load(open('package.json'))"` 一行保平安。
- **测试链完整性**：新增测试文件记得挂进 `npm test`（rules.mjs 曾漏挂两周才被"断言数对不上"暴露）。

---

## 换引擎评估（2026-09）

**结论：暂不换。** 依据：

| 维度 | 现状 |
|---|---|
| 坑的性质 | 全部是**已知语义/时序**（S1×2、S2×2、S3×4），无数据损坏、无渲染错乱、无存档丢失 |
| 坑的可防御性 | 每条已有解法且固化在 build/test 流水线里，复发会被 80 项断言拦住 |
| 坑 2 的本质 | 是 undo/存档功能的**代价**——切到 inkjs+自研前端等于自己重写这套状态快照 |
| 生态收益 | 单文件分发、内置存档/回退、宏系统足够承载 D&D 检定层、CC 开源素材生态 |

**触发重评的信号**（出现任一，认真考虑迁 Ink/inkjs + 自研前端）：
1. 需要**复杂战斗 UI**——SugarCube 的"段落即页面"范式下，大量局部刷新（`<<replace>>` 链）会快速劣化成面条；先攻表/多目标选择就是临界用例；
2. 需要**服务端持有剧情**（防盗版/账号存档/多人）；
3. 状态系统膨胀到**跨段落长生命周期 JS 实体**（与坑 2 的克隆语义根本冲突）；
4. 需要打包为移动 App / 桌面壳（Twee 生态无官方支持，inkjs 是普通 JS 库无此负担）。
