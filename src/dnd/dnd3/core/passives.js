/* DND3 永久被动（passives）—— 通用被动的**引擎侧**落点（`#1909`／母票 `#1893`）
 *
 * **归属裁定**（`#132` 的「数据归属新规」）：**通用**物品与机制归引擎，**Babel 专属数值**归故事层。
 *   「预知」（`precognition`）是**通用被动**（✗ 不含 Babel 专属数值）⇒ 归本档。
 *   此前它落在故事侧（`books` 的 `stories/babel/src/world/babel.js` 尾部那段注册）是**占位期的权宜**
 *   —— 该段在 `books` 侧随 pin 升**同笔退役**（`books#139` → 本票合入后那一笔），届时改指本档。
 *
 * ★**占位**（与故事侧原声明逐字一致）：**无效果、无判定字段** —— 只提供挂载面
 *   （`books#164` 的 L5 授予：`DND3.Player.gain('precognition')`），效果留待后续。
 *
 * `scope: 'persistent'` 的两条语义（`books#139` (b) 节在故事侧实测过的同两条，本档单测自证一遍）：
 *   · **跨场保留** —— dnd3 **没有** `DND5E.clearBattleScoped` 那种「`battle:end` 清 battle 档效果」的机制
 *     ⇒ persistent 跨场**天然**成立；
 *   · **死亡清档照样清它** —— `RPG.respawn` ③ 的清档按**角色实例**的 `effects` 过滤，与「谁注册」无关
 *     ⇒ 引擎侧注册与故事侧注册语义一致。
 *
 * ⚠ `kind: 'buff'` 是故事侧原声明**原样**：`RPG.defEffect` 只区分 `'debuff'`（据此选 `RPG.Debuff` 类），
 *   其余一律普通 `RPG.Effect` ⇒ `'buff'` 与 `'effect'` 同效。保留原值是为了**迁移零语义漂移**
 *   （✗ 不顺笔改取值 —— 要改另开一笔说清）。
 */
RPG.precognition = RPG.defEffect({
	id: 'precognition', name: '预知', kind: 'buff', scope: 'persistent',
	desc: '（占位：暂无效果）',
});

/* ★**注册即验**（形照 `books#139` 的那一行）：注册路径若在后来的 core 改动里失灵，**加载期即抛**，
 *   ✗ 不等到 L5 授予时才以「未注册的效果 id」暴露 —— 那时代价是战斗深处的一次崩溃。
 *   ⚠ 本行判的是**加载期注册路径**（本档按文件名序先于 `items/` 加载），✗ 不是运行期可变的判据。 */
if (!RPG.effects.has('precognition'))
	throw new Error('[dnd3] precognition 注册未生效');
