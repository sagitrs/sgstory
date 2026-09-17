// `#794`：**import 副作用**判据 —— 「任何 `editor/**` 模块被 import ⇒ rc=0 且 0 字节输出」。
//
// 为什么需要它（实测的后果，不是洁癖）✗：`editor/**` 的模块里，工具脚本**同时是库**（`equiv` 被 `extract-story` 导入 ✓、
// `k4` 被未来的 `commands.mjs` 导入 ✓）⇒ 若某个模块在 **import 期**就执行 CLI（打印用法 / 跑门 / `process.exit`），
// 则**导入方会被劫持** ✗ ⇒ 具体后果：一旦 `commands.mjs` 复用 `k4`／`lint-story` 的命令体，
// **每次 `cli.mjs build` 都会跑一遍 K4 门** ✗，而 `lint-story` 那条会**直接把 CLI 杀掉**（`process.exit(2)` ✓）。
// ⇒ 补法就是那两处 `isMain` 守卫 ✓（已落 ✓）—— 本测例把"守卫**在不在**"变成**一行可跑的判据** ✓。
//
// 口径（与复核席那套**逐字相同** ✓，便于两边读数对照）：
//   `node --input-type=module -e "await import('<abs>')"`
//   rc≠0 ⇒ EXIT ✗；rc=0 且有输出 ⇒ SIDE-EFFECT ✗；否则 OK ✓。
// 反过来，它**不是**安全沙箱的判据 ✓（那是 `lib/host/sandbox.mjs` 顶注的威胁模型的事 ✓）。
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 递归列出 `editor/**` 的 `.mjs`（**含** `lib/{core,host}/**` ✓ —— 它们也在"库"的位置上 ✓）。 */
export const editorModules = (dir = join(ROOT, 'editor')) => {
	const out = [];
	for (const name of readdirSync(dir).sort()) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...editorModules(p));
		else if (name.endsWith('.mjs')) out.push(p);
	}
	return out;
};

/** 在子进程里 import 一次，返回 `{ rc, out, err }` ✓（用子进程是因为"劫持"的表现就是**杀进程** ✓，同进程里量不到 ✓）。 */
/** 哨兵：探针 import 完**之后**打印它 ✓ ⇒ 它出现 = "import 真跑完了" ✓（`exit(0)` 会让它消失 ✓）。 */
const MARK = '__IMPORT_DONE__';

export const importOnce = (abs) => {
	try {
		const out = execFileSync('node', ['--input-type=module', '-e', `await import(${JSON.stringify(abs)}); console.log(${JSON.stringify(MARK)});`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		return { rc: 0, out, err: '' };
	} catch (e) {
		return { rc: e.status ?? 'null', out: String(e.stdout ?? ''), err: String(e.stderr ?? '') };
	}
};

const bad = [];
for (const abs of editorModules()) {
	const { rc, out, err } = importOnce(abs);
	const rel = relative(ROOT, abs);
	// ⚠️ **必须用哨兵形，不能只看 rc=0 ＋ 0 字节** ✗ —— 实测：把 `process.exit(0)` 插进模块顶部时，
	//    导入方的读数同样是 **rc=0 · 0 字节** ✓ ⇒ 与"干净 import"**无法区分** ✗（我第一版就这样漏过它 ✓）。
	//    ⇒ 判据改成："import **跑完**了，且**只**留下哨兵" ✓（`exit(0)` ⇒ 哨兵缺失 ⇒ 必红 ✓）。
	if (rc !== 0) bad.push(`${rel}：**EXIT** ✗（rc=${rc}${err ? ` · stderr ${err.length}B` : ''}）⇒ import 期退出会杀掉导入方`);
	else if (out !== `${MARK}\n` || err.length) bad.push(`${rel}：**SIDE-EFFECT / 未跑完** ✗（stdout ${JSON.stringify(out.slice(0, 60))} · stderr ${err.length}B）⇒ 期望恰好是哨兵 "${MARK}" ✓`);
}

if (bad.length) {
	console.error(`✗ import 副作用门：${bad.length} 个模块不合格（判据：import ⇒ rc=0 且 0 字节输出）`);
	for (const b of bad) console.error(`  ✗ ${b}`);
	console.error('  ⇒ 补法：加 `isMain` 守卫（`const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];`');
	console.error('     放在 **imports 之后、逻辑之前** ✓ —— 放后面会 TDZ ✗）；主跑与 `--selftest` 两条分支都要守 ✓。');
	process.exit(1);
}
console.log(`✔ import 副作用门通过（${editorModules().length} 个模块：import ⇒ 跑完且只留哨兵 ${MARK}）`);
