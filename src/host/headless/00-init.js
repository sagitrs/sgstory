/* raw */
/* L0 宿主适配层 · **headless（内存）宿主** —— `sgstory#1998` 阶段 6 切片 B
 *
 * ## 本包是什么
 *   第三方的**第二个宿主适配器**（第一个是 `src/host/sugarcube/`）：三端口全用**内存**实现 ——
 *   存档＝`Map`、呈现＝收集器（✗ 收集器时落本宿主的缓冲）、生命周期＝纪元。给**无头装置／编辑器／CLI**
 *   用；✗ 给游戏默认产物用。
 *
 * ## ★头注笔（领队 13:12）：「空袋＝读的语义 · 用的语义必须是吵的」
 *   · **读的语义可以安静**：`RPG.ports` 为空袋时**不抛** —— 宿主未定／未选时它就该表达「还没有」；
 *   · **用的语义必须吵**：`RPG.portOf(key)` 在「无宿主登记」「宿主未选择」两种情形**各自具名抛**
 *     （实现在 `src/core/ports/index.js`）。⇒ 本宿主**不做任何静默回落**：
 *       · 它**不**声明自己是默认宿主（`build.py` 的 `DEFAULT_HOSTS` 里没有它）；
 *       · 未 `--host headless` 时它**根本不进产物**（而不是「装进来但待命」）；
 *       · 缺端口／缺方法一律抛（`defPort` 的具名校验管）。
 *   ⇒ 换一句话：**「安静地给了别的宿主」与本包的取向相反** —— 要 headless 就得显式选它。
 *
 * ## 怎么进产物
 *   `python3 build.py --host headless …`（`build.py` 会只装本包 ＋ **注入** `useHost('headless')`）。
 *   ⚠ 本包与 `src/host/sugarcube/` **同时装载**时（`--host all`）内核会在取用时抛「未选择」
 *     —— 那是**设计**（✗ 缺陷）：多宿主产物必须由调用方选（见 `#1998` 的判据 ③）。
 *
 * ## 包根约定（同 SugarCube 包）
 *   `build.py` 为同包其它档注入别名 `HEADLESS`（包根 ＝ 含 `00-init.js` 的目录；首行 `/* raw *​/` 跳过包装）。
 */
setup.HEADLESS = Object.assign(setup.HEADLESS ?? {}, {
	id: 'headless',
	desc: '内存宿主适配（PersistContract＝Map／RenderPort＝收集器／LifecyclePort＝纪元）—— 装置/编辑器/CLI 用',
});

setup.RPG.defHost(setup.HEADLESS.id, { desc: setup.HEADLESS.desc });
