// audit 门注册表（#316 第 2 步）：**数组顺序即执行顺序**（与拆分前逐块一致）。
//
// `#607` P1 起：**故事门陆续搬进 `stories/<slug>/gates/`**，由该故事的清单（`00-story.json` 的 `gates`）声明，
// 由 `scripts/audit/discovery.mjs` 发现 ⇒ 本表**只登记住在本目录（工具层）的门**：引擎门 ＋ **待迁移**的故事门。
// 执行顺序由 `discovery.mjs` 的 `GATE_ORDER` 统一给出（搬家只改住址、不改次序）。
// 已搬走的：见 `stories/<slug>/00-story.json` 的 `gates`（`#607` P1/P2 逐门搬；本表只留工具层的门）。
// 注：`a11y` **概念上属引擎门**（判产物可访问性，读 `dist/`），暂留工具层且未进 `AUDIT_ENGINE`（层声明待接线后补）——
//     它**不是**故事门的迁移对象。
import * as g_investment from './gates/investment.mjs';
import * as g_echoes from './gates/echoes.mjs';
import * as g_sel_gear from './gates/sel-gear.mjs';
import * as g_a11y from './gates/a11y.mjs';
import * as g_consequences from './gates/consequences.mjs';
import * as g_sitedisc from './gates/sitedisc.mjs';
import * as g_text from './gates/text.mjs';
import * as g_npc from './gates/npc.mjs';
import * as g_dragon from './gates/dragon.mjs';
import * as g_canon from './gates/canon.mjs';
import * as g_craft from './gates/craft.mjs';
import * as g_state from './gates/state.mjs';
import * as g_literals from './gates/literals.mjs';
import * as g_rules from './gates/rules.mjs';
import * as g_reads from './gates/reads.mjs';
import * as g_cave from './gates/cave.mjs';
import * as g_slots from './gates/slots.mjs';
import * as g_status from './gates/status.mjs';
import * as g_waves from './gates/waves.mjs';
import * as g_roads from './gates/roads.mjs';
import * as g_combat_dist from './gates/combat-dist.mjs';
import * as g_engine_story_free from './gates/engine-story-free.mjs';

export const GATES = [
	g_investment,
	g_echoes,
	g_sel_gear,
	g_a11y,
	g_consequences,
	g_sitedisc,
	g_text,
	g_npc,
	g_dragon,
	g_canon,
	g_craft,
	g_state,
	g_literals,
	g_rules,
	g_reads,
	g_cave,
	g_slots,
	g_status,
	g_waves,
	g_roads,
	g_combat_dist,
	g_engine_story_free,
];
