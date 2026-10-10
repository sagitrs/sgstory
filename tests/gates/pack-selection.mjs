#!/usr/bin/env node
/* 规则包**选择**门（`sgstory#295` 甲 —— 故事清单 `packs` 口 ＋ `build.py` 按包过滤）
 *
 * ## 本条原有七件事及 CLI 隔离臂
 *   ① 无清单（或清单无 `packs` 键）⇒ **全装**：三个规则包标记（`src/dnd/{d20m,dnd3,dnd-5e}/`）齐 ＋ `src/core/` 仍在；
 *   ② 缺省 ≡ **显式全列**（`"packs": ["d20m","dnd3","dnd-5e"]`）⇒ 两产物**逐字节相同**
 *      （＝「新口引入 ✗ 改缺省行为」这条的**机械形**；与**旧脚本**的逐字节对照见引入该口的 PR 正文——旧脚本此时已不存在）；
 *   ③ `"packs": ["dnd3"]` ⇒ 产物含 `src/dnd/dnd3/` 标记、**不含** `src/dnd/dnd-5e/` 与 `src/dnd/d20m/`，且 `src/core/` 仍在；
 *   ④ 声明**未知**包 id ⇒ **构建期具名抛**（rc≠0，且报出该 id 与**可用**清单；✗ 静默回落全装）；
 *   ⑤ **与 `--host` 正交**：`"packs": ["dnd3"]` ＋ `--host headless` ⇒ 含 `src/host/headless/`、**不含** `src/host/sugarcube/`
 *      ⇒ 证明两个维度各管各的（✗ 互相当作对方的判据）；
 *   ⑥ 清单**坏**（非 JSON／`packs` 非空字符串数组）⇒ rc≠0 且具名（✗ 静默当「无声明」）。
 *   ⑦ 同一故事清单的可选 assets 口：运行 tests/build/story_assets_test.py 的正反臂。
 *      该臂使用临时故事并直接调用生产构建器，不写共享 build/dist；包含真 build_story 的注入与确定性核。
 *   ⑧ #2064 CLI 目录隔离：运行 tests/build/cli_source_isolation_test.py。
 *      两向分别具名：CLI/嵌套脚本排除、旧脚本/同名非CLI保留；含四宿主真产物字节对照与未知宿主拒绝。
 *      源码集合断言直接调用生产函数，不复写收集算法；产物断言读临时副本的 HTML/bundle/manifest。
 *      装置缺失/启动不了/超时返回2；selftest 的 R3 真刀验证本调用确实参与判决。
 *
 * ## 口径（★读数须注明，否则不可复核）
 *   · 读数是**产物文本**里的包**标记行**（`/* ===== src/dnd/<id>/… ===== *​/`，`build.py` 的 `js_parts_of` 写出）
 *     ⇒ 判的是「装没装」，✗ 复算 `build.py` 的收集逻辑（那是**第二份源**）。
 *   · 每个臂在**临时故事副本**上构建（`tests/e2e/old-house` 的拷贝 ＋ 按需写 `story.json`）⇒ **本仓故事与产物不动**。
 *   · ★收尾**必重建缺省**：本门会真调 `python3 build.py` 数次，而每次都会重写 `tests/unit/dist/*`
 *     ⇒ 末了跑一次缺省构建，✗ 留一份「只装某包」的 bundle 给后面的单测步（那会红成别的样子，归因就乱了）。
 *
 * 用法：node tests/gates/pack-selection.mjs [--verbose] [--selftest]
 * 退出码：0＝门绿；1＝有红（逐条具名）；2＝装置错（缺 build.py／缺故事源／构建跑不起来 ⇒ 证不出 ≠ 绿）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BUILD = path.join(ROOT, 'build.py');
const 源故事 = path.join(ROOT, 'tests', 'e2e', 'old-house');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
const 详 = process.argv.includes('--verbose');

/* ── 纯解析（只从**产物文本**里取读数的形，✗ 不重写收集逻辑）──────────────────────── */
/** 产物文本里出现的**规则包** id（取自标记行；去重、排序）。 */
export const packIdsIn = (text) => [...new Set([...text.matchAll(/\/\* ===== src\/dnd\/([^/]+)\//g)].map((m) => m[1]))].sort();
/** 产物里有没有 `src/core/**`（core 恒入的那条）。 */
export const hasCore = (text) => /\/\* ===== src\/core\//.test(text);
/** 产物里出现的**宿主包** id。 */
export const hostIdsIn = (text) => [...new Set([...text.matchAll(/\/\* ===== src\/host\/([^/]+)\//g)].map((m) => m[1]))].sort();

const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-selection-'));
let 临时序 = 0;

/** 造一份故事副本（可选写 `story.json`）⇒ 绝对路径。 */
const 造故事 = (清单) => {
	const d = path.join(临时根, `story-${++临时序}`);
	fs.cpSync(源故事, d, { recursive: true });
	if (清单 !== undefined) fs.writeFileSync(path.join(d, 'story.json'), 清单, 'utf8');
	return d;
};

/** 真构建 ⇒ `{rc, dup, out, outPath}`。 */
const 构建 = (故事, { host = null, out = 'x.html' } = {}) => {
	const args = [BUILD, 故事, '--out', out];
	if (host) args.push('--host', host);
	const r = spawnSync('python3', args, { encoding: 'utf8' });
	const outPath = path.join(故事, out);
	return { rc: r.status, dup: `${r.stdout ?? ''}${r.stderr ?? ''}`, out: fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '' };
};

const sha = (s) => {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return h.toString(16).padStart(8, '0');
};

function main() {
	if (!fs.existsSync(BUILD)) { console.error(`✗ 装置错：找不到 ${BUILD} ⇒ **证不出**`); process.exit(2); }
	if (!fs.existsSync(path.join(源故事, 'src'))) { console.error(`✗ 装置错：找不到 ${源故事}/src ⇒ **证不出**`); process.exit(2); }

	const 红 = [];
	let cliApparatusError = false;
	const ok = (条件, 名, 细节 = '') => { if (!条件) 红.push(`${名}${细节 ? ` —— ${细节}` : ''}`); if (详) console.log(`  ${条件 ? '✓' : '✗'} ${名}`); };
	const 可用 = fs.readdirSync(path.join(ROOT, 'src', 'dnd')).filter((d) => fs.existsSync(path.join(ROOT, 'src', 'dnd', d, '00-init.js'))).sort();
	if (详) console.log(`  可用规则包（装置面）：${可用.join('／')}`);

	/* ⑦ assets 与 packs 共用清单读口。接入已在 CI 的入口，不另改 workflow。 */
	const assetTests = spawnSync('python3', [path.join(ROOT, 'tests', 'build', 'story_assets_test.py')],
		{ encoding: 'utf8', timeout: 25000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
	ok(assetTests.status === 0, '⑦ 离线素材构建正反测试',
		`rc=${assetTests.status}｜${assetTests.error?.message ?? ''}｜${assetTests.stderr?.slice(-1200) ?? ''}`);
	if (详) console.log(assetTests.stderr?.trim() ?? '');

	/* ⑧ T 席具名准许：#2065/6094569888；扩此入口，不改 workflow。 */
	const cliTests = spawnSync('python3', [path.join(ROOT, 'tests', 'build', 'cli_source_isolation_test.py')],
		{ encoding: 'utf8', timeout: 25000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
	const cliOutput = `${cliTests.stdout ?? ''}${cliTests.stderr ?? ''}`;
	const cliCount = Number(cliOutput.match(/Ran ([1-9]\d*) tests?\b/)?.[1] ?? 0);
	cliApparatusError = Boolean(cliTests.error || cliTests.signal || cliTests.status === 2 || (cliTests.status === 0 && !cliCount));
	ok(cliTests.status === 0 && cliCount > 0, '⑧ CLI排除与旧脚本保留（两向具名、真产物对照）',
		`${cliApparatusError ? '⑧装置错（缺失/不能启动/超时/空跑）：' : ''}rc=${cliTests.status}; methods=${cliCount}; ${cliTests.error?.message ?? ''}; ${cliOutput.trim()}`);
	if (详 || cliTests.status === 0) console.log(cliOutput.trim());

	/* ① 无清单 ⇒ 全装 */
	const A = 构建(造故事(undefined));
	ok(A.rc === 0, '① 无清单构建应成功', `rc=${A.rc}｜${A.dup.slice(-160)}`);
	ok(A.out && packIdsIn(A.out).join('／') === 可用.join('／'), '① 无清单 ⇒ **全装**（三包标记齐）', `实得 ${packIdsIn(A.out).join('／') || '（无）'}`);
	ok(hasCore(A.out), '① 全装产物里 `src/core/**` 仍在');

	/* ② 缺省 ≡ 显式全列（逐字节同） */
	const B = 构建(造故事(JSON.stringify({ packs: 可用 }, null, 2)));
	ok(B.rc === 0, '② 显式全列构建应成功', `rc=${B.rc}｜${B.dup.slice(-160)}`);
	ok(A.out && A.out === B.out, '② 缺省 ≡ 显式全列（逐字节相同）', `缺省 ${sha(A.out)} ≠ 显式 ${sha(B.out)}`);

	/* ③ 单包 ⇒ 只装它（core 恒入） */
	const C = 构建(造故事(JSON.stringify({ packs: ['dnd3'] }, null, 2)));
	ok(C.rc === 0, '③ 单包构建应成功', `rc=${C.rc}｜${C.dup.slice(-160)}`);
	ok(packIdsIn(C.out).join('／') === 'dnd3', '③ `packs:["dnd3"]` ⇒ **只装 dnd3**', `实得 ${packIdsIn(C.out).join('／') || '（无）'}`);
	ok(hasCore(C.out), '③ 单包产物里 `src/core/**` 仍在（core 恒入）');
	/* ★只判**标记行**（`/* ===== src/dnd/<id>/`）—— 别用裸 `src/dnd/dnd-5e/`：那句在 core 的注释里也会出现
	 *   （本席首测即栽在这一点：包已正确排除，却因注释里的字面串误判成红）。 */
	ok(!/\/\* ===== src\/dnd\/dnd-5e\//.test(C.out) && !/\/\* ===== src\/dnd\/d20m\//.test(C.out),
		'③ 未选中的包**不在**产物里（按标记行判：dnd-5e／d20m）');

	/* ④ 未知 id ⇒ 构建期具名抛 */
	const D = 构建(造故事(JSON.stringify({ packs: ['dnd3', 'nosuchpack'] }, null, 2)));
	ok(D.rc !== 0, '④ 未知包 id ⇒ 构建应失败（✗ 静默回落全装）', `rc=${D.rc}`);
	ok(/nosuchpack/.test(D.dup) && /可用/.test(D.dup), '④ 红须**具名**（报出该 id ＋ 可用清单）', D.dup.slice(-200));

	/* ⑤ 与 --host 正交 */
	const E = 构建(造故事(JSON.stringify({ packs: ['dnd3'] }, null, 2)), { host: 'headless' });
	ok(E.rc === 0, '⑤ `--host headless` ＋单包构建应成功', `rc=${E.rc}｜${E.dup.slice(-160)}`);
	ok(hostIdsIn(E.out).join('／') === 'headless', '⑤ 宿主按 `--host` 走（✗ 被 `packs` 影响）', `实得 ${hostIdsIn(E.out).join('／') || '（无）'}`);
	ok(packIdsIn(E.out).join('／') === 'dnd3', '⑤ 规则包仍按 `packs` 走（两维正交）', `实得 ${packIdsIn(E.out).join('／') || '（无）'}`);

	/* ⑥ 清单坏 ⇒ 具名抛 */
	const F = 构建(造故事('{ not json'));
	ok(F.rc !== 0 && /故事清单/.test(F.dup), '⑥ 坏 JSON ⇒ rc≠0 且具名', `rc=${F.rc}｜${F.dup.slice(-160)}`);
	const G = 构建(造故事(JSON.stringify({ packs: [] }, null, 2)));
	ok(G.rc !== 0 && /packs/.test(G.dup), '⑥ `packs: []`（空数组）⇒ rc≠0 且具名', `rc=${G.rc}｜${G.dup.slice(-160)}`);
	const H = 构建(造故事(JSON.stringify({ packs: 'dnd3' }, null, 2)));
	ok(H.rc !== 0 && /packs/.test(H.dup), '⑥ `packs` 非数组 ⇒ rc≠0 且具名', `rc=${H.rc}｜${H.dup.slice(-160)}`);

	/* 收尾：重建缺省（✗ 留「只装某包」的 bundle 给后面的步） */
	const 收 = spawnSync('python3', [BUILD], { encoding: 'utf8' });
	ok(收.status === 0, '★收尾重建缺省应成功', `rc=${收.status}`);
	fs.rmSync(临时根, { recursive: true, force: true });

	console.log(`\n扫描：可用规则包 ${可用.length} 个（${可用.join('／')}）／包选择臂 ${9} 条＋离线素材测试＋CLI隔离 ${cliCount} 个方法`);
	if (红.length) { console.log(`✗ 门红：`); 红.forEach((x) => console.log(`  · ${x}`)); process.exit(cliApparatusError ? 2 : 1); }
	console.log('✓ 门绿（缺省＝全装且逐字节同显式全列 · 单包只装它 · 未知/坏清单构建期具名抛 · 与 --host 正交 · 离线素材正反臂 · CLI隔离两向及真产物对照）');
}

/* ── 自检刀（仅当直接运行）────────────────────────────────────────────────── */
if (isMain && process.argv.includes('--selftest')) {
	const { execFileSync } = await import('node:child_process');
	const 备份 = fs.readFileSync(BUILD);
	const md5 = execFileSync('md5sum', [BUILD], { encoding: 'utf8' }).split(' ')[0];
	const 跑 = () => spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
	const 真刀 = [
		['R1 拆掉包过滤（缺省也当全装）', [['if 包选 is not None and 归属 is None and pack_root and pack_root.name not in 包选:',
			'if False:   # ★刀：包过滤已摘']], '③'],
		['R2 未知包 id 静默（✗ 构建期具名抛）', [['        if 未知:', '        if False:   # ★刀：未知 id 不抛']], '④'],
		['R3 摘掉CLI排除边界', [['return file_path.is_relative_to(PLUGIN_SRC / "cli")', 'return False']], '⑧'],
	];
	let n = 0, 总 = 真刀.length + 2, apparatusError = false;
	console.log('=== 规则包选择门 · 自检刀 ===');
	try {
		const baseline = 跑();
		const baselineGreen = baseline.status === 0;
		apparatusError = Boolean(baseline.error || baseline.signal || baseline.status === 2);
		console.log(`  ${baselineGreen ? '✓' : '✗'} 未下刀基线 ⇒ rc=${baseline.status}（期望 0）`);
		if (baselineGreen) n++;
		else console.log(`${baseline.stdout ?? ''}\n${baseline.stderr ?? ''}`);
		for (const [名, 补丁, 期望红] of 真刀) {
			if (!baselineGreen) break;
			fs.writeFileSync(BUILD, 备份);
			let 文 = 备份.toString('utf8');
			for (const [a, b] of 补丁) {
				if (!文.includes(a)) { console.log(`  ✗ 装置错 ${名}：找不到待改的锚（${a.slice(0, 40)}…）`); apparatusError = true; break; }
				文 = 文.replace(a, b);
			}
			if (apparatusError) break;
			fs.writeFileSync(BUILD, 文, 'utf8');  // 保留原CRLF；只改刀的锚，不再生成CRCRLF。
			const r = 跑();
			if (r.error || r.signal || r.status === 2) {
				apparatusError = true;
				console.log(`  ✗ 装置错 ${名}：rc=${r.status}; ${r.error?.message ?? ''}; ${r.stdout ?? ''}; ${r.stderr ?? ''}`);
				break;
			}
			const 命中 = r.status === 1 && r.stdout.includes(期望红);
			console.log(`  ${命中 ? '✓' : '✗'} 真刀 ${名} ⇒ rc=${r.status}（期望 1 且红在「${期望红}」）`);
			if (命中) n++;
		}
	} finally {
		fs.writeFileSync(BUILD, 备份);
	}
	const restored = 跑();
	const restoredGreen = restored.status === 0;
	apparatusError ||= Boolean(restored.error || restored.signal || restored.status === 2);
	console.log(`  ${restoredGreen ? '✓' : '✗'} 复原后重跑 ⇒ rc=${restored.status}（期望 0）`);
	if (restoredGreen) n++;
	else console.log(`${restored.stdout ?? ''}\n${restored.stderr ?? ''}`);
	const md5b = execFileSync('md5sum', [BUILD], { encoding: 'utf8' }).split(' ')[0];
	console.log(md5 === md5b ? `  ✓ 复原逐字节同（md5 ${md5b}）` : `  ✗ 复原 ✗ 逐字节同（${md5} ⇒ ${md5b}）`);
	if (md5 === md5b) n++;
	总++;
	console.log(n === 总 ? `  ✓ ${n}/${总} 自检项全部如期（三把真刀＋基线绿＋复原绿＋字节同）` : `  ✗ ${n}/${总} 自检项如期`);
	process.exit(apparatusError ? 2 : (n === 总 ? 0 : 1));
}

if (isMain && !process.argv.includes('--selftest')) main();
