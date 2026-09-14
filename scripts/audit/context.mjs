// audit 共享上下文（#316 拆分第 1 步）：源文件发现 → vm 直载 [script] 段 → 预设角色 → 段落索引 → CLI 解析
//
// 为什么先抽这一层：它是**所有门**的共同依赖（Game/Rules/Pc 表、段落索引、presets）。
// 各门模块只要拿到 ctx，就不必各自重复加载；之后把门搬进 scripts/audit/gates/*.mjs 时，
// 依赖方向恒为「门 → context」，不会出现门与门互相 import。
//
// 行为纪律（#316）：本文件只做「搬家」，不改任何加载语义——输出必须与拆分前逐字节一致
// （验证方式：npm run audit:golden）。
import { readFileSync, readdirSync } from 'node:fs';
import { scopedFiles } from '../module-order.mjs';
import { DEFAULT_SLUG, readStory } from '../dist-paths.mjs';
import vm from 'node:vm';

// ── vm 直载全部 [script] 段（按文件名序；浏览器专属全局用 stub 兑底）──
const loadScripts = (srcFiles) => {
	const ctx = {
		window: {}, console,
		Macro: { add() {} }, State: { variables: {} }, $: () => ({ append() {} }),
		Config: { history: {}, saves: {} },
		Save: { onSave: { add() {} }, onLoad: { add() {} }, slots: {} },
		jQuery: () => ({ on() {}, ariaClick() {}, off() {} }),
		UI: { alert() {}, saves() {} }, Engine: {}, Story: { has: () => false },
		setTimeout, clearTimeout, document: { addEventListener() {} },
	};
	for (const f of srcFiles) {
		const text = readFileSync(f, 'utf8');
		const scripts = [...text.matchAll(/::\s*[^\n[\]]+\[script\]([\s\S]*?)(?=\n::|$)/g)].map((m) => m[1]);
		for (const body of scripts) vm.runInNewContext(body, ctx, { filename: f });
	}
	// 浏览器侧 window.X 是全局——vm 侧需手动提升
	for (const k of Object.keys(ctx.window)) if (!(k in ctx)) ctx[k] = ctx.window[k];
	return ctx;
};

// ── 段落索引（锚点检查用）：name → 去注释源文 / 原文 / tags ──
const indexPassages = (srcFiles) => {
	const passageSrc = new Map(); // name -> 去注释源文（锚点检查用）
	const passageRaw = new Map(); // name -> 原文（payload 注释检查用）
	const passageTags = new Map(); // name -> tags[]
	for (const f of srcFiles) {
		const text = readFileSync(f, 'utf8');
		const parts = text.split(/^::\s*/m);
		for (const part of parts.slice(1)) {
			const nl = part.indexOf('\n');
			const name = part.slice(0, nl).replace(/\[[^\]]*\]\s*$/, '').trim();
			passageTags.set(name, (part.slice(0, nl).match(/\[([^\]]*)\]/)?.[1] ?? '').trim().split(/\s+/).filter(Boolean));
			passageRaw.set(name, part.slice(nl + 1));
			passageSrc.set(name, part.slice(nl + 1).replace(/\/%[\s\S]*?%\//g, ''));
		}
	}
	return { passageSrc, passageRaw, passageTags };
};

export const createContext = ({ argv = process.argv, story = null } = {}) => {
	// ── 源文件发现（M1a-1）：不再硬编码路径——改文件名/拆文件不再牵动工具 ──
	// #458 切片B：源文件发现收成单一权威（`SOURCE_ROOTS` 只含 `src` 时返回值与旧写法**逐字符相同**）
	// #458 切片C：**加载顺序的唯一权威是 `ORDER`**（不是词典序）——搬家后故事文件在 `stories/**`，
	// 词典序会把 `21-resolve`（引擎）排到故事表之前 ⇒ `Object.assign(window.Game.Checks, …)` 直接 TypeError。
	// 搬家前「词典序 ≈ 加载顺序」只是巧合（`00-meta`→`05-store`→`10-core`→…）。
	// 根不再是「单个 src」：源清单 = `SOURCE_ROOTS`（`src/**` ＋ `stories/**`）。
	// 旧写法 `allSourceFiles(['src'])` 在搬家后**漏掉故事文件** ⇒ `Game.Checks` 根本没建 ⇒ 门全崩（实测）。
	// #460／#441-E：**故事作用域** —— 分析宇宙＝引擎文件 ∪ **本故事**清单声明的文件（与 `build.mjs` 共用
	// 同一权威 `scopedFiles()`）。默认＝故事 1 ⇒ 与改前**逐字相同**（golden 不变）；`--story <slug>` 切故事。
	// 为什么必须切：宇宙若＝全部源文件，第二个故事会**污染**第一个故事的指标，**又**被第一个故事的
	// 判据要求（spike 实测 4 段门红）——那是"故事门没有故事作用域"这一个根因。
	const slug = story ?? DEFAULT_SLUG;
	const manifest = readStory(slug);
	const SRC_FILES = scopedFiles(manifest);
	const ctx = loadScripts(SRC_FILES);
	const { Game } = ctx.window;   // #320 阶段 3：Chargen* 已收进 Game.Chargen

	// ── 预设角色（车卡全链 apply，与运行时同构）──
	// #460：**车卡不是每个故事都有的**（第二故事可以没有 `Game.Chargen`）⇒ 缺省空表；
	// 无预设时补一个默认 pc（不少判据要 pc，缺了会崩在更远的地方，报错就不是"缺车卡"而是空指针）
	const presets = (Game.Chargen?.presets ?? []).map((p) => {
		const pc = Game.Pc.defaults();
		ctx.State.variables.pc = pc; // Game.Chargen.pick 直接读 State.variables.pc
		for (let r = 0; r < p.picks.length; r++) Game.Chargen.pick(r, p.picks[r]);
		return { name: p.name, pc };
	});

	if (!ctx.State.variables.pc) ctx.State.variables.pc = Game.Pc.defaults();
	const { passageSrc, passageRaw, passageTags } = indexPassages(SRC_FILES);
	const arg = (k) => argv.includes(`--${k}`);
	const wantAll = !argv.some((a) => a.startsWith('--'));

	// 注意：把 vm 上下文里的**全部提升全局**一并摊平返回——原 audit.mjs 里存在 `ctx.Game.Chargen.rounds`
	// 这类「从 vm 上下文取表」的用法（拆分时被 golden 的「单跑内容须在全跑里」断言当场抓到全跑崩溃）。
	// 保持这个兼容面，才能做到「只搬家不改行为」。
	return { ...ctx, SRC_FILES, storySlug: slug, storyManifest: manifest, presets, passageSrc, passageRaw, passageTags, arg, wantAll, argv, vmCtx: ctx };
};
