# -*- coding: utf-8 -*-
"""
build.py —— SugarCube RPG 增强插件的构建器（零依赖，纯 Python 标准库）

本仓库是一个 **SugarCube 增强插件**（src/core + src/dnd3），不是某个故事。
用它做游戏的方式：一个「故事目录」引用插件源码，编译成单文件网页游戏：

    python build.py [故事目录] [--out 产物名] [--version 版本串] [--host <id|a,b|all>]   # 默认 tests/e2e/old-house ＋ game.html

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

宿主选择（`sgstory#1998` 阶段 6 切片 B）：
  `--host <id>` ⇒ 产物**只装**该宿主包（`src/host/<id>/**`）＋ **注入** `setup.RPG.useHost('<id>')`；
  `--host a,b` ⇒ 装多个（**✗ 注入**：多宿主产物的选择归调用方）；`--host all` ⇒ 全装；
  **缺省** ⇒ 装 `DEFAULT_HOSTS`（本文件里一处常量，现＝ sugarcube）—— ✗ 是「全装」：
  实测量得，全装 ＋ 未选择时 `RPG.portOf` 会在**运行期**抛（单测 774 格中 31 格红、端口取用全线抛）
  ⇒ 缺省产物必须能跑；另一个宿主（`src/host/headless/`）按需 `--host headless` 装。
  未知 id ⇒ **构建期具名抛**（✗ 静默回落默认宿主）。判据：`tests/gates/host-packaging.mjs`。
  ★头注笔：「**空袋＝读的语义 · 用的语义必须是吵的**」——`RPG.ports` 可安静为空，`RPG.portOf` 缺则必抛。
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

# ── 宿主打包选择（`sgstory#1998` 阶段 6 切片 B）────────────────────────────────
HOST_DIR = PLUGIN_SRC / "host"
# ★**一处定义**：缺省构建装哪些宿主。新宿主**不**自动进默认产物 ⇒ 用 `--host <id>` 按需装
#   （`--host all` ⇒ 全装：供「多宿主未选 ⇒ 取用必吵」那一形）。
#   ⚠ 为何缺省是「默认表」而**不是**「全装」（实测）：全装 ＋ ✗ 未选择时 `RPG.portOf` 会在
#     **玩家运行时**抛 —— 实测量得单测 774 格中 31 格红、端口取用全线抛（见 `#1998` 的落点锚），
#     装置与产物会一起坏。★头注笔（领队 13:12）：「**空袋＝读的语义 · 用的语义必须是吵的**」——
#     缺省装默认宿主**不等于**「静默选第一个」：它由这一行显式声明，且每次构建都**打印**装了谁。
DEFAULT_HOSTS = ("sugarcube",)

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


def host_dirs() -> list[str]:
    """宿主 id 的**唯一取值来源**：`src/host/<id>/00-init.js` 存在的目录名。"""
    if not HOST_DIR.is_dir():
        return []
    return sorted(p.name for p in HOST_DIR.iterdir() if p.is_dir() and (p / "00-init.js").exists())


def resolve_hosts(spec: str | None) -> tuple[list[str], bool]:
    """`--host` 取值 ⇒ (要装的宿主 id 列表, 是否显式指定)。
    `None` ⇒ 默认表；`all` ⇒ 全部；`a,b` ⇒ 逐项。
    **未知 id ⇒ 构建期具名抛**（✗ 静默回落默认宿主 —— 那叫「安静地给了别的宿主」）。"""
    available = host_dirs()
    if spec is None:
        return list(DEFAULT_HOSTS), False
    s = spec.strip()
    parts = list(available) if s == "all" else [x.strip() for x in s.split(",") if x.strip()]
    if not parts:
        raise SystemExit("✗ `--host` 需要一个非空的宿主 id（或 `all`）。现有：" + ("／".join(available) or "（无）"))
    unknown = [x for x in parts if x not in available]
    if unknown:
        raise SystemExit("✗ 未知宿主：" + "、".join(unknown)
                         + "（现有：" + ("／".join(available) or "（无）") + "）"
                         + " —— 宿主 id ＝ `src/host/<id>/` 的目录名，✗ 静默回落默认宿主")
    seen, ids = set(), []
    for x in parts:
        if x not in seen:
            seen.add(x)
            ids.append(x)
    return ids, True


def host_selection_js(hosts: list[str], explicit: bool) -> str | None:
    """`--host` 显式指定**单个**宿主 ⇒ 产物里**注入**一行选择（让产物**自证**选了谁）。
    多宿主／缺省 ⇒ ✗ 注入：多宿主产物的选择归调用方（那正是「取用必吵」那一形，✗ 由构建猜）。"""
    if not (explicit and len(hosts) == 1):
        return None
    return ("/* ===== 由 build.py --host 注入：宿主选择 ===== */\n"
            + f"(function () {{ 'use strict'; setup.RPG.useHost('{hosts[0]}'); }})();")


def collect_js_files(hosts=None):
    """[(展示路径, 文件, 命名空间别名)]：插件源码在前，各自按路径排序。
    别名 = 包根目录名大写（dnd3→DND3, dnd/dnd-5e→DND-5E→DND5E）。
    `hosts` ＝ 要装进产物的宿主包 id（`None` ⇒ `DEFAULT_HOSTS`）。
    ★`src/host/<id>/**` 里**未选中**的宿主包一律**不入**产物（归属按目录名）；`src/host/*.js` 是公共件，恒入。
    """
    选 = set(DEFAULT_HOSTS if hosts is None else hosts)
    result = []
    for f in sorted(PLUGIN_SRC.rglob("*.js")):
        rel = f"src/{f.relative_to(PLUGIN_SRC).as_posix()}"
        seg = rel.split("/")
        归属 = seg[2] if len(seg) > 3 and seg[0] == "src" and seg[1] == "host" else None
        if 归属 and 归属 not in 选:
            continue
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


def build_unit_bundle(hosts=None, explicit=False):
    """插件源码 → tests/unit/dist/bundle.js（shims 由 framework/ 提供）；
    并扫描 tests/unit/*.test.js 生成 dist/manifest.js（新用例文件自动被发现）。"""
    bundle = UNIT_DIST / "bundle.js"
    UNIT_DIST.mkdir(parents=True, exist_ok=True)
    parts = js_parts_of(collect_js_files(hosts))
    sel = host_selection_js(list(DEFAULT_HOSTS) if hosts is None else hosts, explicit)
    if sel:
        parts.append(sel)                       # ★`#1998`：产物自证选了谁（✗ 靠命令行留痕）
    bundle.write_text("\n\n".join(parts), encoding="utf-8")
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


def build_story(story_dir: pathlib.Path, out_name: str = "game.html", build_version: str | None = None,
                hosts=None, explicit=False):
    story_src = story_dir / "src"
    out = story_dir / out_name

    # 脚本：插件在前 + 故事在后（故事侧不注入包别名，需要时自行声明局部别名）
    plugin_paths = collect_js_files(hosts)
    story_paths = [
        (f"story/{f.relative_to(story_src).as_posix()}", f, None) for f in sorted(story_src.rglob("*.js"))
    ]
    script_parts = js_parts_of(plugin_paths)
    sel = host_selection_js(list(DEFAULT_HOSTS) if hosts is None else hosts, explicit)
    if sel:
        script_parts.append(sel)      # ★`#1998`：插在**插件与故事之间**（宿主包已装载、故事尚未跑）
    script_parts += js_parts_of(story_paths)

    # twee 段落
    passages = []
    for f in sorted(story_src.rglob("*.twee")):
        passages += parse_twee(f.read_text(encoding="utf-8"))

    # ★`#1879` D9：`--version X` ⇒ 在**段落体**里把缺省串替换为 `<<set $buildVersion to "X">>`。
    #   ★为何在**段落体**（✗ 产物 HTML）：产物里 `<<`/`>>` 已**转义**为 `&lt;&lt;`/`&gt;&gt;` ⇒ 精确串在产物文本里**命中 0** ✗（本席实测踩过）。
    #   只改**产物**（✗ 动源树 ⇒ 源树零污染）；**缺省不传 ⇒ 产物逐字节同旧**（刀）。
    if build_version is not None:
        default_set = '<<set $buildVersion to "—">>'
        hits = 0
        for i, (nm, tags, body) in enumerate(passages):
            if default_set in body:
                hits += body.count(default_set)
                passages[i] = (nm, tags, body.replace(default_set, f'<<set $buildVersion to "{build_version}">>', 1))
        if hits != 1:   # ★命中数断言（本仓硬习惯）：✗ 静默无操作、✗ 误伤多处
            raise SystemExit(f"✗ --version 注入失败：缺省串在段落体里命中 {hits} 次（须恰 1）")
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

    out.write_text(doc, encoding="utf-8")
    # ★故事目录可在**引擎仓之外**（拆分仓布局：故事在 books 仓、引擎在此检出）⇒ 相对路径打不出来时
    #   退回绝对路径。原先直接 `relative_to(ROOT)` 会抛 `ValueError` ⇒ **产物已写成功但退出码非零**
    #   ⇒ CI 误判「构建失败」（实测：books#76 相 A 的演练里踩到）。
    try:
        shown = out.relative_to(ROOT)
    except ValueError:
        shown = out
    print(f"构建完成：{shown}")
    print(f"  段落数：{len(rows)}，插件 js：{len(plugin_paths)}，"
          f"故事 js：{len(story_paths)}，标题「{title}」")


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
    # ★`sgstory#1998`：`--host <id|a,b|all>`（缺省 ⇒ 默认表；每次构建都打印装了谁 —— 见文件头）。
    host_spec = None
    if "--host" in args:
        i = args.index("--host")
        if i + 1 >= len(args):
            raise SystemExit("用法：python build.py [故事目录] [--out 产物名.html] [--version 版本串] [--host <id|a,b|all>]")
        host_spec = args[i + 1]
        del args[i:i + 2]
    story_dir = pathlib.Path(args[0]) if args else DEFAULT_STORY
    if not story_dir.is_absolute():
        story_dir = ROOT / story_dir
    hosts, explicit = resolve_hosts(host_spec)
    print(f"  宿主：{'--host 指定' if explicit else '未指定 --host ⇒ 按**默认宿主**装'} ⇒ "
          + ("、".join(hosts) or "（无）") + f"（现有：{'／'.join(host_dirs()) or '（无）'}）")
    build_unit_bundle(hosts, explicit)
    build_story(story_dir, out_name, build_version=build_version, hosts=hosts, explicit=explicit)


if __name__ == "__main__":
    main()
