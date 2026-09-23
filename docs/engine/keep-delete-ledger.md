# 留删总账（keep-delete ledger）

> **唯一值得看护的故事＝迷雾森林**（`#1163` M3 补回，真正目标）；**demo 的作用是临时代理，可删可摘可重建**。

> **用途**（定案口径）：**"只要我们在做正确的事，即使 CI 红，我们也可以自信地删除 CI 用例，而不是被门禁带偏。"**
> 这张账把"**该改实现**"还是"**该删用例**"变成**可查的底账**——门红时先查本账，再决定动作。
>
> **引用法**：**每行可被 PR 引用**。例：`本判据属 E 表"注定删除"栏` / `本对象属 C 表` / `本对象属 D 表，处置时点＝笔二`。
>
> **五节**：**A 引擎侧留（待交）** · **B 故事侧留（待交）** · **C 已数据化的资产** · **D 已决定删除、无需数据化** · **E 常设门全量判读**。
> A／B 由 归属面交（排笔二之后）；**C／D 由 writer 交**；E 由 验收面交（已交，117 行）。

## 运行规则（门红时照此办）

**原话口径**：

> 门红 → **先查 E 表**：
> - **在"注定删除"栏** → **删用例**，并在正文写"**守卫随主体退役**"；
> - **不在** → 才看是**实现错**还是**故事错**（按 A/B/C/D 归属）。

**配合一条**：**"提了 X 的名字"≠"守护 X"**——判"某门是否服务某对象"必须读该门的**断言本体**，不能凭它提到了某名字。
（实例：E 表第一版**自动分类器**判出"注定删除 28 条"，验收面**亲读后为 0 条**——差的 28 条全是"用夹具当载体但**守的是引擎契约面**"。）

### 条款：无消费的待溶解项 → 直接删

> **无消费的待溶解项 → 直接删；正确形态随 M3 在 books 仓落地；不许为它补或留 CI。**

**判据三条齐**（缺一不算）：
1. 属**待溶解**（引擎里仍有该故事概念痕迹）；
2. **今天没有真实消费面**（**demo 不算消费者**）；
3. **正确形态＝故事侧 JSON 数据**（books 仓）。

→ **直接删**；留痕只需"**删了什么 ＋ 正确形态在哪**"，**不必**等价／行为中性论证。

## A 引擎侧留（**待交**，归属面）

> **状态：待交**（排笔二之后）。本节届时填"引擎侧必须留、且**不属**故事数据面"的对象：对象 ｜ 落点 ｜ 为什么留。

## B 故事侧留（**待交**，归属面）

> **状态：待交**（排笔二之后）。本节届时填"故事侧保留、但**不属**已数据化面"的对象：对象 ｜ 落点 ｜ 为什么留。

## C 已数据化的资产

**口径**：故事侧**数据面**里**承载那些名字／值**的对象（名字与值由故事给，**引擎不写死**）。
**与 A 的分界**：**资产属 C**（数据）；**读它的引擎面属 A**（schema／接缝／政策位）。

| 对象 | 落点（现存处） | 引擎按什么 schema 读 |
|---|---|---|
| **翻转计费政策**（顶层键名 ＋ 内层两个键名 ＋ 首翻免费） | `stories/face-fixture/data/tables.json:781` `.containers.Star.flipPolicy = {firstFree:true, key:"star", freeKey:"first_free", spentKey:"spent"}` | 契约项 `flipPolicy: {kind:'game-ref', path:'Game.Star.flipPolicy'}`（`data/contract.json:183`）；引擎经**契约缝** `window.Sg?.story?.flipPolicy?.()` 取（`src/80-script.twee:283`／`src/engine/40-sim/21-resolve.twee:99`）；**缺项即出声**（`80-script.twee:284`） |
| **对手政策**（连败递增／异常状态对策：`streakCap`／`effectFlags`／`flag`／`flagAdjust`／`suppressStreak`） | `data/tables.json:270` `.containers.Combat.foePolicies = {streakCap:2, effectFlags:{venom:"venom"}, flag:"venom", flagAdjust:-3, suppressStreak:true}` | 引擎读 `window.Game?.Combat?.foePolicies ?? {}`（`src/engine/40-sim/20-items.twee:27`）；**字段名由故事给**（`20-items.twee:24-26` 自述"连状态字段名本身也由政策给"） |
| **图鉴条目** | `data/tables.json` 的 `Game.Codex.items`（＋ `data/contract.json:19` 声明 `codexItems: {kind:'game-ref', path:'Game.Codex.items'}`） | 引擎模块 `src/engine/40-sim/42-codex.twee`（`clueIds`／`satisfied(pc)`／`isUnlocked`／`progress`） |
| **笔记表** | `data/notes.json` 的 `blocks[].entries[<id>]`（`title`／`src`／`body`／`era`／`flagPath`；多源时为数组 ＋ `setPath`） | 契约项 `notes: {kind:'game-ref', path:'Game?.Notes?.entries', optional:true}`（`data/contract.json:6`）；引擎读 `Sg.story.notes()`（`src/80-script.twee` 的 `Sg.notes` 族） |
| **状态字段名**（`STORY_KEY_NAMES` 族：`first_free`／`spent`／`poisonReduce`／`dragonMaxHp`／`venom` …） | 故事侧 `data/*.json` 与内容面；判据在 `editor/lib/core/contract-defaults.mjs:270` | 引擎不写死字段名（判据 `storyKeyLiteralProblems` **属性位置口径**；扫描面＝属性位置） |
| **常量型资产**（`starBudget`／`flipItem`／`flipStarCost`／`flipReturnFlag`） | `data/contract.json`（`{kind:'const', value:…}`：`:starBudget`＝6／`flipItem`＝"时光护符"／`flipStarCost`＝1／`flipReturnFlag`＝"fog_thin"） | 契约项 `{kind:'const'}` → 引擎读值、不读名 |
| **`pc` 形状**（`star.charge/spent/first_free`、`keeper.met` …） | `data/contract.json` 的 `pcShape: {kind:'const', value:{…}}` | 契约项 `{kind:'const'}`；消费面见 `pcDefaults` |
| **战斗数值转发面** | `data/contract.json` 的 `battleDamage: {kind:'forward', to:'Game.Items.battleDamage', params:[inv, round, defeats, poisoned]}` | 契约项 `{kind:'forward'}` → **引擎只认形状**，不知道故事专名 |

