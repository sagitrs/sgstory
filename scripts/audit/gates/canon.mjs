// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['canon']。校验：npm run audit:golden。
export const flag = 'canon';
export const flags = ["canon"];

export const run = (ctx) => {
	const { Game, Rules, Pc, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;
// ── ⓪g canon 门（M1b）：设定书 §10「已裁剪设定」→ src 回流检测 ──
// 权威链：docs/lore-canon.md §10 是唯一黑名单来源。本门做两件事：
//   ① 行覆盖：§10 每一行必须被下表认领（新增行不认领即红——防设定裁剪后正文悄悄回流）
//   ② 词扫描：认领行的禁词不得出现在 shipped 文本（正文 + 数据表字符串；JS/CSS 注释与 /% %/ 不计）
// 维护：设定书 §10 新增/修改行 → 同步下表（`src` 为行内可辨识子串）
const CANON_ROWS = [
	{ src: '封印双闩', terms: ['封印双闩', '星闩', '人闩', '以命为闩', '压梦'], why: '塔是送行工程' },
	{ src: '封印大厅', terms: ['封印大厅', '结界', '四锁槽', '锁槽', '封印崩坏'], why: '与「送它回家」母题冲突' },
	{ src: '宾客亡灵', terms: ['塌门亡灵', '宾客封印圈', '铜哨召'], also: [{ t: '亡灵', negate: true }], why: '无亡灵系；否定句（没有亡灵）允许' },
	{ src: '那顿饭没人撤', terms: ['没人撤', '落灰的碗筷', '没散的席面', '席面'], why: '宴是过去的事' },
	{ src: '有人在等它回去吃饭', terms: ['等它回去吃饭', '等它入席', '哨响即归'], why: '没有人还在等它吃饭' },
	{ src: '守龙人', terms: ['守龙人'], why: '守林人＝村子的守卫' },
	{ src: '悔念外化', terms: ['悔念外化'], why: '中boss＝雾之魔物' },
	{ src: '守林人＝塔顶亡灵', terms: ['塔顶亡灵'], why: '守林人是活人' },
	{ src: '守林人住在塔边（塔里）', terms: ['住在塔边', '守在塔边', '睡在塔里'], why: '他跟他母亲住在一起（女巫家）；塔里只有岗位' },
	{ src: '日记记着“雾就是它漏出来的力气”', terms: ['雾就是它漏出来的力气', '那是它的路费', '这笔账没人算过', '省下的是哪一笔'], why: '星账无人感知、不可测量（v17 补正 #7）——谜底只在设定集·术语（终局后）' },
	{ src: '守林人只留形', terms: ['只留形', '留形'], why: '送行术家传，终局由守林人施展' },
	{ src: '吹哨需守林人到场', terms: ['需守林人到场', '吹哨需'], why: '吹哨只需龙冷静' },
	{ src: '真结局＝历史被改', terms: ['历史被改', '在雾里散开'], why: '改为终止徒劳传送、省下最后一笔路费' },
	{ src: '藏杖闭环', terms: ['藏杖闭环'], why: '新增传送术卷轴' },
	{ src: '龙可以被打赢', skip: '数值门：audit --dragon（单挑必败）', why: 'v16 §3.8 五种打法' },
	{ src: '封印术＝古已有之', terms: ['古已有之'], why: '封印术＝守林人家家传' },
	{ src: '冒险者能学会传送术', terms: ['学会传送术'], why: '玩家最多学出劣化版封印术' },
	{ src: '每代少一句', terms: ['每代少一句', '磨损成无处'], why: '从失败推出的误判' },
	{ src: '盼有人改变未来', terms: ['改变未来'], why: '改为盼有人给它一个了结' },
	{ src: '囚室', terms: ['囚室', '囚徒', '星轨图'], why: '观星者＝死在工作台前的普通人' },
	{ src: '四信物', terms: ['四信物', '信物', '铜哨'], also: [{ t: '集齐开锁', negate: true }], why: '改为物品栏（§5.0）；否定句（不集齐开锁）允许' },
	{ src: '焐蛋人', terms: ['焐蛋'], why: '蛋由童年的她捡回孵化' },
	{ src: '初代子女', terms: ['初代长子', '初代女儿'], why: '如何分的不叙' },
	{ src: '女巫长生', terms: ['女巫长生'], why: '只有龙不老；「形似」误导允许（开场传闻）' },
	{ src: '充能三次', terms: ['充能', 'amulet_charges'], why: '改隐藏计数（§3.5）' },
	{ src: '魔力 / 星力混用', terms: ['魔力'], why: '术语统一为「星力」' },
	{ src: '占星师', terms: ['占星师'], why: '术语统一为「观星者」' },
	{ src: '卖星铁', terms: ['卖星铁'], why: '星铁不可卖；v16 的"碎镜片三用"一并作废（v17 补正 #4）' },
	{ src: '请柬 / 星名页 / 碎镜片', terms: ['请柬', '星名页', '碎镜片'], why: '三件闲物已删（假代价 / 零消费，v17 补正 #4）' },
	{ src: '乡愁雾', terms: ['乡愁雾', '悔雾', '梦雾', '双层雾'], why: '单层雾＝龙漏出的星力' },
	{ src: '共鸣锚免费无限切换', terms: ['共鸣锚'], why: '与隐藏星力冲突' },
	{ src: '龙威递增', terms: ['龙威', 'lair', '双态地形'], why: '归为游戏机制稿，不入设定书' },
	{ src: '星落＝送归成功', terms: ['星落＝送归', '送归成功'], why: '星落＝讨伐；送归＝真结局' },
	{ src: '罗温守孩子', terms: ['罗温', '以命续封'], why: '罗温是活着的现任守林人' },
	{ src: '龙名后半', terms: ['龙名后半'], why: '正文只出现「维」' },
	{ src: '「门」概念', terms: ['造门', '把门交给旅人', '门后等', '圈内圈外'], why: '龙沉睡无需门、也无法封印' },
	{ src: '送星宴的宴席描写', terms: ['炖肉', '布菜', '举杯', '入席'], why: '宴的功能是遇到所有人并目睹送星仪式' },
	{ src: '守林人有资质学传送术', terms: ['有资质', '资质'], why: '改为「练的是什么」' },
	{ src: '旅人劝她终止传送', terms: ['终止传送', '与龙告别'], why: '改为把办法告诉她' },
	{ src: '守林人为女性', targeted: '守林人', why: '改为男性（男系一脉）' },
	{ src: '星力不显示任何数字', skip: 'UI 门：正文无星力数字/进度条（smoke + 人工）', why: '隐藏计数（§3.5）' },
	{ src: '人们把它搬到塔底供奉', terms: ['搬到塔底', '供奉'], why: '它就睡在塔的地下' },
	{ src: '换哨＝与穿越回来的老巫女', terms: ['换哨＝与穿越回来的老巫女', '哨身太新', '晚年穿越'], why: '改为与当时的女巫交换（v16 补正 #7）；身份仍不点破（§9 #5）' },
	{ src: '老巫女在宴上讲过去知', terms: ['因为那一夜发不动'], why: '过去知只在日记里（v16 补正 #8）' },
	{ src: '卷轴由老巫女在宴上交出', terms: ['她递过来一卷纸', '改不了的那一夜，就交给三百年后的人'], why: '卷轴并入日记封底；杖由旅人找回（v16 补正 #9）' },
	{ src: '杖与项链分落两支后人', terms: ['长房', '次房', '三家各持一件'], why: '杖与项链都留在女巫一家（v17）' },
	{ src: '守林人 / 女巫有特殊身份', skip: '口径门：§9 纪律 #7（两人只是普通母子）', why: '去神秘化（v17）' },
	{ src: '冒险者受雇而来 / 为讨伐而来', terms: ['受雇'], why: '他只是被传闻吸引来看看（v17）' },
	{ src: '进塔的人会失忆', terms: ['记不清自己进去', '会失忆'], why: '没有失忆——塔是废塔（v17）' },
	{ src: '龙被封印＝事实（叙述者确认）', skip: '口径门：§9 纪律 #6/#8（传说只能 NPC 口吻；一族不纠正）', why: '没有咒也没有锁，它只是睡着（v17）' },
	{ src: '一族人当面纠正"封印"这个说法', terms: ['这塔里没有封印', '其实那不是封印'], why: '不知道来历的人面前不指正（v17 补正 #1）' },
	{ src: '"好感换放行"', skip: '口径门：§9 纪律 #8（守村的责任心优先）', why: '好感只影响说多少（v17 补正 #1）' },
	{ src: '两份好感（还杖人情 + 知情/信龙）', skip: '口径门：唯一人情线 family_favor＝还杖（v17 补正 #2）', why: '好感线合一是表结构，不走词扫描' },
	{ src: '封印术想发动就发动', terms: ['把它封进虚空，雾从此散尽'], why: '发动有前置：先把龙打到 sealAt 以下（v17 补正 #3，旧结局文案已改）' },
	{ src: '月光花无战斗用途', skip: '口径门：§5.4 毒液抹刃＝龙的攻击 −2（v17 补正 #3 部分回退）', why: 'advAt 恒 false 已由 rules/properties 机检' },
	{ src: '「信物」概念', terms: ['信物'], why: '改为物品栏' },
	{ src: '星图残页', terms: ['星图残页'], why: '证物改用观星者的书' },
	{ src: '封印门', terms: ['封印门', '四道锁槽', '星鬥', '人鬥', '启门韵', '星纹共振'], why: '只留一道通往地下宴会厅的门' },
	{ src: '塔顶留形＝老守林人', terms: ['塔顶留形'], why: '塔顶就是守林人本人' },
	{ src: '雾中的形＝龙的无意识', terms: ['龙的无意识', '初代巫女形'], why: '雾聚成的守卫，陪着守林人' },
	{ src: '与龙战必败（无论人数）', skip: '数值门：audit --dragon（单挑必败 / 说服击杀可赢）', why: 'v16 §3.8 五种打法' },
	{ src: '龙睡在塔的地下（进地下不必然看见）', skip: '内容门：进到地下一眼就看见（M2 文案）', why: '§4.5' },
	{ src: '翻转＝任意地点进任意时代', skip: '机制门：原地生效（integrity W2 + <<flip>> 原地重渲染）', why: '§3.3' },
	{ src: '钥匙要靠考验', terms: ['要靠考验', '利益交换'], why: '正常交涉即可（§5.12）' },
	{ src: '三百年后的地下是多房间地城', terms: ['多房间'], why: '只有一条巨龙' },
	{ src: '道具与存档都在侧栏', skip: 'UI 门：smoke 断言存档栏与物品栏分置（§5.0）', why: '道具在侧栏，存档常驻界面' },
	{ src: '无雾的房间翻不动', terms: ['翻不动'], why: '翻转不受雾限制（v16 补正 #2）' },
	{ src: '杖光＝唯一提示', terms: ['杖光'], why: '杖在真结局前只有微光；唯一提示＝雾淡' },
	{ src: '修镜', terms: ['修镜', '实拍今日星图', '标记坐标'], why: '坐标＝三百年前完整星图' },
	{ src: '二章三信物', terms: ['三信物'], why: '上塔无需道具门' },
	{ src: '坐标差之毫厘', terms: ['坐标差之毫厘', '坐标偏差'], why: '不存在坐标偏差降级' },
	{ src: '月光花自用＝解毒', terms: ['解毒', '自用'], why: '月光花只有献龙一用，无战斗功能（§5.4）' },
	{ src: '月光花长在塔内温室', terms: ['塔·温室', '温室'], why: '塔里没有温室这间房；花自己长在塔周围（§5.4）' },
	{ src: '月光花＝雾催生的花', terms: ['雾催生的花', '雾生'], why: '花沐浴星光自生；它和雾的关系无人知晓（§5.4）' },
	{ src: '贸然采花＝昏睡后可重试', terms: ['再凑近', '昏睡后可重试'], why: '贸然采花失败＝死亡结局（§5.4）' },
];
if (wantAll || arg('canon')) {
	console.log('\n══ ⓪g canon 门（设定书 §10 已裁剪设定）——禁止回流 ══');
	let bad = 0;
	const lore = readFileSync('docs/lore-canon.md', 'utf8');
	const s10 = lore.match(/^## 10\.[\s\S]*?(?=^## 11\.)/m)?.[0] ?? '';
	const rows = s10.split('\n').filter((l) => l.trim().startsWith('|'))
		.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
		.filter((c) => c[0] && c[0] !== '旧设定' && !/^[\s:\-]+$/.test(c[0]));
	// ① 行覆盖
	const uncovered = rows.filter((r) => !CANON_ROWS.some((e) => r[0].includes(e.src)));
	if (uncovered.length) {
		bad += uncovered.length;
		for (const r of uncovered) console.log(`  ✗ §10 行未被 canon 门认领：${r[0].slice(0, 60)}`);
	}
	// ② 词扫描（shipped 文本：正文 + 数据表字符串；JS 行注释 / CSS 块注释 / /% %/ 不计）
	const ship = [];
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		let text = src;
		if (tags.includes('script') || tags.includes('stylesheet')) {
			text = text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
		}
		ship.push({ name, text });
	}
	let termCount = 0, hit = 0;
	const check = (term, negate, why, entry) => {
		termCount++;
		for (const { name, text } of ship) {
			for (const m of text.matchAll(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) {
				if (negate) {
					const before = text.slice(Math.max(0, m.index - 2), m.index);
					if (/[没有无非不]/.test(before)) continue;
				}
				hit++; bad++;
				console.log(`  ✗ 回流「${term}」@ 段落「${name}」（§10：${entry.src} —— ${why}）`);
			}
		}
	};
	for (const e of CANON_ROWS) {
		for (const term of e.terms ?? []) check(term, false, e.why, e);
		for (const a of e.also ?? []) check(a.t, a.negate, e.why, e);
	}
	// ③ 定向：守林人段落不得出现女性代词
	for (const { name, text } of ship) {
		if (/^守林人/.test(name) && text.includes('她')) { hit++; bad++; console.log(`  ✗ 段落「${name}」出现「她」（§10：守林人为女性 —— 改为男性）`); }
	}
	// ④ §9 双读纪律（M6a）：正文不得点破的断言（只扫正文，不扫数据表脚本）
	const DUALREAD = [
		{ t: '长生', why: '§9 #2/#3：只有龙长寿；正文不出现「长生」断言' },
		{ t: '同一个人', why: '§9 #2：形似线永不出现「同一个人」的肯定句' },
		{ t: '初代巫女', why: '§9 #5：身份只住设定书，正文永不点破' },
		{ t: '初代', why: '§9 #5：正文不称「初代」' },
		{ t: '穿越', why: '§9 #5：正文不出现「穿越」' },
		{ t: '晚年', why: '§9 #5：不点破老巫女＝晚年回到那一夜' },
		// v17 补正 #7（#168 待确认②拍板）：星账正文无人感知、不可测量——"雾＝星力"谁也不许点破，谜底只在设定集·术语（终局后）
		{ t: '漏出来的力气', allow: ['设定集·术语'], why: 'v17 补正 #7：谜底只在设定集（SgCodex.seenFinal() 门内）' },
		{ t: '它自己的力气', allow: ['设定集·术语'], why: 'v17 补正 #7（#219 A1）：图鉴线索/正文不得写出等式变体' },
		{ t: '路费', why: 'v17 补正 #7：正文的雾不许被记成一笔账' },
		{ t: '这笔账', why: 'v17 补正 #7：星账无人感知、不可测量' },
		{ t: '攒得还不够', why: 'v17 补正 #7：没人算过它的积蓄' },
	];
	let dualHit = 0;
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet')) continue; // 只扫正文
		const text = src.replace(/\/%[\s\S]*?%\//g, ''); // 剥 /% %/ 注释
		for (const d of DUALREAD) {
			if ((d.allow ?? []).includes(name)) continue; // 白名单：谜底只许在设定集·术语
			if (text.includes(d.t)) { dualHit++; bad++; console.log(`  ✗ 段落「${name}」出现「${d.t}」（${d.why}）`); }
		}
	}
	// ⑤ §3.9 传说覆盖门（v17）：每条传说都要①登记在对照表 ②在正文里有 NPC 投放锚
	const LEGENDS = [
		{ row: '那条龙早死了', anchors: ['那条龙早死了'], says: '长者' },
		{ row: '三百年前女巫把它封印在塔下', anchors: ['按在塔底下'], says: '老猎人' },
		{ row: '雾是它死后的怨念', anchors: ['怨念', '怨灵'], says: '冒险者' },
		{ row: '月光花是这儿的特产', anchors: ['这儿的特产'], says: '游客' },
		{ row: '月光花夜里接着星光长，谢下来就散成雾', anchors: ['雾是它谢下来的'], says: '跑生意的' },
		{ row: '塔上住着个不老的女人', anchors: ['不老的女人'], says: '酒客' },
		{ row: '谁也说不清他守的是什么', anchors: ['他拦过我一回'], says: '酒客' },
		{ row: '雾是从塔那边来的', anchors: ['雾是从塔那边来的'], says: '老板娘' },
		{ row: '前些年进去过一队人', anchors: ['铁门锁着'], says: '废哨站钉牌' },
	];
	const s39 = lore.match(/^### 3\.9[\s\S]*?(?=^\n---\n)/m)?.[0] ?? '';
	const legendBlock = s39.split(/\n\s*\n/).find((b2) => b2.includes('传说（正文里只能出现在 NPC 口中）')) ?? '';
	const legendRows = legendBlock.split('\n').filter((l) => l.trim().startsWith('|'))
		.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
		.filter((c) => c[0] && !['传说（正文里只能出现在 NPC 口中）', '传说'].includes(c[0]) && !/^[\s:\-]+$/.test(c[0]));
	let legHit = 0;
	for (const r of legendRows) {
		if (!LEGENDS.some((e) => r[0].includes(e.row))) { legHit++; bad++; console.log(`  ✗ §3.9 传说行未被覆盖门认领：${r[0].slice(0, 40)}`); }
	}
	const prose = [];
	for (const [name, src] of passageSrc) {
		const tags = passageTags.get(name) ?? [];
		if (tags.includes('script') || tags.includes('stylesheet')) continue;
		prose.push({ name, text: src.replace(/\/%[\s\S]*?%\//g, '') });
	}
	for (const e of LEGENDS) {
		for (const a of e.anchors) {
			if (!prose.some((p2) => p2.text.includes(a))) { legHit++; bad++; console.log(`  ✗ 传说未投放（${e.says}）：「${a}」——§3.9 登记了却没人说`); }
		}
	}
	// ⑥ 道具消费门（v17 补正 #4）：每件道具至少一处真消费；写了"永失/代价"的必须有下游
	const itemNames = Object.keys(Game.Items.defs ?? {});
	const econNotes = Object.entries(Game.Economy.events ?? {}).map(([k, e]) => `${k}${e.note ?? ''}`);
	const metaAnchors = JSON.stringify([Game.Truth?.claims ?? {}, Game.Echoes?.list ?? {}, Game.Choices?.sites ?? {}]);
	const giveOnly = (name) => new RegExp(`<<give ["']${name}["']>>`);
	let itemHit = 0;
	for (const name of itemNames) {
		const use = [];
		if (Game.Items.effects?.[name]) use.push('位点效果');
		if (econNotes.some((n) => n.includes(name))) use.push('经济事件');
		const holdLines = prose.flatMap((p2) => p2.text.split('\n'))
			.filter((l) => l.includes(`$pc.inv["${name}"]`) && !giveOnly(name).test(l));
		if (holdLines.length) use.push(`正文按持有分支×${holdLines.length}`);
		if (metaAnchors.includes(name)) use.push('Truth/Echoes 锚');
		// #250：战斗/机制表引用（Combat need/good/effects 里的 inv: 消耗）也算一类用途
		const tblSrc = passageSrc.get('Game Tables') ?? '';
		if (tblSrc.includes(`inv:${name}`) || tblSrc.includes(`|${name}`)) use.push('战斗/机制表');
		if (!use.length) { itemHit++; bad++; console.log(`  ✗ 道具「${name}」零消费（拿到即止，无任何下游；v17 补正 #4 已删三件同类）`); }
		// #250：真结局链道具 ≥2 用途（豁免须登记理由）
		const KEY_CHAIN = ['日记', '坏哨', '好哨', '月光花', '观星者的书', '完整星图', '传送术卷轴'];
		const KEY_EXEMPT = {};
		if (KEY_CHAIN.includes(name) && !KEY_EXEMPT[name] && use.length < 2) {
			itemHit++; bad++; console.log(`  ✗ 真结局链道具「${name}」仅 ${use.length} 类用途（#250：≥2，豁免须登记 KEY_EXEMPT）`);
		}
		const def = Game.Items.defs[name] ?? {};
		if (/永失|换掉就|献出去就/.test(def.note ?? '') && !use.some((u) => u.startsWith('正文按持有') || u === '经济事件')) {
			itemHit++; bad++; console.log(`  ✗ 道具「${name}」写了假代价（note 提"永失/换掉就"，但没有任何下游消费）`);
		}
	}
	console.log(`  §5.0 道具：清单 ${itemNames.length} 件 · 零消费 ${itemHit === 0 ? 0 : itemHit}（假代价同计）`);
	// ⑦ 道具图鉴门（v17 M8）：覆盖双向 · 线索可挣 · 线索可达 · 结局登记 · 提示不泄底
	const C = Game.Codex;
	let codexHit = 0;
	const codexItems = Object.keys(C?.items ?? {});
	for (const name of itemNames) if (!codexItems.includes(name)) { codexHit++; bad++; console.log(`  ✗ 图鉴缺页：「${name}」（Items.defs 有、Codex.items 没有）`); }
	for (const name of codexItems) if (!itemNames.includes(name)) { codexHit++; bad++; console.log(`  ✗ 图鉴多页：「${name}」（Codex.items 有、Items.defs 没有）`); }
	const freshPc = { ...Pc.defaults(), flags: [] };
	const fullPc = Pc.defaults();
	fullPc.inv = Object.fromEntries(itemNames.map((n) => [n, true]));
	fullPc.star = { ...fullPc.star, spent: 2, charge: 0 };
	fullPc.world = { fog_thin: true, mist_fought: true, family_favor: true, whistle_blown: true, flower_warned: true, flower_fed: true, present_done: true, scroll_delivered: true, rumor: true, goblin_spared: true, witch_hint: true };
	fullPc.ev = { failure_cause: true, observation_lock: true, keeper_why: true, letter_seen: true, coord: true, mist_guard: true, threshold: true, star_ledger: true, old_witch: true, seer_asked: true };   // #365：seer_asked 与生产者/谓词同域（ev）
	fullPc.keeper = { ...fullPc.keeper, met: true, trust: 3, key: true, state: 'ally' };
	fullPc.dragon = { ...fullPc.dragon, venom: true, awake: true, hp: 1 };
	const clueTotal = codexItems.reduce((n, i) => n + (C.items[i].clues ?? []).length, 0);
	for (const name of codexItems) {
		const def = C.items[name];
		const clues = def.clues ?? [];
		if (clues.length < 2) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」线索不足（≥2；实际 ${clues.length}）`); }
		if (typeof def.hint !== 'string' || !def.hint.trim()) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」缺空页提示`); }
		else if (def.hint.length > 40) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」提示过长（≤40 字；实际 ${def.hint.length}）`); }
		for (const d of DUALREAD) if ((def.hint ?? '').includes(d.t)) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」提示出现「${d.t}」（${d.why}）`); }
		for (const cl of clues) for (const d of DUALREAD) if ((cl.label ?? '').includes(d.t)) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」线索「${cl.id}」出现「${d.t}」（${d.why}）`); } // #219 A1：线索 label 一并扫
		const ids = clues.map((c) => c.id);
		if (new Set(ids).size !== ids.length) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}」线索 id 重复`); }
		for (const c of clues) {
			let free = false, ok2 = false;
			try { free = !!c.test(freshPc); } catch (e) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」线索函数报错：${e.message}`); continue; }
			try { ok2 = !!c.test(fullPc); } catch { ok2 = false; }
			if (free) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」新档即满足（线索必须挣得到）`); }
			if (!ok2) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」在全收集态仍不满足（字段名大概写错了）`); }
			if (!c.label || !String(c.label).trim()) { codexHit++; bad++; console.log(`  ✗ 图鉴「${name}:${c.id}」缺线索文案`); }
		}
	}
	for (const [name, src] of passageSrc) {
		if (!/^结局/.test(name)) continue;
		const body = src.replace(/\/%[\s\S]*?%\//g, '');
		const m = body.match(/<<ending\s+"([^"]+)"(?:\s+(final|chapter))?>>/);
		if (!m) { codexHit++; bad++; console.log(`  ✗ 结局段落「${name}」未登记（缺 <<ending \"…\" final|chapter>>）`); }
		else if (!['final', 'chapter'].includes(m[2] ?? 'final')) { codexHit++; bad++; console.log(`  ✗ 结局段落「${name}」kind 非法：${m[2]}`); }
	}
	console.log(`  §5.0 图鉴：页 ${codexItems.length} · 线索 ${clueTotal} 条 · 命中 ${codexHit}`);
	console.log(`  §3.9 传说：表 ${legendRows.length} 行 · 认领 ${LEGENDS.length} 条 · 投放锚 ${LEGENDS.reduce((n, e) => n + e.anchors.length, 0)} 个 · 命中 ${legHit}（每行须有 ② 的真/误或 ① 的登记）`);
	console.log(`  §10 行 ${rows.length} · 认领 ${CANON_ROWS.length} 条 · 禁词 ${termCount} 个 · 命中 ${hit}`);
	console.log(`  §9 双读：禁断言 ${DUALREAD.length} 条 · 命中 ${dualHit}（正文不点破：长生/同一个人/初代/穿越/晚年）`);
	// 谜底门（v17 补正 #7）：雾＝星力只许在设定集·术语揭开，且必须落在 SgCodex.seenFinal()（走到过终局）门内
	{
		const src = passageSrc.get('设定集·术语') ?? '';
		const gi = src.indexOf('<<if SgCodex.seenFinal()>>');
		const ai = src.indexOf('漏出来的力气');
		const gated = gi >= 0 && ai > gi && !src.slice(gi, ai).includes('<</if>>');
		if (!gated) { bad++; console.log('  ✗ 谜底门：设定集·术语 的「雾＝星力」必须在 <<if SgCodex.seenFinal()>> 门内（v17 补正 #7——谜底只在终局后的设定集）'); }
		else console.log('  谜底门：设定集·术语 的揭示落在终局门内 ✓');
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ canon 门：${bad} 项回流/未认领`); process.exit(1); }
		console.log('\n✔ canon 门通过（§10 全行认领，禁词零回流）');
	}
}
};
