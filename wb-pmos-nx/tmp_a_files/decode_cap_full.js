// cap 完整解码：cap[7:] 值 0-63 → base
// cap[0]=113(标记) cap[1]=block cap[2:6]=固定 len cap[6]=0
// cap[7:] = numarr 编码（值 0-63 + 0 分隔）→ 解码为字节
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.cd);

// 瑞数 numarr 编码：每 3 个值(0-63) → 2 字节？还是每 4 值 3 字节？
// cap[7] 开始: 59,46,20,57,5,56,14,2,60,0,57,3,57,0,56,39,57,7,56,14
// base[0:20] (同样本): 需要看 base
function decodeCapB64(vals) {
  // 标准 base64: 每 4 值 → 3 字节
  const out = [];
  for (let i = 0; i + 3 < vals.length; i += 4) {
    const a = vals[i], b = vals[i + 1], c = vals[i + 2], d = vals[i + 3];
    out.push((a << 2) | (b >> 4));
    out.push(((b & 15) << 4) | (c >> 2));
    out.push(((c & 3) << 6) | d);
  }
  return out;
}
function decodeCapNumarr(vals) {
  // numarr 编码: 每 3 值 → 2 字节 (a,b,c): b0=(a<<2)|(b>>4) b1=((b&15)<<4)|(c>>2)
  const out = [];
  for (let i = 0; i + 2 < vals.length; i += 3) {
    const a = vals[i], b = vals[i + 1], c = vals[i + 2];
    out.push((a << 2) | (b >> 4));
    out.push(((b & 15) << 4) | (c >> 2));
  }
  return out;
}

live.forEach((s, i) => {
  const cap = s.cap;
  const base = s.base;
  const dataVals = cap.slice(7);
  // 尝试多种解码
  const dec64 = decodeCapB64(dataVals);
  const decNum = decodeCapNumarr(dataVals);
  // 匹配度
  let m64 = 0, mNum = 0;
  for (let j = 0; j < Math.min(dec64.length, base.length); j++) if (dec64[j] === base[j]) m64++;
  for (let j = 0; j < Math.min(decNum.length, base.length); j++) if (decNum[j] === base[j]) mNum++;
  console.log('#' + i, 'nsd=' + s.nsd, 'cap.len=' + cap.length,
    'b64:' + m64 + '/' + Math.min(dec64.length, base.length),
    'numarr:' + mNum + '/' + Math.min(decNum.length, base.length));
  if (i === 0) {
    console.log('  dec64[0:15]:', dec64.slice(0, 15).join(','));
    console.log('  decNum[0:15]:', decNum.slice(0, 15).join(','));
    console.log('  base[0:15]:', base.slice(0, 15).join(','));
  }
});
