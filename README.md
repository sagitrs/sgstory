# sgstory

0.0.1-alpha 主线已整体归档至分支 `0.0.1-alpha`（2026-09-29 收官，含全部历史与 Issue 上下文）。
master/main 自本提交起重启为空干线。

---

## 规则来源（groundtruth）

本仓 `src/dnd/**` 的**规则数值**（武器伤害骰、护甲 AC、怪物数值块、判定数学）**不是**凭空拟定，
而是取自两份 System Reference Document（SRD）。**凡代码、注释或测试声称「对齐 SRD」，必须按
下节「引用形约定」给出到条目（或行号）的引用** —— 否则数值对错无从复核（本节的设立即为此，见 `#1686`）。

### 一、来源 pin（可复核锚）

`.sha1` 列为**文件内容的 SHA-1 前 16 位**（`sha1sum <文件> | cut -c1-16`），用于校验「取到的确实是同一修订」。

| 面 | 来源仓 | 版本 | pin（commit） | 文件 | 行数 | sha1（前 16） | 授权 |
|---|---|---|---|---|---|---|---|
| **5E** | `downfallx/dnd-5e-srd-markdown` | SRD **5.2.1**（2024） | `1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4` | `rules-glossary.md` | 1537 | `d2e39b22330c2861` | CC BY 4.0 |
| **5E** | 同上 | 同上 | 同上 | `monsters-A-Z.md` | 19563 | `6ef9e2499230a560` | CC BY 4.0 |
| **5E** | 同上 | 同上 | 同上 | `equipment.md` | 2286 | `b027bc54551bf66b` | CC BY 4.0 |
| **3E** | `Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown` | D&D **v3.5** SRD | `70a6b263e68604d8b2fb931937746161f2b65b58` | `Basic Rules and Legal/equipment.md` | 3590 | `44b0c09a7783c8d9` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `Basic Rules and Legal/legal-information.md` | 170 | `0571fa14cf815eb8` | OGL 1.0a |
| **3E** | 同上 | 同上 | 同上 | `3.5 Compendium/Monsters/3.5 Monsters - G.md` | 1827 | `709b744a9f34bdbc` | OGL 1.0a |

**授权与标注**：5E 面依 **CC BY 4.0**（归属声明见 `LICENSE-CONTENT.md` 第二节），3E 面依 **Open Game License v1.0a**
（含 Section 15 版权声明，见同文件第三节）；第三方软件与两面的来源声明汇总见 `NOTICE`。

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
```

### 三、引用形约定（`SRD <版本> · <文件>:<条目>`）

1. **格式**：`SRD 5.2.1 · monsters-A-Z.md:7327`（条目名可代行号：`…:### Goblin Warrior`）；
   3E 面同理：`SRD 3.5 · equipment.md:434`。
2. **必带版本**：两版数值口径不同（例：同一条 exhaustion 规则在 **5.1** 与 **5.2.1** 下完全不同）
   ⇒ 只写「SRD」而无版本**不算引用**。
3. **落在最近的声明点**：数值表／判定函数／测试名上方一行（注释或测试名）写明；一处引用可覆盖其下紧邻的一组同源数值。
4. **命名可能不同**：若本仓条目名与源条目名不一致，引用**以源条目名为准**并注明映射。
   既有实例：`DND5E.Goblin` 的数值对应源 **`Goblin Minion`**（5.2.1 无单独的 `Goblin` 条目，
   其 `Goblin Warrior` AC 15／HP 10 与本仓数值不同）；`DND5E.GoblinBoss` 对应源 `Goblin Boss`。
5. **不许无出处**：新增规则数值时，若源里查不到对应条目 ⇒ 当**本仓自定（house rule）**处理，
   并在注释里写明「house rule（非 SRD）」，不得写成「对齐 SRD」。
