# 手册 · §12 数据面规范

> 返回 [手册目录](README.md) ｜ 本节对应大纲 §12。**准入**：断言分 **[锚]**（可机检）／**[步骤]**（可复跑）。
> **本节其余小节待写**（`data/*.json` 各件的字段与必填 ⇒ 吸收 `docs/engine/json/*.md`）；先落**与改制相关**的这一小节。

## 12.1 `data/passages.json` —— **已落地**（`#1350` 片 1–5 全落）[锚]

> ★**这不是"今天能用的写法"**：本条是 `#1234` 已冻结的**目标 schema**（冻结原文＝`#1234` `5815699385`）。
> **落地前以现状为准**：今天散文里还能写链接（`[[标签|目标]]`）、条件在 `data/rules.json` 的行里 —— 见手册 §3 与 `docs/engine/json/prose.md` §5。
> 落地后：**散文＝纯模板**（**零链接**）＋ **段的数据**在 `data/passages.json`。

**段落数据**（一份，键＝**段落名**；落点＝`data/` ⇒ 进 `data/*.json` 的**整面自动发现**）：

```json
{
	"门厅": {
		"params": { "提醒": { "type": "string", "required": false, "default": "钥匙在靴里" } },
		"links": [
			{ "label": "翻一翻靴子", "to": "靴子", "slot": "靴子口" },
			{ "id": "门厅.推门", "label": "推门进去", "to": "里屋",
			  "cond": { "req": ["inv:黄铜钥匙"] }, "args": { "提醒": "别进屋" } }
		],
		"present": "菜单",
		"prio": 2,
		"prereq": []
	}
}
```

| 字段 | 含义 | 承担**今天的**什么 |
|---|---|---|
| `params` | 本段**入参声明**（复用契约成员机制：型／必填／默认；默认只许常量或**具名取值**） | 散文里的 `{{名字}}` **只能**用这里声明过的名字 |
| `links[].label` ／ `to` | 一条链接的**文本**／**目标段** | 今天语法 `[[label\|to]]` 的两半 |
| `links[].cond` | 可选条件对象（形状＝规则行的条件字段 `req`／`any`／`exclude`／`prereq`；**求值一处权威**＝`Sg.rules.matches`） | 今天规则行 `data/rules.json` 的条件字段 |
| `links[].args` | 可选**实参**（跳转时把值传给目标段；值／具名取值） | **今天表达不了** ✗（＝要买的新能力） |
| `links[].slot` | 可选**位置**：渲染到散文里**同名 `{{}}` 占位**处；**✗ 不给 ⇒ 段尾块** | 今天**散文内联**链接（有 `slot`）对 **规则行**链接（无 `slot`） |
| `links[].id` | 可选稳定 id（`prereq` 的引用目标） | 今天规则行 `id` |
| `present` | **呈现模式**：`单选` ／ `菜单`（✗ **不许默认单选**） | 今天 `<<rules>>`（单选）／`<<rulelist>>`（菜单） |
| `prio` | 同段多条**互斥变体**的先后 | 今天规则行 `prio` |
| `prereq` | **叙事顺序**：前置的行 id（✗ 不是条件项） | 今天规则行 `prereq` |

> ★**入口段（`00-story.json` 的 `entry`）没有入链 ⇒ ✗ 别放必填入参**：要么给 `default`、要么 `required: false` ✓；
> 想在入口段就展示"值随跳转到达" ⇒ **把注入口放到被到达的段**（用例**先点再断言** ✓）。
> **为什么**：入口段**从不带 `args`** ⇒ `required:true` ＋ 无 `default` 会**永远取不到值**（`build` 当场报"必填但没给值"✗；
> 本仓先例：入口段用 `{required:false, default:…}`、**被到达的段**才用 `{required:true}` ✓）

**三条纪律**（都在冻结里）：

