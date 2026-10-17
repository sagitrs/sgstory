# CLI 引擎接口 v2：输入编号语义与诊断入口

References [sgstory#2078](https://github.com/sagitrs/sgstory/issues/2078)。本文是接口 v2 的规范正文，与票面设计稿 §1–§9 及裁定 §10 逐条对应。实现位于 `src/cli/`，玩家入口与命令说明见 [`src/cli/README.md`](../../../src/cli/README.md)。

## 一、版本与兼容

`CLI_INTERFACE_VERSION` 由 1 升到 2，`SAVE_VERSION` 仍为 1。

升级理由是两处接口形状变化：`choice.intent` 是既有字段的**必填**新增（既有游戏的 `view()` 不补就会具名拒绝），`inspect` 是新增的**可选**钩子。游戏的内容版本仍由 `game.version` 单独表达，与本接口版本互不替代。

**旧存档不迁移。** `load` 遇到版本不符时必须具名提示「旧存档不可用（本版不支持迁移）」，并且保证三件事：当前会话未改变、档文件未被改动、不显示任何来自旧档的内容。校验先于替换的事务性保持不变，禁止「先加载或先显示旧档，再报错」。

### 旧档提示矩阵

| 引擎错误码 | 触发条件 | 玩家看到的文案 |
|---|---|---|
| `SAVE_VERSION` | 档内 `interfaceVersion` 或 `version` 与本版不符 | 旧存档不可用（本版不支持迁移）：〈档内声明版本与本版版本的对照〉；当前会话未改变。 |
| `SAVE_GAME` | 档内 `game.id` 或 `game.version` 与本版不符 | 同上 |
| `SAVE_JSON`、`SAVE_SIZE`、`SAVE_REVISION` | 档不是有效 JSON、超过 1 MiB、动作数无效 | 存档不可读或已损坏：〈原因〉；当前会话未改变。 |
| `SAVE_SLOT` | 档名不合规 | 档名非法：〈原因〉；当前会话未改变。 |

对照文案由 `Fault` 的消息文本承载（不改 `Fault` 的形状）。`SAVE_VERSION` 的文案形如「档为接口 v1，本版为接口 v2」，`SAVE_GAME` 的文案形如「档为 road-fixture v2，本版为 road-fixture v1」。

本轮接口版本与游戏版本同时变化，因此**实际旧档会先落 `SAVE_VERSION`**；两条路径都必须有用例覆盖，不得只测 `SAVE_GAME`。

## 二、三类输入

| 类别 | 输入形式 | 语义 | 是否提交 |
|---|---|---|---|
| 普通行动 | 正数 `1..n` | 游戏给出的 `intent: normal` 选项 | 是（走 `choose`） |
| 防呆行动 | 负数 `-1..-m` | 游戏给出的 `intent: guarded` 选项（自伤、撤退、重新开始等） | 是（走 `choose`） |
| 返回 | `0` | 只退界面浏览栈；不是撤销行动，也不是回到已过节点 | 否（纯读） |

`0` 不由游戏产生，浏览栈由 shell 持有，shell 在栈非空时自行提供返回能力。理由是游戏图仍是 DAG：hof-cli 中「看起来像离开」的选项实测会消耗粮食并前进，把它当成免费返回会改掉既有经济规则。

输入解析的两条边界：负数分支只认 `^-[1-9]\d*$`，因此 `-0` 与 `01`、`+1` 一样落「未知命令或格式」拒绝；`0` 只认单独的 `0`。

## 三、`choice.intent`

`intent` 是**必填**字段，取值闭集为 `'normal' | 'guarded'`，校验失败 ⇒ `VIEW_CHOICE`。

shell 强制分组排序：`normal` 依游戏给出的相对顺序编号 `1..n`，`guarded` 一律排在 `normal` 之后、编号 `-1..-m`，两组之间空一行。游戏给出的数组顺序只在组内生效。不可选项（`enabled=false`）照旧显示并显示 `reason`；guarded 的不可选项同样以负数编号并显示拒因。选项总数上限沿用 `choices.length <= 30`，按两类合计计算。

游戏若要表达「回到上一级状态机」（需要改状态），必须作为 `normal` 或 `guarded` 行动走 `choose`，不得占用 `0`。

## 四、浏览栈与上下文路由

shell 持有目标栈与页面模式（`actions` 或 `inspect`），**只存内存，不入档**。进入详情页的命令是 `inspect`（不带参数），它打开根页 `target=null`；进入与逐级浏览**不要求** `--debug`，只有打印条目 `data` 的 JSON 受 `--debug` 约束。

| 页面 | 正数 | `0` | 负数 |
|---|---|---|---|
| 行动页 | 选 `normal` 行动（提交） | 退浏览栈；栈空 ⇒ `NAV_NO_PARENT` | 选 `guarded` 行动（可能提交） |
| 详情页 | 选该页列出的条目（纯读） | 退一级 | 仅当 `--debug` 开启：把当前条目 `data` 的 JSON 打印到 stderr（纯读）；未开启 ⇒ `DEBUG_DISABLED` |

两类页面不得混合：详情页不渲染游戏 `choices`，行动页没有诊断目标。因此「同一上下文的同一编号既诊断又执行动作」不会出现，也不得笼统宣称「所有负数都是纯读」。

栈的失效与清空规则：任何**成功提交**（normal 或 guarded 被受理）清空栈并重绘顶层视图；`load` 成功清空栈；等待边界变化后栈内旧目标一律失效。存读之后回到顶层视图是有意的设计决定，导航位置属会话内浏览状态，不是存档内容。

## 五、诊断钩子与页面形状

游戏**可选**导出纯函数 `inspect(target, state)`。`state` 由引擎给冻结副本，不含 RNG、不带动作能力、不能改状态。

引擎侧方法是 `Session.inspect(target, expectedBoundary)`，返回下列之一：

| 结果 | 形状 | 何时 |
|---|---|---|
| 成功 | `{kind:'inspected', boundary, target, page}` | 游戏实现了 `inspect` 且目标有效 |
| 陈旧 | `{kind:'refused', code:'STALE_INSPECT', reason}` | `expectedBoundary` 与当前边界不符 |
| 无此能力 | `{kind:'refused', code:'INSPECT_UNAVAILABLE', reason:'本游戏不支持诊断查看'}` | 游戏未导出 `inspect` |
| 无此目标 | `{kind:'refused', code:'INSPECT_NO_TARGET', reason:'目标不存在或已失效'}` | 游戏返回 `null` 或 `undefined` |
| 形状不符 | 抛 `Fault('INSPECT_FORMAT', …)` | 游戏返回非空对象但不符合下表校验（装置错） |

`target` 取 `null`（根页，分类列表）或稳定条目 id，字符集与选项 id 相同：`^[a-z][a-z0-9_-]{0,63}$`。其余形状按装置错抛 `Fault('INSPECT_FORMAT')`。

**纯读保证**：`inspect` 不改 `state`、`rng`、`revision`、`log`，也不进动作日志。**不回落**：游戏未实现 `inspect` 时不得改用 `snapshot()` 转储，因为 `snapshot()` 含 `rng`、`log` 与隐藏状态，既不是「当前条目」，也冲击 books#597 的展示边界。顶层不提供整份状态转储。

### 页面形状校验

`page` 的键集为 `['title','text','entries']`，可再加可选的 `data`。

| 字段 | 约束 |
|---|---|
| `title`、`text` | 非空、无控制字符、不超过 4000 字符 |
| `entries` | 数组，最多 50 项；每项键集为 `['id','label','kind']`，可再加可选的 `count`；`id` 唯一且符合上述 id 字符集；`label` 不超过 200 字符；`kind` 为闭集 `'category' \| 'item' \| 'status' \| 'intel'`；`count` 为非负安全整数 |
| `data` | 经 JSON 边界校验（无环普通 JSON、深度不超过 32、节点不超过 100000），且序列化后不超过 64 KiB |

`count` 是可选的数量提示，shell 渲染为「（共 N 项）」。

## 六、输出通道与开关

玩家的正常输出（视图、选项、结果、拒绝）走 stdout；诊断输出（条目 `data` 的 JSON）走 stderr，默认关闭，由命令行参数 `--debug` 打开。诊断输出有界：`data` 由上面的 64 KiB 校验保证，因此 shell 不需要再做截断，也不存在静默截断的路径。

`--debug` 只控制 `data` 的打印；它不改变输入语义，也不改变任何提交行为。

## 七、错误码总表

以下八个错误码彼此不混码，`INSPECT_FORMAT` 属装置错（游戏返回值不符契约）：

| 错误码 | 含义 | 判定层 |
|---|---|---|
| `NAV_NO_PARENT` | 浏览栈为空时按 `0` | shell |
| `DEBUG_DISABLED` | 未开 `--debug` 却要求打印诊断数据 | shell |
| `DEBUG_NO_DATA` | 开了 `--debug`，但当前条目没有 `data` | shell |
| `UNKNOWN_CHOICE` | 编号层越界：行动页正数超过 n、负数超过 -m，详情页正数超过条目数 | shell |
| `INSPECT_NO_TARGET` | 目标层失效：编号合法，但目标已不可达（由游戏判定） | 引擎 |
| `INSPECT_UNAVAILABLE` | 游戏未导出 `inspect` | 引擎 |
| `STALE_INSPECT` | 诊断请求带的等待边界已过期 | 引擎 |
| `INSPECT_FORMAT` | 诊断页或目标形状不符契约（装置错） | 引擎 |

除上表之外，引擎对游戏抛出的非 `Fault` 异常统一报 `INSPECT_EXCEPTION`（与 `choose` 的 `ACTION_EXCEPTION` 同族，属装置错，不参与上表的输入语义判定）。

## 八、明确不做

- 不打印整份 `snapshot()`，也不回落到 `snapshot()`。
- 不把诊断条目塞进 `choices` 走 `choose`（`choose` 受理即 `revision` 与 `log` 各加一）。
- 不扩 `view` 顶层键集（除 `choice.intent` 这一处闭集扩展）。
- 不做通用脚本、DSL 或回放引擎。
- 不改 `choose` 的提交、日志与存档语义。
- 不引入节点回边，游戏图仍是 DAG。
