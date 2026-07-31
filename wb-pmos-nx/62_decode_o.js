const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) { const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < s.length) bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  return bytes;
}

const files = fs.readdirSync(OUT);
for (const f of files) {
  if (!f.startsWith('sync_') && !f.startsWith('multi_') && !f.startsWith('req_details_')) continue;
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const oc = d.cookies && d.cookies.find(c => c.name.endsWith('O'));
  if (!oc) continue;
  console.log('\n=== ' + f + ' ===');
  console.log('O len:', oc.value.length);
  const bytes = decodeStr(oc.value);
  console.log('O 解码:', bytes.length, 'B');
  console.log('头 30:', bytes.slice(0, 30).join(','));
  // 找 unix 时间戳（大端 4 字节，接近现在）
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i + 4 <= bytes.length; i++) {
    const v = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    if (Math.abs(v - now) < 7200) {
      console.log('  可能时间戳 @' + i + ':', v, '差', v - now, '秒');
    }
  }
  // 小端
  for (let i = 0; i + 4 <= bytes.length; i++) {
    const v = (bytes[i + 3] << 24 | bytes[i + 2] << 16 | bytes[i + 1] << 8 | bytes[i]) >>> 0;
    if (Math.abs(v - now) < 7200) {
      console.log('  小端时间戳 @' + i + ':', v, '差', v - now, '秒');
    }
  }
  // ASCII 部分
  const ascii = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
  console.log('ASCII:', ascii.substring(0, 80));
}
