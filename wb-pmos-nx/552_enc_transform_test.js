/**
 * 552_enc_transform_test.js
 * 系统测试绑定字节 [26-29]/[84-87] 与 keys 的加密变换
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
const numToNumarr2 = require('@src/handler/parser/common/numToNumarr2');
const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');
const uuidFn = require('@src/handler/parser/common/uuid');
const ascii2string = require('@src/handler/parser/common/ascii2string');

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const b = d.basearr;
  const dyn26 = b.slice(26, 30);
  const dyn84 = b.slice(84, 88);
  const k2 = d.keys[2];
  const k17 = d.keys[17];
  const k16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  console.log(`\nS${i + 1} [26-29]=${dyn26.map(x => x.toString(16).padStart(2, '0')).join(' ')} [84-87]=${dyn84.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);

  // 尝试各种 keys 数组的加密变换
  const tests = [];
  const tryMatch = (name, arr, target) => {
    if (arr && JSON.stringify(arr.slice(0, 4)) === JSON.stringify(target)) tests.push(name);
    if (arr && JSON.stringify(arr.slice(-4)) === JSON.stringify(target)) tests.push(name + '(尾4)');
  };
  // 对每个 keys[i] 尝试 encryptMode2(keys[i], keys16)
  for (let ki = 0; ki < d.keys.length; ki++) {
    const k = d.keys[ki];
    if (!k || k.length < 4) continue;
    try {
      const e = encryptMode2([...k], k16arr, 0);
      tryMatch(`enc2(keys[${ki}],k16)`, e, dyn26);
      tryMatch(`enc2(keys[${ki}],k16)`, e, dyn84);
    } catch (e) {}
    try {
      const e1 = encryptMode1([...k.slice(0, Math.min(k.length, 32))], k16arr, 0);
      tryMatch(`enc1(keys[${ki}],k16)`, e1, dyn26);
      tryMatch(`enc1(keys[${ki}],k16)`, e1, dyn84);
    } catch (e) {}
    // numarrEncrypt(keys[i])
    try {
      const ne = numarrEncrypt(k);
      tryMatch(`numEnc(keys[${ki}])`, ne, dyn26);
      tryMatch(`numEnc(keys[${ki}])`, ne, dyn84);
    } catch (e) {}
    // uuid(keys[i])
    try {
      const u4 = numToNumarr4(uuidFn(k));
      tryMatch(`uuid(keys[${ki}])`, u4, dyn26);
      tryMatch(`uuid(keys[${ki}])`, u4, dyn84);
    } catch (e) {}
    // numarrAddTime(keys[i])[0]
    try {
      const at = numarrAddTime([...k], 0, 1 / 256)[0];
      tryMatch(`at(keys[${ki}])`, at, dyn26);
      tryMatch(`at(keys[${ki}])`, at, dyn84);
    } catch (e) {}
  }
  // keys19 相关
  const k19num = parseInt(ascii2string(d.keys[19] || []), 10);
  tryMatch('keys19n4', numToNumarr4(k19num), dyn84);
  // keys17 XOR keys2
  for (let s = 0; s <= 12; s++) {
    const x = k17.slice(s, s + 4).map((v, j) => v ^ k2[s + j]);
    tryMatch(`k17[${s}-${s + 3}]^k2[${s}-${s + 3}]`, x, dyn26);
    tryMatch(`k17[${s}-${s + 3}]^k2[${s}-${s + 3}]`, x, dyn84);
  }
  // keys17 内部 XOR
  for (let s = 0; s <= 8; s++) {
    const x = k17.slice(s, s + 4).map((v, j) => v ^ k17[s + 4 + j]);
    tryMatch(`k17[${s}-${s + 3}]^k17[${s + 4}-${s + 7}]`, x, dyn26);
  }
  // 固定值组合
  tryMatch('16777216', numToNumarr4(16777216), dyn26);
  tryMatch('1801flag', numToNumarr4(1801), dyn26);
  // [26-29] vs [84-87] 的逆运算
  const xorRes = dyn26.map((v, j) => v ^ dyn84[j]);
  console.log(`  [26-29]^[84-87] = ${xorRes.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);

  if (tests.length) console.log('  ★ 匹配:', tests.join(', '));
  else console.log('  (无匹配)');
}
