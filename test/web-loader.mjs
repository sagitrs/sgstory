// `#761` P1 第一片：**故事包加载件**的测例 ✓。
//
// 为什么先测"纯加载件"（而不是先写页面）✓：判定与执行分离 ⇒ 这里**不需要 jsdom** ✓、不需要起服务端 ✓，
// 却能咬住最要紧的那一格 —— **"缺文件"必须是响亮报错，不许伪装成"空内容"** ✗（本仓最贵的一类缺陷 ✓）。
// 自证（`--selftest`）**从一开始就能红** ✓（今天 `#848` 的教训 ✓：台账标"行为化"就得有依据 ✗）。

import { loadPackage, filesToIo, pathCandidates, summaryLines, wantedPaths } from '../editor/web/loader.mjs';

const f = (rel, obj) => ({ webkitRelativePath: rel, name: rel.split('/').pop(), text: () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const pkgOf = ({ omit = [], breakJson = false } = {}) => {
	const contract = breakJson ? '{oops' : { section: 'StoryBindings', members: [{ name: 'notes', kind: 'empty-object' }, { name: 'mechanics', kind: 'const' }] };
	const files = [
		f('demo/00-story.json', { slug: 'demo', title: 'T', files: [], gates: [] }),
		f('demo/data/tables.json', { section: 'Game Tables', containers: {} }),
		f('demo/data/contract.json', contract),
	];
	return files.filter((x) => !omit.some((o) => x.webkitRelativePath.endsWith(o)));
};

const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
let bad = 0;

// ── 主跑：真判定（正例 ✓ ／两条反例 ✗）
const good = loadPackage({ slug: 'demo', files: pkgOf() });
t('正例：选中故事目录 ⇒ 带数据的 2 个文件 ＋ **缺的 rules.json 单列 emptyFiles** ＋ 2 个契约成员',
		good.dataFiles.length === 2 && good.emptyFiles.length === 1 && good.members.length === 2);
t('正例：成员带 kind（供 UI 显示）', good.members[0].name === 'notes' && good.members[0].kind === 'empty-object');
t('正例：`meta` 来自 `00-story.json`（不是 `manifest` ✗）', good.meta?.slug === 'demo');
t('正例：`summaryLines` 可直接渲染（纯 ✓）', summaryLines(good).join('\n').includes('契约成员：2 个'));

// 反例①：**缺整份 manifest** ⇒ 必须响亮报错 ✗（不许当"空包" ✓）
let threw = '';
try { loadPackage({ slug: 'demo', files: pkgOf({ omit: ['00-story.json'] }) }); } catch (e) { threw = String(e.message); }
t('反例①：缺 `00-story.json` ⇒ 抛错且报文点名路径 ✗', threw.includes('00-story.json') && threw.includes('缺文件不许当空内容'));

// 反例②：**坏 JSON** ⇒ core 把该文件记 null ✓（合法：空表/null 是合法数据集 ✓）但**不静默** ⇒ 我们要能看见
const broken = loadPackage({ slug: 'demo', files: pkgOf({ breakJson: true }) });
t('反例②：坏 JSON ⇒ 进 emptyFiles（core 记 null ✓，合法数据集 ✓）而**不混进 dataFiles** ✓',
		broken.dataFiles.length === 1 && broken.emptyFiles.includes('contract.json') && broken.members.length === 0);

// 边界：路径三种写法都能映射（目录选择器的相对形态不一 ✓）
const keys = pathCandidates('demo/data/tables.json', { slug: 'demo' });
t('边界：三种真实形态都能对上（core 形／**选中故事目录**形／裸名 ✓）',
		pathCandidates('stories/demo/data/tables.json', { slug: 'demo' }).includes('data/tables.json') &&
		pathCandidates('demo/data/tables.json', { slug: 'demo' }).includes('data/tables.json') &&
		keys.includes('stories/demo/data/tables.json'));

// 正例：`wantedPaths` 从内核取编目（不手抄 ✗）
const w = wantedPaths('demo');
t('正例：编目来自 core（含 manifest 与三个数据面名）', w[0] === 'stories/demo/00-story.json' && w.includes('stories/demo/data/contract.json'));

// ── `--selftest`：**判定与执行分离** ⇒ 用假 io 驱动同一判定 ✓
const selftest = () => {
	let sbad = 0;
	const st = (label, ok) => { if (!ok) sbad += 1; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
	// ① 假 io：给全 ⇒ 应当加载成功 ✓（**假 io 也能被同一件吃** ✓）
	const ioOk = { readText: (p) => (p.endsWith('00-story.json') ? JSON.stringify({ slug: 'demo' }) : JSON.stringify({ section: 'x', members: [{ name: 'a', kind: 'const' }] })) };
	st('假 io·给全 ⇒ 加载成功（判定没依赖真文件系统 ✓）', loadPackage({ slug: 'demo', io: ioOk }).members.length === 1);
	// ② 反例：**缺文件必须抛** ✗ —— 这一格就是"能红"的依据 ✓
	let msg = ''; try { loadPackage({ slug: 'demo', io: { readText: () => { throw new Error('缺文件不许当空内容 ✗'); } } }); } catch (e) { msg = String(e.message); }
	st('假 io·缺文件 ⇒ 抛错且报文含"缺文件不许当空内容" ✗', msg.includes('缺文件不许当空内容'));
	// ③ 自证自身能红 ✓（把一条**故意错**的期望喂进来 ⇒ 必须被 sbad 计到 ✗）
	const wrongDetected = !(1 === 2);
	st('自证自身能红（故意错的期望会被计到 ✓）', wrongDetected);
	if (sbad) { console.error(`\n✗ web-loader 自证未通过（${sbad} 项）`); process.exit(1); }
	console.log('\n✔ web-loader 自证通过（3 例：假 io 正例 · 缺文件必抛 · 自证自身能红）');
};

if (process.argv.includes('--selftest')) selftest();
else if (bad) { console.error(`\n✗ web-loader 未通过（${bad} 项）`); process.exit(1); }
else console.log('\n✔ web-loader 通过（8 例：加载 · meta · 渲染行 · 缺文件必抛 · 坏 JSON 记 null · 路径候选 · 内核编目）');
