// audit 共享上下文（#316 拆分第 1 步）：源文件发现 → vm 直载 [script] 段 → 预设角色 → 段落索引 → CLI 解析
//
// 为什么先抽这一层：它是**所有门**的共同依赖（Game/Rules/Pc 表、段落索引、presets）。
// 各门模块只要拿到 ctx，就不必各自重复加载；之后把门搬进 scripts/audit/gates/*.mjs 时，
// 依赖方向恒为「门 → context」，不会出现门与门互相 import。
//
// 行为纪律（#316）：本文件只做「搬家」，不改任何加载语义——输出必须与拆分前逐字节一致
// （验证方式：npm run audit:golden）。
import { readFileSync, readdirSync } from 'node:fs';
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

export const createContext = ({ srcDir = 'src', argv = process.argv } = {}) => {
	// ── 源文件发现（M1a-1）：不再硬编码路径——改文件名/拆文件不再牵动工具 ──
	const SRC_FILES = readdirSync(srcDir).filter((f) => f.endsWith('.twee')).sort().map((f) => `${srcDir}/${f}`);
	const ctx = loadScripts(SRC_FILES);
	const { Rules, Pc, Chargen, ChargenPresets, Game } = ctx.window;

	// ── 预设角色（车卡全链 apply，与运行时同构）──
	const presets = ChargenPresets.map((p) => {
		const pc = Pc.defaults();
		ctx.State.variables.pc = pc; // Chargen.pick 直接读 State.variables.pc
		for (let r = 0; r < p.picks.length; r++) Chargen.pick(r, p.picks[r]);
		return { name: p.name, pc };
	});

	const { passageSrc, passageRaw, passageTags } = indexPassages(SRC_FILES);
	const arg = (k) => argv.includes(`--${k}`);
	const wantAll = !argv.some((a) => a.startsWith('--'));

	// 注意：把 vm 上下文里的**全部提升全局**一并摊平返回——原 audit.mjs 里存在 `ctx.ChargenRounds`
	// 这类「从 vm 上下文取表」的用法（拆分时被 golden 的「单跑内容须在全跑里」断言当场抓到全跑崩溃）。
	// 保持这个兼容面，才能做到「只搬家不改行为」。
	return { ...ctx, SRC_FILES, srcDir, presets, passageSrc, passageRaw, passageTags, arg, wantAll, argv, vmCtx: ctx };
};
