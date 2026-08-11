// 关键假设：cap[7:] numarr 编码 → 解码 = base 数据！
// numarr 编码：每 3 个 6bit 值 = 2 字节（标准瑞数 numarr 编码）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.keys2);

function decodeNumarr3to2(vals) {
  // 每 3 个值 (a,b,c) 都是 0-63，编码 2 字节: 
  // b0 = (a << 2) | (b >> 4)
  // b1 = ((b & 15) << 4) | (c >> 2)
  // 但标准 numarr 是每 4 个值 3 字节 (a,b,c,d): 
  // b0 = (a<<2)|(b>>4), b1=((b&15)<<4)|(c>>2), b2=((c&3)<<6)|d
  const out = [];
  let i = 0;
  while (i + 3 < vals.length) {
    const a = vals[i], b = vals[i + 1], c = vals[i + 2], d = vals[i + 3];
    out.push((a << 2) | (b >> 4));
    out.push(((b & 15) << 4) | (c >> 2));
    out.push(((c & 3) << 6) | d);
    i += 4;
  }
  // 余数
  if (i + 1 < vals.length) out.push((vals[i] << 2) | (vals[i + 1] >> 4));
  if (i + 2 < vals.length) out.push(((vals[i + 1] & 15) << 4) | (vals[i + 2] >> 2));
  return out;
}

live.forEach((s, i) => {
  const cap = s.cap;
  const dataVals = cap.slice(7); // 跳过 [113, block, 32, 4, lenHi, lenLo, 0]
  const dec = decodeNumarr3to2(dataVals);
  const base = s.base;
  // 对比 dec 与 base
  let match = 0;
  for (let j = 0; j < Math.min(dec.length, base.length); j++) if (dec[j] === base[j]) match++;
  console.log('#' + i, 'nsd=' + s.nsd, 'dec.len=' + dec.length + ' base.len=' + base.length + ' match=' + match);
  if (i === 0) {
    console.log('  dec[0:20]:', dec.slice(0, 20).join(','));
    console.log('  base[0:20]:', base.slice(0, 20).join(','));
  }
});

// 另一种：cap 直接 = base 的 numarr 编码（cap[7:] 的每字节 = base 字节的 numarr 值）
// 尝试：cap[7:] 的每个值直接对应 base 值（0-63 范围 → base 0-255 不行）
// 但也许 cap 值本身是 base 值模 64？
console.log('\n=== cap[7:] 与 base 直接关系 ===');
const s0 = live[0];
console.log('cap[7:30]:', s0.cap.slice(7, 30).join(','));
console.log('base[0:23]:', s0.base.slice(0, 23).join(','));
// cap[7]=59 vs base[0]=179? 59*3=177 ≈ 179
// 尝试 base = cap 值 * 3 + 偏移？
console.log('59*3=' + 59*3, '179-59*3=' + (179 - 59 * 3));
