# -*- coding: utf-8 -*-
"""
build.py —— SugarCube RPG 增强插件的构建器（零依赖，纯 Python 标准库）

本仓库是一个 **SugarCube 增强插件**（src/core + src/dnd3），不是某个故事。
用它做游戏的方式：一个「故事目录」引用插件源码，编译成单文件网页游戏：

    python build.py [故事目录] [--out 产物名]   # 默认 tests/e2e/old-house ＋ game.html

同时总会生成 tests/unit/bundle.js（插件源码的测试构建，供单元测试页加载）。

故事目录约定：
    <story>/src/**/*.twee    故事段落（剧情、widget、样式）
    <story>/src/**/*.js      故事侧脚本（在插件之后加载）
    产物写到 <story>/game.html（`--out 名字.html` 可改名，如 stories/babel 的 babel-trial.html）
    故事标题写在 StoryData 的 "title" 字段

源码形态：
  1. 独立 .js 文件——按路径排序合并，数字前缀控制顺序。build.py 按文件
     所属包自动包 IIFE 并注入命名空间别名：
       <任意>/src/core/** →  (function (RPG, $) {...})(setup.RPG, jQuery)
       <任意>/src/dnd3/** →  (function (RPG, DND3, $) {...})(setup.RPG, setup.DND3, jQuery)
       其他               →  (function (RPG, $) {...})(setup.RPG, jQuery)
     首行 /* raw */ 的文件跳过包装（用于创建命名空间本身）。
  2. twee 段落；兼容旧写法 :: 名称 [script]。
"""
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
PLUGIN_SRC = ROOT / "src"
UNIT_DIR = ROOT / "tests" / "unit"
UNIT_DIST = UNIT_DIR / "dist"  # 测试构建产物（bundle/manifest，勿手改）
VENDOR = ROOT / "vendor"
DEFAULT_STORY = ROOT / "tests" / "e2e" / "old-house"

HEADER_RE = re.compile(
    r"^::\s*(?P<name>[^\[\{]*?)\s*(?:\[(?P<tags>[^\]]*)\])?\s*(?:\{.*\})?\s*$"
)
RAW_PRAGMA = "/* raw */"


def parse_twee(text):
    """解析 twee 文本 → [(段落名, 标签列表, 段落内容), ...]"""
    passages, cur, buf = [], None, []
    for line in text.splitlines():
        m = HEADER_RE.match(line)
        if m:
            if cur is not None:
                passages.append((cur[0], cur[1], "\n".join(buf).strip("\n")))
            cur = (m.group("name").strip(), (m.group("tags") or "").split())
            buf = []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        passages.append((cur[0], cur[1], "\n".join(buf).strip("\n")))
    return passages


def esc(text):
    """段落内容里的 < > & 需要 HTML 转义（浏览器会自动还原）"""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap_js(content: str, alias: str | None = None) -> str:
    """给 .js 内容自动包 IIFE 并注入命名空间别名。

    alias 为规则包的命名空间别名（如 'DND3'）——包目录下的文件都会注入；
    首行 /* raw */ 跳过包装（用于创建命名空间本身的文件）。
    """
    if content.lstrip().startswith(RAW_PRAGMA):
        return content.rstrip("\n")
    if alias:
        args, vals = f"(RPG, {alias}, $)", f"(setup.RPG, setup.{alias}, jQuery)"
    else:  # core、故事侧脚本统一注入 RPG 与 jQuery
        args, vals = "(RPG, $)", "(setup.RPG, jQuery)"
    return (
        "(function " + args + " {\n"
        "\t'use strict';\n"
        + content.rstrip("\n")
        + "\n})" + vals + ";"
    )


def plugin_alias(rel_to_src: str) -> str | None:
    """src/<包>/<文件>：包名不是 core 时，注入“包名大写”作为命名空间别名。

    例如 src/wfrp/** → 注入 WFRP；前提是该包的 00-init（raw）已创建 setup.WFRP。
    """
    top = rel_to_src.split("/")[0] if "/" in rel_to_src else ""
    return None if top in ("", "core") else top.upper()


