# CLI 分区与旧网页构建边界

References https://github.com/sagitrs/sgstory/issues/2064

## 已实现与未实现

本前置只建立独立源码分区并改网页构建器的两处发现入口，不交付游戏或可运行 CLI。
引擎完整原型见 [#2066](https://github.com/sagitrs/sgstory/issues/2066)，
测试/工作流契约见 [#2065](https://github.com/sagitrs/sgstory/issues/2065)。
旧 OOP/headless/Babel 总体重构不因此成为首个 CLI 的前置。

| 路径 | 责任与现状 |
|---|---|
| `src/cli/` | 独立引擎分区；本票仅目录说明，入口随 #2066 交付 |
| `tests/build/cli_source_isolation_test.py` | 已有构建组件测试及 `--selftest` 刀；不是玩家 CLI e2e |
| `tests/cli/` | 后续原型 unit/e2e 的拟用位置，本票不造空测试目录/假绿 |
| `docs/plans/cli/` | 独立 CLI 的实施与接口文档，不把网页协议当其真值 |

## 为什么需要两处排除

`build.py` 递归收集 `src/**/*.js`，同时用 `src/**/00-init.js` 发现网页规则包。
仅换 `.mjs` 或仅排除最终脚本都不够：前者仍允许将来的 `.js` 泄漏，后者会让 CLI
初始化文件成为可用网页规则包。因此两处使用同一个 `is_cli_source` 目录边界判据。

边界是引擎的 `src/cli/`，不是 basename 含 cli，也不是任意故事内的同名子目录。
`src/client/`、其他目录的同名 `.js`、故事侧 `src/cli/*.js` 都保持旧行为。
这是本仓受信源码的构建分区，不是符号链接/恶意代码沙箱。

默认 SugarCube、显式 SugarCube、headless、all 的宿主选择不变；规则包选择和宿主选择
仍正交，未知宿主/包继续具名拒绝。旧源码没有搬迁、旧入口没有改名。
本票不修改 `.github/workflows/**`。按 [t3的五项接线条件](https://github.com/sagitrs/sgstory/issues/2065#issuecomment-6094569888)
扩 `tests/gates/pack-selection.mjs`：既有 `test.yml` 的正常与自检调用都覆盖新臂，收尾仍重建缺省。
这是接线准许，不代替实施PR现头的独立D/T投票与实际CI结论。

## 可复核测试与分母

仓库根执行，Python 标准库，无安装依赖：

```sh
export TMPDIR="$HOME/tmp" PYTHONDONTWRITEBYTECODE=1
python3 tests/build/cli_source_isolation_test.py
python3 tests/build/cli_source_isolation_test.py --selftest
```

正常组共11个测试方法：5个选择/收集臂、独立具名的旧脚本保留正控、规则包发现、
未知CLI包拒绝、未知宿主拒绝、真实产物对照、故事内同名目录保留。真实产物方法另有4个具名宿主子臂；不把方法与子臂
混加成同一分母。每个子臂比较 HTML、bundle 和 manifest 的字节，与插入 CLI `.js`
前的同一生产构建器对读。两处测试保护旧同名文件与新分区，夹具只在逐用例临时副本写入。

具名刀把临时副本的唯一 CLI 判据置为 false，要求正常臂先绿、收集及规则包发现两项定向红、
逐字节恢复后再绿。不改实际 `build.py` 或共享 build/dist；异常/超时不当成刀命中。
另有缺CLI工具/零执行/缺临时产物三项装置反控：前两项须rc2、具名⑧，且原有七臂不得跟红；
后一项只在组件测试中注入IO错误，须经真实runner返回rc2并具名，不伪造玩家状态或档案。
这些反控与生产边界刀分别计数，不混入11个正常组件方法或4个宿主子臂。

这组证据只到构建组件边界：不证旧网页浏览器交互、CLI玩家运行、真实存读、模型试玩、
平衡或成本。固定旧源码对照命令（只在归档副本生成产物，不切分支、不写共享产物）：

```sh
python3 tests/build/cli_source_isolation_test.py --compare-base fb20f2a2d70bd14831e90546165f531d0ca8870c
```

它对照同一固定旧源码及参数下的旧构建器与候选构建器，并向候选副本加入CLI探针；
四宿主分别报告HTML/bundle/manifest字节比较和hash。此模式使用tarfile的data过滤，需Python3.12或更新版本；
本席固定旧版本对照实跑环境为Python3.14.4。它是本前置的手动证据入口，
不冒既有CI已自动执行固定旧版本对照。结果随前置PR提交，不以本段代替它们。

既有CI可达命令仍是 `node tests/gates/pack-selection.mjs` 与其 `--selftest`。
新增R3在实际被调的门上摘掉排除边界，必须红在⑧新臂；新臂若被跳过，该刀便不能命中。
旧R1/R2不撤；自证先跑未下刀基线，finally里恢复生产文件，恢复后再跑门并核md5。
自检分母是6项（三把真刀、基线绿、复原绿、字节同），不把恢复检查叫第四把生产刀。
刀的写入保留原UTF-8/CRLF，不将既有CRLF再次替换而生成CRCRLF；缺锚属于装置错。
新臂缺产物/缺模板/不能启动、子进程超时或零执行计数都具名报装置错，门返回2；
断言失败返回1，不把缺工具或静默空跑当绿。

## 两仓与工作流隔离

游戏将放在 sgstory-books 的 `stories/hof-cli/`，工具根仍是其 `tools/`。
它只消费合法合入的完整引擎 SHA。同真值pin工具扩展已在 [books#582](https://github.com/sagitrs/sgstory-books/pull/582)
落入main `50dc983524818421e29ddcdcdc154dcc3faa8234`；这里核到平台合入及同头双票，三方运行数为已读评审证据。
正式游戏pin声明与真实双检出联动仍由books#569/#570交付，不以工具合入冒这两票已完成。
不改网页 `.github/engine-ref.json`，不接 Babel Pages，不解除旧网页发布冻结。

两仓新 CLI 工作流只到各自第一次原型实施 PR 的范围；须联合引用 Tester 正条和补注：
[books 正条](https://github.com/sagitrs/sgstory-books/issues/569#issuecomment-6094384336)、
[books 补注](https://github.com/sagitrs/sgstory-books/issues/569#issuecomment-6094400878)、
[引擎正条](https://github.com/sagitrs/sgstory/issues/2065#issuecomment-6094388869)、
[引擎补注](https://github.com/sagitrs/sgstory/issues/2065#issuecomment-6094401040)。

采纳 PR具名paths、每日schedule与手动workflow_dispatch，不配push-main。
Node22/标准库、只读权限、job不超过3分钟，以及e2e子进程超时/清理、逐局隔离、残留判红、
两树只读、非空两组计数及各组具名刀都是条件，不是本票已有产品能力。
