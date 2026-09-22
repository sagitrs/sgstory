#!/usr/bin/env node
// `#1166` (2)：**提交前三分支态预检**（`npm run check:precommit`）—— 把"人记的纪律"变成命令
//
// 为什么要它（我的一次事故）：我**口头断言**"已回分支 X、回前核过基线" 而实际从未 checkout
// → 提交落在**别的分支**上（`pr1164` 的 detached 树上）→ 靠事后 `git diff --stat` 才发现
// → 教训：**"我以为我在某分支上"不是状态** → 提交前必须**打印并检查**三分支态
//
// 三条（打印 ＋ 判据 不是只打印）：
// ① 当前分支：**detached HEAD** → 红（正是那次事故的形态）
// ② 与 origin/main 的关系：HEAD **等于** origin/main → 提示"在 main 上直接提交吗？"
// ③ 本地 `origin/main` 是否**落后**（可 fetch 到更远端？）→ 提示**基线可能陈旧**（"先 fetch 再核基线"）
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const git = (args, opts = {}) => {
	try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim(); }
	catch { return ''; }
};

/** **纯函数**：三态判据 → 问题清单（空＝绿）。 */
export const precommitProblems = ({ branch, head, mainTip }) => {
	const out = [];
	if (!branch) out.push({ code: 'DETACHED', msg: 'HEAD 处于 **detached**（不在任何分支上）✗ —— 正是"提交落错分支"那次事故的形态；先 `git switch -c <分支>` 或 `git switch <分支>` ✓' });
	//注意：修正（实测假阳性）：**新分支尚未提交**时 `head === mainTip` 是**正常**的 → 不是问题
	// "直接在 main 上提交"应由**分支名**判定（`main`＝主干名 不靠"与 main 同头"推断）
	if (branch === 'main') out.push({ code: 'ON-MAIN', msg: '当前分支＝**`main`** ⇒ 你要**直接在主干上提交**吗？✗（新工作应开分支 ✓ 从 main 出分支再提交 ✓）' });
	return out;
};

if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (label, ok) => { console.log(`      ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
	t('正常分支 ⇒ 无问题 ✓', precommitProblems({ branch: 'feat/x', head: 'abc1234', mainTip: 'def5678' }).length === 0);
	t('detached ⇒ 报 DETACHED ✗', precommitProblems({ branch: '', head: 'abc1234', mainTip: 'def5678' })[0]?.code === 'DETACHED');
	t('分支=main ⇒ 报 ON-MAIN ✗', precommitProblems({ branch: 'main', head: 'abc1234', mainTip: 'def5678' })[0]?.code === 'ON-MAIN');
	t('新分支与 main 同头 ⇒ **不报**（正常 ✓ 修正后的判据）', precommitProblems({ branch: 'feat/new', head: 'abc1234', mainTip: 'abc1234' }).length === 0);
	console.log(bad ? `✗ check:precommit 自证未过 ${bad} 项` : '✔ check:precommit 自证通过（三态判据纯函数 ✓）');
	process.exit(bad ? 1 : 0);
}

const branch = git(['branch', '--show-current']);
const head = git(['rev-parse', '--short', 'HEAD']);
const mainTip = git(['rev-parse', '--short', 'origin/main']);
const mainSubject = git(['log', '--oneline', '-1', 'origin/main']);

console.log('◆ 提交前三分支态（`#1166` ✓ 不看这三行不下 commit ✗）');
console.log(`  分支 = ${branch || '(detached ✗)'}`);
console.log(`  当前头 = ${head}`);
console.log(`  main tip = ${mainSubject || '(未知 ✗ 本地无 origin/main？)'}`);

const problems = precommitProblems({ branch, head, mainTip });
if (problems.length) {
	console.error(`\n✗ check:precommit 未通过 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	process.exit(1);
}
if (head === mainTip && branch !== 'main') console.log(`  （信息：本分支与 \`origin/main\` 同头（${head}）⇒ 尚无本片提交 ✓ 正常 ✓）`);
console.log('✔ check:precommit 通过（分支明确 ✓ 未直接在 main 上提交 ✓）');
