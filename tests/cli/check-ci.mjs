// Registered CLI trigger/tool/case ledger. Contract YAML is the workflow SSOT.
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
function check(inputs) {
  const expected = inputs.contract.match(/```yaml\n([\s\S]*?)\n```/);
  if (!expected || inputs.workflow.replace(/^(?:#[^\n]*\n)+/, '').trim() !== expected[1].trim()) throw new Error('CLI_CI_CONTRACT workflow differs from published contract');
  const yaml = inputs.workflow;
  const triggers = [...yaml.matchAll(/^  (\w+):$/gm)].map(x => x[1]);
  if (JSON.stringify(triggers) !== JSON.stringify(['pull_request', 'schedule', 'workflow_dispatch', 'cli'])) throw new Error('CLI_CI_TRIGGER unknown on/permission/job shape');
  const paths = [...yaml.matchAll(/^      - '([^']+)'$/gm)].map(x => x[1]);
  if (JSON.stringify(paths) !== JSON.stringify(['.github/workflows/cli-tests.yml', 'src/cli/**', 'tests/cli/**', 'docs/plans/cli/**', 'README.md', 'tests/README.md'])) throw new Error('CLI_CI_PATHS dependency surfaces differ');
  if (!yaml.includes('permissions:\n  contents: read') || (yaml.match(/^      - name:/gm) || []).length !== 5 || !yaml.includes('timeout-minutes: 3') || !yaml.includes('node-version: \'22\'') || !yaml.includes('persist-credentials: false') || !yaml.includes('if: always()')) throw new Error('CLI_CI_BOUNDS Node22/job5/timeout/readonly requirement missing');
  // runner is available at step env, not at job env (Actions context table).
  if (/^    env:$/m.test(yaml) || !yaml.includes('      - name: CLI nonempty families and knives\n        env:\n          TMPDIR: ${{ runner.temp }}\n        run: |')) throw new Error('CLI_CI_CONTEXT runner.temp must be scoped to test step env');
  const permissions = yaml.match(/^permissions:\n((?:  .*\n)*)/m);
  if (!permissions || permissions[1].trim() !== 'contents: read') throw new Error('CLI_CI_PERMISSION contents read only');
  const lines = yaml.split('\n'); const commands = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^        run: /.test(lines[i])) continue;
    const command = lines[i].trim().slice(5);
    if (command === '|') { while (i + 1 < lines.length && /^          \S/.test(lines[i + 1])) commands.push(lines[++i].trim()); }
    else commands.push(command);
  }
  const permitted = ['node tests/cli/check-ci.mjs', 'node tests/cli/run-unit.mjs', 'node tests/cli/run-e2e.mjs', 'node tests/cli/run-unit.mjs --selftest', 'node tests/cli/run-e2e.mjs --selftest', 'git status --porcelain=v1 --untracked-files=all > "$RUNNER_TEMP/cli-status"; test ! -s "$RUNNER_TEMP/cli-status"'];
  if (JSON.stringify(commands) !== JSON.stringify(permitted)) throw new Error('CLI_CI_COMMAND unknown or missing command');
  for (const suite of ['unit', 'e2e']) {
    const data = inputs.registry[suite];
    if (!data?.cases?.length || !data.files?.length || JSON.stringify([...inputs.names[suite]].sort()) !== JSON.stringify([...data.cases].sort())) throw new Error(`CLI_CI_REGISTRY ${suite} nonempty names mismatch`);
    for (const command of [`node tests/cli/run-${suite}.mjs`, `node tests/cli/run-${suite}.mjs --selftest`]) if (!yaml.split('\n').some(x => x.trim() === command)) throw new Error(`CLI_CI_COMMAND ${command}`);
    if (!data.cases.includes(data.knife?.target) || !inputs.readme.includes(`run-${suite}.mjs`) || !inputs.rootReadme.includes('tests/cli/')) throw new Error(`CLI_CI_REGISTRY ${suite} tool/knife not registered`);
  }
}
try {
  const read = relative => fs.readFile(path.join(ROOT, relative), 'utf8');
  const registry = JSON.parse(await read('tests/cli/registry.json')); const names = {};
  for (const suite of ['unit', 'e2e']) {
    names[suite] = [];
    const actual = (await fs.readdir(path.join(ROOT, `tests/cli/${suite}`))).filter(x => x.endsWith('.test.mjs')).map(x => `tests/cli/${suite}/${x}`).sort();
    if (JSON.stringify(actual) !== JSON.stringify(registry[suite]?.files)) throw new Error(`APPARATUS ${suite} missing or unregistered file`);
    for (const relative of actual) names[suite].push(...[...(await read(relative)).matchAll(/\btest\('([^']+)'/g)].map(x => x[1]));
    for (const relative of [`tests/cli/run-${suite}.mjs`, registry[suite].knife.path]) await read(relative);
  }
  const inputs = { workflow: await read('.github/workflows/cli-tests.yml'), contract: await read('docs/plans/cli/test-contract.md'), readme: await read('tests/README.md'), rootReadme: await read('README.md'), registry, names };
  check(inputs);
  // Mutations exercise the live checker, not a reimplementation. No source file edits.
  const controls = [
    ['push-main', x => { x.workflow += '\n  push:\n'; }],
    ['omit-unit-call', x => { x.workflow = x.workflow.replace('          node tests/cli/run-unit.mjs\n', ''); }],
    ['empty-e2e-registry', x => { x.registry.e2e.cases = []; }],
    ['omit-README-tool', x => { x.readme = x.readme.replaceAll('run-e2e.mjs', 'removed'); }],
    ['unknown-command', x => { const old = '          node tests/cli/run-unit.mjs\n'; const next = '          echo unregistered\n' + old; x.workflow = x.workflow.replace(old, next); x.contract = x.contract.replace(old, next); }],
    ['runner-context-at-job-env', x => { const old = '    steps:\n'; const next = '    env:\n      TMPDIR: ${{ runner.temp }}\n' + old; x.workflow = x.workflow.replace(old, next); x.contract = x.contract.replace(old, next); }],
  ];
  for (const [name, mutate] of controls) {
    const copy = structuredClone(inputs); mutate(copy); let rejected = false;
    try { check(copy); } catch { rejected = true; }
    if (!rejected) throw new Error(`CLI_CI_SELFTEST ${name} false green`);
    console.log(`CLI CI control ${name}: rejected=true`);
  }
  check(inputs);
  console.log(`CLI CI registry: paths=6 steps=5 unit=${registry.unit.cases.length} e2e=${registry.e2e.cases.length}; controls=6/6; baseline/restored=true`);
} catch (error) { console.error(`${error.code || 'CLI_CI'}: ${error.message}`); process.exitCode = /APPARATUS/.test(error.message) || ['ENOENT', 'EACCES'].includes(error.code) ? 2 : 1; }
