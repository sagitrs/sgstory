# `audit.json` 与 `gates/` —— 故事自己的判据面

> 落点纪律：**判据数据不该进产物**（`stories/<slug>/audit.json`，不写进 `15-tables.twee`）。
> 加载器：`scripts/audit/lib/story-audit.mjs`。实况样本：`stories/night-ferry/audit.json` · `stories/night-ferry/gates/`。

## 1. `audit.json`

| 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `note` | `string` | — | 作者自述 |
| `text` | `{ topicWords: string[], styleBlacklist: string[]}` | ✅ | **主题词**／**风格黑名单**的落点（文本门判据） |
| `readBaseline` | `object` | — | 读点基线（`--reads` 门用） |

注意：**必须显式给空，不许省略**：空表＝合法数据集；**不给空表就等于借用别的故事的判据**（`#602` 的旧洞）。

```jsonc
{
  "note": "本故事**显式给空**（空表＝合法数据集）…",
  "text": { "topicWords": [], "styleBlacklist": [] },
  "readBaseline": {}
}
```

## 2. `gates/` —— 故事自己的门与见证件

`gates` 数组在清单 [`00-story.json`](story-manifest.md) 里声明；门代码住 `stories/<slug>/gates/**`。
`night-ferry`（P4 的产物）实测含以下件（注意：**与清单的 `gates` 数组是两回事**：清单 `gates: []` ＝ 不声明"可执行门"；`gates/` 目录里的**见证/基线夹具**照常存在并被 `--equiv` 等消费——别把"目录非空"读成"清单漏登记"）：

| 件 | 作用 |
|---|---|
| `gates/witness.md` | **内容面见证**（P4 验收要件）：说明轨迹怎么产出、怎么复跑 |
| `gates/witness-trace.json` | **冻存的轨迹**：逐步 `{passage, digest, choiceKey}` ＋ `ending` |
| `gates/equiv-baseline/15-tables.twee.txt` | **等价基线**（翻面前的产物副本，**去掉 `@generated` 行**） |
| `gates/equiv-baseline/meta.json` | 基线的元数据：`why`／`source`／`commit`／`regen`／`repinRule` |

### 2.1 `witness-trace.json` 形状

```jsonc
{ "story": "night-ferry", "seed": 1,
  "seedTried": [{ "seed": 1, "steps": 6, "events": 6, "ending": "结局 沉船", "ok": true }],
  "maxSteps": 60,
  "steps": [
    { "passage": "渡口", "digest": "1604bb9b", "choiceKey": "付钱" },
    …
  ],
  "ending": "结局 沉船" }
```

**怎么产出／怎么复跑**（口径：**同一步、同一份文件** —— 它只保证"我读到的这一份"能逐步复跑）：

```bash
node test/walker.mjs --witness --story=night-ferry --min-events=6 --scan=8
node test/walker.mjs --verify=stories/night-ferry/gates/witness-trace.json --story=night-ferry
```

### 2.2 `equiv-baseline/meta.json` 的字段

| 字段 | 含义 |
|---|---|
| `slug` | 故事 |
| `why` | 为什么以此为基线（**新故事没有"翻面前手写原件"** → 基线＝建故事时的产物副本） |
| `source` | 基线从哪来 |
| `commit` / `commitSubject` | 钉在哪个提交 |
| `contractMembers` | 成员数 |
| `shielding` | L3 归一化方式（词法遮蔽注释 ＋ 去空白/冗余尾逗号） |
| `regen` | 怎么重生成 |
| `repinRule` | **重钉纪律**：重钉不许静默 —— 改 `commit` 必须出现在 diff 里 ＋ PR 说明理由；**不许在无关 PR 里顺手 regenerate**（否则门退化成"跟随当前状态"＝没有门） |
| `fileNote` | 为什么文件名后缀用 `.txt`（它是**夹具**：`.twee` 会被加载顺序登记扫到、也会被 K4 的产物扫描选中） |

## 3. 手写注意

- **`audit.json` 是判据面，不是数据面** —— 它**不进 `dist`**，也不参与编译；别把故事数据放这里。
- **基线会过时，这是设计**：数据面任何变更都会让 `equiv` 变红 —— 那是**好事**（红 → 要么改数据不动契约，要么**显式重钉**）。
- 见证件要**冻存**：产轨迹与核验必须在**同一步、同一份文件**上完成（文件被别的任务改写后，旧核验不作数）。
