// `#1033`：编辑器 WebUI 的**启动入口**（零依赖 node 静态服务）—— `npm run editor`。
//
// 为什么需要它 ✗（票面事实 ✓）：`editor/web/index.html` 用 `<script type="module">` ⇒ **file:// 双击会被浏览器拦** ✗
// ⇒ 必须经 **http** ✓；而 `npm run serve` 服务的是 `dist/`（**游戏产物** ✓）、`build.mjs` **不**把 `editor/web` 放进 `dist` ✓
// ⇒ 仓里**没有**任何一条能打开编辑器的路径 ✓。
//
// ⚠️ **根必须是「仓根」** ✗（本片最要紧的一条 ✓）：`editor/web/app.mjs` import 的是
// `../lib/core/*.mjs`（**跨目录** ✓）⇒ 只服务 `editor/web/` 会**当场断 import** ✓ —— 那是"看着像能开"而不是"能开" ✗。
//
// 用法 ✓：`npm run editor`（默认 8100，占用则**顺延**并打印实际端口 ✓）
//         `node scripts/serve-editor.mjs --smoke`    # 起服务并自问自答（供测试件驱动 ✓）
//         `node scripts/serve-editor.mjs --selftest` # 纯函数判据（MIME / 路径解析 ✓）

import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

/** MIME 表（**显式** ✓ —— 不靠平台表：`.mjs` 落到 `application/octet-stream` 会让浏览器**拒执行模块** ✗，
 *  页面就变成"打开了但什么都没发生" ✓ —— 这正是本票要防的那一类"看着像能开" ✗）。 */
export const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.twee': 'text/plain; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
};

/** 纯函数 ✓：扩展名 ⇒ Content-Type（**未登记的扩展名不冒充脚本** ✗ ⇒ `application/octet-stream` ✓）。 */
export const contentType = (path) => MIME[extname(String(path)).toLowerCase()] ?? 'application/octet-stream';

/** 纯函数 ✓：把 URL 路径解析到 `root` 内的**绝对路径**；越界（`..`／绝对路径逃逸）⇒ `null` ✗（调用方回 403 ✓）。
 *  ⚠️ 不能只 `join` 完就信任 ✗：`/../package.json` 会解析到根之外 ⇒ 必须**再核一次前缀** ✓。 */
export const resolveInRoot = (root, urlPath) => {
	let p;
	try {
		p = decodeURIComponent(String(urlPath ?? '/').split('?')[0].split('#')[0]);
	} catch {
		return null;                                   // 畸形百分号编码 ⇒ 拒 ✗
	}
	if (p.includes('\0')) return null;                 // NUL 截断 ⇒ 拒 ✗
	const abs = normalize(join(root, p));
	const rootN = normalize(root);
	const base = rootN + sep;
	if (abs === rootN || abs === base) return rootN;                   // 根自身 ⇒ 恰好是 root（`join(root,'/')` 会带尾斜杠 ⇒ `base` 也归一到 root ✓）
	return abs.startsWith(base) ? abs : null;                              // 越界 ⇒ null ✓
};

const serveFile = (res, abs) => {
	try {
		if (!existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404).end('404'); return; }
		const body = readFileSync(abs);
		res.writeHead(200, { 'content-type': contentType(abs), 'cache-control': 'no-store' });
		res.end(body);
	} catch (e) {
		res.writeHead(500).end(`500 ${String(e?.message ?? e)}`);
	}
};

/** 起服务 ✓：`port = 0` ⇒ 由系统分配（测试用 ✓）；占用则**顺延**（默认最多试 10 个 ✓）。
 *  返回 `{ server, port, url }`；`url` 直指**编辑器页** ✓。 */
export const startServer = ({ root = ROOT, port = 8100, tries = 10 } = {}) => new Promise((res, rej) => {
	const server = createServer((req, r) => {
		const abs = resolveInRoot(root, req.url);
		if (abs === null) { r.writeHead(403).end('403 越界'); return; }
		if (abs === normalize(root) || (existsSync(abs) && statSync(abs).isDirectory())) {
			serveFile(r, join(abs, 'index.html'));     // 目录 ⇒ index.html（`/` 与 `/editor/web/` 都管 ✓）
			return;
		}
		serveFile(r, abs);
	});
	server.on('error', (e) => {
		if (e?.code === 'EADDRINUSE' && tries > 1) { res(startServer({ root, port: port + 1, tries: tries - 1 })); return; }
		rej(e);
	});
	server.listen(port, '127.0.0.1', () => {
		const p = server.address().port;
		res({ server, port: p, url: `http://127.0.0.1:${p}/editor/web/index.html` });
	});
});

