# 工程约定（Dev Conventions）

> **单一落点**：本仓的工程级约定都写在这里（来源＝代码质量伞 **#314** 各子票）。
> 规矩：**只追加自己的小节，不重写他人的**。
> 目的：把「靠人记」的隐性规则变成**可机检的机械约束**——凡约定，必须配一条会咬人的门。

| 小节 | 来源票 | 状态 |
|---|---|---|
| 1. 渲染路径契约 | **#315** | ✅ 本文件 |
| 2. 构建与模块顺序 | #319 | ✅ |
| 3. 状态契约 | #318①② | ✅ |
| 4. 常量与字面量 | #318③ | ✅ |
| 4. 命名约定 | #320 | 待补 |
| 5. 测试与产出物 | #317（＋#303/#306） | 待补 |

---

## 1. 渲染路径契约（#315 · 根因证据 #300）

### 规则

1. **就地反馈一律「结算 → 结果留屏 → `<<goto>>`」**；
2. **禁止「只靠就地 `<<replace>>` 落地的状态变更」**——判定式（机检同款）：
   link 体内**有 `<<replace>>`** ∧ **改状态**（直接：`<<give`/`<<damage`/`<<set $…`/`<<run $pc…`；
   **或间接：调用了一个自身会改状态的 widget**）∧ **没有 `<<goto>>`**；
3. 于是由此推出两条**合法**写法：
   - **改状态后接换段**（`<<goto>>`）＝合法，这正是契约形状——状态随换段进入 history moment；`<<replace>>` 与 `<<goto>>` 同时出现也合法（落地以换段为准）；
   - **就地 `<<replace>>` 只改纯界面态**（展开/折叠/开关/滚动/局部高亮）或临时变量（`<<set _x…>>`）＝合法。

### 为什么（不是洁癖，是存档语义）

SugarCube 序列化的是 **history moment**；同页 `<<replace>>` 修改的是当前活动状态、**不落 moment**，于是存档/读档后丢失。**#300 P1 实测**：门厅取物丢 `坏哨`、花田摘花丢 `月光花`、连 `last_roll`（本次检定记录）一起丢。两条路径在语法上几乎一样（都是 `<<link>>` ＋ 结果文本），**靠人记必出错**——所以必须有机械约束。

### 正确写法

```twee
<<link "把墙上那支哨子摘下来">>
    <<sitecheck "门厅·翻检">><<snapshot>><<hallResult "翻检">>
    <<goto "门厅">>          /% 结算完成 → 换段重渲染：状态随之进入 moment %/
<</link>>
```

结果如何留屏：交给 **#270 的结果槽**（`actOut` / `sceneFeedback` / `sgResult`），**不要**靠就地重绘。

### 机检（两条，缺一不可）

| 门 | 文件 | 断言 |
|---|---|---|
| 静态（**禁止制**） | `test/saveload-inventory.mjs` | 按规则 2 的判定式命中即红；**含 widget 间接变更**（`<<widget>>` 体内 `<<give/<<damage/<<set $/<<run $pc` 者视为「会改状态的 widget」）；确需例外须进 `test/saveload-sites.json` 的 `inPageMutationsAllowed`（理由＋票号） |
| 静态自证 | 同上 `--selftest` | 合规绿 / **非法红** / 纯界面态绿 / **widget 间接改状态红** / widget＋goto 绿 / 白名单失效红 |
| 行为 | `test/saveload.mjs` | 就地操作 → 立即存档 → 读档 → **物品/旗标/HP/金币/检定记录**五项保值 |

> 已有先例：`test/boot.mjs` 的 **dist 过期守卫**（#306）与本节同属「把隐性规则变成会咬人的门」。

---

## 2. 构建与模块顺序（#319）

### 规则

1. 加载顺序**显式**声明在 `scripts/module-order.mjs` 的 `ORDER`——**不再靠文件名前缀隐含**；
2. 新增 `src/*.twee` 必须登记 `ORDER`（`build.mjs` 会拒绝「未登记的文件」与「ORDER 里不存在的文件」）；
3. 跨文件依赖只声明**加载期**真实需要的边（`MODULES[file].deps`），且**只能指向更早的模块**；
4. `MODULES[file].defines` 声明该文件必须定义的顶层符号（`window.X` / `widget:X`），用于抓改名与挪位置。

### 为什么

