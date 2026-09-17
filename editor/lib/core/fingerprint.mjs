// 内容指纹（**纯** ✓ · 零宿主 ✓）—— 给"我判的是哪份输入"一个可比的读数 ✓
//
// ⚠️ **声明**（照 §17 ④ ✓）：本函数是**内容指纹**（FNV-1a 32 位 ✓），**不是**安全哈希 ✗ ——
//   用途只有一个 ✓：**两侧判的是不是同一份内容** ✓（可比性 ✓，不用于防篡改 ✓）。
// ⚠️ **不许把路径掺进来** ✗（复核席预注册 (i) ✓）：路径随 cwd 变 ⇒ 会把环境混进读数 ✓（犯 ④ ✗）。
//   要给路径，就得**单独声明**"路径也是被比对象之一" ✓。
// 为什么不用 `crypto`：① 浏览器 `file://` 下 `crypto.subtle` 常不可用 ✗（静态优先 ⇒ 不能用 ✗）；
//   ② 判定要**同步**（页内编辑即诊断 ✓）；③ 同一份代码两侧跑 ⇒ 可比性只依赖"同一个函数" ✓。

/** 内容指纹：同内容 ⇒ 同值 ✓；不同内容 ⇒ 不同值（32 位碰撞概率在本用途可忽略 ✓，见上"声明"）。 */
export const fingerprint = (text) => {
	const s = String(text ?? '');
	let h = 0x811c9dc5;                       // FNV-1a offset basis
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;   // FNV prime，`>>> 0` 保 32 位无符号
	}
	return h.toString(16).padStart(8, '0');
};

/** 一组**具名内容**的指纹 ✓（顺序按名排序 ⇒ **不依赖外部顺序** ✓，照 ④ 那条 ✓）。 */
export const fingerprintOf = (parts = {}) =>
	fingerprint(Object.keys(parts).sort().map((k) => `${k}\u0000${parts[k]}\u0000`).join(''));
