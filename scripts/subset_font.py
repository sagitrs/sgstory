#!/usr/bin/env python3
"""字体子集化：从 vendor/fonts 的 LXGW WenKai 提取游戏用到的字符，
输出 woff2 子集到 dist/fonts/，并生成引用外链文件的 @font-face CSS。

用法: python3 scripts/subset_font.py <chars-file> <out-css> [fonts-dir=dist/fonts]
字符来源由 build.mjs 收集（全部 src/*.twee + ASCII + 常用标点）。
外链（同目录相对路径）替代 base64 内嵌：HTML 首访更小，复访字体走缓存；
dist 目录自包含，离线打开不受影响（2026-09，首屏性能优化）。
"""
import subprocess
import sys
from pathlib import Path

FONTS = [
    ("Regular", 400, "LXGWWenKai-Regular.ttf"),
    ("Medium", 700, "LXGWWenKai-Medium.ttf"),
]
VENDOR = Path("vendor/fonts")


def subset(weight_file: str, chars_file: Path, out_woff2: Path) -> None:
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(VENDOR / weight_file),
            f"--text-file={chars_file}",
            f"--output-file={out_woff2}",
            "--flavor=woff2",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
        ],
        check=True,
    )


def main() -> None:
    chars_file = Path(sys.argv[1])
    out_css = Path(sys.argv[2])
    fonts_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("dist/fonts")
    fonts_dir.mkdir(parents=True, exist_ok=True)

    rules = ["/* 自动生成：霞鹜文楷子集（scripts/subset_font.py），勿手改 */"]
    for name, weight, file in FONTS:
        out = fonts_dir / f"LXGWWenKai-{name}.woff2"
        subset(file, chars_file, out)
        rules.append(
            "@font-face {\n"
            "  font-family: 'LXGW WenKai';\n"
            f"  src: url('fonts/{out.name}') format('woff2');\n"
            f"  font-weight: {weight};\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            "}"
        )
        print(f"  {name}: {out.stat().st_size // 1024} KB (woff2)")

    out_css.write_text("\n".join(rules) + "\n", encoding="utf-8")
    print(f"  @font-face CSS → {out_css}（外链 dist/fonts/，非阻塞）")


if __name__ == "__main__":
    main()
