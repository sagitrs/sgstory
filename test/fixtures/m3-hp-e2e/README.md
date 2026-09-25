# `m3-hp-fixture`（`#1409` 缺陷现场）

**用途**：`#1409`（「跳到结局段后 `pc.hp` 变成 NaN」）的**最小现场**。
服务 3 条 hp 面判据（`properties`／`combat-adv`／`fight-seq`）；缺陷修好后即为 `#1315` 乙批首件 ✓

## 跑法
```bash
SG_STORIES_DIR=test/fixtures/m3-hp-fixture/stories node build.mjs        # 期望 rc=0 ✓
SG_STORIES_DIR=test/fixtures/m3-hp-fixture/stories node test/fixtures/m3-hp-fixture/repro-hp-nan.mjs
```

## 复现读数（本仓主干实测）
```
① 开局（pcDefaults 生效）: hp=14 max_hp=14 salves=0        ✓
② 显式设 hp=7 ⇒ 读回 7（typeof number）                    ✓
③ 直接 Engine.play('结局 死亡') ⇒ hp=NaN（max_hp 仍 14）    ✗ ← 本缺陷
```
★ **与 `<<damage>>` 无关、与随机无关** ⇒ 触发点＝**跳/渲染结局段** ✓
★ 反转证据：劫持 `pc.hp` 的 get/set 后再跳 ⇒ 终值正常且**零 SET** ⇒ NaN 出在"**属性被替换/重建那一层**"（✗ 不是某处写坏）✓
★ **生成物不入仓**（`00-meta.twee`／`15-tables.twee`／`17-rules.twee`／`dist` 由 build 生成）：故它们**在清单里**（登记语义）但**不在 git 里** ✓
