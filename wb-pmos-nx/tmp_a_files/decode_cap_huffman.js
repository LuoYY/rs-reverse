// 假设：cap[7:] = base 的 huffman 编码流（值 0-63）
// 但 base 本身是字节数组，cap 是 0-63 值流。
// 更可能：cap = 另一种 numarr 编码（值域 0-63，0 分隔）
// 关键观察 cap[7:] = 59,46,20,57,5,56,14,2,60,0,57,3,57,0,...
// 59,46,20 三值 → 若 2 值 1 字节：59,46 → 0xEC? 不像 base 179
// 若这是 numarr2string 的输出（字符码值），需要查 basestr 映射
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.keys2);
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

// cap[7:] 值 → NX_BS 字符 → 拼接字符串 → 是否含 base 相关？
function valsToStr(vals) {
  return vals.map(v => NX_BS[v] || '?').join('');
}
const s0 = live[0];
console.log('cap[7:40] 值:', s0.cap.slice(7, 40).join(','));
console.log('cap[7:40] 字符:', JSON.stringify(valsToStr(s0.cap.slice(7, 40))));

// 尝试：cap 完整字符流
const fullStr = valsToStr(s0.cap);
console.log('\ncap 完整字符流:', JSON.stringify(fullStr.slice(0, 60)));

// 标准 numarr 编码（numarr2string 是每 numarr[i] 一个字符）。
// 但 cap[7:] 值 0-63 是"已编码字符索引"？ 那 base 字节怎么对应？
// base[0]=179。179 在 NX_BS 中不存在（NX_BS 86 字符，179 超出）
// 所以 cap 不是 base 的 numarr2string 输出。

// 重新想：cap = b86[2:]，b86 = decodeB86(cd) 返回字节数组。
// cap 值范围 0-63 因为...？看 cap 最大值
console.log('\ncap max:', Math.max(...s0.cap), 'min:', Math.min(...s0.cap));
// cap[0]=113 > 63！所以 cap 不是纯 0-63 值流。
// cap[0]=113 是"头"，cap[1]=4 是"块"，cap[2:6]=32,4,37,60 是长度，cap[6]=0
// cap[7:] 是数据区（0-63 值 + 0 分隔）
// 数据区 59,46,20,57,... 用 numarr 解码（每 2 值 1 字节）
console.log('\n=== numarr 2值1字节 解码 ===');
const d = s0.cap.slice(7);
const out = [];
let i = 0;
while (i + 1 < d.length) {
  const a = d[i], b = d[i + 1];
  if (a === 0 && b === 0) { out.push(0); i += 2; continue; }
  out.push((a << 2) | (b >> 4));
  i += 2;
  if (i + 1 < d.length && (d[i] !== 0 || d[i + 1] !== 0)) {
    out.push(((d[i - 1] & 15) << 4) | (d[i] >> 2));
    i += 1;
  }
}
console.log('解码 len=' + out.length, 'out[0:30]=' + out.slice(0, 30).join(','));
console.log('base[0:30]   =' + s0.base.slice(0, 30).join(','));
