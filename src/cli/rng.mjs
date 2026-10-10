import { Fault, exactKeys, whole, words } from './json.mjs';
export class Random {
  #value; #draws;
  constructor(seed) {
    if (!whole(seed, 0, 0xffffffff)) throw new Fault('RNG_SEED', 'seed须为0至4294967295的整数');
    this.#value = seed || 0x9e3779b9; this.#draws = 0;
  }
  static from(data) {
    if (!exactKeys(data, ['algorithm', 'value', 'draws']) || data.algorithm !== 'xorshift32-v1' || !whole(data.value, 1, 0xffffffff) || !whole(data.draws)) throw new Fault('RNG_FORMAT', '随机状态格式或版本不符');
    const r = new Random(data.value); r.#draws = data.draws; return r;
  }
  snapshot() { return { algorithm: 'xorshift32-v1', value: this.#value, draws: this.#draws }; }
  integer(min, max, purpose) {
    if (!whole(min, -0x80000000, 0xffffffff) || !whole(max, min, 0xffffffff) || max - min + 1 > 0x100000000 || !words(purpose, 120) || purpose.includes('\n') || this.#draws === Number.MAX_SAFE_INTEGER) throw new Fault('RNG_ARGUMENT', '随机范围或用途无效');
    let x = this.#value; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.#value = x >>> 0; this.#draws++;
    return min + Math.floor((this.#value / 0x100000000) * (max - min + 1));
  }
}
