// 完整解码 _$ez[1532]：按 \x01 数字 模式提取所有字节，还原完整数组
// 对照真实 base（样本中），找 [78:90] 编码位置
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = snap[0].ez.v;
const samples = require('./nx_full_samples.json');

// 解码器：\x01 <digits> 或 0 = 分隔符，其他字符原样
function decodeEZ(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b === 1) {
      i++;
      let v = 0, has = false;
      while (i < arr.length && arr[i] >= 48 && arr[i] <= 57) { v = v * 10 + (arr[i] - 48); has = true; i++; }
      out.push(has ? v : -1);
    } else if (b === 0) {
      out.push(0);
      i++;
    } else {
      out.push(b);
      i++;
    }
  }
  return out;
}
const dec = decodeEZ(ez);
console.log('解码长度:', dec.length);
console.log('解码 head(40):', dec.slice(0, 40).join(','));
// 找 MurR7rxG 位置
const str = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
const mIdx = str.indexOf('MurR7rxG');
console.log('MurR7rxG @', mIdx);
console.log('str(前200):', str.slice(0, 200));

// 对照真实 base
const real = samples[0].base;
console.log('\n真实 base[0:30]:', real.slice(0, 30).join(','));
console.log('真实 base len:', real.length);

// 检查解码结果是否含 base 头 59,148,7,120
const bHead = dec.indexOf(59);
console.log('dec 中 59 @', bHead, '→', dec.slice(bHead, bHead + 10).join(','));
// base[78:90] 在 dec 中
console.log('\n真实 base[78:90]:', real.slice(78, 90).join(','));
for (let i = 0; i + 12 <= dec.length; i++) {
  if (dec.slice(i, i + 12).join(',') === real.slice(78, 90).join(',')) {
    console.log('★★ base[78:90] 在 dec@' + i);
  }
}
// base 全部在 dec 中（连续匹配尝试）
const seg8 = real.slice(0, 8).join(',');
console.log('dec 中搜 base[0:8] (' + seg8 + '):', dec.map((v, i) => dec.slice(i, i + 8).join(',') === seg8 ? i : -1).filter(x => x >= 0));
