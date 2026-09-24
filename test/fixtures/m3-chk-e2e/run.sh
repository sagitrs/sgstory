#!/usr/bin/env bash
# `m3-chk-e2e` 的**一条命令**跑法：清三层 ⇒ build ⇒ 跑用例。
#
# 为什么要有它：这个夹具的产物（`1[5678]-*.twee`／`00-meta.twee`／`dist/`）**被 .gitignore 忽略**
# ⇒ `git status` 看不出它们还在 ⇒ 若忘了清，build 会"按件在"**复用旧产物** ⇒ 你会在一棵
# "看起来干净"的树上读到旧故事的结论（**这两个引擎态下会得到同一个读数**，从而判不出修复）。
# 把"必须先清"从**记忆**变成**结构**，就是本脚本的全部意义。
#
# ★它清**三层**（少了任何一层都会读到旧东西）：
#   ① **引擎中间件** `<引擎工作树>/build/`（里面有 `game.twee`／`fontface.css`／`font-chars.txt`）
#      —— **改了 `src/**` 就必须清这一层**，否则写到故事里的是**旧引擎** ✗
#   ② 夹具里那个故事的**生成物** `stories/*/1[5678]-*.twee`／`00-meta.twee`（源＝`data/*.json`／`passages/*.md`）
#   ③ 夹具的**产物面** `dist/`
#
# 用法（在引擎仓任意位置都可）：
#   bash test/fixtures/m3-chk-e2e/run.sh
# 退出码＝用例执行器的退出码（修前应为红、修后应为绿；见 README「修前／修后读数」）。
set -euo pipefail

FIX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_ROOT="$(cd "$FIX_DIR/../../.." && pwd)"
cd "$ENGINE_ROOT"

echo "[1/3] 清三层（都被 .gitignore 忽略 ⇒ git status 看不见它们）"
echo "      ① 引擎中间件：$ENGINE_ROOT/build"
rm -rf "$ENGINE_ROOT/build"
echo "      ② 夹具的生成物：$FIX_DIR/stories/*/1[5678]-*.twee ／ 00-meta.twee"
rm -f "$FIX_DIR"/stories/*/1[5678]-*.twee "$FIX_DIR"/stories/*/00-meta.twee
echo "      ③ 夹具的产物面：$FIX_DIR/dist"
rm -rf "$FIX_DIR"/dist

echo "[2/3] build（SG_STORIES_DIR=$FIX_DIR/stories）"
SG_STORIES_DIR="$FIX_DIR/stories" node build.mjs | tail -2

echo "[3/3] 跑用例（--case=m3-chk-e2e）"
SG_STORIES_DIR="$FIX_DIR/stories" node scripts/case-run.mjs --cases="$FIX_DIR/cases" --case=m3-chk-e2e

echo
echo "提示：若你在**两个引擎态下拿到相同读数**，先别急着下结论 —— 先确认本次是经本脚本跑的"
echo "      （它每次都清）；判据：能假格的必要条件是「修复前红、修复后绿」。"
