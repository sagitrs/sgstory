# `fruit-demo-fixture`（`#1609` 用例套接线审计 · **固化件**）

**用途**：把 books `fruit-demo` 的 **7 条行为用例**固化进**引擎**仓 —— ★**自持 story 形态**（本夹具**自带**故事快照 ⇒ ✗ 指向 books 仓 ✓）。

## 来路（★防漂移，✗ 到这里追新）

```
★故事面 ＝ `sagitrs/sgstory-books` 的 `stories/fruit-demo` **快照**（`#1609` 时点 ✓）
★用例面 ＝ 该书同名的 7 条（`enter`／`pick-and-eat`／`eat-then-exit`／`full-chain`／`no-eat-no-exit`／
   `mood-by-value`／`mood-below`）—— ★它们**原随 `cases/` 在 `books#58` 一并删除** ⇒ 本夹具从 git 历史取回后固化 ✓
★★**语料面归 M5 编译链**（`test/corpus-books-smoke.mjs` 对着 books `main` 跑 ✓）⇒ ★**✗ 到这里追新**：
   本夹具看护的是**引擎能力面**（值门／状态写／链接可见性），✗ 不是"最新故事内容" ✓
```

## 跑法

```bash
node test/fruit-demo-cases.mjs             # 判据件：真 build ＋ 真 case-run ＋ 能假刀（端到端）
node test/fruit-demo-cases.mjs --selftest  # 只跑纯函数面（计数判据／提交面）
```

## 机制面（本夹具锚住的三件事）

```
① **值门**：`{"gte": ["心情.值", 65]}`（★首操作数＝**字符串键** ＝ `docs/engine/json/rules.md` 的规范形 ✓）
   ⇒ 值够才出现那条链接（★这正是 `#1607` 曾打破又修好的那一形 ✓）
② **状态写**：`adds`（裸键 ⇒ `ev.` 前缀 ✓）
③ **链接可见性**：`expect.visible` ／ `expect.absent`（**能力面** ⇒ ✗ 逐字散文 ✓）
```

## 提交面（★生成物 ✗ 入仓）

```
✓ 入仓（**10 件**）：`00-story.json` ＋ `data/*.json` ×5 ＋ `passages/*.md` ×4
✗ 不入仓：`00-meta.twee`／`1[5-9]-*.twee`／`audit.json` —— build 生成；`.gitignore` 的 fixtures 变体已忽略 ✓
★判据件 ⑤ 两格盯着这件事（★手跑 build 留下的生成物也会被它看见 ✓）
```
