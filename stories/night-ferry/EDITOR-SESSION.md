# 编辑器操作留痕（P4 · `#991`）

- ② 新建：starterPackage({slug:'night-ferry', title:'夜渡', entry:'渡口'}) ⇒ 源 3 数据面 ＋ 1 源件
- ③ 保存：savePackage() ⇒ 4 件（tables.json · contract.json · rules.json · 00-meta.twee）· 建目录 0 次
- ④ 落盘：stories/night-ferry/data/tables.json · stories/night-ferry/data/contract.json · stories/night-ferry/data/rules.json · stories/night-ferry/00-meta.twee

> 口径 ✓：**内容由编辑器模块产出** ✓（`starterPackage()` ＋ `savePackage()`）；本脚本只做"取输入 ⇒ 调内核 ⇒ 搬结果" ✓，**不长内容** ✗。
