/**
 * 769_xxtea_base_test.js
 * 测试 base[68:92] 或 base[22:] 是否 XXTEA/AES 加密
 * 密钥候选：keys2[0:16]、cd派生keys[17]、cap 前16
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const S = d.samples.filter(s => s.base[26] === 233);

function bytesToU32(bytes, endian) {
  const r = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    if (endian === 'LE') r.push(((bytes[i]) | (bytes[i+1] << 8) | (bytes[i+2] << 16) | (bytes[i+3] << 24)) >>> 0);
    else r.push(((bytes[i] << 24) | (bytes[i+1] << 16) | (bytes[i+2] << 8) | (bytes[i+3])) >>> 0);
  }
  return r;
}
function u32ToBytes(arr, endian) {
  const b = [];
  for (const v of arr) {
    if (endian === 'LE') { b.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }
    else { b.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF); }
  }
  return b;
}
function xxteaDecrypt(v, key) {
  const n = v.length; if (n < 2) return v;
  const DELTA = 0x9E3779B9;
  let q = Math.floor(6 + 52 / n), sum = (q * DELTA) >>> 0, y, z = v[n-1];
  while (sum !== 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      z = v[p-1]; y = v[p];
      const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z));
      v[p] = (v[p] - mx) >>> 0;
    }
    z = v[n-1]; y = v[0];
    const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[0 ^ e] ^ z));
    v[0] = (v[0] - mx) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  return v;
}
function asciiRatio(bytes) {
  if (!bytes.length) return 0;
  return bytes.filter(b => b >= 32 && b <= 126).length / bytes.length;
}

(async () => {
  const s = S[0];
  console.log('=== nsd=' + s.nsd + ' base[68:92] XXTEA 解密 ===');
  const seg = s.base.slice(68, 92);
  const segU32 = bytesToU32(seg, 'LE');
  const segU32BE = bytesToU32(seg, 'BE');
  const keys = {
    'keys2[0:16]': s.keys2.slice(0, 16),
    'keys2[16:32]': s.keys2.slice(16, 32),
    'keys2[0:16]rev': [...s.keys2.slice(0, 16)].reverse(),
    'cap[0:16]': s.cap.slice(0, 16),
    'cap[16:32]': s.cap.slice(16, 32),
    'base[0:16]': s.base.slice(0, 16),
  };
  for (const [name, key] of Object.entries(keys)) {
    try {
      const ku = bytesToU32(key, 'LE');
      const dec = xxteaDecrypt([...segU32], ku);
      const decBE = xxteaDecrypt([...segU32BE], ku);
      const b1 = u32ToBytes(dec, 'LE');
      const b2 = u32ToBytes(decBE, 'BE');
      console.log(name + ': LE ascii=' + (asciiRatio(b1) * 100).toFixed(0) + '% 可读: ' + b1.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
      console.log(name + ': BE ascii=' + (asciiRatio(b2) * 100).toFixed(0) + '% 可读: ' + b2.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
    } catch (e) { console.log(name + ': ERR ' + e.message.substring(0, 40)); }
  }
  console.log();
  // 也用 cd 派生 keys 尝试（keys17）
  console.log('=== 需要 keys17，尝试 base[22:38] XXTEA ===');
  const seg2 = s.base.slice(22, 38);
  const seg2U32 = bytesToU32(seg2, 'LE');
  for (const [name, key] of Object.entries({ 'k2': s.keys2.slice(0, 16), 'cap': s.cap.slice(0, 16) })) {
    const dec = xxteaDecrypt([...seg2U32], bytesToU32(key, 'LE'));
    const b = u32ToBytes(dec, 'LE');
    console.log(name + ': ascii=' + (asciiRatio(b) * 100).toFixed(0) + '% 可读: ' + b.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
