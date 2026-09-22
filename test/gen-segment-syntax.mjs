// `#1176`：生成件脚本段语法检查的读数。
//
// 成对口径：坏段必报且点名；同类但加括号的好段不报；另证该格确实依赖真解析器
// （换一个宽容的 parse 注入 ⇒ 同一段坏文本不报，说明格子不是自己判断的）。
import vm from 'node:vm';
import { scriptSyntaxProblems, scriptSegments } from '../editor/lib/core/segment-syntax.mjs';

const parse = (code) => { new vm.Script(code); };
let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`      ✓ ${label}`);
	else { bad++; console.log(`      ✗ ${label}${extra ? ' ⇒ ' + extra : ''}`); }
};

const seg = (name, tags, body) => `:: ${name} [${tags}]\n${body}\n`;
// 事故形态（2026-09-22）：箭头函数后直接跟对象字面量花括号，被解析成块语句，块内字符串标签非法。
const BAD = 'Object.assign((window.Sg.story ??= {}), {\n\trules: () => {"x": 1},\n});\n';
// 同类但把对象字面量包成表达式 ⇒ 合法。
const GOOD = 'Object.assign((window.Sg.story ??= {}), {\n\trules: () => ({"x": 1}),\n});\n';

// 一、只收脚本段
{
	const files = { 'a.twee': seg('S', 'script', GOOD) + seg('W', 'widget', BAD) + seg('P', '无标签', BAD).replace('[无标签]', '') };
	const segs = scriptSegments(files);
	ok('只收 [script] 段（widget 段不进面）', segs.length === 1 && segs[0].name === 'S', `实得 ${segs.map((s) => s.name).join(',')}`);
}

// 二、坏段必报且点名（文件名与段名都要出现）
{
	const p = scriptSyntaxProblems({ files: { '17-rules.twee': seg('StoryRules', 'script', BAD) }, parse });
	ok('坏段报 1 条', p.length === 1, `实得 ${p.length}`);
	ok('报文含文件名与段名', p[0]?.file === '17-rules.twee' && p[0]?.passage === 'StoryRules', JSON.stringify(p[0] ?? null));
	ok('报文带解析器原话', typeof p[0]?.why === 'string' && p[0].why.length > 0, String(p[0]?.why ?? ''));
}

// 三、同类好段不报（证明这一格咬的是解析结果，不是文本形状）
{
	const p = scriptSyntaxProblems({ files: { '17-rules.twee': seg('StoryRules', 'script', GOOD) }, parse });
	ok('加括号的同形好段不报', p.length === 0, JSON.stringify(p));
}

// 四、该格确实依赖注入的解析器（换宽容 parse ⇒ 同一坏文本不报）
{
	const lenient = () => {};
	const p = scriptSyntaxProblems({ files: { 'x.twee': seg('S', 'script', BAD) }, parse: lenient });
	ok('换宽容 parse ⇒ 同一坏文本不报（证格子靠真解析器）', p.length === 0, JSON.stringify(p));
}

// 五、多处坏段逐条点名，且空面为合法状态
{
	const files = { 'a.twee': seg('S1', 'script', BAD), 'b.twee': seg('S2', 'script', BAD) + seg('S3', 'script', GOOD) };
	const p = scriptSyntaxProblems({ files, parse });
	ok('两处坏段 ⇒ 两条（逐条点名，不早退）', p.length === 2, `实得 ${p.length}`);
	ok('空面 ⇒ 0 条', scriptSyntaxProblems({ files: {}, parse }).length === 0);
	ok('无人认领的文件名也照样点名', p.every((x) => typeof x.file === 'string' && x.file.length > 0));
}

console.log(bad ? `\n✗ 生成段语法检查自证未通过（${bad} 项）` : '\n✔ 生成段语法检查自证通过（成对坏段必报并点名；好段不报；依赖真解析器）');
process.exit(bad ? 1 : 0);
