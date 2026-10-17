#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import { Session } from './session.mjs';
import { Store } from './storage.mjs';
import { boundedDiagnostic, DIAGNOSTIC_BYTES } from './json.mjs';
import { failureText, truncationNotice } from './report.mjs';
const HELP = '数字：选择当前选项；0：返回上一级；负数：选择防呆选项\ninspect：打开诊断浏览页（正数进入条目，0返回上一级，负数在--debug下把条目JSON打印到stderr）\nhelp：命令说明；status：状态；bag：背包；map：地图\nsave 档名：保存；load 档名：读取；quit：退出\n查询、诊断与拒绝不消耗随机；退出/EOF/中断不自动保存。';
function config(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  const out = {}; const flags = new Set(['--game', '--seed', '--save-dir']); let debug = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--debug') { if (debug) throw new Error('参数缺失、重复或未知'); debug = true; continue; }
    if (!flags.has(flag) || !args[i + 1] || Object.hasOwn(out, flag)) throw new Error('参数缺失、重复或未知');
    out[flag] = args[++i];
  }
  if (!out['--game']) throw new Error('须用--game指定可信本地游戏模块');
  const seed = out['--seed'] === undefined ? randomBytes(4).readUInt32LE() : Number(out['--seed']);
  if (out['--seed'] !== undefined && !/^(0|[1-9]\d*)$/.test(out['--seed'])) throw new Error('seed须为十进制整数');
  return { game: path.resolve(out['--game']), seed, directory: path.resolve(out['--save-dir'] || '.sgstory-cli'), debug };
}
// Terminal adapter only: input routing, browsing stack and rendering. Save/load text lives in report.mjs.
async function main() {
  let options; let session;
  try {
    options = config(process.argv.slice(2));
    if (!options) { console.log('用法：node src/cli/main.mjs --game 游戏.mjs [--seed 整数] [--save-dir 目录] [--debug]\n' + HELP); return; }
    const game = (await import(pathToFileURL(options.game).href)).default;
    session = new Session(game, options.seed);
  } catch (error) { console.error(`启动失败 [${error.code || 'CONFIG'}]: ${error.message}`); process.exitCode = 2; return; }
  const store = new Store(options.directory);
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  let quitting = false; let interrupted = false;
  const interrupt = () => { interrupted = true; input.close(); process.exitCode = 130; };
  const brokenPipe = error => { if (error.code === 'EPIPE') { quitting = true; input.close(); process.exitCode = 141; } else throw error; };
  process.on('SIGINT', interrupt); process.stdout.on('error', brokenPipe);
  // Browsing stack: only in memory, never part of a save. Empty stack means the action page.
  let stack = [];
  const browsing = () => stack.length > 0;
  const refusal = result => console.log(`${result.kind === 'refused' ? '拒绝' : '失败'} [${result.code}]：${result.reason}；会话未改变。`);
  const choiceText = choice => `${choice.label}${choice.enabled ? '' : `（不可选：${choice.reason}）`}`;
  function render() {
    const { view } = session.frame();
    console.log(`${view.title}\n${view.text}`);
    const normal = view.choices.filter(c => c.intent === 'normal');
    const guarded = view.choices.filter(c => c.intent === 'guarded');
    normal.forEach((c, i) => console.log(`${i + 1}. ${choiceText(c)}`));
    if (normal.length && guarded.length) console.log('');
    guarded.forEach((c, i) => console.log(`${-i - 1}. ${choiceText(c)}`));
    if (view.phase === 'ended') console.log('挑战结束；可保存、读取或退出。');
  }
  function renderPage() {
    const { page } = stack[stack.length - 1];
    console.log(`${page.title}\n${page.text}`);
    page.entries.forEach((e, i) => console.log(`${i + 1}. ${e.label}${Object.hasOwn(e, 'count') ? `（共 ${e.count} 项）` : ''}`));
  }
  const prompt = () => console.log('等待输入>');
  function selectChoice(intent, index) {
    const frame = session.frame();
    const selected = frame.view.choices.filter(c => c.intent === intent)[index - 1];
    const result = session.choose(selected?.id, frame.boundary);
    if (result.kind !== 'accepted') { refusal(result); return false; }
    stack = [];
    console.log(`已受理：${result.outcome}`); render(); return true;
  }
  function enterInspect() {
    const frame = session.frame();
    const result = session.inspect(null, frame.boundary);
    if (result.kind !== 'inspected') { refusal(result); return; }
    // Re-entering inspect always restarts at the root page.
    stack = [{ target: result.target, page: result.page }]; renderPage();
  }
  function inspectEntry(index) {
    const entry = stack[stack.length - 1].page.entries[index - 1];
    if (!entry) { console.log('拒绝 [UNKNOWN_CHOICE]：诊断页没有这个编号的条目；会话未改变。'); return; }
    const result = session.inspect(entry.id, session.frame().boundary);
    if (result.kind !== 'inspected') { refusal(result); return; }
    stack.push({ target: result.target, page: result.page }); renderPage();
  }
  function inspectDebug() {
    const { page } = stack[stack.length - 1];
    if (!options.debug) { console.log('拒绝 [DEBUG_DISABLED]：诊断输出未开启，请用--debug启动；会话未改变。'); return; }
    if (!Object.hasOwn(page, 'data')) { console.log('拒绝 [DEBUG_NO_DATA]：当前条目没有诊断数据；会话未改变。'); return; }
    const dump = boundedDiagnostic(page.data);
    if (dump.truncated) console.error(truncationNotice(dump.bytes, DIAGNOSTIC_BYTES));
    console.error(dump.text);
  }
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
        else if (line === 'inspect') enterInspect();
        else if (parts.length === 2 && ['save', 'load'].includes(parts[0])) {
          const saving = parts[0] === 'save';
          try {
            if (saving) { await store.save(session, parts[1]); if (!interrupted) console.log(`已保存：${parts[1]}`); }
            else { await store.load(session, parts[1]); committed = true; if (!interrupted) { console.log(`已读取：${parts[1]}`); stack = []; render(); } }
          } catch (error) { console.log(failureText(saving, error, committed)); }
        } else if (line === '0') {
          if (!browsing()) console.log('拒绝 [NAV_NO_PARENT]：没有可返回的上级页面；会话未改变。');
          else { stack.pop(); if (browsing()) renderPage(); else render(); }
        } else if (/^-[1-9]\d*$/.test(line)) {
          if (browsing()) inspectDebug(); else committed = selectChoice('guarded', Number(line.slice(1)));
        } else if (/^[1-9]\d*$/.test(line)) {
          if (browsing()) inspectEntry(Number(line)); else committed = selectChoice('normal', Number(line));
        } else console.log('拒绝：未知命令或格式；输入help。会话未改变。');
      } catch (error) { console.log(`失败 [${error.code || 'VIEW_EXCEPTION'}]：无法显示或处理当前输入；${committed ? '动作已提交，请勿盲目重试' : '会话未改变'}。`); }
      if (interrupted || quitting) break;
      prompt();
    }
    if (interrupted) console.log('已中断；未自动保存，已完成的保存保留。');
    else if (!quitting) console.log('输入结束；未自动保存。');
  } finally { input.close(); process.off('SIGINT', interrupt); process.stdout.off('error', brokenPipe); }
}
await main();
