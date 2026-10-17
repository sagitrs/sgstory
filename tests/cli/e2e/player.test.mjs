import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { playCase, boot } from '../support/player.mjs';
// stderr and stdout travel on separate pipes: give the child a bounded moment to flush.
const settle = async (read, want) => { for (let i = 0; i < 100 && !want.test(read()); i++) await new Promise(resolve => setTimeout(resolve, 5)); return read(); };

test('player choices queries refusal and full ending', () => playCase(async create => {
  const p = create(); assert.match(await p.frame(), /路口/);
  const before = await p.command('status');
  assert.match(await p.command('help'), /save 档名/);
  assert.match(await p.command('bag'), /背包/);
  assert.match(await p.command('map'), /地图/);
  assert.match(await p.command('nonsense'), /拒绝：未知命令/);
  assert.match(await p.command('2'), /拒绝 \[CONDITION\]/);
  assert.equal(await p.command('status'), before);
  assert.match(await p.command('1'), /林中岔路/);
  assert.match(await p.command('status'), /动作数: 1；随机消费: 1/);
  assert.match(await p.command('1'), /挑战结束/);
  const end = await p.command('status'); assert.match(end, /完成旅程: 1/);
  assert.match(await p.command('1'), /拒绝 \[UNKNOWN_CHOICE\]/);
  assert.equal(await p.command('status'), end);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
  assert.doesNotMatch(p.stdout + p.stderr, /\x1b/);
}));
test('player saves exits restarts loads and continues', () => playCase(async create => {
  const a = create(); await a.frame(); assert.match(await a.command('1'), /林中岔路/);
  const status = await a.command('status'); assert.match(await a.command('save camp'), /已保存：camp/);
  a.send('quit'); assert.equal((await a.exit()).code, 0);
  const b = create(); await b.frame();
  assert.match(await b.command('load camp'), /已读取：camp[\s\S]*林中岔路/);
  assert.equal(await b.command('status'), status);
  assert.match(await b.command('2'), /挑战结束/);
  b.send('quit'); assert.equal((await b.exit()).code, 0);
}));
test('player EOF exits without automatic save', () => playCase(async (create, dir) => {
  const p = create(); await p.frame(); await p.command('1'); p.eof(); assert.equal((await p.exit()).code, 0);
  assert.match(p.stdout, /输入结束；未自动保存/); assert.deepEqual(await fs.readdir(dir), []);
}));
test('player SIGINT at waiting boundary exits without save', () => playCase(async (create, dir) => {
  const p = create(); await p.frame(); p.interrupt(); assert.equal((await p.exit()).code, 130);
  assert.match(p.stdout, /已中断；未自动保存/); assert.deepEqual(await fs.readdir(dir), []);
}));
test('player redirected Chinese commands remain line based', () => playCase(async create => {
  const p = create(); await p.frame();
  for (const line of ['help', 'status', '1', 'save pipe', 'quit']) p.send(line);
  p.eof(); assert.equal((await p.exit()).code, 0);
  assert.match(p.stdout, /数字：选择当前选项/); assert.match(p.stdout, /林中岔路/); assert.match(p.stdout, /已保存：pipe/); assert.match(p.stdout, /已退出/);
  assert.equal(p.stderr, ''); assert.doesNotMatch(p.stdout, /\x1b/);
}));
test('player zero returns and negative selects a guarded action', () => playCase(async create => {
  const p = create(); await p.frame();
  assert.match(await p.command('0'), /拒绝 \[NAV_NO_PARENT\]/);
  assert.match(await p.command('-2'), /拒绝 \[UNKNOWN_CHOICE\]/);
  assert.match(await p.command('-1'), /已受理：原地休整/);
  assert.match(await p.command('status'), /动作数: 1；随机消费: 0/);
  assert.match(await p.command('1'), /林中岔路/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
}));
test('player inspect browses entries and refuses debug without the flag', () => playCase(async create => {
  const p = create(); await p.frame();
  assert.match(await p.command('inspect'), /诊断页/);
  assert.match(await p.command('1'), /背包/);
  assert.match(await p.command('-1'), /拒绝 \[DEBUG_DISABLED\]/);
  assert.match(await p.command('9'), /拒绝 \[UNKNOWN_CHOICE\]/);
  assert.match(await p.command('0'), /诊断页/);
  assert.match(await p.command('2'), /本局/);
  assert.match(await p.command('-1'), /拒绝 \[DEBUG_DISABLED\]/);
  assert.match(await p.command('0'), /诊断页/);
  assert.match(await p.command('0'), /路口/);
  assert.match(await p.command('0'), /拒绝 \[NAV_NO_PARENT\]/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
  assert.equal(p.stderr, '');
}));
test('player debug prints entry data on stderr only', () => playCase(async create => {
  const p = create(['--debug']); await p.frame();
  assert.match(await p.command('inspect'), /诊断页/);
  assert.match(await p.command('1'), /背包/);
  await p.command('-1');
  assert.equal(await settle(() => p.stderr, /coins/), '{"coins":2,"food":2}\n');
  assert.doesNotMatch(p.stdout, /"coins"/);
  assert.match(await p.command('2'), /拒绝 \[INSPECT_NO_TARGET\]/);
  assert.match(await p.command('0'), /诊断页/);
  assert.match(await p.command('2'), /本局/);
  assert.match(await p.command('-1'), /拒绝 \[DEBUG_NO_DATA\]/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
}));
test('player rejects non canonical numbers as unknown input', () => playCase(async create => {
  const p = create(); await p.frame();
  for (const line of ['-0', '01', '+1', '-']) assert.match(await p.command(line), /拒绝：未知命令或格式/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
}));
test('player debug truncates a page larger than the diagnostic bound', () => playCase(async create => {
  const p = create(['--debug']); await p.frame();
  assert.match(await p.command('inspect'), /诊断页/);
  assert.match(await p.command('3'), /规则/);
  await p.command('-1');
  const notice = await settle(() => p.stderr, /DEBUG_TRUNCATED/);
  assert.match(notice, /^\[DEBUG_TRUNCATED\] 诊断数据 \d+ 字节超过 65536 字节，已截断输出；会话未改变。\n/);
  assert.ok(Buffer.byteLength(p.stderr) <= 64 * 1024 + 200);
  assert.doesNotMatch(p.stdout, /"note"/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
}));
test('player inspect works after the run ends', () => playCase(async create => {
  const p = create(); await p.frame();
  assert.match(await p.command('1'), /林中岔路/);
  assert.match(await p.command('1'), /挑战结束/);
  assert.match(await p.command('inspect'), /诊断页/);
  assert.match(await p.command('2'), /本局/);
  assert.match(await p.command('0'), /诊断页/);
  assert.match(await p.command('0'), /挑战结束/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
}));
test('player reentering inspect resets the browsing stack', () => playCase(async create => {
  const p = create(); await p.frame();
  assert.match(await p.command('inspect'), /诊断页/);
  assert.match(await p.command('1'), /背包/);
  assert.match(await p.command('inspect'), /诊断页/);
  assert.match(await p.command('0'), /路口/);
  assert.match(await p.command('0'), /拒绝 \[NAV_NO_PARENT\]/);
  p.send('quit'); assert.equal((await p.exit()).code, 0);
}));
test('player debug argument shapes are accepted or refused by name', async () => {
  const last = await boot(['--debug']);
  assert.equal(last.code, 0); assert.match(last.stdout, /输入结束/); assert.equal(last.stderr, '');
  const middle = await boot(['--debug', '--seed', '42']);
  assert.equal(middle.code, 0); assert.match(middle.stdout, /启动seed=42/);
  for (const args of [['--debug', '--debug'], ['--debug', '1'], ['--debug=1']]) {
    const refused = await boot(args);
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /启动失败 \[CONFIG\]: 参数缺失、重复或未知/);
  }
});
