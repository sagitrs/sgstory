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

/* 每个用例运行前重置故事变量与随机源，用例之间互不污染 */
/* 输出捕获的接线点：本文件在被测物（dist/bundle.js）之后加载，此时
 * `Object.prototype.perform` 已由引擎定义，宿主仿真可以接住它的输出。
 * 接线失败即抛错——静默不接线会让「按段落归档的输出」永远为空，
 * 用例看到的将是「没有输出」而不是「接线断了」。 */
if (window.__host?.install) window.__host.install();

window.__resetState = () => {
	/* ★经**宿主仿真的 reset**（✗ `State.variables = {}` 直接赋值）：
	 *   仿真把「故事变量」做成**闭包绑定**（`save.make()` 序列化的是闭包变量），
	 *   直接给 `state.variables` 赋新对象只改属性、**不改闭包** ⇒ 在「赋值 → host.reset()」
	 *   两行之间存在**两处真值窗口**（`#1820` D 席 NIT-4 实测）。此处一行等价且无窗口。 */
	if (window.__host?.state?.reset) window.__host.state.reset();
	else State.variables = {};   // 宿主未装载时的兜底（旧行为）
	// 随机源一并复位（#1706）：注入的固定序列/函数不得跨用例残留。
	// 本轮在 bundle 加载后调用（setup.RPG 已存在）；防御性取可选链，与加载序解耦。
	if (window.setup?.RPG?.rng?.reset) window.setup.RPG.rng.reset();
	// 宿主仿真一并复位：段落输出归档、导航记录、故事变量绑定。
	if (window.__host?.reset) window.__host.reset();
};

window.__runTests = async () => {
	const results = [];
	let pass = 0, fail = 0;
	for (const t of window.__tests) {
		/* ★`sgstory#1953`：**归属打点**（环境开关式 ⇒ 默认输出一字不变 ✓）。
		 *   用途：装载/运行期偶发讯息（如 rng 序列耗尽）发生时，一眼看出**是哪个格**在跑。 */
		if (window.__TRACE) console.log(`▶ ${t.name}`);
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
