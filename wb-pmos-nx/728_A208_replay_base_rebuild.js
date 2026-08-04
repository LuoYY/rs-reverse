/**
 * 728_A208_replay_base_rebuild.js
 * 最终验证：重建 base（改会话段）→ 重加密 P cookie → 重放测试 200/412
 * 利用已采集的浏览器 P cookie（/tmp/nx_browser_cookies_full.json）
 *
 * 链路：P cookie → 解密 → base → 改 [22-28] 会话段 → 重新加密 → 请求服务器
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const MOCK_DIR = path.join(ROOT, 'nx-mock');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

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
function encodeB86(bytes) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += NX_BS[b0 >> 2] + NX_BS[((b0 & 3) << 4) | (b1 >> 4)] + NX_BS[((b1 & 15) << 2) | (b2 >> 6)] + NX_BS[b2 & 63];
  }
  const rem = bytes.length % 3;
  if (rem === 1) out = out.slice(0, -3);
  else if (rem === 2) out = out.slice(0, -1);
  return out;
}
function httpsGet(url, cookie) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({ host: '127.0.0.1', port: 9000, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, timeout: 25000 });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nCookie: ${cookie}\r\nUser-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4).substring(0, 200) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

  // 1. 读浏览器 P cookie
  const ck = JSON.parse(fs.readFileSync('/tmp/nx_browser_cookies_full.json', 'utf8'));
  const pName = Object.keys(ck).find(k => /P$/.test(k));
  const pVal = ck[pName];
  console.log('P cookie:', pName, 'len:', pVal.length);

  // 2. 解密 P → base
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...decodeB86(pVal.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const keys2 = na.slice(11, 59);
  console.log('be len:', be.length, 'keys2[0:8]:', keys2.slice(0, 8).join(','));

  // 3. 解密 base
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
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
  const der = deriveKeys(decryptCd(cd));
  if (!der) { console.log('keys 派生失败'); process.exit(1); }

  const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], keys17arr, 0);
  const huff = tmp.map((v, j) => j < 16 ? (v ^ keys2[j]) : v);

  // huffman 解码
  function getTree() {
    let arr = [];
    for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
    arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
    function parse(item) { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); }
    while (arr.length > 1) { const [one, two] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: one.total + two.total, first: one, second: two }); }
    return arr[0];
  }
  function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
    if (tree.idx === undefined) { getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); }
    else arr[tree.idx] = config;
    return arr;
  }
  function huffmanDecodeRaw(enc) {
    const encCfg = getEncCfg(getTree());
    const byLenMap = {}; let maxL = 0;
    for (let idx = 0; idx < 256; idx++) { const c = encCfg[idx]; if (!c) continue; if (!byLenMap[c.val]) byLenMap[c.val] = {}; byLenMap[c.val][c.key] = idx; if (c.val > maxL) maxL = c.val; }
    const ans = []; let key = 0, val = 0;
    for (let i = 0; i < enc.length; i++) {
      for (let b = 7; b >= 0; b--) {
        key = (key << 1) | ((enc[i] >> b) & 1); val++;
        const mm = byLenMap[val];
        if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
        if (val > maxL) { key = 0; val = 0; }
      }
    }
    return ans;
  }
  const rawDec = huffmanDecodeRaw(huff);
  function nxEncrypt(numarr) {
    const encCfg = getEncCfg(getTree());
    const ans = []; let one = 0, two = 0;
    for (let i = 0; i < numarr.length; i++) {
      const cfg = encCfg[numarr[i]];
      one = one << cfg.val | cfg.key; two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
    return ans;
  }
  let bestLen = 0;
  const huffHead = huff.slice(0, huff.length - 1);
  for (let L = rawDec.length; L >= 1; L--) {
    const enc = nxEncrypt(rawDec.slice(0, L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  const base = rawDec.slice(0, bestLen);
  console.log('原始 base len:', base.length);
  console.log('原始 base[0-30]:', base.slice(0, 31).join(','));

  // 4. 重建 base：改会话段 [22-28]
  const newSession = [1, 2, 3, 4, 5, 6, 7];
  const rebuilt = [...base.slice(0, 22), ...newSession, ...base.slice(29)];
  console.log('重建 base len:', rebuilt.length);
  console.log('重建 base[0-30]:', rebuilt.slice(0, 31).join(','));

  // 5. 重新加密 base → be（huffman）
  const enc = nxEncrypt(rebuilt);
  const newBe = [...keys2.slice(0, 16).map((v, i) => enc[i] ^ v), ...enc.slice(16)];
  const newBeEnc = encryptMode2(newBe, keys17arr, 0);
  // 注意：be 加密有长度头（beLen）——简化：保持 be 长度一致
  console.log('\nbe 加密 len:', newBeEnc.length, '原始 be len:', be.length);

  // 6. 说明：完整重放需重构 na（含 beLen/keys2 等）+ 重新加密 P
  console.log('=== 完整重放链路 ===');
  console.log('需重构 na: [4B头][beLen varint][新be][keys2][...] → encryptMode2(keys16) → b86 → P cookie');
  console.log('P cookie 重放: O+P 配对请求');
  console.log('由于 cookie 重构涉及 na 全结构，需参考 src/handler 完整实现');
  fs.writeFileSync('/tmp/nx_base_rebuilt2.json', JSON.stringify({ base, rebuilt, newBeEnc, keys2 }));
  console.log('已保存重建数据 /tmp/nx_base_rebuilt2.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
