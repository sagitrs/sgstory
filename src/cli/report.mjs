// Player-facing text for save and load failures, and for the bounded diagnostic dump.
// It lives apart from the terminal loop so the obsolete-save matrix (interface version and
// game version) and the truncation notice can be asserted directly, without crafting a save
// file from a player test.
const BAD_SAVE = new Set(['SAVE_JSON', 'SAVE_SIZE', 'SAVE_REVISION']);
export function failureText(saving, error, committed) {
  const code = error.code || 'IO';
  const state = committed ? '读取已提交但显示失败，请勿盲目重试' : '会话未改变';
  if (saving) return `保存失败 [${code}]：${error.message}；${state}；已存在档案的耐久性不作保证。`;
  if (code === 'SAVE_SLOT') return `档名非法：${error.message}；当前会话未改变。`;
  // Only the interface-version path can be an old save; a game-version mismatch is a current
  // interface with different game content, so it must not claim to be an old save.
  if (code === 'SAVE_VERSION') return `旧存档不可用（本版不支持迁移）：${error.message}；当前会话未改变。`;
  if (code === 'SAVE_GAME') return `存档不可用（游戏版本不符）：${error.message}；当前会话未改变。`;
  if (BAD_SAVE.has(code)) return `存档不可读或已损坏：${error.message}；当前会话未改变。`;
  return `读取失败 [${code}]：${error.message}；${state}；已存在档案的耐久性不作保证。`;
}
export function truncationNotice(bytes, limit) {
  return `[DEBUG_TRUNCATED] 诊断数据 ${bytes} 字节超过 ${limit} 字节，已截断输出；会话未改变。`;
}
