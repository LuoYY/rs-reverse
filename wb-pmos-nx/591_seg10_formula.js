/**
 * 591_seg10_formula.js
 * 用 xb [10] 段公式生成 nx 动态段并对比：
 * xb seg10 = [flagcheck, 13, time4, keys19_4, random8, flag] = 19 bytes
 * nx basearr[24-29] 6B + [84-87] 4B 是否 = xb seg10 的部分？
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const P = require(path.join(__dirname, '..', 'src/handler/parser'));
const { numToNumarr4, numToNumarr8, numToNumarr2, ascii2string } = P;

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const k19 = +ascii2string(k[19]);
  const k21 = +ascii2string(k[21]); // r2mkaTime?
  const flag = +ascii2string(k[24]);
  console.log(`\n=== S${i + 1} ===`);
  console.log('basearr[24-29]:', b.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('basearr[84-87]:', b.slice(84, 88).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('keys19:', k19, 'hex:', k19.toString(16), '4B:', numToNumarr4(k19).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('keys21:', k21, 'hex:', k21.toString(16), '4B:', numToNumarr4(k21).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('flag:', flag);

  // xb [10] 段: [flagcheck, 13, time4, keys19_4, random8, flag]
  // time4 = r2mkaTime + runTime - startTime（近似 = r2mkaTime + 运行秒数）
  // 假设 time4 ≈ k21（r2mkaTime）
  const seg10_xb = [
    flag > 0 && flag < 8 ? 1 : 0, 13,
    ...numToNumarr4(k21), ...numToNumarr4(k19),
    ...numToNumarr8(1234567890), flag,
  ];
  console.log('xb seg10 公式:', seg10_xb.map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('basearr[24-42]:', b.slice(24, 43).map(x => x.toString(16).padStart(2, '0')).join(' '));

  // 检查 seg10 是否出现在 basearr 中
  for (let start = 0; start < b.length - seg10_xb.length + 1; start++) {
    const match = seg10_xb.every((v, j) => v === b[start + j]);
    if (match) console.log(`★★ xb seg10 匹配 basearr[${start}]`);
  }
  // 部分匹配：keys19_4 或 time4
  const k19b = numToNumarr4(k19);
  for (let start = 0; start < b.length - 4; start++) {
    if (k19b.every((v, j) => v === b[start + j])) console.log(`★ keys19 4B 匹配 basearr[${start}]`);
  }
}
process.exit(0);
