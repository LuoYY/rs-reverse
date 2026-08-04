/**
 * 728_A141_plain_vs_base.js
 * 同会话（nsd=67402）：明文 basearr（182B, 113 开头） vs base（168B, 179 开头）
 * 分析 base 与明文的关系（base = f(明文)?）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');

(async () => {
  const capD = JSON.parse(fs.readFileSync('/tmp/nx_browser_cap_full.json', 'utf8'));
  const plain = capD.head; // 只有 head 32 + tail
  console.log('明文 head[0-31]:', plain.join(','));
  console.log('明文 tail:', capD.tail.join(','));
  console.log('明文 len:', capD.len);

  // 用 P cookie 解码 base（746 流程）
  require('module-alias')(path.dirname(require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/utils/paths.js').package));
  require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/constData').init();
  const { encryptMode2 } = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/common/numarrAddTime');
  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

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
  // 从 412.raw 获取 cd 用于 deriveKeys
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  const b86 = decodeB86(cd);

  // deriveKeys（简化：从 746 复制）
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
    const arr2 = [];
    for (let i = 0; i < cd.length; i += 4) {
      const one = cd[i].charCodeAt();
      const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
      const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
      const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
      two !== undefined && arr2.push(d1[one] | d2[two]);
      three !== undefined && arr2.push(d3[two] | d4[three]);
      four !== undefined && arr2.push(d5[three] | d6[four]);
    }
    return arr2;
  }
  function deriveKeys(cdArr) {
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    // 简化：直接使用 746 已保存的 keys2 从 cookie
    return null;
  }

  // P cookie 解码
  const pVal = fs.readFileSync('/tmp/nx_browser_P_v2.txt', 'utf8');
  const dec = encryptMode2([...decodeB86(pVal.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const keys2 = na.slice(11, 59);
  console.log('\nkeys2:', keys2.join(','));
  console.log('be len:', be.length, 'be[0-8]:', be.slice(0, 8).join(','));
  console.log('base 参考（746 流程需 keys17）: 当前无法继续，先看 be');

  // be vs 明文 head 关系
  console.log('\n=== be vs 明文 head ===');
  console.log('be[0-31]:', be.slice(0, 32).join(','));
  console.log('plain[0-31]:', plain.join(','));
  const x = [];
  for (let i = 0; i < Math.min(32, be.length, plain.length); i++) x.push(be[i] ^ plain[i]);
  console.log('be^plain:', x.join(','));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
