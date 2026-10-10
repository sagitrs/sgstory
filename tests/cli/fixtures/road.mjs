// Original, normal player game fixture. No test-only commands or state injection.
const choice = (id, label, enabled = true, reason = '') => ({ id, label, enabled, reason });
export default {
  id: 'road-fixture', version: 1,
  initial() { return { run: { scene: 'start', coins: 2, food: 2, visits: 0 }, progress: { completed: 0 } }; },
  validate(s) {
    return !!s && Object.keys(s).sort().join(',') === 'progress,run' && Object.keys(s.run || {}).sort().join(',') === 'coins,food,scene,visits' && Object.keys(s.progress || {}).join(',') === 'completed' && ['start', 'forest', 'end'].includes(s.run.scene) && ['coins', 'food', 'visits'].every(k => Number.isSafeInteger(s.run[k]) && s.run[k] >= 0 && s.run[k] <= 10000) && Number.isSafeInteger(s.progress.completed) && s.progress.completed >= 0 && s.progress.completed <= 10000;
  },
  view(s) {
    const r = s.run;
    return {
      title: r.scene === 'start' ? '路口' : r.scene === 'forest' ? '林中岔路' : '安全归来',
      text: r.scene === 'start' ? '林道消耗一份粮食，并有随机旅途收获；收费桥需要九枚金币。' : r.scene === 'forest' ? '可以采集补给，也可以带着现有收获返回。' : '本段旅程已结束，完成记录已纳入会话；保存后可跨进程读取。',
      phase: r.scene === 'end' ? 'ended' : 'playing',
      choices: r.scene === 'start' ? [choice('forest', '走林道', r.food >= 1, r.food >= 1 ? '' : '需要一份粮食'), choice('bridge', '走收费桥', r.coins >= 9, r.coins >= 9 ? '' : '需要九枚金币')] : r.scene === 'forest' ? [choice('gather', '采集补给后返回'), choice('return', '直接返回')] : [],
      status: `地点: ${r.scene}；金币: ${r.coins}；粮食: ${r.food}；完成旅程: ${s.progress.completed}`,
      bag: `背包：金币 ${r.coins}，粮食 ${r.food}`,
      map: `地图：路口 -> 林中岔路 -> 安全归来；当前位置 ${r.scene}`,
    };
  },
  apply(s, id, random) {
    const r = s.run;
    if (r.scene === 'start' && id === 'forest') { r.food--; r.coins += random.integer(1, 3, 'route.find-coins'); r.scene = 'forest'; r.visits++; return { kind: 'accepted', outcome: '消耗一份粮食，获得旅途收获，进入林道' }; }
    if (r.scene === 'start' && id === 'bridge') { r.coins -= 9; r.scene = 'forest'; r.visits++; return { kind: 'accepted', outcome: '支付九枚金币，进入林道' }; }
    if (r.scene === 'forest' && ['gather', 'return'].includes(id)) { if (id === 'gather') r.food += random.integer(1, 3, 'forest.find-food'); r.scene = 'end'; s.progress.completed++; return { kind: 'accepted', outcome: id === 'gather' ? '采集补给，完成旅程' : '带着收获完成旅程' }; }
    return { kind: 'refused', reason: '地点已改变，此事件不能重复结算' };
  },
};
