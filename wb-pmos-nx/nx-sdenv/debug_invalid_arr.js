// 定位 Invalid array length：逐步执行
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const fs = require('fs');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

function dB64(s) {
  const m = {};
  for (let i = 0; i < 64; i++) m[NX_BS[i]] = i;
  const o = [];
  let q = 0;
  for (let g = 0; g < Math.floor(s.length / 4); g++) {
    const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]];
    q += 4;
    if (c0 === undefined) return null;
    o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return o;
}

// 用真实挑战数据测试
const ch = JSON.parse(fs.readFileSync('/tmp/nx_challenge.json', 'utf8'));
console.log('nsd:', ch.nsd, 'cd.len:', ch.cd.length);

// 先测 dB64 + encryptMode2
const P = 'aQc8QdP9mF0v2kQdH3rXp0mF0...'; // 测试用
// 直接用示例 P
// 真实流程需要 sdenv P。这里先用 collect 脚本的逻辑单独测 decrypt/encrypt
try {
  const cdArr = (() => {
    const idxmap = {};
    NX_BS.split('').forEach((k, i) => { idxmap[k] = i; });
    const ans = [];
    for (let i = 0; i < ch.cd.length; i += 4) {
      const one = ch.cd[i], two = ch.cd[i + 1], three = ch.cd[i + 2], four = ch.cd[i + 3];
      if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
      if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
      if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
    }
    return ans;
  })();
  console.log('cdArr len:', cdArr.length);
} catch (e) { console.log('cdArr err:', e.message); }

// 测 numarrAddTime 和 encryptMode2
try {
  const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
  console.log('k16a len:', k16a.length);
} catch (e) { console.log('numarrAddTime err:', e.message); }

// 测 encryptMode2 with 空数组
try {
  const dec = parser.encryptMode2([1,2,3,4], [...K16], 1);
  console.log('encryptMode2 ok:', dec.length);
} catch (e) { console.log('encryptMode2 err:', e.message); }
