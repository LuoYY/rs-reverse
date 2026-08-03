/**
 * 598_tail_analysis.js
 * 深度分析 basearr[69+] 动态区 vs keys22/keys16
 * 找 S1/S2 [69+] 差异与 keys22 差异的关系
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD } };
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));
const { ascii2string } = require(path.join(__dirname, '..', 'src/handler/parser'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
const b1 = d[0].basearr, b2 = d[1].basearr;
const k1 = d[0].keys, k2 = d[1].keys;

console.log('=== S1/S2 [69-117] ===');
console.log('S1:', b1.slice(69, 118).map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('S2:', b2.slice(69, 118).map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('XOR:', b1.slice(69, 118).map((x, i) => (x ^ (b2[69 + i] || 0)).toString(16).padStart(2, '0')).join(' '));

console.log('\n=== keys22 ===');
console.log('S1:', ascii2string(k1[22]));
console.log('S2:', ascii2string(k2[22]));

console.log('\n=== decrypt(keys22) XOR ===');
const d1 = decrypt(ascii2string(k1[22]));
const d2 = decrypt(ascii2string(k2[22]));
console.log('S1 dec:', d1.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('S2 dec:', d2.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('XOR :', d1.map((x, i) => (x ^ d2[i]).toString(16).padStart(2, '0')).join(' '));

// 尾部 XOR 与 dec XOR 关系
console.log('\n=== 尾部 XOR vs dec XOR（不同偏移）===');
const tailXor = b1.slice(69, 118).map((x, i) => (x ^ (b2[69 + i] || 0)));
const decXor = d1.map((x, i) => x ^ d2[i]);
// 找 tailXor 中的 decXor 序列
for (let j = 0; j < tailXor.length; j++) {
  if (decXor.every((v, t) => tailXor[j + t] === v)) {
    console.log(`★★ tailXor[${j}] = decXor（完整匹配 ${decXor.length} 字节）`);
  }
}

// keys16 异同
console.log('\n=== keys16 异同 ===');
console.log('S1:', k1[16].map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('S2:', k2[16].map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('XOR:', k1[16].map((x, i) => (x ^ k2[16][i]).toString(16).padStart(2, '0')).join(' '));
