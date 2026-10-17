// Actual normal CLI subprocess: stdout/stderr + stdin only, no runtime imports.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPT = '等待输入>\n';
export const CLI_PROCESS_MS = 10000;
// Boot-level probe: argument shapes are checked before any player input exists.
// stdin is closed, so an accepted shape exits 0 after EOF; a refused shape exits 2 first.
export async function boot(args) {
  const base = process.env.CLI_TEST_ROOT || process.env.TMPDIR || path.join(os.homedir(), 'tmp');
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(path.join(base, 'boot-'));
  try {
    const child = spawn(process.execPath, [path.join(ROOT, 'src/cli/main.mjs'), '--game', path.join(ROOT, 'tests/cli/fixtures/road.mjs'), '--save-dir', path.join(dir, 'slots'), ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`TIMEOUT boot ${CLI_PROCESS_MS}ms`)); }, CLI_PROCESS_MS);
      child.once('error', error => { clearTimeout(timer); reject(new Error(`APPARATUS boot spawn ${error.code}`)); });
      child.once('close', exitCode => { clearTimeout(timer); resolve(exitCode); });
    });
    return { code, stdout, stderr };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
export async function playCase(fn) {
  const base = process.env.CLI_TEST_ROOT || process.env.TMPDIR || path.join(os.homedir(), 'tmp');
  let dir;
  try { await fs.mkdir(base, { recursive: true }); dir = await fs.mkdtemp(path.join(base, 'player-')); }
  catch (error) { throw new Error(`APPARATUS player directory ${error.code}`); }
  const players = [];
  try { await fn(args => { const p = new Player(dir, args); players.push(p); return p; }, dir); }
  finally {
    await Promise.all(players.map(p => p.dispose()));
    await fs.rm(dir, { recursive: true, force: true });
    try { await fs.access(dir); throw new Error(`RESIDUE player directory ${dir}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
class Player {
  #child; #offset = 0; #wake = new Set(); #closed = false; #close; #timer; #timedOut = false; #spawnError;
  stdout = ''; stderr = '';
  constructor(dir, args = []) {
    this.#child = spawn(process.execPath, [path.join(ROOT, 'src/cli/main.mjs'), '--game', path.join(ROOT, 'tests/cli/fixtures/road.mjs'), '--seed', '42', '--save-dir', path.join(dir, 'slots'), ...args], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    this.#child.stdout.setEncoding('utf8'); this.#child.stderr.setEncoding('utf8');
    this.#child.stdout.on('data', data => { this.stdout += data; this.#notify(); });
    this.#child.stderr.on('data', data => { this.stderr += data; this.#notify(); });
    this.#child.on('error', error => { this.#spawnError = error; this.#notify(); });
    // Closing stdin after a crashed child must not crash the harness.
    this.#child.stdin.on('error', () => this.#notify());
    this.#close = new Promise(resolve => this.#child.once('close', (code, signal) => { this.#closed = true; clearTimeout(this.#timer); this.#notify(); resolve({ code, signal }); }));
    this.#timer = setTimeout(() => { this.#timedOut = true; this.#child.kill('SIGKILL'); this.#notify(); }, CLI_PROCESS_MS);
  }
  #notify() { for (const resolve of this.#wake) resolve(); this.#wake.clear(); }
  #problem() {
    if (this.#spawnError) throw new Error(`APPARATUS CLI spawn: ${this.#spawnError.code}`);
    if (this.#timedOut) throw new Error(`TIMEOUT CLI process ${CLI_PROCESS_MS}ms`);
  }
  async frame() {
    for (;;) {
      this.#problem(); const end = this.stdout.indexOf(PROMPT, this.#offset);
      if (end !== -1) { const text = this.stdout.slice(this.#offset, end); this.#offset = end + PROMPT.length; return text; }
      if (this.#closed) throw new Error(`CLI_EXIT before wait boundary: ${this.stdout}\n${this.stderr}`);
      await new Promise(resolve => this.#wake.add(resolve));
    }
  }
  async command(line) {
    this.#problem(); if (this.#closed) throw new Error('CLI_EXIT command after exit');
    this.#child.stdin.write(line + '\n'); return this.frame();
  }
  send(line) { this.#child.stdin.write(line + '\n'); }
  eof() { this.#child.stdin.end(); }
  interrupt() { this.#child.kill('SIGINT'); }
  async exit() { const result = await this.#close; this.#problem(); return result; }
  async dispose() {
    if (!this.#closed) this.#child.kill('SIGKILL');
    await this.#close; clearTimeout(this.#timer);
    if (!this.#closed) throw new Error('RESIDUE CLI child still alive');
  }
}
