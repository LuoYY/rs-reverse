/**
 * 314_decode_curl_query.js
 * 解码用户 curl 的 URL query 与 header MurR7rxG，对比结构
 */
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) { console.log('非法字符@', qi, str[qi]); return null; }
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

const urlQ = 'aopZBDqAqWqhRGCEoCMg_aznhSHfZ_oi4rp64IHbnXDbMFeF9QImTy5oCptnAdUVZBTwOhwy_o1chm8M_I-OkT3chTR6vSSmfUNq3fj5Nu5WKpzqxD4HqPa';
const hdrQ = 'aXLFByaAqWqhRGCEoCMg_aznhSHfZ_oi4rp64IHbnXDbMFeF9QImTy5oCptnAdUVZBTwOhwy_o1qKqN2kZ9xFTvkSNRL6i-YwHittbzqqyHLsGpdM6mg0Ca';

for (const [name, q] of [['URL', urlQ], ['HDR', hdrQ]]) {
  const bytes = decodeB86(q.slice(1));
  if (!bytes) { console.log(name, '解码失败'); continue; }
  console.log(`\n=== ${name} query: ${q.length} 字符, 解码 ${bytes.length} 字节 ===`);
  console.log('crc:', bytes.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('标记:', bytes.slice(4, 7).join(','), 'len48@6');
  console.log('keys2:', bytes.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('len32@55:', bytes[55]);
  console.log('request_data:', bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));
}

// 对比 keys2 段是否一致
const bU = decodeB86(urlQ.slice(1));
const bH = decodeB86(hdrQ.slice(1));
if (bU && bH) {
  const kU = bU.slice(7, 55), kH = bH.slice(7, 55);
  const same = kU.every((v, i) => v === kH[i]);
  console.log('\nURL/HDR keys2 段相同:', same);
  if (!same) {
    const diffs = [];
    for (let i = 0; i < 48; i++) if (kU[i] !== kH[i]) diffs.push(i);
    console.log('差异位置:', diffs.slice(0, 10).join(','), '共', diffs.length);
  }
  // request_data 对比
  const rU = bU.slice(56, 88), rH = bH.slice(56, 88);
  console.log('request_data 相同:', rU.every((v, i) => v === rH[i]));
}
