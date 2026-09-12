// ⓪v 常量与字面量门（#318③）：剧情/代码里不得再出现**裸时代字符串**与**裸伤害数字**。
//
// 为什么：`<<damage 99>>` 这类裸数字无法回答「99 是什么意思」（它是「处死」的魔法数），
// 而 `$era is "past"` 的字符串字面量拼错一个字母会**静默失效**（条件永假，不报错）。
// 常量表在 `src/15-tables.twee`：`Game.Era`（PAST/PRESENT）、`Game.Damage`（graze/hurt/hard/heavy/lethal）。
//
// 两条判定（＋合成自证）：
//   ① 裸时代字面量：`'past'`/`"past"`/`'present'`/`"present"` 只能出现在 `15-tables.twee` 的
//      **数据字段**（`era:` / `flagEra:`）与 `Game.Era` 定义行；其它位置一律用 `Game.Era.*` → 否则红。
//   ② 裸伤害数字：剧情文件里 `<<damage <数字>>>` 一律红——必须写成 `<<damage \`Game.Damage.x\`>>`
//      （注意：SugarCube 宏的**裸词参数会被当字符串**，所以必须用 backtick 表达式，见本仓 integrity 门「坑11」）。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

export const flag = 'literals';
export const flags = ['literals'];

// 纯函数：给 { 文件: 源码 }，返回问题清单（供自证喂合成源码）
export const analyze = (sources) => {
	const problems = [];
	for (const [f, src] of Object.entries(sources)) {
		const base = f.split('/').pop();
		src.split('\n').forEach((line, i) => {
			const where = `${base}:${i + 1}`;
			// ① 时代字面量
			const eraHits = [...line.matchAll(/["'](past|present)["']/g)];
			if (eraHits.length) {
				const isTableData = base === '15-tables.twee' && /(flagEra|era:)/.test(line);
				const isConstDef = base === '15-tables.twee' && /const Era = \{/.test(line);
				if (!isTableData && !isConstDef) problems.push({ kind: 'bare-era', where, detail: line.trim().slice(0, 80) });
			}
			// ② 裸伤害数字（只在剧情文件里判：30/40/50/60 章）
			if (/^[3-6]0-ch\d\.twee$/.test(base) || /^(30|40|50|60)-ch/.test(base)) {
				const dmg = line.match(/<<damage\s+(-?\d+)\s*>>/);
				if (dmg) problems.push({ kind: 'bare-damage', where, detail: `<<damage ${dmg[1]}>> → 应写成 <<damage \`Game.Damage.x\`>>` });
			}
		});
	}
	return problems;
};

export const run = (ctx) => {
	console.log('\n══ ⓪v 常量与字面量门（#318③）——时代字面量与裸伤害数字 ══');
	let bad = 0;

	// 自证
	const SELF = [
		['正例：用 Game.Era 常量', { 'a.twee': ':: P\n<<if $era is Game.Era.PAST>>x<</if>>\n<<damage `Game.Damage.hurt`>>' }, 0],
		['裸时代字面量 → 红', { 'a.twee': ':: P\n<<if $era is "past">>x<</if>>' }, 1],
		['裸伤害数字（剧情文件）→ 红', { '40-ch2.twee': ':: P\n<<damage 4>>' }, 1],
		['数据字段里的 era 字面量 → 不红', { '15-tables.twee': "\t\tp: '塔门', era: 'past'," }, 0],
		['常量定义行 → 不红', { '15-tables.twee': "const Era = { PAST: 'past', PRESENT: 'present' };" }, 0],
	];
	let selfBad = 0;
	for (const [label, src, expect] of SELF) {
		const hit = analyze(src).length;
		const ok = expect === 0 ? hit === 0 : hit > 0;
		if (!ok) selfBad++;
		console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${hit}（期望${expect === 0 ? ' 0' : ' >0'}）`);
	}
	bad += selfBad;

	const sources = {};
	for (const f of ctx.SRC_FILES) sources[f] = readFileSync(f, 'utf8');
	const problems = analyze(sources);
	const byKind = problems.reduce((a, p) => (a[p.kind] = (a[p.kind] ?? 0) + 1, a), {});
	console.log(`  裸时代字面量 ${byKind['bare-era'] ?? 0} 处 · 裸伤害数字 ${byKind['bare-damage'] ?? 0} 处`);
	for (const p of problems.slice(0, 10)) { console.log(`  ✗ ${p.where}：${p.detail}`); bad++; }
	if (problems.length > 10) { console.log(`  …另有 ${problems.length - 10} 项`); bad += problems.length - 10; }

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 常量与字面量门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 常量与字面量门通过（时代字面量只在数据字段 · 伤害全走 Game.Damage · 自证通过）');
	}
};
