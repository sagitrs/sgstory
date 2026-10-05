# `build.py`：可选离线 SVG 素材

References #2009
References #1225
References sagitrs/sgstory-books#311

这是当前 SugarCube 单文件构建器的**自愿入口**，不是新领域模型或运行时端口。引擎不保存故事美术，也不认识人物、道具、层号、装备效果或存档槽位。

## 声明与消费

在故事根目录的 `story.json` 保留现有 `packs`，另加素材表：

```json
{
  "packs": ["dnd3"],
  "assets": {
    "example-portrait": "assets/portrait.svg"
  }
}
```

ID 必须由小写字母开头，只含小写字母、数字和连字符。路径使用 POSIX 相对写法，必须位于本故事的 `assets/` 内。绝对路径、远程 URL、`..`、逃逸软链、缺失文件和非 SVG 文件均在构建期拒绝，错误带素材 ID。未声明或声明空表的故事不注入任何新字节。

通过验证的源字节以 base64 data URL 注入**故事脚本之前**，不会旁挂图片，也不产生图片网络请求：

```js
const asset = setup.storyAssets?.['example-portrait'];
// { src, width, height, mime: 'image/svg+xml', sha256 }
// 表和每条描述均 Object.freeze；它不写入 State.variables。
```

只读表使用无原型对象，`setup.storyAssets` 属性不可赋值。属性可配置，供独立宿主测试装置替换或清理，不是玩家配置／存档接口。

故事自行决定如何呈现。装饰图应保留邻近的名称、状态、数量和动作文本；使用固有尺寸预留版面，失败时只移除装饰，不再次调用故事动作。未知 ID 是无图，不等于图片请求失败。素材必须带自身来源、许可和用途清单。

## 本片 SVG 输入范围

允许：SVG 命名空间的根与分组、路径、矩形、圆／椭圆、线／多边形、`defs`、局部线性／径向渐变及 `title`／`desc`。根必须声明正整数像素的 `width`、`height`。具体属性白名单在构建器中；引用只支持 `url(#局部ID)`。

不支持：脚本、事件属性、CSS／`style`、外部引用、嵌入 HTML／图片、动画、`use`、DTD、实体或处理指令。构建器是这份有限静态格式的验证器，**不承诺接受任意 SVG 导出物**。单文件 1 MiB 是解析输入保护上限，不是故事美术或发布性能预算。

## 与历史资产政策的关系

历史 #1225 的旁挂资源、`itemIcon`、`rows.assets` 和页面预算属于旧 `build.mjs` 链。该票关闭评论要求新干线另票。本入口不改写那条链，也不声称满足它的预算验收：**本构建器内嵌后，HTML 字节会实际增加**。字体、PNG／WebP、远程资源、压缩／裁切产线与正式预算门仍不在本片范围。宿主和规则包选择仍由既有 `--host`／`packs` 管理。

## 测试与回滚

```bash
timeout 25 python3 tests/build/story_assets_test.py
timeout 90 node tests/gates/pack-selection.mjs --verbose
```

前者直接测生产构建函数，使用临时故事；真 `build_story` 臂替换 SugarCube 外壳模板，但不替换插件收集、资产验证或故事注入。后者是已有 CI 入口，同步运行这些资产测试与既有规则包六臂；没有新增 workflow。构建测试不替代真实浏览器布局、字体或资源失败验收。

没有该能力的旧引擎会忽略 `assets`；消费端须采用可选读取并保持文字回退。移除声明即可回到无图产物；双仓正式回滚仍应成对退回 books 提交与完整 engine pin，不能把只读素材当作领域迁移。
