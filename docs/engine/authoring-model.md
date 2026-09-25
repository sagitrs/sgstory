# 写作模型：一份故事由**三类源**构成

> 承 `#1036`（散文形态甲-1 · 内联只许引用形状）· `#1049`（效果／计算不立新面）· `#761`（分期与技术形状）。
> 本文只回答三问：**MD 放什么 · JSON 放什么 · 条件与计算写在哪里**。

## 0. 一条原理（其余都是它的推论）

> **散文只引用，不计算；结构只声明，不渲染。**

拆成两句可判定的话：

1. **正文（Markdown）里允许的内联扩展只有两种，且都是「引用形状」** —— `[[标签|目标]]`（节点引用）与 `{{名字}}`（取值引用）。**永不出现表达式。**
2. **结构（条件／效果／出口）一律出正文**，进 `data/*.json`；**例外**是「**具名动作**」—— 它由引擎宣告、可枚举、未声明即红，因此可以留在正文。

**「具名动作」与「计算」的分界，就是「是否在引擎宣告面内」**（实测：`src/**` 现抽 **33** 个 ＝ `<<widget>>` 23 ＋ `Macro.add` 10）。
这条界是本文档要**写明**的东西 —— 此前它只是隐含在门的具体宏名清单里（`test/prose-vocabulary.mjs` 的 `FORBIDDEN_BUILTINS`）。

## 1. Markdown 放什么（散文层）

**一段一文件** ＋ YAML front-matter（承甲-1）。**只放散文。**

```markdown
---
passage: 渡口
tags: [prose]
scope_of: []          # 可选：本段归属的条件行 id（供可达性视图）
---

船篙一点，水面的灯影碎成两半。你问他：`渡口` 还开吗。
{{撑船人}} 没答话，只把灯笼往船头一压。

[[上船|船头]]
[[回头|结局 抵岸]]
```

**允许**：散文文本 · `[[标签|目标]]` · `{{名字}}` · front-matter 的元数据字段。
**禁止**：原始计算内建（`` <<= … >> `` 等）——**真源＝`test/prose-vocabulary.mjs:35` 的 `FORBIDDEN_BUILTINS`（8 项，此处只举例 `<<set>>`／`<<if>>`，不复述全集）**，由该门判红。
**允许且不判**：33 个**具名动作**宏（`<<give>>`／`<<note>>`／`<<setflag>>`／`<<sitecheck>>`／`<<ending>>` …）—— 它们是**词汇**，不是代码。

**为什么散文不进 JSON**（`editor-pivot.md` §2.1 已定，此处重复一次因为它是最容易违反的一条）：长文本要 diff、要人读；塞进 JSON 会毁掉评审。

### 1.1 `[[…]]` 为什么不用 MD 原生链接（实测＋理由）

> ★（`#1234` 冻结后）**散文里不再有任何链接** ⇒ 本节只回答"当初为何没用 MD 原生链接"；
> 链接的**落点**是数据面（`data/passages.json` 的 `links[]`，见 `docs/manual/12-data.md`）✓

`[[…]]` 的目标是**段落（节点）引用**：`walker`／`scenarios`／`integrity`（悬空引用门）／`event-graph` 直接把它读成**有向图的边**。
MD 的 `[](…)` 是**资源地址**（渲染成 `href`），语义不等价；且常见实现会对非 ASCII 目标做 **percent-encode**（`[x](渡口)` → `href="%E6%B8%A1%E5%8F%A3"`，本仓未实测），拼装层不解码就会生成**指向不存在段落的边，而表面完全正常**。
→ 拼装层**无论如何都要转换**；「省掉自定义语法」只是把成本挪进拼装层，同时把**退化入口**留给靠约定的地方。

### 1.2 `{{名字}}` 是什么、不是什么

> ★（`#1234` 冻结）`{{名字}}` **只认本段 `params`** 声明的入参（未声明／未传 ⇒ **红**）；**世界态**一律走**具名取值宏**（✗ 不进 `{{}}`）✓

