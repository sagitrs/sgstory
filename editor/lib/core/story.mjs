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

/** 段落名 → 文件名（本仓约定：段落名与文件名不同，靠 `00-story.json` 的 files 列表兜底 ✓）。
 *  纯映射 ⇒ 住 core ✓。**消费者现状**：命令体（`lib/host/commands.mjs`，下一票）✓；
 *  **自证目前不消费它**（自证只用 `runStory` ✓ —— 实测：插哨兵后自证仍 6/6 全绿）✗ ⇒ 自证覆盖列为下一票验收项 ✓。 */
export const sectionFile = (name) => {
	const map = { StoryRules: '17-rules.twee', 'Game Tables': '15-tables.twee', StoryBindings: '15-tables.twee' };
	return map[name] ?? `${name}.twee`;
};

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
 *  `data` ＝ `data/*.json` 类（键是文件名 ✓）；`twee` ＝ 生成物类（键是包内文件名 ✓）⇒ **两类同一条路** ✓。
 *  `#892`（P4-1 ✓）：`manifest` 可传 ✓ —— 传了就写**清单**（`stories/<slug>/00-story.json` ✓，`build.mjs` 靠它认故事 ✓）。
 *  ⚠️ **纯加法** ✗：**不传 `manifest` ⇒ 一字不变** ✓（既有三个调用方都不传 ✓ ⇒ 产物逐字节不变 ✓）。 */
export const writeStoryPackage = ({ slug, data = {}, twee = {}, manifest = null, io } = {}) => {
	need(io, 'writeText', 'writeStoryPackage');
	const { manifest: manifestPath, dataFile, tweeFile } = packageFiles(slug);
	const written = [];
	const put = (path, value) => {
		if (value === null || value === undefined) return;
		const text = typeof value === 'string' ? value : JSON.stringify(value, null, '\t') + '\n';
		io.writeText(path, text);
		written.push(path);
	};
	put(manifestPath, manifest);                                   // `#892`：清单（**不传 ⇒ 不写** ✓ —— 纯加法 ✓）
	for (const [name, value] of Object.entries(data)) put(dataFile(name), value);
	for (const [name, value] of Object.entries(twee)) put(tweeFile(name), value);
	return written;
};

/** **起手模板**（`#892` P4-1 ✓）：新建一个故事包所需的**源**（纯数据 ✓ —— 不碰磁盘 ✗）。
 *
 *  `#884` 实测的最小可编译集 ✓（行读数都在票里 ✓）：三件**空骨架**（各带 `section` ✓ —— 段名是**必填** ✗：
 *  实测"无 section ⇒ 干净拒绝" ✓）＋ `00-meta.twee`（**必须带新 IFID** ✗：照抄既有故事会撞 ✓）。
 *
 *  ⚠️ **IFID 必须由调用方给** ✓：`lib/core/**` **不得碰宿主** ✗（不在 core 里取随机源 ✓）；
 *  页面用 `crypto.randomUUID()` ✓、测试用夹具 ✓、CLI 将来可用 `node:crypto` ✓ —— 一处策略、多处注入 ✓。
 *  ⚠️ `entry` 必须与 `00-meta.twee` 里 `StoryData.start` **一致** ✓（不一致 ⇒ 启始段找不到 ✓）。
 *  ⚠️ 出参**只含源** ✗：生成物由编译器产出 ✓ ⇒ 清单要用 `manifestFor()` 在**编译后**拼 ✓（`files` 里列的是**产物名** ✓，与既有故事同形 ✓）。 */
export const starterPackage = ({ slug, title = '未命名故事', entry = '开场', ifid } = {}) => {
	if (!slug || typeof slug !== 'string') throw new Error('starterPackage：缺 `slug`（故事目录名，也是 `00-story.json` 的 slug ✓）');
	if (!ifid || typeof ifid !== 'string') throw new Error('starterPackage：缺 `ifid`（**新生成**的 ✓ —— 照抄既有故事会撞 ✗；宿主生成后注入 ✓）');
	return {
		data: {
			// ⚠️ 形状**不是随便空的** ✗ —— 三件各有自己的最小合法形（与既有故事的数据面同形 ✓）：
			//   `tables.json` ⇒ `containers`（**不是** `rows` ✗：编译器读 `d.containers` ✓，写成 `rows` ⇒ `undefined` ⇒ **静默**产出一句空赋值 ✗）；
			//   `rules.json` ⇒ `key` ＋ `rows` ✓；`contract.json` ⇒ `members` ✓。
			'tables.json': { section: 'Game Tables', containers: {} },
			'contract.json': { section: 'StoryBindings', members: [] },
			'rules.json': { section: 'StoryRules', key: 'rules', rows: [] },
		},
		twee: { '00-meta.twee': metaTwee({ slug, title, entry, ifid }) },
	};
};

