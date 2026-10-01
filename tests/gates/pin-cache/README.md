# pin-cache —— groundtruth 源的**离线缓存**（门的取源面）

本目录下的源文件是 `README.md`「规则来源」§一 pin 表所列源的**第三方内容逐字副本（verbatim copy）**——未作任何改动，
其著作权归原权利人，按来源授权分别使用（5E 面 CC BY 4.0／3E 面与 d20m 面 OGL 1.0a，见下表）。它们供
`tests/gates/refs-integrity.mjs` **离线**校验「行数 ＋ sha1 前 16」用。
★**份数以门读数为准**（下表＝pin 表 §一的逐行镜像；两表**须逐行同构** —— 本笔补入 d20m 面时发现本表
原缺 3 行 5E/3E 行（`character-creation.md`／`playing-the-game.md`／`basics-and-ability-scores-3e.md`），
已一并补齐，✗ 只补新面）。

**为何入库**（#1714 判据 6）：门的最大脆弱点是**取源依赖网络**（`gh api` 在 CI 里会受限流/无网影响）。
缓存入库后 CI 全程离线；**缓存缺失时门显式红**，绝不静默跳过。

| 缓存文件 | 来源仓 | 版本 | pin（commit） | 授权 |
|---|---|---|---|---|
| `rules-glossary.md` | `downfallx/dnd-5e-srd-markdown` | SRD 5.2.1 | `1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4` | CC BY 4.0 |
| `monsters-A-Z.md` | 同上 | 同上 | 同上 | CC BY 4.0 |
| `equipment.md` | 同上 | 同上 | 同上 | CC BY 4.0 |
| `character-creation.md` | 同上 | 同上 | 同上 | CC BY 4.0 |
| `playing-the-game.md` | 同上 | 同上 | 同上 | CC BY 4.0 |
| `equipment-3e.md` | `Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown` | D&D v3.5 SRD | `70a6b263e68604d8b2fb931937746161f2b65b58` | OGL 1.0a |
| `legal-information-3e.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `3.5 Monsters - G-3e.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `Monsters - Animals-3e.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `Monsters - Vermin-3e.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `basics-and-ability-scores-3e.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `2msrdbasics基本-d20m.md` | `qt911025/d20m-srd-zhcn` | MSRD（`d20M`） | `1733391d14c7782d2ba24fb7d398725b7a32c9f6` | OGL 1.0a |
| `3msrdabilityscores属性值-d20m.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `25msrdequipmentweaponsandarmor武器与盔甲-d20m.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `2FutureCybernetics-d20m.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `9FutureRobots-d20m.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `1msrdlegal法律信息-d20m.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `27msrdcombat战斗-d20m.md` | 同上 | 同上 | 同上 | OGL 1.0a |
> ★**d20m 面的 §15 vintage**：本目录 `1msrdlegal法律信息-d20m.md`（§15 在 `:49-53`）为
> `Open Game License v 1.0a` ＋ `Modern System Reference Document Copyright 2002-2003`；
> 另有传世本作 `v 1.0` ＋ `2002-2004` 且作者名单多三位 ⇒ **本仓不采**（换 vintage 须换 pin 行 ＋
> 同步 `LICENSE-CONTENT.md` 第二节第四节照录，✗ 混引）。
> ★**行尾**：d20m 面 7 份中 4 份为 **CRLF**（`25msrdequipment…`／`2FutureCybernetics`／`9FutureRobots`）、
> 3 份为 LF ⇒ 缓存是**逐字节副本**，✗ 做行尾归一（sha1 以字节计）。

授权与归属全文见仓根 `LICENSE-CONTENT.md`（5E 面归属）与 `NOTICE`（第三方声明汇总）。

**体量（以门读数为准，不写死数字）**：本目录的**份数**与**逐份行数/sha1** 由门每次机械复核
（`node tests/gates/refs-integrity.mjs` 的「pin 校验」段逐份打印）；需要字节体量时**随时现测**（避免与 pin 表脱节）：
```bash
ls tests/gates/pin-cache/*.md | wc -l                      # 份数（含本说明）
cat tests/gates/pin-cache/*.md | wc -c                     # 本体字节合计（git/byte 口径，非 du 块口径）
```
> 为什么不再写死：原文本写「6 份源合计 1,014,737 B」，`#1724` 增加 3 份源后立刻过期
> ⇒ 改为**口径 + 现测命令**，与 pin 表一样「以机械读数为准」（同 `#1723` NIT-B 的更优解）。
**刷新（仅人工，CI 不用）**——`--refresh` 会联网重取并按 sha1 打印读数：

```bash
node tests/gates/refs-integrity.mjs --refresh
```

刷完须**同时**核对 `README.md` §一 pin 表：若源被上游改写（sha1/行数变化），**表与缓存一并更新**，
并在 PR 里说明「哪一行变了、为什么」。只改缓存不改表（或反之）⇒ 门红。

## 外部复核记录（独立重取，非本席自证）

| 日期 | 复核人 | 方法 | 结果 |
|---|---|---|---|
| 2026-09-30 | `sagitrs-tester-3` | `gh api … ?ref=<pin>` → `wc -l` + `sha1sum \| cut -c1-16`，与 README §一 逐项比 | 当时表内 **5/5 相符**（该次复核时表为 5 行） |
| 2026-09-30 | `sagitrs-tester-4` | 同法（`Accept: application/vnd.github.raw`），独立重取后与表逐项比；并把该比对固化为门内断言 | 当时表内 **5/5 相符**（同上） |
| 2026-09-30 | `sagitrs-writer-2`（d20m 面入表） | 逐份 `gh api …?ref=<pin> -H 'Accept: application/vnd.github.raw'` → `wc -l` ＋ `sha1sum \| cut -c1-16`，与本笔新增的 6 行逐项比；并另以 clone（同 commit）作第二路互校（**逐字节相同**） | 新增 **6/6 相符**；另附三条前置读数：`source/**` 63 文件逐份 CJK 计数 **全 0**／`source/` 无译者注（逐份 `transl|译|TN|note` 扫描，命中均为源文普通用词与源条目「Translator’s Earpiece」）／无 BOM、末行皆有换行 |
| 2026-09-30 | 本仓 PR `#1723`（3E 源入表） | 新增第 6 行（`3.5 Compendium/Monsters/3.5 Monsters - G.md`）后按门读数复核 | **6/6 相符**（见该 PR 的门读数） |

⇒ 各次复核均与**当时**的 pin 表逐项相符（表随新增源而扩张：5 → 6）；自本次起由 `tests/gates/refs-integrity.mjs` 在 CI 上每次机械复核（表 ↔ 缓存 ↔ sha1），故**现行准据以门的 `pin 校验 N/N` 读数为准**，本表只记历史复核。