- **是**：把一个**已声明的值**填进句子（例：`classLabel`／`bgLabel`）。等价于现状 `<<= $pc.classLabel?? ''>>`。
- **不是**：挂整块组件。挂组件 → **块级结构**，放两段散文之间，**不进句子**（承 `#1036` 甲的 `<<=>>` 二分）。

注意：**现状缺口（实测）**：`{{…}}` 在本仓**尚未实现** —— `src/**` 与 `editor/**` 里 `{{` 只出现在 JSDoc 类型注释中，没有解析器。
→ 本文档把它作为**目标形态**写入，实施票是 `#1048`（「取值」的声明面）；**在它落地前，`<<= … >>` 那 3 处没有合法替代**，不能先由门判红。

## 2. JSON 放什么（结构层）

一个故事包 ＝ 一个目录（`editor-pivot.md` §2.1 的目录约定不变）：

| 文件 | 放什么 | 不放什么 |
|---|---|---|
| `00-story.json` | 清单：`slug`／`title`／`entry`／`files`／`audience`／`contractVersion` | 正文 |
| `data/tables.json` | **声明面**：`Checks.sites`／`Economy`／`Combat`／`Gear`／`Items`／`Truth`／`Echoes`／`State.domains`／`Notes.entries` | 条件 |
| `data/rules.json` | **条件表** `rows[]`：条件 ＋ 选中时渲染的文本（见 §3） | 效果算式（`#1049` 甲） |
| `data/contract.json` | **接入契约**：`Sg.story.*` 成员的声明（含 `kind` 封闭集） | 实现 |
| `passages/*.md` | 散文（**文本**，不是 JSON） | 结构 |

**契约成员的 `kind` 封闭集**（**权威＝`editor/lib/core/emit.mjs:82` 的 `KINDS`**，`classify.mjs` 只是它的消费方；复算：`node -e "import('./editor/lib/core/emit.mjs').then(m=>console.log(Object.keys(m.KINDS).length))"` → **12**）：
`empty-object` · `empty-array` · `null` · `const` · `game-ref` · `forward` · `identity-string` · `lookup` · `lookup-field` · `template` · `bool-exists` · `state-ref`。
其中 `forward` 已在 `face-fixture` 使用（`battleDamage`）；`template` **编译器有、故事未用**。逃生舱 `kind:'js'` 的实测清单为空。

## 3. 条件与计算写在哪里（三层，各归其位）

| 层 | 问什么 | 写在哪 | 形状 | 现状 |
|---|---|---|---|---|
| **① 条件**（选哪段文本） | 这条路通不通 | `data/rules.json` 的 `rows[]` | `{scope, req, any, exclude, prereq, prio, text}` | ✅ 引擎已消费（`Sg.rules.pick`）；注意：**唯一内容故事 `night-ferry` 的 `rows` 为空** |
| **② 效果**（改状态） | 走过去发生了什么 | 正文的**具名动作**宏（33 个宣告面） | `<<setflag "ev.x">>`／`<<give "道具">>` … | ✅ 已用；`#1049` 裁定**不另立面** |
| **③ 取值**（填进句子） | 这个值是多少 | 正文的 `{{名字}}` | 名字须**已声明**＝值语义 contract 成员 ∪ `VALUE_LABELS`（`#1048`） | ✅ 已实现（`#1048`） |
| **③′ 点击态写侧**（渲染后**再**改状态） | 点下去那一刻发生了什么 | 行 `text` 里的 `<<if>>`／`<<elseif>>`（只读渲染期槽 `$last_check` 与 `_` 前缀）与 `<<link>>` 体内的词汇宏 | 见 `docs/criterion-design.md:329-332`（`#624`） | ✅ 已裁定在位 |

