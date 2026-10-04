#!/usr/bin/env node
/* 宿主**打包**门（`sgstory#1998` 阶段 6 切片 B —— `build.py --host` 产物级选择 ＋ `src/host/headless/`）
 *
 * ## 本条要判的三件事（都是**产物面**，✗ 源码面）
 *   ① **缺省**构建 ⇒ 产物里恰是**默认宿主**（`build.py` 的 `DEFAULT_HOSTS`，一处定义），且打印这次装了谁；
 *   ② `--host <id>` ⇒ 产物**只装**该宿主包，并**注入** `setup.RPG.useHost('<id>')`（产物自证选了谁）；
 *   ③ `--host all` ⇒ 两宿主同载 ＋ **无注入** ⇒ 该产物上「**取用必吵**」（`portOf` 具名抛「未选择」）、
 *      「**读的语义可安静**」（`RPG.ports` 是空袋，✗ 不抛）；④ 未知 id ⇒ **构建期**具名抛（✗ 静默回落默认）。
 *   ⑤ 第二个宿主（`headless`）是**真适配器**：在 `--host headless` 的**真产物**上跑完一条最小会话。
 *
 * ## 口径（★读数须注明，否则不可复核）
 *   · 读数是**产物文本**里的宿主包**标记行**（`/* ===== src/host/<id>/… ===== *​/`，由 `build.py` 的
 *     `js_parts_of` 写出）⇒ 判的是「装没装」，✗ 复算 `build.py` 的收集逻辑（那是**第二份源**）。
 *   · `--host headless` ⇒ headless 宿主的口径见 `src/host/headless/00-init.js` 头注（「空袋＝读的语义 ·
 *     用的语义必须是吵的」）；本门只量产物与运行读数，✗ 重述那条原则。
 *   · ★本门会**真调** `python3 build.py` 数次（读真产物）。**收尾必重建缺省**——✗ 留一份「全装」产物
 *     给后面的单测步（那会红成别的样子，归因就乱了）。
 *
 * 用法：node tests/gates/host-packaging.mjs [--verbose] [--selftest]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const isMain = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BUILD = path.join(ROOT, 'build.py');
const BUNDLE = path.join(ROOT, 'tests/unit/dist/bundle.js');
const HOST_DIR = path.join(ROOT, 'src', 'host');

/* ── 纯函数（可直喂 ⇒ 自检刀能造边界，✗ 只能靠真构建）──────────────────────── */

/** 产物文本里出现的宿主包 id（取自 `js_parts_of` 写的标记行；去重、排序）。 */
export const hostIdsIn = (text) => [...new Set([...text.matchAll(/\/\* ===== src\/host\/([^/]+)\//g)].map((m) => m[1]))].sort();

/** 解析 `--host` 取值 ⇒ `{ids, explicit}`；未知 id／空取值 ⇒ **具名抛**（✗ 静默回落默认宿主）。 */
export const resolveHostSelection = (spec, available, defaults) => {
	if (spec == null) return { ids: [...defaults], explicit: false };
	const s = String(spec).trim();
	const parts = s === 'all' ? [...available] : s.split(',').map((x) => x.trim()).filter(Boolean);
	if (!parts.length) throw new Error('--host 需要一个非空的宿主 id（或 all）');
	const unknown = parts.filter((id) => !available.includes(id));
	if (unknown.length) {
		throw new Error(`未知宿主「${unknown.join('、')}」（现有：${available.join('／') || '（无）'}）`
			+ ' —— 宿主 id ＝ `src/host/<id>/` 的目录名，✗ 静默回落默认宿主');
	}
	return { ids: [...new Set(parts)], explicit: true };
};

/** 是否**注入**选择行：只有「显式指定且恰一个」才注入（多宿主 ⇒ ✗ 注入：那正是「取用必吵」那一形）。 */
export const shouldInject = ({ ids, explicit }) => explicit && ids.length === 1;

/** 本次打包的**读数字符串**（「读的语义可以安静」＝不抛，但**须出声**）。 */
export const packagingLine = ({ ids, explicit, defaults }) => (explicit
	? `  宿主：--host 指定 ⇒ 装 ${ids.join('、')}`
	: `  宿主：未指定 --host ⇒ 按默认宿主装 ${ids.join('、')}（其余宿主按需 \`--host <id>\`；默认表见 build.py 的 DEFAULT_HOSTS）`);

/* ── 真构建面 ─────────────────────────────────────────────────────────────── */

const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

/** 现成的宿主包目录名（＝`src/host/<id>/00-init.js` 存在的那些）。 */
export const availableHosts = (dir = HOST_DIR) => (!fs.existsSync(dir) ? []
	: fs.readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, '00-init.js')))
		.map((e) => e.name).sort());

/** `build.py` 里 `DEFAULT_HOSTS` 的**取值**（一处定义在那边；门只读它，✗ 另抄一份清单）。 */
export const defaultHosts = (src = fs.readFileSync(BUILD, 'utf8')) => {
	const m = src.match(/^DEFAULT_HOSTS\s*=\s*\(([^)]*)\)/m);
	if (!m) throw new Error('build.py 里找不到 `DEFAULT_HOSTS`（一处定义改名了？）');
	return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
};

