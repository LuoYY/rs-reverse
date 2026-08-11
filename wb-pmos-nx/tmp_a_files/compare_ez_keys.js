// 验证：_$ez（捕获 1532B）是否 = keys 段（cd 解码）的 numarr 编码？
// _$ez head 解码 = "3\x0264\x02640J..." → 含资源名 MurR7rxG 等
// keys[7] = "ySMTydHh;MurR7rxG;LKuMGZNN;..." 资源列表
// 关键：_$ez 的 numarr 解码内容 vs keys 拼接
const fs = require('fs');
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;

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
console.log('_$ez 解码串(前300):');
console.log(str.slice(0, 300));
console.log('\n...');
console.log('_$ez 解码串(后300):');
console.log(str.slice(-300));

// 对比 keys[7]（资源列表）
console.log('\n=== keys[7] 资源列表 ===');
console.log('ySMTydHh;MurR7rxG;LKuMGZNN;7Dbfnkc0;53EZnWbR;3RKyaeh47p90;c9qYRt1w5yKr;XJ182tJyv1dj;83bw0aTvAW7K.2437991.js;...');
console.log('\n_$ez 是否含 MurR7rxG:', str.includes('MurR7rxG'));
console.log('_$ez 是否含 3RKyaeh47p90:', str.includes('3RKyaeh47p90'));
console.log('_$ez 是否含 2437991.js:', str.includes('2437991.js'));
