// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['echoes']。校验：npm run audit:golden。
export const flag = 'echoes';
export const flags = ["echoes"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪b D4 世界活性（#38）：回声锚检 + set-never-echoed 覆盖门 ──
// #267：叙事态分级——每个被写入的旗标必须落一桶（echo/mechanic/ending/codex/provenance/engine）
// 推导优先，声明兜底：导出不了桶 → 红；声明 provenance/engine 却仍有叙事条件消费 → 错标红

// #266：锚句「条件归属」扫描——从段首到锚点走一遍条件栈，取出锚点处生效的 if 条件
//（支持 if/elseif/else/switch 与 link 体；`not` 归一化为 negated 标记，else 分支取反）
function conditionOwner(src, anchor) {
	const idx = src.indexOf(anchor);
	if (idx < 0) return { conds: [], inLink: false };
	const re = /<<(\/?if|\/?link|elseif|else|\/?switch)\b[^>]*>>/g;
	const stack = [];
	const norm = (tok) => {
		const m = tok.match(/<<if\s+not\s+([\s\S]*?)>>/);
		return m ? { text: m[1], negated: true } : { text: tok.replace(/^<<(?:if|elseif|switch)\s*/, '').replace(/>>$/, ''), negated: false };
	};
	let m;
	while ((m = re.exec(src)) && m.index < idx) {
		const tok = m[1];
		if (tok === '/if' || tok === '/switch' || tok === '/link') { stack.pop(); continue; }
		if (tok === 'if' || tok === 'switch') { stack.push({ kind: 'cond', cond: norm(m[0]) }); continue; }
		if (tok === 'elseif') { const top = stack[stack.length - 1]; if (top?.kind === 'cond') top.cond = norm(m[0]); continue; }
		if (tok === 'else') { const top = stack[stack.length - 1]; if (top?.kind === 'cond') top.cond = { text: top.cond.text, negated: !top.cond.negated }; continue; }
		if (tok === 'link') stack.push({ kind: 'link' });
	}
	return {
		conds: stack.filter((s) => s.kind === 'cond' && s.cond).map((s) => ({ ...s.cond, raw: '' })),
		inLink: stack.some((s) => s.kind === 'link'),
	};
}
// 登记 cause → 期望条件正则（flag → world/ev.X；token → inv["X"]；towerFlag → tower.X）
function causeReg(cause) {
	if (!cause) return /$^/;
	if (cause.token) return new RegExp(`inv\\s*(?:\\.|\\[)?["']?${cause.token}`);
	if (cause.towerFlag) return new RegExp(`tower\\.${cause.towerFlag}`);
	if (cause.gear) return new RegExp(`gear[^]*${cause.gear}`);
	return new RegExp(`(?:world|ev)\\s*(?:\\.|\\[)["']?${cause.flag}`);
}
if (wantAll || arg('echoes')) {
	console.log('\n══ ⓪b 世界活性回声（D4/#38）——行为×回声，锚句须在位 ══');
	let bad = 0;
	const kinds = {};
	for (const e of Game.Echoes.list) {
		kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
		for (const site of e.echo) {
			const src = passageSrc.get(site.p);
			if (src === undefined) { console.log(`  ✗ ${e.id}：位点段落「${site.p}」不存在`); bad++; continue; }
			if (!src.includes(site.anchor)) { console.log(`  ✗ ${e.id}：「${site.p}」锚句丢失「${site.anchor}」`); bad++; continue; }
			// #266 条件归属：锚句必须落在以登记 cause（或显式 gate）为条件的块内，且不在 <<link>> 体内
			const own = conditionOwner(src, site.anchor);
			const expect = site.gate ? new RegExp(site.gate) : causeReg(e.cause);
			if (own.inLink && !site.inLinkOk) {
				console.log(`  ✗ ${e.id}：「${site.p}」锚句在 <<link>> 体内（点击态文本——入场看不到，且多随 goto 重绘消失）`); bad++; continue;
			}
			if (!own.conds.length) {
				console.log(`  ✗ ${e.id}：「${site.p}」锚句无条件门（假回声——任何人都看得到，与 cause 无因果）`); bad++; continue;
			}
			if (!own.conds.some((c) => expect.test(c.text) && (!c.negated || site.negate))) {
				console.log(`  ✗ ${e.id}：「${site.p}」条件归属不符——登记 cause ${JSON.stringify(e.cause)}，实际最内层门：${own.conds.slice(-2).map((c) => (c.negated ? '!' : '') + c.text).join(' / ')}`); bad++; continue;
			}
			console.log(`  ✓ ${e.id}（${e.kind}）→ ${site.p}`);
		}
	}
	for (const r of Game.Echoes.revisit) {
		const src = passageSrc.get(r.p);
		if (src === undefined || !src.includes(r.anchor)) { console.log(`  ✗ revisit ${r.flag ?? r.inv}：「${r.p}」锚句丢失「${r.anchor}」`); bad++; continue; }
		const own = conditionOwner(src, r.anchor);
		const expect = r.gate ? new RegExp(r.gate) : causeReg(r.inv ? { token: r.inv } : { flag: r.flag });
		if (!own.conds.length || !own.conds.some((c) => expect.test(c.text) && (!c.negated || r.negate))) {
			console.log(`  ✗ revisit ${r.flag ?? r.inv}：「${r.p}」条件归属不符（实际最内层门：${own.conds.slice(-2).map((c) => (c.negated ? '!' : '') + c.text).join(' / ') || '无'}）`); bad++;
		}
	}
	console.log(`  （revisit 留痕 ${Game.Echoes.revisit.length} 处全锚定；分类：${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' ')}）`);
	// #267：旗标分级由 ⓪q 选择后果门统一裁决（回声门只管回声本身）
	const _cls = classifyNarrativeState();
	if (_cls.problems.length) console.log(`  （另有 ${_cls.problems.length} 项旗标分级问题——见 ⓪q 选择后果门）`);

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D4 回声门：${bad} 项失锚/未覆盖`); process.exit(1); }
		console.log('\n✔ D4 回声门通过（全回声锚句在条件门内；旗标分级见 ⓪q）');
	}
}
};
