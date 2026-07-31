const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package));
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
require('@src/handler/parser/constData').init();
const cc = JSON.parse(fs.readFileSync(path.join(OUT, 'cookie_compare.json')));
const keys16 = cc.keys16;
console.log('keys16:', keys16.map(b => b.toString(16)).join(' '));
const now = Math.floor(Date.now() / 1000);
const origBytes = decodeStr(cc.origP.slice(1));
console.log('原始 P 解码:', origBytes.length, 'B');
let candidates = [];
for (let t = now - 3600; t <= now + 3600 && candidates.length < 8; t++) {
  for (let ele = 1; ele <= 256 && candidates.length < 8; ele++) {
    try {
      const arr = numarrAddTime([...keys16], t, ele / 256)[0];
      const d = encryptMode2([...origBytes], arr, 1);
      if (d.length > 50 && (d[4] === 4 || d[4] === 2)) {
        candidates.push({ t, ele, d });
      }
    } catch (e) {}
  }
}
console.log('候选数:', candidates.length);
candidates.slice(0, 8).forEach(c => {
  console.log('t=' + c.t + ' ele=' + c.ele + ' len=' + c.d.length + ' 头24:', c.d.slice(0, 24).join(','));
});