def find_pack_root(file_path: pathlib.Path) -> pathlib.Path | None:
    """从 .js 文件向上找最近的包含 00-init.js 的目录（包根）。"""
    d = file_path.parent
    while d != ROOT and d != PLUGIN_SRC.parent:
        if (d / "00-init.js").exists():
            return d
        d = d.parent
    return None


def collect_js_files():
    """[(展示路径, 文件, 命名空间别名)]：插件源码在前，各自按路径排序。
    别名 = 包根目录名大写（dnd3→DND3, dnd/dnd-5e→DND-5E→DND5E）。
    """
    result = []
    for f in sorted(PLUGIN_SRC.rglob("*.js")):
        rel = f"src/{f.relative_to(PLUGIN_SRC).as_posix()}"
        pack_root = find_pack_root(f)
        if pack_root:
            alias = pack_root.name.upper().replace("-", "")
        else:
            alias = None  # core 或不在包内的文件
        result.append((rel, f, alias))
    return result


def js_parts_of(paths):
    parts = []
    for display_rel, f, alias in paths:
        parts.append(
            f"/* ===== {display_rel} ===== */\n" + wrap_js(f.read_text(encoding="utf-8").strip("\n"), alias)
        )
    return parts


def load_template():
    """读取 SugarCube 引擎的 HTML 文档模板（window.storyFormat 包装）。"""
    raw = (VENDOR / "format.js").read_text(encoding="utf-8").strip()
    if raw.startswith("window.storyFormat("):
        inner = raw[len("window.storyFormat("):]
        obj, _ = json.JSONDecoder().raw_decode(inner)
        return obj["source"]
    return raw


