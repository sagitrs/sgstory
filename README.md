# sgstory

0.0.1-alpha 主线已整体归档至分支 `0.0.1-alpha`（2026-09-29 收官，含全部历史与 Issue 上下文）。
master/main 自本提交起重启为空干线。

---

## 测试工具

测试工具根：tests/
<!-- test-tool-root: tests/ -->
本目录收纳单元测试、端到端测试，以及门与 pin-cache 的台账；索引见 [`tests/README.md`](tests/README.md)。

有一处根外的具名例外：[`stories/babel/verify.mjs`](stories/babel/verify.mjs)，它是故事侧的装配自检，随故事一起走。
这里不声称「唯一根」，因为反向搜索已经证实存在竞争根。声明的口径是**逐处具名**：根行一行，例外行一行；
将来新增根外工具时，须在同一处具名（依据 `gsvector-process#300` 条款④）。工具退役或移动时，须同步更新本声明
（依据 `gsvector-process#300`，以及 `tester.md` 的「测试工具落盘与复用」一节）。

---

## 规则来源（groundtruth）

本仓 `src/dnd/**` 下的**规则数值**（武器伤害骰、护甲等级 AC、怪物数值块、判定数学）并非凭空拟定，
而是取自两份 System Reference Document（SRD，系统参考文档）。凡代码、注释或测试声称「对齐 SRD」，
都必须按下一节的「引用形约定」给出到条目或行号的引用；否则数值的对错无从复核。本节的设立正是为此，见 `#1686`。

### 一、来源 pin（可复核锚）

`.sha1` 列是**文件内容的 SHA-1 前 16 位**（`sha1sum <文件> | cut -c1-16`），用于校验取到的确实是同一修订。

| 面 | 来源仓 | 版本 | pin（commit） | 文件 | 行数 | sha1（前 16） | 授权 |
|---|---|---|---|---|---|---|---|
| **5E** | `downfallx/dnd-5e-srd-markdown` | SRD **5.2.1**（2024） | `1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4` | `rules-glossary.md` | 1537 | `d2e39b22330c2861` | CC BY 4.0 |
| **5E** | 同上 | 同上 | 同上 | `monsters-A-Z.md` | 19563 | `6ef9e2499230a560` | CC BY 4.0 |
| **5E** | 同上 | 同上 | 同上 | `equipment.md` | 2286 | `b027bc54551bf66b` | CC BY 4.0 |
| **5E** | 同上 | 同上 | 同上 | `character-creation.md` | 1627 | `0327516c33fe44ca` | CC BY 4.0 |
| **5E** | 同上 | 同上 | 同上 | `playing-the-game.md` | 1269 | `de890718617fb1af` | CC BY 4.0 |
| **3E** | `Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown` | D&D **v3.5** SRD | `70a6b263e68604d8b2fb931937746161f2b65b58` | `Basic Rules and Legal/equipment.md` | 3590 | `44b0c09a7783c8d9` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `Basic Rules and Legal/legal-information.md` | 170 | `0571fa14cf815eb8` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `3.5 Compendium/Monsters/3.5 Monsters - G.md` | 1827 | `709b744a9f34bdbc` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `3.5 Compendium/Monsters/3.5 Monsters - E.md` | 795 | `eda11fadab95f31e` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `Monsters/Monsters - Animals.md` | 2382 | `c14af45a23bc039e` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `Monsters/Monsters - Vermin.md` | 650 | `15ac359e11f4ad78` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `Basic Rules and Legal/basics-and-ability-scores.md` | 296 | `ddf4d4fec8a75621` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `Basic Rules and Legal/combat-ii-movement-modifiers-and-special-actions.md` | 1446 | `6c6a532defd4d85b` | OGL 1.0a |
| **d20m** | `qt911025/d20m-srd-zhcn` | `d20M` | `1733391d14c7782d2ba24fb7d398725b7a32c9f6` | `source/1Modern现代/2msrdbasics基本.md` | 43 | `4c0c176d4c1b1110` | OGL 1.0a |
| **d20m** | 同上 | 同上 | 同上 | `source/1Modern现代/3msrdabilityscores属性值.md` | 74 | `05adfce1847f2e8b` | OGL 1.0a |
| **d20m** | 同上 | 同上 | 同上 | `source/1Modern现代/25msrdequipmentweaponsandarmor武器与盔甲.md` | 950 | `ed12b1236b35064e` | OGL 1.0a |
| **d20m** | 同上 | 同上 | 同上 | `source/4Future未来/2FutureCybernetics.md` | 419 | `7494bfdf73b0c41d` | OGL 1.0a |
| **d20m** | 同上 | 同上 | 同上 | `source/4Future未来/9FutureRobots.md` | 822 | `ed0bd344862d8d52` | OGL 1.0a |
| **d20m** | 同上 | 同上 | 同上 | `source/1msrdlegal法律信息.md` | 55 | `87de6c063a445aa5` | OGL 1.0a |
| **d20m** | 同上 | 同上 | 同上 | `source/1Modern现代/27msrdcombat战斗.md` | 1079 | `919704002031c35e` | OGL 1.0a |

