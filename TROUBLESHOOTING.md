# TROUBLESHOOTING — Twine + SugarCube 踩坑实录

> 来源：本项目开发实录（2026-09），每条都附**现场、根因、解法、预防**。
> 对应测试文件是活文档：改引擎行为前先跑 `npm test`（十一门 + 29 路线 + 覆盖率五门）。
> 条目按**发现顺序**编号（坑 9 / 坑 13 / 坑 14 都是后补的，不必重排）。
>
> 分级：**S1** 静默失败，难排查 · **S2** 语义反直觉，设计受限 · **S3** 环境噪音，有解

---

## 坑 1 · `setup` 对象在 `[script]` 段落执行时不存在 〔S1〕

**现场**：`window.setup.pc = () => ...` 抛 `Cannot set properties of undefined`，且**同段落后续所有代码静默不执行**（`<<check>>`/`<<save>>` 宏未注册，游戏照常启动，只在浏览器 console 有一条错误）。

**根因**：SugarCube 的 `setup` 全局在完整启动链中才创建；`[script]` 段落的求值时点早于它（jsdom 环境必现，真实浏览器时序更宽松但不可依赖）。

**解法**：不用 `setup`，用自有全局命名空间（`window.Game` —— 数据/规则挂 `Game.*`、UI/运行时挂 `Sg.*`，见 `docs/dev-conventions.md` §7）。

**预防**：script 段落里避免一切对引擎注入全局的早期依赖；见坑 6 的分片原则。

## 坑 2 · 每次导航深拷贝变量对象，跨回合引用变陈旧 〔S2 · 最重要〕

**现场**：JS 层持有 `const pc = State.variables.pc`，之后段落里 `<<set $pc.gold ...>>` 全部"没生效"——其实写进了**新克隆**的对象，旧引用读到的是快照。`pc === State.variables.pc` → `false`。

**根因**：SugarCube 为支持**回退（Back）/存档（Save）**，每创建一个历史 moment 就把故事变量结构化克隆。这是特性不是 bug——没有它就没有可靠的 undo。

**解法**：两条纪律——
1. JS/宏代码访问玩家状态一律**现取**：`State.variables.pc` 或 `pcNow()`，禁止缓存引用跨 `<<goto>>`/链接跳转；
2. 单次渲染内（两次导航之间）引用是安全的，可以短持。

**影响设计**：任何"JS 对象挂住游戏状态"的架构（战斗管理器、长生命周期实体）都会踩这坑。状态必须以纯数据存在 `$variables` 里，行为层无状态。

## 坑 3 · wikitext 只插值 `$var`/`_temp`，裸全局名不插值 〔S2〕

**现场**：段落里写 `Game.Chargen.presets[_i].name` 原样显示字符串；而 `_round.options[_i].name` 正常。

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
**更新（2026-09）**：字体改为**同目录外链** `dist/fonts/*.woff2`（`<link rel=preload>` + `font-display:swap`）——HTML 从 1.6MB 降到 0.75MB（-54%），复访字体走缓存；相对路径不破坏离线。上条「勿走弯路」针对的是**跨域 CDN** 外链，结论不变。

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

## 坑 11 · 宏参数裸词不当表达式：`<<goto passage()>>` 直接炸（线上实锤）〔S1〕

**现场**：玩家点击「翻转护身符」，弹错误框：`Error: <<goto>>: passage "passage()" does not exist`。erashift 宏想重渲染当前段落，写了 `<<goto passage()>>`。

**根因**：SugarCube 宏参数解析规则——裸词（无引号/反引号）不当作 TwineScript 表达式求值，直接作为**字面字符串**传入。`passage()` 不是变量也不是字面量，于是 goto 拿到字符串 `"passage()"` 当段落名去找，必然不存在。与坑 3（wikitext 裸全局名不插值）同宗：wikitext/宏参数层**永不隐式求值函数调用**。

**解法**：需要表达式求值时一律反引号包裹：``<<goto `passage()`>>``。同理 `<<set $x to f()>>`（set 的 to 后是表达式区没问题）、`<<print `${fn()}`>>` 等——凡是宏参数位，函数调用必须反引号。