## D 已决定删除、**无需**数据化的故事内容

**口径（转向二扩权）**：**"当前形态不对 → 先删" 的对象都进本表** —— 不必先证明"无需数据化"，只要**属 demo 且不服务于迷雾森林**即可判死。
三列：对象 ｜ 为什么不必留（或为什么先删）｜ 处置时点。

> **先删再重建**（已定案）：demo 面先删；将来需要时**按需重建**（`M1a` 最小合成件只在需要时建）。

| 对象 | 为什么不必数据化 | 处置时点 |
|---|---|---|
| **已删故事 `mist-forest`／`hollow-cave`** | 内容故事已被判死（`#1004` B2a 已定案取"乙"：留 `minimal-demo`）；**没有引擎概念要承载** → 数据化无对象 | **已删**（`16b8f35`）；残留名见下条 |
| **陈旧名残留**（`mist-forest`／`hollow-cave` 的字面残留） | 名字的**持有者已不在**；数据化一个"没有对象的名字"没有意义 → 属**文本清理**（非数据化） | 待 `#1238`（口径 84 处＝(a)54＋(b)29＋(c)1） |
| **一次性产物 `views`／生成件**（`00-meta.twee`／`15-tables.twee`／`16-notes-ch1.twee`／`17-rules.twee`／`18-chargen.twee` 一族） | 它们是**从 `data/*.json` 编译出来的产物**，**不入 git**（实测入 git 的只有 `11-fixture-cards.twee` 与 `gates/equiv-baseline/*.txt`）→ 删源即消失，**没有独立数据化对象** | 随数据面变化自动（`#1128` 产物前置：干净树可从源重建） |
| **`equiv-baseline/15-tables.twee.txt`** | **冻结基线**：它是**读数锚**（不是内容）→ 需保留但**不是数据化对象**；数据面一变须按 regen 重钉 | 随数据面变更重钉（笔二／`#1251`） |
| **时光护符一族／era 机制本体**（**同一物件两名**：数据里的值 `flipItem: "时光护符"`（`data/contract.json:135`）＝ UI 文案"翻转护符"（`src/10-core.twee:784`）＝ `capabilityGroups.flip` 那几个旋钮）<br>落点：`src/10-core.twee:454` 的 `capabilityGroups.flip = ['flipItem','flipStarCost','flipReturnFlag']`；`:468-470` 的 `KEYS` 映射；`:780` 的 `_flipItem/_flipCost/_flipFlag`；**`:784` 的 UI 文案硬编码**；`10-const` 的枚举件 | **无消费的待溶解项**（三条判据齐：①待溶解 ②今天无真实消费面——**demo 不算消费者** ③正确形态＝故事侧 JSON）→ **可删，不必在引擎侧数据化**。<br>**但按 2026-09-23 23:10 补充裁定：不强制删**——整区（能力本体、三契约成员、`10-const:17` 枚举、名字族、硬编码文案）**均可在留**，属**可选清理**。<br>（**星力侧** `:789` 的 `chargeFlip` ＋ `flipPolicy` **不是另一族**，是同一"时代翻转"机制的另一面：**物品＝触发／星力＝代价**） | **可选清理项**（**非强制**）：`#1254`（名字族数据化）**有效但非强制、低优先级、不 gate**；**`#1261` 大裁剪不涉此区**；**正确形态＝books 仓 JSON 随 `#1163`**；能力本体去留由 **`#1264` 平移**（**二者皆可、不强制**，不做则注明"能力本体留引擎"） |
| **夹具中将被"最小合成件"替换的部分**（`face-fixture` 的 `passages/**` 内容段：`01-开场`…`19-封印·并肩` 等 20＋ 段） | M1a 收缩后夹具**只需承载引擎面**，内容段由**最小合成件**替换 → 这些段落**不必数据化**（它们要的是"能触发引擎面"而非"承载故事概念"） | **M1a 收缩时**（`#1160`/`#1161` 计划面） |

