// 仓根形态门（`#1008` 第二半）：仓根顶层条目 == `scripts/repo-shape.json` 的白名单。
//
// 背景（为什么会有这门）：`#874` 那次把绝对路径的产物顺手带进了提交
//（`home/sagitrs/tmp/sgstory-absout-N2eeOQ/index.html`，PR `#1009` 才清掉，−9292 行）；
// 本片又发现同族第二例 `tmp/mf3.json`（无人引用、86KB、内容是已删故事 1 的表 dump）。
// 两次都不是"内容错"，是**结构错** —— 而现有的 `unclaimed-file`（只管源文件）拦不住顶层目录。
//
// 三条断言：
// ① 实际（`git ls-files` 的顶层）⊆ 声明（白名单）→ 否则点名未登记的那一条；
// ② 声明 ⊆ 实际 → 否则点名"声明了却没有"的那一条（删东西漏改声明，同族反向）；
// ③ 取不到 git 元数据 → **红并说明**（不做静默跳过 —— 静默跳过＝假绿）。
//注意：措辞要点：本门问的是“**脚本所在的那个仓根**”的 git 可用性（`ROOT` 取自本文件位置），
// **不是**“调用方 cwd 是否 git 仓”—— 在别处（非 git 仓）调用它，它仍然查本仓（实测 rc=0）。
//
// 边界：只判**已入库**条目；本机的 `node_modules/`、`build/`、`dist/`、草稿目录一律不看。
//
// 自证：`node test/repo-shape.mjs --selftest`
// 复跑：`node test/repo-shape.mjs`

import { readAllow, trackedTopLevel, topLevelProblems, ALLOW_FILE } from '../scripts/repo-shape.mjs';

let failures = 0;
let bad = 0;   // 自证计数器
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++; };
const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };

if (process.argv.includes('--selftest')) {
	const allow = [
		{ name: 'docs', why: '文档' },
		{ name: 'src', why: '引擎件' },
		{ name: 'package.json', why: '清单' },
	];

	// ① 合规：实际 ⊂ 声明（文件与目录混在一起也要对）→ 一条都不许报
	{
		const p = topLevelProblems({ entries: ['docs', 'src', 'package.json'], allow });
		t('① 合规集合 ⇒ 0 问题', p.length === 0);
	}

	// ① 反例：出现未登记的顶层目录（**这一支就是"新顶层目录"那一支**）
	{
		const p = topLevelProblems({ entries: ['docs', 'src', 'package.json', 'home'], allow });
		t('① 反例：多出一个未登记顶层目录 ⇒ 报 1 条且**点名** `home`', p.length === 1 && p[0].code === 'unclaimed-top-level' && p[0].msg.includes('home'));
	}

	// ① 反例：未登记的顶层**文件**同样要抓（临时的 dump 常常是文件）
	{
		const p = topLevelProblems({ entries: ['docs', 'src', 'package.json', 'mf3.json'], allow });
		t('① 反例：未登记顶层**文件** ⇒ 报 1 条且点名', p.length === 1 && p[0].msg.includes('mf3.json'));
	}

	// ② 反例：声明了却没有（删东西漏改声明）
	{
		const p = topLevelProblems({ entries: ['src', 'package.json'], allow });
		t('② 反例：声明有、实际没有 ⇒ 报 1 条且点名 `docs`', p.length === 1 && p[0].code === 'missing-top-level' && p[0].msg.includes('docs'));
	}

	// ② 边界：白名单为空 → 有几个实际条目就报几条（不许"空名单被当合规"）
	{
		const p = topLevelProblems({ entries: ['docs', 'src'], allow: [] });
		t('② 边界：空白名单 ⇒ 逐条报（不许把"空"当合规）', p.length === 2);
	}

	// ③ 两半同时命中：未登记 ＋ 声明缺失，各报各的（不许互相掩盖）
	{
		const p = topLevelProblems({ entries: ['src', 'package.json', 'stray'], allow });
		const codes = p.map((x) => x.code).sort();
		t('③ 两半同时命中 ⇒ 两条都在（`docs` 缺 ＋ `stray` 未登记）', p.length === 2 && codes.join(',') === 'missing-top-level,unclaimed-top-level');
	}

	// ④ 真实白名单本身要能被读出来（文件在、形状对）——否则本门自己会静默失效
	{
		const a = readAllow();
		t('④ 白名单可读且形状正确（`allow[]` 非空、每条有 name）', Array.isArray(a.allow) && a.allow.length > 0 && a.allow.every((e) => typeof e.name === 'string' && e.name));
	}

	console.log(bad === 0 ? '\n✔ 自证通过（仓根形态门 ① ⊂ ② ⊃ ③ 两支 ＋ 边界）' : `\n✗ 自证失败 ${bad} 例`);
	process.exit(bad === 0 ? 0 : 1);
}

// ── 默认：对真实仓根判一次 ──────────────────────────────────────────────
let entries;
try {
	entries = trackedTopLevel();
} catch (e) {
	console.error('✗ 取不到 git 元数据（`git ls-files` 失败）—— 本门要求在工作树里跑；不做静默跳过 ✗');
	console.error(`    ${e.message}`);
	process.exit(1);
}
const { allow } = readAllow();
const problems = topLevelProblems({ entries, allow });

if (problems.length) {
	console.error(`✗ 仓根形态未通过 ${problems.length} 项（白名单：${ALLOW_FILE}）：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	console.error('  复跑：node test/repo-shape.mjs');
	process.exit(1);
}
console.log(`✔ 仓根形态：${entries.length} 个顶层条目与白名单一一对上（${entries.join('、')}）`);
console.log(`  白名单：scripts/repo-shape.json（${allow.length} 条，每条带理由）｜ 只判已入库条目`);
