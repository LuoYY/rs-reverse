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
const keys16 = cc.keys16;
console.log('构造 P len:', cc.cookie.length);
const decM = decryptP(cc.mineP || cc.cookie, keys16, 600);
const decO = decryptP(cc.origP, keys16, 600);
const decL = cc.latestP ? decryptP(cc.latestP, keys16, 600) : null;
if (decM && decO) {
  const m = decM.dec, o = decO.dec;
  console.log('构造 len:', m.length, '原始 len:', o.length);
  const minLen = Math.min(m.length, o.length);
  console.log('\n=== 逐段对比 ===');
  console.log('uuid4    构造:', m.slice(0, 4).map(b => b.toString(16)).join(' '), '原始:', o.slice(0, 4).map(b => b.toString(16)).join(' '));
  console.log('头[4..18] 构造:', m.slice(4, 18).join(','), '原始:', o.slice(4, 18).join(','));
  // keys2 段
  let pos = 15;
  console.log('keys2 段 构造:', m.slice(pos, pos + 8).map(b => b.toString(16)).join(' '));
  console.log('keys2 段 原始:', o.slice(pos, pos + 8).map(b => b.toString(16)).join(' '));
  // encLen
  let p2 = pos + 48;
  console.log('encLen 构造:', m[p2], '原始:', o[p2]);
  p2 += 2;
  // innerEnc
  const innerM = m.slice(p2), innerO = o.slice(p2);
  console.log('innerEnc 构造 len:', innerM.length, '原始 len:', innerO.length);
  if (innerM.length === innerO.length) {
    const same = innerM.every((b, i) => b === innerO[i]);
    console.log('innerEnc 相同:', same ? 'YES ✓' : 'NO ✗');
    if (!same) {
      let d = -1, cnt = 0;
      for (let i = 0; i < innerM.length; i++) if (innerM[i] !== innerO[i]) { if (d < 0) d = i; cnt++; }
      console.log('innerEnc 差异首 @' + d + ' 共 ' + cnt + ' 字节');
    }
  }
  // 对比 mine vs latest（内层明文对比）
  if (decL) {
    console.log('\n=== 构造 vs 触发后P ===');
    const l = decL.dec;
    console.log('uuid4 构造:', m.slice(0, 4).map(b => b.toString(16)).join(' '), '触发后:', l.slice(0, 4).map(b => b.toString(16)).join(' '));
    const lInner = l.slice(65), mInner = m.slice(65);
    console.log('innerEnc 构造 len:', mInner.length, '触发后 len:', lInner.length);
    // 用 keys17 解密内层（需要 innerKey。mine 的 innerKey 在 cc 里）
    const keys17 = cc.keys17;
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
    // 用 cc.innerKey 解 mine 的 innerEnc
    if (cc.innerKey) {
      try {
        const plainM = encryptMode2([...mInner], [...cc.innerKey], 0);
        console.log('mine innerEnc 明文 len:', plainM.length, '前16:', plainM.slice(0, 16).map(b => b.toString(16)).join(' '));
        console.log('mine innerInput(numenc) 前16:', cc.innerInput.slice(0, 16).map(b => b.toString(16)).join(' '));
        console.log('明文==innerInput还原numenc:', plainM.length === cc.innerInput.length && plainM.every((b, i) => b === cc.innerInput[i]) ? 'YES ✓' : 'NO ✗');
      } catch (e) { console.log('mine 内层解密失败:', e.message.substring(0, 50)); }
    }
    // 找 latest 的 innerEnc 密钥（遍历 keys17 + time/ele）
    const now = Math.floor(Date.now() / 1000);
    let foundL = null;
    for (let t = now - 600; t <= now + 600 && !foundL; t++) {
      for (let ele = 1; ele <= 256 && !foundL; ele++) {
        try {
          const arr = numarrAddTime([...keys17], t, ele / 256)[0];
          const plain = encryptMode2([...lInner], arr, 0);
          if (plain.length > 200 && plain[0] >= 0 && plain[0] <= 250) {
            // 检查明文是否像 numenc（前 8 字节与 cc.innerInput 相似度）
            let sim = 0;
            for (let i = 0; i < 8; i++) if (plain[i] === cc.innerInput[i]) sim++;
            if (sim >= 5) { foundL = { t, ele, plain }; break; }
          }
        } catch (e) {}
      }
    }
    if (foundL) {
      console.log('\nlatest innerEnc 明文前16:', foundL.plain.slice(0, 16).map(b => b.toString(16)).join(' '));
      console.log('mine numenc 前16:', cc.innerInput.slice(0, 16).map(b => b.toString(16)).join(' '));
      console.log('basearr(numenc) 相同:', foundL.plain.length === cc.innerInput.length && foundL.plain.every((b, i) => b === cc.innerInput[i]) ? 'YES ✓' : 'NO ✗');
    } else {
      console.log('latest innerEnc 密钥未找到');
    }
  }
} else {
  console.log('解密失败:', { m: !!decM, o: !!decO });
}
