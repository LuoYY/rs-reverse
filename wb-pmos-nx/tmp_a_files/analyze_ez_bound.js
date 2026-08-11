// 对比 _$ez（session 配置，捕获于本地固定）与 28 样本 base 的 [22:29]/[68:73]
// 目的：确认 base 绑定段是否源自 _$ez 中的某字段
const fs = require('fs');
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// _$ez numarr 解码
function decodeEZ(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b === 1) { i++; let v = 0, has = false; while (i < arr.length && arr[i] >= 48 && arr[i] <= 57) { v = v * 10 + (arr[i] - 48); has = true; i++; } out.push(has ? v : -1); }
    else if (b === 0) { out.push(0); i++; }
    else { out.push(b); i++; }
  }
  return out;
}
const dec = decodeEZ(ez);
const str = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('_$ez 解码长度:', dec.length);

// 关键：找 [$ez 中的数字段（含 67402 nsd 附近）
console.log('\n=== _$ez 中的数字/值段 ===');
// 打印 67402 周围
const idx = str.indexOf('67402');
if (idx >= 0) console.log('67402 @', idx, 'ctx:', str.slice(Math.max(0, idx - 40), idx + 40));
// 找所有长数字串
const nums = str.match(/\d{4,}/g) || [];
console.log('长数字串:', nums.slice(0, 30).join(' '));

// 检查 [22:29] 的候选值是否出现在 _$ez（原始字节形式）
console.log('\n=== base[22:29]/[68:73] vs _$ez 原始 ===');
data.slice(0, 8).forEach((s, i) => {
  const p22 = s.base.slice(22, 29);
  const e73 = s.base.slice(68, 73);
  const ezStr = ez.join(',');
  console.log('#' + i, 'nsd=' + s.nsd,
    '[22:29]=' + p22.join(','),
    'in ez:' + (ezStr.includes(p22.join(',')) ? 'Y' : 'n'),
    '[68:73]=' + e73.join(','),
    'in ez:' + (ezStr.includes(e73.join(',')) ? 'Y' : 'n'));
});

// 打印 _$ez 后部（可能含 base 相关数据）
console.log('\n=== _$ez 后 200 字节 ===');
console.log(ez.slice(-200).join(','));