文件名决定加载顺序时，新文件若命名成 `12-*.twee` 却依赖 `15-tables.twee` 的 `Game.*`，会**静默**先加载：构建不报错、运行期才炸，**症状还出现在别处**（看起来像别的问题）。

### 为什么不推断（本节的教训，值得记住）

初版尝试「**文本里出现即算前向引用**」的推断式 lint：对真实源码报了 **5 处**前向引用（`10-core.twee` 用 `Game`/`SgCodex`/`SgEnding`；`70-codex.twee` 用 `SgCodex`），**全是假阳性**——它们位于函数/方法体内，属**延迟求值**（`[widget]` 段落体与函数体在**首次被调用**时才执行，那时后面的文件早已加载完毕）。

因此本仓采用「**声明依赖边 ＋ 校验顺序与定义**」：宁少勿多、**零假阳性**；万一声明与实际脱节，由规则 ④ 的定义清单兜住（改了名/挪了位置就红）。

### 机检

| 门 | 断言 |
|---|---|
| `test/layering.mjs`（在 `npm test` 链里） | ① 文件 ↔ ORDER 一一对应 ② 依赖边只指向更早模块 ③ 声明的定义真的在正文里 |
| `test/layering.mjs --selftest` | 合规绿 / **前向依赖红** / 未登记红 / 定义漂移红 / 文件缺失红 |

---

## 3. 状态契约（#318①②）

### 规则

1. `pc.ev` / `pc.world` 的每个键必须落在 `Game.State.domains` 的**某一个**场景域（按 `prefix` 或 `keys` 匹配），**归属唯一**（命中 ≥2 个域＝红）；
2. **只有写没有读**的键＝红；确属「**仅记账**」（消费者就是登记表本身，如出处/复访记账）的键必须显式写进 `Game.State.bookkeeping`，否则照旧红；
3. **只有读没有写**＝红（幽灵条件＝死分支）；
4. 扫描必须覆盖**三类动态形式**：`<<setflag/<<firstTime>>`（动态写入并动态读回）· `$pc.ev["k"]` · 表内谓词 `p.ev?.k` / `p.world?.k`。**不覆盖这三种就会误报**——本仓实测踩过两次（先是把动态写误判成未声明，后是把 `p.ev?.keeper_why` 误判成「只有写」）。

### 为什么

81 个状态键散在 9 个 `src` 文件里自由命名，此前**没有任何一处**能回答「当前有哪些键、谁写、谁读、语义是什么」；新增键无需任何声明即可通过全部门。

### 现状（2026-09-12 首轮）

`81 键 / 10 域`：`tavern 13 · witch-hut 14 · forest 6 · keeper 4 · tower 13 · flower 4 · seer 6 · banquet 7 · dragon 10 · runtime 4`；
仅记账键 4（`tav_light`/`tav_iron`/`tav_seal`/`banquet_over`，已声明）；未声明 0 · 歧义 0 · 只有写 0 · 只有读 0。

### 机检

| 门 | 断言 |
|---|---|
| `audit --state --check`（在 `npm test` 链里，并纳入 golden 保护） | 上列四条 ＋ **5 例合成自证**（未声明红 / 只有写红 / 只有读红 / 歧义红 / 合规绿） |

---

## 4. 常量与字面量（#318③）

### 规则

1. **时代**一律用 `Game.Era.PAST` / `Game.Era.PRESENT`（代码路径：条件、赋值、模板）。
   字面量 `'past'`/`'present'` 只允许出现在 `15-tables.twee` 的**数据字段**（`era:` / `flagEra:`）与 `Game.Era` 定义行；
2. **伤害**一律用 `Game.Damage.*`（`graze 1` / `hurt 2` / `hard 3` / `heavy 4` / `lethal 99`）；
   剧情文件里禁止裸 `<<damage N>>`；
3. ⚠️ **SugarCube 宏的裸词参数会被当成字符串**（本仓 integrity 门记过的「坑11」）——所以必须写
   **backtick 表达式**：`<<damage \`Game.Damage.lethal\`>>`。写成 `<<damage Game.Damage.lethal>>` 会静默传字符串，
   把 `hp` 变成 `NaN`（**本轮实测踩到**：`龙·再冲` 因此无可点元素，被 render-all 抓住）。

### 为什么

`<<damage 99>>` 无法回答「99 是什么意思」（它是「处死」的魔法数）；而 `$era is "past"` 拼错一个字母会**静默失效**（条件永假、不报错）。

