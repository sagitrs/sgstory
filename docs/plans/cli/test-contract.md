# CLI 首原型测试接入契约（#2065）

References #2065；实施归 #2066。本契约交付文档和许可依据，不冒产品执行绿。

## 权源、范围与依赖

专业依据须共同读：
- [引擎正条6094388869](https://github.com/sagitrs/sgstory/issues/2065#issuecomment-6094388869)。
- [引擎补注6094401040](https://github.com/sagitrs/sgstory/issues/2065#issuecomment-6094401040)。
- 两条所引的[books正条6094384336](https://github.com/sagitrs/sgstory-books/issues/569#issuecomment-6094384336)与[补注6094400878](https://github.com/sagitrs/sgstory-books/issues/569#issuecomment-6094400878)，不能由书侧批准反推引擎授权。

只在首次完整引擎原型PR新增 `.github/workflows/cli-tests.yml`；不修改已有 `test.yml` 或 `e2e-seam.yml`，该实施PR合入即止。#2064独立隔离PR已合于完整SHA `7ba71fe142e9da79bdbbecdbdfa0b5f34d25a4bb`；本契约不要求完整原型先合入，不构造依赖环。游戏仍待完整原型合法合入，不用此隔离SHA代正式游戏引擎。

## 拟实施的触发全文和步骤

```yaml
name: cli-tests
on:
  pull_request:
    paths:
      - '.github/workflows/cli-tests.yml'
      - 'src/cli/**'
      - 'tests/cli/**'
      - 'docs/plans/cli/**'
      - 'README.md'
      - 'tests/README.md'
  schedule:
    - cron: '17 3 * * *'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  cli:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          persist-credentials: false
      - name: Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: CLI registry and trigger contract
        run: node tests/cli/check-ci.mjs
      - name: CLI nonempty families and knives
        env:
          TMPDIR: ${{ runner.temp }}
        run: |
          node tests/cli/run-unit.mjs
          node tests/cli/run-e2e.mjs
          node tests/cli/run-unit.mjs --selftest
          node tests/cli/run-e2e.mjs --selftest
      - name: CLI readonly
        if: always()
        run: git status --porcelain=v1 --untracked-files=all > "$RUNNER_TEMP/cli-status"; test ! -s "$RUNNER_TEMP/cli-status"
```

实施前收敛为5个step，符合规则gates.md §C每job不超过五步；四条具名族/刀命令合在一个fail-fast步骤，不减少调用或用例。checkout不保留凭据，测试step的TMPDIR用runner.temp，Local用TMPDIR或HOME/tmp，不写共享/tmp。runner上下文不适用于job级env，必须放在step级env；[平台拒绝读数及修补记录](https://github.com/sagitrs/sgstory/pull/2077#issuecomment-6096757662)不被本地名单对账绿掩盖。

头注须写：无部署/Pages/外部模型/写仓动作；单个CLI进程10秒、unit族30秒、e2e族75秒、整job3分钟。Node22及标准库，无新npm包。新workflow之外的旧workflow逐字不动。每日/手动补PR路径过滤；无push-main。

paths是步骤读取档面的保守目录覆盖，不仅看run参数的basename。源码与测试/夹具/支持件由runner读取；workflow、自身契约及README登记由 `check-ci.mjs`实际读取。该门列唯一具名路径表、步骤命令及两runner登记，拒缺项/额外触发面/未知命令；不把既有仅验步骤键形的 `workflow-steps.mjs`冒充名单对账门。

## 测试、计数和错误级别

- 单元入口 `tests/cli/run-unit.mjs`；实际套件 `tests/cli/unit/*.test.mjs`。验证原子提交/拒绝/异常、条件、用途RNG及重现、完整信封/版本/状态/RNG校验、读写失败和失败保原会话。故障注入只在单元/组件。
- e2e入口 `tests/cli/run-e2e.mjs`；实际套件 `tests/cli/e2e/*.test.mjs`。启动 `src/cli/main.mjs` 与正常游戏夹具，经stdout/stderr与stdin交互；不用引擎API代玩、造状态/档或中途换RNG。启动seed是公开正常参数。覆盖条件拒绝、查询/无效输入、整段结束、正常保存/退出/同目录重启读取、EOF与SIGINT、中文重定向。
- 用例名入 `tests/cli/registry.json`；runner启动Node自带test/TAP，核真实执行的名称及tests/pass/fail/skip分母。缺文件、0用例、登记遗漏、实际名称/数量不符不得绿。套件计划总数不由一句硬编码“全绿”产生。
- 每组输出通过、产品失败、环境作废、未覆盖；问题总数是后三者和，套件计划总数是通过加问题总数。同套件/轮次/粒度计算，命令数不与用例数相加。
- 断言缺陷具名rc1；工具/依赖/git装置不可用具名rc2；超时单独具名为TIMEOUT并记环境作废、rc2，不记成产品断言或跳过。预期拒绝/坏档/故障注入通过是相应测试成功，不冒产品失败数。
- 每个玩家用例独立tmpdir，同一用例的保存/重启共享它；跑完终止并等待自己创建的CLI进程，清除该目录，父目录出现残留即具名红。不得全局pkill或清别人的目录。
- runner比较本树前后git状态及CLI源码/测试hash，不允许测试写本树；正式CI最后要求git状态为空。开发时未提交文件不能被“恢复”删掉，前后差异与CI净树分开声明。

## 在册刀与复原

两runner各有 `--selftest`，只在临时源码副本下刀，正常玩家e2e保持不变。

- U1：摘掉动作后提交RNG状态；单元应具名断言红rc1。
- E1：摘掉load替换会话；CLI仍输出读取完成，但实际状态没有恢复，正常保存/重启/读取用例应断言红rc1，不能拿超时当刀命中。

每组自证独立计基线绿、真刀指定用例红rc1、复原绿、被改源码字节同四项。缺锚/工具或无法执行属装置错，不是有效刀。不得下刀真实源树、删测试换绿、把恢复叫第二把刀。

## 交付状态

这份是接入契约。新入口、工作流、测试用例和实际分母随完整原型PR实现、实跑和现头自审后提交，独立D/T仅对非Draft现头投票。文档许可验收与产品运行验收分账；作者不以此文档自授合入或关闭权限。模型试玩、费用/资源测量、正式HoF游戏及旧网页自然UI不在本契约的执行绿中。