const 跑 = (args) => spawnSync('python3', [BUILD, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 5 * 60 * 1000 });

const 探针 = (arm) => {
	const r = spawnSync(process.execPath, [path.join(ROOT, 'tests/gates/_host-probe.mjs'), BUNDLE, arm],
		{ cwd: ROOT, encoding: 'utf8', timeout: 5 * 60 * 1000 });
	const out = `${r.stdout ?? ''}`.trim().split('\n').pop() ?? '';
	try { return { rc: r.status, ...JSON.parse(out) }; }
	catch { return { rc: r.status, parseError: out, stderr: (r.stderr ?? '').slice(0, 400) }; }
};

/* ── 主判定 ───────────────────────────────────────────────────────────────── */

function main() {
	const problems = [];
	const notes = [];
	const 可选 = availableHosts();
	let 默认;
	try { 默认 = defaultHosts(); }
	catch (e) { console.error(`  ✗ 门自身前置缺失：${e.message}`); process.exit(2); }

	if (!fs.existsSync(BUILD)) { console.error(`  ✗ 环境错：缺 ${path.relative(ROOT, BUILD)}`); process.exit(2); }
	if (!可选.length) { console.error('  ✗ 环境错：`src/host/*/00-init.js` 一个都没有 ⇒ 本门无对象'); process.exit(2); }
	const 先md5 = fs.existsSync(BUNDLE) ? md5(BUNDLE) : null;

	const 原始build = fs.readFileSync(BUILD);
	const 收尾 = () => {                                   // ★收尾**必**重建缺省（✗ 留「全装」产物给后面）
		const r = 跑([]);
		const ids = fs.existsSync(BUNDLE) ? hostIdsIn(fs.readFileSync(BUNDLE, 'utf8')) : [];
		return { rc: r.status, ids };
	};

	try {
		/* ① 缺省 ⇒ 恰默认宿主 ＋ 出声 */
		{
			const r = 跑([]);
			const ids = hostIdsIn(fs.readFileSync(BUNDLE, 'utf8'));
			if (r.status !== 0) problems.push(`缺省构建 rc=${r.status}（✗ 本该 0）：${(r.stderr ?? '').slice(0, 200)}`);
			if (JSON.stringify(ids) !== JSON.stringify([...默认].sort())) {
				problems.push(`缺省产物里的宿主包＝${JSON.stringify(ids)}，默认表＝${JSON.stringify(默认)}`
					+ '（★缺省装的就是默认表；多装＝打断全部装置，少装＝产物跑不起来）');
			}
			if (!/默认宿主/.test(`${r.stdout ?? ''}`)) {
				problems.push('缺省构建**没出声**（stdout 里没有「默认宿主」读数）—— 读的语义可以安静，但**须可见**');
			}
		}
		const 缺省md5 = fs.existsSync(BUNDLE) ? md5(BUNDLE) : null;

		/* ② `--host <唯一非默认宿主>` ⇒ 只装它 ＋ 注入选择 */
		const 靶 = 可选.find((id) => !默认.includes(id)) ?? 可选[0];
		{
			const r = 跑(['--host', 靶]);
			const text = fs.readFileSync(BUNDLE, 'utf8');
			const ids = hostIdsIn(text);
			if (r.status !== 0) problems.push(`\`--host ${靶}\` 构建 rc=${r.status}（✗ 本该 0）：${(r.stderr ?? '').slice(0, 200)}`);
			if (JSON.stringify(ids) !== JSON.stringify([靶])) {
				problems.push(`\`--host ${靶}\` 的产物里宿主包＝${JSON.stringify(ids)}（应恰 ${JSON.stringify([靶])}）`);
			}
			if (!text.includes(`useHost('${靶}')`)) {
				problems.push(`\`--host ${靶}\` 的产物**没有注入** \`useHost('${靶}')\` —— 产物无法自证选了谁`);
			}
			const p = 探针('headless');
			if (p.hostOf !== 靶) problems.push(`探针读数：\`hostOf()\`＝${JSON.stringify(p.hostOf)}（应 ${JSON.stringify(靶)}）`);
			if (p.ranStopped !== 'input-empty' || !(p.ranSteps >= 1)) {
				problems.push(`★真适配器上没跑完一条最小会话：${JSON.stringify(p)}`);
			}
			if (!(p.outputLines ?? []).length) problems.push(`★最小会话的输出没落到该宿主自己的呈现面：${JSON.stringify(p)}`);
			/* ★适配器自身的契约面（本臂在**真产物**上取读到，故不另开用例档）：深拷贝往返／版本不符具名抛／
			 *   纪元判活／段落订户 —— 四项都是「这个宿主是不是**真**适配器」的读数。 */
			if (!(p.persist?.has && p.persist?.深拷贝)) problems.push(`★headless PersistContract 往返不对：${JSON.stringify(p.persist)}`);
			if (JSON.stringify(p.persist?.slotSemantics) !== JSON.stringify({ auto: false, explicitSlots: [] })) {
				problems.push(`★headless 的 slotSemantics 声明不符：${JSON.stringify(p.persist?.slotSemantics)}`);
			}
			if (!/迁移链/.test(String(p.migrateThrew))) problems.push(`★headless 的 migrate 版本不符时未具名抛：${JSON.stringify(p.migrateThrew)}`);
			if (p.lifecycle?.前 !== true || p.lifecycle?.后 !== false || !(p.lifecycle?.canceled >= 1)) {
				problems.push(`★headless 的纪元判活／作废不对：${JSON.stringify(p.lifecycle)}`);
			}
			if (p.navigated !== 'probe-passage') problems.push(`★headless 的段落订户未收到导航：${JSON.stringify(p.navigated)}`);
			notes.push(`② ${靶}：产物 ${ids.length} 个宿主包｜注入 ✓｜会话 stopped=${p.ranStopped} steps=${p.ranSteps}｜输出 ${p.outputLines?.length ?? 0} 条`
				+ `｜适配器：往返 ✓ 迁移抛 ✓ 纪元 ✓ 段落订户 ✓`);
		}

		/* ③ `--host all` ⇒ 全装 ＋ **无注入** ⇒ 取用必吵／读面可安静 */
		{
			const r = 跑(['--host', 'all']);
			const text = fs.readFileSync(BUNDLE, 'utf8');
			const ids = hostIdsIn(text);
			if (r.status !== 0) problems.push(`\`--host all\` 构建 rc=${r.status}（✗ 本该 0）`);
			if (JSON.stringify(ids) !== JSON.stringify([...可选].sort())) {
				problems.push(`\`--host all\` 的产物里宿主包＝${JSON.stringify(ids)}（应 ${JSON.stringify([...可选].sort())}）`);
			}
			if (/\/\* ===== 由 build\.py --host 注入/.test(text)) {
				problems.push('`--host all` 的产物**注入了宿主选择** —— 多宿主产物应由调用方决定，✗ 由构建猜');
			}
			const p = 探针('all');
			if (p.hostOf !== null) problems.push(`多宿主未选却已有已定宿主：hostOf()＝${JSON.stringify(p.hostOf)}（应 null）`);
			if ((p.portsKeys ?? ['<探针没报 portsKeys>']).length !== 0) {
				problems.push(`多宿主未选时 \`RPG.ports\` 非空袋：${JSON.stringify(p.portsKeys)}（读的语义应可安静地为空）`);
			}
			if (!/未选择/.test(String(p.portOfThrew))) {
				problems.push(`★多宿主未选时**取用竟没吵**：portOfThrew＝${JSON.stringify(p.portOfThrew)}（应含「未选择」）`);
			}
			notes.push(`③ all：产物 ${ids.length} 个宿主包｜无注入 ✓｜取用抛「未选择」✓｜读面空袋（${JSON.stringify(p.portsKeys)}）✓`);
		}

		/* ④ 未知 id ⇒ **构建期**具名抛（✗ 静默回落默认宿主）＋ 产物**未被改写** */
		{
			const 前md5 = fs.existsSync(BUNDLE) ? md5(BUNDLE) : null;
			const r = 跑(['--host', '查无此宿主']);
			const msg = `${r.stdout ?? ''}${r.stderr ?? ''}`;
			if (r.status === 0) problems.push('未知宿主 id 竟然 rc=0（✗ 应构建期失败）—— 静默回落是「安静地给了别的宿主」');
			if (!/未知宿主/.test(msg)) problems.push(`未知 id 的报错不具名：${JSON.stringify(msg.slice(0, 200))}`);
			for (const id of 可选) if (!msg.includes(id)) problems.push(`未知 id 的报错未列出现有宿主「${id}」：${JSON.stringify(msg.slice(0, 200))}`);
			const 后md5 = fs.existsSync(BUNDLE) ? md5(BUNDLE) : null;
			if (前md5 != null && 前md5 !== 后md5) problems.push('★未知 id 失败后产物被改写了（✗ 构建失败不得动已有产物）');
		}
	} finally {
		const 收 = 收尾();
		if (收.rc !== 0 || JSON.stringify(收.ids) !== JSON.stringify([...默认].sort())) {
			problems.push(`★收尾重建缺省失败：rc=${收.rc}、宿主包＝${JSON.stringify(收.ids)}`
				+ '（✗ 门不许留「全装」产物给后面的单测步）');
		}
		if (md5(BUILD) !== crypto.createHash('md5').update(原始build).digest('hex')) {
			problems.push('★门跑完时 build.py 与开工前 md5 不同（✗ 门不许改被测物）');
		}
	}

	console.log('  宿主打包门（#1998）：产物级选择 ＋ 随仓第二宿主');
	console.log(`  src/host/ 现有宿主：${JSON.stringify(可选)}｜默认表（build.py 一处定义）：${JSON.stringify(默认)}`);
	for (const n of notes) console.log(`    · ${n}`);
	if (problems.length) {
		console.log('  ✗ 门红：');
		for (const p of problems) console.log(`    - ${p}`);
		process.exit(1);
	}
	console.log('  ✓ 门绿（缺省＝默认宿主；--host 只装所选并注入；all ⇒ 取用吵／读面空；未知 id 构建期具名抛）');
}