/** `00-meta.twee` 的**单一权威形状** ✓（`#892`）：`StoryTitle` ＋ `StoryData`（ifid/format/format-version/start/zoom ✓）
 *  ＋ `StoryIdentity [script]`（`Sg.storyId = { slug }` ✓ —— 与 `00-story.json` 的一致性由 `test/store-keys.mjs` 把住 ✓）。 */
export const metaTwee = ({ slug, title = '未命名故事', entry = '开场', ifid } = {}) => `:: StoryTitle
${title}

:: StoryData
{
\t"ifid": "${ifid}",
\t"format": "SugarCube",
\t"format-version": "2.37.3",
\t"start": "${entry}",
\t"zoom": 1
}

:: StoryIdentity [script]
// 故事身份（**单一源**）：\`Sg.store\` 的故事键命名空间用它（\`<slug>.\` 前缀 ⇒ 各故事互不串档 ✓）。
// 与 \`stories/<slug>/00-story.json\` 的一致性由门 \`test/store-keys.mjs\` 把住（两处漂移即红 ✓）。
window.Sg ??= {};
window.Sg.storyId = { slug: '${slug}' };
`;

/** **清单**（`00-story.json` 的内容 ✓）：`files` 列的是**包内产物名** ✓（与既有故事同形 ✓）——
 *  入口件（`00-meta.twee` ✓）**永远排第一** ✓（`storyOrder()` 拿不准时按清单序 ✓），其余按 `twee` 的键序 ✓（＝编译输出序 ✓）。
 *  ⚠️ 只列**真的写出去了**的件 ✗（漏列 ⇒ `build.mjs` 拒「故事件不在清单里」✗；多列 ⇒ 拒「清单里的文件不存在」✗）
 *  ⇒ 调用方请把**与 `writeStoryPackage` 同一个 `twee` 对象**传进来 ✓（一处真源、两处消费 ✓）。 */
