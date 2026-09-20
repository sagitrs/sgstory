// `#1033`：编辑器启动入口的门 —— 量三件**用户可感**的事 ✓（不量实现细节 ✗）：
//   ① **能开** ✗：`npm run editor` 那条路（`scripts/serve-editor.mjs`）起来的服务，**编辑器页**能取到（200 ✓）；
//   ② **开起来是"活的"** ✗（本票的核心 ✓）：`app.mjs` 必须按 **`text/javascript`** 交付（否则浏览器**拒执行模块** ⇒
//      "打开了但什么都没发生" ＝ **看着像能开** ✗）；且它跨目录 import 的 `../lib/core/**` 必须**也取得到** ✓
//      （⚠️ 这一格钉住的是"**静态服务的根必须是仓根**" ✓ —— 只服务 `editor/web/` 会在这里红 ✓）；
//   ③ **入口可发现** ✗：`package.json` 有 `editor` 脚本 ✓、`index.html` 里**file:// 守卫**与"需 http"的自述都在 ✓
//      （＝本票的"指路"那半 ✓ —— 免得下次又出现"操作者在网页版找不到入口" ✓）。
//
// 用法：`node test/serve-editor.mjs`（真起服务，**端口 0** ⇒ 不占 8100 ✓）｜`--selftest`（纯函数正反例 ✓）
// ⚠️ 越界那格必须用**编码形** ✗：`/../x` 会被 `fetch` 在客户端归一 ⇒ 服务端根本看不见（我第一版踩过 ✓）。

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contentType, resolveInRoot, startServer } from '../scripts/serve-editor.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) bad++; };

if (process.argv.includes('--selftest')) {
	console.log('══ 编辑器入口 · 自证（纯函数，不起服务）══');
	ok(/^text\/javascript/.test(contentType('app.mjs')), '`.mjs` ⇒ `text/javascript`（**不是** octet-stream ✗ —— 否则浏览器拒执行模块 ✓）');
	ok(contentType('x.bin') === 'application/octet-stream', '未登记扩展名 ⇒ octet-stream ✓（不冒充脚本 ✓）');
	ok(resolveInRoot('/r', '/editor/web/index.html') === '/r/editor/web/index.html', '正常相对路径 ⇒ 落在 root 内 ✓');
	ok(resolveInRoot('/r', '/%2e%2e%2fpackage.json') === null, '🔴 **编码越界** ⇒ 拒 ✓');
	ok(resolveInRoot('/r', '/../package.json') === null, '🔴 明文越界 ⇒ 拒 ✓');
	ok(resolveInRoot('/r', '/') === '/r', '根自身 ⇒ 归一到 root ✓（`join(root,"/")` 的尾斜杠要吃掉 ✓）');
	console.log(bad ? `\n✗ 自证失败 ${bad} 项` : '\n✔ 自证通过（MIME ＋ 路径解析，越界那半真的会拒 ✓）');
	process.exit(bad ? 1 : 0);
}

// ── 默认路：真起服务（端口 0）⇒ 四格 ＋ 两处"指路"面 ──────────────────────────
console.log('══ 编辑器入口门（真起服务 · 端口 0）══');
{
	const { server, port } = await startServer({ port: 0 });
	const get = async (p) => {
		const r = await fetch(`http://127.0.0.1:${port}${p}`);
		return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
	};
	try {
		const index = await get('/editor/web/index.html');
		ok(index.status === 200, `编辑器页可取 ✓（rc=${index.status}）`);
		const app = await get('/editor/web/app.mjs');
		ok(app.status === 200 && /^text\/javascript/.test(app.type),
			`**app.mjs 按 text/javascript 交付** ✓（rc=${app.status} · type=${app.type}）—— 落到 octet-stream 就是"看着像能开" ✗`);
		const cross = await get('/editor/lib/core/story.mjs');
		ok(cross.status === 200,
			`**跨目录 import 取得到** ✓（rc=${cross.status}）—— ⚠️ 这一格钉住"**服务根必须是仓根**" ✗（只服务 editor/web 会 404 ✓）`);
		const trav = await get('/%2e%2e%2fpackage.json');
		ok([403, 404].includes(trav.status), `越界路径被拒 ✓（rc=${trav.status}）`);
	} finally { server.close(); }
	// 指路面（本票"指路"那半 ✓）：入口被发现得到 ＋ 页面自述与实现一致 ✓
	const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8'));
	ok(typeof pkg.scripts?.editor === 'string' && /serve-editor\.mjs/.test(pkg.scripts.editor),
		'`package.json` 有 `editor` 脚本且指向 `scripts/serve-editor.mjs` ✓（入口可发现 ✓）');
	const html = readFileSync(`${ROOT}/editor/web/index.html`, 'utf8');
	ok(/location\.protocol === 'file:'/.test(html), '页面带 **file:// 守卫** ✓（用 file:// 打开时当场打出正确命令 ✓）');
	ok(/npm run editor/.test(html), '页面自述**指向正确开法**（`npm run editor`）✓（原自述"不经服务端"已改准 ✓）');
}
console.log(bad ? `\n✗ 编辑器入口门未过 ${bad} 项` : '\n✔ 编辑器入口：能开（200）＋ 开起来是活的（模块 MIME ＋ 跨目录可达）＋ 入口可发现（npm 脚本 ＋ file:// 守卫）✓');
process.exit(bad ? 1 : 0);
