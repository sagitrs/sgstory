# `m3-chk-e2e` —— `chk:` 族的**端到端绑定件**（`#1275`）

## 它抓什么

`#1312`（`chk:` 取值面）那次，**判据面全绿而能力在新格式里不通**：

- `test/readkey-family.mjs` 锁的是「**抽取面族集合 ≡ 引擎族集合**」⇒ 绿；
- 取值面本身也齐 ⇒ 绿；
- 但**写入点落在 `<<check>>`／`<<save>>`**，而新格式故事走的是 `<<sitecheck>>` ⇒ `<<checkres>>` ⇒
  **结果表 `State.variables.checks` 从来没被写** ⇒ `chk:<站点>.success` 既取不到真值、引用它还会**当场抛错**。

⇒ 这条夹具就是**只有端到端才能判**的那一面（纯函数覆盖不到：写入属 present 层）。
**一句话**：**「两侧都齐」不等于「闭环」** —— 取值族／状态维至少三面：**命名面 ＋ 读取面 ＋ 来源面**，来源面只能用这类端到端格。

## 面归属（✗ 不互相替代）

| 面 | 判什么 | 由谁承担 |
|---|---|---|
| **呈现面**（本夹具） | 玩家**看得见的效果**：该行（`[[桌上那点光\|结局 收好]]`）在检定成功后出现 | `cases/north-room/m3-chk-e2e.json` |
| **数据面（来源面）** | 表**在场且取值正确**：`State.variables.checks['里屋·察觉']` 存在、`.success === true`、`.dc === 10` | `#1275` 的来源面格（引擎侧判据） |

⇒ **判能力锚数据面／判内容锚呈现面**：两面各在其位。本夹具**不作**数据面断言（那是来源面格的活），
来源面格也**不替代**本夹具（它判不到"玩家是否真的看到"）。

## 形状与来源

```
stories/   ← 取自 sagitrs/sgstory-books 的 **a57d08a7**（books 主干）的一份副本，只改三处：
  ① stories/north-room/data/rules.json
       加一行 里屋.看过（scope=里屋，prio=1，req=["chk:里屋·察觉.success"]，text="[[桌上那点光|结局 收好]]"）
  ② stories/north-room/passages/03-里屋.md
       末尾加渲染点 <<rules "里屋">>（在既有 <<sitecheck "里屋·察觉">><<snapshot>> 之后 ⇒ 同段内"先判后读"）
  ③ cases/north-room/m3-chk-e2e.json
       驱动进里屋 ⇒ 该行应出现
位点表（Checks.sites['里屋·察觉']）与 <<sitecheck>> 本身 books 主干已有 ⇒ 未另加。
```

**漂移政策**：
- 本夹具的要点**就是这三处差异**；其余部分**跟着 books 走**。
- **故事面变化时重新取副本**（改 books 的 `stories/**` 之后，本夹具的 `stories/` 应同步重取，并在本文件更新上面的 sha），
  否则这里会慢慢变成"另一份故事"（那时它判的就不再是 books 的真实形态）。
- 放在 `test/fixtures/**` 之外不落 `stories/**`（经 `SG_STORIES_DIR` 喂入）⇒ 引擎仓自己的故事根仍是 0 件。

## 怎么跑

**首选（一条命令，顺序不用记）**：

```bash
bash test/fixtures/m3-chk-e2e/run.sh          # 在引擎仓任意位置都可
```

`run.sh` 做三件事：**清生成物 ⇒ build ⇒ 跑用例**，退出码＝用例执行器的退出码。它存在的理由不是省事，
而是把「**必须先清**」从**记忆**变成**结构**：本夹具的产物（`1[5678]-*.twee`／`00-meta.twee`／`dist/`）
**被 `.gitignore` 忽略** ⇒ `git status` 看不出它们还在 ⇒ 忘了清时 build 会「按件在」**复用旧产物** ⇒
你在**两个引擎态下会读到同一个结论**（那时它判的不是修复，而是旧故事）。

**手动等价配方**（想知道每一步是什么时用）：

```bash
F=test/fixtures/m3-chk-e2e
rm -f "$F"/stories/*/1[5678]-*.twee "$F"/stories/*/00-meta.twee && rm -rf "$F"/dist
SG_STORIES_DIR="$F/stories" node build.mjs
SG_STORIES_DIR="$F/stories" node scripts/case-run.mjs --cases="$F/cases" --case=m3-chk-e2e
```

> ★**若你在两个引擎态下拿到相同读数**，先别下结论 —— 那说明这次跑的很可能**不是修复**：
> 按上面**先清**再跑；能假格的必要条件是「**修复前红、修复后绿**」。
> 本夹具的两态读数见文末「修前／修后读数」，可当尺对照。

（`test/fixtures/**/stories/*/1[5678]-*.twee` 与 `…/00-meta.twee` 已在 `.gitignore` 覆盖 ⇒ 跑完树仍是干净的。）

## 修前／修后读数

- **修前**（2026-09-24，引擎 `20e30b42`）：
  `✗ visible: 桌上那点光` ⇒ `未归因 1 ⇒ rc=1`；
  同一页面文本里可见 `Error: cannot execute macro <<rules>>: …引用了「本次尚未检定」的站点` ⇒
  **fail-loud 把缺口喊出来了** —— 这条语义**必须保留**（取不到就当 `false` ＝ 静默恒假 ✗）。
- **修后应**：该行出现（`✔`）。另两格一并看：
  ① **不检定就引用** ⇒ 仍按 fail-loud 抛错点名；
  ② `<<check>>`／`<<save>>` 既有路径**行为不变**（它们本来就写表）。