**授权与标注**：5E 面依 **CC BY 4.0**，其归属声明见 `LICENSE-CONTENT.md` 第二节。**3E 面与 d20m 面同为 OGL 1.0a，
但两面的 Section 15 COPYRIGHT NOTICE 各自不同**，见同文件第三节与第四节。第三方软件与三面的来源声明汇总见 `NOTICE`。

d20m 面的「版本」列取值**是引用 token `d20M`，而不是数字版本**：MSRD 没有数字版本号，
本仓因此以短 token 登记面集（决定见 `#1740` 领队裁定 2）。其 §15 的 **vintage** 以 `LICENSE-CONTENT.md`
第四节的照录正文为准；本笔的 pin 处写的是「Open Game License v 1.0a」与
「Modern System Reference Document Copyright **2002-2003**」。

### 二、复现（重取并校验）

```bash
# 5E 面（示例：rules-glossary.md）
gh api "repos/downfallx/dnd-5e-srd-markdown/contents/rules-glossary.md?ref=1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4" \
  -q .content | base64 -d > rules-glossary.md
wc -l rules-glossary.md            # ⇒ 1537
sha1sum rules-glossary.md | cut -c1-16   # ⇒ d2e39b22330c2861

# 3E 面（示例：equipment.md）
gh api "repos/Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown/contents/Basic%20Rules%20and%20Legal/equipment.md?ref=70a6b263e68604d8b2fb931937746161f2b65b58" \
  -q .content | base64 -d > equipment-3e.md
wc -l equipment-3e.md              # ⇒ 3590
sha1sum equipment-3e.md | cut -c1-16     # ⇒ 44b0c09a7783c8d9

# d20m 面（示例：2FutureCybernetics.md；源文件路径含子目录与中文名，须整体 URL 编码）
gh api "repos/qt911025/d20m-srd-zhcn/contents/source/4Future%E6%9C%AA%E6%9D%A5/2FutureCybernetics.md?ref=1733391d14c7782d2ba24fb7d398725b7a32c9f6" \
  -H 'Accept: application/vnd.github.raw' > 2FutureCybernetics-d20m.md
wc -l 2FutureCybernetics-d20m.md   # ⇒ 419
sha1sum 2FutureCybernetics-d20m.md | cut -c1-16   # ⇒ 7494bfdf73b0c41d
```

d20m 面的源文件**行尾不统一**：本笔五份当中，basics 与 ability-scores 是 LF，其余三份是 **CRLF**。
因此 pin-cache 是**逐字节副本**，**不做行尾归一**，因为 sha1 按字节计算，归一即失配。
取源可以走 `gh api` 的 `-H 'Accept: application/vnd.github.raw'`（与门的 `--refresh` 是同一调用面），
也可以经 clone 取得；同一个 commit 下两路结果逐字节相同，本笔两路互校过。

### 三、引用形约定（`SRD <版本> · <文件>:<条目>`）

1. **格式**是 `SRD 5.2.1 · monsters-A-Z.md:7327`，条目名可以代行号，例如 `…:### Goblin Warrior`。
   3E 面同理，例如 `SRD 3.5 · equipment.md:434`。d20m 面用**短 token**，例如
   `SRD d20M · source/4Future未来/9FutureRobots.md:140`；MSRD 没有数字版本，于是 token 代版本位。
   带目录的 pin 行**须写全路径**，不能只写 basename。
2. **必带版本**。不同版本的数值口径不同，例如同一条 exhaustion 规则在 **5.1** 与 **5.2.1** 下完全不同，
   因此只写「SRD」而没有版本或 token，**不算引用**。
3. **引用落在最近的声明点**：数值表、判定函数或测试名的上方一行（注释或测试名）写明；
   一处引用可以覆盖其下紧邻的一组同源数值。
4. **命名可能不同**。若本仓条目名与源条目名不一致，引用**以源条目名为准**，并注明映射关系。
   映射是**数据**而不是约定，其**单一权威源**是 `tests/gates/name-map.json`；该文件机器可读，
   门 `refs-integrity.mjs` 直接消费它，并校验所引源行确为该条目。本节只立约定与指针，**不复述映射数据**。
   下面两例仅供读者指引，**并非权威**；明细与新例一律以该表为准：
   `DND5E.Goblin` 对应 `Goblin Minion`，`DND5E.GoblinBoss` 对应 `Goblin Boss`。
5. **不许无出处**。新增规则数值时，若源里查不到对应条目，应当按**本仓自定（house rule）**处理，
   并在注释里写明「house rule（非 SRD）」，不得写成「对齐 SRD」。
