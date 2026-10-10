import { Fault, jsonClone, freeze, whole, words, exactKeys } from './json.mjs';
import { Random } from './rng.mjs';
export const CLI_INTERFACE_VERSION = 1;
export const SAVE_VERSION = 1;
const LOG_LIMIT = 64;
function checkedView(game, state) {
  const view = jsonClone(game.view(freeze(jsonClone(state))));
  if (!exactKeys(view, ['title', 'text', 'phase', 'choices', 'status', 'bag', 'map']) || !['playing', 'ended'].includes(view.phase) || !['title', 'text', 'status', 'bag', 'map'].every(k => words(view[k])) || !Array.isArray(view.choices) || view.choices.length > 30) throw new Fault('VIEW_FORMAT', '游戏视图格式不符');
  const ids = new Set();
  for (const choice of view.choices) {
    if (!exactKeys(choice, ['id', 'label', 'enabled', 'reason']) || typeof choice.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(choice.id) || ids.has(choice.id) || !words(choice.label, 200) || typeof choice.enabled !== 'boolean' || typeof choice.reason !== 'string' || (!choice.enabled && !words(choice.reason, 200)) || (choice.enabled && choice.reason !== '')) throw new Fault('VIEW_CHOICE', '选项需唯一标识、可读标签及明确拒因');
    ids.add(choice.id);
  }
  return freeze(view);
}
function checkedState(game, state) {
  const candidate = jsonClone(state);
  if (game.validate(freeze(jsonClone(candidate))) !== true) throw new Fault('GAME_STATE', '状态不符合游戏版本');
  return candidate;
}
function checkLog(log, revision, rng) {
  if (!Array.isArray(log) || log.length !== Math.min(revision, LOG_LIMIT)) throw new Fault('SAVE_LOG', '动作日志数量不符');
  const count = log.reduce((n, row) => n + (Array.isArray(row?.random) ? row.random.length : 0), 0);
  let expectedDraw = rng.draws - count + 1;
  for (let i = 0; i < log.length; i++) {
    const row = log[i];
    if (!exactKeys(row, ['revision', 'choice', 'outcome', 'random']) || row.revision !== revision - log.length + i + 1 || typeof row.choice !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(row.choice) || !words(row.outcome, 400) || !Array.isArray(row.random) || row.random.length > 128) throw new Fault('SAVE_LOG', '动作日志格式不符');
    for (const draw of row.random) {
      if (!exactKeys(draw, ['purpose', 'min', 'max', 'value', 'index']) || !words(draw.purpose, 120) || draw.purpose.includes('\n') || !whole(draw.min, -0x80000000, 0xffffffff) || !whole(draw.max, draw.min, 0xffffffff) || draw.max - draw.min + 1 > 0x100000000 || !whole(draw.value, draw.min, draw.max) || !whole(draw.index, 1, rng.draws) || draw.index !== expectedDraw) throw new Fault('SAVE_LOG', '随机用途记录不符');
      expectedDraw++;
    }
  }
  if (revision === 0 && rng.draws !== 0) throw new Fault('SAVE_LOG', '初始日志与随机状态不符');
  if (revision <= LOG_LIMIT && count !== rng.draws) throw new Fault('SAVE_LOG', '完整范围内日志与随机消费位置不符');
}
export class Session {
  #game; #record; #boundary = 0;
  constructor(game, seed) {
    if (!game || typeof game.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(game.id) || !whole(game.version, 1, 0x7fffffff) || !['initial', 'validate', 'view', 'apply'].every(k => typeof game[k] === 'function')) throw new Fault('GAME_DEFINITION', '游戏定义不符合CLI接口1');
    this.#game = Object.freeze({ ...game });
    const state = checkedState(this.#game, game.initial()); checkedView(this.#game, state);
    this.#record = freeze({ kind: 'sgstory-cli', version: SAVE_VERSION, interfaceVersion: CLI_INTERFACE_VERSION, game: { id: game.id, version: game.version }, state, rng: new Random(seed).snapshot(), revision: 0, log: [] });
  }
  snapshot() { return jsonClone(this.#record); }
  frame() { return { revision: this.#record.revision, boundary: this.#boundary, view: checkedView(this.#game, this.#record.state) }; }
  query(name) {
    if (!['status', 'bag', 'map'].includes(name)) throw new Fault('QUERY', '未知查询');
    const text = this.frame().view[name];
    return name === 'status' ? `${text}\n动作数: ${this.#record.revision}；随机消费: ${this.#record.rng.draws}` : text;
  }
  choose(id, expectedBoundary = this.#boundary) {
    const refuse = (code, reason) => ({ kind: 'refused', code, reason });
    if (expectedBoundary !== this.#boundary) return refuse('STALE_ACTION', '等待边界已改变，请读当前选项');
    try {
      const choice = this.frame().view.choices.find(c => c.id === id);
      if (!choice) return refuse('UNKNOWN_CHOICE', '选项不存在');
      if (!choice.enabled) return refuse('CONDITION', choice.reason);
      if (this.#boundary === Number.MAX_SAFE_INTEGER) throw new Fault('BOUNDARY_LIMIT', '等待边界数已达上限');
      if (this.#record.revision === Number.MAX_SAFE_INTEGER) throw new Fault('REVISION_LIMIT', '动作数已达上限');
      const state = jsonClone(this.#record.state); const random = Random.from(this.#record.rng); const draws = [];
      const bridge = Object.freeze({ integer(min, max, purpose) {
        if (draws.length >= 128) throw new Fault('RNG_LIMIT', '单次动作随机消费过多');
        const value = random.integer(min, max, purpose); draws.push({ purpose, min, max, value, index: random.snapshot().draws }); return value;
      } });
      const result = this.#game.apply(state, id, bridge);
      if (result?.kind === 'refused' && words(result.reason, 200)) return refuse('GAME_REFUSAL', result.reason);
      if (!result || result.kind !== 'accepted' || !words(result.outcome, 400)) throw new Fault('ACTION_RESULT', '动作须同步返回明确结果');
      const checked = checkedState(this.#game, state); checkedView(this.#game, checked);
      const revision = this.#record.revision + 1;
      const next = { ...this.#record, state: checked,
        rng: random.snapshot(), // U1: state and random commit together.
        revision, log: [...this.#record.log, { revision, choice: id, outcome: result.outcome, random: draws }].slice(-LOG_LIMIT) };
      this.#record = freeze(jsonClone(next)); this.#boundary++;
      return { kind: 'accepted', outcome: result.outcome, revision };
    } catch (error) {
      return { kind: 'failed', code: error instanceof Fault ? error.code : 'ACTION_EXCEPTION', reason: error instanceof Fault ? error.message : '处理器异常；本次状态和随机均未提交' };
    }
  }
  restore(data) {
    if (this.#boundary === Number.MAX_SAFE_INTEGER) throw new Fault('BOUNDARY_LIMIT', '等待边界数已达上限');
    const candidate = jsonClone(data);
    if (!exactKeys(candidate, ['kind', 'version', 'interfaceVersion', 'game', 'state', 'rng', 'revision', 'log']) || candidate.kind !== 'sgstory-cli' || candidate.version !== SAVE_VERSION || candidate.interfaceVersion !== CLI_INTERFACE_VERSION) throw new Fault('SAVE_VERSION', '存档信封或引擎版本不符');
    if (!exactKeys(candidate.game, ['id', 'version']) || candidate.game.id !== this.#game.id || candidate.game.version !== this.#game.version) throw new Fault('SAVE_GAME', '存档内容或游戏版本不符');
    if (!whole(candidate.revision)) throw new Fault('SAVE_REVISION', '存档动作数无效');
    const rng = Random.from(candidate.rng).snapshot(); checkLog(candidate.log, candidate.revision, rng);
    candidate.state = checkedState(this.#game, candidate.state); checkedView(this.#game, candidate.state);
    this.#record = freeze(candidate); this.#boundary++;
  }
}
