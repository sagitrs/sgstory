# 手册 · §3 散文面（`passages/*.md` 里能写什么）

> 返回 [手册目录](README.md) ｜ 本节对应大纲 §3。**准入**：本节的断言分两类 ——
> **[锚]**（可机检：宏名／键族／路径）与 **[步骤]**（可复跑：命令＋期望读数）。

## 3.1 **本仓可用宏清单** [锚]

故事散文里**只允许**用引擎**宣告过的**宏。清单**从引擎派生**（✗ 不手抄、✗ 不以本页为准）：

```bash
# 从引擎宣告面派生（`<<widget "名">>` 与 `Macro.add('名', …)` 两处合起来就是"可用宏"全集）
{ grep -rhoE '<<widget "[a-zA-Z]+"' src/ | sed 's/<<widget "//;s/"//'
  grep -rhoE "Macro\.add\('[a-zA-Z]+'" src/ | sed "s/Macro.add('//;s/'//"; } | sort -u
```

**当前派生结果**（36 个；`2026-09-24`，引擎主干 `b1fcc04`）：

| | | | |
|---|---|---|---|
| `actOut` | `applyQuickPreset` | `check` | `checkres` |
| `damage` | `dragonbar` | `econ` | `ending` |
| `eraPresent` | `fightact` | `fightbegin` | `fightlog` |
| `fightpanel` | `firstTime` | `flipEra` | `foeIntent` |
| `foeRound` | `give` | `hpbar` | `inventory` |
| `lastcheck` | `lastcheckFor` | `note` | `notepath` |
| `pickPreset` | `rulelist` | `rules` | `save` |
| `sceneFeedback` | `setflag` | `shortFight` | `sitecheck` |
| `snapshot` | `socpanel` | `socresolve` | `take` |

**怎么复核这张表**：跑上面那条命令 ⇒ 与表**逐个名字**比对（名字集合相等即可，顺序无关）。
名字不在派生结果里 ⇒ 本表过期；派生结果里有名字而表里没有 ⇒ 本表漏收。**两侧都算缺陷** ✓

**逐宏的用途**：以引擎声明处为准（`src/**` 里 `<<widget>>`／`Macro.add` 那一行**上方**的注释）。
旧速查页（`docs/twee-cheatsheet.md`，`#1325` 判为**有害**已删）<!-- path-exempt: 该页已按 #1325 删除，此处是沿革说明 -->里的用途描述**有漂移**（例：它写着
`<<fightresolve>>`、漏了 `actOut`／`firstTime`／`sceneFeedback`／`shortFight`）⇒ **不要再照它写**。
`<<note>>`／`<<notepath>>`：**名字仍在宣告面**，但语义已随 `#1223` 改（内容是数据；见 `#1223` 那批裁定）。

## 3.2 散文里**允许**什么 [锚]

| 类别 | 内容 |
|---|---|
| **允许** | 散文文本 ｜ `[[标签\|目标]]`（边）｜ `{{入参名}}`（**只认本段入参**）｜ `/% payload: … %/`（标记）｜ **具名宏**（= §3.1 那张表） |
| **禁止** | **原始计算内建**（`<<set>>`／`<<if>>`／`<<elseif>>`／`<<for>>`／`<<= …>>`／`=`…）—— 真源＝`test/prose-vocabulary.mjs` 的 `FORBIDDEN_BUILTINS` |
| **不判** | 注释跨度 `/% … %/` ｜ `[script]`／`[widget]`／`[stylesheet]` 段 |

**怎么复核 [步骤]**：

```bash
node test/prose-vocabulary.mjs        # 散文词汇门；零故事态下出声"未判"，接上故事根后即参与判定
```

## 3.3 为什么"故事侧零代码" [锚]

数据与逻辑**不住散文**：状态进 `data/*.json`，控制流进**条件行**（见手册 §5 条件行与规则表），
渲染只在散文里用**具名宏**。这条不是风格，是**可检**的：`test/prose-vocabulary.mjs` 会红。

## 3.4 常见坑 [锚]＋[步骤]

1. **写了一个不在 §3.1 表里的宏** ⇒ 词汇门红 ⇒ 先看是不是**名字拼错**，再看是不是**引擎还没有这个宏**（那就走 §15 流程提需求）。
2. **想写 `<<if>>`** ⇒ 这是**禁则**：分支要么进条件行，要么拆成多段。
3. **`{{名字}}` 取不到值** ⇒ 它**只认本段入参**；引擎态／世界态的值**不走 `{{}}`**（见 `#1234`／`#1236`）。

---

**原文在哪**：本节吸收 `docs/twee-cheatsheet.md` §二（宏清单，改造成 [锚] 形态）<!-- path-exempt: 该页已按 #1325 删除 -->；
允许/禁止的**真源**是 `test/prose-vocabulary.mjs` 与 `docs/engine/json/prose.md` §3（**冲突时以它们为准**）。
