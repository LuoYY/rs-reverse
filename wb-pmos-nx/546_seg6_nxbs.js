/**
 * 546_seg6_nxbs.js
 * 用 nx cdBasestr 构造 decryptKeys，重试 [6] 段假设：
 * [1, 2, 2, hidden, ...encryptMode2(decrypt(ascii2string(keys[22])), keys16), ...numToNumarr2(+decode(decrypt(keys[22])))]
 * 对比 basearr 动态区（绑定字节 84-87 附近）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const decode = require('@src/handler/parser/common/decode');
const ascii2string = require('@src/handler/parser/common/ascii2string');
const numToNumarr2 = require('@src/handler/parser/common/numToNumarr2');

// nx cdBasestr 构造 decryptKeys
function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decrypt(str, dk) {
  const [d1, d2, d3, d4, d5, d6] = dk;
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i].charCodeAt();
    const two = i + 1 < str.length ? str[i + 1].charCodeAt() : undefined;
    const three = i + 2 < str.length ? str[i + 2].charCodeAt() : undefined;
    const four = i + 3 < str.length ? str[i + 3].charCodeAt() : undefined;
    two !== undefined && ans.push(d1[one] | d2[two]);
    three !== undefined && ans.push(d3[two] | d4[three]);
    four !== undefined && ans.push(d5[three] | d6[four]);
  }
  return ans;
}

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
const dk = makeDecryptKeys(NX_BS);

for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const b = d.basearr;
  const k22 = d.keys[22];
  const k16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const str = ascii2string(k22);
  const dec = decrypt(str, dk);
  const enc = encryptMode2([...dec], k16arr, 0);
  console.log(`\nS${i + 1} keys22="${str.substring(0, 30)}"`);
  console.log(`  decrypt len=${dec.length}: ${dec.slice(0, 20).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  encryptMode2 len=${enc.length}: ${enc.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  const dc = decode(dec);
  console.log(`  decode(decrypt): "${dc.substring(0, 30)}" num=${+dc}`);
  const n2 = numToNumarr2(+dc);
  console.log(`  numToNumarr2: ${n2.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  // [6] 段 = [1, 2, 2, hidden, ...enc, ...n2]
  const seg6 = [1, 2, 2, 1, ...enc, ...n2];
  console.log(`  [6]段 len=${seg6.length}: ${seg6.slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  // 在 basearr 找 seg6 前 8 字节
  const head8 = seg6.slice(0, 8).join(',');
  let found = [];
  for (let p = 0; p <= b.length - 8; p++) {
    if (b.slice(p, p + 8).join(',') === head8) found.push(p);
  }
  console.log(`  seg6[0-7] 匹配位置: ${found.join(',') || '无'}`);
  // 找 enc 前 8
  const enc8 = enc.slice(0, 8).join(',');
  found = [];
  for (let p = 0; p <= b.length - 8; p++) {
    if (b.slice(p, p + 8).join(',') === enc8) found.push(p);
  }
  console.log(`  enc[0-7] 匹配位置: ${found.join(',') || '无'}`);
}
