// `#794`：core 层「故事包 I/O ＝ 唯一写路」的自证（核心逻辑在 `editor/lib/core/story.mjs` 里 ✓，
// 这里只做一件事：把它跑起来并按退出码报结果 —— 与其它 `editor-*-selftest` 条目同形 ✓）。
import { selftestStory } from '../editor/lib/core/story.mjs';

const bad = selftestStory();
if (bad) { console.error(`\n✗ core-story：${bad} 例失败`); process.exit(1); }
console.log('\n✔ core-story：故事包 I/O 自证通过（含写侧哨兵）');
