// L0.6 静默吞错门（对抗席评估 → #208A）：src/ 的 catch 必须带理由（中文注释），
// 空 catch / 无说明吞错即红。合理降级在 catch 内写明原因即可（现有 7 处均合规）。
// 豁免：行内或块内注释含汉字即视为已说明；确需无声吞错用 // silent-gate: ok <理由>。
import { readFileSync, readdirSync } from 'node:fs';

const files = readdirSync('src').filter((f) => f.endsWith('.twee')).map((f) => `src/${f}`);
const CJK = /\p{Script=Han}/u;
let bad = 0;
for (const f of files) {
	const text = readFileSync(f, 'utf8');
	const re = /catch\s*(?:\([^)]*\))?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
	for (const m of text.matchAll(re)) {
		const body = m[1];
		const line = text.slice(0, m.index).split('\n').length;
		const codeOnly = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
		if (codeOnly) continue; // 有实际处理逻辑的 catch 不算吞错
		const comment = (body.match(/\/\*([\s\S]*?)\*\//)?.[1] ?? '') + (body.match(/\/\/([^\n]*)/)?.[1] ?? '');
		const marker = /silent-gate:\s*ok/.test(m[0]);
		if (CJK.test(comment) || marker) continue;
		bad++;
		console.error(`✗ ${f}:${line} 空 catch 无理由注释——吞错需说明（写明降级原因），或整段删除该 try/catch`);
	}
}
if (bad) { console.error(`\n✗ 静默吞错门未过（${bad} 处）`); process.exit(1); }
console.log('✔ 静默吞错门通过（src/ 无无理由空 catch）');