// ⚠️ **只有以本文件为入口时才跑 CLI 分支** ✗：否则 `import` 它会**直接起服务** ⇒ 测试件一 import 就挂住 ✓
//   （我实测踩到：`node --input-type=module -e "await import('.../serve-editor.mjs')"` ⇒ 超时 ✓）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const SELFTEST = process.argv.includes('--selftest');
if (isMain && SELFTEST) {
	let bad = 0;
	const t = (m, ok) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${m}`); };
	console.log('══ 编辑器启动入口 · 自证 ══');
	// ① MIME（**能假**：`.mjs` 落到 octet-stream 就是本票要防的"看着像能开" ✗）
	t('`.mjs` ⇒ `text/javascript` ✓（**不是** octet-stream ✗）', /^text\/javascript/.test(contentType('app.mjs')));
	t('`.html` ⇒ `text/html` ✓', /^text\/html/.test(contentType('index.html')));
	t('`.json` ⇒ `application/json` ✓', /^application\/json/.test(contentType('00-story.json')));
	t('**未登记**扩展名 ⇒ octet-stream ✓（不冒充脚本 ✗）', contentType('x.bin') === 'application/octet-stream');
	t('大小写不敏感 ⇒ `.MJS` 同样 ✓', /^text\/javascript/.test(contentType('A.MJS')));
	// ② 路径解析（**能假**：越界必须被拒 ✓）
	t('正常相对路径 ⇒ 落在 root 内 ✓', resolveInRoot('/r', '/editor/web/index.html') === resolve('/r/editor/web/index.html'));
	t('🔴 **越界**（`/../package.json`）⇒ null ✗', resolveInRoot('/r', '/../package.json') === null);
	t('🔴 编码越界（`%2e%2e%2f`）⇒ null ✗', resolveInRoot('/r', '/%2e%2e%2fpackage.json') === null);
	t('🔴 NUL 截断 ⇒ null ✗', resolveInRoot('/r', '/a\0b') === null);
	t('根自身 ⇒ 允许（目录 ⇒ index.html ✓）', resolveInRoot('/r', '/') === resolve('/r'));
	if (bad) { console.error(`\n✗ 自证失败（${bad} 项）`); process.exit(1); }
	console.log('✔ 自证通过（MIME 五格 ＋ 路径五格：越界那半都真的会拒 ✓）');
	process.exit(0);
}

if (isMain && process.argv.includes('--smoke')) {
	// 自问自答 ✓：起服务 ⇒ 拉三个 URL ＋ 一个越界 ⇒ 打印 JSON（由测试件断言 ✓）。
	const { server, url } = await startServer({ port: 0 });
	const get = async (u) => {
		const r = await fetch(u);
		const text = await r.text();
		return { status: r.status, type: r.headers.get('content-type') ?? '', has: (s) => text.includes(s) };
	};
	const out = {
		url,
		index: await get(`${url}`),
		app: await get(url.replace('index.html', 'app.mjs')),
		crossDir: await get(url.replace('editor/web/index.html', 'editor/lib/core/story.mjs')),
		// ⚠️ 越界必须用**编码形** ✗：`/../package.json` 会被 `fetch` 在客户端归一掉 ⇒ 服务端看到的是 `/package.json`（**根内** ✓）
		//   ⇒ 那一格会「恒 200」＝假读数 ✓（我第一版就踩了 ✓）。编码形不会被客户端归一 ⇒ 真到服务端 ✓。
		traversal: await get(url.replace('editor/web/index.html', '%2e%2e%2fpackage.json')),
	};
	out.ok = out.index.status === 200 && out.app.status === 200 && /^text\/javascript/.test(out.app.type)
		&& out.crossDir.status === 200 && [403, 404].includes(out.traversal.status);
	server.close();
	console.log(JSON.stringify({ url: out.url, ok: out.ok, index: out.index.status, app: [out.app.status, out.app.type], crossDir: out.crossDir.status, traversal: out.traversal.status }));
	process.exit(out.ok ? 0 : 1);
}

if (isMain) {
// 默认路：起服务并把 URL 打出来（含"还缺什么"的一句，免得被读成"能做出故事" ✗）
const { url, port } = await startServer({ port: Number(process.env.PORT ?? 8100) });
console.log(`✔ 编辑器已起：${url}`);
console.log(`   根＝仓根（${ROOT}）—— editor/web/app.mjs 会跨目录 import ../lib/core/**，所以**不能**只服务 editor/web ✗`);
console.log(`   ⚠️ 现状：只读载入故事包 ＋ 页内新建（**只落内存**）＋ 四块诊断视图；**写盘**见 #1034 ✗`);
console.log(`   （Ctrl-C 停止；端口默认 ${port}，占用会自动顺延 ✓）`);
}