注意：**两个时机，别混（M8）**：`<<rules>>` 的落地时机是「先渲染 `text` 成功 → 再落三格」（渲染后）；点击态（`<<link>>` 体内）是**另一条时机**——把点击授予改成渲染后授予＝**改变时机＝改变游戏行为**。**J1 对两者的适用**（`docs/criterion-design.md:305` 口径：故事文本＝段落原文 ∪ 行 `text`）：J1 判**宏名**不判参数，两处同守——行 `text` 里出现的禁用内建同样红（`<<if>>` 的 carve-out 是**渲染链白名单**那条裁定，与 J1 的禁用内建清单不冲突：前者管「分支里可读什么」，后者管「哪些内建名根本不许出现」——`<<if>>` 在行 `text` 的白名单内）。

### 3.1 真源在引擎，不在编辑器（否则必漂移）

编辑器**不做自己的词汇表**。`Sg.rules.*` 就是 UI 的 enum（实测于 `src/engine/40-sim/21-resolve.twee:1159`）：

| 面 | 引擎真源 | 用途 |
|---|---|---|
| 键形前缀 | `prefixes: ['inv', 'era', 'gear']` | 键输入框的前缀 |
| 对象算子 | `ops: ['gte', 'lte', 'oneOf']` | 算子下拉 |
| 效果面 | `effects: ['yields', 'gives', 'sets']` | 效果可选项 |
| 取值项 | `terms: ['price']` | 可负担性条件 |

**反沉默口径**：**未宣告 → 抛错**，不是静默为假 —— 引擎不认的前缀／算子会让条件**永假** → 行静默死掉，没有任何门看得见（本仓反复踩过的那一类）。

### 3.2 优先级不靠表序（硬约束）

每行写**显式 `prio`**；选择语义是 `filter(scope)` → **`prio` 降序**（同 `prio` 保持声明序，稳定）→ **first-match wins**。
表序＝隐式语义，最容易烂掉；死行检查住**编辑器 UI**（`editor/lib/core/ruleRows.mjs` 的 `deadRows`，消费方 `rule-rows-view.mjs`——**不是门**，真算法见 `reference-spec.md` §3.2：严格更高 `prio` ＋ 四类包含；同 `prio` 只报告不红；含对象算子保守跳过）。

### 3.3 计算**藏进散文**是这里唯一真正要禁的形态

判据不是「MD 对宏」，而是「**散文对计算**」。当「计算藏进散文」，文件实质是「JS 里夹几句人话」—— 那时 MD 确实没意义。
→ 所以禁的是 `<<set>>`／`<<if>>` 这类**原始计算**（全集见 `FORBIDDEN_BUILTINS` 真源，§2 词汇面同款指路口径）；**具名动作**（§3 的 ②）恰恰相反：它是**词汇**，留在正文正是为了让散文可读、让动作可枚举。

**边界实记（不改写）**：`<<setflag>>`／`<<take>>` 属「具名动作」（留正文）；`<<set>>` 属「原始计算」（出正文）。两者**字面相似、归类不同** —— 这份名单是本设计最容易被误读的地方，故列成判据 J1（`reference-spec.md` §3）而不是留在字缝里。

## 4. 一个内容故事的最小合法集（实测）

> ★**现状（`#1265` 大裁剪后）**：引擎仓内**零故事** —— 故事全在 books 仓。
> 读数（可复核）：在**本仓** `origin/main` 上，`git ls-tree --name-only origin/main` **无顶层 `stories/`**；
> 删除笔 `ec960bc`「大裁剪 —— demo 故事面…」；books 仓 `stories/` 下只有 `north-room`；引擎仓夹具在 `test/fixtures/**/stories/`。
> ⇒ 下面几行是**成文时的实测记录**，其中的 `stories/night-ferry/` 等**当时在仓、现已下架** ⇒ 路径**仅作史料**（✗ 不要照它写新故事）。

成文时 `stories/night-ferry/` 的形态（`audience: content`，当时唯一的 `content` 故事）：

- **入仓件**（12 类）：`00-story.json` · `data/{tables,rules,contract,meta}.json` · `passages/*.md`（11 段）· `audit.json` · `gates/*`。
  产物（`00-meta.twee`／`15-tables.twee`／`17-rules.twee`）**不入仓**（`#1128` 起）。