### 现状（2026-09-12）

- 代码路径时代字面量：**37 处已替换**为 `Game.Era.*`；
- 伤害裸数字：**10 处已替换**为 `Game.Damage.*`（含那处 `<<damage 99>>`）；
- 剩余字面量：**仅 `15-tables.twee` 数据字段 11 处**（按设计，由门校验取值）。

### 机检

| 门 | 断言 |
|---|---|
| `audit --literals --check`（在 `npm test` 链里，纳入 golden 保护） | 两条判定 ＋ **5 例合成自证**（常量绿／裸时代红／裸伤害红／数据字段绿／常量定义行绿） |

## 5. CI 测试计划与并行跑器（#381）

**单一权威**：`scripts/test-plan.mjs` 的 `SEGMENTS` 是「CI 跑哪些段」的唯一定义。**不要**再往
`package.json` 的 `test` 脚本里塞 `&&`——那里只有一行 `node scripts/run-tests.mjs`。

```js
{ id: 'test-reread-mjs', phase: 'test', cost: 0, cmd: 'node test/reread.mjs --selftest' },
{ id: 'test-reread-mjs-1', phase: 'test', cost: 0, cmd: 'node test/reread.mjs' },
```

| 字段 | 含义 |
|---|---|
| `id` | 稳定标识（`--only=<子串>` 用；同段重复运行加 `-1`/`-2` 后缀） |
| `phase` | `build` 的段**先跑且独占**（后续段都可能读 `dist/`）；其余段可并行 |
| `cost` | 本机实测秒数（**仅供跑器打印串行合计与预估**，不参与任何判定——不要求精确，但新增重段请顺手填） |
| `needs` | **前序段的产物依赖**：本段要读某段落盘的产物就写它的 id。调度器保证前序全部成功才起跑；前序红了/跳过 → 本段标 `skipped`（不白跑、不假绿）。配错（指向不存在的段）或成环 → **起跑前**报错退出 2 |
| `cmd` | 与旧链**逐字一致**的 shell 命令 |

**跑器**（`scripts/run-tests.mjs`）：

```bash
npm test                                   # 并行（默认 jobs = min(4, 核数)）
npm run test:serial                        # 串行＝旧链行为（排查/对照）
npm run test:list                          # 列出计划与串行合计
node scripts/run-tests.mjs --jobs=2 --only=scenarios   # 调试单段
```

- **退出码**：`0` 全绿 / `1` 有段失败 / `2` 用法错或**选择为空**（空选择不许当绿）；
- 失败段的 stdout/stderr 会被原样打印（尾部 28 行）并汇总「哪几段红」——**不吞输出**；
- 跑器**每次运行先自证**（成功/失败识别、失败输出不吞、并行真的重叠、`phase:'build'` 红即中止；约 2s，`--no-selftest` 可关）。判「CI 绿不绿」的东西，自己坏了必须当场暴露。

**产物依赖面**（改测试的落盘/读取时同步这里——CI 曾因漏掉它红过一轮）：

| 产物 | 生产者 | 消费者 |
|---|---|---|
| `build/coverage-render.json` · `build/coverage-links.json` | `test/render-all.mjs` | `test/coverage.mjs` |
| `build/coverage-scenarios.json` · `build/coverage-links-scenarios.json` · `build/route-traces.json` | `test/scenarios.mjs` | `test/coverage.mjs`（前两个）· `scripts/report-rhythm.mjs`（`route-traces.json`，**连 `--selftest` 也用它当正例**） |

**新增门的三件事**（缺一即红）：

1. 往 `SEGMENTS` 加一段（不是往 `package.json` 加），读前序产物时写 `needs`；
2. 台账 `docs/gate-ledger.md` 的「已接线」列来自 `planChain()`，所以只要段在计划里就会自动判定 ✓；但 `npm test` **必须仍是 `node scripts/run-tests.mjs`**——`report-gate-ledger.mjs` 有 `phantom-runner` 反向查，脱钩即红。

**成本口径（2026-09-12 实测）**：53 段 · 串行合计 **197s**（本机 32 核）/ **186s**（`taskset -c 0-3`）→ 并行 4 核 **54s**（**3.4×**，53/53 绿）；CI `npm test` 原为 **207s**（环境准备仅 17s）。新增段时请自问：这段的 `cost` 是否值得？单段 > 60s 或串行合计 > 4 分钟就该先优化/拆分。
