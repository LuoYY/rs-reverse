// 关键：cap[7:] 是 base64 风格编码（4 字符 = 3 字节）！
// NX_BS 前 64 字符为索引
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.keys2);
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decodeB64(vals) {
  // vals 是 0-63 的索引值（cap[7:] 数据区）
  // 每 4 个值 = 3 字节: b0=(v0<<2)|(v1>>4), b1=((v1&15)<<4)|(v2>>2), b2=((v2&3)<<6)|v3
  const out = [];
  for (let i = 0; i + 3 < vals.length; i += 4) {
    const a = vals[i], b = vals[i + 1], c = vals[i + 2], d = vals[i + 3];
    out.push((a << 2) | (b >> 4));
    out.push(((b & 15) << 4) | (c >> 2));
    out.push(((c & 3) << 6) | d);
  }
  return out;
}

live.forEach((s, i) => {
  const cap = s.cap;
  const dataVals = cap.slice(7).filter(v => v !== 0); // 去分隔符？
  // 或不去，直接 4 值 3 字节
  const raw = cap.slice(7);
  const dec = decodeB64(raw);
  const base = s.base;
  let match = 0;
  for (let j = 0; j < Math.min(dec.length, base.length); j++) if (dec[j] === base[j]) match++;
  console.log('#' + i, 'nsd=' + s.nsd, 'dec.len=' + dec.length, 'base.len=' + base.length, 'match=' + match);
  if (i === 0) {
    console.log('  dec[0:20]:', dec.slice(0, 20).join(','));
    console.log('  base[0:20]:', base.slice(0, 20).join(','));
  }
});