- 散文层**已落地**：11 段全在 `passages/*.md`（`#1132` 片 3；`#1175` 把 `minimal-demo` 也补齐，三故事同形）。
- **入口件也是产物**：`00-meta.twee` 自 `#1132` B4 起由 `data/meta.json` 经编译步生成（详见 [`json/meta-twee.md`](json/meta-twee.md)）。
- **条件面已被真内容用过**：`night-ferry/data/rules.json` **1 行**（`#1138`：渡口的「问船夫」链接，写 `ev.ferryman_asked`，驱动图鉴线索）。
  注意 与"条件面已实现"是两件事，此处只主张"已被真内容用过一处"（早先"从未被用过"的读数已随 `#1138` 失效）。
- 夹具条件面：`face-fixture/data/rules.json` **49 行**（字段实测 `any/exclude/id/prio/req/scope/text`）。

→ 这两条合起来是本设计最重要的**现状读数**：**「条件面已实现」与「条件面被真内容验证过」是两件事**，本稿只主张前者。

## 5. 两道构建期守卫（都扫"产物面"）

来源：`#1176`（段级语法面）与 `#1185`（产物必有源），均 2026-09-22 落地。

### 5.1 段级语法检查（`#1176`）

- **它查什么**：生成物家族里每个带 `[script]` 标签的段落，其正文交给**真解析器只解析不执行**（`new vm.Script`）。
- **为什么需要**：某次事故形态是"箭头函数后直接跟对象字面量花括号，被解析成块语句；块内字符串标签非法，整段脚本解析失败，
  引擎因此不启动"，症状是 `Game`／`Sg` 都是 `undefined` 且错误**不带 `Uncaught` 前缀**（易被错误过滤漏掉），坏段就这样静默进产物。
- **在哪拦**：`editor/lib/core/segment-syntax.mjs`（纯函数，解析器由宿主注入；core 不依赖 `node:*`）＋
  `editor/lib/host/commands.mjs`（**写出产物之前**拦）＋ `build.mjs`（对树上已存在的生成物再查一次）。
- **覆盖面**：家族谓词取单一权威（`editor/lib/core/generated-family.mjs` 的 `isGeneratedFamily`），含 `00-meta.twee`（它有 `StoryIdentity [script]` 段）。
  实测有牙：往该段注入坏脚本，构建退出码 1 并点名"段 BadMeta：Unexpected token ':'"。

### 5.2 产物必有源（`#1185`）

- **它查什么**：家族里每个生成物都带 `@generated` 标记（标记里写着"源：<路径>"）；**源不在磁盘上而产物仍在**则报，并点名两侧。
- **为什么需要**：源被删而产物残留时，构建与相关门都不红，残留产物会被继续打进包，读者以为源还在
（评审 `#1183` B4 时的非绑定发现；B4 把家族从四类扩到五类，放大了影响面）。
- **在哪拦**：`editor/lib/core/generated-family.mjs` 的 `generatedFamilyProblems`；`build.mjs` 构建期 fail-loud。
- **两向都咬**：删源留产物则红；恢复源或并删产物则绿。

## 6. 元信息承接（`#1132` B4）

来源：`#1132` 块二末片 B4（2026-09-22）。

- `00-meta.twee` 从"唯一手写 `.twee`"改为**产物**，源为 `data/meta.json`（`section`／`title`／`entry`／`ifid`）；
  形状单一权威是 `editor/lib/core/story.mjs` 的 `metaTwee()`。
- `ifid` 是**保真搬运**：三故事的新值与被删手写件的原值逐字节相同（`#1183` 复核用主干历史比对过）。
- 位置语义不变：仍列 `files` 首位；`slug` 与 `StoryIdentity`、`entry` 与 `StoryData.start` 两处一致性判据不变。
- 注意 **待办**：车卡页收编（`#1177`）落地后，本节与 `json/chargen.md` 的对应小节须**同片更新**（挂在 `#1177` 验收里）。
