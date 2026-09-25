# `m3-combat-fixture`（`#1315` 乙批：战斗面）

**用途**：服务战斗判据。本笔接**`test/combat-adv.mjs`**（跨回合优势）；`fight-seq` 暂未接（它依赖旧故事专属机制，见下）。
**形状来源**：照 `books#15`（battle-demo 形态清单）的**机制面**；段名与文案为本夹具自有（✗ 不抄其剧情）。

## 跑法
```bash
SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node build.mjs              # rc=0 ✓
SG_STORIES_DIR=test/fixtures/m3-combat-fixture/stories node test/combat-adv.mjs   # rc=0 ✓
```

## 机制面（本夹具声明了什么）
```
· data/tables.json → containers.Combat：pools{雾影:[挥击,突刺,盘绕]} ＋ actions（ok/crit/bad{hurt}；
    「雾影·突刺」的 ok 与 crit **都带 `adv:1`** ⇒ 服务跨回合优势）
· data/tables.json → containers.Checks.sites：**每个位点一条**（`雾影·挥击`/`雾影·突刺`/`雾影·盘绕`）
    ＋ **对手位点 `雾影`**（对手检定走 `<<fightpanel "雾影">>` 的第一个参数 ⇒ 必须也在 sites 里）
· data/tables.json → containers.State.domains.foe（具名对手状态域）
· data/contract.json → members：`foeState`(state-ref, path:'foe')／`battleDamage`(forward)／
    **`combatPool`／`combatAction`（lookup，源＝Game.Combat.pools／actions）**／`checkSite`(lookup)／
    `pcDefaults`(const，带 abilities 与 hp)／`hasChargen`(const false)／`rules`／`mechanics`
· 段落：门厅 ⇒ 斗（`<<fightbegin "雾影">>`＋`<<fightpanel "雾影" false>>`＋`<<fightlog>>`）⇒ 结局 胜/败（`ending:final`）
```

## 实测读数（本仓主干）
```
· build rc=0 ✓
· 进「斗」后 offer=["雾影·突刺","雾影·盘绕","雾影·挥击"] ✓｜eligible=3 ✓｜屏上可点=3 ✓
· `node test/combat-adv.mjs` ⇒ **rc=0** ✓（报文：跨回合优势生效：5 手在结转优势下掷骰）
```

## ★ 四处**实测坑**（留给下一位；每条我都真踩过）
```
① `combatPool`／`combatAction` **不会**从 `containers.Combat` 自动派生 ⇒ 必须**显式写进 contract 的 members**
   缺它们 ⇒ 产物无这两成员 ⇒ `eligible()` 得 undefined ⇒ **池恒空**（而 `Game.Combat.pools` 有数据 ⇒ "数据在但不生效"）✗
② `<<fightpanel>>` **必须带参**：`<<fightpanel "<对手位点>" false>>`
   —— `fightact`／`resolveFoe` 用 `$args[0]` 当**对手检定位点** ⇒ 不传 ⇒ `s` 为 null ⇒ 崩在 `s.dis` ✗
③ `Checks.sites` 的 `skill` 要**技能名**（`运动`／`体操`／`察觉`…），✗ 不是属性缩写（`str`/`dex`）
   —— 写 `dex` ⇒ `未知技能: dex` ✗（合法表在 `src/10-core.twee` 的 `Rules.SKILLS`）
④ **对手位点也要进 `Checks.sites`**（本例＝`雾影`）—— 只列玩家动作位点 ⇒ 对手那一轮检定崩 ✗
★ 另：**build 是增量的** —— 改了 `data/*.json` 而磁盘上仍有旧产物 ⇒ 用旧产物（实测：pool 改 3 条后产物仍 1 条）
  ⇒ 只信产物前先 `rm -f stories/<slug>/*.twee` ✓
```

## `fight-seq` 为何**本笔未接**
```
它依赖旧故事专属机制：`Game.Dragon.hp`／`pc.keeper`／`pc.inv['好哨']`／`月光花`＋"备药优先"自动选牌
  ⇒ 换成最小夹具需**另设计一组等价场景**（含"自动选牌"那一支的覆盖面）⇒ 属**单独一笔**（✗ 不硬搬）
```
