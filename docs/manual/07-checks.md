# 手册 · §7 位点检定与结果维

> 返回 [手册目录](README.md) ｜ 本节对应大纲 §7。**准入**：**[锚]**（可机检：件名／行号／宏名／键形）／**[步骤]**（可复跑：命令 ＋ 期望读数）。
> **★与改制的关系**：本节写的是**数据面**（声明 → 判定 → 结果表 → 条件读取）——**不受 `#1234` 改制影响** ✓。
> 改制动的是"**值怎么传**"（入参／`args`）那一面 ⇒ 见手册 §12 与 `docs/engine/json/prose.md`。

## 7.1 四个面，按顺序走 [锚]

```
① 声明面：`data/tables.json` 的 `Checks.sites` —— 每个站点一条（如「里屋·察觉」`{ abil, dc }`）   权威：`docs/engine/json/tables.md` §2
② 判定面：算＝`Game.Checks.resolve(…)`（纯函数：推导优势 ＋ 掷骰）
③ 结果面：**本次结果表** `State.variables.checks[<站点名>]`（按**站点名**索引；由 `<<checkres>>` 落）   ← ★**present 层也要写它**
④ 读取面：散文里渲染（`<<snapshot>>` ＋ `$last_check`）／条件行里读（`chk:<站点>.<字段>`）
```

## 7.2 故事侧怎么写 [锚]

```
<<sitecheck "里屋·察觉">>      ← widget（`src/10-core.twee:533`）：算 ＋ 落结果 ＋ 渲染
<<snapshot>>                   ← widget（`src/10-core.twee:561`）：把"本次检定"的结果摆成可读的一小段
<<if $last_check.success>> … <</if>>   ← 判定后的分叉（正例形状见 `scripts/audit/gates/sitedisc.mjs:33` 的包装）
```
（`#441-A` 之后，`<<sitecheck>>` 内部改走 `Game.Checks.resolve`（算）＋ `<<checkres>>`（渲染）—— 拆开的理由写在 `src/10-core.twee:322`／`:353`：
把"推导优势 ＋ 掷骰 ＋ 写结果槽 ＋ 渲染"拆开，位点判定才**不必进浏览器**就能驱动 ✓）

## 7.3 结果表的三种读法 ＋ 一条 ★纪律 [锚]

| 读法 | 形状 | 备注 |
|---|---|---|
| 散文渲染 | `$last_check`（`<<snapshot>>` 用） | 只对"最近一次"有效 |
| 条件行 | `chk:<站点>.<字段>` | ★**值面＝按站点名索引的本次结果表**；实现在 `src/engine/40-sim/22-rules.twee:45-58` |
| 机检（用例） | `pc.ev.last_roll` 等运行时槽 | 用例可断言 `.site`／`.dc`（见 `sitecheck-snapshot.json`） |

★**纪律（`#1275` 裁定）**：引用"**本次尚未检定**"的站点 ⇒ **fail-loud 点名报错**（`22-rules.twee:58`），
**✗ 不许静默当 `false`** —— 否则"还没检定"与"检定了但失败"两态**同形**（判据分不开 ✗）。

## 7.4 ★"两侧都齐 ≠ 闭环"（这条是缝出来的，✗ 不是推出来的）

一个取值族/状态维要真的通，**至少三面**都得对：
```
① **命名面**：族配平（`chk:` 进了键族清单）
② **读取面**：读得到（`22-rules.twee` 的 `chk:` 分支）
③ **来源面**：**有人写**（`<<checkres>>` 往 `State.variables.checks` 落 —— `src/10-core.twee:355` 的 `#1275` 注释）
⇒ ★**来源面只能用端到端格**：①② 齐了也照样可以"读不到值"（`#1312` 就是这样：新格式唯一路径 `<<sitecheck>>` ⇒ `<<checkres>>`
   当时**没写**结果表 ⇒ `chk:` 取不到值 ⇒ 只有把故事跑起来才看得见 ✗）
```

## 7.5 [步骤] 可复跑的读数（★带分母）

```bash
# 正例与负控都在夹具的用例面里（★分母＝10；写法见下）★**带对象**：夹具 `test/fixtures/m3-chk-e2e/cases/north-room/` **整个用例面** @ 主干 `0de357e`
SG_STORIES_DIR=test/fixtures/m3-chk-e2e/stories node scripts/case-run.mjs --cases=test/fixtures/m3-chk-e2e/cases
# 期望读数：分母 10 ⇒ 其中 `sitecheck-snapshot`＝正例（断言 `ev.last_roll.site`／`.dc`）、`sitecheck-none`＝负控（没检定就引用 ⇒ 点名/不成立）
#           另有 `m3-chk-e2e`＝`chk:` 的**端到端格**（判"来源面"那一面 ✓）
# 只想跑单例：夹具的 `bash test/fixtures/m3-chk-e2e/run.sh`（★它内部只跑 `--case=m3-chk-e2e` ⇒ **分母 1**）（★**带对象**：夹具 `m3-chk-e2e` 自带单例 @ 主干 `0de357e`）
```

**反例形态（✗ 这样写判不出来）**：
- 只在**纯函数**层测 `resolve()` ⇒ 覆盖不到"**有没有人写结果表**"（那是 present 层的事 ✗）⇒ 必有一条端到端格 ✓。
- 引用"尚未检定"的站点却让它静默 `false` ⇒ "没检定"与"检定了失败"**同形** ✗（纪律 7.3 就是为了把它分开 ✓）。
