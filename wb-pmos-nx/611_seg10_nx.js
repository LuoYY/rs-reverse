/**
 * 611_seg10_nx.js
 * 对齐 nx basearr [24-42]（19B 动态段）与 xb seg10 结构：
 * xb seg10 = [flagcheck, 13, time4(4), keys19_4(4), random8(8), flag]
 * nx [24-42] 可能同结构但值不同
 * 也检查 nx basearr 尾部 [117+] 是否 = xb seg2/seg6/seg9/seg13
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
const { ascii2string, numToNumarr4, numToNumarr8, numToNumarr2 } = require(path.join(__dirname, '..', 'src/handler/parser'));
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const flag = +ascii2string(k[24]);
  const k19 = +ascii2string(k[19]);
  const k21 = +ascii2string(k[21]);
  console.log(`\n=== S${i + 1} flag=${flag} k19=${k19} k21=${k21} ===`);
  console.log('basearr[24-42]:', b.slice(24, 43).map(x => x.toString(16).padStart(2, '0')).join(' '));

  // xb seg10 结构尝试
  const seg10 = [
    flag > 0 && flag < 8 ? 1 : 0, 13,
    ...numToNumarr4(k21), ...numToNumarr4(k19),
    ...numToNumarr8(0), flag,
  ];
  console.log('xb seg10(k21,k19):', seg10.map(x => x.toString(16).padStart(2, '0')).join(' '));

  // 检查 nx [24-42] 的字段对齐
  // [24]=00 恒为 0（flagcheck? flag=4 → 应为 1）
  // [25-28] 4B、[29-32] 4B、[33-40] 8B、[41] 1B
  console.log('nx[24]:', b[24], 'nx[25-28]:', b.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('nx[29-32]:', b.slice(29, 33).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('nx[33-40]:', b.slice(33, 41).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('nx[41]:', b[41]);

  // 尾部 [117+]
  console.log('basearr[117-166]:', b.slice(117, 167).map(x => x.toString(16).padStart(2, '0')).join(' '));
}

// 检查 [30-68] 稳定段是否是 seg1 环境指纹（xb 结构）
console.log('\n=== 稳定段 [30-68] 是否 xb seg1 环境指纹 ===');
for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  console.log(`S${i + 1} [30-68]:`, b.slice(30, 69).map(x => x.toString(16).padStart(2, '0')).join(' '));
}
process.exit(0);
