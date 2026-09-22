#!/usr/bin/env node
// `#1166` (1)：**安全清残留**（`npm run clean:net`）—— **白名单式** ✗ 不做"自动发现" ✗
//
// 为什么要它（今日两笔事故的直接产物 ✓）：
//   · 我为了"清 ignored 残留"跑了一条**算出来的清单**管道（`git status --ignored | grep | awk | xargs rm -f` ✗）
//     ⇒ 误删了**已跟踪源件** `scripts/test-plan.mjs` ✗（build 立刻 `ERR_MODULE_NOT_FOUND`）
//   · 教训：**永不从"算出来的清单"批量 rm** ✗ ⇒ 清理必须是**手维护白名单 ＋ 双重核对**
//
// **契约（协调席 2026-09-22 确认 ✓）**：
//   预检的"脏"＝**跟踪面**不净 ✗ —— **未跟踪件（`??`）既不删、也不挡执行** ✓
//   理由：保护面只该是"**会丢跟踪改动**"那一面 ✗；未跟踪件本命令**本来就不碰** ✓
//   ⇒ 需要清的未跟踪/生成物一律**走白名单**（显式 ✓ 手维护 ✓）；不在此列的未跟踪件留在原地 ✓
//
// 三条护栏：
//   ① **预检**：工作树有**未提交的跟踪改动** ⇒ **拒绝执行**并提示 ✗（不静默 ✗）
//   ② **白名单**：只删下列**逐项列出**的已知生成物 ✓（增删走评审 ✓ 不在代码里"发现" ✗）
//   ③ **事后核**：删除后 `git status` 里**跟踪件零删除** ✗（否则立刻大声报 ✗）
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** **手维护白名单**（已知生成物 ✓ 逐项列出 ✗ 不自动发现）。 */
export const WHITELIST = [
	'build',                                  // 探针/报告产物（gitignored ✓）
	'dist',                                   // 构建产物（gitignored ✓）
	'stories/face-fixture/15-tables.twee',    // 由 data/tables.json 生成 ✓
	'stories/face-fixture/16-notes-ch1.twee',
	'stories/face-fixture/17-rules.twee',
	'stories/minimal-demo/15-tables.twee',
	'stories/night-ferry/15-tables.twee',
	'stories/night-ferry/17-rules.twee',
];

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** **纯函数**：给定 `git status --porcelain` 输出 ⇒ 是否有未提交的**跟踪**改动（`??` 未跟踪不算 ✓）。 */
export const hasTrackedDirt = (porcelain) => String(porcelain).split('\n')
	.map((l) => l.trimEnd()).filter(Boolean)
	.some((l) => !l.startsWith('??') && !l.startsWith('!!'));   // `??` 未跟踪 / `!!` 已忽略 ⇒ 都不算脏 ✓

/** **纯函数**：从 `git status --porcelain` 里挑出"被删除的跟踪件"（事后核用 ✓）。 */
export const trackedDeletions = (porcelain) => String(porcelain).split('\n')
	.filter((l) => /^(?:D |.D|AD)/.test(l)).map((l) => l.slice(3).trim()).filter(Boolean);

if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (label, ok) => { console.log(`      ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
	t('干净 ⇒ 无跟踪脏 (hasTrackedDirt="")', hasTrackedDirt('') === false);
	t('只有未跟踪 ⇒ 不算脏 (?? ✓ 契约：未跟踪既不删也不挡 ✗)', hasTrackedDirt('?? tmp/x\n!! build/') === false);
	t('契约：白名单外的未跟踪件不挡执行 (?? scripts/x.mjs ✓)', hasTrackedDirt('?? scripts/clean-net.mjs') === false);
	t('有跟踪改动 ⇒ 算脏 (M ✓)', hasTrackedDirt(' M scripts/test-plan.mjs') === true);
	t('事后核抓删除 (D ✓)', trackedDeletions('D  scripts/test-plan.mjs\n?? x').length === 1);
	t('事后核不误抓修改 (M ✓)', trackedDeletions(' M a.mjs').length === 0);
	console.log(bad ? `✗ clean:net 自证未过 ${bad} 项` : '✔ clean:net 自证通过（脏判定／事后核 两纯函数 ✓）');
	process.exit(bad ? 1 : 0);
}

const porcelain = git(['status', '--porcelain']);
if (hasTrackedDirt(porcelain)) {
	console.error('✗ clean:net 拒绝执行：工作树有**未提交的跟踪改动** ✗');
	for (const l of porcelain.split('\n').filter((x) => x && !x.startsWith('??'))) console.error(`    ${l}`);
	console.error('  ⇒ 先提交或 stash（本命令**只删已知生成物**，但拒绝在脏树上动手 ✓ 不静默 ✗）');
	process.exit(1);
}

const before = git(['status', '--porcelain']).split('\n').filter(Boolean).length;
console.log(`clean:net 白名单（${WHITELIST.length} 项 ✓ 手维护 ✗ 不自动发现）：`);
let removed = 0;
for (const p of WHITELIST) {
	const abs = join(ROOT, p);
	if (!existsSync(abs)) { console.log(`  · ${p} —— 不在 ✓ 跳过`); continue; }
	console.log(`  · ${p} —— **删除**（${statSync(abs).isDirectory() ? '目录' : '文件'} ✓）`);
	rmSync(abs, { recursive: true, force: true });
	removed++;
}
const after = git(['status', '--porcelain']);
const dels = trackedDeletions(after);
if (dels.length) {
	console.error(`\n✗ clean:net 事后核失败：**有跟踪件被删** ✗\n    ${dels.join('\n    ')}`);
	process.exit(1);
}
console.log(`✔ clean:net 完成：白名单命中 ${removed} 项 ✓ ｜ 事后核：**跟踪件零删除** ✗（status 行 ${before} ⇒ ${after.split('\n').filter(Boolean).length}）`);
