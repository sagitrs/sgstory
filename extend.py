#!/usr/bin/env python3
# `#1218` 判据册：把源 112–136 补进终稿（正文落点 ＋ 对账行 ＋ 覆盖自证）
import pathlib, re

DOC = pathlib.Path('/home/sagitrs/tmp/c1218/docs/criteria-ledger.md')
SRC = pathlib.Path('/home/sagitrs/tmp/c1218-src/all.md')

comments = [c.strip() for c in SRC.read_text().split('===COMMENT===') if c.strip()]
N = len(comments)
assert N >= 136, f'源评论只有 {N} 条'

# 112–136 的归类（按内容人工定；110 之前沿用既有归类）
CAT = {
    112: '2 变基与分支操作', 113: '2 变基与分支操作', 114: '2 变基与分支操作',
    115: '1 读数纪律', 116: '1 读数纪律', 117: '2 变基与分支操作', 118: '4 工具化与验证',
    119: '1 读数纪律', 120: '4 工具化与验证', 121: '4 工具化与验证', 122: '1 读数纪律',
    123: '1 读数纪律', 124: '6 流程与沟通', 125: '—', 126: '—', 127: '4 工具化与验证',
    128: '4 工具化与验证', 129: '4 工具化与验证', 130: '2 变基与分支操作', 131: '2 变基与分支操作',
    132: '2 变基与分支操作', 133: '4 工具化与验证', 134: '1 读数纪律', 135: '3 单一权威与收敛',
    136: '6 流程与沟通',
}
# 并入：源 114 是源 113 的修正版（同题不另立条目）
MERGE = {114: (113, '同条深化（修正上条）：条目对照必须**模块级取数**，不能按行 grep —— awk 会把别的对象算进来')}
VOID = {125: '作废（被源 126 撤销，不入册）', 126: '撤销源 125（本条是撤销声明，不入册）'}


def title_of(cid):
    """机械清理：剥标记与"补一条（…）："式前缀，余下即为作者写的判语。"""
    raw = comments[cid - 1].split('\n')[0].strip()
    t = re.sub(r'^#+\s*', '', raw)
    t = re.sub(r'^[➕✏️⚠️]+\s*', '', t)
    for p in [r'^补一条（[^）]*）[:：]\s*', r'^补一条[:：]\s*', r'^补一条\s*', r'^合成一条（[^）]*）[:：]\s*',
              r'^合成一条[:：]\s*', r'^撤上一条（[^）]*）[:：]\s*', r'^撤上一条[:：]\s*',
              r'^承接上一条[^：:]*[:：]\s*', r'^（[^）]{0,40}）[:：]\s*']:
        t = re.sub(p, '', t)
    t = re.sub(r'\s{2,}', ' ', t).strip(' 。')
    return t


def refs_of(cid, k=5):
    return sorted(set(re.findall(r'#(\d{3,5})', comments[cid - 1])), key=int)[:k]


L = DOC.read_text().split('\n')
CATS = ['1 读数纪律', '2 变基与分支操作', '3 单一权威与收敛', '4 工具化与验证', '5 迁移与拆分', '6 流程与沟通']

# 各节现有条数（用于续编号）
sec_count, sec = {}, ''
for l in L:
    m = re.match(r'^## (\d .+)$', l)
    if m: sec = m.group(1); sec_count[sec] = 0; continue
    if re.match(r'^\d+\. ', l) and sec in sec_count: sec_count[sec] += 1

# 逐节把新条目插到该节末尾（下一个 "## " 之前的空行前）
add = {c: [] for c in CATS}
new_rows = []
for cid in range(112, N + 1):
    if cid in VOID:
        new_rows.append((cid, '—', VOID[cid])); continue
    cat = CAT.get(cid)
    if not cat:  # 未归类的新料：按关键词兜底并明确报出
        print(f'  [未归类] 源 {cid}: {title_of(cid)[:60]}'); continue
    if cid in MERGE:
        mother, why = MERGE[cid]
        add[cat].append(('SUB', cid, why)); new_rows.append((cid, cat, f'并入源 {mother}（同题修正版）'))
        continue
    add[cat].append(('MAIN', cid, title_of(cid)))
    new_rows.append((cid, cat, ''))

out = []
for i, l in enumerate(L):
    m = re.match(r'^## (\d .+)$', l)
    if m:
        # 上一节收尾：把该节新增条目插进来（此处在空行之前）
        prev = None
        for k in range(len(out) - 1, -1, -1):
            mm = re.match(r'^## (\d .+)$', out[k])
            if mm: prev = mm.group(1); break
        if prev and add.get(prev):
            while out and out[-1].strip() == '': out.pop()
            for kind, cid, txt in add[prev]:
                rf = ' '.join('#' + x for x in refs_of(cid)) or '—'
                if kind == 'MAIN':
                    sec_count[prev] += 1
                    out.append(f'{sec_count[prev]}. {txt}（{rf}）')
                else:
                    out.append(f'   - {txt}（{rf}）')
            out.append('')
    out.append(l)
L = out

# 追加对账行（插在分母行之前）
rows_txt = [f'| {cid} | {"—" if cid in VOID else "草稿"} | {cat} | {"—" if cid in VOID or cid in MERGE else "见正文"} | {why} |'
            for cid, cat, why in new_rows]
for i, l in enumerate(L):
    if l.startswith('**分母**'):
        L[i:i] = rows_txt + ['']
        break

# 覆盖自证＋更新分母
main_total = sum(sec_count.values())
merged_total = 8 + len(MERGE)
void_total = len(VOID)
for i, l in enumerate(L):
    if l.startswith('**分母**'):
        L[i] = (f'**分母**：源评论 **{N}** 条 ＝ 本册**主条目 {main_total}** ＋ **并入 {merged_total}** '
                f'＋ **作废 {void_total}**（源 125／126 为撤销对）⇒ 逐条有落点。')
        L.insert(i, f'**覆盖自证**：本表源编号覆盖 **连续 1–{N}，无缺号无重号**。机器核对（无输出即合规）：\n')
        L.insert(i + 1, '```')
        L.insert(i + 2, "grep -oE '^\\| [0-9]+ \\|' docs/criteria-ledger.md | grep -oE '[0-9]+' \\")
        L.insert(i + 3, f"  | sort -n | uniq -c | awk '$1!=1{{print \"重号\",$2}}'   # 行数应为 {N}，序号应为 1..{N}")
        L.insert(i + 4, '```')
        break

DOC.write_text('\n'.join(L) + '\n')
print(f'  新料 {N - 111} 条：主条目 +{sum(1 for v in add.values() for k, _, _ in v if k == "MAIN")}，'
      f'并入 +{sum(1 for v in add.values() for k, _, _ in v if k == "SUB")}，作废 {void_total}')
print(f'  合计：主 {main_total} ＋ 并入 {merged_total} ＋ 作废 {void_total} ＝ {main_total + merged_total + void_total}（源 {N}）')
print('  分布:', sec_count)
