// 正确的 cap numarr 解码：cap 值 0-63（6bit），2 个值 = 1 字节
// 格式：cap[0]=113(头) cap[1]=block cap[2:6]=固定 len cap[6]=0(分隔)
// cap[7:] = numarr 数据：每 2 个值 6bit 组成 1 字节（v1<<2|v2>>4 等）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length);

function decodeCap(cap) {
  // 跳过 [0:7] 头（113,block,32,4,lenHi,lenLo,0）
  const dataStart = 7;
  const vals = cap.slice(dataStart);
  const out = [];
  let i = 0;
  while (i + 1 < vals.length) {
    const a = vals[i], b = vals[i + 1];
    if (a === 0 && b === 0) { out.push(0); i += 2; continue; }
    // numarr 6bit 组对：3 字节 = 4 个 6bit 值
    if (i + 3 < vals.length) {
      const v0 = vals[i], v1 = vals[i + 1], v2 = vals[i + 2], v3 = vals[i + 3];
      out.push((v0 << 2) | (v1 >> 4));
      out.push(((v1 & 15) << 4) | (v2 >> 2));
      out.push(((v2 & 3) << 6) | v3);
      i += 4;
    } else break;
  }
  return out;
}

live.forEach((s, i) => {
  const dec = decodeCap(s.cap);
  const base = s.base;
  let match = 0;
  for (let j = 0; j < Math.min(dec.length, base.length); j++) if (dec[j] === base[j]) match++;
  console.log('#' + i, 'nsd=' + s.nsd, 'dec.len=' + dec.length, 'match=' + match + '/' + Math.min(dec.length, base.length));
  if (i === 0) {
    console.log('  dec[0:20]=', dec.slice(0, 20).join(','));
    console.log('  base[0:20]=', base.slice(0, 20).join(','));
  }
});
