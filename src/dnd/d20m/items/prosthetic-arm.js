/* D20M 道具 —— 义体·假臂（PL 5 替换型义体）
 *
 * 数值出处：SRD d20M · source/4Future未来/2FutureCybernetics.md:97（「Prosthetic Arm (PL 5)」）
 *   源文逐行读数：:99 Benefit「…duplicates the function of its biological counterpart. It provides no
 *   special game benefits.」｜:100 Type External｜:101 Hardness/Hit Points 3/5｜:102 Base Purchase DC 17
 *   ｜:103 Restriction None。
 *
 * ★源文 :99 明说**不带来额外好处** ⇒ 本笔照此声明：`stats` 只落源的硬度/HP 两值，**✗ 造加值**。
 * ★建模取「**义体即装备**」甲案（:100 Type＝External 有源可依）；**✗ 落** #1732 B5 的三性
 *   （不可卸下／与部位绑定／失效即残废）—— 缺口语义以 #1732 为准，本笔只占槽位面。
 * ★✗ 落 `cost`：源的取得面是 Base Purchase DC 17（:102），换算属后续票（同 beretta-92f 的理由）。
 */

D20M.ProstheticArm = RPG.defItem({
	id: 'prosthetic-arm', name: '义体·假臂', desc: '完整替换失去手臂的义体（PL 5 替换型）。',
	stats: { hardness: 3, hp: 5 },
	slot: 'arms', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() { this.perform('假臂只是替代品——它不带来额外的好处。'); },
});
