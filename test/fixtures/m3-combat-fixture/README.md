# `m3-combat-fixture`（`#1315` 乙批：战斗面）

**用途**：服务两条战斗判据 —— `test/combat-adv.mjs`（跨回合优势）／`test/fight-seq.mjs`（同种子序列对照）。
**形状来源**：照 `books#15`（battle-demo 形态清单）的**机制面**；✗ 不抄其剧情（段名／文案全为本夹具自有）。

## 跑法
```bash
SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node build.mjs         # rc=0 ✓
SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node test/combat-adv.mjs
```

## 机制面（本夹具声明了什么）
```
· data/tables.json → containers.Combat：
    pools:   { 雾影: [雾影·挥击, 雾影·突刺, 雾影·盘绕] }
    actions: 三条（ok/crit/bad{hurt}；`雾影·盘绕` 的 crit 带 `adv:1` ⇒ 服务跨回合优势）
  containers.State.domains.foe：具名对手状态域（护身符面 `foeState` 走它）
· data/contract.json → members（★ 关键：**战斗面必须显式声明这两个成员**）：
    combatPool:   { kind:'lookup', from:'Game.Combat.pools',   key:'id', default:null }
    combatAction: { kind:'lookup', from:'Game.Combat.actions', key:'id', default:null }
    ＋ foeState(state-ref, path:'foe')／battleDamage(forward to Game.Items.battleDamage)
· 段落：门厅（入口，无必填入参）⇒ 斗（<<fightbegin "雾影">>＋<<fightpanel>>＋<<fightlog>>）⇒ 结局 胜／结局 败（ending:final）
```

## 两条实测读数（本仓主干）
```
① build rc=0 ✓（生成物 00-meta/15-tables/17-rules 不入仓，但在 files 清单里登记）
② 进「斗」段后：offer = ["雾影·突刺","雾影·盘绕","雾影·挥击"] ✓
                eligible("雾影") = 3 条 ✓ ｜ 屏上可点 = 3 个 ✓
```

## ★ 一处**关键坑**（留给下一位，我实测踩过）
```
`combatPool`／`combatAction` **不会**从 `containers.Combat` 自动派生 ⇒ 必须**显式写进 `data/contract.json` 的 members**：
  缺它们 ⇒ 产物 `StoryBindings` 里没有这两个成员 ⇒ `Game.Combat.eligible()` 调 `Sg.story.combatPool?.()` 得 undefined ⇒ **池恒空**
  表现＝`offer=[]`、屏上无可点、`eligible=[]`（而 `Game.Combat.pools` 明明有 3 条 ⇒ 看起来"数据在但不生效"）
★ 另：**build 是增量的** —— 改了 `data/*.json` 而磁盘上还有旧产物 ⇒ 仍用**旧产物**（我实测：pool 改了但 `15-tables.twee` 里还是旧的一条）
  ⇒ 只信产物前请先 `rm -f stories/<slug>/*.twee`（或整目录 `build`）再 build ✓
```
