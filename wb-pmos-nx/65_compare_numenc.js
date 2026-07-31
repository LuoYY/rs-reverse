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
function getInnerEnc(val, k16, tRange) {
  const bytes = decodeStr(val.slice(1));
  const now = Math.floor(Date.now() / 1000);
  for (let t = now - tRange; t <= now + tRange; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...k16], t, ele / 256)[0];
        const d = encryptMode2([...bytes], arr, 1);
        if (d.length > 50 && d[4] === 4 && d[14] === 48) return { t, ele, dec: d.slice(65) };
      } catch (e) {}
    }
  }
  return null;
}
const cc = JSON.parse(fs.readFileSync(path.join(OUT, 'cookie_compare.json')));
const keys16 = cc.keys16, keys17 = cc.keys17;
console.log('innerInput(numenc) len:', cc.innerInput.length);

// 用 keys17 + 时间解密 innerEnc（触发后 P）
const latestInner = getInnerEnc(cc.latestP, keys16, 600);
if (latestInner) {
  console.log('触发后 P innerEnc len:', latestInner.dec.length, 't=' + latestInner.t);
  // 用 keys17 遍历解密 innerEnc → numenc
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 600; t <= now + 600 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...keys17], t, ele / 256)[0];
        const plain = encryptMode2([...latestInner.dec], arr, 0);
        if (plain.length > 200 && plain[0] >= 0 && plain[0] <= 255) {
          // 与 innerInput 对比
          let sim = 0;
          for (let i = 0; i < Math.min(plain.length, cc.innerInput.length); i++) if (plain[i] === cc.innerInput[i]) sim++;
          if (sim > 250) { found = { t, ele, plain, sim }; break; }
        }
      } catch (e) {}
    }
  }
  if (found) {
    console.log('触发后 P numenc 前16:', found.plain.slice(0, 16).map(b => b.toString(16)).join(' '));
    console.log('构造 numenc 前16:', cc.innerInput.slice(0, 16).map(b => b.toString(16)).join(' '));
    console.log('numenc 相同:', found.plain.length === cc.innerInput.length && found.plain.every((b, i) => b === cc.innerInput[i]) ? 'YES ✓' : 'NO ✗');
  } else {
    console.log('触发后 P innerEnc 用 keys17 解密未匹配（keys17 不同或结构不同）');
  }
} else {
  console.log('触发后 P 外层解密失败');
}
