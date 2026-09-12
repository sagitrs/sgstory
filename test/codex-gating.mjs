// 设定集门（#406 口吻 / #408 结局剧透门控）：设定集是**世界内读物**，且**不揭未走到过的做法**。
//
// #406 实锤：`设定集·三律` 里写着 canon §33 的**设计禁令**（「凡人传承…」）与**主题句**
//   （「唯道具传承——人记不住的由道具记住；道具会老，所以真相也会老」），读起来像设计说明。
// #408 实锤：`设定集·结局` 在建卡后即可读，直接写出真结局与普通结局的**做法**
//   （「先让它虚弱到无法打断施法…再送入虚空」）——等于剧透通关答案。
//
// 本门：① 三律页不得出现作者层词；② 结局页在**没走到过**时不得出现做法细节，走到过才给。
// 用法：node test/codex-gating.mjs
import { newGame } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const s = await newGame({ random: 0.5, session: { wait: 140 } });
const w = s.w;
const text = () => (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, '');

// ① #406：三律页是读物口吻（无作者层词），且三条律目都在
w.SugarCube.Engine.play('设定集·三律'); await sleep(200);
{
	const t = text();
	const author = ['设计', '机制', '主题', '玩家', '规则', '设定书', '禁令'].filter((k) => t.includes(k));
	if (author.length) { bad++; console.error(`  ✗ #406：三律页出现作者层词：${author.join('、')}`); }
	else console.log('  ✓ #406：三律页是读物口吻（无作者层词）');
	for (const k of ['凡人传承', '唯龙长寿', '物替人记']) {
		if (!t.includes(k)) { bad++; console.error(`  ✗ #406：三律页缺条目「${k}」`); }
	}
}

// ② #408：清掉结局记录 → 不得出现做法；写入记录 → 才给
w.eval("window.localStorage.removeItem(window.SG_CODEX_KEY ?? 'sgstory-codex');");
w.SugarCube.Engine.play('设定集·结局'); await sleep(200);
{
	const t = text();
	const spoiler = ['无法打断施法', '送入虚空：它被按下去', '杖尖指的方向'];
	const hit = spoiler.filter((k) => t.includes(k));
	if (hit.length) { bad++; console.error(`  ✗ #408：未走到过就写出了做法（${hit.join('、')}）`); }
	else console.log('  ✓ #408：未走到过时结局页不揭做法');
	if (!t.includes('还没走到')) { bad++; console.error('  ✗ #408：未走到过时缺少占位提示'); }
	else console.log('  ✓ #408：未走到过时给占位提示');
}
w.eval(`(function(){const C=window.Sg.Codex;C.recordEnding('发送归位'.replace('发送','送星'), 'final');C.recordEnding('送入虚空','final');})()`);
w.SugarCube.Engine.play('设定集·结局'); await sleep(200);
{
	const t = text();
	if (!t.includes('杖尖指的方向')) { bad++; console.error('  ✗ #408：走到过真结局后仍不显示该条'); }
	else console.log('  ✓ #408：走到过之后才显示');
	if (t.includes('还没走到')) console.log('  （注：仍有未解锁条目的占位，符合预期）');
}
w.close?.();
if (bad) { console.error(`\n✗ 设定集门：${bad} 项`); process.exit(1); }
console.log('✔ 设定集：读物口吻 ＋ 结局按走到过与否门控');
