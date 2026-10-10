# 独立 CLI 引擎源码分区

关联 [目录与旧构建隔离 #2064](https://github.com/sagitrs/sgstory/issues/2064)。

本目录属于独立命令行引擎，不属于 SugarCube 插件或旧 headless 宿主。
目前只完成目录边界；可运行入口、状态/RNG提交、存读及真实终端测试由
[完整原型 #2066](https://github.com/sagitrs/sgstory/issues/2066) 交付，不能据此声称原型已可运行。

`build.py` 明确排除本目录及其任意深度子目录的 `.js`，也不把这里的
`00-init.js` 识别为网页规则包；不是仅因初期文件使用 `.mjs` 才碰巧未收集。
`src/core/`、`src/dnd/`、`src/host/` 及其他网页插件路径保持原入口与包装方式。

测试工具根仍是 `tests/`。本边界的生产构建器测试与具名刀在
[`tests/build/cli_source_isolation_test.py`](../../tests/build/cli_source_isolation_test.py)，
后续 CLI unit/e2e 的拟用位置为 `tests/cli/`，尚不表示这些用例已经存在。
总体布局与边界说明见 [CLI 计划索引](../../docs/plans/cli/README.md)。