def build_unit_bundle():
    """插件源码 → tests/unit/dist/bundle.js（shims 由 framework/ 提供）；
    并扫描 tests/unit/*.test.js 生成 dist/manifest.js（新用例文件自动被发现）。"""
    bundle = UNIT_DIST / "bundle.js"
    UNIT_DIST.mkdir(parents=True, exist_ok=True)
    bundle.write_text("\n\n".join(js_parts_of(collect_js_files())), encoding="utf-8")
    print(f"单元测试 bundle：{bundle.relative_to(ROOT)}")

    test_files = sorted(
        p.relative_to(UNIT_DIR).as_posix() for p in UNIT_DIR.rglob("*.test.js")
    )
    manifest = UNIT_DIST / "manifest.js"
    manifest.write_text(
        "/* 由 build.py 生成：测试文件清单（目录镜像 src/ 结构），勿手改 */\n"
        "window.__TEST_FILES = " + json.dumps(test_files, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"单元测试清单：{manifest.relative_to(ROOT)}（{len(test_files)} 个用例文件）")


def build_story(story_dir: pathlib.Path, out_name: str = "game.html", build_version: str | None = None):
    story_src = story_dir / "src"
    out = story_dir / out_name

    # 脚本：插件在前 + 故事在后（故事侧不注入包别名，需要时自行声明局部别名）
    js_paths = collect_js_files()
    js_paths += [
        (f"story/{f.relative_to(story_src).as_posix()}", f, None) for f in sorted(story_src.rglob("*.js"))
    ]
    script_parts = js_parts_of(js_paths)

    # twee 段落
    passages = []
    for f in sorted(story_src.rglob("*.twee")):
        passages += parse_twee(f.read_text(encoding="utf-8"))

    meta = {"ifid": "", "format-version": "2.37.3", "start": "开始", "title": "未命名故事"}
    style_parts, twee_script_parts, rows, pid_map = [], [], [], {}
    pid = 1
    for name, tags, body in passages:
        if name == "StoryData":
            meta.update(json.loads(body))
        elif "stylesheet" in tags or name == "StoryStylesheet":
            style_parts.append(body)
        elif "script" in tags or name == "StoryScript":
            twee_script_parts.append(f"/* ===== twee: {name} ===== */\n" + body)
        else:
            pid_map[name] = pid
            pos = f"{100 + pid * 24},100"
            rows.append(
                f'\t\t<tw-passagedata pid="{pid}" name="{html.escape(name, quote=True)}"'
                f' tags="{" ".join(tags)}" position="{pos}">{esc(body)}</tw-passagedata>'
            )
            pid += 1

    start_pid = pid_map.get(meta["start"], 1)
    title = meta.get("title", "未命名故事")
    style = "\n".join(style_parts)
    # <script> 是 raw-text 元素：不做实体转义，但必须防止提前闭合标签
    script = "\n\n".join(script_parts + twee_script_parts).replace("</script", "<\\/script")

    storydata = (
        f'<tw-storydata name="{html.escape(title, quote=True)}" startnode="{start_pid}"'
        f' creator="build.py" creator-version="2.0" ifid="{meta["ifid"]}"'
        f' format="SugarCube" format-version="{meta["format-version"]}"'
        ' options="" zoom="1" hidden>\n'
        f'\t\t<style role="stylesheet" id="tw-user-stylesheet" type="text/twine-css">{style}</style>\n'
        f'\t\t<script role="script" id="tw-user-script" type="text/twine-javascript">{script}</script>\n'
        + "\n".join(rows)
        + "\n\t</tw-storydata>"
    )

    doc = (load_template()
           .replace("{{STORY_NAME}}", html.escape(title))
           .replace("{{STORY_DATA}}", storydata))

    # ★`#1879` D9：`--version X` ⇒ 把故事里的**缺省串**替换为 `<<set $buildVersion to "X">>`。
    #   只改**产物文本**（✗ 动源树 ⇒ 源树零污染）；**缺省不传 ⇒ 产物逐字节同旧**（刀）。
    if build_version is not None:
        default_set = '<<set $buildVersion to "—">>'
        hit = doc.count(default_set)
        if hit != 1:   # ★命中数断言（本仓硬习惯）：✗ 静默无操作、✗ 误伤多处
            raise SystemExit(f"✗ --version 注入失败：缺省串命中 {hit} 次（须恰 1）")
        doc = doc.replace(default_set, f'<<set $buildVersion to "{build_version}">>', 1)
    out.write_text(doc, encoding="utf-8")
    # ★故事目录可在**引擎仓之外**（拆分仓布局：故事在 books 仓、引擎在此检出）⇒ 相对路径打不出来时
    #   退回绝对路径。原先直接 `relative_to(ROOT)` 会抛 `ValueError` ⇒ **产物已写成功但退出码非零**
    #   ⇒ CI 误判「构建失败」（实测：books#76 相 A 的演练里踩到）。
    try:
        shown = out.relative_to(ROOT)
    except ValueError:
        shown = out
    print(f"构建完成：{shown}")
    print(f"  段落数：{len(rows)}，插件 js：{len(collect_js_files())}，"
          f"故事 js：{len(js_paths) - len(collect_js_files())}，标题「{title}」")


def main():
    args = list(sys.argv[1:])
    # `--out 名字.html`：产物文件名（缺省 game.html ⇒ 旧行为逐字节不变）。
    out_name = "game.html"
    if "--out" in args:
        i = args.index("--out")
        if i + 1 >= len(args):
            raise SystemExit("用法：python build.py [故事目录] [--out 产物名.html]")
        out_name = args[i + 1]
        del args[i:i + 2]
    # ★`#1879` D9：`--version 版本串`（缺省不传 ⇒ 旧行为逐字节不变）。
    build_version = None
    if "--version" in args:
        i = args.index("--version")
        if i + 1 >= len(args):
            raise SystemExit("用法：python build.py [故事目录] [--out 产物名.html] [--version 版本串]")
        build_version = args[i + 1]
        del args[i:i + 2]
    story_dir = pathlib.Path(args[0]) if args else DEFAULT_STORY
    if not story_dir.is_absolute():
        story_dir = ROOT / story_dir
    build_unit_bundle()
    build_story(story_dir, out_name, build_version=build_version)


if __name__ == "__main__":
    main()