**测试覆盖模式**：
- 集成：scenarios.mjs newGame 的 VirtualConsole 收集 `jsdomError` 中 `Uncaught` 前缀的异常，clickLabel 每次点击后断言无新增（本项目首例「点击后脚本异常」守卫，覆盖全部路线）
- 此前测试绿的假象：widget 里 `<<set $era>>` 先于 `<<goto>>` 执行，变量状态断言通过，异常被无监听的 VirtualConsole 吞掉——**状态断言 ≠ 无异常**，两者都要断

## 坑 12 · `State.variables` 是 getter-only：整体赋值静默 no-op〔S1 · 测试基建〕

**现场**：游走器双支清扫 lo 档全部丢观测；render-all 的"每次渲染前状态重置"从未生效（全绿纯属侥幸——era 变体靠属性赋值生效，而整体 reset 是空操作，状态一路累积）。

**根因**：`Object.getOwnPropertyDescriptor(SugarCube.State, 'variables')` 无 `writable`——是访问器属性。`State.variables = newObj` 在非严格模式下静默丢弃，不报错。坑10 注中"整体替换 $pc 要页面域内构造"只说对了 realm 问题，没说赋值方式本身。

**解法**：还原状态必须逐键删除后 Object.assign 到活对象上：
```js
`(function(){const v=SugarCube.State.variables;for(const k of Object.keys(v))delete v[k];Object.assign(v,${snapshot});})()`
```
单字段赋值（`v.pc = {...}` / `v.era = 'past'`）可写，不受影响。

**验证方式**：篡改标记（`marker=123`）→ 整体赋值 → 读回 marker 仍为 123 → 实锤 no-op。

## 工具链纪律（非引擎坑，但同样排雷）

- **管道吞退出码**：`npm test | tail` 的退出码是 `tail` 的——曾让坏 package.json 一路绿灯合入 main。用 `set -o pipefail` 或先落日志再看。
- **JSON 改动即校验**：`python3 -c "json.load(open('package.json'))"` 一行保平安。
- **测试链完整性**：新增测试文件记得挂进 `npm test`（rules.mjs 曾漏挂两周才被"断言数对不上"暴露）。
- **结构演进必配 fixture（#15）**：改 `Pc.defaults()` 的 PR 必须同 PR 在 `test/fixtures/saves/` 落一版新历史形状并跑全矩阵（npm test 含）。矩阵四律：补齐/保值/修型/幂等——矩阵首轮就抓到过 null 默认（abilities）修型永不触发的真漏洞。

---

## 换引擎评估（2026-09）

**结论：暂不换。** 依据：

| 维度 | 现状 |
|---|---|
| 坑的性质 | 全部是**已知语义/时序**（S1×6、S2×4、S3×4），无数据损坏、无渲染错乱、无存档丢失 |
| 坑的可防御性 | 每条已有解法且固化在 build/test 流水线里，复发会被断言拦住（`npm test` 十一门 + 29 路线 + 覆盖率五门） |
| 坑 2 的本质 | 是 undo/存档功能的**代价**——切到 inkjs+自研前端等于自己重写这套状态快照 |
| 生态收益 | 单文件分发、内置存档/回退、宏系统足够承载 D&D 检定层、CC 开源素材生态 |

**触发重评的信号**（出现任一，认真考虑迁 Ink/inkjs + 自研前端）：
1. 需要**复杂战斗 UI**——SugarCube 的"段落即页面"范式下，大量局部刷新（`<<replace>>` 链）会快速劣化成面条；先攻表/多目标选择就是临界用例；
2. 需要**服务端持有剧情**（防盗版/账号存档/多人）；
3. 状态系统膨胀到**跨段落长生命周期 JS 实体**（与坑 2 的克隆语义根本冲突）；
4. 需要打包为移动 App / 桌面壳（Twee 生态无官方支持，inkjs 是普通 JS 库无此负担）。

## 坑13 · SugarCube 宏反引号参数不支持 ES6 模板字面量（S2）

