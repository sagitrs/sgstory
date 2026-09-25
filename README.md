# sgstory · Twine + SugarCube 引擎

**一句话**：一个**通用**的文字冒险引擎 —— **Twee／Markdown 源 → 编译成单文件 HTML**；剧情用 git 管理，构建走 CLI。

> ★**本仓是引擎仓，不与特定故事耦合** ✗：编译器（`build.mjs`／`editor/**`）· 渲染（`src/**`）· 判据与门（`test/**`／`scripts/**`）都在这里；
> **故事在另一个仓**：[`sagitrs/sgstory-books`](https://github.com/sagitrs/sgstory-books) ✓
> ⇒ 所以本仓**顶层没有 `stories/`**；要编译某个故事时，用**唯一故事根口** `SG_STORIES_DIR` 指过去 ✓

## 快速开始

```bash
npm install
npm run build                                  # 编译 → 产物**随故事根**（见下「故事在哪」）
npm run serve                                  # 本地预览（静态服务 dist/）
npm test                                       # 全链：PR 档（fast）
```

**★"产物随故事根"**：`SG_STORIES_DIR=<故事根>` 时，逐故事产物落 `<故事根>/<slug>/…`、发布产物落 `<故事根>/../dist/`；
不设它则用**仓内默认 `stories/`**（本仓默认零故事 ⇒ 只跑引擎侧）✓

## 故事在哪（✗ 本仓不放故事）

```
故事仓：`sagitrs/sgstory-books` —— 每个故事一个包：清单 `00-story.json` ＋ `data/*.json` ＋ `passages/*.md`
编译：  SG_STORIES_DIR=<故事仓>/stories npm run build
         ⇒ 逐故事产物 dist/stories/<slug>/index.html ＋ 书架页 dist/index.html
试玩：  线上书架由**故事仓**发布（本仓不发布故事页）✓
```
**上架与否由故事清单里的 `audience` 决定**：`content`＝上架（书架列它）／`internal`＝内部件（不上架 ✓）。
**怎么写一个故事包**：见手册 [`docs/manual/12-data.md`](docs/manual/12-data.md)（数据面）与 [`docs/manual/README.md`](docs/manual/README.md)（全目录）✓

## 常用命令（逐条对 `package.json` 实测）

| 命令 | 作用 |
|---|---|
| `npm run build` | 编译（源 → 单文件 HTML；产物随故事根 ✓） |
| `npm run watch` | 改 `src/` 自动重编 |
| `npm run serve` | 本地静态预览 |
| `npm test` | **全链（PR 档）**：门 → 单测 → 渲染 → 冒烟…（`--tier=fast` ✓） |
| `npm run test:full` | **full 档**（含重段；nightly 走这一档 ✓） |
| `npm run test:list` | 列出计划里的段（`test-plan.mjs` 是"跑哪些段"的**唯一权威** ✓） |
| `npm run test:serial` | 串行跑（排查并发相关问题时用 ✓） |
| `npm run audit` | 表驱动审计（每个门可单独跑：`--truth`／`--canon`／`--state` …；加 `--check` 是判定态 ✓） |
| `npm run report:gates` | 门的**台账**（`--update` 重生成；`--check` 判定 ✓） |
| `npm run soak` | 加量长测（游走器 ＋ 真浏览器 ✓） |
| `npm run browser` | 真浏览器验收（容器缺系统库时先 `npm run browser:setup` ✓） |
| `npm run compile:story` | 用**编辑核**编译单个故事（`editor/**` 仍在本仓 ✓） |
| `npm run equiv:story` | 编辑核的等价性对拍 |

## 去哪里读什么（入口都在这三处）

| 我要…… | 去哪 |
|---|---|
| **文档总索引**（权威表 ＋ 按任务读） | [`docs/README.md`](docs/README.md) |
| **引擎功能手册**（写故事的人看；段落／条件／状态／检定／发布…） | [`docs/manual/README.md`](docs/manual/README.md) |
| **判据设计法则 ＋ 术语表 ＋ 五条路 ＋ 通用纪律 ＋ 代码级约定** | [`docs/criterion-design.md`](docs/criterion-design.md) |
| 判据册（每条判据的出处与形态） | [`docs/criteria-ledger.md`](docs/criteria-ledger.md) |
| 门的登记与接线（**生成物** ✗ 不手改） | [`docs/gate-ledger.md`](docs/gate-ledger.md) |
| 故事/引擎边界与接入契约 | [`docs/criterion-design.md`](docs/criterion-design.md)（§八 8.9b 文本归属面 · 8.9 作用域） |
| 引擎内部地图（层归属／模块顺序） | `scripts/module-order.mjs`（**代码即权威** ✓） |

CI 变红时先看 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) ✓

## 三条硬约定（改门／改用例前先读）

① **加段只有一个权威**：`scripts/test-plan.mjs` 的 `SEGMENTS`（`package.json` 的 `test` 只有一行 `node scripts/run-tests.mjs` ✓）
　⇒ **加一个段要登记六处**（`SEGMENTS`／`SUITE_MEMBERS`／`tier`＋`FULL_REASONS`／`AUDIT_*` 层表／`inputs` 或理由／探针＋预算 ✓）；
　"**违约会红在哪**"逐条列在 [`docs/criterion-design.md`](docs/criterion-design.md) §五 L4（引的是**门里报文原文** ✓）
② **定位用稳定 key、断言用文案**：选项定位走 `data-choice`（＝目标段落名派生），✗ 不用中文文案当定位键 ✓
③ **全局只有两个根**：`Game.*`（数据／规则）与 `Sg.*`（UI／运行时）；新增**裸全局**会被 `test/globals.mjs` 拦下（**白名单腐烂也红** ✓）

## 编辑器状况（如实说明）

- **编辑核（`editor/lib/core/**`）仍在** ✓：`compile:story`／`equiv:story` 可用 ✓
- **WebUI 产品线已下架** ✗：原界面入口的脚本已不存在 ⇒ 要看故事请**构建产物**后用浏览器打开 ✓
- 沿革与细节：`docs/dev-conventions-cases.md`（案例册，按条号检索 ✓）

## 许可与来源

见 [`docs/credits.md`](docs/credits.md)（许可与第三方来源；含 SugarCube／字体等 ✓）。
