// `#1093` P2-c：**② 层（运行真值）的解析钩子** —— 把 `node:fs` **重定向到 shim**（`--import` 注入）。
//
//注意：为什么必须走解析钩子：段用 **ESM 具名导入** → 改模块对象**拦不到**（实测：只 2 条且是模块 import）
//注意：**自我识别**（防成环）：shim 内部要用**真** `node:fs` → 判"父模块就是 shim" → **放行**
//（同族：`#1072` 的 jsdom 钩子 —— 同一手法，不新造）
//注意：只重定向 **ESM** 那一侧：shim 用 `import * as real from 'node:fs'` → 不撞本钩子
import { registerHooks } from 'node:module';
//注意：`#1127` 复核阻断（受控实验钉死）：**必须主动加载 shim** ——
// 否则「**不 import fs 的段**」（＝会声明 `['*']` 的**纯函数段**）→ **shim 从不装载** → **无读数**
// → ②层报「**取不到读数**」（rc=2）—— 而「**零读**」与「**取不到读数**」是**两件事** → 必须分开。
import './fs-hook-shim.mjs';
const SELF = new URL('./fs-hook-shim.mjs', import.meta.url).href;
registerHooks({
	resolve(spec, ctx, next) {
		if (spec === 'node:fs' || spec === 'fs') {
			if (ctx.parentURL === SELF) return next(spec, ctx);        // ← 自己人 → 放行（否则成环）
			return { url: SELF, shortCircuit: true, format: 'module' };
		}
		return next(spec, ctx);
	},
});
