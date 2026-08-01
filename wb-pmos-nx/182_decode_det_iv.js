/**
 * 182_decode_det_iv.js
 *
 * base64url 解码确定性 cookie 前 22 字符（16 字节 IV）→ 分析值规律（识别 IV 来源）
 * 如果 base64url 顺序错→乱码；如果对→IV 值可读
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

function decodeWith(str, basestr) {
  const payload = str.startsWith('0') ? str.slice(1) : str;
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(payload.length / 4); g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return bytes;
}

(async () => {
  // 读所有 det_cookie（确定性采集）
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  console.log('det_cookie 文件:', files.length);
  const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
    const pCookie = d.pCookie;
    const bytes = decodeWith(pCookie, b64);
    if (!bytes) continue;
    console.log('nsd=' + d.nsd, '前 22:', pCookie.substring(0, 22), '→ 解码前 16:', bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    // 分析：4 个 int
    if (bytes.length >= 16) {
      const ints = [];
      for (let i = 0; i < 4; i++) {
        const v = (bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3];
        ints.push(v >>> 0);
      }
      console.log('  IV ints:', ints.map(v => '0x' + v.toString(16)).join(', '));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
