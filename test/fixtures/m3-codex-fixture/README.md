# `m3-codex-fixture`（`#1315` 乙批：图鉴面）

**用途**：服务「**零状态档不泄底**」判据（`test/reread.mjs` 的 R1/R2：零状态档下不得有线索谓词为真／空记录下不得有条目解锁）。

## 跑法
```bash
SG_STORIES_DIR=test/fixtures/m3-codex-fixture/stories node build.mjs      # rc=0 ✓
SG_STORIES_DIR=test/fixtures/m3-codex-fixture/stories node test/reread.mjs
```

## 机制面
```
· containers.Codex.items：1 条目「铜牌」＋ **2 条 clue，两条都带条件**
    { id: c_1, req: ['inv:铜牌'] }／{ id: c_2, req: ['world.seen_b1'] }
  ⇒ ★设计要点：**零状态档下两条都不为真** ⇒ R1 不泄底 ✓
· contract.members：`rules`（空表）＋ `mechanics`（null）—— 只声明引擎必需成员
· 段落：门厅（入口，无必填入参）
```

## 实测读数（本仓主干）
```
build rc=0 ✓
`node test/reread.mjs`（夹具根态）⇒
  ✓ R1 零状态档下图鉴无已解锁线索
  ✓ R2 空图鉴记录下无已解锁条目
```

## ★ 一处**设计要点**（✗ 别拿 `m3-codex-panel` 当它的夹具）
```
`m3-codex-panel` 的 clue 是 `{req: []}` ＝ **无要求 ＝ 恒真**（那件判据要"面板里出现该 clue 的 label" ⇒ 必须恒可见 ✗）
  ⇒ 与 R1「**零状态档下不得为真**」**天然冲突**（同一 clue 不可能同时满足两件）✗
  ⇒ 故本件**另起**（每条 clue 都带条件）—— 与"每能力一件最小夹具"一致 ✓
```
