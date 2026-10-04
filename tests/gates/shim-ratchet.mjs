#!/usr/bin/env node
/* 直构棘轮门（`#1750` ②「单元切口绕过接缝」）—— ★**新用例不得再绕注册面**。
 *
 * ## 病灶（本条要治的）
 *   `#1750` 根因②：「5E 用例全走 `new DND5E.X()` **直构**（**绕注册表**，因此 B-2 不可见）」——
 *   单测**直接 new** 出一件，就**跳过了注册面**（`defItem`／`registerItem` 那条路）⇒
 *   ★「注册面静默遮蔽」一类的缺陷（`#1804` 件一那条病灶）**在单测层根本表达不出来**，
 *   只能靠真机或事后发现 ✓。★本门**不要求**把既有用例改掉（那是另一件事），而是**把现状钉住**：
 *
 * ## 判据（机械可核 · 双向棘轮）
 *   扫 `tests/unit/**` 的 `*.test.js`（含子目录），逐处找**直构形** `new DND5E.<X>(`：
 *     ① 出现位置**不在**本门台账（`tests/gates/shim-ratchet.json`）的 `accepted` 里 ⇒ **红**（逐个**具名** file:line）
 *     ② 台账里登记的位置**在现码里找不到了** ⇒ **红**（★过期登记：位置没了却还挂着 ⇒ 说明码变了而册没跟）
 *   ③ 台账项缺 `reason`／`ticket` ⇒ **红**（说不出「当初为何留」即视为过期）
 * ⇒ ★**双向**：新出现的拦、消失的也拦 ⇒ 台账**始终等于现状**，✗ 不会腐成一张空文 ✓。
 *   ★登记**不是豁免**：它的意思是「**这一处已知、且被接受**」；每项都要写得出理由与票号 ✓。
 *
 * ## 与「接缝」的关系（本门的射程边界）
 *   本门只拦**一族可机械识别的**直构（`new DND5E.`）——★它是 `#1750` ② 点名的那一族 ✓。
 *   其余「绕接缝」的形（例如绕过 `harness` 的自己造环境）**本门不假装覆盖** ✓：
 *   那些要在**真面**（`e2e-drive`／宿主臂／真 DOM 臂）上判 ✓，判据不在这里假装 ✓。
 *
 * 用法：node tests/gates/shim-ratchet.mjs [--root <dir>] [--selftest]
 *      `--root` 指到仓根（缺省＝本档上两级）；`--selftest` 自证「会红也会绿」。
 * 退出码：有红 ⇒ 1；全洁净 ⇒ 0
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(arg('--root') ?? DEFAULT_ROOT);
const SELFTEST = argv.includes('--selftest');

/** 本门要拦的直构形：`new DND5E.<X>(`（✗ 含 `new DND5E.X.Y(` 一类嵌套）。 */
const 直构形 = /new\s+DND5E\.[A-Za-z_$][\w$]*\s*\(/;

const 台账路径 = path.join(ROOT, 'tests', 'gates', 'shim-ratchet.json');

/** 递归收集 `tests/unit/**\/*.test.js`。 */
function 收档(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) 收档(p, out);
		else if (e.isFile() && e.name.endsWith('.test.js')) out.push(p);
	}
	return out;
}

/** 扫一批档，返回命中的 `相对路径:行号` 列表（行号 1 起）。 */
function 扫直构(根, 档们) {
	const 命中 = [];
	for (const f of 档们) {
		let s;
		try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
		s.split('\n').forEach((line, i) => {
			if (直构形.test(line)) 命中.push(`${path.relative(根, f)}:${i + 1}`);
		});
	}
	return 命中.sort();
}

