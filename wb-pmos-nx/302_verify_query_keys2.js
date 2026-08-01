/**
 * 302_verify_query_keys2.js
 *
 * 验证 query 的 keys2（字节 6-53）与 P cookie 的 keys2 是否一致
 * 分析 request_data（字节 56-87）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCd(cd) {
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const arr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr.push(d1[one] | d2[two]);
    three !== undefined && arr.push(d3[two] | d4[three]);
    four !== undefined && arr.push(d5[three] | d6[four]);
  }
  return arr;
}
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
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const f = fs.readdirSync(OUT).filter(x => x.startsWith('api_capture_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  console.log('nsd:', d.nsd);

  // P cookie 解密 → keys2
  const C = decodeB86(d.pValue.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const nextarr = dec.slice(4);
  const cookieK2 = nextarr.slice(11, 59);
  console.log('P cookie keys2 前 8:', cookieK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // query 解码
  const q = d.apiRequests[0].url.split('?')[1].split('=')[1];
  const qBytes = decodeB86(q.startsWith('a') ? q.slice(1) : q);
  console.log('query 解码:', qBytes.length, 'B');
  const qK2 = qBytes.slice(6, 54);
  console.log('query keys2 前 8:', qK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2 匹配:', qK2.every((v, i) => v === cookieK2[i]) ? '★★★ YES' : 'NO');
  // 检查 query 字节 4-5 和 request_data
  console.log('字节4-5:', qBytes[4], qBytes[5], '字节6:', qBytes[6], '字节55:', qBytes[55], '总长:', qBytes.length);
  console.log('request_data(56-87):', qBytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // CRC32 校验（bytes[4..]）
  const parser = require('@src/handler/parser');
  console.log('\nCRC32 校验（bytes[4..87]）:');
  try {
    const crc = parser.crc32(qBytes.slice(4));
    const crcBytes = [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
    console.log('计算 CRC:', crcBytes.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('query CRC:', qBytes.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('CRC 匹配:', crcBytes.every((v, i) => v === qBytes[i]) ? 'YES' : 'NO');
  } catch (e) { console.log('crc32:', e.message.substring(0, 40)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
