# pin-cache —— groundtruth 源的**离线缓存**（门的取源面）

这六个文件是 `README.md`「规则来源」§一 pin 表所列源的**第三方内容逐字副本（verbatim copy）**——未作任何改动，
其著作权归原权利人，按来源授权分别使用（5E 面 CC BY 4.0／3E 面 OGL 1.0a，见下表）。它们供
`tests/gates/refs-integrity.mjs` **离线**校验「行数 ＋ sha1 前 16」用。

**为何入库**（#1714 判据 6）：门的最大脆弱点是**取源依赖网络**（`gh api` 在 CI 里会受限流/无网影响）。
缓存入库后 CI 全程离线；**缓存缺失时门显式红**，绝不静默跳过。

| 缓存文件 | 来源仓 | 版本 | pin（commit） | 授权 |
|---|---|---|---|---|
| `rules-glossary.md` | `downfallx/dnd-5e-srd-markdown` | SRD 5.2.1 | `1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4` | CC BY 4.0 |
| `monsters-A-Z.md` | 同上 | 同上 | 同上 | CC BY 4.0 |
| `equipment.md` | 同上 | 同上 | 同上 | CC BY 4.0 |
| `equipment-3e.md` | `Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown` | D&D v3.5 SRD | `70a6b263e68604d8b2fb931937746161f2b65b58` | OGL 1.0a |
| `legal-information-3e.md` | 同上 | 同上 | 同上 | OGL 1.0a |
| `3.5 Monsters - G-3e.md` | `Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown` | D&D v3.5 SRD | `70a6b263e68604d8b2fb931937746161f2b65b58` | OGL 1.0a |

授权与归属全文见仓根 `LICENSE-CONTENT.md`（5E 面归属）与 `NOTICE`（第三方声明汇总）。

**体量（实测口径）**：6 份源文件本体合计 **1,014,737 B**；含本说明文件后本目录内容合计 **1,016,781 B**（git 口径，非 `du` 块口径）。

**刷新（仅人工，CI 不用）**——`--refresh` 会联网重取并按 sha1 打印读数：

```bash
node tests/gates/refs-integrity.mjs --refresh
```

刷完须**同时**核对 `README.md` §一 pin 表：若源被上游改写（sha1/行数变化），**表与缓存一并更新**，
并在 PR 里说明「哪一行变了、为什么」。只改缓存不改表（或反之）⇒ 门红。

## 外部复核记录（独立重取，非本席自证）

| 日期 | 复核人 | 方法 | 结果 |
|---|---|---|---|
| 2026-09-30 | `sagitrs-tester-3` | `gh api … ?ref=<pin>` → `wc -l` + `sha1sum \| cut -c1-16`，与 README §一 逐项比 | **5/5 相符** |
| 2026-09-30 | `sagitrs-tester-4` | 同法（`Accept: application/vnd.github.raw`），独立重取后与表逐项比；并把该比对固化为门内断言（`pin 校验 5/5`） | **5/5 相符** |

⇒ 两席**各自独立**取源闭合，且自本次起由 `tests/gates/refs-integrity.mjs` 在 CI 上每次机械复核（表 ↔ 缓存 ↔ sha1）。
