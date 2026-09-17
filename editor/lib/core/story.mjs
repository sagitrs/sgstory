// `#794` 内核抽取 · **core 层**：故事包 I/O —— **唯一写路**。
//
// 约束：**浏览器安全** ✓ ⇒ 本模块不 import 任何宿主能力（`node:fs`／`fetch`／…) ✗；
// 读写一律经**注入的 io** ✓（CLI 用 `editor/lib/host/fs.mjs`；WebUI 用 fetch／iframe 侧实现）。
//
// 为什么"唯一写路"必须住 core：UI 的保存与 CLI 的 `story save` 必须调**同一个**函数 ✓ ——
// 两条写路必然漂移 ✗（这正是 K6 ② ／ L1（原语级）／ L2（语义级）要机械挡住的那类）。
//
// 形状（口径见 `#794` 评论 `5707212566` / `5707223391`）：
//   packageFiles(slug)                    —— 纯粹的"包编目"（不碰磁盘 ✓）
//   readStoryPackage({ slug, io })        —— io: { readText, exists }
//   writeStoryPackage({ slug, data, io }) —— io: { writeText, mkdirp }；**故事数据的唯一写路**
//   selftestStory()                       —— 自证：用**假 io** 驱动（含"拒绝型 io"＝写侧哨兵 ✓）

/** 数据面文件（与 `data/` 下的产物同名；`rules.json` 可缺 ⇒ `null`）。 */
export const DATA_FILES = ['tables.json', 'contract.json', 'rules.json'];

/** 纯粹的"包编目"：一个故事包由哪些文件构成（**不碰磁盘** ✓）。 */
export const packageFiles = (slug) => ({
	manifest: `stories/${slug}/00-story.json`,
	dataFile: (name) => `stories/${slug}/data/${name}`,
	// **生成物 twee 口**（与 `dataFile` 同级 ✓）：产物是"包内文件"的另一类 ✓ ⇒ 走**同一条路** ✓，
	// 而不给它们开旁路 ✗（否则"唯一写路"又变成"两条路"了 ✓）。
	tweeFile: (name) => `stories/${slug}/${name}`,
	data: [...DATA_FILES],
});

const need = (io, cap, who) => {
	if (typeof io?.[cap] !== 'function') throw new Error(`${who}：宿主未注入 \`io.${cap}\`（故事包 I/O 只经注入的能力 ⇒ 缺了就点名，不静默跳过 ✗）`);
};

/** 读一个故事包：清单（`00-story.json`）＋ `data/` 下存在的数据文件。缺数据文件 ⇒ `null`（**与既有工具同义** ✓）。 */
export const readStoryPackage = ({ slug, io } = {}) => {
	need(io, 'readText', 'readStoryPackage');
	const { manifest, dataFile } = packageFiles(slug);
	const meta = JSON.parse(io.readText(manifest));
	const data = {};
	for (const name of DATA_FILES) {
		const p = dataFile(name);
		const there = typeof io.exists === 'function' ? io.exists(p) : true;      // 没给 exists ⇒ 直接试读（读失败按"缺"处理 ✓）
		if (!there) { data[name] = null; continue; }
		try { data[name] = JSON.parse(io.readText(p)); } catch { data[name] = null; }
	}
	return { slug, meta, data };
};

/** **故事数据的唯一写路**：所有写者（`extract-story` / `compile-story` / `classify-contract --propose` / 未来的 UI 保存）都走它 ✓。
 *  `data` ＝ `data/*.json` 类（键是文件名 ✓）；`twee` ＝ 生成物类（键是包内文件名 ✓）⇒ **两类同一条路** ✓。 */
export const writeStoryPackage = ({ slug, data = {}, twee = {}, io } = {}) => {
	need(io, 'writeText', 'writeStoryPackage');
	const { dataFile, tweeFile } = packageFiles(slug);
	const written = [];
	const put = (path, value) => {
		if (value === null || value === undefined) return;
		const text = typeof value === 'string' ? value : JSON.stringify(value, null, '\t') + '\n';
		io.writeText(path, text);
		written.push(path);
	};
	for (const [name, value] of Object.entries(data)) put(dataFile(name), value);
	for (const [name, value] of Object.entries(twee)) put(tweeFile(name), value);
	return written;
};

