// CLI JSON boundary. Trusted game modules are not a sandbox.
export class Fault extends Error {
  constructor(code, message) { super(message); this.name = 'Fault'; this.code = code; }
}
export function jsonClone(value) {
  const seen = new Set(); let nodes = 0;
  function walk(v, depth) {
    if (++nodes > 100000 || depth > 32) throw new Fault('JSON_LIMIT', '状态过大或过深');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || seen.has(v)) throw new Fault('JSON_TYPE', '状态不是无环JSON数据');
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) throw new Fault('JSON_TYPE', '状态含非普通对象');
    seen.add(v);
    const keys = Reflect.ownKeys(v);
    for (const key of keys) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (typeof key !== 'string' || !d.enumerable || !('value' in d) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Fault('JSON_TYPE', '状态含不支持的属性');
      // A decimal-looking property outside length is not an array index.
      // Otherwise it could hide a hole from the own-key count below.
      if (Array.isArray(v) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= v.length)) throw new Fault('JSON_TYPE', '数组含非索引属性');
      walk(d.value, depth + 1);
    }
    if (Array.isArray(v) && keys.length !== v.length + 1) throw new Fault('JSON_TYPE', '数组含空洞');
    seen.delete(v);
  }
  walk(value, 0);
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Fault('JSON_LIMIT', '状态超过1MiB');
  return JSON.parse(text);
}
export function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
export function whole(value, min = 0, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= min && value <= max; }
export function words(value, max = 4000) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x08\x0b-\x1f\x7f]/.test(value);
}
export function exactKeys(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...names].sort().join(',');
}
