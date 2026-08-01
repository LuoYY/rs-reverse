/**
 * 98_decrypt_jsdom_cookie.js
 *
 * 从保存的 jsdom cookie（jsdom_cookie_*.json）反解 keys2/keys17
 * keys16 = K16 固定常量；宽窗口 ±7200s × 256 ele 外层解密（uuid 严格校验）
 * 对比 sync 浏览器 keys2 —— 验证 jsdom keys 是否纯计算
 *
 * 用法：node 98_decrypt_jsdom_cookie.js [jsdom_cookie_xxx.json]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

function decodeStr(s) {
  const payload = s.startsWith('0') ? s.slice(1) : s;
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < payload.length) { const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < payload.length) bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
  return bytes;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  // 读 jsdom cookie
  const file = process.argv[2] || fs.readdirSync(OUT).filter(f => f.startsWith('jsdom_cookie_')).sort().pop();
  const c = JSON.parse(fs.readFileSync(path.join(OUT, file)));
  const pVal = c.pCookie.split('=')[1];
  const bytes = decodeStr(pVal);
  console.log('jsdom cookie:', file);
  console.log('P cookie len:', pVal.length, '解码:', bytes.length, 'B');

  // 外层解密（K16 + ±7200 宽窗口）
  const now = Math.floor(Date.now() / 1000);
  let found = null, loose = null;
  for (let t = now - 7200; t <= now + 7200 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...K16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 50 && dec[4] === 4 && dec[14] === 48) {
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec };
          else if (!loose) loose = { t, ele, dec };
        }
      } catch (e) {}
    }
  }
  const target = found || loose;
  if (!target) { console.log('✗ 外层反解失败（无候选）'); process.exit(1); }
  console.log('外层反解:', found ? 'uuid 严格 ✓' : '仅宽松候选（uuid ✗）', 't=' + target.t, 'ele=' + target.ele);
  const na = target.dec.slice(4);
  // nextarr 结构: [uuid4, 2, r2mkaTime4, startTime4, keys2len, keys2, basearrEncLen, basearrEnc]
  const k2len = na[10];
  const jsKeys2 = na.slice(11, 11 + k2len);
  let pos = 11 + k2len;
  const lenByte = na[pos++];
  let innerLen;
  if (lenByte & 0x80) innerLen = ((lenByte & 0x7f) << 8) | na[pos++];
  else innerLen = lenByte;
  const innerEnc = na.slice(pos, pos + innerLen);
  console.log('jsdom keys2 :', jsKeys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('k2len:', k2len, 'innerEnc len:', innerEnc.length);

  // 对比 sync 浏览器 keys2
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  console.log('浏览器 keys2:', bk.keys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const same2 = jsKeys2.length === bk.keys2.length && jsKeys2.every((v, i) => v === bk.keys2[i]);
  console.log('keys2 相同:', same2 ? '★★★ YES jsdom keys2 纯计算!' : 'NO');

  // 内层反解 keys17：innerEnc 用 keys17 解密，但 keys17 未知。
  // 若 keys2 相同 → keys 体系正确，keys17 也应是 cd 派生（与浏览器一致）。
  // 打印 innerEnc 特征供分析
  console.log('innerEnc 头 24:', innerEnc.slice(0, 24).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // keys17 已知（浏览器）→ 用浏览器 keys17 解密 innerEnc 验证 basearr 结构
  try {
    let foundI = null;
    for (let dt = -60; dt <= 60 && !foundI; dt++) {
      for (let ele = 1; ele <= 256 && !foundI; ele++) {
        try {
          const arr = numarrAddTime([...bk.keys17], target.t + dt, ele / 256)[0];
          const dec = encryptMode2([...innerEnc], arr, 0);
          if (dec.length > 200) {
            const numenc = dec.map((b, i) => i < 16 ? b ^ jsKeys2[i] : b);
            if (numenc.length === 288) foundI = { t: target.t + dt, ele, dec: numenc };
          }
        } catch (e) {}
      }
    }
    if (foundI) {
      console.log('内层解密成功（用浏览器 keys17）numenc len:', foundI.dec.length);
      console.log('numenc 头16:', foundI.dec.slice(0, 16).map(b => b.toString(16)).join(' '));
    } else {
      console.log('内层解密未匹配（keys17 或结构）');
    }
  } catch (e) { console.log('内层反解异常:', e.message.substring(0, 60)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