**现场**：女巫摊子定价链接 `` <<link `花 ${-Game.Economy.priceOf(...)} 金币`>> `` 渲染报 `unable to parse macro argument expression: Unexpected identifier '$'`（L1 全段渲染门拦截，×3 同类）。
**根因**：SugarCube 对反引号参数走自家表达式求值器，`$` 是变量 sigil——模板字面量 `${}` 的 `$` 直接撞枪口。字符串拼接/三元/函数调用都合法，唯独 `${}` 不行。
**解法**：一律拼接式：`` ` "花 " + (-Game.Economy.priceOf(...)) + " 金币" ` ``（同样动态求值，运行时改表价实时反映）。
**预防**：反引号参数里禁用 `${}`；动态标签用拼接。L1 渲染门会兜住（本坑即其抓获）。

## 坑14 · jsdom 里「跑完不退」与「点了没走」——两个都不是脚本的错〔S1 · 测试基建〕

**现场 A（跑完不退）**：测试脚本 `await` 全部跑完、所有断言都绿，进程却**吊死 30 秒才被 `timeout` 砍**；一开始以为是"忘了 `process.exit()`"。

**根因 A**：**JavaScript 视口为零**。jsdom 不做布局，`document.documentElement.clientWidth/clientHeight` 恒为 `0`；SugarCube `Engine.start()` 里那段"等视口就绪再收尾"的 `setInterval`（40ms）**永远等不到就 `clearInterval`** → 计时器一直挂在事件循环上，`beforeExit` 永不触发（`process.exit()` 只是硬砍，问题还在）。

**解法 A**：给 jsdom 一个非零视口，让它自己走完启动链：
```js
Object.defineProperty(w.document.documentElement, 'clientWidth', { value: 1024, configurable: true });
Object.defineProperty(w.document.documentElement, 'clientHeight', { value: 768, configurable: true });
await w.SugarCube.Engine.start();   // 视口非零后这个 promise 才真的 resolve——它才是"启动完成"的信号
```
实测：原本 30s 吊死 → **0.9s 自己退出**。

**现场 B（点了没走 / 骰面与段落没换）**：并行跑 29 条路线时偶发"点了一个明明在屏幕上的链接，游戏不动"；隔离单跑永远复现不出。

**根因 B**：`Engine.isIdle()` 为真 **≠ DOM 已经换好**。回退（`Engine.backward()`）与读档（`Save.browser.slot.load()` → `State.goTo()` + **异步** `engineShow()`）都是"变量先变、段落元素晚一拍"；这一拍里点击落在旧元素上（SugarCube 早一拍就会**丢弃**这次点击）。

**解法 B**：`settle()` 判两条——`Engine.isIdle()` **且** DOM 里存在 `data-passage === State.passage` 的段落元素；点击**只认当前段落**里的链接（全局查找会点到上一段残留的那份 DOM）。三个真因都收进 `test/boot.mjs`，六个脚本共用。

**预防**：
- **别用固定 `sleep()` 当同步手段**——它在机器忙的时候必然不够（并行跑就现原形）；
- **看状态也要看 DOM**：`State.passage` 与 `#passages .passage[data-passage]` 是两个东西，异步导航下会短暂不一致；
- 断言"点了会跳走"的测试，天然就会抓到这类坑——本项目正是新增「结局页收尾」路线断言"读档后画面得跟着走"时，顺带发现了 `L` 快捷键**读档不重画**的真 bug（`slot.load()` 只还原状态，SugarCube 自己的存档界面也是 `load().then(Engine.show)`）。

## 坑15 · 两张静默失败的脸：标签嵌引号 → 断链；闭合标记畸形 → 屏上漏 `<`〔#168〕

**现场 A（断链）**：`酒馆` 里那桌传闻写成了 `<<link "接嘴的那个人——"不老的女人"">>`。渲染出来是
`<a data-passage="不老的女人&quot;&quot;" class="link-broken macro-link">接嘴的那个人——</a>`——**点不动**，
`$pc.ev.tav_ageless` 永不置真（设定书 §3.9 登记的那条传说因此没有 NPC 出处）。发布链上**一声不响**：
`build` 绿、（L0）静态门绿（没有悬空 `[[链接]]`、没有裸 `goto`）、渲染也没有 `.error`。