export const manifestFor = ({ slug, title = '未命名故事', subtitle = '', entry = '开场', gates = [], twee = {} } = {}) => {
	const names = Object.keys(twee);
	if (!names.includes('00-meta.twee')) throw new Error('manifestFor：`twee` 里必须含入口件 `00-meta.twee`（它的 `StoryData.start` 与 `entry` 必须一致 ✓）');
	const order = ['00-meta.twee', ...names.filter((n) => n !== '00-meta.twee')];
	return { slug, title, subtitle, entry, files: order.map((n) => `stories/${slug}/${n}`), gates };
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

	// ── `#892`（P4-1）：清单产出 ＋ 起手模板（**每件都带能假的另一半** ✓）──
	// ① 纯加法：不传 `manifest` ⇒ **一字不变** ✓（既有三个调用方都不传 ✓ ⇒ 产物逐字节不变 ✓）
	const w1 = [];
	writeStoryPackage({ slug, data: { 'tables.json': { a: 1 }, 'contract.json': {} }, io: { writeText: (p, x) => w1.push([p, x]) } });
	t('`#892` 纯加法：**不传 manifest** ⇒ 写入数不变（2 ✓）且没人写清单 ✓', w1.length === 2 && !w1.some(([p]) => p.endsWith('00-story.json')));
	// ② 传 `manifest` ⇒ 写出清单，且**与 data 类同一条路**（落点 = 包根 ✓）
	const w2 = [];
	const mf = { slug, title: '演示', entry: '开场', files: ['stories/demo/00-meta.twee'] };
	writeStoryPackage({ slug, data: { 'tables.json': { a: 1 } }, manifest: mf, io: { writeText: (p, x) => w2.push([p, x]) } });
	t('`#892` 传 manifest ⇒ 写出 `stories/<slug>/00-story.json` ✓（且内容 = 那份对象 ✓）',
		w2.length === 2 && w2.some(([p, x]) => p === files.manifest && JSON.parse(x).title === '演示'));
	// ③ 起手模板：缺 ifid ⇒ **点名抛错**（不静默用默认/随机 ✗ —— core 不碰宿主 ✓）
	t('`#892` `starterPackage` 缺 ifid ⇒ 点名抛错（不静默生成 ✗）', threw(() => starterPackage({ slug: 'demo', title: '新故事' })));
	t('`#892` `starterPackage` 缺 slug ⇒ 点名抛错', threw(() => starterPackage({ ifid: 'X' })));
	// ④ 起手模板：三件骨架**各带 section** ✓（实测：无 section 会被编译器**干净拒** ✗）
	const st = starterPackage({ slug: 'demo', title: '新故事', ifid: 'IFID-1' });
	t('`#892` 起手模板：三件 data 骨架**各带 section** ✓ ＋ **各自的合法形状**（tables⇒containers ✓ · rules⇒rows ✓ · contract⇒members ✓）',
		['tables.json', 'contract.json', 'rules.json'].every((n) => typeof st.data[n]?.section === 'string' && st.data[n].section.length > 0)
		&& Array.isArray(st.data['tables.json'].containers) === false && typeof st.data['tables.json'].containers === 'object' && !('rows' in st.data['tables.json'])
		&& Array.isArray(st.data['rules.json'].rows) && Array.isArray(st.data['contract.json'].members));
	// ⑤ IFID 真的进产物 ⇒ 两条不同 ifid ⇒ `00-meta.twee` **不同** ✓（防"照抄撞 IFID"✗）
	t('`#892` 两条不同 `ifid` ⇒ `00-meta.twee` 逐字不同 ✓（照抄会撞 ✗）',
		st.twee['00-meta.twee'] !== starterPackage({ slug: 'demo', title: '新故事', ifid: 'IFID-2' }).twee['00-meta.twee']);
	t('`#892` `00-meta.twee` 里 `entry` 与 `StoryData.start` **一致** ✓', /"start": "开场"/.test(st.twee['00-meta.twee']));
	t('`#892` `00-meta.twee` 带 `Sg.storyId = { slug }` ✓（与 `test/store-keys.mjs` 的一致性面 ✓）', /window\.Sg\.storyId = \{ slug: 'demo' \}/.test(st.twee['00-meta.twee']));
	// ⑥ 清单：入口件**排第一** ✓，且 `files` 只列**真写出去的件** ✓（与 `writeStoryPackage` 同源 ✓）
	const two = { '00-meta.twee': st.twee['00-meta.twee'], '15-tables.twee': ':: Game Tables [script]\n', '17-rules.twee': ':: StoryRules [script]\n' };
	const m2 = manifestFor({ slug: 'demo', title: '新故事', entry: '开场', twee: two });
	t('`#892` `manifestFor`：`files` 首件 = 入口件 ＋ 其余按编译输出序 ✓', JSON.stringify(m2.files) === JSON.stringify(['stories/demo/00-meta.twee', 'stories/demo/15-tables.twee', 'stories/demo/17-rules.twee']));
	const w3 = [];
	writeStoryPackage({ slug: 'demo', twee: two, manifest: m2, io: { writeText: (p, x) => w3.push([p, x]) } });
	t('`#892` 清单 `files` ≡ 本次真正写出的**故事件**（清单自身**不进** `files` ✓ —— 与既有故事同形 ✓；**一处真源、两处消费** ✓）',
		(() => { const written = w3.map(([p]) => p).filter((p) => p !== files.manifest); return new Set(written).size === m2.files.length && m2.files.every((f) => written.includes(f)); })());
	t('`#892` `manifestFor` 缺入口件 ⇒ 点名抛错（不静默列一份"没写出去的清单" ✗）', threw(() => manifestFor({ slug: 'demo', twee: { '15-tables.twee': '' } })));

	console.log(`\n${bad ? '✗' : '✔'} core/story 自证 ${n} 例${bad ? `（${bad} 例失败）` : ' 全部通过'}`);
	return bad;
};
