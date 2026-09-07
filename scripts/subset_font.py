#!/usr/bin/env python3
"""字体子集化：从 vendor/fonts 的 LXGW WenKai 提取游戏用到的字符，
输出 woff2 子集并生成含 base64 data-URI 的 Twee 样式段落。

用法: python3 scripts/subset_font.py <chars-file> <out-twee>
字符来源由 build.mjs 收集（全部 src/*.twee + ASCII + 常用标点）。
"""
import base64
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
    out_twee = Path(sys.argv[2])

    rules = [":: 95-fontface [stylesheet]", "/* 自动生成：霞鹜文楷子集（scripts/subset_font.py），勿手改 */"]
    total = 0
    for name, weight, file in FONTS:
        tmp = Path(f"build/wenkai-{name}.woff2")
        tmp.parent.mkdir(exist_ok=True)
        subset(file, chars_file, tmp)
        data = base64.b64encode(tmp.read_bytes()).decode()
        total += len(data)
        rules.append(
            "@font-face {\n"
            "  font-family: 'LXGW WenKai';\n"
            f"  src: url(data:font/woff2;base64,{data}) format('woff2');\n"
            f"  font-weight: {weight};\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            "}"
        )
        print(f"  {name}: {tmp.stat().st_size // 1024} KB (woff2)")

    out_twee.write_text("\n".join(rules) + "\n", encoding="utf-8")
    print(f"  base64 总量: {total // 1024} KB → {out_twee}")


if __name__ == "__main__":
    main()