function 跑检查(根, 静默 = false) {
	const 红 = [];
	const 册 = JSON.parse(fs.readFileSync(path.join(根, 'tests', 'gates', 'shim-ratchet.json'), 'utf8'));
	const accepted = new Set(册.accepted ?? []);

	// ③a 台账项须能自证来历
	for (const k of Object.keys(册.entries ?? {})) {
		const e = 册.entries[k];
		if (!e?.reason || !e?.ticket) 红.push(`台账项 \`${k}\` 缺 reason／ticket ⇒ 说不出「当初为何留」即视为过期`);
	}

	const 现 = 扫直构(根, 收档(path.join(根, 'tests', 'unit')));
	const 现集 = new Set(现);
	// ① 新出现的直构 ⇒ 红（具名）
	for (const loc of 现) if (!accepted.has(loc)) 红.push(`★新增直构（绕注册面）：\`${loc}\` —— 请改走注册面，或在 \`shim-ratchet.json\` 登记理由与票号`);
	// ② 台账里的位置在现码里没了 ⇒ 红（过期登记）
	for (const loc of accepted) if (!现集.has(loc)) 红.push(`★过期登记：\`${loc}\` 在现码中已找不到（码变了而册没跟）`);

	if (!静默) {
		console.log(`  直构形 \`new DND5E.<X>(\` 现命中 **${现.length}** 处｜台账 accepted **${accepted.size}** 处`);
		for (const l of 红) console.log(`  ✗ ${l}`);
		if (红.length === 0) console.log('  ✓ 台账与现状一致（新出现的会红、消失的也会红）');
	}
	return 红;
}

if (SELFTEST) {
	// ── 自证「会红也会绿」：临时仓里跑三态 ──
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shim-ratchet-'));
	fs.mkdirSync(path.join(tmp, 'tests', 'unit', 'x'), { recursive: true });
	fs.mkdirSync(path.join(tmp, 'tests', 'gates'), { recursive: true });
	const 写册 = (accepted) => fs.writeFileSync(path.join(tmp, 'tests', 'gates', 'shim-ratchet.json'),
		JSON.stringify({ accepted, entries: Object.fromEntries(accepted.map((a) => [a, { reason: '自证用', ticket: '#1750' }])) }, null, 2));
	const 写用例 = (body) => fs.writeFileSync(path.join(tmp, 'tests', 'unit', 'x', 'a.test.js'), body);
	let 坏 = 0;
	const 判 = (名, cond, 实得) => { if (cond) console.log(`  ✓ ${名}`); else { console.log(`  ✗ ${名}（实得：${实得}）`); 坏++; } };

	// 绿：现状与台账一致
	写用例("const a = new DND5E.Creature();\n");
	写册(['tests/unit/x/a.test.js:1']);
	判('自证① 台账=现状 ⇒ 绿（无红）', 跑检查(tmp, true).length === 0, JSON.stringify(跑检查(tmp, true)));

	// 红：新增一处直构（台账没登记）
	写用例("const a = new DND5E.Creature();\nconst b = new DND5E.Weapon();\n");
	判('自证② 新增直构 ⇒ 红（具名 file:line）', 跑检查(tmp, true).some((m) => m.includes('a.test.js:2')), JSON.stringify(跑检查(tmp, true)));

	// 红：过期登记（位置消失而册没跟）
	写用例("const a = 1;\n");
	判('自证③ 过期登记 ⇒ 红', 跑检查(tmp, true).some((m) => m.includes('过期登记')), JSON.stringify(跑检查(tmp, true)));

	// 红：台账项缺 reason／ticket
	写用例("const a = new DND5E.Creature();\n");
	fs.writeFileSync(path.join(tmp, 'tests', 'gates', 'shim-ratchet.json'),
		JSON.stringify({ accepted: ['tests/unit/x/a.test.js:1'], entries: { 'tests/unit/x/a.test.js:1': {} } }, null, 2));
	判('自证④ 缺 reason/ticket ⇒ 红', 跑检查(tmp, true).some((m) => m.includes('缺 reason')), JSON.stringify(跑检查(tmp, true)));

	fs.rmSync(tmp, { recursive: true, force: true });
	console.log(`  自证：${4 - 坏}/4 如期`);
	process.exit(坏 === 0 ? 0 : 1);
}

const 红 = 跑检查(ROOT);
process.exit(红.length === 0 ? 0 : 1);
