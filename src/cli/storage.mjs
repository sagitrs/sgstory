import * as filesystem from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Fault, jsonClone } from './json.mjs';
const MAX_BYTES = 1024 * 1024;
export class Store {
  #root; #fs;
  constructor(root, fs = filesystem) { this.#root = path.resolve(root); this.#fs = fs; }
  #target(slot) {
    if (typeof slot !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(slot)) throw new Fault('SAVE_SLOT', '档名须为1至32位小写字母、数字、横线或下划线');
    return path.join(this.#root, `${slot}.json`);
  }
  async save(session, slot) {
    const target = this.#target(slot); const text = JSON.stringify(jsonClone(session.snapshot())) + '\n';
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Fault('SAVE_SIZE', '存档超过1MiB');
    const temp = path.join(this.#root, `.${slot}.${randomUUID()}.tmp`);
    try {
      await this.#fs.mkdir(this.#root, { recursive: true });
      await this.#fs.writeFile(temp, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await this.#fs.rename(temp, target);
    } finally { await this.#fs.rm(temp, { force: true }); }
  }
  async load(session, slot) {
    const target = this.#target(slot); let handle; let text;
    try {
      handle = await this.#fs.open(target, 'r');
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Fault('SAVE_SIZE', '存档不是普通小文件');
      // Bound the actual read too: a file may grow after stat().
      const buffer = Buffer.alloc(MAX_BYTES + 1); let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
        if (!bytesRead) break; offset += bytesRead;
      }
      if (offset > MAX_BYTES) throw new Fault('SAVE_SIZE', '存档超过1MiB');
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
    } finally { if (handle) await handle.close(); }
    let envelope;
    try { envelope = JSON.parse(text); } catch { throw new Fault('SAVE_JSON', '存档不是有效JSON'); }
    session.restore(envelope); // E1: loading must replace the validated session.
  }
}
