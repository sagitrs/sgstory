# CLI 引擎首原型：需求与验证阅读地图

References [#2066](https://github.com/sagitrs/sgstory/issues/2066)。本页描述本笔的实现和可运行判据，不代替平台 CI、独立评审或合法合入。

## 设计依据与阅读顺序

设计依据是 #2066 的范围、开发建议、测试建议与可观察验收；测试接入依据是 [#2065 的契约](test-contract.md)及其中逐条链接的专业许可。前置 [#2064](https://github.com/sagitrs/sgstory/issues/2064) 已由 [PR #2076](https://github.com/sagitrs/sgstory/pull/2076) 合入；隔离基座为 `7ba71fe142e9da79bdbbecdbdfa0b5f34d25a4bb`。

建议先按 [正常终端入口](../../../src/cli/README.md)走完整夹具，再读下面的模块，最后读测试工具的 [登记与命令](../../../tests/README.md)。

| 模块 | 职责 |
|---|---|
| `src/cli/json.mjs` | 拒绝非 JSON、空洞数组、访问器、保留属性、过大或过深的数据；复制后与调用者隔离 |
| `src/cli/rng.mjs` | 有版本的可复现随机状态、合法范围与用途、消费序号 |
| `src/cli/session.mjs` | 游戏定义与只读视图校验；状态、随机、动作日志统一提交；完整存档校验后替换 |
| `src/cli/storage.mjs` | 真实文件读写、实际读取大小限制、UTF-8 与 JSON 检查、临时文件后 rename |
| `src/cli/main.mjs` | 正常行式终端适配，不包含游戏规则或测试专用指令 |
| `tests/cli/fixtures/road.mjs` | 原创正常游戏定义，展示条件、分岔、资源、结束与长期完成记录 |

源码以仓根为路径起点。上面每项分别由下面的测试名指认，不以文件存在当作功能已验。

## 需求—实现—可判测试

具名测试在 `tests/cli/registry.json` 登记。单元实现位于 `tests/cli/unit/engine.test.mjs`，正常玩家实现位于 `tests/cli/e2e/player.test.mjs`。这两个文件内的 `test('名称', ...)` 是下面各行的可达锚。

| #2066 的验收面 | 实现位置 | 具名判据 |
|---|---|---|
| 数字选项、help/status/bag/map、条件拒绝与整段结束 | `main.mjs` 的输入循环；`Session.query/choose`；夹具 `view/apply` | `player choices queries refusal and full ending` |
| 查询、未知或禁用选项不消费状态/随机 | `Session.frame/query/choose` 的只读副本与拒绝返回 | `query and frame preserve state RNG log`；`disabled condition refuses without consumption`；`unknown choice preserves session` |
| 一次动作的状态、随机和日志统一提交 | `Session.choose` 中构造 next 后一次替换 record | `accepted action commits state RNG and purpose together`；U1 下刀摘 RNG 提交后该用例须红 |
| 拒绝、抛错、坏状态、坏视图或坏返回不留半态 | `Session.choose` 的临时 draft/Random 和提交前校验 | `throw after state and RNG mutation rolls back`；`late refusal rolls back draft and RNG`；`invalid post-action state rolls back`；`invalid post-action view rolls back`；`invalid action result rolls back` |
| 等待边界和重复事件 | `Session.choose` 的 expectedBoundary；`restore` 换代；游戏当前选项 | `stale action cannot repeat reward`；`restore same revision invalidates previous waiting boundary`；`terminal event cannot reward twice` |
| 可复现随机、用途与消费位置 | `Random.integer/from/snapshot`；`Session.choose/checkLog` | `RNG deterministic same seed`；`RNG resumes exact consumption`；`accepted action commits state RNG and purpose together` |
| 调用者不能越过复制边界改会话 | `jsonClone/freeze`；`Session.snapshot` 与提交前复制 | `retained draft cannot mutate committed session`；`snapshot and views cannot mutate live state`；`JSON boundary rejects sparse arrays with disguised extra properties` |
| 信封、内容/引擎版本、状态、随机和日志完整验证 | `Session.restore`、`checkedState/checkedView/checkLog` | `restore rejects wrong envelope versions atomically`；`restore rejects other game and content version`；`restore rejects corrupt RNG without replacing session`；`restore rejects corrupt log and state atomically` |
| 真实保存、跨进程读取与继续 | `Store.save/load`；终端 save/load 分支 | `player saves exits restarts loads and continues`；E1 摘 load 替换后同一正常玩家用例须断言红 |
| 写入或 rename 失败清临时并保旧档；读取失败保会话 | `Store.save` 的 wx 临时档、rename、finally；`load` 校验后 restore | `partial write failure preserves previous file and session`；`rename failure removes temp and preserves previous save`；`read failure preserves current session` |
| 坏 JSON/UTF-8/过大读取与档名边界 | `Store.load` 双重大小上限；`Store.#target` | `invalid JSON and UTF8 preserve current session`；`oversized save read is refused before replacement`；`slot names cannot escape directory` |
| 有限动作/结果日志 | `Session.choose` 保留最近64项；`checkLog` 校验消费序列 | `bounded action log survives truncation and restore` |
| EOF、中断、中文和重定向 | `main.mjs` 的 readline/SIGINT；无 ANSI 输出 | `player EOF exits without automatic save`；`player SIGINT at waiting boundary exits without save`；`player redirected Chinese commands remain line based` |
| 旧网页构建/单测/宿主包装保护 | #2064 生产隔离及既有 `test.yml` 的原调用面 | 旧工作流命令逐条复跑；`pack-selection.mjs` 包含 CLI 收集隔离与真刀；既有两份 workflow 字节对照 |

## 判据为何会参与

新 `.github/workflows/cli-tests.yml` 的第三步调用 `check-ci.mjs`；第四步依次调用单元、玩家与两组自证；第五步在 `always()` 下核工作树为空。契约门、族 runner 和自证的非零退出码会使该 job 失败，不只是打印读数。

契约门核对工作流全文、六个触发路径、五个步骤、具名命令与实际非空测试名称。六个内存反控分别删命令、清登记、改登记说明、增加 push、添加未知命令和错误的 job-env runner 上下文。后两种反控同时修改契约和工作流，避免仅靠全文不相等就提前拒绝。TMPDIR 必须放在测试 step 的 env；上下文门只核这条具名约束，不冒通用 GitHub 工作流解析器，平台是否加载仍须真实 run 证明。

族 runner 从 Node 的真实 TAP 获取名称与计数，再与登记对账。缺文件、零用例、名称/分母不符、只读失败、残留、超时属于具名装置红；断言级产品红另计。U1/E1 在临时源码副本中执行基线、定向故障、复原和字节对照，不碰开发源树。正式 CI 的净树要求与本地未提交工作树的前后不变要求分开。

## 本期明确不承诺的部分

- 夹具不是正式 HoF 游戏；路线、商店、战斗、胜败、下一局解锁由 [books#570](https://github.com/sagitrs/sgstory-books/issues/570)另验，正式游戏依赖完整引擎合法合入后的固定 SHA。
- 游戏模块是可信 Node 模块，不是安全沙箱；外部副作用不回滚。查询和视图要求纯函数。
- 单线程同步动作的原子提交不是跨进程事务；不保证断电耐久、并发写入、网络文件系统或异步处理器取消。
- 随机用于复现，不是密码学随机，也不作概率平衡保证。最近64个动作不是完整审计或回放。
- Linux/Node22 是本期验证环境；Windows/macOS、模型试玩、资源费用和性能基线未覆盖，不并入本笔用例分母。
- 源码、文档或本地读数不构成平台绿、D/T 票或合入许可。作者不投自己的技术票，也不自合。
