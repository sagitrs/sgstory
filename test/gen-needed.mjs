import { absPath } from '../scripts/dist-paths.mjs';   // `#1267`
// `#1192`：构建期"该不该重编产物"判据的钉子（判据本体在 `scripts/lib/gen-needed.mjs`）。
//
// 要钉住的回归：旧写法是**固定五名清单**配 `.some((f) =>!existsSync(...))`，对只产子集的故事**恒真**
//（`minimal-demo` 只产 `15-tables.twee` 与 `00-meta.twee`，却要判五个名字）。后果两层：每次都全量重编；
// 更隐蔽的一层是**注入与陈旧被静默覆盖**，守卫类判据会读出假绿或"这道门没牙"。
//
// 第一个格子就是那一格的替身：只产子集的清单在产物齐备时必须判"不需要"。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { genNeeds } from '../scripts/lib/gen-needed.mjs';
import { isGeneratedFamily } from '../editor/lib/core/generated-family.mjs';
import { storySlugs } from '../scripts/dist-paths.mjs';   // 故事清单的单一权威（与 build.mjs 同源）

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

// 合成的家族谓词：按名字认产物（测试里不依赖真仓的家族判定）
// 注意：清单里是**全路径**（`stories/<slug>/15-tables.twee`）→ 谓词必须按**基名**判，
// 否则一件都认不出，下面 ① 会变成「没产品 → 不需要」的**空转假绿**（我第一版就栽在这）。
const fam = (f) => /(^|\/)(1[5678]-[a-z0-9-]+\.twee|00-meta\.twee)$/.test(f);

// ① 只产子集且产物齐备 → 不需要（旧写法在这里恒真，是本件的核心回归格）
{
	const declared = ['stories/minimal-demo/00-meta.twee', 'stories/minimal-demo/15-tables.twee'];
	const r = genNeeds({ declared, family: fam, exists: () => true, dataFiles: ['tables.json', 'meta.json'] });
	ok('① 只产子集且产物齐备 ⇒ 不需要重编', r.needed.length === 0, JSON.stringify(r));
	// 反向核：输入不能是空的（否则上面那格是假绿）
	const recognized = declared.filter(fam);
	ok('① 反向核：清单里的产物**确实被认出来**（不然上一格是空转假绿）', recognized.length === 2, `认出 ${recognized.length} 件`);
}

// ② 缺一件 → 恰点名该件
{
	const declared = ['stories/x/00-meta.twee', 'stories/x/15-tables.twee', 'stories/x/17-rules.twee'];
	const r = genNeeds({ declared, family: fam, exists: (f) => !f.endsWith('17-rules.twee'), dataFiles: [] });
	ok('② 缺一件 ⇒ 恰点名该件', r.needed.length === 1 && r.needed[0].endsWith('17-rules.twee'), JSON.stringify(r.needed));
}

// ③ 清单未声明产物而 data/ 有源 → 交给编译器产出（新建故事：先编译后写清单）
{
	const r = genNeeds({ declared: ['stories/new/passages/01-开场.md'], family: fam, exists: () => false, dataFiles: ['tables.json'] });
	ok('③ 清单未声明产物但有源 ⇒ 需要编', r.needed.length === 1, JSON.stringify(r));
}
// ④ 清单未声明且无源 → 不需要
{
	const r = genNeeds({ declared: ['stories/new/passages/01-开场.md'], family: fam, exists: () => false, dataFiles: [] });
	ok('④ 清单未声明产物且无源 ⇒ 不需要', r.needed.length === 0, JSON.stringify(r));
}

// ⑤ 真仓三故事：产物齐备时都不需要重编；逐故事按**自己的清单**判（不是同一个固定清单）
{
	let checked = 0;
	for (const slug of storySlugs().filter((s) => !s.startsWith('__'))) {
		const mf = absPath(`stories/${slug}/00-story.json`);   // `#1267` 尾件①
		if (!existsSync(mf)) continue;
		const declared = JSON.parse(readFileSync(mf, 'utf8')).files ?? [];
		const dataDir = absPath(`stories/${slug}/data`);
		const dataFiles = existsSync(dataDir) ? ['x.json'] : [];
		const r = genNeeds({ declared, family: isGeneratedFamily, exists: () => true, dataFiles });
		ok(`⑤ ${slug}：产物齐备 ⇒ 不需要重编`, r.needed.length === 0, JSON.stringify(r));
		// 该故事声明的产物必须都能被家族谓词认出来（否则"按清单判"会退化成"永远不需要"）
		const fam2 = declared.filter((f) => isGeneratedFamily(f));
		ok(`⑤ ${slug}：清单里有产物被家族谓词认出`, fam2.length > 0, `声明 ${declared.length} 件`);
		checked += 1;
	}
	// ★ `#1343`：**零故事根**（现有态）⇒ **出声未判**（✗ 不判红、✗ 不静默绿）—— 同 `#1321` 的 CLI 半段口径。
	//   为什么：本段要判"按清单该不该重编"，**对象是故事** ⇒ 没有故事时它**无对象可判**（✗ 不是"判过且通过"）。
	if (checked === 0) {
		// ★ 但要分**两态**（✗ 不许把"没用故事根"与"用了却核不到"混同 —— 前者无对象，后者是**接线坏了**）：
		//   · **显式给了故事根**（`SG_STORIES_DIR` 在场）却一件都没核到 ⇒ **红**（接线坏了 ⇒ 覆盖率静默归零 ✗）
		//   · **零故事根**（仓默认态）⇒ 出声"未判"（✗ 不判红、✗ 不静默绿 —— 同 `#1321` 口径 ✓）
		if (String(process.env.SG_STORIES_DIR ?? '').trim()) {
			ok('⑤ 反向核：**给了故事根就必须真核到故事**（✗ 一件都没核到 ⇒ 接线坏了）', false,
				`SG_STORIES_DIR=${process.env.SG_STORIES_DIR} 但核了 0 个故事`);
		} else {
			console.log('  ○ 未判：本段的对象是**故事清单**（零故事根 ⇒ 无对象可判）—— 请用夹具根跑：');
			console.log('     `SG_STORIES_DIR=test/fixtures/gen-needed/stories node test/gen-needed.mjs`（3 个最小故事 ✓）');
			process.exit(0);
		}
	}
	ok('⑤ 反向核：真的核过故事（不是空跑）', checked >= 3, `核了 ${checked} 个故事`);
}

console.log(bad === 0 ? '\n✔ 构建期重编判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
