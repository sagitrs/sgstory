/* 迷你测试框架：test 注册、assert 断言、__runTests 运行器。
 * 运行器由 unit.html 在按清单加载完全部 *.test.js 之后调用。
 * 断言风格：只测状态与异常（消息文本断言归 e2e）。
 */

window.test = (name, fn) => window.__tests.push({ name, fn });
window.__tests = [];

window.assert = {
	ok(cond, msg) { if (!cond) throw new Error(msg || '期望为真'); },
	eq(a, b, msg) {
		if (a !== b) {
			throw new Error(`${msg || '不相等'}：${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
		}
	},
	throws(fn, msg) {
		try { fn(); } catch { return; }
		throw new Error(msg || '期望抛出异常');
	},
	async rejects(promise, msg) {
		try { await promise; } catch { return; }
		throw new Error(msg || '期望 Promise 被拒绝');
	},
};

/* 每个用例运行前重置故事变量，用例之间互不污染 */
window.__resetState = () => { State.variables = {}; };

window.__runTests = async () => {
	const results = [];
	let pass = 0, fail = 0;
	for (const t of window.__tests) {
		window.__resetState();
		try {
			await t.fn();
			pass++; results.push(['pass', t.name]);
		} catch (e) {
			fail++; results.push(['fail', `${t.name} —— ${e.message}`]);
		}
	}
	window.__unitResult = { total: window.__tests.length, pass, fail, failures: results.filter(r => r[0] === 'fail').map(r => r[1]) };
	const $out = document.getElementById('out');
	for (const [st, name] of results) {
		$out.insertAdjacentHTML(
			'beforeend',
			`<div class="case ${st}">${st === 'pass' ? '✓' : '✗'} ${name}</div>`
		);
	}
	const $s = document.getElementById('summary');
	$s.innerHTML = fail
		? `<span class="fail">失败 ${fail} / ${window.__tests.length}</span>`
		: `<span class="pass">全部通过（${pass} / ${window.__tests.length}）</span>`;
	document.title = fail ? `FAIL ${fail}/${window.__tests.length}` : `PASS ${window.__tests.length}`;
};
