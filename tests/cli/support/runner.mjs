import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const budgets = { unit: 30000, e2e: 75000 };
const TEMP_ROOT = process.env.TMPDIR || path.join(os.homedir(), 'tmp');
async function registry(root) { return JSON.parse(await fs.readFile(path.join(root, 'tests/cli/registry.json'), 'utf8')); }
async function fingerprint(root) {
  const git = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  if (git.error || git.status !== 0) throw new Error('APPARATUS engine tree is not readable git');
  const hash = createHash('sha256');
  async function visit(relative) {
    const full = path.join(root, relative); const stat = await fs.lstat(full);
    if (stat.isDirectory()) for (const name of (await fs.readdir(full)).sort()) await visit(path.join(relative, name));
    else if (stat.isFile()) { hash.update(relative); hash.update(await fs.readFile(full)); }
    else throw new Error('APPARATUS unsupported CLI tree entry');
  }
  await visit('src/cli'); await visit('tests/cli');
  return { git: git.stdout, sha256: hash.digest('hex') };
}
function groupAlive(pid) { try { process.kill(-pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } }
function killOwnedGroup(pid) { try { process.kill(-pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
async function execute(root, files, temp, suite) {
  // Linux process group belongs only to this test launch, including its CLI children.
  if (process.platform !== 'linux') throw new Error('APPARATUS family runner requires Linux process groups');
  const child = spawn(process.execPath, ['--test', '--test-reporter=tap', '--test-timeout=25000', ...files], { cwd: root, detached: true, env: { ...process.env, CLI_TEST_ROOT: temp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let problem = ''; let timer;
  function add(data) {
    output += data;
    if (Buffer.byteLength(output) > 4 * 1024 * 1024 && !problem) { problem = 'APPARATUS test output exceeded 4MiB'; killOwnedGroup(child.pid); }
  }
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data', add); child.stderr.on('data', add);
  const result = await new Promise(resolve => {
    child.once('error', e => { problem = `APPARATUS node launch ${e.code}`; });
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    timer = setTimeout(() => { problem = `TIMEOUT ${suite} family ${budgets[suite]}ms`; killOwnedGroup(child.pid); }, budgets[suite]);
  });
  if (child.pid && groupAlive(child.pid)) { killOwnedGroup(child.pid); problem ||= 'APPARATUS residual test process group'; }
  return { ...result, output, problem };
}
function count(output, key) { const m = output.match(new RegExp(`^# ${key} (\\d+)$`, 'm')); return m ? Number(m[1]) : null; }
export async function runSuite(suite, root = ROOT, evidence = null) {
  let temp; let data; let before; const started = performance.now();
  try {
    data = (await registry(root))[suite];
    if (!data || !Array.isArray(data.cases) || !data.cases.length || new Set(data.cases).size !== data.cases.length) throw new Error('APPARATUS empty or duplicate case registry');
    const actual = (await fs.readdir(path.join(root, `tests/cli/${suite}`))).filter(x => x.endsWith('.test.mjs')).map(x => `tests/cli/${suite}/${x}`).sort();
    if (!actual.length || JSON.stringify(actual) !== JSON.stringify(data.files)) throw new Error('APPARATUS missing or unregistered test file');
    before = await fingerprint(root); await fs.mkdir(TEMP_ROOT, { recursive: true }); temp = await fs.mkdtemp(path.join(TEMP_ROOT, `sgstory-cli-${suite}-`));
    const result = await execute(root, actual, temp, suite); process.stdout.write(result.output);
    if (evidence) Object.assign(evidence, result);
    const residue = await fs.readdir(temp); const after = await fingerprint(root);
    if (residue.length) result.problem ||= `APPARATUS RESIDUE ${suite}: ${residue.join(',')}`;
    if (JSON.stringify(before) !== JSON.stringify(after)) result.problem ||= `APPARATUS READONLY ${suite} source tree changed`;
    const names = [...result.output.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1]);
    const total = count(result.output, 'tests'), skipped = count(result.output, 'skipped'), cancelled = count(result.output, 'cancelled'), todo = count(result.output, 'todo'), pass = count(result.output, 'pass'), fail = count(result.output, 'fail');
    if (/testTimeoutFailure/.test(result.output)) result.problem ||= `TIMEOUT ${suite} named Node test exceeded 25000ms`;
    if (!total || total !== data.cases.length || names.length !== total || JSON.stringify([...names].sort()) !== JSON.stringify([...data.cases].sort()) || [pass, fail, skipped, cancelled, todo].includes(null) || pass + fail + skipped + cancelled + todo !== total) result.problem ||= 'APPARATUS nonempty count/name registry mismatch';
    if (result.problem) {
      console.error(result.problem);
      console.log(`${suite}: 通过=0 产品失败=0 环境作废=${data.cases.length} 未覆盖=0 问题总数=${data.cases.length} 套件计划总数=${data.cases.length}; family invalid (raw TAP separate)`);
      return 2;
    }
    let environment = 0;
    const parts = result.output.split(/^# Subtest: /m).slice(1);
    for (const part of parts) if (/^not ok /m.test(part) && /(?:TIMEOUT|APPARATUS|testTimeoutFailure)/.test(part)) environment++;
    const product = fail - environment; const uncovered = skipped + cancelled + todo; const problems = product + environment + uncovered;
    console.log(`${suite}: 通过=${pass} 产品失败=${product} 环境作废=${environment} 未覆盖=${uncovered} 问题总数=${problems} 套件计划总数=${pass + problems}; ${(performance.now() - started).toFixed(1)}ms`);
    if (environment || cancelled) return 2;
    if (problems || result.code !== 0) return 1;
    return 0;
  } catch (error) {
    console.error(`APPARATUS ${suite}: ${error.message}`);
    if (data?.cases?.length) console.log(`${suite}: 通过=0 产品失败=0 环境作废=${data.cases.length} 未覆盖=0 问题总数=${data.cases.length} 套件计划总数=${data.cases.length}`);
    else console.log(`${suite}: 套件计划总数未知，登记不可核；不得判绿`);
    return 2;
  } finally { if (temp) await fs.rm(temp, { recursive: true, force: true }); }
}
export async function selftest(suite) {
  const original = (await registry(ROOT))[suite]?.knife;
  if (!original) throw new Error('APPARATUS missing knife registry');
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  const owned = await fs.mkdtemp(path.join(TEMP_ROOT, `sgstory-cli-${suite}-knife-`));
  const root = path.join(owned, 'tree');
  try {
    for (const relative of ['src/cli', 'tests/cli']) await fs.cp(path.join(ROOT, relative), path.join(root, relative), { recursive: true });
    const init = spawnSync('git', ['init', '--quiet', '-b', 'fixture'], { cwd: root, encoding: 'utf8' });
    if (init.error || init.status !== 0) throw new Error('APPARATUS cannot init knife fixture git');
    const target = path.join(root, original.path); const bytes = await fs.readFile(target); const text = bytes.toString('utf8');
    if (text.split(original.anchor).length !== 2) throw new Error(`APPARATUS ${suite} knife missing unique anchor`);
    const baseline = await runSuite(suite, root);
    await fs.writeFile(target, text.replace(original.anchor, original.replacement));
    const evidence = {}; const mutant = await runSuite(suite, root, evidence);
    const escaped = original.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hit = mutant === 1 && new RegExp(`^not ok \\d+ - ${escaped}$`, 'm').test(evidence.output || '') && !evidence.problem;
    await fs.writeFile(target, bytes);
    const restored = await runSuite(suite, root); const same = (await fs.readFile(target)).equals(bytes);
    console.log(`${suite} knife ${original.name}: baseline=${baseline} mutant=${mutant} named=${hit} restored=${restored} byteSame=${same}; selftest=${baseline === 0 && hit && restored === 0 && same ? '4/4' : 'red'}`);
    return baseline === 0 && hit && restored === 0 && same ? 0 : [baseline, mutant, restored].includes(2) ? 2 : 1;
  } catch (error) { console.error(`APPARATUS ${suite} knife: ${error.message}`); return 2; }
  finally {
    await fs.rm(owned, { recursive: true, force: true });
    try { await fs.access(owned); throw new Error('RESIDUE knife directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function entry(suite) {
  if (process.argv.slice(2).length > 1 || (process.argv[2] && process.argv[2] !== '--selftest')) { console.error('APPARATUS usage: --selftest or no args'); process.exitCode = 2; return; }
  try { process.exitCode = process.argv[2] === '--selftest' ? await selftest(suite) : await runSuite(suite); }
  catch (error) { console.error(`APPARATUS ${suite} entry: ${error.message}`); process.exitCode = 2; }
}
