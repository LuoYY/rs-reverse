/**
 * 303_analyze_request.js
 *
 * 分析 nx query：CRC32 校验 + request_data 解密（找 plain24 结构 + keys17）
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
function deriveKeys(cdArr) {
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  function getLensGo(numarr, idx) {
    const item = numarr[idx]; idx++;
    let lens;
    if ((item & 128) === 0) lens = item;
    else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
    else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
    else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
    else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
    else lens = item;
    return [lens, idx];
  }
  for (let k0 = 0; k0 <= 127; k0++) {
    for (let k1 = 0; k1 <= 127; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      if (ans.some(v => v > 255)) continue;
      const keys = [];
      let op = 1, gap, ok = true;
      for (let i = 0; i < ans[0]; i++) {
        [gap, op] = getLensGo(ans, op);
        if (gap < 0 || op + gap > ans.length) { ok = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!ok) continue;
      const k16 = keys[16];
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
    }
  }
  return null;
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
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const f = fs.readdirSync(OUT).filter(x => x.startsWith('api_capture_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const q = d.apiRequests[0].url.split('?')[1].split('=')[1];
  const qBytes = decodeB86(q.startsWith('a') ? q.slice(1) : q);
  console.log('query 88B:');
  const qcrc = qBytes.slice(0, 4);
  const body = qBytes.slice(4, 88);
  const crc = crc32b(Buffer.from(body));
  console.log('CRC 计算:', [(crc>>>24)&255,(crc>>>16)&255,(crc>>>8)&255,crc&255].map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('CRC 原始:', qcrc.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('CRC 匹配:', qcrc[0]===((crc>>>24)&255) && qcrc[1]===((crc>>>16)&255) && qcrc[2]===((crc>>>8)&255) && qcrc[3]===(crc&255) ? '★★★ YES' : 'NO');

  // keys2（字节 7-54）
  const cookieK2 = (() => {
    const C = decodeB86(d.pValue.slice(1));
    const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = encryptMode2([...C], arr, 1);
    return dec.slice(4).slice(11, 59);
  })();
  const qK2 = qBytes.slice(7, 55);
  console.log('query keys2 匹配 cookie:', qK2.every((v, i) => v === cookieK2[i]) ? 'YES' : 'NO');

  // request_data（56-87）解密：keys17 候选
  const req = qBytes.slice(56, 88);
  const cdArr = decryptCd(d.cd);
  const der = deriveKeys(cdArr);
  const pureK17 = der.keys[17];
  const keys17Cands = { 'pure': pureK17 };
  // 从 P cookie 反推浏览器 keys17（如果有 browserKeys）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  keys17Cands['browser'] = sync.browserKeys.keys17;
  console.log('\nkeys17 候选: pure=' + pureK17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('          browser=' + sync.browserKeys.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  for (const [kn, k17] of Object.entries(keys17Cands)) {
    try {
      const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
      const decReq = encryptMode2([...req], arr, 0);
      if (decReq.length !== 24) { console.log('[' + kn + '] 解密 ' + decReq.length + 'B（非24）'); continue; }
      console.log('\n[' + kn + '] request_data 解密 24B:');
      console.log('  ' + decReq.map(b => b.toString(16).padStart(2, '0')).join(' '));
      // 检查 plain24 结构：keys2[0:8]^PREFIX_MASK
      const PREFIX = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
      console.log('  prefix 与 keys2^PREFIX:', decReq.slice(0, 8).map((v, i) => (v ^ cookieK2[i]).toString(16)).join(' '), '(0=匹配PREFIX)');
      // url crc（20-23）
      const url = '/px-gateway/GatewayConfig/getGatewayConfig';
      const crcUrl = crc32b(Buffer.from(url.toUpperCase()));
      console.log('  url crc:', decReq.slice(20, 24).map(b => b.toString(16).padStart(2, '0')).join(' '), '计算:', [(crcUrl>>>24)&255,(crcUrl>>>16)&255,(crcUrl>>>8)&255,crcUrl&255].map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  url crc 匹配:', decReq[20]===((crcUrl>>>24)&255) && decReq[23]===(crcUrl&255) ? 'YES' : 'NO');
    } catch (e) { console.log('[' + kn + '] 错误:', e.message.substring(0, 40)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
