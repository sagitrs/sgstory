# 迷雾森林 · Twine + SugarCube 脚手架

基于浏览器的文字冒险游戏模板：**Twee 纯文本源码 → 编译成单个 HTML 文件**。
剧情用 git 管理，构建走 CLI，也可随时导入 Twine 2 可视化编辑器双向编辑。

## 快速开始

**▶ 在线试玩：https://sagitrs.github.io/sgstory/**（push 到 main → 测试通过 → 自动发布）

```bash
npm install
npm run build   # 编译 → dist/index.html（单文件，浏览器直接打开即玩）
npm run serve   # 本地预览：http://localhost:8000
npm test        # jsdom 无头冒烟测试（启动/跳转/变量/条件链接）
npm run watch   # 修改 src/ 自动重新编译
```

## 目录结构

```
src/
  00-meta.twee    故事元数据：标题、IFID、起始段落
  10-init.twee    StoryInit（全局变量初始化）+ Widgets（自定义组件）
  20-story.twee   ★ 剧情正文（你主要写的地方）
  80-script.twee  StoryScript：自定义 JS 宏（血条 <<hpbar>> 等）
  90-style.twee   StoryStyleSheet：全局样式（暗色主题）
vendor/
  format.js       SugarCube 2.37.3 官方 story format（升级时替换此文件）
test/smoke.mjs    无头冒烟测试
build.mjs         合并 src/*.twee → extwee 编译
dist/index.html   编译产物（单文件游戏）
```

## Twee 语法速查

```
:: 段落名              定义段落（一个"场景/节点"）
[[显示文字|段落名]]     链接跳转（也可写成 [[段落名->显示文字]]）
$hp                   变量（$ 开头，可直接写在正文里插值）
<<set $gold -= 10>>    赋值
<<if $gold gte 10>>…<<else>>…<</if>>   条件（gte/lte/eq/is/not）
<<textbox "$name" "默认值">>           文本输入
<<damage 20>>          本模板自定义 Widget：扣血 + 死亡跳转
<<hpbar>>              本模板自定义宏：渲染血条
<<include "段落名">>    在当前段落中嵌入另一个段落
''粗体''  //斜体//      基础排版
/% 注释 %/             注释不会输出
```

## 本模板内置的演示机制

| 机制 | 位置 | 说明 |
|---|---|---|
| 全局状态 | `StoryInit` | $hp/$gold/道具旗标 |
| 输入角色名 | `开场` | `<<textbox>>` |
| 商店/资源 | `酒馆 → 买火把` | 金币扣减 + 条件链接 |
| 情报影响剧情 | `听传闻 → 吊桥` | 听过提示可免坠落伤害 |
| 随机骰子 | `洞穴/战斗/吊桥` | `random(1, 6)` + 分支 |
| 战斗/受伤 | `战斗/鲁莽挑战` | `<<damage N>>` Widget |
| 道德分支 | `贿赂哥布林` | 不杀哥布林 → 独立结局 |
| 多结局 | `结局 *` × 4 | 胜利/和平/空手/死亡 |
| 实时状态栏 | `StoryCaption` | 名字/血条/金币/背包 |
| 自定义宏 | `StoryScript` | JS 写的 `<<hpbar>>` |
| 存档元数据 | `StoryScript` | `Save.onSave` 写入名字/血量/金币 |

存档/读档/回退/重开都在**左侧边栏菜单**（SugarCube 内置，自动持久化到浏览器 localStorage）。

## 与 Twine 2 编辑器配合

Twine 2（桌面版）可以**导入编译产物继续可视化编辑**：

1. 打开 Twine 2 → Library → Import → 选 `dist/index.html`
2. 节点图里编辑后导出 HTML
3. `npx extwee -d -i 导出的.html -o 反编译.twee` 可回到 Twee 源码

建议：日常写作用 Twee + git；给策划看结构时用 Twine 2。

## 升级 SugarCube

1. 到 https://github.com/tmedwards/sugarcube-2/releases 下载新版 zip
2. 用其中的 `format.js` 替换 `vendor/format.js`
3. 更新 `src/00-meta.twee` 里的 `format-version`

## 参考

- SugarCube 文档（必读）：https://www.motoslave.net/sugarcube/2/docs/
- Twee 3 规范：https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
- extwee（编译器）：https://github.com/videlais/extwee
- Twine 官网/下载：https://twinery.org
- VS Code 语法高亮：扩展商店搜 **twee3-language-tools**

## 许可

| 部分 | 许可证 | 文件 |
|---|---|---|
| 代码（构建脚本、自定义宏、样式） | MIT | [LICENSE](LICENSE) |
| 剧情文本与游戏内容（叙事、角色、结局） | CC BY 4.0 | [LICENSE-CONTENT.md](LICENSE-CONTENT.md) |
| SugarCube 2（引擎，vendor 并嵌入产物） | BSD-2-Clause（© Thomas Michael Edwards） | [NOTICE](NOTICE) |
| extwee / jsdom（仅开发期） | MIT | [NOTICE](NOTICE) |

发布流程：push 到 main → CI 跑测试 → 构建并自动发布到 GitHub Pages。
