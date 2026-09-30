/* RPG 核心 —— 剧情场景 Scene（Event）
 *
 * 把“一个剧情场景”也抽象为可执行的 Event：
 *   execute() 流程：onEnter 副作用 → perform 场景文本 → choice 等玩家选择
 *   → 所选项的 action 副作用 → 进入下一场景。
 *
 * 两种推进模式：
 *   默认（舞台模式）：把下一场景 id 写进 $sceneId 并跳转到「场景舞台」段落。
 *     每个场景 = 一条 SugarCube 历史记录，存档/回退按钮天然按场景粒度工作。
 *   chain: true（链式模式）：直接 await 下一场景的 execute()，纯 JS 推进，
 *     不产生历史记录（适合演出型小片段）。
 *
 * 选项格式：{ text, scene?: 场景id, action?: (scene) => void, when?: () => bool }
 *   when 为假时选项隐藏；scene 可省略（终点选项，由 action 自行导航）；
 *   scene 指向自身 id 可实现“自循环重绘”。
 */

RPG.Scene = class Scene extends RPG.Event {
	constructor({ id, title, text, choices = [], onEnter = null, chain = false } = {}) {
		super();
		if (!id) throw new Error('Scene 定义缺少 id');
		this.id = id;
		this.title = title ?? id;
		this.text = text ?? '';
		this.choices = choices;
		this.onEnter = onEnter;
		this.chain = chain === true;
	}

	/** 当前可用的选项（when 为真的） */
	get availableChoices() {
		return this.choices.filter((c) => !c.when || c.when());
	}

	/** 接口实现（继承自 Event）。含 choice 等待，是异步的。 */
	async execute() {
		if (this.onEnter) this.onEnter(this);
		this.perform(typeof this.text === 'function' ? this.text() : this.text);

		const options = this.availableChoices;
		if (options.length === 0) return; // 没有选项 = 终点场景

		const picked = await this.choice(
			options.map((c, i) => ({
				text: typeof c.text === 'function' ? c.text() : c.text,
				value: String(i),
			}))
		);
		const next = options[Number(picked)];

		if (typeof next.action === 'function') next.action(this);
		if (next.scene == null) return; // 终点选项（action 里自行导航）

		const nextScene = RPG.scenes.get(next.scene);
		if (!(nextScene instanceof RPG.Scene)) {
			throw new Error(`场景「${this.id}」的选项指向未注册的场景：${next.scene}`);
		}
		if (this.chain) {
			await nextScene.execute();
		} else {
			State.variables.sceneId = nextScene.id;
			SugarCube.Engine.play('场景舞台');
		}
	}
};

/** 注册场景实例（场景之间用 id 互相引用，可以循环） */
RPG.registerScene = (scene) => {
	if (!(scene instanceof RPG.Scene)) {
		throw new Error('registerScene 需要 Scene 实例');
	}
	RPG.scenes.set(scene.id, scene);
	return scene;
};

/** 由「场景舞台」段落调用：按 id 执行场景 */
RPG.Scene.play = (id) => {
	const scene = RPG.scenes.get(id);
	if (!scene) throw new Error(`未注册的场景 id：${id}`);
	scene.execute(); // async，fire-and-forget：后续由 choice 驱动
};
