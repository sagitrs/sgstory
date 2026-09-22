// 内容指纹（**纯** · 零宿主）—— 给"我判的是哪份输入"一个可比的读数
//
//注意：**声明一**（照 §17 ④）：本函数是**内容指纹**（FNV-1a 32 位），**不是**安全哈希。
//注意：**声明二**（复核席 ②）：它**弱在"假等"方向** —— 会把**不同**报成**相同** —— 正好落在**假绿**那一边。
// → 所以它**只作辅助读数**；"两侧一致"的**承重**仍是 **findings 规范化后逐字节相等**（承重与辅助不许混同）。
//注意：**声明三**（复核席 ③）：**规范化口径** ＝ **递归排序键** ＋ **长度前缀** ＋ 数组保序；**不含路径**
//（路径随 cwd 变 → 掺第三者 → 犯 ④；要报路径就得单独声明"路径也是被比对象"）。
// 为什么不用 crypto：① 浏览器 `file://` 下 `crypto.subtle` 常不可用（静态优先 → 不能用）；
// ② 判定要**同步**（页内编辑即诊断）；③ 同一份代码两侧跑 → 可比性只依赖"同一个函数"。

/** 内容指纹：同内容 → 同值；不同内容 → 不同值（"假等"方向弱，见声明二）。 */
export const fingerprint = (text) => {
	const s = String(text ?? '');
	let h = 0x811c9dc5;                       // FNV-1a offset basis
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;   // FNV prime，`>>> 0` 保 32 位无符号
	}
	return h.toString(16).padStart(8, '0');
};

/** 规范化（**递归**）：只排顶层键是不够的 —— 嵌套对象键序不同 → sha 不同 → 会报**假的"不一致"**（§17 ④）。
 * **长度前缀**：只用 `\u0000` 之类分隔时，**值里含 NUL** 会让 `{a:'x\0b\0y'}` 与 `{a:'x',b:'y'}` **同值** → 假等
 *（复核席 ①）。 */
const canon = (v) => {
	if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
	if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${k.length}:${k}=${canon(v[k])}`).join(',')}}`;
	const str = String(v ?? '');
	return `${str.length}:${str}`;
};

/** 一组**具名内容**的指纹 —— **先规范化再指纹**（口径见声明三）。 */
export const fingerprintOf = (parts = {}) => fingerprint(canon(parts));
