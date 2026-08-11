// 最后代数尝试：[78:90] 是否 = 某种校验和（CRC32/MD5/自定义）of base 其他部分？
// base[78:90] 12B 可能是 base[0:78] 或 [90:] 的校验和
const samples = require('./nx_full_samples.json');
const crypto = require('crypto');

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

console.log('=== [78:90] vs 校验和 ===');
for (const s of samples) {
  const seg = s.base.slice(78, 90);
  const crcSeg = crc32(Buffer.from(seg));
  // 尝试 [78:90] 前 4 字节 = crc32(base[0:78])
  const crcPrefix = crc32(Buffer.from(s.base.slice(0, 78)));
  const crcTail = crc32(Buffer.from(s.base.slice(90)));
  const crcAll = crc32(Buffer.from(s.base));
  const b4 = (seg[0] << 24 | seg[1] << 16 | seg[2] << 8 | seg[3]) >>> 0;
  const b4_2 = (seg[4] << 24 | seg[5] << 16 | seg[6] << 8 | seg[7]) >>> 0;
  const b4_3 = (seg[8] << 24 | seg[9] << 16 | seg[10] << 8 | seg[11]) >>> 0;
  console.log('#' + samples.indexOf(s),
    'seg4[0]=' + b4.toString(16),
    'crc(pre)=' + crcPrefix.toString(16),
    'crc(tail)=' + crcTail.toString(16),
    'crc(all)=' + crcAll.toString(16),
    (b4 === crcPrefix ? '★=crc(pre)' : '') + (b4 === crcTail ? '★=crc(tail)' : '') + (b4 === crcAll ? '★=crc(all)' : ''));
}

// 检查 [78:90] 是否跨样本共享结构（同批次）
console.log('\n=== 同批次 [78:90] 关联 ===');
// b60=247 批次
const grpA = samples.filter(s => s.b60 === 247 && s.b65 === 164);
const grpB = samples.filter(s => s.b60 === 163 && s.b65 === 137);
for (const [name, grp] of [['A(247,164)', grpA], ['B(163,137)', grpB]]) {
  if (grp.length >= 2) {
    const a = grp[0].base.slice(78, 90), b = grp[1].base.slice(78, 90);
    console.log(name, '组内 [78:90] XOR:', a.map((v, i) => v ^ b[i]).join(','));
    console.log(name, '组内 keys2 XOR:', grp[0].keys2.map((v, i) => v ^ grp[1].keys2[i]).slice(0, 12).join(','));
  }
}