> ★**落地进度（可核，`#1350` 分片）**：**片 2 已落** ✓ —— `{{}}` 的三种展开在**唯一展开点**算出具体标记名
> ★**三支的编译形态以契约 [`docs/engine/json/tables.md`](../engine/json/tables.md) §11.2 为唯一权威**（本节**不重述**形态 —— 否则与实现两处各说一套 ✗）：
> ① 本段入参（`params`）⇒ **引擎侧宏**，值从 **`Sg.inargs` 的闭包缓冲**（按段名键）取（**新一次 `carry` 整体替换** ＝ 一跳清 ⇒ ✗ 不存档 ✓）
> ② 落位占位（`slot`）⇒ **原样保留 `{{名}}`**，由拼装期换成该链接的行（✗ 不是运行时宏）
> ③ 世界态取值 ⇒ **既有形态 `$pc.<名>`**（✗ 不另造宏名）✓
> （判定次序仍为 `slot` ⇒ `params` ⇒ `terms` ✓）
> 其中「**只认本段 `params`**（否则点名）」／「**撞名换维**（与『缺值』不同形）」／「**必填未给 ⇒ 点名**」这三条**随片 2 已落** ✓。
> ★**已落地**（`#1350` 片 1–5 全落 ✓）：`links` 的消费／`present`／`slot` 拼装期落位／**靶两树逐字节同（旧 52 字 ＝ 新 52 字 ✓）** 均已达成 ✓
> **判据**：P1–P4（`test/prose-vocabulary.mjs`，含**三格能假**）＋ `chk:` 的**两态分形**（没传值 ⇒ 点名／传假值 ⇒ 合法 `false` ✓）✓
> ★**真实状态（✗ 不只报"已落地"）**：外根态链读数 **70/75**；剩 5 段（`test-chargen-*`／`test-multi-story`／`test-story-runtime*`）
> 　成因为 **`dist-fresh` 的比较面**（靶数据**真新** ⇒ 该 build；引擎源 mtime 被 checkout 刷新 ⇒ **假新** ✗）⇒ 另笔做"**内容指纹**" ✓
> （转"已落地"的判据＝片 2–4 ＋ `#1350` ⑤⑥ 全绿 ✓）
1. `cond` **不是**第二种条件语言：形状与权威都与规则行**同一套**（✗ 不另立 mini 表达式）。
2. `args` 与 `chk:` **不是**一回事：`chk:` 是**隐式键形**（读本次结果表），`args` 是**显式传值**；
　**且"没传值"（fail-loud 点名）与"传了假值"（合法 `false`）必须分形** ✓
3. `slot` 名与 `params` 名**同一 `{{}}` 命名空间** ⇒ **撞名则红** ✓

**可复跑的靶**（✗ 不另造样本）：`test/fixtures/m3-p1234-pilot/` —— 同一个段的**旧／新两种表达**
（`pilot-old` 今天能跑＝基线；`pilot-new` 是新形态）＋ 验收（两树渲染正文）＋ 各维正例。

```bash
# [步骤] 逐维计数：维 ⇒ 命中数（✗ 不靠人读；0 命中＝该维在靶里没正例）
python3 - <<'PY'
import json
d = json.load(open('test/fixtures/m3-p1234-pilot/stories/pilot-new/data/passages.json'))
cnt = {}
for seg, v in d.items():
    cnt['params'] = cnt.get('params', 0) + len(v.get('params') or {})
    for l in v.get('links') or []:
        for k in ('id','label','to','cond','slot','args','prio','prereq'):
            if k in l: cnt[k] = cnt.get(k, 0) + 1
    for k in ('present','prio','prereq'):
        if k in v: cnt['段.'+k] = cnt.get('段.'+k, 0) + 1
for k in sorted(cnt): print('%-10s %s' % (k, cnt[k]))
PY
# 期望读数（`#1338` 合并时）：args 1 ｜ cond 1 ｜ id 3 ｜ label 4 ｜ params 2 ｜ prereq 1 ｜ prio 2 ｜ slot 1 ｜ to 4 ｜ 段.present 4 ｜ 段.prio 4 ｜ 段.prereq 4
```

**落地顺序**（`#1234` 分工，已完成 ✓）：**靶（本节的例子）⇒ 判据 ⇒ 实现** ⇒ 本节已按"已落地"口径更新 ✓

## 12.2 数据件的**缺省**与"最小合法形"（★✗ 不是"随便空"）[锚]

```
〔口径〕`data/*.json` 的缺件**各有自己的合法缺省**，且**形状不是随便空的** ——
   · **必给成员**（`rules`／`notes`／`pcDefaults`／`starBudget`／`foeState`／`battleDamage`／`mechanics`）⇒ **成员必须声明**（✗ 声明不可去）；
     ★**但对应的 `data/*.json` 文件可以缺**（缺省由引擎供；例：`rules` 缺省＝**空表** ✓）
   · **可选成员**（例：`tables`）⇒ **成员本身可选**（✗ 不强制声明）⇒ 声明与否由**故事面**定（骨架模板默认带 ✓）
〔为什么〕写成"随便空"会**静默产错**：`tables.json` 的编译器读的是 **`containers`**，若写成 `rows` ⇒ `undefined` ⇒ **静默产出一句空赋值** ✗
〔权威（真值）〕
   · 必给成员表：`editor/lib/core/contract-defaults.mjs` 的 **`REQUIRED_MEMBERS`** ✓
   · **最小合法形**（缺省骨架）：`editor/lib/core/story.mjs` 的 `writeStoryPackage` 里那三行 ——
     `tables.json ⇒ { section:'Game Tables', containers:{} }` ／ `contract.json ⇒ { section:'StoryBindings', members:[] }` ／ `rules.json ⇒ { section:'StoryRules', key:'rules', rows:[] }` ✓
     （★该处注释原话：「形状**不是随便空的** —— 三件各有自己的最小合法形」✓）
〔先例（活的 ✓）〕`books` 的 `m3-min-new`：**没有** `data/tables.json` ⇒ `build rc=0` ✓；靶 `pilot-new`：**声明了** `tables` 而**文件缺** ✓
```
