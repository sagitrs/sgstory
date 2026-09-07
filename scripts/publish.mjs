// 发布脚本：构建游戏并推送到公开的发布仓 sagitrs/sgstory-pages 的 gh-pages 分支
// 用法：npm run publish（需要 GitHub 推送权限，鉴权走 gh CLI）
import { execSync } from 'node:child_process';
import { rmSync, cpSync, mkdirSync, readFileSync } from 'node:fs';

const PAGES_REPO = 'sagitrs/sgstory-pages';
const TMP = 'build/pages';

console.log('── 1/4 构建游戏 ──');
execSync('node build.mjs', { stdio: 'inherit' });

console.log('── 2/4 检出发布仓 ──');
rmSync(TMP, { recursive: true, force: true });
execSync(`gh repo clone ${PAGES_REPO} ${TMP} -- --depth 1 --branch gh-pages`, { stdio: 'inherit' });

console.log('── 3/4 更新游戏文件 ──');
cpSync('dist/', `${TMP}/`, { recursive: true, force: true });
cpSync('LICENSE', `${TMP}/LICENSE`);
cpSync('LICENSE-CONTENT.md', `${TMP}/LICENSE-CONTENT.md`);
cpSync('NOTICE', `${TMP}/NOTICE`);
execSync('git add -A', { cwd: TMP });
execSync('git commit -q -m "发布游戏构建产物" --allow-empty', { cwd: TMP });

console.log('── 4/4 推送 gh-pages ──');
execSync('git push origin gh-pages', { cwd: TMP });
rmSync(TMP, { recursive: true, force: true });

console.log(`\n✔ 发布完成：https://sagitrs.github.io/sgstory-pages/ （CDN 生效约需 1-2 分钟）`);
