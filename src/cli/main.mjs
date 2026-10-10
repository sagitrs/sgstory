#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import { Session } from './session.mjs';
import { Store } from './storage.mjs';
const HELP = '数字：选择当前选项\nhelp：命令说明；status：状态；bag：背包；map：地图\nsave 档名：保存；load 档名：读取；quit：退出\n查询与拒绝不消耗随机；退出/EOF/中断不自动保存。';
function config(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  const out = {}; const flags = new Set(['--game', '--seed', '--save-dir']);
  for (let i = 0; i < args.length; i += 2) {
    if (!flags.has(args[i]) || !args[i + 1] || Object.hasOwn(out, args[i])) throw new Error('参数缺失、重复或未知');
    out[args[i]] = args[i + 1];
  }
  if (!out['--game']) throw new Error('须用--game指定可信本地游戏模块');
  const seed = out['--seed'] === undefined ? randomBytes(4).readUInt32LE() : Number(out['--seed']);
  if (out['--seed'] !== undefined && !/^(0|[1-9]\d*)$/.test(out['--seed'])) throw new Error('seed须为十进制整数');
  return { game: path.resolve(out['--game']), seed, directory: path.resolve(out['--save-dir'] || '.sgstory-cli') };
}
async function main() {
  let options; let session;
  try {
    options = config(process.argv.slice(2));
    if (!options) { console.log('用法：node src/cli/main.mjs --game 游戏.mjs [--seed 整数] [--save-dir 目录]\n' + HELP); return; }
    const game = (await import(pathToFileURL(options.game).href)).default;
    session = new Session(game, options.seed);
  } catch (error) { console.error(`启动失败 [${error.code || 'CONFIG'}]: ${error.message}`); process.exitCode = 2; return; }
  const store = new Store(options.directory);
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  let quitting = false; let interrupted = false;
  const interrupt = () => { interrupted = true; input.close(); process.exitCode = 130; };
  const brokenPipe = error => { if (error.code === 'EPIPE') { quitting = true; input.close(); process.exitCode = 141; } else throw error; };
  process.on('SIGINT', interrupt); process.stdout.on('error', brokenPipe);
  function render() {
    const { view } = session.frame();
    console.log(`${view.title}\n${view.text}`);
    view.choices.forEach((c, i) => console.log(`${i + 1}. ${c.label}${c.enabled ? '' : `（不可选：${c.reason}）`}`));
    if (view.phase === 'ended') console.log('挑战结束；可保存、读取或退出。');
  }
  const prompt = () => console.log('等待输入>');
  try {
    console.log(`纯文本冒险；启动seed=${options.seed}。输入help查看命令。`); render(); prompt();
    for await (const raw of input) {
      if (quitting || interrupted) break;
      const line = raw.trim(); const parts = line.split(/\s+/); let committed = false;
      try {
        if (!line || line.length > 256) console.log('拒绝：输入为空或过长；会话未改变。');
        else if (line === 'quit') { quitting = true; console.log('已退出；未自动保存。'); input.close(); break; }
        else if (line === 'help') console.log(HELP);
        else if (['status', 'bag', 'map'].includes(line)) console.log(session.query(line));
        else if (parts.length === 2 && ['save', 'load'].includes(parts[0])) {
          try {
            if (parts[0] === 'save') { await store.save(session, parts[1]); if (!interrupted) console.log(`已保存：${parts[1]}`); }
            else { await store.load(session, parts[1]); committed = true; if (!interrupted) { console.log(`已读取：${parts[1]}`); render(); } }
          } catch (error) { console.log(`${parts[0] === 'save' ? '保存' : '读取'}失败 [${error.code || 'IO'}]：${committed ? '读取已提交但显示失败，请勿盲目重试' : '会话未改变'}；已存在档案的耐久性不作保证。`); }
        } else if (/^[1-9]\d*$/.test(line)) {
          const frame = session.frame(); const selected = frame.view.choices[Number(line) - 1];
          const result = session.choose(selected?.id, frame.boundary);
          if (result.kind === 'accepted') { committed = true; console.log(`已受理：${result.outcome}`); render(); }
          else console.log(`${result.kind === 'refused' ? '拒绝' : '失败'} [${result.code}]：${result.reason}；会话未改变。`);
        } else console.log('拒绝：未知命令或格式；输入help。会话未改变。');
      } catch (error) { console.log(`失败 [${error.code || 'VIEW_EXCEPTION'}]：无法显示或处理当前动作；${committed ? '动作已提交，请勿盲目重试' : '会话未改变'}。`); }
      if (interrupted || quitting) break;
      prompt();
    }
    if (interrupted) console.log('已中断；未自动保存，已完成的保存保留。');
    else if (!quitting) console.log('输入结束；未自动保存。');
  } finally { input.close(); process.off('SIGINT', interrupt); process.stdout.off('error', brokenPipe); }
}
await main();
