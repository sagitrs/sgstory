# 原子库存交换

References #2008

`RPG.exchange(actor, offer)` 只做通用库存交换。故事负责价格、资格和成交后的进度，规则包负责规则数学。接口不辨认金币、城市或楼层，不执行物品动作，也不直接输出界面。

```js
const result = RPG.exchange(actor, {
  take: [{ id: 'input-item', n: 3 }],
  give: [{ id: 'output-item', n: 1 }]
});
if (result.status === 'applied') {
  // 故事在这里记录本次成功成交；拒绝时不记进度。
}
```

两侧可省略一侧，但不可都为空。每行须有已注册的非空字符串 `id` 和正安全整数 `n`。可以多输入、多输出，也可以同一 ID 两边出现；先扣全部输入，因此不能用本笔输出补足输入。重复输入逐行扣减，总量不足时整笔拒绝。

## 数量不是一套单位

- `take.n` 沿用 `RPG.take`：带 `charges` 的槽按充能数扣，无 `charges` 的槽每槽一件，从后往前扣。
- `give.n` 沿用 `RPG.deposit` 的新品批数。例如一批绷带默认两次，`give: [{id:'bandage',n:1}]` 发两次，不是一次。
- 不执行道具动作，不自动装备，也不替故事处理治疗、耐久修理或寄存。

扣减与投递在隔离的槽数组上执行，最后一次 `splice` 提交。成功保留原背包数组引用、剩余物品的实体 ID 和顶层状态。新品非堆叠物逐件获得不同 ID。失败可以消耗全局身份分配器的流水号，但不会把这些暂存物品写入原背包；流水号不保证连续。

## 返回与异常

成功返回纯数据：

```js
{ status: 'applied', taken: [{ id, n }], received: [{ id, n }] }
```

`taken` 的 `n` 是请求扣减数；`received` 的 `n` 是 `deposit` 实际增加的库存单位。不要把它当新品批数的回显。

业务拒绝返回 `{status:'rejected', reason, ...extra}`。现有类别是 `no-inventory`、`invalid-offer`、`invalid-quantity`、`unknown-item`、`invalid-inventory`、`insufficient-items` 和 `delivery-failed`；涉及物品的拒绝附 `id`。余额不足、定义缺失、非法数量和投递拒绝时，原背包零变化。

投递构造器等普通程序异常仍抛出，不伪装成业务拒绝，且在异常发生前不提交原背包。事务范围是背包，不是任意注册构造器的外部副作用。

成功提交后，对本笔涉及的各个不同 ID 发一次 `inventory:changed`，载荷为 `{id,actor}`。拒绝和投递异常不发该事件。通知发生在提交之后，订阅者读到的是整笔结果。

## 共用原语与验收

`RPG.withdraw(list,id,n)` 是静默扣减原语；`RPG.take` 调它后保留原有提示及事件。`withdraw` 不是交易接口：它只扣一个输入，调用者需要多笔原子性时应使用 `exchange`，不要自行组合 `take` 和 `give`。

实现位于 `src/core/32-exchange.js`。用例位于 `tests/unit/core/exchange.test.js`，由构建后的单测清单自动发现。先重建发布包装，再从引擎根执行 `node tests/unit/headless.mjs`。成功、同 ID、同伴背包、数量、身份、剩余属性及拒绝／异常均须有断言；故事购买和售货另由故事装配与浏览器验收，不以引擎单测代替。
