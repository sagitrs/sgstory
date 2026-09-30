/* RPG 核心 —— 结算管线（有序阶段）
 *
 * 规则包把「一次结算」拆成**有序阶段**注册进来，核心只负责**按序调用**：
 *   RPG.defPipeline({ id, stages }) → id
 *   RPG.runPipeline(id, ctx)       → ctx（同一个对象，便于断言任意中间态）
 *
 * 设计要点（#1713 契约③）：
 *   1. **序的唯一权威 = stages 数组序**。核心不重排、不跳段（除非阶段置 `ctx.done`）；
 *      各包不得自写循环 ⇒ 「序」可被机械守卫（core 内零 pack 管线名字面量）。
 *   2. `ctx` 只保证「同一对象贯穿 + 按序调用」；字段语义由注册方约定。
 *      输入字段由调用方只读；产出字段由各阶段写入，下游可读。
 *   3. **提前结束**：阶段置 `ctx.done = true` ⇒ 后续阶段不再执行（用于失手不结算等）。
 *   4. 失败处置通则：「**损益可重试者吞并，损益不可逆者传播**」——
 *      结算属**不可逆**（伤害一旦施加无法撤销）⇒ 阶段抛错**一律传播**，
 *      不得像回合钩子那样吞并（静默的结算错误 = 数值算错还不报）。
 *   5. `ctx.roll(mode)` 由注册方提供；5E 侧经 `RPG.rng`（唯一随机入口，见 05-dice）。
 */

RPG.pipelines = new Map(); // id → { id, stages }

/** 管线子系统的错误工厂：固定 `code`（用例断言 err.code） */
RPG.pipelineError = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/**
 * 声明一条结算管线。
 * @param def.id     string   管线 id（约定由包命名，如 'dnd-5e.attack'）
 * @param def.stages Array<{ id: string, run(ctx): void }>  **顺序即数组序**
 */
RPG.defPipeline = (def) => {
	if (!def || def.id === undefined) throw RPG.pipelineError('DEFPIPELINE_BAD_ID', 'defPipeline 定义缺少 id');
	if (typeof def.id !== 'string' || def.id === '')
		throw RPG.pipelineError('DEFPIPELINE_BAD_ID', 'defPipeline 的 id 应是非空字符串');
	const { stages } = def;
	if (!Array.isArray(stages))
		throw RPG.pipelineError('DEFPIPELINE_BAD_STAGES', `defPipeline「${def.id}」的 stages 应是数组`);
	if (stages.length === 0)
		throw RPG.pipelineError('DEFPIPELINE_EMPTY', `defPipeline「${def.id}」的 stages 不得为空（空管线会静默不结算）`);
	const seen = new Set();
	for (const st of stages) {
		// 前置 null 守卫：不得让错误退化成 `Cannot read properties of null`
		if (st === null || typeof st !== 'object')
			throw RPG.pipelineError('DEFPIPELINE_BAD_STAGE', `defPipeline「${def.id}」的 stages 含非对象元素：${st}`);
		if (typeof st.id !== 'string' || st.id === '')
			throw RPG.pipelineError('DEFPIPELINE_BAD_STAGE', `defPipeline「${def.id}」的阶段缺少 id`);
		if (typeof st.run !== 'function')
			throw RPG.pipelineError('DEFPIPELINE_BAD_STAGE', `defPipeline「${def.id}」的阶段「${st.id}」的 run 应是函数`);
		if (seen.has(st.id))
			throw RPG.pipelineError('DEFPIPELINE_DUP_STAGE', `defPipeline「${def.id}」的阶段 id 重复：${st.id}`);
		seen.add(st.id);
	}
	if (RPG.pipelines.has(def.id)) {
		console.warn(`[RPG] 管线 id「${def.id}」重复注册：将被覆盖。`);
	}
	const entry = { id: def.id, stages: [...stages] };
	RPG.pipelines.set(def.id, entry);
	return def.id;
};

/** 按序执行管线；返回**同一个** ctx（阶段不得替换 ctx 引用：run 的返回值被忽略） */
RPG.runPipeline = (id, ctx) => {
	const pipe = RPG.pipelines.get(id);
	if (!pipe) {
		throw RPG.pipelineError('PIPELINE_UNKNOWN', `未注册的结算管线「${id}」`,
			{ registeredIds: [...RPG.pipelines.keys()].sort() });
	}
	if (ctx === null || typeof ctx !== 'object')
		throw RPG.pipelineError('PIPELINE_BAD_CTX', `runPipeline「${id}」的 ctx 应是对象`);
	for (const st of pipe.stages) {
		st.run(ctx);           // 抛错**传播**（不吞并，见文件头第 4 点）
		if (ctx.done === true) break; // 阶段提前结束（后续阶段不执行）
	}
	return ctx;
};

/** 取管线（只读；未注册 ⇒ 抛错） */
RPG.pipelineOf = (id) => {
	const pipe = RPG.pipelines.get(id);
	if (!pipe) throw RPG.pipelineError('PIPELINE_UNKNOWN', `未注册的结算管线「${id}」`);
	return pipe;
};