/** 自证：**不碰真磁盘** ✓（假 io 驱动 ⇒ 在 core 里就能证明"写只经这一条路" ✓）。 */
export const selftestStory = () => {
	let bad = 0, n = 0;
	const t = (label, ok) => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };

	const slug = 'demo';
	const files = packageFiles(slug);
	t('编目：清单路径 = stories/<slug>/00-story.json', files.manifest === 'stories/demo/00-story.json');
	t('编目：数据文件路径 = stories/<slug>/data/<name>', files.dataFile('tables.json') === 'stories/demo/data/tables.json');
	t('编目：数据面三个文件（rules 可缺 ⇒ 由 null 表达）', files.data.join(',') === 'tables.json,contract.json,rules.json');

	// 读：假 io
	const store = { 'stories/demo/00-story.json': JSON.stringify({ slug, title: '演示' }), 'stories/demo/data/tables.json': JSON.stringify({ a: 1 }) };
	const io = { exists: (p) => p in store, readText: (p) => { if (!(p in store)) throw new Error(`ENOENT ${p}`); return store[p]; } };
	const pkg = readStoryPackage({ slug, io });
	t('读：清单解析 ✓', pkg.meta.title === '演示');
	t('读：存在的数据文件解析 ✓', pkg.data['tables.json'].a === 1);
	t('读：缺的数据文件 ⇒ null（**与既有工具同义** ✓，不是静默空对象 ✗）', pkg.data['rules.json'] === null);

	// 缺能力 ⇒ 点名抛错（不静默 ✗）
	const threw = (fn) => { try { fn(); return false; } catch { return true; } };
	t('缺 io.readText ⇒ 点名抛错（不静默跳过 ✗）', threw(() => readStoryPackage({ slug, io: {} })));
	t('缺 io.writeText ⇒ 点名抛错（不静默跳过 ✗）', threw(() => writeStoryPackage({ slug, data: { 'tables.json': {} }, io: {} })));

	// 写：记录型 io（**写侧哨兵** ✓）
	const wrote = [];
	const wio = { writeText: (p, text) => wrote.push([p, text]) };
	writeStoryPackage({ slug, data: { 'tables.json': { a: 1 }, 'contract.json': { members: [] } }, io: wio });
	t('写：只写"给了的"文件（rules 没给 ⇒ 不写）', wrote.length === 2);
	t('写：data 类落点都在 stories/<slug>/data/（唯一写路的**落点**可断言 ✓）', wrote.every(([p]) => p.startsWith('stories/demo/data/')));
	t('编目：生成物 twee 口与 data 口**同级**（`stories/<slug>/<name>`）', files.tweeFile('15-tables.twee') === 'stories/demo/15-tables.twee');
	t('写：twee 类与 data 类走**同一条路**（两类一起写 ⇒ 路径都在包内 ✓）', (() => { const w = []; writeStoryPackage({ slug, data: { 'tables.json': {} }, twee: { '15-tables.twee': ':: T\n' }, io: { writeText: (p, t2) => w.push([p, t2]) } }); return w.length === 2 && w.some(([p]) => p.endsWith('data/tables.json')) && w.some(([p]) => p.endsWith('15-tables.twee')); })());

	// 拒绝型 io ⇒ 证明"写确实经这一条路"（Tester 的两-io 法 ✓）
	let denied = 0;
	const dio = { writeText: () => { denied++; throw new Error('denied'); } };
	t('拒绝型 io ⇒ 写入**当场失败**（证明没绕过这一条路 ✗）', threw(() => writeStoryPackage({ slug, data: { 'tables.json': {} }, io: dio })) && denied === 1);

	console.log(`\n${bad ? '✗' : '✔'} core/story 自证 ${n} 例${bad ? `（${bad} 例失败）` : ' 全部通过'}`);
	return bad;
};
