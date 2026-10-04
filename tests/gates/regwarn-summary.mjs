#!/usr/bin/env node
/* 注册面**汇总**门（`sgstory#295` 乙 —— 12 处散装「重复注册」warn ⇒ 加载期汇总一条）
 *
 * ## 本条要判的三件事（读数取自**真 bundle**，✗ 源码字面）
 *   ① 全装（两套规则包）bundle ⇒ `console.warn` 里**恰一条**「共 N 处 id 冲突」的汇总行，
 *      且该行**具名**（含类名与 id，如 `道具「bandage」`）＋ 含**计数**；
 *   ② **同源**：`RPG.regWarn.条数()` 与汇总行里的 N **相等**（✗ 两处各算一份）；
 *   ③ ★**能力门**：引擎的 `build.py` 若已含 `packs` 口（`#295` 甲 ⇒ `collect_js_files(hosts, packs)`）
 *      ⇒ 再建一份**单包** bundle，断「**零** id 冲突行」（单包故事本不该撞那条）；若还没有该口
 *      ⇒ **明确印「待判」**（✗ 不算绿 —— 甲合入后本臂自动生效）。
 *
 * ## 口径
 *   · 读数＝**探针子进程**捕获的 `console.warn`（`tests/gates/_regwarn-probe.mjs`：与 `tests/unit/headless.mjs`
 *     同一套装载底座）。⚠ 无关的 warn 存在（如「保留槽判定…」）⇒ 本门只数**汇总行**（正则），
 *     ✗ 不断「warn 恰一条」（那是别面的事）。
 *   · 每次构建都会重写 `tests/unit/dist/*` ⇒ **收尾重建缺省**（✗ 留一份单包 bundle 给后面的单测步）。
 *
 * 用法：node tests/gates/regwarn-summary.mjs [--verbose] [--selftest]
 * 退出码：0＝绿；1＝有红；2＝装置错（探针跑不起来／bundle 加载失败 ⇒ 证不出 ≠ 绿）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BUILD = path.join(ROOT, 'build.py');
const PROBE = path.join(ROOT, 'tests', 'gates', '_regwarn-probe.mjs');
const 汇总行 = /\[RPG\] 本次共 (\d+) 处 id 冲突/;
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
const 详 = process.argv.includes('--verbose');

const 建模 = () => {
	const r = spawnSync('python3', [BUILD], { encoding: 'utf8' });
	return r.status === 0 ? null : `python3 build.py rc=${r.status}：${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 300);
};
const 探针 = () => {
	const r = spawnSync(process.execPath, [PROBE], { encoding: 'utf8' });
	if (r.status !== 0) return { 错: `探针 rc=${r.status}：${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 300) };
	try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { 错: `探针输出读不出 JSON：${e.message}` }; }
};

function main() {
	if (!fs.existsSync(BUILD) || !fs.existsSync(PROBE)) { console.error('✗ 装置错：缺 build.py 或探针 ⇒ **证不出**'); process.exit(2); }
	const 红 = [];
	const ok = (条, 名, 细 = '') => { if (!条) 红.push(`${名}${细 ? ` —— ${细}` : ''}`); if (详) console.log(`  ${条 ? '✓' : '✗'} ${名}${细 ? ` —— ${细}` : ''}`); };

	/* ① 全装 bundle ⇒ 恰一条汇总行，且具名 ＋ 计数 */
	const 建 = 建模();
	if (建) { console.error(`✗ 装置错：缺省构建失败 ⇒ **证不出**\n${建}`); process.exit(2); }
	const A = 探针();
	if (A.错) { console.error(`✗ 装置错：${A.错}`); process.exit(2); }
	/* ★**冲突家族**整行数（聚合形 ＋ 散装形都算）—— 只数聚合形会**漏掉散装**（本席首版即此病：
	 *   自检刀 R1 把一处改回散装，而「聚合行恰一条」照样成立 ⇒ **门不红** ⇒ 那条断言形同装饰）。 */
	const 家族 = A.warns.filter((w) => /重复注册|处 id 冲突/.test(w));
	ok(家族.length === 1, '① 全装 bundle ⇒ 冲突类 warn **恰一行**', `实得 ${家族.length} 行（散装 ⇒ 红；零行 ⇒ 静默 ⇒ 也红）`);
	const 行 = A.warns.filter((w) => 汇总行.test(w));
	ok(行.length === 1, '① 其中**聚合行**恰一条', `实得 ${行.length} 条`);
	const m = 行[0]?.match(汇总行);
	const N = m ? Number(m[1]) : null;
	if (行.length === 1) {
		ok(/道具「bandage」/.test(行[0]), '① 汇总行**具名**（类名 ＋ id）', 行[0].slice(0, 60));
		ok(/·\s*角色「/.test(行[0]), '① 汇总行含多类（角色一类也在）', '');
		ok(N >= 8, '① 计数是**真读数**（≥8 处）', `N=${N}`);
		ok(A.条数 === N, '② 同源：`条数()` 与汇总行里的 N 相等', `条数=${A.条数}／N=${N}`);
	}

	/* ③ 能力门：引擎有 packs 口 ⇒ 单包 bundle 须**零** id 冲突行 */
	const 源码 = fs.readFileSync(BUILD, 'utf8');
	const 有包口 = /def collect_js_files\(hosts=None, packs=None\)/.test(源码);
	if (!有包口) {
		console.log('  · ③ **待判**：引擎 build.py 还没有 `packs` 口（`#295` 甲 ⇒ `sgstory/sgstory#2000`）'
			+ ' ⇒ 单包臂此刻**证不出**（✗ 不算绿）—— 甲合入后本臂自动生效');
	} else {
		const r = spawnSync('python3', ['-c',
			`import sys; sys.path.insert(0, ${JSON.stringify(ROOT)}); import build; build.build_unit_bundle(None, False, ['dnd3'])`,
		], { encoding: 'utf8' });
		ok(r.status === 0, '③ 单包 bundle 建得起来', `rc=${r.status}｜${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 200));
		if (r.status === 0) {
			const B = 探针();
			if (B.错) { 红.push(`③ 单包探针跑不起来：${B.错}`); }
			else {
				const 行2 = B.warns.filter((w) => 汇总行.test(w));
				ok(行2.length === 0, '③ 单包 bundle ⇒ **零** id 冲突行（单包故事不该撞那条）', `实得 ${行2.length} 条`);
				ok(B.条数 === 0, '③ 单包 bundle ⇒ 收集器条数为 0', `实得 ${B.条数}`);
			}
		}
	}

	/* 收尾：重建缺省（✗ 把单包 bundle 留给后面的单测步） */
	const 收 = 建模();
	ok(收 === null, '★收尾重建缺省应成功', 收 ?? '');

	if (红.length) { console.log('✗ 门红：'); 红.forEach((x) => console.log(`  · ${x}`)); process.exit(1); }
	console.log(`✓ 门绿（全装 ⇒ 汇总恰一条且具名同源${有包口 ? '；单包 ⇒ 零冲突' : '；③ 待判（引擎未含 packs 口）'}）`);
}

/* ── 自检刀（仅当直接运行）：改被测物 ⇒ 本门须红；按字节复原 ＋ md5 自证 ────────────── */
if (isMain && process.argv.includes('--selftest')) {
	const { execFileSync } = await import('node:child_process');
	const 靶 = [
		/* ⚠ 刀靶要选**在全装 bundle 里真会触发**的那一处：本席首版选「效果」，而两包的效果 id **不冲突**
		 *   ⇒ 改回散装也**没有**那一行 ⇒ 门照旧绿 ⇒ 看起来像「门没牙」（实为刀靶无效）。⇒ 改选**道具**（`bandage` 真冲突）。 */
		['R1 拆汇总（散装：道具那处改回直接 console.warn）', path.join(ROOT, 'src', 'core', '10-item.js'),
			[["RPG.regWarn.报('道具', `${id}`, `${RPG.items.get(id).name} 被覆盖`)",
				"console.warn(`[RPG] 道具 id「${id}」重复注册：${RPG.items.get(id).name} 被覆盖。`)"]]],
		['R2 静默（汇总不印）', path.join(ROOT, 'src', 'core', '08-regwarn.js'),
			[["if (印 && 单.length && !已印) {", "if (false) {   // ★刀：汇总不印"]]],
	];
	let n = 0, 总 = 靶.length;
	console.log('=== 注册面汇总门 · 自检刀 ===');
	for (const [名, 文件, 补丁] of 靶) {
		const 备份 = fs.readFileSync(文件);
		const md5前 = execFileSync('md5sum', [文件], { encoding: 'utf8' }).split(' ')[0];
		let 文 = 备份.toString('utf8');
		let 命中锚 = true;
		for (const [a, b] of 补丁) { if (!文.includes(a)) { 命中锚 = false; } 文 = 文.replace(a, b); }
		if (!命中锚) { console.log(`  ✗ ${名}：找不到待改的锚`); fs.writeFileSync(文件, 备份); continue; }
		fs.writeFileSync(文件, 文.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
		const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
		const 命中 = r.status === 1;
		console.log(`  ${命中 ? '✓' : '✗'} 真刀 ${名} ⇒ rc=${r.status}（期望 1）`);
		if (命中) n++;
		fs.writeFileSync(文件, 备份);
		const md5后 = execFileSync('md5sum', [文件], { encoding: 'utf8' }).split(' ')[0];
		if (md5前 !== md5后) console.log(`  ✗ ${名}：复原 ✗ 逐字节同（${md5前} ⇒ ${md5后}）`);
	}
	建模();      // 复原后重烘
	console.log(n === 总 ? `  ✓ ${n}/${总} 刀全部如期` : `  ✗ ${n}/${总} 刀如期`);
	process.exit(n === 总 ? 0 : 1);
}

if (isMain && !process.argv.includes('--selftest')) main();
