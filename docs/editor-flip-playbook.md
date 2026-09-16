# 编辑器「翻面」操作手册（`#787`）

**一句话**：把 `stories/<slug>/data/*.json` 从"第二份副本"变成**唯一真源** —— tracked 的 `twee` 退化为**产物**，
此后**不许手改**（`editor/k4.mjs` 的 K4-④ 逐字节盯着）。

> 本手册是从**两个已完成的翻面**（`minimal-demo`、`hollow-cave`）里抽出来的可复用流程 ＋ **踩过的坑**（每一步的坑都附在里面，
> 免得下一个故事重踩）。第三个故事（`mist-forest`）与将来的用户故事照它做即可。

## 两条正交的判据（先分清，别让一条兼两职）

| 判据 | 判什么 | 实现 |
|---|---|---|
| **K4-④** | **该不该由数据生成**（来源/结构）：带 `@generated` 的 tracked 文件，字节必须等于**当场从 `data/` 重编**的产物 | `editor/k4.mjs` |
| **`equiv`** | **生成得对不对**（行为）：产物 vs **冻结基线**的容器/契约成员**集合 ＋ 逐成员值/类型** | `editor/equiv.mjs` |

## 七步

### 1. 冻基线（翻面**前**的状态，仓内副本）

```bash
git show <翻面前的 main SHA>:stories/<slug>/15-tables.twee \
  > stories/<slug>/gates/equiv-baseline/15-tables.twee.txt
```

同目录写 `meta.json`，至少含：`source` · `commit`（**SHA**）· `commitSubject` · `contractMembers` · `shielding` ·
**`why`（一行理由）** · `regen` · **`repinRule`**。

- **后缀用 `.txt`**：`.twee` 会被 `scripts/module-order.mjs` 的"加载顺序登记"扫到（未登记即红），而夹具不是可加载模块；
  同时它**不该**被 K4 的产物扫描选中。
- **基线不带 `@generated`**：它就是翻面前的手写件 —— 带上标记会被 K4-④ 逐字节比对（自找麻烦）。
- **不要用"任意一个不动的历史 tag"当基线**：tag 只是**指针**，它可能**早于**若干次正当行为变更 ⇒ 拿它当硬门会在**翻面前就已经红**
  （构造性红）。正解是「**变更前的最后状态**（内容副本 ＋ 记 SHA）」—— 目标是**参照正确**，不是"不动"。
- **理由要写"为什么"**（不写"谁定的"）：让下一个人不必重新勘一遍。

### 2. 门重指向（**同 id**，不新增门）

`scripts/test-plan.mjs` 里给 `editor-equiv-<slug>` 那一行加 `--hand=stories/<slug>/gates/equiv-baseline/15-tables.twee.txt`
（`equiv` 早有 `--hand=<path>` 缝）。⇒ 行为门从「手写 vs 生成」变成「**冻结基线 vs 当前产物**」，判据强度不变。

### 3. 生成产物

```bash
node editor/compile-story.mjs <slug> --out=<dir>
cp <dir>/15-tables.twee stories/<slug>/15-tables.twee     # 带 @generated 头
```

产物文件由**编译器**产出，**不手写**。`17-rules.twee` 只在 `data/rules.json` 存在时才产出（有的故事没有这一份）。

### 4. 验（三条）

```bash
node editor/k4.mjs                      # 字节面：tracked == 当场重编
node editor/equiv.mjs <slug> --l3=report --hand=stories/<slug>/gates/equiv-baseline/15-tables.twee.txt
npm test                                # 全套（golden/size/各故事门都在里面）
```

### 5. 双向反例（**验收核心** —— 证明门不是空转）

```bash
# ① 手改 tracked 产物一行（哪怕一个字符）
#    期望：✗ …/15-tables.twee：与**当场从 data/ 重编**的产物**不一致** ⇒ 有人改了生成物而没改 data（"两处真相"）
# ② 改错 data/ 一项（走完整管线：改 data ⇒ 重编 ⇒ 写回 tracked）
#    期望：✗ L1 契约多实参行为相等：成员 `<名字>` 实参 […]：手写 <旧值> / 生成 <新值>
```

两者还原后都必须回绿。**②** 尤其重要：它证明**行为面**在真比，而不是"跑了一圈没问题"。

### 6. 重签基线（顺序是判据的一部分）

```bash
npm run build && node test/audit-golden.mjs --update && git add -A && node test/audit-golden.mjs   # 复核逐字节一致
```

- **先 `build`**：陈旧 dist 会让 `audit-golden` 报**一屏**级联（实测 32 个开关），而根因只有一个 ⇒ 一个清楚的红胜于一片 ✗；
- **点名**签了哪些开关 ＋ 为什么（"可见性/登记"效应 ≠ 漂移）；
- **后合者签**；**绝不预签**（预签＝把"尚未落地的状态"写进基线）。

### 7. 合入

非作者合入；合入后**产物不许手改**（K4-④ 会当场点名"两处真相"）。

## 已踩过的坑（按族的根因）

| 症状 | 根因 | 现已被什么挡住 |
|---|---|---|
| 产物里出现 `:: undefined [script]`（无名段落 ⇒ 一批门集体失准） | 数据缺 `section` 字段 | 编译期 **fail-loud**（段名必填） |
| 6 个成员读 `window?.MECH?.…` ⇒ 静默 `null`/`0`/`[]` | **局部常量**被当成全局根 | 编译期 `GLOBAL_ROOTS` fail-loud（报文**点名成员**）＋ 新形状 **`fromMember` ＋ `path`**（指向同产物里的声明式成员） |
| `chestGold` 手写 `0` / 生成 `null` | `fromMember` 漏了 `lookup.default` | 等价判据的**输入语料**扩到"契约自身内联数据里的键"（探针 858 → 3410 次） |
| 改声明面不再生效（运行期测试三条倒） | 对象 `const` 被内联成 `() => ({…})` ⇒ **每次新对象**（丢同一性） | 对象/数组 `const` 提升为文件顶部 `__const_*`，成员体返回它 |
| 守卫报"白名单腐烂：某条已不再命中" | 白名单条目**不带失效条件** | 条目**自带退役条件**（"接缝做完就删"）⇒ 接缝完成那一刻自己喊出来；剪除必须在**状态改变之后** |
| rebase 后"重签"提交冲突 | "重签"描述的是**状态**，不是意图 | 通则：**重签提交不许回放** ⇒ rebase 丢弃它，落地后在新态上重签一次 |

## 三条贯穿的纪律

1. **登记物／签名只描述既成状态**；回放与预签都没有意义。
2. **判据的红要讲人话**（崩溃栈会让人误判"环境坏了"）；**"缺一半"必须是红，不能是空**。
3. **逐项三件套**：报告差异一律给「成员／实参／两版值」（或 文件:行 ＋ 症状 ＋ 根因）。
