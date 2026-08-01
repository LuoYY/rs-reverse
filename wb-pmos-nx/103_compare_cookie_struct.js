/**
 * 103_compare_cookie_struct.js
 *
 * 对比浏览器 P cookie（sync 采集）与 jsdom P cookie（同 cd）的解码字节结构
 * 若加密段（uuid/keys 段）一致 → jsdom keys 纯计算，仅指纹段不同 → 管线可注入 jsdom keys
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

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
  // 读 sync（浏览器 cookie + keys）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bCookies = sync.cookies || [];
  const bP = bCookies.find(c => c.name.endsWith('P'));
  const bO = bCookies.find(c => c.name.endsWith('O'));
  console.log('sync cookies:', bCookies.map(c => c.name).join(', '));
  if (!bP) { console.log('sync 无浏览器 P cookie'); process.exit(1); }
  const browserP = bP.value;
  console.log('浏览器 P cookie len:', browserP.length, '解码:', decodeStr(browserP).length, 'B');

  // jsdom cookie（同 cd）
  const jf = fs.readdirSync(OUT).filter(f => f.startsWith('jsdom_cookie_')).sort().pop();
  if (!jf) { console.log('无 jsdom cookie 文件'); process.exit(1); }
  const jc = JSON.parse(fs.readFileSync(path.join(OUT, jf)));
  const jsdomP = jc.pCookie.split('=')[1];
  console.log('jsdom P cookie len:', jsdomP.length, '解码:', decodeStr(jsdomP).length, 'B');
  console.log('jsdom nsd:', jc.nsd, 'sync nsd:', sync.challenge.nsd, '同 cd:', jc.cd === sync.challenge.cd ? 'YES' : 'NO');

  const bBytes = decodeStr(browserP);
  const jBytes = decodeStr(jsdomP);
  console.log('\n浏览器 P 前 40 字节:', bBytes.slice(0, 40).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('jsdom  P 前 40 字节:', jBytes.slice(0, 40).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // 对比相同前缀
  let same = 0;
  for (let i = 0; i < Math.min(bBytes.length, jBytes.length); i++) {
    if (bBytes[i] === jBytes[i]) same++;
    else break;
  }
  console.log('相同前缀字节数:', same);
  console.log('浏览器 P 尾 20:', bBytes.slice(-20).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('jsdom  P 尾 20:', jBytes.slice(-20).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // 若 keys16=K16 解密外层，对比 nextarr 结构
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
  const now = Math.floor(Date.now() / 1000);
  for (const [label, bytes] of [['浏览器', bBytes], ['jsdom', jBytes]]) {
    let found = null;
    for (let t = now - 172800; t <= now + 3600 && !found; t++) {
      for (let ele = 1; ele <= 256 && !found; ele++) {
        try {
          const arr = numarrAddTime([...K16], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 50 && dec[4] === 4 && dec[14] === 48) {
            const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
            if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec };
          }
        } catch (e) {}
      }
    }
    console.log(`\n[${label}] 外层解密(K16):`, found ? `成功 t=${found.t} dec len=${found.dec.length}` : '失败');
    if (found) {
      const na = found.dec.slice(4);
      console.log('  nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  keys2len:', na[10]);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
