# 迷雾森林 · Twine + SugarCube 脚手架

基于浏览器的文字冒险游戏模板：**Twee 纯文本源码 → 编译成单个 HTML 文件**；剧情用 git 管理，构建走 CLI，也可随时导入 Twine 2 可视化编辑。
本仓是**一套引擎 ＋ 三个故事**：引擎（`src/`）与故事数据（`stories/<slug>/`）解耦，接入契约见 [`docs/engine-story-boundary.md`](docs/engine-story-boundary.md)。

**▶ 在线试玩：https://sagitrs.github.io/sgstory/**（push 到 main → 测试通过 → 自动发布）

## 快速开始

```bash
npm install
npm run build   # 编译 → dist/（index.html + fonts/ 外链子集字体，浏览器直接打开即玩）
npm run serve   # 本地预览：http://localhost:8000
npm test        # 全链（~2min）：L0 静态门 → 质量门 → 单测 → 全段渲染 → 冒烟 → 场景 → 覆盖 → 旧存档 → 体积
npm run soak    # 加量长测（游走器 20+20 局）
npm run browser # 真浏览器验收（零依赖 CDP，3 视口 × 4 场景 = 24 项）；容器缺系统库时 npm run browser:setup 免 root 就地解包
npm run audit   # 表驱动审计：每个门都能单独跑（--truth --canon --echoes … --text）；加 --check 是 CI 判定态
npm run watch   # 修改 src/ 自动重新编译
```

门清单与"每门检什么"见 [`docs/quality-dimensions.md`](docs/quality-dimensions.md)；门的登记/接线见 [`docs/gate-ledger.md`](docs/gate-ledger.md)（生成物）；
CI 变红时先看 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)。

## 两个故事（＋ 一个测试夹具）

> ⚠️ **B 段（`#1004`）之后**：`stories/mist-forest/`（迷雾森林）与 `stories/hollow-cave/`（无名洞窟）**已按决策删除** ✗。
> ⇒ 仓内的**真内容故事**只剩下面 ① 一个 ✗（引擎回归的「真内容样本」从 3 降到 1 ✓ —— 这是收敛的**代价**，不是遗漏 ✓）。

| 故事 | 目录 | 状态 |
|---|---|---|
| ① **夜渡** | `stories/night-ferry/` | **第 4 个故事（P4 用编辑器做出 ✓）**：11 段落 · 6 步路线 · 2 个结局 · 见证轨迹已冻存 |
| ② 最小示例 | `stories/minimal-demo/` | 接入契约的验证物（引擎不知道故事名；**空声明的对照样本**） |
| — **测试夹具** | `stories/face-fixture/` | ⚠️ **不是内容故事** ✗：把「仍有真消费者」的接入面接住（段名沿用旧故事，正文全部新写 ✓） |

**上架与否由清单里的 `audience` 决定**（`#1035`）：`content`＝上架（用户面书架列它）／`internal`＝内部件（**仍会构建**，供门与测试使用，但**不列书架、不进用户面**）。⚠️ **必须显式声明**——缺字段或取值非法会让构建**直接报错**（fail-loud），免得内部件被静默上架。当前：`night-ferry`＝`content`；`minimal-demo`／`face-fixture`＝`internal`（书架上因此只有《夜渡》一个）。

## 知识模型（一句话版）

把「**玩家知道什么**」与「**世界发生了什么**」当**两类存储**分开：能写成「你知道了……」⇒ **笔记**（`Sg.notes.has('n_X')`）；
只是"发生过／已拥有" ⇒ **世界态**（`world`／`items`）；两者同键 ⇒ **拆成两个键**。

- 完整版（三类划分 ＋ 判定口诀 ＋ 迁移五步 ＋ 层归属）：[`docs/notes-model.md`](docs/notes-model.md) —— **唯一权威**；
- 故事的机制面（数值系统 ＋ 演示机制）：[`docs/game-mechanics.md`](docs/game-mechanics.md)。

## 去哪里读什么

| 我要…… | 去哪 |
|---|---|
| **文档全索引**（权威表 ＋ 按任务读） | [`docs/README.md`](docs/README.md) |
| 仓库目录 / 文件职责 / 层归属 | [`docs/repo-map.md`](docs/repo-map.md) |
| Twee 语法与本仓词汇宏速查 | [`docs/twee-cheatsheet.md`](docs/twee-cheatsheet.md) |
| 故事 1 的机制面（数值 ＋ 演示机制） | [`docs/game-mechanics.md`](docs/game-mechanics.md) |
| 写剧情：设定与设计蓝本 | [`docs/lore-canon.md`](docs/lore-canon.md)（**设定唯一权威**）· [`docs/game-outline.md`](docs/game-outline.md) |
| 改引擎：代码级约定 | [`docs/dev-conventions.md`](docs/dev-conventions.md) |
| 加门 / 测试：判据与作业模板 | [`docs/quality-dimensions.md`](docs/quality-dimensions.md) |

## 工程约定（写新门 / 新用例前先读三条）

① 新门挂 [`scripts/test-plan.mjs`](scripts/test-plan.mjs)（`package.json` 的 test 只有一行 run-tests）；
② 选项定位用 `data-choice`＝目标段落名（`c('塔门')`／`clickByKey`，**断言仍写文案**），歧义由 `test/choice-keys.mjs` 静态把住；
③ 全局只有两个根：`Game.*`（数据/规则）与 `Sg.*`（UI/运行时），新增裸全局会被 `test/globals.mjs` 拦下。

另有两条会咬人的机检纪律（细节见上文 `dev-conventions.md`）：**机制动作只走词汇宏**、状态读取用 `$pc.*` 展示（W1–W3 告警）；
**数值单一源**——DC/定价/道具效果/命题/回声只许住故事侧表，正文只传位点/事件键（L0 硬拦）。

## 编辑器与维护

- **与 Twine 2 配合**：Library → Import 选 `dist/index.html` 可导入可视化编辑；导出 HTML 后用 `npx extwee -d -i 导出的.html -o 反编译.twee` 回到源码。
- **升级 SugarCube**：换 `vendor/format.js` ＋ 更新**每个故事**的 `00-meta.twee`（如 `stories/night-ferry/00-meta.twee`）里的 `format-version`。
- **玩家可见正文漂移复核**：`node scripts/ui-migration-diff.mjs`（工作区 vs 基线 → `docs/ui-migration-diff.md`）。
- **发布**：push 到 main → CI 跑测试 → 构建并自动发布到 GitHub Pages。

## 许可与来源

| 部分 | 许可证 | 文件 |
|---|---|---|
| 代码（构建脚本、自定义宏、样式） | MIT | [LICENSE](LICENSE) |
| 剧情文本与游戏内容（叙事、角色、结局） | CC BY 4.0 | [LICENSE-CONTENT.md](LICENSE-CONTENT.md) |
| SugarCube 2（引擎，vendor 并嵌入产物） | BSD-2-Clause（© Thomas Michael Edwards） | [NOTICE](NOTICE) |
| 霞鹜文楷 LXGW WenKai（正文字体，子集内嵌） | SIL OFL 1.1（© lxgw） | [NOTICE](NOTICE) |
| D&D SRD 5.2（规则数值来源） | CC BY 4.0（© Wizards of the Coast） | [NOTICE](NOTICE) |
| extwee / jsdom（仅开发期） | MIT | [NOTICE](NOTICE) |

第三方项目鸣谢与外部参考资源：[`docs/credits.md`](docs/credits.md)。
