// 仓根形态守卫（`#1008` 第二半）：**仓根顶层条目**必须与白名单一一对上。
//
// 为什么需要它：误提交的临时件不是"内容错了"，而是**结构错了** —— 它不在任何故事清单、
// 也不在 `src/**`，于是现有那批守卫（`module-order.mjs` 的 `unclaimed-file` 只管**源文件**、
// `build.mjs` 的 `[unclaimed-file]` 只盯 `*.twee`）**都拦不住它**。
// 实测两例：#874 的 `home/sagitrs/tmp/sgstory-absout-N2eeOQ/index.html`（−9292 行才清掉）、
// 本片删掉的 `tmp/mf3.json`（无人引用、86KB、内容是已删故事的表 dump）。
//
// 判据形状（**能假**）：把**实际**的顶层条目集合与**声明**的集合对表 ——
//   ① 实际有、声明没有 ⇒ `unclaimed-top-level`（**新顶层目录**走的就是这一支）；
//   ② 声明有、实际没有 ⇒ `missing-top-level`（删了东西没改声明，同族反向）。
// 自证里两支都有正反例；探针（`scripts/probes.mjs`）打在第 ① 支上，且刀**不碰测试件**。
//
// ⚠️ **边界**：只判**已入库**（`git ls-files`）的条目 —— 未入库的 `node_modules/`、`build/`、
//   `dist/`、本地草稿一律不看（否则本机每次跑都假红）。因此"未提交的临时目录"不在本门射程内；
//   要守住那一面得靠 `.gitignore` 与提交时的自觉，本门只保证"**已经进去了的**能被点名"。
//   ⚠️ 另一条边界：本门要 git 元数据，**且它只问“脚本所在的那个仓根”** —— `ROOT` 取自本文件位置
//   （`import.meta.url`）而不是调用方的 cwd ✓。⇒ 那句边界话应读作“**仓根处** git 不可用 ⇒ 红”，
//   **不是**“调用方 cwd 不是 git 仓”。实测：在 `/tmp/.../nogit`（非 git 仓）里调用它 ⇒ 仍然 rc=0
//   报那 17 条 ✓（它查的是本仓，不是你的 cwd）。取不到时 **红并说明**，不做静默跳过 ✗
//   （静默跳过＝假绿，本仓踩过这一族）。

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const ALLOW_FILE = join(ROOT, 'scripts/repo-shape.json');

/** 白名单（数据；每条带理由 —— 理由与名单同处一文件，避免"名单在、理由散"） */
export const readAllow = (file = ALLOW_FILE) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * 仓根**已入库**的顶层条目。
 * 为什么用 `git ls-files` 而不是 `readdirSync(ROOT)`：后者会把本机的 `node_modules/`、
 * `build/`、`dist/` 一并算进来 ⇒ 每次跑都红（假红）；前者只看"仓库里到底有什么"。
 */
export const trackedTopLevel = ({ cwd = ROOT } = {}) => {
	const out = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
	return [...new Set(out.split('\0').filter(Boolean).map((p) => p.split('/')[0]))].sort();
};

/**
 * 对表。**纯函数**（自证与探针都在它上面下刀）。
 * @param {{entries: string[], allow: {name: string, why?: string}[]}} args
 */
export const topLevelProblems = ({ entries, allow }) => {
	const declared = new Map(allow.map((e) => [e.name, e.why ?? '']));
	const seen = new Set(entries);
	const out = [];
	for (const e of entries) {
		if (!declared.has(e)) {
			out.push({
				code: 'unclaimed-top-level',
				msg: `仓根出现未登记的顶层条目 \`${e}\` —— 要保留就写进 scripts/repo-shape.json 的 allow（并写明理由）＋复核；是误提交的临时件就删掉（#1008 的来历就是这一类）`,
			});
		}
	}
	for (const [name, why] of declared) {
		if (!seen.has(name)) {
			out.push({
				code: 'missing-top-level',
				msg: `scripts/repo-shape.json 登记了 \`${name}\`，但仓根没有它 —— 删除时漏改声明（该条理由：${why}）`,
			});
		}
	}
	return out;
};
