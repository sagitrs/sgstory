#!/usr/bin/env node
/* 通道类别门（`P1-3`：装备类／物品用法拒绝类的**上屏**必须带通道）
 *
 * ## 本门要产出什么
 *   一条**机械判据**：**两个 API 面**（①装备：`slotEquip`／`slotUnequip` 走的那条；②物品用法：
 *   `RPG.act`／`RPG.useItem`／`Item.used` 走的那条）里的 `perform` **一律带 `channel`**
 *   ⇒ 否则「仅关键」档会把它筛掉，玩家**做了动作读不到回执** ✓（`P1-3` 的病灶 ✓）。
 *
 * ## 为什么是**静态门**（developer 08:40 观察：7 处无格守）
 *   运行期格只能逐个钉**已知**调用点 ⇒ 新加一处 `perform`（同两类里）**不会红**（枚举面 ✗ ≡ 声称面 ✗）。
 *   静态门扫**文件面**：该两面所在的两档里，凡 `perform` 不带通道且**未具名豁免** ⇒ 红 ✓。
 *
 * ## 判据
 *   ① 逐 `perform(` 调用（**跨行**也判 ✓）⇒ 调用内须出现 `channel`，或该行带**具名豁免**标记
 *      `p13: 非本两面`（★豁免**写在被豁免的那一行**上 ⇒ 读的人当场看见「为什么它不算」✓）。
 *   ② **类别通道的级别**：`RPG.defNotice('equip'|'item-refuse', …)` 须带 `level: 'key'`
 *      （✗ 被降级 ⇒ 本门红 ✓ —— 这一条防的是「把通道注册改回常态」这种**静默回退** ✓）。
 *
 * ## 读数（可复核）
 *   计数单位＝**命中次数**；扫描面＝下方 `SCAN` 列出的档（✦ 只这两档＝**两个 API 面**的家 ✓）。
 *
 * 用法：node tests/gates/key-channels.mjs [--verbose]
 *       node tests/gates/key-channels.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');

/** 扫描面：两个 API 面的**家**（✦ 这是「枚举面」的**声称面** ⇒ 两档全扫，✗ 逐函数切 ✗）。 */
const SCAN = [
	'src/core/30-inventory.js',   // 装备（slotEquip／slotUnequip）＋ 用法（RPG.act／RPG.useItem）
	'src/core/10-item.js',        // Item.used（动作分发失败 ⇒ 用法拒绝）
];
/** 类别通道（`P1-3`）：凡属于这几类的上屏，须走对应通道 ✓。
 *  ★`books#483/#484` 甲案（writer-2 代裁 `6064297345`）：加 **`travel-refuse`**（行程·拒绝）——
 *    行程/探索的拒因各自成一类（✗ 不并入 `item-refuse`（物品）✗ 不并入 `map-scene`（场景/演出））✓。 */
const 类别通道 = ['equip', 'item-refuse', 'travel-refuse'];
/** ★**注册源**：这几类的 `defNotice(...)` **住在这一档** ✓。
 *   ⚠ 旧形的类别循环只在上面 `SCAN`（两个 API 面）内跑 ⇒ 那两档里**没有** `defNotice` 调用 ⇒
 *     **0 命中＝假绿** ✗（甲案裁文点名之处：「静态门须真的咬注册，不只是加数组」✓）。 */
const 注册源 = 'src/core/71-notice.js';
/** 豁免标记：写在被豁免的那一行上（具名 ✓）。 */
const 豁免标记 = 'p13: 非本两面';

/** 取一处 `perform(` 调用的**整段**（跨行 ✓；括号配平；✗ 不跨过文件尾）。 */
const 取调用 = (src, open) => {
	let d = 0;
	for (let i = open; i < src.length && i - open < 2000; i++) {
		const c = src[i];
		if (c === '(') d++;
		else if (c === ')') { d--; if (d === 0) return src.slice(open, i + 1); }
	}
	return src.slice(open, Math.min(src.length, open + 2000));
};

