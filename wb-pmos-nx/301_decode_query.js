/**
 * 301_decode_query.js
 *
 * 解码 nx API query（119 字符）→ 分析结构（CRC32/keys2/request_data）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('api_capture_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  console.log('nsd:', d.nsd);

  const q1 = d.apiRequests[0].url.split('?')[1];
  const qName = q1.split('=')[0];
  const qValue = q1.split('=')[1];
  console.log('query 名:', qName, '值长:', qValue.length);
  console.log('query 值:', qValue);

  // 解码（各种前缀）
  for (const [name, str] of Object.entries({ '原值': qValue, '去a': qValue.startsWith('a') ? qValue.slice(1) : qValue, '去0': qValue.startsWith('0') ? qValue.slice(1) : qValue })) {
    const bytes = decodeB86(str);
    if (!bytes) { console.log('[' + name + '] 解码失败'); continue; }
    console.log('\n[' + name + '] 解码:', bytes.length, 'B');
    console.log('前 8:', bytes.slice(0, 8).join(','));
    console.log('完整:', JSON.stringify(bytes));
    // xj 结构：4 CRC + 1 + 0 + 48(keys2) + 32(request)
    if (bytes.length >= 88) {
      const crc = bytes.slice(0, 4);
      const k2 = bytes.slice(6, 54);
      const req = bytes.slice(56, 88);
      console.log('CRC32:', crc.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('字节4-5:', bytes[4], bytes[5]);
      console.log('keys2(6-53) 前 8:', k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('request_data(56-87):', req.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }
  // 对比 P cookie 的 keys2（同会话）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  console.log('\nsync keys2（browserKeys）:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
