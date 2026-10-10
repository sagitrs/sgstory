# 独立 CLI 引擎（接口1）

References #2066。独立于SugarCube、旧headless、Babel与网页发布；目录排除仍按[#2064](https://github.com/sagitrs/sgstory/issues/2064)，不搬旧core/host，不统一两套格式。

## 从正常终端走完整夹具

Node22，标准库，无npm安装。Linux为本期实测目标。

```sh
node src/cli/main.mjs --game tests/cli/fixtures/road.mjs --seed 42 --save-dir "$HOME/tmp/sgstory-player-saves"
```

先输入 `help`、`status`、`bag`、`map`；输入 `2`可看到收费桥条件拒绝；输入 `1`走林道。随后 `save camp`、`quit`；重启同一命令、`load camp`，输入 `1`采集后完整结束。`2`直接返回是另一正常选项。输入 `quit`退出。

纯行式数字选项；必要信息不用鼠标、图像、浏览器、颜色、ANSI或光标。固定输出 `等待输入>` 是稳定等待边界；命令支持重定向。档名只用小写字母/数字/横线/下划线，1至32位。省略seed使用crypto生成并打印公开启动seed；seed0归一为非零固定随机初态。省略save-dir使用当前目录 `.sgstory-cli`，测试始终显式指定临时目录。

EOF是退出码0；等待时SIGINT是130。两者、quit均不自动保存。同步动作不会留下半个会话；SIGINT不能中途取消已执行的同步动作。正在进行的保存可能完成，只有已完成的保存会保留；不承诺跨进程并发写、断电耐久、取消异步处理器或网络文件系统事务。

## 游戏接口与归属

可信本地 `.mjs` 默认导出定义：

| 字段/方法 | 契约 |
|---|---|
| `id`、`version` | 唯一字符串ID、正整数内容/状态版本；不兼容变化必须升版本 |
| `initial()` | 返回无环纯JSON状态；非普通对象/NaN/函数/访问器/空洞数组不支持 |
| `validate(state)` | 只读；成功明确返回true，负责游戏的字段/范围/场景关系校验 |
| `view(state)` | 只读；返回title/text/phase/choices/status/bag/map；phase为playing或ended，choices含唯一id/label/enabled/reason；禁用选项须有拒因 |
| `apply(draft, id, random)` | 同步改临时draft；只用 `random.integer(min,max,purpose)`；返回accepted+outcome或refused+reason；抛错/无效返回/坏状态/坏视图不提交 |

小游戏完整范例在 `tests/cli/fixtures/road.mjs`。它是原创正常游戏定义，不含测试专用命令。样例 `state.run`属于本局，`state.progress`属于长期记录；游戏负责归属、胜败、下一局与解锁，引擎不复制规则。未来游戏也可选择自己的纯JSON结构，不能要求旧网页存档与之通用。

查询/视图必须纯；引擎给只读副本，不授RNG。处理器仅拿临时状态与独立随机桥。定义模块可以执行任意Node代码，外部副作用不属于回滚范围；不是安全沙箱。

## 会话、随机与存档

`Session`将状态、RNG、revision及动作日志一次赋值提交。拒绝/失败不换会话；`frame()`给出运行时boundary；`choose(id, expectedBoundary)`拒绝旧等待面上的迟到动作。成功load即换boundary，即使存档revision相同也拒绝旧面；该运行时换代数不入档。重复事件仍须由游戏的当前选项/状态与处理器检查，不提供全局请求ID去重。

xorshift32-v1用于重现，不是密码学随机；整数缩放有有限位精度，不作统计/平衡保证。用途、范围、值与消费序号随动作保存。日志只保留最近64个已受理动作，每动作最多128次消费，不是完整审计/回放。输入长度256、视图选项30、JSON深度32/节点100000/字节1MiB限制属于首期边界。

`Store`先完整验证信封、接口/存档版本、内容ID/版本、revision、RNG、有限日志及游戏状态/视图，再替换会话。JSON/UTF8/读取/版本失败保留当前会话。文件读取双重限1MiB。保存用同目录唯一临时文件、写完rename，失败清临时；不含fsync，不冒断电耐久或防篡改。路径和模块可信，不把它叫symlink/恶意代码隔离。

## 阅读地图与测试

`json.mjs`数据边界；`rng.mjs`随机；`session.mjs`原子会话；`storage.mjs`文件边界；`main.mjs`仅终端适配。

测试工具统一在 `tests/`，具名入口与计数见 [`tests/README.md`](../../tests/README.md)，接入契约见 [`test-contract.md`](../../docs/plans/cli/test-contract.md)。需求—实现—测试的逐项映射及阅读顺序见 [`prototype-review.md`](../../docs/plans/cli/prototype-review.md)。源码/本地通过不代平台CI、独立D/T、合法合入、正式游戏或模型试玩。
