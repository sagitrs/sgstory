# `m3-chargen-fixture`（`#1315` 乙批：车卡面）

**用途**：服务车卡面判据（`properties.mjs` 的「6 轮车卡形状不变量」那半）。
**当前状态**：★**在主干上跑不出车卡面** ⇒ 阻碍在 **`#1418`**（`Game.Chargen` 未定义的引擎侧段序缺陷）
  ⇒ 本夹具**随 `#1418` 修好一并落地**（照 `#1409`／`m3-hp-e2e` 先例 ✓）

## 跑法
```bash
SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node build.mjs        # rc=0 ✓（产物 18-chargen.twee 正确生成）
SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node test/fixtures/m3-chargen-fixture/repro-chargen-undefined.mjs
```

## 复现读数（本仓主干）
```
1 Sg.story.chargen 类型 = function     ✓（故事面在）
2 Game.Chargen 类型     = undefined    ✗ ← 本缺陷（#1418）
3 Game.Chargen.rounds   = ERR Cannot read properties of undefined (reading 'rounds')
4 手动重建那段逻辑后     = object，rounds=3 ✓ ⇒ 逻辑本身对，只是执行时机不对（反证）
```

## 机制面
```
· data/chargen.json → { rounds:[{title, options:[{name, patch}]}], presets:[{name, picks}] }
    3 轮 × 每轮 2 选；patch 走引擎施加器动词 `set` / `add` / `append`
· contract.members：`hasChargen`(const true，车卡族开关) ＋ rules／mechanics
· 生成物 `18-chargen.twee`（`:: StoryChargen [script]`）⇒ `Sg.story.chargen = () => ({rounds, presets})`
★ 坑（`#1418`）：引擎 `80-script.twee` 的 `if (Sg.story.chargen) Game.Chargen = …` 是**一次性判定**，
  而故事件 `18-chargen.twee` **排在引擎件之后** ⇒ 判定时故事面还没到 ⇒ `Game.Chargen` 永不定义 ✗