**根因 A**：SugarCube 解析 `<<link>>` 第一个参数时先按**字符串字面量**切一刀；标签里第二个半角引号提前闭合了字面量，
剩下的碎片被当成"链接目标"——它**只顾自己闭合**，不管语义对不对。

**现场 B（裸标记）**：`洞穴` 里多打了一个 `<`（`<<<</if>>`），渲染文本里直接漏出 `<` 与 `<</`。

**根因 B**：闭合标签的尖括号数错，SugarCube 只把**能配对的**部分当宏，剩下的当普通文本——不报错、不中断，直接给你看。

**解法**：标签里**一律用「」而不是半角引号**（`<<link "接嘴的那个人——「不老的女人」">>`）；闭合标记恒为两个 `<`（`<</if>>`）。

**预防（本次新增两道门，都进 `npm test`）**：
- **断链门**：`test/render-all.mjs` 逐段落渲染后断言 `#passages a.link-broken` 长度为 0；
- **裸标记门**：断言渲染文本里不出现字面 `<`。

两条都必须落在**渲染层**——这两种错在源码层各自**都是合法语法**，静态门（与构建）看不见。

## 坑16 · "免费回满"是一条门看不见的经济线〔#168〕

**现场**：`女巫小屋` 把 `<<set $pc.hp to $pc.max_hp>>` 放在段落顶层。实测 `hp 1/14 → 14/14`，**每次进门都满血**。
于是药膏（8 金）、洞穴那 4 点伤害、花田掉血全成了摆设——这是读文本读出来的，机检一条都没响。

**根因**：机制层没有"回血必须是有限资源"这条断言；而"这一句在段落的哪一层"（顶层还是 `<<if>>` 里）肉眼很难一眼看住。

**解法**：改成**一次见面礼**（`<<if not $pc.ev.wq_blessed>>` 里回满并落旗），此后只能买药膏；文案也顺着改
（原写"她指尖一点暖光落在你肩上"——违设定书 §9 纪律 #7「女巫没有任何能力」；现写"她挖了一勺药膏按在你肩上"）。

**预防（本次新增两道门）**：
- **静态**：`test/integrity.mjs` 断言每个 `<<set $pc.hp to $pc.max_hp>>` 的**前一个非空行**必须是 `<<if ...>>`；
- **行为**：`test/scenarios.mjs` 加路线「女巫小屋·只治一次」——第一次带伤进（1/14）必须回满，第二次带伤进（1/14）必须**还是 1**。

## 坑17 · 测试脚本里塞 Node 原生的 Array 对象 → SugarCube 克隆直接抛错〔#168 批次二 · 测试基建〕

**现场**：验证"有火把走哪一支"时，直接给状态塞了个数组：`pc.gear = ['长剑', '火把']`，随后 `Engine.play('洞穴')`。
渲染出来的是一整块 `.error`：`Error: attempted to clone unsupported type: Array`——而且报错里**还带着引擎源码**，
`head` 一屏刷出几百 KB，真凶从那堆东西里几乎看不出来。

**根因**：jsdom 里有两个 `Array` 构造函数——Node 侧的和 jsdom 侧（`window.Array`）。SugarCube 的 `clone()`
用 `O instanceof Array` 判类型，跨 realm 的对象**不是**它认识的那个 `Array`，于是走兜底分支报"unsupported type"。
而每次回合都要深拷贝状态（坑 2），所以只要状态里躺着一个跨 realm 的容器，这一翻必炸。

**解法**：测试里**别给状态赋 JS 字面量容器**——要么走引擎自己的入口（`w.eval(...)` / `<<set>>`），
要么就地改已有容器：`if (!pc.gear.includes('火把')) pc.gear.push('火把')`。

**预防**：渲染类断言**顺手查 `.error`**（`#passages .error` 存在即 throw）——本次正是加了这一条，
才没把"整段替换成报错块"当成"渲染正常"放过去。

## 坑18 · `<<print>>` 里写裸的 `Items` / `State` —— 空集合时看不出错，一有东西就炸〔#168 批次三〕