/* ── 自检刀（仅当直接运行）────────────────────────────────────────────────── */

if (isMain && process.argv.includes('--selftest')) {
	const 可选 = ['aaa', 'bbb'];
	const 默认 = ['aaa'];
	const 刀 = [
		['K1 缺省 ⇒ 默认表（✗ 全部）', JSON.stringify(resolveHostSelection(null, 可选, 默认)) === JSON.stringify({ ids: ['aaa'], explicit: false })],
		['K2 `all` ⇒ 全部（explicit）', JSON.stringify(resolveHostSelection('all', 可选, 默认)) === JSON.stringify({ ids: ['aaa', 'bbb'], explicit: true })],
		['K3 逗号列表 ＋ 去重', JSON.stringify(resolveHostSelection('bbb,aaa,bbb', 可选, 默认)) === JSON.stringify({ ids: ['bbb', 'aaa'], explicit: true })],
		['K4 未知 id ⇒ **具名抛**且列现有', (() => {
			try { resolveHostSelection('ccc', 可选, 默认); return false; }
			catch (e) { return /未知宿主/.test(e.message) && e.message.includes('aaa') && e.message.includes('bbb'); }
		})()],
		['K5 空取值 ⇒ 抛（✗ 静默按默认）', (() => { try { resolveHostSelection('  ', 可选, 默认); return false; } catch { return true; } })()],
		['K6 注入判定：单宿主显式 ⇒ 注入；多宿主／缺省 ⇒ ✗', shouldInject({ ids: ['bbb'], explicit: true }) === true
			&& shouldInject({ ids: ['aaa', 'bbb'], explicit: true }) === false
			&& shouldInject({ ids: ['aaa'], explicit: false }) === false],
		['K7 产物标记解析：去重排序（✗ 数重复项）', JSON.stringify(hostIdsIn(
			'/* ===== src/host/bbb/10-persist.js ===== */\n/* ===== src/host/aaa/00-init.js ===== */\n/* ===== src/core/x.js ===== */\n/* ===== src/host/bbb/20-render.js ===== */\n'
		)) === JSON.stringify(['aaa', 'bbb'])],
		['K8 读数行：缺省须**出声**且点名默认；显式须报实际装的', /默认宿主装 aaa/.test(packagingLine({ ids: ['aaa'], explicit: false, defaults: ['aaa'] }))
			&& /--host 指定 ⇒ 装 bbb/.test(packagingLine({ ids: ['bbb'], explicit: true, defaults: ['aaa'] }))],
		['K9 `DEFAULT_HOSTS` 读得到（✗ 改名即静默失效）', defaultHosts().length > 0 && 默认.every((x) => typeof x === 'string')],
	];
	let n = 0;
	console.log('\n=== 宿主打包门 · 自检刀 ===');
	for (const [名, ok] of 刀) { n += ok ? 1 : 0; console.log(`  ${ok ? '✓' : '✗'} ${名}`); }

	/* ── 真刀（改被测物 ⇒ 本门须红；按字节复原 ＋ md5 自证）── */
	const 真刀 = [
		['R1 摘掉宿主包过滤（缺省 ⇒ 全装）', BUILD, [['        if 归属 and 归属 not in 选:', '        if False:   # ★刀：过滤已摘']], '缺省产物里的宿主包'],
		['R2 未知 id 静默（✗ 构建期具名抛）', BUILD, [['    if unknown:', '    if False:   # ★刀：未知 id 不抛']], '未知宿主 id 竟然 rc=0'],
		/* ★R3 是**适配器侧**的刀：断「headless 走过的三段契约面的读数不是印面」——
		 *   把「深拷贝进出」拆成「递内部引用」⇒ 臂 ② 的往返读数必红。 */
		['R3 headless 存档不再深拷贝（递内部引用）', path.join(ROOT, 'src/host/headless/10-persist.js'),
			[['return 内存.has(s) ? 副本(内存.get(s)) : null;', 'return 内存.get(s) ?? null;   // ★刀：递内部引用']], 'headless PersistContract 往返不对'],
	];
	for (const [名, 靶, 补丁, 期望红] of 真刀) {
		const 原 = fs.readFileSync(靶);
		const 原md5 = crypto.createHash('md5').update(原).digest('hex');
		let ok = false, 说明 = '';
		try {
			let s = 原.toString('utf8');
			for (const [找, 换] of 补丁) {
				if (!s.includes(找)) { 说明 = `替换未命中：${JSON.stringify(找.slice(0, 40))}`; break; }
				s = s.replace(找, 换);
			}
			if (!说明) {
				fs.writeFileSync(靶, s, 'utf8');
				const r = spawnSync(process.execPath, [import.meta.filename], { cwd: ROOT, encoding: 'utf8', timeout: 10 * 60 * 1000 });
				const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
				ok = r.status === 1 && out.includes(期望红);
				说明 = ok ? '' : `rc=${r.status}／期望红「${期望红}」${out.includes(期望红) ? '' : '未出现'}`;
			}
		} finally {
			fs.writeFileSync(靶, 原);
			if (crypto.createHash('md5').update(fs.readFileSync(靶)).digest('hex') !== 原md5) { ok = false; 说明 = '复原失败（md5 不同）'; }
		}
		n += ok ? 1 : 0;
		console.log(`  ${ok ? '✓' : '✗'} 真刀 ${名}${说明 ? ` —— ${说明}` : ''}`);
	}

	const 总 = 刀.length + 真刀.length;	console.log(n === 总 ? `  ✓ ${n}/${总} 刀全部如期` : `  ✗ ${n}/${总} 刀如期`);
	process.exit(n === 总 ? 0 : 1);
}

/* ---------------- 主判定（仅当直接运行） ---------------- */
if (isMain && !process.argv.includes('--selftest')) main();
