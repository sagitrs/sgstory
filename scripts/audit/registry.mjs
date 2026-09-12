// audit 门注册表（#316 第 2 步）：**数组顺序即执行顺序**（与拆分前逐块一致）。
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
import * as g_economy from './gates/economy.mjs';
import * as g_items_tokens from './gates/items-tokens.mjs';
import * as g_canon from './gates/canon.mjs';
import * as g_craft from './gates/craft.mjs';
import * as g_state from './gates/state.mjs';
import * as g_literals from './gates/literals.mjs';

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
	g_economy,
	g_items_tokens,
	g_canon,
	g_craft,
	g_state,
	g_literals,
];
