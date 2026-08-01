/**
 * 316_verify_query_encoder.js
 * 用浏览器真实 query 的 88B 字节流，反向验证 query 编码 basestr
 */
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function decodeB86(str, bs) {
  const idxmap = {}; for (let i = 0; i < bs.length; i++) idxmap[bs[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) { return null; }
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}
// 参考 src/handler/parser/common/numarr2string.js 的实现
function encodeBase64like(bytes, bs) {
  let str = '';
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    str += bs[(n >> 18) & 63] + bs[(n >> 12) & 63] + bs[(n >> 6) & 63] + bs[n & 63];
  }
  const rem = bytes.length % 3;
  if (rem === 1) {
    const n = bytes[bytes.length - 1];
    str += bs[(n >> 2) & 63] + bs[(n & 3) << 4];
  } else if (rem === 2) {
    const n = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
    str += bs[(n >> 10) & 63] + bs[(n >> 4) & 63] + bs[(n & 15) << 2];
  }
  return str;
}

const urlQ = 'aopZBDqAqWqhRGCEoCMg_aznhSHfZ_oi4rp64IHbnXDbMFeF9QImTy5oCptnAdUVZBTwOhwy_o1chm8M_I-OkT3chTR6vSSmfUNq3fj5Nu5WKpzqxD4HqPa';

// 用 B86_64 解码（314 号已验证结构正确）
const bytes = decodeB86(urlQ.slice(1), B86_64);
console.log('浏览器 query 解码:', bytes.length, '字节');
console.log('浏览器 query 含特殊字符:', /[^A-Za-z0-9_-]/.test(urlQ) ? '有' : '无');

// 用 B86_64 重新编码
const re1 = encodeBase64like(bytes, B86_64);
console.log('\nB86_64 重新编码:', re1.substring(0, 30), '...');
console.log('与浏览器一致:', re1 === urlQ);
if (re1 !== urlQ) {
  let i = 0; while (i < re1.length && re1[i] === urlQ[i]) i++;
  console.log('首个差异@', i, 'gen:', re1[i], 'browser:', urlQ[i]);
  console.log('gen 含特殊字符:', /[^A-Za-z0-9_-]/.test(re1) ? '有' : '无');
}

// 尝试：86 字符完整 basestr 编码
const re2 = encodeBase64like(bytes, NX_BS.split(''));
console.log('\nNX_BS 86字符 重新编码:', re2.substring(0, 30), '...');
console.log('与浏览器一致:', re2 === urlQ);
if (re2 !== urlQ) {
  let i = 0; while (i < re2.length && re2[i] === urlQ[i]) i++;
  console.log('首个差异@', i, 'gen:', re2[i], 'browser:', urlQ[i]);
}

// 看 numarr2string 真实实现
const fs = require('fs');
const p = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/common/numarr2string.js';
console.log('\n=== numarr2string.js 源码 ===');
console.log(fs.readFileSync(p, 'utf8'));
