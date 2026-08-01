/**
 * 174_exact_iv.js
 *
 * 精确计算 IV（random int 派生）+ 反推 basestr（用 hook 后确定性 cookie）
 * random int = (Math.random()*0xffffffff)>>>0 = 2147483647（0.5）
 * IV int = Math.floor(random_int * 4294967295) >>> 0（JS 精度）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

function numToNumarr4(v) {
  v = v >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

(async () => {
  // 精确计算 IV int
  const randomInt = 2147483647; // (0.5 * 0xffffffff) >>> 0
  const prod = randomInt * 4294967295;
  const floored = Math.floor(prod);
  const ivInt = floored >>> 0;
  console.log('randomInt:', randomInt);
  console.log('prod:', prod, 'floored:', floored, 'ivInt:', ivInt.toString(16));

  // 尝试多个候选 IV int
  const candidates = {
    ivInt, // 0x7ffffffe...
    '2^32-randomInt': (4294967296 - randomInt) >>> 0,
    'randomInt': randomInt,
    '0x7fffffff': 0x7fffffff,
  };
  // 用 hook 后确定性 cookie（165 号）
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const payload = d.pCookie.startsWith('0') ? d.pCookie.slice(1) : d.pCookie;
  console.log('确定性 cookie 前 22:', payload.substring(0, 22));

  for (const [label, iv] of Object.entries(candidates)) {
    const ivBytes = [];
    for (let i = 0; i < 4; i++) ivBytes.push(...numToNumarr4(iv));
    const idxs = [];
    for (let i = 0; i + 2 < ivBytes.length; i += 3) {
      const b0 = ivBytes[i], b1 = ivBytes[i + 1], b2 = ivBytes[i + 2];
      idxs.push(b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63);
    }
    const map = {};
    let conflict = 0;
    for (let j = 0; j < idxs.length && j < payload.length; j++) {
      const c = payload[j];
      if (map[idxs[j]] !== undefined && map[idxs[j]] !== c) conflict++;
      map[idxs[j]] = c;
    }
    console.log(label + ':', 'iv=' + iv.toString(16), '冲突=' + conflict, '已知=' + Object.keys(map).length);
    if (conflict === 0) {
      const bs = [];
      for (let i = 0; i < 64; i++) bs.push(map[i] !== undefined ? map[i] : '?');
      console.log('  ★ basestr:', bs.join(''));
      console.log('  映射:', Object.entries(map).map(([k, v]) => k + '=' + v).join(' '));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
