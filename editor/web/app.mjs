// `#761` P1 第一片：**DOM 胶水** ✓ —— 只做"取输入 ⇒ 调内核 ⇒ 显示"三件事 ✓。
// 判定与执行分离 ✓：真正的加载判定在 `./loader.mjs`（纯 ✓，已有单测 ✓）；本件**不含**任何判定逻辑 ✓，
// 所以它坏的结果只会是"显示不出来"，而不会产出**被判成结论的错数** ✓。
//
// ⚠️ **不许在这里长逻辑** ✗：凡是"什么算合法包／缺文件怎么办"这类问题，答案一律在内核（`lib/core/**` ✓）
// 或 `loader.mjs` ✓ —— 否则 WebUI 就成了第二个内核（正是 K6 那条机械门要防的 ✓）。

import { loadPackage, summaryLines, wantedPaths } from './loader.mjs';
import { diagnoseStory } from '../lib/core/diagnose.mjs';
import { diagnoseLines, renderDiagnosis } from './diagnose-view.mjs';
import { fingerprintOf } from '../lib/core/fingerprint.mjs';

const $ = (id) => document.getElementById(id);

const render = (text) => { $('out').textContent = text; };
const fail = (msg) => { $('err').textContent = msg; };

const boot = () => {
	const slug = $('slug').value.trim() || 'minimal-demo';
	$('wanted').textContent = wantedPaths(slug).join('、');
	$('pick').addEventListener('change', () => {
		fail('');
		const files = [...($('pick').files ?? [])];
		if (!files.length) { render('（没选到文件）'); return; }
		try {
			render(summaryLines(loadPackage({ slug, files })).join('\n'));
		} catch (e) {
			// 加载失败 ⇒ **原样报出** ✓（含内核的报文 ✓）—— 不许吞成"（空）" ✗
			render('（加载失败）');
			fail(String(e?.message ?? e));
		}
	});
	$('slug').addEventListener('change', boot);
};

if (typeof document !== 'undefined') boot();

// P2 第三片（`#761`）：**编辑即诊断** ✓ —— 载入包后立刻把诊断写到页面上（**不落盘也能看见** ✗ ✓）。
//  判定**复用** `lib/core/diagnose.mjs` ✓（页内不重写 ✗）；本函数只做"算事实 ⇒ 交给显示层" ✓。
export const showDiagnosis = ({ doc, pkg, declared = ['data(包)'], skipped = [] } = {}) => {
	const findings = diagnoseStory({ data: pkg.data });
	const packageSha = fingerprintOf(pkg.data);
	const injectedSha = fingerprintOf({ ...pkg.data, __declared: declared.join('+') });
	return renderDiagnosis({ doc, containerId: 'out', lines: diagnoseLines({ findings, declared, skipped, packageSha, injectedSha }) });
};
