# `m3-items-adv-fixture`（`#1315` 乙批：道具·位点优势面）

**用途**：服务「位点优势单调律」（原 `test/properties.mjs` 的 **F 段**）所需的面：
`Items.effects` 的 `advSite`／`advSites` ＋ **位点名**。

## 跑法
```bash
SG_STORIES_DIR=test/fixtures/m3-items-adv-fixture/stories node build.mjs    # rc=0 ✓
```

## 机制面
```
· data/tables.json → containers.Items：
    defs:    { 铜哨, 旧日记, 玻璃珠 }        ← `玻璃珠` **不带任何 adv**（负控）
    effects: { 铜哨: {advSite:'哨位·挥击'},   ← 单点
               旧日记: {advSites:['记位·斩击']} }  ← 多点
· data/contract.json → members：`itemEffect`（lookup，源＝`window.Game?.Items?.effects`，key=`name`）
    ＋ `rules`／`mechanics`（未启用也要声明 ✓）
· 位点名：`哨位·挥击`／`记位·斩击`（被授权）；**另有一位点未被任何道具授权**（用于"未授权位点满配也不吃优势"那格）
```

## 实测读数（本仓主干）
```
itemEffect('铜哨')                      ⇒ {"advSite":"哨位·挥击",…} ✓
advAt('哨位·挥击', {})                   ⇒ **false** ✓（空手一律无优势）
advAt('哨位·挥击', {铜哨:true})          ⇒ **true**  ✓（单点 advSite 生效）
advAt('记位·斩击', {旧日记:true})        ⇒ **true**  ✓（多点 advSites 生效）
advAt('别处·某位', {铜哨:true})          ⇒ **false** ✓（未被授权位点不吃优势）
advAt('哨位·挥击', {玻璃珠:true})        ⇒ **false** ✓（不带 adv 的道具无效）
```

## ★ 一处**实测坑**
```
`itemEffect` 属**数据面**（`pc-state-map` 里 `items: { faces:['itemEffect'], kind:'data' }`），
  但**仍然要显式写进 `contract.members`**（`kind:'lookup', from:'window.Game?.Items?.effects', key:'name'`）
  —— 与 `combatPool`／`combatAction` 同一个坑（见 `m3-combat-fixture/README.md` ①；机制缺口票 `#1419`）：
  只写 `containers.Items.effects` 而漏契约成员 ⇒ `Sg.story.itemEffect` 不存在 ⇒ `advAt` **恒 false**（✗ "数据在但不生效"）
```