**现场**：道具页要"只列身上有的道具"，写成 `<<print Object.keys($pc.inv).filter(k => Items.defs[k]).join(' · ')>>`。
行囊空着时渲染得好好的（显示占位文案），一旦身上有东西，屏上整段变成
`Error: <<print>>: bad evaluation: Items is not defined` 外加源码。

**根因**：`15-tables.twee` 里所有的表都挂在 **`window.Game.*`** 下面（`Game.Items.defs`）；`Items` 只是
构造 `Game` 那个 IIFE 内部的局部名，**不是全局**。空行囊时 `.filter()` 一次都没调用回调，
`Items` 根本没被求值 → 侥幸通过；有道具时回调执行 → 立刻 ReferenceError。

**解法**：`<<print>>` 一律走 `Game.Items.defs` / `Game.Gear.defs` 这样的全名；
`State` 也一样——测试脚本里要用 `w.SugarCube.State`，`w.eval('State…')` 会 `ReferenceError`。

**预防**：门/断言**别只测空状态**。这次就是靠"给 3 件道具再渲染一次"才把雷踩出来的——
新增的路线断言（道具页不许出现终局件）也顺带覆盖了"非空"这条路径。

## 坑19 · 多行 `@@OLD`/`@@NEW` 编辑对：解析器不累积到 `@@END` 就会**静默套用上一对的内容**〔#168 批次三→四〕

**现场**：批次三用 OLD/NEW 对脚本改文本，其中一对是"**删掉** `70-codex.twee` 里的一行"，`@@NEW` 后面是空的。
改完测试全绿，我也渲染过那一页——屏上是
`…所以三百年来谁也没能把它送回去。属性是你自己挑的。接下来不管发生什么，都是这个人在走。 回设定集`，
而这一页本该只剩 `回设定集`。**插进去的是上一对（`20-chargen.twee` 那条改写）的 NEW 文本。**

**根因**：解析器只在 `line.startswith('@@NEW ')`（**带空格**）时切换模式。空 NEW 写成 `@@NEW`（没空格）→
模式仍停在 `old`，`@@END` 触发收尾时 `new` 还是**上一对**的值 → 于是拿上一对的替换文本去改这一对的位置。
OLD 里带了行尾 `\n`，所以后面的 `<<back>>` 那一行还被并到了同一行上。

**解法**：解析器要**按行累积**直到 `@@END`（本轮 `test/coverage.mjs` 的门6 插入就是被这个坑咬过一次），
并且 OLD/NEW **都允许写多行**；单行对继续用 `\n`/`\t` 转义写在一行里。

**预防**：改完**必须回读**被改的文件（不看 diff、只看渲染出来的正文）——这次那道新门（⑤ 重复台词门）
一上线就把这处**自己在上一批留下的**重复抓出来了，这正是"机检兜底"的意义。

## 坑20：HTML 容器标签跨了 `<<if>>` 边界（开标签在门内、闭标签在门外）

**症状**：某一条路径（通常是"首访"或旗标未置位的那一态）渲染出莫名其妙的嵌套错位——
`<div class="tavern-actions">` 之类的开标签落在 `<<if>>` 门内、它的 `</div>` 却在门外，
旗标为假时开标签不渲染、闭标签照常输出，浏览器自愈后结构就漂了（jsdom 还常常不报 `.error`，极隐蔽）。

**本次现场**：女巫小屋三区重排（#179 修复）时，把行动区容器的开标签放进 `<<if $pc.ev.wq_seen>>` 门内、
闭标签留在门外——首访态（门为假）整段 HTML 错配。

**预防**：
1. 搬动带 HTML 标签的块时，**成对检查**：门内的每一个开标签，闭标签也必须在同一道门内；
2. 改完把**旗标两态**（真/假）各渲染一次，断言 `#passages .error` 为零、容器子元素数量符合预期
   （本仓 `test/smoke.mjs` 的三区断言就是照这个写的）；
3. twee 的 `<<if>>` 不产生 DOM 节点，但它**切开渲染顺序**——把它当"运行期的文本剪刀"，不要当结构块。
