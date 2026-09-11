#!/usr/bin/env bash
# #263（#185 阶段五）真实浏览器验收的依赖准备：容器里常缺 Chrome 的系统库，且没有 root。
# 做法：apt-get download（不需要 root）→ dpkg -x 就地解包到本地目录 → 用 LD_LIBRARY_PATH 指过去。
#
#   ./scripts/chrome-deps.sh [目标目录]      # 默认 ~/.cache/sgstory-chrome-deps
#   CHROME_PATH=/path/to/chrome LD_LIBRARY_PATH=<目录>/usr/lib/x86_64-linux-gnu node test/browser.mjs
#
# 浏览器本体用 Chrome for Testing（~/.cache/puppeteer/chrome/*/chrome-linux64/chrome）；
# test/browser.mjs 会自动扫描，也可用 CHROME_PATH 指定。
set -euo pipefail
DIR="${1:-$HOME/.cache/sgstory-chrome-deps}"
mkdir -p "$DIR" && cd "$DIR"
PKGS=(
  libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64
  libgbm1 libpango-1.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxres1
  libpangocairo-1.0-0 libpangoft2-1.0-0 libxkbcommon0 libxkbcommon-x11-0 libdrm2
  libwayland-client0 libwayland-cursor0 libwayland-egl1 libffi8 libthai0 libdatrie1
  libgraphite2-3 libharfbuzz0b libpixman-1-0 libxcb-render0 libxcb-shm0 libxrender1
  libfontconfig1 libfreetype6 libpng16-16 libbrotli1 libexpat1 libglib2.0-0t64
  libavahi-client3 libavahi-common3 libgnutls30t64 libgmp10 libnettle8t64 libhogweed6t64
  libidn2-0 libunistring5 libtasn1-6 libp11-kit0 libxau6 libxdmcp6 libbsd0 libmd0
  libselinux1 libpcre2-8-0 libzstd1 liblzma5 libxi6 libxtst6 libxext6 libx11-6 libxcb1
  libx11-xcb1 libsm6 libice6 libuuid1 libcap2 libgcrypt20 libgpg-error0 libsystemd0
  liblz4-1 libdbus-1-3 libapparmor1
)
for p in "${PKGS[@]}"; do apt-get download "$p" >/dev/null 2>&1 || true; done
for d in *.deb; do dpkg -x "$d" . 2>/dev/null || true; done
echo "✔ 依赖就位：$DIR"
echo "  export LD_LIBRARY_PATH=$DIR/usr/lib/x86_64-linux-gnu:$DIR/lib/x86_64-linux-gnu"
