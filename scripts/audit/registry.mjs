// audit 门注册表（#316 第 2 步）：**数组顺序即执行顺序**（与拆分前逐块一致）。
//
// `#607` P1 起：**故事门陆续搬进 `stories/<slug>/gates/`**，由该故事的清单（`00-story.json` 的 `gates`）声明，
// 由 `scripts/audit/discovery.mjs` 发现 ⇒ 本表**只登记住在本目录（工具层）的门**：引擎门 ＋ **待迁移**的故事门。
// 执行顺序由 `discovery.mjs` 的 `GATE_ORDER` 统一给出（搬家只改住址、不改次序）。
// 已搬走的（P1 试点 3 门）：`economy` / `items`＋`tokens` / `notes` ⇒ `stories/mist-forest/gates/`。
import * as g_truth from './gates/truth.mjs';
import * as g_investment from './gates/investment.mjs';
import * as g_echoes from './gates/echoes.mjs';
import * as g_choices from './gates/choices.mjs';
import * as g_sel_nosl from './gates/sel-nosl.mjs';
import * as g_sel_gear from './gates/sel-gear.mjs';
import * as g_interact from './gates/interact.mjs';
import * as g_social from './gates/social.mjs';
import * as g_combat from './gates/combat.mjs';
import * as g_a11y from './gates/a11y.mjs';
import * as g_starbudget from './gates/starbudget.mjs';
import * as g_consequences from './gates/consequences.mjs';
import * as g_sitedisc from './gates/sitedisc.mjs';
import * as g_systems from './gates/systems.mjs';
import * as g_text from './gates/text.mjs';
import * as g_npc from './gates/npc.mjs';
import * as g_dragon from './gates/dragon.mjs';
import * as g_checks from './gates/checks.mjs';
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
	g_truth,
	g_investment,
	g_echoes,
	g_choices,
	g_sel_nosl,
	g_sel_gear,
	g_interact,
	g_social,
	g_combat,
	g_a11y,
	g_starbudget,
	g_consequences,
	g_sitedisc,
	g_systems,
	g_text,
	g_npc,
	g_dragon,
	g_checks,
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
