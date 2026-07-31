const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const fs = require('fs');
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
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
function decryptP(val, k16, tRange) {
  const bytes = decodeStr(val.slice(1));
  const now = Math.floor(Date.now() / 1000);
  for (let t = now - tRange; t <= now + tRange; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...k16], t, ele / 256)[0];
        const d = encryptMode2([...bytes], arr, 1);
        if (d.length > 50 && d[4] === 4 && d[14] === 48) return { t, ele, dec: d };
      } catch (e) {}
    }
  }
  return null;
}
const cc = JSON.parse(fs.readFileSync(path.join(OUT, 'cookie_compare.json')));
console.log('捕获时间:', cc.capturedAt, '=', new Date(cc.capturedAt).toISOString());
for (const [name, val] of [['原始P', cc.origP], ['触发后P', cc.latestP], ['构造P', cc.mineP]]) {
  if (!val) continue;
  const dec = decryptP(val, cc.keys16, 600);
  if (dec) {
    const na = dec.dec.slice(4);
    const t4A = (na[2] << 24 | na[3] << 16 | na[4] << 8 | na[5]) >>> 0;
    const t4B = (na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0;
    console.log(name + ': t4_A=' + t4A + ' t4_B=' + t4B + ' 差=' + (t4B - t4A));
  } else console.log(name + ': 解密失败');
}
