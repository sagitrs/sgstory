# 内容面见证（P4 验收要件 (1) ✓ 票 `#991`）

**轨迹** ✓：`gates/witness-trace.json`（**冻存** ✓ —— 逐步 `{passage, digest, choiceKey}` ＋ `ending` ✓）
**怎么产出的** ✓：`node test/walker.mjs --witness --story=night-ferry --min-events=6 --scan=8`
**怎么复跑／核验** ✓（**同一步、同一份文件** ✗ —— 这是 `--verify` 件的口径 ✓）：
```
node test/walker.mjs --verify=stories/night-ferry/gates/witness-trace.json --story=night-ferry
```
**本条轨迹的读数** ✓：`seed=1` · **6 步（事件 6）** · `ending=「结局 沉船」` · `label 兜底 0 处` ✓（⇒ 全程**按 `data-choice`/目标段名**可复跑 ✓）。
⚠️ 口径（`--verify` 件头 ✓）：它只保证"**我读到的这一份**"能逐步复跑 ✓ —— 不保证该文件没被别的任务改写 ✓；因此**核验与冻存必须在同一步、同一份文件上完成** ✓。
