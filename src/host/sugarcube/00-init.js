/* raw */
/* L0 宿主适配层 · SugarCube 包 —— **命名空间**（`sgstory#1912` 交付 1 步 2）
 *
 * 本档由 `build.py` 的「包根」规则负责为同包其它档注入别名 `SUGARCUBE`
 *   （包根 ＝ 含 `00-init.js` 的目录 ⇒ 文件名大写去横线 ⇒ `SUGARCUBE`；首行 `/* raw *`/ 跳过包装）。
 * ⚠ **本包是全仓唯一允许出现宿主符号的层**（架构档 L0 节）：`State.variables`／`$()`／`jQuery`／
 *   `Dialog`／`:passageinit` 只许在这里出现；L1（`src/core/**`）一律只经 `RPG.portOf()` 取端口。
 *
 * ★`sgstory#1989`（阶段 6）：本包以 `RPG.defHost` **登记成一个宿主**，三端口的实现经
 *   `RPG.defPort(key, impl, {host})` **填进本宿主**（✗ 旧形 `defPort(key, impl)` 的影子表已撤）。
 *   在此之前 `id` 只有声明（全仓无一处读它）⇒ 换宿主、或两宿主同载时的行为都无从谈起。
 */
setup.SUGARCUBE = Object.assign(setup.SUGARCUBE ?? {}, {
	id: 'sugarcube',
	desc: 'SugarCube 宿主适配（PersistContract／RenderPort／LifecyclePort）',
});

setup.RPG.defHost(setup.SUGARCUBE.id, { desc: setup.SUGARCUBE.desc });
