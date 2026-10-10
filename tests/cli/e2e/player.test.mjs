import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { playCase } from '../support/player.mjs';

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
