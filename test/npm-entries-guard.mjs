// `#1200`：npm 入口差集护栏的判据件（护栏本体在 `scripts/check-npm-entries.mjs`）。
//
// 分层：护栏是**命令**（给人跑、也给链跑），判据在**测试面**（台账按 `test/**` 收行，探针也按这里的 id 找行）。
// 本件做三件事：
// ① 跑护栏本体：真仓上必须 rc=0（引用无缺口）；
// ② 端到端验它**真能红**：往扫描面内的件里插一行假引用，护栏必须 rc=1 并点名（这是探针要咬的那一格）；
// ③ 接线：`package.json` 里有 `check:npm-entries`，且测试计划里有本段。
//
// 为什么不在护栏里直接判"能红"：护栏面向的是日常使用（绿就是绿），"能红"是**判据面**的事。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { entryProblems, EXEMPT } from '../scripts/check-npm-entries.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};
const runGuard = () => {
	try {
		const out = execFileSync('node', ['scripts/check-npm-entries.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		return { rc: 0, out };
	} catch (e) {
		return { rc: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
};

// ① 真仓：无缺口
const clean = runGuard();
ok('① 真仓跑护栏 rc=0', clean.rc === 0, clean.out.slice(0, 160));
ok('① 报文明说差集为空', /npm 入口差集为空/.test(clean.out));

// ② 端到端能红（探针要咬的那一格）：插一行假引用 -> 必须点名，再还原
const TARGET = 'docs/dev-conventions.md';
const bak = readFileSync(join(ROOT, TARGET), 'utf8');
let red = { rc: 0, out: '' };
try {
	writeFileSync(join(ROOT, TARGET), `${bak}\n\n跑 ${'`'}npm run probe-entry-missing${'`'} 即可。\n`);
	red = runGuard();
} finally {
	writeFileSync(join(ROOT, TARGET), bak);   // 还原用内存里的原文（不依赖 git）
}
ok('② 插入假引用后护栏 rc=1', red.rc === 1, `rc=${red.rc}`);
ok('② 报文点名了那个假引用', /probe-entry-missing/.test(red.out));
ok('② 报文带现场（文件:行）', new RegExp(`${TARGET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+`).test(red.out));
const after = runGuard();
ok('② 还原后护栏回到 rc=0（不留污染）', after.rc === 0, after.out.slice(0, 120));

// ③ 接线：npm 入口与测试计划
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
ok('③ package.json 有 check:npm-entries', typeof pkg.scripts?.['check:npm-entries'] === 'string');
const plan = readFileSync(join(ROOT, 'scripts/test-plan.mjs'), 'utf8');
ok('③ 测试计划里有本段', plan.includes('test/npm-entries-guard.mjs'));

// ④ 纯判据的两面（正例与反例；反例缺了这格，"能红"就只是话）
ok('④ 纯判据·正例：引用存在即无问题', entryProblems({ sources: [{ file: 'x.md', text: '`npm run build`' }], scripts: new Set(['build']) }).missing.length === 0);
ok('④ 纯判据·反例：引用不存在即报', entryProblems({ sources: [{ file: 'x.md', text: '`npm run nope-zz`' }], scripts: new Set() }).missing.length === 1);
ok('④ 豁免有名有目（每条都有理由）', Object.values(EXEMPT).every((v) => typeof v === 'string' && v.length > 10));

console.log(bad === 0 ? '\n✔ npm 入口护栏判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