/** 扫一档 ⇒ 命中列表（`{ 行, 文本, 因 }`）。 */
const 扫档 = (rel, 源码) => {
	const src = 源码 ?? fs.readFileSync(path.join(ROOT, rel), 'utf8');
	const 命中 = [];
	const 行表 = src.split('\n');
	const 行号 = (idx) => src.slice(0, idx).split('\n').length;
	const re = /(?<![A-Za-z0-9_$])perform\s*\(/g;   // ✗ 把 `.` 也排除：`RPG.perform(`／`this.perform(` **才是主形**（我第一版漏了它 ⇒ 0 命中＝假绿 ✓）
	let m;
	while ((m = re.exec(src)) !== null) {
		const open = src.indexOf('(', m.index);
		const 段 = 取调用(src, open);
		const 行 = 行号(m.index);
		const 本行 = 行表[行 - 1] ?? '';
		if (段.includes('channel')) continue;
		if (本行.includes(豁免标记) || 段.includes(豁免标记)) continue;
		/** 注释行：注释是开发者面（✗ 上屏）⇒ 不判 ✓。 */
		const 去空白 = 本行.trimStart();
		if (去空白.startsWith('*') || 去空白.startsWith('//') || 去空白.startsWith('/*')) continue;
		命中.push({ 行, 文本: 本行.trim().slice(0, 96), 因: 'NO-CHANNEL' });
	}
	/* ★类别面已挪到 `扫注册`（上面）—— 它必须咬**注册源**，✗ 在这里扫这两个 API 面（那两档没有 defNotice ⇒ 0 命中＝假绿 ✗）。 */
	return 命中;
};

/** ★扫**注册源** ⇒ 类别通道的注册面命中（**未注册**／注册非 `key` 各具名 ✓）。
 *   `源码` 缺省＝读真档；自检用合成源（✗ 不碰真档 ✓）。 */
const 扫注册 = (源码) => {
	const src = 源码 ?? fs.readFileSync(path.join(ROOT, 注册源), 'utf8');
	const 命中 = [];
	const 行号 = (idx) => src.slice(0, idx).split('\n').length;
	for (const ch of 类别通道) {
		const m = new RegExp(`defNotice\\(\\s*'${ch}'\\s*,\\s*\\{([^}]*)\\}`, 'g').exec(src);
		if (!m) { 命中.push({ 行: 0, 文本: `（注册源 ${注册源} 里找不到 defNotice('${ch}', …)）`, 因: `NOT-REGISTERED:${ch}` }); continue; }
		if (!/level\s*:\s*'key'/.test(m[1])) 命中.push({ 行: 行号(m.index), 文本: m[0].slice(0, 96), 因: `LEVEL-NOT-KEY:${ch}` });
	}
	return 命中;
};

if (process.argv.includes('--selftest')) {
	const knives = [];
	const A = 'src/core/30-inventory.js';
	const mk = (rel, 源码, 因) => {
		const 得 = 扫档(rel, 源码).filter((h) => (因 ? h.因 === 因 : true));
		return 得;
	};
	/* 刀：裸 perform（该红）＋ 带通道的正形（✗ 该红）＋ 具名豁免（✗ 该红） */
	knives.push({ id: 'K1 裸 perform ⇒ 红', ok: mk(A, "\tthis.perform(`你装备了「剑」。`);", 'NO-CHANNEL').length === 1 });
	knives.push({ id: 'N1 带通道 ⇒ 绿', ok: mk(A, "\tthis.perform(`你装备了「剑」。`, { channel: 'equip' });", 'NO-CHANNEL').length === 0 });
	knives.push({ id: 'N2 具名豁免 ⇒ 绿', ok: mk(A, `\tthis.perform(\`＋1 绷带\`);   // ${豁免标记}`, 'NO-CHANNEL').length === 0 });
	knives.push({ id: 'K2 跨行裸 perform ⇒ 红（✗ 只看首行）', ok: mk(A, "\tthis.perform(\n\t\t`你装备了「剑」。`\n\t);", 'NO-CHANNEL').length === 1 });
	knives.push({
		id: 'K3 类别通道被降级（**注册源**）⇒ 红',
		ok: 扫注册("RPG.defNotice('equip', { name: '装备', level: 'log' });").filter((h) => h.因 === 'LEVEL-NOT-KEY:equip').length === 1,
	});
	knives.push({
		id: 'N3 类别通道是 key（**注册源**）⇒ 绿',
		ok: 扫注册("RPG.defNotice('equip', { name: '装备', level: 'key' });\nRPG.defNotice('item-refuse', { name: '物品·不可用', level: 'key' });\nRPG.defNotice('travel-refuse', { name: '行程·拒绝', level: 'key' });").length === 0,
	});
	/* ★甲案新增的两把刀：**未注册**与**新通道被降级** —— 都是旧形抓不到的（旧形扫错源 ⇒ 恒 0 命中）✓ */
	knives.push({
		id: 'K4 ★类别**未注册** ⇒ 红（旧形抓不到）',
		ok: 扫注册("RPG.defNotice('equip', { name: '装备', level: 'key' });").filter((h) => h.因 === 'NOT-REGISTERED:item-refuse').length === 1,
	});
	knives.push({
		id: 'K5 ★`travel-refuse` 被降级 ⇒ 红（甲案新通道）',
		ok: 扫注册("RPG.defNotice('equip', { name: '装备', level: 'key' });\nRPG.defNotice('item-refuse', { name: '物品·不可用', level: 'key' });\nRPG.defNotice('travel-refuse', { name: '行程·拒绝', level: 'log' });").filter((h) => h.因 === 'LEVEL-NOT-KEY:travel-refuse').length === 1,
	});
	let bad = 0;
	for (const k of knives) { console.log(`  ${k.ok ? '✓' : '✗'} ${k.id}`); if (!k.ok) bad++; }
	console.log(`  ${bad === 0 ? '✓' : '✗'} 自检：${knives.length - bad}/${knives.length} 刀如期（门会红也会绿）`);
	process.exit(bad === 0 ? 0 : 1);
}

const verbose = process.argv.includes('--verbose');
let 总 = 0;
console.log('─ 通道类别门（P1-3）：两个 API 面内 `perform` 一律带通道；**类别通道须在注册源里注册且 `level: key`**');
/* ★`books#483/#484` 甲案：**类别面**的检查咬**注册源**（`71-notice.js`）—— 旧形扫两个 API 面 ⇒ 恒 0 命中＝假绿 ✗。 */
{
	if (!fs.existsSync(path.join(ROOT, 注册源))) { console.log(`  ✗ 缺注册源：${注册源}`); 总 += 1; }
	else {
		const 命中 = 扫注册();
		总 += 命中.length;
		for (const h of 命中) console.log(`  ✗ [${h.因}] ${注册源}:${h.行} —— ${h.文本}`);
		if (!命中.length) console.log(`  ✓ 注册源 ${注册源}：类别通道 ${类别通道.length} 类（${类别通道.join('、')}）皆**已注册**且 level=key ✓`);
	}
}
for (const rel of SCAN) {
	if (!fs.existsSync(path.join(ROOT, rel))) { console.log(`  ✗ 缺档：${rel}`); 总 += 1; continue; }
	const 命中 = 扫档(rel);
	总 += 命中.length;
	if (命中.length) {
		for (const h of 命中) console.log(`  ✗ [${h.因}] ${rel}:${h.行} —— ${h.文本}`);
	} else if (verbose) console.log(`  ✓ ${rel}（0 命中）`);
}
console.log(`  扫描面 ${SCAN.length} 档｜命中 ${总}`);
console.log(总 === 0 ? '  ✓ 门通过（两面的上屏皆带通道 ✓；类别通道皆 key ✓）' : '  ⇒ ★判据红（逐条具名见上）');
process.exit(总 === 0 ? 0 : 1);
