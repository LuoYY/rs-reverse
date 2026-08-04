/**
 * 728_A137_decode_P.js
 * 解码 P cookie → 提取 be 段（base 加密 basearr）
 * 用管线 encryptMode2 + keys16
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
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
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

  const pVal = fs.readFileSync('/tmp/nx_browser_P_v2.txt', 'utf8');
  console.log('P cookie len:', pVal.length, 'head:', pVal.substring(0, 20));
  const b86arr = decodeB86(pVal.slice(1));
  console.log('b86 len:', b86arr.length, 'b86[0-8]:', b86arr.slice(0, 8).join(','));
  const dec = encryptMode2([...b86arr], keys16arr, 1);
  const na = dec.slice(4);
  console.log('解密后 na len:', na.length);
  console.log('na[0-30]:', na.slice(0, 31).join(','));
  // na[59:61] 是 beLen
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  console.log('beLen:', beLen, 'na len:', na.length);
  const be = na.slice(61, 61 + beLen);
  console.log('be len:', be.length);
  console.log('be[0-31]:', be.slice(0, 32).join(','));
  console.log('be[22-40]:', be.slice(22, 41).join(','));
  console.log('be 尾 8:', be.slice(-8).join(','));
  fs.writeFileSync('/tmp/nx_browser_base_v2.json', JSON.stringify({ be, P: pVal }));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