## E 常设门全量判读（验收面交付；**转向二新口径**）

**口径**：以**仓内实际常设门**为准。来源＝`docs/gate-ledger.md` 的"门"列（**117 条**，生成物）。
**读数三件**：面＝`docs/gate-ledger.md`"门"列（117）｜量纲＝**门的条数**｜树 ref＝**`4006a59`**（转向二复核版；前版 ref `935979d`）。

| 处置 | 条数 |
|---|---|
| **保留**（引擎契约面／仓库纪律面／引擎行为面） | **78** |
| **保留**（改用通用遍历即可，**不必下架**） | **16** |
| **可下架·按需重建**（只钉 demo 面） | **15** |
| **保留（非门禁）**（report-only） | **8** |
| **注定删除**（只服务 demo 且无引擎对象） | **0** |

### E-1 判读口径（**看"它读的故事面是否只有 demo"，不看"提没提 demo 名"**）

- 读 **`storySlugs()`／`DEFAULT_SLUG` 通用遍历** → **不是只服务 demo**（换任何一个故事都成立）→ 归"保留（通用遍历）"；
- **只钉 demo 名／路径**（路径里只出现 `face-fixture`／`minimal-demo`／`night-ferry`，且**无通用遍历**）→ **是** → **可下架·按需重建**。

> **"通用遍历"＝免下架的判据**（这是本节最值钱的一条）：**16 条**门也提到 demo 名，但**同时**用 `storySlugs()`／`DEFAULT_SLUG` 遍历 → 断言对象是**引擎行为**，demo 只是当前唯一载体 → **demo 退役后仍可跑，不必动**。

### E-2 15 条"可下架·按需重建"（只钉 demo 面）

**名单**（15）：`audit-scope-header`／`browser`／`chargen-equivalence`／`contract-defaults`／`contract-version`／`dialect`／`event-graph`／`fatal-guard`／`md-visible-faces`／`multi-story`／`siteinfo-sink`／`social-lever`／`story-codeface`／`web-events`／`web-form`

**下架留痕三栏**（**表头由本节给，内容由实际下架那一笔填**）：

| 下架对象 | 为什么（主体属 demo／已删） | 何时重建（M1a 最小合成件／M3 迷雾森林…） |
|---|---|---|
| （待实际下架那笔填） | | |

→ **按新令**：这些门若因"我们删了 demo 面的东西"而红 → **从链上摘下**（同笔声明"下架 ＋ 何时重建"），**不为了门去保留 demo 面**。

### E-3 两条衔接

1. **引擎契约面 78 条不动**：新令仍要求"引擎该有的形状按设计写对" → 这一栏在**下架潮里必须留**（它们的判据对象会活过 M1b）；
2. **非门禁 8 条**：report-only，不进 PR 档 → 处置另议。

### E-4 与上一版（`935979d`）的差（供追溯）

| 版本 | 注定删除 | 说明 |
|---|---|---|
| 上一版（旧口径） | **0** | 逐条读断言对象后，确认无一条"只服务夹具内容" |
| 本版（新口径） | **0** | "只服务 demo"的 **15 条**按新令**不是删除**，而是**可下架·按需重建**（留痕后可再建） |

### E-5 判读修正留痕（"提了 X 的名字 ≠ 守护 X"）

第一版**自动分类器**判出"注定删除 28 条"，亲读后 **0 条**；差的 28 条全因分类器把"**用夹具当载体**"读成"**守夹具**"。
→ **判"某门是否服务某对象"必须读该门的断言本体**，不能凭它提到了某名字。

## 维护

- **每行带依据与现存处**（件:行 或契约项名）；
- **A 表要求足够短**（引擎侧必须留的东西应当很少）；
- **E 表与仓内常设门一一对应**（改门面 → 重生成 `docs/gate-ledger.md` → 本节计数随之复核）；
- 门红时先查本节"运行规则"那一节。
