// 解析 cap 的 numarr 结构：cap = [113, block, 32, 4, lenHi, lenLo, 0, ...data]
// data 部分是否含 base 的 [22:29]/[68:73]？
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length);

console.log('=== cap 完整解析（#0） ===');
const s0 = live[0];
console.log('cap.len=' + s0.cap.length);
console.log('cap=' + s0.cap.join(','));
console.log('base=' + s0.base.join(','));

// cap 是 numarr 编码（值 0-63 范围，分隔符 0）
// 尝试：cap[8:] 解码为 numarr（类似 _$ez 的 \x01 数字 模式？不，cap 是纯值流）
// cap 值范围 0-63（113,4,32,4,37,60,0,59,46,20,57,5,56,14,2,60,...）
// 这些是 base 字节的 numarr 表示（每字节 1-3 个值 0-63）
// base[0]=179 → numarr? 179 = ? 但 cap 值最大 63 → 是 6bit 编码！
// 113 = 0x71，4，32，4，37，60 → 6bit 分组？
// 尝试：cap 是 base 的 6-bit 流？113,4,32,4 组成 4×6bit = 24bit = 3 字节
// 113<<18|4<<12|32<<6|4 = ? 
console.log('\n=== 6bit 解码尝试 ===');
const bits = [];
for (const v of s0.cap) { for (let b = 5; b >= 0; b--) bits.push((v >> b) & 1); }
const bytes = [];
for (let i = 0; i + 8 <= bits.length; i += 8) {
  bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
}
console.log('6bit→8bit 解码:', bytes.slice(0, 30).join(','));
console.log('base[0:30]:', s0.base.slice(0, 30).join(','));
// 对比
let match = 0;
for (let i = 0; i < Math.min(bytes.length, s0.base.length); i++) if (bytes[i] === s0.base[i]) match++;
console.log('匹配字节数:', match, '/', Math.min(bytes.length, s0.base.length));
